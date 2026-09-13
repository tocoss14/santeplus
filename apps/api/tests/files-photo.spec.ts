import { describe, expect, it, vi } from 'vitest';
import { StorageService } from '../src/modules/files/files.service';
import { PdfService } from '../src/modules/contracts/pdf.service';

// PNG 1x1 rouge, valide pour pdfkit.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function storageWith(fileRow: any, readResult: { buffer: Buffer; mime: string } | null) {
  const prisma: any = {
    fileObject: { findUnique: vi.fn(async () => fileRow) },
  };
  const svc = new StorageService(prisma);
  vi.spyOn(svc as any, 'readFile').mockImplementation(async (id: string | null | undefined) => {
    if (!id || !fileRow) return null;
    return readResult;
  });
  return svc;
}

describe('StorageService.readFile (résilience photo)', () => {
  it('retourne null sans jamais lever : id manquant, fichier inconnu, lecture impossible', async () => {
    const svc = storageWith(null, null);
    await expect(svc.readFile(null)).resolves.toBeNull();
    await expect(svc.readFile(undefined)).resolves.toBeNull();
    await expect(svc.readFile('inexistant')).resolves.toBeNull();
  });

  it('retourne le contenu quand le fichier existe', async () => {
    const svc = storageWith({ id: 'f1', mime: 'image/png' }, { buffer: TINY_PNG, mime: 'image/png' });
    const r = await svc.readFile('f1');
    expect(r?.mime).toBe('image/png');
    expect(r?.buffer.length).toBeGreaterThan(0);
  });
});

function pdfWith(photoFileId: string | null, photo: { buffer: Buffer; mime: string } | null) {
  const prisma: any = {
    contract: {
      findUnique: vi.fn(async () => ({
        id: 'c1',
        number: 'CTR-1',
        status: 'ACTIVE',
        endDate: new Date('2027-01-01'),
        cardToken: 'tok1234567890abcdef',
        product: { name: 'Confort' },
        principalUser: {
          firstName: 'Jean', lastName: 'Agbodjan', memberNumber: 'MEM-1',
          photoFileId,
        },
      })),
    },
  };
  const storage: any = { readFile: vi.fn(async () => photo) };
  return new PdfService(prisma, storage);
}

describe('generateCardPdf (photo sur la carte)', () => {
  it('génère la carte sans photo (initiales de repli)', async () => {
    const pdf = pdfWith(null, null);
    const buf = await pdf.generateCardPdf('c1');
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('intègre la photo quand le fichier est disponible', async () => {
    const without = await pdfWith(null, null).generateCardPdf('c1');
    const withPhoto = await pdfWith('f1', { buffer: TINY_PNG, mime: 'image/png' }).generateCardPdf('c1');
    expect(withPhoto.length).toBeGreaterThan(without.length);
  });

  it('dégrade gracieusement si la photo est illisible (fichier perdu)', async () => {
    const pdf = pdfWith('f-perdu', null);
    const buf = await pdf.generateCardPdf('c1');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
