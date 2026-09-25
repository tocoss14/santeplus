/**
 * Rasterisation des PDF en images pour l'OCR.
 *
 * Pourquoi : tesseract.js ne décode pas les PDF, et pdf-parse n'expose que la
 * couche texte — un PDF scanné (image sous PDF, sans texte natif) est donc
 * invisible pour l'extraction.
 *
 * Comment : pdfjs-dist (build legacy Node) décode les images de chaque page via
 * getOperatorList() — le décodage des flux est purement JS/WASM côté worker —
 * puis CE module ré-encode chaque image décodée en JPEG À SA RÉSOLUTION
 * NATIVE (flip Y seul), via les opérations canvas natives stables
 * (putImageData + encode). Aucune mise à l'échelle, aucune géométrie de page :
 * un scan 300 DPI ressort en 300 DPI, ce que l'OCR lit de façon fiable.
 *
 * Pourquoi ne pas utiliser page.render() : son pipeline image interne (canvas
 * temporaires de pdf.js) provoque un segfault natif avec @napi-rs/canvas sur
 * ce poste Windows, et la composition dans la page A4 dégraderait de toute
 * façon l'image du scan (downscale 4×, texte crénelé).
 *
 * Périmètre assumé (documenté) : les PDF « scan » — typiquement l'acte
 * photographié/scanné, 1 image pleine page. Le texte vectoriel d'une page
 * hybride n'est pas restitué (il reste traité en amont par pdf-parse). Les
 * scans pivotés SONT couverts : les images rastérisées passent par
 * extractFromImage, qui redresse l'orientation via l'OSD (image-orientation.ts)
 * avant la seconde passe OCR.
 */

import type { ImageData as SkiaImageData } from '@napi-rs/canvas';
import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Pages max parcourues par document (les actes tiennent sur 1–2 pages). */
export const RASTER_MAX_PAGES = 3;
/** Durée max de la rasterisation complète (ms) — on garde ce qui a pu l'être. */
export const RASTER_TIMEOUT_MS = 20_000;
/** Images max par page (un vrai scan = 1 ; on borne les PDF pathologiques). */
const MAX_IMAGES_PER_PAGE = 4;
/** On ignore les images trop petites pour contenir du texte utile (bordures, puces). */
const MIN_USEFUL_DIM_PX = 200;
/** Plafond de dimension d'une image produite (au-delà : réduction par halvings). */
const MAX_OUTPUT_DIM_PX = 4000;

const JPEG_QUALITY = 0.85;

/** Installe les globales DOM attendues par pdf.js. Idempotent. */
function installPdfJsGlobals(): void {
  const canvas = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= canvas.DOMMatrix;
  g.Path2D ??= canvas.Path2D;
  g.ImageData ??= canvas.ImageData;
}

async function getPdfjs(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> {
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

/** Chemin disque du dossier standard_fonts de pdfjs-dist (lecture fs par la factory Node ; une URL file:// échoue). */
function standardFontsPath(): string {
  const { createRequire } = require('module') as typeof import('module');
  const req = createRequire(__filename);
  const buildPath = req.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const pkgRoot = buildPath.replace(/[\\/]legacy[\\/]build[\\/].*$/, '');
  return `${pkgRoot.replace(/\\/g, '/')}/standard_fonts/`;
}

/** Image décodée par le worker pdf.js (page.objs ou opérande inline). */
interface DecodedImage {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
}

/**
 * Convertit les données décodées pdf.js en RGBA.
 * Kinds côté worker : 1 = bitmap 1bpp (bit=1 → blanc), 2 = RGB 24 bits,
 * 3 = RGBA 32 bits. Retourne null pour tout autre cas (on saute l'image).
 */
function toRgba(img: DecodedImage, canvas: typeof import('@napi-rs/canvas')): SkiaImageData | null {
  const { width, height, kind, data } = img;
  if (!data || !(width > 0) || !(height > 0)) return null;
  const px = width * height;

  if (kind === 3) {
    if (data.length < px * 4) return null;
    return new canvas.ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, px * 4), width, height);
  }
  const rgba = new Uint8ClampedArray(px * 4);
  if (kind === 2) {
    if (data.length < px * 3) return null;
    for (let s = 0, d = 0; s < px * 3; s += 3, d += 4) {
      rgba[d] = data[s];
      rgba[d + 1] = data[s + 1];
      rgba[d + 2] = data[s + 2];
      rgba[d + 3] = 255;
    }
    return new canvas.ImageData(rgba, width, height);
  }
  if (kind === 1) {
    const rowBytes = (width + 7) >> 3;
    if (data.length < rowBytes * height) return null;
    for (let y = 0; y < height; y++) {
      const row = y * rowBytes;
      for (let x = 0; x < width; x++) {
        const bit = (data[row + (x >> 3)] >> (7 - (x & 7))) & 1;
        const d = (y * width + x) * 4;
        const v = bit ? 255 : 0;
        rgba[d] = v;
        rgba[d + 1] = v;
        rgba[d + 2] = v;
        rgba[d + 3] = 255;
      }
    }
    return new canvas.ImageData(rgba, width, height);
  }
  return null;
}

