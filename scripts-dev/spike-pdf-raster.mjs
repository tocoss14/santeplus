/**
 * Spike jetable : rasterisation d'un PDF via pdfjs-dist (build legacy Node) + @napi-rs/canvas.
 * Sert à valider l'approche avant intégration dans apps/api/src/modules/subscription/pdf-rasterizer.ts.
 *
 * Usage : node scripts-dev/spike-pdf-raster.mjs [chemin-pdf]
 */
import { createCanvas, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

globalThis.DOMMatrix ??= DOMMatrix;
globalThis.Path2D ??= Path2D;
globalThis.ImageData ??= ImageData;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdfPath = process.argv[2] ?? join(root, '.freebuff', 'acte-test.pdf');

const require = createRequire(import.meta.url);
// Les exports du package ne listent pas standard_fonts/ : on déduit la racine
// du package depuis le chemin réel du build résolu.
const buildPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
const pkgRoot = buildPath.replace(/[\\/]legacy[\\/]build[\\/].*$/, '');
const stdFonts = pkgRoot.split('\\').join('/') + '/standard_fonts/';
console.log('standardFontDataUrl:', stdFonts);

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
console.log('pdfjs version:', pdfjs.version);

const data = new Uint8Array(readFileSync(pdfPath));
const doc = await pdfjs.getDocument({
  data,
  useSystemFonts: false,
  disableFontFace: true,
  isEvalSupported: false,
  standardFontDataUrl: stdFonts,
}).promise;
console.log('pages:', doc.numPages);

const page = await doc.getPage(1);
const vp0 = page.getViewport({ scale: 1 });
console.log('viewport 1x:', vp0.width, 'x', vp0.height);

const scale = Math.min(3, 2200 / Math.max(vp0.width, vp0.height));
const vp = page.getViewport({ scale });
const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);
await page.render({ canvasContext: ctx, viewport: vp }).promise;

const out = join(root, '.freebuff', 'spike-raster.png');
const { writeFileSync } = await import('fs');
writeFileSync(out, canvas.toBuffer('image/png'));
console.log('PNG raster écrit:', out, canvas.width, 'x', canvas.height);
console.log('SPIKE OK');
