import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma.module';

@Controller('notifications')
@UseInterceptors(AuditInterceptor)
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() auth: AuthUser, @Query('unread') unread?: string) {
    return this.prisma.notification.findMany({
      where: { userId: auth.id, ...(unread === 'true' ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Post(':id/read')
  async read(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: auth.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  @Post('read-all')
  async readAll(@CurrentUser() auth: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { userId: auth.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}

@Module({ controllers: [NotificationsController] })
export class NotificationsHttpModule {}
