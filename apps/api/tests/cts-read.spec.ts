import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CtsService } from '../src/modules/cts/cts.service';

// P17 : lecture CTS (assuré, entreprise, portefeuille) + simulateur commercial.
// Prisma entièrement mocké.

function makePrisma(db: any) {
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;
  return {
    contract: {
      findUnique: vi.fn(async ({ where }: any) => db.contracts[where.id] ?? null),
      findMany: vi.fn(async ({ where }: any) =>
        Object.values(db.contracts).filter((c: any) =>
          (where.principalUserId === undefined || c.principalUserId === where.principalUserId) &&
          (where.companyId === undefined || c.companyId === where.companyId),
        ),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(db.contracts[where.id], data);
        return db.contracts[where.id];
      }),
    },
    company: {
      findUnique: vi.fn(async ({ where }: any) => db.company ?? null),
    },
    user: {
      findUnique: vi.fn(async () => ({ firstName: 'Jean', lastName: 'Test' })),
      count: vi.fn(async ({ where }: any) =>
        db.users.filter((u: any) => u.companyId === where.companyId && u.role === 'MEMBER' && (where.status === undefined || u.status === where.status)).length,
      ),
      findMany: vi.fn(async () => []),
    },
    contribution: {
      findMany: vi.fn(async ({ where }: any) => (db.contributions ?? []).filter((c: any) => c.contractId === where.contractId)),
      count: vi.fn(async () => 0),
    },
    payment: { findMany: vi.fn(async () => []) },
    claim: {
      findMany: vi.fn(async ({ where }: any) => (db.claims ?? []).filter((c: any) => c.contractId === where.contractId)),
    },
    claimItem: {
      findMany: vi.fn(async () => db.claimItems ?? []),
    },
    technicalAccount: {
      findUnique: vi.fn(async ({ where }: any) => db.accounts[where.contractId] ?? null),
      findMany: vi.fn(async () => Object.values(db.accounts)),
      create: vi.fn(async ({ data }: any) => {
        const acc = { id: id('acc'), ...data };
        db.accounts[data.contractId] = acc;
        return acc;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const acc = Object.values(db.accounts).find((a: any) => a.id === where.id);
        Object.assign(acc, data);
        return acc;
      }),
    },
    ctsJournal: {
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        const rows = db.journal.filter((j: any) =>
          (where.contractId === undefined || j.contractId === where.contractId) &&
          (where.reference === undefined || j.reference === where.reference) &&
          (where.type === undefined || (where.type.in ? where.type.in.includes(j.type) : j.type === where.type)),
        );
        if (orderBy?.createdAt === 'desc') rows.reverse();
        return rows[0] ?? null;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        db.journal.filter((j: any) =>
          (where.contractId === undefined || j.contractId === where.contractId) &&
          (where.reference === undefined || j.reference === where.reference) &&
          (where.type === undefined || (where.type.in ? where.type.in.includes(j.type) : j.type === where.type)),
        ),
      ),
      create: vi.fn(async ({ data }: any) => {
        const e = { id: id('j'), date: new Date(), createdAt: new Date(), ...data };
        db.journal.push(e);
        return e;
      }),
      count: vi.fn(async ({ where }: any) =>
        db.journal.filter((j: any) => where.type === undefined || j.type === where.type).length,
      ),
    },
    ctsAlert: {
      findMany: vi.fn(async ({ where }: any) =>
        db.alerts.filter((a: any) => (where.contractId === undefined || a.contractId === where.contractId) && (where.status === undefined || a.status === where.status)),
      ),
      create: vi.fn(async ({ data }: any) => {
        const a = { id: id('al'), createdAt: new Date(), ...data };
        db.alerts.push(a);
        return a;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const a of db.alerts) {
          const mc = where.contractId === undefined || a.contractId === where.contractId;
          const ms = where.status === undefined || a.status === where.status;
          const mi = where.id === undefined || (where.id.in ? where.id.in.includes(a.id) : a.id === where.id);
          const mt = where.type === undefined || a.type === where.type;
          if (mc && ms && mi && mt) {
            Object.assign(a, data);
            count++;
          }
        }
        return { count };
      }),
      groupBy: vi.fn(async () => db.alertGroups ?? []),
    },
    fundCall: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const fc = db.fundCalls[where.id] ?? null;
        if (!fc) return null;
        if (include?.contract) return { ...fc, contract: { principalUserId: 'u1', number: 'CTR-1' } };
        return fc;
      }),
      findMany: vi.fn(async ({ where, orderBy, take }: any) => {
        let rows = Object.values(db.fundCalls).filter((f: any) =>
          (where.contractId === undefined || (where.contractId.in ? where.contractId.in.includes(f.contractId) : f.contractId === where.contractId)) &&
          (where.status === undefined || (where.status.in ? where.status.in.includes(f.status) : f.status === where.status)),
        );
        if (orderBy?.createdAt === 'desc') rows = [...rows].reverse();
        return take ? rows.slice(0, take) : rows;
      }),
      create: vi.fn(async ({ data }: any) => {
        const fc = { id: id('fc'), ...data };
        db.fundCalls[fc.id] = fc;
        return fc;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(db.fundCalls[where.id], data);
        return db.fundCalls[where.id];
      }),
      count: vi.fn(async ({ where }: any) =>
        Object.values(db.fundCalls).filter((f: any) => where.status === undefined || f.status === where.status).length,
      ),
    },
    contractClosure: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.contractId) return db.closures[where.contractId] ?? null;
        return Object.values(db.closures).find((c: any) => c.id === where.id) ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const c = { id: id('cl'), ...data };
        db.closures[data.contractId] = c;
        return c;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const c = Object.values(db.closures).find((x: any) => x.id === where.id);
        Object.assign(c, data);
        return c;
      }),
    },
    product: {
      findUnique: vi.fn(async ({ where }: any) => db.products[where.id] ?? null),
    },
  } as any;
}

