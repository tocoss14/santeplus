# Task 10 Report — Suppression du circuit tiers payant "legacy" générique

**Status:** DONE

**Commits:**
- `d03cd31` — `feat: suppression circuit legacy tiers payant pour actes a prescription obligatoire (Task 10)`

**Test summary:**
- Command: `npx vitest run tests/legacy-removal.spec.ts --reporter=verbose` (apps/api) — **5 passed**
  - PHARMACY sans ordonnance valide → 400 (legacy supprimé) — `BadRequestException` avec message `prescription`/`ordonnance`, vérifie que le garde bloque la création sans `Prescription` valide (`status ACTIVE|PARTIALLY_EXECUTED`, `validFrom <= careDate <= validUntil`, `quantity - deliveredQty > 0`)
  - PHARMACY via Act (requiresPrescription=true) sans ordonnance → 400 — même garde déclenché par `Act.requiresPrescription`, catégorie PHARMACY ou non, prouve que le fallback legacy ne contourne pas le flag Act
  - CONSULTATION sans ordonnance → 200 (direct TP conservé) — `initiate` retourne `{id: 'claim-1', reference: /^TPE-/, status: PENDING_CONFIRMATION|AUTH_REQUIRED}` sans throw, prouve que `requiresPrescription==false` garde le circuit direct
  - CONSULTATION via Act requiresPrescription=false sans ordonnance → 200 — même avec actId, si `act.requiresPrescription==false` le direct est autorisé
  - PHARMACY avec ordonnance valide → 200 — avec `prescription.findFirst` retournant une ligne `PHARMACY` restante, `initiate` passe et crée la prise en charge (circuit prescription-obligatoire fonctionnel)
- Full suite: `npx vitest run --reporter=verbose` → **113 passed** (11 files: engine 16, encryption 10, fraud 10, retention 16, radiation 9, authorized-cap 7, emergency-override 5, renewal 15, payment-mapping 11, threshold 9, legacy-removal 5), `npx tsc --noEmit` (apps/api + apps/web) → clean

**Changes:**
- `apps/api/src/modules/providers/provider-portal.controller.ts:362-387` — Ajout du commentaire bloc Task 10 expliquant la suppression du circuit legacy. Le garde `for (item of dto.items) { requiresPrescription = categoryId==='PHARMACY' || act.requiresPrescription; if (requiresPrescription) { findFirst Prescription … if (!hasQty) throw 400 } }` est désormais documenté comme **seule voie** pour PHARMACY/act à prescription. Aucun `else { // legacy direct TP }` subsistant — vérifié : le fichier ne contenait pas de branche else bypass (suppression déjà effective depuis Task 4), le commit ajoute le commentaire explicite `Pas de else — pour les actes sans prescription (CONSULTATION etc.), le tiers payant direct reste autorisé` et supprime tout code mort potentiel. Comportement inchangé pour CONSULTATION (requiresPrescription false → pas de vérification, direct TP conservé).
- `apps/web/src/pages/provider/NewThirdParty.tsx:5-9` — Ajout commentaire header Task 10 : tiers payant PHARMACY direct legacy supprimé côté API, PHARMACY passe exclusivement par `ProviderDeliveries` (scan ordonnance d'abord). Pas de changement UI fonctionnel, conformité globale : garde direct uniquement pour `requiresPrescription==false`.
- `apps/web/src/pages/provider/ProviderDeliveries.tsx:5-9` — Ajout commentaire header Task 10 : cette page est la seule voie pour actes à prescription obligatoire, `scan ordonnance` (QR / n° ORD-…) obligatoire, aucun bouton direct PHARMACY sans ordonnance.
- `apps/api/tests/legacy-removal.spec.ts` (new, 224 lines) — TDD file Task 10, mocks `ProviderPortalController` (`portal.requireEstablishment`, `portal.resolveContract`, `prisma.act.findUnique`, `prisma.prescription.findFirst`, `prisma.product.findUnique`, `prisma.$transaction` + `claims.buildEstimation`). Couvre les 2 cas cœur exigés (PHARMACY→400, CONSULTATION→200) + 3 cas complémentaires (Act requiresPrescription true→400, CONSULTATION via Act false→200, PHARMACY avec ordonnance→200).

**Concerns:**
- Garde actuel : `requiresPrescription = categoryId==='PHARMACY' || act.requiresPrescription`. Si une catégorie future (ex: LABO, OPTIQUE) devient prescription-obligatoire sans être mappée à `PHARMACY`, seule `Act.requiresPrescription` la couvrira. Vérifier que le seed/act catalogue positionne `requiresPrescription=true` pour tous les codes PHARMACY et tout acte devant être verrouillé ; sinon un acte PHARMACY par catégorie non-PHARMACY mais sans Act pourrait bypasser (peu probable car PHARMACY est la catégorie de référence).
- Vérification prescription filtrée par `lines: { some: { categoryId: item.categoryId } }` + `lines.some(qty-delivered>0)`. Si une ordonnance contient une ligne `PHARMACY` mais pour un DCI différent de l'item demandé, elle passe quand même (granularité catégorie, pas code). C'est le comportement existant depuis Task 4 ; un durcissement au niveau `code`/`medicationId` serait plus strict mais hors scope Task 10.
- `ProviderDeliveries.tsx` est déjà le circuit prescription-obligatoire ; `NewThirdParty.tsx` conserve le circuit direct pour CONSULTATION. Aucune validation UI supplémentaire n'a été ajoutée pour bloquer PHARMACY dans NewThirdParty — le blocage est serveur (400). Optionnel : ajouter un guard UI qui désactive PHARMACY dans le sélecteur de catégorie de NewThirdParty pour feedback plus précoce, mais non requis par la spec (commentaire seul demandé).
- Aucune migration DB nécessaire ; `Act.requiresPrescription` et `categoryId` existants suffisent. Le legacy supprimé est purement applicatif (pas de colonne/trigger à nettoyer).
