import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CtsService } from '../src/modules/cts/cts.service';

// Appels de fonds §16 + réactivation §17. Prisma entièrement mocké.

interface Db {
  contracts: Record<string, any>;
  contributions: any[];
  payments: any[];
  claims: any[];
  accounts: Record<string, any>;
  journal: any[];
  alerts: any[];
  fundCalls: Record<string, any>;
}

function makeDb(): Db {
  return {
    contracts: {
      c1: { id: 'c1', premiumAnnual: 144_000, status: 'ACTIVE', principalUserId: 'u1', ctsOverride: null, product: { ctsConfig: '{}' } },
    },
    contributions: [],
    payments: [],
    claims: [],
    accounts: {},
    journal: [],
    alerts: [],
    fundCalls: {},
  };
}

function makePrisma(db: Db) {
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
      findMany: vi.fn(async ({ where }: any) => db.contributions.filter(c => c.contractId === where.contractId)),
      count: vi.fn(async ({ where }: any) =>
        db.contributions.filter(c => c.contractId === where.contractId && c.status === where.status).length,
      ),
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
    fundCall: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const fc = db.fundCalls[where.id] ?? null;
        if (!fc) return null;
        if (include?.contract) return { ...fc, contract: { principalUserId: 'u1', number: 'CTR-1' } };
        return fc;
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
    },
  } as any;
}

function makeService(db: Db) {
  const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
  const svc = new CtsService(makePrisma(db), dispatch);
  (svc as any).__dispatch = dispatch;
  return svc;
}

async function exhaustedAccount(db: Db) {
  // Budget 8000, consommé 7500 → dispo 500 (CRITIQUE)
  const svc = makeService(db);
  db.payments.push({ contractId: 'c1', status: 'SUCCEEDED', amount: 10_000, meta: JSON.stringify({ contributionId: 'x' }) });
  await svc.recordPrimeCollected('c1', {});
  await svc.recordConsumption('c1', 'k1', 7_500, {});
  return svc;
}

