import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CLAIM_TRANSITIONS, canTransition } from '../src/domain/claim-machine';
import { ClaimsController } from '../src/modules/claims/claims.controller';
import { BatchBillingService } from '../src/modules/billing/batch-billing.service';

const authUser: any = { id: 'mgr1', email: 'm@x.bj', role: 'INSURANCE_MANAGER', companyId: null, providerId: null };

// ────────────────────────────────────────────────────────────────────────────
// 1. Machine à états : CONFIRMED → APPROVE autorisé (régularisation TP)
// ────────────────────────────────────────────────────────────────────────────
describe('machine à états — APPROVE accepte CONFIRMED (écart P0 D)', () => {
  it('CONFIRMED est une source autorisée pour APPROVE', () => {
    expect(canTransition('CONFIRMED', 'APPROVE')).toBe(true);
    expect(CLAIM_TRANSITIONS.APPROVE).toContain('CONFIRMED');
  });

  it('les verrous existants restent en place', () => {
    expect(canTransition('APPROVED', 'APPROVE')).toBe(false);
    expect(canTransition('PARTIALLY_APPROVED', 'APPROVE')).toBe(false);
    expect(canTransition('PAID', 'APPROVE')).toBe(false);
    expect(canTransition('PAID', 'MARK_PAID')).toBe(false);
    expect(canTransition('CONFIRMED', 'MARK_PAID')).toBe(false);
    expect(canTransition('CONFIRMED', 'CANCEL')).toBe(false);
    expect(canTransition('REJECTED', 'APPROVE')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Contrôleur : approve sur claim THIRDPARTY confirmé
// ────────────────────────────────────────────────────────────────────────────
describe('approve — régularisation des claims THIRDPARTY confirmés', () => {
  function makePrisma(claim: any) {
    const updates: any[] = [];
    const prisma: any = {
      updates,
      claim: {
        findUnique: vi.fn(async ({ where }: any) =>
          where?.id ? { ...claim } : { items: claim.items ?? [] },
        ),
        update: vi.fn(async ({ data }: any) => {
          updates.push(['claim', data]);
          if (data.status) claim.status = data.status;
          return { id: claim.id, ...data };
        }),
      },
      claimItem: { update: vi.fn(async () => ({})) },
      systemConfig: { findUnique: vi.fn(async () => null) },
      user: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (fn: any) => fn(prisma)),
    };
    return prisma;
  }

  function makeCtrl(prisma: any, cts?: any) {
    const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
    return new ClaimsController({} as any, prisma, dispatch, {} as any, undefined, undefined, cts);
  }

  // Couverture intégrale : reduced=false → APPROVED (sinon PARTIALLY_APPROVED).
  function tpClaim(status: string) {
    return {
      id: 'c-tp', reference: 'TPE-1', kind: 'THIRDPARTY', status,
      flags: '[]', claimantUserId: 'u1', contractId: 'ctr-1', providerId: 'prov-1',
      beneficiaryId: 'ben-1', totalApproved: 60000,
      items: [{ id: 'i1', amountRequested: 60000, amountApproved: 60000 }],
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it('CONFIRMED + THIRDPARTY → APPROVED, sans ré-engagement (déjà posé à la confirmation)', async () => {
    const claim = tpClaim('CONFIRMED');
    const cts = { recordEngagement: vi.fn(async () => ({})) };
    const prisma = makePrisma(claim);
    const ctrl = makeCtrl(prisma, cts);
    const res = await ctrl.approve(authUser, 'c-tp', { note: 'Régularisation' });
    expect(res.ok).toBe(true);
    expect(res.totalApproved).toBe(60000);
    expect(claim.status).toBe('APPROVED');
    expect(cts.recordEngagement).not.toHaveBeenCalled();
  });

  it('CONFIRMED + kind non THIRDPARTY → 400 (garde kind)', async () => {
    const claim = { ...tpClaim('CONFIRMED'), kind: 'REIMBURSEMENT' };
    const prisma = makePrisma(claim);
    const ctrl = makeCtrl(prisma);
    await expect(ctrl.approve(authUser, 'c-tp', {})).rejects.toThrow(BadRequestException);
  });

  it('SUBMITTED + THIRDPARTY → engage normalement (chemin classique inchangé)', async () => {
    const claim = tpClaim('SUBMITTED');
    const cts = { recordEngagement: vi.fn(async () => ({})) };
    const prisma = makePrisma(claim);
    const ctrl = makeCtrl(prisma, cts);
    const res = await ctrl.approve(authUser, 'c-tp', {});
    expect(res.ok).toBe(true);
    expect(claim.status).toBe('APPROVED');
    expect(cts.recordEngagement).toHaveBeenCalledTimes(1);
    expect(cts.recordEngagement).toHaveBeenCalledWith(
      'ctr-1', 'c-tp', 60000,
      expect.objectContaining({ beneficiaryId: 'ben-1', providerId: 'prov-1', tx: expect.anything() }),
    );
  });

  it('deuxième approve depuis APPROVED → rejeté (verrou inchangé)', async () => {
    const claim = tpClaim('CONFIRMED');
    const prisma = makePrisma(claim);
    const ctrl = makeCtrl(prisma);
    await ctrl.approve(authUser, 'c-tp', {});
    await expect(ctrl.approve(authUser, 'c-tp', {})).rejects.toThrow(BadRequestException);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Batch : filtre élargi + règlement des claims + libération CTS
// ────────────────────────────────────────────────────────────────────────────
describe('batch-billing — pipeline tiers-payant complet', () => {
  function makeBatchSrv(claims: any[]) {
    let invoiceSeq = 0;
    const invoices: any[] = [];
    const itemsById = new Map<string, any>();
    const updates: any[] = [];
    const prisma: any = {
      updates,
      provider: { findUnique: vi.fn(async () => ({ id: 'prov-1', thirdPartyPayer: true })) },
      batchInvoice: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => {
          const items = data.items.create.map((i: any, k: number) => {
            const it = { id: `bii-${invoiceSeq}-${k}`, batchInvoiceId: `bi-${invoiceSeq + 1}`, ...i };
            itemsById.set(it.id, it);
            return it;
          });
          const inv = { id: `bi-${++invoiceSeq}`, ...data, items };
          invoices.push(inv);
          return inv;
        }),
        findUnique: vi.fn(async ({ where }: any) => invoices.find(i => i.id === where.id) ?? null),
        update: vi.fn(async ({ where, data }: any) => {
          const inv = invoices.find(i => i.id === where.id);
          Object.assign(inv, data);
          updates.push(['batchInvoice', where.id, data]);
          return inv;
        }),
      },
      batchInvoiceItem: {
        findMany: vi.fn(async () => alreadyBatched),
        findUnique: vi.fn(async ({ where }: any) => itemsById.get(where.id) ?? null),
        update: vi.fn(async ({ where, data }: any) => {
          const it = itemsById.get(where.id);
          if (it) Object.assign(it, data);
          return it;
        }),
      },
      rejection: { create: vi.fn(async ({ data }: any) => ({ id: 'rej-1', ...data })) },
      claim: {
        findMany: vi.fn(async ({ where }: any) => {
          if (where.id?.in) {
            // payBatchInvoice : règlement des claims de la facture
            return claims.filter(c =>
              where.id.in.includes(c.id) &&
              (!where.kind || c.kind === where.kind) &&
              (!where.status?.notIn || !where.status.notIn.includes(c.status)));
          }
          // createBatchInvoice : filtre d'éligibilité
          return claims.filter(c =>
            c.providerId === where.providerId &&
            (!where.kind || c.kind === where.kind) &&
            (!where.status?.in || where.status.in.includes(c.status)));
        }),
        update: vi.fn(async ({ where, data }: any) => { updates.push(['claim', where.id, data]); return { id: where.id, ...data }; }),
        updateMany: vi.fn(async () => ({})),
        findUnique: vi.fn(async () => null),
      },
      user: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (fn: any) => fn(prisma)),
    };
    const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
    const cts = { recordConsumption: vi.fn(async () => ({})) };
    const srv = new BatchBillingService(prisma, dispatch, cts);
    return { srv, prisma, cts, updates, invoices };
  }

  // claimIds déjà rattachés à une facture groupée (déduplication)
  let alreadyBatched: any[] = [];

  const period = { periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-13') } as any;
  const tpFixture = (id: string, status: string) => ({
    id, kind: 'THIRDPARTY', status, providerId: 'prov-1', contractId: 'ctr-x',
    beneficiaryId: 'ben-1', totalApproved: 60000, invoiceNumber: null,
    items: [{ id: `i-${id}`, amountRequested: 60000, amountApproved: 60000 }],
  });

  it('le filtre élargi inclut CONFIRMED, APPROVED, PARTIALLY_APPROVED et PAID', async () => {
    const { prisma } = makeBatchSrv([tpFixture('c1', 'CONFIRMED')]);
    await new BatchBillingService(prisma, {} as any, undefined).createBatchInvoice({
      providerId: 'prov-1', ...period, claimIds: [],
    });
    const where = (prisma.claim.findMany as any).mock.calls[0][0].where;
    expect(where.status.in).toEqual(['CONFIRMED', 'APPROVED', 'PARTIALLY_APPROVED', 'PAID']);
    expect(where.kind).toBe('THIRDPARTY');
    expect(where.invoiceNumber).toBeUndefined(); // déduplication dédiée, pas via invoiceNumber
  });

  it('claim déjà rattaché à une facture groupée → exclu (jamais double-facturé)', async () => {
    alreadyBatched = [{ claimId: 'c1' }];
    const { srv } = makeBatchSrv([tpFixture('c1', 'CONFIRMED'), tpFixture('c2', 'CONFIRMED')]);
    const inv = await srv.createBatchInvoice({ providerId: 'prov-1', ...period, claimIds: [] });
    expect(inv.items.map((i: any) => i.claimId)).toEqual(['c2']);
    alreadyBatched = [];
  });

  it('claim avec facture auto (invoiceNumber FAC-…) → quand même inclus', async () => {
    const c = tpFixture('c1', 'APPROVED');
    c.invoiceNumber = 'FAC-2026-TPE-1'; // posé par attachInvoice à l'approbation
    const { srv } = makeBatchSrv([c]);
    const inv = await srv.createBatchInvoice({ providerId: 'prov-1', ...period, claimIds: [] });
    expect(inv.totalApproved).toBe(60000);
  });

  it('claims THIRDPARTY confirmés → facture créée avec montants corrects', async () => {
    const { srv } = makeBatchSrv([tpFixture('c1', 'CONFIRMED'), tpFixture('c2', 'CONFIRMED')]);
    const inv = await srv.createBatchInvoice({ providerId: 'prov-1', ...period, claimIds: [] });
    expect(inv.totalAmount).toBe(120000);
    expect(inv.totalApproved).toBe(120000);
  });

  it('REIMBURSEMENT → toujours exclu du batch', async () => {
    const { srv } = makeBatchSrv([
      { id: 'c3', kind: 'REIMBURSEMENT', status: 'APPROVED', providerId: 'prov-1', invoiceNumber: null, items: [{ id: 'i3', amountRequested: 5000, amountApproved: 4000 }] },
    ]);
    await expect(srv.createBatchInvoice({ providerId: 'prov-1', ...period, claimIds: [] })).rejects.toThrow(/Aucun sinistre tiers-payant/);
  });

  it('cycle complet : création → soumission → validation → paiement → claims PAID + CTS libéré', async () => {
    const { srv, cts, updates } = makeBatchSrv([tpFixture('c1', 'CONFIRMED')]);
    const inv = await srv.createBatchInvoice({ providerId: 'prov-1', ...period, claimIds: [] });
    await srv.submitBatchInvoice({ batchInvoiceId: inv.id });
    await srv.validateBatchInvoice({
      batchInvoiceId: inv.id,
      items: [{ batchInvoiceItemId: inv.items[0].id, amountApproved: 60000 }],
    }, 'admin-1');
    await srv.payBatchInvoice(inv.id, 'PAY-2026-0001');

    expect(inv.status).toBe('PAID');
    expect(updates.find(u => u[0] === 'claim' && u[1] === 'c1' && u[2]?.status === 'PAID')).toBeTruthy();
    expect(cts.recordConsumption).toHaveBeenCalledTimes(1);
    expect(cts.recordConsumption).toHaveBeenCalledWith('ctr-x', 'c1', 60000, expect.anything());
  });

  it('payBatchInvoice : échec CTS non bloquant (le règlement subsiste)', async () => {
    const { srv, updates } = makeBatchSrv([tpFixture('c1', 'CONFIRMED')]);
    const inv = await srv.createBatchInvoice({ providerId: 'prov-1', ...period, claimIds: [] });
    await srv.submitBatchInvoice({ batchInvoiceId: inv.id });
    await srv.validateBatchInvoice({ batchInvoiceId: inv.id, items: [{ batchInvoiceItemId: inv.items[0].id, amountApproved: 60000 }] }, 'admin-1');
    (srv as any).cts.recordConsumption = vi.fn(async () => { throw new Error('CTS down'); });
    await expect(srv.payBatchInvoice(inv.id, 'PAY-2026-0002')).resolves.toBeTruthy();
    expect(updates.find(u => u[0] === 'batchInvoice' && u[2]?.status === 'PAID')).toBeTruthy();
    expect(updates.find(u => u[0] === 'claim' && u[2]?.status === 'PAID')).toBeTruthy();
  });
});
