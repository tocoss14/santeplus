/**
 * Domaine financier V2_MUTUAL — logique mutualiste cible.
 *
 * Fonctions pures, sans accès disque ni base : le moteur V2 les consomme pour
 * produire la position technique, les provisions et les indicateurs
 * prudentiels. Aucune règle V1 (management fee 20 %, appels de fonds, crédit
 * de renouvellement) ne vit ici : les deux moteurs restent étanches.
 */

// ── Tarification mutualiste ────────────────────────────────────────────────

export interface MutualPricing {
  /** Cotisation de base par adulte (FCFA/an). */
  adultContribution: number;
  /** Cotisation de base par enfant (< 18 ans) (FCFA/an). */
  childContribution: number;
  /** Charge attendue par assuré (FCFA/an) — sert de base aux provisions. */
  expectedAnnualCostPerPerson: number;
  /** Taux de charges de gestion appliqué aux cotisations (0,12 = 12 %). */
  adminLoadRate: number;
  /** Taux de cession en réassurance quota-share (0 = aucune, 0,3 = 30 %). */
  reinsuranceCessionRate: number;
  /** Part de l'excédent technique alimentant le Fonds de solidarité (0..1). */
  solidarityShareOfSurplus: number;
}

export const DEFAULT_V2_PRICING: MutualPricing = {
  adultContribution: 72_000,
  childContribution: 48_000,
  expectedAnnualCostPerPerson: 55_000,
  adminLoadRate: 0.12,
  reinsuranceCessionRate: 0,
  solidarityShareOfSurplus: 0.2,
};

export interface MutualQuotePerson {
  birthDate: Date;
  relation: string;
}

export interface MutualQuote {
  adultCount: number;
  childCount: number;
  grossContribution: number;
  adminLoad: number;
  totalAnnual: number;
  expectedAnnualCost: number;
}

/** Âge atteint dans l'année de référence ( approximation volontaire au jour près). */
function age(birthDate: Date, at: Date): number {
  let a = at.getFullYear() - birthDate.getFullYear();
  const m = at.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birthDate.getDate())) a--;
  return a;
}

/** Énumère les personnes couvertes : assuré principal + ayants droit. */
export function mutualPersons(principal: MutualQuotePerson, beneficiaries: MutualQuotePerson[]): MutualQuotePerson[] {
  return [principal, ...beneficiaries];
}

/** Cotisation mutualiste : cotisations de base par personne + charge de gestion. */
export function computeMutualQuote(
  pricing: MutualPricing,
  principal: MutualQuotePerson,
  beneficiaries: MutualQuotePerson[],
  at = new Date(),
): MutualQuote {
  const persons = mutualPersons(principal, beneficiaries);
  const adultCount = persons.filter(p => age(p.birthDate, at) >= 18).length;
  const childCount = persons.length - adultCount;
  const grossContribution = adultCount * pricing.adultContribution + childCount * pricing.childContribution;
  const adminLoad = Math.round(grossContribution * pricing.adminLoadRate);
  return {
    adultCount,
    childCount,
    grossContribution,
    adminLoad,
    totalAnnual: grossContribution + adminLoad,
    expectedAnnualCost: persons.length * pricing.expectedAnnualCostPerPerson,
  };
}

// ── Position technique ──────────────────────────────────────────────────────

export interface TechnicalPositionInput {
  /** Cotisations et autres ressources de la période (FCFA). */
  contributions: number;
  /** Prestations engagées (dossiers ouverts, non encore payées) (FCFA). */
  engagedClaims: number;
  /** Prestations payées sur la période (FCFA). */
  paidClaims: number;
  /** Charges de gestion et frais (FCFA). */
  expenses: number;
  /** Recouvrements (tiers payant, subrogations, créances récupérées) (FCFA). */
  recoveries: number;
  /** Dotations réserves déjà comptabilisées (FCFA) — retranchées de la position. */
  reserveAllocations: number;
  /** Provision pour sinistres à payer : sinistres survenus, non déclarés au tarif connu. */
  rbns: number;
  /** Incurred But Not Reported : estimation des sinistres survenus non déclarés. */
  ibnr: number;
  /** Réassurance : part cédée des charges (quota-share). */
  reinsuranceCessionRate: number;
}

export interface TechnicalPosition {
  contributions: number;
  engagedClaims: number;
  paidClaims: number;
  expenses: number;
  recoveries: number;
  rbns: number;
  ibnr: number;
  /** Charges cédées au réassureur (quota-share sur engagements + payé). */
  reinsuranceCeded: number;
  /** Position technique : ressources − engagements − charges + recouvrements − provisions. */
  position: number;
  /** Solde du Fonds de solidarité en début de calcul (informatif, passé en extension). */
  solidarityFund: number;
}

