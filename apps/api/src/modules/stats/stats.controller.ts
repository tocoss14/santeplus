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

  /**
   * Tableau de bord du résultat technique — Loss Ratio détaillé par produit
   * Permet de surveiller la rentabilité et d'ajuster les barèmes.
   */
  async technicalResult() {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const lastYearStart = new Date(new Date().getFullYear() - 1, 0, 1);

    const [
      products,
      paymentsThisYear,
      claimsThisYear,
      claimsByProduct,
      emergencyOverrides,
      feeScheduleAlerts,
    ] = await Promise.all([
      this.prisma.product.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true, name: true, code: true,
          basePremiumAnnual: true,
          globalAnnualCap: true,
          ageLoadings: true,
          _count: { select: { contracts: { where: { status: 'ACTIVE' } } } },
        },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'SUCCEEDED', completedAt: { gte: yearStart } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.claim.aggregate({
        where: {
          status: { in: ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'] },
          decidedAt: { gte: yearStart },
        },
        _sum: { totalApproved: true, totalRequested: true },
        _count: true,
      }),
      this.prisma.claim.groupBy({
        by: ['contractId'],
        where: {
          status: { in: ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'] },
          decidedAt: { gte: yearStart },
        },
        _sum: { totalApproved: true },
        _count: true,
      }),
      this.prisma.claim.aggregate({
        where: {
          emergencyOverride: true,
          emergencyAt: { gte: yearStart },
        },
        _sum: { totalApproved: true },
        _count: true,
      }),
      this.prisma.auditLog.count({
        where: {
          action: 'FEE_SCHEDULE_ALERT',
          createdAt: { gte: yearStart },
        },
      }),
    ]);

    const totalCollected = paymentsThisYear._sum.amount ?? 0;
    const totalClaims = claimsThisYear._sum.totalApproved ?? 0;
    const totalRequested = claimsThisYear._sum.totalRequested ?? 0;
    const lossRatio = totalCollected > 0 ? Math.round((totalClaims / totalCollected) * 1000) / 10 : null;
    const technicalResult = totalCollected - totalClaims;
    const technicalResultMargin = totalCollected > 0 ? Math.round((technicalResult / totalCollected) * 1000) / 10 : null;

    // Analyse par produit
    const contractIds = claimsByProduct.map(c => c.contractId);
    const contracts = contractIds.length ? await this.prisma.contract.findMany({
      where: { id: { in: contractIds } },
      select: { id: true, productId: true },
    }) : [];
    const contractProductMap = new Map(contracts.map(c => [c.id, c.productId]));
    const claimsByProductAgg = new Map<string, { count: number; totalApproved: number }>();
    for (const c of claimsByProduct) {
      const pid = contractProductMap.get(c.contractId);
      if (!pid) continue;
      const entry = claimsByProductAgg.get(pid) ?? { count: 0, totalApproved: 0 };
      entry.count += c._count;
      entry.totalApproved += c._sum.totalApproved ?? 0;
      claimsByProductAgg.set(pid, entry);
    }

    const productAnalysis = products.map(p => {
      const claims = claimsByProductAgg.get(p.id) ?? { count: 0, totalApproved: 0 };
      // Revenu estimé par produit (nombre de contracts actifs × prime annuelle)
      const estimatedRevenue = p._count.contracts * p.basePremiumAnnual;
      const productLossRatio = estimatedRevenue > 0 ? Math.round((claims.totalApproved / estimatedRevenue) * 1000) / 10 : null;
      return {
        product: { id: p.id, name: p.name, code: p.code },
        activeContracts: p._count.contracts,
        basePremium: p.basePremiumAnnual,
        globalCap: p.globalAnnualCap,
        estimatedRevenue,
        claimsCount: claims.count,
        claimsTotalApproved: claims.totalApproved,
        lossRatio: productLossRatio,
        margin: estimatedRevenue - claims.totalApproved,
        ageLoadings: JSON.parse(p.ageLoadings || '[]'),
      };
    });

    return {
      summary: {
        totalCollected,
        totalClaimsPaid: totalClaims,
        totalRequested,
        technicalResult,
        technicalResultMargin,
        lossRatio,
        claimsCount: claimsThisYear._count,
        avgClaimAmount: claimsThisYear._count > 0 ? Math.round(totalClaims / claimsThisYear._count) : 0,
      },
      emergencyOverrides: {
        count: emergencyOverrides._count,
        totalApproved: emergencyOverrides._sum.totalApproved ?? 0,
        percentageOfTotal: totalClaims > 0 ? Math.round(((emergencyOverrides._sum.totalApproved ?? 0) / totalClaims) * 1000) / 10 : 0,
      },
      feeScheduleAlerts,
      byProduct: productAnalysis,
      alerts: [
        ...(lossRatio !== null && lossRatio > 80 ? [{
          level: 'CRITICAL',
          message: `Loss Ratio à ${lossRatio}% — seuil critique de 80% dépassé. Augmentez les primes ou réduisez les taux de couverture.`,
        }] : []),
        ...(lossRatio !== null && lossRatio > 65 && lossRatio <= 80 ? [{
          level: 'WARNING',
          message: `Loss Ratio à ${lossRatio}% — seuil d'alerte de 65% dépassé. Surveillez l'évolution.`,
        }] : []),
        ...productAnalysis.filter(p => p.lossRatio !== null && p.lossRatio > 100).map(p => ({
          level: 'CRITICAL',
          message: `Produit ${p.product.name} : Loss Ratio à ${p.lossRatio}% — les dépenses dépassent les revenus estimés.`,
        })),
        ...(emergencyOverrides.count > 0 && emergencyOverrides.percentageOfTotal > 10 ? [{
          level: 'WARNING',
          message: `Dérogations urgence représentent ${emergencyOverrides.percentageOfTotal}% des remboursements — risque de contournement.`,
        }] : []),
      ],
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

  @Get('admin/technical-result')
  @RequirePermissions('stats.admin')
  async technicalResult() {
    return this.stats.technicalResult();
  }
}

@Module({ controllers: [StatsController], providers: [StatsService] })
export class StatsModule {}
