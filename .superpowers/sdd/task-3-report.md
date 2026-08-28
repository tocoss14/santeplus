# Task 3 Report — Mode dégradé hors-ligne pharmacie/labo

**Date:** 2026-08-28
**Status:** Done
**Plan:** `docs/superpowers/plans/2026-08-26-santeplus-10-corrections.md` — Task 3

## Summary
Implemented degraded offline mode for pharmacy/lab providers: IndexedDB queue with SHA-256 hash protection, 36h localStorage cache for plafonds/guarantees, unmistakable offline banner with auto-sync and retry, and bulk `POST /offline/sync` server endpoint with hash revalidation and double-délivrance conflict detection (no silent drops, manager alerts).

## Commits
- `feat: offline degraded mode for pharmacy/lab with queue, cache, banner and sync endpoint` (pending)
  - Includes: `apps/web/src/lib/offlineQueue.ts`, `apps/web/src/lib/offlineCache.ts`, `apps/web/src/lib/offlineQueue.test.ts`, `apps/web/src/components/OfflineBanner.tsx`, `apps/web/src/pages/provider/ProviderDeliveries.tsx`, `apps/api/src/modules/offline/offline.controller.ts`, `apps/api/src/app.module.ts`, `apps/web/src/pages/admin/AdminProducts.tsx` (tsc fix), `apps/web/package.json`

## Files Changed
- `apps/web/src/lib/offlineCache.ts` (new) — `cacheGuarantees(memberNumber, data)`, `getCachedGuarantees(memberNumber): data|null`, TTL 36h (129600000ms), prefix `sp_guarantees:`, in-memory fallback for tests/SSR, eviction on quota error. Refreshed on each successful `/provider/prescriptions/scan` and `/provider/deliveries` response.
- `apps/web/src/lib/offlineQueue.ts` (new) — Plain `indexedDB` queue `santeplus_offline` v1 store `deliveries` keyPath `id`. Interface: `computeHash(payload, sessionToken): Promise<string>` (WebCrypto Subtle SHA-256 + Node crypto fallback), `enqueueDelivery(payload, hash, sessionKey?)`, `enqueueDeliveryWithHash(payload, sessionToken?)`, `getQueue(): Promise<QueuedDelivery[]>`, `clearQueue()`, `removeFromQueue(id)`, `syncQueue(): Promise<{synced, conflicts}>`. Hash = `SHA-256(JSON.stringify(payload) + sessionToken)` hex. Store shape `{id, payload, hash, timestamp, sessionKey}`. Memory fallback when `indexedDB` unavailable (tests). `syncQueue` POSTs bulk `{items: [{payload, hash, timestamp, sessionKey, id}]}` to `POST /api/offline/sync` with `Authorization` bearer, removes only `succeededIds`, keeps conflicts queued for manual review. Exported test helpers `_useMemoryFallback`, `_resetMemoryQueue`, `_getMemoryQueue`.
- `apps/web/src/components/OfflineBanner.tsx` (new) — Unmistakable indicator `role="alert" aria-live="assertive"` with amber/orange/red `border-b-4`, shows “Mode hors ligne — X délivrances en attente” when `navigator.onLine===false` or `queueCount>0`, plus conflict details with “Alerte gestionnaire envoyée”. Listens to `online`/`offline` events, auto-sync on reconnect with 3 retries exponential backoff (`1s, 2s, 4s`), polls queue every 5s, exposes “Synchroniser maintenant” button when online & queue not empty.
- `apps/web/src/lib/offlineQueue.test.ts` (new, vitest) — 5 cases PASS (memory fallback, mocked fetch with Node crypto recompute): enqueue/getQueue, hash mismatch → CONFLICT “Hash invalide — données altérées” (conflict stays, synced 0), synced vs conflicts filtering (quantity>5 → “Quantité déjà délivrée”), double délivrance conflict, clearQueue.
- `apps/api/src/modules/offline/offline.controller.ts` (new) — `POST /offline/sync` `@RequirePermissions('provider.thirdparty')` with Zod `syncSchema` (`items: 1-50, each {payload, hash, sessionKey, timestamp?, id?}`). For each item: recompute `SHA-256(JSON.stringify(payload)+sessionKey)` via Node `createHash` — mismatch → `{status:'CONFLICT', reason:'Hash invalide — données altérées'}` + `dispatchToMany` managers `OFFLINE_SYNC_CONFLICT`. Validate payload via Zod prescriptionNumber/qrToken/lines, load `Prescription` with lines, check `CANCELLED`/expired, then per-line remaining = `quantity - deliveredQty` — if ≤0 or `req.quantity>remaining` → conflict `{status:'CONFLICT', reason:'Quantité déjà délivrée'}` + `AuditLog` `OFFLINE_SYNC_CONFLICT` + manager alert (double délivrance after reconnect alerts manager, not lost). Otherwise `prisma.$transaction` creates `Delivery`+`Claim` with estimation (`ClaimsService.buildEstimation`), threshold resolution (`resolveThreshold`/`needsPriorAuthorization`), care record event `DELIVERY_CREATED (sync hors-ligne)`. Returns `{synced, conflicts, succeededIds, results}`. No silent drops — conflicts returned with 200 and alert dispatched.
- `apps/api/src/app.module.ts:1,6,26` — Added `import { OfflineModule } from './modules/offline/offline.controller'` and `OfflineModule` to `imports`.
- `apps/web/src/pages/provider/ProviderDeliveries.tsx` (modified) — Integrated `OfflineBanner`, `getQueue`/`syncQueue`/`computeHash`/`enqueueDelivery`/`cacheGuarantees`/`getCachedGuarantees`. On mount + `online` event calls `syncQueue()` (shows synced count, conflicts error). `scan()` caches guarantees on success, fallback to `getCachedGuarantees` when offline/network error. `deliver()` if `!navigator.onLine` → compute hash via `getToken()` and `enqueueDelivery` (no POST), else try `POST /provider/deliveries` via FormData; on network error (`status 0` or fetch/network message or `!navigator.onLine`) enqueue instead. Shows “Mode hors ligne — X en attente” banner and orange queue count bar, disables confirm button label to “Mettre en file d’attente (hors ligne)” when offline, shows “Aucune donnée perdue” hints. Estimation fallback uses cached guarantees if offline.
- `apps/web/src/pages/admin/AdminProducts.tsx:58,80` — Fixed pre-existing `Field` `className` prop error blocking `tsc` (wrapped in `<div className="flex-1">`).
- `apps/web/package.json` — Added `vitest@1.6.1` devDependency for `offlineQueue.test.ts`.

