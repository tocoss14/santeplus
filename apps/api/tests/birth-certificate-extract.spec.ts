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
 * (coûteux au boot) n'est chargé qu'une fois. Le cache OCR (par sha256 du
 * contenu) est vérifié via le comptage des lectures storage et l'identité
 * de référence des résultats — sans espionner l'OCR lui-même.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { BirthCertificateService } from '../src/modules/subscription/birth-certificate.service';

// apps/api/tests/ → racine du dépôt trois niveaux plus haut.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const UNREADABLE = join(root, '.freebuff', 'acte-test-illisible.png');
const LISIBLE = join(root, '.freebuff', 'acte-test.png');
const ROT180 = join(root, '.freebuff', 'acte-test-pivote-180.png');
const ROT270 = join(root, '.freebuff', 'acte-test-pivote-270.png');

// Fixtures générées (hors dépôt) : fabrication au besoin.
for (const [fixture, script] of [
  [UNREADABLE, 'make-birth-cert-unreadable-fixture.mjs'],
  [LISIBLE, 'make-birth-cert-fixture.mjs'],
  [ROT180, 'make-birth-cert-rotated-fixture.mjs'],
  [ROT270, 'make-birth-cert-rotated-fixture.mjs'],
] as const) {
  if (!existsSync(fixture)) {
    const r = spawnSync(process.execPath, [join(root, 'scripts-dev', script)], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`Impossible de générer ${fixture}`);
  }
}

const files: Record<string, any> = {
  'file-noise': { id: 'file-noise', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' },
  'file-lisible': { id: 'file-lisible', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' },
  'file-pivot180': { id: 'file-pivot180', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' },
  'file-pivot270': { id: 'file-pivot270', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' },
  'file-ghost': { id: 'file-ghost', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' },
  'file-eio': { id: 'file-eio', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' },
  'file-foreign': { id: 'file-foreign', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-2' },
  'file-otherdoc': { id: 'file-otherdoc', mime: 'image/png', documentType: 'INVOICE', ownerId: 'user-1' },
};

const buffers: Record<string, Buffer> = {
  'file-noise': readFileSync(UNREADABLE),
  'file-lisible': readFileSync(LISIBLE),
  'file-pivot180': readFileSync(ROT180),
  'file-pivot270': readFileSync(ROT270),
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

  it('redresse et extrait un acte pivoté de 180° (OSD + seconde passe)', async () => {
    const res = await service.extractData('file-pivot180', 'user-1');
    expect(res).not.toBeNull();
    expect(res!.firstName).toBe('Marie-Josée');
    expect(res!.lastName).toBe('ADJOVI');
    expect(res!.birthDate).toEqual(new Date('1990-01-12T00:00:00.000Z'));
  }, 120_000);

  it('redresse et extrait un acte pivoté de 270° (paysage → portrait)', async () => {
    const res = await service.extractData('file-pivot270', 'user-1');
    expect(res).not.toBeNull();
    expect(res!.firstName).toBe('Marie-Josée');
    expect(res!.lastName).toBe('ADJOVI');
    expect(res!.birthDate).toEqual(new Date('1990-01-12T00:00:00.000Z'));
  }, 120_000);

  // ——— Cache par empreinte du contenu (les re-soumissions ne repayent pas l'OCR) ———
  // Observable sans espionner l'OCR : chaque appel relit le fichier au storage
  // (1 readFile), et un hit renvoie la MÊME référence d'objet que le miss.
  const readCalls = () => (storage.readFile as ReturnType<typeof vi.fn>).mock.calls.length;

  it('ne repaie pas l\'OCR quand le même document est re-soumis', async () => {
    const first = await service.extractData('file-lisible', 'user-1');
    const before = readCalls();
    const second = await service.extractData('file-lisible', 'user-1');
    expect(readCalls()).toBe(before + 1); // le fichier est relu…
    expect(second).toBe(first); // …mais le résultat vient du cache (même référence)
  }, 120_000);

  it('le cache suit le contenu, pas le fileId (même fichier re-téléversé)', async () => {
    files['file-lisible-copie'] = { id: 'file-lisible-copie', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' };
    buffers['file-lisible-copie'] = buffers['file-lisible']; // octets identiques
    const before = readCalls();
    const res = await service.extractData('file-lisible-copie', 'user-1');
    expect(readCalls()).toBe(before + 1);
    expect(res).toBe(await service.extractData('file-lisible', 'user-1'));
  }, 120_000);

  it('cache aussi le verdict null (acte illisible re-soumis sans re-OCR)', async () => {
    const before = readCalls();
    await expect(service.extractData('file-noise', 'user-1')).resolves.toBeNull();
    await expect(service.extractData('file-noise', 'user-1')).resolves.toBeNull();
    expect(readCalls()).toBe(before + 2); // relu chaque fois, OCR une seule fois
  }, 120_000);

  it('ne cache pas les erreurs de lecture stockage (réessai possible)', async () => {
    const before = readCalls();
    await expect(service.extractData('file-eio', 'user-1')).resolves.toBeNull();
    await expect(service.extractData('file-eio', 'user-1')).resolves.toBeNull();
    expect(readCalls()).toBe(before + 2); // relu chaque fois ; rien d'englouti dans un verdict définitif
  }, 120_000);

  // ——— Observabilité : logs HIT/MISS/cascade, jamais de contenu document ———
  it('journalise MISS puis HIT (verdict, empreinte tronquée, latence) sans jamais logger le contenu', async () => {
    // Image unique (donc absente du cache) : une plopte grise, sans texte.
    const canvas = createCanvas(80, 60);
    canvas.getContext('2d').fillRect(0, 0, 80, 60);
    files['file-obs'] = { id: 'file-obs', mime: 'image/png', documentType: 'BIRTH_CERTIFICATE', ownerId: 'user-1' };
    buffers['file-obs'] = canvas.toBuffer('image/png');

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => logs.push(args.join(' ')));
    try {
      await service.extractData('file-obs', 'user-1'); // MISS (OCR réel sur l'image)
      await service.extractData('file-obs', 'user-1'); // HIT
    } finally {
      spy.mockRestore();
    }

    const miss = logs.find((l) => l.includes('cache MISS'));
    const hit = logs.find((l) => l.includes('cache HIT'));
    expect(miss).toBeTruthy();
    expect(hit).toBeTruthy();
    expect(miss).toMatch(/verdict=(champs|saisie-manuelle) latence=\d+ms$/);
    expect(miss).toMatch(/sha=[0-9a-f]{8} /); // empreinte tronquée, pas le hash complet
    expect(hit).toMatch(/verdict=(champs|saisie-manuelle) latence=\d+ms$/);
    expect(hit).toMatch(new RegExp(`sha=${miss!.match(/sha=([0-9a-f]{8})/)![1]} `)); // même empreinte
    // Aucun contenu du document de référence ne doit fuiter dans les logs.
    const all = logs.join('\n');
    expect(all).not.toContain('Marie');
    expect(all).not.toContain('ADJOVI');
    expect(all).not.toContain('Cotonou');
  }, 120_000);
});
