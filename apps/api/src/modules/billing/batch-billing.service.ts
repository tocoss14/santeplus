import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { ref } from '../../common/utils';

export interface CreateBatchInvoiceInput {
  providerId: string;
  periodStart: Date;
  periodEnd: Date;
  claimIds: string[];
}

export interface SubmitBatchInvoiceInput {
  batchInvoiceId: string;
}

export interface ValidateBatchInvoiceInput {
  batchInvoiceId: string;
  items: {
    batchInvoiceItemId: string;
    amountApproved: number;
    rejectionReason?: string;
  }[];
}

export interface CreateRejectionInput {
  batchInvoiceId: string;
  batchInvoiceItemId: string;
  type: string;
  reason: string;
  amount: number;
}

export interface DisputeRejectionInput {
  rejectionId: string;
  resolutionNote: string;
}

export interface CreateCreditNoteInput {
  providerId: string;
  batchInvoiceId?: string;
  type: string;
  reason: string;
  amount: number;
}

export interface ReconcileInput {
  providerId: string;
  periodStart: Date;
  periodEnd: Date;
  expectedAmount: number;
  paidAmount: number;
}

@Injectable()
export class BatchBillingService {
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
  ) {}

  /**
   * Crée une facture groupée (batch) pour un prestataire sur une période.
   * Agrège les sinistres éligibles (kind=THIRD_PARTY, status=PAID/APPROVED).
   */
  async createBatchInvoice(input: CreateBatchInvoiceInput) {
    const provider = await this.prisma.provider.findUnique({ where: { id: input.providerId } });
    if (!provider) throw new NotFoundException('Prestataire introuvable');
    if (!provider.thirdPartyPayer) throw new BadRequestException('Prestataire non tiers-payant');

    // Vérifier qu'il n'y a pas déjà une facture en cours sur cette période
    const existing = await this.prisma.batchInvoice.findFirst({
      where: {
        providerId: input.providerId,
        periodStart: { lte: input.periodEnd },
        periodEnd: { gte: input.periodStart },
        status: { in: ['DRAFT', 'SUBMITTED', 'VALIDATED'] },
      },
    });
    if (existing) throw new BadRequestException('Facture groupée déjà existante pour cette période');

    // Récupérer les sinistres tiers-payant payés/approuvés sur la période
    const claims = await this.prisma.claim.findMany({
      where: {
        providerId: input.providerId,
        kind: 'THIRD_PARTY',
        status: { in: ['PAID', 'APPROVED'] },
        careDate: { gte: input.periodStart, lte: input.periodEnd },
        invoiceNumber: null, // pas encore facturés
      },
      include: {
        items: true,
        contract: { select: { id: true, number: true } },
        claimantUser: { select: { firstName: true, lastName: true, memberNumber: true } },
        beneficiary: { select: { firstName: true, lastName: true, memberNumber: true } },
      },
    });

    if (!claims.length) throw new BadRequestException('Aucun sinistre tiers-payant éligible sur cette période');

    // Construire les lignes
    const items = claims.flatMap(claim =>
      claim.items.map(item => ({
        claimId: claim.id,
        claimItemId: item.id,
        actId: item.actId ?? undefined,
        quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? item.amountApproved ?? item.amountRequested,
        amountRequested: item.amountRequested,
        amountApproved: item.amountApproved ?? item.amountRequested,
      })),
    );

    const totalAmount = items.reduce((a, i) => a + i.amountRequested, 0);
    const totalApproved = items.reduce((a, i) => a + i.amountApproved, 0);

    const batchInvoice = await this.prisma.$transaction(async tx => {
      const invoice = await tx.batchInvoice.create({
        data: {
          number: ref('BAT'),
          providerId: input.providerId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: 'DRAFT',
          totalAmount,
          totalApproved,
          items: {
            create: items,
          },
        },
        include: { items: true },
      });

      // Marquer les sinistres comme facturés (réservation)
      await tx.claim.updateMany({
        where: { id: { in: claims.map(c => c.id) } },
        data: { invoiceNumber: invoice.number, invoicedAt: new Date() },
      });

      return invoice;
    });

    return batchInvoice;
  }

  /**
   * Soumet la facture groupée au prestataire (statut SUBMITTED).
   */
  async submitBatchInvoice(input: SubmitBatchInvoiceInput) {
    const invoice = await this.prisma.batchInvoice.findUnique({
      where: { id: input.batchInvoiceId },
      include: { provider: true, items: { include: { claim: true } } },
    });
    if (!invoice) throw new NotFoundException('Facture groupée introuvable');
    if (invoice.status !== 'DRAFT') throw new BadRequestException(`Facture ${invoice.status} — soumission impossible`);

    const updated = await this.prisma.batchInvoice.update({
      where: { id: input.batchInvoiceId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    // Notification prestataire (aux utilisateurs staff du prestataire)
    const staffUsers = await this.prisma.user.findMany({
      where: { providerId: invoice.providerId },
      select: { id: true },
    });
    for (const u of staffUsers) {
      await this.dispatch.dispatchToUser(u.id, {
        topic: 'BATCH_INVOICE_SUBMITTED',
        title: `Facture groupée ${invoice.number} soumise`,
        body: `Montant total : ${(invoice.totalApproved / 100).toLocaleString()} FCFA. Période : ${invoice.periodStart.toLocaleDateString()} - ${invoice.periodEnd.toLocaleDateString()}.`,
        meta: { batchInvoiceId: invoice.id },
      }).catch(() => {});
    }

    return updated;
  }

  /**
   * Validation admin : approuve/rejette les lignes.
   */
  async validateBatchInvoice(input: ValidateBatchInvoiceInput, actorUserId: string) {
    const invoice = await this.prisma.batchInvoice.findUnique({
      where: { id: input.batchInvoiceId },
      include: { items: true, provider: true },
    });
    if (!invoice) throw new NotFoundException('Facture groupée introuvable');
    if (invoice.status !== 'SUBMITTED') throw new BadRequestException(`Facture ${invoice.status} — validation impossible`);

    let totalApproved = 0;
    let totalRejected = 0;

    await this.prisma.$transaction(async tx => {
      for (const itemInput of input.items) {
        const item = await tx.batchInvoiceItem.findUnique({ where: { id: itemInput.batchInvoiceItemId } });
        if (!item || item.batchInvoiceId !== input.batchInvoiceId) continue;

        const approved = Math.min(itemInput.amountApproved, item.amountRequested);
        const rejected = Math.max(0, item.amountRequested - approved);

        await tx.batchInvoiceItem.update({
          where: { id: item.id },
          data: {
            amountApproved: approved,
            amountRejected: rejected,
            status: rejected > 0 ? (approved > 0 ? 'PARTIAL' : 'REJECTED') : 'APPROVED',
            rejectionReason: itemInput.rejectionReason ?? (rejected > 0 ? 'Rejeté lors validation' : null),
          },
        });

        totalApproved += approved;
        totalRejected += rejected;

        // Créer un rejet si nécessaire
        if (rejected > 0) {
          await tx.rejection.create({
            data: {
              code: ref('REJ'),
              batchInvoiceId: input.batchInvoiceId,
              batchInvoiceItemId: item.id,
              type: 'ADMINISTRATIVE',
              reason: itemInput.rejectionReason ?? 'Montant non conforme aux règles de prise en charge',
              amount: rejected,
            },
          });
        }
      }

      await tx.batchInvoice.update({
        where: { id: input.batchInvoiceId },
        data: {
          status: 'VALIDATED',
          validatedAt: new Date(),
          totalApproved,
          totalRejected,
        },
      });
    });

    // Notification prestataire
    const staffUsers = await this.prisma.user.findMany({
      where: { providerId: invoice.providerId },
      select: { id: true },
    });
    for (const u of staffUsers) {
      await this.dispatch.dispatchToUser(u.id, {
        topic: 'BATCH_INVOICE_VALIDATED',
        title: `Facture groupée ${invoice.number} validée`,
        body: `Approuvé : ${(totalApproved / 100).toLocaleString()} FCFA. Rejeté : ${(totalRejected / 100).toLocaleString()} FCFA.`,
        meta: { batchInvoiceId: invoice.id, totalApproved, totalRejected },
      }).catch(() => {});
    }

    return this.prisma.batchInvoice.findUnique({ where: { id: input.batchInvoiceId }, include: { items: true } });
  }

  /**
   * Marque comme payée (réconciliation paiement).
   */
  async payBatchInvoice(batchInvoiceId: string, paymentRef: string) {
    const invoice = await this.prisma.batchInvoice.findUnique({ where: { id: batchInvoiceId } });
    if (!invoice) throw new NotFoundException('Facture groupée introuvable');
    if (invoice.status !== 'VALIDATED') throw new BadRequestException(`Facture ${invoice.status} — paiement impossible`);

    return this.prisma.batchInvoice.update({
      where: { id: batchInvoiceId },
      data: { status: 'PAID', paidAt: new Date(), paymentRef },
    });
  }

  /**
   * Crée un rejet manuel (ex: prestataire conteste).
   */
  async createRejection(input: CreateRejectionInput, actorUserId: string) {
    const item = await this.prisma.batchInvoiceItem.findUnique({
      where: { id: input.batchInvoiceItemId },
      include: { batchInvoice: true },
    });
    if (!item) throw new NotFoundException('Ligne facture introuvable');
    if (item.batchInvoiceId !== input.batchInvoiceId) throw new BadRequestException('Ligne ne correspond pas à cette facture');

    const rejection = await this.prisma.rejection.create({
      data: {
        code: ref('REJ'),
        batchInvoiceId: input.batchInvoiceId,
        batchInvoiceItemId: input.batchInvoiceItemId,
        type: input.type,
        reason: input.reason,
        amount: input.amount,
      },
    });

    // Mettre à jour la ligne
    await this.prisma.batchInvoiceItem.update({
      where: { id: input.batchInvoiceItemId },
      data: {
        amountRejected: { increment: input.amount },
        amountApproved: { decrement: input.amount },
        status: 'REJECTED',
        rejectionReason: input.reason,
      },
    });

    // Mettre à jour la facture
    await this.prisma.batchInvoice.update({
      where: { id: input.batchInvoiceId },
      data: {
        totalApproved: { decrement: input.amount },
        totalRejected: { increment: input.amount },
        status: 'PARTIAL',
      },
    });

    return rejection;
  }

  /**
   * Conteste un rejet (prestataire).
   */
  async disputeRejection(input: DisputeRejectionInput) {
    return this.prisma.rejection.update({
      where: { id: input.rejectionId },
      data: { status: 'DISPUTED', disputedAt: new Date(), resolutionNote: input.resolutionNote },
    });
  }

  /**
   * Résout un rejet (admin).
   */
  async resolveRejection(rejectionId: string, resolutionNote: string) {
    const rejection = await this.prisma.rejection.findUnique({
      where: { id: rejectionId },
      include: { batchInvoiceItem: true },
    });
    if (!rejection) throw new NotFoundException('Rejet introuvable');

    await this.prisma.$transaction(async tx => {
      await tx.rejection.update({
        where: { id: rejectionId },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote },
      });

      // Si résolution = réapprobation, rétablir le montant
      if (resolutionNote.toLowerCase().includes('approuv')) {
        await tx.batchInvoiceItem.update({
          where: { id: rejection.batchInvoiceItemId },
          data: {
            amountApproved: { increment: rejection.amount },
            amountRejected: { decrement: rejection.amount },
            status: 'APPROVED',
            rejectionReason: null,
          },
        });
        await tx.batchInvoice.update({
          where: { id: rejection.batchInvoiceId },
          data: {
            totalApproved: { increment: rejection.amount },
            totalRejected: { decrement: rejection.amount },
          },
        });
      }
    });

    return this.prisma.rejection.findUnique({ where: { id: rejectionId } });
  }

  /**
   * Crée un avoir (credit note).
   */
  async createCreditNote(input: CreateCreditNoteInput) {
    const provider = await this.prisma.provider.findUnique({ where: { id: input.providerId } });
    if (!provider) throw new NotFoundException('Prestataire introuvable');

    return this.prisma.creditNote.create({
      data: {
        number: ref('AVR'),
        providerId: input.providerId,
        batchInvoiceId: input.batchInvoiceId,
        type: input.type,
        reason: input.reason,
        amount: input.amount,
      },
    });
  }

  /**
   * Applique un avoir (dédution sur prochain paiement).
   */
  async applyCreditNote(creditNoteId: string) {
    const cn = await this.prisma.creditNote.findUnique({ where: { id: creditNoteId } });
    if (!cn) throw new NotFoundException('Avoir introuvable');
    if (cn.status !== 'ISSUED') throw new BadRequestException(`Avoir ${cn.status} — application impossible`);

    return this.prisma.creditNote.update({
      where: { id: creditNoteId },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });
  }

  /**
   * Réconciliation paiement prestataire.
   */
  async reconcile(input: ReconcileInput) {
    const provider = await this.prisma.provider.findUnique({ where: { id: input.providerId } });
    if (!provider) throw new NotFoundException('Prestataire introuvable');

    const difference = input.paidAmount - input.expectedAmount;
    const status = difference === 0 ? 'MATCHED' : 'DISCREPANCY';

    return this.prisma.reconciliation.create({
      data: {
        providerId: input.providerId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status,
        expectedAmount: input.expectedAmount,
        paidAmount: input.paidAmount,
        difference,
      },
    });
  }

  private async providerIdForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { providerId: true },
    });
    if (!user?.providerId) {
      throw new ForbiddenException('Aucun établissement rattaché à ce compte');
    }
    return user.providerId;
  }

  /**
   * Factures groupées du prestataire connecté. Le providerId est toujours dérivé
   * du compte authentifié : un prestataire ne peut ni lister ni créer pour un autre.
   */
  async providerBatchInvoices(userId: string, status?: string) {
    return this.listBatchInvoices(await this.providerIdForUser(userId), status);
  }

  async providerBatchInvoice(userId: string, batchInvoiceId: string) {
    const providerId = await this.providerIdForUser(userId);
    const invoice = await this.getBatchInvoice(batchInvoiceId);
    if (!invoice || invoice.providerId !== providerId) {
      throw new NotFoundException('Facture groupée introuvable');
    }
    return invoice;
  }

  async createProviderBatchInvoice(
    userId: string,
    input: { periodStart: Date; periodEnd: Date },
  ) {
    return this.createBatchInvoice({
      ...(input as { periodStart: Date; periodEnd: Date; claimIds?: string[] }),
      providerId: await this.providerIdForUser(userId),
      claimIds: [],
    });
  }

  async submitProviderBatchInvoice(userId: string, batchInvoiceId: string) {
    const providerId = await this.providerIdForUser(userId);
    const invoice = await this.prisma.batchInvoice.findUnique({ where: { id: batchInvoiceId } });
    if (!invoice || invoice.providerId !== providerId) {
      throw new NotFoundException('Facture groupée introuvable');
    }
    return this.submitBatchInvoice({ batchInvoiceId });
  }

  async providerRejections(userId: string, batchInvoiceId?: string, status?: string) {
    const providerId = await this.providerIdForUser(userId);
    const invoices = await this.prisma.batchInvoice.findMany({
      where: { providerId, ...(batchInvoiceId ? { id: batchInvoiceId } : {}) },
      select: { id: true },
    });
    const invoiceIds = new Set(invoices.map(invoice => invoice.id));
    const rejections = await this.listRejections(batchInvoiceId, status);
    return rejections.filter(rejection => invoiceIds.has(rejection.batchInvoiceId));
  }

  private async providerRejection(userId: string, rejectionId: string) {
    const providerId = await this.providerIdForUser(userId);
    const rejection = await this.prisma.rejection.findUnique({
      where: { id: rejectionId },
      include: { batchInvoice: { select: { providerId: true } } },
    });
    if (!rejection || rejection.batchInvoice.providerId !== providerId) {
      throw new NotFoundException('Rejet introuvable');
    }
    return rejection;
  }

  async acknowledgeProviderRejection(userId: string, rejectionId: string) {
    const rejection = await this.providerRejection(userId, rejectionId);
    if (rejection.status !== 'OPEN') {
      throw new BadRequestException(`Rejet ${rejection.status} — accusé impossible`);
    }
    return this.prisma.rejection.update({
      where: { id: rejectionId },
      data: { status: 'ACKNOWLEDGED' },
    });
  }

  async disputeProviderRejection(userId: string, rejectionId: string, resolutionNote: string) {
    const rejection = await this.providerRejection(userId, rejectionId);
    if (!['OPEN', 'ACKNOWLEDGED'].includes(rejection.status)) {
      throw new BadRequestException(`Rejet ${rejection.status} — contestation impossible`);
    }
    return this.prisma.rejection.update({
      where: { id: rejectionId },
      data: { status: 'DISPUTED', disputedAt: new Date(), resolutionNote },
    });
  }

  /**
   * Liste factures groupées prestataire.
   */
  async listBatchInvoices(providerId: string, status?: string) {
    return this.prisma.batchInvoice.findMany({
      where: { providerId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { claim: { select: { reference: true, contract: { select: { number: true } } } } } } },
    });
  }

  /**
   * Détail facture groupée.
   */
  async getBatchInvoice(id: string) {
    return this.prisma.batchInvoice.findUnique({
      where: { id },
      include: {
        provider: true,
        items: { include: { claim: { select: { reference: true, contract: { select: { number: true } } } } } },
        rejections: { include: { batchInvoiceItem: true } },
        creditNotes: true,
      },
    });
  }

  /**
   * Liste rejets.
   */
  async listRejections(batchInvoiceId?: string, status?: string) {
    return this.prisma.rejection.findMany({
      where: { ...(batchInvoiceId ? { batchInvoiceId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { batchInvoiceItem: { include: { claim: { select: { reference: true } } } } },
    });
  }

  /**
   * Liste avoirs.
   */
  async listCreditNotes(providerId: string, status?: string) {
    return this.prisma.creditNote.findMany({
      where: { providerId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Liste réconciliations.
   */
  async listReconciliations(providerId: string, status?: string) {
    return this.prisma.reconciliation.findMany({
      where: { providerId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}