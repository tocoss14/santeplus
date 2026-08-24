import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma.module';
import { AuthUser } from './jwt-auth.guard';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);

@Injectable()
export class PermissionsGuard implements CanActivate {
  private cache = new Map<string, { keys: Set<string>; loadedAt: number }>();
  private TTL = 30_000;

  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  invalidate() {
    this.cache.clear();
  }

  private async roleKeys(role: string): Promise<Set<string>> {
    const hit = this.cache.get(role);
    if (hit && Date.now() - hit.loadedAt < this.TTL) return hit.keys;
    const rows = await this.prisma.rolePermission.findMany({ where: { role } });
    const keys = new Set(rows.map(r => r.permissionKey));
    this.cache.set(role, { keys, loadedAt: Date.now() });
    return keys;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = (req as any).user;
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    const keys = await this.roleKeys(user.role);
    const allowed = required.some(k => {
      if (keys.has(k)) return true;
      for (const held of keys) {
        if (held.endsWith('.*') && k.startsWith(held.slice(0, -1))) return true;
      }
      return false;
    });
    if (!allowed) throw new ForbiddenException('Accès refusé');
    return true;
  }
}
