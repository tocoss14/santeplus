/**
 * Spike OSD round 2 : la sémantique de correction.
 * detect() sur le pivoté renvoie 270 ; hypothèse : rotation HORAIRE de
 * orientation_degrees ramène le document droit. On le vérifie avec le worker
 * de production (fra+eng, LSTM) sur chaque rotation candidate.
 *
 * Usage : node scripts-dev/spike-osd.mjs
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api', 'package.json'));
const canvas = require('@napi-rs/canvas');
const { createCanvas, loadImage } = canvas;

const { createWorker } = await import('tesseract.js');

/** Rotation horaire de deg degrés (0/90/180/270) d'une image canvas → PNG. */
function rotate(img, deg) {
  const swapped = deg === 90 || deg === 270;
  const out = createCanvas(swapped ? img.height : img.width, swapped ? img.width : img.height);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-img.width / 2, -img.height / 2);
  ctx.drawImage(img, 0, 0);
  return out.toBuffer('image/png');
}

const img = await loadImage(join(root, '.freebuff', 'acte-test-pivote.png'));
const rightPng = rotate(await loadImage(join(root, '.freebuff', 'acte-test.png')), 0);

// Worker OSD (noyau legacy requis pour detect), aucune langue OCR chargée.
const osdWorker = await createWorker('osd', 0, { legacyCore: true });
const det = await osdWorker.detect(rightPng);
console.log('detect DROIT     :', JSON.stringify(det.data));
const det2 = await osdWorker.detect(rotate(img, 0));
console.log('detect PIVOTÉ    :', JSON.stringify(det2.data));
await osdWorker.terminate();

// Worker de production (LSTM fra+eng) : OCR après rotation candidate.
const ocrWorker = await createWorker('fra+eng');
for (const deg of [0, 90, 180, 270]) {
  const { data } = await ocrWorker.recognize(rotate(img, deg));
  const head = data.text.trim().replace(/\s+/g, ' ').slice(0, 90);
  const conf = typeof data.confidence === 'number' ? data.confidence.toFixed(1) : '?';
  console.log(`OCR pivoté tourné de ${deg}°h (conf=${conf}) : "${head}"`);
}
await ocrWorker.terminate();
console.log('SPIKE OSD 2 TERMINÉ');
process.exit(0);
