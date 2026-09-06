import type { CookieOptions, Response } from 'express';
import { config } from '../../config';

export const ACCESS_COOKIE = 'sp_access';
export const REFRESH_COOKIE = 'sp_refresh';

// Durées alignées sur JwtService (access 12h, refresh 30d)
export const ACCESS_MAX_AGE_MS = 12 * 3600 * 1000;
export const REFRESH_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Cross-origin front/API impose SameSite=None + Secure en prod.
    // En dev (http local), Lax non-secure pour rester fonctionnel.
    secure: config.isProd,
    sameSite: config.isProd ? 'none' : 'lax',
    path: '/api',
  };
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
}

export function setAuthCookies(res: Response, tokens: IssuedTokens): void {
  const base = baseOptions();
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: ACCESS_MAX_AGE_MS });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: REFRESH_MAX_AGE_MS });
}

export function clearAuthCookies(res: Response): void {
  const base = baseOptions();
  res.clearCookie(ACCESS_COOKIE, { ...base });
  res.clearCookie(REFRESH_COOKIE, { ...base });
}
