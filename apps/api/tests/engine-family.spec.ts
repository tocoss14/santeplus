import { describe, expect, it } from 'vitest';
import { estimateClaim } from '../src/domain/engine';
import type { ClaimCtx, CoverageRule } from '../src/domain/engine';

// Plafond foyer §23 : annualLimit par personne + familyLimit cumulé au contrat.
// Sans contexte personne ni familyLimit : comportement historique inchangé.

function baseCtx(over: Partial<ClaimCtx> = {}): ClaimCtx {
  return {
    contractStatus: 'ACTIVE',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    waitingPeriodDays: 0,
    excludedCategories: [],
    rules: [],
    usedPerCategory: {},
    ...over,
  };
}

function pharmaRule(over: Partial<CoverageRule> = {}): CoverageRule {
  return {
    categoryId: 'PHARMACY',
    annualLimit: 360000,
    rate: 80,
    deductibleType: 'NONE',
    deductibleValue: 0,
    ...over,
  };
}

describe('plafond foyer (§23)', () => {
  it('sans familyLimit ni personne : comportement historique inchangé', () => {
    const ctx = baseCtx({ rules: [pharmaRule()], usedPerCategory: { PHARMACY: 100000 } });
    const r = estimateClaim(ctx, new Date('2026-06-01'), [{ categoryId: 'PHARMACY', amountRequested: 80000 }]);
    expect(r.items[0].amountEligible).toBe(80000);
    expect(r.items[0].amountApproved).toBe(64000);
    expect(r.items[0].reason).toBeUndefined();
  });

  it('exemple §23 au niveau garantie : 1M, consommé foyer 950k, demande 80k → éligible 50k', () => {
    const ctx = baseCtx({
      rules: [pharmaRule({ familyLimit: 1_000_000 })],
      usedPerCategory: { PHARMACY: 950_000 },
      usedPersonPerCategory: { PHARMACY: 0 },
    });
    const r = estimateClaim(ctx, new Date('2026-06-01'), [{ categoryId: 'PHARMACY', amountRequested: 80_000 }]);
    expect(r.items[0].amountEligible).toBe(50_000);
    expect(r.items[0].amountApproved).toBe(40_000);
    expect(r.items[0].outOfPocket).toBe(40_000);
  });

  it('foyer épuisé → FAMILY_CAP_REACHED, approuvé 0', () => {
    const ctx = baseCtx({
      rules: [pharmaRule({ familyLimit: 1_000_000 })],
      usedPerCategory: { PHARMACY: 1_000_000 },
      usedPersonPerCategory: { PHARMACY: 0 },
    });
    const r = estimateClaim(ctx, new Date('2026-06-01'), [{ categoryId: 'PHARMACY', amountRequested: 80_000 }]);
    expect(r.items[0].amountApproved).toBe(0);
    expect(r.items[0].outOfPocket).toBe(80_000);
    expect(r.items[0].reason).toBe('FAMILY_CAP_REACHED');
  });

  it('personne épuisée (mais foyer OK) → CAP_REACHED', () => {
    const ctx = baseCtx({
      rules: [pharmaRule({ annualLimit: 100_000, familyLimit: 1_000_000 })],
      usedPerCategory: { PHARMACY: 100_000 },
      usedPersonPerCategory: { PHARMACY: 100_000 },
    });
    const r = estimateClaim(ctx, new Date('2026-06-01'), [{ categoryId: 'PHARMACY', amountRequested: 80_000 }]);
    expect(r.items[0].amountApproved).toBe(0);
    expect(r.items[0].reason).toBe('CAP_REACHED');
  });

  it('deuxième personne : plafond individuel intact, foyer partagé', () => {
    const rules = [pharmaRule({ annualLimit: 100_000, familyLimit: 150_000 })];
    // Personne A a consommé 100k (son plafond individuel est plein)
    const ctxA = baseCtx({
      rules,
      usedPerCategory: { PHARMACY: 100_000 },
      usedPersonPerCategory: { PHARMACY: 100_000 },
    });
    expect(
      estimateClaim(ctxA, new Date('2026-06-01'), [{ categoryId: 'PHARMACY', amountRequested: 50_000 }]).items[0]
        .reason,
    ).toBe('CAP_REACHED');
    // Personne B (0 consommé) : éligible, borné par le reste foyer (50k)
    const ctxB = baseCtx({
      rules,
      usedPerCategory: { PHARMACY: 100_000 },
      usedPersonPerCategory: { PHARMACY: 0 },
    });
    const rB = estimateClaim(ctxB, new Date('2026-06-01'), [{ categoryId: 'PHARMACY', amountRequested: 80_000 }]);
    expect(rB.items[0].amountEligible).toBe(50_000);
    expect(rB.items[0].reason).toBeUndefined();
  });

  it('familyLimit null : contexte personne sans effet foyer', () => {
    const ctx = baseCtx({
      rules: [pharmaRule()],
      usedPerCategory: { PHARMACY: 100_000 },
      usedPersonPerCategory: { PHARMACY: 100_000 },
    });
    const r = estimateClaim(ctx, new Date('2026-06-01'), [{ categoryId: 'PHARMACY', amountRequested: 80_000 }]);
    // annualLimit 360k − personne 100k = reste → éligible plein
    expect(r.items[0].amountEligible).toBe(80_000);
  });
});
