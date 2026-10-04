/**
 * Matrice de bisect du segfault de page.render :
 *   - chargeur pdfjs : require(esm) (mode compilé CJS) vs import() (ESM)
 *   - PDF : acte-test.pdf (texte natif) vs acte-test-scanne.pdf (JPEG embarqué)
 *
 * Usage : node scripts-dev/bisect-raster.mjs <require|import> <natif|scanne>
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [loader, which] = [process.argv[2] ?? 'require', process.argv[3] ?? 'scanne'];
const pdfPath = join(root, '.freebuff', which === 'natif' ? 'acte-test.pdf' : 'acte-test-scanne.pdf');

console.log(`=== chargeur=${loader} pdf=${which} ===`);

const require_ = createRequire(join(root, 'apps/api', 'package.json'));
const canvas = require_('@napi-rs/canvas');
globalThis.DOMMatrix ??= canvas.DOMMatrix;
globalThis.Path2D ??= canvas.Path2D;
globalThis.ImageData ??= canvas.ImageData;

const pdfjs = loader === 'require'
  ? require_('pdfjs-dist/legacy/build/pdf.mjs')
  : await import('pdfjs-dist/legacy/build/pdf.mjs');
console.log('pdfjs chargé, version', pdfjs.version);

const data = new Uint8Array(readFileSync(pdfPath));
const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, isEvalSupported: false }).promise;
console.log('pages =', doc.numPages);

const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 2 });
console.log('canvas', Math.round(vp.width), 'x', Math.round(vp.height));
const skia = canvas.createCanvas(Math.round(vp.width), Math.round(vp.height));
const ctx = skia.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, skia.width, skia.height);

console.log('page.render…');
await page.render({ canvasContext: ctx, viewport: vp }).promise;
console.log('render OK');

const buf = await skia.encode('jpeg', 0.85);
console.log('encode OK,', buf.length, 'octets');
console.log('MATRICE OK');
process.exit(0);