function makeService(db: any) {
  const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
  return new CtsService(makePrisma(db), dispatch);
}

function baseDb() {
  return {
    contracts: {
      c1: {
        id: 'c1', number: 'CTR-1', kind: 'INDIVIDUAL', status: 'ACTIVE', principalUserId: 'u1',
        companyId: 'co1', endDate: new Date('2027-01-01'), premiumAnnual: 144_000,
        ctsOverride: null, product: { name: 'Confort', ctsConfig: '{}' }, _count: { beneficiaries: 2 },
      },
      c2: {
        id: 'c2', number: 'CTR-2', kind: 'GROUP', status: 'ACTIVE', principalUserId: 'admin',
        companyId: 'co1', endDate: new Date('2027-01-01'), premiumAnnual: 330_000,
        ctsOverride: null, product: { name: 'Entreprise', ctsConfig: '{}' }, _count: { beneficiaries: 0 },
      },
      c3: {
        id: 'c3', number: 'CTR-9', kind: 'INDIVIDUAL', status: 'ACTIVE', principalUserId: 'u2',
        companyId: null, endDate: new Date('2027-01-01'), premiumAnnual: 72_000,
        ctsOverride: null, product: { name: 'Essentielle', ctsConfig: '{}' }, _count: { beneficiaries: 0 },
      },
    },
    company: { id: 'co1', name: 'SOTRABEN', status: 'ACTIVE' },
    users: [
      { companyId: 'co1', role: 'MEMBER', status: 'ACTIVE' },
      { companyId: 'co1', role: 'MEMBER', status: 'ACTIVE' },
      { companyId: 'co1', role: 'MEMBER', status: 'SUSPENDED' },
    ],
    contributions: Array.from({ length: 12 }, () => ({ contractId: 'c1', amount: 12_000, status: 'PAID' })),
    payments: [],
    claims: [{ contractId: 'c1', status: 'PAID', totalApproved: 5_000 }],
    claimItems: [
      { categoryLabel: 'PHARMACY', amountApproved: 3_000 },
      { categoryLabel: 'PHARMACY', amountApproved: 2_000 },
      { categoryLabel: 'HOSPITALIZATION', amountApproved: 50_000 },
    ],
    accounts: {},
    journal: [] as any[],
    alerts: [] as any[],
    alertGroups: [] as any[],
    fundCalls: {} as Record<string, any>,
    closures: {} as Record<string, any>,
    products: {} as Record<string, any>,
  };
}

