# Task 4 Report — Radiation des salariés

**Status:** DONE

**Commits:**
- `feat: radiation des salariés — endpoint POST /company/employees/:id/radiate, CSV Statut RADIE, blocage Contrat radié et UI Radier` (pending — see git log)

**Test summary:**
- Command: `npx vitest run tests/radiation.spec.ts -v` (apps/api)
- Output: 9 passed
  - POST /company/employees/:id/radiate -> Contract TERMINATED, Beneficiary SUSPENDED with removedAt=effectiveAt, AuditLog EMPLOYEE_RADIATED + BeneficiaryChange RADIATION
  - effectiveAt par défaut = now si non fourni (TERMINATED + audit)
  - effectiveAt invalide -> 400 BadRequest
  - GET /company/employees?includeRadiated=true inclut radiés (listEmployees)
  - CSV import Statut=RADIE ou RADIÉ -> radié immédiatement après création (2 radiations sur 3 lignes)
  - CSV import Statut=RADIE(E) aussi radié
  - createDelivery/createConsultation bloque si contrat radié TERMINATED même si cache dirait actif -> 400 "Contrat radié — délivrance impossible"
  - createConsultation bloque aussi avec SUSPENDED
  - createDelivery double-check via patientContract lookup bloque si TERMINATED (branch cover for offline cache)
- Full suite: `npx vitest run -v` → 50 passed (5 files), `npx tsc --noEmit` (api + web) → no errors

**Changes:**
- `apps/api/src/modules/company/company.controller.ts:42-53` — `listEmployees(companyId,q,includeRadiated?)` now respects `includeRadiated=false` to filter `status=ACTIVE`, otherwise includes radiés
- `apps/api/src/modules/company/company.controller.ts:109-170` — `importEmployees` after `createEmployee` checks column `STATUT` (header uppercased, NFD normalized) for values `RADIE` / `RADIÉ` (-> `RADIE`) / `RADIE(E)` and calls `radiateEmployee` immediately; failure is recorded in errors array (no silent failure)
- `apps/api/src/modules/company/company.controller.ts:290-363` — new `radiateEmployee(auth, employeeId, effectiveAtRaw?, reason?)` validates company ownership + role MEMBER, parses effectiveAt ISO (400 if invalid, default now), in transaction: user.status=SUSPENDED, contracts (kind INDIVIDUAL, companyId) filtered to ACTIVE/SUSPENDED/PENDING_PAYMENT -> TERMINATED with endDate=effectiveAt, beneficiaries -> SUSPENDED + removedAt=effectiveAt plus BeneficiaryChange(action=RADIATION, meta reason/effectiveAt, byUserId), bulk updateMany for remaining COVERED, auditLog EMPLOYEE_RADIATED
- `apps/api/src/modules/company/company.controller.ts:428-445` — GET `/company/me/employees` and alias `/company/employees` now accept `?includeRadiated=true|false` and pass to service
- `apps/api/src/modules/company/company.controller.ts:467-483` — new `POST /company/me/employees/:id/radiate` and alias `/company/employees/:id/radiate` with RequirePermissions company.employees.manage, body {effectiveAt?:string, reason?:string} validated via Zod, delegates to radiateEmployee
- `apps/api/src/modules/care/care.controller.ts:115-118,250-253,478-485` — in `createConsultation`, `createPrescription` (after resolveContract) and `createDelivery` (after patientContract lookup, now includes TERMINATED in query) added guard `if (contract.status === 'TERMINATED' || contract.status === 'SUSPENDED') throw 400 'Contrat radié — délivrance impossible'` — server double-check even if offline cache says active
- `apps/web/src/pages/company/Employees.tsx:6,8-22,24-35,52-83,92-140` — CSV sample updated with Statut column, added `showRadiated` checkbox + query param, added `radiateEmployee` call, per-row "Radier" button (orange) next to Sortie, shows "Radié" badge when not ACTIVE, import modal doc updated for Statut, new `RadiateModal` with date d'effet + motif, disabled silent failures
- `apps/api/tests/radiation.spec.ts` — TDD test file (9 tests) covering radiate logic, effectiveAt handling, CSV Statut, and care blocking

**Concerns:**
- Beneficiary.status was historically REMOVED in exitEmployee; radiation now uses SUSPENDED as per Task 4 spec, with removedAt set. This keeps beneficiaries queryable but suspended. If legacy code filters only REMOVED, radiés may still appear as COVERED in some views — verify all beneficiary queries use status=COVERED (care controller resolveContract already does) so radiés are correctly excluded from couverture checks.
- Transaction uses `$transaction` callback; if DB transaction fails partway, auditLog may not be persisted — caller gets exception (no silent failure) which surfaces as 500; importErrors captures radiation failure per row.
- effectiveAt future date is allowed (e.g., radiation effective next month) — contract endDate set to that future date yet status immediately TERMINATED. If business expects future-dated suspension while contract stays ACTIVE until that date, additional logic (status=SUSPENDED with future endDate) would be needed — currently follows spec "sets Contract.status = TERMINATED with removedAt = effectiveAt ?? now".
- GET alias `/company/employees` added for spec compatibility; frontend still uses `/company/me/employees`. Both require same permission.
- Seed not modified to include a radié employee (optional per spec); demo data remains with 6 actifs.
