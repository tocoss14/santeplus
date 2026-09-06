export const API_BASE = ((import.meta as any).env?.VITE_API_URL ?? 'https://santeplus.runsite.app').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(data?.message ?? `Erreur ${status}`);
    this.status = status;
    this.data = data;
  }
}

// Renouvellement silencieux : un seul vol en cours partagé entre les requêtes
// concurrentes (anti-rafale), une seule tentative par requête (anti-boucle).
let refreshPromise: Promise<boolean> | null = null;
function silentRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(r => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  // Auth par cookies httpOnly (sp_access) — envoyés automatiquement (même cross-origin).
  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers, credentials: 'include' });
  // 401 → une tentative de refresh silencieux puis un seul rejeu (hors /auth/*).
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const ok = await silentRefresh();
    if (ok) return request<T>(path, options, false);
  }
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
