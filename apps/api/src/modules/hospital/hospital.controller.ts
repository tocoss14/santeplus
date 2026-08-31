import { Body, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma.module';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { ref } from '../../common/utils';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';

const hospitalRequestSchema = z.object({
  contractId: z.string().min(5),
  beneficiaryId: z.string().optional(),
  providerId: z.string().min(5),
  diagnostic: z.string().min(5).max(2000),
  diseaseCode: z.string().min(2).max(20).optional(),
  estimatedAmount: z.number().int().min(1000).max(5000000),
  hospitalizationType: z.enum(['MEDECINE', 'CHIRURGIE', 'MATERNITE', 'SOINS_INTENSIFS']).default('MEDECINE'),
  expectedDays: z.number().int().min(1).max(90).default(3),
  documents: z.array(z.string()).optional(),
});

@Injectable()
export class HospitalService {
  constructor(private prisma: PrismaService, private dispatch: NotificationDispatchService) {}

  async request(auth: AuthUser, dto: any) {
    const contract = await this.prisma.contract.findUnique({ where: { id: dto.contractId }, include: { product: true } });
    if (!contract) throw new Error('Contrat introuvable');
    if (contract.status !== 'ACTIVE') throw new Error('Contrat non actif');
    // Vérifier appartenance
    const isOwner = contract.principalUserId === auth.id;
    const isProvider = auth.role === 'PROVIDER' && auth.providerId === dto.providerId;
    const isCompanyAdmin = auth.role === 'COMPANY_ADMIN' && auth.companyId === contract.companyId;
    if (!isOwner && !isProvider && !isCompanyAdmin && auth.role !== 'SUPER_ADMIN') throw new Error('Accès refusé');

    const claim = await this.prisma.claim.create({
      data: {
        reference: ref('HOS'),
        kind: 'HOSPITAL',
        contractId: contract.id,
        claimantUserId: contract.principalUserId,
        beneficiaryId: dto.beneficiaryId ?? null,
        providerId: dto.providerId,
        providerUserId: auth.role === 'PROVIDER' ? auth.id : null,
        careDate: new Date(),
        status: 'AUTH_REQUIRED',
        totalRequested: dto.estimatedAmount,
        diseaseId: dto.diseaseCode ? (await this.prisma.disease.findUnique({ where: { code: dto.diseaseCode.toUpperCase() } }))?.id ?? null : null,
        estimation: JSON.stringify({ hospitalizationType: dto.hospitalizationType, expectedDays: dto.expectedDays, diagnostic: dto.diagnostic }),
        flags: JSON.stringify(['HOSPITAL_ENTENTE']),
        items: {
          create: [{ categoryLabel: 'HOSPITALIZATION', amountRequested: dto.estimatedAmount }],
        },
      },
    });

    // Notifier gestionnaires
    const managers = await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' }, select: { id: true } });
    for (const m of managers) {
      await this.dispatch.dispatchToUser(m.id, {
        topic: 'HOSPITAL_ENTENTE',
        title: `Entente hospitalière ${claim.reference}`,
        body: `Demande ${dto.hospitalizationType} ${dto.estimatedAmount} FCFA — ${dto.diagnostic.slice(0, 80)}`,
        meta: { claimId: claim.id, contractId: contract.id },
      }).catch(() => {});
    }

    return claim;
  }

  async list(auth: AuthUser, status?: string, page = 1) {
    const where: any = { kind: 'HOSPITAL' };
    if (status) where.status = status;
    // Provider voit ses demandes, assureur voit tout, assure voit les siennes
    if (auth.role === 'PROVIDER' && auth.providerId) where.providerId = auth.providerId;
    else if (auth.role === 'MEMBER') where.claimantUserId = auth.id;
    const take = 20;
    const [items, total] = await Promise.all([
      this.prisma.claim.findMany({ where, include: { contract: { select: { number: true } }, provider: { select: { name: true } }, disease: { select: { code: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }),
      this.prisma.claim.count({ where }),
    ]);
    return { items, total, page, pages: Math.ceil(total / take) };
  }
}

@Controller('hospital')
export class HospitalController {
  constructor(private hospital: HospitalService) {}

  @Post('entente')
  @RequirePermissions('provider.thirdparty')
  request(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(hospitalRequestSchema)) dto: any) {
    return this.hospital.request(auth, dto);
  }

  @Get('ententes')
  list(@CurrentUser() auth: AuthUser, @Query('status') status?: string, @Query('page') page = '1') {
    return this.hospital.list(auth, status, Number(page));
  }
}

@Module({ controllers: [HospitalController], providers: [HospitalService], exports: [HospitalService] })
export class HospitalModule {}