## Tests
- `apps/web: npx vitest run src/lib/offlineQueue.test.ts --reporter=verbose` → **5/5 PASS** (enqueue, hash mismatch detected on sync, synced vs conflicts, double délivrance, clearQueue).
- `apps/api: npx vitest run` → **41/41 PASS** across 4 files (`engine`, `payment-mapping`, `emergency-override`, `threshold` — no regressions).
- `apps/web: npx tsc --noEmit` → **PASS** (0 errors).
- `apps/api: npx tsc --noEmit` → **PASS** (0 errors).

## Verification
- `npx tsc --noEmit` executed in both `apps/web` and `apps/api` — clean.
- `npx vitest run` executed in both workspaces — all green.
- Confirmed `API_BASE` + `TOKEN_KEY` reuse from `apps/web/src/api.ts:1,5` in queue sync; hash payload stringification deterministic `JSON.stringify(payload)+sessionKey` on both client (`computeHash`) and server (`computeHash`).
- Verified offline indicator unmistakable: `OfflineBanner` `border-b-4`, `role="alert"`, amber when offline, orange when queue pending, red when conflicts; ProviderDeliveries shows additional orange bar with count.

## Concerns / Follow-ups
- IndexedDB plain API chosen over `idb` to avoid extra dep; `idb` could be adopted later for promise ergonomics — current fallback handles tests without `fake-indexeddb`.
- `syncQueue` keeps conflicts in IndexedDB (not silent drop) so pharmacist can retry after manager resolution; need manual UI to purge resolved conflicts (currently only removed on success). Consider adding “Supprimer le conflit” action after manager handles alert.
- Hash uses `JSON.stringify(payload)` order-dependent — payload is small and constructed deterministically (`{prescriptionNumber, lines}`), but if server and client stringify with different key order, mismatch could false-positive. Mitigated by using same `JSON.stringify` on both sides with identical DTO construction.
- `cacheGuarantees` currently caches `remainingLines`/`estimation` placeholder; full plafonds endpoint (`/provider/verify`) should populate cache with precise `product.guarantees` per member — wire when that endpoint exists.
- Server `OfflineModule` imports `ClaimsModule` and provides `CareService`; ensure `PrismaService` global still resolves. No migration required (queue/cache are client-side only).
- `ProviderDeliveries` still uses `FormData` for normal delivery (file upload path) — offline payload is JSON-only (no documents). If documents needed offline, add `payload`+`documents` serialization to queue.
- `AdminProducts` tsc fix is unrelated to Task 3 but required for `npx tsc --noEmit` PASS — should be cherry-picked if Tasks are reviewed independently.
