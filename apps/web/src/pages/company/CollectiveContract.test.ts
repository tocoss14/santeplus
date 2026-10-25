import { describe, expect, it } from 'vitest';
import { collectiveQuote } from './CollectiveContract';

/**
 * Estimation affichée avant souscription d'un contrat collectif.
 *
 * Elle doit reproduire exactement `subscribeCompany` (API) : salariés ×
 * basePremiumAnnual, coefficient de fractionnement, arrondi à 5 FCFA,
 * première échéance = total ÷ périodes. Régression couverte : l'estimation
 * partait de pricePerAdditionalAdultAnnual, champ individuel à 0 sur
 * l'offre collective — le devis affichait « 0 FCFA / salarié ».
 */
const ENT_PERF = {
  id: 'product-ent-perf',
  code: 'ENT-PERF',
  basePremiumAnnual: 120000,
  pricePerAdditionalAdultAnnual: 0, // valeur réelle en production
  pricePerChildAnnual: 48000,
  frequencyFactors: JSON.stringify({ ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 }),
};

describe('collectiveQuote — devis contrat collectif', () => {
  it('tarife les salariés sur basePremiumAnnual et jamais sur le champ individuel à 0', () => {
    const devis = collectiveQuote(ENT_PERF, 10, 'ANNUAL');

    expect(devis.perEmployeeAnnual).toBe(120000);
    expect(devis.subtotalAnnual).toBe(1200000);
    expect(devis.annualTotal).toBe(1200000);
    expect(devis.factor).toBe(1);
  });

  it('additionne les frais d’adhésion à la première échéance', () => {
    const devis = collectiveQuote(ENT_PERF, 10, 'ANNUAL');

    expect(devis.adhesion).toBe(30000); // 10 × 3 000
    expect(devis.firstContribution).toBe(1200000);
    expect(devis.firstPayment).toBe(1230000);
  });

  it('reproduit le fractionnement mensuel et la première échéance de l’API', () => {
    const devis = collectiveQuote(ENT_PERF, 10, 'MONTHLY');

    expect(devis.factor).toBe(1.06);
    expect(devis.annualTotal).toBe(1272000); // 1 200 000 × 1,06
    expect(devis.periods).toBe(12);
    expect(devis.firstContribution).toBe(106000);
    expect(devis.firstPayment).toBe(136000);
  });

  it('plafonne les frais d’adhésion à 100 000 FCFA', () => {
    expect(collectiveQuote(ENT_PERF, 100, 'ANNUAL').adhesion).toBe(100000);
  });

  it('reste cohérent sans produit sélectionné (devis à 0, jamais d’affichage aberrant)', () => {
    const devis = collectiveQuote(undefined, 10, 'ANNUAL');
    expect(devis.subtotalAnnual).toBe(0);
    expect(devis.firstPayment).toBe(30000);
  });
});
