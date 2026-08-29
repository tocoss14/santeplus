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

  @Get('anomalies/summary')
  @RequirePermissions('audit.view')
  async anomaliesSummary() {
    const [total, recent] = await Promise.all([
      (this.prisma as any).auditLog.count({ where: { action: 'FRAUD_ALERT' } }),
      (this.prisma as any).auditLog.findMany({
        where: { action: 'FRAUD_ALERT', createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        select: { meta: true },
      }),
    ]);
    let zCount = 0;
    let cumulCount = 0;
    for (const r of recent) {
      try {
        const m = JSON.parse(r.meta);
        if (m?.type === 'CUMUL') cumulCount++;
        else zCount++;
      } catch { zCount++; }
    }
    return { total, last7Days: recent.length, zScoreAlertsLast7Days: zCount, cumulAlertsLast7Days: cumulCount };
  }

  @Get('anomalies')
  @RequirePermissions('audit.view')
  async anomalies() {
    const alerts = await (this.prisma as any).auditLog.findMany({
      where: { action: 'FRAUD_ALERT' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    let notifFallback: any[] = [];
    try {
      const notifs = await (this.prisma as any).notification.findMany({
        where: { topic: 'FRAUD_ALERT' },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      notifFallback = notifs;
    } catch {}
    const parse = (row: any) => {
      let meta: any = null;
      try { meta = row.meta ? JSON.parse(row.meta) : null; } catch { meta = row.meta; }
      return { ...row, meta };
    };
    return {
      items: alerts.map(parse),
      notifications: notifFallback.map(parse),
      total: alerts.length,
    };
  }

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
