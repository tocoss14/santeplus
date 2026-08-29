import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { ref } from '../../common/utils';
import { sha256 } from '../../common/crypto';
import { estimateClaim, CoverageRule, EstimationResult, CLAIM_STATUSES_CONSUMING_CAPS } from '../../domain/engine';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { StorageService, FilesModule } from '../files/files.service';

const CAPS_CONSUMING: string[] = [...CLAIM_STATUSES_CONSUMING_CAPS];

@Injectable()
export class ClaimsService {
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
  ) {}

  async buildEstimation(contract: any, careDate: Date, items: { categoryId: string; label?: string; amountRequested: number }[]): Promise<EstimationResult> {
    const rules: CoverageRule[] = contract.product.guarantees.map((pg: any) => ({
      categoryId: pg.guarantee.category,
      categoryName: pg.guarantee.name,
      annualLimit: pg.annualLimit,
      rate: pg.rate,
      deductibleType: pg.deductibleType,
      deductibleValue: pg.deductibleValue,
    }));
    const excludedCategories = contract.product.exclusions.filter((e: any) => e.categoryId).map((e: any) => e.categoryId);
    const yearStart = contract.startDate ? new Date(contract.startDate) : null;
    const priorItems = await this.prisma.claimItem.findMany({
      where: {
        claim: {
          contractId: contract.id,
          status: { in: CAPS_CONSUMING },
          ...(yearStart ? { careDate: { gte: yearStart } } : {}),
        },
        amountEligible: { not: null },
      },
      select: { categoryLabel: true, amountEligible: true },
    });
    const usedPerCategory: Record<string, number> = {};
    for (const pi of priorItems) usedPerCategory[pi.categoryLabel] = (usedPerCategory[pi.categoryLabel] ?? 0) + (pi.amountEligible ?? 0);

    const duplicateSuspect = await this.detectDuplicate(contract.claimantUserId ?? contract.principalUserId, contract.id, careDate, items);
    return estimateClaim(
      {
        contractStatus: contract.status,
        startDate: contract.startDate ? new Date(contract.startDate) : new Date(0),
        endDate: contract.endDate ? new Date(contract.endDate) : new Date(9999, 0, 1),
        waitingPeriodDays: contract.product.waitingPeriodDays,
        excludedCategories,
        rules,
        usedPerCategory,
      },
      careDate,
      items,
      duplicateSuspect,
    );
  }

  private async detectDuplicate(userId: string, contractId: string, careDate: Date, items: any[]) {
    const totalRequested = items.reduce((a: number, i: any) => a + i.amountRequested, 0);
    const similar = await this.prisma.claim.findFirst({
      where: {
        claimantUserId: userId,
        contractId,
        careDate,
        totalRequested,
        status: { notIn: ['REJECTED', 'DRAFT'] },
      },
    });
    return Boolean(similar);
  }

  async notifyManagers(topic: string, title: string, body: string) {
    const managers = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    await this.dispatch.dispatchToMany(managers.map(m => m.id), { topic, title, body });
  }
}

const itemSchema = z.object({
  categoryId: z.string().min(2),
  label: z.string().max(120).optional(),
  amountRequested: z.number().int().min(1),
});

const createClaimSchema = z.object({
  contractId: z.string(),
  beneficiaryId: z.string().optional(),
  providerId: z.string().optional(),
  careDate: z.coerce.date(),
  items: z.array(itemSchema).min(1),
});

const approveSchema = z.object({
  note: z.string().max(1000).optional(),
  overrides: z.array(z.object({ itemId: z.string(), amountApproved: z.number().int().min(0), amountEligible: z.number().int().min(0).optional() })).optional(),
});

@Controller()
@UseInterceptors(AuditInterceptor)
export class ClaimsController {
  constructor(
    private claims: ClaimsService,
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
    private storage: StorageService,
  ) {}

