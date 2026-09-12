import { describe, expect, it } from 'vitest';
import { estimateClaim, type ClaimCtx } from '../src/domain/engine';

function baseCtx(overrides: Partial<ClaimCtx> = {}): ClaimCtx {
  return {
    contractStatus: 'ACTIVE',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    waitingPeriodDays: 0,
    excludedCategories: [],
    rules: [
      { categoryId: 'CONSULTATION', annualLimit: 120000, rate: 70, copayRate: 30 },
    ],
    usedPerCategory: {},
    ...overrides,
  };
}

describe('plafond annuel de reste à charge', () => {
  it('reprend le ticket modérateur une fois le plafond atteint', () => {
    const r = estimateClaim(
      baseCtx({ oopAnnualCap: 10000, usedOop: 10000 }),
      new Date('2026-06-01'),
      [{ categoryId: 'CONSULTATION', amountRequested: 10000 }],
    );

    expect(r.items[0].amountEligible).toBe(10000);
    expect(r.items[0].copayApplied).toBe(2100);
    expect(r.items[0].oopCapApplied).toBe(5100);
    expect(r.items[0].amountApproved).toBe(10000);
    expect(r.items[0].outOfPocket).toBe(0);
  });

  it('fait payer au patient le reliquat jusqu’au plafond, puis reprend le surplus', () => {
    const r = estimateClaim(
      baseCtx({ oopAnnualCap: 12000, usedOop: 10000 }),
      new Date('2026-06-01'),
      [
        { categoryId: 'CONSULTATION', amountRequested: 10000 },
        { categoryId: 'CONSULTATION', amountRequested: 10000 },
      ],
    );

    // Poste 1 : reste à charge 5 100, patient encore solvable à hauteur de 2 000.
    expect(r.items[0].oopCapApplied).toBe(3100);
    expect(r.items[0].amountApproved).toBe(8000);
    expect(r.items[0].outOfPocket).toBe(2000);
    // Poste 2 : plafond déjà atteint par le poste 1, reprise intégrale.
    expect(r.items[1].oopCapApplied).toBe(5100);
    expect(r.items[1].amountApproved).toBe(10000);
    expect(r.items[1].outOfPocket).toBe(0);
    expect(r.totals.approved).toBe(18000);
    expect(r.totals.outOfPocket).toBe(2000);
  });

  it('ne rouvre pas le plafond annuel global déjà épuisé', () => {
    const r = estimateClaim(
      baseCtx({ globalAnnualCap: 5000, usedGlobal: 0, oopAnnualCap: 100000, usedOop: 100000 }),
      new Date('2026-06-01'),
      [{ categoryId: 'CONSULTATION', amountRequested: 10000 }],
    );

    expect(r.items[0].amountApproved).toBe(5000);
    expect(r.items[0].outOfPocket).toBe(5000);
  });

  it('ne couvre pas les soins exclus', () => {
    const r = estimateClaim(
      baseCtx({ excludedCategories: ['CONSULTATION'], oopAnnualCap: 100000, usedOop: 100000 }),
      new Date('2026-06-01'),
      [{ categoryId: 'CONSULTATION', amountRequested: 10000 }],
    );

    expect(r.items[0].amountApproved).toBe(0);
    expect(r.items[0].oopCapApplied).toBe(0);
    expect(r.items[0].outOfPocket).toBe(10000);
  });
});
