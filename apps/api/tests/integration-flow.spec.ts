import { describe, expect, it } from 'vitest';
import {
  computeQuote, computeFlexibleQuote, estimateClaim, buildSchedule,
  needsPriorAuthorization, resolveThreshold,
} from '../src/domain/engine';
import type { ClaimCtx, ProductPricing, QuotePerson } from '../src/domain/engine';

// ─── Product pricing fixtures (based on v2.0 formulas) ─────────
const ESSENTIELLE: ProductPricing = {
  basePremiumAnnual: 72000,  // 6000/mois
  pricePerAdditionalAdultAnnual: 48000,
  pricePerChildAnnual: 48000,
  frequencyFactors: { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.08 },
  minAge: 0,
  maxAge: 65,
  waitingPeriodDays: 30,
  globalAnnualCap: 500000,
  ageLoadings: [
    { minAge: 0, maxAge: 30, factor: 1.0 },
    { minAge: 31, maxAge: 50, factor: 1.15 },
    { minAge: 51, maxAge: 65, factor: 1.3 },
  ],
  guaranteeOptions: [
    { categoryId: 'CONSULTATION', categoryName: 'Consultations', basePrice: 8000, minRate: 50, maxRate: 90, minLimit: 50000, maxLimit: 200000, limitStep: 25000, mandatory: true, customizable: false, deductibleType: 'NONE', deductibleValue: 0, copayRate: 30 },
    { categoryId: 'PHARMACY', categoryName: 'Pharmacie', basePrice: 10000, minRate: 50, maxRate: 85, minLimit: 100000, maxLimit: 300000, limitStep: 25000, mandatory: true, customizable: false, deductibleType: 'NONE', deductibleValue: 0, copayRate: 30 },
    { categoryId: 'HOSPITALIZATION', categoryName: 'Hospitalisation', basePrice: 15000, minRate: 50, maxRate: 90, minLimit: 500000, maxLimit: 2000000, limitStep: 250000, mandatory: true, customizable: false, deductibleType: 'FIXED', deductibleValue: 10000, copayRate: 30 },
  ],
};

const CONFORT: ProductPricing = {
  basePremiumAnnual: 144000, // 12000/mois
  pricePerAdditionalAdultAnnual: 108000,
  pricePerChildAnnual: 108000,
  frequencyFactors: { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.08 },
  minAge: 0,
  maxAge: 65,
  waitingPeriodDays: 30,
  globalAnnualCap: 1200000,
  guaranteeOptions: [
    { categoryId: 'HOSPITALIZATION', categoryName: 'Hospitalisation', basePrice: 25000, minRate: 60, maxRate: 95, minLimit: 1000000, maxLimit: 5000000, limitStep: 500000, mandatory: true, customizable: false, deductibleType: 'FIXED', deductibleValue: 10000, copayRate: 20 },
  ],
};

const EXCELLENCE: ProductPricing = {
  basePremiumAnnual: 300000, // 25000/mois
  pricePerAdditionalAdultAnnual: 240000,
  pricePerChildAnnual: 240000,
  frequencyFactors: { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.08 },
  minAge: 0,
  maxAge: 65,
  waitingPeriodDays: 30,
  globalAnnualCap: 3000000,
  guaranteeOptions: [
    { categoryId: 'HOSPITALIZATION', categoryName: 'Hospitalisation', basePrice: 40000, minRate: 70, maxRate: 95, minLimit: 2000000, maxLimit: 10000000, limitStep: 1000000, mandatory: true, customizable: false, deductibleType: 'FIXED', deductibleValue: 10000, copayRate: 10 },
  ],
};