  @Get('claims/categories')
  async categories() {
    const cats = await this.prisma.guarantee.findMany({ where: { active: true }, select: { category: true, name: true, code: true }, distinct: ['category'], orderBy: { name: 'asc' } });
    return cats;
  }

  @Post('claims')
  @UseInterceptors(FilesInterceptor('documents', 8))
  async create(
    @CurrentUser() auth: AuthUser,
    @Body('payload') payloadRaw: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    let dto: any;
    try {
      dto = createClaimSchema.parse(JSON.parse(payloadRaw ?? '{}'));
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        throw new BadRequestException({ statusCode: 400, message: 'Données invalides', errors: e.flatten() });
      }
      throw new BadRequestException('Payload invalide');
    }
    const contract = await this.accessibleContract(auth, dto.contractId);
    if (dto.beneficiaryId) {
      const b = await this.prisma.beneficiary.findFirst({ where: { id: dto.beneficiaryId, contractId: contract.id, status: 'COVERED' } });
      if (!b) throw new BadRequestException('Ayant droit non couvert');
    }
    const estimation = await this.claims.buildEstimation(contract, dto.careDate, dto.items);
    const totalRequested = dto.items.reduce((a: number, i: any) => a + i.amountRequested, 0);

    const docTypes: string[] = Array.isArray(dto.docTypes) && dto.docTypes.length
      ? dto.docTypes
      : (files ?? []).map((_, i) => (i === 0 ? 'INVOICE' : 'OTHER'));

    const stored: { storagePath: string; mime: string; size: number; sha256: string; docType: string; fileName: string }[] = [];
    for (let i = 0; i < (files ?? []).length; i++) {
      const f = files![i];
      const saved = await this.storage.save(auth.id, f);
      stored.push({ ...saved, docType: docTypes[i] ?? 'OTHER', fileName: f.originalname });
    }

    const flags = [...estimation.flags];
    if (stored.length) {
      const dupFiles = await this.prisma.claimDocument.findMany({
        where: { sha256: { in: stored.map(s => s.sha256) }, claim: { status: { notIn: ['REJECTED'] } } },
        select: { sha256: true, claim: { select: { reference: true } } },
        take: 1,
      });
      if (dupFiles.length && !flags.includes('DUPLICATE_SUSPECT')) flags.push('DUPLICATE_SUSPECT');
    }
    estimation.flags = flags;

