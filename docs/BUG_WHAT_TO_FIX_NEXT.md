# Points à corriger ou améliorer maintenant — SantéPlus

Dernière actualisation : 2026-10-07 (session de revue, snapshot
qa-santeplus-context.md). Ce document est un compromis vivant:
priorités, état réel, et raison du choix.

## Règle de décision utilisée ici
- P1 : impact utilisateur, continuité, sécurité / conformité directe.
- P2 : qualité fonctionnelle, fiabilité, maintenable avant prochain
  levier de production.
- P3 : clarté opérationnelle, documentation, réduction du contexte.
- P4 : dépendances, petits écarts techniques, propreté progressive.

---

## P1 — urgent à valider avant de compter sur la prod

### P1-1. Stockage R2 : prouver que les uploads tiennent vraiment en prod
- **Ce qu'on croit savoir** : health prod renvoie `storage:"object"`, donc
  les variables S3 sont présentes et le module `files` bascule sur R2.
- **Ce qui ne l'est pas** : un vrai upload prod + relecture octet-à-octet +
  résistance à un redémarrage/redéploiement Render.
- **Ce qu'il faut faire** : un test end-to-end réel sur l'API prod, avec
  un fichier court, un hash SHA-256 local, upload, relecture, comparaison
  octet-à-octet, puis vérifier que le fichier persiste après un redémarrage
  ou un redéploiement (ou au moins simuler ce scénario en local si on ne
  peut pas rebooter la prod).
- **Fichiers concernés** : `apps/api/src/modules/files/files.service.ts`,
  `apps/api/src/main.ts` (log de stockage), `render.yaml`, `DEPLOY_FREE.md`.

### P1-2. Comptes de démo en production
- **Contexte** : `COMPTES_DEMO.md` dit que les comptes ont été pivotés
  hors du mot de passe connu le 2026-09-06 (`Demo-c2a4c9e7334f!`).
- **Risque** : si certains comptes n'ont pas été pivotés, la garde
  `guardKnownDemoAccounts()` de `main.ts` devrait refuser le boot en prod.
- **Ce qu'il faut faire** :
  - vérifier sur la base de prod si des comptes (rôles privilégiés + emails
    demo + terminaisons @demo.bj) utilisent encore le mot de passe connu ;
  - si oui : pivoter ou supprimer ces comptes ;
  - si non : documenter la preuve (liste des comptes concernés, résultat de
    la vérification, date).
- **Fichiers concernés** : `main.ts`, `COMPTES_DEMO.md`.

### P1-3. Notifications silencieuses si fournisseur mal configuré
- **Ce qui se passe** : `dispatch.service.ts` utilise `Promise.allSettled` et
  ne remonte les échecs qu'en `console.error`.
- **Conséquence** : un mot de passe oublié, un rappel de paiement, un statut
  de sinistre peuvent ne jamais arriver sans message clair pour l'utilisateur,
  et sans signal exploitable autre que logs.
- **Ce qu'il faut faire** :
  - ne pas se fier uniquement à `console.error` ;
  - remonter l'échec là où il sera vu (audit, statut de notification, alerte
    Ops, ou tout du moins trace structurée) ;
  - éviter qu'un envoi critique (ex. réinitialisation de mot de passe) puisse
    "réussir" silencieusement de l'avis de l'application.
- **Fichiers concernés** :
  `apps/api/src/common/notifications/dispatch.service.ts`,
  `apps/api/src/jobs/*`, `apps/api/src/modules/auth`, `apps/api/src/modules/claims`.

---

## P2 — à corriger ou tester avant de compter dessus en prod

### P2-1. Boucle offline non prouvée en conditions réelles
- **Ce qui existe** : `offlineCache.ts` (localStorage, TTL 36h),
  `offlineQueue.ts` (IndexedDB, fallback mémoire), `OfflineBanner`,
  `MobileSyncPage`.
- **Ce qui manque** : une preuve réelle de la boucle complète
  (offline → queue → retour online → sync → conflit → réaction). En local,
  tout peut rester théorique.
- **Ce qu'il faut faire** : un scénario end-to-end offline minimal sur une
  vraie page (ou un simulateur fiable) qui prouve que la file tient,
  se synchronise, et gère un conflit sans perte.
- **Fichiers concernés** :
  `apps/web/src/lib/offlineCache.ts`,
  `apps/web/src/lib/offlineQueue.ts`,
  `apps/web/src/components/OfflineBanner.tsx`,
  `apps/web/src/pages/provider/mobile/MobileSyncPage.tsx`,
  `apps/web/src/pages/provider/ProviderDeliveries.tsx`.

