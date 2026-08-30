import { request } from '@playwright/test';

export const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

export function uid() {
  return Math.random().toString(36).slice(2, 8);
}

export async function apiContext() {
  return await request.newContext({ baseURL: API_URL });
}

export async function registerMember(email: string, password = 'Test1234!') {
  const ctx = await apiContext();
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
  const data = await res.json();
  await ctx.dispose();
  return data;
}

export async function login(email: string, password = 'Test1234!') {
  const ctx = await apiContext();
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  if (!res.ok()) throw new Error(`login ${res.status()} ${await res.text()}`);
  const { accessToken } = await res.json();
  await ctx.dispose();
  return accessToken as string;
}

export async function authContext(token: string) {
  return await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}
