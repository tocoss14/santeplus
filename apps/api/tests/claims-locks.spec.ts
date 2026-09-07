import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CLAIM_TRANSITIONS, assertClaimTransition, canTransition } from '../src/domain/claim-machine';
import { CLAIM_STATUSES_CONSUMING_CAPS } from '../src/domain/engine';
import { ClaimsController } from '../src/modules/claims/claims.controller';

// §27 + §40.5 : machine à états verrouillée, facture validée immuable.

describe('table des transitions', () => {
  it('couvre les actions du back-office avec les bonnes sources', () => {
    expect(CLAIM_TRANSITIONS.SUBMIT).toEqual(['DRAFT', 'INFO_REQUESTED']);
    expect(CLAIM_TRANSITIONS.APPROVE).toEqual(['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED']);
    expect(CLAIM_TRANSITIONS.MARK_PAID).toEqual(['APPROVED', 'PARTIALLY_APPROVED']);
    expect(CLAIM_TRANSITIONS.CANCEL).toContain('DRAFT');
    expect(CLAIM_TRANSITIONS.CANCEL).toContain('AUTH_REQUIRED');
  });

  it('CANCEL sans contre-écriture : jamais depuis un état qui consomme (§40.4)', () => {
    const consuming = new Set<string>(CLAIM_STATUSES_CONSUMING_CAPS as readonly string[]);
    for (const from of CLAIM_TRANSITIONS.CANCEL) {
      expect(consuming.has(from)).toBe(false);
    }
  });

  it('assert lève sur transition interdite, passe sur autorisée', () => {
    expect(() => assertClaimTransition('APPROVED', 'APPROVE')).toThrow();
    expect(() => assertClaimTransition('PAID', 'CANCEL')).toThrow();
    expect(() => assertClaimTransition('DRAFT', 'CANCEL')).not.toThrow();
    expect(canTransition('SUBMITTED', 'APPROVE')).toBe(true);
  });
});

const authUser: any = { id: 'mgr1', email: 'm@x.bj', role: 'INSURANCE_MANAGER', companyId: null, providerId: null };

function makePrisma(status: string, items: any[] = [{ id: 'i1', amountRequested: 10000, amountApproved: 8000 }]) {
  const state = { status };
  const updates: any[] = [];
  return {
    state,
    updates,
    claim: {
      findUnique: vi.fn(async () => ({
        id: 'c1', status: state.status, flags: '[]', reference: 'SIN-1',
        claimantUserId: 'u1', providerId: null, totalApproved: 0, items,
      })),
      update: vi.fn(async ({ data }: any) => {
        if (data.status) state.status = data.status;
        updates.push(data);
        return { id: 'c1', ...data };
      }),
    },
    claimItem: { update: vi.fn(async () => ({})) },
    systemConfig: { findUnique: vi.fn(async () => null) },
    user: { findMany: vi.fn(async () => []) },
    fileObject: { create: vi.fn(async ({ data }: any) => ({ id: 'f1', ...data })) },
    claimDocument: { create: vi.fn(async () => ({})) },
  } as any;
}

function makeController(prisma: any) {
  const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
  return new ClaimsController({} as any, prisma, dispatch, {} as any);
}

describe('verrous facture validée (§40.5)', () => {
  it('approve deux fois : la seconde est rejetée', async () => {
    const prisma = makePrisma('SUBMITTED');
    const ctrl = makeController(prisma);
    const first = await ctrl.approve(authUser, 'c1', {});
    expect(first.ok).toBe(true);
    expect(prisma.state.status).toBe('PARTIALLY_APPROVED');
    await expect(ctrl.approve(authUser, 'c1', {})).rejects.toThrow(BadRequestException);
  });

  it('mark-paid deux fois : la seconde est rejetée', async () => {
    const prisma = makePrisma('APPROVED');
    const ctrl = makeController(prisma);
    await ctrl.markPaid(authUser, 'c1', {});
    expect(prisma.state.status).toBe('PAID');
    await expect(ctrl.markPaid(authUser, 'c1', {})).rejects.toThrow(BadRequestException);
  });

  it('cancel DRAFT → CANCELLED, puis cancel à nouveau rejeté', async () => {
    const prisma = makePrisma('DRAFT');
    const ctrl = makeController(prisma);
    const res = await ctrl.cancel(authUser, 'c1', { reason: 'Doublon de saisie' });
    expect(res.ok).toBe(true);
    expect(prisma.state.status).toBe('CANCELLED');
    await expect(ctrl.cancel(authUser, 'c1', { reason: 'Doublon' })).rejects.toThrow(BadRequestException);
  });

  it('cancel depuis PAID ou APPROVED : interdit (contre-écriture requise, phase CTS)', async () => {
    for (const status of ['APPROVED', 'PARTIALLY_APPROVED', 'PAID', 'CONFIRMED']) {
      const prisma = makePrisma(status);
      const ctrl = makeController(prisma);
      await expect(ctrl.cancel(authUser, 'c1', { reason: 'Trop tard' })).rejects.toThrow(BadRequestException);
    }
  });

  it('facture auto : invoiceNumber posé une fois, jamais régénéré', async () => {
    const prisma = makePrisma('APPROVED');
    let invoiced: string | null = null;
    prisma.claim.findUnique = vi.fn(async () => ({
      id: 'c1', status: prisma.state.status, flags: '[]', reference: 'SIN-1',
      claimantUserId: 'u1', providerId: 'p1', totalApproved: 8000,
      invoiceNumber: invoiced, items: [],
    }));
    prisma.claim.update = vi.fn(async ({ data }: any) => {
      if ((data as any).invoiceNumber) invoiced = (data as any).invoiceNumber;
      prisma.updates.push(data);
      return { id: 'c1' };
    });
    const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
    const pdf: any = { generateInvoicePdf: vi.fn(async () => Buffer.from('pdf')) };
    const storage: any = { saveBuffer: vi.fn(async () => ({ storagePath: 's', mime: 'application/pdf', size: 3, sha256: 'h' })) };
    const ctrl = new ClaimsController({} as any, prisma, dispatch, storage, undefined, pdf);
    await (ctrl as any).attachInvoice('c1');
    expect(invoiced).toMatch(/^FAC-\d+-SIN-1$/);
    const callsAfterFirst = prisma.claim.update.mock.calls.length;
    await (ctrl as any).attachInvoice('c1');
    expect(prisma.claim.update.mock.calls.length).toBe(callsAfterFirst);
    expect(invoiced).toMatch(/^FAC-\d+-SIN-1$/);
  });
});
