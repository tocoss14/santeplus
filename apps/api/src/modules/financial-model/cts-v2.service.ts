import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import {
  DEFAULT_RESERVE_POLICY,
  DEFAULT_V2_PRICING,
  computeReserveAllocation,
  computeSolvencyIndicators,
  computeTechnicalPosition,
  computeTechnicalResult,
} from '../../domain/financial-model-v2';

/**
 * Moteur financier V2_MUTUAL — agrégation, position technique, provisions,
 * réserves, résultat et indicateurs prudentiels.
 *
 * Contrat de coexistence : ce service N'ÉCRIT JAMAIS dans les tables V1
 * (ctsJournal, fundCall, solidarité) et ne réétiquette jamais une écriture
 * historique V1. Il lit les données brutes (contributions, sinistres, charges)
 * et consomme le domaine pur de `domain/financial-model-v2.ts`. Le moteur V1
 * (CtsService) reste strictement inchangé et sert les contrats V1_LEGACY.
 */

/** Sinistres comptabilisés en charges techniques V2. */
const CLAIM_TECHNICAL_STATUSES = ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'];

export interface V2Aggregates {
  contributions: number;
  engagedClaims: number;
  paidClaims: number;
  expenses: number;
  recoveries: number;
  reserveAllocations: number;
  rbns: number;
  ibnr: number;
}

@Injectable()
export class CtsV2Service {
  constructor(private prisma: PrismaService) {}

  // ── Agrégations brutes ──────────────────────────────────────────────────

  /** Cotisations : payées (ressource) et restant dû (informatif). */
  async collectContributions(contractIds: string[], from?: Date, to?: Date) {
    if (!contractIds.length) return { paid: 0, pending: 0 };
    const where: any = { contractId: { in: contractIds } };
    if (from || to) {
      where.paidAt = {};
      if (from) where.paidAt.gte = from;
      if (to) where.paidAt.lte = to;
    }
    const rows = await this.prisma.contribution.findMany({ where, select: { status: true, amount: true } });
    let paid = 0;
    let pending = 0;
    for (const c of rows) {
      if (c.status === 'PAID') paid += c.amount;
      else pending += c.amount;
    }
    return { paid, pending };
  }

  /** Sinistres : engagé (décidé, non réglé) et payé (réglé). */
  async collectClaims(contractIds: string[], from?: Date, to?: Date) {
    if (!contractIds.length) return { engaged: 0, paid: 0, count: 0 };
    const where: any = { contractId: { in: contractIds }, status: { in: CLAIM_TECHNICAL_STATUSES } };
    if (from || to) {
      where.submittedAt = {};
      if (from) where.submittedAt.gte = from;
      if (to) where.submittedAt.lte = to;
    }
    const rows = await this.prisma.claim.findMany({
      where,
      select: { status: true, totalRequested: true, totalApproved: true },
    });
    let engaged = 0;
    let paid = 0;
    for (const c of rows) {
      const amount = c.totalApproved ?? c.totalRequested ?? 0;
      if (c.status === 'PAID') paid += amount;
      else engaged += amount;
    }
    return { engaged, paid, count: rows.length };
  }

  /** Agrégats complets d'une période pour un périmètre de contrats V2. */
  async collectAggregates(contractIds: string[], opts: { rbns?: number; ibnr?: number; from?: Date; to?: Date } = {}): Promise<V2Aggregates> {
    const [contributions, claims] = await Promise.all([
      this.collectContributions(contractIds, opts.from, opts.to),
      this.collectClaims(contractIds, opts.from, opts.to),
    ]);
    return {
      contributions: contributions.paid,
      engagedClaims: claims.engaged,
      paidClaims: claims.paid,
      // Les charges de gestion et recouvrements sont alimentés par appel
      // métier (comptabilité) ; à défaut de saisie, ils restent à zéro —
      // la position V2 ne devine jamais un montant.
      expenses: 0,
      recoveries: 0,
      reserveAllocations: 0,
      rbns: opts.rbns ?? 0,
      ibnr: opts.ibnr ?? 0,
    };
  }

  // ── Position technique ──────────────────────────────────────────────────

  /** Position technique V2 d'un contrat ou d'un portefeuille. */
  async technicalPosition(input: V2Aggregates & { solidarityFund?: number; reinsuranceCessionRate?: number }) {
    return computeTechnicalPosition(
      {
        contributions: input.contributions,
        engagedClaims: input.engagedClaims,
        paidClaims: input.paidClaims,
        expenses: input.expenses,
        recoveries: input.recoveries,
        reserveAllocations: input.reserveAllocations,
        rbns: input.rbns,
        ibnr: input.ibnr,
        reinsuranceCessionRate: input.reinsuranceCessionRate ?? DEFAULT_V2_PRICING.reinsuranceCessionRate,
      },
      input.solidarityFund ?? 0,
    );
  }

