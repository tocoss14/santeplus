/**
 * Repro minimal du chemin « PDF scanné » avec le code COMPILÉ de l'API :
 * rasterisation (pdf-rasterizer.js dist) puis OCR tesseract — hors Nest.
 * Sert à isoler le crash natif observé dans le process API.
 *
 * Usage : node scripts-dev/repro-raster-ocr.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scan = join(root, '.freebuff', 'acte-test-scanne.pdf');

const distUrl = pathToFileURL(join(root, 'apps/api', 'dist', 'modules', 'subscription', 'pdf-rasterizer.js')).href;
console.log('[1] import dist:', distUrl);
const { rasterizePdf } = await import(distUrl);

console.log('[2] rasterisation…');
const pages = await rasterizePdf(readFileSync(scan));
console.log('[3] pages rendues:', pages.map((b) => `${b.length} o`).join(', '));

console.log('[4] OCR tesseract…');
const { createWorker } = await import('tesseract.js');
const worker = await createWorker('fra+eng');
const { data } = await worker.recognize(pages[0]);
await worker.terminate();
console.log('[5] texte OCR (200 premiers car.):');
console.log(data.text.trim().slice(0, 200));
console.log('REPRO OK');
process.exit(0);
