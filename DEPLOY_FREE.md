# Déploiement 100 % gratuit — SantéPlus Bénin

**Architecture retenue (décision du 04/10/2026)** : l'API NestJS reste intacte (27 modules,
OCR, PDF, cron, webhooks de paiement) et tourne sur **Render free** ; la base passe sur
**Supabase Postgres** ; le front part sur **Cloudflare Pages** ; les fichiers sur **Cloudflare R2**
(S3-compatible, le module `files` utilise déjà `@aws-sdk/client-s3`).

```
 Cloudflare Pages (front SPA)  ──►  Render (API NestJS, Dockerfile racine)  ──►  Supabase (PostgreSQL)
                                    │
                                    └──►  Cloudflare R2 (fichiers, S3-compatible)
```

> **Pourquoi pas « NestJS → Workers » ?** Cloudflare Workers ne peut pas exécuter
> l'application telle quelle : 10 ms CPU (free), pas de système de fichiers, pas de
> `node-cron`, `@napi-rs/canvas` natif et `pdfkit` incompatibles. Le `worker.ts` entamé
> lors de la première tentative était un stub (login codé en dur, claims vides) et cassait
> le build. La réécriture des 27 modules coûterait des semaines pour un résultat appauvri.
> Un **prototype edge propre et honnête** est conservé hors build : [`edge/worker.ts`](edge/worker.ts)
> (health + login réel via Supabase REST) avec son [`wrangler.toml`](wrangler.toml) —
> non branché sur le front, utilisable plus tard pour un cache/rate-limit en périphérie.

---

## 1️⃣ Supabase — PostgreSQL (15 min)

