import { describe, expect, it, vi } from 'vitest';
import { SubscriptionService } from '../src/modules/subscription/subscription.service';

function product() {
  return {
    id: 'product-1',
    name: 'Confort',
    code: 'CONF',
    status: 'ACTIVE',
    clientType: 'INDIVIDUAL',
    basePremiumAnnual: 144000,
    pricePerAdditionalAdultAnnual: 108000,
    pricePerChildAnnual: 108000,
    frequencyFactors: JSON.stringify({ ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 }),
    minAge: 0,
    maxAge: 65,
    waitingPeriodDays: 30,
    beneficiaryRules: JSON.stringify({ spouse: true, childMaxAge: 25, otherAllowed: false, maxBeneficiaries: 8 }),
    ageLoadings: JSON.stringify([]),
    globalAnnualCap: 1200000,
    insurerPartnerId: 'partner-1',
    guarantees: [
      {
        guarantee: { category: 'CONSULTATION', name: 'Consultations', basePrice: 8000 },
        minRate: 70,
        maxRate: 90,
        minLimit: 100000,
        maxLimit: 200000,
        limitStep: 50000,
        mandatory: true,
        customizable: false,
        rate: 80,
        annualLimit: 144000,
        copayRate: 20,
      },
    ],
  };
}

function makeService(managers = [{ id: 'manager-1' }]) {
  const prisma: any = {
    user: {
      findUnique: vi.fn(async (args: any) => {
        if (args.where.id === 'user-1') {
          return {
            id: 'user-1',
            firstName: 'Jean',
            lastName: 'Agbodjan',
            email: 'jean@example.bj',
            birthDate: new Date('1990-01-01T00:00:00.000Z'),
          };
        }
        return null;
      }),
      findMany: vi.fn(async () => managers),
    },
    product: { findUnique: vi.fn(async () => product()) },
  };
  const dispatch: any = { dispatchToMany: vi.fn(async () => ({})), dispatchToUser: vi.fn(async () => ({})) };
  const birthCertificates: any = { getVerificationStatus: vi.fn(async () => ({ verified: true })) };
  const service = new SubscriptionService(prisma, dispatch, birthCertificates);
  return { service, dispatch };
}

const baseInput = {
  productId: 'product-1',
  categoryId: 'CONSULTATION',
  requestedRate: 85,
  reason: 'Je souhaite une meilleure prise en charge des consultations spécialisées.',
  frequency: 'ANNUAL' as const,
  beneficiaries: [],
};

describe('guarantee change requests', () => {
  it('estimates the tariff impact and notifies managers plus the requester', async () => {
    const { service, dispatch } = makeService();
    const result = await service.requestGuaranteeChange('user-1', baseInput);

    expect(result.product).toMatchObject({ id: 'product-1', code: 'CONF' });
    expect(result.requested).toMatchObject({ rate: 85, annualLimit: 144000 });
    expect(result.projectedAnnual).toBeGreaterThan(result.baselineAnnual);
    expect(result.deltaAnnual).toBe(result.projectedAnnual - result.baselineAnnual);
    expect(result.managersNotified).toBe(1);
    expect(dispatch.dispatchToMany).toHaveBeenCalledTimes(1);
    expect(dispatch.dispatchToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ topic: 'GUARANTEE_CHANGE_REQUEST_SENT' }),
    );
  });

  it('rejects values outside the product bounds', async () => {
    const { service } = makeService();
    await expect(
      service.requestGuaranteeChange('user-1', { ...baseInput, requestedRate: 95 }),
    ).rejects.toThrow('compris entre 70 % et 90 %');
  });

  it('requires an available manager', async () => {
    const { service } = makeService([]);
    await expect(service.requestGuaranteeChange('user-1', baseInput)).rejects.toThrow(
      'Aucun gestionnaire disponible',
    );
  });
});
