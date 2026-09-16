import { describe, expect, it, vi } from 'vitest';
import { CtsService } from '../src/modules/cts/cts.service';

// CtsService (phase 10/11) : backfill, journal immuable, recalcul, idempotence,
// contre-écritures, alertes de bandes. Prisma entièrement mocké.
// Règle d'or : les cumuls facturé/encaissé sont RECALCULÉS depuis les tables
// sources (échéancier, paiements) — jamais de double-compte possible.

interface Db {
  contracts: Record<string, any>;
  contributions: any[];
  payments: any[];
  claims: any[];
  accounts: Record<string, any>;
  journal: any[];
  alerts: any[];
}

function makeDb(): Db {
  return {
    contracts: {
      c1: { id: 'c1', premiumAnnual: 144_000, ctsOverride: null, product: { ctsConfig: '{}' } },
    },
    contributions: [],
    payments: [],
    claims: [],
    accounts: {},
    journal: [],
    alerts: [],
  };
}

function makePrisma(db: Db) {
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;
  const prisma: any = {
    contract: {
      findUnique: vi.fn(async ({ where }: any) => db.contracts[where.id] ?? null),
    },
    contribution: {
      findMany: vi.fn(async ({ where }: any) => db.contributions.filter(c => c.contractId === where.contractId)),
    },
    payment: {
      findMany: vi.fn(async ({ where }: any) =>
        db.payments.filter(p => p.contractId === where.contractId && (where.status === undefined || p.status === where.status)),
      ),
    },
    claim: {
      findMany: vi.fn(async ({ where }: any) => db.claims.filter(c => c.contractId === where.contractId)),
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
      findFirst: vi.fn(async ({ where }: any) =>
        db.journal.find(j => j.contractId === where.contractId && j.type === where.type && j.reference === where.reference) ?? null,
      ),
      findMany: vi.fn(async ({ where }: any) =>
        db.journal.filter(j =>
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
        db.alerts.filter(a => (where.contractId === undefined || a.contractId === where.contractId) && (where.status === undefined || a.status === where.status)),
      ),
      create: vi.fn(async ({ data }: any) => {
        const a = { id: id('al'), createdAt: new Date(), ...data };
        db.alerts.push(a);
        return a;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const a of db.alerts) {
          const matchContract = where.contractId === undefined || a.contractId === where.contractId;
          const matchStatus = where.status === undefined || a.status === where.status;
          const matchIds = where.id === undefined || (where.id.in ? where.id.in.includes(a.id) : a.id === where.id);
          if (matchContract && matchStatus && matchIds) {
            Object.assign(a, data);
            count++;
          }
        }
        return { count };
      }),
    },
    $queryRaw: vi.fn(async () => []),
    $transaction: undefined as any,
  } as any;
  prisma.$transaction = async (cb: any) => cb(prisma);
  return prisma;
}

function makeService(db: Db) {
  const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
  const svc = new CtsService(makePrisma(db), dispatch);
  (svc as any).__dispatch = dispatch;
  return svc;
}

function dispatched(svc: any) {
  return (svc as any).__dispatch;
}

function seedCotisation(db: Db, amount: number, adhesionFee = 0) {
  db.payments.push({
    contractId: 'c1', status: 'SUCCEEDED', amount,
    meta: JSON.stringify({ contributionId: 'contrib-1', adhesionFee }),
  });
}

