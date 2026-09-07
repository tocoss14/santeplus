import { describe, expect, it } from 'vitest';
import {
  CTS_ALERT_TYPES,
  CTS_JOURNAL_TYPES,
  applyFamilyCap,
  applyRenewalCredit,
  available,
  band,
  benefitBudget,
  checkStopLoss,
  closeOut,
  consumptionRatio,
  defaultCtsConfig,
  deficit,
  deriveCardStatus,
  explainCopay,
  managementFees,
  parseCtsConfig,
  projectEndOfTerm,
  proposeFundCall,
  provisionalResult,
} from '../src/domain/cts-engine';

// Cas §41 applicables au moteur (9, 10, 14-18, 25 relèvent du service/UI, phases suivantes).

describe('prime et frais (§41.1, §41.2, §8, §9)', () => {
  it('prime sans consommation : budget = prime, résultat = prime', () => {
    const fees = managementFees(10_000_000, 20);
    expect(fees).toBe(2_000_000);
    expect(benefitBudget(10_000_000, fees)).toBe(8_000_000);
    expect(available(8_000_000, 0, 0)).toBe(8_000_000);
    expect(provisionalResult(10_000_000, fees, 0, 0)).toBe(8_000_000);
  });

  it('exemple §9 : 10M, 20% → frais 2M, budget 8M', () => {
    expect(managementFees(10_000_000, 20)).toBe(2_000_000);
    expect(benefitBudget(10_000_000, 2_000_000)).toBe(8_000_000);
  });

  it('frais nuls ou prime nulle → 0, taux borné à 100', () => {
    expect(managementFees(0, 20)).toBe(0);
    expect(managementFees(1_000, 0)).toBe(0);
    expect(managementFees(1_000, 250)).toBe(1_000);
  });
});

describe('consommation et engagement (§41.3, §41.4, §41.5, §10, §11)', () => {
  it('consommation seule réduit solde et résultat', () => {
    expect(available(8_000_000, 80_000, 0)).toBe(7_920_000);
    expect(provisionalResult(10_000_000, 2_000_000, 80_000, 0)).toBe(7_920_000);
  });

  it('engagement seul (validé non réglé) réduit aussi le disponible', () => {
    expect(available(8_000_000, 0, 200_000)).toBe(7_800_000);
    expect(provisionalResult(10_000_000, 2_000_000, 0, 200_000)).toBe(7_800_000);
  });

  it('consommation + engagement cumulés', () => {
    expect(available(8_000_000, 80_000, 200_000)).toBe(7_720_000);
    expect(consumptionRatio(80_000, 200_000, 8_000_000)).toBeCloseTo(0.035);
  });

  it('ratio sans budget : 0 sans exposition, 1 sinon (pas de NaN)', () => {
    expect(consumptionRatio(0, 0, 0)).toBe(0);
    expect(consumptionRatio(10, 0, 0)).toBe(1);
  });
});

describe('bandes et seuils (§41.6, §41.7, §14)', () => {
  const cfg = defaultCtsConfig();

  it('frontières 50/30/10/0', () => {
    expect(band(8_000_001, 8_000_000, cfg)).toBe('NORMAL');
    expect(band(4_000_000, 8_000_000, cfg)).toBe('NORMAL');
    expect(band(3_999_999, 8_000_000, cfg)).toBe('SURVEILLANCE');
    expect(band(2_400_000, 8_000_000, cfg)).toBe('SURVEILLANCE');
    expect(band(2_399_999, 8_000_000, cfg)).toBe('ALERTE');
    expect(band(800_000, 8_000_000, cfg)).toBe('ALERTE');
    expect(band(799_999, 8_000_000, cfg)).toBe('CRITIQUE');
    expect(band(1, 8_000_000, cfg)).toBe('CRITIQUE');
    expect(band(0, 8_000_000, cfg)).toBe('EPUISE');
    expect(band(-50_000, 8_000_000, cfg)).toBe('EPUISE');
  });

  it('seuils configurables via ctsConfig', () => {
    const custom = parseCtsConfig(JSON.stringify({ warnRatio: 60, alertRatio: 40, criticalRatio: 20 }));
    expect(band(4_000_000, 8_000_000, custom)).toBe('SURVEILLANCE');
    expect(band(3_000_000, 8_000_000, custom)).toBe('ALERTE');
  });
});

describe('appel de fonds (§41.8, §16)', () => {
  it('APPEL = CIBLE − DISPONIBLE, plancher 0', () => {
    expect(proposeFundCall(8_000_000, 7_720_000)).toEqual({ amount: 280_000, minimum: 0, recommended: 280_000 });
    expect(proposeFundCall(8_000_000, 8_500_000).amount).toBe(0);
  });

  it('plancher minimum respecté', () => {
    expect(proposeFundCall(8_000_000, 7_720_000, 100_000).minimum).toBe(100_000);
  });
});

describe('plafond foyer (§41.11, §23)', () => {
  it('exemple §23 : 1M, consommé 950k, demande 80k → 50k', () => {
    expect(applyFamilyCap(80_000, 1_000_000, 950_000)).toBe(50_000);
  });

  it('sans plafond foyer : montant inchangé, jamais négatif', () => {
    expect(applyFamilyCap(80_000, null, 950_000)).toBe(80_000);
    expect(applyFamilyCap(80_000, 1_000_000, 1_200_000)).toBe(0);
  });
});

describe('reste à charge expliqué (§24)', () => {
  it('exemple : facture 100k, prise en charge 80k → reste 20k', () => {
    expect(explainCopay(100_000, 80_000)).toEqual({ billed: 100_000, covered: 80_000, outOfPocket: 20_000 });
  });

  it('couvert borné à la facture', () => {
    expect(explainCopay(100_000, 150_000).outOfPocket).toBe(0);
  });
});

