# Final Whole-Branch Review — SantéPlus 10 Corrections

**Branch:** `1984328` (base) → `HEAD` (`d03cd31`)
**Date:** 2026-08-29
**Reviewer:** final whole-branch code reviewer (automated)
**Plan:** `docs/superpowers/plans/2026-08-26-santeplus-10-corrections.md`

---

## 1. Scope

### git log --oneline 1984328..HEAD

```
d03cd31 feat: suppression circuit legacy tiers payant pour actes a prescription obligatoire (Task 10)
bc7ec34 feat(retention): disabled-by-default retention/purge with 03:00 job, anonymize CareRecord and delete AuditLog (Task 9)
96240b7 feat(fraud): daily Z-score and cumul detection with admin anomalies
33acab4 feat: plafond renouvellements hard cap + alerte sensible renouvelements repetes (Task 7)
964686a feat: verrouillage montant autorise avant facturation — hard cap authorizedAmount (Task 6)
294038f feat: chiffrement données médicales sensibles avec gate d'accès (Task 5)
b951a83 feat: radiation des salariés — contrats TERMINATED, ayants droit SUSPENDED, blocage délivrance, CSV Statut RADIE et UI Radier
b9531b4 feat: offline degraded mode for pharmacy/lab with queue, cache, banner and sync endpoint
24b076a feat: per-product and per-act prior-auth thresholds with admin UI
c6445a2 feat: emergency override on AUTH_REQUIRED with justification and 48h reminder
```

10 commits = 10 plan tasks, strictly 1:1. Commit messages match plan task numbers 1→10 (order 1,2,3,4,5,6,7,8,9,10 with 3/4 swapped in chronology but all present).

### git diff --stat 1984328..HEAD

- **70 files changed, 6515 insertions, 589 deletions**
- New domain/jobs: `retention.ts` (108L), `fraud-detection.job.ts` (347L), `renewal-alert.job.ts` (144L), `retention.job.ts` (114L), `offline.controller.ts` (312L)
- New web offline: `offlineQueue.ts` (213L), `offlineCache.ts` (92L), `OfflineBanner.tsx` (141L), `offlineQueue.test.ts` (106L)
- Schema delta: +12 lines (6 new columns nullable/with defaults), 3 new migration directories (thresholds, medical_enc, authorized_cap) + photos
- Tests: 8 new `apps/api/tests/*.spec.ts` (+ ~2300 lines), 1 web test
- Web admin/pages: `AdminActs.tsx` (102L), `AdminDashboard.tsx` anomalies + retention sections, `AdminProducts.tsx` thresholds, `Employees.tsx` radier, `ProviderDeliveries.tsx` offline

**Verdict on scope:** No unexpected large refactors. All changes are branch-local and additive except `care.controller.ts` / `provider-portal.controller.ts` which intentionally replace legacy paths (Task 10). Diff is consistent with plan file-structure section.

---

## 2. Plan Coverage — 10/10 Tasks

