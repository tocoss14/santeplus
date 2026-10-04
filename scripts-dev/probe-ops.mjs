/**
 * Sonde « operator list » : au lieu de page.render (dont le pipeline image
 * segfaulte avec Skia sur ce poste), on récupère les images décodées de la
 * page via getOperatorList + page.objs — décodage purement JS/WASM côté
 * worker, aucune opération canvas par pdf.js.
 *
 * Usage : node scripts-dev/probe-ops.mjs <natif|scanne>
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api', 'package.json'));
const which = process.argv[2] ?? 'scanne';
const pdfPath = join(root, '.freebuff', which === 'natif' ? 'acte-test.pdf' : 'acte-test-scanne.pdf');

const canvas = require('@napi-rs/canvas');
globalThis.DOMMatrix ??= canvas.DOMMatrix;
globalThis.Path2D ??= canvas.Path2D;
globalThis.ImageData ??= canvas.ImageData;

const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
console.log('pdfjs', pdfjs.version);

const data = new Uint8Array(readFileSync(pdfPath));
const doc = await pdfjs.getDocument({
  data,
  useSystemFonts: false,
  disableFontFace: true,
  isEvalSupported: false,
  isOffscreenCanvasSupported: false, // force le chemin « données brutes » des images
}).promise;
console.log('pages =', doc.numPages);

const page = await doc.getPage(1);
console.log('getOperatorList…');
const opList = await page.getOperatorList();

const OPS = pdfjs.OPS;
const imageOps = ['paintImageXObject', 'paintInlineImageXObject', 'paintImageXObjectRepeat'];
let found = 0;
for (let i = 0; i < opList.fnArray.length; i++) {
  const fn = opList.fnArray[i];
  const name = Object.keys(OPS).find((k) => OPS[k] === fn) ?? `op#${fn}`;
  if (!imageOps.some((o) => name.startsWith(o))) continue;
  found++;
  const args = opList.argsArray[i];
  console.log(`op ${i}: ${name}, args0 =`, typeof args[0] === 'object' ? JSON.stringify(Object.keys(args[0])) : args[0]);

  let img;
  if (name.startsWith('paintInlineImage')) {
    img = args[0];
  } else if (typeof args[0] === 'string') {
    const objId = args[0];
    img = page.objs?.has?.(objId) ? page.objs.get(objId) : await new Promise((res) => page.objs.get(objId, res));
  }
  if (!img) continue;
  const keys = Object.keys(img);
  console.log(`   image: ${img.width}x${img.height}, clés=[${keys.join(',')}], kind=${img.kind ?? 'n/a'}, dataLen=${img.data?.length ?? 'null'}, bitmap=${img.bitmap ? 'oui' : 'non'}`);
  if (img.data) {
    // Peinture directe avec l'opération prouvée stable : putImageData → JPEG
    const c = canvas.createCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.putImageData(new canvas.ImageData(new Uint8ClampedArray(img.data.buffer ?? img.data), img.width, img.height), 0, 0);
    const jpg = await c.encode('jpeg', 0.85);
    const { writeFileSync } = await import('fs');
    writeFileSync(join(root, '.freebuff', `probe-ops-${found}.jpg`), jpg);
    console.log(`   → .freebuff/probe-ops-${found}.jpg (${jpg.length} o)`);
  }
}
console.log(found ? 'SONDE OK — images décodées récupérées' : 'SONDE OK — aucune image (page vectorielle)');
process.exit(0);