/** Position technique V2 : Cotisations + Autres ressources − Prestations engagées − Prestations payées − Charges − Provisions + Recouvrements. */
export function computeTechnicalPosition(
  input: TechnicalPositionInput,
  solidarityFund = 0,
): TechnicalPosition {
  const claims = input.engagedClaims + input.paidClaims;
  const reinsuranceCeded = Math.round(claims * input.reinsuranceCessionRate);
  const provisions = input.rbns + input.ibnr;
  const position =
    input.contributions +
    input.recoveries -
    claims -
    input.expenses -
    provisions +
    reinsuranceCeded -
    input.reserveAllocations;
  return {
    ...input,
    reinsuranceCeded,
    position,
    solidarityFund,
  };
}

// ── Réserves ────────────────────────────────────────────────────────────────

export interface ReservePolicy {
  /** Taux de cotisations à mettre en réserve (0,1 = 10 %). */
  contributionRate: number;
  /** Réserve minimum exprimée en mois de charges attendues. */
  minimumMonthsOfExpectedCost: number;
}

export const DEFAULT_RESERVE_POLICY: ReservePolicy = { contributionRate: 0.1, minimumMonthsOfExpectedCost: 3 };

/** Dotation de réserve de l'exercice (plafonnée pour ne pas creuser la position). */
export function computeReserveAllocation(
  contributions: number,
  position: number,
  policy: ReservePolicy = DEFAULT_RESERVE_POLICY,
): number {
  const target = Math.round(contributions * policy.contributionRate);
  return Math.max(0, Math.min(target, Math.max(0, position)));
}

// ── Résultat technique / net ────────────────────────────────────────────────

export interface TechnicalResult {
  contributions: number;
  otherIncome: number;
  claims: number;
  expenses: number;
  provisionsChange: number;
  reinsuranceResult: number;
  /** Résultat technique = ressources − charges techniques. */
  technicalResult: number;
  /** Part de l'excédent versée au Fonds de solidarité. */
  solidarityAllocation: number;
  /** Résultat net après affectation solidarité (le reste est mis en réserve). */
  netResult: number;
}

export function computeTechnicalResult(
  input: Pick<TechnicalPositionInput, 'contributions' | 'engagedClaims' | 'paidClaims' | 'expenses' | 'reinsuranceCessionRate'> & {
    otherIncome?: number;
    provisionsChange?: number;
    solidarityFund: number;
    solidarityShareOfSurplus: number;
  },
): TechnicalResult {
  const claims = input.engagedClaims + input.paidClaims;
  const otherIncome = input.otherIncome ?? 0;
  const provisionsChange = input.provisionsChange ?? 0;
  const reinsuranceResult = -Math.round(claims * input.reinsuranceCessionRate);
  const technicalResult =
    input.contributions + otherIncome - claims - input.expenses - provisionsChange + reinsuranceResult;
  // L'excédent n'alimente le Fonds de solidarité que si le fonds est sous
  // son seuil (complément) ; sinon l'excédent reste en réserve.
  const solidarityNeeds = Math.max(0, -input.solidarityFund);
  const solidarityAllocation = technicalResult > 0
    ? Math.min(Math.round(technicalResult * input.solidarityShareOfSurplus), solidarityNeeds)
    : 0;
  const netResult = technicalResult - solidarityAllocation;
  return {
    contributions: input.contributions,
    otherIncome,
    claims,
    expenses: input.expenses,
    provisionsChange,
    reinsuranceResult,
    technicalResult,
    solidarityAllocation,
    netResult,
  };
}

// ── Indicateurs prudentiels ─────────────────────────────────────────────────

export interface SolvencyIndicators {
  /** Marge de solvabilité : position technique / engagements totaux. */
  solvencyRatio: number;
  /** Taux de sinistralité : (engagé + payé + provisions) / cotisations. */
  lossRatio: number;
  /** Taux de charges : frais / cotisations. */
  expenseRatio: number;
  /** Couverture RBNS+IBNR par la position disponible. */
  provisionCoverage: number;
  /** Nombre de mois de charges attendues couverts par la position. */
  monthsOfCoverage: number;
}

export function computeSolvencyIndicators(
  position: TechnicalPosition,
  expectedMonthlyCost: number,
): SolvencyIndicators {
  const engagements = position.engagedClaims + position.paidClaims + position.rbns + position.ibnr;
  const totalProvisions = position.rbns + position.ibnr;
  const lossRatio = position.contributions > 0 ? (engagements - position.reinsuranceCeded) / position.contributions : 0;
  const expenseRatio = position.contributions > 0 ? position.expenses / position.contributions : 0;
  const available = position.position + position.solidarityFund;
  return {
    solvencyRatio: engagements > 0 ? available / engagements : 1,
    lossRatio,
    expenseRatio,
    provisionCoverage: totalProvisions > 0 ? available / totalProvisions : 1,
    monthsOfCoverage: expectedMonthlyCost > 0 ? available / expectedMonthlyCost : Infinity,
  };
}