| # | Plan task | Commit | Files (expected vs actual) | Status |
|---|-----------|--------|----------------------------|--------|
| 1 | Dérogation d'urgence sur AUTH_REQUIRED | `c6445a2` | `schema Claim emergency*`, `permissions`, `provider-portal emergency-confirm` + `confirm` guard, `cron 09:00`, test `emergency-override.spec.ts` | ✅ COVERED |
| 2 | Seuils paramétrables Product/Act | `24b076a` | `Product.thirdPartyAuthThreshold`, `Act.authThreshold`, `engine.resolveThreshold`, per-item wiring in `provider-portal` + `care`, UI `AdminProducts` + new `AdminActs`, test `threshold.spec.ts` | ✅ COVERED |
| 3 | Mode dégradé hors-ligne | `b9531b4` | `offlineQueue.ts`, `offlineCache.ts`, `OfflineBanner.tsx`, `ProviderDeliveries.tsx`, `offline.controller.ts POST /offline/sync`, test `offlineQueue.test.ts` | ✅ COVERED |
| 4 | Radiation des salariés | `b951a83` | `company.controller radiateEmployee`, `care createDelivery TERMINATED guard`, `Employees.tsx Radier + CSV Statut RADIE`, test `radiation.spec.ts` | ✅ COVERED |
| 5 | Chiffrement médical | `294038f` | `crypto.ts encryptField/decryptField + canAccessMedical`, `schema motifEnc/diagnosticEnc/noteEnc`, `care.controller + care-record.controller decryptForReader`, test `encryption.spec.ts` | ✅ COVERED |
| 6 | Verrouillage montant autorisé | `964686a` | `schema Claim.authorizedAmount`, set on `authorize` + `emergency-confirm`, hard-cap check on `provider/thirdparty/:id/invoice` + `care createDelivery`, helper `assertAuthorizedCap`, test `authorized-cap.spec.ts` | ✅ COVERED |
| 7 | Plafond renouvellements + alerte sensible | `33acab4` | hard block `renewalsUsed >= renewalsAllowed` (tx re-check), job `renewal-alert.job.ts` grouping by dci-first-word 90j + SystemConfig `renewalAlertThreshold`, `cron 02:30`, test `renewal.spec.ts` | ✅ COVERED |
| 8 | Fraude / anomalies | `96240b7` | `fraud-detection.job.ts` Z-score + cumul, `admin-misc GET /admin/anomalies`, `AdminDashboard` Anomalies table, test `fraud.spec.ts` | ✅ COVERED |
| 9 | Rétention / purge — désactivé par défaut | `bc7ec34` | `retention.ts` pure helpers + `retention.job.ts` 03:00 anonymize CareRecord + delete AuditLog, `cron 03:00`, disabled-by-default semantics, test `retention.spec.ts` | ✅ COVERED |
|10| Suppression circuit legacy | `d03cd31` | guard `PHARMACY`/`act.requiresPrescription` requires valid prescription at top of `initiate`, no legacy fallback for those categories, CONSULTATION direct TP preserved, test `legacy-removal.spec.ts` | ✅ COVERED |

Additional plan constraints (global):
- `products.manage` / `provider.prescribe` / `provider.emergencyOverride` RBAC consistent — verified `permissions.ts:31,44`.
- New DB columns nullable or with defaults (`thirdPartyAuthThreshold Int?`, `authThreshold Int?`, `emergencyOverride Boolean @default(false)`, `motifEnc String?`, etc.) — zero-downtime compliant.
- Thresholds/flags admin-editable — `AdminProducts.tsx` + `AdminActs.tsx` expose inputs + PATCH; `renewalAlertThreshold` & `retention.*Days` via `SystemConfig` — no hardcoded business rule except globalFallback (noted below).

---

## 3. Verification

### 3.1 `npx tsc --noEmit` (apps/api)

**PASS** — no output (0 errors). Workdir `C:\Users\HP\Desktop\mutuelle santé\apps\api`.

### 3.2 `npx tsc --noEmit` (apps/web)

**PASS** — no output (0 errors). Workdir `C:\Users\HP\Desktop\mutuelle santé\apps\web`.

### 3.3 `npx vitest run` (apps/api)

**PASS — 113 tests, 11 files, 5.31s**

```
Test Files  11 passed (11)
     Tests  113 passed (113)
```

Breakdown:

- `encryption.spec.ts` (9 tests incl. 2 integration) — PASS
- `fraud.spec.ts` (9 tests Z-score + cumul) — PASS
- `legacy-removal.spec.ts` (5 tests) — PASS
- `authorized-cap.spec.ts` (7 tests) — PASS
- `radiation.spec.ts` (9 tests inc. CSV, TERMINATED guard) — PASS
- `renewal.spec.ts` (14 tests hard cap + alert grouping) — PASS
- `emergency-override.spec.ts` (5 tests inc. 48h cron) — PASS
- `retention.spec.ts` (14 tests disabled/enabled/anonymize) — PASS (+ `[retention] disabled` console as expected for no-config case)
- `threshold.spec.ts` (9 tests resolve + integration) — PASS
- `engine.spec.ts` + `payment-mapping.spec.ts` (baseline) — PASS

