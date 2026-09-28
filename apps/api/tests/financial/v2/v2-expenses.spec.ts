import { describe, expect, it } from 'vitest';
import { computeTechnicalPosition } from '../../../src/domain/financial-model-v2';

describe('V2 — charges et recouvrements dans la position technique', () => {
  const base = {
    contributions: 100000,
    engagedClaims: 0,
    paidClaims: 0,
    expenses: 12000,
    recoveries: 0,
    reserveAllocations: 0,
    rbns: 0,
    ibnr: 0,
    reinsuranceCessionRate: 0,
  };

  it('retranche les charges de gestion de la position', () => {
    const pos = computeTechnicalPosition(base);
    expect(pos.position).toBe(100000 - 12000);
  });

  it('ajoute les recouvrements aux ressources', () => {
    const pos = computeTechnicalPosition({ ...base, recoveries: 5000 });
    expect(pos.position).toBe(100000 + 5000 - 12000);
  });

  it('retranche prestations engagées et payées', () => {
    const pos = computeTechnicalPosition({ ...base, engagedClaims: 20000, paidClaims: 30000 });
    expect(pos.position).toBe(100000 - 12000 - 20000 - 30000);
  });

  it('retranche les provisions RBNS + IBNR', () => {
    const pos = computeTechnicalPosition({ ...base, rbns: 8000, ibnr: 4000 });
    expect(pos.position).toBe(100000 - 12000 - 8000 - 4000);
  });

  it('applique la formule complète du PDF avec cession réassurance', () => {
    // Cotisations + Recouvrements − Engagées − Payées − Charges − Provisions + Cession − Dotations
    const pos = computeTechnicalPosition({
      contributions: 500000,
      engagedClaims: 120000,
      paidClaims: 80000,
      expenses: 60000,
      recoveries: 15000,
      reserveAllocations: 10000,
      rbns: 20000,
      ibnr: 10000,
      reinsuranceCessionRate: 0.3,
    });
    const claims = 120000 + 80000;
    const ceded = Math.round(claims * 0.3);
    expect(pos.reinsuranceCeded).toBe(ceded);
    expect(pos.position).toBe(500000 + 15000 - claims - 60000 - 30000 + ceded - 10000);
  });
});
