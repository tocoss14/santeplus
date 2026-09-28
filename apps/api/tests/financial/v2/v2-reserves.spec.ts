import { describe, expect, it } from 'vitest';
import { DEFAULT_RESERVE_POLICY, computeReserveAllocation } from '../../../src/domain/financial-model-v2';

describe('V2 — réserves', () => {
  it('dote 10 % des cotisations quand la position le permet', () => {
    expect(computeReserveAllocation(1000000, 500000)).toBe(100000);
  });

  it('plafonne la dotation à la position disponible (jamais de réserve creusée)', () => {
    expect(computeReserveAllocation(1000000, 50000)).toBe(50000);
  });

  it('ne dote rien en position négative', () => {
    expect(computeReserveAllocation(1000000, -20000)).toBe(0);
  });

  it('expose la politique par défaut (10 %, 3 mois de charges)', () => {
    expect(DEFAULT_RESERVE_POLICY.contributionRate).toBe(0.1);
    expect(DEFAULT_RESERVE_POLICY.minimumMonthsOfExpectedCost).toBe(3);
  });

  it('accepte une politique de réserve surchargée', () => {
    expect(computeReserveAllocation(1000000, 999999, { contributionRate: 0.25, minimumMonthsOfExpectedCost: 6 })).toBe(250000);
  });
});
