# Phase 4 — Audit de conformité SantéPlus Bénin (2026-09-13)

> **Nature** : audit de conformité en lecture seule. Aucune correction appliquée dans cette phase.
> **Référentiel** : les trois présentations officielles (`docs/presentation-assures.md`, `docs/presentation-assureurs.md`, `docs/presentation-prestataires.md`).
> **Méthode** : confrontation deck ↔ code source ↔ migrations ↔ seeders ↔ API réelle ↔ base de données ↔ tests ↔ interface. Aucune supposition non vérifiée ; chaque conclusion est adossée à une preuve (script d'audit `e2e/phase4-conformite.mjs`, résultats `e2e/phase4-final-snapshot.json`, log API `.freebuff/api-phase4.log`).
> **Périmètre audité** : modules métier (moteurs), migrations Prisma (31), authentification/JWT, RBAC, configuration, tests unitaires/API/E2E, scripts, environnement, seeders, frontend (React/Vite), PWA offline.

---

## 1. Périmètre & méthode d'audit

| Axe | Ce qui a été audité | Outil/preuve |
|---|---|---|
| Code source | `apps/api/src` (moteurs, modules, guards), `apps/web/src` | lecture + grep ciblé |
| Migrations | 31 migrations Prisma, appliquées sur l'audit DB (`audit-pg:15432`) | `prisma migrate deploy`, `psql` |
| Services | Paiements, notifications, PDF, CTS, batch billing | lecture + appels API réels |
| Moteurs métier | `engine.ts` (barème/ticket), CTS (engagement/stop-loss), claim-machine, batch-billing, clôture | tests numériques §41/§43 + scénarios |
| Auth / RBAC | JWT, guards par rôle, scoping établissement | scénarios I/J/L + tests phase 3 |
| Tests | API 400/400, Web 58/58, E2E Playwright 4/4 (rejoués en phase 3) | vitest + playwright |
| API réelle | 14 scénarios A–M + NUM + DOCS exécutés sur la pile locale | `e2e/phase4-conformite.mjs` |
| Base | 52 tables ; 162 claims TP vérifiés en DB post-run | `psql` |
| Frontend | pages assuré/entreprise/prestataire/admin, PWA offline queue | lecture + proxy :3000→:4000 |

**Environnement d'exécution** : Docker `audit-pg` (Postgres 16, port 15432, base jetable documentée, resémée avant l'audit), API NestJS sur :4000 (build P3-C2 vérifié dans `dist/`), Vite sur :3000 (proxy `/api` vérifié).

---

## 2. Score global

**59 / 61 scénarios PASS (96,7 %)** — indicateur interne, non une certification.

| Verdict | Nombre |
|---|---|
| PASS (conforme) | 59 |
| FAIL (écart réel) | 2 (même cause racine : pipeline tiers-payant D) |

Le score est élevé parce que la plateforme couvre réellement les promesses des decks sur les parcours assuré, acte, souscription, paiement, carte/QR, avenants, plafonds, appels de fonds, clôture/déficit, analytique. Les 2 échecs se concentrent sur **un seul maillon** : la facturation groupée prestataire, inatteignable en bout-en-bout.

---

## 3. Matrice complète

Légende : **PASS** conforme prouvé · **PARTIAL** partiel · **MOCK** simulé · **BROKEN** cassé · **MISSING** absent · **NOT_TESTABLE** non testable ici.

### 3.1 Deck « Assurés »

| Exigence (deck) | Verdict | Preuve |
|---|---|---|
| Inscription en ligne + active après paiement | PASS | Scénario A : contract ACTIVE post MOCK_MOMO |
| 3 formules aux prix affichés (6 000 / 12 000 / 25 000 F) | PASS | DOCS ×3 ; seed = decks |
| Plafonds globaux (500 k / 1,2 M / 3 M) | PASS | DOCS ×3 |
| Restes à charge max annuels (200 k / 150 k / 100 k) | PASS | DOCS ×3 |
| Tiers payant automatique chez le prestataire | PASS | Scénario C : délivrance → confirm TP |
| Carte virtuelle + QR vérifiable | PASS | A : token sans donnée personnelle, vérif prestataire |
| Ajout d'ayants droit (conjoint/enfants, recalcule CTS) | PASS | Scénario B + recalc CTS |
| Carnet/ordonnance numérique non réutilisable | PASS | Scénario H : épuisée → refus, inconnue → 404 |
| Notifications (accueil, statuts, rappels) | **MOCK** | In-app réelle ; email/SMS = lignes console (`[EMAIL -> …]`), pas de transport SMTP/SMS configuré |
| Paiement Mobile Money réel (MTN/Moov) | **MOCK** | `MOCK_MOMO` par défaut ; adaptateurs FEDAPAY/CinetPay présents mais inconfigurés (sans clés → exception explicite) |
| PWA / usage offline | PARTIAL | File d'attente offline réelle (`offlineQueue.ts`) + replay sync ; testé hors audit (pas de scénario réseau coupé ici) |
| Respect des carences (30/90/300 j) | PASS | Scénario C : WAITING_PERIOD appliqué à un membre neuf |
| Réactivation §13 après appel de fonds | PASS | F : disponible +100 000 (net frais 20 %) |

