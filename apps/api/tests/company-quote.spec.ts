/* diagnostics du bug B2B à 0 FCFA — exclu du commit : la régression est
   couverte ailleurs (CollectiveContract.test.ts + subscribeCompany). */
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionService } from '../src/modules/subscription/subscription.service';

function companyProduct(over: Record<string, any> = {}) {
  return {
    id: 'product-ent-perf',
    code: 'ENT-PERF',
    name: 'Entreprise Performance',
    clientType: 'COMPANY',
    status: 'ACTIVE',
    basePremiumAnnual: 120000,
    pricePerAdditionalAdultAnnual: 0,
    pricePerChildAnnual: 48000,
    frequencyFactors: JSON.stringify({ ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 }),
    minAge: 18,
    maxAge: 63,
    waitingPeriodDays: 15,
    beneficiaryRules: JSON.stringify({ spouse: true, childMaxAge: 23, otherAllowed: false, maxBeneficiaries: 6 }),
    ageLoadings: JSON.stringify([]),
    globalAnnualCap: 500000,
    insurerPartnerId: 'partner-1',
    guarantees: [],
    ...over,
  };
}

function makeService(product: any = companyProduct()) {
  const contractCreate = vi.fn(async (args: any) => ({
    id: 'contract-1',
    number: 'GRP-TEST01',
    ...args.data,
  }));
  const contributionCreateMany = vi.fn(async () => ({ count: 0 }));
  const tx = {
    contract: { create: contractCreate },
    contribution: { createMany: contributionCreateMany },
  };
  const prisma: any = {
    user: { findUnique: vi.fn(async () => ({ id: 'admin-1', companyId: 'company-1', role: 'COMPANY_ADMIN' })) },
    company: { findUnique: vi.fn(async () => ({ id: 'company-1', status: 'ACTIVE' })) },
    contract: { findFirst: vi.fn(async () => null), create: contractCreate },
    contribution: { createMany: contributionCreateMany },
    product: { findUnique: vi.fn(async () => product) },
    systemConfig: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
  const dispatch: any = {
    dispatchToUser: vi.fn(async () => ({})),
    dispatchToMany: vi.fn(async () => ({})),
  };
  const service = new SubscriptionService(prisma, dispatch, {} as any);
  return { service, prisma, dispatch, contractCreate };
}

describe('devis entreprise (souscription collective)', () => {
  it('tarife les salariés sur la cotisation de base : 10 × 120 000 = 1 200 000 FCFA', async () => {
    const { service, contractCreate } = makeService();

    const res = await service.subscribeCompany('admin-1', 'product-ent-perf', 10, 'ANNUAL');

    expect(res.quote.subtotalAnnual).toBe(1_200_000);
    expect(res.quote.totalAnnual).toBe(1_200_000);
    expect(res.quote.lines[0]).toMatchObject({ label: 'Salariés assurés (10)', amount: 1_200_000 });

    expect(contractCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'GROUP', premiumAnnual: 1_200_000 }),
      }),
    );
    expect(res.contributions).toHaveLength(1);
    expect(res.contributions[0].amount).toBe(1_200_000);

    expect(res.adhesion).toMatchObject({ perPerson: 3000, personsCount: 10, adhesionFee: 30_000 });
    expect(res.firstPayment).toMatchObject({
      amount: 1_200_000,
      adhesionFee: 30_000,
      totalFirstPayment: 1_230_000,
    });
  });

  it('applique le coefficient de fractionnement mensuel (× 1,06) et l’arrondi à 5 FCFA', async () => {
    const { service } = makeService();

    const res = await service.subscribeCompany('admin-1', 'product-ent-perf', 10, 'MONTHLY');

    expect(res.quote.factor).toBe(1.06);
    expect(res.quote.totalAnnual).toBe(1_272_000);
    expect(res.quote.periods).toBe(12);
    expect(res.quote.periodicAmount).toBe(106_000);
    expect(res.contributions).toHaveLength(12);
    expect(res.contributions.reduce((s: number, c: any) => s + c.amount, 0)).toBe(1_272_000);
    expect(res.firstPayment.totalFirstPayment).toBe(106_000 + 30_000);
  });

  it('tarife la formule Cadre/VIP à 240 000 FCFA par salarié et par trimestre', async () => {
    const { service } = makeService(
      companyProduct({ id: 'product-ent-vip', code: 'ENT-VIP', basePremiumAnnual: 240000, pricePerChildAnnual: 96000 }),
    );

    const res = await service.subscribeCompany('admin-1', 'product-ent-vip', 3, 'QUARTERLY');

    expect(res.quote.subtotalAnnual).toBe(720_000);
    expect(res.quote.totalAnnual).toBe(741_600);
    expect(res.quote.periodicAmount).toBe(185_400);
    expect(res.contributions).toHaveLength(4);
    expect(res.firstPayment.totalFirstPayment).toBe(185_400 + 9_000);
  });

  it('refuse de souscrire un produit sans cotisation par salarié au lieu de facturer 0', async () => {
    const { service, contractCreate } = makeService(companyProduct({ basePremiumAnnual: 0 }));

    await expect(
      service.subscribeCompany('admin-1', 'product-ent-perf', 10, 'ANNUAL'),
    ).rejects.toThrow('Cotisation par salarié non configurée sur ce produit');
    expect(contractCreate).not.toHaveBeenCalled();
  });

  it('refuse un produit individuel pour une souscription collective', async () => {
    const { service, contractCreate } = makeService(
      companyProduct({ code: 'ESS', clientType: 'INDIVIDUAL' }),
    );

    await expect(
      service.subscribeCompany('admin-1', 'product-ent-perf', 10, 'ANNUAL'),
    ).rejects.toThrow('Produit individuel sélectionné pour une souscription collective');
    expect(contractCreate).not.toHaveBeenCalled();
  });
});
