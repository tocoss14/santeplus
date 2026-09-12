// Compte Technique Santé (CTS) — moteur pur, aucune dépendance DB/IO.
// Tous les montants en FCFA entiers. Cahier des charges §7-§24, §40.
// Le moteur ne décide jamais seul : il calcule, le service applicatif
// (CtsService, phase 10/11) persiste journal + recalcul et applique les règles.

/** Types de mouvements du journal CTS immuable (§28). */
export const CTS_JOURNAL_TYPES = [
  'PRIME',
  'FRAIS',
  'BUDGET',
  'ENGAGEMENT',
  'CONSOMMATION',
  'ANNULATION',
  'REMBOURSEMENT',
  'APPEL_FONDS',
  'PAIEMENT',
  'CREDIT_RENOUVELLEMENT',
  'STOP_LOSS',
  'AJUSTEMENT',
  'SOLIDARITE',
] as const;
export type CtsJournalType = (typeof CTS_JOURNAL_TYPES)[number];

/** Types d'alertes automatiques (§15). */
export const CTS_ALERT_TYPES = [
  'CONSOMMATION',
  'CONSOMMATION_ELEVEE',
  'SEUIL',
  'CRITIQUE',
  'EPUISEMENT',
  'APPEL_FONDS',
  'RENOUVELLEMENT',
  'ANOMALIE',
  'FACTURE',
  'PAIEMENT',
] as const;
export type CtsAlertType = (typeof CTS_ALERT_TYPES)[number];

/** Bandes de disponibilité (§14). */
export type CtsBand = 'NORMAL' | 'SURVEILLANCE' | 'ALERTE' | 'CRITIQUE' | 'EPUISE';

/** Statuts de carte dérivés (§18) — affichage seul, jamais de coupure mécanique (§40.20). */
export type CardStatus =
  | 'ACTIVE'
  | 'SURVEILLANCE'
  | 'CRITIQUE'
  | 'SUSPENDUE'
  | 'REACTIVATION_EN_ATTENTE'
  | 'EXPIREE'
  | 'RESILIEE';

/** Mode d'utilisation du crédit de renouvellement (§20). */
export type RenewalMode = 'DEDUCT' | 'BUDGET_BOOST';

export interface CtsStopLoss {
  threshold: number;
  cap: number;
}

/** Configuration CTS : produit (ctsConfig) + surcharges contrat (ctsOverride). */
export interface CtsConfig {
  /** Taux de frais de gestion, % — défaut 20 (§8). */
  managementRate: number;
  /** % de disponible sous lequel on passe en SURVEILLANCE — défaut 50 (§14). */
  warnRatio: number;
  /** % de disponible sous lequel on passe en ALERTE — défaut 30. */
  alertRatio: number;
  /** % de disponible sous lequel on passe en CRITIQUE — défaut 10. */
  criticalRatio: number;
  /** Taux de report d'excédent en crédit, % — défaut 70 (§19). */
  carryRate: number;
  /** Mode d'utilisation du crédit — défaut DEDUCT (§20). */
  renewalMode: RenewalMode;
  /** Stop-loss contractuel (§22) — null si non souscrit. */
  stopLoss: CtsStopLoss | null;
}

export function defaultCtsConfig(): CtsConfig {
  return {
    managementRate: 20,
    warnRatio: 50,
    alertRatio: 30,
    criticalRatio: 10,
    carryRate: 70,
    renewalMode: 'DEDUCT',
    stopLoss: null,
  };
}

function clampRate(v: unknown, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(100, Math.max(0, n));
}

