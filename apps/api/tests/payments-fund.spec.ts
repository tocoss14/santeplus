import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from '../src/modules/payments/payments.controller';
import { CtsService } from '../src/modules/cts/cts.service';

vi.mock('../src/modules/payments/providers', () => ({
  getProvider: (code: string) => ({
    code,
    initiate: async (p: any) => ({ provider: code, instructions: { mode: 'SIMULATION', reference: p.reference } }),
    checkStatus: async () => 'PENDING' as const,
  }),
  getProviders: () => [],
}));

// P13/14 : paiement d'appel de fonds via initiate + chaîne confirmée.
// MOCK PSP hors-ligne ; CtsService réel sur prisma mocké partagé.

const auth: any = { id: 'u1', email: 'u@t.bj', role: 'MEMBER', companyId: null, providerId: null };

function makeDb() {
  return {
    contracts: {
      c1: { id: 'c1', status: 'ACTIVE', principalUserId: 'u1', premiumAnnual: 144_000, ctsOverride: null, product: { ctsConfig: '{}' } },
    },
    contributions: [] as any[],
    payments: {} as Record<string, any>,
    fundCalls: {} as Record<string, any>,
    claims: [] as any[],
    accounts: {} as Record<string, any>,
    journal: [] as any[],
    alerts: [] as any[],
    users: [{ id: 'u1' }, { id: 'mgr1' }],
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
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async ({ where }: any) => db.contributions.filter((c: any) => c.contractId === where.contractId)),
      count: vi.fn(async ({ where }: any) =>
        db.contributions.filter((c: any) => c.contractId === where.contractId && c.status === where.status).length,
      ),
      update: vi.fn(async () => ({})),
    },
    payment: {
      findUnique: vi.fn(async ({ where }: any) => db.payments[where.id] ?? null),
      findMany: vi.fn(async ({ where }: any) =>
        Object.values(db.payments).filter((p: any) => p.contractId === where.contractId && (where.status === undefined || p.status === where.status)),
      ),
      create: vi.fn(async ({ data }: any) => {
        const p = { id: id('pay'), ...data };
        db.payments[p.id] = p;
        return p;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(db.payments[where.id], data);
        return db.payments[where.id];
      }),
      count: vi.fn(async () => Object.keys(db.payments).length),
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
    claim: { findMany: vi.fn(async () => []) },
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
        db.journal.find((j: any) => j.contractId === where.contractId && j.type === where.type && j.reference === where.reference) ?? null,
      ),
      findMany: vi.fn(async ({ where }: any) =>
        db.journal.filter((j: any) =>
          (where.contractId === undefined || j.contractId === where.contractId) &&
          (where.reference === undefined || j.reference === where.reference) &&
          (where.type === undefined || (where.type.in ? where.type.in.includes(j.type) : j.type === where.type)),
        ),
      ),
      create: vi.fn(async ({ data }: any) => {
        const e = { id: id('j'), ...data };
        db.journal.push(e);
        return e;
      }),
    },
    ctsAlert: {
      findMany: vi.fn(async ({ where }: any) =>
        db.alerts.filter((a: any) => (where.contractId === undefined || a.contractId === where.contractId) && (where.status === undefined || a.status === where.status)),
      ),
      create: vi.fn(async ({ data }: any) => {
        const a = { id: id('al'), ...data };
        db.alerts.push(a);
        return a;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const a of db.alerts) {
          const mc = where.contractId === undefined || a.contractId === where.contractId;
          const ms = where.status === undefined || a.status === where.status;
          const mt = where.type === undefined || a.type === where.type;
          if (mc && ms && mt) {
            Object.assign(a, data);
            count++;
          }
        }
        return { count };
      }),
    },
    user: {
      findMany: vi.fn(async () => [{ id: 'mgr1' }]),
    },
    $transaction: vi.fn(async (cb: any) =>
      cb({
        payment: {
          update: vi.fn(async ({ where, data }: any) => {
            Object.assign(db.payments[where.id], data);
            return db.payments[where.id];
          }),
        },
        contribution: { update: vi.fn(async () => ({})) },
        contract: {
          findUnique: vi.fn(async ({ where }: any) => db.contracts[where.id] ?? null),
          update: vi.fn(async ({ where, data }: any) => {
            Object.assign(db.contracts[where.id], data);
            return db.contracts[where.id];
          }),
        },
      }),
    ),
  } as any;
}

function seedFundCall(db: any, over: any = {}) {
  const fc = {
    id: 'fc1', contractId: 'c1', targetAmount: 8_000, minimum: 0, recommended: 7_500,
    chosenAmount: 7_500, status: 'SENT', dueDate: null, invoiceNumber: 'APF-X', paidAt: null, paymentId: null,
    ...over,
  };
  db.fundCalls[fc.id] = fc;
  return fc;
}

function makeServices(db: DbLike) {
  const prisma = makePrisma(db);
  const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
  const cts = new CtsService(prisma, dispatch);
  const payments = new PaymentsService(prisma, dispatch, undefined, cts);
  return { prisma, dispatch, cts, payments };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbLike = any;

describe('initiate appel de fonds', () => {
  it('montant = choisi exact, meta fundCallId, sans cotisation', async () => {
    const db = makeDb();
    seedFundCall(db);
    const { payments } = makeServices(db);
    const res = await payments.initiate(auth, { contractId: 'c1', method: 'MOCK_MOMO', fundCallId: 'fc1' });
    expect(res.payment.amount).toBe(7_500);
    const stored = db.payments[res.payment.id];
    expect(JSON.parse(stored.meta)).toMatchObject({ fundCallId: 'fc1' });
  });

  it('appel inconnu / autre contrat / non SENT → 400', async () => {
    const db = makeDb();
    seedFundCall(db);
    const { payments } = makeServices(db);
    await expect(payments.initiate(auth, { contractId: 'c1', method: 'MOCK_MOMO', fundCallId: 'nope' })).rejects.toThrow(
      BadRequestException,
    );
    db.fundCalls.fc1.status = 'DRAFT';
    await expect(payments.initiate(auth, { contractId: 'c1', method: 'MOCK_MOMO', fundCallId: 'fc1' })).rejects.toThrow(
      BadRequestException,
    );
    db.fundCalls.fc1.status = 'SENT';
    db.fundCalls.fc1.contractId = 'autre';
    await expect(payments.initiate(auth, { contractId: 'c1', method: 'MOCK_MOMO', fundCallId: 'fc1' })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('confirm appel de fonds (§17)', () => {
  it('chaîne complète : SUCCEEDED → PAID, CTS crédité, contrat ACTIVE', async () => {
    const db = makeDb();
    db.contracts.c1.status = 'SUSPENDED';
    seedFundCall(db);
    const { payments, dispatch } = makeServices(db);
    const init = await payments.initiate(auth, { contractId: 'c1', method: 'MOCK_MOMO', fundCallId: 'fc1' });
    const conf = await payments.confirmPayment(init.payment.id, 'SUCCESS');
    expect(conf.status).toBe('SUCCEEDED');
    expect(db.fundCalls.fc1.status).toBe('PAID');
    expect(db.fundCalls.fc1.paymentId).toBe(init.payment.id);
    const acc = db.accounts.c1;
    expect(acc.primeCollected).toBe(7_500);
    expect(acc.fundCallsTotal).toBe(7_500);
    expect(db.contracts.c1.status).toBe('ACTIVE');
    expect(db.journal.some((j: any) => j.type === 'PAIEMENT' && j.amount === 7_500)).toBe(true);
    expect(dispatch.dispatchToUser).toHaveBeenCalled();
  });
});
