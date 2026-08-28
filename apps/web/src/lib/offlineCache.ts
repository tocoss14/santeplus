// localStorage cache for plafonds/guarantees per patient, TTL 36h (mid of 24-48h)
// Refreshed on each successful verify.

const TTL_MS = 36 * 60 * 60 * 1000; // 36h
const PREFIX = 'sp_guarantees:';

interface CacheEntry<T = any> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage;
  } catch {
    return false;
  }
}

// In-memory fallback for SSR / tests where localStorage is not available
const memFallback = new Map<string, string>();

function getStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } {
  if (storageAvailable()) return localStorage;
  return {
    getItem: (k: string) => memFallback.get(k) ?? null,
    setItem: (k: string, v: string) => { memFallback.set(k, v); },
    removeItem: (k: string) => { memFallback.delete(k); },
  };
}

function keyFor(memberNumber: string): string {
  return `${PREFIX}${memberNumber.trim().toUpperCase()}`;
}

export function cacheGuarantees(memberNumber: string, data: any): void {
  if (!memberNumber) return;
  const now = Date.now();
  const entry: CacheEntry = { data, cachedAt: now, expiresAt: now + TTL_MS };
  try {
    getStorage().setItem(keyFor(memberNumber), JSON.stringify(entry));
  } catch {
    // quota exceeded — attempt to evict oldest entry
    try {
      const s = getStorage();
      // simple eviction: clear one random
      s.removeItem(keyFor(memberNumber));
      s.setItem(keyFor(memberNumber), JSON.stringify(entry));
    } catch { /* ignore */ }
  }
}

export function getCachedGuarantees<T = any>(memberNumber: string): T | null {
  if (!memberNumber) return null;
  const raw = getStorage().getItem(keyFor(memberNumber));
  if (!raw) return null;
  try {
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      getStorage().removeItem(keyFor(memberNumber));
      return null;
    }
    return entry.data as T;
  } catch {
    getStorage().removeItem(keyFor(memberNumber));
    return null;
  }
}

export function clearCachedGuarantees(memberNumber: string): void {
  getStorage().removeItem(keyFor(memberNumber));
}

export function clearAllGuaranteesCache(): void {
  const s = getStorage();
  if (storageAvailable()) {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) toRemove.push(k);
    }
    toRemove.forEach(k => s.removeItem(k));
  } else {
    for (const k of Array.from(memFallback.keys())) {
      if (k.startsWith(PREFIX)) memFallback.delete(k);
    }
  }
}

// For testing: allow injecting TTL check
export const _internals = { TTL_MS, PREFIX, memFallback };