describe('backfill (ensureAccount)', () => {
  it('reconstruit les cumuls depuis contrat, échéancier et sinistres', async () => {
    const db = makeDb();
    db.contributions = Array.from({ length: 12 }, (_, i) => ({
      contractId: 'c1', amount: 12_000, status: i < 4 ? 'PAID' : 'PENDING',
    }));
    db.claims = [
      { contractId: 'c1', status: 'PAID', totalApproved: 5_000 },
      { contractId: 'c1', status: 'APPROVED', totalApproved: 2_000 },
      { contractId: 'c1', status: 'SUBMITTED', totalApproved: 9_999 },
    ];
    const svc = makeService(db);
    const acc = await svc.ensureAccount('c1');
    expect(acc.primeSubscribed).toBe(144_000);
    expect(acc.primeBilled).toBe(144_000);
    expect(acc.primeCollected).toBe(48_000);
    expect(acc.managementFees).toBe(9_600);
    expect(acc.benefitBudget).toBe(38_400);
    expect(acc.consumed).toBe(5_000);
    expect(acc.committed).toBe(2_000);
    expect(acc.available).toBe(31_400);
    expect(acc.provisionalResult).toBe(31_400);
    expect(acc.primeUnpaid).toBe(96_000);
    expect(acc.deficit).toBe(0);
    // Ajustement de reconstruction + ancrage de souscription (anti double-compte)
    expect(db.journal.filter(j => j.type === 'AJUSTEMENT')).toHaveLength(1);
    expect(db.journal.filter(j => j.type === 'PRIME' && j.reference === 'Contract:c1:subscribed')).toHaveLength(1);
  });

  it('idempotent : ne recrée pas si le compte existe', async () => {
    const db = makeDb();
    const svc = makeService(db);
    await svc.ensureAccount('c1');
    await svc.ensureAccount('c1');
    expect(Object.keys(db.accounts)).toHaveLength(1);
  });

  it('contrat inconnu → 404', async () => {
    const svc = makeService(makeDb());
    await expect(svc.ensureAccount('nope')).rejects.toThrow();
  });
});

describe('primes (recordPrime*)', () => {
  it('souscription déjà ancrée au backfill : rappel ignoré, pas de double', async () => {
    const db = makeDb();
    db.contributions = Array.from({ length: 12 }, () => ({ contractId: 'c1', amount: 12_000, status: 'PENDING' }));
    const svc = makeService(db);
    const r = await svc.recordPrimeSubscribed('c1', 144_000, {});
    expect(r.deduped).toBe(true);
    expect((await svc.getAccount('c1')).primeSubscribed).toBe(144_000);
  });

  it('facturé recalculé depuis l’échéancier (12 × 12 000)', async () => {
    const db = makeDb();
    db.contributions = Array.from({ length: 12 }, () => ({ contractId: 'c1', amount: 12_000, status: 'PENDING' }));
    const svc = makeService(db);
    await svc.recordPrimeBilled('c1', {});
    const acc = await svc.getAccount('c1');
    expect(acc.primeBilled).toBe(144_000);
    expect(acc.primeUnpaid).toBe(144_000);
    expect(acc.available).toBe(0);
    // Second appel : aucun changement, aucune écriture
    const again = await svc.recordPrimeBilled('c1', {});
    expect(again.changed).toBe(false);
    expect(db.journal.filter(j => j.type === 'PRIME' && JSON.parse(j.meta).kind === 'billed')).toHaveLength(1);
  });

  it('encaissé : PRIME + FRAIS + BUDGET chaînés avec balances', async () => {
    const db = makeDb();
    const svc = makeService(db);
    seedCotisation(db, 12_000);
    await svc.recordPrimeCollected('c1', { reference: 'Payment:p1' });
    const acc = await svc.getAccount('c1');
    expect(acc.primeCollected).toBe(12_000);
    expect(acc.managementFees).toBe(2_400);
    expect(acc.benefitBudget).toBe(9_600);
    expect(acc.available).toBe(9_600);
    const chain = db.journal.filter(j => ['PRIME', 'FRAIS', 'BUDGET'].includes(j.type) && j.reference === 'Payment:p1');
    expect(chain.map(j => j.type)).toEqual(['PRIME', 'FRAIS', 'BUDGET']);
    expect(chain[0].oldBalance).toBe(0);
    expect(chain[0].newBalance).toBe(9_600);
    expect(chain[1].amount).toBe(2_400);
    expect(chain[2].amount).toBe(9_600);
  });

  it('adhésion exclue de l’encaissé (meta), second appel sans effet', async () => {
    const db = makeDb();
    const svc = makeService(db);
    db.payments.push({ contractId: 'c1', status: 'SUCCEEDED', amount: 15_000, meta: JSON.stringify({ contributionId: 'x', adhesionFee: 3_000 }) });
    await svc.recordPrimeCollected('c1', {});
    expect((await svc.getAccount('c1')).primeCollected).toBe(12_000);
    const again = await svc.recordPrimeCollected('c1', {});
    expect(again.changed).toBe(false);
  });
});

