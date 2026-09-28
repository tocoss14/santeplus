import { Injectable, Optional } from '@nestjs/common';
import * as cron from 'node-cron';
import { PrismaService } from '../common/prisma.module';
import { NotificationDispatchService } from '../common/notifications/dispatch.service';
import { CtsV2Service } from '../modules/financial-model/cts-v2.service';

/**
 * Alerte hebdomadaire de solvabilité du portefeuille V2_MUTUAL.
 *
 * Chaque lundi matin, la position technique consolidée V2 est recalculée par
 * le moteur cts-v2 (strictement V2 — aucune consolidation avec V1). Si la
 * marge de solvabilité (position + fonds de solidarité / engagements) passe
 * sous le seuil configuré, les gestionnaires actifs sont notifiés et
 * l'alerte est journalisée dans l'audit.
 *
 * Configuration (SystemConfig, JSON) :
 *  - `v2SolvencyAlert.enabled`  (boolean, défaut true)
 *  - `v2SolvencyAlert.threshold` (nombre entre 0 et 1, défaut 1 = 100 %)
 *  - `v2SolvencyAlert.cron`      (expression node-cron, défaut « 0 7 * * 1 »)
 *
 * Déduplication : le titre de l'alerte porte la semaine ISO — une seule
 * notification par semaine tant que le seuil reste franchi (pas de spam
 * quotidien, mais un rappel chaque semaine tant que la situation dure).
 * Le job ne s'exécute jamais si le portefeuille V2 est vide : sans
 * engagements, la marge est indéterminée, pas déficiente.
 */

export const V2_SOLVENCY_TOPIC = 'V2_SOLVENCY_ALERT';

export interface V2SolvencyAlertResult {
  enabled: boolean;
  threshold: number;
  solvencyRatio: number | null;
  breach: boolean;
  notified: boolean;
  contractsCount: number;
  /** Point hebdomadaire persisté (toutes exécutions, breach ou non). */
  snapshotSaved: boolean;
}

/** Lundi 00:00 UTC de la semaine contenant `d` (clé du point hebdomadaire). */
export function isoWeekStart(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7; // dimanche = 7
  date.setUTCDate(date.getUTCDate() - (dayNum - 1));
  return date;
}

