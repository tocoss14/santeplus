/**
 * Génère les pièces jointes de test pour l'extraction OCR de l'acte de naissance :
 *   .freebuff/acte-test.pdf        — PDF vectoriel (texte natif, chemin pdf-parse)
 *   .freebuff/acte-test.png        — image (chemin OCR tesseract.js)
 *   .freebuff/acte-test-scanne.pdf — PDF scanné : le PNG embarqué via pdfkit,
 *                                    SANS couche texte (chemin rasterisation + OCR)
 *
 * Sorties sous .freebuff/ (dossier ignoré par git — aucune pièce binaire dans le dépôt).
 *
 * Usage :  node scripts-dev/make-birth-cert-fixture.mjs
 */
import { chromium } from 'playwright';
import PDFDocument from 'pdfkit';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.freebuff');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { font-family: Georgia, 'Times New Roman', serif; margin: 40px; color: #111; }
  h1 { text-align: center; font-size: 22px; letter-spacing: 2px; margin-bottom: 4px; }
  h2 { text-align: center; font-size: 14px; font-weight: normal; margin-top: 0; }
  .row { margin: 14px 0; font-size: 15px; }
  .row b::after { content: " : "; }
  .footer { margin-top: auto; padding-top: 48px; font-size: 12px; color: #333; }
  /* Un acte scanné est une page A4 PORTRAIT : on force le corps à la hauteur
     A4 (viewport ci-dessous) pour que la capture — et les fixtures pivotées
     qui en dérivent — respectent la géométrie réelle des documents. */
  body { min-height: 1123px; display: flex; flex-direction: column; box-sizing: border-box; }
</style></head><body>
  <h1>RÉPUBLIQUE DU BÉNIN</h1>
  <h2>Acte de naissance — Copie intégrale</h2>
  <div class="row"><b>Prénom</b> Marie-Josée</div>
  <div class="row"><b>Nom</b> ADJOVI</div>
  <div class="row"><b>Né le</b> 12 janvier 1990</div>
  <div class="row"><b>Né à</b> Cotonou, Littoral</div>
  <div class="row"><b>Fils de</b> ADJOVI Kossi Paul et de AGBO Maguerite Ama</div>
  <div class="row"><b>N° acte</b> 1234/C/1990</div>
  <div class="footer">Dressé le 20 janvier 1990 — Registre des actes de naissance, année 1990, Cotonou.</div>
</body></html>`;

// « channel: chromium » : utilise le Chromium complet déjà installé (le headless shell
// dédié n'est pas présent sur ce poste).
const browser = await chromium.launch({ channel: 'chromium' });
try {
  // deviceScaleFactor 2 : capture ~2x, proche de la résolution d'un scan réel.
  // Viewport A4 @96 dpi (794×1123) : l'acte ressort PORTRAIT, comme un vrai scan.
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 794, height: 1123 } });
  await page.setContent(HTML, { waitUntil: 'load' });
  await page.pdf({ path: join(outDir, 'acte-test.pdf'), width: '21cm', height: '29.7cm' });
  const pngPath = join(outDir, 'acte-test.png');
  await page.screenshot({ path: pngPath, fullPage: true });

  // PDF scanné : le PNG seul, embarqué sans aucune couche texte.
  const chunks = [];
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Acte de naissance' } });
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', resolve));
  doc.image(pngPath, 0, 0, { fit: [595.28, 841.89], align: 'center', valign: 'center' });
  doc.end();
  await done;
  writeFileSync(join(outDir, 'acte-test-scanne.pdf'), Buffer.concat(chunks));

  console.log('OK  acte-test.pdf + acte-test.png + acte-test-scanne.pdf générés sous .freebuff/');
} finally {
  await browser.close();
}
