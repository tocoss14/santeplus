import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { estimateClaim } from '../src/domain/engine';
import type { ClaimCtx, CoverageRule } from '../src/domain/engine';

/**
 * Garde-fou du barème par acte (maxUnitPrice).
 *
 * Le défaut réparé n'était pas un calcul faux mais un barème fantôme : la CGA
 * publiait « Max par acte » sur quatre formules, l'engine savait plafonner une
 * ligne (`FEE_SCHEDULE_EXCEEDED`), et aucune ligne "ProductGuarantee" ne
 * portait la valeur. Les deux seeds déclaraient les montants puis les
 * jetaient au create(). Ces tests vérifient donc trois choses distinctes :
 *   1. la migration couvre exactement les cinq formules, sans maternité ni
 *      optique (forfaits) ;
 *   2. le seed catalogue écrit les mêmes montants — sinon une réinstallation
 *      réintroduit le trou ;
 *   3. le moteur applique réellement le plafond, y compris le piège des
 *      journées d'hospitalisation regroupées sur une seule ligne.
 */

const ROOT = path.resolve(__dirname, '..');
const SCHEDULE_SQL = path.join(ROOT, 'prisma', 'migrations', '20261025000000_per_act_schedule', 'migration.sql');
const SEED_CATALOGUE = path.join(ROOT, 'prisma', 'seed-catalogue.ts');

const SQL = fs.readFileSync(SCHEDULE_SQL, 'utf8');
const SEED = fs.readFileSync(SEED_CATALOGUE, 'utf8');

const FORMULES = ['ESS', 'CONF', 'FAM', 'ENT-PERF', 'ENT-VIP'];
const FORFAITS = ['MATERNITY', 'OPTICAL'];

/** Lignes du bloc VALUES : ('ESS', 'CONSULTATION', 10000). */
const bareme = new Map(
  [...SQL.matchAll(/\('([A-Z][A-Z-]*)',\s*'([A-Z]+)',\s*(\d+)\)/g)].map(m => [`${m[1]}/${m[2]}`, Number(m[3])]),
);

/** Barème déclaré par le seed catalogue, produit par produit. */
function baremeDuSeed(): Map<string, number> {
  const debut = SEED.indexOf('const PRODUCTS = [');
  const fin = SEED.indexOf('\n];', debut);
  if (debut < 0 || fin < 0) throw new Error('PRODUCTS introuvable dans seed-catalogue.ts');
  const bloc = SEED.slice(debut, fin);

  const entetes = [...bloc.matchAll(/code: '([A-Z][A-Z-]*)'/g)];
  const releve = new Map<string, number>();
  entetes.forEach((entete, i) => {
    const code = entete[1];
    const suite = bloc.slice(entete.index, entetes[i + 1]?.index ?? bloc.length);
    for (const ligne of suite.split('\n')) {
      const categorie = ligne.match(/category: '([A-Z]+)'/)?.[1];
      const plafond = ligne.match(/maxUnitPrice: (\d+)/)?.[1];
      if (categorie && plafond) releve.set(`${code}/${categorie}`, Number(plafond));
    }
  });
  return releve;
}

function ctxFam(rules: CoverageRule[]): ClaimCtx {
  return {
    contractStatus: 'ACTIVE',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    waitingPeriodDays: 0,
    excludedCategories: [],
    rules,
    usedPerCategory: {},
  };
}

/** Règles Famille telles que la production les sert (montants de la migration FAM). */
const rulesFam: CoverageRule[] = [
  { categoryId: 'HOSPITALIZATION', annualLimit: 800_000, rate: 85, maxUnitPrice: bareme.get('FAM/HOSPITALIZATION') },
  { categoryId: 'CONSULTATION', annualLimit: 200_000, rate: 90, maxUnitPrice: bareme.get('FAM/CONSULTATION') },
  { categoryId: 'PHARMACY', annualLimit: 400_000, rate: 75, maxUnitPrice: bareme.get('FAM/PHARMACY') },
  { categoryId: 'LABORATORY', annualLimit: 100_000, rate: 80, maxUnitPrice: bareme.get('FAM/LABORATORY') },
  { categoryId: 'SPECIALIZED', annualLimit: 300_000, rate: 85, maxUnitPrice: bareme.get('FAM/SPECIALIZED') },
  { categoryId: 'MATERNITY', annualLimit: 400_000, rate: 85, maxUnitPrice: bareme.get('FAM/MATERNITY') ?? null },
  { categoryId: 'DENTAL', annualLimit: 80_000, rate: 70, maxUnitPrice: bareme.get('FAM/DENTAL') },
  { categoryId: 'OPTICAL', annualLimit: 60_000, rate: 70, maxUnitPrice: bareme.get('FAM/OPTICAL') ?? null },
];

