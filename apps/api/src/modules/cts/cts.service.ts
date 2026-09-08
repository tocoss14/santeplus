import { Injectable, Module, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import {
  available,
  band,
  benefitBudget,
  consumptionRatio,
  deficit,
  managementFees,
  parseCtsConfig,
  provisionalResult,
  type CtsBand,
  type CtsConfig,
} from '../../domain/cts-engine';

// Statuts qui portent un engagement CTS (miroir des statuts consommant les
// plafonds, hors PAID qui est la consommation finale).
export const CTS_COMMITTED_STATUSES = ['APPROVED', 'PARTIALLY_APPROVED', 'CONFIRMED', 'AUTHORIZED'];

const claimRef = (claimId: string) => `Claim:${claimId}`;

// Bande -> alerte (mécanique du recalcul ; le tuning reste phase 12).
const BAND_ALERTS: Record<Exclude<CtsBand, 'NORMAL'>, { type: string; severity: string }> = {
  SURVEILLANCE: { type: 'SEUIL', severity: 'INFO' },
  ALERTE: { type: 'SEUIL', severity: 'WARNING' },
  CRITIQUE: { type: 'CRITIQUE', severity: 'CRITICAL' },
  EPUISE: { type: 'EPUISEMENT', severity: 'CRITICAL' },
};

export interface CtsMutationOpts {
  reference?: string;
  beneficiaryId?: string | null;
  providerId?: string | null;
  actorUserId?: string;
  meta?: Record<string, unknown>;
}

export interface CtsEntryInput {
  contractId: string;
  type: string;
  amount: number;
  reference?: string;
  beneficiaryId?: string | null;
  providerId?: string | null;
  actorUserId?: string;
  meta?: Record<string, unknown>;
  oldBalance: number;
  newBalance: number;
}

@Injectable()
export class CtsService {
  constructor(private prisma: PrismaService) {}

  private async loadConfig(contractId: string): Promise<CtsConfig> {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { ctsOverride: true, product: { select: { ctsConfig: true } } },
    });
    if (!c) throw new NotFoundException('Contrat introuvable');
    return parseCtsConfig((c.product as any)?.ctsConfig, c.ctsOverride);
  }

  private derived(acc: { primeCollected: number; consumed: number; committed: number; primeBilled: number }, cfg: CtsConfig) {
    const fees = managementFees(acc.primeCollected, cfg.managementRate);
    const budget = benefitBudget(acc.primeCollected, fees);
    const avail = available(budget, acc.consumed, acc.committed);
    return {
      managementFees: fees,
      benefitBudget: budget,
      available: avail,
      consumptionRatio: consumptionRatio(acc.consumed, acc.committed, budget),
      provisionalResult: provisionalResult(acc.primeCollected, fees, acc.consumed, acc.committed),
      primeUnpaid: Math.max(0, acc.primeBilled - acc.primeCollected),
      deficit: deficit(acc.consumed, acc.committed, budget),
    };
  }

  private entry(input: CtsEntryInput) {
    return this.prisma.ctsJournal.create({
      data: {
        contractId: input.contractId,
        type: input.type,
        amount: input.amount,
        reference: input.reference,
        beneficiaryId: input.beneficiaryId ?? null,
        providerId: input.providerId ?? null,
        actorUserId: input.actorUserId,
        meta: JSON.stringify(input.meta ?? {}),
        oldBalance: input.oldBalance,
        newBalance: input.newBalance,
      },
    });
  }

  async getAccount(contractId: string) {
    return this.prisma.technicalAccount.findUnique({ where: { contractId } });
  }

  /**
   * Compte existant ou backfill depuis les données (contrat, échéancier,
   * sinistres). Idempotent : ne crée que si absent.
   */
  async ensureAccount(contractId: string) {
    const existing = await this.getAccount(contractId);
    if (existing) return existing;
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { premiumAnnual: true, product: { select: { ctsConfig: true } }, ctsOverride: true },
    });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    const cfg = parseCtsConfig((contract.product as any)?.ctsConfig, (contract as any).ctsOverride);
    const contributions = await this.prisma.contribution.findMany({
      where: { contractId },
      select: { amount: true, status: true },
    });
    const billed = contributions.reduce((a, c) => a + c.amount, 0);
    const collected = contributions.filter(c => c.status === 'PAID').reduce((a, c) => a + c.amount, 0);
    const claims = await this.prisma.claim.findMany({
      where: { contractId },
      select: { status: true, totalApproved: true },
    });
    const consumed = claims.filter(c => c.status === 'PAID').reduce((a, c) => a + (c.totalApproved ?? 0), 0);
    const committed = claims
      .filter(c => CTS_COMMITTED_STATUSES.includes(c.status))
      .reduce((a, c) => a + (c.totalApproved ?? 0), 0);
    const base = {
      primeSubscribed: contract.premiumAnnual,
      primeBilled: billed,
      primeCollected: collected,
      consumed,
      committed,
    };
    const d = this.derived({ ...base, primeBilled: billed }, cfg);
    const created = await this.prisma.technicalAccount.create({
      data: { contractId, ...base, ...d, fundCallsTotal: 0, renewalCredit: 0 },
    });
    const emit = (e: CtsEntryInput) => this.entry(e);
    await emit({
      contractId,
      type: 'AJUSTEMENT',
      amount: 0,
      meta: { backfill: true, ...base },
      oldBalance: 0,
      newBalance: d.available,
    });
    // Points d'ancrage d'idempotence : ce que le backfill a reconstitué ne
    // doit jamais être réenregistré par les hooks (anti double-compte).
    if (base.primeSubscribed > 0) {
      await emit({
        contractId,
        type: 'PRIME',
        amount: base.primeSubscribed,
        reference: `Contract:${contractId}:subscribed`,
        meta: { kind: 'subscribed', backfill: true },
        oldBalance: 0,
        newBalance: d.available,
      });
    }
    if (billed > 0) {
      await emit({
        contractId,
        type: 'PRIME',
        amount: billed,
        meta: { kind: 'billed', backfill: true },
        oldBalance: 0,
        newBalance: d.available,
      });
    }
    if (collected > 0) {
      const fees = managementFees(collected, cfg.managementRate);
      const budget = benefitBudget(collected, fees);
      await emit({
        contractId, type: 'PRIME', amount: collected,
        meta: { kind: 'collected', backfill: true }, oldBalance: 0, newBalance: d.available,
      });
      if (fees > 0) {
        await emit({
          contractId, type: 'FRAIS', amount: fees,
          meta: { rate: cfg.managementRate, backfill: true }, oldBalance: d.available, newBalance: d.available,
        });
      }
      if (budget !== 0) {
        await emit({
          contractId, type: 'BUDGET', amount: budget,
          meta: { backfill: true }, oldBalance: d.available, newBalance: d.available,
        });
      }
    }
    await this.evaluateBands(contractId);
    return created;
  }

  /**
   * Souscription : une fois par contrat (référence dédiée). Le backfill ayant
   * déjà ancré la prime souscrite, tout rappel est ignoré (anti double-compte).
   */
  async recordPrimeSubscribed(contractId: string, amount: number, opts: CtsMutationOpts = {}) {
    const acc = await this.ensureAccount(contractId);
    const bandNow = await this.evaluateBands(contractId);
    const ref = `Contract:${contractId}:subscribed`;
    const existing = await this.prisma.ctsJournal.findFirst({ where: { contractId, type: 'PRIME', reference: ref } });
    if (existing) return { account: acc, band: bandNow, deduped: true as const };
    const updated = await this.prisma.technicalAccount.update({
      where: { id: acc.id },
      data: { primeSubscribed: acc.primeSubscribed + Math.max(0, amount) },
    });
    await this.entry({
      contractId, type: 'PRIME', amount: Math.max(0, amount), reference: ref,
      beneficiaryId: opts.beneficiaryId, providerId: opts.providerId,
      actorUserId: opts.actorUserId, meta: { kind: 'subscribed', ...(opts.meta ?? {}) },
      oldBalance: acc.available, newBalance: updated.available,
    });
    return { account: updated, band: await this.evaluateBands(contractId), deduped: false as const };
  }

  /**
   * Facturé : recalculé depuis l'échéancier (source de vérité), donc
   * idempotent par construction — aucun risque de double-compte.
   */
  async recordPrimeBilled(contractId: string, opts: CtsMutationOpts = {}) {
    const acc = await this.ensureAccount(contractId);
    const contributions = await this.prisma.contribution.findMany({ where: { contractId }, select: { amount: true } });
    const billed = contributions.reduce((a, c) => a + c.amount, 0);
    if (billed === acc.primeBilled) {
      return { account: acc, band: await this.evaluateBands(contractId), changed: false as const };
    }
    const updated = await this.prisma.technicalAccount.update({
      where: { id: acc.id },
      data: { primeBilled: billed, primeUnpaid: Math.max(0, billed - acc.primeCollected) },
    });
    await this.entry({
      contractId, type: 'PRIME', amount: billed,
      reference: opts.reference, beneficiaryId: opts.beneficiaryId, providerId: opts.providerId,
      actorUserId: opts.actorUserId, meta: { kind: 'billed', recomputed: true, ...(opts.meta ?? {}) },
      oldBalance: acc.available, newBalance: updated.available,
    });
    return { account: updated, band: await this.evaluateBands(contractId), changed: true as const };
  }

  /**
   * Encaissé : recalculé depuis les paiements SUCCEEDED liés à une cotisation
   * (part prime hors adhésion), donc idempotent par construction.
   */
  async recordPrimeCollected(contractId: string, opts: CtsMutationOpts = {}) {
    const acc = await this.ensureAccount(contractId);
    const payments = await this.prisma.payment.findMany({
      where: { contractId, status: 'SUCCEEDED' },
      select: { amount: true, meta: true },
    });
    let collected = 0;
    for (const p of payments) {
      let adhesion = 0;
      try { adhesion = Number(JSON.parse((p as any).meta || '{}').adhesionFee ?? 0) || 0; } catch { adhesion = 0; }
      collected += Math.max(0, p.amount - adhesion);
    }
    if (collected === acc.primeCollected) {
      return { account: acc, band: await this.evaluateBands(contractId), changed: false as const };
    }
    const cfg = await this.loadConfig(contractId);
    const oldAvail = acc.available;
    const newFees = managementFees(collected, cfg.managementRate);
    const newBudget = benefitBudget(collected, newFees);
    const feesDelta = newFees - acc.managementFees;
    const budgetDelta = newBudget - acc.benefitBudget;
    const d = this.derived({ primeCollected: collected, primeBilled: acc.primeBilled, consumed: acc.consumed, committed: acc.committed }, cfg);
    const updated = await this.prisma.technicalAccount.update({
      where: { id: acc.id },
      data: { primeCollected: collected, ...d },
    });
    await this.entry({
      contractId, type: 'PRIME', amount: collected - acc.primeCollected,
      reference: opts.reference, beneficiaryId: opts.beneficiaryId, providerId: opts.providerId,
      actorUserId: opts.actorUserId, meta: { kind: 'collected', recomputed: true, ...(opts.meta ?? {}) },
      oldBalance: oldAvail, newBalance: updated.available,
    });
    if (feesDelta > 0) {
      await this.entry({
        contractId, type: 'FRAIS', amount: feesDelta,
        reference: opts.reference, actorUserId: opts.actorUserId,
        meta: { rate: cfg.managementRate }, oldBalance: updated.available, newBalance: updated.available,
      });
    }
    if (budgetDelta !== 0) {
      await this.entry({
        contractId, type: 'BUDGET', amount: budgetDelta,
        reference: opts.reference, actorUserId: opts.actorUserId,
        meta: {}, oldBalance: updated.available, newBalance: updated.available,
      });
    }
    return { account: updated, band: await this.evaluateBands(contractId), changed: true as const };
  }

  /** Engagement idempotent par sinistre (référence Claim:<id>). */
  async recordEngagement(contractId: string, claimId: string, amount: number, opts: CtsMutationOpts = {}) {
    const safe = Math.max(0, amount);
    const acc = await this.ensureAccount(contractId);
    const bandNow = await this.evaluateBands(contractId);
    if (safe <= 0) return { account: acc, band: bandNow, deduped: false as const };
    const ref = claimRef(claimId);
    const existing = await this.prisma.ctsJournal.findFirst({ where: { contractId, type: 'ENGAGEMENT', reference: ref } });
    if (existing) return { account: acc, band: bandNow, deduped: true as const };
    const cfg = await this.loadConfig(contractId);
    const oldAvail = acc.available;
    const committed = acc.committed + safe;
    const d = this.derived({ primeCollected: acc.primeCollected, primeBilled: acc.primeBilled, consumed: acc.consumed, committed }, cfg);
    const updated = await this.prisma.technicalAccount.update({ where: { id: acc.id }, data: { committed, ...d } });
    await this.entry({
      contractId, type: 'ENGAGEMENT', amount: safe, reference: ref,
      beneficiaryId: opts.beneficiaryId, providerId: opts.providerId,
      actorUserId: opts.actorUserId, meta: opts.meta ?? {},
      oldBalance: oldAvail, newBalance: updated.available,
    });
    return { account: updated, band: await this.evaluateBands(contractId), deduped: false as const };
  }

  /** Consommation : augmente le consommé, libère l'engagement (borné à 0). */
  async recordConsumption(contractId: string, claimId: string, amount: number, opts: CtsMutationOpts = {}) {
    const safe = Math.max(0, amount);
    const acc = await this.ensureAccount(contractId);
    const bandNow = await this.evaluateBands(contractId);
    if (safe <= 0) return { account: acc, band: bandNow, deduped: false as const };
    const ref = claimRef(claimId);
    const existing = await this.prisma.ctsJournal.findFirst({ where: { contractId, type: 'CONSOMMATION', reference: ref } });
    if (existing) return { account: acc, band: bandNow, deduped: true as const };
    const cfg = await this.loadConfig(contractId);
    const oldAvail = acc.available;
    const released = Math.min(acc.committed, safe);
    const consumed = acc.consumed + safe;
    const committed = acc.committed - released;
    const d = this.derived({ primeCollected: acc.primeCollected, primeBilled: acc.primeBilled, consumed, committed }, cfg);
    const updated = await this.prisma.technicalAccount.update({ where: { id: acc.id }, data: { consumed, committed, ...d } });
    await this.entry({
      contractId, type: 'CONSOMMATION', amount: safe, reference: ref,
      beneficiaryId: opts.beneficiaryId, providerId: opts.providerId,
      actorUserId: opts.actorUserId, meta: { released, ...(opts.meta ?? {}) },
      oldBalance: oldAvail, newBalance: updated.available,
    });
    return { account: updated, band: await this.evaluateBands(contractId), deduped: false as const };
  }

  /**
   * Contre-écriture (§40.4) : annule l'engagement restant d'un sinistre
   * (engagé − consommé − déjà annulé), sans jamais toucher au consommé.
   */
  async recordReversal(contractId: string, claimId: string, reason: string, opts: CtsMutationOpts = {}) {
    const acc = await this.ensureAccount(contractId);
    const bandNow = await this.evaluateBands(contractId);
    const ref = claimRef(claimId);
    const entries = await this.prisma.ctsJournal.findMany({
      where: { contractId, reference: ref, type: { in: ['ENGAGEMENT', 'CONSOMMATION', 'ANNULATION'] } },
      select: { type: true, amount: true },
    });
    const outstanding = Math.max(
      0,
      entries.filter(e => e.type === 'ENGAGEMENT').reduce((a, e) => a + e.amount, 0) -
        entries.filter(e => e.type === 'CONSOMMATION').reduce((a, e) => a + e.amount, 0) -
        entries.filter(e => e.type === 'ANNULATION').reduce((a, e) => a + e.amount, 0),
    );
    if (outstanding <= 0) return { account: acc, band: bandNow, reversed: 0 };
    const cfg = await this.loadConfig(contractId);
    const oldAvail = acc.available;
    const committed = Math.max(0, acc.committed - outstanding);
    const d = this.derived({ primeCollected: acc.primeCollected, primeBilled: acc.primeBilled, consumed: acc.consumed, committed }, cfg);
    const updated = await this.prisma.technicalAccount.update({ where: { id: acc.id }, data: { committed, ...d } });
    await this.entry({
      contractId, type: 'ANNULATION', amount: outstanding, reference: ref,
      beneficiaryId: opts.beneficiaryId, providerId: opts.providerId,
      actorUserId: opts.actorUserId, meta: { reason, ...(opts.meta ?? {}) },
      oldBalance: oldAvail, newBalance: updated.available,
    });
    return { account: updated, band: await this.evaluateBands(contractId), reversed: outstanding };
  }

  /** Bandes + alertes : crée sur dégradation (dédupliquée), résout au retour NORMAL. */
  async evaluateBands(contractId: string) {
    const acc = await this.ensureAccount(contractId);
    const cfg = await this.loadConfig(contractId);
    // Compte vide (aucun budget constitué, aucune exposition) : NORMAL silencieux,
    // pas d'alerte EPUISEMENT sur les contrats en attente de paiement.
    if (acc.benefitBudget <= 0 && acc.consumed <= 0 && acc.committed <= 0) return 'NORMAL' as const;
    const current = band(acc.available, acc.benefitBudget, cfg);
    const mapping: Record<Exclude<CtsBand, 'NORMAL'>, { type: string; severity: string }> = {
      SURVEILLANCE: { type: 'SEUIL', severity: 'INFO' },
      ALERTE: { type: 'SEUIL', severity: 'WARNING' },
      CRITIQUE: { type: 'CRITIQUE', severity: 'CRITICAL' },
      EPUISE: { type: 'EPUISEMENT', severity: 'CRITICAL' },
    };
    if (current === 'NORMAL') {
      await this.prisma.ctsAlert.updateMany({
        where: { contractId, status: 'OPEN' },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      return current;
    }
    const { type, severity } = mapping[current];
    const open = await this.prisma.ctsAlert.findMany({ where: { contractId, status: 'OPEN' } });
    const same = open.find(a => a.type === type);
    // Résout les alertes d'une autre nature (ex. SEUIL/INFO supplantée par CRITIQUE).
    const stale = open.filter(a => a.type !== type);
    if (stale.length) {
      await this.prisma.ctsAlert.updateMany({
        where: { id: { in: stale.map(a => a.id) } },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
    }
    if (!same) {
      await this.prisma.ctsAlert.create({
        data: {
          contractId, type, severity, status: 'OPEN',
          payload: JSON.stringify({
            band: current, available: acc.available, budget: acc.benefitBudget,
            ratio: acc.consumptionRatio, result: acc.provisionalResult,
          }),
        },
      });
    }
    return current;
  }
}

@Module({
  providers: [CtsService],
  exports: [CtsService],
})
export class CtsModule {}
