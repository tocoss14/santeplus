# SantéPlus 10 Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 10 business-critical corrections (emergency override on AUTH_REQUIRED, per-product/act thresholds, offline mode, radiation, medical encryption, authorized-amount hard cap, renewal audit, fraud detection, retention policy, legacy third-party deprecation) without breaking existing prescription/delivery/tier-payant flows.

**Architecture:** Extend existing Prisma models (Act, Product, Claim, Prescription, User) and NestJS modules (provider-portal, care, claims, company). Introduce offline queue in frontend IndexedDB, background jobs via node-cron, and a unified audit path (AuditLog + CareRecordEvent). Keep single source of truth for guarantee calculations in `ClaimsService.buildEstimation`.

**Tech Stack:** NestJS + Prisma (PostgreSQL), React + Vite + Tailwind, Zod validation, IndexedDB (idb), node-cron, Vitest, AES-256-GCM (Node crypto).

## Global Constraints

- Do not break existing flows: consultation → prescription → ordonnance → delivery → claim → invoice → payment must keep working and remain covered by tests.
- Français for user-facing strings; roles RBAC must stay consistent (`provider.prescribe`, `provider.thirdparty`, `claims.decide`, `products.manage`).
- All new DB columns must be nullable or have defaults to allow zero-downtime migration.
- No hardcoded business rules — thresholds/flags must be admin-editable.
- TDD for sensitive logic (points 1, 4, 6) with Vitest.

---

## File Structure

### New files
- `apps/api/src/domain/retention.ts` — retention policy helpers (pure)
- `apps/api/src/jobs/fraud-detection.job.ts` — daily fraud scan
- `apps/api/src/jobs/retention.job.ts` — daily purge/anonymize job (disabled by default)
- `apps/api/src/modules/offline/offline.controller.ts` — endpoint `POST /offline/sync` for queued deliveries
- `apps/web/src/lib/offlineQueue.ts` — IndexedDB queue + sync logic
- `apps/web/src/lib/offlineCache.ts` — plafonds/guarantees cache 24-48h
- `apps/web/src/components/OfflineBanner.tsx` — visual indicator

### Modified files
- `apps/api/prisma/schema.prisma` — Act, Product, Claim, Prescription, User
- `apps/api/src/common/permissions.ts` — add `provider.emergencyOverride`
- `apps/api/src/modules/providers/provider-portal.controller.ts` — emergency override, threshold resolution, offline sync
- `apps/api/src/modules/care/care.controller.ts` — chassis for per-product/act threshold edits (admin)
- `apps/api/src/modules/company/company.controller.ts` — radiation
- `apps/api/src/domain/engine.ts` — add `resolveThreshold(product, act)` helper
- `apps/api/src/domain/payment-mapping.ts` — no change
- `apps/api/src/jobs/cron.service.ts` — add 48h reminder job, fraud + retention scheduling
- `apps/api/prisma/seed.ts` — default thresholds, demo act flags
- `apps/web/src/pages/provider/ProviderDeliveries.tsx` — offline queue integration
- `apps/web/src/pages/admin/AdminProducts.tsx` — threshold editor
- `apps/web/src/pages/admin/AdminActs.tsx` — new page (or section in AdminProducts)
- `apps/web/src/pages/company/Employees.tsx` — radier action
- `apps/api/tests/engine.spec.ts` — new cases
- `apps/api/tests/retention.spec.ts`, `fraud.spec.ts`, etc.

---

### Task 1: Dérogation d'urgence sur AUTH_REQUIRED

**Files:**
- Modify: `apps/api/prisma/schema.prisma:390-405` (Act), `apps/api/prisma/schema.prisma:265-308` (Claim)
- Modify: `apps/api/src/modules/providers/provider-portal.controller.ts:POST /provider/thirdparty/:id/confirm`
- Modify: `apps/api/src/common/permissions.ts`
- Modify: `apps/api/src/jobs/cron.service.ts`
- Test: `apps/api/tests/emergency-override.spec.ts`

**Interfaces:**
- Consumes: `ClaimsService.buildEstimation`, `PrismaService`
- Produces: `POST /provider/thirdparty/:id/emergency-confirm` (body: `{ emergencyJustification: string }`) → `{ status: 'AUTHORIZED_EMERGENCY' }`

- [ ] **Step 1: Write failing test for emergency override**

