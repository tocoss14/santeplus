import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from './jwt.service';
import { PrismaService } from '../prisma.module';
import { ACCESS_COOKIE } from '../../modules/auth/cookies';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  companyId: string | null;
  providerId: string | null;
}

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest();

    // Routes publiques : identification silencieuse quand même. Un token
    // valide peuple req.user pour que @CurrentUser() fonctionne (ex.
    // /files/:id/view : ouvert aux visiteurs anonymes pour les photos
    // prestataires, mais contingenté aux propriétaires/staff pour le reste).
    // Un token invalide ou absent reste toléré : la route reste publique.
    await this.attachUser(req, { soft: isPublic });

    if (!req.user && !isPublic) throw new UnauthorizedException('Authentification requise');
    return true;
  }

  /**
   * Vérifie le token (header Bearer > cookie httpOnly > query ciblé) et
   * peuple req.user. En mode « soft » (route publique), toute anomalie
   * (absence, token expiré/invalide, compte suspendu) est ignorée en
   * silence ; en mode strict elle lève une UnauthorizedException.
   */
  private async attachUser(req: any, opts: { soft: boolean }): Promise<void> {
    if (req.user) return;

    const header: string | undefined = req.headers['authorization'];
    let rawToken: string | undefined = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    // Repli cookie httpOnly (web migré) — le header Bearer reste prioritaire (transition)
    if (!rawToken && typeof (req.cookies as any)?.[ACCESS_COOKIE] === 'string') {
      rawToken = (req.cookies as any)[ACCESS_COOKIE] as string;
    }

    if (!rawToken && typeof req.query?.token === 'string' && /certificate|attestation/.test(req.originalUrl ?? '')) {
      rawToken = req.query.token as string;
      req.headers['authorization'] = `Bearer ${rawToken}`;
    }
    if (!rawToken) return;

    let payload: any;
    try {
      payload = this.jwt.verify(rawToken);
    } catch {
      if (!opts.soft) throw new UnauthorizedException('Session invalide ou expirée');
      return;
    }
    if (payload.type !== 'access') {
      if (!opts.soft) throw new UnauthorizedException('Token invalide');
      return;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, companyId: true, providerId: true },
    });
    if (!user || user.status === 'SUSPENDED') {
      if (!opts.soft) throw new UnauthorizedException('Compte inactif');
      return;
    }
    (req as any).user = { id: user.id, email: user.email, role: user.role, companyId: user.companyId, providerId: user.providerId } satisfies AuthUser;
  }
}
