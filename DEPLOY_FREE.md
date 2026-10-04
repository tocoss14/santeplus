# Déploiement 100 % gratuit — SantéPlus Bénin

**Architecture retenue (décision du 04/10/2026)** : l'API NestJS reste intacte (27 modules,
OCR, PDF, cron, webhooks de paiement) et tourne sur **Render free** ; la base passe sur
**Supabase Postgres** ; le front part sur **Vercel** ; les fichiers sur **Cloudflare R2**
(S3-compatible, le module `files` utilise déjà `@aws-sdk/client-s3`).

```
 Vercel (front SPA)  ──►  Render (API NestJS, Dockerfile racine)  ──►  Supabase (PostgreSQL)
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
> check et les 14 variables, les 10 secrets restant à saisir).

1. [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → connecte GitHub
   puis choisis le repo `tocoss14/santeplus` (Render lit `render.yaml` et pré-remplit le service).
2. Renseigne les **10 secrets** marqués `sync: false` dans l'écran de création :
   `DATABASE_URL` (§1), `JWT_SECRET` et `FIELD_ENCRYPTION_KEY` (générés, voir §2.3),
   `WEB_ORIGIN=https://santeplus-one.vercel.app`, `APP_URL`, et les 5 variables `S3_*` (§3).
3. **Ports** : `PORT=4000` (le Dockerfile fait `EXPOSE 4000`). **Health check** : `GET /api/health` (déjà dans le blueprint).
4. Variables d'environnement (rappel) :
   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | connection string Supabase (§1) + `?sslmode=require` (chiffré — testé OK ; sans ce suffixe Prisma n'ouvre pas la session TLS) |
   | `JWT_SECRET` | ≥ 32 caractères — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `FIELD_ENCRYPTION_KEY` | 64 hex — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (⚠️ figée : la changer rend les données chiffrées illisibles) |
   | `WEB_ORIGIN` | URL Vercel exacte (`https://santeplus-one.vercel.app`) — CORS **et** CSRF |
   | `APP_URL` | URL publique de l'API (callbacks de paiement `{APP_URL}/api/payments/webhook/...`) |
   | `MOCK_PAYMENTS` | `false` en prod (+ `PAY_PROVIDERS`, clés PSP) |
   | `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION=auto` | R2 (§3) |
4. Le CMD du conteneur attend que la base réponde puis applique `prisma migrate deploy`
   avant de démarrer — pas de crash si Supabase redémarre (ou pendant la veille Render).
5. Les **crons** (`node-cron`) tournent dans le process : garder **1 seule instance**.

## 3️⃣ Cloudflare R2 — fichiers (10 min)

1. Dashboard Cloudflare → **R2 → Create bucket** `santeplus-files`.
2. **R2 → Manage R2 API Tokens → Create API Token** (Object Read & Write, scope bucket).
3. Renseigner côté Render : `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
   `S3_BUCKET=santeplus-files`, `S3_REGION=auto`, + les 2 clés. **Zéro code à écrire** :
   le module `files` bascule du disque local vers R2 dès que `S3_ENDPOINT` est défini
   (le disque Render est éphémère → R2 obligatoire pour les uploads persistants).
4. Free : **10 GB**, opérations incluses.

## 4️⃣ Vercel — front (10 min)

1. [vercel.com](https://vercel.com) → **Add New Project → GitHub** → **Root Directory : `apps/web`**
   (le [`apps/web/vercel.json`](apps/web/vercel.json) gère rewrites SPA + en-têtes de sécurité + service worker).
2. **Environment Variables** : `VITE_API_URL=https://<url-koyeb>` (le proxy `/api` des
   rewrites pointe vers l'API — remplacer le placeholder `VOTRE-URL-API` dans `vercel.json`).
3. Déployer, puis **reporter l'URL finale dans `WEB_ORIGIN` côté Render** (sinon le middleware
   CSRF renvoie 403 sur les mutations avec cookies).

## 5️⃣ Ordre de branchement

1. Supabase : projet + `migrate deploy` ✔
2. Render : service (blueprint `render.yaml`) + secrets + health check vert ✔
3. R2 : bucket + variables S3_* ✔
4. Vercel : front + `VITE_API_URL` ✔
5. Recoller `WEB_ORIGIN` (Render) sur l'URL Vercel finale, redeploy API ✔
6. Smoke tests : `GET /api/health` (200) · login démo · création sinistre · webhook PSP sandbox.

---

## 🔐 Secrets — jamais dans le repo

`DATABASE_URL` · `JWT_SECRET` · `FIELD_ENCRYPTION_KEY` · clés PSP · clés R2 —
uniquement via les dashboards (Render Environment, Vercel Env). Les 3 gardes FATA au boot
(`JWT_SECRET` < 32, `FIELD_ENCRYPTION_KEY` invalide, comptes démo en prod) et leur
dépannage sont détaillés dans [DEPLOY-RUNSITE.md](DEPLOY-RUNSITE.md) §11 — identiques
quel que soit l'hébergeur.

## 📌 État (04/10/2026)

- [x] Repo réparé (package.json/tsconfig/vite restaurés — 646 tests API + 70 web verts)
- [x] Prototype edge honnête isolé hors build ([edge/worker.ts](edge/worker.ts))
- [x] `vercel.json` + `.env.example` + guides à jour
- [ ] Comptes Supabase / Render / Vercel / Cloudflare créés (sans CB)
- [x] `migrate deploy` sur Supabase (34 migrations, 55 tables)
- [ ] Service Render vert (`/api/health` 200 en public), front Vercel branché à l'API
- [ ] DNS domaine personnalisé (optionnel)
