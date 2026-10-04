/**
 * Mesure du coût OCR de l'acte de naissance, passe par passe (sans serveur).
 *
 * Refait tourner la logique d'extractFromImage (module compilé) sur les
 * fixtures : passe OCR droite, OSD + seconde passe si pivoté, verdict
 * « aucun champ » sur l'illisible. Montre aussi ce que paie une
 * re-soumission lorsque le résultat est en cache (sha256 + lecture Map).
 *
 * Prérequis : `npx tsc -p tsconfig.build.json` (les modules sont importés
 * depuis apps/api/dist) et fixtures .freebuff/ générées.
 *
 * Usage : node scripts-dev/bench-birth-cert-ocr.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['acte-test.png', 'acte-test-pivote.png', 'acte-test-illisible.png']) {
  if (!existsSync(join(root, '.freebuff', f))) {
    const r = spawnSync(process.execPath, [join(root, 'scripts-dev', 'make-birth-cert-fixture.mjs')], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('Génération des fixtures impossible');
    break;
  }
}

const require = createRequire(join(root, 'apps/api', 'package.json'));
const canvas = require('@napi-rs/canvas');
const dist = (p) => pathToFileURL(join(root, 'apps/api/dist/modules/subscription', p)).href;
const { uprightImage, toPng, cropCenterBand } = await import(dist('image-orientation.js'));
const { parseBirthCertificateText } = await import(dist('birth-certificate-parser.js'));

const ms = (d) => (Math.round(d * 10) / 10).toLocaleString('fr-FR');

let p = performance.now();
const { createWorker } = require('tesseract.js');
const ocr = await createWorker('fra+eng');
console.log(`boot worker OCR (fra+eng) : ${ms(performance.now() - p)} ms\n`);

/** Même cascade que extractFromImage : par format — paysage : bande → OSD+redressée → filet ; portrait : pleine passe → OSD. */
async function extract(buffer) {
  const phases = {};
  const img = await canvas.loadImage(buffer);

  if (img.width > img.height) {
    p = performance.now();
    const bandText = await ocr.recognize(await cropCenterBand(img));
    phases.bande = performance.now() - p;
    const probe = parseBirthCertificateText(bandText.data?.text ?? '');
    if (probe?.firstName && probe.lastName && probe.birthDate) return { parsed: probe, phases };

    p = performance.now();
    const up = await uprightImage(img); // 1er appel : inclut le boot du worker OSD
    phases.osd = performance.now() - p;

    if (up.rotationApplied !== 0) {
      p = performance.now();
      const retry = await ocr.recognize(await toPng(up.canvas));
      phases.redressee = performance.now() - p;
      const upright = parseBirthCertificateText(retry.data?.text ?? '');
      if (upright?.firstName && upright.lastName && upright.birthDate) return { parsed: upright, phases, rotation: up.rotationApplied };
    }

    p = performance.now();
    const full = await ocr.recognize(buffer);
    phases.filet = performance.now() - p;
    return { parsed: parseBirthCertificateText(full.data?.text ?? ''), phases, rotation: up.rotationApplied };
  }

  p = performance.now();
  const { data } = await ocr.recognize(buffer);
  phases.pleinte1 = performance.now() - p;
  const parsed = parseBirthCertificateText(data?.text ?? '');
  if (parsed?.firstName && parsed.lastName && parsed.birthDate) return { parsed, phases };

  p = performance.now();
  const up = await uprightImage(img);
  phases.osd = performance.now() - p;
  if (up.rotationApplied === 0) return { parsed, phases, rotation: 0 };

  p = performance.now();
  const retry = await ocr.recognize(await toPng(up.canvas));
  phases.redressee = performance.now() - p;
  return { parsed: parseBirthCertificateText(retry.data?.text ?? ''), phases, rotation: up.rotationApplied };
}

for (const [label, file] of [
  ['acte droit ', 'acte-test.png'],
  ['acte pivoté 90° (1er appel : boot OSD inclus)', 'acte-test-pivote-90.png'],
  ['acte pivoté 90° (appel suivant)', 'acte-test-pivote-90.png'],
  ['acte pivoté 180°', 'acte-test-pivote-180.png'],
  ['acte pivoté 270°', 'acte-test-pivote-270.png'],
  ['acte illisible', 'acte-test-illisible.png'],
]) {
  const r = await extract(readFileSync(join(root, '.freebuff', file)));
  const essential = r.parsed?.firstName && r.parsed?.lastName && r.parsed?.birthDate;
  const parts = [];
  if (r.phases.bande) parts.push(`bande ${ms(r.phases.bande)} ms`);
  if (r.phases.pleinte1) parts.push(`pleine passe ${ms(r.phases.pleinte1)} ms`);
  if (r.phases.osd) parts.push(`OSD ${ms(r.phases.osd)} ms (rotation ${r.rotation}°)`);
  if (r.phases.redressee) parts.push(`redressée ${ms(r.phases.redressee)} ms`);
  if (r.phases.filet) parts.push(`filet ${ms(r.phases.filet)} ms`);
  const total = Object.values(r.phases).reduce((a, b) => a + b, 0);
  console.log(`${label}\n  ${parts.join(' | ')} | total ${ms(total)} ms | ${essential ? 'champs extraits' : 'null (saisie manuelle)'}`);
}

// Ce que paie une re-soumission lorsque le résultat est déjà en cache.
const buf = readFileSync(join(root, '.freebuff', 'acte-test.png'));
const cache = new Map([[createHash('sha256').update(buf).digest('hex'), { at: Date.now(), result: null }]]);
p = performance.now();
void cache.get(createHash('sha256').update(buf).digest('hex'));
console.log(`\nre-soumission avec cache (sha256 + Map.get) : ${(performance.now() - p).toFixed(3)} ms`);
process.exit(0);
