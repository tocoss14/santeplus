import { describe, expect, it } from 'vitest';
import { DEFAULT_V2_PRICING, computeMutualQuote } from '../../../src/domain/financial-model-v2';

describe('V2 — cotisations mutualistes', () => {
  it('calcule gross + charge de gestion sur 2 adultes et 1 enfant', () => {
    const q = computeMutualQuote(
      DEFAULT_V2_PRICING,
      { birthDate: new Date('1985-03-10'), relation: 'PRINCIPAL' },
      [
        { birthDate: new Date('1987-06-01'), relation: 'SPOUSE' },
        { birthDate: new Date('2015-09-01'), relation: 'CHILD' },
      ],
    );
    expect(q.adultCount).toBe(2);
    expect(q.childCount).toBe(1);
    // 2 × 72 000 + 1 × 48 000 = 192 000
    expect(q.grossContribution).toBe(192000);
    // charge de gestion 12 %
    expect(q.adminLoad).toBe(Math.round(192000 * 0.12));
    expect(q.totalAnnual).toBe(q.grossContribution + q.adminLoad);
  });

  it('compte un enfant de moins de 18 ans à la date de calcul', () => {
    const q = computeMutualQuote(
      DEFAULT_V2_PRICING,
      { birthDate: new Date('2010-01-15'), relation: 'PRINCIPAL' },
      [],
    );
    expect(q.adultCount).toBe(0);
    expect(q.childCount).toBe(1);
    expect(q.grossContribution).toBe(DEFAULT_V2_PRICING.childContribution);
  });

  it('ne mélange aucune règle V1 (management fee, appel de fonds)', () => {
    const q = computeMutualQuote(
      DEFAULT_V2_PRICING,
      { birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' },
      [],
    );
    // Le chargement V2 est de 12 % — jamais 20 % (management fee V1).
    expect(q.adminLoad).toBe(Math.round(q.grossContribution * 0.12));
    expect(q.totalAnnual).not.toBe(Math.round(q.grossContribution * 1.2));
  });
});
