import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';

const approveCommissionSchema = z.object({
  note: z.string().max(200).optional(),
});

const rejectCommissionSchema = z.object({
  note: z.string().min(3).max(200),
});

const payCommissionSchema = z.object({
  paymentRef: z.string().min(3).max(100),
  note: z.string().max(200).optional(),
});

@Injectable()
export class CommissionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(status?: string, type?: string, distributorId?: string, page = 1, q?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (distributorId) where.distributorId = distributorId;
    if (q) {
      where.OR = [
        { contract: { number: { contains: q } } },
        { distributor: { user: { firstName: { contains: q } } } },
        { distributor: { user: { lastName: { contains: q } } } },
        { distributor: { referralCode: { contains: q.toUpperCase() } } },
      ];
    }
    const take = 20;
    const [items, total] = await Promise.all([
      this.prisma.commission.findMany({
        where,
        include: {
          distributor: {
            include: { user: { select: { firstName: true, lastName: true, email: true } } },
          },
          contract: { select: { number: true, premiumAnnual: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.commission.count({ where }),
    ]);
    return { items, total, page, pages: Math.ceil(total / take) };
  }

  async approve(id: string, dto: z.infer<typeof approveCommissionSchema>) {
    const c = await this.prisma.commission.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Commission introuvable');
    if (c.status !== 'PENDING') throw new BadRequestException(`Statut invalide: ${c.status}`);
    return this.prisma.commission.update({
      where: { id },
      data: { status: 'APPROVED', note: dto.note },
    });
  }

  async reject(id: string, dto: z.infer<typeof rejectCommissionSchema>) {
    const c = await this.prisma.commission.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Commission introuvable');
    if (c.status !== 'PENDING') throw new BadRequestException(`Statut invalide: ${c.status}`);
    return this.prisma.commission.update({
      where: { id },
      data: { status: 'REJECTED', note: dto.note },
    });
  }

  async markPaid(id: string, dto: z.infer<typeof payCommissionSchema>) {
    const c = await this.prisma.commission.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Commission introuvable');
    if (c.status !== 'APPROVED') throw new BadRequestException('La commission doit être approuvée avant paiement');
    return this.prisma.commission.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date(), paymentRef: dto.paymentRef, note: dto.note },
    });
  }

  async stats() {
    const [total, pending, approved, paid, byType] = await Promise.all([
      this.prisma.commission.aggregate({ _sum: { amount: true }, _count: true }),
      this.prisma.commission.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: true }),
      this.prisma.commission.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true }, _count: true }),
      this.prisma.commission.aggregate({ where: { status: 'PAID' }, _sum: { amount: true }, _count: true }),
      this.prisma.commission.groupBy({ by: ['type'], _sum: { amount: true }, _count: true }),
    ]);
    return {
      total: { amount: total._sum.amount ?? 0, count: total._count },
      pending: { amount: pending._sum.amount ?? 0, count: pending._count },
      approved: { amount: approved._sum.amount ?? 0, count: approved._count },
      paid: { amount: paid._sum.amount ?? 0, count: paid._count },
      byType: byType.map(t => ({ type: t.type, amount: t._sum.amount ?? 0, count: t._count })),
    };
  }
}

@Controller()
@UseInterceptors(AuditInterceptor)
export class CommissionsController {
  constructor(private commissions: CommissionsService) {}

  @Get('admin/commissions')
  @RequirePermissions('commissions.read')
  list(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('distributorId') distributorId?: string,
    @Query('q') q?: string,
    @Query('page') page = '1',
  ) {
    return this.commissions.findAll(status, type, distributorId, Number(page), q);
  }

  @Get('admin/commissions/stats')
  @RequirePermissions('commissions.read')
  stats() {
    return this.commissions.stats();
  }

  @Post('admin/commissions/:id/approve')
  @RequirePermissions('commissions.manage')
  approve(@Param('id') id: string, @Body(new ZodPipe(approveCommissionSchema)) dto: any) {
    return this.commissions.approve(id, dto);
  }

  @Post('admin/commissions/:id/reject')
  @RequirePermissions('commissions.manage')
  reject(@Param('id') id: string, @Body(new ZodPipe(rejectCommissionSchema)) dto: any) {
    return this.commissions.reject(id, dto);
  }

  @Post('admin/commissions/:id/pay')
  @RequirePermissions('commissions.manage')
  pay(@Param('id') id: string, @Body(new ZodPipe(payCommissionSchema)) dto: any) {
    return this.commissions.markPaid(id, dto);
  }
}

@Module({
  controllers: [CommissionsController],
  providers: [CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
