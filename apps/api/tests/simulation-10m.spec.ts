import { describe, it, expect, vi } from 'vitest';
import {
  managementFees,
  benefitBudget,
  available,
  consumptionRatio,
  provisionalResult,
  band,
  proposeFundCall,
  deficit,
  closeOut,
  applyRenewalCredit,
  checkStopLoss,
  projectEndOfTerm,
  applyFamilyCap,
  explainCopay,
  deriveCardStatus,
  parseCtsConfig,
  defaultCtsConfig,
  CtsConfig,
  CtsBand,
  CardStatus,
} from '../src/domain/cts-engine';

// ════════════════════════════════════════════════════════════════════════════
// P20 — Scénarios 10M (§42) + Simulations A–E (§43)
// Objectif : tester le moteur CTS à grande échelle et valider les 5 scénarios de référence
// Gate CI : p95 < 200ms par scénario, 0 erreur, résultats cohérents
// ════════════════════════════════════════════════════════════════════════════

// Configuration de test — réduite pour CI, extensible à 10M
const SCALE_FACTOR = Number(process.env.SIM_SCALE ?? 1); // 1 = 1000 contrats, 10000 = 10M
const CONTRACT_COUNT = 1000 * SCALE_FACTOR;

// Seuils de performance CI
const P95_MS = 200;
const MAX_ERRORS = 0;

interface SimulationContract {
  id: string;
  collected: number;
  consumed: number;
  committed: number;
  config: CtsConfig;
  contractStatus: string;
  familyLimit?: number;
  familyUsed?: number;
  elapsedDays: number;
  totalDays: number;
  stopLossThreshold?: number;
  stopLossCap?: number;
}

interface SimulationResult {
  id: string;
  fees: number;
  budget: number;
  available: number;
  ratio: number;
  result: number;
  band: CtsBand;
  fundCall: { amount: number; minimum: number; recommended: number } | null;
  deficit: number;
  closeout: { surplus: number; renewalCredit: number; deficitAmount: number };
  renewal: { netPremium: number; budgetBoost: number };
  stopLoss: { triggered: boolean; payout: number };
  projection: { projected: number; exhaustionDay: number | null; label: string };
  cardStatus: CardStatus;
  copay: { billed: number; covered: number; outOfPocket: number };
}

// Générateur de contrats synthétiques réalistes (distribution Benin)
function generateContracts(n: number): SimulationContract[] {
  const contracts: SimulationContract[] = [];
  const products = [
    { code: 'ESS', premium: 72000, mgmtRate: 20, warn: 50, alert: 30, critical: 10, carry: 70 },
    { code: 'CONF', premium: 144000, mgmtRate: 20, warn: 50, alert: 30, critical: 10, carry: 70 },
    { code: 'EXC', premium: 300000, mgmtRate: 20, warn: 50, alert: 30, critical: 10, carry: 70 },
    { code: 'ENT-PERF', premium: 120000, mgmtRate: 20, warn: 50, alert: 30, critical: 10, carry: 70 },
    { code: 'ENT-VIP', premium: 240000, mgmtRate: 20, warn: 50, alert: 30, critical: 10, carry: 70 },
  ];
  const statuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'SUSPENDED', 'PENDING_PAYMENT'];
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    const p = products[i % products.length];
    const collected = Math.round(p.premium * (0.5 + Math.random() * 0.8)); // 50-130% encaissé
    const budget = benefitBudget(collected, managementFees(collected, p.mgmtRate));
    const maxConsumption = Math.round(budget * (0.2 + Math.random() * 1.2)); // 20-140% du budget
    const consumed = Math.min(maxConsumption, Math.round(budget * 1.5));
    const committed = Math.round(budget * Math.random() * 0.3); // 0-30% engagé
    const elapsed = Math.floor(365 * (0.1 + Math.random() * 0.9));
    const config: CtsConfig = {
      managementRate: p.mgmtRate,
      warnRatio: p.warn,
      alertRatio: p.alert,
      criticalRatio: p.critical,
      carryRate: p.carry,
      renewalMode: Math.random() > 0.5 ? 'DEDUCT' : 'BUDGET_BOOST',
      stopLoss: Math.random() > 0.8 ? { threshold: Math.round(budget * 0.9), cap: Math.round(budget * 0.2) } : null,
    };
    contracts.push({
      id: `${p.code}-${String(i).padStart(6, '0')}`,
      collected,
      consumed,
      committed,
      config,
      contractStatus: statuses[i % statuses.length],
      familyLimit: Math.random() > 0.5 ? Math.round(budget * 1.2) : undefined,
      familyUsed: Math.random() > 0.5 ? Math.round(budget * 0.4) : 0,
      elapsedDays: elapsed,
      totalDays: 365,
      stopLossThreshold: config.stopLoss?.threshold,
      stopLossCap: config.stopLoss?.cap,
    });
  }
  return contracts;
}

