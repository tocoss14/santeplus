import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'santeplus-api', time: new Date().toISOString() };
  }
}

@Controller('admin')
export class AdminMiscController {
  constructor(private prisma: PrismaService) {}

  @Get('audit')
  @RequirePermissions('audit.view')
  async audit(@Query('page') page = '1', @Query('q') q?: string, @Query('userId') userId?: string) {
    const where: any = {};
    if (userId) where.userId = userId;
    if (q) where.OR = [{ action: { contains: q } }, { entityType: { contains: q } }];
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * 30,
        take: 30,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: Number(page), pages: Math.ceil(total / 30) };
  }

  @Get('config')
  @RequirePermissions('config.manage')
  async config() {
    const rows = await this.prisma.systemConfig.findMany();
    return Object.fromEntries(rows.map(r => [r.key, safeParse(r.value)]));
  }

  @Post('config')
  @RequirePermissions('config.manage')
  async setConfig(@Body(new ZodPipe(z.record(z.any()))) body: any) {
    for (const [key, value] of Object.entries(body)) {
      await this.prisma.systemConfig.upsert({
        where: { key },
        update: { value: JSON.stringify(value ?? null) },
        create: { key, value: JSON.stringify(value ?? null) },
      });
    }
    return this.config();
  }
}

function safeParse(v: string): any {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

@Module({ controllers: [HealthController, AdminMiscController] })
export class AdminMiscModule {}
