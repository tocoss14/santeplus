import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from './jwt.service';
import { PrismaService } from '../prisma.module';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  companyId: string | null;
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
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    let rawToken: string | undefined = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!rawToken && typeof req.query?.token === 'string' && /certificate|attestation/.test(req.originalUrl ?? '')) {
      rawToken = req.query.token as string;
      req.headers['authorization'] = `Bearer ${rawToken}`;
    }
    if (!rawToken) throw new UnauthorizedException('Authentification requise');
    let payload: any;
    try {
      payload = this.jwt.verify(rawToken);
    } catch {
      throw new UnauthorizedException('Session invalide ou expirée');
    }
    if (payload.type !== 'access') throw new UnauthorizedException('Token invalide');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, companyId: true },
    });
    if (!user || user.status === 'SUSPENDED') throw new UnauthorizedException('Compte inactif');
    (req as any).user = { id: user.id, email: user.email, role: user.role, companyId: user.companyId } satisfies AuthUser;
    return true;
  }
}
