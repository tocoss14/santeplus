# Phase 3 — Corrections contrôlées et validation (13/09/2026)

Ce rapport consigne les corrections appliquées en Phase 3, avec preuves de non-régression.

## Anomalies traitées

> **Mise à jour 15/09/2026 — P3-C2 implémenté + tests de régression consolidés.**
> Voir sections « P3-C2 » ci-dessous et « Non-régression finale » en fin de rapport.

### P3-C2 — Invariant financier `CONFIRMED ⇒ engagement` (implémenté 15/09/2026)

- **Gravité :** HIGH (cœur financier — §16/§17 de la Phase 3)
- **Cause racine :** tous les points de passage vers `CONFIRMED`/`AUTHORIZED`/`APPROVED` appelaient `recordEngagement` dans un `try/catch` silencieux, **après** avoir écrit le statut. Un échec CTS produisait un claim confirmé sans trace d'engagement (violation §17).
- **Correction appliquée (engage-first atomique) :**
  - `cts.service.ts` : `recordEngagement` accepte désormais `opts.tx` (client de transaction Prisma). Si fourni, la mise à jour du `TechnicalAccount` et l'écriture du journal `ENGAGEMENT` s'effectuent **dans la transaction de l'appelant** via le nouvel helper `entryTo`. Nouvelle clé d'options `tx` dans `CtsMutationOpts`.
  - `provider-portal.controller.ts` (`confirm`) : le claim et l'engagement sont écrits dans **une seule transaction** `$transaction` — si l'engagement échoue (CTS indisponible/épuisé), le claim **n'est pas confirmé** (rollback intégral).
  - `claims.controller.ts` (`authorizeThirdParty`, `approve`) : même schéma transactionnel atomique.
  - `claims.controller.ts` (`submit` auto-approbation) : le statut étant déjà écrit avant l'appel, un échec d'engagement déclenche un **rollback de compensation** (statut ramené à `SUBMITTED`, `totalApproved` annulé) + notification `CTS_ENGAGEMENT_FAILED` aux gestionnaires. Le claim repart en file de traitement manuel.
  - `care.controller.ts` (`createDelivery`) : engagement CTS injecté (`@Optional`) **dans la transaction** qui crée delivery + claim `CONFIRMED`.
  - `offline.controller.ts` (`POST /offline/sync`) : même invariant pour les délivrances hors-ligne synchronisées — plus aucun claim `CONFIRMED` sans engagement, y compris hors-ligne.
  - `CareModule` / `OfflineModule` : import de `CtsModule` ajouté.
- **Fichiers :** `apps/api/src/modules/cts/cts.service.ts`, `modules/providers/provider-portal.controller.ts`, `modules/claims/claims.controller.ts`, `modules/care/care.controller.ts`, `modules/offline/offline.controller.ts`.
- **Tests :** `tests/phase3-corrections.spec.ts` (P3-C2 : engagement appelé avec `tx` partagé, échec CTS ⇒ statut inchangé et aucune écriture de statut, voie sans CTS préservée, `authorizeThirdParty` atomique).
- **Statut :** FIXED.

### Consolidation des tests de régression (15/09/2026)

Nouveau fichier `apps/api/tests/phase3-corrections.spec.ts` (18 tests verts) :

| Anomalie | Tests |
|---|---|
| P3-A | PHARMACY → 403, LABORATORY → 403, CLINIC → autorisé |
| P3-B | hier OK, aujourd'hui OK, +1 jour → 400, 2030 → 400, > childMaxAge → 400, date non parsable → 400 (« pas-une-date », « 9999-99-99 ») |
| P3-C | `kind=THIRDPARTY` inclus dans la facture groupée, `REIMBURSEMENT` exclu, claims d'un autre prestataire exclus |
| P3-C2 | engagement avec `tx` partagé, échec CTS ⇒ rollback sans écriture de statut, `authorizeThirdParty` atomique + rollback |

**Garde supplémentaire ajouté (P3-B) :** `contracts.controller.ts` rejette désormais explicitement une **date de naissance invalide** (`NaN`) — elle aurait sinon traversé tous les contrôles de comparaison. Message : `Date de naissance invalide`.

### Ajustements des mocks de tests existants (non métier)

`emergency-override.spec.ts`, `claims-locks.spec.ts`, `authorized-cap.spec.ts` : ajout de `$transaction` aux mocks Prisma (les contrôleurs écrivent désormais engagement + statut dans une seule transaction). Aucune assertion métier modifiée.

### P3-A — Pharmacie / LABORATORY : interdiction création ordonnance
- **Gravité :** HIGH (clinique, non technique)
- **Cause :** `care.controller.createPrescription` ne vérifie pas le type d'établissement du prescripteur. La permission `provider.prescribe` est attribuée au rôle `PROVIDER` sans distinction.
- **Correction :** refus `ForbiddenException` pour `establishment.type === 'PHARMACY' || 'LABORATORY'` dans `createPrescription` (care.controller.ts).
- **Frontend :** non modifié — la protection reste côté backend, ce qui est la règle.
- **Tests :** régression intégrée dans `tests/radiation.spec.ts` (pharm/médecin/radiation).
- **Statut :** FIXED.

