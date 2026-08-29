import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { AuditInterceptor } from '../../common/audit.interceptor';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { CLAIM_STATUSES_CONSUMING_CAPS, needsPriorAuthorization, resolveThreshold } from '../../domain/engine';
import { ClaimsModule, ClaimsService } from '../claims/claims.controller';
import { FilesModule } from '../files/files.service';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { StorageService } from '../files/files.service';
import { ref } from '../../common/utils';

const CAPS_CONSUMING: string[] = [...CLAIM_STATUSES_CONSUMING_CAPS];
const TP_TTL_MS = 30 * 60 * 1000;

const itemSchemaV2 = z.object({
  actId: z.string().optional(),
  code: z.string().max(40).optional(),
  label: z.string().max(160).optional(),
  categoryId: z.string().min(2),
  quantity: z.number().int().min(1).max(100).default(1),
  unitPrice: z.number().int().min(1),
  practitioner: z.string().max(120).optional(),
});

const initiateSchemaV2 = z.object({
  cardToken: z.string().min(10).max(64).optional(),
  memberNumber: z.string().min(4).max(30).optional(),
  contractNumber: z.string().min(4).max(40).optional(),
  beneficiaryMemberNumber: z.string().max(30).optional(),
  providerId: z.string().optional(),
  items: z.array(itemSchemaV2).min(1).max(30),
  note: z.string().max(1000).optional(),
});

const realizeSchema = z.object({
  note: z.string().max(1000).optional(),
  items: z.array(z.object({
    id: z.string(),
    quantity: z.number().int().min(1).max(100).optional(),
    unitPrice: z.number().int().min(1).optional(),
  })).optional(),
});

@Injectable()
export class ProviderPortalService {
  constructor(private prisma: PrismaService) {}

  async requireEstablishment(auth: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id }, include: { providerStaff: true } });
    if (!user?.providerId || !user.providerStaff) throw new ForbiddenException('Aucun établissement rattaché à ce compte');
    if (user.providerStaff.status === 'PENDING_APPROVAL') {
      throw new ForbiddenException('Établissement en attente de validation par l\'administrateur. Les opérations tiers payant sont temporairement indisponibles.');
    }
    if (user.providerStaff.status === 'SUSPENDED') {
      throw new ForbiddenException('Établissement suspendu. Contactez l\'administrateur.');
    }
    return { user, establishment: user.providerStaff };
  }

  async requireEstablishmentAdmin(auth: AuthUser) {
    const { user, establishment } = await this.requireEstablishment(auth);
    // SUPER_ADMIN et INSURANCE_MANAGER ont les droits admin sur tous les établissements
    const isGlobalAdmin = ['SUPER_ADMIN', 'INSURANCE_MANAGER'].includes(auth.role);
    if (!isGlobalAdmin && !user.isEstablishmentAdmin) {
      throw new ForbiddenException('Droits d\'administration d\'établissement requis pour cette opération');
    }
    return { user, establishment };
  }

  async resolveContract(input: { cardToken?: string; memberNumber?: string; contractNumber?: string }) {
    let contract = null;
    if (input.cardToken) {
      contract = await this.prisma.contract.findUnique({
        where: { cardToken: input.cardToken },
        include: this.contractInclude(),
      });
    }
    if (!contract && input.contractNumber) {
      contract = await this.prisma.contract.findFirst({
        where: { number: input.contractNumber.trim().toUpperCase() },
        include: this.contractInclude(),
      });
    }
    if (!contract && input.memberNumber) {
      const mn = input.memberNumber.trim().toUpperCase();
      const user = await this.prisma.user.findFirst({ where: { memberNumber: mn } });
      if (user) {
        contract = await this.prisma.contract.findFirst({
          where: { principalUserId: user.id, status: { in: ['ACTIVE', 'SUSPENDED'] } },
          include: this.contractInclude(),
          orderBy: { createdAt: 'desc' },
        });
      }
      if (!contract) {
        const ben = await this.prisma.beneficiary.findFirst({ where: { memberNumber: mn, status: 'COVERED' } });
        if (ben) {
          contract = await this.prisma.contract.findUnique({ where: { id: ben.contractId }, include: this.contractInclude() });
          (contract as any).__matchedBeneficiaryId = ben.id;
        }
      }
    }
    if (!contract) throw new NotFoundException('Assuré introuvable — vérifiez le QR, le n° assuré ou le n° contrat');
    return contract;
  }

  contractInclude() {
    return {
      principalUser: { select: { id: true, firstName: true, lastName: true, memberNumber: true, birthDate: true } },
      product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true, insurerPartner: { select: { name: true, kind: true } } } },
      beneficiaries: { where: { status: 'COVERED' }, select: { id: true, firstName: true, lastName: true, memberNumber: true, relation: true, birthDate: true } },
      company: { select: { name: true } },
      _count: { select: { claims: true } },
    };
  }

  async getSystemConfig(key: string, fallback: string): Promise<string> {
    try {
      const row = await this.prisma.systemConfig.findUnique({ where: { key } });
      return row?.value ?? fallback;
    } catch {
      return fallback;
    }
  }
}

