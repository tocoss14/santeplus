import { describe, expect, it, vi } from 'vitest';
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
