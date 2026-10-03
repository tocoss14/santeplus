/**
 * Garde statique — plus aucun Spinner de CHARGEMENT DE PAGE dans les espaces
 * member / prestataire / partagé : les skeletons de components/ui.tsx les ont
 * remplacés (sweep dynamique complémentaire : e2e/skeleton-sweep.spec.ts).
 *
 * Les seuls Spinner tolérés sont des états « occupé » d'une action utilisateur
 * (soumission de formulaire, traitement en cours), listés ci-dessous avec leur
 * justification. Toute nouvelle utilisation doit être ajoutée ICI à la main —
 * c'est le but : forcer une décision consciente plutôt qu'un Spinner par défaut.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
// Espaces convertis aux skeletons + chargeurs transversaux (boot d'auth et
// fallback des chunks lazy dans App.tsx, layouts) : un Spinner de chargement
// réapparu n'importe où là-dedans doit faire échouer le garde.
const TARGETS: Array<{ path: string; dir: boolean }> = [
  { path: join(SRC, 'pages', 'member'), dir: true },
  { path: join(SRC, 'pages', 'provider'), dir: true },
  { path: join(SRC, 'pages', 'shared'), dir: true },
  { path: join(SRC, 'App.tsx'), dir: false },
  { path: join(SRC, 'layouts'), dir: true },
];

const ALLOWED: Record<string, number> = {
  // Bouton « Continuer vers le choix de la formule » pendant la soumission (busy).
  'pages/member/SubscribeWizard.tsx': 1,
  // Overlay « Vérification… » pendant l'analyse d'un QR/JSON scanné (busy).
  'pages/provider/mobile/MobileScanPage.tsx': 1,
};

function* tsxFiles(target: string, isDir: boolean): Generator<string> {
  if (!isDir) {
    yield target;
    return;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const p = join(target, entry.name);
    if (entry.isDirectory()) yield* tsxFiles(p, true);
    else if (entry.name.endsWith('.tsx')) yield p;
  }
}

it('zéro Spinner de chargement de page dans member/provider/shared, App et layouts (2 busy tolérés, cf. ALLOWED)', () => {
  const usages: string[] = [];
  for (const { path, dir } of TARGETS) {
    if (statSync(path).isDirectory() !== dir) throw new Error(`cible introuvable : ${path}`);
    for (const file of tsxFiles(path, dir)) {
      const src = readFileSync(file, 'utf8');
      const hits = (src.match(/<Spinner\b/g) ?? []).length;
      if (hits > 0) {
        const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
        usages.push(`${rel}:${hits}`);
      }
    }
  }
  const expected = Object.entries(ALLOWED).map(([file, n]) => `${file}:${n}`).sort();
  expect(usages.sort()).toEqual(expected);
});