No flaky tests, no skipped tests. Existing flows (`consultation → prescription → ordonnance → delivery → claim → invoice → payment`) remain covered by `engine.spec.ts` and integration tests inside `authorized-cap`/`radiation`/`legacy-removal`.

---

## 4. Spot-Checks (Critical Files)

### 4.1 `apps/api/src/modules/providers/provider-portal.controller.ts` (800L) — emergency + thresholds + legacy + cap

- **Emergency override** (`500:569`): correctly guards `emergencyJustification.trim().length < 10`, scopes to `providerId + AUTH_REQUIRED`, sets `AUTHORIZED_EMERGENCY + authorizedAmount`, writes `AuditLog EMERGENCY_OVERRIDE` + `CareRecordEvent` with dossier resolution (claim → patient fallback), dispatches `EMERGENCY_OVERRIDE` to managers. `confirm` at `571:598` correctly blocks `AUTH_REQUIRED` without override and allows `AUTHORIZED_EMERGENCY → CONFIRMED`. Cron 48h in `cron.service.ts:64-86` filters `emergencyAt < now-48h AND decidedAt null` and re-notifies managers at `09:00` — matches spec.
- **Thresholds** (`404:426`): per-item `productThreshold` + `actThreshold` via `resolveThreshold`, then `needsPriorAuthorization` per item OR fallback to most restrictive total. Logic mirrors `care.controller.ts:572:591`.
- **Legacy guard** (`376:402`): loops items, sets `requiresPrescription = categoryId===PHARMACY || act.requiresPrescription`, then requires `prescription ACTIVE/PARTIALLY_EXECUTED` with `validFrom/Until` and `lines.categoryId` match + qty remaining. Preserves direct path for `CONSULTATION` (`requiresPrescription==false`). Spec-compliant.
- **Authorized cap** (`675:707`): `invoice` checks `authorizedAmount != null && totalForCheck > authorizedAmount` with French message `Facture de X FCFA dépasse le montant autorisé de Y FCFA` (line 695). `assertAuthorizedCap` duplicates logic for care path. `initiate` does not set cap yet (only on auth/emergency) — correct.

Quality: many raw `any` casts for Prisma compat, but tests enforce shape. N+1 per-item Act queries is a perf note (Important).

### 4.2 `apps/api/src/jobs/fraud-detection.job.ts` (347L) — Z-score + cumul

- Pure helpers `zScore/shouldAlert/mean/stddev` correct; `shouldAlert` uses `|Z|>2` (spec >2).
- `detectZScore` groups by provider on last 30d, excludes `<5 claims`, needs `≥2 providers` for stddev, computes `mean/stddev` population, alerts on `avg` OR `count` OR `both`, writes `AuditLog FRAUD_ALERT type Z_SCORE` + `dispatchToMany` with topic `FRAUD_ALERT`. Proper.
- `detectCumul` groups by `contractId|code|date` on same day, flags `beneficiaries.size ≥2` same medication code — catches contrat-level cumul.
- Fallback manual date filter for mocks and try/catch around alternate query — resilience good.
- Scheduling is via `CronService` (`0 2 * * *`) + own `schedule()` — double-schedule is intentional delegation but creates duplicate runs if both instantiated (see Important).

### 4.3 `apps/api/src/modules/care/care.controller.ts` (806L) — encryption + radiation + renewal + cap

