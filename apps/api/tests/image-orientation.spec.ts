/**
 * Tests du module d'orientation (redressement des scans pivotés avant OCR).
 *
 * Stratégie hermétique : on teste la géométrie pure (rotateClockwise) et la
 * sérialisation (toPng) sur des canvas Skia minuscules — pas l'OSD réel,
 * dont le démarrage (noyau legacy + données) est trop coûteux pour la suite
 * unitaire ; le chemin complet OSD → rotation → 2ᵉ passe OCR est couvert par
 * la preuve live scripts-dev/test-birth-cert-ocr.mjs (fixtures pivotées).
 */
import { describe, it, expect, vi } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { rotateClockwise, toPng, uprightImage, cropCenterBand, warmUpOsd } from '../src/modules/subscription/image-orientation';

// L'OSD réel (noyau legacy natif) n'est jamais booté dans les tests : le mock
// le rend indisponible — tous les chemins testés ici sont les fallbacks
// silencieux, et le process de test n'héberge aucun worker natif (le mélange
// tesseract-legacy + pdf.js au teardown provoquait des segfaults intermittents).
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(() => Promise.reject(new Error('OSD indisponible (mock)'))),
}));

/** Canvas w×h blanc avec un pixel rouge en (x, y). */
function canvasWithRedPixel(w: number, h: number, x: number, y: number) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(x, y, 1, 1);
  return canvas;
}

function isRed(ctx: ReturnType<typeof createCanvas>['getContext'], x: number, y: number): boolean {
  const [r, g, b] = Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
  return r > 200 && g < 60 && b < 60;
}

describe('rotateClockwise', () => {
  it('échange les dimensions pour 90° et 270°, les conserve pour 180°', () => {
    const img = createCanvas(40, 10);
    expect(rotateClockwise(img, 90).width).toBe(10);
    expect(rotateClockwise(img, 90).height).toBe(40);
    expect(rotateClockwise(img, 270).width).toBe(10);
    expect(rotateClockwise(img, 180).width).toBe(40);
    expect(rotateClockwise(img, 180).height).toBe(10);
  });

  it('déplace le pixel de coin haut-gauche vers haut-droit pour 90° (sens horaire)', () => {
    const rotated = rotateClockwise(canvasWithRedPixel(4, 2, 0, 0), 90);
    const ctx = rotated.getContext('2d');
    expect(isRed(ctx, rotated.width - 1, 0)).toBe(true); // coin haut-droit
    expect(isRed(ctx, 0, 0)).toBe(false);
  });

  it('déplace le pixel en coin opposé pour 180°', () => {
    const rotated = rotateClockwise(canvasWithRedPixel(4, 2, 0, 0), 180);
    const ctx = rotated.getContext('2d');
    expect(isRed(ctx, 3, 1)).toBe(true); // coin bas-droit
    expect(isRed(ctx, 0, 0)).toBe(false);
  });

  it('déplace le pixel de coin haut-gauche vers bas-gauche pour 270°', () => {
    const rotated = rotateClockwise(canvasWithRedPixel(4, 2, 0, 0), 270);
    const ctx = rotated.getContext('2d');
    expect(isRed(ctx, 0, rotated.height - 1)).toBe(true); // coin bas-gauche
    expect(isRed(ctx, 0, 0)).toBe(false);
  });

  it('laisse un fond blanc hors du contenu source', () => {
    const rotated = rotateClockwise(canvasWithRedPixel(4, 2, 0, 0), 90);
    const ctx = rotated.getContext('2d');
    expect(isRed(ctx, 0, rotated.height - 1)).toBe(false);
    const [r, g, b] = Array.from(ctx.getImageData(0, rotated.height - 1, 1, 1).data.slice(0, 3));
    expect([r, g, b]).toEqual([255, 255, 255]);
  });
});

describe('toPng', () => {
  it('sérialise un canvas en PNG décodable, dimensions conservées', async () => {
    const canvas = canvasWithRedPixel(6, 3, 2, 1);
    const png = await toPng(canvas);
    const img = await loadImage(png);
    expect(img.width).toBe(6);
    expect(img.height).toBe(3);
  });

  it('rastérise une Image décodée (sans .encode) en PNG équivalent', async () => {
    const png = await toPng(canvasWithRedPixel(6, 3, 2, 1));
    const img = await loadImage(png);
    const repng = await toPng(img);
    const img2 = await loadImage(repng);
    expect(img2.width).toBe(6);
    expect(img2.height).toBe(3);
  });
});

describe('cropCenterBand', () => {
  it('extrait une bande de 40 % de hauteur, centrée verticalement', async () => {
    const png = await cropCenterBand(canvasWithRedPixel(10, 100, 5, 45), 0.4);
    const band = await loadImage(png);
    expect(band.width).toBe(10);
    expect(band.height).toBe(40); // 100 × 0.4
    // Une Image décodée n'a pas de contexte : on la redessine pour lire les pixels.
    const raster = createCanvas(band.width, band.height);
    raster.getContext('2d').drawImage(band, 0, 0);
    const ctx = raster.getContext('2d');
    expect(isRed(ctx, 5, 15)).toBe(true); // pixel source (5,45) → bande y = 45−30 = 15
    expect(isRed(ctx, 5, 0)).toBe(false); // hors bande : blanc de fond
  });

  it('borne la hauteur minimale à 1 px', async () => {
    const band = await loadImage(await cropCenterBand(canvasWithRedPixel(4, 2, 0, 0), 0.4));
    expect(band.height).toBe(1);
  });
});

describe('warmUpOsd (préchauffage silencieux)', () => {
  it('se termine sans lever quand le worker OSD ne démarre pas', async () => {
    await expect(warmUpOsd()).resolves.toBeUndefined();
    // Second appel : retente (le boot est réarmé après échec) et reste silencieux.
    await expect(warmUpOsd()).resolves.toBeUndefined();
  });

  it('retombe sur l\'image d\'origine quand l\'OSD est indisponible', async () => {
    const img = await loadImage(await toPng(canvasWithRedPixel(20, 10, 0, 0)));
    const res = await uprightImage(img);
    expect(res.rotationApplied).toBe(0);
    expect(res.alreadyUpright).toBe(false);
    expect(res.canvas).toBe(img);
  });
});


