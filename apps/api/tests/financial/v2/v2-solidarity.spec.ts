import { describe, expect, it } from 'vitest';
import { computeTechnicalResult } from '../../../src/domain/financial-model-v2';

function result(overrides: Partial<Parameters<typeof computeTechnicalResult>[0]> = {}) {
  return computeTechnicalResult({
    contributions: 400000,
    engagedClaims: 60000,
    paidClaims: 90000,
    expenses: 48000,
    reinsuranceCessionRate: 0,
    solidarityFund: 0,
    solidarityShareOfSurplus: 0.2,
    ...overrides,
  });
}

describe('V2 — Fonds de solidarité (affectation du résultat)', () => {
  it('en situation saine, l\u2019excédent reste en réserve (pas de ponction solidarité)', () => {
    const r = result({ solidarityFund: 100000 });
    expect(r.technicalResult).toBe(400000 - 150000 - 48000);
    expect(r.solidarityAllocation).toBe(0);
    expect(r.netResult).toBe(r.technicalResult);
  });

  it('complète un fonds déficitaire dans la limite de la part configurée', () => {
    // déficit 200 000 ; part 20 % d'un résultat de 202 000 (400 000 − 150 000 − 48 000) → 40 400
    const r = result({ solidarityFund: -200000 });
    expect(r.solidarityAllocation).toBe(40400);
    expect(r.netResult).toBe(r.technicalResult - 40400);
  });

  it('ne verse jamais plus que le besoin de comblement', () => {
    // déficit 10 000 seulement → allocation plafonnée à 10 000
    const r = result({ solidarityFund: -10000 });
    expect(r.solidarityAllocation).toBe(10000);
    expect(r.netResult).toBe(r.technicalResult - 10000);
  });

  it('aucune allocation en perte technique', () => {
    const r = result({ paidClaims: 500000, solidarityFund: -50000 });
    expect(r.technicalResult).toBeLessThan(0);
    expect(r.solidarityAllocation).toBe(0);
    expect(r.netResult).toBe(r.technicalResult);
  });
});
