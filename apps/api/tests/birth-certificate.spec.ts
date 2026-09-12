import { describe, expect, it, vi } from 'vitest';
import { BirthCertificateService } from '../src/modules/subscription/birth-certificate.service';
import { SubscriptionService } from '../src/modules/subscription/subscription.service';

function makePrisma(state: { configs: Record<string, string>; files: Record<string, any>; user: any }) {
  return {
    systemConfig: {
      findUnique: vi.fn(async ({ where }: any) => (
        state.configs[where.key] ? { key: where.key, value: state.configs[where.key] } : null
      )),
      upsert: vi.fn(async ({ create }: any) => {
        state.configs[create.key] = create.value;
        return { key: create.key, value: create.value };
      }),
    },
    fileObject: {
      create: vi.fn(async ({ data }: any) => {
        const file = { id: `file-${Object.keys(state.files).length + 1}`, ...data };
        state.files[file.id] = file;
        return file;
      }),
      findUnique: vi.fn(async ({ where }: any) => state.files[where.id] ?? null),
    },
    user: {
      findUnique: vi.fn(async () => state.user),
    },
  } as any;
}

function makeService(state: { configs: Record<string, string>; files: Record<string, any>; user: any }) {
  const storage: any = {
    save: vi.fn(async () => ({
      storagePath: 'birth-cert.pdf',
      mime: 'application/pdf',
      size: 1024,
      sha256: 'hash',
    })),
  };
  return new BirthCertificateService(makePrisma(state), storage);
}

const profile = {
  firstName: 'Aïcha',
  lastName: 'Mensah',
  birthDate: new Date('1990-05-17T00:00:00.000Z'),
};

describe('birth certificate verification chain', () => {
  it('upload requires a file', async () => {
    const service = makeService({ configs: {}, files: {}, user: profile });
    await expect(service.uploadBirthCertificate('user-1', undefined)).rejects.toThrow('Fichier acte de naissance requis');
  });

  it('upload records the pending document and invalidates any previous verification', async () => {
    const state = {
      configs: {
        birth_cert_verify_user_1: JSON.stringify({
          fileId: 'file-old',
          result: { match: true },
          verifiedAt: new Date().toISOString(),
        }),
      },
      files: {},
      user: profile,
    };
    const service = makeService(state);
    const uploaded = await service.uploadBirthCertificate('user_1', {
      mimetype: 'application/pdf',
      size: 1024,
    } as Express.Multer.File);
    const status = await service.getVerificationStatus('user_1');

    expect(uploaded.fileId).toBe(state.configs.birth_cert_verify_user_1 ? JSON.parse(state.configs.birth_cert_verify_user_1).fileId : uploaded.fileId);
    expect(status).toEqual({ verified: false, fileId: uploaded.fileId, result: undefined, verifiedAt: undefined });
  });

  it('verify rejects a replaced or foreign document', async () => {
    const state = {
      configs: {
        birth_cert_verify_user_1: JSON.stringify({ fileId: 'file-current', result: null, verifiedAt: null }),
      },
      files: {
        'file-other': { id: 'file-other', ownerId: 'user_1', documentType: 'BIRTH_CERTIFICATE' },
      },
      user: profile,
    };
    const service = makeService(state);
    await expect(service.verifyUploadedDocument('user_1', 'file-other', {
      firstName: 'Aicha',
      lastName: 'Mensah',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
    })).rejects.toThrow('remplacé');
  });

  it('verify accepts accents, case and surrounding spaces, and rejects mismatches', async () => {
    const state = {
      configs: {
        birth_cert_verify_user_1: JSON.stringify({ fileId: 'file-1', result: null, verifiedAt: null }),
      },
      files: {
        'file-1': { id: 'file-1', ownerId: 'user_1', documentType: 'BIRTH_CERTIFICATE' },
      },
      user: profile,
    };
    const service = makeService(state);
    const matched = await service.verifyUploadedDocument('user_1', 'file-1', {
      firstName: '  aicha ',
      lastName: 'MENSAH',
      birthDate: new Date('1990-05-17T12:00:00.000Z'),
    });
    expect(matched.match).toBe(true);
    expect(await service.getVerificationStatus('user_1')).toMatchObject({ verified: true, fileId: 'file-1' });

    await service.uploadBirthCertificate('user_1', { mimetype: 'application/pdf', size: 1024 } as Express.Multer.File);
    const latestFileId = JSON.parse(state.configs.birth_cert_verify_user_1).fileId;
    const mismatched = await service.verifyUploadedDocument('user_1', latestFileId, {
      firstName: 'Aicha',
      lastName: 'Mensah',
      birthDate: new Date('1991-05-17T00:00:00.000Z'),
    });
    expect(mismatched.match).toBe(false);
    expect(mismatched.details.birthDate).toMatchObject({ match: false });
    expect(await service.getVerificationStatus('user_1')).toMatchObject({ verified: false });
  });

  it('subscribeIndividual requires a verified birth certificate', async () => {
    const prisma: any = {
      user: { findUnique: vi.fn(async () => profile) },
    };
    const birthCertificates: any = {
      getVerificationStatus: vi.fn(async () => ({ verified: false })),
    };
    const service = new SubscriptionService(prisma, { dispatchToUser: vi.fn() } as any, birthCertificates);
    await expect(service.subscribeIndividual('user-1', 'product-1', 'ANNUAL', [])).rejects.toThrow(
      'Acte de naissance vérifié requis',
    );
  });
});
