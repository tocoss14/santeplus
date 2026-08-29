import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { AuthUser, Public } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { CLAIM_STATUSES_CONSUMING_CAPS, needsPriorAuthorization } from '../../domain/engine';
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
  status: z.enum(['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED']).optional(),
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
    // Par défaut, un nouveau prestataire est en attente de validation
    return this.prisma.provider.create({ data: { ...dto, status: 'PENDING_APPROVAL' } });
  }

  update(id: string, dto: any) {
    return this.prisma.provider.update({ where: { id }, data: dto });
  }

  async approve(id: string) {
    return this.prisma.provider.update({ where: { id }, data: { status: 'ACTIVE', partnerStatus: 'ACTIVE' } });
  }

  async suspend(id: string) {
    return this.prisma.provider.update({ where: { id }, data: { status: 'SUSPENDED', partnerStatus: 'SUSPENDED' } });
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

  @Post('admin/providers/:id/approve')
  @RequirePermissions('providers.manage')
  async approve(@Param('id') id: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Prestataire introuvable');
    if (provider.status === 'ACTIVE') return { ok: true, message: 'Déjà actif' };
    return this.providers.approve(id);
  }

  @Post('admin/providers/:id/suspend')
  @RequirePermissions('providers.manage')
  async suspend(@Param('id') id: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Prestataire introuvable');
    return this.providers.suspend(id);
  }
}

@Module({
  controllers: [ProvidersController],
  providers: [ProvidersService],
})
export class ProvidersModule {}