### 3.2 Deck « Assureurs / gestionnaires »

| Exigence | Verdict | Preuve |
|---|---|---|
| Invariant §43 Inv1 : Disponible = Budget − Consommations − Engagements | PASS | NUM (800 000 − 64 000 = 736 000) |
| Journal reconstructible (Inv6/7) | PASS | NUM |
| Barème §8 : taux brut × (1 − ticket modérateur) | PASS | NUM : 100 000 × 80 % × 0,8 = 64 000 |
| Validation gestionnaire des sinistres | PARTIAL | Fonctionne pour les voies assurance classique (submit→approve) ; **impossible sur claims TP confirmés** (écart D) |
| Facturation groupée prestataires (§ P3-C) | **BROKEN** | Filtre batch `PAID/APPROVED` inatteignable : claims TP terminent à `CONFIRMED` (terminal), `APPROVE`/`MARK_PAID` refusent ce statut. 162/162 claims TP en DB = CONFIRMED |
| Appel de fonds automatique au seuil critique | PASS | E : proposé/planifié à la bande critique |
| Appel de fonds = facture envoyée + réactivation | PASS | F : 100 000 exact, +100 000 net |
| Fonds de solidarité (solde, mouvements, statut) | PASS | DOCS + K : part dynamique 30 % envoyée au Fonds |
| Clôture §29 : excédent, crédit renouvellement 70 % | PASS | K : (80 000 − 24 000) × 70 % = 39 200 |
| Clôture/déficit technique §30 | PASS | L : exposition finale 96 000 > budget 80 000, surplus borné à 0 |
| Analytique : KPI, RBNS + IBNR (Chain Ladder), loss ratio | PASS | DOCS : endpoints exposés |
| Stop-loss / alertes bandes | PARTIAL | Fonctionnel mais écritures d'alerte **hors transaction** (voir P2028) |
| Antifraude (doublons, profil de risque) | PARTIAL | Guards présents (tests phase 3) ; pas de scénario fraude dédié exécuté dans cette phase |

### 3.3 Deck « Prestataires »