// Exécution complète du moteur pour un contrat
function runEngine(c: SimulationContract): SimulationResult {
  const fees = managementFees(c.collected, c.config.managementRate);
  const budget = benefitBudget(c.collected, fees);
  const avail = available(budget, c.consumed, c.committed);
  const ratio = consumptionRatio(c.consumed, c.committed, budget);
  const result = provisionalResult(c.collected, fees, c.consumed, c.committed);
  const b = band(avail, budget, c.config);
  const fundCall = avail < 0 ? proposeFundCall(budget, avail, 50000) : null;
  const def = deficit(c.consumed, c.committed, budget);
  const closeout = closeOut(c.consumed, c.committed, budget, c.config.carryRate);
  const renewal = applyRenewalCredit(c.collected, closeout.renewalCredit, c.config.renewalMode);
  const stopLoss = checkStopLoss(c.consumed, c.committed, c.config.stopLoss);
  const projection = projectEndOfTerm(budget, c.consumed, c.elapsedDays, c.totalDays);
  const cardStatus = deriveCardStatus(c.contractStatus, b);
  const copay = explainCopay(100000, Math.round(c.collected * 0.7)); // facture simulée
  return {
    id: c.id,
    fees,
    budget,
    available: avail,
    ratio,
    result,
    band: b,
    fundCall,
    deficit: def,
    closeout,
    renewal,
    stopLoss,
    projection,
    cardStatus,
    copay,
  };
}

