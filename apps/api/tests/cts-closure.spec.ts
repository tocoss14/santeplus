import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CtsService } from '../src/modules/cts/cts.service';
import { ContractsService } from '../src/modules/contracts/contracts.controller';

// P15/16 : clôture, crédit de renouvellement, stop-loss, application au renouvellement.

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
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        const rows = db.contributions.filter(
          (c: any) => c.contractId === where.contractId && (!where.status || where.status.in.includes(c.status)),
        );
        rows.sort((a: any, b: any) => (orderBy?.sequence === 'desc' ? b.sequence - a.sequence : a.sequence - b.sequence));
        return rows[0] ?? null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = db.contributions.find((c: any) => c.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      count: vi.fn(async ({ where }: any) =>
        db.contributions.filter((c: any) => c.contractId === where.contractId && c.status === where.status).length,
      ),
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
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  } as any;
}

function makeService(db: any) {
  const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
  return new CtsService(makePrisma(db), dispatch);
}

function seedFunded(db: any) {
  // Encaissé 100 000 via échéancier soldé (budget 80 000), consommé 30 000, engagé 0.
  // Note : le backfill lit les CONTRIBUTIONS, pas les paiements.
  db.contributions.push({ id: 'contrib-1', contractId: 'c1', sequence: 1, amount: 100_000, status: 'PAID' });
  db.claims.push({ contractId: 'c1', status: 'PAID', totalApproved: 30_000 });
}

describe('closeContract (§19)', () => {
  it('EXPIRED : DRAFT avec excédent, part solidarité dynamique puis crédit du reliquat', async () => {
    const db = makeDb();
    seedFunded(db);
    const svc = makeService(db);
    const closed = await (svc as any).closeContract('c1', 'mgr1');
    // budget 80 000 − consommé 30 000 = excédent 50 000 ; portefeuille sans
    // sinistralité → part basse 15 % → solidarité 7 500,
    // crédit 70 % du reliquat 42 500 = 29 750
    expect(closed.status).toBe('DRAFT');
    expect(closed.finalConsumed).toBe(30_000);
    expect(closed.finalCommitted).toBe(0);
    expect(closed.surplus).toBe(50_000);
    expect(closed.carryRate).toBe(70);
    expect(closed.solidarityShare).toBe(0.15);
    expect(closed.solidarityContribution).toBe(7_500);
    expect(closed.renewalCredit).toBe(29_750);
    expect(closed.mode).toBe('DEDUCT');
  });

  it('contrat ACTIVE : refusé (fin de contrat requise)', async () => {
    const db = makeDb();
    db.contracts.c1.status = 'ACTIVE';
    const svc = makeService(db);
    await expect((svc as any).closeContract('c1')).rejects.toThrow(BadRequestException);
  });

  it('re-close : DRAFT recomputé, CONFIRMED bloque', async () => {
    const db = makeDb();
    seedFunded(db);
    const svc = makeService(db);
    await (svc as any).closeContract('c1');
    // Nouveau sinistre soldé APRÈS la première clôture (via le flux normal) :
    // la re-clôture doit le refléter (consommé 30k → 40k).
    await (svc as any).recordConsumption('c1', 'k-extra', 10_000, {});
    const again = await (svc as any).closeContract('c1');
    expect(again.status).toBe('DRAFT');
    expect(again.surplus).toBe(40_000);
    expect(again.solidarityContribution).toBe(6_000);
    expect(again.renewalCredit).toBe(23_800);
    await (svc as any).confirmClosure(again.id);
    await expect((svc as any).closeContract('c1')).rejects.toThrow(BadRequestException);
  });
});

describe('confirmClosure', () => {
  it('DRAFT → CONFIRMED : journal + crédit au compte, double confirm rejetée', async () => {
    const db = makeDb();
    seedFunded(db);
    const svc = makeService(db);
    const closed = await (svc as any).closeContract('c1');
    const confirmed = await (svc as any).confirmClosure(closed.id);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.closedAt).toBeTruthy();
    expect((await (svc as any).getAccount('c1')).renewalCredit).toBe(29_750);
    expect(db.journal.some((j: any) => j.type === 'CREDIT_RENOUVELLEMENT' && j.amount === 29_750)).toBe(true);
    await expect((svc as any).confirmClosure(closed.id)).rejects.toThrow(BadRequestException);
  });

  it('déficit : crédit 0 mais clôture documentée', async () => {
    const db = makeDb();
    seedFunded(db);
    db.claims.push({ contractId: 'c1', status: 'PAID', totalApproved: 100_000 });
    const svc = makeService(db);
    const closed = await (svc as any).closeContract('c1');
    expect(closed.surplus).toBe(0);
    expect(closed.renewalCredit).toBe(0);
  });
});

