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
});