### P3-B — Date de naissance future bénéficiaire
- **Gravité :** HIGH
- **Cause :** `BeneficiariesController.add` applique `childMaxAge` mais pas l'interdiction `birth > today`.
- **Correction :** `if (birth > new Date()) throw new BadRequestException(...)` dans `contracts.controller.ts` BeneficiariesController.add.
- **Tests :** régression via `birth-certificate.spec.ts` + nouveaux scénarios à ajouter (cf. TODO).
- **Statut :** FIXED.

### P3-C — CTS / engagement / tiers payant (constant drift)
- **Gravité :** HIGH
- **Cause :** deux représentations du kind tiers-payant coexistaient (`THIRDPARTY` dans les claims créés par care/provider-portal, `THIRD_PARTY` dans batch-billing + analytics). Cela rendait invisible le recoupement claim↔facture groupée.
- **Correction :**
  - canonicalisation `THIRDPARTY` dans `care.controller.ts` (createConsultation, createDelivery) et `provider-portal.controller.ts` (initiate, confirm, realize, invoice, stats).
  - batch-billing `createBatchInvoice` / `providerStats` utilisent désormais `THIRDPARTY`.
- **Résultat immédiat :** batch invoice retrouve les claims tiers-payant confirmés/approuvés/payés.
- **Invariant financier P3-C2 (étape suivante — non encore appliqué) :** garantir `claim CONFIRMED` avec `totalApproved > 0` ↔ `engagement CTS > 0`. Pour l'instant le mécanisme `confirm()` → `recordEngagement(...)` est non bloquant (try/catch silencieux) — comportement connu, documenté, à traiter séparément sans casser la non-régression.
- **Statut :** FIXED sur la dérive constante (reprise claims par batchinvoice). P3-C2 en attente décision.

### P3-D — Configuration environnement
- **Gravité :** HIGH (configuration/production)
- **Cause :** `.env` local pointait vers une base distante, et l'API ne chargeait pas `.env` en runtime. Aucun risque de mutation prod dans les tests récents (vitest sont unitaires/in-memory), mais exposition potentielle.
- **Correction :**
  - `.env` local isolé sur la base d'audit Docker.
  - `main.ts` charge `dotenv` en développement (`NODE_ENV !== 'production'`).
  - `E2E=1` adoucit les limiters (×1000) sans toucher au prod.
- **Tests :** rebuild + typecheck + baseline API/web/E2E rejoués.
- **Statut :** FIXED.

## Non-régression

| Suite | Résultat |
|---|---|
| API tests | **400/400 PASS** (15/09/2026 — 382 baseline + 18 nouveaux tests `phase3-corrections.spec.ts`) |
| Typecheck API | `tsc -p tsconfig.build.json --noEmit` → OK |
| Typecheck Web | `tsc --noEmit` → OK |
| Web tests | 58/58 (non modifiés — aucun changement frontend) |
| E2E Playwright (4) | **4/4 PASS** (15/09/2026 — stack audit locale : Postgres Docker `audit-pg:15432` réinitialisé + 31 migrations + seed, API `:4000`, Vite `:3000`, exécution sérialisée `--workers=1`. Parcours couverts : admin/instruction, register→acte→quote→subscribe→pay→carte→dépense, entreprise/CSV, prestataire/QR. Traces DB vérifiées : nouveau compte `e2e_*@test.bj`, 2 contrats créés, claim basculé en UNDER_REVIEW.) |

## Preuves

- TYPESCRIPT : `npx tsc -p tsconfig.build.json --noEmit` → OK.
- CTS / batch billing : `tests/cts-service.spec.ts`, `tests/cts-engine.spec.ts`, `tests/batch-billing.spec.ts` → tous verts.
- Radiation (pharmacie/ordonnance) : `tests/radiation.spec.ts` → 9 verts.
- Legacy removal : `tests/legacy-removal.spec.ts` → régression correcte corrigée (mock claim construction alignée sur `THIRDPARTY`).

## TODO Phase 3 restant

1. ~~Rejouer `npx vitest run` complet~~ — fait : 400/400.
2. ~~Rejouer E2E Playwright sur la stack locale~~ — fait : 4/4 PASS (15/09/2026).
3. ~~P3-C2 : invariant `CONFIRMED ⇒ engagement`~~ — fait, voir section dédiée.
4. ~~Tests explicites pharmacie/naissance/batch~~ — fait (`tests/phase3-corrections.spec.ts`, 18 tests).
5. Couverture frontend : masquer bouton création ordonnance pour pharmacie UI (optionnel, pas bloquant car backend couvre).
6. ~~Documenter P3-C2 décision~~ — décision retenue : **transaction atomique** (échec d'engagement ⇒ claim non confirmé, rollback). Pour l'auto-approbation, rollback de compensation vers `SUBMITTED` + notification gestionnaires.

## Statut final

| Anomalie | Statut |
|---|---|
| P3-A (pharmacie/ordonnance) | FIXED + tests |
| P3-B (naissance future/invalide) | FIXED + tests (garde NaN ajouté) |
| P3-C (dérive constante) | FIXED + tests |
| P3-C2 (invariant engagement) | **FIXED + tests** (15/09/2026) |
| P3-D (configuration) | FIXED |

Le reste (offline, paiement réel FedaPay, SIMULATION_10M, COMMUNAUTÉ, preuve financière hors-ligne) reste NOT_TESTABLE hors environnement dédié.
