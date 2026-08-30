import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable,
  Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { AuthUser, Public } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';

// ── Helpers ──────────────────────────────────────────────────────
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Schemas ──────────────────────────────────────────────────────
const createDistributorSchema = z.object({
  userId: z.string().min(5),
  level: z.enum(['AMBASSADOR', 'COMMERCIAL', 'DISTRIBUTOR', 'INSTITUTIONAL']).default('AMBASSADOR'),
  territory: z.string().max(120).optional(),
  commissionRate: z.number().int().min(0).max(30).default(10),
  renewalRate: z.number().int().min(0).max(15).default(3),
  overrideRate: z.number().int().min(0).max(10).default(0),
  parentDistributorId: z.string().optional(),
});

const updateDistributorSchema = z.object({
  level: z.enum(['AMBASSADOR', 'COMMERCIAL', 'DISTRIBUTOR', 'INSTITUTIONAL']).optional(),
  territory: z.string().max(120).optional(),
  status: z.enum(['ACTIVE', 'PENDING', 'SUSPENDED']).optional(),
  commissionRate: z.number().int().min(0).max(30).optional(),
  renewalRate: z.number().int().min(0).max(15).optional(),
  overrideRate: z.number().int().min(0).max(10).optional(),
});

// ── Service ──────────────────────────────────────────────────────
@Injectable()
export class DistributorsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: z.infer<typeof createDistributorSchema>) {
    // Check user exists and is not already a distributor
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    const existing = await this.prisma.distributor.findUnique({ where: { userId: dto.userId } });
    if (existing) throw new BadRequestException('Cet utilisateur est déjà distributeur');

    // Generate unique referral code
    let referralCode = generateReferralCode();
    let attempts = 0;
    while (await this.prisma.distributor.findUnique({ where: { referralCode } }) && attempts < 10) {
      referralCode = generateReferralCode();
      attempts++;
    }

    // Validate parent distributor if provided
    if (dto.parentDistributorId) {
      const parent = await this.prisma.distributor.findUnique({ where: { id: dto.parentDistributorId } });
      if (!parent || parent.status !== 'ACTIVE') throw new BadRequestException('Distributeur parent invalide');
    }

    return this.prisma.distributor.create({
      data: {
        userId: dto.userId,
        level: dto.level,
        territory: dto.territory,
        referralCode,
        commissionRate: dto.commissionRate,
        renewalRate: dto.renewalRate,
        overrideRate: dto.overrideRate,
        parentDistributorId: dto.parentDistributorId,
        status: 'PENDING',
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  async findAll(q?: string, level?: string, status?: string, page = 1) {
    const where: any = {};
    if (level) where.level = level;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { referralCode: { contains: q.toUpperCase() } },
        { territory: { contains: q } },
        { user: { firstName: { contains: q } } },
        { user: { lastName: { contains: q } } },
      ];
    }
    const take = 20;
    const [items, total] = await Promise.all([
      this.prisma.distributor.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.distributor.count({ where }),
    ]);
    return { items, total, page, pages: Math.ceil(total / take) };
  }

  async findById(id: string) {
    const d = await this.prisma.distributor.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        children: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!d) throw new NotFoundException('Distributeur introuvable');
    return d;
  }

  async update(id: string, dto: z.infer<typeof updateDistributorSchema>) {
    const d = await this.prisma.distributor.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Distributeur introuvable');
    return this.prisma.distributor.update({ where: { id }, data: dto });
  }

  async activate(id: string) {
    const d = await this.prisma.distributor.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Distributeur introuvable');
    if (d.status === 'ACTIVE') return { ok: true, message: 'Déjà actif' };
    return this.prisma.distributor.update({ where: { id }, data: { status: 'ACTIVE' } });
  }

  async suspend(id: string) {
    const d = await this.prisma.distributor.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Distributeur introuvable');
    return this.prisma.distributor.update({ where: { id }, data: { status: 'SUSPENDED' } });
  }