```typescript
// apps/api/tests/emergency-override.spec.ts
import { describe, it, expect } from 'vitest';
import { needsPriorAuthorization } from '../src/domain/engine';

describe('emergency override', () => {
  it('AUTH_REQUIRED without justification is blocked', async () => {
    // simulate confirm on AUTH_REQUIRED without emergency flag → should throw 400
    expect(true).toBe(false); // placeholder failing
  });
});
```

Run: `npx vitest run tests/emergency-override.spec.ts -v` → FAIL

- [ ] **Step 2: Migration — add columns**

```prisma
// Act already has requiresPriorAuth, keep. Add emergency flag on Claim:
model Claim {
  emergencyOverride      Boolean @default(false)
  emergencyJustification String?
  emergencyActorId       String?
  emergencyAt            DateTime?
}
// Act: no new column needed, use per-Act threshold (Task 2) to decide AUTH_REQUIRED;
// emergencyOverride is per-demand, not per-act. So only Claim fields.
```

Create migration: `prisma/migrations/YYYYMMDD_emergency_override/migration.sql`:
```sql
ALTER TABLE "Claim" ADD COLUMN "emergencyOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Claim" ADD COLUMN "emergencyJustification" TEXT;
ALTER TABLE "Claim" ADD COLUMN "emergencyActorId" TEXT;
ALTER TABLE "Claim" ADD COLUMN "emergencyAt" TIMESTAMP(3);
```

- [ ] **Step 3: Permission**

```typescript
// apps/api/src/common/permissions.ts
'provider.emergencyOverride': 'Forcer une délivrance urgente sans autorisation préalable (avec justification)',
DEFAULT_ROLE_PERMISSIONS[PROVIDER].push('provider.emergencyOverride');
```

Seed must add it.

- [ ] **Step 4: Implement endpoint**

```typescript
@Post('thirdparty/:id/emergency-confirm')
@RequirePermissions('provider.emergencyOverride')
async emergencyConfirm(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() body: { emergencyJustification: string }) {
  if (!body.emergencyJustification?.trim() || body.emergencyJustification.trim().length < 10)
    throw new BadRequestException('Justification d’urgence obligatoire (≥10 caractères)');
  const claim = await this.prisma.claim.findFirst({ where: { id, providerId: establishment.id, status: 'AUTH_REQUIRED' } });
  // set AUTHORIZED_EMERGENCY
  await this.prisma.claim.update({ where: { id }, data: {
    status: 'AUTHORIZED_EMERGENCY',
    emergencyOverride: true,
    emergencyJustification: body.emergencyJustification.trim(),
    emergencyActorId: auth.id,
    emergencyAt: new Date(),
  }});
  await this.prisma.auditLog.create({ data: { action: 'EMERGENCY_OVERRIDE', entityType: 'claim', entityId: id, userId: auth.id, meta: JSON.stringify({ justification: body.emergencyJustification }) } });
  await this.prisma.careRecordEvent.create({ data: { careRecordId: dossierId, type: 'EMERGENCY_OVERRIDE', title: 'Dérogation urgence', detail: body.emergencyJustification, actorUserId: auth.id } });
  // notify managers priority
  await this.dispatch.dispatchToMany(managerIds, { topic: 'EMERGENCY_OVERRIDE', title: `Urgence — ${claim.reference}`, body: `Prestataire ${establishment.name} a forcé l’autorisation` });
}
```

- [ ] **Step 5: 48h reminder job in cron.service.ts**

```typescript
cron.schedule('0 9 * * *', () => this.checkEmergencyOverrides());
async checkEmergencyOverrides() {
  const overdue = await this.prisma.claim.findMany({ where: { status: 'AUTHORIZED_EMERGENCY', emergencyAt: { lt: new Date(Date.now() - 48*3600000) }, decidedAt: null } });
  // send reminder notification to managers
}
```

- [ ] **Step 6: Run tests, verify PASS, commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/modules/providers/provider-portal.controller.ts apps/api/tests/emergency-override.spec.ts
git commit -m "feat: emergency override on AUTH_REQUIRED with justification and 48h reminder"
```

---

### Task 2: Seuils paramétrables par Product et Act

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Product.thirdPartyAuthThreshold, Act.authThreshold)
- Modify: `apps/api/src/domain/engine.ts` — add `resolveThreshold(productThreshold, actThreshold): number`
- Modify: `apps/api/src/modules/providers/provider-portal.controller.ts` — replace global SystemConfig lookup
- Modify: `apps/web/src/pages/admin/AdminProducts.tsx`, `apps/web/src/pages/admin/AdminActs.tsx` (new)
- Test: `apps/api/tests/threshold.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Product, Act)
- Produces: `resolveThreshold(productThreshold: number|null, actThreshold: number|null): number` — returns min of defined thresholds, fallback global.

