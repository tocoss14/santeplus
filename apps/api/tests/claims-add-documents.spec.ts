import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClaimsController, ClaimsService } from '../src/modules/claims/claims.controller';

// Ajout de pièces jointes sur un sinistre INFO_REQUESTED : l'assuré complète
// son dossier, le retour en analyse est automatique et les gestionnaires
// impliqués sont notifiés.

const authMember: any = { id: 'u1', email: 'fatou@x.bj', role: 'MEMBER', companyId: null, providerId: null };

function makeFile(name = 'ordonnance.pdf') {
  return { originalname: name, size: 10, mimetype: 'application/pdf', buffer: Buffer.from('x') } as any;
}

function makePrisma(claimStatus: string, dupCheck: any[] = []) {
  const prisma: any = {
    claim: {
      findUnique: vi.fn(async () => ({
        id: 'c1', status: claimStatus, reference: 'SIN-1', claimantUserId: 'u1',
        providerId: null, totalRequested: 45000, flags: '[]', items: [],
      })),
      update: vi.fn(async ({ data }: any) => ({ id: 'c1', ...data })),
    },
    claimDocument: {
      findMany: vi.fn(async () => dupCheck),
      create: vi.fn(async ({ data }: any) => ({ id: 'cd1', ...data })),
    },
    fileObject: { create: vi.fn(async ({ data }: any) => ({ id: 'f1', ...data })) },
    user: { findMany: vi.fn(async () => [{ id: 'mgr1' }]) },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return prisma;
}

function makeController(prisma: any) {
  const dispatch: any = {
    dispatchToUser: vi.fn(async () => ({})),
    dispatchToMany: vi.fn(async () => ({})),
  };
  const storage: any = { save: vi.fn(async () => ({ storagePath: 'p.pdf', mime: 'application/pdf', size: 10, sha256: 'h1' })) };
  const claims = new ClaimsService(prisma, dispatch);
  return { ctrl: new ClaimsController(claims as any, prisma, dispatch, storage), dispatch, storage, prisma };
}

describe('POST /claims/:id/documents (complément INFO_REQUESTED)', () => {
  it('ajoute les pièces, repasse le dossier en analyse et notifie gestionnaires + assuré', async () => {
    const prisma = makePrisma('INFO_REQUESTED');
    const { ctrl, dispatch } = makeController(prisma);
    const res = await ctrl.addDocuments(authMember, 'c1', [makeFile()], { docTypes: ['PRESCRIPTION'] });

    expect(res).toEqual({ ok: true, added: 1 });
    expect(prisma.fileObject.create).toHaveBeenCalledTimes(1);
    expect(prisma.claimDocument.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ docType: 'PRESCRIPTION', sha256: 'h1', claimId: 'c1' }),
    }));
    // Retour en analyse dans la transaction
    expect(prisma.claim.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1' },
      data: { status: 'SUBMITTED' },
    }));
    // Notification gestionnaires
    expect(dispatch.dispatchToMany).toHaveBeenCalledWith(
      ['mgr1'],
      expect.objectContaining({ topic: 'CLAIM_DOCS_ADDED' }),
    );
    // Confirmation assuré
    expect(dispatch.dispatchToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ topic: 'CLAIM_STATUS' }));
  });

  it('refuse sur un statut autre que INFO_REQUESTED', async () => {
    const { ctrl } = makeController(makePrisma('SUBMITTED'));
    await expect(ctrl.addDocuments(authMember, 'c1', [makeFile()], {}))
      .rejects.toThrow(/demande d'information/);
  });

  it('refuse un dossier qui n’appartient pas à l’assuré', async () => {
    const prisma = makePrisma('INFO_REQUESTED');
    prisma.claim.findUnique = vi.fn(async () => ({ id: 'c1', status: 'INFO_REQUESTED', claimantUserId: 'autre' }));
    const { ctrl } = makeController(prisma);
    await expect(ctrl.addDocuments(authMember, 'c1', [makeFile()], {}))
      .rejects.toThrow(NotFoundException);
  });

  it('refuse sans fichier', async () => {
    const { ctrl } = makeController(makePrisma('INFO_REQUESTED'));
    await expect(ctrl.addDocuments(authMember, 'c1', [], {}))
      .rejects.toThrow('Aucun fichier fourni');
    await expect(ctrl.addDocuments(authMember, 'c1', undefined, {}))
      .rejects.toThrow('Aucun fichier fourni');
  });

  it('dédoublonnage : un fichier déjà transmis sur un dossier non rejeté est refusé', async () => {
    const prisma = makePrisma('INFO_REQUESTED', [{ sha256: 'h1', claim: { reference: 'SIN-0' } }]);
    const { ctrl, storage } = makeController(prisma);
    await expect(ctrl.addDocuments(authMember, 'c1', [makeFile()], {}))
      .rejects.toThrow(/déjà été transmis/);
    expect(storage.save).toHaveBeenCalledTimes(1); // le hash est calculé avant la comparaison
    expect(prisma.claimDocument.create).not.toHaveBeenCalled();
  });

  it('type par défaut OTHER quand aucun docTypes n’est fourni', async () => {
    const prisma = makePrisma('INFO_REQUESTED');
    const { ctrl } = makeController(prisma);
    await ctrl.addDocuments(authMember, 'c1', [makeFile()], {});
    expect(prisma.claimDocument.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ docType: 'OTHER' }),
    }));
  });

  it('docTypes accepte une chaîne JSON (multipart) et une valeur simple', async () => {
    const { addDocumentsSchema } = await import('../src/modules/claims/claims.controller');
    const asJson = addDocumentsSchema.parse({ docTypes: '["PRESCRIPTION"]' });
    expect(asJson.docTypes).toEqual(['PRESCRIPTION']);
    const asSimple = addDocumentsSchema.parse({ docTypes: 'OTHER' });
    expect(asSimple.docTypes).toEqual(['OTHER']);
    const asArray = addDocumentsSchema.parse({ docTypes: ['INVOICE'] });
    expect(asArray.docTypes).toEqual(['INVOICE']);
  });
});