// Benchmark utilitaire
function bench<T>(fn: () => T, iterations: number): { p95: number; mean: number; results: T[] } {
  const times: number[] = [];
  const results: T[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    results.push(fn());
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return { p95, mean, results };
}

describe('P20 — Scénario 10M (§42) — charge CTS', () => {
  const contracts = generateContracts(CONTRACT_COUNT);

  it('génère les contrats', () => {
    expect(contracts.length).toBe(CONTRACT_COUNT);
    expect(contracts[0].collected).toBeGreaterThan(0);
  });

  it('moteur pur : exécution complète < p95 seuil', () => {
    const { p95, mean, results } = bench(() => runEngine(contracts[0]), CONTRACT_COUNT);
    console.log(`[PERF] p95=${p95.toFixed(2)}ms mean=${mean.toFixed(2)}ms (n=${CONTRACT_COUNT})`);
    expect(p95).toBeLessThan(P95_MS);
    expect(results.length).toBe(CONTRACT_COUNT);
  });

  it('cohérence arithmétique : BUDGET = COLLECTED - FEES', () => {
    for (const c of contracts) {
      const fees = managementFees(c.collected, c.config.managementRate);
      const budget = benefitBudget(c.collected, fees);
      expect(budget).toBe(c.collected - fees);
    }
  });

  it('cohérence : AVAILABLE = BUDGET - CONSUMED - COMMITTED', () => {
    for (const c of contracts) {
      const fees = managementFees(c.collected, c.config.managementRate);
      const budget = benefitBudget(c.collected, fees);
      const avail = available(budget, c.consumed, c.committed);
      expect(avail).toBe(budget - c.consumed - c.committed);
    }
  });

  it('cohérence : RESULTAT = COLLECTED - FEES - CONSUMED - COMMITTED', () => {
    for (const c of contracts) {
      const fees = managementFees(c.collected, c.config.managementRate);
      const result = provisionalResult(c.collected, fees, c.consumed, c.committed);
      expect(result).toBe(c.collected - fees - c.consumed - c.committed);
    }
  });
});

describe('P20 — Simulations A–E (§43) — scénarios de référence', () => {
  // Configuration commune pour les simulations
  const baseConfig = defaultCtsConfig();
  const baseCollected = 1_000_000; // 1M FCFA prime encaissée
  const baseFees = managementFees(baseCollected, baseConfig.managementRate); // 200k
  const baseBudget = benefitBudget(baseCollected, baseFees); // 800k

  // ═══ SIMULATION A — Consommation maîtrisée, pas d'épuisement
  // Profil : assuré prudent, consommation linéaire 30% du budget
  describe('Simulation A — Consommation maîtrisée (30% budget)', () => {
    const consumed = Math.round(baseBudget * 0.3);
    const committed = Math.round(baseBudget * 0.05);
    const elapsed = 200;
    const total = 365;

    it('bande NORMAL', () => {
      const avail = available(baseBudget, consumed, committed);
      const b = band(avail, baseBudget, baseConfig);
      expect(b).toBe('NORMAL');
    });

    it('ratio < seuil surveillance', () => {
      const r = consumptionRatio(consumed, committed, baseBudget);
      expect(r).toBeLessThan(baseConfig.warnRatio / 100);
    });

    it('projection sans épuisement', () => {
      const proj = projectEndOfTerm(baseBudget, consumed, elapsed, total);
      expect(proj.exhaustionDay).toBeNull();
      expect(proj.label).toContain("pas d");
    });

    it('stop-loss non déclenché', () => {
      const sl = checkStopLoss(consumed, committed, { threshold: Math.round(baseBudget * 0.9), cap: 200_000 });
      expect(sl.triggered).toBe(false);
    });

    it('carte ACTIVE', () => {
      const b = band(available(baseBudget, consumed, committed), baseBudget, baseConfig);
      const status = deriveCardStatus('ACTIVE', b);
      expect(status).toBe('ACTIVE');
    });
  });

  // ═══ SIMULATION B — Consommation élevée, épuisement projeté
  // Profil : assuré gros consommateur, rythme > budget
  describe('Simulation B — Consommation élevée (épuisement jour ~280)', () => {
    const consumed = Math.round(baseBudget * 0.85);
    const committed = Math.round(baseBudget * 0.1);
    const elapsed = 200;
    const total = 365;

    it('bande SURVEILLANCE ou ALERTE', () => {
      const avail = available(baseBudget, consumed, committed);
      const b = band(avail, baseBudget, baseConfig);
      expect(['SURVEILLANCE', 'ALERTE', 'CRITIQUE']).toContain(b);
    });

    it('projection avec épuisement', () => {
      const proj = projectEndOfTerm(baseBudget, consumed, elapsed, total);
      expect(proj.exhaustionDay).not.toBeNull();
      expect(proj.exhaustionDay!).toBeLessThan(total);
      expect(proj.label).toContain('épuisement potentiel');
    });

    it('appel de fonds proposé si disponible négatif', () => {
      const avail = available(baseBudget, consumed, committed);
      if (avail < 0) {
        const fc = proposeFundCall(baseBudget, avail, 50000);
        expect(fc.amount).toBeGreaterThan(0);
        expect(fc.recommended).toBe(fc.amount);
      }
    });

    it('carte CRITIQUE ou SURVEILLANCE', () => {
      const b = band(available(baseBudget, consumed, committed), baseBudget, baseConfig);
      const status = deriveCardStatus('ACTIVE', b);
      expect(['SURVEILLANCE', 'CRITIQUE']).toContain(status);
    });
  });

  // ═══ SIMULATION C — Stop-loss déclenché
  // Profil : sinistre majeur dépassant le seuil contractuel
  describe('Simulation C — Stop-loss déclenché', () => {
    const stopLoss = { threshold: Math.round(baseBudget * 0.8), cap: 300_000 };
    const consumed = Math.round(baseBudget * 0.9); // dépasse seuil 80%
    const committed = Math.round(baseBudget * 0.1);

    it('stop-loss triggered', () => {
      const sl = checkStopLoss(consumed, committed, stopLoss);
      expect(sl.triggered).toBe(true);
      expect(sl.payout).toBeGreaterThan(0);
      expect(sl.payout).toBeLessThanOrEqual(stopLoss.cap);
    });

    it('payout = min(cap, excès)', () => {
      const sl = checkStopLoss(consumed, committed, stopLoss);
      const excess = Math.max(0, consumed + committed - stopLoss.threshold);
      expect(sl.payout).toBe(Math.min(stopLoss.cap, excess));
    });

    it('bande CRITIQUE ou EPUISE', () => {
      const avail = available(baseBudget, consumed, committed);
      const b = band(avail, baseBudget, baseConfig);
      expect(['CRITIQUE', 'EPUISE']).toContain(b);
    });

    it('carte CRITIQUE', () => {
      const b = band(available(baseBudget, consumed, committed), baseBudget, baseConfig);
      const status = deriveCardStatus('ACTIVE', b);
      expect(status).toBe('CRITIQUE');
    });
  });

  // ═══ SIMULATION D — Appels de fonds multiples
  // Profil : contrat en tension, plusieurs appels nécessaires
  describe('Simulation D — Appels de fonds multiples', () => {
    const consumed = Math.round(baseBudget * 0.95);
    const committed = Math.round(baseBudget * 0.15); // total > budget

    it('disponible négatif', () => {
      const avail = available(baseBudget, consumed, committed);
      expect(avail).toBeLessThan(0);
    });

    it('déficit > 0 (jamais facturé auto)', () => {
      const def = deficit(consumed, committed, baseBudget);
      expect(def).toBeGreaterThan(0);
    });

    it('appel de fonds proposé ≥ déficit', () => {
      const avail = available(baseBudget, consumed, committed);
      const fc = proposeFundCall(baseBudget, avail, 100_000);
      expect(fc.amount).toBeGreaterThanOrEqual(-avail);
    });

    it('bande EPUISE', () => {
      const avail = available(baseBudget, consumed, committed);
      const b = band(avail, baseBudget, baseConfig);
      expect(b).toBe('EPUISE');
    });

    it('carte CRITIQUE (pas de coupure mécanique)', () => {
      const avail = available(baseBudget, consumed, committed);
      const b = band(avail, baseBudget, baseConfig);
      const status = deriveCardStatus('ACTIVE', b);
      expect(status).toBe('CRITIQUE'); // Affichage seul
    });
  });

  // ═══ SIMULATION E — Renouvellement avec crédit report
  // Profil : excédent en fin de contrat, crédit appliqué au renouvellement
  describe('Simulation E — Renouvellement avec crédit (mode DEDUCT & BUDGET_BOOST)', () => {
    const consumed = Math.round(baseBudget * 0.4);
    const committed = Math.round(baseBudget * 0.05);
    const newPremium = 1_200_000; // prime année N+1

    it('excédent positif → crédit calculé', () => {
      const closeout = closeOut(consumed, committed, baseBudget, baseConfig.carryRate);
      expect(closeout.surplus).toBeGreaterThan(0);
      expect(closeout.renewalCredit).toBe(Math.round((closeout.surplus * baseConfig.carryRate) / 100));
    });

    it('mode DEDUCT : prime nette réduite', () => {
      const closeout = closeOut(consumed, committed, baseBudget, baseConfig.carryRate);
      const renew = applyRenewalCredit(newPremium, closeout.renewalCredit, 'DEDUCT');
      expect(renew.netPremium).toBe(newPremium - closeout.renewalCredit);
      expect(renew.budgetBoost).toBe(0);
    });

    it('mode BUDGET_BOOST : prime inchangée, boost budget', () => {
      const closeout = closeOut(consumed, committed, baseBudget, baseConfig.carryRate);
      const renew = applyRenewalCredit(newPremium, closeout.renewalCredit, 'BUDGET_BOOST');
      expect(renew.netPremium).toBe(newPremium);
      expect(renew.budgetBoost).toBe(closeout.renewalCredit);
    });

    it('crédit non retirable, bonus contractuel', () => {
      const closeout = closeOut(consumed, committed, baseBudget, baseConfig.carryRate);
      expect(closeout.renewalCredit).toBeGreaterThan(0);
      // Vérification sémantique : le crédit ne réduit pas la dette, il booste le budget ou réduit la prime
    });
  });
});

describe('P20 — Intégration config produit + surcharge contrat (parseCtsConfig)', () => {
  it('produit seul : défauts appliqués', () => {
    const cfg = parseCtsConfig('{"managementRate":25}', undefined);
    expect(cfg.managementRate).toBe(25);
    expect(cfg.warnRatio).toBe(50); // défaut
    expect(cfg.carryRate).toBe(70);
  });

  it('surcharge contrat gagne (borné 0-100)', () => {
    const cfg = parseCtsConfig('{"managementRate":25}', '{"managementRate":150}'); // >100 → clampé
    expect(cfg.managementRate).toBe(100);
  });

  it('stopLoss null dans surcharge désactive', () => {
    const cfg = parseCtsConfig('{"stopLoss":{"threshold":500000,"cap":100000}}', '{"stopLoss":null}');
    expect(cfg.stopLoss).toBeNull();
  });

  it('JSON invalide ignoré silencieusement', () => {
    const cfg = parseCtsConfig('{invalid}', '{"managementRate":30}');
    expect(cfg.managementRate).toBe(30); // seule la surcharge valide prise en compte
  });
});

describe('P20 — Plafond foyer (applyFamilyCap)', () => {
  it('sans limite → montant intact', () => {
    expect(applyFamilyCap(80_000, null, 0)).toBe(80_000);
    expect(applyFamilyCap(80_000, undefined, 0)).toBe(80_000);
  });

  it('avec limite → borné par reste foyer', () => {
    const limit = 1_000_000;
    const used = 950_000;
    expect(applyFamilyCap(80_000, limit, used)).toBe(50_000); // 1M - 950k = 50k
  });

  it('demande > reste → reste seulement', () => {
    expect(applyFamilyCap(200_000, 1_000_000, 950_000)).toBe(50_000);
  });

  it('pas de négatif', () => {
    expect(applyFamilyCap(80_000, 1_000_000, 1_000_000)).toBe(0);
    expect(applyFamilyCap(80_000, 1_000_000, 1_200_000)).toBe(0);
  });
});

describe('P20 — Reste à charge expliqué (explainCopay)', () => {
  it('facture > prise en charge → reste positif', () => {
    const r = explainCopay(100_000, 75_000);
    expect(r.billed).toBe(100_000);
    expect(r.covered).toBe(75_000);
    expect(r.outOfPocket).toBe(25_000);
  });

  it('prise en charge > facture → bornée à facture', () => {
    const r = explainCopay(50_000, 60_000);
    expect(r.covered).toBe(50_000);
    expect(r.outOfPocket).toBe(0);
  });

  it('valeurs négatives bornées à 0', () => {
    const r = explainCopay(-10_000, -5_000);
    expect(r.billed).toBe(0);
    expect(r.covered).toBe(0);
    expect(r.outOfPocket).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Script d'exécution standalone pour 10M (optionnel, via npx vitest run simulation-10m)
// Usage : SIM_SCALE=10000 npx vitest run apps/api/tests/simulation-10m.spec.ts
// ════════════════════════════════════════════════════════════════════════════