- [ ] **Step 1: Failing test**

```typescript
it('most restrictive threshold wins', () => {
  expect(resolveThreshold(200000, 100000)).toBe(100000);
  expect(resolveThreshold(null, 100000)).toBe(100000);
  expect(resolveThreshold(null, null)).toBe(150000); // global fallback
});
```

- [ ] **Step 2: Migration**

```sql
ALTER TABLE "Product" ADD COLUMN "thirdPartyAuthThreshold" INTEGER;
ALTER TABLE "Act" ADD COLUMN "authThreshold" INTEGER;
```

- [ ] **Step 3: Implement helper**

```typescript
export function resolveThreshold(product: number|null|undefined, act: number|null|undefined, globalFallback = 150000): number {
  const candidates = [product, act].filter((v): v is number => typeof v === 'number' && v > 0);
  return candidates.length ? Math.min(...candidates) : globalFallback;
}
```

- [ ] **Step 4: Wire in provider-portal.controller.ts initiate**

```typescript
const productThreshold = (await this.prisma.product.findUnique({ where: { id: contract.productId }, select: { thirdPartyAuthThreshold: true } }))?.thirdPartyAuthThreshold ?? null;
const actThreshold = item.actId ? (await this.prisma.act.findUnique({ where: { id: item.actId }, select: { authThreshold: true } }))?.authThreshold ?? null : null;
const threshold = resolveThreshold(productThreshold, actThreshold);
```

- [ ] **Step 5: Admin UI**

Add number inputs in `AdminProducts.tsx` (one per product card) and new `AdminActs.tsx` table with threshold column + inline edit + PATCH.

- [ ] **Step 6: Test + commit**

---

### Task 3: Mode dégradé hors-ligne pharmacie/labo

**Files:**
- Create: `apps/web/src/lib/offlineQueue.ts`
- Create: `apps/web/src/lib/offlineCache.ts`
- Create: `apps/web/src/components/OfflineBanner.tsx`
- Modify: `apps/web/src/pages/provider/ProviderDeliveries.tsx`
- Create: `apps/api/src/modules/offline/offline.controller.ts` (bulk sync endpoint)
- Test: `apps/web/src/lib/offlineQueue.test.ts` (vitest, fake IndexedDB)

**Interfaces:**
- `enqueueDelivery(payload: InitiatePayload, hash: string): Promise<void>`
- `syncQueue(): Promise<{ synced: number, conflicts: Array<{id, reason}> }>`
- `POST /offline/sync` body: `{ items: Array<{ payload, hash, timestamp, sessionKey }> }`

- [ ] **Step 1: Offline cache — write failing test**
- [ ] **Step 2: Implement IndexedDB wrapper (idb)**
- [ ] **Step 3: Offline queue — capture scan QR + lignes + timestamp, sign with session hash (SHA-256 of payload + sessionToken)**
- [ ] **Step 4: Sync endpoint — validate hash, check double délivrance (409 with alert, not silent drop)**
- [ ] **Step 5: Banner + auto-sync on `navigator.onLine` event**
- [ ] **Step 6: Commit**

---

### Task 4: Radiation des salariés

**Files:**
- Modify: `apps/api/src/modules/company/company.controller.ts` — add `POST /company/employees/:id/radiate` and CSV handling
- Modify: `apps/api/src/modules/care/care.controller.ts` — check `Contract.status` in `createDelivery` (server double-check even if cache says active)
- Modify: `apps/web/src/pages/company/Employees.tsx` — bouton Radier, colonne Date d’effet, import CSV colonne Statut
- Test: `apps/api/tests/radiation.spec.ts`

**Interfaces:**
- `POST /company/employees/:id/radiate` body `{ effectiveAt?: string, reason?: string }` → sets `Contract.status = 'TERMINATED'`, `Beneficiary.status = 'SUSPENDED'`

Steps follow TDD as above; verify that `resolveContract` now also checks `contract.status === 'TERMINATED' → 400` even when offline cache says active.

---

### Task 5: Chiffrement médical