1. [supabase.com](https://supabase.com) → **New project** (free : 500 MB DB, 1 GB storage, 50 k MAU).
2. Récupérer la connection string : *Project Settings → Database → Connection string → URI*.
   - **API NestJS (hôte Node longue durée)** : direct `5432` ou **session pooler** `5432`.
   - Serverless uniquement : pooler transactionnel pgBouncer `6543`.
   - Format : `postgresql://postgres.<ref>:<motdepasse>@aws-0-<zone>.pooler.supabase.com:5432/postgres`
3. Appliquer les migrations (34 migrations prêtes dans `apps/api/prisma/migrations`) :
   ```bash
   cd apps/api
   DATABASE_URL="<connection-string>" npx prisma migrate deploy
   ```
4. ⚠️ Le free tier Supabase **met en pause le projet après ~7 jours d'inactivité** :
   prévoir un ping régulier (`GET /api/health` suffit — l'API sollicite la base).

## 2️⃣ Render — API NestJS (10 min)

Free tier 2026 : **750 heures d'instance/mois, sans carte bancaire**, runtime **Docker**,
health check HTTP natif. Contrepartie à connaître : le service **se met en veille après
15 min sans trafic** et met ~1 min à se réveiller — gênant uniquement pour les webhooks PSP
en production réelle (un ping anti-veille règle ça, cf. §5).

> **Pourquoi Render et pas Koyeb ?** Koyeb free (512 Mo, sans veille) était le premier choix,
> mais depuis son rachat par Mistral (févr. 2026) l'accès au dashboard est bloqué/incertain
> (compte en attente de validation) et le free tier n'est plus garanti. Render est en
> libre-service immédiat.

> ✅ **Vérifié le 04/10/2026** : 34 migrations appliquées sur Supabase (`prisma migrate deploy`
> exit 0) et l'API complète démarrée en `NODE_ENV=production` contre cette base répond
> **HTTP 200** sur `/api/health` et `/api/products`. Le `Dockerfile` racine suffit — reste à
> créer le service (le fichier [`render.yaml`](render.yaml) décrit tout : image, port, health
> check et les 14 variables, les 9 secrets restant à saisir).

1. [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → connecte GitHub
   puis choisis le repo `tocoss14/santeplus` (Render lit `render.yaml` et pré-remplit le service).
2. Renseigne les **9 secrets** marqués `sync: false` dans l'écran de création :
   `DATABASE_URL` (§1), `JWT_SECRET` et `FIELD_ENCRYPTION_KEY` (générés, voir §2.3),
   `WEB_ORIGIN=https://santeplus.pages.dev` (ou l'URL Vercel si §4 bis), `APP_URL`, et les 5 variables `S3_*` (§3).
3. **Ports** : `PORT=4000` (le Dockerfile fait `EXPOSE 4000`). **Health check** : `GET /api/health` (déjà dans le blueprint).
4. Variables d'environnement (rappel) :
   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | connection string Supabase (§1) + `?sslmode=require` (chiffré — testé OK ; sans ce suffixe Prisma n'ouvre pas la session TLS) |
   | `JWT_SECRET` | ≥ 32 caractères — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `FIELD_ENCRYPTION_KEY` | 64 hex — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (⚠️ figée : la changer rend les données chiffrées illisibles) |
   | `WEB_ORIGIN` | URL exacte du front (`https://santeplus.pages.dev`) — CORS **et** CSRF. Doit aussi englober l'origine de l'app mobile (Capacitor) si ajoutée |
   | `APP_URL` | URL publique de l'API (callbacks de paiement `{APP_URL}/api/payments/webhook/...`) |
   | `MOCK_PAYMENTS` | `false` en prod (+ `PAY_PROVIDERS`, clés PSP) |
   | `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION=auto` | R2 (§3) |

5. Le CMD du conteneur attend que la base réponde puis applique `prisma migrate deploy`
   avant de démarrer — pas de crash si Supabase redémarre (ou pendant la veille Render).
6. Les **crons** (`node-cron`) tournent dans le process : garder **1 seule instance**.
> 🟢 **Raccourci pour déverrouiller `/api/health` tout de suite** : seules les **3** premières
> lignes du tableau sont **obligatoires** pour que le conteneur démarre. Les 6 autres
> (`WEB_ORIGIN`, `APP_URL`, `S3_*`) peuvent rester vides au premier déploiement :
> `WEB_ORIGIN` retombe sur `http://localhost:5173` (sans effet sur `/api/health`, qui est
> un GET donc hors CSRF) et le module `files` bascule sur le disque local si `S3_ENDPOINT`
> est absent. On les ajoute une fois le front déployé et le bucket R2 créé.
>
> Valeurs prêtes dans [.env.prod](.env.prod) :
> ```bash
> node .freebuff/render-secrets.mjs        # affiche les 3 secrets minimaux
> MASK=1 node .freebuff/render-secrets.mjs # même liste sans les valeurs (captures)
> ```

> ⚠️ **Collision de nom sur Render (constaté le 04/10/2026)** : `santeplus-api.onrender.com`
> est **déjà occupé par un ancien build** — le sien expose `/health` (200) alors que le
> nôtre n’a pas cette route (préfixe global `api`), et son `/api/health` renvoie 401 alors
> que le nôtre est `@Public()`. Render refuse un nom déjà pris : le blueprint ne peut donc
> pas le récupérer. **Renommer l’ancien service** (réversible) plutôt que le supprimer :
> ```bash
> export RENDER_API_KEY=rnd_...
> node .freebuff/render-migrate.mjs list
> node .freebuff/render-migrate.mjs rename santeplus-api santeplus-api-legacy
> node .freebuff/render-migrate.mjs verify santeplus-api   # le nom est-il enfin libre ?
> ```
> Retour arrière : `node .freebuff/render-migrate.mjs rename santeplus-api-legacy santeplus-api`.
> Si Render ne libère pas le sous-domaine automatiquement, renommer depuis le dashboard
> (Service → Settings → Name) — le script le signale plutôt que de le masquer.

## 3️⃣ Cloudflare R2 — fichiers (10 min)

1. Dashboard Cloudflare → **R2 → Create bucket** `santeplus-files`.
2. **R2 → Manage R2 API Tokens → Create API Token** (Object Read & Write, scope bucket).
3. Renseigner côté Render : `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
   `S3_BUCKET=santeplus-files`, `S3_REGION=auto`, + les 2 clés. **Zéro code à écrire** :
   le module `files` bascule du disque local vers R2 dès que `S3_ENDPOINT` est défini
   (le disque Render est éphémère → R2 obligatoire pour les uploads persistants).
4. Free : **10 GB**, opérations incluses.

## 4️⃣ Cloudflare Pages — front (10 min)

> **Pourquoi Cloudflare Pages et pas Vercel ?** Le plan **Vercel Hobby est réservé à l'usage
> personnel et non commercial** — « *Hobby teams are restricted to non-commercial personal use
> only* » ([Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)) et
> « *You shall only use the Services under a Hobby plan for your personal or non-commercial
> use* » ([Conditions](https://vercel.com/legal/terms)). SantéPlus est une mutuelle
> **commerciale** : Pro coûte 20 $/mois/siège. Cloudflare Pages autorise l'usage commercial
> et est le seul hébergeur gratuit **sans plafond de bande passante** (Netlify et Vercel
> plafonnent à ~100 Go/mois). En prime, aucun App GitHub n'est requis — ce qui contourne le
> blocage de vérification téléphone sur `tocoss14`. Voir §4 bis pour l'alternative Vercel.

1. Cloudflare → **Workers & Pages → Create → Pages** (projet `santeplus`, domaine `santeplus.pages.dev`).
   Déploiement **par CLI**, sans connexion Git :
   ```bash
   npx wrangler login    # OAuth dans le navigateur — le plus simple, aucun secret à gérer
   node .freebuff/deploy-cf-pages.mjs https://santeplus-api-gzv4.onrender.com
   ```
   Pour la CI (non interactif), un **API Token** est indispensable : dashboard →
   *My Profile → API Tokens → Create Token*, permission **Account → Cloudflare Pages → Edit**
   (la doc Cloudflare : « *make sure to add the Cloudflare Pages permission with Edit access* »),
   puis `export CLOUDFLARE_API_TOKEN=...` et `export CLOUDFLARE_ACCOUNT_ID=...`.
   Le **Account ID** se trouve dans le dashboard → *Workers & Pages → Account Details*,
   ou en pressant `Ctrl/Cmd + K` puis « Copy account ID ».
   ⚠️ **Ne pas utiliser la Global API Key** : Cloudflare la qualifie de « *not recommended for
   new customers* » — elle accorde les pleins pouvoirs sur le compte, zones comprises.
   Le script rebuild le front avec `VITE_API_URL`, écrit `_headers` (cache immuable sur
   `/assets/*`, `sw.js` revalidable) puis appelle `wrangler pages deploy`.

2. ⚠️ **Cloudflare Pages ne sait pas proxifier vers un domaine externe** : la doc officielle
   est explicite — « *Proxying will only support relative URLs on your site. You cannot proxy
   external domains* ». Donc **pas de proxy `/api`** ici : l'API est appelée **en cross-origine**
   via `VITE_API_URL`, ce qui impose `SameSite=None; Secure` sur les cookies de session
   (déjà le cas : [`cookies.ts`](apps/api/src/modules/auth/cookies.ts) pose
   `sameSite: 'none'` + `secure` dès que `NODE_ENV=production`, couvert par
   `apps/api/tests/cookies.spec.ts`). Le repli SPA `/* → /index.html 200`
   est fourni par [`apps/web/public/_redirects`](apps/web/public/_redirects).

3. **Reporter l'URL du front dans `WEB_ORIGIN` côté Render** (`https://santeplus.pages.dev`) :
   sans ça, CORS **et** le middleware CSRF renvoient 403 sur toutes les mutations.
   Si plusieurs origines sont nécessaires (Pages + Vercel), `WEB_ORIGIN` doit les lister
   toutes — voir le parsing dans `main.ts`.

## 4️⃣ bis · Vercel (alternative conservée)

Si tu préfères rester sur Vercel malgré la restriction commerciale du plan Hobby
(ou pour tester) : le front est déjà déployé et fonctionnel sur
**`https://santeplus-sigma.vercel.app`** via le CLI, sans Git :
[`apps/web/vercel.json`](apps/web/vercel.json) gère rewrites SPA + en-têtes + service worker.
Le proxy `/api` **fonctionne** ici (contrairement à Pages) — rebasculer l'URL de l'API avec
`node .freebuff/relink-api.mjs <url-api>`, puis reporter `https://santeplus-sigma.vercel.app`
dans `WEB_ORIGIN`.

## 5️⃣ Ordre de branchement

1. Supabase : projet + `migrate deploy` ✔
2. Render : service (blueprint `render.yaml`) + secrets + health check vert ✔
3. R2 : bucket + variables S3_* ✔
4. Front (Pages ou Vercel) + `VITE_API_URL` ✔
5. Recoller `WEB_ORIGIN` (Render) sur l'URL du front, redeploy API ✔
6. Smoke tests : `GET /api/health` (200) · login démo · création sinistre · webhook PSP sandbox.

---

## 🔐 Secrets — jamais dans le repo

`DATABASE_URL` · `JWT_SECRET` · `FIELD_ENCRYPTION_KEY` · clés PSP · clés R2 —
uniquement via les dashboards (Render Environment, Cloudflare Pages/Workers). Plus les
tokens de déploiement : `VERCEL_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Les 3 gardes FATA au boot
(`JWT_SECRET` < 32, `FIELD_ENCRYPTION_KEY` invalide, comptes démo en prod) et leur
dépannage sont détaillés dans [DEPLOY-RUNSITE.md](DEPLOY-RUNSITE.md) §11 — identiques
quel que soit l'hébergeur.

## 📌 État (04/10/2026)

- [x] Repo réparé (package.json/tsconfig/vite restaurés — 646 tests API + 70 web verts)
- [x] Prototype edge honnête isolé hors build ([edge/worker.ts](edge/worker.ts))
- [x] `vercel.json` + `_redirects` + `.env.example` + guides à jour
- [x] Cookies de session `SameSite=None; Secure` en prod **testés** (mutation test : 2 tests tombent si régression)
- [x] Front migré de Vercel vers **Cloudflare Pages** (`santeplus.pages.dev`). Vercel reste
      déployé en secours (`santeplus-sigma.vercel.app`) — le plan Hobby y interdit
      l'usage commercial, à ne pas garder pour la production
- [x] Comptes Supabase / Render / Cloudflare créés, sans carte bancaire
- [ ] **Stockage persistant R2** — sans lui, les actes de naissance téléversés vivent dans le
      disque du conteneur Render et disparaissent à chaque redémarrage. Sur
      dashboard.render.com → *santeplus-api* → *Environment*, saisir les 5 variables
      (`render.yaml` les déclare déjà en `sync: false`) :
      `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com` · `S3_REGION=auto` ·
      `S3_BUCKET=<bucket R2>` · `S3_ACCESS_KEY_ID` · `S3_SECRET_ACCESS_KEY` (clé d'accès R2,
      permission *Object Read & Write* sur ce seul bucket). Contrôle après redéploiement :
      `curl https://santeplus-api-gzv4.onrender.com/api/health` doit renvoyer
      `"storage":"object"`, et le log de démarrage la ligne
      `File storage: object storage (bucket …)`. Les téléversements **déjà** écrits avant
      la bascule restent perdus (ils n'ont jamais quitté le conteneur) : il faut les
      téléverser à nouveau depuis l'espace assuré.
- [x] `migrate deploy` sur Supabase (34 migrations, 55 tables)
- [x] **API Render en ligne** : `https://santeplus-api-gzv4.onrender.com` — `/api/health` **200**
      (`{"status":"ok","service":"santeplus-api"}`), `/api/version` 200, `/api/products` 200
      (⚠️ le suffixe `gzv4` est généré par Render : le nom `santeplus-api` simple était
      déjà occupé par un ancien build — voir la note de collision au §2)
- [x] Front Cloudflare Pages déployé et vérifié (`https://santeplus.pages.dev`)
- [x] `WEB_ORIGIN=https://santeplus.pages.dev` sur Render — CORS vérifié :
      `access-control-allow-origin` rendu pour cette origine, refusée pour une origine inconnue
