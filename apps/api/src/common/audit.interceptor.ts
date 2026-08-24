import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from './prisma.module';
import { AuthUser } from './guards/jwt-auth.guard';

export { UseInterceptors } from '@nestjs/common';

const SKIP = [/notifications/, /files\/\d/, /stats/, /dashboard/];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    if (method === 'GET' || SKIP.some(r => r.test(req.path || req.url))) return next.handle();
    const user: AuthUser | undefined = (req as any).user;
    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => void this.log(req, user, method, 'OK', started),
        error: () => void this.log(req, user, method, 'KO', started),
      }),
    );
  }

  private async log(req: any, user: AuthUser | undefined, method: string, status: string, started: number) {
    try {
      const parts: string[] = (req.originalUrl || '').split('/').filter(Boolean);
      await this.prisma.auditLog.create({
        data: {
          userId: user?.id ?? null,
          action: `${method} ${req.route?.path ?? req.originalUrl}`,
          entityType: parts[1] ?? null,
          entityId: typeof req.params?.id === 'string' ? req.params.id : null,
          ip: req.ip,
          status,
          meta: JSON.stringify({ ms: Date.now() - started }),
        },
      });
    } catch {
    }
  }
}
