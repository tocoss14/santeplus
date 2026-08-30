import { describe, expect, it } from 'vitest';
import { estimateClaim, needsPriorAuthorization, resolveThreshold } from '../src/domain/engine';
import type { ClaimCtx } from '../src/domain/engine';

// Base context: ACTIVE contract, 30-day default waiting period, 2026
function baseCtx(overrides: Partial<ClaimCtx> = {}): ClaimCtx {
  return {
    contractStatus: 'ACTIVE',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    waitingPeriodDays: 30,
    excludedCategories: ['OPTICAL'],
    rules: [
      { categoryId: 'HOSPITALIZATION', annualLimit: 1500000, rate: 75, deductibleType: 'FIXED', deductibleValue: 10000, copayRate: 20 },
      { categoryId: 'PHARMACY', annualLimit: 180000, rate: 60, deductibleType: 'NONE', deductibleValue: 0, copayRate: 30 },
      { categoryId: 'CONSULTATION', annualLimit: 120000, rate: 70, deductibleType: 'NONE', deductibleValue: 0, copayRate: 0 },
      { categoryId: 'SPECIALIZED', annualLimit: 300000, rate: 50, deductibleType: 'NONE', deductibleValue: 0, copayRate: 0, maxUnitPrice: 25000 },
    ],
    usedPerCategory: {},
    ...overrides,
  };
}

// ─── needsPriorAuthorization ─────────────────────────
describe('needsPriorAuthorization', () => {
  it('returns true when total exceeds threshold', () => {
    expect(needsPriorAuthorization(200000, 150000)).toBe(true);
  });

  it('returns false when total is below threshold', () => {
    expect(needsPriorAuthorization(100000, 150000)).toBe(false);
  });

  it('returns false when threshold is null', () => {
    expect(needsPriorAuthorization(500000, null)).toBe(false);
  });

  it('returns false when threshold is undefined', () => {
    expect(needsPriorAuthorization(500000, undefined)).toBe(false);
  });

  it('returns false when threshold is 0', () => {
    expect(needsPriorAuthorization(500000, 0)).toBe(false);
  });
});

// ─── resolveThreshold ────────────────────────────────
describe('resolveThreshold', () => {
  it('returns product threshold when set', () => {
    expect(resolveThreshold(100000, null)).toBe(100000);
  });

  it('returns act threshold when set', () => {
    expect(resolveThreshold(null, 50000)).toBe(50000);
  });

  it('returns min of product and act when both set', () => {
    expect(resolveThreshold(200000, 100000)).toBe(100000);
  });

  it('returns global fallback when neither set', () => {
    expect(resolveThreshold(null, null)).toBe(150000);
  });

  it('returns global fallback for zero values', () => {
    expect(resolveThreshold(0, 0)).toBe(150000);
  });
});

