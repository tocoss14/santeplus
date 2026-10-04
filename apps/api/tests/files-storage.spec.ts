import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Hérmetique : aucun accès disque réel, aucun appel réseau.
vi.mock('fs', () => ({
  createReadStream: vi.fn(() => ({ pipe: vi.fn() })),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from('x')),
  writeFileSync: vi.fn(),
}));

import { mkdirSync, writeFileSync } from 'fs';
import { StorageService } from '../src/modules/files/files.service';
import { config } from '../src/config';

// PNG 1x1 valide.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const PNG_UPLOAD = {
  mimetype: 'image/png',
  size: PNG.length,
  buffer: PNG,
  originalname: 'acte-naissance.png',
} as unknown as Express.Multer.File;

function service() {
  return new StorageService({} as any, {} as any);
}

/** Espionne le client S3 privé pour capturer la commande sans toucher au réseau. */
function mockS3Client(svc: StorageService) {
  const send = vi.fn(async (_cmd: any) => ({}));
  vi.spyOn(svc as any, 'client').mockReturnValue({ send });
  return send;
}

describe('StorageService — routage des téléversements vers le stockage objet (Cloudflare R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (config as any).storageRemote = false;
  });

  it('stockage objet actif : PutObject sur le bucket R2, aucune écriture sur disque', async () => {
    (config as any).storageRemote = true;
    (config as any).s3Bucket = 'santeplus-files';
    const svc = service();
    const send = mockS3Client(svc);

    const res = await svc.save('u1', PNG_UPLOAD);

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.constructor.name).toBe('PutObjectCommand');
    expect(command.input.Bucket).toBe('santeplus-files');
    expect(command.input.ContentType).toBe('image/png');
    expect(Buffer.from(command.input.Body)).toEqual(PNG);
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(mkdirSync).not.toHaveBeenCalled();

    // La ligne FileObject pointe la clé objet : c'est elle qu'on relit au redémarrage.
    expect(res.storagePath).toMatch(/\.png$/);
    expect(res.mime).toBe('image/png');
    expect(res.size).toBe(PNG.length);
    expect(res.sha256).toBeTruthy();
  });

  it('stockage objet inactif : repli disque dans uploadsDir (éphémère), aucun appel S3', async () => {
    (config as any).storageRemote = false;
    const svc = service();
    const send = mockS3Client(svc);

    await svc.save('u1', PNG_UPLOAD);

    expect(send).not.toHaveBeenCalled();
    expect(mkdirSync).toHaveBeenCalledWith(config.uploadsDir, { recursive: true });
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(String((writeFileSync as any).mock.calls[0][0])).toContain(config.uploadsDir);
  });

  it('saveBuffer (PDF générés) suit exactement le même routage', async () => {
    (config as any).storageRemote = true;
    (config as any).s3Bucket = 'santeplus-files';
    const svc = service();
    const send = mockS3Client(svc);

    const res = await svc.saveBuffer('u1', PNG, 'carte.pdf');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input.Bucket).toBe('santeplus-files');
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(res.mime).toBe('application/pdf');
    expect(res.storagePath).toMatch(/\.pdf$/);
  });

  it('le format est refusé avant toute écriture, quel que soit le backend', async () => {
    (config as any).storageRemote = true;
    const svc = service();
    const send = mockS3Client(svc);

    await expect(
      svc.save('u1', { ...PNG_UPLOAD, mimetype: 'application/zip' } as unknown as Express.Multer.File),
    ).rejects.toThrow(/Format non autorisé/);
    expect(send).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });
});