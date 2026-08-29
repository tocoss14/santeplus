import { describe, expect, it } from 'vitest';
import { buildSchedule, computeQuote, computeFlexibleQuote, estimateClaim, splitEven, ageAt } from '../src/domain/engine';
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

  it('applique la surcharge par âge', () => {
    const pricingWithAgeLoadings = {
      ...pricing,
      ageLoadings: [
        { minAge: 0, maxAge: 30, factor: 1.0 },
        { minAge: 31, maxAge: 50, factor: 1.3 },
        { minAge: 51, maxAge: 65, factor: 1.8 },
      ],
    };
    const { quote: quote30 } = computeQuote(pricingWithAgeLoadings, [{ birthDate: new Date('1996-01-01'), relation: 'PRINCIPAL' }], 'ANNUAL');
    const { quote: quote55 } = computeQuote(pricingWithAgeLoadings, [{ birthDate: new Date('1971-01-01'), relation: 'PRINCIPAL' }], 'ANNUAL');
    // 30 ans → factor 1.0, pas de surcharge
    expect(quote30!.subtotalAnnual).toBe(45000);
    // 55 ans → factor 1.8, surcharge de 80%
    expect(quote55!.subtotalAnnual).toBe(Math.round(45000 * 1.8));
    expect(quote55!.lines.some(l => l.label.includes('Surcharge'))).toBe(true);
  });

  it('utilise le facteur du foyer le plus âgé', () => {
    const pricingWithAgeLoadings = {
      ...pricing,
      ageLoadings: [
        { minAge: 0, maxAge: 30, factor: 1.0 },
        { minAge: 31, maxAge: 50, factor: 1.5 },
      ],
    };
    // Principal 25 ans, conjoint 45 ans → facteur 1.5 s'applique
    const { quote } = computeQuote(pricingWithAgeLoadings, [
      { birthDate: new Date('2001-01-01'), relation: 'PRINCIPAL' },
      { birthDate: new Date('1981-01-01'), relation: 'SPOUSE' },
    ], 'ANNUAL');
    expect(quote!.subtotalAnnual).toBe(Math.round((45000 + 30000) * 1.5));
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

  it('calcule taux et franchise (sans copay si non défini)', () => {
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
    expect(r.items[1].copayApplied).toBe(0);
    expect(r.totals.approved).toBe(r.items[0].amountApproved + r.items[1].amountApproved);
    expect(r.ok).toBe(true);
  });

  it('applique le copay obligatoire', () => {
    const ctxWithCopay: ClaimCtx = {
      ...ctx,
      rules: [
        { categoryId: 'HOSPITALIZATION', annualLimit: 3000000, rate: 80, deductibleType: 'NONE', deductibleValue: 0, copayRate: 20 },
        { categoryId: 'PHARMACY', annualLimit: 250000, rate: 70, deductibleType: 'FIXED', deductibleValue: 5000, copayRate: 15 },
      ],
    };
    const r = estimateClaim(ctxWithCopay, new Date('2026-06-10'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 500000 },
    ]);
    // 500000 éligible, pas de franchise, taux 80% → 400000 couvert, copay 20% → 80000
    expect(r.items[0].copayApplied).toBe(80000);
    expect(r.items[0].amountApproved).toBe(320000);
    expect(r.items[0].outOfPocket).toBe(180000); // 500000 - 320000
  });

  it('applique le barème médical (maxUnitPrice)', () => {
    const ctxWithFee: ClaimCtx = {
      ...ctx,
      rules: [
        { categoryId: 'HOSPITALIZATION', annualLimit: 3000000, rate: 80, deductibleType: 'NONE', deductibleValue: 0, maxUnitPrice: 100000 },
      ],
    };
    const r = estimateClaim(ctxWithFee, new Date('2026-06-10'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 500000 },
    ]);
    // Le montant est plafonné à 100000 (maxUnitPrice)
    expect(r.items[0].amountEligible).toBe(100000);
    expect(r.items[0].amountApproved).toBe(80000);
    expect(r.items[0].reason).toBe('FEE_SCHEDULE_EXCEEDED');
  });

  it('plafond global annuel (stop-loss)', () => {
    const ctxWithGlobalCap: ClaimCtx = {
      ...ctx,
      globalAnnualCap: 2000000,
      usedGlobal: 1900000,
    };
    const r = estimateClaim(ctxWithGlobalCap, new Date('2026-06-10'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 500000 },
    ]);
    // Reste 100000 sur le cap global, donc approved plafonné à 100000
    expect(r.items[0].amountApproved).toBe(100000);
  });

  it('plafond global épuisé bloque tout', () => {
    const ctxFullCap: ClaimCtx = {
      ...ctx,
      globalAnnualCap: 2000000,
      usedGlobal: 2000000,
    };
    const r = estimateClaim(ctxFullCap, new Date('2026-06-10'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 100000 },
    ]);
    expect(r.items[0].reason).toBe('GLOBAL_CAP_REACHED');
    expect(r.items[0].amountApproved).toBe(0);
  });

  it('plafond restant limite le montant éligible', () => {
    const r = estimateClaim(
      { ...ctx, usedPerCategory: { HOSPITALIZATION: 2800000 } },
      new Date('2026-06-10'),
      [{ categoryId: 'HOSPITALIZATION', amountRequested: 500000 }],
    );
    expect(r.items[0].amountEligible).toBe(200000);
    expect(r.items[0].amountApproved).toBe(160000);
    expect(r.items[0].outOfPocket).toBe(340000);
  });

  it('exclusion catégorielle', () => {
    const r = estimateClaim(ctx, new Date('2026-06-10'), [{ categoryId: 'OPTICAL', amountRequested: 80000 }]);
    expect(r.items[0].reason).toBe('EXCLUDED');
    expect(r.items[0].amountApproved).toBe(0);
    expect(r.items[0].outOfPocket).toBe(80000);
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

describe('computeFlexibleQuote', () => {
  const flexPricing = {
    basePremiumAnnual: 45000,
    pricePerAdditionalAdultAnnual: 30000,
    pricePerChildAnnual: 20000,
    frequencyFactors: { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.08 },
    minAge: 0,
    maxAge: 65,
    guaranteeOptions: [
      { categoryId: 'HOSPITALIZATION', categoryName: 'Hospitalisation', basePrice: 25000, minRate: 60, maxRate: 95, minLimit: 1000000, maxLimit: 10000000, limitStep: 500000, mandatory: true, customizable: true, deductibleType: 'NONE' as const, deductibleValue: 0, copayRate: 15 },
      { categoryId: 'PHARMACY', categoryName: 'Pharmacie', basePrice: 12000, minRate: 50, maxRate: 85, minLimit: 100000, maxLimit: 500000, limitStep: 25000, mandatory: true, customizable: true, deductibleType: 'NONE' as const, deductibleValue: 0, copayRate: 15 },
    ],
  };

  it('calcule la prime avec garanties personnalisées', () => {
    const selected = [
      { categoryId: 'HOSPITALIZATION', rate: 80, annualLimit: 3000000 },
      { categoryId: 'PHARMACY', rate: 70, annualLimit: 250000 },
    ];
    const { errors, quote, flexibleDetails } = computeFlexibleQuote(flexPricing, [{ birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' }], 'ANNUAL', selected);
    expect(errors).toHaveLength(0);
    expect(quote).toBeDefined();
    expect(flexibleDetails).toBeDefined();
    expect(flexibleDetails!.basePremium).toBe(45000);
    expect(flexibleDetails!.guaranteeCosts).toHaveLength(2);
    expect(flexibleDetails!.guaranteeCosts[0].categoryId).toBe('HOSPITALIZATION');
    expect(flexibleDetails!.guaranteeCosts[0].cost).toBeGreaterThan(0);
    expect(quote!.totalAnnual).toBeGreaterThan(45000);
  });

  it('applique la borne min/max sur le taux choisi', () => {
    const selected = [
      { categoryId: 'HOSPITALIZATION', rate: 30, annualLimit: 3000000 }, // 30% < minRate 60%
    ];
    const { flexibleDetails } = computeFlexibleQuote(flexPricing, [{ birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' }], 'ANNUAL', selected);
    // Le taux doit être borné à 60% (minRate)
    expect(flexibleDetails!.guaranteeCosts[0].rate).toBe(60);
  });

  it('applique la borne min/max sur le plafond choisi', () => {
    const selected = [
      { categoryId: 'PHARMACY', rate: 70, annualLimit: 99999999 }, // > maxLimit 500000
    ];
    const { flexibleDetails } = computeFlexibleQuote(flexPricing, [{ birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' }], 'ANNUAL', selected);
    expect(flexibleDetails!.guaranteeCosts[0].limit).toBe(500000);
  });

  it('retourne les détails complets du devis flexible', () => {
    const selected = [
      { categoryId: 'HOSPITALIZATION', rate: 85, annualLimit: 5000000 },
    ];
    const { flexibleDetails } = computeFlexibleQuote(flexPricing, [{ birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' }], 'ANNUAL', selected);
    expect(flexibleDetails!.lines.length).toBeGreaterThan(1);
    expect(flexibleDetails!.subtotal).toBe(flexibleDetails!.basePremium + flexibleDetails!.guaranteeCosts[0].cost);
  });

  it('fonctionne sans garanties sélectionnées (fallback classique)', () => {
    const { errors, quote } = computeFlexibleQuote(flexPricing, [{ birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' }], 'ANNUAL');
    expect(errors).toHaveLength(0);
    expect(quote!.totalAnnual).toBe(45000);
  });
});