// ─── Subscription Quote Flow ──────────────────────────
describe('Subscription quote flow', () => {
  const principal: QuotePerson = { birthDate: new Date('1990-06-15'), relation: 'PRINCIPAL' };

  describe('Essentielle formula', () => {
    it('calculates correct base premium for single adult', () => {
      const { errors, quote } = computeQuote(ESSENTIELLE, [principal], 'ANNUAL');
      expect(errors).toHaveLength(0);
      // age 36 → factor 1.15 → 72000 * 1.15 = 82800
      expect(quote!.subtotalAnnual).toBe(Math.round(72000 * 1.15));
      expect(quote!.totalAnnual).toBe(Math.round(72000 * 1.15));
    });

    it('calculates with spouse + 1 child', () => {
      const { errors, quote } = computeQuote(ESSENTIELLE, [
        principal,
        { birthDate: new Date('1992-03-03'), relation: 'SPOUSE' },
        { birthDate: new Date('2018-01-01'), relation: 'CHILD' },
      ], 'ANNUAL');
      expect(errors).toHaveLength(0);
      // 72000 + 48000 (conjoint) + 48000 (enfant) = 168000
      // age 36 → factor 1.15 → 168000 * 1.15 = 193200
      expect(quote!.subtotalAnnual).toBe(Math.round(168000 * 1.15));
    });

    it('monthly frequency applies 1.08 factor', () => {
      const { quote } = computeQuote(ESSENTIELLE, [principal], 'MONTHLY');
      // age 36 → factor 1.15, so: 72000 * 1.15 = 82800, then * 1.08 = 89424 → rounded to 89425
      expect(quote!.totalAnnual).toBe(Math.round(Math.round(72000 * 1.15) * 1.08 / 5) * 5);
      expect(quote!.periods).toBe(12);
    });

    it('quarterly frequency applies 1.03 factor', () => {
      const { quote } = computeQuote(ESSENTIELLE, [principal], 'QUARTERLY');
      // age 36 → factor 1.15, so: 72000 * 1.15 = 82800, then * 1.03 = 85284 → rounded to 85285
      expect(quote!.totalAnnual).toBe(Math.round(Math.round(72000 * 1.15) * 1.03 / 5) * 5);
      expect(quote!.periods).toBe(4);
    });
  });

  describe('Flexible quote (with guarantee options)', () => {
    it('adds guarantee costs to base premium', () => {
      const selected = [
        { categoryId: 'CONSULTATION', rate: 70, annualLimit: 100000 },
        { categoryId: 'PHARMACY', rate: 60, annualLimit: 150000 },
      ];
      const { errors, quote, flexibleDetails } = computeFlexibleQuote(ESSENTIELLE, [principal], 'ANNUAL', selected);
      expect(errors).toHaveLength(0);
      expect(quote!.totalAnnual).toBeGreaterThan(72000);
      expect(flexibleDetails!.guaranteeCosts).toHaveLength(2);
      expect(flexibleDetails!.basePremium).toBe(72000);
    });
  });

  describe('Schedule generation', () => {
    it('monthly = 12 installments summing to total', () => {
      const schedule = buildSchedule(72000, 'MONTHLY', new Date('2026-01-01'));
      expect(schedule).toHaveLength(12);
      const total = schedule.reduce((s, c) => s + c.amount, 0);
      expect(total).toBe(72000);
      // First installment due on start date
      expect(schedule[0].dueDate).toEqual(new Date('2026-01-01'));
    });

    it('annual = 1 installment', () => {
      const schedule = buildSchedule(72000, 'ANNUAL', new Date('2026-01-01'));
      expect(schedule).toHaveLength(1);
      expect(schedule[0].amount).toBe(72000);
    });
  });
});

