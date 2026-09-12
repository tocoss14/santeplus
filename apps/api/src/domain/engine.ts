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
  /** Garanties flexibles disponibles pour ce produit */
  guaranteeOptions?: GuaranteeOption[];
}

/** Définition d'une garantie flexible dans un produit */
export interface GuaranteeOption {
  categoryId: string;
  categoryName?: string;
  basePrice: number;
  minRate: number;
  maxRate: number;
  minLimit: number;
  maxLimit: number;
  limitStep: number;
  mandatory: boolean;
  customizable: boolean;
  rate?: number | null;
  annualLimit?: number | null;
  copayRate: number;
}

/** Choix de l'assuré pour une garantie */
export interface SelectedGuarantee {
  categoryId: string;
  rate: number;
  annualLimit: number;
}

/** Résultat du calcul de prime flexible */
export interface FlexibleQuoteResult {
  basePremium: number;
  beneficiaryCost: number;
  guaranteeCosts: { categoryId: string; label: string; cost: number; rate: number; limit: number }[];
  ageLoading: number;
  ageLoadingFactor: number;
  subtotal: number;
  frequency: Frequency;
  frequencyFactor: number;
  totalAnnual: number;
  lines: QuoteLine[];
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

/**
 * Calcul de prime FLEXIBLE : la prime est calculée en fonction des garanties
 * choisies par l'assuré (taux + plafond) au lieu d'être fixe par produit.
 *
 * Formule :
 *   prime = basePremium + Σ(garantie.basePrice × (taux/100) × (plafond/basePlafond))
 *   × facteurAge × facteurFréquence
 *
 * Si aucune garantie flexible n'est configurée, fallback sur le calcul classique.
 */
export function computeFlexibleQuote(
  pricing: ProductPricing,
  persons: QuotePerson[],
  frequency: Frequency,
  selectedGuarantees?: SelectedGuarantee[],
): { errors: string[]; quote?: QuoteResult; flexibleDetails?: FlexibleQuoteResult } {
  const errors: string[] = [];
  const now = new Date();

  // Validation âge (identique au calcul classique)
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
  if (errors.length) return { errors };

  // Compter adultes/enfants
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
  const basePremium = pricing.basePremiumAnnual;
  const beneficiaryCost = adultExtras * pricing.pricePerAdditionalAdultAnnual + children * pricing.pricePerChildAnnual;

  // Déterminer le facteur d'âge
  let ageLoadingFactor = 1;
  if (pricing.ageLoadings && pricing.ageLoadings.length > 0) {
    const loading = pricing.ageLoadings.find(l => maxAdultAge >= l.minAge && maxAdultAge <= l.maxAge);
    if (loading) ageLoadingFactor = loading.factor;
  }

  // Calcul des coûts de garanties flexibles
  const guaranteeCosts: FlexibleQuoteResult['guaranteeCosts'] = [];
  const lines: QuoteLine[] = [];

  if (pricing.guaranteeOptions && pricing.guaranteeOptions.length > 0 && selectedGuarantees && selectedGuarantees.length > 0) {
    // Mode FLEXIBLE : calculer le coût de chaque garantie choisie
    for (const selected of selectedGuarantees) {
      const option = pricing.guaranteeOptions.find(o => o.categoryId === selected.categoryId);
      if (!option) continue;

      // Valider les bornes
      const rate = Math.max(option.minRate, Math.min(option.maxRate, selected.rate));
      const limit = Math.max(option.minLimit, Math.min(option.maxLimit, selected.annualLimit));

      // Coût = basePrice × (taux/100) × (plafond/basePlafond)
      // Le basePlafond est la valeur de référence (minLimit ou un plafond de base)
      const baseLimit = option.minLimit || 100000;
      const guaranteeCost = Math.round(option.basePrice * (rate / 100) * (limit / baseLimit));

      guaranteeCosts.push({
        categoryId: selected.categoryId,
        label: option.categoryName ?? selected.categoryId,
        cost: guaranteeCost,
        rate,
        limit,
      });

      lines.push({
        label: `${option.categoryName ?? selected.categoryId} (${rate}% — ${round(limit).toLocaleString()} FCFA)`,
        amount: guaranteeCost,
      });
    }
  }

  const totalGuaranteeCost = guaranteeCosts.reduce((a, g) => a + g.cost, 0);
  let subtotal = basePremium + beneficiaryCost + totalGuaranteeCost;

  // Facteur âge
  let ageLoadingAmount = 0;
  if (ageLoadingFactor !== 1) {
    ageLoadingAmount = Math.round(subtotal * (ageLoadingFactor - 1));
    subtotal += ageLoadingAmount;
  }

  // Facteur fréquence
  const factor = pricing.frequencyFactors?.[frequency] ?? 1;
  const totalAnnual = round(subtotal * factor);
  const periods = PERIODS[frequency];
  const periodicAmount = splitEven(totalAnnual, periods)[0];

  // Lignes de devis
  if (lines.length) lines.unshift({ label: 'Cotisation de base', amount: basePremium });
  else lines.push({ label: 'Cotisation de base (assuré principal)', amount: basePremium });
  if (beneficiaryCost > 0) lines.push({ label: `Ayants droit (${adultExtras} adulte${adultExtras > 1 ? 's' : ''} + ${children} enfant${children > 1 ? 's' : ''})`, amount: beneficiaryCost });
  if (ageLoadingAmount > 0) lines.push({ label: `Surcharge âge (${maxAdultAge} ans, ×${ageLoadingFactor})`, amount: ageLoadingAmount });
  if (factor !== 1) lines.push({ label: `Fractionnement ${frequency.toLowerCase()} (×${factor})`, amount: totalAnnual - subtotal });

  const flexibleDetails: FlexibleQuoteResult = {
    basePremium,
    beneficiaryCost,
    guaranteeCosts,
    ageLoading: ageLoadingAmount,
    ageLoadingFactor,
    subtotal: subtotal,
    frequency,
    frequencyFactor: factor,
    totalAnnual,
    lines,
  };

  return {
    errors: [],
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
    flexibleDetails,
  };
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
  /** Plafond foyer cumulé sur le contrat, toutes personnes confondues (§23). null = pas de cumul foyer. */
  familyLimit?: number | null;
  rate: number;
  /** Co-paiement obligatoire (% que l'assuré paie de sa poche après application du taux) */
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
  /**
   * Cumul par personne (patient) et par catégorie. Fourni uniquement quand le
   * produit utilise familyLimit : annualLimit s'applique alors par personne
   * (au lieu des sommes contrat), familyLimit au foyer (sommes contrat de
   * usedPerCategory). Absent = comportement historique (annualLimit sur les
   * sommes contrat).
   */
  usedPersonPerCategory?: Record<string, number>;
  /** Plafond agrégé annuel sur toutes les catégories confondues (0 = pas de plafond) */
  globalAnnualCap?: number;
  /** Dépense totale déjà consommée sur l'année (toutes catégories) */
  usedGlobal?: number;
  /** Plafond annuel de reste à charge par contrat (null/0 = désactivé) */
  oopAnnualCap?: number | null;
  /** Reste à charge déjà supporté sur l'année pour des soins éligibles */
  usedOop?: number;
  /** Délais de carence spécifiques par catégorie (jours). Si défini, remplace waitingPeriodDays pour cette catégorie. Ex: { MATERNITY: 300 } = 10 mois pour maternité */
  categoryWaitingPeriods?: Record<string, number>;
  /** Nombre de consultations spécialiste déjà utilisées cette année */
  specialistConsultationsUsed?: number;
  /** Nombre maximum de consultations spécialiste par an (null = pas de limite) */
  specialistConsultationsPerYear?: number | null;
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
  /** Historique uniquement : toujours 0 depuis la suppression des franchises. */
  deductibleApplied: number;
  copayApplied: number;
  amountApproved: number;
  /** Part du reste à charge reprise par le plafond annuel de reste à charge. */
  oopCapApplied: number;
  /** Montant restant à la charge de l'assuré (copay + dépassement) */
  outOfPocket: number;
  reason?: 'EXCLUDED' | 'CAP_REACHED' | 'FAMILY_CAP_REACHED' | 'CONTRACT_INACTIVE' | 'OUT_OF_PERIOD' | 'WAITING_PERIOD' | 'GLOBAL_CAP_REACHED' | 'FEE_SCHEDULE_EXCEEDED';
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
  // Délai de carence global (par défaut)
  const defaultWaitEnd = ctx.startDate && ctx.waitingPeriodDays > 0
    ? addDaysSafe(ctx.startDate, ctx.waitingPeriodDays)
    : null;
  if (defaultWaitEnd && careDate < defaultWaitEnd) {
    flags.push(`WAITING_PERIOD:${fmt(defaultWaitEnd)}`);
    blocked = true;
  }
  if (duplicateSuspect) flags.push('DUPLICATE_SUSPECT');

  // Cumul du reste à charge supporté sur l'année pour des soins éligibles.
  // Le plafond annuel borne ce que le patient paie : au-delà, l'assureur
  // reprend la part de ticket modérateur restante (sans rouvrir les plafonds).
  let cumulativeOop = Math.max(0, ctx.usedOop ?? 0);

  const estimationItems: EstimationItem[] = items.map(item => {
    if (blocked) {
      return {
        ...item,
        amountEligible: 0,
        rateApplied: 0,
        deductibleApplied: 0,
        copayApplied: 0,
        amountApproved: 0,
        oopCapApplied: 0,
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
        oopCapApplied: 0,
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
        oopCapApplied: 0,
        outOfPocket: item.amountRequested,
        reason: 'EXCLUDED',
      };
    }
    // Vérifier le délai de carence spécifique à la catégorie (ex: maternité 10 mois)
    if (ctx.categoryWaitingPeriods && ctx.startDate) {
      const catWaitDays = ctx.categoryWaitingPeriods[item.categoryId];
      if (catWaitDays && catWaitDays > 0) {
        const catWaitEnd = addDaysSafe(ctx.startDate, catWaitDays);
        if (careDate < catWaitEnd) {
          return {
            ...item,
            amountEligible: 0,
            rateApplied: 0,
            deductibleApplied: 0,
            copayApplied: 0,
            amountApproved: 0,
            oopCapApplied: 0,
            outOfPocket: item.amountRequested,
            reason: 'WAITING_PERIOD' as const,
          };
        }
      }
    }
    // Vérifier la limite de consultations spécialiste par an
    if (ctx.specialistConsultationsPerYear != null && item.categoryId === 'SPECIALIZED') {
      const used = ctx.specialistConsultationsUsed ?? 0;
      if (used >= ctx.specialistConsultationsPerYear) {
        return {
          ...item,
          amountEligible: 0,
            rateApplied: rule.rate,
            deductibleApplied: 0,
            copayApplied: 0,
            amountApproved: 0,
            oopCapApplied: 0,
            outOfPocket: item.amountRequested,
            reason: 'CAP_REACHED' as const,
        };
      }
    }
    const used = ctx.usedPerCategory[item.categoryId] ?? 0;
    // Assiette du plafond annuel : sommes personne si le contexte personne est
    // fourni (nouveau modèle foyer), sinon sommes contrat (historique).
    const personUsed = ctx.usedPersonPerCategory?.[item.categoryId];
    const capBase = personUsed ?? used;
    const remaining = rule.annualLimit == null ? Infinity : Math.max(0, rule.annualLimit - capBase);
    if (remaining <= 0) {
      return {
        ...item,
        amountEligible: 0,
        rateApplied: rule.rate,
        deductibleApplied: 0,
        copayApplied: 0,
        amountApproved: 0,
        oopCapApplied: 0,
        outOfPocket: item.amountRequested,
        reason: 'CAP_REACHED',
      };
    }
    // Plafond foyer (§23) : cumul contrat toutes personnes confondues.
    const familyRemaining = rule.familyLimit == null ? Infinity : Math.max(0, rule.familyLimit - used);
    if (familyRemaining <= 0) {
      return {
        ...item,
        amountEligible: 0,
        rateApplied: rule.rate,
        deductibleApplied: 0,
        copayApplied: 0,
        amountApproved: 0,
        oopCapApplied: 0,
        outOfPocket: item.amountRequested,
        reason: 'FAMILY_CAP_REACHED',
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
          oopCapApplied: 0,
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

    const eligible = Math.min(effectiveAmount, remaining, familyRemaining);
    // Franchises supprimées : le taux de couverture s'applique sur la totalité éligible.
    const coveredByRate = Math.max(0, Math.round((eligible * rule.rate) / 100));

    // Co-paiement obligatoire : l'assuré paie un % du montant couvert
    let copay = 0;
    if (rule.copayRate && rule.copayRate > 0) {
      copay = Math.round((coveredByRate * rule.copayRate) / 100);
    }
    const approved = Math.max(0, coveredByRate - copay);

    // Plafond agrégé : limiter si on dépasse le global cap
    let cappedApproved = approved;
    let globalRemaining = Infinity;
    if (ctx.globalAnnualCap && ctx.globalAnnualCap > 0) {
      const usedGlobal = ctx.usedGlobal ?? 0;
      globalRemaining = Math.max(0, ctx.globalAnnualCap - usedGlobal);
      cappedApproved = Math.min(approved, globalRemaining);
    }

    // Plafond annuel de reste à charge : le patient paie au maximum
    // (plafond − déjà supporté) sur des soins éligibles ; l'assureur reprend
    // le surplus, sans rouvrir les plafonds déjà atteints.
    const costShareOop = Math.max(0, eligible - approved);
    let oopCapApplied = 0;
    if (ctx.oopAnnualCap != null && ctx.oopAnnualCap > 0 && costShareOop > 0) {
      const affordableRemaining = Math.max(0, ctx.oopAnnualCap - cumulativeOop);
      oopCapApplied = Math.max(0, costShareOop - affordableRemaining);
      cumulativeOop += costShareOop - oopCapApplied;
    }
    const finalApproved = Math.min(cappedApproved + oopCapApplied, globalRemaining, eligible);

    const outOfPocket = item.amountRequested - finalApproved;
    return {
      ...item,
      amountEligible: eligible,
      rateApplied: rule.rate,
      deductibleApplied: 0,
      copayApplied: copay,
      amountApproved: finalApproved,
      oopCapApplied,
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
