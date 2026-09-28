import { describe, expect, it } from 'vitest';
import { computeTechnicalPosition, computeSolvencyIndicators } from '../../../src/domain/financial-model-v2';

describe('V2 — provisions IBNR', () => {
  const base = {
    contributions: 480000,
    engagedClaims: 0,
    paidClaims: 90000,
    expenses: 40000,
    recoveries: 0,
    reserveAllocations: 0,
    rbns: 0,
    ibnr: 0,
    reinsuranceCessionRate: 0,
  };

  it('retranche l\u2019IBNR estimé de la position', () => {
    const pos = computeTechnicalPosition({ ...base, ibnr: 36000 });
    expect(pos.position).toBe(480000 - 90000 - 40000 - 36000);
  });

  it('l\u2019IBNR pèse dans la couverture prudentielle', () => {
    const pos = computeTechnicalPosition({ ...base, ibnr: 36000 });
    const solvency = computeSolvencyIndicators(pos, 46000);
    const available = pos.position;
    expect(solvency.provisionCoverage).toBeCloseTo(available / 36000, 6);
  });

  it('sans sinistre caché, la couverture est plénière', () => {
    const pos = computeTechnicalPosition(base);
    expect(pos.position).toBeGreaterThan(0);
    expect(computeSolvencyIndicators(pos, 46000).provisionCoverage).toBe(1);
  });
});
