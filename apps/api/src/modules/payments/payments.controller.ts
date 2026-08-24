import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser, Public } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { ref } from '../../common/utils';
import { config } from '../../config';
import { getProvider, getProviders } from './providers';
import { extractCinetpayReference, extractFedapayTransactionId } from '../../domain/payment-mapping';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';

const initiateSchema = z.object({
  contractId: z.string().min(5),
  method: z.string().min(2).max(30),
  customerPhone: z.string().optional(),
});

const mockConfirmSchema = z.object({
  paymentId: z.string().min(5),
  outcome: z.enum(['SUCCESS', 'FAILED']),
});

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
  ) {}

  methods() {
    return getProviders(config.payProviders);
  }

  async initiate(auth: AuthUser, dto: any) {
    const contract = await this.prisma.contract.findUnique({ where: { id: dto.contractId } });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    this.assertCanPay(auth, contract);
    const provider = getProvider(dto.method);
    if (!provider || !config.payProviders.includes(provider.code))
      throw new BadRequestException('Moyen de paiement indisponible');

    const contribution = await this.prisma.contribution.findFirst({
      where: { contractId: contract.id, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { sequence: 'asc' },
    });
    if (!contribution) throw new BadRequestException('Aucune cotisation en attente sur ce contrat');

    const payment = await this.prisma.payment.create({
      data: {
        reference: ref('PAY'),
        contractId: contract.id,
        userId: auth.id,
        amount: contribution.amount,
        method: provider.code,
        status: 'PENDING',
        meta: JSON.stringify({ contributionId: contribution.id }),
      },
    });
    const initiation = await provider.initiate({ reference: payment.reference, amount: payment.amount, method: provider.code, customerPhone: dto.customerPhone });
    const providerTxId = initiation.instructions?.providerTransactionId ?? null;
    if (providerTxId || initiation.instructions?.providerToken) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          ...(providerTxId ? { externalRef: String(providerTxId) } : {}),
          meta: JSON.stringify({
            contributionId: contribution.id,
            ...(providerTxId ? { providerTransactionId: String(providerTxId) } : {}),
            ...(initiation.instructions?.providerToken ? { providerToken: String(initiation.instructions.providerToken) } : {}),
          }),
        },
      });
    }
    return { payment: { id: payment.id, reference: payment.reference, amount: payment.amount }, initiation };
  }

  async confirmFromProvider(input: { provider: string; providerTxId?: string; ourReference?: string }) {
    let payment = null;
    if (input.providerTxId) {
      payment = await this.prisma.payment.findFirst({ where: { method: input.provider, externalRef: input.providerTxId } });
    }
    if (!payment && input.ourReference) {
      payment = await this.prisma.payment.findFirst({ where: { method: input.provider, reference: input.ourReference } });
    }
    if (!payment) return { ok: false, status: 'PAYMENT_NOT_FOUND' };
    if (payment.status !== 'PENDING') return { ok: true, status: payment.status };

    const provider = getProvider(input.provider);
    if (!provider) throw new BadRequestException('Fournisseur inconnu');
    const outcome = await provider.checkStatus({
      reference: payment.reference,
      amount: payment.amount,
      externalRef: payment.externalRef,
    });
    if (outcome === 'PENDING') return { ok: true, status: 'PENDING' };
    return this.confirmPayment(payment.id, outcome, payment.externalRef ?? undefined);
  }

  async confirmPayment(paymentId: string, outcome: 'SUCCESS' | 'FAILED', externalRef?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (payment.status !== 'PENDING') throw new BadRequestException('Paiement déjà traité');

    if (outcome === 'FAILED') {
      await this.prisma.payment.update({ where: { id: paymentId }, data: { status: 'FAILED', completedAt: new Date(), externalRef } });
      return { ok: true, status: 'FAILED' };
    }

    const meta = JSON.parse(payment.meta || '{}');
    const succeeded = await this.prisma.$transaction(async tx => {
      const p = await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'SUCCEEDED', completedAt: new Date(), externalRef },
      });
      if (meta.contributionId) {
        await tx.contribution.update({
          where: { id: meta.contributionId },
          data: { status: 'PAID', paidAt: new Date(), paymentId },
        });
      }
      return p;
    });

    const contract = await this.prisma.contract.findUnique({
      where: { id: succeeded.contractId! },
      include: { product: { select: { name: true } } },
    });
    if (contract) {
      const wasInactive = ['PENDING_PAYMENT', 'DRAFT'].includes(contract.status);
      const wasSuspended = contract.status === 'SUSPENDED';
      if (wasInactive) {
        await this.activateContract(contract.id);
        await this.notify(contract.principalUserId, 'CONTRACT_ACTIVATED',
          `Votre contrat ${contract.number} est actif`,
          `Bienvenue ! Votre couverture santé ${contract.product.name} est désormais active. Votre carte d'assuré numérique est disponible.`);
      } else if (wasSuspended) {
        await this.prisma.contract.update({ where: { id: contract.id }, data: { status: 'ACTIVE' } });
        await this.notify(contract.principalUserId, 'CONTRACT_REACTIVATED',
          `Contrat ${contract.number} réactivé`,
          'Votre cotisation a été reçue. Votre contrat est de nouveau actif.');
      }
      await this.notify(contract.principalUserId, 'PAYMENT_CONFIRMED',
        `Paiement reçu : ${payment.amount} FCFA`,
        `Référence ${payment.reference}. Merci pour votre paiement.`);
    }
    return { ok: true, status: succeeded.status };
  }

  private async activateContract(contractId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);
    await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: 'ACTIVE', startDate: today, endDate: end },
    });
  }

  private notify(userId: string, topic: string, title: string, body: string) {
    return this.dispatch.dispatchToUser(userId, { topic, title, body });
  }

  private assertCanPay(auth: AuthUser, contract: any) {
    if (auth.role === 'SUPER_ADMIN') return;
    if (contract.principalUserId === auth.id) return;
    if (auth.role === 'COMPANY_ADMIN' && contract.companyId && auth.companyId === contract.companyId) return;
    throw new ForbiddenException('Action non autorisée sur ce contrat');
  }

  async findPayment(id: string) {
    return this.prisma.payment.findUnique({ where: { id } });
  }
}