/** Réduction par halvings successifs au-delà du plafond (préserve les glyphes). */
function capDimensions(
  canvas: typeof import('@napi-rs/canvas'),
  source: import('@napi-rs/canvas').Canvas,
): import('@napi-rs/canvas').Canvas {
  let cur = source;
  while (Math.max(cur.width, cur.height) > MAX_OUTPUT_DIM_PX * 2) {
    const half = canvas.createCanvas(cur.width >> 1, cur.height >> 1);
    const hctx = half.getContext('2d');
    hctx.imageSmoothingEnabled = true;
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  return cur;
}

/** Ré-encode une image décodée en JPEG à résolution native (flip Y seul). */
async function encodeDecodedImage(img: DecodedImage, canvas: typeof import('@napi-rs/canvas')): Promise<Buffer | null> {
  if (img.width < MIN_USEFUL_DIM_PX && img.height < MIN_USEFUL_DIM_PX) return null;
  const rgba = toRgba(img, canvas);
  if (!rgba) return null;
  const skia = canvas.createCanvas(img.width, img.height);
  skia.getContext('2d').putImageData(rgba, 0, 0);
  return capDimensions(canvas, skia).encode('jpeg', JPEG_QUALITY);
}

/** Récupère l'image XObject décodée depuis page.objs (déjà présente ou à venir). */
function getDecodedXObject(page: PDFPageProxy, objId: string): Promise<DecodedImage | null> {
  const objs = (page as unknown as {
    objs: { has?: (k: string) => boolean; get: (k: string, cb?: (o: unknown) => void) => unknown };
  }).objs;
  return new Promise((resolve) => {
    try {
      if (objs.has?.(objId)) return resolve(objs.get(objId) as DecodedImage);
      objs.get(objId, (o: unknown) => resolve((o as DecodedImage) ?? null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Extrait les images bitmap d'une page, ré-encodées en JPEG résolution native.
 * Retourne [] pour une page sans image utile (vectorielle → texte natif).
 */
async function extractPageImages(
  page: PDFPageProxy,
  pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs'),
): Promise<Buffer[]> {
  const canvas = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
  const opList = await page.getOperatorList();
  const OPS = pdfjs.OPS;
  const fnArray = opList.fnArray as number[];
  const argsArray = opList.argsArray as unknown[][];
  const out: Buffer[] = [];

  for (let i = 0; i < fnArray.length && out.length < MAX_IMAGES_PER_PAGE; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    let img: DecodedImage | null | undefined;
    if (fn === OPS.paintImageXObject) {
      const key = args?.[0];
      img = key && typeof key === 'object' ? (key as DecodedImage) : typeof key === 'string' ? await getDecodedXObject(page, key) : null;
    } else if (fn === OPS.paintInlineImageXObject) {
      img = args?.[0] as DecodedImage | undefined;
    } else if (fn === OPS.paintImageMaskXObject) {
      // Masque 1bpp (scan bitonal) : échantillon 0 = encre (peinte en noir).
      const mask = args?.[0] as { data?: Uint8Array | Uint8ClampedArray; width?: number; height?: number } | undefined;
      if (mask?.data && mask.width && mask.height) {
        const rgba = new Uint8ClampedArray(mask.width * mask.height * 4);
        const packed = mask.data.length < mask.width * mask.height;
        const rowBytes = (mask.width + 7) >> 3;
        for (let y = 0; y < mask.height; y++) {
          for (let x = 0; x < mask.width; x++) {
            const sample = packed
              ? (mask.data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1
              : mask.data[y * mask.width + x] & 1;
            if (sample === 0) {
              const d = (y * mask.width + x) * 4;
              rgba[d] = 0;
              rgba[d + 1] = 0;
              rgba[d + 2] = 0;
              rgba[d + 3] = 255;
            }
          }
        }
        img = { width: mask.width, height: mask.height, kind: 3, data: rgba };
      }
    }
    if (!img) continue;
    const jpeg = await encodeDecodedImage(img, canvas);
    if (jpeg) out.push(jpeg);
  }
  return out;
}

/**
 * Extrait les images bitmap des premières pages d'un PDF (une entrée par
 * image, à résolution native). Retourne [] si rien n'est exploitable.
 */
export async function rasterizePdf(buffer: Buffer, maxPages = RASTER_MAX_PAGES): Promise<Buffer[]> {
  installPdfJsGlobals();
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: standardFontsPath(),
  }).promise;

  const deadline = Date.now() + RASTER_TIMEOUT_MS;
  const images: Buffer[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    if (i > 1 && Date.now() > deadline) break;
    const page = await doc.getPage(i);
    try {
      images.push(...(await extractPageImages(page, pdfjs)));
    } finally {
      page.cleanup();
    }
  }
  return images;
}
