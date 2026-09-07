import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProviderRegistrationService } from '../src/modules/providers/provider-registration.controller';

// GED prestataire (§25) : dépôt public vérifié par email + revue admin.

const file = (name = 'rccm.pdf'): any => ({
  originalname: name,
  mimetype: 'application/pdf',
  size: 1234,
  buffer: Buffer.from('pdf'),
});

function makeService(provider: any) {
  const updates: any[] = [];
  const createdFiles: any[] = [];
  const audits: any[] = [];
  const prisma: any = {
    provider: {
      findUnique: vi.fn(async () => provider),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(provider, data);
        updates.push(data);
        return provider;
      }),
    },
    fileObject: {
      create: vi.fn(async ({ data }: any) => {
        const f = { id: `file-${createdFiles.length + 1}`, ...data };
        createdFiles.push(f);
        return f;
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => { audits.push(data); return {}; }) },
  };
  const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
  const storage: any = {
    save: vi.fn(async () => ({ storagePath: 's.pdf', mime: 'application/pdf', size: 1234, sha256: 'h' })),
  };
  const svc = new ProviderRegistrationService(prisma, dispatch, storage);
  return { svc, prisma, updates, createdFiles, audits };
}

const baseProvider = () => ({
  id: 'p1',
  contactEmail: 'contact@clinique.bj',
  registrationStatus: 'PENDING_REGISTRATION',
  registrationDocs: '[]',
});

describe('dépôt public de pièces', () => {
  it('upload ok : FileObject sans owner, entrée PENDING, audit', async () => {
    const { svc, updates, createdFiles, audits } = makeService(baseProvider());
    const res = await svc.uploadRegistrationDocuments('p1', 'contact@clinique.bj', 'RCCM', [file()]);
    expect(res.ok).toBe(true);
    expect(res.files).toHaveLength(1);
    expect(res.files[0]).toMatchObject({ docType: 'RCCM', fileName: 'rccm.pdf', status: 'PENDING' });
    expect(createdFiles[0]).toMatchObject({ ownerId: null, documentType: 'PROVIDER_DOC' });
    const last = updates[updates.length - 1];
    expect(last.registrationStatus).toBe('PENDING_REGISTRATION');
    expect(JSON.parse(last.registrationDocs)).toHaveLength(1);
    expect(audits.some(a => a.action === 'PROVIDER_DOC_UPLOADED')).toBe(true);
  });

  it('email ne correspondant pas → 403', async () => {
    const { svc } = makeService(baseProvider());
    await expect(svc.uploadRegistrationDocuments('p1', 'pirate@x.bj', 'RCCM', [file()])).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('statut APPROVED → dépôt impossible', async () => {
    const { svc } = makeService({ ...baseProvider(), registrationStatus: 'APPROVED' });
    await expect(svc.uploadRegistrationDocuments('p1', 'contact@clinique.bj', 'RCCM', [file()])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('sans fichier ou mauvais type → 400', async () => {
    const { svc } = makeService(baseProvider());
    await expect(svc.uploadRegistrationDocuments('p1', 'contact@clinique.bj', 'RCCM', [])).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.uploadRegistrationDocuments('p1', 'contact@clinique.bj', 'PASSEPORT', [file()])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('prestataire inconnu → 404', async () => {
    const { svc } = makeService(null);
    (svc as any).prisma.provider.findUnique = vi.fn(async () => null);
    await expect(svc.uploadRegistrationDocuments('px', 'contact@clinique.bj', 'RCCM', [file()])).rejects.toThrow(
      NotFoundException,
    );
  });
});

function providerWithDocs() {
  return {
    ...baseProvider(),
    registrationDocs: JSON.stringify([
      { fileId: 'f1', docType: 'RCCM', fileName: 'rccm.pdf', mime: 'application/pdf', size: 1, uploadedAt: '2026-01-01', status: 'PENDING' },
      { fileId: 'f2', docType: 'RIB', fileName: 'rib.pdf', mime: 'application/pdf', size: 1, uploadedAt: '2026-01-01', status: 'PENDING' },
    ]),
  };
}

describe('revue admin', () => {
  it('tout ACCEPTED → DOCUMENTS_REVIEWED, sinon PENDING_REGISTRATION', async () => {
    const { svc, updates } = makeService(providerWithDocs());
    const r1 = await svc.reviewDocument('p1', 'f1', 'ACCEPTED', 'mgr1');
    expect(r1.registrationStatus).toBe('PENDING_REGISTRATION');
    const r2 = await svc.reviewDocument('p1', 'f2', 'ACCEPTED', 'mgr1', 'OK');
    expect(r2.registrationStatus).toBe('DOCUMENTS_REVIEWED');
    expect(updates[updates.length - 1].registrationStatus).toBe('DOCUMENTS_REVIEWED');
  });

  it('un REJECTED → reste PENDING_REGISTRATION', async () => {
    const { svc } = makeService(providerWithDocs());
    const r = await svc.reviewDocument('p1', 'f1', 'REJECTED', 'mgr1', 'Illisible');
    expect(r.registrationStatus).toBe('PENDING_REGISTRATION');
  });

  it('pièce inconnue → 404', async () => {
    const { svc } = makeService(providerWithDocs());
    await expect(svc.reviewDocument('p1', 'fx', 'ACCEPTED', 'mgr1')).rejects.toThrow(NotFoundException);
  });

  it('listDocuments retourne le dossier', async () => {
    const { svc } = makeService(providerWithDocs());
    const res = await svc.listDocuments('p1');
    expect(res.provider.id).toBe('p1');
    expect(res.documents).toHaveLength(2);
  });
});
