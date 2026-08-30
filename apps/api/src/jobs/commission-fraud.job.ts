import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.module';
import { NotificationDispatchService } from '../common/notifications/dispatch.service';

/**
 * Anti-fraude commissions :
 *
 * 1. CLAWBACK — Si un contrat est annulé, résilié ou suspendu définitivement
 *    dans les 90 premiers jours, toutes les commissions NEW_BUSINESS et OVERRIDE
 *    liées sont reversées (status → REJECTED avec note "clawback").
 *
 * 2. ACTIVATION CHECK — Les commissions NEW_BUSINESS restent en PENDING
 *    jusqu'à ce que le contrat soit actif depuis au moins 30 jours.
 *    Si le contrat n'est toujours pas actif après 30 jours, la commission est rejetée.
 *    Si le contrat est actif depuis 30+ jours, la commission passe en APPROVED
 *    (prête à être payée).
 */
@Injectable()
export class CommissionFraudJob {
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
  ) {}

  /**
   * Exécuter les deux vérifications
   */
  async run(now = new Date()): Promise<{ clawbacks: number; released: number; rejected: number }> {
    const clawbacks = await this.checkClawbacks(now);
    const { released, rejected } = await this.checkActivations(now);
    return { clawbacks, released, rejected };
  }

  /**
   * CLAWBACK : contracts annulés/résiliés/suspendus dans les 90 premiers jours
   */
  private async checkClawbacks(now: Date): Promise<number> {
    const cutoff90d = new Date(now.getTime() - 90 * 86_400_000);

    // Trouver les contrats non-actifs créés il y a < 90 jours avec des commissions
    const cancelledContracts = await this.prisma.contract.findMany({
      where: {
        status: { in: ['TERMINATED', 'EXPIRED', 'SUSPENDED'] },
        createdAt: { gte: cutoff90d },
        distributorId: { not: null },
      },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        principalUserId: true,
        distributorId: true,
        distributor: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    let clawbackCount = 0;

    for (const contract of cancelledContracts) {
      // Vérifier que le contrat a bien moins de 90 jours
      const contractAge = now.getTime() - new Date(contract.createdAt).getTime();
      if (contractAge > 90 * 86_400_000) continue;

      // Trouver les commissions PENDING ou APPROVED liées à ce contrat
      const commissions = await this.prisma.commission.findMany({
        where: {
          contractId: contract.id,
          type: { in: ['NEW_BUSINESS', 'OVERRIDE'] },
          status: { in: ['PENDING', 'APPROVED'] },
        },
      });

      for (const commission of commissions) {
        await this.prisma.commission.update({
          where: { id: commission.id },
          data: {
            status: 'REJECTED',
            note: `CLAWBACK: Contrat ${contract.number} ${contract.status === 'TERMINATED' ? 'résilié' : contract.status === 'SUSPENDED' ? 'suspendu' : 'expiré'} avant 90 jours (créé le ${new Date(contract.createdAt).toLocaleDateString('fr-FR')})`,
          },
        });
        clawbackCount++;

        // Notifier le distributeur
        if (contract.distributorId) {
          await this.dispatch.dispatchToUser(contract.distributorId, {
            topic: 'COMMISSION_CLAWBACK',
            title: `Commission annulée — contrat ${contract.number}`,
            body: `La commission de ${commission.amount} FCFA pour le contrat ${contract.number} a été annulée (clawback) car le contrat a été ${contract.status === 'TERMINATED' ? 'résilié' : 'suspendu'} avant 90 jours.`,
          }).catch(() => {});
        }
      }
    }

    return clawbackCount;
  }

  /**
   * ACTIVATION CHECK : libérer ou rejeter les commissions après 30 jours
   */
  private async checkActivations(now: Date): Promise<{ released: number; rejected: number }> {
    const checkWindow = 25; // Check contracts between 25-35 days old (buffer)
    const minAge = 30 * 86_400_000;
    const maxAge = 35 * 86_400_000;
    const cutoffMin = new Date(now.getTime() - maxAge);
    const cutoffMax = new Date(now.getTime() - minAge);

    // Trouver les commissions PENDING NEW_BUSINESS pour des contrats créés entre 25 et 35 jours
    const pendingCommissions = await this.prisma.commission.findMany({
      where: {
        type: 'NEW_BUSINESS',
        status: 'PENDING',
        contract: {
          createdAt: { gte: cutoffMin, lte: cutoffMax },
          distributorId: { not: null },
        },
      },
      include: {
        contract: {
          select: {
            id: true,
            number: true,
            status: true,
            createdAt: true,
            principalUserId: true,
          },
        },
        distributor: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    let released = 0;
    let rejected = 0;

    for (const commission of pendingCommissions) {
      if (!commission.contract) continue;

      const contractStatus = commission.contract.status;

      if (contractStatus === 'ACTIVE') {
        // ✅ Contrat actif depuis 30+ jours → libérer la commission
        await this.prisma.commission.update({
          where: { id: commission.id },
          data: {
            status: 'APPROVED',
            note: `Auto-approuvé : contrat ${commission.contract.number} actif depuis 30+ jours`,
          },
        });
        released++;

        // Notifier le distributeur
        if (commission.distributorId) {
          await this.dispatch.dispatchToUser(commission.distributorId, {
            topic: 'COMMISSION_APPROVED',
            title: `Commission approuvée — ${commission.amount} FCFA`,
            body: `Votre commission de ${commission.amount} FCFA pour le contrat ${commission.contract.number} a été approuvée automatiquement. Elle sera payée lors de la prochaine session de paiement.`,
          }).catch(() => {});
        }
      } else if (['TERMINATED', 'EXPIRED', 'SUSPENDED'].includes(contractStatus)) {
        // ❌ Contrat annulé avant activation → rejeter
        await this.prisma.commission.update({
          where: { id: commission.id },
          data: {
            status: 'REJECTED',
            note: `Rejeté : contrat ${commission.contract.number} n'est pas actif (statut: ${contractStatus}) après 30 jours`,
          },
        });
        rejected++;

        if (commission.distributorId) {
          await this.dispatch.dispatchToUser(commission.distributorId, {
            topic: 'COMMISSION_REJECTED',
            title: `Commission rejetée — contrat ${commission.contract.number}`,
            body: `La commission de ${commission.amount} FCFA pour le contrat ${commission.contract.number} a été rejetée car le contrat n'est pas actif.`,
          }).catch(() => {});
        }
      }
      // Si PENDING_PAYMENT ou DRAFT → on attend encore
    }

    return { released, rejected };
  }
}