describe('engagement idempotent', () => {
  it('deuxième appel pour le même sinistre : ignoré (deduped)', async () => {
    const db = makeDb();
    const svc = makeService(db);
    seedCotisation(db, 12_000);
    await svc.recordPrimeCollected('c1', {});
    const r1 = await svc.recordEngagement('c1', 'claim1', 2_000, {});
    expect(r1.deduped).toBe(false);
    const r2 = await svc.recordEngagement('c1', 'claim1', 2_000, {});
    expect(r2.deduped).toBe(true);
    const acc = await svc.getAccount('c1');
    expect(acc.committed).toBe(2_000);
    expect(db.journal.filter(j => j.type === 'ENGAGEMENT')).toHaveLength(1);
    expect(acc.available).toBe(7_600);
  });

  it('montant nul : ignoré', async () => {
    const db = makeDb();
    const svc = makeService(db);
    await svc.recordEngagement('c1', 'claim1', 0, {});
    expect(db.journal.filter(j => j.type === 'ENGAGEMENT')).toHaveLength(0);
  });
});

describe('consommation et contre-écriture', () => {
  it('consommation libère l’engagement (borné à 0)', async () => {
    const db = makeDb();
    const svc = makeService(db);
    seedCotisation(db, 12_000);
    await svc.recordPrimeCollected('c1', {});
    await svc.recordEngagement('c1', 'claim1', 2_000, {});
    await svc.recordConsumption('c1', 'claim1', 2_000, {});
    const acc = await svc.getAccount('c1');
    expect(acc.consumed).toBe(2_000);
    expect(acc.committed).toBe(0);
    // Seconde consommation du même sinistre : ignorée
    await svc.recordConsumption('c1', 'claim1', 2_000, {});
    expect((await svc.getAccount('c1')).consumed).toBe(2_000);
  });

  it('consommation sans engagement préalable : committed reste à 0', async () => {
    const db = makeDb();
    const svc = makeService(db);
    seedCotisation(db, 12_000);
    await svc.recordPrimeCollected('c1', {});
    await svc.recordConsumption('c1', 'claimX', 3_000, {});
    const acc = await svc.getAccount('c1');
    expect(acc.consumed).toBe(3_000);
    expect(acc.committed).toBe(0);
  });

  it('reversal : annule le reste engagé, jamais le consommé ; double reversal = 0', async () => {
    const db = makeDb();
    const svc = makeService(db);
    seedCotisation(db, 50_000);
    await svc.recordPrimeCollected('c1', {});
    await svc.recordEngagement('c1', 'claim1', 5_000, {});
    await svc.recordConsumption('c1', 'claim1', 2_000, {});
    const r1 = await svc.recordReversal('c1', 'claim1', 'TTL_EXPIRED', {});
    expect(r1.reversed).toBe(3_000);
    const acc = await svc.getAccount('c1');
    expect(acc.committed).toBe(0);
    expect(acc.consumed).toBe(2_000);
    const r2 = await svc.recordReversal('c1', 'claim1', 'TTL_EXPIRED', {});
    expect(r2.reversed).toBe(0);
    expect(db.journal.filter(j => j.type === 'ANNULATION')).toHaveLength(1);
  });
});

