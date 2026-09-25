/**
 * Contrat d'extraction OCR de l'acte de naissance (service, sans navigateur).
 *
 * La souscription ne doit JAMAIS bloquer sur l'OCR : `extractData` renvoie
 * null quand rien d'exploitable n'est lu (acte illisible, stockage
 * inaccessible) — l'UI garde alors la saisie manuelle — et renvoie les champs
 * essentiels quand l'acte est lisible. Le null ne doit jamais être une réponse
 * par défaut : le cas lisible le prouve en miroir.
 *
 * Stratégie : service réel + Prisma/Storage mockés (pattern de
 * birth-certificate.spec.ts), OCR réel sur les fixtures générées
 * (.freebuff/). Un seul service pour toute la classe → le worker tesseract
 * (coûteux au boot) n'est chargé qu'une fois.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { BirthCertificateService } from '../src/modules/subscription/birth-certificate.service';

// apps/api/tests/ → racine du dépôt trois niveaux plus haut.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const UNREADABLE = join(root, '.freebuff', 'acte-test-illisible.png');
const LISIBLE = join(root, '.freebuff', 'acte-test.png');

// Fixtures générées (hors dépôt) : fabrication au besoin.
for (const [fixture, script] of [
  [UNREADABLE, 'make-birth-cert-unreadable-fixture.mjs'],
  [LISIBLE, 'make-birth-cert-fixture.mjs'],
] as const) {
  if (!existsSync(fixture)) {
    const r = spawnSync(process.execPath, [join(root, 'scripts-dev', script)], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`Impossible de générer ${fixture}`);
  }
}

const files: Record<string, any> = {
  'file-noise': { id: 'file-noise', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' },
  'file-lisible': { id: 'file-lisible', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' },
  'file-ghost': { id: 'file-ghost', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' },
  'file-eio': { id: 'file-eio', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' },
  'file-foreign': { id: 'file-foreign', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-2' },
  'file-otherdoc': { id: 'file-otherdoc', mime: 'image/png', documentType: 'INVOICE', ownerId: 'user-1' },
};

const buffers: Record<string, Buffer> = {
  'file-noise': readFileSync(UNREADABLE),
  'file-lisible': readFileSync(LISIBLE),
  // file-ghost et file-eio : volontairement absents des buffers (cas d'échec stockage).
};

const prisma = {
  systemConfig: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
  fileObject: { create: vi.fn(), findUnique: vi.fn(async ({ where }: any) => files[where.id] ?? null) },
  user: { findUnique: vi.fn() },
} as any;

const storage = {
  save: vi.fn(),
  readFile: vi.fn(async (id: string) => {
    if (id === 'file-eio') throw new Error('EIO');
    return buffers[id] ? { buffer: buffers[id], mime: 'image/png' } : null;
  }),
} as any;

let service: BirthCertificateService;

beforeAll(() => {
  service = new BirthCertificateService(prisma, storage);
});

describe('contrat extractData — l\'OCR n\'est jamais bloquant', () => {
  it('renvoie null sans OCR quand le stockage ne connaît pas le fichier', async () => {
    await expect(service.extractData('file-ghost', 'user-1')).resolves.toBeNull();
  });

  it('renvoie null quand la lecture stockage échoue', async () => {
    await expect(service.extractData('file-eio', 'user-1')).resolves.toBeNull();
  });

  it('refuse le document appartenant à un autre compte', async () => {
    await expect(service.extractData('file-foreign', 'user-1')).rejects.toThrow('appartient pas à votre compte');
  });

  it('refuse un document qui n\'est pas un acte de naissance', async () => {
    await expect(service.extractData('file-otherdoc', 'user-1')).rejects.toThrow('n\'est pas un acte');
  });

  it('renvoie null sur l\'acte illisible (image sans texte exploitable)', async () => {
    await expect(service.extractData('file-noise', 'user-1')).resolves.toBeNull();
  }, 120_000);

  it('extrait les champs essentiels d\'un acte lisible — null n\'est pas la réponse par défaut', async () => {
    const res = await service.extractData('file-lisible', 'user-1');
    expect(res).not.toBeNull();
    expect(res!.firstName).toBe('Marie-Josée');
    expect(res!.lastName).toBe('ADJOVI');
    expect(res!.birthDate).toEqual(new Date('1990-01-12T00:00:00.000Z'));
    expect(res!.birthPlace).toContain('Cotonou');
    expect(res!.documentNumber).toBe('1234/C/1990');
  }, 120_000);
});
