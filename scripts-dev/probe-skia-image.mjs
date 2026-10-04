/**
 * Repro fidèle de la séquence interne de pdf.js lors du rendu d'une image :
 *   canvas temporaire → putImageData (RGB décodé) → drawImage(canvas, transform)
 * plus createPattern(canvas), utilisé par les motifs/tuiles. Chaque étape est
 * isolée pour identifier l'opération Skia qui segfaulte.
 *
 * Usage : node scripts-dev/probe-skia-image.mjs
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api', 'package.json'));
const canvas = require('@napi-rs/canvas');

console.log('1: createCanvas 1191x1684 + getContext');
const target = canvas.createCanvas(1191, 1684);
const tctx = target.getContext('2d');
tctx.fillStyle = '#fff';
tctx.fillRect(0, 0, target.width, target.height);

console.log('2: canvas temporaire 1191x1684');
const tmp = canvas.createCanvas(1191, 1684);
const tmpctx = tmp.getContext('2d');

console.log('3: ImageData 1191x1684 + remplissage');
const img = new canvas.ImageData(1191, 1684);
const d = img.data;
for (let i = 0; i < d.length; i += 4) {
  d[i] = 200; d[i + 1] = 210; d[i + 2] = 220; d[i + 3] = 255;
}

console.log('4: tmpctx.putImageData');
tmpctx.putImageData(img, 0, 0);

console.log('5: tctx.drawImage(tmp) avec transform (échelle 1.5, translaté)');
tctx.save();
tctx.translate(100, 150);
tctx.scale(1.5, 1.5);
tctx.drawImage(tmp, 0, 0);
tctx.restore();

console.log('6: createPattern(canvas)');
const pat = tctx.createPattern(tmp, 'repeat');

console.log('7: fillRect avec pattern');
if (pat) {
  tctx.fillStyle = pat;
  tctx.fillRect(0, 0, 500, 500);
}

console.log('8: encode jpeg');
const buf = await target.encode('jpeg', 0.85);
console.log('PROBE OK,', buf.length, 'octets');
process.exit(0);