describe('bandes et alertes', () => {
  it('compte vide : NORMAL silencieux (pas d’alerte sur contrat sans budget)', async () => {
    const db = makeDb();
    const svc = makeService(db);
    const band = await svc.evaluateBands('c1');
    expect(band).toBe('NORMAL');
    expect(db.alerts).toHaveLength(0);
  });

  it('dégradation → alerte dédupliquée ; retour NORMAL → résolue', async () => {
    const db = makeDb();
    const svc = makeService(db);
    seedCotisation(db, 10_000);
    await svc.recordPrimeCollected('c1', {});
    await svc.recordConsumption('c1', 'k1', 7_500, {}); // dispo 500 (6,25%) → CRITIQUE
    const open = db.alerts.filter(a => a.status === 'OPEN');
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ type: 'CRITIQUE', severity: 'CRITICAL' });
    // Pas de doublon à la mutation suivante
    await svc.recordEngagement('c1', 'k2', 100, {});
    expect(db.alerts.filter(a => a.status === 'OPEN')).toHaveLength(1);
    // Retour au vert : résolue (auto-guérison par recalcul)
    seedCotisation(db, 100_000);
    await svc.recordPrimeCollected('c1', {});
    expect(db.alerts.filter(a => a.status === 'OPEN')).toHaveLength(0);
    expect(db.alerts.every(a => a.status === 'RESOLVED')).toBe(true);
  });
});

// ─── Écart P0 ② : recordEngagement 100 % transactionnel ───────────────────
// Propriétés prouvées : (1) toutes les écritures passent par le client de
// transaction fourni, (2) verrou FOR UPDATE émis avant le read-modify-write,
// (3) auto-transaction quand aucun tx n'est fourni, (4) les écritures
// d'alerte/stop-loss partagent le même client tx (annulées avec le rollback).

function makeServiceOn(db: Db, prisma: any) {
  const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
  return new CtsService(prisma, dispatch);
}

