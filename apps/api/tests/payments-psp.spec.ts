import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PaymentsController, PaymentsService } from '../src/modules/payments/payments.controller';

const mockConfig = vi.hoisted(() => ({
  mockPayments: true,
  isProd: false,
  appUrl: 'http://localhost:3000',
  payProviders: ['CINETPAY', 'MOCK_MOMO'] as string[],
  cinetpayApiKey: 'key',
  cinetpaySiteId: 'site',
  fedapaySecretKey: '',
  fedapayMode: 'sandbox',
}));

vi.mock('../src/config', () => ({ config: mockConfig }));

const checkStatus = vi.fn();
vi.mock('../src/modules/payments/providers', () => ({
  getProvider: (code: string) => ({
    code,
    available: true,
    initiate: async (p: any) => ({ provider: code, instructions: { mode: 'SIMULATION', reference: p.reference } }),
    checkStatus,
  }),
  getProviders: () => [],
}));

const auth: any = { id: 'u1', email: 'u@t.bj', role: 'MEMBER', companyId: null, providerId: null };

function makePayment(over: any = {}) {
  return {
    id: 'p1', reference: 'PAY-1', contractId: 'c1', userId: 'u1', amount: 15000,
    method: 'CINETPAY', status: 'PENDING', externalRef: 'CP-77',
    meta: JSON.stringify({ contributionId: 'ct1' }),
    ...over,
  };
}

function makeHarness(payment: any) {
  const tx = {
    payment: { update: vi.fn(async ({ data }: any) => ({ ...payment, ...data })) },
    contribution: { update: vi.fn(async () => ({})) },
    contract: {
      findUnique: vi.fn(async () => ({ id: 'c1', status: 'PENDING_PAYMENT', principalUserId: 'u1', adhesionPaidAt: null })),
      update: vi.fn(async () => ({})),
    },
  };
  const prisma: any = {
    payment: {
      findFirst: vi.fn(async () => payment),
      findUnique: vi.fn(async () => payment),
      update: vi.fn(async ({ data }: any) => Object.assign(payment, data)),
    },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
    contract: {
      findUnique: vi.fn(async () => ({ id: 'c1', number: 'CTR-1', status: 'PENDING_PAYMENT', principalUserId: 'u1', product: { name: 'Formule' } })),
      update: vi.fn(async () => ({})),
    },
    user: { findMany: vi.fn(async () => [{ id: 'mgr1' }]) },
  };
  const dispatch = { dispatchToUser: vi.fn(async () => {}) };
  const svc = new PaymentsService(prisma, dispatch as any);
  return { svc, controller: new PaymentsController(svc, prisma), prisma, tx, dispatch };
}

beforeEach(() => {
  mockConfig.isProd = false;
  mockConfig.mockPayments = true;
  checkStatus.mockReset();
});

describe('PSP réel — vérification serveur-side avant confirmation', () => {
  it('confirme le succès seulement si le montant rapporté par le PSP correspond', async () => {
    const payment = makePayment();
    const { svc, tx } = makeHarness(payment);
    checkStatus.mockResolvedValue({ outcome: 'SUCCESS', reportedAmount: 15000 });
    const r = await svc.confirmFromProvider({ provider: 'CINETPAY', ourReference: 'PAY-1' });
    expect(r).toEqual({ ok: true, status: 'SUCCEEDED' });
    // La confirmation transactionnelle passe par tx.payment.update
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: expect.objectContaining({ status: 'SUCCEEDED' }) }),
    );
    expect(tx.contribution.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ct1' }, data: expect.objectContaining({ status: 'PAID' }) }),
    );
  });

  it("bloque la confirmation sur un écart de montant : PENDING + alerte gestion", async () => {
    const payment = makePayment();
    const { svc, dispatch } = makeHarness(payment);
    checkStatus.mockResolvedValue({ outcome: 'SUCCESS', reportedAmount: 1500 });
    const r = await svc.confirmFromProvider({ provider: 'CINETPAY', ourReference: 'PAY-1' });
    expect(r).toEqual({ ok: false, status: 'AMOUNT_MISMATCH' });
    expect(payment.status).toBe('PENDING');
    expect(dispatch.dispatchToUser).toHaveBeenCalledWith('mgr1', expect.objectContaining({ topic: 'PAYMENT_ANOMALY' }));
  });

  it('tolère un PSP qui ne rapporte pas de montant (providers simples)', async () => {
    const payment = makePayment();
    const { svc } = makeHarness(payment);
    checkStatus.mockResolvedValue({ outcome: 'SUCCESS', reportedAmount: null });
    const r = await svc.confirmFromProvider({ provider: 'CINETPAY', ourReference: 'PAY-1' });
    expect(r).toEqual({ ok: true, status: 'SUCCEEDED' });
  });

  it('marque FAILED sans exiger de montant rapporté', async () => {
    const payment = makePayment();
    const { svc } = makeHarness(payment);
    checkStatus.mockResolvedValue({ outcome: 'FAILED', reportedAmount: null });
    const r = await svc.confirmFromProvider({ provider: 'CINETPAY', ourReference: 'PAY-1' });
    expect(r).toEqual({ ok: true, status: 'FAILED' });
  });

  it('webhook rejoué : paiement déjà traité, aucun effet de bord', async () => {
    const payment = makePayment({ status: 'SUCCEEDED' });
    const { svc, prisma } = makeHarness(payment);
    const r = await svc.confirmFromProvider({ provider: 'CINETPAY', ourReference: 'PAY-1' });
    expect(r).toEqual({ ok: true, status: 'SUCCEEDED' });
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('PENDING côté PSP : rien ne bouge', async () => {
    const payment = makePayment();
    const { svc, prisma } = makeHarness(payment);
    checkStatus.mockResolvedValue({ outcome: 'PENDING', reportedAmount: null });
    const r = await svc.confirmFromProvider({ provider: 'CINETPAY', ourReference: 'PAY-1' });
    expect(r).toEqual({ ok: true, status: 'PENDING' });
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});

describe('Verrouillage de la simulation', () => {
  it('mock/confirm est interdit en production même si MOCK_PAYMENTS=true', async () => {
    mockConfig.isProd = true;
    const { controller } = makeHarness(makePayment());
    await expect(controller.mockConfirm(auth, { paymentId: 'p1', outcome: 'SUCCESS' } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mock/confirm est refusé dès que MOCK_PAYMENTS=false', async () => {
    mockConfig.mockPayments = false;
    const { controller } = makeHarness(makePayment());
    await expect(controller.mockConfirm(auth, { paymentId: 'p1', outcome: 'SUCCESS' } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