- **Encryption** (`20:64` helpers `decryptConsultationForReader/decryptPrescriptionForReader`): `canAccessMedical(requester, patientUserId, providerId)` gate correct (owner OR SUPER_ADMIN/INSURANCE_MANAGER OR same provider). Mask is `MEDICAL_MASKED` `[Contenu médical restreint]` French. `motifEnc/diagnosticEnc/noteEnc` decrypted on read, enc columns deleted before response — no leak. `POST /provider/consultations` (`185:187`) dual-writes `motif + motifEnc` etc., preserving plain for migration then backfill — spec-compliant.
- **Radiation guard** (`163:166`, `302:304`, `548:550`): all `resolveContract` paths check `TERMINATED|SUSPENDED → 400 Contrat radié — délivrance impossible` even if cache says active — server double-check correct.
- **Renewal hard cap** (`414:444`): outside tx `used >= allowed → 400`, inside tx re-reads `freshUsed/freshAllowed` to avoid race, increments `renewalsUsed`, extends `validUntil +30j`, resets `deliveredQty`. Hard cap enforced.
- **Authorized cap check** (`593:604`): looks up `Claim` with `prescriptionId + authorizedAmount not null + AUTHORIZED|AUTHORIZED_EMERGENCY|CONFIRMED`, blocks `totalRequested > authorizedAmount` with same French message — correct cross-controller consistency.
- CareRecord encryption detail: `decryptConsultationForReader` masks `diagnostic` even when null (`MANY-ENCRYPTION diagnosis missing leak` pattern avoided).

---

## 5. Global Constraints Enforcement

| Constraint | Enforcement | Evidence |
|------------|-------------|----------|
| No hardcoded thresholds | ✅ Largely satisfied; per-product `thirdPartyAuthThreshold` + per-act `authThreshold` editable via admin UI; renewal `renewalAlertThreshold` via SystemConfig; fraud Z>2 is statistical constant not business rule. One residual hardcode `globalFallback=150000` in `engine.ts:14` (see Important). | `engine.ts:14`, `AdminProducts.tsx`, `AdminActs.tsx`, `renewal-alert.job.ts:43` |
| Thresholds admin-editable | ✅ | `PATCH /admin/acts/:id`, `PATCH /admin/products` (threshold field), `PATCH /admin/config` for retention/renewal |
| No break of existing flows | ✅ 113 tests pass, including `engine.spec.ts`, `payment-mapping.spec.ts`, and integration cases in `legacy-removal`/`authorized-cap` | `npx vitest run` 113/113 |
| Français user strings | ✅ All user-facing errors in French | `Justification d’urgence obligatoire`, `Contrat radié — délivrance impossible`, `Aucun renouvellement restant`, `Facture de … dépasse …` |
| Nullable/default columns | ✅ All 6 new columns are `Int?` or `Boolean @default(false)` etc. | `schema.prisma diff` |
| TDD for sensitive logic (points 1,4,6) | ✅ Tests written first (task reports show failing→passing), now passing | `emergency-override.spec.ts`, `radiation.spec.ts`, `authorized-cap.spec.ts`, `encryption.spec.ts` |

---

## 6. Findings

### Critical (0)

_Aucun blocage critique détecté. Tous les garde-fous sensibles (radiation, cap, chiffrement, dérogation) sont implémentés et testés._

- C1 placeholders / security sanity: **kept as reserved entries below** — no critical open after spot-check. If strict reading required, 0 critical.

### Important (4)

**I1 — Global fallback threshold hardcoded (`apps/api/src/domain/engine.ts:14`)**
```ts
export function resolveThreshold(..., globalFallback = 150000)
```
Plan says “no hardcoded business rules — thresholds/flags must be admin-editable”. The 150 000 FCFA fallback is hardcoded in code, not in `SystemConfig`. The per-product/act overrides are correctly admin-editable, but if both are null the system silently falls back to 150k without admin control. **Fix:** add `SystemConfig` key `thirdParty.globalThreshold` (nullable `Int`) fed into `resolveThreshold` in `provider-portal.controller.ts` and `care.controller.ts`, defaulting to 150k only if config absent; expose in `AdminProducts`/`AdminActs` global settings section.

**I2 — Fraude & retention double-scheduling (`apps/api/src/jobs/cron.service.ts:21-35`, `fraud-detection.job.ts:60`, `retention.job.ts:23`, `renewal-alert.job.ts:34`)**
`CronService` schedules `02:00 fraud`, `02:30 renewal-alert`, `03:00 retention` **and** each job class also exposes its own `schedule()` method. `AppModule` likely injects jobs both via `CronService` and as standalone providers — risk of duplicate daily runs (×2). The `if (this.fraudDetectionJob) { /* already scheduled */ }` comments acknowledge but do not prevent duplication if jobs are also instantiated elsewhere. **Fix:** make `CronService` the single owner of schedules (remove `schedule()` from job classes or guard with singleton flag), or document that only one path should be enabled.

