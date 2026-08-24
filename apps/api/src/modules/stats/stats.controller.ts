import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../common/prisma.module';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async admin() {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [
      membersTotal,
      membersActive,
      companiesTotal,
      contractsActive,
      contractsExpired,
      contractsPending,
      providersActive,
      claimsPending,
      claimsThisYear,
      paidThisYearAgg,
      approvedThisYearAgg,
      adhesionsRows,
      paymentRows,
      byProduct,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'MEMBER' } }),
      this.prisma.user.count({ where: { role: 'MEMBER', status: 'ACTIVE' } }),
      this.prisma.company.count(),
      this.prisma.contract.count({ where: { status: 'ACTIVE' } }),
      this.prisma.contract.count({ where: { status: 'EXPIRED' } }),
      this.prisma.contract.count({ where: { status: 'PENDING_PAYMENT' } }),
      this.prisma.provider.count({ where: { active: true, partnerStatus: 'ACTIVE' } }),
      this.prisma.claim.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'] } } }),
      this.prisma.claim.findMany({
        where: { careDate: { gte: yearStart }, status: { in: ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'] } },
        select: { totalApproved: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'SUCCEEDED', completedAt: { gte: yearStart } },
        _sum: { amount: true },
      }),
      this.prisma.claim.aggregate({
        where: { status: { in: ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'] }, decidedAt: { gte: yearStart } },
        _sum: { totalApproved: true },
      }),
      this.prisma.contract.findMany({
        where: { createdAt: { gte: new Date(new Date().getFullYear() - 1, 0, 1) } },
        select: { createdAt: true },
      }),
      this.prisma.payment.findMany({
        where: { status: 'SUCCEEDED', completedAt: { gte: new Date(new Date().getFullYear() - 1, 0, 1) } },
        select: { completedAt: true, amount: true },
      }),
      this.prisma.product.findMany({
        select: {
          name: true,
          code: true,
          _count: { select: { contracts: { where: { status: 'ACTIVE' } } } },
        },
      }),
    ]);

    const collected = paidThisYearAgg._sum.amount ?? 0;
    const claimsPaid = claimsThisYear.reduce((a, c) => a + (c.totalApproved ?? 0), 0);
    const lossRatio = collected > 0 ? Math.round((claimsPaid / collected) * 1000) / 10 : null;

    const groupByMonth = (rows: { at: Date | null; amount?: number }[]) => {
      const map = new Map<string, { count: number; total: number }>();
      for (const row of rows) {
        if (!row.at) continue;
        const key = `${row.at.getFullYear()}-${String(row.at.getMonth() + 1).padStart(2, '0')}`;
        const entry = map.get(key) ?? { count: 0, total: 0 };
        entry.count += 1;
        entry.total += row.amount ?? 0;
        map.set(key, entry);
      }
      return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
    };

    const monthlyAdhesions = groupByMonth(adhesionsRows.map(r => ({ at: r.createdAt })));
    const monthlyCotisations = groupByMonth(paymentRows.map(r => ({ at: r.completedAt, amount: r.amount })));

    return {
      cards: {
        membersTotal,
        membersActive,
        companiesTotal,
        contractsActive,
        contractsExpired,
        contractsPendingPayment: contractsPending,
        providersActive,
        claimsPending,
        cotisationsCollectedYear: collected,
        remboursementsYear: approvedThisYearAgg._sum.totalApproved ?? 0,
        lossRatio,
      },
      series: { monthlyAdhesions, monthlyCotisations },
      byProduct: byProduct.map(p => ({ name: p.name, code: p.code, activeContracts: p._count.contracts })),
    };
  }
}

@Controller('stats')
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get('admin/dashboard')
  @RequirePermissions('stats.admin')
  admin() {
    return this.stats.admin();
  }
}

@Module({ controllers: [StatsController], providers: [StatsService] })
export class StatsModule {}
