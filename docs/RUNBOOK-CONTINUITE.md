# Runbook de continuité — SantéPlus Bénin

**Daté :** 2026-10-07 (session de validation R2 + étatprod)
**Dernière mise à jour :** 2026-10-08 (§3 : conclusion sur la provenance DB)
**À jour sur :** ce fichier + `docs/BUG_WHAT_TO_FIX_NEXT.md`
**Où trouver les credentials :** Render dashboard (secrets `sync: false`) + Supabase dashboard (DB) + Cloudflare dashboard (R2 + DNS). Jamais dans le repo.

---

## 1. Architecture en prod (ce qui est réellement déployé)

```
Cloudflare (DNS + proxy + CDN)        Cloudflare Pages (SPA front)
      │                                      │
      ▼                                      │  ⟨CORS : https://santeplus.pages.dev⟩
Cloudflare R2 (fichiers, S3-compatible)     │
      ▲                                      ▼
      │                          Render (API NestJS, Docker, free)
      │                          ┌─────────────────────────────────┐
      └────── S3-compatible ────►│  DB : PostgreSQL (Supabase)     │
                                  │  (⚠ voir §3 — provenance DB)    │
                                  └─────────────────────────────────┘
```

- **Front** : `https://santeplus.pages.dev` (Cloudflare Pages, SPA) — HTTP 200 vérifié.
- **API** : `https://santeplus-api-kp5t.onrender.com` (Render free, Docker) — health `200`, `storage: "object"` (R2 actif), `builtAt: 2026-10-06T05:26:13Z` (image construite le 06/10). Derrière Cloudflare (`Server: cloudflare`).
- **Fichiers** : Cloudflare R2, bucket `santeplus-files`, endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (variable `S3_ENDPOINT` dans les secrets Render). Le module `files` utilise `@aws-sdk/client-s3` avec `forcePathStyle: true` (obligatoire R2).
- **Base** : PostgreSQL sur Supabase (pooler session `5432`).

### Validation R2 effectuée (preuve concrète, 2026-10-07)

End-to-end réel sur l'API prod :

| Preuve | Résultat |
|---|---|
| Bucket actif | `GET /api/health` → `"storage":"object"` (R2, pas disque éphémère) |
| Upload → R2 | `POST /api/subscription/birth-certificate/upload` → `201`, `fileId` renvoyé |
| Clé R2 (storagePath) | lue dans l'en-tête `Content-Disposition: inline; filename="1791410295893-01hc4jn1.pdf"` du `GET /api/files/:id/view` → la clé est le nom de fichier généré (`${Date.now()}-${random}${ext}`) |
| Intégrité octet-à-octet | hash SHA-256 téléchargé == hash SHA-256 uploadé (305 octets, PDF synthétique) |
| Persistance après cycle froid | relecture 90 s plus tard (après redémarrage froid Render) → même 305 octets, même hash → le fichier a survécu |

**Conclusion P1-1 (BUG_WHAT_TO_FIX_NEXT.md) : FERMÉE, validée.** Les uploads vont bien dans R2 et survivent au redémarrage. Le risque "disque éphémère" n'existe pas tant que `storageRemote=true` (les 4 variables S3_* présentes dans les secrets Render).

### Exigences de persistance — ce qu'il faut vérifier avant de considérer que R2 est bon

1. Les 4 variables `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` sont présentes dans les secrets Render (pas dans `.env.prod` local — elles sont dans le dashboard Render, `sync: false`).
2. `S3_REGION` = `auto` (render.yaml). Si on met `eu-west` (valeur par défaut de `config.ts`), l'URL peut être mal formée pour R2 — utiliser `auto`.
3. `storageRemote` est calculé par `config.ts` comme `Boolean(S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY)`. Si une variable manque, l'API revient au disque local (`uploads/`) → perdu au redéploiement. Vérifier que les 4 sont bien renseignées dans le dashboard Render.
4. Le `Dockerfile` monte `/app/uploads` mais il n'est utilisé QUE si `storageRemote=false`. Avec R2, ce répertoire est inutile (juste présent).

