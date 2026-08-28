// IndexedDB queue (plain indexedDB, no external dep) for offline deliveries.
// Interface: enqueueDelivery(payload, hash), syncQueue(): Promise<{synced, conflicts}>, getQueue(), clearQueue()
// Hash = SHA-256(payload + sessionToken) hex. Store: { id, payload, hash, timestamp, sessionKey }.

import { API_BASE, TOKEN_KEY } from '../api';

export interface QueuedDelivery {
  id: string;
  payload: any;
  hash: string;
  timestamp: number;
  sessionKey: string;
}

const DB_NAME = 'santeplus_offline';
const DB_VERSION = 1;
const STORE = 'deliveries';

// In-memory fallback for environments without IndexedDB (tests / SSR)
let memQueue: QueuedDelivery[] = [];
let useMemory = false;

function hasIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB.open;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      useMemory = true;
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>): Promise<T> {
  if (useMemory || !hasIndexedDB()) {
    throw new Error('memory');
  }
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let req: any;
    try {
      req = fn(store);
    } catch (e) {
      reject(e);
      return;
    }
    if (req && typeof req.onsuccess !== 'undefined') {
      (req as IDBRequest<T>).onsuccess = () => resolve((req as IDBRequest<T>).result);
      (req as IDBRequest<T>).onerror = () => reject((req as IDBRequest<T>).error);
    } else {
      (req as Promise<T>).then(resolve, reject);
    }
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

// Hash = SHA-256( JSON.stringify(payload) + sessionToken ) hex
export async function computeHash(payload: any, sessionToken: string): Promise<string> {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const data = payloadStr + (sessionToken ?? '');
  // Prefer Web Crypto
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const enc = new TextEncoder().encode(data);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: Node crypto if available (tests) — dynamic
  try {
    // @ts-ignore
    const nodeCrypto = await import('crypto');
    const createHash = (nodeCrypto as any).createHash ?? (nodeCrypto as any).default?.createHash;
    if (createHash) return createHash('sha256').update(data).digest('hex');
  } catch { /* ignore */ }
  // Last resort: simple hash (not cryptographically strong, but deterministic for tests)
  let h = 0;
  for (let i = 0; i < data.length; i++) h = (Math.imul(31, h) + data.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, '0');
}

export async function enqueueDelivery(payload: any, hash: string, sessionKey?: string): Promise<string> {
  const token = sessionKey ?? (typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null) ?? 'offline';
  const id = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const entry: QueuedDelivery = { id, payload, hash, timestamp: Date.now(), sessionKey: token };
  if (useMemory || !hasIndexedDB()) {
    useMemory = true;
    memQueue.push(entry);
    return id;
  }
  try {
    await withStore('readwrite', store => store.add(entry));
    return id;
  } catch {
    // fallback to memory if IDB fails
    useMemory = true;
    memQueue.push(entry);
    return id;
  }
}

// Helper to compute and enqueue in one call
export async function enqueueDeliveryWithHash(payload: any, sessionToken?: string): Promise<string> {
  const token = sessionToken ?? (typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null) ?? 'offline';
  const hash = await computeHash(payload, token);
  return enqueueDelivery(payload, hash, token);
}

export async function getQueue(): Promise<QueuedDelivery[]> {
  if (useMemory || !hasIndexedDB()) return [...memQueue];
  try {
    return await withStore('readonly', store => store.getAll());
  } catch {
    useMemory = true;
    return [...memQueue];
  }
}

export async function clearQueue(): Promise<void> {
  if (useMemory || !hasIndexedDB()) {
    memQueue = [];
    return;
  }
  try {
    await withStore('readwrite', store => store.clear());
  } catch {
    memQueue = [];
    useMemory = true;
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  if (useMemory || !hasIndexedDB()) {
    memQueue = memQueue.filter(q => q.id !== id);
    return;
  }
  try {
    await withStore('readwrite', store => store.delete(id));
  } catch {
    memQueue = memQueue.filter(q => q.id !== id);
    useMemory = true;
  }
}

// For tests: force memory mode and reset
export function _useMemoryFallback(flag: boolean) {
  useMemory = flag;
}
export function _resetMemoryQueue() {
  memQueue = [];
}
export function _getMemoryQueue(): QueuedDelivery[] {
  return memQueue;
}

export async function syncQueue(): Promise<{ synced: number; conflicts: Array<{ id: string; reason: string; status: string }> }> {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, conflicts: [] };
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const body = {
    items: queue.map(q => ({ payload: q.payload, hash: q.hash, timestamp: q.timestamp, sessionKey: q.sessionKey, id: q.id })),
  };
  const res = await fetch(`${API_BASE}/api/offline/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    // Network error — do not clear queue, propagate
    throw new Error(data?.message ?? `Sync failed ${res.status}`);
  }
  // Server returns { synced, conflicts, succeededIds? }
  // Expect conflicts to contain ids that failed; synced are to be removed
  const conflicts: Array<{ id: string; reason: string; status: string }> = data?.conflicts ?? [];
  const conflictIds = new Set(conflicts.map((c: any) => c.id));
  // Remove successful items from queue (synced items are those not in conflicts)
  // If server returns succeededIds use it; otherwise assume synced = total - conflicts
  const succeededIds: string[] = data?.succeededIds ?? queue.filter(q => !conflictIds.has(q.id)).map(q => q.id);
  for (const id of succeededIds) {
    await removeFromQueue(id);
  }
  // Conflicts remain in queue for manual review? Spec says alert manager, not silent drop.
  // We keep conflicts in queue so user can retry after correction — but remove if server says CONFLICT permanent?
  // For double délivrance we keep alert but remove conflict entry after server reports? Spec says must alert manager, not be lost.
  // We will keep conflicts queued but also return them so UI can show.
  return { synced: data?.synced ?? succeededIds.length, conflicts };
}
