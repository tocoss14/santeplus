import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser, Public } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { ref } from '../../common/utils';
import {
  available,
  band,
  benefitBudget,
  checkStopLoss,
  closeOut,
  consumptionRatio,
  deficit,
  managementFees,
  parseCtsConfig,
  proposeFundCall as engineProposeFundCall,
  provisionalResult,
  type CtsBand,
  type CtsConfig,
} from '../../domain/cts-engine';
import {
  computeQuote,
  type Frequency,
  type ProductPricing,
  type QuotePerson,
} from '../../domain/engine';

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
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
  ) {}

  private async loadConfig(contractId: string): Promise<CtsConfig> {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { ctsOverride: true, product: { select: { ctsConfig: true } } },
    });
    if (!c) throw new NotFoundException('Contrat introuvable');
    return parseCtsConfig((c.product as any)?.ctsConfig, c.ctsOverride);
  }

  private derived(
    acc: { primeCollected: number; consumed: number; committed: number; primeBilled: number; budgetBoost?: number },
    cfg: CtsConfig,
  ) {
    const fees = managementFees(acc.primeCollected, cfg.managementRate);
    const budget = benefitBudget(acc.primeCollected, fees);
    const boost = Math.max(0, (acc as any).budgetBoost ?? 0);
    const effectiveBudget = budget + boost;
    const avail = available(effectiveBudget, acc.consumed, acc.committed);
    return {
      managementFees: fees,
      benefitBudget: budget,
      available: avail,
      consumptionRatio: consumptionRatio(acc.consumed, acc.committed, effectiveBudget),
      provisionalResult: provisionalResult(acc.primeCollected, fees, acc.consumed, acc.committed),
      primeUnpaid: Math.max(0, acc.primeBilled - acc.primeCollected),
      deficit: deficit(acc.consumed, acc.committed, effectiveBudget),
    };
  }

  private effectiveBudget(acc: { benefitBudget: number; budgetBoost?: number }): number {
    return acc.benefitBudget + Math.max(0, (acc as any).budgetBoost ?? 0);
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

  /** Vue d'ensemble pour pilotage (P17) : compte + bande courante. */
  async getOverview(contractId: string) {
    const account = await this.ensureAccount(contractId);
    const bandNow = await this.evaluateBands(contractId);
    return { account, band: bandNow };
  }

  /**
   * Comptes techniques de l'assuré connecté (§29) : un récap par contrat
   * (prime, frais, budget, consommé, engagé, disponible, ratio, statut,
   * appels en cours, crédit, renouvellement = fin de contrat).
   */
  async myAccounts(principalUserId: string) {
    const contracts = await this.prisma.contract.findMany({
      where: { principalUserId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, number: true, status: true, endDate: true,
        product: { select: { name: true } },
      },
    });
    const rows = [];
    for (const c of contracts) {
      const account = await this.ensureAccount(c.id);
      const bandNow = await this.evaluateBands(c.id);
      const fundCalls = await this.prisma.fundCall.findMany({
        where: { contractId: c.id, status: { in: ['DRAFT', 'SENT'] } },
        orderBy: { createdAt: 'desc' },
      });
      const closure = await this.prisma.contractClosure.findUnique({ where: { contractId: c.id } });
      rows.push({
        contractId: c.id,
        number: c.number,
        status: c.status,
        productName: (c.product as any)?.name ?? null,
        renewalDate: c.endDate,
        account,
        band: bandNow,
        openFundCalls: fundCalls,
        renewalCredit: closure?.status === 'CONFIRMED' ? closure.renewalCredit : 0,
      });
    }
    return rows;
  }

  /**
   * Pilotage entreprise (§30, §35) : effectifs, contrats et CTS du collectif,
   * top garanties consommées, alertes et appels ouverts. Aucune donnée
   * médicale individuelle (montants agrégés uniquement).
   */
  async companyOverview(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company || (company as any).status !== 'ACTIVE') throw new NotFoundException('Entreprise introuvable');
    const [employeesTotal, employeesActive] = await Promise.all([
      this.prisma.user.count({ where: { companyId, role: 'MEMBER' } }),
      this.prisma.user.count({ where: { companyId, role: 'MEMBER', status: 'ACTIVE' } }),
    ]);
    const contracts = await this.prisma.contract.findMany({
      where: { companyId },
      select: {
        id: true, number: true, kind: true, status: true, endDate: true, principalUserId: true,
        product: { select: { name: true } },
        _count: { select: { beneficiaries: true } },
      },
    });
    const beneficiaries = contracts.reduce((a, c: any) => a + (c._count?.beneficiaries ?? 0), 0);
    const rows = [];
    const totals = { budget: 0, consumed: 0, committed: 0, available: 0, result: 0, collected: 0 };
    for (const c of contracts) {
      const account = await this.ensureAccount(c.id);
      const bandNow = await this.evaluateBands(c.id);
      totals.budget += account.benefitBudget + Math.max(0, (account as any).budgetBoost ?? 0);
      totals.consumed += account.consumed;
      totals.committed += account.committed;
      totals.available += account.available;
      totals.result += account.provisionalResult;
      totals.collected += account.primeCollected;
      const holder = await this.prisma.user.findUnique({
        where: { id: (c as any).principalUserId },
        select: { firstName: true, lastName: true },
      });
      rows.push({
        contractId: c.id,
        number: c.number,
        kind: c.kind,
        status: c.status,
        holder: holder ? `${holder.firstName} ${holder.lastName}` : null,
        beneficiaries: (c as any)._count?.beneficiaries ?? 0,
        endDate: (c as any).endDate,
        account,
        band: bandNow,
      });
    }
    // Top garanties consommées (montants approuvés, sans détail médical).
    const items = await this.prisma.claimItem.findMany({
      where: { claim: { contract: { companyId }, status: { in: [...CTS_COMMITTED_STATUSES, 'PAID'] } } },
      select: { categoryLabel: true, amountApproved: true },
    });
    const byGuarantee: Record<string, number> = {};
    for (const i of items) {
      if (i.amountApproved == null) continue;
      byGuarantee[i.categoryLabel] = (byGuarantee[i.categoryLabel] ?? 0) + i.amountApproved;
    }
    const topGuarantees = Object.entries(byGuarantee)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
    const contractIds = contracts.map(c => c.id);
    const [alerts, fundCalls] = await Promise.all([
      this.prisma.ctsAlert.findMany({ where: { contractId: { in: contractIds }, status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.fundCall.findMany({ where: { contractId: { in: contractIds }, status: { in: ['DRAFT', 'SENT'] } }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      company: { id: company.id, name: (company as any).name },
      headcount: { total: employeesTotal, active: employeesActive, beneficiaries },
      contracts: rows,
      totals,
      topGuarantees,
      alerts,
      fundCalls,
    };
  }

  /**
   * Portefeuille assureur/mutuelle (§31, §47) : primes, consommation,
   * engagements, sinistralité, résultats, contrats critiques, appels,
   * paiements, anomalies. Tout est recalculé, rien n'est stocké en double.
   */
  async portfolioOverview() {
    const accounts = await this.prisma.technicalAccount.findMany({
      include: {
        contract: {
          select: {
            id: true, number: true, status: true, kind: true,
            product: { select: { name: true, ctsConfig: true } },
            company: { select: { name: true } },
          },
        },
      },
    });
    const totals = { contracts: 0, collected: 0, fees: 0, budget: 0, consumed: 0, committed: 0, available: 0, result: 0, deficit: 0 };
    const critical: any[] = [];
    for (const acc of accounts) {
      const cfg = parseCtsConfig((acc as any).contract?.product?.ctsConfig);
      const b = band(acc.available, acc.benefitBudget + Math.max(0, (acc as any).budgetBoost ?? 0), cfg);
      totals.contracts += 1;
      totals.collected += acc.primeCollected;
      totals.fees += acc.managementFees;
      totals.budget += acc.benefitBudget;
      totals.consumed += acc.consumed;
      totals.committed += acc.committed;
      totals.available += acc.available;
      totals.result += acc.provisionalResult;
      totals.deficit += acc.deficit;
      if (b === 'CRITIQUE' || b === 'EPUISE') {
        critical.push({
          contractId: acc.contractId,
          number: (acc as any).contract?.number,
          product: (acc as any).contract?.product?.name,
          company: (acc as any).contract?.company?.name ?? null,
          band: b,
          available: acc.available,
          ratio: acc.consumptionRatio,
          deficit: acc.deficit,
        });
      }
    }
    critical.sort((a, b) => a.available - b.available);
    const [openFundCalls, openAlerts, stopLossCount, paidCount] = await Promise.all([
      this.prisma.fundCall.findMany({
        where: { status: { in: ['DRAFT', 'SENT'] } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { contract: { select: { number: true } } },
      }),
      this.prisma.ctsAlert.groupBy({ by: ['type', 'status'], _count: true }),
      this.prisma.ctsJournal.count({ where: { type: 'STOP_LOSS' } }),
      this.prisma.fundCall.count({ where: { status: 'PAID' } }),
    ]);
    const lossRatio = totals.collected > 0 ? totals.consumed / totals.collected : 0;
    return {
      totals: { ...totals, lossRatio },
      critical: critical.slice(0, 20),
      openFundCalls,
      alertsByType: openAlerts,
      stopLossTriggers: stopLossCount,
      fundCallsPaid: paidCount,
    };
  }

  /**
   * Simulateur commercial (§32) : estimation pré-contractuelle, jamais une
   * donnée contractuelle (flag estimation + montants indicatifs).
   */
  async simulate(input: {
    productId: string;
    principalAge: number;
    spouseAge?: number | null;
    childrenAges?: number[];
    frequency: 'ANNUAL' | 'QUARTERLY' | 'MONTHLY';
    assumedAnnualConsumption: number;
  }) {
    const product = await this.prisma.product.findUnique({ where: { id: input.productId } });
    if (!product || (product as any).status !== 'ACTIVE') throw new NotFoundException('Produit introuvable');
    const yearsAgo = (age: number) => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - Math.max(0, Math.min(100, Math.floor(age))));
      return d;
    };
    const persons: QuotePerson[] = [{ birthDate: yearsAgo(input.principalAge), relation: 'PRINCIPAL' }];
    if (input.spouseAge != null) persons.push({ birthDate: yearsAgo(input.spouseAge), relation: 'SPOUSE' });
    for (const a of input.childrenAges ?? []) persons.push({ birthDate: yearsAgo(a), relation: 'CHILD' });
    const p = product as any;
    const pricing: ProductPricing = {
      basePremiumAnnual: p.basePremiumAnnual,
      pricePerAdditionalAdultAnnual: p.pricePerAdditionalAdultAnnual ?? 0,
      pricePerChildAnnual: p.pricePerChildAnnual ?? 0,
      frequencyFactors: typeof p.frequencyFactors === 'string' ? JSON.parse(p.frequencyFactors) : (p.frequencyFactors ?? {}),
      minAge: p.minAge ?? 0,
      maxAge: p.maxAge ?? 65,
      beneficiaryRules: typeof p.beneficiaryRules === 'string' ? JSON.parse(p.beneficiaryRules) : undefined,
      ageLoadings: typeof p.ageLoadings === 'string' ? JSON.parse(p.ageLoadings) : undefined,
      globalAnnualCap: p.globalAnnualCap ?? undefined,
    };
    const { errors, quote } = computeQuote(pricing, persons, input.frequency);
    if (errors.length || !quote) throw new BadRequestException({ message: errors[0] ?? 'Simulation impossible', errors });
    const cfg = parseCtsConfig(p.ctsConfig);
    const fees = managementFees(quote.totalAnnual, cfg.managementRate);
    const budget = benefitBudget(quote.totalAnnual, fees);
    const assumed = Math.max(0, Math.floor(input.assumedAnnualConsumption));
    const avail = available(budget, assumed, 0);
    const b = band(avail, budget, cfg);
    const daily = assumed / 365;
    const exhaustionDay = daily > 0 && budget > 0 && assumed > budget ? Math.floor(budget / daily) : null;
    const { surplus, renewalCredit } = closeOut(assumed, 0, budget, cfg.carryRate);
    return {
      estimation: true,
      disclaimer: 'Montants indicatifs — simulation commerciale, pas une donnée contractuelle.',
      product: { id: p.id, name: p.name, code: p.code },
      prime: quote.totalAnnual,
      fees,
      budget,
      assumedAnnualConsumption: assumed,
      projectedResult: provisionalResult(quote.totalAnnual, fees, assumed, 0),
      projectedRatio: consumptionRatio(assumed, 0, budget),
      band: b,
      exhaustionDay,
      potentialCredit: renewalCredit,
      potentialSurplus: surplus,
    };
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
    const collected = await this.primeCollectedFromPayments(contractId);
    if (collected === acc.primeCollected) {
      return { account: acc, band: await this.evaluateBands(contractId), changed: false as const };
    }
    const cfg = await this.loadConfig(contractId);
    const updated = await this.applyCollection(acc, cfg, collected, {
      type: 'PRIME',
      amount: collected - acc.primeCollected,
      reference: opts.reference,
      actorUserId: opts.actorUserId,
      meta: { kind: 'collected', recomputed: true, ...(opts.meta ?? {}) },
    });
    return { account: updated, band: await this.evaluateBands(contractId), changed: true as const };
  }

  private async primeCollectedFromPayments(contractId: string): Promise<number> {
    const payments = await this.prisma.payment.findMany({
      where: { contractId, status: 'SUCCEEDED' },
      select: { amount: true, meta: true },
    });
    let collected = 0;
    for (const p of payments) {
      let m: any = {};
      try { m = JSON.parse((p as any).meta || '{}'); } catch { m = {}; }
      if (!m.contributionId) continue; // cotisations seules (hors appels manuels)
      collected += Math.max(0, p.amount - (Number(m.adhesionFee) || 0));
    }
    return collected;
  }

  /**
   * Crédite un encaissement au CTS (cotisation ou appel de fonds) : chaîne
   * PRIME/PAIEMENT + FRAIS + BUDGET avec balances. Source unique du crédit.
   */
  private async applyCollection(
    acc: any,
    cfg: CtsConfig,
    collected: number,
    entry: { type: 'PRIME' | 'PAIEMENT'; amount: number; reference?: string; actorUserId?: string; meta?: Record<string, unknown> },
  ) {
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
      contractId: acc.contractId, type: entry.type, amount: entry.amount,
      reference: entry.reference, actorUserId: entry.actorUserId, meta: entry.meta ?? {},
      oldBalance: oldAvail, newBalance: updated.available,
    });
    if (feesDelta > 0) {
      await this.entry({
        contractId: acc.contractId, type: 'FRAIS', amount: feesDelta,
        reference: entry.reference, actorUserId: entry.actorUserId,
        meta: { rate: cfg.managementRate }, oldBalance: updated.available, newBalance: updated.available,
      });
    }
    if (budgetDelta !== 0) {
      await this.entry({
        contractId: acc.contractId, type: 'BUDGET', amount: budgetDelta,
        reference: entry.reference, actorUserId: entry.actorUserId,
        meta: {}, oldBalance: updated.available, newBalance: updated.available,
      });
    }
    return updated;
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
    await this.checkStopLossAndAlert(contractId, cfg, updated.consumed, updated.committed);
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
    await this.checkStopLossAndAlert(contractId, cfg, updated.consumed, updated.committed);
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

  /**
   * Propose un appel de fonds (§16) : APPEL = CIBLE − DISPONIBLE.
   * Cible par défaut = reconstitution complète du budget.
   */
  async proposeFundCall(
    contractId: string,
    input: { target?: number; minimum?: number; chosenAmount?: number; dueDate?: Date | string },
    actorUserId?: string,
  ) {
    const acc = await this.ensureAccount(contractId);
    const target = input.target ?? acc.benefitBudget;
    if (!(target > 0)) throw new BadRequestException('Cible de reconstitution invalide');
    const proposal = engineProposeFundCall(target, acc.available, input.minimum ?? 0);
    const chosen = input.chosenAmount ?? proposal.recommended;
    if (!(chosen > 0)) throw new BadRequestException('Montant choisi invalide (appel sans objet)');
    const created = await this.prisma.fundCall.create({
      data: {
        contractId,
        targetAmount: target,
        minimum: proposal.minimum,
        recommended: proposal.recommended,
        chosenAmount: chosen,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        status: 'DRAFT',
      },
    });
    void actorUserId;
    return { fundCall: created, proposal };
  }

  /** Envoie l'appel (facture APF-*, échéance +30j par défaut, notification, alerte). */
  async sendFundCall(id: string) {
    const fc = await this.prisma.fundCall.findUnique({
      where: { id },
      include: { contract: { select: { principalUserId: true, number: true } } },
    });
    if (!fc) throw new NotFoundException('Appel de fonds introuvable');
    if (fc.status !== 'DRAFT') throw new BadRequestException(`Appel ${fc.status} — envoi impossible`);
    const invoiceNumber = ref('APF');
    const dueDate = (fc as any).dueDate ?? new Date(Date.now() + 30 * 86400000);
    const updated = await this.prisma.fundCall.update({
      where: { id },
      data: { status: 'SENT', invoiceNumber, dueDate },
    });
    const principalId = (fc as any).contract?.principalUserId;
    if (principalId) {
      await this.dispatch.dispatchToUser(principalId, {
        topic: 'APPEL_FONDS',
        title: `Appel de fonds — contrat ${(fc as any).contract?.number ?? ''}`,
        body: `Montant choisi : ${fc.chosenAmount} FCFA à régler avant le ${dueDate.toLocaleDateString('fr-FR')} (réf. ${invoiceNumber}).`,
        meta: { fundCallId: id, contractId: fc.contractId },
      }).catch(() => {});
    }
    await this.prisma.ctsAlert.create({
      data: {
        contractId: fc.contractId, type: 'APPEL_FONDS', severity: 'WARNING', status: 'OPEN',
        payload: JSON.stringify({ fundCallId: id, chosenAmount: fc.chosenAmount }),
      },
    });
    return updated;
  }

  /** Annule un appel non payé (DRAFT/SENT). Jamais après paiement. */
  async cancelFundCall(id: string) {
    const fc = await this.prisma.fundCall.findUnique({ where: { id } });
    if (!fc) throw new NotFoundException('Appel de fonds introuvable');
    if (!['DRAFT', 'SENT'].includes(fc.status)) throw new BadRequestException(`Appel ${fc.status} — annulation impossible`);
    return this.prisma.fundCall.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async listFundCalls(contractId: string) {
    return this.prisma.fundCall.findMany({ where: { contractId }, orderBy: { createdAt: 'desc' } });
  }

  async getClosure(contractId: string) {
    return this.prisma.contractClosure.findUnique({ where: { contractId } });
  }

  /**
   * Encaissement d'un appel de fonds (§17) : appelé UNIQUEMENT depuis un
   * paiement vérifié (jamais de réactivation administrative sans paiement).
   * Crédite le CTS, solde les alertes APPEL_FONDS, réactive si les conditions
   * sont remplies (SUSPENDU + aucune échéance OVERDUE + disponible > 0).
   */
  async recordFundPayment(
    contractId: string,
    fundCallId: string,
    payment: { id: string; amount: number; reference: string },
    actorUserId?: string,
  ) {
    const fc = await this.prisma.fundCall.findUnique({ where: { id: fundCallId } });
    if (!fc || fc.contractId !== contractId) throw new BadRequestException('Appel de fonds invalide pour ce contrat');
    if (fc.status === 'PAID') return { fundCall: fc, reactivated: false, already: true as const };
    if (fc.status !== 'SENT') throw new BadRequestException(`Appel de fonds ${fc.status} — non payable`);
    if (payment.amount !== fc.chosenAmount) throw new BadRequestException('Montant différent du montant choisi');
    const acc = await this.ensureAccount(contractId);
    const cfg = await this.loadConfig(contractId);
    const updated = await this.applyCollection(acc, cfg, acc.primeCollected + payment.amount, {
      type: 'PAIEMENT',
      amount: payment.amount,
      reference: `Payment:${payment.id}`,
      actorUserId,
      meta: { kind: 'fundcall', fundCallId },
    });
    const withTotal = await this.prisma.technicalAccount.update({
      where: { id: updated.id },
      data: { fundCallsTotal: updated.fundCallsTotal + payment.amount },
    });
    const paid = await this.prisma.fundCall.update({
      where: { id: fc.id },
      data: { status: 'PAID', paidAt: new Date(), paymentId: payment.id },
    });
    await this.prisma.ctsAlert.updateMany({
      where: { contractId, type: 'APPEL_FONDS', status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    const bandNow = await this.evaluateBands(contractId);
    const reactivated = await this.maybeReactivate(contractId);
    return { fundCall: paid, account: withTotal, band: bandNow, reactivated };
  }

  private async maybeReactivate(contractId: string): Promise<boolean> {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId }, select: { status: true } });
    if (!contract || contract.status !== 'SUSPENDED') return false;
    const overdue = await this.prisma.contribution.count({ where: { contractId, status: 'OVERDUE' } });
    if (overdue > 0) return false;
    const acc = await this.getAccount(contractId);
    if (!acc || acc.available <= 0) return false;
    await this.prisma.contract.update({ where: { id: contractId }, data: { status: 'ACTIVE' } });
    return true;
  }

  /**
   * Clôture (P15, §19) : réservée aux contrats terminés (EXPIRED/TERMINATED).
   * Recalcule depuis le compte (jamais depuis des paramètres) ; un DRAFT
   * existant est recomputé, un CONFIRMED bloque (clôture définitive).
   */
  async closeContract(contractId: string, actorUserId?: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId }, select: { status: true } });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    if (!['EXPIRED', 'TERMINATED'].includes(contract.status)) {
      throw new BadRequestException('Clôture réservée aux contrats terminés (EXPIRED/TERMINATED)');
    }
    const done = await this.prisma.contractClosure.findUnique({ where: { contractId } });
    if (done && done.status === 'CONFIRMED') throw new BadRequestException('Contrat déjà clôturé');
    const acc = await this.ensureAccount(contractId);
    const cfg = await this.loadConfig(contractId);
    const c = closeOut(acc.consumed, acc.committed, this.effectiveBudget(acc), cfg.carryRate);
    const data = {
      finalConsumed: acc.consumed,
      finalCommitted: acc.committed,
      surplus: c.surplus,
      carryRate: cfg.carryRate,
      renewalCredit: c.renewalCredit,
      mode: cfg.renewalMode,
    };
    if (done) {
      return this.prisma.contractClosure.update({ where: { id: done.id }, data });
    }
    void actorUserId;
    return this.prisma.contractClosure.create({ data: { contractId, status: 'DRAFT', ...data } });
  }

  /**
   * Confirme la clôture : fige le crédit et l'enregistre au journal
   * (CREDIT_RENOUVELLEMENT). Le crédit n'est PAS une somme retirable (§19).
   */
  async confirmClosure(id: string) {
    const closure = await this.prisma.contractClosure.findUnique({ where: { id } });
    if (!closure) throw new NotFoundException('Clôture introuvable');
    if (closure.status !== 'DRAFT') throw new BadRequestException(`Clôture ${closure.status} — confirmation impossible`);
    const confirmed = await this.prisma.contractClosure.update({
      where: { id },
      data: { status: 'CONFIRMED', closedAt: new Date() },
    });
    const acc = await this.ensureAccount(closure.contractId);
    const updated = await this.prisma.technicalAccount.update({
      where: { id: acc.id },
      data: { renewalCredit: acc.renewalCredit + closure.renewalCredit },
    });
    await this.entry({
      contractId: closure.contractId,
      type: 'CREDIT_RENOUVELLEMENT',
      amount: closure.renewalCredit,
      reference: `Closure:${closure.id}`,
      meta: { mode: closure.mode, surplus: closure.surplus },
      oldBalance: acc.available,
      newBalance: updated.available,
    });
    return confirmed;
  }

  /**
   * Applique un crédit confirmé au renouvellement (§20) : DEDUCT réduit la
   * nouvelle échéance (plancher 0, reliquat documenté), BUDGET_BOOST augmente
   * le boost persistant. Idempotent par écriture (une seule application).
   */
  async applyRenewalCredit(contractId: string) {
    const closure = await this.prisma.contractClosure.findUnique({ where: { contractId } });
    if (!closure || closure.status !== 'CONFIRMED' || !(closure.renewalCredit > 0)) {
      return { applied: false as const };
    }
    const existing = await this.prisma.ctsJournal.findFirst({
      where: { contractId, type: 'CREDIT_RENOUVELLEMENT', reference: `Closure:${closure.id}:applied` },
    });
    if (existing) return { applied: false as const, already: true as const };
    const acc = await this.ensureAccount(contractId);
    if (closure.mode === 'BUDGET_BOOST') {
      const updated = await this.prisma.technicalAccount.update({
        where: { id: acc.id },
        data: { budgetBoost: (acc.budgetBoost ?? 0) + closure.renewalCredit },
      });
      const d = this.derived(
        {
          primeCollected: updated.primeCollected, primeBilled: updated.primeBilled,
          consumed: updated.consumed, committed: updated.committed, budgetBoost: updated.budgetBoost,
        },
        await this.loadConfig(contractId),
      );
      const recalculated = await this.prisma.technicalAccount.update({ where: { id: acc.id }, data: { ...d } });
      await this.entry({
        contractId, type: 'CREDIT_RENOUVELLEMENT', amount: closure.renewalCredit,
        reference: `Closure:${closure.id}:applied`, meta: { mode: 'BUDGET_BOOST' },
        oldBalance: acc.available, newBalance: recalculated.available,
      });
      await this.evaluateBands(contractId);
      return { applied: true as const, mode: closure.mode, budgetBoost: recalculated.budgetBoost };
    }
    // DEDUCT : escompte sur la plus récente échéance impayée (échéancier du renouvellement).
    const due = await this.prisma.contribution.findFirst({
      where: { contractId, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { sequence: 'desc' },
    });
    if (!due) return { applied: false as const, reason: 'no-due-contribution' as const };
    const discount = Math.min(closure.renewalCredit, due.amount);
    const updatedDue = await this.prisma.contribution.update({
      where: { id: due.id },
      data: { amount: due.amount - discount },
    });
    await this.entry({
      contractId, type: 'CREDIT_RENOUVELLEMENT', amount: discount,
      reference: `Closure:${closure.id}:applied`,
      meta: { mode: 'DEDUCT', contributionId: due.id, remainder: closure.renewalCredit - discount },
      oldBalance: acc.available, newBalance: acc.available,
    });
    await this.evaluateBands(contractId);
    return { applied: true as const, mode: closure.mode, discount, contributionId: updatedDue.id };
  }

  /**
   * Stop-loss (§22) : au-delà du seuil, écriture STOP_LOSS + alerte CRITIQUE.
   * Dédupliqué : une seule écriture par franchissement (pas de nouvelle tant
   * que l'exposition n'est pas redescendue sous le seuil).
   */
  private async checkStopLossAndAlert(contractId: string, cfg: CtsConfig, consumed: number, committed: number) {
    const { triggered, payout } = checkStopLoss(consumed, committed, cfg.stopLoss);
    if (!cfg.stopLoss) return;
    if (!triggered) {
      // Hystérésis : exposition repassée sous le seuil → on solde les alertes stop-loss.
      const open = await this.prisma.ctsAlert.findMany({ where: { contractId, status: 'OPEN' } });
      const ids = open.filter(a => {
        try { return (JSON.parse(a.payload || '{}') as any).stopLoss === true; } catch { return false; }
      }).map((a: any) => a.id);
      if (ids.length) {
        await this.prisma.ctsAlert.updateMany({
          where: { id: { in: ids } },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
      }
      return;
    }
    const exposure = consumed + committed;
    const open = await this.prisma.ctsAlert.findMany({ where: { contractId, status: 'OPEN' } });
    const hasOpen = open.some(a => {
      try { return (JSON.parse(a.payload || '{}') as any).stopLoss === true; } catch { return false; }
    });
    const last = await this.prisma.ctsJournal.findFirst({
      where: { contractId, type: 'STOP_LOSS' },
      orderBy: { createdAt: 'desc' },
    });
    let lastExposure = 0;
    try { lastExposure = Number(JSON.parse(((last as any)?.meta) || '{}').exposure ?? 0); } catch { lastExposure = 0; }
    if (!hasOpen) {
      await this.prisma.ctsAlert.create({
        data: {
          contractId, type: 'CRITIQUE', severity: 'CRITICAL', status: 'OPEN',
          payload: JSON.stringify({ stopLoss: true, exposure, threshold: cfg.stopLoss.threshold, payout }),
        },
      });
    }
    if (!last || lastExposure <= cfg.stopLoss.threshold) {
      const acc = await this.getAccount(contractId);
      await this.entry({
        contractId, type: 'STOP_LOSS', amount: payout,
        meta: { exposure, threshold: cfg.stopLoss.threshold, cap: cfg.stopLoss.cap },
        oldBalance: acc?.available ?? 0, newBalance: acc?.available ?? 0,
      });
    }
  }

  /** Bandes + alertes : crée sur dégradation (dédupliquée), résout au retour NORMAL. */
  async evaluateBands(contractId: string) {
    const acc = await this.ensureAccount(contractId);
    const cfg = await this.loadConfig(contractId);
    // Compte vide (aucun budget constitué, aucune exposition) : NORMAL silencieux,
    // pas d'alerte EPUISEMENT sur les contrats en attente de paiement.
    if (acc.benefitBudget <= 0 && acc.consumed <= 0 && acc.committed <= 0) return 'NORMAL' as const;
    const current = band(acc.available, this.effectiveBudget(acc), cfg);
    const mapping: Record<Exclude<CtsBand, 'NORMAL'>, { type: string; severity: string }> = {
      SURVEILLANCE: { type: 'SEUIL', severity: 'INFO' },
      ALERTE: { type: 'SEUIL', severity: 'WARNING' },
      CRITIQUE: { type: 'CRITIQUE', severity: 'CRITICAL' },
      EPUISE: { type: 'EPUISEMENT', severity: 'CRITICAL' },
    };
    // Les alertes pilotées par leur propre cycle (stop-loss, appels de fonds)
    // ne sont jamais soldées par les bandes — chaque flux les résout lui-même.
    const keepOpen = (a: any): boolean => {
      try {
        const p = JSON.parse(a.payload || '{}') as any;
        if (p.stopLoss === true) return true;
      } catch { /* ignore */ }
      return a.type === 'APPEL_FONDS';
    };
    if (current === 'NORMAL') {
      const open = await this.prisma.ctsAlert.findMany({ where: { contractId, status: 'OPEN' } });
      const ids = open.filter(a => !keepOpen(a)).map((a: any) => a.id);
      if (ids.length) {
        await this.prisma.ctsAlert.updateMany({
          where: { id: { in: ids } },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
      }
      return current;
    }
    const { type, severity } = mapping[current];
    const open = await this.prisma.ctsAlert.findMany({ where: { contractId, status: 'OPEN' } });
    const same = open.find(a => a.type === type);
    // Résout les alertes de bande d'une autre nature (ex. SEUIL supplantée par CRITIQUE).
    const stale = open.filter(a => a.type !== type && !keepOpen(a));
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
            band: current, available: acc.available, budget: this.effectiveBudget(acc),
            ratio: acc.consumptionRatio, result: acc.provisionalResult,
          }),
        },
      });
    }
    return current;
  }
}

