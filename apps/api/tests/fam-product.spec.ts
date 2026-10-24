import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { estimateClaim } from '../src/domain/engine';
import type { ClaimCtx, CoverageRule } from '../src/domain/engine';

/**
 * Garde-fou sur la réparation de la formule Famille.
 *
 * Le défaut réparé n'était pas un bug de calcul mais une absence de données :
 * la migration du 19 octobre a créé `famille-product` sans aucune ligne
 * `ProductGuarantee`, et le moteur répond EXCLUDED à toute catégorie sans
 * règle. Ces tests vérifient donc deux choses distinctes : que la migration
 * publie bien les huit catégories (sinon on répare en silence), et que le
 * moteur couvre effectivement une demande dès que ces règles existent.
 */

const MIGRATIONS = path.resolve(__dirname, '..', 'prisma', 'migrations');
const FAM_SQL = path.join(MIGRATIONS, '20261024000000_fam_guarantees', 'migration.sql');
const TARIF_SQL = path.join(MIGRATIONS, '20261021000000_update_tarifs_prudents', 'migration.sql');

const GUARANTEE_ROWS = fs.readFileSync(FAM_SQL, 'utf8');
const TARIF_ROWS = fs.readFileSync(TARIF_SQL, 'utf8');

/** Lignes du bloc VALUES des garanties : ('CATEGORY', 800000, 85, 15). */
const lignes = [...GUARANTEE_ROWS.matchAll(/\('([A-Z]+)',\s*(\d+),\s*(\d+),\s*(\d+)\)/g)].map(m => ({
  category: m[1],
  limit: Number(m[2]),
  rate: Number(m[3]),
  copay: Number(m[4]),
}));

const CATEGORIES_ATTENDUES = [
  'CONSULTATION',
  'DENTAL',
  'HOSPITALIZATION',
  'LABORATORY',
  'MATERNITY',
  'OPTICAL',
  'PHARMACY',
  'SPECIALIZED',
];

const plafondGlobalFam = Number(
  TARIF_ROWS.match(/UPDATE "Product" SET "basePremiumAnnual" = 75000[\s\S]*?"globalAnnualCap" = (\d+)/)?.[1],
);

function ctxFam(rules: CoverageRule[], over: Partial<ClaimCtx> = {}): ClaimCtx {
  return {
    contractStatus: 'ACTIVE',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    waitingPeriodDays: 30,
    categoryWaitingPeriods: { MATERNITY: 270 },
    excludedCategories: [],
    rules,
    usedPerCategory: {},
    ...over,
  };
}

const rulesFam: CoverageRule[] = lignes.map(l => ({
  categoryId: l.category,
  annualLimit: l.limit,
  rate: l.rate,
  copayRate: l.copay,
}));

describe('formule Famille — garanties réparées', () => {
  it('la migration rattache les huit catégories du produit', () => {
    expect(lignes).toHaveLength(8);
    expect(lignes.map(l => l.category).sort()).toEqual(CATEGORIES_ATTENDUES);
  });

  it('la somme des plafonds par catégorie reste sous le plafond global de la grille prudente', () => {
    expect(plafondGlobalFam).toBe(3_000_000);
    const somme = lignes.reduce((a, l) => a + l.limit, 0);
    expect(somme).toBe(2_340_000);
    expect(somme).toBeLessThan(plafondGlobalFam);
  });

  it('aucune garantie ne sort sans sa contrepartie : taux + copay = 100 %', () => {
    for (const l of lignes) expect(l.rate + l.copay).toBe(100);
  });

  it('chaque catégorie est remboursée — plus aucun EXCLUDED faute de règle', () => {
    // 2026-10-15 : au-delà de toutes les carences (30 / 90 / 270 jours) pour
    // que ce test mesure la présence des règles, pas le délai d'attente.
    for (const categorie of CATEGORIES_ATTENDUES) {
      const r = estimateClaim(ctxFam(rulesFam), new Date('2026-10-15'), [
        { categoryId: categorie, amountRequested: 50_000 },
      ]);
      expect(r.items[0].reason, `${categorie} rejeté`).toBeUndefined();
      expect(r.items[0].amountApproved, `${categorie} non remboursé`).toBeGreaterThan(0);
    }
  });

  it('maternité : bloquée avant 270 jours, couverte après (carence Famille = 9 mois)', () => {
    const avant = estimateClaim(ctxFam(rulesFam), new Date('2026-08-01'), [
      { categoryId: 'MATERNITY', amountRequested: 300_000 },
    ]);
    expect(avant.items[0].reason).toBe('WAITING_PERIOD');
    expect(avant.items[0].amountApproved).toBe(0);

    // 271e jour après le 2026-01-01
    const apres = estimateClaim(ctxFam(rulesFam), new Date('2026-09-30'), [
      { categoryId: 'MATERNITY', amountRequested: 300_000 },
    ]);
    expect(apres.items[0].reason).toBeUndefined();
    expect(apres.items[0].amountApproved).toBe(255_000); // 85 % de 300 000
  });

  it('la carence soins courants de 30 jours reste appliquée au foyer', () => {
    const pendant = estimateClaim(ctxFam(rulesFam), new Date('2026-01-20'), [
      { categoryId: 'CONSULTATION', amountRequested: 20_000 },
    ]);
    expect(pendant.items[0].reason).toBe('WAITING_PERIOD');
  });
});
