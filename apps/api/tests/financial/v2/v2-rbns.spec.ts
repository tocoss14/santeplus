import { describe, expect, it } from 'vitest';
import { computeTechnicalPosition, computeSolvencyIndicators } from '../../../src/domain/financial-model-v2';

describe('V2 — provisions RBNS', () => {
  const base = {
    contributions: 300000,
    engagedClaims: 40000,
    paidClaims: 60000,
    expenses: 30000,
    recoveries: 0,
    reserveAllocations: 0,
    rbns: 0,
    ibnr: 0,
    reinsuranceCessionRate: 0,
  };

  it('retranche le RBNS de la position technique', () => {
    const pos = computeTechnicalPosition({ ...base, rbns: 25000 });
    expect(pos.position).toBe(300000 - 100000 - 30000 - 25000);
  });

  it('cumule RBNS et IBNR dans les provisions', () => {
    const pos = computeTechnicalPosition({ ...base, rbns: 25000, ibnr: 15000 });
    expect(pos.position).toBe(300000 - 100000 - 30000 - 40000);
  });

  it('inclut le RBNS dans les engagements pour la solvabilité', () => {
    const pos = computeTechnicalPosition({ ...base, rbns: 25000 });
    const solvency = computeSolvencyIndicators(pos, 25000);
    // engagements = engagé + payé + provisions
    // disponible = position + fonds de solidarité
    const engagements = 40000 + 60000 + 25000;
    const available = pos.position + 0;
    expect(solvency.solvencyRatio).toBeCloseTo(available / engagements, 6);
  });

  it('un RBNS élevé dégrade visiblement la couverture des provisions', () => {
    const light = computeSolvencyIndicators(computeTechnicalPosition({ ...base, rbns: 1000 }), 25000);
    const heavy = computeSolvencyIndicators(computeTechnicalPosition({ ...base, rbns: 90000 }), 25000);
    expect(heavy.provisionCoverage).toBeLessThan(light.provisionCoverage);
  });
});