describe('proposeFundCall (§16)', () => {
  it('défaut : cible = budget, recommandé = cible − dispo', async () => {
    const db = makeDb();
    const svc = await exhaustedAccount(db);
    const { fundCall, proposal } = await (svc as any).proposeFundCall('c1', {});
    expect(proposal.amount).toBe(7_500);
    expect(proposal.recommended).toBe(7_500);
    expect(fundCall.targetAmount).toBe(8_000);
    expect(fundCall.chosenAmount).toBe(7_500);
    expect(fundCall.status).toBe('DRAFT');
  });

  it('cible explicite + minimum + choisi', async () => {
    const db = makeDb();
    const svc = await exhaustedAccount(db);
    const { fundCall } = await (svc as any).proposeFundCall(
      'c1',
      { target: 8_000, minimum: 1_000, chosenAmount: 5_000 },
      'mgr1',
    );
    expect(fundCall.minimum).toBe(1_000);
    expect(fundCall.chosenAmount).toBe(5_000);
  });

  it('sans objet (dispo ≥ cible) ou choisi nul → 400', async () => {
    const db = makeDb();
    const svc = makeService(db);
    db.payments.push({ contractId: 'c1', status: 'SUCCEEDED', amount: 100_000, meta: JSON.stringify({ contributionId: 'x' }) });
    await svc.recordPrimeCollected('c1', {});
    await expect((svc as any).proposeFundCall('c1', {})).rejects.toThrow(BadRequestException);
    await expect((svc as any).proposeFundCall('c1', { target: 1_000, chosenAmount: 0 })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('send/cancel', () => {
  it('DRAFT → SENT : facture APF-*, échéance, notif, alerte', async () => {
    const db = makeDb();
    const svc = await exhaustedAccount(db);
    const { fundCall } = await (svc as any).proposeFundCall('c1', {});
    const sent = await (svc as any).sendFundCall(fundCall.id);
    expect(sent.status).toBe('SENT');
    expect(sent.invoiceNumber).toMatch(/^APF-/);
    expect(sent.dueDate).toBeTruthy();
    expect((svc as any).__dispatch.dispatchToUser).toHaveBeenCalled();
    expect(db.alerts.some(a => a.type === 'APPEL_FONDS' && a.status === 'OPEN')).toBe(true);
    await expect((svc as any).sendFundCall(fundCall.id)).rejects.toThrow(BadRequestException);
  });

  it('cancel DRAFT/SENT → CANCELLED, jamais après paiement', async () => {
    const db = makeDb();
    const svc = await exhaustedAccount(db);
    const { fundCall } = await (svc as any).proposeFundCall('c1', {});
    expect((await (svc as any).cancelFundCall(fundCall.id)).status).toBe('CANCELLED');
    db.fundCalls[fundCall.id].status = 'PAID';
    await expect((svc as any).cancelFundCall(fundCall.id)).rejects.toThrow(BadRequestException);
  });
});

describe('recordFundPayment + réactivation (§17)', () => {
  it('chaîne complète : PAID, crédit CTS, alertes soldées, réactivation', async () => {
    const db = makeDb();
    db.contracts.c1.status = 'SUSPENDED';
    const svc = await exhaustedAccount(db);
    const { fundCall } = await (svc as any).proposeFundCall('c1', {});
    await (svc as any).sendFundCall(fundCall.id);
    // dispo avant : 500 ; appel choisi 7500
    const r = await (svc as any).recordFundPayment('c1', fundCall.id, { id: 'pay1', amount: 7_500, reference: 'PAY-1' }, 'mgr1');
    expect(r.fundCall.status).toBe('PAID');
    expect(r.reactivated).toBe(true);
    expect(db.contracts.c1.status).toBe('ACTIVE');
    const acc = await (svc as any).getAccount('c1');
    expect(acc.fundCallsTotal).toBe(7_500);
    expect(acc.primeCollected).toBe(17_500);
    expect(db.journal.some(j => j.type === 'PAIEMENT' && j.amount === 7_500)).toBe(true);
    expect(db.alerts.filter(a => a.type === 'APPEL_FONDS' && a.status === 'OPEN')).toHaveLength(0);
  });

  it('pas de réactivation si échéances OVERDUE (cotisations dues d’abord)', async () => {
    const db = makeDb();
    db.contracts.c1.status = 'SUSPENDED';
    db.contributions = [{ contractId: 'c1', amount: 12_000, status: 'OVERDUE' }];
    const svc = await exhaustedAccount(db);
    const { fundCall } = await (svc as any).proposeFundCall('c1', {});
    await (svc as any).sendFundCall(fundCall.id);
    const r = await (svc as any).recordFundPayment('c1', fundCall.id, { id: 'pay1', amount: 7_500, reference: 'PAY-1' });
    expect(r.reactivated).toBe(false);
    expect(db.contracts.c1.status).toBe('SUSPENDED');
  });

  it('montant ≠ choisi, statut non SENT, déjà payé : verrous', async () => {
    const db = makeDb();
    const svc = await exhaustedAccount(db);
    const { fundCall } = await (svc as any).proposeFundCall('c1', {});
    await expect(
      (svc as any).recordFundPayment('c1', fundCall.id, { id: 'p', amount: 1, reference: 'x' }),
    ).rejects.toThrow(BadRequestException); // DRAFT, pas SENT
    await (svc as any).sendFundCall(fundCall.id);
    await expect(
      (svc as any).recordFundPayment('c1', fundCall.id, { id: 'p', amount: 1_000, reference: 'x' }),
    ).rejects.toThrow(BadRequestException); // ≠ 7500
    await (svc as any).recordFundPayment('c1', fundCall.id, { id: 'p1', amount: 7_500, reference: 'x' });
    const replay = await (svc as any).recordFundPayment('c1', fundCall.id, { id: 'p1', amount: 7_500, reference: 'x' });
    expect(replay.already).toBe(true);
  });
});