---

## 2. Secrets (comment les changer, où ils vivent)

| Secret | Où | Comment le changer | Risque si mal changé |
|---|---|---|---|
| `DATABASE_URL` | Render (secret, `sync: false`) | Dashboard Render → service santeplus-api → Environment → éditer. Ou Supabase → Settings → Database → Connection string → URI (session pooler `5432`). | Si la valeur est fausse → l'API ne démarre pas (le `CMD` du Dockerfile vérifie `DATABASE_URL` absent et fait `exit 1` avec message explicite). |
| `JWT_SECRET` | Render (secret) | Dashboard Render. ≥ 32 caractères. | **Ne jamais changer en prod sans révoquer tous les tokens en circulation** (refresh tokens persistants 30 j). Si changé, tous les `sp_access`/`sp_refresh` existants deviennent invalides → déconnexion globale des utilisateurs. À éviter sauf urgence sécurité. |
| `FIELD_ENCRYPTION_KEY` | Render (secret) | Dashboard Render. 64 hex. | **NE JAMAIS CHANGER** — sinon les données chiffrées (nationalId, etc.) deviennent illisibles. Documenté dans `config.ts`. |
| `WEB_ORIGIN` | Render (secret) | Dashboard Render. Valeur : `https://santeplus.pages.dev`. | Affecte CORS + les liens d'e-mail (`/app/contrat`, `/reinitialiser-mot-de-passe`). Si erroné, les liens d'e-mail mènent à 404. **Ne pas mettre l'URL de l'API ici** (cf. commentaire `config.ts`). |
| `APP_URL` | Render (secret) | Dashboard Render. URL publique de l'API (callbacks PSP). | Si erroné, les webhooks PSP et certains callbacks peuvent échouer. |
| `S3_*` (4 vars) | Render (secret) | Dashboard Render. | Si manquant → bascule disque local → perte des uploads au redéploiement. |
| `MOCK_PAYMENTS`, `PAY_PROVIDERS` | Render (var, valeur fixe) | Dashboard Render (ou `render.yaml`). | `MOCK_PAYMENTS=true` en sandbox — les paiements ne passent pas en vrai tant que `fedapaySecretKey`/`cinetpayApiKey` ne sont pas configurés + `MOCK_PAYMENTS=false`. |

### Changer un secret sans downtime

1. Éditer le secret dans le dashboard Render.
2. Render redéploie automatiquement (`autoDeploy: true` dans `render.yaml`) → nouvelle image avec les variables à jour.
3. Vérifier `GET /api/health` → `200` après le déploiement.
4. Pour `JWT_SECRET` : prévoir la déconnexion globale (voir risque ci-dessus).

---

## 3. Point critique — provenance de la base de données (à clarifier avant tout déploiement de données)

**Ce qui a été vérifié ce jour (2026-10-07) :**

