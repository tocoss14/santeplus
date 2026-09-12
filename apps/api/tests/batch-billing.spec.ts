import { describe, expect, it, vi } from 'vitest';
import { BatchBillingService } from '../src/modules/billing/batch-billing.service';

function makeService(state: {
  providerId?: string | null;
  invoices?: any[];
  invoice?: any | null;
  rejections?: any[];
}) {
  const prisma: any = {
    user: {
      findUnique: vi.fn(async () => (
        state.providerId ? { providerId: state.providerId } : { providerId: null }
      )),
    },
    batchInvoice: {
      findMany: vi.fn(async ({ where }: any) => (state.invoices ?? []).filter(invoice => (
        invoice.providerId === where.providerId && (where.id === undefined || invoice.id === where.id)
      ))),
      findUnique: vi.fn(async () => state.invoice ?? null),
    },
    rejection: {
      findUnique: vi.fn(async ({ where }: any) => (state.rejections ?? []).find(rejection => rejection.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const rejection = (state.rejections ?? []).find(item => item.id === where.id);
        Object.assign(rejection, data);
        return rejection;
      }),
    },
  };
  const service = new BatchBillingService(prisma, { dispatchToUser: vi.fn() } as any);
  vi.spyOn(service, 'listRejections').mockImplementation(async (batchInvoiceId?: string, status?: string) => (
    (state.rejections ?? []).filter(rejection => (
      (batchInvoiceId === undefined || rejection.batchInvoiceId === batchInvoiceId) &&
      (status === undefined || rejection.status === status)
    ))
  ));
  vi.spyOn(service, 'getBatchInvoice').mockImplementation(async (id: string) => (
    (state.invoices ?? []).find(invoice => invoice.id === id) ?? null
  ));
  return service;
}

describe('provider batch billing scope', () => {
  it('requires an attached establishment', async () => {
    const service = makeService({ providerId: null });
    await expect(service.providerBatchInvoices('user-1')).rejects.toThrow('Aucun établissement');
  });

  it('does not return another provider’s invoice', async () => {
    const service = makeService({
      providerId: 'provider-a',
      invoices: [{ id: 'invoice-1', providerId: 'provider-b' }],
    });
    await expect(service.providerBatchInvoice('user-1', 'invoice-1')).rejects.toThrow('introuvable');
  });

  it('returns only rejections for the caller’s invoices', async () => {
    const service = makeService({
      providerId: 'provider-a',
      invoices: [{ id: 'invoice-1', providerId: 'provider-a' }, { id: 'invoice-2', providerId: 'provider-b' }],
      rejections: [
        { id: 'rejection-1', batchInvoiceId: 'invoice-1', status: 'OPEN', batchInvoice: { providerId: 'provider-a' } },
        { id: 'rejection-2', batchInvoiceId: 'invoice-2', status: 'OPEN', batchInvoice: { providerId: 'provider-b' } },
      ],
    });
    const rejections = await service.providerRejections('user-1');
    expect(rejections.map(rejection => rejection.id)).toEqual(['rejection-1']);
  });

  it('acknowledges and disputes only the caller’s rejections', async () => {
    const service = makeService({
      providerId: 'provider-a',
      rejections: [
        { id: 'rejection-1', batchInvoiceId: 'invoice-1', status: 'OPEN', batchInvoice: { providerId: 'provider-a' } },
        { id: 'rejection-2', batchInvoiceId: 'invoice-2', status: 'OPEN', batchInvoice: { providerId: 'provider-b' } },
      ],
    });

    const acknowledged = await service.acknowledgeProviderRejection('user-1', 'rejection-1');
    expect(acknowledged.status).toBe('ACKNOWLEDGED');
    await expect(service.acknowledgeProviderRejection('user-1', 'rejection-2')).rejects.toThrow('introuvable');

    const disputed = await service.disputeProviderRejection('user-1', 'rejection-1', 'Montant conforme au barème');
    expect(disputed).toMatchObject({ status: 'DISPUTED', resolutionNote: 'Montant conforme au barème' });
    expect(disputed.disputedAt).toBeInstanceOf(Date);
  });
});