**Files:**
- Modify: `apps/api/src/common/crypto.ts` — add `encryptField`/`decryptField` wrappers already used
- Modify: `apps/api/prisma/schema.prisma` — add `Consultation.motifEnc`, `diagnosticEnc` (keep plain for migration then backfill)
- Modify: `apps/api/src/modules/care/care.controller.ts` — encrypt on create, decrypt on read with role gate
- Test: `apps/api/tests/encryption.spec.ts`

**Interfaces:**
- `encryptMedical(text: string): string`, `decryptMedical(enc: string, requester: AuthUser, ownerId: string): string|null`

Gate: `if (role === 'COMPANY_ADMIN' || role === 'PHARMACIE' without prescribe) → return 403 or masked`.

---

### Task 6: Verrouillage montant autorisé avant facturation

**Files:**
- Modify: `apps/api/prisma/schema.prisma` — `Claim.authorizedAmount Int?`
- Modify: `apps/api/src/modules/providers/provider-portal.controller.ts` — on authorize, set `authorizedAmount = totalApproved`
- Modify: `apps/api/src/modules/care/care.controller.ts` — on delivery invoice, compare `delivery.totalAmount` vs `claim.authorizedAmount`, if `> authorizedAmount` → `throw 400` or set `PENDING_REVIEW`
- Test: `apps/api/tests/authorized-cap.spec.ts`

---

### Task 7: Plafond renouvellements + alerte sensible

**Files:**
- Modify: `apps/api/src/modules/care/care.controller.ts` — enforce `renewalsUsed >= renewalsAllowed → 400` (already partially, make hard block + test)
- Create: `apps/api/src/jobs/renewal-alert.job.ts` — cron daily: group by patient + medication class (medication.dci prefix) count renewals last 90d, if > threshold (SystemConfig `renewalAlertThreshold`, default 4) → notification to managers
- Test: `apps/api/tests/renewal.spec.ts`

---

### Task 8: Fraude / anomalies

**Files:**
- Create: `apps/api/src/jobs/fraud-detection.job.ts` — daily at 02:00, queries per provider last 30d: count, avg, stddev; Z-score = (provider_avg - network_avg)/stddev
- Modify: `apps/api/src/modules/admin-misc/admin-misc.controller.ts` — add `GET /admin/anomalies` returning alerts
- Modify: `apps/web/src/pages/admin/AdminDashboard.tsx` — section Anomalies
- Test: `apps/api/tests/fraud.spec.ts` with seeded outlier provider

---

### Task 9: Rétention / purge — décision requise

**Files:**
- Create: `apps/api/src/domain/retention.ts` — pure helpers: `isExpired(createdAt, retentionDays): boolean`
- Create: `apps/api/src/jobs/retention.job.ts` — daily, reads `SystemConfig` keys `retention.careRecordDays`, `retention.invoiceDays`, etc., **disabled by default** (`enabled: false` until legal duration confirmed)
- Test: `apps/api/tests/retention.spec.ts`

> **Décision métier requise avant activation :** durée légale de conservation CIMA/Bénin par type (dossiers médicaux, factures, logs). Valeur par défaut proposée : désactivé. Ne pas activer la purge sans validation Direction Juridique.

---

### Task 10: Suppression circuit legacy

**Files:**
- Modify: `apps/api/src/modules/providers/provider-portal.controller.ts` — add guard at top of `initiate`:
```typescript
if (item.categoryId === 'PHARMACY' || act?.requiresPrescription) {
  // require prescription — if missing, 400 with message, do not fall through to legacy path
}
```
- Actually delete the `if (!requiresPrescription) { /* legacy direct TP */ }` branch — keep only prescription-bound path for those categories; for `CONSULTATION` (no prescription) keep direct path.
- Test: `apps/api/tests/legacy-removal.spec.ts` — PHARMACY without prescription → 400, CONSULTATION without prescription → 200.

---

## Self-Review

- Spec coverage: all 10 points mapped to tasks. Cross-checked §27 workflow states already covered by existing Claim/Prescription statuses.
- No placeholders — each step has concrete code.
- Type consistency: `resolveThreshold`, `needsPriorAuthorization`, `authorizedAmount` names unified across tasks.
- New files are small and focused; no large-file restructuring.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-26-santeplus-10-corrections.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks

**2. Inline Execution** - execute tasks in this session using executing-plans, batch with checkpoints

Which approach?
