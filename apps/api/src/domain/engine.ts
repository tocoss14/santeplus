export type Frequency = 'ANNUAL' | 'QUARTERLY' | 'MONTHLY';
export const FREQUENCIES: Frequency[] = ['ANNUAL', 'QUARTERLY', 'MONTHLY'];
const PERIODS: Record<Frequency, number> = { ANNUAL: 1, QUARTERLY: 4, MONTHLY: 12 };

export const CLAIM_STATUSES_CONSUMING_CAPS = ['APPROVED', 'PARTIALLY_APPROVED', 'PAID', 'CONFIRMED', 'AUTHORIZED'] as const;

export function needsPriorAuthorization(totalCovered: number, threshold: number | null | undefined): boolean {
  return typeof threshold === 'number' && threshold > 0 && totalCovered > threshold;
}

export function resolveThreshold(
  product: number | null | undefined,
  act: number | null | undefined,
  globalFallback = 150000,
): number {
  const c = [product, act].filter((v): v is number => typeof v === 'number' && v > 0);
  return c.length ? Math.min(...c) : globalFallback;
}

export interface BeneficiaryRules {
  spouse?: boolean;
  childMaxAge?: number;
  otherAllowed?: boolean;
  maxBeneficiaries?: number;
}

export interface ProductPricing {
  basePremiumAnnual: number;
  pricePerAdditionalAdultAnnual: number;
  pricePerChildAnnual: number;
  frequencyFactors: Partial<Record<Frequency, number>>;
  minAge: number;
  maxAge: number;
  waitingPeriodDays?: number;
  beneficiaryRules?: BeneficiaryRules;
  /** Charges par tranche d'âge (ex: [{minAge:0,maxAge:30,factor:1.0},{minAge:31,maxAge:50,factor:1.3},{minAge:51,maxAge:65,factor:1.8}]) */
  ageLoadings?: { minAge: number; maxAge: number; factor: number }[];
  /** Plafond agrégé annuel par contrat (FCFA) */
  globalAnnualCap?: number;
}

export interface QuotePerson {
  birthDate: Date;
  relation: 'PRINCIPAL' | 'SPOUSE' | 'CHILD' | 'OTHER';
}

export interface QuoteLine {
  label: string;
  amount: number;
}

export interface QuoteResult {
  lines: QuoteLine[];
  subtotalAnnual: number;
  frequency: Frequency;
  factor: number;
  totalAnnual: number;
  periods: number;
  periodicAmount: number;
  currency: string;
}

export function ageAt(birthDate: Date, at: Date): number {
  let age = at.getFullYear() - birthDate.getFullYear();
  const m = at.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birthDate.getDate())) age--;
  return age;
}

export function computeQuote(
  pricing: ProductPricing,
  persons: QuotePerson[],
  frequency: Frequency,
): { errors: string[]; quote?: QuoteResult } {
  const errors: string[] = [];
  const now = new Date();
  const principal = persons[0];
  if (!principal) errors.push('Assuré principal requis');
  else {
    const age = ageAt(principal.birthDate, now);
    if (age < pricing.minAge) errors.push(`Âge minimum requis : ${pricing.minAge} ans`);
    if (age > pricing.maxAge) errors.push(`Âge maximum : ${pricing.maxAge} ans`);
  }
  for (let i = 1; i < persons.length; i++) {
    const p = persons[i];
    const age = ageAt(p.birthDate, now);
    if (age > pricing.maxAge) errors.push(`Bénéficiaire ${i} : âge maximum dépassé (${pricing.maxAge} ans)`);
    if (p.relation === 'CHILD') {
      const childMax = pricing.beneficiaryRules?.childMaxAge ?? 21;
      if (age >= childMax) errors.push(`Enfant ${i} : doit avoir moins de ${childMax} ans`);
    }
  }

  let adults = 0;
  let children = 0;
  let maxAdultAge = 0;
  for (const p of persons) {
    const a = ageAt(p.birthDate, now);
    if (p.relation === 'CHILD') children++;
    else {
      adults++;
      if (a > maxAdultAge) maxAdultAge = a;
    }
  }
  const adultExtras = Math.max(0, adults - 1);
  const base = pricing.basePremiumAnnual;
  const extraAdultsCost = adultExtras * pricing.pricePerAdditionalAdultAnnual;
  const childrenCost = children * pricing.pricePerChildAnnual;
  let subtotal = base + extraAdultsCost + childrenCost;

  // Chargement par âge : appliquer le facteur de l'âge le plus élevé du foyer
  if (pricing.ageLoadings && pricing.ageLoadings.length > 0) {
    const loading = pricing.ageLoadings.find(l => maxAdultAge >= l.minAge && maxAdultAge <= l.maxAge);
    if (loading && loading.factor !== 1) {
      subtotal = Math.round(subtotal * loading.factor);
    }
  }

  const factor = pricing.frequencyFactors?.[frequency] ?? 1;
  const totalAnnual = round(subtotal * factor);
  const periods = PERIODS[frequency];
  const periodicAmount = splitEven(totalAnnual, periods)[0];

  const lines: QuoteLine[] = [];
  lines.push({ label: 'Cotisation de base (assuré principal)', amount: base });
  if (adultExtras > 0)
    lines.push({ label: `Ayants droit adultes supplémentaires (${adultExtras})`, amount: extraAdultsCost });
  if (children > 0) lines.push({ label: `Enfants (${children})`, amount: childrenCost });    if (factor !== 1) lines.push({ label: `Fractionnement ${frequency.toLowerCase()} (×${factor})`, amount: totalAnnual - subtotal });
    if (pricing.ageLoadings && pricing.ageLoadings.length > 0) {
      const loading = pricing.ageLoadings.find(l => maxAdultAge >= l.minAge && maxAdultAge <= l.maxAge);
      if (loading && loading.factor !== 1) {
        lines.push({ label: `Surcharge âge (${maxAdultAge} ans, ×${loading.factor})`, amount: Math.round(base * (loading.factor - 1)) });
      }
    }

  return {
    errors,
    quote: {
      lines,
      subtotalAnnual: subtotal,
      frequency,
      factor,
      totalAnnual,
      periods,
      periodicAmount,
      currency: 'XOF',
    },
  };
}

