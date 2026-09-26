/**
 * Fixture « acte illisible » : .freebuff/acte-test-illisible.png
 *
 * Image volontairement dépourvue de texte (dégradés + formes pleines) :
 * l'OCR n'y trouve aucun champ exploitable, l'API répond { extracted: null }
 * et le wizard doit conserver la saisie manuelle (aucun écrasement).
 *
 * Usage : node scripts-dev/make-birth-cert-unreadable-fixture.mjs
 */
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api', 'package.json'));
const canvas = require('@napi-rs/canvas');

const W = 800, H = 1100;
const c = canvas.createCanvas(W, H);
const ctx = c.getContext('2d');

// Fond dégradé coloré : rien qui ressemble à un document noir sur blanc.
const g = ctx.createLinearGradient(0, 0, W, H);
g.addColorStop(0, '#204a6e');
g.addColorStop(0.5, '#7a4a2a');
g.addColorStop(1, '#2c5c33');
ctx.fillStyle = g;
ctx.fillRect(0, 0, W, H);

// Formes pleines déterministes : du bruit visuel, aucun glyphe lisible.
const palette = ['#d8b13c', '#8c2f2f', '#315d8c', '#5b3a6e', '#3f6e4f'];
let i = 0;
for (let y = 40; y < H - 40; y += 90) {
  for (let x = 40; x < W - 40; x += 130) {
    ctx.fillStyle = palette[i % palette.length];
    if (i % 2 === 0) {
      ctx.beginPath();
      ctx.ellipse(x + 45, y + 30, 55, 28, (i % 4) * Math.PI / 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, 100, 55);
    }
    i++;
  }
}

// Bandes horizontales façon « lignes » mais trop épaisses et brouillées pour
 // porter des caractères : l'OCR peut y lire du bruit, jamais un champ complet.
ctx.globalAlpha = 0.55;
for (let y = 80; y < H - 60; y += 46) {
  ctx.fillStyle = y % 3 === 0 ? '#101820' : '#e8e0d0';
  ctx.fillRect(60, y, W - 120 - (y % 5) * 24, 26);
}
ctx.globalAlpha = 1;

mkdirSync(join(root, '.freebuff'), { recursive: true });
writeFileSync(join(root, '.freebuff', 'acte-test-illisible.png'), c.toBuffer('image/png'));
console.log('OK  .freebuff/acte-test-illisible.png (' + W + 'x' + H + ')');
process.exit(0);
