import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import * as cron from 'node-cron';
import { PrismaService } from '../common/prisma.module';
import { daysBetween, startOfDay } from '../common/utils';
import { NotificationDispatchService } from '../common/notifications/dispatch.service';

@Injectable()
export class CronService implements OnApplicationBootstrap {
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
  ) {}

  onApplicationBootstrap() {
    cron.schedule('0 8 * * *', () => void this.runDaily());
    setTimeout(() => void this.runDaily(), 5000);
  }

  private async getConfig(key: string, fallback: any): Promise<any> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return fallback;
    }
  }

  async runDaily() {
    const today = startOfDay(new Date());
    try {
      await this.expireContracts(today);
      await this.sendExpiryReminders(today);
      await this.handleOverdueContributions(today);
      await this.sendDueSoonReminders(today);
    } catch (e) {
      console.error('[cron] daily job error', e);
    }
  }

  private notify(userId: string, topic: string, title: string, body: string) {
    return this.dispatch.dispatchToUser(userId, { topic, title, body }).catch(() => null);
  }

  private async expireContracts(today: Date) {
    const expired = await this.prisma.contract.findMany({
      where: { status: 'ACTIVE', endDate: { lt: today } },
      select: { id: true, number: true, principalUserId: true },
    });
    for (const c of expired) {
      await this.prisma.contract.update({ where: { id: c.id }, data: { status: 'EXPIRED' } });
      await this.notify(c.principalUserId, 'CONTRACT_EXPIRED',
        `Contrat ${c.number} expiré`,
        'Votre contrat a expiré. Renouvelez-le depuis votre espace pour maintenir votre couverture.');
    }
  }

  private async sendExpiryReminders(today: Date) {
    const thresholds = await this.getConfig('expiryReminders', [30, 15, 7]);
    if (!Array.isArray(thresholds)) return;
    const contracts = await this.prisma.contract.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, number: true, principalUserId: true, endDate: true },
    });
    for (const c of contracts) {
      if (!c.endDate) continue;
      const left = daysBetween(today, new Date(c.endDate));
      if (!thresholds.includes(left)) continue;
      await this.notify(c.principalUserId, 'EXPIRY_REMINDER',
        `Votre contrat ${c.number} expire dans ${left} jours`,
        `Pensez à renouveler votre couverture avant le ${new Date(c.endDate).toLocaleDateString('fr-FR')}.`);
    }
  }

  private async handleOverdueContributions(today: Date) {
    const graceDays = Number(await this.getConfig('graceDays', 15));
    const suspendAfter = Number(await this.getConfig('suspendAfterOverdueDays', 45));
    const overdueCutoff = new Date(today.getTime() - graceDays * 86400000);
    const suspendCutoff = new Date(today.getTime() - suspendAfter * 86400000);

    const toOverdue = await this.prisma.contribution.updateMany({
      where: { status: 'PENDING', dueDate: { lt: overdueCutoff } },
      data: { status: 'OVERDUE' },
    });

    const late = await this.prisma.contribution.findMany({
      where: { status: 'OVERDUE', dueDate: { lt: suspendCutoff } },
      include: { contract: { select: { id: true, number: true, principalUserId: true, status: true } } },
    });
    const seenContracts = new Set<string>();
    for (const contribution of late) {
      const c = contribution.contract;
      if (!c || seenContracts.has(c.id)) continue;
      seenContracts.add(c.id);
      if (c.status === 'ACTIVE') {
        await this.prisma.contract.update({ where: { id: c.id }, data: { status: 'SUSPENDED' } });
        await this.notify(c.principalUserId, 'CONTRACT_SUSPENDED',
          `Contrat ${c.number} suspendu`,
          `Vos cotisations sont en retard de plus de ${suspendAfter} jours. Régularisez pour réactiver votre couverture.`);
      }
    }
    void toOverdue;
  }

  private async sendDueSoonReminders(today: Date) {
    const upcoming = await this.prisma.contribution.findMany({
      where: { status: 'PENDING', dueDate: { gte: today, lt: new Date(today.getTime() + 4 * 86400000) } },
      include: { contract: { select: { number: true, principalUserId: true } } },
    });
    for (const contribution of upcoming) {
      const c = contribution.contract;
      await this.notify(c.principalUserId, 'DUE_REMINDER',
        `Cotisation à régler : ${contribution.amount} FCFA`,
        `Échéance du ${new Date(contribution.dueDate).toLocaleDateString('fr-FR')} — contrat ${c.number}.`);
    }
  }
}
