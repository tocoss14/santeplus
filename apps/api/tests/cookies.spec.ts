import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE_MS,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_MS,
  clearAuthCookies,
  setAuthCookies,
} from '../src/modules/auth/cookies';

function mockRes() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as any;
}

describe('cookies httpOnly (sp_access / sp_refresh)', () => {
  it('pose les deux cookies httpOnly, Path /api, durées 12h/30d', () => {
    const res = mockRes();
    setAuthCookies(res, { accessToken: 'a', refreshToken: 'r' });
    expect(res.cookie).toHaveBeenCalledTimes(2);
    const [[n1, v1, o1], [n2, v2, o2]] = res.cookie.mock.calls;
    expect(n1).toBe(ACCESS_COOKIE);
    expect(v1).toBe('a');
    expect(n2).toBe(REFRESH_COOKIE);
    expect(v2).toBe('r');
    for (const o of [o1, o2]) {
      expect(o.httpOnly).toBe(true);
      expect(o.path).toBe('/api');
    }
    expect(o1.maxAge).toBe(ACCESS_MAX_AGE_MS);
    expect(o2.maxAge).toBe(REFRESH_MAX_AGE_MS);
  });

  it('efface avec les mêmes attributs (sinon suppression inopérante)', () => {
    const res = mockRes();
    clearAuthCookies(res);
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
    const [[n1, o1], [n2, o2]] = res.clearCookie.mock.calls;
    expect(n1).toBe(ACCESS_COOKIE);
    expect(n2).toBe(REFRESH_COOKIE);
    for (const o of [o1, o2]) {
      expect(o.httpOnly).toBe(true);
      expect(o.path).toBe('/api');
    }
  });

  it('hors prod : Secure=false, SameSite=lax (fonctionnel en http local)', () => {
    const res = mockRes();
    setAuthCookies(res, { accessToken: 'a', refreshToken: 'r' });
    const [, , o] = res.cookie.mock.calls[0];
    expect(o.secure).toBe(false);
    expect(o.sameSite).toBe('lax');
  });
});

// Le front est servi par un CDN (Cloudflare Pages / Vercel) sur un autre origine que
// l'API. Sans SameSite=None; Secure, le navigateur refuse les cookies de session et
// l'utilisateur est déconnecté sur chaque navigation. config.ts lit NODE_ENV au
// chargement du module : il faut recharger les modules pour tester la branche prod.
describe('cookies en production (cross-origine)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('pose SameSite=None + Secure : requis pour le proxy /api', async () => {
    const { setAuthCookies: setProdCookies } = await import('../src/modules/auth/cookies');
    const res = mockRes();
    setProdCookies(res, { accessToken: 'a', refreshToken: 'r' });
    expect(res.cookie).toHaveBeenCalledTimes(2);
    for (const [, , o] of res.cookie.mock.calls) {
      expect(o.sameSite).toBe('none');
      expect(o.secure).toBe(true);
      expect(o.httpOnly).toBe(true);
      expect(o.path).toBe('/api');
    }
  });

  it('efface avec les MEMES attributs (sinon la suppression est inopérante)', async () => {
    const { clearAuthCookies: clearProdCookies } = await import('../src/modules/auth/cookies');
    const res = mockRes();
    clearProdCookies(res);
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
    for (const [, o] of res.clearCookie.mock.calls) {
      expect(o.sameSite).toBe('none');
      expect(o.secure).toBe(true);
      expect(o.path).toBe('/api');
    }
  });
});