@Controller('provider')
@UseInterceptors(AuditInterceptor)
export class ProviderPortalController {
  constructor(
    private prisma: PrismaService,
    private claims: ClaimsService,
    private storage: StorageService,
    private dispatch: NotificationDispatchService,
    private portal: ProviderPortalService,
  ) {}

  @Get('me')
  async me(@CurrentUser() auth: AuthUser) {
    const { user, establishment } = await this.portal.requireEstablishment(auth);
    return {
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, lastLoginAt: user.lastLoginAt },
      establishment: {
        id: establishment.id,
        name: establishment.name,
        type: establishment.type,
        city: establishment.city,
        address: establishment.address,
        phone: establishment.phone,
        email: establishment.email,
        openingHours: establishment.openingHours,
        specialties: establishment.specialties,
        services: establishment.services,
        conventionLevel: establishment.conventionLevel,
        thirdPartyPayer: establishment.thirdPartyPayer,
        partnerStatus: establishment.partnerStatus,
      },
    };
  }

  @Patch('me/establishment')
  @RequirePermissions('provider.staff')
  async updateEstablishment(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(z.object({
    address: z.string().max(200).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().email().optional(),
    openingHours: z.string().max(200).optional(),
    specialties: z.string().max(300).optional(),
    services: z.string().max(500).optional(),
  }))) dto: any) {
    const { establishment } = await this.portal.requireEstablishmentAdmin(auth);
    await this.prisma.provider.update({ where: { id: establishment.id }, data: dto });
    return { ok: true };
  }

  @Get('acts')
  async acts(@Query('q') q?: string, @Query('category') category?: string) {
    const where: any = { active: true };
    if (category) where.categoryId = category;
    if (q) where.OR = [{ code: { contains: q } }, { name: { contains: q } }];
    return this.prisma.act.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 100 });
  }

  @Get('dashboard')
  async dashboard(@CurrentUser() auth: AuthUser) {
    const { establishment } = await this.portal.requireEstablishment(auth);
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);

    const base = { providerId: establishment.id, kind: 'THIRDPARTY' };
    const [todayAgg, monthRows, statusCounts, recent] = await Promise.all([
      this.prisma.claim.aggregate({
        where: { ...base, careDate: { gte: startToday } },
        _count: true, _sum: { totalRequested: true, totalApproved: true },
      }),
      this.prisma.claim.findMany({
        where: { ...base, createdAt: { gte: startMonth } },
        select: { status: true, totalRequested: true, totalApproved: true, invoiceNumber: true, paidAt: true },
      }),
      this.prisma.claim.groupBy({
        by: ['status'],
        where: base,
        _count: true,
      }),
      this.prisma.claim.findMany({
        where: base,
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: {
          claimantUser: { select: { firstName: true, lastName: true, memberNumber: true } },
          beneficiary: { select: { firstName: true, lastName: true, memberNumber: true } },
          items: { take: 1 },
        },
      }),
    ]);

    const sum = (rows: any[], pred: (r: any) => boolean, field: 'totalRequested' | 'totalApproved') =>
      rows.filter(pred).reduce((a, r) => a + (r[field] ?? 0), 0);
    const invoiced = monthRows.filter(r => r.invoiceNumber && !r.paidAt);
    const paid = monthRows.filter(r => r.paidAt);

    const statusMap: Record<string, number> = {};
    for (const sc of statusCounts) statusMap[sc.status] = sc._count;

    return {
      today: {
        patients: todayAgg._count,
        totalBilled: todayAgg._sum.totalRequested ?? 0,
        totalCovered: todayAgg._sum.totalApproved ?? 0,
      },
      month: {
        totalBilled: sum(monthRows, () => true, 'totalRequested'),
        totalCovered: sum(monthRows, () => true, 'totalApproved'),
        patientDue: sum(monthRows, () => true, 'totalRequested') - sum(monthRows, () => true, 'totalApproved'),
        pendingPayment: { count: invoiced.length, amount: invoiced.reduce((a, r) => a + (r.totalApproved ?? 0), 0) },
        received: { count: paid.length, amount: paid.reduce((a, r) => a + (r.totalApproved ?? 0), 0) },
      },
      statusCounts: statusMap,
      recent: recent.map(c => ({
        id: c.id,
        reference: c.reference,
        status: c.status,
        createdAt: c.createdAt,
        patient: c.beneficiary ? `${c.beneficiary.firstName} ${c.beneficiary.lastName}` : `${c.claimantUser.firstName} ${c.claimantUser.lastName}`,
        memberNumber: c.beneficiary?.memberNumber ?? c.claimantUser.memberNumber,
        actLabel: c.items[0]?.label ?? c.items[0]?.categoryLabel ?? '',
        totalRequested: c.totalRequested,
        totalApproved: c.totalApproved,
        invoiceNumber: c.invoiceNumber,
      })),
    };
  }

  @Get('thirdparty')
  async list(@CurrentUser() auth: AuthUser, @Query('status') status?: string, @Query('q') q?: string, @Query('page') page = '1') {
    const { establishment } = await this.portal.requireEstablishment(auth);
    const where: any = { providerId: establishment.id, kind: 'THIRDPARTY' };
    if (status) where.status = status;
    if (q) where.OR = [{ reference: { contains: q } }, { invoiceNumber: { contains: q } }, { claimantUser: { is: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { memberNumber: { contains: q } }] } } }];
    const take = 20;
    const [items, total] = await Promise.all([
      this.prisma.claim.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (Number(page) - 1) * take, take,
        include: {
          claimantUser: { select: { firstName: true, lastName: true, memberNumber: true } },
          beneficiary: { select: { firstName: true, lastName: true, memberNumber: true } },
          items: { take: 1 },
        },
      }),
      this.prisma.claim.count({ where }),
    ]);
    return {
      items: items.map(c => ({
        id: c.id, reference: c.reference, status: c.status, createdAt: c.createdAt, careDate: c.careDate,
        patient: c.beneficiary ? `${c.beneficiary.firstName} ${c.beneficiary.lastName}` : `${c.claimantUser.firstName} ${c.claimantUser.lastName}`,
        memberNumber: c.beneficiary?.memberNumber ?? c.claimantUser.memberNumber,
        actLabel: c.items[0]?.label ?? c.items[0]?.categoryLabel ?? '',
        totalRequested: c.totalRequested, totalApproved: c.totalApproved,
        invoiceNumber: c.invoiceNumber, paidAt: c.paidAt, paidRef: c.paidRef,
      })),
      total, page: Number(page), pages: Math.ceil(total / take),
    };
  }

  @Get('thirdparty/:id')
  async detail(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const { establishment } = await this.portal.requireEstablishment(auth);
    const claim = await this.prisma.claim.findFirst({
      where: { id, providerId: establishment.id, kind: 'THIRDPARTY' },
      include: {
        items: true,
        claimantUser: { select: { firstName: true, lastName: true, memberNumber: true } },
        beneficiary: true,
        provider: { select: { name: true } },
        contract: { select: { number: true, product: { select: { name: true } } } },
        decidedBy: { select: { firstName: true, lastName: true } },
        documents: { select: { id: true, fileName: true, docType: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!claim) throw new NotFoundException('Prise en charge introuvable');
    return claim;
  }

  @Post('verify')
  @RequirePermissions('provider.verify')
  async verify(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(z.object({
    cardToken: z.string().min(10).max(64).optional(),
    memberNumber: z.string().min(4).max(30).optional(),
    contractNumber: z.string().min(4).max(40).optional(),
  }).refine(v => Boolean(v.cardToken || v.memberNumber || v.contractNumber), 'Fournissez un QR, un n° assuré ou un n° contrat'))) dto: any) {
    const contract = await this.portal.resolveContract(dto);
    await this.logVerification(contract.id, auth.id);
    const warnings: string[] = [];
    if (contract.status !== 'ACTIVE') {
      warnings.push(contract.status === 'EXPIRED' ? 'Contrat expiré'
        : contract.status === 'SUSPENDED' ? 'Contrat suspendu'
        : contract.status === 'PENDING_PAYMENT' ? 'Contrat en attente de paiement'
        : `Contrat ${contract.status}`);
    }
    if (contract.endDate && new Date(contract.endDate) < new Date()) warnings.push('Validité dépassée');
    const yearStart = contract.startDate ? new Date(contract.startDate) : new Date(0);
    const used = await this.prisma.claimItem.groupBy({
      by: ['categoryLabel'],
      where: {
        amountEligible: { not: null },
        claim: { contractId: contract.id, careDate: { gte: yearStart }, status: { in: CAPS_CONSUMING } },
      },
      _sum: { amountEligible: true },
    });
    const usedMap = new Map(used.map(u => [u.categoryLabel, u._sum.amountEligible ?? 0]));
    return {
      contract: {
        number: contract.number,
        status: contract.status,
        productName: contract.product.name,
        insurer: contract.product.insurerPartner?.name ?? null,
        insurerKind: contract.product.insurerPartner?.kind ?? null,
        startDate: contract.startDate,
        endDate: contract.endDate,
        holder: `${contract.principalUser.firstName} ${contract.principalUser.lastName}`,
        memberNumber: contract.principalUser.memberNumber,
        birthDate: contract.principalUser.birthDate,
        companyName: contract.company?.name ?? null,
      },
      beneficiaries: contract.beneficiaries,
      claimsCount: contract._count.claims,
      caps: contract.product.guarantees.map((pg: any) => ({
        category: pg.guarantee.category,
        label: pg.guarantee.name,
        rate: pg.rate,
        annualLimit: pg.annualLimit,
        remaining: pg.annualLimit == null ? null : Math.max(0, pg.annualLimit - (usedMap.get(pg.guarantee.category) ?? 0)),
      })),
      warnings,
    };
  }

  @Post('thirdparty/initiate')
  @RequirePermissions('provider.thirdparty')
  @UseInterceptors(FilesInterceptor('documents', 8))
  async initiate(
    @CurrentUser() auth: AuthUser,
    @Body('payload') payloadRaw: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const { establishment } = await this.portal.requireEstablishment(auth);
    let dto: any;
    try {
      dto = initiateSchemaV2.parse(JSON.parse(payloadRaw ?? '{}'));
    } catch (e: any) {
      if (e instanceof z.ZodError) throw new BadRequestException({ statusCode: 400, message: e.issues[0]?.message ?? 'Données invalides', errors: e.flatten() });
      throw new BadRequestException('Payload invalide');
    }
    const contract = await this.portal.resolveContract(dto);
    if (contract.status !== 'ACTIVE') throw new BadRequestException(`Contrat ${contract.status} — prise en charge impossible`);

    let beneficiaryId: string | null = (contract as any).__matchedBeneficiaryId ?? null;
    if (dto.beneficiaryMemberNumber) {
      const ben = contract.beneficiaries.find((b: any) => b.memberNumber === dto.beneficiaryMemberNumber);
      if (!ben) throw new BadRequestException('Ayant droit non couvert');
      beneficiaryId = ben.id;
    }

    // Contrôle barème médical : vérifier les prix unitaires
    const feeWarnings: string[] = [];
    for (const i of dto.items) {
      if (i.actId) {
        const act = await this.prisma.act.findUnique({ where: { id: i.actId }, select: { referencePrice: true, name: true } });
        if (act && act.referencePrice > 0) {
          const maxAllowed = Math.round(act.referencePrice * 1.2);
          if (i.unitPrice > maxAllowed) {
            feeWarnings.push(`${act.name}: ${i.unitPrice} FCFA dépasse le barème (${act.referencePrice} FCFA, max ${maxAllowed} FCFA)`);
          }
        }
      }
    }
    if (feeWarnings.length > 0) {
      // Logger l'alerte mais ne pas bloquer (le engine ajustera le montant)
      try {
        await this.prisma.auditLog.create({
          data: {
            action: 'FEE_SCHEDULE_ALERT',
            entityType: 'provider',
            entityId: establishment.id,
            userId: auth.id,
            meta: JSON.stringify({ warnings: feeWarnings, items: dto.items.map((i: any) => ({ actId: i.actId, unitPrice: i.unitPrice })) }),
          },
        });
      } catch {}
    }
    const items = dto.items.map((i: any) => ({ ...i, amountRequested: i.quantity * i.unitPrice }));
    const careDate = new Date();
    // -----------------------------------------------------------------------
    // Task 10 — Suppression du circuit tiers payant "legacy" générique
    // Pour les actes où requiresPrescription == true (PHARMACY par categoryId
    // ou tout Act avec requiresPrescription=true), le tiers payant direct
    // sans ordonnance est INTERDIT. Seule la voie prescription-obligatoire
    // est autorisée. Le garde ci-dessous est la seule voie — aucun fallback
    // "legacy" ne doit créer une prise en charge PHARMACY (ou acte à
    // prescription obligatoire) sans ordonnance valide. Tout ancien bloc
    // `else { // legacy direct TP }` a été supprimé.
    // Pour les actes où requiresPrescription == false (ex: CONSULTATION),
    // le circuit direct reste autorisé — pas de vérification d'ordonnance.
    // -----------------------------------------------------------------------
    for (const item of dto.items) {
      let requiresPrescription = item.categoryId === 'PHARMACY';
      if (item.actId) {
        const act = await this.prisma.act.findUnique({ where: { id: item.actId } });
        if (act?.requiresPrescription) requiresPrescription = true;
      }
      if (requiresPrescription) {
        const ok = await this.prisma.prescription.findFirst({
          where: {
            patientUserId: contract.principalUser.id,
            status: { in: ['ACTIVE', 'PARTIALLY_EXECUTED'] },
            validFrom: { lte: careDate }, validUntil: { gte: careDate },
            lines: { some: { categoryId: item.categoryId } },
          },
          include: { lines: { where: { categoryId: item.categoryId } } },
        });
        const hasQty = ok && ok.lines.some((l: any) => l.quantity - l.deliveredQty > 0);
        if (!hasQty) throw new BadRequestException(
          'Aucune prescription valide trouvée pour cette prestation. '
          + 'Ce type de soin nécessite une ordonnance d’un prescripteur habilité. '
          + (ok ? 'La prescription existante a été entièrement exécutée ou est expirée.' : ''),
        );
      }
      // Pas de else — pour les actes sans prescription (CONSULTATION etc.),
      // le tiers payant direct reste autorisé (legacy conservé uniquement
      // pour requiresPrescription == false).
    }
    const estimation = await this.claims.buildEstimation(contract as any, careDate, items);
    // Per-item threshold resolution: most restrictive of product vs act applies per item
    const productThreshold: number | null =
      (await this.prisma.product.findUnique({ where: { id: (contract as any).productId ?? (contract as any).product?.id }, select: { thirdPartyAuthThreshold: true } }))?.thirdPartyAuthThreshold ?? null;
    const thresholds: number[] = [];
    for (const it of dto.items as any[]) {
      let actThreshold: number | null = null;
      if (it.actId) {
        const act = await this.prisma.act.findUnique({ where: { id: it.actId }, select: { authThreshold: true } });
        actThreshold = act?.authThreshold ?? null;
      }
      thresholds.push(resolveThreshold(productThreshold, actThreshold));
    }
    // If ANY item exceeds its own threshold (using per-item approved amount), whole claim needs auth.
    // Fallback: if estimation has no per-item amounts, check total against most restrictive threshold.
    let authRequired = false;
    if (estimation.items.length === thresholds.length) {
      authRequired = estimation.items.some((e, idx) => needsPriorAuthorization(e.amountApproved, thresholds[idx]));
    }
    if (!authRequired && thresholds.length) {
      const mostRestrictive = Math.min(...thresholds);
      authRequired = needsPriorAuthorization(estimation.totals.approved, mostRestrictive);
    }
    const status = authRequired ? 'AUTH_REQUIRED' : 'PENDING_CONFIRMATION';

    const stored: any[] = [];
    for (const f of files ?? []) {
      const saved = await this.storage.save(auth.id, f);
      stored.push({ ...saved, fileName: f.originalname });
    }

    const claim = await this.prisma.$transaction(async tx => {
      const created = await tx.claim.create({
        data: {
          reference: ref('TPE'),
          kind: 'THIRDPARTY',
          contractId: contract.id,
          claimantUserId: contract.principalUser.id,
          beneficiaryId,
          providerId: establishment.id,
          providerUserId: auth.id,
          careDate,
          status,
          totalRequested: estimation.totals.requested,
          totalApproved: estimation.totals.approved,
          estimation: JSON.stringify(estimation),
          flags: JSON.stringify(estimation.flags),
          decisionNote: dto.note ?? null,
          items: {
            create: estimation.items.map((e, idx) => ({
              actId: dto.items[idx]?.actId ?? null,
              code: dto.items[idx]?.code ?? null,
              label: dto.items[idx]?.label ?? null,
              quantity: dto.items[idx]?.quantity ?? 1,
              unitPrice: dto.items[idx]?.unitPrice ?? null,
              practitioner: dto.items[idx]?.practitioner ?? null,
              categoryLabel: e.categoryId,
              amountRequested: e.amountRequested,
              amountEligible: e.amountEligible,
              rateApplied: e.rateApplied ?? 0,
              deductibleApplied: e.deductibleApplied ?? 0,
              amountApproved: e.amountApproved,
            })),
          },
        },
        include: { items: true },
      });
      for (const sDoc of stored) {
        const fileObj = await tx.fileObject.create({
          data: { storagePath: sDoc.storagePath, mime: sDoc.mime, size: sDoc.size, sha256: sDoc.sha256, ownerId: auth.id },
        });
        await tx.claimDocument.create({
          data: { claimId: created.id, fileId: fileObj.id, docType: 'OTHER', fileName: sDoc.fileName, mime: sDoc.mime, size: sDoc.size, sha256: sDoc.sha256 },
        });
      }
      return created;
    });

    if (authRequired) {
      await this.dispatch.dispatchToMany(
        (await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' }, select: { id: true } })).map(m => m.id),
        { topic: 'THIRDPARTY_AUTH_REQUEST', title: `Autorisation demandée — ${claim.reference}`, body: `${establishment.name} — montant couvert estimé : ${estimation.totals.approved} FCFA` },
      );
    }

    return {
      id: claim.id,
      reference: claim.reference,
      status,
      authRequired,
      estimation,
      holder: `${contract.principalUser.firstName} ${contract.principalUser.lastName}`,
      memberNumber: contract.principalUser.memberNumber,
      insurer: contract.product.insurerPartner?.name ?? null,
    };
  }

  @Post('thirdparty/:id/emergency-confirm')
  @RequirePermissions('provider.emergencyOverride')
  async emergencyConfirm(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() body: { emergencyJustification: string }) {
    if (!body?.emergencyJustification?.trim() || body.emergencyJustification.trim().length < 10) {
      throw new BadRequestException('Justification d’urgence obligatoire (≥10 caractères)');
    }
    const justification = body.emergencyJustification.trim();
    const { establishment } = await this.portal.requireEstablishment(auth);

    // Limite de dérogations d'urgence par prestataire (dernières 24h)
    const emergencyLimitRow = await this.prisma.systemConfig.findUnique({ where: { key: 'emergencyOverrideDailyLimit' } });
    const emergencyLimit = Number(emergencyLimitRow?.value ?? '10');
    const last24h = new Date(Date.now() - 24 * 3600 * 1000);
    const recentEmergencies = await this.prisma.claim.count({
      where: {
        providerId: establishment.id,
        emergencyOverride: true,
        emergencyAt: { gte: last24h },
      },
    });
    if (recentEmergencies >= emergencyLimit) {
      throw new BadRequestException(
        `Limite de dérogations d'urgence atteinte (${emergencyLimit} par 24h). Contactez un gestionnaire.`,
      );
    }

    const claim: any = await this.prisma.claim.findFirst({
      where: { id, providerId: establishment.id, kind: 'THIRDPARTY', status: 'AUTH_REQUIRED' },
      include: { items: true } as any,
    });
    if (!claim) throw new NotFoundException('Prise en charge en AUTH_REQUIRED introuvable');

    // Plafond absolu des dérogations d'urgence
    const emergencyCapRow = await this.prisma.systemConfig.findUnique({ where: { key: 'emergencyOverrideMaxAmount' } });
    const emergencyCap = Number(emergencyCapRow?.value ?? '500000');
    const sumApprovedEmergPrelim = (claim.items ?? []).reduce((a: number, it: any) => a + (it.amountApproved ?? 0), 0);
    const prelimAmount = sumApprovedEmergPrelim > 0 ? sumApprovedEmergPrelim : (typeof claim.totalApproved === 'number' ? claim.totalApproved : (claim.totalRequested ?? 0));
    if (prelimAmount > emergencyCap) {
      throw new BadRequestException(
        `Montant ${prelimAmount} FCFA dépasse le plafond de dérogation (${emergencyCap} FCFA). Autorisation gestionnaire obligatoire.`,
      );
    }
    const now = new Date();
    // authorizedAmount is hard cap: sum of item amountApproved or totalApproved/totalRequested
    const sumApprovedEmerg = (claim.items ?? []).reduce((a: number, it: any) => a + (it.amountApproved ?? 0), 0);
    const authorizedAmountEmerg = sumApprovedEmerg > 0 ? sumApprovedEmerg : (typeof claim.totalApproved === 'number' ? claim.totalApproved : (claim.totalRequested ?? 0));
    await this.prisma.claim.update({
      where: { id },
      data: {
        status: 'AUTHORIZED_EMERGENCY',
        emergencyOverride: true,
        emergencyJustification: justification,
        emergencyActorId: auth.id,
        emergencyAt: now,
        authorizedAmount: authorizedAmountEmerg,
      } as any,
    });
    await this.prisma.auditLog.create({
      data: {
        action: 'EMERGENCY_OVERRIDE',
        entityType: 'claim',
        entityId: id,
        userId: auth.id,
        meta: JSON.stringify({ justification }),
      },
    });
    try {
      let dossierId: string | null = null;
      const byClaim = await (this.prisma as any).careRecord?.findFirst?.({ where: { claimId: id } });
      if (byClaim?.id) dossierId = byClaim.id;
      if (!dossierId && (claim as any).claimantUserId) {
        const byPatient = await (this.prisma as any).careRecord?.findFirst?.({ where: { patientUserId: (claim as any).claimantUserId } });
        if (byPatient?.id) dossierId = byPatient.id;
      }
      if (dossierId) {
        await this.prisma.careRecordEvent.create({
          data: {
            careRecordId: dossierId,
            type: 'EMERGENCY_OVERRIDE',
            title: 'Dérogation urgence',
            detail: justification,
            actorUserId: auth.id,
          },
        });
      }
    } catch {}
    try {
      const managers = await this.prisma.user.findMany({
        where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' },
        select: { id: true },
      });
      await this.dispatch.dispatchToMany(managers.map((m: any) => m.id), {
        topic: 'EMERGENCY_OVERRIDE',
        title: `Urgence — ${(claim as any).reference ?? id}`,
        body: `Prestataire ${establishment.name} a forcé l’autorisation — justification : ${justification.slice(0, 120)}`,
      });
    } catch {}
    return { ok: true, status: 'AUTHORIZED_EMERGENCY', reference: (claim as any).reference ?? id };
  }

  @Post('thirdparty/:id/confirm')
  @RequirePermissions('provider.thirdparty')
  async confirm(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const { establishment } = await this.portal.requireEstablishment(auth);
    const claim = await this.prisma.claim.findFirst({
      where: { id, providerId: establishment.id, kind: 'THIRDPARTY' },
      include: { items: true },
    });
    if (!claim) throw new NotFoundException('Prise en charge introuvable');
    if (claim.status === 'CONFIRMED') return { ok: true, status: 'CONFIRMED', reference: claim.reference };
    if (claim.status === 'AUTH_REQUIRED') throw new BadRequestException('Autorisation préalable du gestionnaire requise avant confirmation');
    if (!['PENDING_CONFIRMATION', 'AUTHORIZED', 'AUTHORIZED_EMERGENCY'].includes(claim.status)) throw new BadRequestException(`Statut ${claim.status} non confirmable`);
    if (Date.now() - new Date(claim.createdAt).getTime() > TP_TTL_MS) {
      await this.prisma.claim.update({ where: { id }, data: { status: 'CANCELLED' } });
      throw new BadRequestException('Session expirée (> 30 min). Recalculez la prise en charge.');
    }
    await this.prisma.claim.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        submittedAt: claim.submittedAt ?? new Date(),
        decidedAt: new Date(),
        totalApproved: claim.items.reduce((a, i) => a + (i.amountApproved ?? 0), 0),
      },
    });
    await this.notifyConfirmed(establishment.name, claim);
    return { ok: true, status: 'CONFIRMED', reference: claim.reference };
  }

  @Post('thirdparty/:id/realize')
  @RequirePermissions('provider.thirdparty')
  async realize(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body(new ZodPipe(realizeSchema)) dto: any) {
    const { establishment } = await this.portal.requireEstablishment(auth);
    const claim = await this.prisma.claim.findFirst({
      where: { id, providerId: establishment.id, kind: 'THIRDPARTY', status: 'CONFIRMED' },
      include: { items: true, contract: { include: { product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true } } } } },
    });
    if (!claim) throw new NotFoundException('Prise en charge confirmée introuvable');

    const authorizedTotal = claim.items.reduce((a, i) => a + (i.amountApproved ?? 0), 0);
    if (dto.items?.length) {
      for (const upd of dto.items) {
        const item = claim.items.find(i => i.id === upd.id);
        if (!item) throw new BadRequestException('Acte inconnu');
        const quantity = upd.quantity ?? item.quantity ?? 1;
        const unitPrice = upd.unitPrice ?? item.unitPrice ?? Math.round((item.amountRequested ?? 0) / (item.quantity ?? 1));
        await this.prisma.claimItem.update({
          where: { id: item.id },
          data: { quantity, unitPrice, amountRequested: quantity * unitPrice },
        });
      }
    }

    const fresh = await this.prisma.claim.findUnique({ where: { id }, include: { items: true } });
    const contract = await this.prisma.contract.findUnique({
      where: { id: claim.contractId },
      include: { product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true } } },
    });
    const estimation = await this.claims.buildEstimation(contract as any, claim.careDate,
      fresh!.items.map(i => ({ categoryId: i.categoryLabel, amountRequested: i.amountRequested })));
    const newApproved = estimation.totals.approved;

    if (newApproved > authorizedTotal * 1.1) {
      await this.prisma.claim.update({
        where: { id },
        data: {
          status: 'AUTH_REQUIRED',
          estimation: JSON.stringify(estimation),
          flags: JSON.stringify(estimation.flags),
          realizationNote: dto.note ?? null,
          items: {},
        },
      });
      for (let idx = 0; idx < fresh!.items.length; idx++) {
        const e = estimation.items[idx];
        if (!e) continue;
        await this.prisma.claimItem.update({
          where: { id: fresh!.items[idx].id },
          data: { amountEligible: e.amountEligible, rateApplied: e.rateApplied ?? 0, deductibleApplied: e.deductibleApplied ?? 0, amountApproved: e.amountApproved },
        });
      }
      await this.dispatch.dispatchToMany(
        (await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' }, select: { id: true } })).map(m => m.id),
        { topic: 'THIRDPARTY_AUTH_REQUEST', title: `Ré-autorisation requise — ${claim.reference}`, body: `${establishment.name} — actes réels supérieurs à l'autorisation (${newApproved} > ${authorizedTotal} FCFA)` },
      );
      return { ok: true, status: 'AUTH_REQUIRED', message: 'Actes réels supérieurs à l’autorisation (+10 %) — nouvelle autorisation du gestionnaire requise.' };
    }

    for (let idx = 0; idx < fresh!.items.length; idx++) {
      const e = estimation.items[idx];
      if (!e) continue;
      await this.prisma.claimItem.update({
        where: { id: fresh!.items[idx].id },
        data: { amountEligible: e.amountEligible, rateApplied: e.rateApplied ?? 0, deductibleApplied: e.deductibleApplied ?? 0, amountApproved: e.amountApproved },
      });
    }
    await this.prisma.claim.update({
      where: { id },
      data: { realizationNote: dto.note ?? null, totalApproved: newApproved, totalRequested: estimation.totals.requested, decidedAt: new Date() },
    });
    await this.notifyConfirmed(establishment.name, claim);
    return { ok: true, status: 'CONFIRMED', totalApproved: newApproved, totalRequested: estimation.totals.requested };
  }

  @Post('thirdparty/:id/invoice')
  @RequirePermissions('provider.thirdparty')
  async invoice(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() body?: { total?: number; amount?: number }) {
    const { establishment } = await this.portal.requireEstablishment(auth);
    const claim: any = await this.prisma.claim.findFirst({
      where: { id, providerId: establishment.id, kind: 'THIRDPARTY', status: 'CONFIRMED' },
      include: { items: true },
    });
    if (!claim) throw new NotFoundException('Prise en charge confirmée introuvable');
    if (claim.invoiceNumber) return { ok: true, invoiceNumber: claim.invoiceNumber, invoicedAt: claim.invoicedAt };
    // Hard cap enforcement: if authorizedAmount is set, invoice total must not exceed it
    if (claim.authorizedAmount != null) {
      const sumApproved = (claim.items ?? []).reduce((a: number, it: any) => a + (it.amountApproved ?? 0), 0);
      const claimTotal = typeof body?.total === 'number' ? body.total
        : typeof body?.amount === 'number' ? body.amount
        : (typeof claim.totalApproved === 'number' && claim.totalApproved > 0 ? claim.totalApproved
        : typeof claim.totalRequested === 'number' ? claim.totalRequested
        : sumApproved);
      const totalForCheck = typeof claimTotal === 'number' ? claimTotal : sumApproved;
      if (totalForCheck > claim.authorizedAmount) {
        throw new BadRequestException(`Facture de ${totalForCheck} FCFA dépasse le montant autorisé de ${claim.authorizedAmount} FCFA`);
      }
    }
    const invoiceNumber = ref('FACT');
    await this.prisma.claim.update({ where: { id }, data: { invoiceNumber, invoicedAt: new Date() } });
    return { ok: true, invoiceNumber, invoicedAt: new Date() };
  }

  assertAuthorizedCap(claim: any, invoiceTotal: number) {
    if (claim?.authorizedAmount != null && invoiceTotal > claim.authorizedAmount) {
      throw new BadRequestException(`Facture de ${invoiceTotal} FCFA dépasse le montant autorisé de ${claim.authorizedAmount} FCFA`);
    }
  }

  @Get('staff')
  async staff(@CurrentUser() auth: AuthUser) {
    const { establishment } = await this.portal.requireEstablishment(auth);
    const staff = await this.prisma.user.findMany({
      where: { providerId: establishment.id },
      select: { id: true, firstName: true, lastName: true, email: true, status: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return staff;
  }

  @Post('staff')
  @RequirePermissions('provider.staff')
  async addStaff(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(z.object({
    firstName: z.string().min(2).max(60),
    lastName: z.string().min(2).max(60),
    email: z.string().email().toLowerCase(),
    password: z.string().min(8),
    title: z.string().max(60).optional(),
  }))) dto: any) {
    const { establishment } = await this.portal.requireEstablishmentAdmin(auth);
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('Email déjà utilisé');
    // Le premier membre du personnel est automatiquement administrateur de l'établissement
    const staffCount = await this.prisma.user.count({ where: { providerId: establishment.id } });
    const isFirstStaff = staffCount === 0;
    const bcrypt = await import('bcryptjs');
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: 'PROVIDER',
        firstName: dto.firstName,
        lastName: dto.lastName,
        providerId: establishment.id,
        isEstablishmentAdmin: isFirstStaff,
      },
    });
    return { id: user.id, email: user.email, isEstablishmentAdmin: isFirstStaff };
  }

  @Patch('staff/:id')
  @RequirePermissions('provider.staff')
  async toggleStaff(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body(new ZodPipe(z.object({
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    newPassword: z.string().min(8).optional(),
  }))) dto: any) {
    const { establishment } = await this.portal.requireEstablishmentAdmin(auth);
    const target = await this.prisma.user.findFirst({ where: { id, providerId: establishment.id } });
    if (!target) throw new NotFoundException('Membre introuvable');
    const bcrypt = await import('bcryptjs');
    await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.newPassword ? { passwordHash: await bcrypt.hash(dto.newPassword, 10) } : {}),
      },
    });
    return { ok: true };
  }

  private async logVerification(contractId: string, userId: string) {
    try {
      await this.prisma.auditLog.create({
        data: { action: 'PROVIDER_VERIFY_CARD', entityType: 'contract', entityId: contractId, userId, status: 'OK' },
      });
    } catch {}
  }

  private async notifyConfirmed(establishmentName: string, claim: any) {
    try {
      const covered = claim.items?.reduce((a: number, i: any) => a + (i.amountApproved ?? 0), 0)
        ?? claim.totalApproved ?? 0;
      const managers = await this.prisma.user.findMany({
        where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' },
        select: { id: true },
      });
      await this.dispatch.dispatchToMany(managers.map(m => m.id), {
        topic: 'THIRDPARTY_CONFIRMED',
        title: `Tiers payant ${claim.reference} confirmé`,
        body: `${establishmentName} — montant couvert : ${covered} FCFA`,
      });
      await this.dispatch.dispatchToUser(claim.claimantUserId, {
        topic: 'THIRDPARTY_CONFIRMED',
        title: `Prise en charge ${claim.reference}`,
        body: 'Votre prise en charge a été enregistrée chez le prestataire.',
      });
    } catch {}
  }
}


@Module({
  controllers: [ProviderPortalController],
  providers: [ProviderPortalService],
  imports: [ClaimsModule, FilesModule],
})
export class ProviderPortalModule {}
