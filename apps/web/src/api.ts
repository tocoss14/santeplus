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
// Exporté pour les sondes de session (AuthProvider) : évite le GET /auth/me
// invariablement en 401 pour les visiteurs non connectés (erreur console + surcoût refresh).
let refreshPromise: Promise<boolean> | null = null;
export function silentRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    // Sonde 200-toujours : un visiteur sans session obtient {authenticated:false}
    // au lieu d'un 401 (que le navigateur loggerait en console quoi qu'il arrive).
    // Repli sur /auth/refresh si l'endpoint n'est pas encore déployé (404).
    refreshPromise = fetch(`${API_BASE}/api/auth/session-probe`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(async r => {
        if (r.status === 404) {
          const legacy = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' }, body: '{}',
          });
          return legacy.ok;
        }
        if (!r.ok) return false;
        const data = await r.json().catch(() => null);
        return !!data?.authenticated;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * `api.*` ne lit que du JSON : une route qui sert un fichier (PDF, CSV, image)
 * renvoie un flux binaire, jamais un objet. Sans cette distinction, l'écran
 * affiche « vérifiez le routage /api » alors que l'API répond correctement, et
 * l'utilisateur cherche une panne de proxy au lieu d'ouvrir le document.
 * Retourne un libellé lisible du fichier, ou null si ce n'est pas un fichier.
 */
function binaryLabel(mime: string, body: string): string | null {
  if (mime === 'application/pdf') return 'un PDF';
  if (mime === 'text/csv' || mime === 'application/csv') return 'un fichier CSV';
  if (mime === 'application/zip') return 'une archive ZIP';
  if (mime === 'application/octet-stream') return 'un fichier binaire';
  if (mime.startsWith('image/')) return 'une image';
  if (mime.startsWith('audio/')) return 'un fichier audio';
  if (mime.startsWith('video/')) return 'une vidéo';
  if (mime.startsWith('font/')) return 'une police';
  if (/(sheet|excel|word|officedocument|opendocument)/.test(mime)) return 'un document bureautique';
  // En-tête absent ou trompeur : on reconnaît la signature du fichier.
  if (body.startsWith('%PDF-')) return 'un PDF';
  if (body.startsWith('PK\u0003\u0004')) return 'une archive ZIP';
  if (body.startsWith('GIF87a') || body.startsWith('GIF89a')) return 'une image GIF';
  return null;
}

/** Message d'erreur d'une réponse que `JSON.parse` a refusée. */
function nonJsonMessage(res: Response, body: string): string {
  const mime = (res.headers?.get?.('content-type') ?? '').split(';')[0].trim().toLowerCase();
  // Une page HTML en 5xx n'est pas un fallback SPA : le statut dit que le serveur
  // a échoué, et l'indice « vérifiez le routage /api » enverrait chercher une
  // panne de proxy au lieu de constater que l'API est tombée.
  if (res.status >= 500) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return (
        `API indisponible (statut ${res.status}) — le service ne répond pas ` +
        `(arrêt ou redémarrage en cours) ; réessayez dans un instant`
      );
    }
    return (
      `Erreur serveur de l'API (statut ${res.status}) — le service a échoué côté serveur ; ` +
      `réessayez dans un instant et vérifiez les logs de l'API`
    );
  }
  const label = binaryLabel(mime, body);
  if (label) {
    return (
      `Réponse non JSON : cette route renvoie ${label} (statut ${res.status}) — ` +
      `ouvrez-la par un lien ou un téléchargement (window.open, <a download>, fileUrl) ` +
      `au lieu de l'appeler avec api.*`
    );
  }
  if (mime === 'text/html' || /^\s*(<!doctype html|<html)/i.test(body)) {
    return `Réponse non JSON de l'API (statut ${res.status}) — vérifiez le routage /api (VITE_API_URL ou reverse proxy)`;
  }
  if (mime.startsWith('text/')) {
    return `Réponse non JSON (texte brut) de l'API (statut ${res.status}) — la route doit renvoyer un objet JSON`;
  }
  return `Réponse non JSON de l'API (statut ${res.status}) — vérifiez le routage /api (VITE_API_URL ou reverse proxy)`;
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
    // Une réponse non-JSON (fichier servi par la route, HTML du fallback SPA,
    // page d'erreur…) ne doit jamais masquer le vrai statut HTTP — erreur
    // réseau explicite, dont le message dit quoi corriger.
    const err = new ApiError(res.status, { message: nonJsonMessage(res, text) });
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
