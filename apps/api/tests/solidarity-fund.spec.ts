import { describe, expect, it, vi } from 'vitest';
import { CtsService } from '../src/modules/cts/cts.service';

function makeDb() {
  return {
    contracts: {
      c1: {
        id: 'c1', premiumAnnual: 144_000, status: 'EXPIRED', principalUserId: 'u1',
        endDate: new Date('2026-01-01'), ctsOverride: null, product: { ctsConfig: '{}' },
        contributions: [],
      },
    },
    contributions: [] as any[],
    payments: [] as any[],
    claims: [] as any[],
    accounts: {} as Record<string, any>,
    journal: [] as any[],
    alerts: [] as any[],
    closures: {} as Record<string, any>,
    fundCalls: {} as Record<string, any>,
    movements: [] as any[],
    configs: {
      'solidarity.enabled': 'true',
      'solidarity.surplusShare': '0.2',
      'solidarity.individualFundCallCap': '100000',
      'solidarity.maxCoveragePerContract': '500000',
    } as Record<string, string>,
  };
}

function makePrisma(db: any) {
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;
  return {
    contract: {
      findUnique: vi.fn(async ({ where }: any) => db.contracts[where.id] ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(db.contracts[where.id], data);
        return db.contracts[where.id];
      }),
    },
    contribution: {
      findMany: vi.fn(async ({ where }: any) => db.contributions.filter((c: any) => c.contractId === where.contractId)),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async ({ where, data }: any) => {
        const row = db.contributions.find((c: any) => c.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      count: vi.fn(async () => 0),
    },
    payment: {
      findMany: vi.fn(async ({ where }: any) =>
        db.payments.filter((p: any) => p.contractId === where.contractId && (where.status === undefined || p.status === where.status)),
      ),
    },
    claim: {
      findMany: vi.fn(async ({ where }: any) => db.claims.filter((c: any) => c.contractId === where.contractId)),
    },
    technicalAccount: {
      findUnique: vi.fn(async ({ where }: any) => db.accounts[where.contractId] ?? null),
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
      aggregate: vi.fn(async () => ({ _sum: { primeCollected: 1_000_000 } })),
    },
    ctsJournal: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: any) => {
        const e = { id: id('j'), date: new Date(), createdAt: new Date(), ...data };
        db.journal.push(e);
        return e;
      }),
    },
    ctsAlert: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: any) => {
        const a = { id: id('al'), createdAt: new Date(), ...data };
        db.alerts.push(a);
        return a;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
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
    fundCall: {
      findUnique: vi.fn(async ({ where }: any) => db.fundCalls[where.id] ?? null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: any) => {
        const f = { id: id('fc'), ...data };
        db.fundCalls[f.id] = f;
        return f;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(db.fundCalls[where.id], data);
        return db.fundCalls[where.id];
      }),
      count: vi.fn(async () => 0),
    },
    systemConfig: {
      findMany: vi.fn(async ({ where }: any) =>
        Object.entries(db.configs)
          .filter(([key]) => !where?.key?.in || where.key.in.includes(key))
          .map(([key, value]) => ({ key, value })),
      ),
    },
    solidarityMovement: {
      findMany: vi.fn(async () => db.movements),
      create: vi.fn(async ({ data }: any) => {
        const m = { id: id('sm'), createdAt: new Date(), ...data };
        db.movements.push(m);
        return m;
      }),
      aggregate: vi.fn(async ({ where }: any) => ({
        _sum: { amount: db.movements.filter((m: any) => !where?.kind || m.kind === where.kind).reduce((a: number, m: any) => a + m.amount, 0) },
      })),
    },
  } as any;
}

function makeService(db: any) {
  const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
  return new CtsService(makePrisma(db), dispatch);
}

