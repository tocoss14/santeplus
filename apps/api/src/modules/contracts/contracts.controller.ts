import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { addDays, addYears, memberNumber, ref, secureToken, startOfDay } from '../../common/utils';
import { CLAIM_STATUSES_CONSUMING_CAPS } from '../../domain/engine';

const CAPS_CONSUMING: string[] = [...CLAIM_STATUSES_CONSUMING_CAPS];

const CONTRACT_INCLUDE = {
  product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true, insurerPartner: { select: { name: true, kind: true } } } },
  beneficiaries: true,
  contributions: { orderBy: { sequence: 'asc' as const } },
  company: { select: { id: true, name: true } },
};

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) {}

  async canAccess(auth: AuthUser, contractId: string): Promise<any> {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId }, include: CONTRACT_INCLUDE });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    if (auth.role === 'SUPER_ADMIN' || auth.role === 'INSURANCE_MANAGER') return contract;
    if (auth.role === 'SUPPORT_AGENT') return contract;
    if (contract.principalUserId === auth.id) return contract;
    if (contract.companyId && auth.companyId === contract.companyId && auth.role === 'COMPANY_ADMIN') return contract;
    throw new ForbiddenException('AccÃ¨s refusÃ© Ã  ce contrat');
  }

  async capsSummary(contract: any): Promise<any[]> {
    const yearStart = startOfDay(contract.startDate ?? new Date());
    const usedPerCategory: Record<string, number> = {};
    const detailed = await this.prisma.claimItem.findMany({
      where: {
        claim: { contractId: contract.id, status: { in: CAPS_CONSUMING }, careDate: { gte: yearStart } },
      },
      select: { categoryLabel: true, amountEligible: true },
    });
    for (const d of detailed) {
      if (d.amountEligible == null) continue;
      usedPerCategory[d.categoryLabel] = (usedPerCategory[d.categoryLabel] ?? 0) + d.amountEligible;
    }
    return contract.product.guarantees.map((pg: any) => {
      const used = usedPerCategory[pg.guarantee.category] ?? 0;
      return {
        categoryId: pg.guarantee.category,
        label: pg.guarantee.name,
        annualLimit: pg.annualLimit,
        rate: pg.rate,
        deductibleType: pg.deductibleType,
        deductibleValue: pg.deductibleValue,
        used,
        remaining: pg.annualLimit == null ? null : Math.max(0, pg.annualLimit - used),
      };
    });
  }

  async renew(auth: AuthUser, contractId: string) {
    const contract = await this.canAccess(auth, contractId);
    if (!['ACTIVE', 'EXPIRED'].includes(contract.status))
      throw new BadRequestException('Seul un contrat actif ou expirÃ© peut Ãªtre renouvelÃ©');
    const today = startOfDay(new Date());
    const baseDate = contract.endDate && contract.endDate > today ? addDays(contract.endDate, 1) : today;
    const schedule = [
      { sequence: 1, dueDate: baseDate, amount: contract.premiumAnnual },
    ];
    await this.prisma.$transaction(async tx => {
      await tx.contribution.createMany({
        data: schedule.map(s => ({ contractId: contract.id, sequence: s.sequence + contract.contributions.length, dueDate: s.dueDate, amount: s.amount })),
      });
      await tx.contract.update({ where: { id: contract.id }, data: { endDate: addYears(baseDate, 1), status: contract.status === 'EXPIRED' ? 'PENDING_PAYMENT' : contract.status } });
    });
    return { ok: true, message: 'Ã‰chÃ©ancier de renouvellement crÃ©Ã©. RÃ©glez la cotisation pour activer.' };
  }

  async activateOnPayment(contractId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return null;
    if (contract.status === 'PENDING_PAYMENT' || contract.status === 'DRAFT') {
      const today = startOfDay(new Date());
      const updated = await this.prisma.contract.update({
        where: { id: contractId },
        data: { status: 'ACTIVE', startDate: today, endDate: addDays(addYears(today, 1), -1) },
      });
      return updated;
    }
    if (contract.status === 'SUSPENDED') {
      return this.prisma.contract.update({ where: { id: contractId }, data: { status: 'ACTIVE' } });
    }
    return contract;
  }
}

const adminActionSchema = z.object({ note: z.string().max(500).optional() });

@Controller()
@UseInterceptors(AuditInterceptor)
export class ContractsController {
  constructor(
    private contracts: ContractsService,
    private prisma: PrismaService,
  ) {}

