import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns';

export interface LossRatioData {
  period: string;
  premiums: number;
  claims: number;
  lossRatio: number;
}

export interface TechnicalReservesData {
  asOf: Date;
  rbns: number; // Reported But Not Settled
  ibnr: number; // Incurred But Not Reported
  total: number;
  byProduct: { productId: string; productName: string; rbns: number; ibnr: number; total: number }[];
}

export interface ProductProfitabilityData {
  productId: string;
  productName: string;
  productCode: string;
  contractsCount: number;
  premiums: number;
  claims: number;
  lossRatio: number;
  managementFees: number;
  technicalResult: number;
  combinedRatio: number;
}

export interface ProviderPerformanceData {
  providerId: string;
  providerName: string;
  type: string;
  claimsCount: number;
  totalAmount: number;
  avgClaimAmount: number;
  approvalRate: number;
  avgProcessingDays: number;
  thirdPartyVolume: number;
}

export interface PortfolioEvolutionData {
  date: string;
  activeContracts: number;
  totalMembers: number;
  totalPremiums: number;
  totalClaims: number;
  lossRatio: number;
}

export interface IBEData {
  triangle: number[][];
  factors: number[];
  ultimate: number[];
  ibnr: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Sinistralité par période (mensuelle par défaut)
   */
  async getLossRatio(months = 12): Promise<LossRatioData[]> {
    const startDate = subMonths(new Date(), months);
    const periods: LossRatioData[] = [];

    for (let i = 0; i < months; i++) {
      const periodStart = startOfMonth(subMonths(new Date(), i));
      const periodEnd = endOfMonth(subMonths(new Date(), i));

      const [premiums, claims] = await Promise.all([
        this.prisma.payment.aggregate({
          where: {
            status: 'SUCCEEDED',
            initiatedAt: { gte: periodStart, lte: periodEnd },
            contract: { kind: { in: ['INDIVIDUAL', 'GROUP'] } },
          },
          _sum: { amount: true },
        }),
        this.prisma.claim.aggregate({
          where: {
            status: 'PAID',
            paidAt: { gte: periodStart, lte: periodEnd },
          },
          _sum: { totalApproved: true },
        }),
      ]);

      const p = premiums._sum.amount ?? 0;
      const c = claims._sum.totalApproved ?? 0;
      periods.unshift({
        period: format(periodStart, 'yyyy-MM'),
        premiums: p,
        claims: c,
        lossRatio: p > 0 ? c / p : 0,
      });
    }

    return periods;
  }

  /**
   * Réserves techniques (RBNS + IBNR) — méthode Chain Ladder simplifiée
   */
  async getTechnicalReserves(): Promise<TechnicalReservesData> {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    const byProduct = await Promise.all(
      products.map(async (product) => {
        const contracts = await this.prisma.contract.findMany({
          where: { productId: product.id, status: { in: ['ACTIVE', 'SUSPENDED'] } },
          select: { id: true },
        });
        const contractIds = contracts.map(c => c.id);

        // RBNS : sinistres déclarés mais non réglés (APPROVED, CONFIRMED, PARTIALLY_APPROVED)
        const rbnsAgg = await this.prisma.claim.aggregate({
          where: {
            contractId: { in: contractIds },
            status: { in: ['APPROVED', 'CONFIRMED', 'PARTIALLY_APPROVED'] },
            totalApproved: { not: null },
          },
          _sum: { totalApproved: true },
        });

        // IBNR estimation via triangle de développement (simplifié)
        const ibnr = await this.estimateIBNR(contractIds);

        return {
          productId: product.id,
          productName: product.name,
          rbns: rbnsAgg._sum.totalApproved ?? 0,
          ibnr,
          total: (rbnsAgg._sum.totalApproved ?? 0) + ibnr,
        };
      }),
    );

    const totalRbns = byProduct.reduce((a, b) => a + b.rbns, 0);
    const totalIbnr = byProduct.reduce((a, b) => a + b.ibnr, 0);

    return {
      asOf: new Date(),
      rbns: totalRbns,
      ibnr: totalIbnr,
      total: totalRbns + totalIbnr,
      byProduct,
    };
  }