const proposeFundCallSchema = z.object({
  target: z.number().int().min(0).optional(),
  minimum: z.number().int().min(0).optional(),
  chosenAmount: z.number().int().min(0).optional(),
  dueDate: z.coerce.date().optional(),
});

const simulateSchema = z.object({
  productId: z.string().min(5),
  principalAge: z.number().int().min(0).max(100),
  spouseAge: z.number().int().min(0).max(100).nullable().optional(),
  childrenAges: z.array(z.number().int().min(0).max(30)).max(15).default([]),
  frequency: z.enum(['ANNUAL', 'QUARTERLY', 'MONTHLY']),
  assumedAnnualConsumption: z.number().int().min(0),
});

@Controller()
@UseInterceptors(AuditInterceptor)
export class CtsController {
  constructor(private cts: CtsService) {}

  @Get('admin/contracts/:id/cts')
  @RequirePermissions('cts.view')
  overview(@Param('id') id: string) {
    return this.cts.getOverview(id);
  }

  @Get('contracts/mine/cts')
  myAccounts(@CurrentUser() auth: AuthUser) {
    return this.cts.myAccounts(auth.id);
  }

  @Get('company/me/cts')
  @RequirePermissions('company.dashboard')
  companyOverview(@CurrentUser() auth: AuthUser) {
    if (!auth.companyId) throw new BadRequestException('Compte entreprise requis');
    return this.cts.companyOverview(auth.companyId);
  }