  @Get('contracts/mine')
  async mine(@CurrentUser() auth: AuthUser) {
    return this.prisma.contract.findMany({
      where: { principalUserId: auth.id },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, code: true } }, _count: { select: { beneficiaries: true, claims: true } } },
    });
  }

  @Get('contracts/:id')
  async detail(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const contract = await this.contracts.canAccess(auth, id);
    const caps = await this.contracts.capsSummary(contract);
    const principal = await this.prisma.user.findUnique({
      where: { id: contract.principalUserId },
      select: { firstName: true, lastName: true, memberNumber: true, birthDate: true },
    });
    return { ...this.sanitizeContract(contract), caps, principal };
  }

  @Get('contracts/:id/card')
  async card(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const contract = await this.contracts.canAccess(auth, id);
    const principal = await this.prisma.user.findUnique({
      where: { id: contract.principalUserId },
      select: { firstName: true, lastName: true, memberNumber: true, photoFileId: true },
    });
    return {
      holder: `${principal!.firstName} ${principal!.lastName}`,
      memberNumber: principal!.memberNumber,
      contractNumber: contract.number,
      productName: contract.product.name,
      validUntil: contract.endDate,
      status: contract.status,
      cardToken: contract.cardToken,
      photoFileId: principal?.photoFileId ?? null,
      qrPayload: JSON.stringify({ t: contract.cardToken }),
    };
  }

  @Post('contracts/:id/rotate-token')
  async rotateToken(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const contract = await this.contracts.canAccess(auth, id);
    const updated = await this.prisma.contract.update({
      where: { id: contract.id },
      data: { cardToken: secureToken(16) },
    });
    return { cardToken: updated.cardToken };
  }

  @Post('contracts/:id/renew')
  renew(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.contracts.renew(auth, id);
  }

  @Get('admin/contracts')
  @RequirePermissions('contracts.viewAll')
  async adminList(@Query('status') status?: string, @Query('q') q?: string, @Query('page') page = '1', @Query('from') from?: string, @Query('to') to?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (q) where.OR = [{ number: { contains: q } }, { principalUser: { is: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }, { memberNumber: { contains: q } }] } } }];
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59.999Z');
    }
    const take = 20;
    const [items, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * take,
        take,
        include: {
          principalUser: { select: { firstName: true, lastName: true, memberNumber: true } },
          product: { select: { name: true, code: true } },
          company: { select: { name: true } },
          _count: { select: { beneficiaries: true, claims: true } },
        },
      }),
      this.prisma.contract.count({ where }),
    ]);
    return { items, total, page: Number(page), pages: Math.ceil(total / take) };
  }

  @Post('admin/contracts/:id/suspend')
  @RequirePermissions('contracts.manage')
  async suspend(@Param('id') id: string, @Body(new ZodPipe(adminActionSchema)) dto: any) {
    await this.adminTransition(id, ['ACTIVE'], 'SUSPENDED');
    return { ok: true };
  }

  @Post('admin/contracts/:id/activate')
  @RequirePermissions('contracts.manage')
  async activate(@Param('id') id: string, @Body(new ZodPipe(adminActionSchema)) dto: any) {
    const c = await this.prisma.contract.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Contrat introuvable');
    if (c.status !== 'SUSPENDED') throw new BadRequestException('Seul un contrat suspendu peut Ãªtre rÃ©activÃ© ici');
    await this.prisma.contract.update({ where: { id }, data: { status: 'ACTIVE' } });
    return { ok: true };
  }

  @Post('admin/contracts/:id/terminate')
  @RequirePermissions('contracts.manage')
  async terminate(@Param('id') id: string, @Body(new ZodPipe(adminActionSchema)) dto: any) {
    await this.adminTransition(id, ['ACTIVE', 'SUSPENDED'], 'TERMINATED');
    return { ok: true };
  }

  private async adminTransition(id: string, from: string[], to: string) {
    const c = await this.prisma.contract.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Contrat introuvable');
    if (!from.includes(c.status)) throw new BadRequestException(`Transition impossible depuis ${c.status}`);
    await this.prisma.contract.update({ where: { id }, data: { status: to } });
  }

  private sanitizeContract(contract: any) {
    return contract;
  }
}

const beneficiaryEditSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
});

@Controller('contracts/:contractId/beneficiaries')
@UseInterceptors(AuditInterceptor)
export class BeneficiariesController {
  constructor(
    private contracts: ContractsService,
    private prisma: PrismaService,
  ) {}

  @Get()
  list(@CurrentUser() auth: AuthUser, @Param('contractId') contractId: string) {
    return this.guarded(auth, contractId, () =>
      this.prisma.beneficiary.findMany({ where: { contractId }, orderBy: { birthDate: 'asc' } }),
    );
  }