  /** Position technique pour un contrat précis (vérifie le modèle V2). */
  async contractPosition(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, number: true, financialModelVersion: { select: { code: true, engineVersion: true } } },
    });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    if (contract.financialModelVersion?.code !== 'V2_MUTUAL') {
      throw new NotFoundException('Ce contrat ne relève pas du modèle V2_MUTUAL (moteur V1 appliqué)');
    }
    const agg = await this.collectAggregates([contractId]);
    const position = await this.technicalPosition(agg);
    const result = computeTechnicalResult({
      contributions: agg.contributions,
      engagedClaims: agg.engagedClaims,
      paidClaims: agg.paidClaims,
      expenses: agg.expenses,
      reinsuranceCessionRate: DEFAULT_V2_PRICING.reinsuranceCessionRate,
      solidarityFund: position.solidarityFund,
      solidarityShareOfSurplus: DEFAULT_V2_PRICING.solidarityShareOfSurplus,
    });
    const reserveAllocation = computeReserveAllocation(agg.contributions, position.position);
    const expectedMonthlyCost = DEFAULT_V2_PRICING.expectedAnnualCostPerPerson / 12;
    const solvency = computeSolvencyIndicators(position, expectedMonthlyCost);
    return {
      contractId,
      contractNumber: contract.number,
      aggregates: agg,
      position,
      result,
      reserveAllocation,
      solvency,
      stampedModel: 'V2_MUTUAL',
    };
  }

  /** Dotation de réserve recommandée (politique par défaut, surchargeable). */
  async recommendedReserve(contributions: number, position: number) {
    return computeReserveAllocation(contributions, position, DEFAULT_RESERVE_POLICY);
  }

  /**
   * Vue consolidée du portefeuille V2 — et uniquement V2 : la consolidation
   * inter-modèle (V1+V2) est interdite sans règles explicites, les deux
   * modèles ne mesurant pas les mêmes économies. Retourne les agrégats, la
   * position technique, le résultat, la dotation de réserve recommandée, les
   * indicateurs prudentiels et le détail par contrat.
   */
  async portfolioPosition(period: { from?: Date; to?: Date } = {}) {
    const contractWhere: any = { financialModelVersion: { code: 'V2_MUTUAL' } };
    if (period.from || period.to) {
      contractWhere.createdAt = {};
      if (period.from) contractWhere.createdAt.gte = period.from;
      if (period.to) contractWhere.createdAt.lte = period.to;
    }
    const contracts = await this.prisma.contract.findMany({
      where: contractWhere,
      select: { id: true, number: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const ids = contracts.map(c => c.id);

    const aggregates = await this.collectAggregates(ids, { from: period.from, to: period.to });
    const position = await this.technicalPosition(aggregates);
    const result = computeTechnicalResult({
      contributions: aggregates.contributions,
      engagedClaims: aggregates.engagedClaims,
      paidClaims: aggregates.paidClaims,
      expenses: aggregates.expenses,
      reinsuranceCessionRate: DEFAULT_V2_PRICING.reinsuranceCessionRate,
      solidarityFund: position.solidarityFund,
      solidarityShareOfSurplus: DEFAULT_V2_PRICING.solidarityShareOfSurplus,
    });
    const reserveAllocation = computeReserveAllocation(aggregates.contributions, position.position);
    const expectedMonthlyCost = DEFAULT_V2_PRICING.expectedAnnualCostPerPerson / 12;
    const solvency = computeSolvencyIndicators(position, expectedMonthlyCost);

    // Détail par contrat : chaque ligne reste rattachable à son contrat —
    // jamais de chiffre fondu sans traçabilité.
    const contractRows = await Promise.all(
      contracts.map(async c => {
        const a = await this.collectAggregates([c.id], { from: period.from, to: period.to });
        const p = await this.technicalPosition(a);
        return {
          contractId: c.id,
          number: c.number,
          status: c.status,
          createdAt: c.createdAt,
          contributions: a.contributions,
          engagedClaims: a.engagedClaims,
          paidClaims: a.paidClaims,
          position: p.position,
        };
      }),
    );

    return {
      model: 'V2_MUTUAL' as const,
      contractsCount: ids.length,
      period: {
        from: period.from?.toISOString() ?? null,
        to: period.to?.toISOString() ?? null,
      },
      aggregates,
      position,
      result,
      reserveAllocation,
      solvency,
      solvencySeries: await this.portfolioSolvencySeries(),
      contracts: contractRows,
    };
  }

  /**
   * Série mensuelle de la marge de solvabilité V2 (12 derniers mois) pour le
   * graphique admin. Approche par flux cumulés en fin de mois : cotisations
   * encaissées et prestations (engagées + payées) s'additionnent mois par
   * mois, la marge est recalculée à chaque fin de mois. Les provisions,
   * charges et recouvrements étant alimentés par saisie métier (0 par défaut),
   * le dernier point de la série est cohérent avec la marge globale de la
   * vue. Convention du domaine : marge = 1 quand il n'y a encore aucun
   * engagement (trivialement solvable).
   */
  async portfolioSolvencySeries(monthsBack = 12, now = new Date()) {
    const contracts = await this.prisma.contract.findMany({
      where: { financialModelVersion: { code: 'V2_MUTUAL' } },
      select: { id: true },
    });
    const ids = contracts.map(c => c.id);

    // Seuil d'alerte configuré (même clé que le job hebdomadaire) pour la
    // ligne de référence du graphique.
    const cfg = await this.prisma.systemConfig.findMany({
      where: { key: { in: ['v2SolvencyAlert.threshold'] } },
    });
    let threshold = 1;
    for (const row of cfg) {
      try {
        const n = Number(JSON.parse(row.value));
        if (Number.isFinite(n) && n > 0) threshold = n;
      } catch {
        // valeur corrompue : défaut 1
      }
    }

    let cumContributions = 0;
    let cumEngaged = 0;
    let cumPaid = 0;
    const series: Array<{
      month: string;
      label: string;
      contributions: number;
      claims: number;
      position: number;
      solvencyRatio: number;
    }> = [];

    for (let k = monthsBack - 1; k >= 0; k--) {
      // Fin du mois (k mois en arrière), bornes calendaires UTC.
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k + 1, 0, 23, 59, 59, 999));
      const monthStart = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth(), 1, 0, 0, 0, 0));
      const [contrib, claims] = await Promise.all([
        this.collectContributions(ids, monthStart, monthEnd),
        this.collectClaims(ids, monthStart, monthEnd),
      ]);
      cumContributions += contrib.paid;
      cumEngaged += claims.engaged;
      cumPaid += claims.paid;

      const engagements = cumEngaged + cumPaid;
      const position = cumContributions - engagements;
      const solvencyRatio = engagements > 0 ? position / engagements : 1;

      series.push({
        month: `${monthEnd.getUTCFullYear()}-${String(monthEnd.getUTCMonth() + 1).padStart(2, '0')}`,
        label: monthEnd.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        contributions: cumContributions,
        claims: engagements,
        position,
        solvencyRatio,
      });
    }
    return { threshold, months: await this.mergePersistedHistory(series) };
  }

  /**
   * Préfixe la série vivante avec l'historique hebdomadaire persisté (table
   * V2SolvencySnapshot, écrite par le job chaque semaine) : le graphique
   * survit aux reconstructions de données et remonte sur plusieurs années
   * (plafond 60 mois). Les points persistés dont la semaine tombe dans la
   * fenêtre vivante sont écartés — le recalcul à la flux, plus riche, fait
   * foi. Ordre chronologique ascendant garanti.
   */
  private async mergePersistedHistory(
    liveSeries: Array<{ month: string; label: string; contributions: number; claims: number; position: number; solvencyRatio: number }>,
  ) {
    let persisted: Array<{ weekKey: string; weekStart: Date; solvencyRatio: number; threshold: number; breach: boolean; contributions: number; engagedClaims: number; paidClaims: number; position: number }> = [];
    try {
      persisted = await this.prisma.v2SolvencySnapshot.findMany({
        orderBy: { weekStart: 'asc' },
        take: 300,
      });
    } catch {
      return liveSeries; // table absente (vieille base) : la série vivante suffit
    }
    if (!persisted.length) return liveSeries;

    const windowStart = new Date();
    windowStart.setUTCMonth(windowStart.getUTCMonth() - 12);
    windowStart.setUTCDate(1);
    windowStart.setUTCHours(0, 0, 0, 0);

    // Un point persisté par mois calendaire (le dernier de son mois), hors
    // fenêtre vivante, plafonné à 48 points antérieurs (60 mois au total).
    const byMonth = new Map<string, (typeof persisted)[number]>();
    for (const row of persisted) {
      const start = new Date(row.weekStart);
      if (start >= windowStart) continue; // fenêtre vivante : recalcul fait foi
      byMonth.set(`${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`, row);
    }
    const prefix = [...byMonth.values()]
      .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime())
      .slice(-48)
      .map(row => ({
        month: row.weekKey, // clé hebdo unique, horodatée par la semaine ISO
        label: new Date(row.weekStart).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        contributions: row.contributions,
        claims: row.engagedClaims + row.paidClaims,
        position: row.position,
        solvencyRatio: row.solvencyRatio,
      }));
    return [...prefix, ...liveSeries];
  }

  /**
   * Tampon de version pour les écritures comptables nouvelles produites sous
   * V2. Les écritures V1 existantes ne sont JAMAIS réétiquetées.
   */
  stamp() {
    return 'V2_MUTUAL' as const;
  }
}