// ─── Category-specific waiting periods ────────────────
describe('categoryWaitingPeriods', () => {
  it('blocks MATERNITY during 10-month carence (300 days)', () => {
    const ctx = baseCtx({
      rules: [
        { categoryId: 'MATERNITY', annualLimit: 400000, rate: 80, deductibleType: 'NONE', deductibleValue: 0, copayRate: 20 },
      ],
      categoryWaitingPeriods: { MATERNITY: 300 },
    });
    // Contract started Jan 1, 2026. 300 days later = Oct 28, 2026.
    // Care on Sept 1, 2026 = within waiting period
    const r = estimateClaim(ctx, new Date('2026-09-01'), [
      { categoryId: 'MATERNITY', amountRequested: 200000 },
    ]);
    expect(r.items[0].reason).toBe('WAITING_PERIOD');
    expect(r.items[0].amountApproved).toBe(0);
    expect(r.items[0].outOfPocket).toBe(200000);
  });

  it('allows MATERNITY after 10-month carence', () => {
    const ctx = baseCtx({
      rules: [
        { categoryId: 'MATERNITY', annualLimit: 400000, rate: 80, deductibleType: 'NONE', deductibleValue: 0, copayRate: 20 },
      ],
      categoryWaitingPeriods: { MATERNITY: 300 },
    });
    // Nov 1, 2026 = after Oct 28 (300 days)
    const r = estimateClaim(ctx, new Date('2026-11-01'), [
      { categoryId: 'MATERNITY', amountRequested: 200000 },
    ]);
    expect(r.items[0].reason).toBeUndefined();
    expect(r.items[0].amountApproved).toBeGreaterThan(0);
  });

  it('does not apply category waiting period when not defined', () => {
    const ctx = baseCtx({
      rules: [
        { categoryId: 'MATERNITY', annualLimit: 400000, rate: 80, deductibleType: 'NONE', deductibleValue: 0 },
      ],
    });
    const r = estimateClaim(ctx, new Date('2026-02-15'), [
      { categoryId: 'MATERNITY', amountRequested: 200000 },
    ]);
    expect(r.items[0].reason).toBeUndefined();
    expect(r.items[0].amountApproved).toBeGreaterThan(0);
  });

  it('category waiting period overrides default waiting period', () => {
    const ctx = baseCtx({
      waitingPeriodDays: 30, // 30 days default
      rules: [
        { categoryId: 'HOSPITALIZATION', annualLimit: 1500000, rate: 75, deductibleType: 'NONE', deductibleValue: 0 },
      ],
      categoryWaitingPeriods: { HOSPITALIZATION: 90 }, // 90 days for hospitalization
    });
    // Day 45: after default 30 but before category 90
    const r = estimateClaim(ctx, new Date('2026-02-15'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 100000 },
    ]);
    expect(r.items[0].reason).toBe('WAITING_PERIOD');
    expect(r.items[0].amountApproved).toBe(0);
  });
});

// ─── Specialist consultation limits ───────────────────
describe('specialistConsultationsPerYear', () => {
  it('blocks specialist when limit reached', () => {
    const ctx = baseCtx({
      specialistConsultationsUsed: 3,
      specialistConsultationsPerYear: 3,
    });
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'SPECIALIZED', amountRequested: 15000 },
    ]);
    expect(r.items[0].reason).toBe('CAP_REACHED');
    expect(r.items[0].amountApproved).toBe(0);
    expect(r.items[0].outOfPocket).toBe(15000);
  });

  it('allows specialist when under limit', () => {
    const ctx = baseCtx({
      specialistConsultationsUsed: 2,
      specialistConsultationsPerYear: 5,
    });
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'SPECIALIZED', amountRequested: 15000 },
    ]);
    expect(r.items[0].reason).toBeUndefined();
    expect(r.items[0].amountApproved).toBeGreaterThan(0);
  });

  it('does not limit specialist when perYear is null', () => {
    const ctx = baseCtx({
      specialistConsultationsUsed: 10,
      specialistConsultationsPerYear: null,
    });
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'SPECIALIZED', amountRequested: 15000 },
    ]);
    expect(r.items[0].reason).toBeUndefined();
    expect(r.items[0].amountApproved).toBeGreaterThan(0);
  });

  it('limit does not apply to non-specialist categories', () => {
    const ctx = baseCtx({
      specialistConsultationsUsed: 10,
      specialistConsultationsPerYear: 3,
    });
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'CONSULTATION', amountRequested: 10000 },
    ]);
    expect(r.items[0].reason).toBeUndefined();
    expect(r.items[0].amountApproved).toBeGreaterThan(0);
  });
});

