import { describe, expect, it } from 'vitest';
import { estimateClaim } from '../src/domain/engine';
import { claimUnit, normalizeQuantity, toEstimationItems } from '../src/domain/units';
import type { ClaimCtx, CoverageRule } from '../src/domain/engine';

/**
 * Quantité sur une ligne de réclamation.
 *
 * Le barème est un prix PAR UNITÉ. Avant la quantité, un séjour de trois jours
 * déclaré sur une seule ligne était plafonné à 45 000 — une seule journée — et
 * l'adhérent devait deviner qu'il fallait éclater sa facture en trois lignes.
 * Le moteur multiplie désormais le plafond par les unités facturables, et
 * seulement pour celles qui se comptent ainsi : une ordonnance reste plafonnée
 * une fois, quel que soit le nombre de boîtes qu'elle contient.
 */

function ctx(rules: CoverageRule[], over: Partial<ClaimCtx> = {}): ClaimCtx {
  return {
    contractStatus: 'ACTIVE',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    waitingPeriodDays: 0,
    excludedCategories: [],
    rules,
    usedPerCategory: {},
    ...over,
  };
}

const hospitalisation: CoverageRule = { categoryId: 'HOSPITALIZATION', annualLimit: 800_000, rate: 85, maxUnitPrice: 45_000 };
const pharmacie: CoverageRule = { categoryId: 'PHARMACY', annualLimit: 400_000, rate: 75, maxUnitPrice: 30_000 };
const consultation: CoverageRule = { categoryId: 'CONSULTATION', annualLimit: 200_000, rate: 90, maxUnitPrice: 12_000 };

describe('quantité — plafond par unité', () => {
  it('hospitalisation : 3 journées à 300 000 → 135 000 éligibles (3 × 45 000)', () => {
    const r = estimateClaim(ctx([hospitalisation]), new Date('2026-06-01'), [
      { categoryId: 'HOSPITALIZATION', quantity: 3, amountRequested: 300_000 },
    ]);
    expect(r.items[0].amountEligible).toBe(135_000);
    expect(r.items[0].amountApproved).toBe(114_750); // 85 %
    expect(r.items[0].outOfPocket).toBe(185_250);
    expect(r.items[0].reason).toBe('FEE_SCHEDULE_EXCEEDED');
  });

  it('hospitalisation : sous le plafond des trois journées, aucun bridage', () => {
    const r = estimateClaim(ctx([hospitalisation]), new Date('2026-06-01'), [
      { categoryId: 'HOSPITALIZATION', quantity: 3, amountRequested: 120_000 },
    ]);
    expect(r.items[0].amountEligible).toBe(120_000);
    expect(r.items[0].reason).toBeUndefined();
  });

  it('quantité absente = une unité : le comportement historique est préservé', () => {
    const r = estimateClaim(ctx([hospitalisation]), new Date('2026-06-01'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 300_000 },
    ]);
    expect(r.items[0].amountEligible).toBe(45_000);
    expect(r.items[0].quantity).toBe(1);
    expect(r.items[0].unit).toBe('DAY');
  });

  it('consultation : 2 actes ouvrent le barème à 2 × 12 000', () => {
    const r = estimateClaim(ctx([consultation]), new Date('2026-06-01'), [
      { categoryId: 'CONSULTATION', quantity: 2, amountRequested: 30_000 },
    ]);
    expect(r.items[0].amountEligible).toBe(24_000);
  });

  it('pharmacie : 3 boîtes ne multiplient pas un barème « par ordonnance »', () => {
    const r = estimateClaim(ctx([pharmacie]), new Date('2026-06-01'), [
      { categoryId: 'PHARMACY', quantity: 3, amountRequested: 90_000 },
    ]);
    expect(r.items[0].amountEligible).toBe(30_000);
    expect(r.items[0].unit).toBe('PRESCRIPTION');
    expect(r.items[0].reason).toBe('FEE_SCHEDULE_EXCEEDED');
  });

  it('quantité aberrante bornée à une année de journées', () => {
    const sansPlafondAnnuel: CoverageRule = { categoryId: 'HOSPITALIZATION', annualLimit: null, rate: 100, maxUnitPrice: 1_000 };
    const r = estimateClaim(ctx([sansPlafondAnnuel]), new Date('2026-06-01'), [
      { categoryId: 'HOSPITALIZATION', quantity: 500, amountRequested: 1_000_000 },
    ]);
    expect(r.items[0].quantity).toBe(365);
    expect(r.items[0].amountEligible).toBe(365_000);
  });

  it('quantité nulle, négative ou illisible traitée comme 1', () => {
    expect(normalizeQuantity(0)).toBe(1);
    expect(normalizeQuantity(-4)).toBe(1);
    expect(normalizeQuantity(Number.NaN)).toBe(1);
    expect(normalizeQuantity(undefined)).toBe(1);
    expect(normalizeQuantity('3')).toBe(3);
    expect(normalizeQuantity(2.9)).toBe(2);
  });

  it('unité dérivée de la catégorie, jamais stockée', () => {
    expect(claimUnit('HOSPITALIZATION')).toBe('DAY');
    expect(claimUnit('PHARMACY')).toBe('PRESCRIPTION');
    expect(claimUnit('OPTICAL')).toBe('EQUIPMENT');
    expect(claimUnit('MATERNITY')).toBe('FORFAIT');
    expect(claimUnit('CONSULTATION')).toBe('ACT');
    expect(claimUnit('INCONNUE')).toBe('ACT');
  });

  it('relire une ligne stockée conserve la quantité (soumission, tiers payant)', () => {
    expect(toEstimationItems([{ categoryLabel: 'HOSPITALIZATION', quantity: 3, amountRequested: 300_000 }]))
      .toEqual([{ categoryId: 'HOSPITALIZATION', quantity: 3, amountRequested: 300_000 }]);
    // Ligne historique (colonne NULL) : une unité, comportement d'avant.
    expect(toEstimationItems([{ categoryLabel: 'CONSULTATION', quantity: null, amountRequested: 20_000 }])[0].quantity).toBe(1);
  });

  it('la ligne rejetée conserve sa quantité et son unité pour l’audit', () => {
    const r = estimateClaim(ctx([consultation], { excludedCategories: ['CONSULTATION'] }), new Date('2026-06-01'), [
      { categoryId: 'CONSULTATION', quantity: 4, amountRequested: 50_000 },
    ]);
    expect(r.items[0].reason).toBe('EXCLUDED');
    expect(r.items[0].quantity).toBe(4);
    expect(r.items[0].unit).toBe('ACT');
  });
});
