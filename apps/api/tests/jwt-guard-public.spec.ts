import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';

function guardWith(payload: any) {
  const reflector: any = { getAllAndOverride: vi.fn(() => true) }; // route publique par défaut
  const jwt: any = {
    verify: vi.fn(() => {
      if (payload === 'THROW') throw new Error('jwt expired');
      return payload;
    }),
  };
  const prisma: any = {
    user: { findUnique: vi.fn(async () => ({ id: 'u1', email: 'a@b.bj', role: 'INSURANCE_MANAGER', status: 'ACTIVE', companyId: null, providerId: null })) },
  };
  return { guard: new JwtAuthGuard(reflector, jwt, prisma), jwt, prisma, setPublic: (v: boolean) => (reflector.getAllAndOverride = vi.fn(() => v)) };
}

function ctxWith(req: any) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

function reqWith(authHeader?: string) {
  return { headers: authHeader ? { authorization: authHeader } : {}, cookies: {}, query: {} };
}

describe('JwtAuthGuard — routes publiques (identification silencieuse)', () => {
  it('peuple req.user quand un token Bearer valide est fourni (fix 403 pièces jointes)', async () => {
    const { guard } = guardWith({ sub: 'u1', role: 'INSURANCE_MANAGER', type: 'access' });
    const req = reqWith('Bearer valid.token.here');
    await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
    expect(req.user).toMatchObject({ id: 'u1', role: 'INSURANCE_MANAGER' });
  });

  it('laisse passer un visiteur anonyme sans token (route reste publique)', async () => {
    const { guard } = guardWith('THROW');
    const req = reqWith();
    await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('tolère un token expiré/invalide sans lever (route reste publique)', async () => {
    const { guard } = guardWith('THROW');
    const req = reqWith('Bearer expired.token');
    await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('ignore un refresh token (seul un access token identifie)', async () => {
    const { guard } = guardWith({ sub: 'u1', role: 'MEMBER', type: 'refresh' });
    const req = reqWith('Bearer refresh.token');
    await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('ignore un compte suspendu', async () => {
    const { guard, prisma } = guardWith({ sub: 'u1', role: 'MEMBER', type: 'access' });
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', status: 'SUSPENDED' });
    const req = reqWith('Bearer valid.token');
    await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });
});

describe('JwtAuthGuard — routes protégées (comportement strict inchangé)', () => {
  it('lève sans token', async () => {
    const { guard, setPublic } = guardWith({ sub: 'u1', type: 'access' });
    setPublic(false);
    await expect(guard.canActivate(ctxWith(reqWith()))).rejects.toThrow(UnauthorizedException);
  });

  it('lève avec un token invalide', async () => {
    const { guard, setPublic } = guardWith('THROW');
    setPublic(false);
    await expect(guard.canActivate(ctxWith(reqWith('Bearer bad')))).rejects.toThrow('Session invalide ou expirée');
  });

  it('peuple req.user avec un token valide', async () => {
    const { guard, setPublic } = guardWith({ sub: 'u1', role: 'MEMBER', type: 'access' });
    setPublic(false);
    const req = reqWith('Bearer valid.token');
    await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
    // Le rôle vient de la base (guard rechargé), pas du payload JWT.
    expect(req.user).toMatchObject({ id: 'u1', role: 'INSURANCE_MANAGER' });
  });
});
