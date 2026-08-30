import { Controller, Get, Injectable, Module, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../common/prisma.module';
import { RequirePermissions } from '../../common/guards/permissions.guard';

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  private periodOf(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async ensureChart() {
    const count = await this.prisma.account.count();
    if (count > 0) return;
    await this.prisma.journal.createMany({
      data: [
        { code: 'OD', name: 'Opérations diverses' },
        { code: 'BQ', name: 'Banque' },
      ],
      skipDuplicates: true,
    });
    await this.prisma.account.createMany({
      data: [
        { code: '702100', name: 'Primes émises — Santé', type: 'REVENUE', sortOrder: 1 },
        { code: '603100', name: 'Sinistres payés — Santé', type: 'EXPENSE', sortOrder: 2 },
        { code: '395000', name: 'Provisions sinistres à payer', type: 'PROVISION', sortOrder: 3 },
        { code: '512000', name: 'Banque', type: 'ASSET', sortOrder: 4 },
        { code: '411100', name: 'Assurés — créances primes', type: 'ASSET', sortOrder: 5 },
        { code: '401100', name: 'Prestataires — dettes sinistres', type: 'LIABILITY', sortOrder: 6 },
        { code: '706100', name: 'Frais d’adhésion', type: 'REVENUE', sortOrder: 7 },
      ],
      skipDuplicates: true,
    });
  }

  async recordPremium(payment: any) {
    await this.ensureChart();
    const journal = await this.prisma.journal.findUnique({ where: { code: 'BQ' } });
    const accBank = await this.prisma.account.findUnique({ where: { code: '512000' } });
    const accPrime = await this.prisma.account.findUnique({ where: { code: '702100' } });
    const accAdhesion = await this.prisma.account.findUnique({ where: { code: '706100' } });
    if (!journal || !accBank || !accPrime) return;
    const period = this.periodOf(new Date());
    const meta = JSON.parse(payment.meta || '{}');
    const adhesion = meta.adhesionFee ?? 0;
    const prime = payment.amount - adhesion;
    const baseLabel = `Prime ${payment.reference} ${payment.contractId?.slice(0, 8) ?? ''}`.trim();
    // Banque débit / Prime crédit
    if (prime > 0) {
      await this.prisma.accountingEntry.createMany({
        data: [
          { journalId: journal.id, accountId: accBank.id, date: new Date(), label: baseLabel, debit: prime, credit: 0, referenceType: 'Payment', referenceId: payment.id, period },
          { journalId: journal.id, accountId: accPrime.id, date: new Date(), label: baseLabel, debit: 0, credit: prime, referenceType: 'Payment', referenceId: payment.id, period },
        ],
      });
    }
    if (adhesion > 0 && accAdhesion) {
      await this.prisma.accountingEntry.createMany({
        data: [
          { journalId: journal.id, accountId: accBank.id, date: new Date(), label: `Adhésion ${payment.reference}`, debit: adhesion, credit: 0, referenceType: 'Payment', referenceId: payment.id, period },
          { journalId: journal.id, accountId: accAdhesion.id, date: new Date(), label: `Adhésion ${payment.reference}`, debit: 0, credit: adhesion, referenceType: 'Payment', referenceId: payment.id, period },
        ],
      });
    }
  }

  async recordSinistre(claim: any) {
    await this.ensureChart();
    const journal = await this.prisma.journal.findUnique({ where: { code: 'OD' } });
    const accSin = await this.prisma.account.findUnique({ where: { code: '603100' } });
    const accDette = await this.prisma.account.findUnique({ where: { code: '401100' } });
    if (!journal || !accSin || !accDette) return;
    const amount = claim.totalApproved ?? claim.totalRequested ?? 0;
    if (amount <= 0) return;
    const period = this.periodOf(claim.paidAt ?? new Date());
    await this.prisma.accountingEntry.createMany({
      data: [
        { journalId: journal.id, accountId: accSin.id, date: new Date(), label: `Sinistre ${claim.reference}`, debit: amount, credit: 0, referenceType: 'Claim', referenceId: claim.id, period },
        { journalId: journal.id, accountId: accDette.id, date: new Date(), label: `Sinistre ${claim.reference}`, debit: 0, credit: amount, referenceType: 'Claim', referenceId: claim.id, period },
      ],
    });
  }

  async entries(query: { from?: string; to?: string; accountCode?: string; journalCode?: string; period?: string; page?: string; limit?: string }) {
    const where: any = {};
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to + 'T23:59:59.999Z');
    }
    if (query.accountCode) where.account = { code: query.accountCode };
    if (query.journalCode) where.journal = { code: query.journalCode };
    if (query.period) where.period = query.period;
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Number(query.limit ?? 20));
    const [items, total] = await Promise.all([
      this.prisma.accountingEntry.findMany({
        where,
        include: { account: { select: { code: true, name: true } }, journal: { select: { code: true, name: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.accountingEntry.count({ where }),
    ]);
    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  async summary(from?: string, to?: string) {
    const where: any = {};
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to + 'T23:59:59.999Z');
    }
    const grouped = await this.prisma.accountingEntry.groupBy({
      by: ['accountId'],
      where,
      _sum: { debit: true, credit: true },
      _count: true,
    });
    const accounts = await this.prisma.account.findMany({ where: { id: { in: grouped.map(g => g.accountId) } } });
    const map = new Map(accounts.map(a => [a.id, a]));
    return grouped.map(g => ({
      account: map.get(g.accountId),
      debit: g._sum.debit ?? 0,
      credit: g._sum.credit ?? 0,
      balance: (g._sum.debit ?? 0) - (g._sum.credit ?? 0),
      count: g._count,
    }));
  }
}

@Controller()
export class AccountingController {
  constructor(private accounting: AccountingService) {}

  @Get('admin/accounting/entries')
  @RequirePermissions('accounting.view')
  entries(@Query('from') from?: string, @Query('to') to?: string, @Query('accountCode') accountCode?: string, @Query('journalCode') journalCode?: string, @Query('period') period?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.accounting.entries({ from, to, accountCode, journalCode, period, page, limit });
  }

  @Get('admin/accounting/summary')
  @RequirePermissions('accounting.view')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.accounting.summary(from, to);
  }

  @Get('admin/accounting/export')
  @RequirePermissions('accounting.view')
  async export(@Res() res: Response, @Query('from') from?: string, @Query('to') to?: string, @Query('format') format = 'csv') {
    const { items } = await this.accounting.entries({ from, to, page: '1', limit: '10000' });
    if (format === 'csv') {
      const header = 'date,journal,account,code,label,debit,credit,reference,period\n';
      const rows = items.map(e => [e.date.toISOString().slice(0, 10), e.journal.code, `"${e.account.name}"`, e.account.code, `"${e.label.replace(/"/g, '""')}"`, e.debit, e.credit, e.referenceId ?? '', e.period ?? ''].join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="compta_${from ?? 'all'}_${to ?? 'all'}.csv"`);
      res.send(header + rows);
      return;
    }
    // FEC-like JSON
    res.json({ items, format: 'fec-json', exportedAt: new Date().toISOString() });
  }

  @Get('admin/accounting/chart')
  @RequirePermissions('accounting.view')
  chart() {
    return this.accounting.ensureChart().then(() => this.accounting['prisma'].account.findMany({ orderBy: { code: 'asc' } }));
  }
}

@Module({ controllers: [AccountingController], providers: [AccountingService], exports: [AccountingService] })
export class AccountingModule {}
