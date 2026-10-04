# État de la stack gratuite — 04/10/2026

Guide opérationnel : **[DEPLOY_FREE.md](DEPLOY_FREE.md)** (source de vérité).

## Architecture retenue

| Composant | Service | Free tier | État côté repo |
|---|---|---|---|
| Frontend React (SPA) | **Vercel** | builds/bande passante illimités | `apps/web/vercel.json` prêt (remplacer le placeholder `VOTRE-URL-API`) |
| API NestJS (27 modules) | **Render** | 750 h/mois, veille après 15 min, sans CB | `render.yaml` (blueprint) + `Dockerfile` racine vert, health check `/api/health`, CMD attendant la base |
| PostgreSQL | **Supabase** | 500 MB DB, 50 k MAU | 34 migrations prêtes (`prisma migrate deploy`) |
| Fichiers | **Cloudflare R2** | 10 GB, S3-compatible | branchable par `S3_*` (module `files` déjà `@aws-sdk/client-s3`) — zéro code |
| Auth / Realtime | gardés dans l'app (JWT + guards) | — | bascule Supabase Auth/Réaltime : plus tard, hors périmètre |

## Pourquoi pas Cloudflare Workers pour l'API

Workers (free : 10 ms CPU, pas de FS, pas de cron long) ne peut pas exécuter NestJS +
`@napi-rs/canvas` + `pdfkit` + `node-cron`. La première tentative avait **remplacé le
`package.json` de l'API** (suppression de `@nestjs/*` et compagnie) : le build était cassé.
Restauré depuis HEAD. Un **prototype edge** honnête est conservé hors compilation :

- [`edge/worker.ts`](edge/worker.ts) — Hono, `GET /api/health` + `POST /api/auth/login`
  réel contre Supabase PostgREST (bcrypt), 501 explicite sur le reste de la surface métier.
- [`wrangler.toml`](wrangler.toml) — `main = "edge/worker.ts"`, secrets documentés,
  bindings R2/KV commentés (D1 supprimé : la base est Supabase Postgres).

## Fichiers de cette migration

| Fichier | Rôle |
|---|---|
| `DEPLOY_FREE.md` | guide complet (Supabase → Render → R2 → Vercel) |
| `apps/web/vercel.json` | rewrites SPA + en-têtes + PWA |
| `edge/worker.ts`, `wrangler.toml` | prototype edge optionnel (non branché) |
| `.env.example` | + section Supabase / R2 (`S3_*`) / Vercel (`VITE_API_URL`) |
| `.gitignore` | + `.vercel/`, `.wrangler/` |

## Vérifié

- API : `prisma generate` + `tsc` vert, **646 tests / 76 fichiers** verts.
- Web : `tsc --noEmit && vite build` vert (PWA régénérée), **70 tests** verts.
- Repos restaurés : `apps/api/package.json`, `apps/api/tsconfig.json`,
  `apps/web/vite.config.ts`, lock racine — identiques à HEAD.

## Reste à faire (comptes, sans CB)

- [ ] Comptes Supabase / Render / Vercel / Cloudflare créés
- [x] `prisma migrate deploy` sur Supabase (34 migrations, 55 tables)
- [ ] Service Render créé via blueprint `render.yaml` (`/api/health` 200)
- [ ] R2 bucket + `S3_*` côté Render ; `VITE_API_URL` + placeholder `vercel.json` → URL Render
- [ ] `WEB_ORIGIN` = URL Vercel exacte (CSRF) ; smoke test login + webhook PSP sandbox
