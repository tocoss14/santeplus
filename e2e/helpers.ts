import { request, type APIRequestContext } from '@playwright/test';

export const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
// Origin explicite : les contextes API Playwright n'en envoient pas par défaut,
// or le middleware anti-CSRF l'exige sur les mutations authentifiées par cookie.
export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

export function uid() {
  return Math.random().toString(36).slice(2, 8);
}

export async function apiContext(): Promise<APIRequestContext> {
  return await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Origin: WEB_ORIGIN },
  });
}

export async function registerMember(email: string, password = 'Test1234!') {
  const ctx = await apiContext();
  try {
    const res = await ctx.post('/api/auth/register', {
      data: {
        firstName: 'Test',
        lastName: 'User' + uid(),
        email,
        password,
        phone: '+229 9' + Math.floor(10000000 + Math.random() * 90000000),
        birthDate: '1990-06-15',
        gender: 'M',
      },
    });
    if (res.status() !== 201 && res.status() !== 200) {
      const body = await res.text();
      throw new Error(`register ${res.status()} ${body}`);
    }
    return await res.json();
  } finally {
    await ctx.dispose();
  }
}

// Auth par cookies httpOnly : le contexte conserve le jar, aucune injection manuelle.
export async function loginAs(email: string, password = 'Test1234!'): Promise<APIRequestContext> {
  const ctx = await apiContext();
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  if (!res.ok()) {
    await ctx.dispose();
    throw new Error(`login ${res.status()} ${await res.text()}`);
  }
  return ctx;
}

export async function cookieNames(ctx: APIRequestContext): Promise<string[]> {
  const state = await ctx.storageState();
  return state.cookies.map(c => c.name);
}