describe('barème par acte — cohérence migration / seed', () => {
  it('couvre les cinq formules commercialisées', () => {
    const formules = new Set([...bareme.keys()].map(cle => cle.split('/')[0]));
    expect([...formules].sort()).toEqual([...FORMULES].sort());
  });

  it('ne pose aucun barème sur les forfaits (maternité, optique)', () => {
    const forfaits = [...bareme.keys()].filter(cle => FORFAITS.includes(cle.split('/')[1]));
    expect(forfaits).toEqual([]);
  });

  it('hospitalisation identique sur les cinq formules : 45 000 par journée', () => {
    for (const formule of FORMULES) {
      expect(bareme.get(`${formule}/HOSPITALIZATION`), formule).toBe(45_000);
    }
  });

  it('le seed catalogue écrit exactement le barème de la migration', () => {
    // C'est ce test qui aurait attrapé le défaut d'origine : les montants étaient
    // déclarés dans le seed, jamais passés au create().
    const seed = baremeDuSeed();
    const commercialise = new Map([...seed].filter(([cle]) => FORMULES.includes(cle.split('/')[0])));
    expect(commercialise).toEqual(bareme);

    // Seule exception tolérée : Excellence, archivée et jamais commercialisée.
    const horsFormules = [...new Set([...seed.keys()].map(cle => cle.split('/')[0]))]
      .filter(code => !FORMULES.includes(code));
    expect(horsFormules).toEqual(['EXC']);
  });

  it('aucun plafond par acte au-dessus du plafond annuel de la formule', () => {
    const annuels: Record<string, number> = {
      'ESS/HOSPITALIZATION': 150_000, 'ESS/CONSULTATION': 100_000, 'ESS/PHARMACY': 180_000, 'ESS/LABORATORY': 30_000,
      'FAM/HOSPITALIZATION': 800_000, 'FAM/CONSULTATION': 200_000, 'FAM/PHARMACY': 400_000,
      'FAM/LABORATORY': 100_000, 'FAM/SPECIALIZED': 300_000, 'FAM/DENTAL': 80_000,
    };
    for (const [cle, plafondAnnuel] of Object.entries(annuels)) {
      expect(bareme.get(cle), cle).toBeDefined();
      expect(bareme.get(cle)!, cle).toBeLessThanOrEqual(plafondAnnuel);
      expect(bareme.get(cle)!, cle).toBeGreaterThan(0);
    }
  });
});

describe('barème par acte — effet sur une demande Famille', () => {
  it('consultation au-dessus du barème : base éligible bridée à 12 000, dépassement à charge', () => {
    const r = estimateClaim(ctxFam(rulesFam), new Date('2026-06-01'), [
      { categoryId: 'CONSULTATION', amountRequested: 20_000 },
    ]);
    expect(r.items[0].amountEligible).toBe(12_000);
    expect(r.items[0].amountApproved).toBe(10_800); // 90 %
    expect(r.items[0].outOfPocket).toBe(9_200); // 2 000 de dépassement + 1 200 de ticket
    expect(r.items[0].reason).toBe('FEE_SCHEDULE_EXCEEDED');
  });

  it('consultation dans le barème : aucun bridage, pas de motif de rejet', () => {
    const r = estimateClaim(ctxFam(rulesFam), new Date('2026-06-01'), [
      { categoryId: 'CONSULTATION', amountRequested: 12_000 },
    ]);
    expect(r.items[0].amountEligible).toBe(12_000);
    expect(r.items[0].amountApproved).toBe(10_800);
    expect(r.items[0].outOfPocket).toBe(1_200);
    expect(r.items[0].reason).toBeUndefined();
  });

  it('hospitalisation : une ligne par journée, sinon la journée est le seul acte payé', () => {
    // Trois journées détaillées : 3 × 45 000 éligibles.
    const detaille = estimateClaim(ctxFam(rulesFam), new Date('2026-06-01'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 100_000 },
      { categoryId: 'HOSPITALIZATION', amountRequested: 100_000 },
      { categoryId: 'HOSPITALIZATION', amountRequested: 100_000 },
    ]);
    expect(detaille.items.map(i => i.amountEligible)).toEqual([45_000, 45_000, 45_000]);
    expect(detaille.totals.eligible).toBe(135_000);

    // Séjour regroupé sur une seule ligne : une seule journée est reconnue.
    const regroupe = estimateClaim(ctxFam(rulesFam), new Date('2026-06-01'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 300_000 },
    ]);
    expect(regroupe.items[0].amountEligible).toBe(45_000);
    expect(regroupe.items[0].reason).toBe('FEE_SCHEDULE_EXCEEDED');
  });

  it('maternité : forfait sans barème, le plafond annuel fait foi', () => {
    const r = estimateClaim(ctxFam(rulesFam), new Date('2026-06-01'), [
      { categoryId: 'MATERNITY', amountRequested: 300_000 },
    ]);
    expect(r.items[0].amountEligible).toBe(300_000);
    expect(r.items[0].amountApproved).toBe(255_000); // 85 %
    expect(r.items[0].reason).toBeUndefined();
  });

  it('optique : forfait sans barème', () => {
    const r = estimateClaim(ctxFam(rulesFam), new Date('2026-06-01'), [
      { categoryId: 'OPTICAL', amountRequested: 45_000 },
    ]);
    expect(r.items[0].amountEligible).toBe(45_000);
    expect(r.items[0].amountApproved).toBe(31_500); // 70 %
    expect(r.items[0].reason).toBeUndefined();
  });
});
