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
      'solidarity.dynamicShare': 'false',
      'solidarity.individualFundCallCap': '100000',
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
      aggregate: vi.fn(async ({ where }: any = {}) => {
        const rows = Object.values(db.accounts).filter((a: any) =>
          !where?.deficit || (where.deficit.gt !== undefined && a.deficit > where.deficit.gt),
        );
        const sum = (k: string) => rows.reduce((t: number, a: any) => t + (a[k] ?? 0), 0);
        return { _sum: { primeCollected: sum('primeCollected'), consumed: sum('consumed'), committed: sum('committed'), deficit: sum('deficit') } };
      }),
    },
    contribution: {
      findMany: vi.fn(async ({ where }: any) => db.contributions.filter((c: any) => !where?.contractId || c.contractId === where.contractId)),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async ({ where, data }: any) => {
        const row = db.contributions.find((c: any) => c.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      count: vi.fn(async () => 0),
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
      dynamicShare: false,
      individualFundCallCap: 100_000,
    });
  });

  it('clôture : 20 % de l’excédent au fonds, crédit sur le reliquat', async () => {
    const db = makeDb();
    db.movements.push({ id: 'sm-0', kind: 'CONTRIBUTION', amount: 500_000, contractId: 'c9', createdAt: new Date() });
    db.contributions.push({ id: 'contrib-1', contractId: 'c1', sequence: 1, amount: 100_000, status: 'PAID' });
    db.claims.push({ contractId: 'c1', status: 'PAID', totalApproved: 30_000 });
    const svc = makeService(db);
    const closed = await (svc as any).closeContract('c1', 'mgr1');
    expect(closed.surplus).toBe(50_000);
    expect(closed.solidarityContribution).toBe(10_000);
    expect(closed.renewalCredit).toBe(28_000);

    await (svc as any).confirmClosure(closed.id);
    const contribution = db.movements.find((m: any) => m.kind === 'CONTRIBUTION' && m.contractId === 'c1');
    expect(contribution).toMatchObject({ amount: 10_000 });
    expect(await (svc as any).solidarityBalance()).toBe(510_000);
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
    expect(r.reason).toBe('Fonds de solidarité vide ou insuffisant');
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

  it('clôture INDIVIDUEL : aucune contribution, 100 % de l’excédent en crédit', async () => {
    const db = makeDb();
    db.contracts.c1.riskModel = 'INDIVIDUEL';
    db.contributions.push({ id: 'contrib-1', contractId: 'c1', sequence: 1, amount: 100_000, status: 'PAID' });
    db.claims.push({ contractId: 'c1', status: 'PAID', totalApproved: 30_000 });
    const svc = makeService(db);
    const closed = await (svc as any).closeContract('c1', 'mgr1');
    expect(closed.surplus).toBe(50_000);
    expect(closed.solidarityShare).toBe(0);
    expect(closed.solidarityContribution).toBe(0);
    expect(closed.renewalCredit).toBe(50_000);
    await (svc as any).confirmClosure(closed.id);
    expect(db.movements).toHaveLength(0);
  });

  it('couverture refusée en mode INDIVIDUEL', async () => {
    const db = makeDb();
    db.contracts.c1.riskModel = 'INDIVIDUEL';
    db.accounts.c1 = {
      id: 'acc-1', contractId: 'c1', primeCollected: 100_000, primeBilled: 100_000,
      managementFees: 20_000, benefitBudget: 80_000, budgetBoost: 0,
      consumed: 120_000, committed: 0, available: -40_000, consumptionRatio: 1.5,
      provisionalResult: -40_000, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit: 40_000,
    };
    const svc = makeService(db);
    await expect((svc as any).coverDeficitFromSolidarity('c1', 'mgr1')).rejects.toThrow('MUTUALITE');
  });

  it('appel de fonds INDIVIDUEL : part plafonnée, reliquat sans recours au fonds', async () => {
    const db = makeDb();
    db.movements.push({ id: 'sm-1', kind: 'CONTRIBUTION', amount: 300_000, contractId: 'c9', createdAt: new Date() });
    db.accounts.c1 = {
      id: 'acc-1', contractId: 'c1', primeCollected: 144_000, primeBilled: 144_000,
      managementFees: 28_800, benefitBudget: 115_200, budgetBoost: 0,
      consumed: 200_000, committed: 0, available: -84_800, consumptionRatio: 1.74,
      provisionalResult: -84_800, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit: 84_800,
    };
    db.fundCalls['fc-1'] = {
      id: 'fc-1', contractId: 'c1', targetAmount: 200_000, minimum: 0,
      recommended: 150_000, chosenAmount: 150_000, status: 'DRAFT', dueDate: null,
      contract: { principalUserId: 'u1', number: 'CTR-1', premiumAnnual: 144_000, riskModel: 'INDIVIDUEL' },
    };
    const svc = makeService(db);
    const sent: any = await (svc as any).sendFundCall('fc-1');
    expect(db.fundCalls['fc-1'].chosenAmount).toBe(100_000);
    expect(sent.solidarityCovered).toBe(0);
    expect(await (svc as any).solidarityBalance()).toBe(300_000);
  });

  it('part dynamique indexée sur la sinistralité globale', async () => {
    const db = makeDb();
    db.movements.push({ id: 'sm-0', kind: 'CONTRIBUTION', amount: 500_000, contractId: 'c9', createdAt: new Date() });
    db.accounts.cx = {
      id: 'acc-x', contractId: 'cx', primeCollected: 1_000_000, primeBilled: 1_000_000,
      managementFees: 200_000, benefitBudget: 800_000, budgetBoost: 0,
      consumed: 500_000, committed: 0, available: 300_000, consumptionRatio: 0.625,
      provisionalResult: 300_000, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit: 0,
    };
    db.configs['solidarity.dynamicShare'] = 'true';
    const svc = makeService(db);
    // S/P 50 % → part basse 15 %
    await expect((svc as any).resolveSurplusShare()).resolves.toMatchObject({ share: 0.15, lossRatio: 0.5 });
    db.accounts.cx.consumed = 900_000;
    await expect((svc as any).resolveSurplusShare()).resolves.toMatchObject({ share: 0.25 });
    db.accounts.cx.consumed = 1_100_000;
    await expect((svc as any).resolveSurplusShare()).resolves.toMatchObject({ share: 0.4 });
  });

  it('couverture proportionnelle au poids du déficit dans le portefeuille', async () => {
    const db = makeDb();
    db.movements.push({ id: 'sm-1', kind: 'CONTRIBUTION', amount: 50_000, contractId: 'c9', createdAt: new Date() });
    const mkAcc = (cid: string, deficit: number, consumed: number) => {
      db.accounts[cid] = {
        id: `acc-${cid}`, contractId: cid, primeCollected: 100_000, primeBilled: 100_000,
        managementFees: 20_000, benefitBudget: 80_000, budgetBoost: 0,
        consumed, committed: 0, available: 80_000 - consumed, consumptionRatio: consumed / 80_000,
        provisionalResult: 80_000 - consumed, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit,
      };
    };
    mkAcc('c1', 40_000, 120_000);
    mkAcc('c3', 120_000, 200_000);
    const svc = makeService(db);
    // Fonds 50 000, déficit total 160 000 → c1 reçoit 50 000 × 40/160 = 12 500.
    const r = await (svc as any).coverDeficitFromSolidarity('c1', 'mgr1');
    expect(r.covered).toBe(12_500);
    expect(await (svc as any).solidarityBalance()).toBe(37_500);
  });

  it('stop-loss reconstituant : restaure le bassin d’alerte à 30 %', async () => {
    const db = makeDb();
    db.contracts.c1.product = { ctsConfig: JSON.stringify({ stopLoss: { threshold: 10_000, cap: 5_000 } }) };
    db.movements.push({ id: 'sm-1', kind: 'CONTRIBUTION', amount: 300_000, contractId: 'c9', createdAt: new Date() });
    db.accounts.c1 = {
      id: 'acc-1', contractId: 'c1', primeCollected: 100_000, primeBilled: 100_000,
      managementFees: 20_000, benefitBudget: 80_000, budgetBoost: 0,
      consumed: 70_000, committed: 0, available: 10_000, consumptionRatio: 0.875,
      provisionalResult: 10_000, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit: 0,
    };
    const svc = makeService(db);
    await (svc as any).checkStopLossAndAlert(
      'c1',
      { managementRate: 20, warnRatio: 50, alertRatio: 30, criticalRatio: 10, carryRate: 70, renewalMode: 'DEDUCT', stopLoss: { threshold: 10_000, cap: 5_000 } },
      70_000,
      0,
    );
    // Cible 30 % × 80 000 = 24 000, disponible 10 000 → don de 14 000.
    const coverage = db.movements.find((m: any) => m.kind === 'COVERAGE');
    expect(coverage?.amount).toBe(14_000);
    expect((await (svc as any).getAccount('c1')).available).toBe(24_000);
    expect(db.journal.some((j: any) => j.type === 'STOP_LOSS')).toBe(true);
  });

  it('reconstitution : les crédits de renouvellement sont suspendus sous le seuil', async () => {
    const db = makeDb();
    db.accounts.cx = {
      id: 'acc-x', contractId: 'cx', primeCollected: 1_000_000, primeBilled: 1_000_000,
      managementFees: 200_000, benefitBudget: 800_000, budgetBoost: 0,
      consumed: 0, committed: 0, available: 800_000, consumptionRatio: 0,
      provisionalResult: 800_000, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit: 0,
    };
    db.movements.push({ id: 'sm-1', kind: 'CONTRIBUTION', amount: 10_000, contractId: 'c9', createdAt: new Date() });
    db.closures.c1 = {
      id: 'cl-1', contractId: 'c1', status: 'CONFIRMED', renewalCredit: 28_000, mode: 'DEDUCT',
      finalConsumed: 0, finalCommitted: 0, surplus: 50_000, carryRate: 70,
    };
    const svc = makeService(db);
    // Solde 10 000 < 15 % × 1 000 000 → suspension.
    expect(await (svc as any).solidarityReplenishing()).toBe(true);
    await expect((svc as any).applyRenewalCredit('c1')).resolves.toMatchObject({ applied: false });
  });

  it('publie le ratio de solidarité du portefeuille', async () => {
    const db = makeDb();
    db.accounts.cx = {
      id: 'acc-x', contractId: 'cx', primeCollected: 1_000_000, primeBilled: 1_000_000,
      managementFees: 200_000, benefitBudget: 800_000, budgetBoost: 0,
      consumed: 0, committed: 0, available: 800_000, consumptionRatio: 0,
      provisionalResult: 800_000, primeUnpaid: 0, fundCallsTotal: 0, renewalCredit: 0, deficit: 0,
    };
    db.movements.push(
      { id: 'sm-1', kind: 'CONTRIBUTION', amount: 100_000, contractId: 'c9', createdAt: new Date() },
      { id: 'sm-2', kind: 'COVERAGE', amount: 20_000, contractId: 'c1', createdAt: new Date() },
    );
    const svc = makeService(db);
    const overview = await (svc as any).solidarityOverview();
    expect(overview.balance).toBe(80_000);
    expect(overview.totalCovered).toBe(20_000);
    expect(overview.totalContributed).toBe(100_000);
    expect(overview.solidarityRatio).toBeCloseTo(0.02);
    // 80 000 < 15 % des 1 000 000 encaissés → reconstitution active.
    expect(overview.replenishing).toBe(true);
    expect(overview.fundStatus).toBe('RECONSTITUTION');
    expect(overview.byMode.MUTUALITE.ratio).toBeCloseTo(0.02);
    expect(overview.byMode.INDIVIDUEL).toMatchObject({ covered: 0, ratio: 0 });
  });
});