  /**
   * Estimation IBNR par méthode Chain Ladder sur 24 mois glissants
   */
  private async estimateIBNR(contractIds: string[]): Promise<number> {
    if (!contractIds.length) return 0;

    // Récupérer les sinistres payés par mois de survenance et mois de développement
    // Note: Prisma doesn't support { not: null } for DateTime, so we filter in memory
    const rawClaims = await this.prisma.claim.findMany({
      where: {
        contractId: { in: contractIds },
        status: 'PAID',
      },
      select: {
        careDate: true,
        paidAt: true,
        totalApproved: true,
      },
    });

    type ClaimData = { careDate: Date; paidAt: Date; totalApproved: number | null };
    const validClaims: ClaimData[] = rawClaims
      .filter((c): c is { careDate: Date; paidAt: Date; totalApproved: number | null } => c.careDate != null && c.paidAt != null)
      .map(c => ({ careDate: c.careDate!, paidAt: c.paidAt!, totalApproved: c.totalApproved }));

    if (validClaims.length < 10) return 0; // Pas assez de données

    // Construire le triangle (mois survenance x mois développement)
    const maxAge = 24;
    const triangle: number[][] = Array.from({ length: maxAge }, () => Array(maxAge).fill(0));

    for (const c of validClaims) {
      const origin = startOfMonth(c.careDate);
      const dev = startOfMonth(c.paidAt);
      const originIdx = Math.max(0, Math.min(maxAge - 1, this.monthsDiff(origin, subMonths(new Date(), maxAge))));
      const devIdx = Math.max(0, Math.min(maxAge - 1, this.monthsDiff(origin, dev)));
      if (originIdx < maxAge && devIdx < maxAge) {
        triangle[originIdx][devIdx] += c.totalApproved ?? 0;
      }
    }

    // Calculer les facteurs de développement (moyenne des derniers 3 origines complètes)
    const factors: number[] = [];
    for (let d = 0; d < maxAge - 1; d++) {
      let sumNum = 0;
      let sumDen = 0;
      let count = 0;
      for (let o = 0; o < maxAge - d - 1; o++) {
        const val1 = triangle[o][d];
        const val2 = triangle[o][d + 1];
        if (val1 > 0 && val2 > 0) {
          sumNum += val2;
          sumDen += val1;
          count++;
        }
      }
      factors.push(count >= 2 ? sumNum / sumDen : 1);
    }

    // Projeter l'ultime pour chaque origine
    let totalIbnr = 0;
    for (let o = 0; o < maxAge; o++) {
      let latest = 0;
      let latestDev = -1;
      for (let d = 0; d < maxAge; d++) {
        if (triangle[o][d] > 0) {
          latest = triangle[o][d];
          latestDev = d;
        }
      }
      if (latest > 0 && latestDev < maxAge - 1) {
        let factor = 1;
        for (let d = latestDev; d < maxAge - 1; d++) {
          factor *= factors[d];
        }
        const ultimate = latest * factor;
        totalIbnr += ultimate - latest;
      }
    }

    return Math.max(0, Math.round(totalIbnr));
  }

  private monthsDiff(from: Date, to: Date): number {
    return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  }

