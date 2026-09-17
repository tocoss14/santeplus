import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentReconciliationJob } from '../src/jobs/payment-reconciliation.job';

const mockConfig = vi.hoisted(() => ({
  payProviders: ['CINETPAY', 'MOCK_MOMO'] as string[],
}));

vi.mock('../src/config', () => ({ config: mockConfig }));

const checkStatus = vi.fn();
vi.mock('../src/modules/payments/providers', () => ({
  getProvider: (code: string) =>
    code === 'CINETPAY'
      ? { code, available: true, checkStatus }
      : { code, available: true, checkStatus: vi.fn(async () => 'PENDING') },
}));

function makePending(over: any = {}) {
  return {
    id: 'p1', reference: 'PAY-1', contractId: 'c1', userId: 'u1',
    amount: 15000, method: 'CINETPAY', status: 'PENDING', externalRef: 'CP-77',
    initiatedAt: new Date(Date.now() - 30 * 60 * 1000),
    ...over,
  };
}

beforeEach(() => {
  mockConfig.payProviders = ['CINETPAY', 'MOCK_MOMO'];
  checkStatus.mockReset();
});

describe('PaymentReconciliationJob — filet de sécurité webhooks perdus', () => {
  it('re-vérifie auprès du PSP et confirme via le service', async () => {
    checkStatus.mockResolvedValue({ outcome: 'SUCCESS', reportedAmount: null });
    const payment = makePending();
    const prisma: any = {
      payment: { findMany: vi.fn(async () => [payment, makePending({ id: 'p2', method: 'MOCK_MOMO' })]) },
    };
    const payments = { confirmFromProvider: vi.fn(async () => ({ ok: true, status: 'SUCCEEDED' })) };
    const job = new PaymentReconciliationJob(prisma, payments as any);
    const r = await job.run();
    expect(r.checked).toBe(2);
    expect(r.confirmed).toBe(1);
    // MOCK_MOMO n'est pas réconcilié
    expect(payments.confirmFromProvider).toHaveBeenCalledTimes(1);
    expect(payments.confirmFromProvider).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'CINETPAY', ourReference: 'PAY-1', providerTxId: 'CP-77' }),
    );
  });

  it('ne fait rien quand seuls les providers de test sont activés', async () => {
    mockConfig.payProviders = ['MOCK_MOMO'];
    const prisma: any = { payment: { findMany: vi.fn() } };
    const payments = { confirmFromProvider: vi.fn() };
    const job = new PaymentReconciliationJob(prisma, payments as any);
    const r = await job.run();
    expect(r.checked).toBe(0);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(payments.confirmFromProvider).not.toHaveBeenCalled();
  });

  it('compte une erreur quand le PSP échoue', async () => {
    const prisma: any = {
      payment: { findMany: vi.fn(async () => [makePending()]) },
    };
    const payments = { confirmFromProvider: vi.fn() };
    const job = new PaymentReconciliationJob(prisma, payments as any);
    checkStatus.mockRejectedValue(new Error('PSP down'));
    const r = await job.run();
    expect(r.errors).toBe(1);
    expect(r.confirmed).toBe(0);
  });
});