describe('myAccounts (§29)', () => {
  it('un récap par contrat : prime, frais, budget, conso, dispo, bande, appels, crédit', async () => {
    const db = baseDb();
    db.fundCalls = { fc1: { id: 'fc1', contractId: 'c1', status: 'SENT', chosenAmount: 1_000 } };
    db.closures = { c1: { id: 'cl1', contractId: 'c1', status: 'CONFIRMED', renewalCredit: 10_000 } };
    const svc = makeService(db);
    const rows = await (svc as any).myAccounts('u1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ contractId: 'c1', number: 'CTR-1', band: 'NORMAL', renewalCredit: 10_000 });
    expect(rows[0].account.primeCollected).toBe(144_000);
    expect(rows[0].account.consumed).toBe(5_000);
    expect(rows[0].openFundCalls).toHaveLength(1);
    expect(rows[0].renewalDate).toBeTruthy();
  });

  it('ne retourne que les contrats du demandeur', async () => {
    const db = baseDb();
    const svc = makeService(db);
    const rows = await (svc as any).myAccounts('u1');
    expect(rows.every((r: any) => r.contractId !== 'c3')).toBe(true);
  });
});

describe('companyOverview (§30, §35)', () => {
  it('agrégats sans données médicales individuelles', async () => {
    const db = baseDb();
    const svc = makeService(db);
    const out = await (svc as any).companyOverview('co1');
    expect(out.headcount).toEqual({ total: 3, active: 2, beneficiaries: 2 });
    expect(out.contracts).toHaveLength(2);
    expect(out.topGuarantees[0]).toEqual({ category: 'HOSPITALIZATION', amount: 50_000 });
    expect(out.topGuarantees[1]).toEqual({ category: 'PHARMACY', amount: 5_000 });
    expect(out.totals.collected).toBe(144_000);
    const dump = JSON.stringify(out);
    expect(dump).not.toContain('motif');
    expect(dump).not.toContain('diagnostic');
  });

  it('entreprise inconnue ou inactive → 404', async () => {
    const db = baseDb();
    db.company = null;
    const svc = makeService(db);
    await expect((svc as any).companyOverview('coX')).rejects.toThrow();
  });
});

describe('portfolioOverview (§31, §47)', () => {
  it('totaux, lossRatio, contrats critiques, compteurs', async () => {
    const db = baseDb();
    // c1 sain (backfill), c2 critique : consommé 38k sur budget 40k
    db.contributions.push(
      ...Array.from({ length: 4 }, () => ({ contractId: 'c2', amount: 12_000, status: 'PAID' })),
    );
    db.claims.push({ contractId: 'c2', status: 'PAID', totalApproved: 38_000 });
    db.accounts = {
      c1: {
        id: 'acc-1', contractId: 'c1', primeCollected: 144_000, primeBilled: 144_000,
        managementFees: 28_800, benefitBudget: 115_200, budgetBoost: 0,
        consumed: 5_000, committed: 0, available: 110_200, consumptionRatio: 0.04,
        provisionalResult: 110_200, primeUnpaid: 0, primeSubscribed: 144_000,
        fundCallsTotal: 0, renewalCredit: 0, deficit: 0,
        contract: { id: 'c1', number: 'CTR-1', status: 'ACTIVE', kind: 'INDIVIDUAL', product: { name: 'Confort', ctsConfig: '{}' }, company: null },
      },
      c2: {
        id: 'acc-2', contractId: 'c2', primeCollected: 48_000, primeBilled: 48_000,
        managementFees: 9_600, benefitBudget: 38_400, budgetBoost: 0,
        consumed: 38_000, committed: 0, available: 400, consumptionRatio: 0.99,
        provisionalResult: 400, primeUnpaid: 0, primeSubscribed: 48_000,
        fundCallsTotal: 0, renewalCredit: 0, deficit: 0,
        contract: { id: 'c2', number: 'CTR-2', status: 'ACTIVE', kind: 'GROUP', product: { name: 'Ent', ctsConfig: '{}' }, company: { name: 'SOTRABEN' } },
      },
    };
    db.alertGroups = [{ type: 'CRITIQUE', status: 'OPEN', _count: 1 }];
    db.fundCalls = { fc9: { id: 'fc9', contractId: 'c2', status: 'SENT' } };
    const svc = makeService(db);
    const out = await (svc as any).portfolioOverview();
    expect(out.totals.contracts).toBe(2);
    expect(out.totals.collected).toBe(192_000);
    expect(out.totals.consumed).toBe(43_000);
    expect(out.totals.lossRatio).toBeCloseTo(43_000 / 192_000);
    expect(out.critical).toHaveLength(1);
    expect(out.critical[0].contractId).toBe('c2');
    expect(out.critical[0].band).toBe('CRITIQUE');
    expect(out.openFundCalls).toHaveLength(1);
    expect(out.alertsByType).toHaveLength(1);
  });
});

describe('simulate (§32, estimation seule)', () => {
  const product = {
    id: 'p-ess', status: 'ACTIVE', name: 'Essentielle', code: 'ESS',
    basePremiumAnnual: 72_000, pricePerAdditionalAdultAnnual: 48_000, pricePerChildAnnual: 48_000,
    frequencyFactors: JSON.stringify({ ANNUAL: 1 }), minAge: 0, maxAge: 65,
    beneficiaryRules: JSON.stringify({ spouse: true, childMaxAge: 21 }),
    ageLoadings: JSON.stringify([]), globalAnnualCap: 500_000, ctsConfig: '{}',
  };

  it('famille 2+2 : prime, frais, budget, bande, crédit potentiel', async () => {
    const db = baseDb();
    db.products = { 'p-ess': product };
    const svc = makeService(db);
    const r = await (svc as any).simulate({
      productId: 'p-ess', principalAge: 30, spouseAge: 28, childrenAges: [5, 8],
      frequency: 'ANNUAL', assumedAnnualConsumption: 50_000,
    });
    expect(r.estimation).toBe(true);
    expect(r.disclaimer).toBeTruthy();
    expect(r.prime).toBe(216_000);
    expect(r.fees).toBe(43_200);
    expect(r.budget).toBe(172_800);
    expect(r.band).toBe('NORMAL');
    expect(r.exhaustionDay).toBeNull();
    expect(r.potentialCredit).toBe(85_960);
    expect(r.projectedResult).toBe(122_800);
  });

  it('conso > budget : épuisement projeté chiffré', async () => {
    const db = baseDb();
    db.products = { 'p-ess': product };
    const svc = makeService(db);
    const r = await (svc as any).simulate({
      productId: 'p-ess', principalAge: 30,
      frequency: 'ANNUAL', assumedAnnualConsumption: 300_000,
    });
    expect(r.band).toBe('EPUISE');
    expect(r.exhaustionDay).toBe(70); // budget 57 600 épuisé au jour 70 à 300k/an
  });

  it('produit inconnu → 404, personne invalide → 400', async () => {
    const db = baseDb();
    const svc = makeService(db);
    await expect((svc as any).simulate({
      productId: 'nope', principalAge: 30, frequency: 'ANNUAL', assumedAnnualConsumption: 0,
    })).rejects.toThrow(NotFoundException);
    db.products = { 'p-ess': product };
    await expect((svc as any).simulate({
      productId: 'p-ess', principalAge: 90, frequency: 'ANNUAL', assumedAnnualConsumption: 0,
    })).rejects.toThrow(BadRequestException);
  });
});