// ─── Claim Estimation Pipeline ────────────────────────
describe('Claim estimation pipeline', () => {
  function essentielleCtx(overrides: Partial<ClaimCtx> = {}): ClaimCtx {
    return {
      contractStatus: 'ACTIVE',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2027-02-28'),
      waitingPeriodDays: 30,
      excludedCategories: ['OPTICAL', 'DENTAL', 'MATERNITY'],
      rules: [
        { categoryId: 'CONSULTATION', annualLimit: 120000, rate: 70, deductibleType: 'NONE', deductibleValue: 0, copayRate: 30 },
        { categoryId: 'PHARMACY', annualLimit: 180000, rate: 60, deductibleType: 'NONE', deductibleValue: 0, copayRate: 30 },
        { categoryId: 'HOSPITALIZATION', annualLimit: 1500000, rate: 60, deductibleType: 'FIXED', deductibleValue: 10000, copayRate: 40 },
        // SPECIALIZED intentionally omitted = not covered for Essentielle
      ],
      usedPerCategory: {},
      globalAnnualCap: 500000,
      categoryWaitingPeriods: { MATERNITY: 300 },
      specialistConsultationsPerYear: 3,
      specialistConsultationsUsed: 0,
      ...overrides,
    };
  }

  it('Essentielle: consultation 10000 FCFA → 70% covered, 30% copay', () => {
    const ctx = essentielleCtx();
    const r = estimateClaim(ctx, new Date('2026-05-01'), [
      { categoryId: 'CONSULTATION', amountRequested: 10000 },
    ]);
    expect(r.items[0].amountEligible).toBe(10000);
    expect(r.items[0].rateApplied).toBe(70);
    expect(r.items[0].copayApplied).toBe(2100); // 7000 * 30%
    expect(r.items[0].amountApproved).toBe(4900); // 7000 - 2100
    expect(r.items[0].outOfPocket).toBe(5100);
  });

  it('Essentielle: pharmacy 20000 → capped by plafond remaining', () => {
    const ctx = essentielleCtx({ usedPerCategory: { PHARMACY: 170000 } });
    const r = estimateClaim(ctx, new Date('2026-05-01'), [
      { categoryId: 'PHARMACY', amountRequested: 20000 },
    ]);
    // Only 10000 remaining on plafond (180000 - 170000)
    expect(r.items[0].amountEligible).toBe(10000);
    expect(r.items[0].amountApproved).toBe(4200); // 10000 * 60% = 6000, copay 30% = 1800, approved = 4200
  });

  it('Essentielle: hospitalization with fixed deductible + copay', () => {
    const ctx = essentielleCtx();
    const r = estimateClaim(ctx, new Date('2026-05-01'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 200000 },
    ]);
    // eligible: 200000, deductible: 10000, after: 190000, rate 60%: 114000, copay 40%: 45600, approved: 68400
    expect(r.items[0].deductibleApplied).toBe(10000);
    expect(r.items[0].copayApplied).toBe(45600);
    expect(r.items[0].amountApproved).toBe(68400);
  });

  it('Essentielle: specialized not covered (no rule = excluded)', () => {
    const ctx = essentielleCtx();
    const r = estimateClaim(ctx, new Date('2026-05-01'), [
      { categoryId: 'SPECIALIZED', amountRequested: 15000 },
    ]);
    // SPECIALIZED not in rules → engine treats as EXCLUDED
    expect(r.items[0].reason).toBe('EXCLUDED');
    expect(r.items[0].amountApproved).toBe(0);
  });

  it('Essentielle: maternity blocked (excluded category)', () => {
    const ctx = essentielleCtx();
    const r = estimateClaim(ctx, new Date('2026-08-01'), [
      { categoryId: 'MATERNITY', amountRequested: 200000 },
    ]);
    expect(r.items[0].reason).toBe('EXCLUDED');
  });

  it('Essentielle: waiting period blocks early claims', () => {
    const ctx = essentielleCtx();
    // Contract started March 1, waiting period 30 days = March 31
    // Claim on March 15 = within waiting period
    const r = estimateClaim(ctx, new Date('2026-03-15'), [
      { categoryId: 'PHARMACY', amountRequested: 5000 },
    ]);
    expect(r.flags.some(f => f.startsWith('WAITING_PERIOD'))).toBe(true);
    expect(r.totals.approved).toBe(0);
  });

  it('Essentielle: global cap stops all claims when reached', () => {
    const ctx = essentielleCtx({ usedGlobal: 500000 });
    const r = estimateClaim(ctx, new Date('2026-06-01'), [
      { categoryId: 'CONSULTATION', amountRequested: 10000 },
    ]);
    expect(r.items[0].reason).toBe('GLOBAL_CAP_REACHED');
    expect(r.items[0].amountApproved).toBe(0);
  });
});