    const claim = await this.prisma.$transaction(async tx => {
      const created = await tx.claim.create({
        data: {
          reference: ref('SIN'),
          contractId: contract.id,
          claimantUserId: auth.id,
          beneficiaryId: dto.beneficiaryId ?? null,
          providerId: dto.providerId ?? null,
          careDate: dto.careDate,
          status: 'DRAFT',
          totalRequested,
          estimation: JSON.stringify(estimation),
          flags: JSON.stringify(flags),
          items: { create: dto.items.map((i: any) => ({ categoryLabel: i.categoryId, amountRequested: i.amountRequested })) },
        },
        include: { items: true },
      });
      if (stored.length) {
        for (const sDoc of stored) {
          const fileObj = await tx.fileObject.create({
            data: { storagePath: sDoc.storagePath, mime: sDoc.mime, size: sDoc.size, sha256: sDoc.sha256, ownerId: auth.id },
          });
          await tx.claimDocument.create({
            data: {
              claimId: created.id,
              fileId: fileObj.id,
              docType: sDoc.docType,
              fileName: sDoc.fileName,
              mime: sDoc.mime,
              size: sDoc.size,
              sha256: sDoc.sha256,
            },
          });
        }
      }
      return created;
    });
    return this.sanitize(claim);
  }

  @Post('claims/:id/submit')
  async submit(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const claim = await this.ownClaim(auth, id);
    if (!['DRAFT', 'INFO_REQUESTED'].includes(claim.status)) throw new BadRequestException('Demande dÃ©jÃ  soumise');
    const docs = await this.prisma.claimDocument.count({ where: { claimId: claim.id, docType: 'INVOICE' } });
    if (!docs) throw new BadRequestException('Une facture est requise pour soumettre la demande');
    const contract = await this.loadContractForClaim(claim);
    const estimation = await this.claims.buildEstimation(contract, claim.careDate, claim.items.map(i => ({ categoryId: i.categoryLabel, amountRequested: i.amountRequested })));
    const updated = await this.prisma.claim.update({
      where: { id: claim.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        estimation: JSON.stringify(estimation),
        flags: JSON.stringify(estimation.flags),
      },
    });
    void updated;
    for (let i = 0; i < claim.items.length; i++) {
      const e = estimation.items[i];
      if (!e) continue;
      await this.prisma.claimItem.update({
        where: { id: claim.items[i].id },
        data: { amountEligible: e.amountEligible, rateApplied: e.rateApplied, deductibleApplied: e.deductibleApplied, amountApproved: e.amountApproved },
      });
    }
    await this.claims.notifyManagers('CLAIM_SUBMITTED',
      `Nouvelle demande de remboursement ${claim.reference}`,
      `Montant demandÃ© : ${claim.totalRequested} FCFA. Ã€ traiter dans l'espace gestion.`);
    await this.dispatch.dispatchToUser(auth.id, {
      topic: 'CLAIM_RECEIVED',
      title: `Demande ${claim.reference} reçue`,
      body: 'Votre demande a été reçue et est en cours de traitement.',
    });
    return { ok: true };
  }

  @Get('claims/mine')
  mine(@CurrentUser() auth: AuthUser) {
    return this.prisma.claim.findMany({
      where: { claimantUserId: auth.id },
      orderBy: { createdAt: 'desc' },
      include: {
        beneficiary: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
        _count: { select: { documents: true } },
      },
      take: 50,
    });
  }

  @Get('claims/:id')
  async detail(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const claim = await this.loadClaim(id);
    await this.assertView(auth, claim);
    const docs = await this.prisma.claimDocument.findMany({ where: { claimId: claim.id }, orderBy: { id: 'asc' } });
    return { ...this.sanitize(claim), documents: docs };
  }

  @Get('admin/claims')
  @RequirePermissions('claims.viewAll')
  adminList(@Query('status') status?: string, @Query('q') q?: string, @Query('page') page = '1', @Query('kind') kind?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (kind) where.kind = kind;
    if (q) where.OR = [{ reference: { contains: q } }, { claimantUser: { is: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }] } } }];
    const take = 20;
    return this.prisma.claim.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (Number(page) - 1) * take,
      take,
      include: {
        claimantUser: { select: { firstName: true, lastName: true, email: true, memberNumber: true } },
        beneficiary: { select: { firstName: true, lastName: true } },
        contract: { select: { number: true, product: { select: { name: true } } } },
        provider: { select: { name: true } },
      },
    }).then(async items => ({ items, total: await this.prisma.claim.count({ where }) }));
  }

  @Post('admin/claims/:id/authorize')
  @RequirePermissions('claims.decide')
  async authorizeThirdParty(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body(new ZodPipe(z.object({ note: z.string().max(500).optional() }))) dto: any) {
    const claim = await this.prisma.claim.findUnique({ where: { id }, include: { items: true } as any });
    if (!claim) throw new NotFoundException('Demande introuvable');
    if ((claim as any).kind !== 'THIRDPARTY') throw new BadRequestException('Réservé aux prises en charge tiers payant');
    if ((claim as any).status !== 'AUTH_REQUIRED') throw new BadRequestException(`Statut ${(claim as any).status} : autorisation non applicable`);
    const items: any[] = (claim as any).items ?? [];
    const sumApproved = items.reduce((a: number, it: any) => a + (it.amountApproved ?? 0), 0);
    const totalApprovedFromClaim = (claim as any).totalApproved;
    const authorizedAmount = sumApproved > 0 ? sumApproved : (typeof totalApprovedFromClaim === 'number' ? totalApprovedFromClaim : (claim as any).totalRequested ?? 0);
    await this.prisma.claim.update({
      where: { id },
      data: { status: 'AUTHORIZED', decisionNote: dto.note ?? null, decidedById: auth.id, decidedAt: new Date(), authorizedAmount } as any,
    });
    if (claim.providerUserId) {
      await this.dispatch.dispatchToUser(claim.providerUserId, {
        topic: 'THIRDPARTY_AUTHORIZED',
        title: `Autorisation accordée — ${claim.reference}`,
        body: 'Vous pouvez confirmer la prise en charge.',
      });
    }
    await this.notifyClaimant(claim.claimantUserId, claim.reference, 'Prise en charge autorisée', 'Le gestionnaire a autorisé votre prise en charge chez le prestataire.');
    return { ok: true };
  }

  @Post('admin/claims/:id/request-info')
  @RequirePermissions('claims.viewAll')
  async requestInfo(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body(new ZodPipe(z.object({ note: z.string().min(3).max(1000) }))) dto: any) {
    const claim = await this.decisionGuard(id, ['SUBMITTED', 'UNDER_REVIEW']);
    await this.prisma.claim.update({ where: { id }, data: { status: 'INFO_REQUESTED', decisionNote: dto.note } });
    await this.notifyClaimant(claim.claimantUserId, claim.reference, `Documents complÃ©mentaires requis`, dto.note);
    return { ok: true };
  }

  @Post('admin/claims/:id/under-review')
  @RequirePermissions('claims.viewAll')
  async underReview(@Param('id') id: string) {
    await this.decisionGuard(id, ['SUBMITTED', 'INFO_REQUESTED']);
    await this.prisma.claim.update({ where: { id }, data: { status: 'UNDER_REVIEW' } });
    return { ok: true };
  }

  @Post('admin/claims/:id/approve')
  @RequirePermissions('claims.decide')
  async approve(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body(new ZodPipe(approveSchema)) dto: any) {
    const claim = await this.decisionGuard(id, ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED']);
    let overridesMap = new Map<string, any>();
    if (dto.overrides) overridesMap = new Map(dto.overrides.map((o: any) => [o.itemId, o]));
    const full = await this.prisma.claim.findUnique({ where: { id }, include: { items: true } });
    let totalApproved = 0;
    let reduced = false;
    for (const item of full!.items) {
      const o = overridesMap.get(item.id);
      const approved = o ? o.amountApproved : (item.amountApproved ?? 0);
      if (o?.amountEligible != null) {
        await this.prisma.claimItem.update({ where: { id: item.id }, data: { amountEligible: o.amountEligible, amountApproved: approved } });
      } else if (o) {
        await this.prisma.claimItem.update({ where: { id: item.id }, data: { amountApproved: approved } });
      }
      if (approved < item.amountRequested) reduced = true;
      totalApproved += approved;
    }
    await this.prisma.claim.update({
      where: { id },
      data: { status: reduced ? 'PARTIALLY_APPROVED' : 'APPROVED', totalApproved, decisionNote: dto.note, decidedById: auth.id, decidedAt: new Date() },
    });
    await this.notifyClaimant(claim.claimantUserId, claim.reference,
      reduced ? 'Demande partiellement approuvÃ©e' : 'Demande approuvÃ©e',
      `Montant approuvÃ© : ${totalApproved} FCFA. ${dto.note ?? ''}`);
    return { ok: true, totalApproved };
  }

  @Post('admin/claims/:id/reject')
  @RequirePermissions('claims.decide')
  async reject(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body(new ZodPipe(z.object({ reason: z.string().min(3).max(1000) }))) dto: any) {
    const claim = await this.decisionGuard(id, ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED']);
    await this.prisma.claim.update({ where: { id }, data: { status: 'REJECTED', decisionNote: dto.reason, decidedById: auth.id, decidedAt: new Date(), totalApproved: 0 } });
    await this.notifyClaimant(claim.claimantUserId, claim.reference, 'Demande refusÃ©e', dto.reason);
    return { ok: true };
  }

  @Post('admin/claims/:id/mark-paid')
  @RequirePermissions('payments.manage')
  async markPaid(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body(new ZodPipe(z.object({ paidRef: z.string().min(2).max(60).optional() }))) dto: any) {
    const claim = await this.decisionGuard(id, ['APPROVED', 'PARTIALLY_APPROVED']);
    await this.prisma.claim.update({ where: { id }, data: { status: 'PAID', paidAt: new Date(), paidRef: dto.paidRef ?? null, decidedById: claim.decidedById ?? auth.id, decidedAt: claim.decidedAt ?? new Date() } });
    await this.notifyClaimant(claim.claimantUserId, claim.reference, 'Remboursement payÃ©', `Le paiement de ${claim.totalApproved} FCFA a Ã©tÃ© effectuÃ©.`);
    return { ok: true };
  }

  private async accessibleContract(auth: AuthUser, contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    const isStaff = ['SUPER_ADMIN', 'INSURANCE_MANAGER'].includes(auth.role);
    const ownerOrCompany =
      contract.principalUserId === auth.id ||
      (auth.role === 'COMPANY_ADMIN' && auth.companyId && contract.companyId === auth.companyId);
    if (!isStaff && !ownerOrCompany) throw new ForbiddenException();
    if (contract.status !== 'ACTIVE') throw new BadRequestException("Le contrat doit Ãªtre actif pour dÃ©clarer une dÃ©pense");
    return contract;
  }

  private async ownClaim(auth: AuthUser, id: string) {
    const claim = await this.prisma.claim.findUnique({ where: { id }, include: { items: true } });
    if (!claim || claim.claimantUserId !== auth.id) throw new NotFoundException('Demande introuvable');
    return claim;
  }

  private async loadClaim(id: string) {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: {
        items: true,
        beneficiary: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
        contract: {
          select: {
            id: true,
            number: true,
            principalUserId: true,
            companyId: true,
            product: { select: { name: true } },
          },
        },
        claimantUser: { select: { firstName: true, lastName: true, memberNumber: true, email: true } },
        decidedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!claim) throw new NotFoundException('Demande introuvable');
    return claim;
  }

  private async assertView(auth: AuthUser, claim: any) {
    const isStaff = ['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT'].includes(auth.role);
    const ownerOrCompany =
      claim.claimantUserId === auth.id ||
      claim.contract.principalUserId === auth.id ||
      (auth.role === 'COMPANY_ADMIN' && auth.companyId && claim.contract.companyId === auth.companyId);
    if (!isStaff && !ownerOrCompany) throw new ForbiddenException();
  }

  private async loadContractForClaim(claim: any) {
    return this.prisma.contract.findUnique({
      where: { id: claim.contractId },
      include: { product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true } } },
    });
  }

  private async decisionGuard(id: string, from: string[]) {
    const claim = await this.prisma.claim.findUnique({ where: { id } });
    if (!claim) throw new NotFoundException('Demande introuvable');
    if (!from.includes(claim.status))
      throw new BadRequestException(`Action impossible depuis le statut ${claim.status}`);
    return claim;
  }

  private notifyClaimant(userId: string, reference: string, title: string, body: string) {
    return this.dispatch.dispatchToUser(userId, {
      topic: 'CLAIM_STATUS',
      title: `${reference} — ${title}`,
      body,
    });
  }

  private sanitize(claim: any) {
    return claim;
  }
}

@Module({
  controllers: [ClaimsController],
  providers: [ClaimsService],
  imports: [FilesModule],
  exports: [ClaimsService],
})
export class ClaimsModule {}
