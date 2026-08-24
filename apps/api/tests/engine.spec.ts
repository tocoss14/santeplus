import { describe, expect, it } from 'vitest';
import { buildSchedule, computeQuote, estimateClaim, splitEven, ageAt } from '../src/domain/engine';
import type { ClaimCtx } from '../src/domain/engine';

const pricing = {
  basePremiumAnnual: 45000,
  pricePerAdditionalAdultAnnual: 30000,
  pricePerChildAnnual: 20000,
  frequencyFactors: { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 },
  minAge: 0,
  maxAge: 65,
};

describe('ageAt', () => {
  it('calcule un âge correct', () => {
    const b = new Date('1990-06-15');
    expect(ageAt(b, new Date('2026-06-14'))).toBe(35);
    expect(ageAt(b, new Date('2026-06-15'))).toBe(36);
  });
});

describe('computeQuote', () => {
  it('prix de base seul', () => {
    const { errors, quote } = computeQuote(pricing, [{ birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' }], 'ANNUAL');
    expect(errors).toHaveLength(0);
    expect(quote!.subtotalAnnual).toBe(45000);
    expect(quote!.periodicAmount).toBe(45000);
  });

  it('conjoint + 2 enfants', () => {
    const { quote } = computeQuote(
      pricing,
      [
        { birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' },
        { birthDate: new Date('1992-03-03'), relation: 'SPOUSE' },
        { birthDate: new Date('2015-01-01'), relation: 'CHILD' },
        { birthDate: new Date('2018-05-05'), relation: 'CHILD' },
      ],
      'ANNUAL',
    );
    expect(quote!.subtotalAnnual).toBe(115000);
  });

  it('fractionnement mensuel applique le facteur', () => {
    const { quote } = computeQuote(pricing, [{ birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' }], 'MONTHLY');
    expect(quote!.totalAnnual).toBe(47700);
    expect(quote!.periods).toBe(12);
  });

  it("rejette l'âge maximum dépassé", () => {
    const { errors } = computeQuote(pricing, [{ birthDate: new Date('1950-01-01'), relation: 'PRINCIPAL' }], 'ANNUAL');
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejette un enfant trop âgé", () => {
    const { errors } = computeQuote(
      pricing,
      [
        { birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' },
        { birthDate: new Date('2000-01-01'), relation: 'CHILD' },
      ],
      'ANNUAL',
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('splitEven / buildSchedule', () => {
  it('répartit en gardant le total exact', () => {
    const parts = splitEven(100001, 4);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100001);
  });

  it('échéancier mensuel = 12 lignes', () => {
    const s = buildSchedule(48000, 'MONTHLY', new Date('2026-01-15'));
    expect(s).toHaveLength(12);
    expect(s[11].amount).toBe(4000);
  });
});

describe('estimateClaim', () => {
  const ctx: ClaimCtx = {
    contractStatus: 'ACTIVE',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    waitingPeriodDays: 30,
    excludedCategories: ['OPTICAL'],
    rules: [
      { categoryId: 'HOSPITALIZATION', annualLimit: 3000000, rate: 80, deductibleType: 'NONE', deductibleValue: 0 },
      { categoryId: 'PHARMACY', annualLimit: 250000, rate: 70, deductibleType: 'FIXED', deductibleValue: 5000 },
      { categoryId: 'OPTICAL', annualLimit: 100000, rate: 60, deductibleType: 'PERCENT', deductibleValue: 10 },
    ],
    usedPerCategory: {},
  };

  it('calcule taux et franchise', () => {
    const r = estimateClaim(
      ctx,
      new Date('2026-06-10'),
      [
        { categoryId: 'HOSPITALIZATION', amountRequested: 500000 },
        { categoryId: 'PHARMACY', amountRequested: 50000 },
      ],
    );
    expect(r.items[0].amountApproved).toBe(400000);
    expect(r.items[1].deductibleApplied).toBe(5000);
    expect(r.items[1].amountApproved).toBe(Math.round((50000 - 5000) * 0.7));
    expect(r.totals.approved).toBe(r.items[0].amountApproved + r.items[1].amountApproved);
    expect(r.ok).toBe(true);
  });

  it('plafond restant limite le montant éligible', () => {
    const r = estimateClaim(
      { ...ctx, usedPerCategory: { HOSPITALIZATION: 2800000 } },
      new Date('2026-06-10'),
      [{ categoryId: 'HOSPITALIZATION', amountRequested: 500000 }],
    );
    expect(r.items[0].amountEligible).toBe(200000);
    expect(r.items[0].amountApproved).toBe(160000);
  });

  it('exclusion catégorielle', () => {
    const r = estimateClaim(ctx, new Date('2026-06-10'), [{ categoryId: 'OPTICAL', amountRequested: 80000 }]);
    expect(r.items[0].reason).toBe('EXCLUDED');
    expect(r.items[0].amountApproved).toBe(0);
  });

  it('délai de carence bloquant', () => {
    const r = estimateClaim(ctx, new Date('2026-01-15'), [{ categoryId: 'PHARMACY', amountRequested: 20000 }]);
    expect(r.flags.some(f => f.startsWith('WAITING_PERIOD'))).toBe(true);
    expect(r.totals.approved).toBe(0);
  });

  it('contrat inactif bloque tout', () => {
    const r = estimateClaim({ ...ctx, contractStatus: 'SUSPENDED' }, new Date('2026-06-10'), [
      { categoryId: 'PHARMACY', amountRequested: 20000 },
    ]);
    expect(r.flags).toContain('CONTRACT_INACTIVE');
    expect(r.totals.approved).toBe(0);
  });

  it('hors période', () => {
    const r = estimateClaim(ctx, new Date('2027-03-01'), [{ categoryId: 'PHARMACY', amountRequested: 20000 }]);
    expect(r.flags).toContain('OUT_OF_PERIOD');
  });

  it('doublon suspect signalé sans décision automatique', () => {
    const r = estimateClaim(ctx, new Date('2026-06-10'), [{ categoryId: 'PHARMACY', amountRequested: 20000 }], true);
    expect(r.flags).toContain('DUPLICATE_SUSPECT');
    expect(r.totals.approved).toBeGreaterThan(0);
  });

  it('catégorie absente du contrat refusée', () => {
    const r = estimateClaim(ctx, new Date('2026-06-10'), [{ categoryId: 'DENTAL', amountRequested: 30000 }]);
    expect(r.items[0].reason).toBe('EXCLUDED');
  });
});
