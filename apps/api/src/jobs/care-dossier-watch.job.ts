import { Injectable } from '@nestjs/common';
import * as cron from 'node-cron';
import { PrismaService } from '../common/prisma.module';
import { NotificationDispatchService } from '../common/notifications/dispatch.service';

/**
 * Watchdog de traçabilité soin ↔ sinistre (invariant plateforme) :
 * chaque prise en charge tiers-payant doit naître dans un dossier de soins,
 * et tout dossier rattaché doit concerner le même assuré que son sinistre.
 *
 * Deux dérives détectées :
 * 1. Claim TP sans dossier — un chemin de création a contourné le flux
 *    normalisé (ex. synchro offline antérieure au fix, code régressif).
 *    Scan mensuel : le mois courant n'est scanné qu'à partir du 3 du mois
 *    suivant sa fin (une pièce offline peut encore être en synchronisation).
 * 2. Dossier rattaché à un sinistre d'un autre assuré — rattachement manuel
 *    erroné ou corrompu. Scan d'état complet : une incohérence patient n'est
 *    jamais un artefact transitoire, elle reste fautive jusqu'à correction.
 *
 * Chaque fautif est notifié UNE SEULE FOIS (dédup via la notification
 * existante — si une notif du topic citant les références existe déjà, on
 * ne ré-alerte pas). Les gestionnaires reçoivent les références à examiner ;
 * l'écran d'instruction (détacher/rattacher) reste l'action de correction.
 * Même loi de cohérence que la route de rattachement : même assuré principal
 * (patientUserId) ou même ayant droit (beneficiaryId).
 */

export function buildDossierAlertTitle(reference: string): string {
  return `Prise en charge ${reference} sans dossier de soins`;
}

export function buildPatientMismatchAlertTitle(claimReference: string, dossierReference: string): string {
  return `Dossier ${dossierReference} incohérent avec le sinistre ${claimReference}`;
}

interface MismatchRow {
  id: string;
  reference: string;
  dossierId: string;
  dossierReference: string;
}

@Injectable()
export class CareDossierWatchJob {
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
  ) {}

  /** Schedule daily at 03:40 */
  schedule() {
    cron.schedule('40 3 * * *', () => void this.run().catch((e) => console.error('[care-dossier-watch] cron error', e)));
  }

  async run(now = new Date()): Promise<{
    drifted: number;
    notified: number;
    mismatched: number;
    mismatchNotified: number;
  }> {
    const [drifted, mismatched] = await Promise.all([this.scanClaimsWithoutDossier(now), this.scanPatientMismatches()]);
    if (!drifted.length && !mismatched.length) {
      return { drifted: 0, notified: 0, mismatched: 0, mismatchNotified: 0 };
    }

    const managerIds = await this.loadActiveManagerIds();
    if (!managerIds.length) {
      return { drifted: drifted.length, notified: 0, mismatched: mismatched.length, mismatchNotified: 0 };
    }

    const notified = await this.alertWithoutDossier(drifted, managerIds);
    const mismatchNotified = await this.alertPatientMismatch(mismatched, managerIds);
    return { drifted: drifted.length, notified, mismatched: mismatched.length, mismatchNotified };
  }

  /** Dérive 1 : claims tiers-payant du mois précédent sans dossier de soins. */
  private async scanClaimsWithoutDossier(now: Date) {
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(currentMonthStart.getTime() - 1);
    const monthStart = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth(), 1));

    return this.prisma.claim.findMany({
      where: { kind: 'THIRDPARTY', careDate: { gte: monthStart, lte: monthEnd }, careRecord: { is: null } },
      select: { id: true, reference: true },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Dérive 2 : dossiers rattachés à un sinistre d'un autre assuré.
   * Prisma ne sait pas comparer deux colonnes entre elles : requête SQL
   * calquée sur la règle de la route de rattachement (claims.controller.ts).
   */
  private async scanPatientMismatches(): Promise<MismatchRow[]> {
    const rows = await this.prisma.$queryRaw<MismatchRow[]>`
      SELECT c.id, c."reference", cr.id AS "dossierId", cr."reference" AS "dossierReference"
      FROM "CareRecord" cr
      JOIN "Claim" c ON c.id = cr."claimId"
      WHERE NOT (cr."patientUserId" = c."claimantUserId")
        AND NOT (c."beneficiaryId" IS NOT NULL AND cr."beneficiaryId" = c."beneficiaryId")
      ORDER BY c."createdAt" ASC
      LIMIT 100
    `;
    return rows;
  }

  private async loadActiveManagerIds(): Promise<string[]> {
    const managers = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    return managers.map((m: any) => m.id);
  }

  private async alertWithoutDossier(drifted: Array<{ id: string; reference: string }>, managerIds: string[]) {
    let notified = 0;
    for (const claim of drifted) {
      const title = buildDossierAlertTitle(claim.reference);
      const existing = await this.prisma.notification.findFirst({
        where: { topic: 'CLAIM_NO_DOSSIER', title },
        select: { id: true },
      });
      if (existing) continue; // déjà signalé — pas de spam quotidien
      await this.dispatch.dispatchToMany(managerIds, {
        topic: 'CLAIM_NO_DOSSIER',
        title,
        body: `Prise en charge confirmée sans dossier de soins rattaché. Utilisez « Rattacher » depuis l'écran d'instruction (référence ${claim.reference}) pour rétablir la traçabilité.`,
      });
      notified++;
    }
    return notified;
  }

  private async alertPatientMismatch(mismatched: MismatchRow[], managerIds: string[]) {
    let notified = 0;
    for (const row of mismatched) {
      const title = buildPatientMismatchAlertTitle(row.reference, row.dossierReference);
      const existing = await this.prisma.notification.findFirst({
        where: { topic: 'CLAIM_DOSSIER_PATIENT_MISMATCH', title },
        select: { id: true },
      });
      if (existing) continue; // déjà signalé — pas de spam quotidien
      await this.dispatch.dispatchToMany(managerIds, {
        topic: 'CLAIM_DOSSIER_PATIENT_MISMATCH',
        title,
        body: `Le dossier de soins ${row.dossierReference} est rattaché au sinistre ${row.reference} mais ne concerne pas le même assuré (principal ou ayant droit). Depuis l'écran d'instruction : détachez le dossier puis rattachez celui du bon assuré.`,
      });
      notified++;
    }
    return notified;
  }
}