/** Fusionne config produit + surcharges contrat (le contrat gagne, borné 0-100). */
export function parseCtsConfig(
  productJson: string | null | undefined,
  overrideJson?: string | null,
): CtsConfig {
  const base = defaultCtsConfig();
  const layers: unknown[] = [];
  for (const raw of [productJson, overrideJson]) {
    if (!raw) continue;
    try {
      layers.push(JSON.parse(raw));
    } catch {
      // JSON invalide ignoré — défauts conservés
    }
  }
  const out: CtsConfig = { ...base, stopLoss: base.stopLoss };
  for (const layer of layers) {
    if (typeof layer !== 'object' || layer === null) continue;
    const l = layer as Record<string, unknown>;
    if ('managementRate' in l) out.managementRate = clampRate(l.managementRate, out.managementRate);
    if ('warnRatio' in l) out.warnRatio = clampRate(l.warnRatio, out.warnRatio);
    if ('alertRatio' in l) out.alertRatio = clampRate(l.alertRatio, out.alertRatio);
    if ('criticalRatio' in l) out.criticalRatio = clampRate(l.criticalRatio, out.criticalRatio);
    if ('carryRate' in l) out.carryRate = clampRate(l.carryRate, out.carryRate);
    if (l.renewalMode === 'DEDUCT' || l.renewalMode === 'BUDGET_BOOST') out.renewalMode = l.renewalMode;
    if (
      typeof l.stopLoss === 'object' &&
      l.stopLoss !== null &&
      typeof (l.stopLoss as Record<string, unknown>).threshold === 'number' &&
      typeof (l.stopLoss as Record<string, unknown>).cap === 'number'
    ) {
      const s = l.stopLoss as Record<string, unknown>;
      out.stopLoss = {
        threshold: Math.max(0, s.threshold as number),
        cap: Math.max(0, s.cap as number),
      };
    } else if (l.stopLoss === null) {
      out.stopLoss = null;
    }
  }
  return out;
}

/** FRAIS_GESTION = PRIME_ENCAISSEE × TAUX_GESTION (§8). */
export function managementFees(collected: number, rate: number): number {
  if (collected <= 0 || rate <= 0) return 0;
  return Math.round((collected * Math.min(100, rate)) / 100);
}

/** BUDGET_PRESTATIONS = PRIME_ENCAISSEE − FRAIS_GESTION (§9). */
export function benefitBudget(collected: number, fees: number): number {
  return collected - fees;
}

/** SOLDE = BUDGET − CONSOMMATIONS − ENGAGEMENTS (§12). Peut être négatif (déficit). */
export function available(budget: number, consumed: number, committed: number): number {
  return budget - consumed - committed;
}

/** Ratio d'exposition = (consommé + engagé) / budget. 0 si budget nul et sans exposition. */
export function consumptionRatio(consumed: number, committed: number, budget: number): number {
  const exposure = consumed + committed;
  if (budget > 0) return exposure / budget;
  return exposure > 0 ? 1 : 0;
}

/** RESULTAT_TECHNIQUE = ENCAISSEE − FRAIS − CONSOMMATIONS − ENGAGEMENTS (§13, provisoire). */
export function provisionalResult(collected: number, fees: number, consumed: number, committed: number): number {
  return collected - fees - consumed - committed;
}

/** Bande de disponibilité en % du budget (§14). */
export function band(availableAmount: number, budget: number, cfg: CtsConfig): CtsBand {
  const pct = budget > 0 ? (availableAmount / budget) * 100 : availableAmount > 0 ? 100 : 0;
  if (pct <= 0) return 'EPUISE';
  if (pct < cfg.criticalRatio) return 'CRITIQUE';
  if (pct < cfg.alertRatio) return 'ALERTE';
  if (pct < cfg.warnRatio) return 'SURVEILLANCE';
  return 'NORMAL';
}

export interface FundCallProposal {
  /** APPEL = CIBLE − DISPONIBLE (§16), plancher 0. */
  amount: number;
  /** Plancher contractuel (0 = pas de plancher). */
  minimum: number;
  /** Montant recommandé = montant de l'appel (le choisi reste humain). */
  recommended: number;
}

/** Proposition d'appel de fonds : cible moins disponible, jamais négatif. */
export function proposeFundCall(target: number, availableAmount: number, minimum = 0): FundCallProposal {
  const amount = Math.max(0, target - availableAmount);
  return { amount, minimum: Math.min(Math.max(0, minimum), amount), recommended: amount };
}

/** DEFICIT = CONSOMMATIONS + ENGAGEMENTS − BUDGET si > 0 (§21, jamais facturé auto). */
export function deficit(consumed: number, committed: number, budget: number): number {
  return Math.max(0, consumed + committed - budget);
}

/** EXCEDENT = BUDGET − CONSOMMATIONS − ENGAGEMENTS ; CREDIT = EXCEDENT × TAUX_REPORT (§19). */
export function closeOut(
  consumed: number,
  committed: number,
  budget: number,
  carryRate: number,
): { surplus: number; renewalCredit: number; deficitAmount: number } {
  const surplus = Math.max(0, budget - consumed - committed);
  const renewalCredit = Math.round((surplus * clampRate(carryRate, 70)) / 100);
  return { surplus, renewalCredit, deficitAmount: deficit(consumed, committed, budget) };
}

