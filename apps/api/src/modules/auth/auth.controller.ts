import { Body, Controller, Get, Module, Post, Req, Res, UnauthorizedException, UseInterceptors } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditInterceptor } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser, JwtAuthGuard, Public } from '../../common/guards/jwt-auth.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { changePasswordSchema, loginSchema, refreshSchema, registerSchema } from './dto';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './cookies';

@Controller('auth')
@UseInterceptors(AuditInterceptor)
export class AuthController {
  constructor(
    private auth: AuthService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body(new ZodPipe(registerSchema)) dto: any, @Res({ passthrough: true }) res?: Response) {
    const tokens = await this.auth.register(dto);
    // Cookies httpOnly (source de vérité cible) + tokens en body pour transition (web actuel en Bearer)
    if (res) setAuthCookies(res, tokens);
    return tokens;
  }

  @Public()
  @Post('login')
  async login(@Body(new ZodPipe(loginSchema)) dto: any, @Res({ passthrough: true }) res?: Response) {
    const tokens = await this.auth.login(dto);
    // Cookies httpOnly (source de vérité cible) + tokens en body pour transition (web actuel en Bearer)
    if (res) setAuthCookies(res, tokens);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    return { ...tokens, user: this.publicUser(user) };
  }

  /**
   * Sonde de session pour le boot des SPA publiques : répond TOUJOURS 200.
   * - `authenticated: false` pour un visiteur sans session (pas d'erreur console,
   *   pas de tentatives de refresh en cascade côté front).
   * - `authenticated: true` + rotation des cookies si la session est vivante.
   * Remplace le GET /auth/me en 401 invariablement loggé par le navigateur
   * lors du chargement des pages publiques.
   */
  @Public()
  @Post('session-probe')
  async sessionProbe(@Req() req: Request, @Res({ passthrough: true }) res?: Response) {
    const token: string | undefined = (req.cookies as any)?.[REFRESH_COOKIE];
    if (!token) return { authenticated: false };
    try {
      const tokens = await this.auth.refresh(token);
      if (res) setAuthCookies(res, tokens);
      return { authenticated: true, user: this.publicUser((tokens as any).user) };
    } catch {
      return { authenticated: false };
    }
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Body(new ZodPipe(refreshSchema)) dto: any, @Res({ passthrough: true }) res?: Response) {
    // Cookie prioritaire (web migré), body en repli (clients existants)
    const token: string | undefined = (req.cookies as any)?.[REFRESH_COOKIE] ?? dto.refreshToken;
    if (!token) throw new UnauthorizedException('Session expirée, reconnectez-vous');
    const tokens = await this.auth.refresh(token);
    // Rotation : propager les nouveaux cookies (l'ancien refresh est révoqué)
    if (res) setAuthCookies(res, tokens);
    return tokens;
  }

  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res?: Response) {
    const out = await this.auth.logout(user.id);
    if (res) clearAuthCookies(res);
    return out;
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