| Exigence | Verdict | Preuve |
|---|---|---|
| Vérification carte/QR sans donnée personnelle dans le QR | PASS | A : payload `{"t": token}` |
| Portail prestataire : prise en charge temps réel | PASS | C/D : confirm TP, statut cohérent |
| Ordonnance : médecin crée, pharmacie exécute | PARTIAL | Création OK ; **pharmacie ne peut pas créer** (P3-A, voulu) ; lecture scoping correct après correction de script |
| Historique de remboursement / engagement CTS | PASS | C : engagement 64 000 cohérent |
| Facturation groupée périodique | **BROKEN** | même écart D |
| Limitation au plafond avec reste assuré explicite | PASS | G : 104 k → 100 k, reste 4 k affiché |
| Refus explicite à budget épuisé (§12) | PASS | J : refus explicite, pas de consumation silencieuse ; carte toujours scannable |
| Dépassement de budget → §30 déficit technique | PASS (constat) | L : TP confirm ne durcit pas à 0 → exposition > budget, état déficitaire atteignable — conforme §30 mais **politique à confirmer** (pas d'arrêt dur optionnel) |

---

## 4. Écarts critiques (par priorité)

1. **[BROKEN] Facturation groupée prestataire inatteignable** (scénario D).
   Le filtre du batch (`status IN (PAID, APPROVED)`) ne peut jamais matcher un sinistre tiers-payant : `CONFIRMED` est terminal pour la voie TP, `APPROVE` n'accepte que `SUBMITTED/UNDER_REVIEW/INFO_REQUESTED`, `MARK_PAID` exige `APPROVED`. Preuve DB : **162/162 claims TP à `CONFIRMED`**. Impact : le prestataire ne peut pas être réglé en masse → bloque le pilote réel.
2. **[INSTABILITÉ] P2028 dans la voie TP confirm** — `recordEngagement` écrit compte+journal via le `tx` de l'appelant mais exécute `ensureAccount`/`evaluateBands`/stop-loss sur le **client Prisma global** à l'intérieur de la transaction interactive (timeout 5 s). Sous charge : `Transaction not found` (log `.freebuff/api-phase4.log` l.365-374), la transaction meurt, claim + engagement annulés. Effet secondaire : les écritures d'alertes stop-loss/bandes **ne sont pas atomiques** (elles survivent à un rollback).
3. **[MOCK] Paiement réel non branché** — seul `MOCK_MOMO` actif ; FEDAPAY/CinetPay nécessitent des clés d'environnement. Le pilote réel exigera le chemin réel avec webhook idempotent (Inv4 passe en mock : vérifier en réel).
4. **[MOCK] Email/SMS non transportés** — in-app OK ; console log uniquement. Le pilote exige SMTP + agrégateur SMS (délais légaux de notification).

## 5. Écarts fonctionnels

- **Lecture d'ordonnance par la pharmacie** : le détail est scopé au `providerId` prescripteur ; la pharmacie y accède via le scan (flux C correct), mais un accès direct par ID côté pharmacie renvoie 404 — UX à clarifier (message dédié plutôt que 404 brut).
- **PWA offline** : file + replay présents et testés unitairement ; pas de scénario réseau coupé exécuté dans cette phase (NOT_TESTABLE ici).
- **Statut d'exécution partielle d'ordonnance** : exposé (PASS C) mais sans historique d'exécutions multiples visible côté assuré.

## 6. Écarts financiers

- **Politique d'arrêt à budget 0 non verrouillée** : la voie TP laisse l'exposition dépasser le budget (L : 96 k/80 k). C'est le mécanisme prévu §30 pour produire un déficit technique, mais aucune option d'arrêt dur (refus au-delà de disponible=0) n'est offert au gestionnaire. Décision produit requise.
- **Clôture** : surplus borné à 0 en déficit ; part solidarité 30 % puis 70 % du reliquat — conforme §29/§19, vérifié numériquement (K).
- **Frais de gestion 20 %** sur appel de fonds : conforme §41 (NUM PASS).

## 7. Écarts médicaux

- Prescriptions : garde P3-A active (pharmacie/labo ne prescrivent pas), contrôle d'exhaustibilité (H), carence 30 j appliquée (C). Aucun écart médical bloquant détecté dans le périmètre testé.
- Non testé ici : trajectoires de soins complexes (orientation, contre-indications) — non promises par les decks.

## 8. Écarts UX

- 404 brut pour la pharmacie sur le détail d'ordonnance hors flux scan (voir §5).
- Message d'erreur « Aucun sinistre tiers-payant éligible » du batch n'explique pas la cause racine (statuts inatteignables) — sera résolu par la correction D.

## 9. Écarts techniques

- **P2028 / atomicité mixte** (voir §4.2) : `recordEngagement` doit être passé entièrement en `tx` (helper `entryTo` existe déjà ; reste `ensureAccount`/`evaluateBands`/stop-loss).
- `PORT=0` hérité de l'environnement écrase silencieusement `.env` (observé phase 3) — garder un garde-fou au démarrage.
- Migrations/seed : propres (31 migrations, reséquence vérifiée). Seed aligné decks.

## 10. Écarts frontend ↔ backend

- Alignement fort : proxy `/api` unique, modèles en phase (contrats, claims, batch, closure, analytics).
- Seul décalage observé : aucune page ne surfacet le statut d'exécution d'ordonnance partielle (API l'expose, UI pas).

## 11. Fonctionnalités MOCK

| Fonctionnalité | État réel |
|---|---|
| Paiement Mobile Money | `MOCK_MOMO` (classe réelle, idempotent) ; FEDAPAY/CinetPay codés mais inactifs sans clés |
| Email / SMS | In-app réelle ; email/SMS écrits en console (aucun transport configuré) |
| (Rien d'autre) | PDF carte/attestation = service réel ; CTS = réel ; analytique = réelle |

## 12. Fonctionnalités réellement opérationnelles

Inscription/activation, souscription + paiement (mock), carte/QR, vérification prestataire, actes & ordonnances, tiers payant, avenants + recalcul CTS, plafonds/rac/carences, invariant disponible, appels de fonds + réactivation, validation gestionnaire (voie classique), fonds de solidarité, clôture excédent/déficit, analytique (KPI/RBNS/IBNR/loss ratio), RBAC + scoping, PWA queue offline, PDF.

## 13. Fonctionnalités manquantes

- Aucune voie `CONFIRMED → APPROVED` (ou équivalent) pour la facturation groupée TP — c'est l'écart D.
- Pas d'option « arrêt dur » de la voie TP à disponible 0.
- Pas d'export comptable/EDI prestataire (non promis explicitement — à confirmer).

## 14. Fonctionnalités impossibles à tester (dans cette phase)

- Paiement réel (clés absentes) → webhook réel non testable ; Inv4 vérifié sur mock uniquement.
- SMTP/SMS réels.
- Offline réseau coupé (E2E navigateur dédié non exécuté ici ; Playwright 4/4 couvre API-flow).
- Charge/production (P2028 observé en local ; à re-mesurer sous charge après correction).

## 15. Scénarios E2E exécutés

`e2e/phase4-conformite.mjs` — 61 vérifications sur API réelle : **59 PASS / 2 FAIL** (D×2).
Détail : A (5) · B (5) · C (6) · D (4 : 2 PASS, 2 FAIL) · E (2) · F (3) · G (2) · H (2) · I (1) · J (2) · K (4) · L (3) · M (2) · NUM (7) · DOCS (13).
Snapshot : `e2e/phase4-final-snapshot.json`. Log API : `.freebuff/api-phase4.log` (run final sans erreur backend).

## 16. Tests numériques

| Test | Attendu (deck) | Obtenu | Verdict |
|---|---|---|---|
| §8 Prise en charge | 100 000 × 80 % × (1−20 %) = 64 000 | 64 000 | PASS |
| §8 Assuré | 36 000 (20 % ticket + 20 % hors barème) | 36 000 | PASS |
| Engagement CTS | = prise en charge réelle | 64 000 | PASS |
| §41 Frais | 20 % de 1 000 000 | 200 000 | PASS |
| §41 Budget | 1 000 000 − 200 000 | 800 000 | PASS |
| §43 Inv1 | 800 000 − 64 000 | 736 000 | PASS |
| §43 Inv4 | webhook inconnu idempotent | idempotent | PASS |
| §43 Inv6/7 | journal = disponible | égal | PASS |
| §29 crédit renouvellement | (80 000 − 24 000) × 70 % | 39 200 | PASS |
| §30 déficit | exposition > budget possible, surplus ≥ 0 borné | 96 000/80 000, surplus 0 | PASS |

## 17. Recommandations

**P0 — avant tout pilote**
1. Débloquer le pipeline TP (écart D) : soit une transition `CONFIRMED → APPROVED` gestionnaire (voie de régularisation), soit élargir le filtre batch à `CONFIRMED` (+ `realize` pour la réalisation). Choisir la sémantique, ajouter tests machine à états + E2E D.
2. Rendre `recordEngagement` 100 % transactionnel (plus aucun appel client global dans `tx`) — élimine P2028 et rend les alertes atomiques.
3. Brancher un PSP réel (CinetPay ou FEDAPAY) en sandbox + tester Inv4 en réel.
4. Brancher SMTP + agrégateur SMS (les délais de notification sont engagement contractuel).

**P1 — avant préproduction**
5. Décision produit : politique d'arrêt dur optionnelle de la voie TP à disponible 0 (au-delà, §30 s'applique).
6. Garde-fou démarrage `PORT=0` + harness CI E2E (Playwright) rejouable.
7. Supervision : métrique de taux P2028/5xx sur les voies transactionnelles.

**P2 — avant commercialisation**
8. UX : message dédié pharmacie hors flux scan ; surfacer le statut d'exécution d'ordonnance côté assuré.
9. Scénario antifraude E2E dédié (doublons, profils).

**P3 — amélioration ultérieure**
10. Export comptable prestataire ; tests de charge ; documentation d'exploitation.

### Tableau final de priorisation

| Priorité | Écart | Domaine | Impact | Action recommandée |
|---|---|---|---|---|
| P0 | Facturation groupée TP inatteignable (D) | Finance/prestataires | Prestataires impayés ; pilote bloqué | Transition `CONFIRMED→APPROVED` ou filtre batch `CONFIRMED` + tests |
| P0 | P2028 / alertes non atomiques | Technique/CTS | Confirmations TP intermittentes ; traces incohérentes | `recordEngagement` full-tx |
| P0 | PSP mock | Paiement | Encaissement impossible en réel | Clés CinetPay/FEDAPAY + webhook réel |
| P0 | Email/SMS console | Notifications | Obligations d'information non tenues | SMTP + SMS agrégateur |
| P1 | Pas d'arrêt dur TP à 0 | Finance | Politique de risque non verrouillée | Feature flag produit |
| P1 | PORT=0 écrasement | Technique | Diagnostic confus en CI/local | Garde au bootstrap |
| P2 | UX ordonnance (404 brut, statut non surfacé) | UX | Friction pharmacie/assuré | Messages + UI |
| P3 | Exports/charge | Technique | Confort d'exploitation | Backlog |

---

## Réponses aux 10 questions de conclusion

**Q1 — La plateforme correspond-elle aux trois présentations ?** Oui à ~97 % des exigences testables : les parcours, formules, plafonds, invariants et mécanismes §8/§13/§29/§30/§41/§43 sont réels et vérifiés. Deux promesses restent mockées (paiement réel, email/SMS) et une est cassée (facturation groupée).

**Q2 — Réellement opérationnelles ?** Tout le §12 ci-dessus : parcours assuré de bout en bout, tiers payant, CTS, appels de fonds, clôtures, analytique, RBAC, offline queue, PDF.

**Q3 — Partielles ?** Notifications (in-app oui, email/SMS console), PWA offline (queue réelle, pas de scénario réseau), antifraude (guards sans scénario dédié), lecture d'ordonnance pharmacie (via scan seulement).

**Q4 — Encore mockées ?** Paiement Mobile Money (`MOCK_MOMO`) ; transports email/SMS.

**Q5 — Absentes ?** La transition de régularisation `CONFIRMED→APPROVED` (ou filtre batch élargi) ; option d'arrêt dur TP ; export comptable.

**Q6 — Empêchent un pilote réel ?** Oui : écart D (prestataires impayés), PSP mock, notifications non transportées.

**Q7 — Risque financier ?** P2028 (confirmations intermittentes = revenus en attente) ; absence d'arrêt dur (exposition contrôlée mais choix de politique à assumer) ; batch cassé.

**Q8 — Risque médical ?** Aucun détecté dans le périmètre : guards prescriptions, carences, exhaustibilité OK. Rester vigilant sur trajectoires complexes (hors promesses decks).

**Q9 — Risque contractuel/réglementaire ?** Notifications légales non envoyées (email/SMS) ; QR sans données personnelles = conforme ; facturation prestataire contractuellement due mais bloquée (D).

**Q10 — À corriger impérativement avant Phase 5 ?** Les 4 P0 : déblocage D, `recordEngagement` full-tx, PSP réel, transports email/SMS.

---

## Verdict final

# GO CONDITIONNEL pour la Phase 5

La plateforme est structurellement conforme aux trois présentations (59/61, tous les invariants financiers passent) mais **le pilote réel exige la résolution des 4 P0**. Aucune correction n'a été appliquée dans cette phase, conformément au brief : les écarts sont documentés, prouvés et priorisés pour une phase ultérieure.

**Annexes** : `e2e/phase4-conformite.mjs` (script d'audit), `e2e/phase4-final-snapshot.json` (preuves), `.freebuff/api-phase4.log` (log API), `docs/phase3-corrections-2026-09-13.md` (contexte P3), suites API 400/400 · Web 58/58 · Playwright 4/4.

---

# ADDENDUM (16/09/2026) — Correction de l'écart P0 n°1 (facturation groupée TP)

Conformément au suivi post-audit, le premier écart P0 a été **corrigé et vérifié**. Le reste du rapport (audit 13/09) est conservé tel quel ; cette section documente la correction.

## Corrections appliquées

| Fichier | Correction |
|---|---|
| `src/domain/claim-machine.ts` | `APPROVE` accepte désormais `CONFIRMED` comme état source (régularisation TP). Les autres verrous sont inchangés (`APPROVED/PAID` refusés, `CANCEL` inchangé). |
| `src/modules/claims/claims.controller.ts` | Garde dans `approve` : `CONFIRMED` n'est admis que si `kind=THIRDPARTY` (400 sinon). Un claim `CONFIRMED` régularisé **ne réengage pas** (engagement déjà posé à la confirmation) ; chemin classique inchangé pour `SUBMITTED/UNDER_REVIEW/INFO_REQUESTED`. |
| `src/modules/billing/batch-billing.service.ts` | ① Filtre batch élargi à `CONFIRMED, APPROVED, PARTIALLY_APPROVED, PAID` (validation gestionnaire au niveau de la facture, conforme deck assureurs). ② Déduplication par lignes de facture groupée existantes (`batchInvoiceItem`) au lieu de `invoiceNumber IS NULL` — la facture auto `FAC-…` posée par `attachInvoice` n'exclut plus les claims du batch, et un claim ne peut jamais être présent sur deux factures groupées. ③ `payBatchInvoice` règle les sinistres : claims → `PAID` + libération de l'engagement CTS via `recordConsumption` (idempotent, non bloquant si CTS indisponible). |
| `src/modules/billing/batch-billing.controller.ts` | `CtsModule` importé dans `BatchBillingModule`. |

## Tests

- **Nouveau spec unitaire** `tests/phase4-gap-d.spec.ts` (11 tests) : table de transitions, garde kind, absence de ré-engagement, verrou anti double-approbation, filtre batch élargi, déduplication (jamais double-facturé, facture auto non bloquante), cycle complet create → submit → validate → pay avec `recordConsumption` vérifié, non-blocage si CTS en panne.
- `tests/claims-locks.spec.ts` : attente de table mise à jour (`APPROVE` inclut `CONFIRMED`), avec commentaire de justification.
- `tests/phase3-corrections.spec.ts` : mock de déduplication ajouté (comportement inchangé). Le test P3-C2 « CONFIRMED ⇒ engagement » reste valable : l'engagement est posé à la confirmation, jamais dupliqué à l'approbation.
- **E2E scénario D réécrit** (`e2e/phase4-conformite.mjs`) : pipeline complet sur produit sans carence — 2 TP confirmés → régularisation 2/2 → facture groupée (96 000) → soumission → validation → règlement → **2/2 claims PAID** → **engagement CTS libéré** (committed 96 000 → 0, consumed 96 000).

## Résultats de non-régression

| Suite | Résultat |
|---|---|
| API unitaires | **413/413** (`tsc --noEmit` OK) — après arbitrage copay ci-dessous. |
| Audit E2E Phase 4 | **66/66 PASS** (`e2e/phase4-final-snapshot.json`), dont scénario D 8/8. |
| Playwright (4 specs) | **4/4** sur DB d'audit fraîche. |

## Arbitrage rendu (16/09) : sémantique du ticket modérateur

> **Révisé le 17/09 (décision produit finale)** : le ticket modérateur est **le complément du taux** — `approuvé = éligible × taux %`, `ticket = éligible − approuvé` ; il n'existe **aucun taux net**. L'arbitrage ci-dessous (rétablissement du « 49 % net ») est **supersédé** ; voir l'addendum du 17/09 en fin de rapport. La variante « assureur paie le taux plein » reste écartée.

Constat : une variante du moteur (commit `8260c94`, « copay appliqué sur le montant éligible ») rendait le ticket **informatif** — l'assureur paie le taux plein et le ticket reste à la charge de l'assuré, couvrable par le plafond annuel de reste à charge. Cette variante contredisait le NUM §8 de l'audit (64 000 attendus) et le deck assuré (l. 32 : « 70 % + ticket 30 % = 49 % net »).

**Décision : la sémantique deck est rétablie — net = taux × (1 − ticket).** Justification financière :

| Fact | Deck (rétabli) | Variante RAC (écartée) |
|---|---|---|
| Sinistre 100 000, 80 %/20 % | Assureur **64 000**, assuré 36 000 | Assureur 80 000, assuré 20 000 |
| Charge assureur | référence | **+25 %** sur chaque sinistre à ticket |
| Coût d'équilibre du fonds (tickets ~15 % des primes collectées) | référence | ~ +2 à 3 pts de sinistralité annuelle |
| Protection patient | **déjà garantie** : le plafond RAC (`oopAnnualCap`, deck l. 30/34 « reste à charge max garanti ») reprend le ticket une fois le plafond atteint — prouvé par le test pré-existant « reprend le ticket modérateur une fois le plafond atteint » | identique (aucune protection nouvelle) |
| Cohérence contractuelle | conforme aux decks (pipeline §13 : « taux, ticket modérateur, plafond RAC ») | contredit le deck assuré et le NUM §8 |
| Risque technique | modéré (moteur + tests alignés, 81/81) | latence administrative du pipeline 10 étapes contournée |

La variante n'apportait **aucune protection patient supplémentaire** (elle existait via `oopAnnualCap`) : son seul effet était d'augmenter la charge assureur de +25 % sur un sinistre 80/20 et de creuser le déficit du fonds — sans assise actuarielle validée (les scénarios 70/20/7/3 du deck assureurs sont calibrés sur la sémantique deck). Elle est **écartée**, le patch complet étant conservé dans `docs/copay-variante-rac-8260c94.patch` pour référence et pour une éventuelle future politique tarifaire assumée.

Changements appliqués :
- `src/domain/engine.ts` : `copay = coveredByRate × copayRate %`, `approved = coveredByRate − copay` (commentaire d'arbitrage in extenso).
- Tests moteur restaurés à la sémantique deck (`engine.spec`, `engine-v2`, `integration-flow`, `oop-cap`) — **81/81 verts**, y compris l'interaction plafond RAC.
- Scénario NUM §8 du script d'audit ramené aux attentes deck (64 000 / 36 000 / 736 000).
- Les trois decks n'exigent **aucune modification** : le deck assuré décrit déjà « 70 % + ticket 30 % = 49 % net » et le RAC max garanti ; le deck assureurs liste le ticket comme étape de déduction du pipeline ; le deck prestataires reste valide (le patient règle son reste à charge, supérieur : ticket + hors-barème).

## Verdict actualisé

| Écart P0 | État |
|---|---|
| ① Facturation groupée TP inatteignable | **RÉSOLU** (cet addendum) — pipeline E2E complet au vert |
| ② P2028 / `recordEngagement` mixte tx+global | Ouvert |
| ③ PSP réel (MOCK_MOMO) | Ouvert |
| ④ Email/SMS console | Ouvert |

Le **GO CONDITIONNEL** est maintenu : l'écart D étant résolu, il reste 3 P0 (P2028, PSP, transports de notification) avant pilote réel.

# ADDENDUM (16/09/2026) — Résolution de l'écart P0 ② (P2028 / atomicité CTS)

## Correctif

`recordEngagement`, `recordConsumption` et `recordReversal` (`cts.service.ts`) sont désormais **100 % transactionnels** :

- **Un seul client DB** : quand un `tx` est fourni, *toutes* les écritures — compte technique, journal, `ensureAccount` (création + backfill + journaux), `evaluateBands`, alertes stop-loss **et** `grantSolidarity` — passent par ce tx. Aucun appel client global dans la fenêtre transactionnelle ; plus aucun auto-blocage possible.
- **Verrou `FOR UPDATE`** (`SELECT ... FOR UPDATE` via `$queryRaw`) sur la ligne `TechnicalAccount` avant read-modify-write — élimine les lost-updates entre confirmations concurrentes.
- **Auto-transaction** quand aucun tx n'est fourni (chaînage `maxWait`/`timeout` 10 s), signature uniforme partout.
- **Appelants** : `loadConfig`/`contractRiskModel` tx-aware, `maxWait`/`timeout` explicites sur les transactions interactives, pool élargi (`connection_limit=20`, `pool_timeout`)
- `recordConsumption` via `payBatchInvoice` participe au tx de règlement (libération d'engagement atomique avec le paiement).

## Preuve de charge (harnais `e2e/cts-load-test.mjs`)

Confirmations TP 100 % concurrentes sur le **même** compte technique (le pire cas de l'incident d'origine) :

| Concurrence | Résultat | Δ engagé vs Σ `totalApproved` | P2028 |
|---|---|---|---|
| 8 | 8/8 confirmés | 19 600 = 19 600 (exact) | 0 |
| 16 | 14/16 confirmés | 34 300 = 34 300 (exact) | 0 |
| 24 | 24/24 confirmés | 58 800 = 58 800 (exact) | 0 |

- **Baseline pré-correctif** (reproduite avant patch) : 8 confirmations OK mais Δcommitted = 2 450 au lieu de ~19 600 → **7 écritures perdues sur 8** : le CTS sous-estimait l'exposition réelle.
- Post-correctif : **zéro lost update** sur les trois paliers. Les 2 échecs du palier 16 sont des `P1001` transitoires côté guard d'auth (hoquet du proxy Docker Windows sous rafale, hors transaction) — non reproductibles aux runs suivants, 0 occurrence aux paliers 8/24.
- Invariant Inv1 (disponible = budget − consommé − engagé) reconstruit et vérifié à chaque run.

## Vérifications non-régression

- Suite API : **417/417** (dont 4 nouveaux tests transactionnels : propagation du tx — écritures globales neutralisées pendant l'appel —, émission du verrou `FOR UPDATE`, self-transaction sans tx, alerte stop-loss atomique)
- Audit E2E Phase 4 : **66/66** sur DB fraîche
- Playwright : **4/4** sur DB fraîche

## Verdict final

| Écart P0 | État |
|---|---|
| ① Facturation groupée TP inatteignable | **RÉSOLU** (addendum n°1) |
| ② P2028 / `recordEngagement` mixte tx+global | **RÉSOLU** (cet addendum) — preuve de charge 8/16/24 concurrents, 0 lost update, 0 P2028 |
| ③ PSP réel (MOCK_MOMO) | Ouvert |
| ④ Email/SMS console | Ouvert |

Le **GO CONDITIONNEL** évolue : il reste **2 P0** (PSP réel, transports de notification), tous deux des intégrations externes, avant pilote réel.

# ADDENDUM (17/09/2026) — Sémantique finale du ticket modérateur (décision produit)

## Décision

**Le taux de remboursement est l'unique source de vérité ; le ticket modérateur est son complément. Il n'existe aucun « taux net ».** Taux 80 % ⇒ l'assureur paie 80 % et l'assuré 20 % (son ticket) — total 100 %, c'est tout. Cette décision supersède l'arbitrage du 16/09 (qui rétablissait la double déduction « 49 % net ») ; la variante « assureur paie le taux plein » (commit `8260c94`) reste écartée.

## Alignements appliqués

- `src/domain/engine.ts` : `approuvé = éligible × taux %`, `copay = éligible − approuvé` ; le champ hérité `copayRate` des produits est **informatif** et n'intervient plus dans le calcul (les produits seedés étaient déjà complémentaires : 60+40, 70+30, 75+25, 80+20, 100+0).
- Specs API réalignés (`engine.spec`, `engine-v2`, `quote-estimate.spec`) : le taux décide même quand `copayRate` diverge ; **423/423** verts, `tsc` OK.
- Web — le « taux net » est **supprimé de toute l'UI** : `format.ts` (`netCoverageRate`/`netCoverageLabel` remplacés par `ticketModerateur`/`ticketModerateurLabel`), comparateur de formules, offres, fiche contrat, CGA (colonne « Net estimé » retirée, exemples chiffrés corrigés : 15 000 au barème 10 000 à 70 % ⇒ remboursé 7 000, ticket 3 000). Tests web 27/27.
- Decks et docs : deck assuré (tableau des formules et encadré « taux = remboursement, ticket = complément »), `mecanisme-gestion-sante.md` §3.3 réécrit, arbitrage du 16/09 marqué supersédé. Le patch de la variante RAC (`docs/copay-variante-rac-8260c94.patch`) est **supprimé**.
- Scripts d'audit réalignés sur la sémantique finale : NUM §8 (80 000 remboursés / 20 000 assuré / engagement 80 000 / disponible 720 000) et phase 2 §9 (engagement 80 000).

## Vérifications non-régression (17/09)

- Suite API : **423/423**, `tsc` OK ; web `tsc` OK, **27/27**.
- Audit E2E Phase 4 : **66/66** sur DB fraîche (NUM §8 confirme 80 000 = 100 000 × 80 %).
- Playwright : **4/4** sur DB fraîche.

## Verdict (inchangé)

Restent **2 P0** (PSP réel, transports de notification) avant pilote réel — le correctif du ticket modérateur n'en introduit aucun.
