/**
 * Tests du rasterizer PDF (chemin « PDF scanné » de l'extraction OCR).
 *
 * Stratégie hermétique : les PDF sont générés en mémoire avec pdfkit —
 *   - un « scan » = une image bitmap pleine page (canvas Skia → PNG), sans texte ;
 *   - un PDF texte vectoriel (ne doit produire aucune image).
 * On vérifie que rasterizePdf extrait l'image décodée en JPEG à résolution
 * native et retourne [] sur du vectoriel. La fidélité OCR de bout en bout est
 * couverte par la preuve live scripts-dev/test-birth-cert-ocr.mjs (trop
 * coûteuse pour la suite unitaire).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import PDFDocument from 'pdfkit';
import type { PDFDocumentOptions } from 'pdfkit';
import { createCanvas, loadImage } from '@napi-rs/canvas';

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

/** PNG 600x400 : fond blanc, rectangle bleu, barres noires (contraste OCR-friendly). */
function makeTestPng(): Buffer {
  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 600, 400);
  ctx.fillStyle = '#1a3c8f';
  ctx.fillRect(50, 50, 500, 120);
  ctx.fillStyle = '#000000';
  for (let i = 0; i < 10; i++) ctx.fillRect(50 + i * 50, 250, 20, 100);
  return canvas.toBuffer('image/png');
}

async function scannedPdf(): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'scan' } } as PDFDocumentOptions);
  const done = collect(doc);
  doc.image(makeTestPng(), 0, 0, { fit: [595.28, 841.89] });
  doc.end();
  return done;
}

async function vectorPdf(): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: 'texte' } } as PDFDocumentOptions);
  const done = collect(doc);
  doc.fontSize(18).text('Acte de naissance — page purement vectorielle, aucune image.', 40, 60);
  doc.end();
  return done;
}

describe('pdf-rasterizer (chemin PDF scanné)', () => {
  beforeAll(() => {
    // pdfjs exige quelques globales DOM même sans page.render — installées
    // indirectement par rasterizePdf, mais on les garantit pour les imports.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const canvas = require('@napi-rs/canvas');
    (globalThis as any).DOMMatrix ??= canvas.DOMMatrix;
    (globalThis as any).Path2D ??= canvas.Path2D;
    (globalThis as any).ImageData ??= canvas.ImageData;
  });

  it('extrait l’image d’une page scannée en JPEG à résolution native', async () => {
    const { rasterizePdf } = await import('../src/modules/subscription/pdf-rasterizer');
    const images = await rasterizePdf(await scannedPdf());
    // La page contient une seule image bitmap (le PNG embarqué par pdfkit)…
    expect(images.length).toBe(1);
    // Un JPEG d'aplats compresse très court : on borne bas.
    expect(images[0].length).toBeGreaterThan(1_000);
    expect(images[0][0]).toBe(0xff); // magie JPEG
    expect(images[0][1]).toBe(0xd8);
    // … ré-encodée à sa résolution native (600x400, pas la taille A4 595x842).
    const size = await loadImage(images[0]);
    expect(size.width).toBe(600);
    expect(size.height).toBe(400);
  });

  it('retourne [] sur un PDF purement vectoriel (aucune image à extraire)', async () => {
    const { rasterizePdf } = await import('../src/modules/subscription/pdf-rasterizer');
    const images = await rasterizePdf(await vectorPdf());
    expect(images).toEqual([]);
  });
});
