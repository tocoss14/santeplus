# Task 1 Report — Dérogation d'urgence sur AUTH_REQUIRED

**Status:** DONE

**Commits:**
- `c6445a2` feat: emergency override on AUTH_REQUIRED with justification and 48h reminder

**Test summary:**
- Command: `npx vitest run tests/emergency-override.spec.ts --reporter=verbose` (apps/api)
- Output: 5 passed (Test 1 AUTH_REQUIRED blocked → 400, Test 2 short justification → 400, Test 3 valid emergency-confirm → AUTHORIZED_EMERGENCY + AuditLog/CareRecordEvent/EMERGENCY_OVERRIDE, Test 4 AUTHORIZED_EMERGENCY → CONFIRMED, cron 48h reminder)
- Full suite: `npx vitest run --reporter=verbose` → 32 passed (3 files), `npx tsc --noEmit` → no errors, `npx prisma validate` → valid, `npx prisma generate` → ok

**Changes:**
- `apps/api/prisma/schema.prisma` — Claim: emergencyOverride Boolean @default(false), emergencyJustification String?, emergencyActorId String?, emergencyAt DateTime?
- `apps/api/prisma/migrations/20260826120000_emergency_override/migration.sql` — ALTER TABLE statements
- `apps/api/src/common/permissions.ts` — added `provider.emergencyOverride`, added to PROVIDER role
- `apps/api/prisma/seed.ts` — synced PROVIDER permissions
- `apps/api/src/modules/providers/provider-portal.controller.ts` — added `POST /provider/thirdparty/:id/emergency-confirm` with RequirePermissions('provider.emergencyOverride'), validation ≥10 chars, sets AUTHORIZED_EMERGENCY + emergency fields, creates AuditLog + CareRecordEvent, notifies managers EMERGENCY_OVERRIDE; updated confirm guard to allow AUTHORIZED_EMERGENCY
- `apps/api/src/jobs/cron.service.ts` — added cron `0 9 * * *` and `checkEmergencyOverrides()` (AUTHORIZED_EMERGENCY where emergencyAt < now-48h and decidedAt == null → reminder to managers)
- `apps/api/tests/emergency-override.spec.ts` — TDD tests (fail-first demonstrated, then pass)

**Concerns:**
- CareRecordEvent creation falls back to lookup by claimId then patientUserId; if no CareRecord exists, event is skipped (graceful). In production, most thirdparty claims may not yet have a CareRecord; consider explicitly ensuring dossier creation before emergency override if audit completeness required.
- Migration is zero-downtime (new columns nullable/default). DB migration not yet applied to live DB — run `npx prisma migrate deploy` on deployment.
- French strings preserved for user-facing messages.
