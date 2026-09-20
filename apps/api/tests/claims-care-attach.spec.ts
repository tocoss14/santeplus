import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClaimsController, attachCareDossierSchema } from '../src/modules/claims/claims.controller';

// Symbiose soin ↔ sinistre : rattachement manuel d'un sinistre classique
// (REIMBURSEMENT) à un dossier de soins existant, avec traçabilité événement.

const staff: any = { id: 'mgr1', role: 'INSURANCE_MANAGER', companyId: null, providerId: null };

function makePrisma(claimKind: string, opts: {
  dossier?: any | null;
  existingLink?: any | null;
} = {}) {
  const claim: any = {
    id: 'c1',
    kind: claimKind,
    status: 'SUBMITTED',
    reference: 'SIN-2026-B00001',
    claimantUserId: 'u1',
    beneficiaryId: null,
    contract: { principalUserId: 'u1', companyId: null },
    items: [],
  };
  const dossier = opts.dossier === undefined
    ? { id: 'dos1', reference: 'DOS-2026-AAAAAA', claimId: null, patientUserId: 'u1', beneficiaryId: null, claim: null }
    : opts.dossier;
  const tx: any = {
    careRecord: {
      update: vi.fn(async () => ({})),
    },
    careRecordEvent: {
      create: vi.fn(async () => ({})),
    },
  };
  const prisma: any = {
    claim: { findUnique: vi.fn(async () => claim) },
    careRecord: {
      // 1er appel : lien existant du sinistre ; 2e : dossier ciblé.
      findUnique: vi.fn()
        .mockResolvedValueOnce(opts.existingLink ?? null)
        .mockResolvedValueOnce(dossier),
    },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
  return { prisma, tx, claim };
}

function makeController(prisma: any) {
  return new ClaimsController({} as any, prisma, {} as any, {} as any);
}

describe('POST /admin/claims/:id/care-dossier', () => {
  it('rattache par référence : claimId posé + événement CLAIM_ATTACHED tracé', async () => {
    const { prisma, tx } = makePrisma('REIMBURSEMENT');
    const ctrl = makeController(prisma);
    const res: any = await ctrl.attachCareDossier(staff, 'c1', { reference: 'DOS-2026-AAAAAA' });
    expect(res.ok).toBe(true);
    expect(res.reference).toBe('DOS-2026-AAAAAA');
    expect(tx.careRecord.update).toHaveBeenCalledWith({ where: { id: 'dos1' }, data: { claimId: 'c1' } });
    expect(tx.careRecordEvent.create).toHaveBeenCalledTimes(1);
    const event = tx.careRecordEvent.create.mock.calls[0][0].data;
    expect(event.type).toBe('CLAIM_ATTACHED');
    expect(event.title).toContain('SIN-2026-B00001');
    expect(event.actorRole).toBe('INSURANCE_MANAGER');
  });

  it('rattache par identifiant (picker)', async () => {
    const { prisma } = makePrisma('REIMBURSEMENT');
    const ctrl = makeController(prisma);
    const res: any = await ctrl.attachCareDossier(staff, 'c1', { careRecordId: 'dos1' });
    expect(res.ok).toBe(true);
  });

  it('refuse un sinistre tiers-payant (liaison automatique uniquement)', async () => {
    const { prisma } = makePrisma('THIRDPARTY');
    const ctrl = makeController(prisma);
    await expect(ctrl.attachCareDossier(staff, 'c1', { reference: 'DOS-2026-AAAAAA' })).rejects.toThrow(BadRequestException);
  });

  it('refuse si le sinistre a déjà un dossier', async () => {
    const { prisma } = makePrisma('REIMBURSEMENT', { existingLink: { reference: 'DOS-2026-EXIST1' } });
    const ctrl = makeController(prisma);
    await expect(ctrl.attachCareDossier(staff, 'c1', { reference: 'DOS-2026-AAAAAA' })).rejects.toThrow(/déjà rattaché au dossier DOS-2026-EXIST1/);
  });

  it('refuse si le dossier est déjà rattaché à un autre sinistre', async () => {
    const { prisma } = makePrisma('REIMBURSEMENT', {
      dossier: { id: 'dos1', reference: 'DOS-2026-AAAAAA', claimId: 'other', patientUserId: 'u1', beneficiaryId: null, claim: { reference: 'SIN-2026-OTHER' } },
    });
    const ctrl = makeController(prisma);
    await expect(ctrl.attachCareDossier(staff, 'c1', { reference: 'DOS-2026-AAAAAA' })).rejects.toThrow(/déjà rattaché au sinistre SIN-2026-OTHER/);
  });

  it('refuse un dossier d\'un autre assuré (ni principal ni ayant droit)', async () => {
    const { prisma } = makePrisma('REIMBURSEMENT', {
      dossier: { id: 'dos2', reference: 'DOS-2026-BBBBBB', claimId: null, patientUserId: 'someone-else', beneficiaryId: null, claim: null },
    });
    const ctrl = makeController(prisma);
    await expect(ctrl.attachCareDossier(staff, 'c1', { reference: 'DOS-2026-BBBBBB' })).rejects.toThrow(/même assuré/);
  });

  it('accepte le rapprochement par ayant droit (beneficiaryId commun)', async () => {
    const { prisma, tx } = makePrismaWithBeneficiary();
    const ctrl = makeController(prisma);
    const res: any = await ctrl.attachCareDossier(staff, 'c1', { reference: 'DOS-2026-AAAAAA' });
    expect(res.ok).toBe(true);
    expect(tx.careRecord.update).toHaveBeenCalledWith({ where: { id: 'dos1' }, data: { claimId: 'c1' } });
  });

  it('404 si le dossier est introuvable', async () => {
    const { prisma } = makePrisma('REIMBURSEMENT', { dossier: null });
    const ctrl = makeController(prisma);
    await expect(ctrl.attachCareDossier(staff, 'c1', { reference: 'DOS-2026-ZZZZZZ' })).rejects.toThrow(NotFoundException);
  });

  it('schéma : exactement l\'un de reference / careRecordId', () => {
    expect(attachCareDossierSchema.safeParse({ reference: 'DOS-2026-AAAAAA' }).success).toBe(true);
    expect(attachCareDossierSchema.safeParse({ careRecordId: 'dos1' }).success).toBe(true);
    expect(attachCareDossierSchema.safeParse({}).success).toBe(false);
    expect(attachCareDossierSchema.safeParse({ reference: 'DOS-1', careRecordId: 'dos1' }).success).toBe(false);
  });
});

function makePrismaWithBeneficiary() {
  const claim: any = {
    id: 'c1', kind: 'REIMBURSEMENT', status: 'SUBMITTED', reference: 'SIN-2026-B00001',
    claimantUserId: 'u1', beneficiaryId: 'ben9',
    contract: { principalUserId: 'u1', companyId: null }, items: [],
  };
  const dossier = { id: 'dos1', reference: 'DOS-2026-AAAAAA', claimId: null, patientUserId: 'other-user', beneficiaryId: 'ben9', claim: null };
  const tx: any = { careRecord: { update: vi.fn(async () => ({})) }, careRecordEvent: { create: vi.fn(async () => ({})) } };
  const prisma: any = {
    claim: { findUnique: vi.fn(async () => claim) },
    careRecord: { findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(dossier) },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
  return { prisma, tx };
}

describe('DELETE /admin/claims/:id/care-dossier', () => {
  it('détache : claimId annulé + événement CLAIM_DETACHED', async () => {
    const { prisma, tx } = makePrisma('REIMBURSEMENT');
    prisma.careRecord.findUnique = vi.fn().mockResolvedValue({ id: 'dos1', reference: 'DOS-2026-AAAAAA' });
    const ctrl = makeController(prisma);
    const res: any = await ctrl.detachCareDossier(staff, 'c1');
    expect(res.ok).toBe(true);
    expect(tx.careRecord.update).toHaveBeenCalledWith({ where: { id: 'dos1' }, data: { claimId: null } });
    const event = tx.careRecordEvent.create.mock.calls[0][0].data;
    expect(event.type).toBe('CLAIM_DETACHED');
  });

  it('404 si aucun dossier rattaché', async () => {
    const { prisma } = makePrisma('REIMBURSEMENT');
    prisma.careRecord.findUnique = vi.fn().mockResolvedValue(null);
    const ctrl = makeController(prisma);
    await expect(ctrl.detachCareDossier(staff, 'c1')).rejects.toThrow(NotFoundException);
  });
});
