/**
 * Diagnostic du raster « PDF scanné » :
 *   1. OCR de référence sur l'image brute décodée (probe-ops-1.jpg) ;
 *   2. raster via dist/pdf-rasterizer.js → analyse des pixels (boîte englobante
 *      de l'encre, proportions) pour détecter un miroir/une échelle fausse ;
 *      le JPEG est sauvé sous .freebuff/raster-debug.jpg.
 *
 * Usage : node scripts-dev/diag-raster-geometry.mjs
 */
import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api', 'package.json'));
const canvas = require('@napi-rs/canvas');

async function ocr(buf, label) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('fra+eng');
  const { data } = await worker.recognize(buf);
  await worker.terminate();
  console.log(`--- OCR ${label} (conf=${data.confidence?.toFixed?.(1) ?? 'n/a'}) ---`);
  console.log(data.text.trim().slice(0, 220) || '(vide)');
  return data.text;
}

// 1) Référence : image brute du scan (produite par probe-ops.mjs)
const raw = join(root, '.freebuff', 'probe-ops-1.jpg');
if (existsSync(raw)) {
  await ocr(readFileSync(raw), 'image BRUTE 2560x1440');
} else {
  console.log('(probe-ops-1.jpg absente — régénérer via probe-ops.mjs scanne)');
}

// 2) Raster via le module compilé
const distUrl = pathToFileURL(join(root, 'apps/api', 'dist', 'modules', 'subscription', 'pdf-rasterizer.js')).href;
const { rasterizePdf } = await import(distUrl);
const pages = await rasterizePdf(readFileSync(join(root, '.freebuff', 'acte-test-scanne.pdf')));
console.log(`\nraster: ${pages.length} page(s), ${pages.map((b) => b.length + ' o').join(', ')}`);
if (pages.length) {
  writeFileSync(join(root, '.freebuff', 'raster-debug.jpg'), pages[0]);
  const img = await canvas.loadImage(pages[0]);
  const c = canvas.createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1, ink = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) {
        ink++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  console.log(`encre: ${ink} px, bbox x[${minX}..${maxX}] y[${minY}..${maxY}] sur canvas ${c.width}x${c.height}`);
  await ocr(pages[0], 'RASTER produit');
}
process.exit(0);