  /**
   * Rentabilité par produit
   */
  async getProductProfitability(): Promise<ProductProfitabilityData[]> {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, code: true },
    });

    return Promise.all(
      products.map(async (product) => {
        const contracts = await this.prisma.contract.findMany({
          where: { productId: product.id, status: { in: ['ACTIVE', 'SUSPENDED'] } },
          select: { id: true },
        });
        const contractIds = contracts.map(c => c.id);

        const [premiums, claims, fees] = await Promise.all([
          this.prisma.payment.aggregate({
            where: { contractId: { in: contractIds }, status: 'SUCCEEDED' },
            _sum: { amount: true },
          }),
          this.prisma.claim.aggregate({
            where: { contractId: { in: contractIds }, status: 'PAID' },
            _sum: { totalApproved: true },
          }),
          this.prisma.ctsJournal.aggregate({
            where: {
              contractId: { in: contractIds },
              type: 'FRAIS',
            },
            _sum: { amount: true },
          }),
        ]);

        const p = premiums._sum.amount ?? 0;
        const c = claims._sum.totalApproved ?? 0;
        const f = fees._sum.amount ?? 0;
        const techResult = p - f - c;

        return {
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          contractsCount: contracts.length,
          premiums: p,
          claims: c,
          lossRatio: p > 0 ? c / p : 0,
          managementFees: f,
          technicalResult: techResult,
          combinedRatio: p > 0 ? (c + f) / p : 0,
        };
      }),
    );
  }

  /**
   * Performance prestataires
   */
  async getProviderPerformance(): Promise<ProviderPerformanceData[]> {
    const providers = await this.prisma.provider.findMany({
      where: { active: true, partnerStatus: 'ACTIVE' },
      select: { id: true, name: true, type: true },
    });

    return Promise.all(
      providers.map(async (provider) => {
        const claims = await this.prisma.claim.findMany({
          where: {
            providerId: provider.id,
            status: { in: ['PAID', 'APPROVED', 'REJECTED'] },
          },
          select: { status: true, totalApproved: true, totalRequested: true, submittedAt: true, decidedAt: true },
        });

        const tpClaims = await this.prisma.claim.count({
          where: { providerId: provider.id, kind: 'THIRD_PARTY', status: { in: ['PAID', 'APPROVED'] } },
        });

        const paidClaims = claims.filter(c => c.status === 'PAID');
        const totalAmount = paidClaims.reduce((a, c) => a + (c.totalApproved ?? 0), 0);
        const processingDays = paidClaims
          .filter((c): c is typeof c & { submittedAt: Date; decidedAt: Date } => c.submittedAt != null && c.decidedAt != null)
          .map(c => (c.decidedAt.getTime() - c.submittedAt.getTime()) / 86400000);

        return {
          providerId: provider.id,
          providerName: provider.name,
          type: provider.type,
          claimsCount: claims.length,
          totalAmount,
          avgClaimAmount: paidClaims.length ? totalAmount / paidClaims.length : 0,
          approvalRate: claims.length ? paidClaims.length / claims.length : 0,
          avgProcessingDays: processingDays.length ? processingDays.reduce((a, b) => a + b, 0) / processingDays.length : 0,
          thirdPartyVolume: tpClaims,
        };
      }),
    );
  }

  /**
   * Évolution portefeuille (12 derniers mois)
   */
  async getPortfolioEvolution(months = 12): Promise<PortfolioEvolutionData[]> {
    const data: PortfolioEvolutionData[] = [];

    for (let i = 0; i < months; i++) {
      const periodStart = startOfMonth(subMonths(new Date(), i));
      const periodEnd = endOfMonth(subMonths(new Date(), i));

      const [activeContracts, totalMembers, premiums, claims] = await Promise.all([
        this.prisma.contract.count({
          where: { status: 'ACTIVE', startDate: { lte: periodEnd }, endDate: { gte: periodStart } },
        }),
        this.prisma.user.count({
          where: { role: 'MEMBER', status: 'ACTIVE', createdAt: { lte: periodEnd } },
        }),
        this.prisma.payment.aggregate({
          where: { status: 'SUCCEEDED', initiatedAt: { gte: periodStart, lte: periodEnd } },
          _sum: { amount: true },
        }),
        this.prisma.claim.aggregate({
          where: { status: 'PAID', paidAt: { gte: periodStart, lte: periodEnd } },
          _sum: { totalApproved: true },
        }),
      ]);

      const p = premiums._sum.amount ?? 0;
      const c = claims._sum.totalApproved ?? 0;

      data.unshift({
        date: format(periodStart, 'yyyy-MM'),
        activeContracts,
        totalMembers,
        totalPremiums: p,
        totalClaims: c,
        lossRatio: p > 0 ? c / p : 0,
      });
    }

    return data;
  }

  /**
   * Dashboard KPIs globaux
   */
  async getGlobalKPIs() {
    const [
      activeContracts,
      activeMembers,
      totalPremiumsYTD,
      totalClaimsYTD,
      openClaims,
      technicalReserves,
      productProfitability,
    ] = await Promise.all([
      this.prisma.contract.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { role: 'MEMBER', status: 'ACTIVE' } }),
      this.prisma.payment.aggregate({
        where: { status: 'SUCCEEDED', initiatedAt: { gte: startOfMonth(new Date()) } },
        _sum: { amount: true },
      }),
      this.prisma.claim.aggregate({
        where: { status: 'PAID', paidAt: { gte: startOfMonth(new Date()) } },
        _sum: { totalApproved: true },
      }),
      this.prisma.claim.count({ where: { status: { in: ['SUBMITTED', 'APPROVED', 'CONFIRMED'] } } }),
      this.getTechnicalReserves(),
      this.getProductProfitability(),
    ]);

    const p = totalPremiumsYTD._sum.amount ?? 0;
    const c = totalClaimsYTD._sum.totalApproved ?? 0;

    return {
      activeContracts,
      activeMembers,
      premiumsYTD: p,
      claimsYTD: c,
      lossRatioYTD: p > 0 ? c / p : 0,
      openClaims,
      technicalReserves: technicalReserves.total,
      combinedRatio: productProfitability.reduce((a, b) => a + b.combinedRatio, 0) / (productProfitability.length || 1),
      avgLossRatio: productProfitability.reduce((a, b) => a + b.lossRatio, 0) / (productProfitability.length || 1),
    };
  }
}