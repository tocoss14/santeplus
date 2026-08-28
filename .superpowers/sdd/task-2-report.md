# Task 2 Report — Seuils paramétrables par Product et Act

**Date:** 2026-08-28
**Status:** Done
**Plan:** `docs/superpowers/plans/2026-08-26-santeplus-10-corrections.md` — Task 2

## Summary
Implemented per-Product (`thirdPartyAuthThreshold`) and per-Act (`authThreshold`) thresholds for prior authorization. The most restrictive value applies per item; if any item's covered amount exceeds its resolved threshold, the whole claim transitions to `AUTH_REQUIRED`. Added `resolveThreshold(product, act, fallback=150000)` helper, removed the single `SystemConfig` `thirdPartyAuthThreshold` lookup from both initiate paths (provider-portal and care delivery), and exposed admin editing via product cards/modal and a new acts table.

## Commits
- Pending (to be created): `feat: per-product and per-act prior-auth thresholds with admin UI`
  - Includes: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260828_thresholds/migration.sql`, `apps/api/src/domain/engine.ts`, `apps/api/src/modules/providers/provider-portal.controller.ts`, `apps/api/src/modules/care/care.controller.ts`, `apps/api/src/modules/products/products.controller.ts`, `apps/api/prisma/seed.ts`, `apps/web/src/pages/admin/AdminProducts.tsx`, `apps/web/src/pages/admin/AdminActs.tsx`, `apps/web/src/App.tsx`, `apps/web/src/layouts/AppLayout.tsx`, `apps/api/tests/threshold.spec.ts`

## Files Changed
- `apps/api/prisma/schema.prisma:106-133` — Added `Product.thirdPartyAuthThreshold Int?` and `Act.authThreshold Int?` (nullable, zero-downtime).
- `apps/api/prisma/migrations/20260828_thresholds/migration.sql` — `ALTER TABLE "Product" ADD COLUMN "thirdPartyAuthThreshold" INTEGER; ALTER TABLE "Act" ADD COLUMN "authThreshold" INTEGER;`
- `apps/api/src/domain/engine.ts:11-19` — Added `export function resolveThreshold(product: number|null|undefined, act: number|null|undefined, globalFallback=150000): number` filtering `>0` and returning `Math.min` or fallback.
- `apps/api/src/modules/providers/provider-portal.controller.ts:1,389-413` — Imports `resolveThreshold`, replaces `SystemConfig` lookup with: fetch `productThreshold` once per request, per-item `actThreshold` via `prisma.act.findUnique`, `thresholds = resolveThreshold(...)`, `authRequired = items.some(needsPriorAuthorization(amountApproved, thresholds[idx])) || needsPriorAuthorization(total, Math.min(...thresholds))`.
- `apps/api/src/modules/care/care.controller.ts:1,31-38,74-83,481-497` — Same per-item resolution for delivery flow; added `authThreshold` to `actCreateSchema`, added `PATCH /admin/acts/:id` (requires `products.manage`), added `Patch` import.
- `apps/api/src/modules/products/products.controller.ts:17-35,102-139` — Added `thirdPartyAuthThreshold` to `productBaseSchema` (nullable `int`), handled `beneficiaryRules` stringification in `create`/`update` to avoid Prisma String mismatch.
- `apps/api/prisma/seed.ts:130-197,254-274` — Seeded default thresholds: `ESS 120k`, `CONF 200k`, `PREM 250k`, `ENT-COLL 180k`; acts `CONS-002 50k`, `HOSP-001 100k`, `HOSP-002 50k`, `LABO-001 80k`, `SPEC-001 50k`, etc.
- `apps/web/src/pages/admin/AdminProducts.tsx` — Added `thirdPartyAuthThreshold` to `EMPTY`, badge `Seuil TP`, inline number input + `PATCH /admin/products/:id` quick save, modal field `Seuil autorisation TP (vide=défaut 150k)`.
- `apps/web/src/pages/admin/AdminActs.tsx` (new) — Table of acts (`GET /admin/acts`) with inline threshold editor, `PATCH /admin/acts/:id`, search `?q`, description of restrictive logic.
- `apps/web/src/App.tsx:31-32,100-101` — Added route `/admin/acts` → `AdminActs`.
- `apps/web/src/layouts/AppLayout.tsx:39` — Added menu entry `Actes & seuils`.

## Tests
- Created `apps/api/tests/threshold.spec.ts` (9 cases) — all PASS:
  - `resolveThreshold(200000,100000) === 100000` ✓
  - `resolveThreshold(null,100000) === 100000` ✓
  - `resolveThreshold(200000,null) === 200000` ✓
  - `resolveThreshold(null,null) === 150000` ✓
  - Extra: `undefined` fallback, `0`/negative ignored
  - Integration: `resolveThreshold(200000,50000)=50000` + `needsPriorAuthorization(60000,50000)=true` even if product threshold 200k ✓
  - Negative case `40000` below threshold → false ✓
  - Multi-item: `t0=50000` with `60000` exceeds, `t1=200000` with `10000` ok → claim `AUTH_REQUIRED` ✓
- Full suite: `npx vitest run` → 4 files, 41 tests PASS (engine, payment-mapping, emergency-override, threshold).
- `npx prisma validate` → valid
- `npx prisma generate` → ok (v5.22.0)
- `npx tsc --noEmit` (api) → clean

## Verification
- `npx prisma validate` and `npx prisma generate` executed after schema changes.
- Grepped for remaining `thirdPartyAuthThreshold` SystemConfig usage — none left in initiate paths; only fallback `150000` via `resolveThreshold` default.
- Admin endpoints verified: `PATCH /admin/products/:id` handles `thirdPartyAuthThreshold`; `PATCH /admin/acts/:id` exists.

## Concerns / Follow-ups
- `ProviderPortal.initiate` fetches `act` thresholds sequentially per item (N queries). Acceptable for ≤30 items; could batch with `findMany` if performance concern.
- Seed thresholds are demo values; Direction métier should confirm final values (e.g., `HOSP-002` 50k may be too low for surgical blocks).
- `SystemConfig` key `thirdPartyAuthThreshold` remains in DB for backward compatibility but is no longer read; consider deprecation notice or removal in a later migration.
- No DB migration run against live PG in this task (local `prisma generate` only); `prisma migrate deploy` must be executed in deployment pipeline.
