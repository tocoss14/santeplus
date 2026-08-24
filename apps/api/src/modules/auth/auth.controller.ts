import { Body, Controller, Get, Module, Post, UseInterceptors } from '@nestjs/common';
import { AuditInterceptor } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser, JwtAuthGuard, Public } from '../../common/guards/jwt-auth.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { changePasswordSchema, loginSchema, refreshSchema, registerSchema } from './dto';
import { AuthService } from './auth.service';

@Controller('auth')
@UseInterceptors(AuditInterceptor)
export class AuthController {
  constructor(
    private auth: AuthService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Post('register')
  register(@Body(new ZodPipe(registerSchema)) dto: any) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  async login(@Body(new ZodPipe(loginSchema)) dto: any) {
    const tokens = await this.auth.login(dto);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    return { ...tokens, user: this.publicUser(user) };
  }

  @Public()
  @Post('refresh')
  refresh(@Body(new ZodPipe(refreshSchema)) dto: any) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('password')
  changePassword(@CurrentUser() user: AuthUser, @Body(new ZodPipe(changePasswordSchema)) dto: any) {
    return this.auth.changePassword(user.id, dto);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const full = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { company: { select: { id: true, name: true, status: true } } },
    });
    const unread = await this.prisma.notification.count({ where: { userId: user.id, readAt: null } });
    return { ...this.publicUser(full), company: (full as any).company ?? null, unreadNotifications: unread };
  }

  private publicUser(u: any) {
    if (!u) return null;
    const {
      passwordHash: _p,
      nationalIdEnc: _n,
      ...rest
    } = u;
    return rest;
  }
}