  @Post()
  async add(@CurrentUser() auth: AuthUser, @Param('contractId') contractId: string, @Body() body: any) {
    const contract = await this.contracts.canAccess(auth, contractId);
    if (contract.kind !== 'INDIVIDUAL') throw new BadRequestException('Ajoutez les salariÃ©s depuis votre espace entreprise');
    if (!['ACTIVE', 'SUSPENDED'].includes(contract.status)) throw new BadRequestException('Contrat non actif');
    const draft = {
      firstName: String(body.firstName ?? '').trim(),
      lastName: String(body.lastName ?? '').trim(),
      birthDate: body.birthDate ? new Date(body.birthDate) : null,
      gender: ['M', 'F'].includes(body.gender) ? body.gender : null,
      relation: ['SPOUSE', 'CHILD', 'OTHER'].includes(body.relation) ? body.relation : null,
    };
    if (!draft.firstName || !draft.lastName || !draft.birthDate || !draft.gender || !draft.relation)
      throw new BadRequestException('Champs requis manquants');
    const birth = draft.birthDate as Date;
    const gender = draft.gender as string;
    const relation = draft.relation as string;
    const existing = await this.prisma.beneficiary.count({ where: { contractId, status: 'COVERED' } });
    const rules = JSON.parse(contract.product.beneficiaryRules || '{}');
    if (rules.maxBeneficiaries != null && existing >= rules.maxBeneficiaries)
      throw new BadRequestException(`Nombre maximum d'ayants droit : ${rules.maxBeneficiaries}`);
    if (relation === 'SPOUSE') {
      if (rules.spouse === false) throw new BadRequestException('Conjoint non couvert par ce produit');
      const spouseExists = await this.prisma.beneficiary.count({ where: { contractId, relation: 'SPOUSE', status: 'COVERED' } });
      if (spouseExists > 0) throw new BadRequestException('Un conjoint est dÃ©jÃ  dÃ©clarÃ©');
    }
    if (relation === 'OTHER' && rules.otherAllowed !== true) throw new BadRequestException('Autres ayants droit non autorisÃ©s');
    if (relation === 'CHILD') {
      const childMax = rules.childMaxAge ?? 21;
      const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 86400000));
      if (age >= childMax) throw new BadRequestException(`Un enfant doit avoir moins de ${childMax} ans`);
    }
    const beneficiary = await this.prisma.$transaction(async tx => {
      const created = await tx.beneficiary.create({
        data: {
          contractId,
          addedById: auth.id,
          firstName: draft.firstName,
          lastName: draft.lastName,
          birthDate: birth,
          gender,
          relation,
          memberNumber: memberNumber(),
        },
      });
      await tx.beneficiaryChange.create({
        data: { beneficiaryId: created.id, action: 'ADDED', byUserId: auth.id, meta: JSON.stringify(draft) },
      });
      return created;
    });
    return beneficiary;
  }

  @Patch(':beneficiaryId')
  async edit(@CurrentUser() auth: AuthUser, @Param('contractId') contractId: string, @Param('beneficiaryId') bid: string, @Body(new ZodPipe(beneficiaryEditSchema)) dto: any) {
    await this.guarded(auth, contractId, async () => {
      const b = await this.prisma.beneficiary.findFirst({ where: { id: bid, contractId } });
      if (!b) throw new NotFoundException('Ayant droit introuvable');
      await this.prisma.beneficiary.update({ where: { id: bid }, data: dto });
      await this.prisma.beneficiaryChange.create({ data: { beneficiaryId: bid, action: 'UPDATED', byUserId: auth.id, meta: JSON.stringify(dto) } });
      return null;
    });
    return { ok: true };
  }

  @Post(':beneficiaryId/remove')
  async remove(@CurrentUser() auth: AuthUser, @Param('contractId') contractId: string, @Param('beneficiaryId') bid: string) {
    await this.guarded(auth, contractId, async () => {
      const b = await this.prisma.beneficiary.findFirst({ where: { id: bid, contractId } });
      if (!b) throw new NotFoundException('Ayant droit introuvable');
      if (b.status !== 'COVERED') throw new BadRequestException('DÃ©jÃ  retirÃ©');
      await this.prisma.beneficiary.update({ where: { id: bid }, data: { status: 'REMOVED', removedAt: new Date() } });
      await this.prisma.beneficiaryChange.create({ data: { beneficiaryId: bid, action: 'REMOVED', byUserId: auth.id } });
      return null;
    });
    return { ok: true };
  }

  @Get(':beneficiaryId/history')
  history(@CurrentUser() auth: AuthUser, @Param('contractId') contractId: string, @Param('beneficiaryId') bid: string) {
    return this.guarded(auth, contractId, () =>
      this.prisma.beneficiaryChange.findMany({ where: { beneficiaryId: bid }, orderBy: { createdAt: 'desc' }, include: { byUser: { select: { firstName: true, lastName: true } } } }),
    );
  }

  private async guarded<T>(auth: AuthUser, contractId: string, fn: () => T | Promise<T>): Promise<T> {
    await this.contracts.canAccess(auth, contractId);
    return fn();
  }
}

@Module({
  controllers: [ContractsController, BeneficiariesController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