@Controller()
@UseInterceptors(AuditInterceptor)
export class PaymentsController {
  constructor(
    private payments: PaymentsService,
    private prisma: PrismaService,
  ) {}

  @Get('payments/methods')
  methods() {
    return this.payments.methods();
  }

  @Post('payments/initiate')
  initiate(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(initiateSchema)) dto: any) {
    return this.payments.initiate(auth, dto);
  }

  @Post('payments/mock/confirm')
  async mockConfirm(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(mockConfirmSchema)) dto: any) {
    if (!config.mockPayments) throw new ForbiddenException('Simulation de paiement désactivée');
    const payment = await this.payments.findPayment(dto.paymentId);
    if (!payment) throw new NotFoundException('Paiement introuvable');
    const allowed =
      auth.role === 'SUPER_ADMIN' || auth.role === 'INSURANCE_MANAGER' || payment.userId === auth.id;
    if (!allowed) throw new ForbiddenException();
    return this.payments.confirmPayment(dto.paymentId, dto.outcome);
  }

  @Public()
  @Post('payments/webhook/fedapay')
  async webhookFedapay(@Body() body: any) {
    const providerTxId = extractFedapayTransactionId(body);
    if (!providerTxId) throw new BadRequestException('Webhook FedaPay invalide');
    try {
      return await this.payments.confirmFromProvider({ provider: 'FEDAPAY', providerTxId });
    } catch (e: any) {
      console.error('[webhook fedapay]', e?.message ?? e);
      return { ok: false, status: 'VERIFY_ERROR' };
    }
  }

  @Public()
  @Post('payments/webhook/cinetpay')
  async webhookCinetpay(@Body() body: any) {
    const ourReference = extractCinetpayReference(body);
    if (!ourReference) throw new BadRequestException('Webhook CinetPay invalide');
    try {
      return await this.payments.confirmFromProvider({ provider: 'CINETPAY', ourReference });
    } catch (e: any) {
      console.error('[webhook cinetpay]', e?.message ?? e);
      return { ok: false, status: 'VERIFY_ERROR' };
    }
  }

  @Get('payments/mine')
  mine(@CurrentUser() auth: AuthUser) {
    return this.prisma.payment.findMany({
      where: { userId: auth.id },
      orderBy: { initiatedAt: 'desc' },
      include: { contract: { select: { number: true } } },
      take: 50,
    });
  }

  @Get('admin/payments')
  @RequirePermissions('payments.viewAll')
  async adminList(@Query('status') status?: string, @Query('page') page = '1') {
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { initiatedAt: 'desc' },
        skip: (Number(page) - 1) * 20,
        take: 20,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          contract: { select: { number: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items, total, page: Number(page), pages: Math.ceil(total / 20) };
  }
}

@Module({ controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
