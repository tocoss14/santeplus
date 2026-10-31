#!/usr/bin/env node
/**
 * Matrice d'horloges — détecte les tests qui ne passent qu'à certaines dates.
 *
 * Fait tourner les specs sensibles au calendrier sous plusieurs instants
 * simulés (29 février, 31 d'un mois de 31 jours, veille d'un mois de 30 jours,
 * dernier jour de l'année) en gelant `Date` via CLOCK_DATE.
 *
 * Le premier instant est un jour « ordinaire » : c'est le témoin. Tout échec
 * qui n'apparaît QUE sous une autre horloge est une bombe à retardement — du
 * code qui dépend du jour du mois ou de l'année en cours.
 *
 * Usage :
 *   node scripts-dev/clock-matrix.mjs                # matrice complète
 *   node scripts-dev/clock-matrix.mjs --clock=2028-02-29   # un seul instant
 *   node scripts-dev/clock-matrix.mjs --verbose      # sortie des échecs
 *
 * Sortie : tableau récapitulatif + détail des tests en échec ; code de sortie
 * 1 si au moins une combinaison échoue.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(ROOT, 'apps', 'api');
const OUT_DIR = path.join(API_DIR, 'node_modules', '.cache', 'clock-matrix');

/** Specs qui exercent du code lisant l'horloge courante (new Date() / Date.now). */
const SPECS = [
  'tests/analytics.spec.ts',
  'tests/financial/v2/v2-solvency-series.spec.ts',
  'tests/financial/v2/v2-solvency.spec.ts',
  'tests/financial/v2/v2-solvency-alert.spec.ts',
  'tests/payment-reconciliation.spec.ts',
  'tests/care-dossier-watch.spec.ts',
  'tests/renewal.spec.ts',
  'tests/retention.spec.ts',
  'tests/fraud.spec.ts',
  'tests/engine.spec.ts',
  'tests/engine-v2.spec.ts',
  'tests/forfait-famille-carence.spec.ts',
  'tests/quote-estimate.spec.ts',
  'tests/company-quote.spec.ts',
  'tests/cts-closure.spec.ts',
  'tests/subscription-guarantee-request.spec.ts',
  'tests/auto-approval.spec.ts',
];

const CLOCKS = [
  { label: 'jour ordinaire (témoin)', iso: '2026-09-15T12:00:00.000Z' },
  { label: '31 oct. 23:30 (mois suivant à 30 j)', iso: '2026-10-31T23:30:00.000Z' },
  { label: '31 mars 00:30 (mois précédent à 28 j)', iso: '2026-03-31T00:30:00.000Z' },
  { label: '28 févr. 23:30 (mois court)', iso: '2027-02-28T23:30:00.000Z' },
  { label: '29 févr. (bissextile)', iso: '2028-02-29T12:00:00.000Z' },
  { label: '31 déc. 23:59 (bascule d’année)', iso: '2026-12-31T23:59:59.000Z' },
];

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const onlyClock = (args.find(a => a.startsWith('--clock=')) ?? '').slice('--clock='.length);

const clocks = onlyClock ? CLOCKS.filter(c => c.iso.startsWith(onlyClock)) : CLOCKS;
if (!clocks.length) {
  console.error(`Aucune horloge ne correspond à "${onlyClock}". Connues : ${CLOCKS.map(c => c.iso.slice(0, 10)).join(', ')}`);
  process.exit(2);
}