describe('clôture, excédent, crédit (§41.19, §41.20, §19)', () => {
  it('excédent 8M − 5M − 1M = 2M, crédit 70% = 1.4M', () => {
    const c = closeOut(5_000_000, 1_000_000, 8_000_000, 70);
    expect(c.surplus).toBe(2_000_000);
    expect(c.renewalCredit).toBe(1_400_000);
    expect(c.deficitAmount).toBe(0);
  });

  it('pas d’excédent → pas de crédit', () => {
    const c = closeOut(8_000_000, 500_000, 8_000_000, 70);
    expect(c.surplus).toBe(0);
    expect(c.renewalCredit).toBe(0);
  });
});

describe('déficit (§41.21)', () => {
  it('conso + engagements > budget → déficit, jamais facturé par le moteur', () => {
    expect(deficit(7_000_000, 2_000_000, 8_000_000)).toBe(1_000_000);
    expect(deficit(5_000_000, 1_000_000, 8_000_000)).toBe(0);
  });
});

describe('stop-loss (§41.22)', () => {
  it('exemple : budget 8M, stop-loss 10M — déclenché au-delà', () => {
    expect(checkStopLoss(9_000_000, 0, { threshold: 10_000_000, cap: 5_000_000 }).triggered).toBe(false);
    expect(checkStopLoss(10_500_000, 0, { threshold: 10_000_000, cap: 5_000_000 })).toEqual({
      triggered: true,
      payout: 500_000,
    });
  });

  it('payout plafonné au cap, nul sans stop-loss', () => {
    expect(checkStopLoss(20_000_000, 0, { threshold: 10_000_000, cap: 5_000_000 }).payout).toBe(5_000_000);
    expect(checkStopLoss(20_000_000, 0, null).triggered).toBe(false);
  });
});

describe('renouvellement (§41.23, §20)', () => {
  it('OPTION A : déduction du crédit sur la prime', () => {
    expect(applyRenewalCredit(144_000, 50_000, 'DEDUCT')).toEqual({ netPremium: 94_000, budgetBoost: 0 });
    expect(applyRenewalCredit(30_000, 50_000, 'DEDUCT').netPremium).toBe(0);
  });

  it('OPTION B : crédit en boost de budget', () => {
    expect(applyRenewalCredit(144_000, 50_000, 'BUDGET_BOOST')).toEqual({ netPremium: 144_000, budgetBoost: 50_000 });
  });
});

describe('projection (§41.24, §33)', () => {
  it('exemple : budget 10M, 7M à 6 mois (180/360j) → 14M projetés, épuisement jour 257', () => {
    const p = projectEndOfTerm(10_000_000, 7_000_000, 180, 360);
    expect(p.projected).toBe(14_000_000);
    expect(p.exhaustionDay).toBe(257);
    expect(p.label).toContain('indicative');
  });

  it('pas d’épuisement si rythme sain', () => {
    const p = projectEndOfTerm(10_000_000, 1_000_000, 180, 360);
    expect(p.exhaustionDay).toBeNull();
  });
});

describe('config et statuts', () => {
  it('défauts : gestion 20, seuils 50/30/10, report 70, DEDUCT, sans stop-loss', () => {
    expect(defaultCtsConfig()).toEqual({
      managementRate: 20,
      warnRatio: 50,
      alertRatio: 30,
      criticalRatio: 10,
      carryRate: 70,
      renewalMode: 'DEDUCT',
      stopLoss: null,
    });
  });

  it('fusion produit + surcharge contrat, JSON invalide ignoré, taux bornés', () => {
    const cfg = parseCtsConfig(
      JSON.stringify({ managementRate: 25, stopLoss: { threshold: 10_000_000, cap: 5_000_000 } }),
      JSON.stringify({ managementRate: 15, carryRate: 80, renewalMode: 'BUDGET_BOOST' }),
    );
    expect(cfg.managementRate).toBe(15);
    expect(cfg.carryRate).toBe(80);
    expect(cfg.renewalMode).toBe('BUDGET_BOOST');
    expect(cfg.stopLoss).toEqual({ threshold: 10_000_000, cap: 5_000_000 });
    expect(parseCtsConfig('{{invalide').managementRate).toBe(20);
    expect(parseCtsConfig(JSON.stringify({ managementRate: 250 })).managementRate).toBe(100);
  });

  it('statuts de carte dérivés : contrat prime, sinon bande (§18, §40.20)', () => {
    expect(deriveCardStatus('TERMINATED', 'NORMAL')).toBe('RESILIEE');
    expect(deriveCardStatus('EXPIRED', 'NORMAL')).toBe('EXPIREE');
    expect(deriveCardStatus('SUSPENDED', 'NORMAL')).toBe('SUSPENDUE');
    expect(deriveCardStatus('PENDING_PAYMENT', 'NORMAL')).toBe('REACTIVATION_EN_ATTENTE');
    expect(deriveCardStatus('ACTIVE', 'NORMAL')).toBe('ACTIVE');
    expect(deriveCardStatus('ACTIVE', 'SURVEILLANCE')).toBe('SURVEILLANCE');
    expect(deriveCardStatus('ACTIVE', 'ALERTE')).toBe('CRITIQUE');
    expect(deriveCardStatus('ACTIVE', 'EPUISE')).toBe('CRITIQUE');
  });

  it('référentiels : 12 types de journal, 10 types d’alertes', () => {
    expect(CTS_JOURNAL_TYPES).toHaveLength(12);
    expect(CTS_ALERT_TYPES).toHaveLength(10);
  });
});
