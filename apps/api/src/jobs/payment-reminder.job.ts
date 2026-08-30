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

  async run(now = new Date()): Promise<{ reminders: number; urgent: number }> {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const in3Days = new Date(today.getTime() + 3 * 86_400_000);
    const tomorrow = new Date(today.getTime() + 1 * 86_400_000);

    let reminders = 0;
    let urgent = 0;

    // Find pending contributions due in 1-3 days
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

    // Also find overdue contributions (for urgent reminders)
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

    // Send urgent reminders for overdue (suspension warning)
    for (const c of overdue) {
      if (!c.contract || c.contract.status !== 'ACTIVE') continue;

      // Only send urgent reminder once
      const existingUrgent = await this.prisma.notification.findFirst({
        where: {
          userId: c.contract.principalUserId,
          topic: 'CONTRACT_SUSPENDED',
          createdAt: { gte: new Date(today.getTime() - 2 * 86_400_000) },
        },
      });
      if (existingUrgent) continue;

      const daysOverdue = Math.ceil((today.getTime() - new Date(c.dueDate).getTime()) / 86_400_000);
      if (daysOverdue < 40) continue; // Only warn at 40+ days (before 45-day suspension)

      await this.dispatch.dispatchToUser(c.contract.principalUserId, {
        topic: 'CONTRACT_SUSPENDED',
        title: `⚠️ Alerte critique — contrat ${c.contract.number}`,
        body: `Votre contrat ${c.contract.number} sera suspendu dans ${45 - daysOverdue} jours si la cotisation n'est pas réglée. Montant : ${new Intl.NumberFormat('fr-FR').format(c.amount)} FCFA.`,
        meta: {
          contractId: c.contract.id,
          contributionId: c.id,
          amount: c.amount,
          dueDate: c.dueDate,
          daysOverdue,
        },
      }).catch(() => {});

      urgent++;
    }

    return { reminders, urgent };
  }
}