// On lance l'entrée de vitest avec node plutôt que `npx` : pas de shell, donc
// les chemins contenant des espaces ("mutuelle santé") restent intacts.
const vitestEntry = [
  path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
  path.join(API_DIR, 'node_modules', 'vitest', 'vitest.mjs'),
].find(p => existsSync(p));
if (!vitestEntry) {
  console.error('vitest introuvable — lance `npm install` à la racine du dépôt.');
  process.exit(2);
}
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function runClock(clock) {
  const outFile = path.join(OUT_DIR, `${clock.iso.replace(/[:.]/g, '-')}.json`);
  const startedAt = Date.now();
  const res = spawnSync(
    process.execPath,
    [vitestEntry, 'run', '--config', 'vitest.clock.config.ts', '--reporter=json', `--outputFile=${outFile}`, ...SPECS],
    {
      cwd: API_DIR,
      env: { ...process.env, CLOCK_DATE: clock.iso, TZ: process.env.TZ ?? 'UTC' },
      encoding: 'utf8',
    },
  );

  let report = null;
  try {
    report = JSON.parse(readFileSync(outFile, 'utf8'));
  } catch {
    // Le reporter JSON n'a rien écrit : échec au niveau du runner (config,
    // import, process tué). On remonte la sortie brute pour diagnostiquer.
    report = null;
  }
  if (existsSync(outFile)) rmSync(outFile, { force: true });

  const failures = [];
  if (report) {
    for (const suite of report.testResults ?? []) {
      for (const t of suite.assertionResults ?? []) {
        if (t.status === 'failed') {
          failures.push({
            file: path.relative(API_DIR, suite.name).replace(/\\/g, '/'),
            title: t.fullName ?? t.title,
            message: (t.failureMessages ?? []).join('\n').split('\n').slice(0, 6).join('\n'),
          });
        }
      }
    }
  }

  return {
    clock,
    ok: Boolean(report) && report.numFailedTests === 0 && res.status === 0,
    totals: {
      files: report?.numTotalTestSuites ?? 0,
      tests: report?.numTotalTests ?? 0,
      failed: report?.numFailedTests ?? 0,
      failedFiles: report?.numFailedTestSuites ?? 0,
    },
    failures,
    crash: report ? null : `${res.stdout ?? ''}${res.stderr ?? ''}`.trim().slice(-2000),
    ms: Date.now() - startedAt,
  };
}

const results = [];
for (const clock of clocks) {
  process.stdout.write(`▶ ${clock.iso} … `);
  const r = runClock(clock);
  results.push(r);
  console.log(r.ok ? `OK (${r.totals.tests} tests, ${(r.ms / 1000).toFixed(1)} s)` : `ÉCHEC (${r.totals.failed} test(s))`);
}

const witness = results.find(r => r.clock.iso === CLOCKS[0].iso);

console.log('');
console.log('Horloge simulée                              Fichiers  Tests   Échecs  Verdict');
console.log('─'.repeat(96));
for (const r of results) {
  const verdict = r.ok ? 'vert' : witness && !witness.ok ? 'rouge (témoin aussi)' : 'BOMBE À RETARDEMENT';
  console.log(
    `${r.clock.iso}  ${String(r.totals.files).padStart(7)}  ${String(r.totals.tests).padStart(6)}  ${String(r.totals.failed).padStart(6)}  ${verdict}`,
  );
}

const failures = results.filter(r => !r.ok);
if (failures.length) {
  console.log('');
  for (const r of failures) {
    console.log(`✖ ${r.clock.iso} — ${r.clock.label}`);
    if (r.crash) {
      console.log('  le runner n’a rien produit de lisible :');
      console.log(
        r.crash
          .split('\n')
          .map(l => `  │ ${l}`)
          .join('\n'),
      );
      continue;
    }
    for (const f of r.failures) {
      console.log(`  ${f.file} › ${f.title}`);
      if (verbose) {
        console.log(
          f.message
            .split('\n')
            .map(l => `    ${l}`)
            .join('\n'),
        );
      }
    }
  }
}

const bombs = results.filter(r => !r.ok && (!witness || witness.ok));
console.log('');
if (bombs.length) {
  console.log(`✖ ${bombs.length} horloge(s) en échec alors que le témoin passe : dépendance à la date réelle.`);
  process.exit(1);
}
if (failures.length) {
  console.log('✖ Échecs présents y compris sur le témoin : problème général, pas une dépendance à la date.');
  process.exit(1);
}
console.log(`✔ Aucun échec sur ${results.length} horloge(s) × ${SPECS.length} spec(s).`);
