import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computeHash, enqueueDelivery, getQueue, clearQueue, _useMemoryFallback, _resetMemoryQueue, syncQueue } from './offlineQueue';

// Force memory fallback in Node (no IndexedDB)
beforeEach(async () => {
  _useMemoryFallback(true);
  _resetMemoryQueue();
  await clearQueue();
  // mock fetch globally
  // @ts-ignore
  global.fetch = vi.fn(async (url: string, opts: any) => {
    const body = JSON.parse(opts.body);
    // Emulate server hash check: recompute SHA-256(JSON.stringify(payload)+sessionKey) via Node crypto
    const { createHash } = await import('crypto');
    const conflicts: any[] = [];
    let synced = 0;
    for (const item of body.items) {
      const expected = createHash('sha256').update(JSON.stringify(item.payload) + item.sessionKey).digest('hex');
      if (expected !== item.hash) {
        conflicts.push({ id: item.id, reason: 'Hash invalide — données altérées', status: 'CONFLICT' });
        continue;
      }
      // simulate double délivrance check: if payload has lines with quantity exceeding remaining (mock: quantity > 5 is conflict)
      const hasConflictLine = item.payload?.lines?.some((l: any) => l.quantity > 5);
      if (hasConflictLine) {
        conflicts.push({ id: item.id, reason: 'Quantité déjà délivrée', status: 'CONFLICT' });
        continue;
      }
      synced++;
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ synced, conflicts, succeededIds: body.items.filter((i: any) => !conflicts.find((c: any) => c.id === i.id)).map((i: any) => i.id) }),
    } as any;
  });
  // Mock localStorage token
  // @ts-ignore
  global.localStorage = { getItem: () => 'test-session-token', setItem: () => {}, removeItem: () => {} } as any;
  try {
    // @ts-ignore
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
  } catch { /* ignore */ }
});

describe('offlineQueue', () => {
  it('enqueue then getQueue returns stored item', async () => {
    const payload = { prescriptionNumber: 'ORD-2026-000001', lines: [{ lineId: 'L1', quantity: 2 }] };
    const hash = await computeHash(payload, 'test-session-token');
    await enqueueDelivery(payload, hash, 'test-session-token');
    const q = await getQueue();
    expect(q.length).toBe(1);
    expect(q[0].payload).toEqual(payload);
    expect(q[0].hash).toBe(hash);
    expect(q[0].sessionKey).toBe('test-session-token');
  });

  it('hash mismatch is detected on server sync (conflict)', async () => {
    const payload = { prescriptionNumber: 'ORD-2026-000002', lines: [{ lineId: 'L1', quantity: 1 }] };
    const goodHash = await computeHash(payload, 'test-session-token');
    // tamper payload after hash — enqueue with good hash but modified payload would be mismatch
    // Here we enqueue with WRONG hash to simulate tampering
    const badHash = '0'.repeat(64);
    expect(badHash).not.toBe(goodHash);
    await enqueueDelivery(payload, badHash, 'test-session-token');
    const res = await syncQueue();
    expect(res.conflicts.length).toBe(1);
    expect(res.conflicts[0].reason).toMatch(/Hash invalide/);
    expect(res.synced).toBe(0);
    // conflict stays in queue (not silently dropped)
    const q = await getQueue();
    expect(q.length).toBe(1);
  });

  it('sync removes only synced items, keeps conflicts', async () => {
    const p1 = { prescriptionNumber: 'ORD-1', lines: [{ lineId: 'L1', quantity: 1 }] };
    const p2 = { prescriptionNumber: 'ORD-2', lines: [{ lineId: 'L2', quantity: 10 }] }; // quantity >5 triggers double-delivery conflict in mock
    const h1 = await computeHash(p1, 'test-session-token');
    const h2 = await computeHash(p2, 'test-session-token');
    await enqueueDelivery(p1, h1, 'test-session-token');
    await enqueueDelivery(p2, h2, 'test-session-token');
    const res = await syncQueue();
    expect(res.synced).toBe(1);
    expect(res.conflicts.length).toBe(1);
    expect(res.conflicts[0].reason).toMatch(/Quantité déjà délivrée/);
    const q = await getQueue();
    expect(q.length).toBe(1);
    expect(q[0].payload.prescriptionNumber).toBe('ORD-2');
  });

  it('sync conflict detection for double délivrance', async () => {
    const payload = { prescriptionNumber: 'ORD-3', lines: [{ lineId: 'L1', quantity: 10 }] };
    const hash = await computeHash(payload, 'test-session-token');
    await enqueueDelivery(payload, hash, 'test-session-token');
    const res = await syncQueue();
    expect(res.conflicts[0].reason).toBe('Quantité déjà délivrée');
  });

  it('clearQueue empties queue', async () => {
    const payload = { prescriptionNumber: 'ORD-4', lines: [{ lineId: 'L1', quantity: 1 }] };
    const hash = await computeHash(payload, 'test-session-token');
    await enqueueDelivery(payload, hash, 'test-session-token');
    await clearQueue();
    expect(await getQueue()).toEqual([]);
  });
});