describe('stop-loss (§22)', () => {
  function slDb() {
    const db = makeDb();
    db.contracts.c1.product = { ctsConfig: JSON.stringify({ stopLoss: { threshold: 10_000, cap: 5_000 } }) };
    db.payments.push({ contractId: 'c1', status: 'SUCCEEDED', amount: 100_000, meta: JSON.stringify({ contributionId: 'x' }) });
    return db;
  }

  it('franchissement → écriture STOP_LOSS + alerte CRITIQUE, sans doublon', async () => {
    const db = slDb();
    const svc = makeService(db);
    await svc.recordPrimeCollected('c1', {});
    await svc.recordConsumption('c1', 'k1', 9_000, {});
    expect(db.journal.filter((j: any) => j.type === 'STOP_LOSS')).toHaveLength(0);
    await svc.recordConsumption('c1', 'k2', 2_000, {}); // exposition 11 000 > 10 000
    const entries = db.journal.filter((j: any) => j.type === 'STOP_LOSS');
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(1_000);
    expect(db.alerts.some((a: any) => a.type === 'CRITIQUE' && a.status === 'OPEN' && JSON.parse(a.payload).stopLoss === true)).toBe(true);
    // Toujours au-dessus : pas de nouvelle écriture ni alerte
    await svc.recordConsumption('c1', 'k3', 500, {});
    expect(db.journal.filter((j: any) => j.type === 'STOP_LOSS')).toHaveLength(1);
  });

  it('payout plafonné au cap', async () => {
    const db = slDb();
    const svc = makeService(db);
    await svc.recordPrimeCollected('c1', {});
    await svc.recordConsumption('c1', 'k1', 50_000, {});
    const entries = db.journal.filter((j: any) => j.type === 'STOP_LOSS');
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(5_000);
  });
});

describe('applyRenewalCredit (§20)', () => {
  function closedDb(mode: string, credit: number) {
    const db = makeDb();
    db.contributions = [{ id: 'contrib-9', contractId: 'c1', sequence: 13, amount: 144_000, status: 'PENDING', dueDate: new Date() }];
    db.closures.c1 = {
      id: 'cl-1', contractId: 'c1', status: 'CONFIRMED', renewalCredit: credit, mode,
      finalConsumed: 0, finalCommitted: 0, surplus: 0, carryRate: 70,
    };
    return db;
  }

  it('DEDUCT : escompte la nouvelle échéance (plancher 0, reliquat tracé)', async () => {
    const db = closedDb('DEDUCT', 35_000);
    const svc = makeService(db);
    const r = await (svc as any).applyRenewalCredit('c1');
    expect(r.applied).toBe(true);
    expect(r.discount).toBe(35_000);
    expect(db.contributions[0].amount).toBe(109_000);
    expect(db.journal.some((j: any) => j.type === 'CREDIT_RENOUVELLEMENT' && j.amount === 35_000)).toBe(true);
    // Rejeu : déjà appliqué
    const replay = await (svc as any).applyRenewalCredit('c1');
    expect(replay.applied).toBe(false);
  });

  it('DEDUCT plafonné : reliquat documenté en meta', async () => {
    const db = closedDb('DEDUCT', 200_000);
    const svc = makeService(db);
    const r = await (svc as any).applyRenewalCredit('c1');
    expect(r.discount).toBe(144_000);
    expect(db.contributions[0].amount).toBe(0);
  });

  it('BUDGET_BOOST : augmente le boost persistant et le disponible', async () => {
    const db = closedDb('BUDGET_BOOST', 35_000);
    const svc = makeService(db);
    const before = await (svc as any).ensureAccount('c1');
    expect(before.available).toBe(0);
    const r = await (svc as any).applyRenewalCredit('c1');
    expect(r.applied).toBe(true);
    expect(r.budgetBoost).toBe(35_000);
    expect((await (svc as any).getAccount('c1')).available).toBe(35_000);
  });

  it('sans clôture confirmée : rien', async () => {
    const db = makeDb();
    const svc = makeService(db);
    expect((await (svc as any).applyRenewalCredit('c1')).applied).toBe(false);
  });
});

