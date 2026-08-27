export const TOKEN_KEY = 'sp_access';

const API_BASE = ((import.meta as any).env?.VITE_API_URL ?? 'https://santeplus.runsite.app').replace(/\/$/, '');

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(data?.message ?? `Erreur ${status}`);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T = any>(p: string): Promise<T> => request<T>(p),
  post: <T = any>(p: string, body?: any): Promise<T> =>
    request<T>(p, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T = any>(p: string, body?: any): Promise<T> => request<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T = any>(p: string): Promise<T> => request<T>(p, { method: 'DELETE' }),
};

export function fileUrl(id: string): string {
  return `${API_BASE}/api/files/${id}/view`;
}