// ─── Advanced copay scenarios ─────────────────────────
describe('advanced copay scenarios', () => {
  it('copay applied after rate calculation on covered amount', () => {
    const ctx = baseCtx({
      rules: [
        { categoryId: 'HOSPITALIZATION', annualLimit: 1500000, rate: 80, deductibleType: 'NONE', deductibleValue: 0, copayRate: 25 },
      ],
    });
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 100000 },
    ]);
    // eligible: 100000, no deductible, rate 80% = 80000, copay 25% of 80000 = 20000, approved = 60000
    expect(r.items[0].amountEligible).toBe(100000);
    expect(r.items[0].deductibleApplied).toBe(0);
    expect(r.items[0].copayApplied).toBe(20000);
    expect(r.items[0].amountApproved).toBe(60000);
    expect(r.items[0].outOfPocket).toBe(40000);
  });

  it('copay + deductible combined', () => {
    const ctx = baseCtx({
      rules: [
        { categoryId: 'HOSPITALIZATION', annualLimit: 1500000, rate: 80, deductibleType: 'FIXED', deductibleValue: 10000, copayRate: 20 },
      ],
    });
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 100000 },
    ]);
    // eligible: 100000, deductible: 10000, after deductible: 90000, rate 80%: 72000, copay 20%: 14400, approved: 57600
    expect(r.items[0].deductibleApplied).toBe(10000);
    expect(r.items[0].copayApplied).toBe(14400);
    expect(r.items[0].amountApproved).toBe(57600);
    expect(r.items[0].outOfPocket).toBe(42400);
  });

  it('copay = 0 means no copay applied', () => {
    const ctx = baseCtx({
      rules: [
        { categoryId: 'CONSULTATION', annualLimit: 120000, rate: 70, deductibleType: 'NONE', deductibleValue: 0, copayRate: 0 },
      ],
    });
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'CONSULTATION', amountRequested: 15000 },
    ]);
    expect(r.items[0].copayApplied).toBe(0);
    expect(r.items[0].amountApproved).toBe(10500); // 15000 * 70%
  });
});

// ─── maxUnitPrice (fee schedule) ──────────────────────
describe('maxUnitPrice (fee schedule)', () => {
  it('caps amount at maxUnitPrice when request exceeds it', () => {
    const ctx = baseCtx({
      rules: [
        { categoryId: 'SPECIALIZED', annualLimit: 300000, rate: 50, deductibleType: 'NONE', deductibleValue: 0, maxUnitPrice: 25000 },
      ],
    });
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'SPECIALIZED', amountRequested: 40000 },
    ]);
    expect(r.items[0].amountEligible).toBe(25000);
    expect(r.items[0].reason).toBe('FEE_SCHEDULE_EXCEEDED');
    expect(r.items[0].amountApproved).toBe(12500); // 25000 * 50%
  });

  it('does not cap when request is below maxUnitPrice', () => {
    const ctx = baseCtx({
      rules: [
        { categoryId: 'SPECIALIZED', annualLimit: 300000, rate: 50, deductibleType: 'NONE', deductibleValue: 0, maxUnitPrice: 25000 },
      ],
    });
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'SPECIALIZED', amountRequested: 15000 },
    ]);
    expect(r.items[0].amountEligible).toBe(15000);
    expect(r.items[0].reason).toBeUndefined();
    expect(r.items[0].amountApproved).toBe(7500); // 15000 * 50%
  });
});

// ─── Global cap interactions ──────────────────────────
describe('global cap with category limits', () => {
  it('both category and global caps limit approved amount', () => {
    const ctx = baseCtx({
      globalAnnualCap: 500000,
      usedGlobal: 450000,
      rules: [
        { categoryId: 'HOSPITALIZATION', annualLimit: 1500000, rate: 80, deductibleType: 'NONE', deductibleValue: 0 },
      ],
      usedPerCategory: { HOSPITALIZATION: 0 },
    });
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 200000 },
    ]);
    // Category allows 200000 * 80% = 160000, but global remaining = 50000
    expect(r.items[0].amountApproved).toBe(50000);
  });
});

// ─── Multiple items in one claim ──────────────────────
describe('multiple items in one claim', () => {
  it('processes mixed categories correctly', () => {
    const ctx = baseCtx();
    const r = estimateClaim(ctx, new Date('2026-06-15'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 100000 },
      { categoryId: 'PHARMACY', amountRequested: 30000 },
      { categoryId: 'CONSULTATION', amountRequested: 10000 },
      { categoryId: 'OPTICAL', amountRequested: 20000 }, // excluded
    ]);
    expect(r.items).toHaveLength(4);
    expect(r.items[0].amountApproved).toBeGreaterThan(0); // Hospitalization
    expect(r.items[1].amountApproved).toBeGreaterThan(0); // Pharmacy
    expect(r.items[2].amountApproved).toBeGreaterThan(0); // Consultation
    expect(r.items[3].reason).toBe('EXCLUDED'); // Optical excluded
    expect(r.items[3].amountApproved).toBe(0);
    expect(r.ok).toBe(true); // No blocking flags
  });
});
