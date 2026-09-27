import { describe, expect, it, vi } from 'vitest';
import { BirthCertificateService } from '../src/modules/subscription/birth-certificate.service';
import { UsersController } from '../src/modules/users/users.controller';
import { updateProfileSchema } from '../src/modules/auth/dto';

/**
 * Alignement du compte sur l'acte de naissance (page profil) :
 *  - getProfileDiff : comparatif acte (OCR) ↔ compte + verdict aligned ;
 *  - PATCH /users/me : la date de naissance doit être modifiable pour cet alignement.
 * Hérmetique : l'OCR n'est jamais exécuté (extractData espionné), aucun disque.
 */

const ACTE = {
  firstName: 'Marie-Josée',
  lastName: 'ADJOVI',
  birthDate: new Date('1990-01-12T00:00:00.000Z'),
  birthPlace: 'Cotonou',
  documentNumber: '1234/C/1990',
};

type State = {
  configs: Record<string, string>;
  files: Record<string, any>;
  user: any;
};

function makeState(user: any, fileId?: string): State {
  const state: State = { configs: {}, files: {}, user };
  if (fileId) {
    state.configs[`birth_cert_verify_${user.id}`] = JSON.stringify({ fileId, result: null, verifiedAt: null });
    state.files[fileId] = { id: fileId, ownerId: user.id, documentType: 'BIRTH_CERTIFICATE' };
  }
  return state;
}

function makeService(state: State) {
  const prisma: any = {
    systemConfig: {
      findUnique: vi.fn(async ({ where }: any) =>
        state.configs[where.key] ? { key: where.key, value: state.configs[where.key] } : null),
    },
    fileObject: {
      findUnique: vi.fn(async ({ where }: any) => state.files[where.id] ?? null),
    },
    user: { findUnique: vi.fn(async () => state.user) },
  };
  const svc = new BirthCertificateService(prisma, {} as any);
  // L'OCR réel est hors de portée unitaire : on simule le verdict d'extraction.
  vi.spyOn(svc as any, 'extractData').mockResolvedValue(ACTE);
  return svc;
}

describe('GET birth-certificate/profile-diff — comparatif acte ↔ compte', () => {
  it('aucun acte connu → { acte: null }, l’UI reste neutre', async () => {
    const state = makeState({ id: 'u1', firstName: 'Marie', lastName: 'Adjo', birthDate: new Date('1990-01-12T00:00:00Z') });
    const diff = await makeService(state).getProfileDiff('u1');
    expect(diff.acte).toBeNull();
    expect(diff.fields).toEqual([]);
    expect(diff.aligned).toBe(false);
  });

  it('un document qui n’est pas un acte est ignoré (photo prestataire, pièce d’un autre)', async () => {
    const state = makeState({ id: 'u1', firstName: 'A', lastName: 'B', birthDate: new Date('1990-01-12T00:00:00Z') }, 'f1');
    state.files['f1'].documentType = 'PROVIDER_PHOTO';
    expect((await makeService(state).getProfileDiff('u1')).acte).toBeNull();

    state.files['f1'].documentType = 'BIRTH_CERTIFICATE';
    state.files['f1'].ownerId = 'quelqu-un-dautre';
    expect((await makeService(state).getProfileDiff('u1')).acte).toBeNull();
  });

  it('compte différent de l’acte → les trois champs sont listés, aligned=false', async () => {
    const state = makeState({ id: 'u1', firstName: 'Koffi', lastName: 'Mensan', birthDate: new Date('1991-05-05T00:00:00Z') }, 'f1');
    const diff = await makeService(state).getProfileDiff('u1');
    expect(diff.acte).toMatchObject({ fileId: 'f1', documentNumber: '1234/C/1990', birthPlace: 'Cotonou' });
    expect(diff.fields.map(f => f.field)).toEqual(['firstName', 'lastName', 'birthDate']);
    const bd = diff.fields.find(f => f.field === 'birthDate')!;
    expect(bd.acte).toBe('1990-01-12');
    expect(bd.compte).toBe('1991-05-05');
    expect(diff.aligned).toBe(false);
  });

  it('compte déjà aligné — casse et accents ignorés → aligned=true', async () => {
    const state = makeState({ id: 'u1', firstName: 'Marie-Josée', lastName: 'Adjovi', birthDate: new Date('1990-01-12T00:00:00Z') }, 'f1');
    const diff = await makeService(state).getProfileDiff('u1');
    expect(diff.aligned).toBe(true);
  });
});

describe('PATCH users/me — alignement du compte sur l’acte', () => {
  it('updateProfileSchema accepte birthDate (chaîne ISO → Date)', () => {
    const parsed = updateProfileSchema.parse({ birthDate: '1990-01-12' });
    expect(parsed.birthDate).toBeInstanceOf(Date);
    expect((parsed.birthDate as Date).toISOString()).toBe('1990-01-12T00:00:00.000Z');
  });

  it('updateProfile transmet la date de naissance (et le prénom) à Prisma', async () => {
    const prisma: any = {
      user: {
        update: vi.fn(async () => ({})),
        findUnique: vi.fn(async () => ({ id: 'u1', firstName: 'Marie-Josée' })),
      },
    };
    const controller = new UsersController(prisma, {} as any);
    await controller.updateProfile({ id: 'u1' } as any, { birthDate: '1990-01-12', firstName: 'Marie-Josée' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ firstName: 'Marie-Josée', birthDate: '1990-01-12' }),
    });
  });
});
