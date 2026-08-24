import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { AuthUser, Public } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { CLAIM_STATUSES_CONSUMING_CAPS, needsPriorAuthorization } from '../../domain/engine';
import { ClaimsModule, ClaimsService } from '../claims/claims.controller';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { ref } from '../../common/utils';

const CAPS_CONSUMING: string[] = [...CLAIM_STATUSES_CONSUMING_CAPS];

const thirdPartyInitiateSchema = z.object({
  cardToken: z.string().min(10).max(64),
  beneficiaryId: z.string().optional(),
  providerId: z.string().optional(),
  items: z.array(z.object({
    categoryId: z.string().min(2),
    label: z.string().max(120).optional(),
    amountRequested: z.number().int().min(1),
  })).min(1).max(20),
});

const TP_PENDING_STATUSES = ['PENDING_CONFIRMATION', 'AUTHORIZED'];
const TP_TTL_MS = 30 * 60 * 1000;

const providerSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(['HOSPITAL', 'CLINIC', 'HEALTH_CENTER', 'PHARMACY', 'LABORATORY', 'MEDICAL_CABINET', 'SPECIALIST']),
  city: z.string().min(2).max(80),
  address: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  specialties: z.string().max(300).optional(),
  openingHours: z.string().max(200).optional(),
  services: z.string().max(500).optional(),
  partnerStatus: z.enum(['ACTIVE', 'PENDING', 'SUSPENDED']).default('ACTIVE'),
  conventionLevel: z.enum(['BASIC', 'PLUS', 'PREMIUM']).default('BASIC'),
  thirdPartyPayer: z.boolean().default(false),
  notes: z.string().max(500).optional(),
  active: z.boolean().default(true),
});

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) {}

  async search(opts: { q?: string; type?: string; city?: string; thirdParty?: string; near?: string }) {
    const where: any = { active: true };
    if (opts.type) where.type = opts.type;
    if (opts.city) where.city = { contains: opts.city };
    if (opts.thirdParty === 'true') where.thirdPartyPayer = true;
    if (opts.q) {
      const like = { contains: opts.q };
      where.OR = [{ name: like }, { city: like }, { specialties: like }, { services: like }, { address: like }];
    }
    let items = await this.prisma.provider.findMany({ where, orderBy: { name: 'asc' }, take: 100 });
    if (opts.near) {
      const [lat, lng] = opts.near.split(',').map(Number);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        items = items
          .filter(p => p.lat != null && p.lng != null)
          .map(p => ({ ...p, distanceKm: haversine(lat, lng, p.lat!, p.lng!) }))
          .sort((a, b) => a.distanceKm - b.distanceKm);
      }
    }
    return items;
  }

  async cities() {
    const rows = await this.prisma.provider.findMany({ where: { active: true }, select: { city: true }, distinct: ['city'], orderBy: { city: 'asc' } });
    return rows.map(r => r.city);
  }

  adminList(q?: string) {
    return this.prisma.provider.findMany({
      where: q ? { OR: [{ name: { contains: q } }, { city: { contains: q } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  create(dto: any) {
    return this.prisma.provider.create({ data: dto });
  }

  update(id: string, dto: any) {
    return this.prisma.provider.update({ where: { id }, data: dto });
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

@Controller()
@UseInterceptors(AuditInterceptor)
export class ProvidersController {
  constructor(
    private providers: ProvidersService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Get('providers')
  search(@Query('q') q?: string, @Query('type') type?: string, @Query('city') city?: string, @Query('thirdParty') thirdParty?: string, @Query('near') near?: string) {
    return this.providers.search({ q, type, city, thirdParty, near });
  }

  @Public()
  @Get('providers/cities')
  cities() {
    return this.providers.cities();
  }

  @Post('provider/verify')
  @RequirePermissions('provider.verify')
  async verifyCard(@Body(new ZodPipe(z.object({ cardToken: z.string().min(10).max(64) }))) dto: any) {
    const contract = await this.prisma.contract.findUnique({
      where: { cardToken: dto.cardToken },
      include: {
        principalUser: { select: { firstName: true, lastName: true, memberNumber: true, birthDate: true } },
        product: { include: { guarantees: { include: { guarantee: true } } } },
        beneficiaries: { where: { status: 'COVERED' }, select: { firstName: true, lastName: true, memberNumber: true, relation: true } },
        _count: { select: { claims: true } },
      },
    });
    if (!contract) throw new NotFoundException('Carte invalide ou inconnue');
    await this.logVerification(contract.id);
    const warnings: string[] = [];
    if (contract.status !== 'ACTIVE') {
      warnings.push(
        contract.status === 'EXPIRED' ? 'Contrat expirÃ©'
          : contract.status === 'SUSPENDED' ? 'Contrat suspendu'
          : 'Contrat non actif',
      );
    }
    if (contract.endDate && new Date(contract.endDate) < new Date()) warnings.push('ValiditÃ© dÃ©passÃ©e');
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
    const caps = contract.product.guarantees.map((pg: any) => ({
      category: pg.guarantee.category,
      label: pg.guarantee.name,
      rate: pg.rate,
      annualLimit: pg.annualLimit,
      remaining: pg.annualLimit == null ? null : Math.max(0, pg.annualLimit - (usedMap.get(pg.guarantee.category) ?? 0)),
    }));
    return {
      contract: {
        number: contract.number,
        status: contract.status,
        productName: contract.product.name,
        startDate: contract.startDate,
        endDate: contract.endDate,
        holder: `${contract.principalUser.firstName} ${contract.principalUser.lastName}`,
        memberNumber: contract.principalUser.memberNumber,
        birthDate: contract.principalUser.birthDate,
      },
      beneficiariesCount: contract.beneficiaries.length,
      beneficiaries: contract.beneficiaries,
      claimsCount: contract._count.claims,
      caps,
      warnings,
    };
  }

  private async logVerification(contractId: string) {
    try {
      await this.prisma.auditLog.create({
        data: { action: 'PROVIDER_VERIFY_CARD', entityType: 'contract', entityId: contractId, status: 'OK' },
      });
    } catch {}
  }

  @Get('admin/providers')
  @RequirePermissions('providers.read')
  adminList(@Query('q') q?: string) {
    return this.providers.adminList(q);
  }

  @Post('admin/providers')
  @RequirePermissions('providers.manage')
  create(@Body(new ZodPipe(providerSchema)) dto: any) {
    return this.providers.create(dto);
  }

  @Patch('admin/providers/:id')
  @RequirePermissions('providers.manage')
  update(@Param('id') id: string, @Body(new ZodPipe(providerSchema.partial())) dto: any) {
    return this.providers.update(id, dto);
  }
}

@Controller('provider/thirdparty')
@UseInterceptors(AuditInterceptor)
export class ThirdPartyController {
  constructor(
    private prisma: PrismaService,
    private claims: ClaimsService,
    private dispatch: NotificationDispatchService,
  ) {}

  @Post('initiate')
  @RequirePermissions('provider.thirdparty')
  async initiate(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(thirdPartyInitiateSchema)) dto: any) {
    const contract = await this.prisma.contract.findUnique({
      where: { cardToken: dto.cardToken },
      include: {
        principalUser: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
        product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true } },
      },
    });
    if (!contract) throw new NotFoundException('Carte invalide ou inconnue');
    if (contract.status !== 'ACTIVE') throw new BadRequestException(`Contrat ${contract.status} — prise en charge impossible`);
    if (dto.beneficiaryId) {
      const b = await this.prisma.beneficiary.findFirst({ where: { id: dto.beneficiaryId, contractId: contract.id, status: 'COVERED' } });
      if (!b) throw new BadRequestException('Ayant droit non couvert');
    }
    if (dto.providerId) {
      const provider = await this.prisma.provider.findFirst({ where: { id: dto.providerId, active: true } });
      if (!provider) throw new BadRequestException('Établissement inconnu');
    }

    const careDate = new Date();
    const estimation = await this.claims.buildEstimation(contract as any, careDate, dto.items);
    const threshold = await this.getConfigNumber('thirdPartyAuthThreshold', 150000);
    const authRequired = needsPriorAuthorization(estimation.totals.approved, threshold);
    const status = authRequired ? 'AUTH_REQUIRED' : 'PENDING_CONFIRMATION';

    const claim = await this.prisma.claim.create({
      data: {
        reference: ref('TPE'),
        kind: 'THIRDPARTY',
        contractId: contract.id,
        claimantUserId: contract.principalUser.id,
        beneficiaryId: dto.beneficiaryId ?? null,
        providerId: dto.providerId ?? null,
        providerUserId: auth.id,
        careDate,
        status,
        totalRequested: estimation.totals.requested,
        totalApproved: estimation.totals.approved,
        estimation: JSON.stringify(estimation),
        flags: JSON.stringify(estimation.flags),
        items: {
          create: estimation.items.map(e => ({
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

    return {
      id: claim.id,
      reference: claim.reference,
      status,
      authRequired,
      estimation,
      holder: `${contract.principalUser.firstName} ${contract.principalUser.lastName}`,
      memberNumber: contract.principalUser.memberNumber,
    };
  }

  @Post(':id/confirm')
  @RequirePermissions('provider.thirdparty')
  async confirm(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const claim = await this.prisma.claim.findUnique({ where: { id }, include: { items: true } });
    if (!claim || claim.kind !== 'THIRDPARTY' || claim.providerUserId !== auth.id)
      throw new NotFoundException('Prise en charge introuvable');
    if (claim.status === 'CONFIRMED') return { ok: true, status: 'CONFIRMED', reference: claim.reference };
    if (claim.status === 'AUTH_REQUIRED')
      throw new BadRequestException('Autorisation préalable du gestionnaire requise avant confirmation');
    if (!TP_PENDING_STATUSES.includes(claim.status)) throw new BadRequestException(`Statut ${claim.status} non confirmable`);
    if (Date.now() - new Date(claim.createdAt).getTime() > TP_TTL_MS) {
      await this.prisma.claim.update({ where: { id }, data: { status: 'CANCELLED' } });
      throw new BadRequestException('Session expirée (> 30 min). Recalculez la prise en charge.');
    }

    const full = await this.prisma.claim.findUnique({
      where: { id },
      include: {
        beneficiary: true,
        contract: {
          include: {
            principalUser: { select: { firstName: true, lastName: true } },
            product: { select: { name: true } },
          },
        },
      },
    });
    await this.prisma.$transaction(async tx => {
      await tx.claim.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          submittedAt: claim.submittedAt ?? new Date(),
          decidedAt: new Date(),
          totalApproved: claim.items.reduce((a: number, i: any) => a + (i.amountApproved ?? 0), 0),
        },
      });
    });

    await this.notifyManagersAndMember(claim);

    return {
      ok: true,
      status: 'CONFIRMED',
      reference: claim.reference,
      receipt: {
        reference: claim.reference,
        date: new Date().toISOString(),
        patient: full?.contract.principalUser ? `${full.contract.principalUser.firstName} ${full.contract.principalUser.lastName}` : '',
        beneficiary: full?.beneficiary ? `${full.beneficiary.firstName} ${full.beneficiary.lastName}` : null,
        product: full?.contract.product.name ?? '',
        covered: claim.items.reduce((a: number, i: any) => a + (i.amountApproved ?? 0), 0),
        requested: claim.totalRequested,
        patientDue: claim.totalRequested - claim.items.reduce((a: number, i: any) => a + (i.amountApproved ?? 0), 0),
        items: claim.items.map(i => ({ label: i.categoryLabel, requested: i.amountRequested, covered: i.amountApproved ?? 0 })),
      },
    };
  }

  private async getConfigNumber(key: string, fallback: number): Promise<number> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
    const v = row ? Number(JSON.parse(row.value)) : NaN;
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  }

  private async notifyManagersAndMember(claim: any) {
    try {
      const managers = await this.prisma.user.findMany({
        where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' },
        select: { id: true },
      });
      const covered = claim.items.reduce((a: number, i: any) => a + (i.amountApproved ?? 0), 0);
      await this.dispatch.dispatchToMany(
        managers.map(m => m.id),
        { topic: 'THIRDPARTY_CONFIRMED', title: `Tiers payant ${claim.reference} confirmé`, body: `Montant couvert : ${covered} FCFA` },
      );
      await this.dispatch.dispatchToUser(claim.claimantUserId, {
        topic: 'THIRDPARTY_CONFIRMED',
        title: `Prise en charge ${claim.reference}`,
        body: 'Votre prise en charge a été enregistrée chez le prestataire. Consultez le détail dans vos remboursements.',
      });
    } catch {}
  }
}

@Module({
  controllers: [ProvidersController, ThirdPartyController],
  providers: [ProvidersService],
  imports: [ClaimsModule],
})
export class ProvidersModule {}
