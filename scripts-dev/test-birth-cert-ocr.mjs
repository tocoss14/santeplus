/**
 * Preuve live de l'extraction OCR de l'acte de naissance, bout en bout :
 *   login → upload → POST subscription/birth-certificate/extract
 * Neuf chemins couverts : PDF natif (pdf-parse), image (OCR direct),
 * PDF scanné (rasterisation pdfjs+canvas puis OCR), plus les trois
 * orientations pivotées (90°, 180°, 270° — chacune en image ET en PDF
 * scanné) : l'OCR droit n'extrait rien, l'OSD détecte l'orientation, la
 * rotation redresse et la seconde passe OCR extrait les champs
 * (image-orientation.ts).
 *
 * Prérequis : API sur PORT (défaut 4100) — `cd apps/api && PORT=4100 node dist/main.js`.
 * Attachements : scripts-dev/make-birth-cert-fixture.mjs les crée au besoin.
 *
 * Usage :  node scripts-dev/test-birth-cert-ocr.mjs [port]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = `http://127.0.0.1:${process.argv[2] ?? process.env.PORT ?? '4100'}/api`;

const PDF = join(root, '.freebuff', 'acte-test.pdf');
const PNG = join(root, '.freebuff', 'acte-test.png');
const SCAN = join(root, '.freebuff', 'acte-test-scanne.pdf');
if (!existsSync(PDF) || !existsSync(PNG) || !existsSync(SCAN)) {
  console.log('Attachements absents — génération…');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [join(root, 'scripts-dev', 'make-birth-cert-fixture.mjs')], {
    cwd: root, stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('Génération des attachements impossible');
}
const ROT_DEGREES = [90, 180, 270];
const rotPngs = ROT_DEGREES.map((D) => join(root, '.freebuff', `acte-test-pivote-${D}.png`));
const rotScans = ROT_DEGREES.map((D) => join(root, '.freebuff', `acte-test-pivote-${D}-scanne.pdf`));
if ([...rotPngs, ...rotScans].some((f) => !existsSync(f))) {
  console.log('Fixtures pivotées absentes — génération…');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [join(root, 'scripts-dev', 'make-birth-cert-rotated-fixture.mjs')], {
    cwd: root, stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('Génération des fixtures pivotées impossible');
}

const j = async (res) => {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
};

console.log(`API: ${API}`);
const health = await j(await fetch(`${API}/health`));
console.log('health:', health.status ?? JSON.stringify(health));

// 1) Login (compte de démo ; le seed existe déjà — 28 users en base)
const login = await j(await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.DEMO_EMAIL ?? 'admin@santeplus.bj', password: 'Demo1234!' }),
}));
const token = login.accessToken;
console.log('login: OK (', login.user?.email ?? 'n/a', ')');

// 2) Upload + extraction pour un fichier donné
const run = async (path, label, mime, filename) => {
  const buf = readFileSync(path);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime }), filename);
  const up = await j(await fetch(`${API}/subscription/birth-certificate/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  }));
  console.log(`upload ${label}: fileId=${up.fileId}`);
  const ex = await j(await fetch(`${API}/subscription/birth-certificate/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId: up.fileId }),
  }));
  console.log(`extract ${label}:`, JSON.stringify(ex.extracted, (k, v) => (k === 'birthDate' && v ? String(v).slice(0, 10) : v), 2));
  return ex.extracted;
};

const results = {};
results.pdf = await run(PDF, 'PDF NATIF ', 'application/pdf', 'acte.pdf');
results.png = await run(PNG, 'IMAGE     ', 'image/png', 'acte.png');
results.scan = await run(SCAN, 'PDF SCANNÉ', 'application/pdf', 'acte-scanne.pdf');
for (const D of ROT_DEGREES) {
  results[`rot${D}Png`] = await run(rotPngs[ROT_DEGREES.indexOf(D)], `IMAGE ${D}°    `, 'image/png', `acte-pivote-${D}.png`);
  results[`rot${D}Scan`] = await run(rotScans[ROT_DEGREES.indexOf(D)], `PDF ${D}°      `, 'application/pdf', `acte-pivote-${D}-scanne.pdf`);
}

// 3) Vérification des attentes
const expected = { lastName: 'ADJOVI', birthDate: '1990-01-12', birthPlace: 'Cotonou' };
const check = (ex, label) => {
  const ok =
    ex && ex.lastName === expected.lastName &&
    /marie-jos/i.test(ex.firstName) &&
    String(ex.birthDate).slice(0, 10) === expected.birthDate &&
    (ex.birthPlace ?? '').startsWith(expected.birthPlace);
  console.log(`${label}: ${ok ? '✅ conforme' : '❌ écart avec les attentes'}`);
  return ok;
};
const okPdf = check(results.pdf, 'PDF natif    ');
const okPng = check(results.png, 'Image        ');
const okScan = check(results.scan, 'PDF scanné   ');
const okRot = ROT_DEGREES.map((D) =>
  check(results[`rot${D}Png`], `Image ${D}°     `) && check(results[`rot${D}Scan`], `PDF ${D}°       `),
);

process.exit(okPdf && okPng && okScan && okRot.every(Boolean) ? 0 : 1);