// ─── Confort vs Excellence comparison ─────────────────
describe('Formule comparison: Confort vs Excellence', () => {
  const principal: QuotePerson = { birthDate: new Date('1985-01-01'), relation: 'PRINCIPAL' };

  it('Excellence premium is higher than Confort', () => {
    const { quote: qComfort } = computeQuote(CONFORT, [principal], 'ANNUAL');
    const { quote: qExcellence } = computeQuote(EXCELLENCE, [principal], 'ANNUAL');
    expect(qExcellence!.totalAnnual).toBeGreaterThan(qComfort!.totalAnnual);
  });

  it('Excellence hospitalization approves more than Confort for same claim', () => {
    const comfortCtx: ClaimCtx = {
      contractStatus: 'ACTIVE', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
      waitingPeriodDays: 30, excludedCategories: [], globalAnnualCap: 1200000,
      rules: [{ categoryId: 'HOSPITALIZATION', annualLimit: 5000000, rate: 75, deductibleType: 'FIXED', deductibleValue: 10000, copayRate: 20 }],
      usedPerCategory: {},
    };
    const excellenceCtx: ClaimCtx = {
      ...comfortCtx,
      globalAnnualCap: 3000000,
      rules: [{ categoryId: 'HOSPITALIZATION', annualLimit: 10000000, rate: 90, deductibleType: 'FIXED', deductibleValue: 10000, copayRate: 10 }],
    };

    const claim = [{ categoryId: 'HOSPITALIZATION', amountRequested: 500000 }];
    const rComfort = estimateClaim(comfortCtx, new Date('2026-06-01'), claim);
    const rExcellence = estimateClaim(excellenceCtx, new Date('2026-06-01'), claim);

    expect(rExcellence.items[0].amountApproved).toBeGreaterThan(rComfort.items[0].amountApproved);
  });
});

// ─── Edge cases ───────────────────────────────────────
describe('Edge cases', () => {
  it('zero amount claim', () => {
    const ctx: ClaimCtx = {
      contractStatus: 'ACTIVE', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
      waitingPeriodDays: 30, excludedCategories: [],
      rules: [{ categoryId: 'PHARMACY', annualLimit: 100000, rate: 70, deductibleType: 'NONE', deductibleValue: 0 }],
      usedPerCategory: {},
    };
    const r = estimateClaim(ctx, new Date('2026-06-01'), [
      { categoryId: 'PHARMACY', amountRequested: 0 },
    ]);
    expect(r.items[0].amountApproved).toBe(0);
  });

  it('very large claim on limited cap', () => {
    const ctx: ClaimCtx = {
      contractStatus: 'ACTIVE', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
      waitingPeriodDays: 30, excludedCategories: [],
      rules: [{ categoryId: 'HOSPITALIZATION', annualLimit: 500000, rate: 80, deductibleType: 'NONE', deductibleValue: 0 }],
      usedPerCategory: { HOSPITALIZATION: 400000 },
    };
    const r = estimateClaim(ctx, new Date('2026-06-01'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 1000000 },
    ]);
    // Only 100000 remaining on cap (500000 - 400000)
    expect(r.items[0].amountEligible).toBe(100000);
    expect(r.items[0].amountApproved).toBe(80000);
  });

  it('concurrent claims don\'t exceed category cap (simulated)', () => {
    const ctx: ClaimCtx = {
      contractStatus: 'ACTIVE', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
      waitingPeriodDays: 0, excludedCategories: [],
      rules: [{ categoryId: 'PHARMACY', annualLimit: 100000, rate: 70, deductibleType: 'NONE', deductibleValue: 0 }],
      usedPerCategory: { PHARMACY: 95000 },
    };
    const r = estimateClaim(ctx, new Date('2026-06-01'), [
      { categoryId: 'PHARMACY', amountRequested: 20000 },
    ]);
    expect(r.items[0].amountEligible).toBe(5000); // only 5000 remaining
    expect(r.items[0].amountApproved).toBe(3500); // 5000 * 70%
  });
});