### P2-2. Décrochage mobile non testé
- **Contexte** : beaucoup de pages utilisent `overflow-x-auto` pour les
  tableaux, ce qui est raisonnable, mais l'expérience tactile réelle (petits
  boutons, zones de clic, comportement scroll Safari/Chrome) n'est pas
  vérifiée automatiquement.
- **Ce qu'il faut faire** : une passe manuelle ou automatisée sur mobile sur
  les écrans critiques (inscription, carte, délivrance, parrainage,
  connexion). Pas de bug connu actif, mais risque UX réel si on le laisse
  sans vérification.
- **Fichiers concernés** : layout global + pages touches par l'interaction
  tactile (à cibler après un premier passage).

### P2-3. Format FCFA / affichage des nombres
- **Contexte** : `format.ts` utilise `Intl.NumberFormat('fr-FR')`.
- **Ce qu'il faut vérifier** : comportement sur grands montants, arrondis,
  restes à charge, plafonds, commissions. En zone UEMOA il n'y a pas de
  centimes, donc l'impact est probablement limité, mais à confirmer sur des
  vrais cas métier.
- **Fichiers concernés** : `apps/web/src/format.ts`, `apps/web/src/format.spec.ts`.

---

## P3 — clarifier ou documenter

### P3-1. Avoir une vue courte "où on est" datée
- Il y a beaucoup de bons éléments épars (audit, phase 3, architecture,
  déploiement, comptes de démo).
- Il manque un document court et daté :
  - ce qui est livré,
  - ce qui est en prod,
  - ce qu'on ne fait pas encore,
  - ce qu'on accepte volontairement de ne pas faire.
- **Fichier candidat** : `docs/BUG_WHAT_TO_FIX_NEXT.md` (ce fichier) +
  éventuellement un fichier d'état produit séparé si on veut distinguer
  "bugs à corriger" de "décisions actuelles".

### P3-2. Runbook de continuité minimal
- Pas de procédure lisible pour :
  - changer un secret,
  - vérifier que R2 est toujours bon,
  - remettre le site en ligne après un redémarrage Render / veille,
  - rollback rapide si un déploiement est périmé.
- **Ce qu'il faut faire** : un runbook court, opérationnel, avec les étapes
  réelles (pas des généralités). Voir aussi `docs/BACKUP.md` pour la partie
  sauvegarde/reprise.

### P3-3. Aligner le guide d'interfaces avec la réalité prod
- Il y a plusieurs versions de docs interfaces dans `docs/`, dont un `.docx`
  "réparé".
- **Ce qu'il faut faire** : conserver une version de référence, supprimer ou
  déplacer les doublons, s'assurer que le guide correspond à ce qui est
  réellement en prod (routes, rôles, QR, offline, flow souscription).

---

## P4 — petits écarts techniques à noter pour plus tard

### P4-1. Recharts `2.x` avec warning de migration vers `3.x`
- Aucune raison immédiate de le toucher si tout fonctionne.
- À noter pour une future passe de bundle.

### P4-2. Piètres ESLint `eslint-disable-next-line` React hooks
- Acceptables pour un MVP, mais à repasser si on veut rester propre à
  long terme.

### P4-3. Outil de purge de test à rendre réutilisable
- `purge-test-data.mjs` est utile en session, mais reste un outil maison.
- **Ce qu'il faut améliorer** :
  - documenter ce qu'il purge et ce qu'il ne purge pas,
  - prévoir un mode dry-run,
  - éviter qu'il soit exécuté sans comprendre sa portée.

---

## Non couvert / à ne pas promettre ici

- Pas de correction automatique de P1-1/P1-2/P1-3 dans ce document : ce sont
  des actions à réaliser et à vérifier, pas des opinions.
- Si une action P1 est réalisée, elle doit être accompagnée de sa preuve
  (résultat, logs, screenshots ou commandes), pas seulement d'un "fait".

---

## Sources pour relire
- `docs/BUG_WHAT_TO_FIX_NEXT.md` (ce fichier)
- `qa-santeplus-context.md` (snapshot réunion, /tmp)
- `DEPLOY_FREE.md`, `DEPLOY_SUMMARY.md`, `README.md`
- `docs/phase3-corrections-2026-09-13.md`
- `docs/architecture.md`
- `docs/BACKUP.md`
- `COMPTES_DEMO.md`
- `apps/api/src/main.ts`
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/src/common/notifications/dispatch.service.ts`
- `apps/web/src/lib/offlineCache.ts`
- `apps/web/src/lib/offlineQueue.ts`
- `apps/web/src/components/OfflineBanner.tsx`
- `apps/web/src/pages/provider/mobile/MobileSyncPage.tsx`
- `apps/web/src/pages/provider/ProviderDeliveries.tsx`