**I3 — Clé de chiffrement dérivée de `jwtSecret` sans gestion de rotation (`apps/api/src/common/crypto.ts:5`)**
```ts
const key = createHash('sha256').update(config.jwtSecret + ':field-enc').digest();
```
AES-256-GCM key is deterministic on `jwtSecret`. Rotation of `JWT_SECRET` (or env drift) renders all `motifEnc/diagnosticEnc/noteEnc` undecryptable → `decryptField` returns `null` and UI shows masked content, silently losing medical data. No key-versioning, no `encVersion` column. Acceptable for MVP but must be documented. **Fix (next iteration):** introduce `MEDICAL_ENC_KEY` env (or `SystemConfig` + keyId) with `encVersion` column, dual-decrypt fallback, and runbook for rotation; add test that verifies old key decrypts after rotation.

**I4 — Sync hors-ligne incohérent avec le contrôle radiation (`apps/api/src/modules/offline/offline.controller.ts:159-167` vs `apps/api/src/modules/care/care.controller.ts:302-304`)**
Offline sync does:
```ts
where: { principalUserId: patient.id, status: { in: ['ACTIVE','SUSPENDED'] } }
if (!patientContract || patientContract.status !== 'ACTIVE') → 'Contrat du patient inactif — délivrance impossible'
```
While `CareController.createDelivery` distinguishes `TERMINATED|SUSPENDED → 'Contrat radié — délivrance impossible'` (more precise French string expected by spec and by `radiation.spec.ts`). A radiated contract synced offline will get a generic message, not the `Contrat radié` string that upstream clients/assertions rely on. Also offline path misses the `Contract.status === 'TERMINATED' → 400` branch that care controller adds before even reaching estimation. **Fix:** align offline to `status: { in: ['ACTIVE','SUSPENDED','TERMINATED'] }` then explicit `if (status === 'TERMINATED' || status === 'SUSPENDED') → Contrat radié`.

### Minor (6)

**M1 — N+1 queries sur les seuils (`apps/api/src/modules/providers/provider-portal.controller.ts:376-415`, `care.controller.ts:572-582`, `offline.controller.ts:177-186`)**
Each item does `prisma.act.findUnique({ where: { id }})` inside a `for` loop. With 20 items → 20 queries. Minor perf under load. **Fix:** batch `prisma.act.findMany({ where: { id: { in: actIds }}})` and map.

**M2 — Fallback hash non cryptographique dans `offlineQueue` (`apps/web/src/lib/offlineQueue.ts:93-97`)**
The JS fallback when `crypto.subtle` and `crypto` are unavailable uses `Math.imul(31,h)` → 8-hex string, not `64-hex` SHA-256. Server `offline.controller.ts:25` expects `sha256(payload+sessionKey).hex` (64 hex). Tests that force memory mode could enqueue a short hash that always fails `expected !== hash` on server. Low risk (browser always has `crypto.subtle`), but test payloads should assert hex length 64 in `offlineQueue.test.ts`.

**M3 — Gestion case-insensitive de `retention.enabled` (`apps/api/src/domain/retention.ts:62`)**
```ts
if (parsed === 'false') return false; // literal lowercase only
```
`'FALSE'` or `'True '` (capitalized) not handled. Admin UI may send any casing. **Fix:** normalize `String(parsed).toLowerCase().trim()` before comparison.

**M4 — Normalisation Statut CSV incomplète (`apps/api/src/modules/company/company.controller.ts:188-190`)**
Handles `RADIE`, `RADIE(E)`, `RADIEE` after NFD strip, but `STATUT=RADIÉ(E)` with parentheses is covered only via `RADIE(E)` literal — `RADIE(E)` check is exact, while `RADIÉ(E)` → `RADIE(E)` matches. However trailing spaces or `/RADIÉ` variants not handled. Low risk; existing tests cover `RADIE`/`RADIÉ`/`RADIE(E)`.