/** Application du crédit au renouvellement, OPTION A/B (§20). */
export function applyRenewalCredit(
  newPremium: number,
  credit: number,
  mode: RenewalMode,
): { netPremium: number; budgetBoost: number } {
  const safeCredit = Math.max(0, credit);
  if (mode === 'BUDGET_BOOST') return { netPremium: Math.max(0, newPremium), budgetBoost: safeCredit };
  return { netPremium: Math.max(0, newPremium - safeCredit), budgetBoost: 0 };
}

export interface StopLossCheck {
  triggered: boolean;
  /** Part au-delà du seuil, plafonnée au cap. */
  payout: number;
}

/** Stop-loss : déclenché au-delà du seuil sur l'exposition totale (§22). */
export function checkStopLoss(
  consumed: number,
  committed: number,
  stopLoss: CtsStopLoss | null,
): StopLossCheck {
  if (!stopLoss || stopLoss.threshold <= 0) return { triggered: false, payout: 0 };
  const excess = Math.max(0, consumed + committed - stopLoss.threshold);
  if (excess <= 0) return { triggered: false, payout: 0 };
  return { triggered: true, payout: Math.min(stopLoss.cap, excess) };
}

export interface Projection {
  /** Consommation projetée fin de contrat (méthode linéaire). */
  projected: number;
  /** Jour estimé d'épuisement depuis le début (null si pas d'épuisement projeté). */
  exhaustionDay: number | null;
  /** Libellé — toujours indicatif, jamais une certitude (§33). */
  label: string;
}

/** Projection fin de contrat, méthode linéaire (extensible via `method`). */
export function projectEndOfTerm(
  budget: number,
  consumedToDate: number,
  elapsedDays: number,
  totalDays: number,
  method = 'linear',
): Projection {
  void method;
  const safeElapsed = Math.max(0, elapsedDays);
  const safeTotal = Math.max(1, totalDays);
  const daily = safeElapsed > 0 ? consumedToDate / safeElapsed : 0;
  const projected = Math.round(daily * safeTotal);
  let exhaustionDay: number | null = null;
  if (daily > 0 && budget > 0) {
    const day = Math.floor((budget - consumedToDate) / daily) + safeElapsed;
    if (day >= safeElapsed && day <= safeTotal) exhaustionDay = day;
  }
  const label =
    exhaustionDay === null
      ? 'Projection indicative : pas d\u2019épuisement prévu à rythme actuel (ni une certitude).'
      : `Projection indicative : épuisement potentiel vers le jour ${exhaustionDay} à rythme actuel (ni une certitude).`;
  return { projected, exhaustionDay, label };
}

/**
 * Plafond foyer (§23) : la prise en charge réelle est bornée par le reste foyer.
 * Exemple : plafond 1 000 000, consommé 950 000, demande 80 000 → 50 000.
 */
export function applyFamilyCap(
  amount: number,
  familyLimit: number | null | undefined,
  familyUsed: number,
): number {
  if (familyLimit == null) return Math.max(0, amount);
  return Math.max(0, Math.min(amount, familyLimit - Math.max(0, familyUsed)));
}

/** Reste à charge expliqué (§24) : FACTURE − PRISE_EN_CHARGE. */
export function explainCopay(billed: number, covered: number): {
  billed: number;
  covered: number;
  outOfPocket: number;
} {
  const safeCovered = Math.max(0, Math.min(covered, Math.max(0, billed)));
  return { billed: Math.max(0, billed), covered: safeCovered, outOfPocket: Math.max(0, billed) - safeCovered };
}

/**
 * Statut de carte dérivé (§18) : le statut contrat prime, sinon la bande CTS.
 * Affichage seul — aucune coupure mécanique de droits (§40.20).
 */
export function deriveCardStatus(contractStatus: string, bandValue: CtsBand): CardStatus {
  if (contractStatus === 'TERMINATED') return 'RESILIEE';
  if (contractStatus === 'EXPIRED') return 'EXPIREE';
  if (contractStatus === 'SUSPENDED') return 'SUSPENDUE';
  if (contractStatus === 'DRAFT' || contractStatus === 'PENDING_PAYMENT') return 'REACTIVATION_EN_ATTENTE';
  if (bandValue === 'EPUISE' || bandValue === 'CRITIQUE' || bandValue === 'ALERTE') return 'CRITIQUE';
  if (bandValue === 'SURVEILLANCE') return 'SURVEILLANCE';
  return 'ACTIVE';
}
