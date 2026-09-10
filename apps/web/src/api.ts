// Même origine par défaut (le nginx du front proxifie /api/ vers l'API).
// Les Static Sites Runsite n'ont pas de proxy : un front *.runsite.site appelle
// automatiquement le service API jumeau *.runsite.app, car Vite fige VITE_API_URL
// au build. Une valeur explicite de VITE_API_URL garde toujours la priorité.
function defaultApiBaseForHostname(
  hostname: string | undefined,
  protocol = 'https:',
): string {
  const suffix = '.runsite.site';
  if (!hostname) return '';
  const normalized = hostname.toLowerCase();
  if (!normalized.endsWith(suffix)) return '';
  return `${protocol}//${normalized.slice(0, -suffix.length)}.runsite.app`;
}

export function resolveApiBase(
  envValue: string | undefined,
  hostname?: string,
  protocol = 'https:',
): string {
  const configured = (envValue ?? '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (hostname === undefined && typeof window !== 'undefined') {
    return defaultApiBaseForHostname(window.location.hostname, window.location.protocol);
  }
  return defaultApiBaseForHostname(hostname, protocol);
}

const browserLocation = typeof window === 'undefined' ? undefined : window.location;

export const API_BASE = resolveApiBase(
  (import.meta as any).env?.VITE_API_URL,
  browserLocation?.hostname,
  browserLocation?.protocol,
);

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(data?.message ?? `Erreur ${status}`);
    this.status = status;
    this.data = data;
  }
}

// Notification globale des erreurs de chargement (GET) : beaucoup d'écrans avalent
// les erreurs via .catch(() => {}) en affichant une liste vide — le toast garantit
// que l'utilisateur voit AU MOINS une erreur quelque part. Les mutations
// (POST/PATCH/DELETE) sont exclues : elles affichent déjà leur erreur inline dans
// leur formulaire. Idem pour /auth/* et les 401 (gérés par le flux d'authentification
// et le refresh silencieux).
type ApiErrorListener = (err: ApiError) => void;
const apiErrorListeners = new Set<ApiErrorListener>();

export function onApiError(listener: ApiErrorListener): () => void {
  apiErrorListeners.add(listener);
  return () => {
    apiErrorListeners.delete(listener);
  };
}

function emitApiError(err: ApiError, method: string, path: string): void {
  if (method !== 'GET' || path.startsWith('/auth/') || err.status === 401) return;
  for (const fn of apiErrorListeners) fn(err);
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
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    // Auth par cookies httpOnly (sp_access) — envoyés automatiquement (même cross-origin).
    res = await fetch(`${API_BASE}/api${path}`, { ...options, headers, credentials: 'include' });
  } catch {
    // Échec réseau pur (hors ligne, DNS, CORS…) : ne jamais avaler l'erreur.
    const err = new ApiError(0, { message: 'Impossible de contacter le serveur — vérifiez votre connexion' });
    emitApiError(err, method, path);
    throw err;
  }
  // 401 → une tentative de refresh silencieux puis un seul rejeu (hors /auth/*).
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const ok = await silentRefresh();
    if (ok) return request<T>(path, options, false);
  }
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: any = null;
  let parseFailed = false;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    parseFailed = true;
  }
  if (parseFailed) {
    // Une réponse non-JSON (HTML du fallback SPA, page d'erreur, etc.) ne doit
    // jamais masquer le vrai statut HTTP — erreur réseau explicite.
    const err = new ApiError(res.status, { message: `Réponse non JSON de l'API (statut ${res.status}) — vérifiez le routage /api (VITE_API_URL ou reverse proxy)` });
    emitApiError(err, method, path);
    throw err;
  }
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    emitApiError(err, method, path);
    throw err;
  }
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
