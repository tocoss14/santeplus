import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service';

// ─── Mock Prisma ─────────────────────────────────────
function mockPrisma(overrides: Record<string, any> = {}) {
  const store: Record<string, any> = {
    user: { _data: {} as any },
    distributor: { _data: {} as any },
    refreshToken: { _data: [] as any[] },
    notification: { _data: [] as any[] },
  };

  return {
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.email) return store.user._data.email === where.email ? store.user._data : null;
        if (where.id) return store.user._data.id === where.id ? store.user._data : null;
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        store.user._data = { ...data, id: 'user-' + Date.now(), createdAt: new Date() };
        return store.user._data;
      }),
      count: vi.fn(async () => 0),
      update: vi.fn(async ({ data }: any) => {
        store.user._data = { ...store.user._data, ...data };
        return store.user._data;
      }),
    },
    distributor: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.referralCode) {
          return store.distributor._data.referralCode === where.referralCode ? store.distributor._data : null;
        }
        return store.distributor._data.id === where.id ? store.distributor._data : null;
      }),
      update: vi.fn(async () => ({})),
    },
    refreshToken: {
      create: vi.fn(async ({ data }: any) => {
        store.refreshToken._data.push(data);
        return data;
      }),
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    notification: {
      create: vi.fn(async ({ data }: any) => {
        store.notification._data.push(data);
        return data;
      }),
      findFirst: vi.fn(async () => null),
    },
    _store: store,
  } as any;
}

function mockJwt() {
  return {
    sign: vi.fn((payload: any) => `token-${payload.sub}-${payload.type}`),
    verify: vi.fn((token: string) => ({ sub: 'user-1', role: 'MEMBER', type: token.includes('refresh') ? 'refresh' : 'access' })),
  } as any;
}

function mockDispatch() {
  return {
    dispatchToUser: vi.fn(async () => {}),
    dispatchToMany: vi.fn(async () => {}),
  } as any;
}