- L'API prod (`santeplus-api-kp5t.onrender.com`) écrit bien dans une base PostgreSQL (health `200`, création de compte + fileObject confirmées par l'API elle-même : `GET /api/subscription/birth-certificate/status` renvoie le `fileId` créé).
- **MAIS** la base lue par le `.env.prod` local (`postgresql://postgres.aqiidtdhfapginefvwgd:…@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`) **ne contient pas** les données que l'API vient d'écrire : 297 `fileObject`, dernière écriture le 2026-10-03 ; 0 utilisateur `r2test`/`r2cross` (alors que l'API en a créé).

**Interprétation la plus probable :** le secret `DATABASE_URL` déployé chez Render pointe vers un projet/base **différent** de celui du `.env.prod` local (ex. projet de staging vs projet de prod, ou connexion pooler différente).

**Impact :**
- Les outils locaux qui utilisent `.env.prod` (probes Prisma, purge, audits) **ne voient pas la vraie base prod** → risque de croire qu'une donnée n'existe pas alors qu'elle existe, ou inversement.
- La purge de données de test (`purge-test-data.mjs`) lancée sur `.env.prod` local **ne purge pas la vraie base prod**.
- `guardKnownDemoAccounts` dans `main.ts` exécute sa vérification sur la base **de l'API au boot** (donc sur la vraie base), pas sur `.env.prod` local — c'est correct pour la garde, mais les audits locaux sont aveugles.

**Action requise avant de compter sur les outils locaux :**
- Comparer le `DATABASE_URL` du dashboard Render (secrets) avec le `.env.prod` local. S'ils diffèrent : soit mettre à jour `.env.prod` local pour pointer vers la vraie base (si on veut auditer/ purger depuis local), soit documenter que les outils locaux utilisent une base de repli.
- **Ne pas lancer de purge/modify sur `.env.prod` local en présumant que c'est la base prod.**

### État au 2026-10-08 — divergence CONFIRMÉE, comparaison complète en attente

**Preuve relancée ce jour** (script `.freebuff/db-compare.cjs`, exécution identique → conclusion déterministe) :

| Vérification | Résultat |
|---|---|
| Connexion locale `.env.prod` | OK — la base locale répond |
| `fileObject` locaux | 297, dernière écriture **2026-10-03T07:03:13Z** |
| Compte créé par l'API prod (`r2cross-1791410910938-uok38@demo.bj`) | **ABSENT** de la base locale |
| `fileObject` uploadé via l'API prod (`cmuynt2nl003l7qggp4moekxd`) | **ABSENT** de la base locale |

**Recherche exhaustive d'une 2ᵉ chaîne de connexion locale :** aucune autre valeur de `DATABASE_URL` n'existe dans le workspace (`.env*`, `render.yaml` — qui ne contient qu'un commentaire, `DEPLOY_FREE.md`, historique git : `.env.prod` est gitignored, `backups/` vide, logs `.freebuff/`). Le hôte pooler `aws-0-eu-west-1.pooler.supabase.com` est **regional et partagé** entre projets Supabase : le discriminant réel est le **ref projet dans l'utilisateur** (`postgres.<ref>`) + le **mot de passe** — invisibles depuis ici.

**Conclusion :** l'hypothèse la plus probable reste que le secret `DATABASE_URL` du dashboard Render pointe vers un projet/base **différent** de `postgres.aqiidtdhfapginefvwgd` (le `.env.prod` local est obsolète ou appartient à un projet de staging). **Impossible à trancher sans lire le secret Render.**

**Étape bloquante (nécessite l'utilisateur) :** dashboard Render → service `santeplus-api` → **Environment** → secret `DATABASE_URL` → copier la chaîne **complète (y compris le mot de passe)** et la comparer à celle du `.env.prod` local (ref projet + mot de passe identiques ?).

**Ensuite, selon le résultat :**
- **Identiques** → la divergence vient d'ailleurs (rollback ? autre instance ?) : re-tester immédiatement après un nouvel upload via l'API.
- **Différents** → sauvegarder `.env.prod` (`.env.prod.bak`), y écrire la vraie chaîne, relancer `node .freebuff/db-compare.cjs` : les comptes `r2cross…`/`r2test…` et les `fileObject` récents doivent devenir visibles. Puis purger les comptes de test (`.freebuff/cleanup-r2-test-accounts.cjs`).
- **Ne jamais modifier le secret Render** sur la foi du `.env.prod` local (on corrige le local, pas la prod, tant que l'écart n'est pas tranché).

---

## 4. Redémarrage / réveil de l'API (Render free)

- Le plan free Render **mise en veille l'API après 15 min sans trafic** ; le réveil prend ~1 min (premier `GET /api/health` peut timeout).
- **Anti-veille :** un ping régulier `GET /api/health` suffit à maintenir l'instance réveillée (nécessaire pour les webhooks PSP en prod réelle). Le `builtAt` (`/api/version`) permet de distinguer un réveil d'un vrai redéploiement (nouveau `builtAt` = nouvel image).
- **Pour réveiller manuellement :** `curl https://santeplus-api-kp5t.onrender.com/api/health` (avec retries, timeout 30-45 s). L'API répond `{ status: "ok", service: "santeplus-api", storage: "object", time: "..." }` quand elle est up.
- **L'API est restart-proof pour les fichiers** tant que R2 est configuré (les uploads vont dans R2, pas dans `/app/uploads` éphémère). Voir §1.

---

## 5. Rollback rapide si un déploiement est périmé

1. **Checker l'étape du déploiement :** `GET /api/version` → `builtAt`. Si le `builtAt` correspond à un commit problématique, identifier le commit précédent fonctionnel.
2. **Rollback par reversion GitHub + auto-deploy :** Render auto-déploie sur chaque push. Pour rollback : faire un push d'une reversion (ou revert du commit problématique) → nouvel auto-déploiement avec le `builtAt` frais.
3. **Vérifier après déploiement :** `GET /api/health` (200) + `GET /api/version` ( nouveau `builtAt`) + un health front `GET https://santeplus.pages.dev` (200).
4. **Si l'API ne démarre pas (container failed to start) :** vérifier les logs Render. Les causes probables : `DATABASE_URL` absente (message explicite `FATAL: DATABASE_URL absente`), ou `prisma migrate deploy` qui échoue (conflit de migration). Le `CMD` du Dockerfile fait `migrate deploy` en boucle avec attente (`until ./node_modules/.bin/prisma migrate deploy; do sleep 3; done`) — si la base est temporairement injoignable, le conteneur attend et ne crash pas.
5. **Si le front est périmé (ancien bundle) :** le service worker `sw-network-first.js` sert le HTML réseau-d'abord pour les navigations → un rechargement sert toujours le bundle courant. Pour forcer : `navigator.serviceWorker.getRegistration().then(r => r?.unregister())` en console, puis rechargement.

---

## 6. État du site (résumé, 2026-10-08)

### ✅ Fonctionnel / vérifié
- **Front redéployé le 2026-10-08 (~22:40 UTC)** via `node .freebuff/deploy-cf-pages.mjs <url-api>` (wrangler OAuth, projet `santeplus`/branche `master`, exit 0) : correctif du validateur du simulateur (champ « Dépense simulée » rejetait sa propre valeur par défaut 10 000 — `step={500}` parasites retiré de `Simulateur.tsx`). Bundle : `index-C2SkEbl9.js` + `Simulateur-DKWfj9eZ.js`. **E2E vérifié en prod** : clic « Simuler » sur les valeurs par défaut → `POST /api/cts/simulate` 201 + `POST /api/quote/estimate` 201 → estimation cohérente (remboursé 6 000 = 60 % de 10 000).
- Health API prod : 200, `storage: object` (R2 actif), builtAt 2026-10-06.
- Front : `santeplus.pages.dev` (200), preview `c50e2163.santeplus.pages.dev` (200).
- CORS : origine `https://santeplus.pages.dev` acceptée, credentials `true`.
- R2 : upload + relecture octet-à-octet + persistance après cycle froid → **validé**.
- Auth : register/login/refresh fonctionnels (compte jetable créé + upload + relecture).
- Notifications : 749 en base, 100% IN_APP, 100% non-lues, 0 e-mail/SMS envoyés (pas de credentials EMAIL/SMS/WA configurés en prod → console-only, silencieux — voir BUG P1-3).

### ⚠️ À clarifier / point d'attention
- **Provenance DB (§3)** : divergence **confirmée le 2026-10-08** (`.env.prod` local ≠ base de l'API prod, preuve relancée) → outils locaux aveugles sur la vraie base. **Bloqué** : lecture du secret `DATABASE_URL` sur le dashboard Render (utilisateur). À régler avant purge/audit local.
- **Domaine `santeplus.bj`** : **NXDOMAIN confirmé le 2026-10-08** jusque chez les serveurs autoritatifs .bj (`ns1.nic.bj`, `pch.nic.bj`) → domaine non enregistré/non délégué, aucun DNS publicable. Configuration exacte prête dans [`docs/DNS-SANTEPLUS-BJ.md`](DNS-SANTEPLUS-BJ.md) (zone Cloudflare + Custom domains Pages + SSL Full(strict) + `WEB_ORIGIN` Render). Le domaine `santeplus.pages.dev` fonctionne.
- **Comptes jetables créés en prod** (base de l'API, pas dans `.env.prod` local, donc non purgables depuis local) :
  - `r2test-1791410288973-xqf34@demo.bj` (créé lors de la validation R2 réussie — possède le fichier test R2 `1791410295893-01hc4jn1.pdf`)
  - Plus tôt dans la session : comptes `r2test-1791410077072-…` et `r2test-1791410201992-…` (créés lors des tentatives précédentes — non trouvés dans l'API lors des vérifications ultérieures, possible rollback/cleanup automatique ou base différente).
  - `r2cross-1791410910938-uok38@demo.bj` (créé lors du cross-check DB — confirmé présent dans la base de l'API via `/api/subscription/birth-certificate/status`).
  - **Ces comptes sont inoffensifs (MEMBER, pas de données sensibles) mais polluent la base.** À nettoyer via le dashboard Supabase direct ou une route d'administration si disponible.
- **Fichier test R2 conservé volontairement** (`1791410295893-01hc4jn1.pdf`, 305 octets) dans le bucket `santeplus-files` comme preuve valide — inoffensif, peut être supprimé depuis le dashboard Cloudflare R2.

### ❌ Non encore livré / connu
- Notifications e-mail/SMS réelles (pas de credentials → console-only). Voir BUG P1-3.
- Sentry : stub dormant (`apps/web/src/lib/sentry.ts`), aucun `@sentry/*` installé, aucun DSN configuré. → À activer (voir todo).
- Guide d'interfaces : **v1.5 produite le 2026-10-08** — [`docs/SantePlus-Guide-des-interfaces.docx`](SantePlus-Guide-des-interfaces.docx) (Ref. GUIDE-INTERFACES-005) avec les 8 corrections d'alignement prod appliquées (menu /app 8 entrées, bundle 86 722/164 589/406 274 o, upload 8 Mo / 10 Mo acte naissance, 6 rôles, photos POST+GET, 38 clés de permissions, rétention 03:00, QR 32 hex). Anciennes versions dans [`docs/ARCHIVES/`](ARCHIVES/README.md) (v1.4 conservée, md5 identique).

---

## 7. Commandes de vérification rapides (copier-coller)

> **Ctrl global domaine (DNS + HTTPS + CORS) :** `./scripts-dev/check-santeplus-bj.sh`
> (`exit 0` = tout en place). Détail : [`docs/DNS-SANTEPLUS-BJ.md`](DNS-SANTEPLUS-BJ.md) §5.

```bash
# État API
curl -sS https://santeplus-api-kp5t.onrender.com/api/health
curl -sS https://santeplus-api-kp5t.onrender.com/api/version

# État front
curl -sS -o /dev/null -w "%{http_code}" https://santeplus.pages.dev
curl -sS -o /dev/null -w "%{http_code}" https://c50e2163.santeplus.pages.dev

# CORS
curl -sS -I -H "Origin: https://santeplus.pages.dev" https://santeplus-api-kp5t.onrender.com/api/health

# Domaine (voir docs/DNS-SANTEPLUS-BJ.md — attendu NXDOMAIN tant que non enregistré)
nslookup santeplus.bj 8.8.8.8

# Réveil (si veinard)
curl -sS -m 45 https://santeplus-api-kp5t.onrender.com/api/health
```

---

*Document vivant — à mettre à jour à chaque changement de secret, de déploiement, ou de découverte d'écart prod/local.*
