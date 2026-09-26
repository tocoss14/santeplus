/**
 * Fixtures pivotées pour la détection d'orientation.
 *
 * Paramétrable par degrés (rotation HORAIRE appliquée à l'acte droit) :
 *   node scripts-dev/make-birth-cert-rotated-fixture.mjs [90] [180] [270]
 * Sans argument : génère les trois orientations. Pour chaque degré D :
 *   .freebuff/acte-test-pivote-D.png        — l'image du scan pivotée de D°
 *   .freebuff/acte-test-pivote-D-scanne.pdf — PDF scanné (page A4, image pivotée embarquée)
 *
 * Sémantique OSD attendue (calibrée) : l'acte tourné de D° horaire est vu
 * par l'OSD comme nécessitant une rotation horaire de (360 − D)° pour être
 * redressé — D=90 → detect 270 ; D=180 → detect 180 ; D=270 → detect 90.
 *
 * Les anciens noms (acte-test-pivote.png / -scanne.pdf, D=90) restent
 * produits en alias pour compatibilité des usages existants.
 *
 * (Re)génère d'abord la fixture de base si nécessaire.
 */
import { createRequire } from 'module';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api', 'package.json'));

const basePng = join(root, '.freebuff', 'acte-test.png');
if (!existsSync(basePng)) {
  const r = spawnSync(process.execPath, [join(root, 'scripts-dev', 'make-birth-cert-fixture.mjs')], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Impossible de générer la fixture de base');
}

const canvas = require('@napi-rs/canvas');
const img = await canvas.loadImage(basePng);
mkdirSync(join(root, '.freebuff'), { recursive: true });

const args = process.argv.slice(2).map(Number).filter((n) => [90, 180, 270].includes(n));
const degrees = args.length ? [...new Set(args)] : [90, 180, 270];

for (const D of degrees) {
  // Rotation D° horaire : le haut du document part vers la droite.
  const swapped = D !== 180; // 90 et 270 échangent les dimensions, 180 non
  const c = canvas.createCanvas(swapped ? img.height : img.width, swapped ? img.width : img.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((D * Math.PI) / 180);
  ctx.translate(-img.width / 2, -img.height / 2);
  ctx.drawImage(img, 0, 0);
  writeFileSync(join(root, '.freebuff', `acte-test-pivote-${D}.png`), c.toBuffer('image/png'));
  console.log(`OK  .freebuff/acte-test-pivote-${D}.png (${c.width}x${c.height})`);

  // PDF scanné : la page reste A4 portrait, l'image embarquée est la version pivotée.
  const PDFDocument = require('pdfkit');
  const chunks = [];
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Acte pivoté ${D}°` } });
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', resolve));
  doc.image(join(root, '.freebuff', `acte-test-pivote-${D}.png`), 0, 0, { fit: [595.28, 841.89], align: 'center', valign: 'center' });
  doc.end();
  await done;
  writeFileSync(join(root, '.freebuff', `acte-test-pivote-${D}-scanne.pdf`), Buffer.concat(chunks));
  console.log(`OK  .freebuff/acte-test-pivote-${D}-scanne.pdf`);

  // Alias legacy pour D=90 (usages existants : preuve live, E2E, spike).
  if (D === 90) {
    writeFileSync(join(root, '.freebuff', 'acte-test-pivote.png'), readFileSync(join(root, '.freebuff', 'acte-test-pivote-90.png')));
    writeFileSync(join(root, '.freebuff', 'acte-test-pivote-scanne.pdf'), readFileSync(join(root, '.freebuff', 'acte-test-pivote-90-scanne.pdf')));
  }
}

process.exit(0);