  async stats(id: string) {
    const d = await this.prisma.distributor.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Distributeur introuvable');

    const [totalCommissions, paidCommissions, pendingCommissions, contractCount] = await Promise.all([
      this.prisma.commission.aggregate({ where: { distributorId: id }, _sum: { amount: true }, _count: true }),
      this.prisma.commission.aggregate({ where: { distributorId: id, status: 'PAID' }, _sum: { amount: true } }),
      this.prisma.commission.aggregate({ where: { distributorId: id, status: 'PENDING' }, _sum: { amount: true } }),
      this.prisma.contract.count({ where: { distributorId: id } }),
    ]);

    return {
      totalRecruited: d.totalRecruited,
      totalPremiumGenerated: d.totalPremiumGenerated,
      contractCount,
      totalCommissions: totalCommissions._sum.amount ?? 0,
      totalCommissionCount: totalCommissions._count,
      paidCommissions: paidCommissions._sum.amount ?? 0,
      pendingCommissions: pendingCommissions._sum.amount ?? 0,
    };
  }

  async commissions(id: string, status?: string) {
    const where: any = { distributorId: id };
    if (status) where.status = status;
    return this.prisma.commission.findMany({
      where,
      include: { contract: { select: { number: true, premiumAnnual: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.distributor.findUnique({
      where: { userId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  // Public: lookup by referral code (for /r/{code} page)
  async findByReferralCode(code: string) {
    const d = await this.prisma.distributor.findUnique({
      where: { referralCode: code.toUpperCase() },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!d || d.status !== 'ACTIVE') return null;
    return {
      id: d.id,
      referralCode: d.referralCode,
      level: d.level,
      territory: d.territory,
      user: d.user,
    };
  }
}

// ── Controller ───────────────────────────────────────────────────
@Controller()
@UseInterceptors(AuditInterceptor)
export class DistributorsController {
  constructor(private distributors: DistributorsService) {}

  // ─── Admin endpoints ───────────────────────────────────────
  @Get('admin/distributors')
  @RequirePermissions('distributors.read')
  list(@Query('q') q?: string, @Query('level') level?: string, @Query('status') status?: string, @Query('page') page = '1') {
    return this.distributors.findAll(q, level, status, Number(page));
  }

  @Get('admin/distributors/:id')
  @RequirePermissions('distributors.read')
  getOne(@Param('id') id: string) {
    return this.distributors.findById(id);
  }

  @Post('admin/distributors')
  @RequirePermissions('distributors.manage')
  create(@Body(new ZodPipe(createDistributorSchema)) dto: any) {
    return this.distributors.create(dto);
  }

  @Patch('admin/distributors/:id')
  @RequirePermissions('distributors.manage')
  update(@Param('id') id: string, @Body(new ZodPipe(updateDistributorSchema)) dto: any) {
    return this.distributors.update(id, dto);
  }

  @Post('admin/distributors/:id/activate')
  @RequirePermissions('distributors.manage')
  activate(@Param('id') id: string) {
    return this.distributors.activate(id);
  }

  @Post('admin/distributors/:id/suspend')
  @RequirePermissions('distributors.manage')
  suspend(@Param('id') id: string) {
    return this.distributors.suspend(id);
  }

  @Get('admin/distributors/:id/stats')
  @RequirePermissions('distributors.read')
  stats(@Param('id') id: string) {
    return this.distributors.stats(id);
  }

  @Get('admin/distributors/:id/commissions')
  @RequirePermissions('distributors.read')
  commissions(@Param('id') id: string, @Query('status') status?: string) {
    return this.distributors.commissions(id, status);
  }

  // ─── Distributor self-service ──────────────────────────────
  @Get('distributor/me')
  async me(@CurrentUser() auth: AuthUser) {
    const d = await this.distributors.findByUserId(auth.id);
    return d;
  }

  @Get('distributor/me/stats')
  async myStats(@CurrentUser() auth: AuthUser) {
    const d = await this.distributors.findByUserId(auth.id);
    if (!d) throw new ForbiddenException('Non distributeur');
    return this.distributors.stats(d.id);
  }

  @Get('distributor/me/commissions')
  async myCommissions(@CurrentUser() auth: AuthUser, @Query('status') status?: string) {
    const d = await this.distributors.findByUserId(auth.id);
    if (!d) throw new ForbiddenException('Non distributeur');
    return this.distributors.commissions(d.id, status);
  }

  // ─── Public: referral code lookup ──────────────────────────
  @Public()
  @Get('distributors/lookup/:code')
  lookup(@Param('code') code: string) {
    return this.distributors.findByReferralCode(code);
  }
}

// ── Module ───────────────────────────────────────────────────────
@Module({
  controllers: [DistributorsController],
  providers: [DistributorsService],
  exports: [DistributorsService],
})
export class DistributorsModule {}
