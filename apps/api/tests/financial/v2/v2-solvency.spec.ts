import { describe, expect, it } from 'vitest';
import { computeSolvencyIndicators, computeTechnicalPosition } from '../../../src/domain/financial-model-v2';

describe('V2 — indicateurs prudentiels', () => {
  const base = {
    contributions: 600000,
    engagedClaims: 50000,
    paidClaims: 150000,
    expenses: 72000,
    recoveries: 0,
    reserveAllocations: 0,
    rbns: 30000,
    ibnr: 20000,
    reinsuranceCessionRate: 0,
  };

  it('calcule la marge de solvabilité (disponible / engagements)', () => {
    const pos = computeTechnicalPosition(base);
    const solvency = computeSolvencyIndicators(pos, 46000);
    const engagements = 50000 + 150000 + 50000;
    expect(solvency.solvencyRatio).toBeCloseTo((pos.position + 0) / engagements, 6);
  });

  it('calcule le taux de sinistralité net de cession', () => {
    const pos = computeTechnicalPosition({ ...base, reinsuranceCessionRate: 0.3 });
    const solvency = computeSolvencyIndicators(pos, 46000);
    const net = 250000 - pos.reinsuranceCeded;
    expect(solvency.lossRatio).toBeCloseTo(net / 600000, 6);
  });

  it('calcule le taux de charges', () => {
    const pos = computeTechnicalPosition(base);
    expect(computeSolvencyIndicators(pos, 46000).expenseRatio).toBeCloseTo(72000 / 600000, 6);
  });

  it('exprime la couverture en mois de charges attendues', () => {
    const pos = computeTechnicalPosition(base);
    const solvency = computeSolvencyIndicators(pos, 46000);
    expect(solvency.monthsOfCoverage).toBeCloseTo(pos.position / 46000, 6);
  });

  it('la cession réassurance allège les engagements techniques', () => {
    const without = computeTechnicalPosition(base);
    const withRe = computeTechnicalPosition({ ...base, reinsuranceCessionRate: 0.3 });
    expect(withRe.position).toBeGreaterThan(without.position);
    expect(withRe.reinsuranceCeded).toBe(Math.round((50000 + 150000) * 0.3));
  });
});