/** Semaine ISO 8601 (lundi) — sert de clé de déduplication hebdomadaire. */
export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-S${String(week).padStart(2, '0')}`;
}

export function buildAlertTitle(ratio: number, threshold: number, week: string): string {
  const pct = (ratio * 100).toFixed(1).replace('.', ',');
  const thrPct = (threshold * 100).toFixed(0);
  return `Solvabilité V2 sous le seuil — marge ${pct} % (< ${thrPct} %) — ${week}`;
}

@Injectable()
export class V2SolvencyAlertJob {
  private _scheduled = false;

  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
    @Optional() private ctsV2?: CtsV2Service,
  ) {}

  /** Planification par défaut : lundi 07:00 (surchargeable via SystemConfig). */
  schedule(expression = '0 7 * * 1') {
    // Garde anti-double-scheduling (même loi que CareDossierWatchJob) : un
    // réamorçage Nest accumulerait les tâches node-cron identiques.
    if (this._scheduled) return;
    this._scheduled = true;
    cron.schedule(expression, () =>
      void this.run().catch((e) => console.error('[v2-solvency-alert] cron error', e)),
    );
  }

  /** Configuration lue depuis SystemConfig avec valeurs par défaut sûres. */
  async readConfig(): Promise<{ enabled: boolean; threshold: number }> {
    const rows = await this.prisma.systemConfig.findMany({
      where: { key: { in: ['v2SolvencyAlert.enabled', 'v2SolvencyAlert.threshold'] } },
    });
    let enabled = true;
    let threshold = 1;
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value);
        if (row.key === 'v2SolvencyAlert.enabled') enabled = parsed !== false;
        if (row.key === 'v2SolvencyAlert.threshold') {
          const n = Number(parsed);
          if (Number.isFinite(n) && n >= 0 && n <= 10) threshold = n;
        }
      } catch {
        // valeur corrompue : on garde le défaut correspondant
      }
    }
    return { enabled, threshold };
  }

  async run(now = new Date()): Promise<V2SolvencyAlertResult> {
    const { enabled, threshold } = await this.readConfig();
    if (!enabled) {
      console.log('[v2-solvency-alert] désactivé (v2SolvencyAlert.enabled=false)');
      return { enabled: false, threshold, solvencyRatio: null, breach: false, notified: false, contractsCount: 0, snapshotSaved: false };
    }
    if (!this.ctsV2) {
      console.warn('[v2-solvency-alert] moteur cts-v2 indisponible — alerte sautée');
      return { enabled: true, threshold, solvencyRatio: null, breach: false, notified: false, contractsCount: 0, snapshotSaved: false };
    }

    const portfolio = await this.ctsV2.portfolioPosition();
    const ratio = portfolio.solvency.solvencyRatio as number;

    // Portefeuille vide : aucun engagement → marge indéterminée, pas déficiente.
    const hasExposure = portfolio.contractsCount > 0;
    const breach = hasExposure && Number.isFinite(ratio) && ratio < threshold;

    // Historisation hebdomadaire : le point est écrit à CHAQUE exécution
    // (breach ou non) — c'est lui qui fait vivre le graphique pluri-annuel.
    // Upsert par weekKey : les re-exécutions manuelles de la même semaine
    // rafraîchissent le point au lieu d'empiler des doublons.
    let snapshotSaved = false;
    try {
      await this.prisma.v2SolvencySnapshot.upsert({
        where: { weekKey: isoWeekKey(now) },
        update: {
          solvencyRatio: hasExposure ? ratio : 1,
          threshold,
          breach,
          contractsCount: portfolio.contractsCount,
          contributions: portfolio.aggregates.contributions,
          engagedClaims: portfolio.aggregates.engagedClaims,
          paidClaims: portfolio.aggregates.paidClaims,
          position: portfolio.position.position,
        },
        create: {
          weekKey: isoWeekKey(now),
          weekStart: isoWeekStart(now),
          solvencyRatio: hasExposure ? ratio : 1,
          threshold,
          breach,
          contractsCount: portfolio.contractsCount,
          contributions: portfolio.aggregates.contributions,
          engagedClaims: portfolio.aggregates.engagedClaims,
          paidClaims: portfolio.aggregates.paidClaims,
          position: portfolio.position.position,
        },
      });
      snapshotSaved = true;
    } catch (e) {
      // L'historisation ne doit jamais bloquer l'alerte (et inversement).
      console.error('[v2-solvency-alert] snapshot hebdomadaire impossible', e);
    }

    if (!breach) {
      console.log(
        `[v2-solvency-alert] OK — marge ${Number.isFinite(ratio) ? (ratio * 100).toFixed(1) + ' %' : 'indéterminée (aucun engagement)'} (seuil ${(threshold * 100).toFixed(0)} %, ${portfolio.contractsCount} contrat(s))`,
      );
      return { enabled: true, threshold, solvencyRatio: hasExposure ? ratio : null, breach: false, notified: false, contractsCount: portfolio.contractsCount, snapshotSaved };
    }

    const week = isoWeekKey(now);
    const title = buildAlertTitle(ratio, threshold, week);

    // Dédup hebdomadaire : une notification par semaine tant que le seuil
    // reste franchi (le titre porte la semaine ISO).
    const existing = await this.prisma.notification.findFirst({
      where: { topic: V2_SOLVENCY_TOPIC, title },
      select: { id: true },
    });
    if (existing) {
      return { enabled: true, threshold, solvencyRatio: ratio, breach: true, notified: false, contractsCount: portfolio.contractsCount, snapshotSaved };
    }

    const managers = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    const managerIds = managers.map((m: any) => m.id);

    const a = portfolio.aggregates;
    const pct = (ratio * 100).toFixed(1).replace('.', ',');
    const body = [
      `La marge de solvabilité du portefeuille V2_MUTUAL est de ${pct} %, sous le seuil de ${(threshold * 100).toFixed(0)} %.`,
      `Cotisations encaissées : ${a.contributions.toLocaleString('fr-FR')} F — prestations engagées : ${a.engagedClaims.toLocaleString('fr-FR')} F, payées : ${a.paidClaims.toLocaleString('fr-FR')} F.`,
      `Provisions (RBNS+IBNR) : ${(a.rbns + a.ibnr).toLocaleString('fr-FR')} F — position technique : ${portfolio.position.position.toLocaleString('fr-FR')} F.`,
      `Périmètre : ${portfolio.contractsCount} contrat(s) V2 uniquement (aucune consolidation V1). Consultez « Position technique V2 » dans l'admin.`,
    ].join(' ');

    if (managerIds.length) {
      await this.dispatch.dispatchToMany(managerIds, { topic: V2_SOLVENCY_TOPIC, title, body });
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'V2_SOLVENCY_ALERT',
          entityType: 'FinancialModelVersion',
          entityId: 'fmv_v2_mutual',
          status: 'OK',
          meta: JSON.stringify({
            solvencyRatio: ratio,
            threshold,
            week,
            contractsCount: portfolio.contractsCount,
            aggregates: {
              contributions: a.contributions,
              engagedClaims: a.engagedClaims,
              paidClaims: a.paidClaims,
              rbns: a.rbns,
              ibnr: a.ibnr,
            },
            position: portfolio.position.position,
          }),
        },
      });
    } catch {
      // audit best-effort : l'alerte notifiée reste la livraison principale
    }

    return { enabled: true, threshold, solvencyRatio: ratio, breach: true, notified: true, contractsCount: portfolio.contractsCount, snapshotSaved };
  }
}