describe('renew + crédit (ContractsService)', () => {
  it('le renouvellement applique le crédit DEDUCT à la nouvelle échéance', async () => {
    const db = makeDb();
    db.contracts.c1.status = 'ACTIVE';
    db.contracts.c1.premiumAnnual = 144_000;
    db.contracts.c1.endDate = new Date('2020-01-01');
    db.closures.c1 = {
      id: 'cl-1', contractId: 'c1', status: 'CONFIRMED', renewalCredit: 35_000, mode: 'DEDUCT',
      finalConsumed: 0, finalCommitted: 0, surplus: 50_000, carryRate: 70,
    };
    const prisma: any = {
      contract: {
        findUnique: async ({ where }: any) => {
          const c = db.contracts[where.id] ?? null;
          if (!c) return null;
          return { ...c, contributions: db.contributions.filter((x: any) => x.contractId === c.id) };
        },
        update: async ({ where, data }: any) => {
          Object.assign(db.contracts[where.id], data);
          return db.contracts[where.id];
        },
      },
      $transaction: async (cb: any) =>
        cb({
          contribution: {
            createMany: async ({ data }: any) => {
              data.forEach((row: any, i: number) =>
                db.contributions.push({ id: `nc-${i}`, status: 'PENDING', ...row }),
              );
              return { count: data.length };
            },
          },
          contract: {
            update: async ({ where, data }: any) => {
              Object.assign(db.contracts[where.id], data);
              return db.contracts[where.id];
            },
          },
        }),
    };
    // Complète avec les mocks CTS (journal, alertes, compte, clôtures, sinistres)
    let seq = 0;
    const nid = (p: string) => `${p}-${++seq}`;
    Object.assign(prisma, {
      contribution: {
        findMany: async ({ where }: any) => db.contributions.filter((c: any) => c.contractId === where.contractId),
        findFirst: async ({ where, orderBy }: any) => {
          const rows = db.contributions.filter(
            (c: any) => c.contractId === where.contractId && (!where.status || where.status.in.includes(c.status)),
          );
          rows.sort((a: any, b: any) => (orderBy?.sequence === 'desc' ? b.sequence - a.sequence : a.sequence - b.sequence));
          return rows[0] ?? null;
        },
        update: async ({ where, data }: any) => {
          const row = db.contributions.find((c: any) => c.id === where.id);
          Object.assign(row, data);
          return row;
        },
        count: async () => 0,
      },
      technicalAccount: {
        findUnique: async ({ where }: any) => db.accounts[where.contractId] ?? null,
        create: async ({ data }: any) => {
          const acc = { id: nid('acc'), ...data };
          db.accounts[data.contractId] = acc;
          return acc;
        },
        update: async ({ where, data }: any) => {
          const acc = Object.values(db.accounts).find((a: any) => a.id === where.id);
          Object.assign(acc, data);
          return acc;
        },
      },
      ctsJournal: {
        findFirst: async ({ where, orderBy }: any) => {
          const rows = db.journal.filter((j: any) =>
            (where.contractId === undefined || j.contractId === where.contractId) &&
            (where.reference === undefined || j.reference === where.reference) &&
            (where.type === undefined || (where.type.in ? where.type.in.includes(j.type) : j.type === where.type)),
          );
          if (orderBy?.createdAt === 'desc') rows.reverse();
          return rows[0] ?? null;
        },
        findMany: async ({ where }: any) =>
          db.journal.filter((j: any) =>
            (where.contractId === undefined || j.contractId === where.contractId) &&
            (where.reference === undefined || j.reference === where.reference) &&
            (where.type === undefined || (where.type.in ? where.type.in.includes(j.type) : j.type === where.type)),
          ),
        create: async ({ data }: any) => {
          const e = { id: nid('j'), date: new Date(), createdAt: new Date(), ...data };
          db.journal.push(e);
          return e;
        },
      },
      ctsAlert: {
        findMany: async ({ where }: any) =>
          db.alerts.filter((a: any) => (where.contractId === undefined || a.contractId === where.contractId) && (where.status === undefined || a.status === where.status)),
        create: async ({ data }: any) => {
          const a = { id: nid('al'), createdAt: new Date(), ...data };
          db.alerts.push(a);
          return a;
        },
        updateMany: async ({ where, data }: any) => {
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
        },
      },
      contractClosure: {
        findUnique: async ({ where }: any) => {
          if (where.contractId) return db.closures[where.contractId] ?? null;
          return Object.values(db.closures).find((c: any) => c.id === where.id) ?? null;
        },
        create: async ({ data }: any) => {
          const c = { id: nid('cl'), ...data };
          db.closures[data.contractId] = c;
          return c;
        },
        update: async ({ where, data }: any) => {
          const c = Object.values(db.closures).find((x: any) => x.id === where.id);
          Object.assign(c, data);
          return c;
        },
      },
      claim: { findMany: async () => [] },
      payment: { findMany: async () => [] },
      fundCall: { findUnique: async () => null, create: async () => ({}), update: async () => ({}) },
    });
    const dispatch: any = { dispatchToUser: async () => ({}), dispatchToMany: async () => ({}) };
    const cts = new CtsService(prisma, dispatch);
    const svc = new ContractsService(prisma, cts as any);
    const auth: any = { id: 'admin', role: 'SUPER_ADMIN', companyId: null, providerId: null };
    const res: any = await svc.renew(auth, 'c1');
    expect(res.ok).toBe(true);
    expect(res.renewalApplied.applied).toBe(true);
    const due = db.contributions.find((c: any) => c.status === 'PENDING');
    expect(due.amount).toBe(109_000);
  });
});