describe('fonds de solidarité', () => {
  it('lit la configuration avec des défauts sûrs', async () => {
    const db = makeDb();
    const svc = makeService(db);
    await expect(svc.getSolidarityConfig()).resolves.toMatchObject({
      enabled: true,
      surplusShare: 0.2,
      individualFundCallCap: 100_000,
      maxCoveragePerContract: 500_000,
    });
  });

  it('clôture : 20 % de l’excédent au fonds, crédit sur le reliquat', async () => {
    const db = makeDb();
    db.contributions.push({ id: 'contrib-1', contractId: 'c1', sequence: 1, amount: 100_000, status: 'PAID' });
    db.claims.push({ contractId: 'c1', status: 'PAID', totalApproved: 30_000 });
    const svc = makeService(db);
    const closed = await (svc as any).closeContract('c1', 'mgr1');
    expect(closed.surplus).toBe(50_000);
    expect(closed.solidarityContribution).toBe(10_000);
    expect(closed.renewalCredit).toBe(28_000);

    await (svc as any).confirmClosure(closed.id);
    expect(db.movements).toHaveLength(1);
    expect(db.movements[0]).toMatchObject({ kind: 'CONTRIBUTION', amount: 10_000, contractId: 'c1' });
    expect(await (svc as any).solidarityBalance()).toBe(10_000);
  });

  it('couvre un déficit dans la limite du solde et du plafond par contrat', async () => {
    const db = makeDb();
    db.movements.push({ id: 'sm-1', kind: 'CONTRIBUTION', amount: 300_000, contractId: 'c9', createdAt: new Date() });
    db.accounts.c1 = {
      id: 'acc-1', contractId: 'c1', primeCollected: 100_000, primeBilled: 100_000,
      managementFees: 20_000, benefitBudget: 80_000, budgetBoost: 0,
      consumed: 120_000, committed: 0, available: -40_000, consumptionRatio: 1.5,
      provisionalResult: -40_000, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit: 40_000,
    };
    const svc = makeService(db);
    const r = await (svc as any).coverDeficitFromSolidarity('c1', 'mgr1');
    expect(r.covered).toBe(40_000);
    expect(await (svc as any).solidarityBalance()).toBe(260_000);
    expect(db.journal.some((j: any) => j.type === 'SOLIDARITE' && j.amount === 40_000)).toBe(true);
    expect((await (svc as any).getAccount('c1')).deficit).toBe(0);
  });

  it('ne couvre rien sans déficit ou sans solde', async () => {
    const db = makeDb();
    db.accounts.c1 = {
      id: 'acc-1', contractId: 'c1', primeCollected: 100_000, primeBilled: 100_000,
      managementFees: 20_000, benefitBudget: 80_000, budgetBoost: 0,
      consumed: 120_000, committed: 0, available: -40_000, consumptionRatio: 1.5,
      provisionalResult: -40_000, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit: 40_000,
    };
    const svc = makeService(db);
    const r = await (svc as any).coverDeficitFromSolidarity('c1', 'mgr1');
    expect(r.covered).toBe(0);
    expect(r.reason).toBe('Fonds de solidarité vide');
    expect(db.movements).toHaveLength(0);
  });

  it('plafonne la part facturée à l’assuré lors de l’envoi d’un appel de fonds', async () => {
    const db = makeDb();
    db.movements.push({ id: 'sm-1', kind: 'CONTRIBUTION', amount: 300_000, contractId: 'c9', createdAt: new Date() });
    db.accounts.c1 = {
      id: 'acc-1', contractId: 'c1', primeCollected: 100_000, primeBilled: 100_000,
      managementFees: 20_000, benefitBudget: 80_000, budgetBoost: 0,
      consumed: 200_000, committed: 0, available: -120_000, consumptionRatio: 2.5,
      provisionalResult: -120_000, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit: 120_000,
    };
    db.fundCalls['fc-1'] = {
      id: 'fc-1', contractId: 'c1', targetAmount: 200_000, minimum: 0,
      recommended: 150_000, chosenAmount: 150_000, status: 'DRAFT', dueDate: null,
      contract: { principalUserId: 'u1', number: 'CTR-1', premiumAnnual: 144_000 },
    };
    db.contracts.c1.status = 'ACTIVE';
    const svc = makeService(db);
    const sent: any = await (svc as any).sendFundCall('fc-1');
    // 150 000 demandés : 100 000 facturés à l'assuré, 50 000 couverts par le fonds.
    expect(db.fundCalls['fc-1'].chosenAmount).toBe(100_000);
    expect(sent.solidarityCovered).toBe(50_000);
    expect(await (svc as any).solidarityBalance()).toBe(250_000);
  });

  it('plafonne aussi la part individuelle à une prime annuelle du contrat', async () => {
    const db = makeDb();
    db.contracts.c1.premiumAnnual = 72_000;
    db.movements.push({ id: 'sm-1', kind: 'CONTRIBUTION', amount: 300_000, contractId: 'c9', createdAt: new Date() });
    db.accounts.c1 = {
      id: 'acc-1', contractId: 'c1', primeCollected: 72_000, primeBilled: 72_000,
      managementFees: 14_400, benefitBudget: 57_600, budgetBoost: 0,
      consumed: 200_000, committed: 0, available: -142_400, consumptionRatio: 3.47,
      provisionalResult: -142_400, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit: 142_400,
    };
    db.fundCalls['fc-1'] = {
      id: 'fc-1', contractId: 'c1', targetAmount: 200_000, minimum: 0,
      recommended: 150_000, chosenAmount: 150_000, status: 'DRAFT', dueDate: null,
      contract: { principalUserId: 'u1', number: 'CTR-1', premiumAnnual: 72_000 },
    };
    const svc = makeService(db);
    const sent: any = await (svc as any).sendFundCall('fc-1');
    // Prime annuelle 72 000 < plafond 100 000 : 72 000 facturés, 78 000 au fonds.
    expect(db.fundCalls['fc-1'].chosenAmount).toBe(72_000);
    expect(sent.solidarityCovered).toBe(78_000);
  });

  it('publie le ratio de solidarité du portefeuille', async () => {
    const db = makeDb();
    db.movements.push(
      { id: 'sm-1', kind: 'CONTRIBUTION', amount: 100_000, contractId: 'c9', createdAt: new Date() },
      { id: 'sm-2', kind: 'COVERAGE', amount: 20_000, contractId: 'c1', createdAt: new Date() },
    );
    const svc = makeService(db);
    const overview = await (svc as any).solidarityOverview();
    expect(overview.balance).toBe(80_000);
    expect(overview.totalCovered).toBe(20_000);
    expect(overview.solidarityRatio).toBeCloseTo(0.02);
  });
});