describe('recordEngagement transactionnel (P0 ②)', () => {
  it('propage le tx de l’appelant à TOUTES les écritures (compte, journal, alertes)', async () => {
    const db = makeDb();
    const prisma = makePrisma(db);
    const svc = makeServiceOn(db, prisma);
    seedCotisation(db, 12_000);
    await svc.recordPrimeCollected('c1', {});

    // Preuve forte : on empoisonne TOUTES les écritures du client GLOBAL.
    // Si la moindre écriture échappait au tx, recordEngagement échouerait.
    const real = {
      taUpdate: prisma.technicalAccount.update.getMockImplementation() ?? prisma.technicalAccount.update,
      jCreate: prisma.ctsJournal.create.getMockImplementation() ?? prisma.ctsJournal.create,
      aCreate: prisma.ctsAlert.create.getMockImplementation() ?? prisma.ctsAlert.create,
      aUpdMany: prisma.ctsAlert.updateMany.getMockImplementation() ?? prisma.ctsAlert.updateMany,
    };
    prisma.technicalAccount.update.mockImplementation(async () => { throw new Error('ESCAPED: technicalAccount.update hors tx'); });
    prisma.ctsJournal.create.mockImplementation(async () => { throw new Error('ESCAPED: ctsJournal.create hors tx'); });
    prisma.ctsAlert.create.mockImplementation(async () => { throw new Error('ESCAPED: ctsAlert.create hors tx'); });
    prisma.ctsAlert.updateMany.mockImplementation(async () => { throw new Error('ESCAPED: ctsAlert.updateMany hors tx'); });

    const calls: string[] = [];
    const tx: any = {
      contract: { findUnique: (a: any) => prisma.contract.findUnique(a) },
      technicalAccount: {
        findUnique: (a: any) => prisma.technicalAccount.findUnique(a),
        update: async (a: any) => { calls.push('ta.update'); return real.taUpdate(a); },
      },
      claim: { findMany: (a: any) => prisma.claim.findMany(a) },
      ctsJournal: {
        findFirst: (a: any) => prisma.ctsJournal.findFirst(a),
        findMany: (a: any) => prisma.ctsJournal.findMany(a),
        create: async (a: any) => { calls.push('journal.create'); return real.jCreate(a); },
      },
      ctsAlert: {
        findMany: (a: any) => prisma.ctsAlert.findMany(a),
        updateMany: async (a: any) => { calls.push('alert.updateMany'); return real.aUpdMany(a); },
        create: async (a: any) => { calls.push('alert.create'); return real.aCreate(a); },
      },
      solidarityMovement: { create: async (a: any) => { calls.push('solidarity.create'); return {}; } },
      $queryRaw: (...a: any[]) => { calls.push('lock'); return prisma.$queryRaw(...a); },
    };

    try {
      const r = await svc.recordEngagement('c1', 'claimT', 2_000, { tx });
      expect(r.account.committed).toBe(2_000);
    } finally {
      prisma.technicalAccount.update.mockImplementation(real.taUpdate);
      prisma.ctsJournal.create.mockImplementation(real.jCreate);
      prisma.ctsAlert.create.mockImplementation(real.aCreate);
      prisma.ctsAlert.updateMany.mockImplementation(real.aUpdMany);
    }
    expect(calls).toContain('ta.update');
    expect(calls).toContain('journal.create');
    expect(calls).toContain('lock');
    expect(db.journal.filter(j => j.type === 'ENGAGEMENT')).toHaveLength(1);
  });

  it('émet SELECT … FOR UPDATE avant le read-modify-write du compte', async () => {
    const db = makeDb();
    const prisma = makePrisma(db);
    const svc = makeServiceOn(db, prisma);
    seedCotisation(db, 12_000);
    await svc.recordPrimeCollected('c1', {});

    const order: string[] = [];
    (prisma.technicalAccount.update as any).mockImplementation(async (a: any) => {
      order.push('update');
      const acc = Object.values(db.accounts).find((x: any) => x.id === a.where.id);
      Object.assign(acc, a.data);
      return acc;
    });
    (prisma.$queryRaw as any).mockImplementation(async (q: any) => {
      order.push(String(q).includes('FOR UPDATE') ? 'lock' : 'query-other');
      return [];
    });
    await svc.recordEngagement('c1', 'claimL', 1_000, {});
    expect(order).toContain('lock');
    expect(order).toContain('update');
    expect(order.indexOf('lock')).toBeLessThan(order.indexOf('update'));
  });

  it('sans tx fourni : s’auto-transactionnalise ($transaction appelé)', async () => {
    const db = makeDb();
    const prisma = makePrisma(db);
    const svc = makeServiceOn(db, prisma);
    seedCotisation(db, 12_000);
    await svc.recordPrimeCollected('c1', {});

    let txCalls = 0;
    prisma.$transaction = async (cb: any) => { txCalls++; return cb(prisma); };
    await svc.recordEngagement('c1', 'claimS', 1_000, {});
    expect(txCalls).toBe(1);
    expect(db.journal.filter(j => j.type === 'ENGAGEMENT')).toHaveLength(1);
  });

  it('échec du tx de l’appelant : l’alerte CRITIQUE créée pendant le tx meurt avec lui (client partagé)', async () => {
    const db = makeDb();
    const prisma = makePrisma(db);
    const svc = makeServiceOn(db, prisma);
    seedCotisation(db, 10_000);
    await svc.recordPrimeCollected('c1', {});
    await svc.recordConsumption('c1', 'k1', 7_500, {}); // dispo 500 → bande CRITIQUE

    const txWrites: string[] = [];
    const tx: any = new Proxy(prisma, {
      get(target: any, prop: string) {
        if (prop === '$queryRaw') return target.$queryRaw;
        if (target[prop] && typeof target[prop] === 'object') {
          return new Proxy(target[prop], {
            get(m: any, op: string) {
              return async (...a: any[]) => {
                if (['create', 'update', 'updateMany'].includes(op)) txWrites.push(`${prop}.${op}`);
                return m[op](...a);
              };
            },
          });
        }
        return target[prop];
      },
    });
    await svc.recordEngagement('c1', 'claimA', 100, { tx });
    // Structurellement : alerte (si créée) et compte/journal partagent le tx ⇒ rollback global.
    expect(txWrites).toContain('technicalAccount.update');
    expect(txWrites.every(w => w.startsWith('technicalAccount') || w.startsWith('ctsJournal') || w.startsWith('ctsAlert') || w.startsWith('solidarityMovement'))).toBe(true);
  });
});
