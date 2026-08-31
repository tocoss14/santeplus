import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.module';
import { NotificationDispatchService } from '../common/notifications/dispatch.service';
import { paymentReminderEmail, smsTemplates } from '../common/notifications/email-templates';
function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Cron job : rappels de paiement
 *
 * Exécuté quotidiennement à 09:00.
 * - Envoie un rappel (email + SMS) 3 jours avant chaque échéance PENDING
 * - Envoie un rappel d'urgence 1 jour avant (avec mention suspension)
 */
@Injectable()
export class PaymentReminderJob {
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
  ) {}

  async run(now = new Date()): Promise<{ reminders: number; urgent: number; suspended: number; terminated: number }> {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1) Marquer PENDING échues → OVERDUE
    await this.prisma.contribution.updateMany({
      where: { status: 'PENDING', dueDate: { lt: today } },
      data: { status: 'OVERDUE' },
    });

    const in3Days = new Date(today.getTime() + 3 * 86_400_000);

    let reminders = 0;
    let urgent = 0;
    let suspended = 0;
    let terminated = 0;

    // Find pending contributions due in 1-3 days (pré-échéance)
    const upcoming = await this.prisma.contribution.findMany({
      where: {
        status: 'PENDING',
        dueDate: { gte: today, lte: in3Days },
      },
      include: {
        contract: {
          select: {
            id: true,
            number: true,
            principalUserId: true,
            status: true,
          },
        },
      },
    });

    // Find overdue contributions (recouvrement gradué)
    const overdue = await this.prisma.contribution.findMany({
      where: {
        status: 'OVERDUE',
      },
      include: {
        contract: {
          select: {
            id: true,
            number: true,
            principalUserId: true,
            status: true,
          },
        },
      },
    });

    // Send reminders for upcoming
    for (const c of upcoming) {
      if (!c.contract || c.contract.status !== 'ACTIVE') continue;

      // Avoid duplicate reminders: check if we already sent one today
      const existingNotification = await this.prisma.notification.findFirst({
        where: {
          userId: c.contract.principalUserId,
          topic: 'PAYMENT_REMINDER',
          createdAt: { gte: today },
          body: { contains: c.contract.number },
        },
      });
      if (existingNotification) continue;

      const daysUntil = Math.ceil((new Date(c.dueDate).getTime() - today.getTime()) / 86_400_000);
      const amount = new Intl.NumberFormat('fr-FR').format(c.amount);
      const dueDateStr = fmtDate(c.dueDate);
      const payUrl = `${process.env.APP_URL ?? 'https://santeplus.bj'}/app/contrat`;

      await this.dispatch.dispatchToUser(c.contract.principalUserId, {
        topic: 'PAYMENT_REMINDER',
        title: `Rappel : cotisation de ${amount} FCFA due dans ${daysUntil} jour${daysUntil > 1 ? 's' : ''}`,
        body: `Cotisation de ${amount} FCFA pour le contrat ${c.contract.number} due le ${dueDateStr}. Payez sur ${payUrl}`,
        html: paymentReminderEmail(
          '', // firstName fetched below
          c.amount,
          c.contract.number,
          dueDateStr,
          payUrl,
        ),
        meta: {
          contractId: c.contract.id,
          contributionId: c.id,
          amount: c.amount,
          dueDate: c.dueDate,
          daysUntil,
        },
      }).catch(() => {});

      reminders++;
    }

    // Recouvrement gradué J+3 / J+7 / J+15 (suspension) / J+45 (résiliation)
    for (const c of overdue) {
      if (!c.contract) continue;
      // Ne traiter que contrats actifs/suspendus
      if (!['ACTIVE', 'SUSPENDED'].includes(c.contract.status)) continue;

      const daysOverdue = Math.ceil((today.getTime() - new Date(c.dueDate).getTime()) / 86_400_000);
      let stage: 'J3' | 'J7' | 'J15' | 'J45' | null = null;
      if (daysOverdue === 3) stage = 'J3';
      else if (daysOverdue === 7) stage = 'J7';
      else if (daysOverdue === 15) stage = 'J15';
      else if (daysOverdue === 45) stage = 'J45';
      else if (daysOverdue > 40 && daysOverdue < 45) {
        // Alerte critique J+40-44
        stage = 'J15';
      }
      if (!stage) continue;

      // Anti-spam: un seul message par stage
      const metaContains = `${c.contract.number}:${stage}`;
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: c.contract.principalUserId,
          topic: { in: ['PAYMENT_REMINDER', 'CONTRACT_SUSPENDED', 'CONTRACT_TERMINATED'] },
          body: { contains: metaContains },
        },
      });
      if (existing) continue;

      const amountStr = new Intl.NumberFormat('fr-FR').format(c.amount);
      const payUrl = `${process.env.APP_URL ?? 'https://santeplus.bj'}/app/contrat`;

      if (stage === 'J3' || stage === 'J7') {
        await this.dispatch.dispatchToUser(c.contract.principalUserId, {
          topic: 'PAYMENT_REMINDER',
          title: stage === 'J3' ? `Rappel J+3 — ${amountStr} FCFA` : `Relance J+7 — ${amountStr} FCFA`,
          body: `Cotisation ${amountStr} FCFA contrat ${c.contract.number} en retard de ${daysOverdue} jours (${metaContains}). Payez sur ${payUrl}`,
          meta: { contractId: c.contract.id, contributionId: c.id, stage, daysOverdue },
        }).catch(() => {});
        urgent++;
      } else if (stage === 'J15') {
        // Suspension
        if (c.contract.status === 'ACTIVE') {
          await this.prisma.contract.update({ where: { id: c.contract.id }, data: { status: 'SUSPENDED' } });
          suspended++;
        }
        await this.dispatch.dispatchToUser(c.contract.principalUserId, {
          topic: 'CONTRACT_SUSPENDED',
          title: `Suspension J+15 — contrat ${c.contract.number}`,
          body: `Contrat ${c.contract.number} suspendu après 15 jours d'impayé (${metaContains}). Régularisez pour réactiver.`,
          meta: { contractId: c.contract.id, contributionId: c.id, stage, daysOverdue },
        }).catch(() => {});
        urgent++;
      } else if (stage === 'J45') {
        // Résiliation
        if (['ACTIVE', 'SUSPENDED'].includes(c.contract.status)) {
          await this.prisma.contract.update({ where: { id: c.contract.id }, data: { status: 'TERMINATED', endDate: today } });
          terminated++;
        }
        await this.dispatch.dispatchToUser(c.contract.principalUserId, {
          topic: 'CONTRACT_TERMINATED',
          title: `Résiliation J+45 — contrat ${c.contract.number}`,
          body: `Contrat ${c.contract.number} résilié après 45 jours d'impayé (${metaContains}). Contactez le support.`,
          meta: { contractId: c.contract.id, contributionId: c.id, stage, daysOverdue },
        }).catch(() => {});
        urgent++;
      }
    }

    return { reminders, urgent, suspended, terminated };
  }
}
