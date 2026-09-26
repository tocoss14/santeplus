/**
 * Détection et correction d'orientation des scans pivotés, avant OCR.
 *
 * Un acte scanné peut être stocké de travers (téléphone en paysage, scan
 * portrait/paysage) : l'OCR lit alors du texte couché et n'extrait rien.
 * Tesseract expose l'OSD (orientation & script detection) via worker.detect()
 * — qui exige le noyau legacy — et renvoie orientation_degrees ∈ {0, 90, 180,
 * 270} : la rotation HORAIRE à appliquer pour redresser le document.
 * (Calibré sur des actes de test : image pivotée de 90° horaire → detect
 * renvoie 270 ; une rotation horaire de 270° restitue un OCR à conf 94.)
 *
 * La détection n'est pas gratuite (~1–2 s) et l'OSD se trompe parfois : elle
 * n'est relais qu'après l'échec d'une bande centrale (voir cropCenterBand),
 * avec un seuil de confiance, et reste une heuristique best-effort (la
 * pleine passe en filet puis la saisie manuelle terminent la cascade).
 */

import type { Canvas as SkiaCanvas, Image as SkiaImage } from '@napi-rs/canvas';

/** Source raster acceptée : canvas dessiné ou image décodée (loadImage). */
export type RasterSource = SkiaCanvas | SkiaImage;

/** Confiance minimale de l'OSD pour oser une rotation (échelle tesseract ~0–20). */
const OSD_MIN_CONFIDENCE = 3;

/** Degrés horaires admis (OSD tesseract). */
const VALID_DEGREES = [0, 90, 180, 270] as const;
type Degree = (typeof VALID_DEGREES)[number];

let osdWorkerPromise: Promise<any> | null = null;

/** Worker OSD paresseux et unique (noyau legacy complet, requis par detect). */
async function getOsdWorker(): Promise<any> {
  if (!osdWorkerPromise) {
    const { createWorker } = await import('tesseract.js');
    osdWorkerPromise = createWorker('osd', 0, { legacyCore: true }).catch((e) => {
      osdWorkerPromise = null; // retenter au prochain appel en cas d'échec de boot
      throw e;
    });
  }
  return osdWorkerPromise;
}

/** Sérialise la source en PNG (les `Image` sont rasterisées d'abord). */
export async function toPng(source: RasterSource): Promise<Buffer> {
  if (typeof (source as SkiaCanvas).encode === 'function') {
    return (source as SkiaCanvas).encode('png');
  }
  const canvas = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
  const flat = canvas.createCanvas(source.width, source.height);
  flat.getContext('2d').drawImage(source, 0, 0);
  return flat.encode('png');
}

/** Rotation horaire de deg degrés, fond blanc (scan = papier). */
export function rotateClockwise(img: RasterSource, deg: Degree): SkiaCanvas {
  if (deg === 0) return img as SkiaCanvas;
  const canvas = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
  const swapped = deg === 90 || deg === 270;
  const out = canvas.createCanvas(swapped ? img.height : img.width, swapped ? img.width : img.height);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-img.width / 2, -img.height / 2);
  ctx.drawImage(img, 0, 0);
  return out;
}

export interface UprightResult {
  canvas: RasterSource;
  /** Rotation appliquée en degrés horaires (0 si aucune). */
  rotationApplied: Degree;
  /** True si l'OSD a lui-même jugé l'image droite (pas d'essai OCR nécessaire). */
  alreadyUpright: boolean;
}

/**
 * Bande centrale horizontale d'une image, sérialisée en PNG : matière à une
 * passe OCR légère, utilisée quand l'image est PAYSAGE — un acte étant
 * portrait, un scan paysage est presque toujours pivoté de 90/270° et sa
 * pleine passe ne lirait que du texte couché (~2,2 s perdus). Sur un vrai
 * document paysage, la bande centrale suffit souvent à prouver la lisibilité
 * (fraction paramétrable ; il lui faut ≥ 75 % de hauteur sur un acte portrait
 * pour porter tous les champs — mesuré, c'est pourquoi ce chemin est réservé
 * au paysage). Sinon, l'appelant relance l'OSD puis une passe pleine en filet.
 */
export async function cropCenterBand(source: RasterSource, fraction = 0.4): Promise<Buffer> {
  const canvas = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
  const h = Math.max(1, Math.round(source.height * fraction));
  const band = canvas.createCanvas(source.width, h);
  const ctx = band.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, band.width, band.height);
  ctx.drawImage(source, 0, Math.round((source.height - h) / 2), source.width, h, 0, 0, source.width, h);
  return band.encode('png');
}

/**
 * Tente de redresser une image via l'OSD. Retourne l'image d'origine si
 * l'OSD est indisponible ou peu confiant (best-effort, jamais bloquant).
 */
export async function uprightImage(image: RasterSource): Promise<UprightResult> {
  const fallback = { canvas: image, rotationApplied: 0 as Degree, alreadyUpright: false };
  try {
    const worker = await getOsdWorker();
    // L'OSD juge l'orientation du TEXTE, pas du papier : portrait comme paysage
    // peuvent être droits selon la mise en page du document.
    const png = await toPng(image);
    const res = await worker.detect(png);
    const degrees = res?.data?.orientation_degrees;
    const confidence = res?.data?.orientation_confidence;
    if (typeof degrees !== 'number' || !VALID_DEGREES.includes(degrees as Degree)) return fallback;
    const rotation = degrees as Degree;
    if (rotation === 0 || (typeof confidence === 'number' && confidence < OSD_MIN_CONFIDENCE)) {
      return { canvas: image, rotationApplied: 0, alreadyUpright: true };
    }
    return { canvas: rotateClockwise(image, rotation), rotationApplied: rotation, alreadyUpright: false };
  } catch {
    return fallback;
  }
}