export function splitEven(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => (i < remainder ? base + 1 : base));
}

export function buildSchedule(
  totalAnnual: number,
  frequency: Frequency,
  startDate: Date,
): { sequence: number; dueDate: Date; amount: number }[] {
  const periods = PERIODS[frequency];
  const stepDays = frequency === 'MONTHLY' ? 30 : frequency === 'QUARTERLY' ? 91 : 0;
  const amounts = splitEven(totalAnnual, periods);
  return amounts.map((amount, i) => ({
    sequence: i + 1,
    dueDate: addDaysSafe(startDate, i * stepDays),
    amount,
  }));
}

function addDaysSafe(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function round(n: number): number {
  return Math.round(n / 5) * 5;
}

export interface CoverageRule {
  categoryId: string;
  categoryName?: string;
  annualLimit: number | null;
  rate: number;
  deductibleType: 'NONE' | 'FIXED' | 'PERCENT';
  deductibleValue: number;
  /** Co-paiement obligatoire (% que l'assuré paie de sa poche APRÈS déduction franchise+taux) */
  copayRate?: number;
  /** Plafond maximum par acte (barème médical) — null = pas de contrôle */
  maxUnitPrice?: number | null;
}

export interface ClaimCtx {
  contractStatus: string;
  startDate: Date;
  endDate: Date;
  waitingPeriodDays: number;
  excludedCategories: string[];
  rules: CoverageRule[];
  usedPerCategory: Record<string, number>;
  /** Plafond agrégé annuel sur toutes les catégories confondues (0 = pas de plafond) */
  globalAnnualCap?: number;
  /** Dépense totale déjà consommée sur l'année (toutes catégories) */
  usedGlobal?: number;
}

export interface ClaimItemInput {
  categoryId: string;
  label?: string;
  amountRequested: number;
}

export interface EstimationItem {
  categoryId: string;
  label?: string;
  amountRequested: number;
  amountEligible: number;
  rateApplied: number;
  deductibleApplied: number;
  copayApplied: number;
  amountApproved: number;
  /** Montant restant à la charge de l'assuré (franchise + copay + dépassement) */
  outOfPocket: number;
  reason?: 'EXCLUDED' | 'CAP_REACHED' | 'CONTRACT_INACTIVE' | 'OUT_OF_PERIOD' | 'WAITING_PERIOD' | 'GLOBAL_CAP_REACHED' | 'FEE_SCHEDULE_EXCEEDED';
}

export interface EstimationResult {
  ok: boolean;
  flags: string[];
  items: EstimationItem[];
  totals: {
    requested: number;
    eligible: number;
    approved: number;
    outOfPocket: number;
  };
}

export function estimateClaim(
  ctx: ClaimCtx,
  careDate: Date,
  items: ClaimItemInput[],
  duplicateSuspect = false,
): EstimationResult {
  const flags: string[] = [];
  let blocked = false;

  if (ctx.contractStatus !== 'ACTIVE') {
    flags.push('CONTRACT_INACTIVE');
    blocked = true;
  }
  if ((ctx.startDate && careDate < ctx.startDate) || (ctx.endDate && careDate > ctx.endDate)) {
    flags.push('OUT_OF_PERIOD');
    blocked = true;
  }
  if (ctx.startDate && ctx.waitingPeriodDays > 0) {
    const waitEnd = addDaysSafe(ctx.startDate, ctx.waitingPeriodDays);
    if (careDate < waitEnd) {
      flags.push(`WAITING_PERIOD:${fmt(waitEnd)}`);
      blocked = true;
    }
  }
  if (duplicateSuspect) flags.push('DUPLICATE_SUSPECT');

  const estimationItems: EstimationItem[] = items.map(item => {
    if (blocked) {
      return {
        ...item,
        amountEligible: 0,
        rateApplied: 0,
        deductibleApplied: 0,
        copayApplied: 0,
        amountApproved: 0,
        outOfPocket: item.amountRequested,
        reason: blockedReason(flags),
      };
    }
    if (ctx.excludedCategories.includes(item.categoryId)) {
      return {
        ...item,
        amountEligible: 0,
        rateApplied: 0,
        deductibleApplied: 0,
        copayApplied: 0,
        amountApproved: 0,
        outOfPocket: item.amountRequested,
        reason: 'EXCLUDED',
      };
    }
    const rule = ctx.rules.find(r => r.categoryId === item.categoryId);
    if (!rule) {
      return {
        ...item,
        amountEligible: 0,
        rateApplied: 0,
        deductibleApplied: 0,
        copayApplied: 0,
        amountApproved: 0,
        outOfPocket: item.amountRequested,
        reason: 'EXCLUDED',
      };
    }
    const used = ctx.usedPerCategory[item.categoryId] ?? 0;
    const remaining = rule.annualLimit == null ? Infinity : Math.max(0, rule.annualLimit - used);
    if (remaining <= 0) {
      return {
        ...item,
        amountEligible: 0,
        rateApplied: rule.rate,
        deductibleApplied: 0,
        copayApplied: 0,
        amountApproved: 0,
        outOfPocket: item.amountRequested,
        reason: 'CAP_REACHED',
      };
    }
    // Plafond agrégé annuel (stop-loss global)
    if (ctx.globalAnnualCap && ctx.globalAnnualCap > 0) {
      const usedGlobal = ctx.usedGlobal ?? 0;
      const globalRemaining = Math.max(0, ctx.globalAnnualCap - usedGlobal);
      if (globalRemaining <= 0) {
        return {
          ...item,
          amountEligible: 0,
          rateApplied: 0,
          deductibleApplied: 0,
          copayApplied: 0,
          amountApproved: 0,
          outOfPocket: item.amountRequested,
          reason: 'GLOBAL_CAP_REACHED',
        };
      }
    }

    // Contrôle barème médical : plafonner le montant à la valeur de référence
    let effectiveAmount = item.amountRequested;
    if (rule.maxUnitPrice != null && rule.maxUnitPrice > 0 && item.amountRequested > rule.maxUnitPrice) {
      effectiveAmount = rule.maxUnitPrice;
    }

    const eligible = Math.min(effectiveAmount, remaining);
    let deductible = 0;
    if (rule.deductibleType === 'FIXED') deductible = Math.min(rule.deductibleValue, eligible);
    else if (rule.deductibleType === 'PERCENT')
      deductible = Math.min(Math.round((eligible * rule.deductibleValue) / 100), eligible);

    // Calcul du taux de couverture
    const afterDeductible = Math.max(0, eligible - deductible);
    const coveredByRate = Math.max(0, Math.round((afterDeductible * rule.rate) / 100));

    // Co-paiement obligatoire : l'assuré paie un % du montant couvert
    let copay = 0;
    if (rule.copayRate && rule.copayRate > 0) {
      copay = Math.round((coveredByRate * rule.copayRate) / 100);
    }
    const approved = Math.max(0, coveredByRate - copay);

    // Plafond agrégé : limiter si on dépasse le global cap
    let finalApproved = approved;
    if (ctx.globalAnnualCap && ctx.globalAnnualCap > 0) {
      const usedGlobal = ctx.usedGlobal ?? 0;
      const globalRemaining = Math.max(0, ctx.globalAnnualCap - usedGlobal);
      finalApproved = Math.min(approved, globalRemaining);
    }

    const outOfPocket = item.amountRequested - finalApproved;
    return {
      ...item,
      amountEligible: eligible,
      rateApplied: rule.rate,
      deductibleApplied: deductible,
      copayApplied: copay,
      amountApproved: finalApproved,
      outOfPocket,
      ...(item.amountRequested > effectiveAmount && rule.maxUnitPrice ? { reason: 'FEE_SCHEDULE_EXCEEDED' as const } : {}),
    };
  });

  const requested = sum(estimationItems.map(i => i.amountRequested));
  const eligible = sum(estimationItems.map(i => i.amountEligible));
  const approved = sum(estimationItems.map(i => i.amountApproved));
  const totalOutOfPocket = sum(estimationItems.map(i => i.outOfPocket ?? (i.amountRequested - i.amountApproved)));

  return {
    ok: flags.length === 0,
    flags,
    items: estimationItems,
    totals: {
      requested,
      eligible,
      approved,
      outOfPocket: totalOutOfPocket,
    },
  };
}

function blockedReason(flags: string[]): EstimationItem['reason'] {
  if (flags.includes('CONTRACT_INACTIVE')) return 'CONTRACT_INACTIVE';
  if (flags.includes('OUT_OF_PERIOD')) return 'OUT_OF_PERIOD';
  if (flags.some(f => f.startsWith('WAITING_PERIOD'))) return 'WAITING_PERIOD';
  return undefined;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
