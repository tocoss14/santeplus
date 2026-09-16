# Task 9 Report — Rétention/purge — mécanisme désactivé par défaut

**Status:** DONE

**Commits:**
- `bc7ec34` — `feat(retention): disabled-by-default retention/purge with 03:00 job, anonymize CareRecord and delete AuditLog (Task 9)`

**Test summary:**
- Command: `npx vitest run tests/retention.spec.ts -v` (apps/api) — **16 passed**
  - isExpired (4 tests): `null → false`, `undefined/0/negative → false`, `10 days ago with 7 days → true`, `5 days ago with 7 days → false`, `isExpiredAt deterministic with fixed now (10d→true, 5d→false, null→false)`
  - retentionConfigKeys (1 test): contains `retention.enabled`, `retention.careRecordDays`, `retention.invoiceDays`, `retention.auditDays`
  - parseRetentionDays (3 tests): JSON string numbers `7`/`30` parsed, `null/0/-5/not-a-number/""` → null, numeric input `7→7, 0→null`
  - isRetentionEnabled (4 tests): `{}`→false, `careRecordDays 0/not-a-number`→false, any Days `30/7/365`→true, `enabled=false` overrides even with Days, `enabled=true` forces true
  - job disabled (2 tests): `no SystemConfig → enabled false, 0 purged, no DB calls`, `enabled=false with Days → still disabled, 0 purged`
  - job enabled (2 tests): `auditDays=7 → deleteMany called with cutoff 7d, count 5`, `careRecordDays=30 → updateMany with status ANONYMIZED, beneficiaryId null, count 3, cutoff 30d`
- Full suite: `npx vitest run -v` → **108 passed** (10 files: engine 16, encryption 10, fraud 10, payment-mapping 11, threshold 9, authorized-cap 7, emergency-override 5, radiation 9, renewal 15, retention 16), `npx tsc --noEmit` → clean, `npx prisma validate` → valid

**Changes:**
- `apps/api/src/domain/retention.ts` (new, ~85 lines) — pure helpers: `RETENTION_KEYS = ['retention.enabled','retention.careRecordDays','retention.invoiceDays','retention.auditDays']`, `retentionConfigKeys(): string[]`, `parseRetentionDays(value: unknown): number|null` (JSON parse, numeric string fallback, >0 else null, floor), `isRetentionEnabled(config: Record<string,unknown>): boolean` (enabled=false → false, enabled=true → true, else any Days >0 → true else false), `getRetentionDays(config,key): number|null`, `isExpired(createdAt, retentionDays): boolean` (null/<=0 → false, else age > days*86400000 via Date.now()), `isExpiredAt(createdAt, retentionDays, now): boolean` (injectable now for tests).
- `apps/api/src/jobs/retention.job.ts` (new, ~95 lines) — `RetentionJob` (Injectable): `schedule()` cron `0 3 * * *` → `run()`, `readConfig()` findMany SystemConfig where key in retentionConfigKeys, `isEnabled()` delegates to isRetentionEnabled, `run(now): Promise<RetentionResult>` — if !enabled log disabled and return `{enabled:false, careRecordsAnonymized:0, auditLogsDeleted:0}`; else parse careRecordDays/auditDays/invoiceDays via parseRetentionDays; if careRecordDays>0: `prisma.careRecord.updateMany({where:{createdAt:{lt:cutoff}}, data:{beneficiaryId:null, providerId:null, status:'ANONYMIZED'}})` + `careRecordEvent.deleteMany` where createdAt<cutoff; if auditDays>0: `prisma.auditLog.deleteMany({where:{createdAt:{lt:cutoff}}})`; invoiceDays logged but not purged in MVP (no Invoice model); logs counts with cutoffs; returns RetentionResult.
- `apps/api/src/jobs/cron.service.ts:1-3,11-16,18-31,43-55` — import RetentionJob, add optional `retentionJob?: RetentionJob` ctor param, schedule `0 3 * * *` → `checkRetention()` in onApplicationBootstrap, guard blocks if injected jobs already scheduled, expose `async checkRetention(now)` delegating to injected job or ad-hoc `new RetentionJob(prisma)`.
- `apps/web/src/pages/admin/AdminDashboard.tsx:1-12` — add retention comment block and visible card: “Rétention / purge — désactivé par défaut… Configurer via PATCH /admin/config — clés retention.careRecordDays/invoiceDays/auditDays ou retention.enabled. Job quotidien à 03:00. MVP: anonymise CareRecord (beneficiaryId/providerId→null, status ANONYMIZED) et supprime AuditLog expirés.”
- `apps/api/tests/retention.spec.ts` (new, 178 lines) — TDD file covering isExpired/null/disabled/true/false, retentionConfigKeys, parseRetentionDays, isRetentionEnabled (disabled/enabled/override), job disabled-by-default (no config → 0 purged, disabled), enabled job (auditDays 7 deleteMany, careRecordDays 30 updateMany); mocks match renewal/fraud spec style.

**Concerns:**
- CareRecord anonymization keeps `patientUserId` (required FK) intact; only `beneficiaryId`/`providerId` → null and `status='ANONYMIZED'`, plus `CareRecordEvent` deletion. This masks PII-adjacent nullable relations but does not anonymize the patient link itself. If legal requires full unlinking, alternatives: (a) make `patientUserId` nullable + set null, (b) replace with fixed anonymized user placeholder, (c) delete CareRecord entirely. Current choice preserves referential integrity and is reversible via AuditLog.
- No DB migration needed (SystemConfig-driven); if `CareRecord.status` is semantically expected to be OPEN/CLOSED, introducing ANONYMIZED may need enum handling. Could instead add `anonymizedAt` column (nullable) for clearer semantics.
- `retention.invoiceDays` is read and logged but not acted upon — no Invoice model exists; Claim/Payment purge is out of scope for MVP and would need product/legal decision (e.g., keep invoices 10 years vs anonymize). Documented as not implemented.
- Disabled by default is enforced via `isRetentionEnabled` requiring numeric >0 or enabled=true; seed does NOT create any retention.* keys, so prod after deploy remains disabled until explicit `PATCH /admin/config`. Ensure `PATCH /admin/config` (AdminMiscController) is restricted to `config.manage` and audit-logged.
- Cron at 03:00 is additive; if RetentionJob is registered as Nest provider, CronService already schedules — avoid double schedule by not calling `retentionJob.schedule()` separately (current: only CronService schedules).