// ─── Tests ───────────────────────────────────────────
describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof mockPrisma>;
  let jwt: ReturnType<typeof mockJwt>;
  let dispatch: ReturnType<typeof mockDispatch>;

  beforeEach(() => {
    prisma = mockPrisma();
    jwt = mockJwt();
    dispatch = mockDispatch();
    service = new AuthService(prisma as any, jwt, dispatch);
  });

  describe('register', () => {
    it('creates a new user with valid data', async () => {
      const result = await service.register({
        email: 'test@example.com',
        password: 'Password123',
        firstName: 'Jean',
        lastName: 'Dupont',
      });
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(prisma.user.create).toHaveBeenCalledOnce();
      expect(dispatch.dispatchToUser).toHaveBeenCalledOnce();
      expect(dispatch.dispatchToUser.mock.calls[0][1].topic).toBe('WELCOME');
    });

    it('rejects duplicate email', async () => {
      prisma.user.findUnique = vi.fn(async ({ where }: any) => {
        if (where.email === 'existing@example.com') return { email: 'existing@example.com', id: 'existing' };
        return null;
      });
      await expect(
        service.register({
          email: 'existing@example.com',
          password: 'Password123',
          firstName: 'Jean',
          lastName: 'Dupont',
        }),
      ).rejects.toThrow('Un compte existe déjà');
    });

    it('links distributor when valid referral code provided', async () => {
      prisma.distributor.findUnique = vi.fn(async ({ where }: any) => {
        if (where.referralCode === 'ABC123') return { id: 'dist-1', referralCode: 'ABC123', status: 'ACTIVE' };
        return null;
      });
      await service.register({
        email: 'new@example.com',
        password: 'Password123',
        firstName: 'Parrainé',
        lastName: 'Test',
        referralCode: 'ABC123',
      });
      expect(prisma.user.create).toHaveBeenCalled();
      const createData = prisma.user.create.mock.calls[0][0].data;
      expect(createData.referredById).toBe('dist-1');
    });

    it('ignores invalid referral code silently', async () => {
      await service.register({
        email: 'new@example.com',
        password: 'Password123',
        firstName: 'Test',
        lastName: 'User',
        referralCode: 'INVALID',
      });
      const createData = prisma.user.create.mock.calls[0][0].data;
      expect(createData.referredById).toBeNull();
    });

    it('ignores inactive distributor referral code', async () => {
      prisma.distributor.findUnique = vi.fn(async ({ where }: any) => {
        if (where.referralCode === 'SUSP01') return { id: 'dist-suspended', referralCode: 'SUSP01', status: 'SUSPENDED' };
        return null;
      });
      await service.register({
        email: 'new@example.com',
        password: 'Password123',
        firstName: 'Test',
        lastName: 'User',
        referralCode: 'SUSP01',
      });
      const createData = prisma.user.create.mock.calls[0][0].data;
      expect(createData.referredById).toBeNull();
    });

    it('sends welcome notification with topic WELCOME', async () => {
      await service.register({
        email: 'welcome@test.com',
        password: 'Password123',
        firstName: 'Accueil',
        lastName: 'Test',
      });
      expect(dispatch.dispatchToUser).toHaveBeenCalled();
      const call = dispatch.dispatchToUser.mock.calls[0];
      expect(call[1].topic).toBe('WELCOME');
      expect(call[1].title).toContain('Accueil');
    });
  });

  describe('login', () => {
    beforeEach(() => {
      prisma.user.findUnique = vi.fn(async ({ where }: any) => {
        if (where.email === 'user@test.com') return {
          id: 'user-1',
          email: 'user@test.com',
          passwordHash: '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ12',
          role: 'MEMBER',
          status: 'ACTIVE',
        };
        return null;
      });
    });

    it('rejects wrong password', async () => {
      const bcrypt = require('bcryptjs');
      const orig = bcrypt.compare;
      bcrypt.compare = vi.fn(async () => false);
      try {
        await expect(
          service.login({ email: 'user@test.com', password: 'wrong' }),
        ).rejects.toThrow('Email ou mot de passe incorrect');
      } finally {
        bcrypt.compare = orig;
      }
    });

    it('rejects unknown email', async () => {
      prisma.user.findUnique = vi.fn(async () => null);
      await expect(
        service.login({ email: 'unknown@test.com', password: 'Password123' }),
      ).rejects.toThrow('Email ou mot de passe incorrect');
    });

    it('rejects suspended account', async () => {
      prisma.user.findUnique = vi.fn(async ({ where }: any) => {
        if (where.email === 'user@test.com') return {
          id: 'user-1',
          email: 'user@test.com',
          passwordHash: '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ12',
          role: 'MEMBER',
          status: 'SUSPENDED',
        };
        return null;
      });
      const bcrypt = require('bcryptjs');
      const orig = bcrypt.compare;
      bcrypt.compare = vi.fn(async () => true);
      try {
        await expect(
          service.login({ email: 'user@test.com', password: 'Password123' }),
        ).rejects.toThrow('suspendu');
      } finally {
        bcrypt.compare = orig;
      }
    });
  });

  describe('rate limiting', () => {
    it('locks account after 5 failed attempts', async () => {
      prisma.user.findUnique = vi.fn(async () => null);
      for (let i = 0; i < 5; i++) {
        try {
          await service.login({ email: 'brute@test.com', password: 'wrong' });
        } catch {}
      }
      // 6th attempt should be locked
      await expect(
        service.login({ email: 'brute@test.com', password: 'wrong' }),
      ).rejects.toThrow('Trop de tentatives');
    });
  });

  describe('anti-fraude: max 5 signups/day', () => {
    it('blocks registration when distributor has 5+ signups today', async () => {
      prisma.distributor.findUnique = vi.fn(async ({ where }: any) => {
        if (where.referralCode === 'LIMIT1') {
          return { id: 'dist-limit', referralCode: 'LIMIT1', status: 'ACTIVE' };
        }
        return null;
      });
      prisma.user.count = vi.fn(async () => 5); // already 5 today

      await expect(
        service.register({
          email: 'extra@test.com',
          password: 'Password123',
          firstName: 'Extra',
          lastName: 'User',
          referralCode: 'LIMIT1',
        }),
      ).rejects.toThrow('limite quotidienne');
    });

    it('allows registration when under limit', async () => {
      prisma.distributor.findUnique = vi.fn(async ({ where }: any) => {
        if (where.referralCode === 'OKCODE') {
          return { id: 'dist-ok', referralCode: 'OKCODE', status: 'ACTIVE' };
        }
        return null;
      });
      prisma.user.count = vi.fn(async () => 3); // only 3 today

      const result = await service.register({
        email: 'ok@test.com',
        password: 'Password123',
        firstName: 'OK',
        lastName: 'User',
        referralCode: 'OKCODE',
      });
      expect(result.accessToken).toBeDefined();
    });
  });
});