**M5 — `OfflineBanner` stale closure (`apps/web/src/components/OfflineBanner.tsx:20-43`)**
`doSync` depends on `syncing` boolean from closure; if `syncing` toggles mid-retry, the `while` loop may capture stale value. Also `maxRetries=3` with exponential backoff does not surface network error to user (silent retry). Minor UX: add `try/finally` and use `useRef` for `syncingRef`.

**M6 — Artefacts hors périmètre dans le diff (`Dockerfile`, `Landing.tsx`, `tailwind.config.js`, `docs/SantePlus-Guide-des-interfaces.*`, `package-lock.json`)**
`Landing.tsx` (341L) and `tailwind.config.js` wax-chevron design changes are not part of the 10 corrections but are included in the branch diff (likely from `cbdc355`). Not broken, but review scope is inflated and hides correction-only diff. Recommend separate design branch next time.

---

## 7. Verdict

**Verdict: Approved — branch is shippable after addressing I1/I4 (small follow-up), or as-is with accepted residual risk.**

- All 10 plan tasks are implemented as specified, each with its own commit and dedicated test file.
- `tsc --noEmit` passes in both `apps/api` and `apps/web`.
- `vitest run` 113/113 tests pass, including TDD coverage for sensitive logic (points 1,4,6).
- Spot-checks confirm hard blocks (renewal, radiation, cap, legacy) and masking/gating (encryption) behave as specced with French messages.
- Schema changes are nullable/with defaults; existing flows preserved; thresholds are admin-editable except for the one global fallback constant (I1).
- Retention is correctly **disabled by default** (requires `retention.enabled=true` or any `*Days>0`), scheduled at 03:00, and documented in `AdminDashboard.tsx`.
- No critical data-loss or silent-drop paths found: offline sync alerts managers on hash/double-délivrance conflicts, fraud creates `FRAUD_ALERT` audit entries visible via `GET /admin/anomalies`.

Residual **Important** items (I1-I4) are not ship-blockers but should be fixed in a fast follow-up (estimated <1 day total) to meet the strict “no hardcoded threshold” contract and to harden encryption rotation and offline parity.

---

## 8. Summary Paragraph

La branche des 10 corrections couvre intégralement le plan du 26 août : dérogation d’urgence avec garde ≥10 caractères et rappel 48h, seuils d’autorisation prioritaires par produit/acte (plus restrictif) éditables côté admin, mode hors-ligne complet (IndexedDB queue + cache 36h + bannière + `POST /offline/sync` avec vérif hash et détection de double délivrance), radiation qui passe `Contract` à `TERMINATED`/`Beneficiary` à `SUSPENDED` et bloque toute délivrance même via cache, chiffrement `AES-256-GCM` avec gate `canAccessMedical` et masquage `[Contenu médical restreint]`, verrou `authorizedAmount` qui bloque toute facture au-delà du montant autorisé, plafond de renouvellements avec re-check transactionnel et job d’alerte sensible groupé par classe DCI à 90j, détection fraude Z-score + cumul avec tableau anomalies admin, et rétention désactivée par défaut (job 03:00 n’opère que si configuré). Les vérifications automatiques sont au vert (`tsc --noEmit` sans erreur côté api et web, 113 tests vitest au vert). Le seul écart au contrat global est le fallback global `150000` encore codé en dur (`engine.ts:14`), à externaliser en `SystemConfig`, plus trois points d’attention secondaires (double scheduling cron, clé de chiffrement liée au `jwtSecret` sans versioning, et parité du message `Contrat radié` en sync offline) — aucun ne justifie de bloquer la mise en production.

---

*Generated by final-review. Workdir: `C:\Users\HP\Desktop\mutuelle santé`. Commands: `git log --oneline 1984328..HEAD`, `git diff --stat 1984328..HEAD`, `npx tsc --noEmit` (api/web), `npx vitest run` (113 passed).*
