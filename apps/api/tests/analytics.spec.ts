import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';

describe('analytics calculations', () => {
  it('maps monthly premiums and claims to a loss ratio', async () => {
    const prisma: any = {
      payment: { aggregate: vi.fn(async () => ({ _sum: { amount: 1000 } })) },
      claim: { aggregate: vi.fn(async () => ({ _sum: { totalApproved: 400 } })) },
    };
    const result = await new AnalyticsService(prisma).getLossRatio(1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ premiums: 1000, claims: 400, lossRatio: 0.4 });
  });

  it('maps product premiums, claims and fees to profitability', async () => {
    const prisma: any = {
      product: { findMany: vi.fn(async () => [{ id: 'product-1', name: 'Confort', code: 'CONF' }]) },
      contract: { findMany: vi.fn(async () => [{ id: 'contract-1' }]) },
      payment: { aggregate: vi.fn(async () => ({ _sum: { amount: 1000 } })) },
      claim: { aggregate: vi.fn(async () => ({ _sum: { totalApproved: 600 } })) },
      ctsJournal: { aggregate: vi.fn(async () => ({ _sum: { amount: 200 } })) },
    };
    const [result] = await new AnalyticsService(prisma).getProductProfitability();

    expect(result).toMatchObject({
      premiums: 1000,
      claims: 600,
      managementFees: 200,
      technicalResult: 200,
      lossRatio: 0.6,
      combinedRatio: 0.8,
    });
  });

  it('maps provider claims to volume and approval metrics', async () => {
    const prisma: any = {
      provider: { findMany: vi.fn(async () => [{ id: 'provider-1', name: 'Clinique', type: 'CLINIC' }]) },
      claim: {
        findMany: vi.fn(async () => ([
          { status: 'PAID', totalApproved: 300, submittedAt: new Date('2026-01-01T00:00:00Z'), decidedAt: new Date('2026-01-02T00:00:00Z') },
          { status: 'PAID', totalApproved: 100, submittedAt: new Date('2026-01-01T00:00:00Z'), decidedAt: new Date('2026-01-03T00:00:00Z') },
          { status: 'REJECTED', totalApproved: 0, submittedAt: null, decidedAt: null },
        ])),
        count: vi.fn(async () => 2),
      },
    };
    const [result] = await new AnalyticsService(prisma).getProviderPerformance();

    expect(result).toMatchObject({
      claimsCount: 3,
      totalAmount: 400,
      avgClaimAmount: 200,
      approvalRate: 2 / 3,
      avgProcessingDays: 1.5,
      thirdPartyVolume: 2,
    });
  });

  it('expose la métrique de traçabilité soin ↔ sinistre dans les KPIs', async () => {
    const prisma: any = {
      contract: { count: vi.fn(async () => 3) },
      user: { count: vi.fn(async () => 5) },
      payment: { aggregate: vi.fn(async () => ({ _sum: { amount: 1000000 } })) },
      claim: {
        aggregate: vi.fn(async () => ({ _sum: { totalApproved: 250000 } })),
        count: vi.fn()
          .mockResolvedValueOnce(4)   // openClaims
          .mockResolvedValueOnce(20)  // TP avec dossier
          .mockResolvedValueOnce(25), // TP total
      },
      systemConfig: { findUnique: vi.fn(async () => null) },
      ctsJournal: { aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })) },
      product: { findMany: vi.fn(async () => []) },
      claimItem: { aggregate: vi.fn(async () => ({ _sum: { amountApproved: 0 }, _count: 0 })) },
    };
    const kpis = await new AnalyticsService(prisma).getGlobalKPIs();

    expect(kpis.tpWithDossier).toBe(20);
    expect(kpis.tpTotal).toBe(25);
    expect(kpis.tpDossierRatio).toBeCloseTo(0.8);
  });

  it('met la métrique à 1 (100 %) quand aucun sinistre tiers-payant n’existe encore', async () => {
    const prisma: any = {
      contract: { count: vi.fn(async () => 0) },
      user: { count: vi.fn(async () => 0) },
      payment: { aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })) },
      claim: {
        aggregate: vi.fn(async () => ({ _sum: { totalApproved: 0 } })),
        count: vi.fn().mockResolvedValue(0),
      },
      systemConfig: { findUnique: vi.fn(async () => null) },
      ctsJournal: { aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })) },
      product: { findMany: vi.fn(async () => []) },
      claimItem: { aggregate: vi.fn(async () => ({ _sum: { amountApproved: 0 }, _count: 0 })) },
    };
    const kpis = await new AnalyticsService(prisma).getGlobalKPIs();

    expect(kpis.tpTotal).toBe(0);
    expect(kpis.tpDossierRatio).toBe(1);
  });
});