  @Get('admin/cts/portfolio')
  @RequirePermissions('cts.view')
  portfolio() {
    return this.cts.portfolioOverview();
  }

  @Public()
  @Post('cts/simulate')
  simulate(@Body(new ZodPipe(simulateSchema)) dto: any) {
    return this.cts.simulate(dto);
  }

  @Get('admin/contracts/:id/fund-calls')
  @RequirePermissions('cts.view')
  fundCalls(@Param('id') id: string) {
    return this.cts.listFundCalls(id);
  }

  @Post('admin/contracts/:id/fund-calls')
  @RequirePermissions('cts.manage')
  propose(
    @Param('id') id: string,
    @Body(new ZodPipe(proposeFundCallSchema)) dto: any,
    @CurrentUser() auth: AuthUser,
  ) {
    return this.cts.proposeFundCall(id, dto, auth.id);
  }

  @Post('admin/fund-calls/:id/send')
  @RequirePermissions('cts.manage')
  send(@Param('id') id: string) {
    return this.cts.sendFundCall(id);
  }

  @Post('admin/fund-calls/:id/cancel')
  @RequirePermissions('cts.manage')
  cancel(@Param('id') id: string) {
    return this.cts.cancelFundCall(id);
  }

  @Get('admin/contracts/:id/closure')
  @RequirePermissions('cts.view')
  closure(@Param('id') id: string) {
    return this.cts.getClosure(id);
  }

  @Post('admin/contracts/:id/closure')
  @RequirePermissions('cts.manage')
  close(
    @Param('id') id: string,
    @CurrentUser() auth: AuthUser,
  ) {
    return this.cts.closeContract(id, auth.id);
  }

  @Post('admin/closures/:id/confirm')
  @RequirePermissions('cts.manage')
  confirmClosure(@Param('id') id: string) {
    return this.cts.confirmClosure(id);
  }
}

@Module({
  controllers: [CtsController],
  providers: [CtsService],
  exports: [CtsService],
})
export class CtsModule {}
