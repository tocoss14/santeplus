import { Injectable } from '@nestjs/common';
import * as cron from 'node-cron';
import { PrismaService } from '../common/prisma.module';
import { NotificationDispatchService } from '../common/notifications/dispatch.service';

/**
 * Watchdog de traçabilité soin ↔ sinistre (invariant plateforme) :
 * chaque prise en charge tiers-payant doit naître dans un dossier de soins.
 * Un claim TP sans dossier signale un chemin de création qui a contourné le
 * flux normalisé (ex. synchro offline antérieure au fix, code régressif).
 *
 * Stratégie : scan quotidien des claims TP en défaut. Chaque claim fautif est
 * notifié UNE SEULE FOIS (dédup via la notification existante — si une notif
 * de topic CLAIM_NO_DOSSIER citant la référence existe déjà, on ne ré-alerte
 * pas). Les gestionnaires reçoivent les références à examiner ; le rattachement
 * manuel (POST /admin/claims/:id/care-dossier) reste l'action de correction.
 */

export function buildDossierAlertTitle(reference: string): string {
  return `Prise en charge ${reference} sans dossier de soins`;
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

  async run(now = new Date()): Promise<{ drifted: number; notified: number }> {
    // Le mois courant n'est scanné qu'à partir du 3 du mois suivant sa fin :
    // pendant un mois actif, un claim vient d'être créé et sa pièce (offline)
    // peut encore être en cours de synchronisation — on ne crie pas trop tôt.
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(currentMonthStart.getTime() - 1);
    const monthStart = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth(), 1));

    const drifted = await this.prisma.claim.findMany({
      where: { kind: 'THIRDPARTY', careDate: { gte: monthStart, lte: monthEnd }, careRecord: { is: null } },
      select: { id: true, reference: true },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    if (!drifted.length) return { drifted: 0, notified: 0 };

    const managers = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    const managerIds = managers.map((m: any) => m.id);
    if (!managerIds.length) return { drifted: drifted.length, notified: 0 };

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
    return { drifted: drifted.length, notified };
  }
}
