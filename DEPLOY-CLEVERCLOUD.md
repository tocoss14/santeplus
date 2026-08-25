# DÃ©ploiement Clever Cloud â€” SantÃ©Plus BÃ©nin

> Clever Cloud (https://www.clever-cloud.com) : PaaS franÃ§ais Ã©tabli depuis 2011, EU,
> support francophone. RecommandÃ© pour la mise en service avec des donnÃ©es rÃ©elles
> (maturitÃ© + argument due diligence assureur).

## Architecture cible

| Composant Clever Cloud | RÃ´le | Type |
|---|---|---|
| **Application Node.js** (ou Docker) | API NestJS + cron interne | XS ou S (2 instances possible) |
| **PostgreSQL managed** | Base de donnÃ©es | XS/S (add-on) |
| **Cellar S3** | Documents mÃ©dicaux | add-on |
| **Static + redirect** ou app Node sÃ©parÃ©e | Frontend React | voir Â§5 |

## 0. PrÃ©parer

```bash
npm install -g clever-tools
clever login
cd "C:\Users\HP\Desktop\mutuelle santÃ©"
git init && git add . && git commit -m "feat: SantÃ©Plus BÃ©nin"
# CrÃ©ez l'app depuis la console ou la CLI (Ã©tape 2) puis :
git remote add clever URL_GIT_FOURNIE_PAR_CLEVER
```

## 1. PostgreSQL managÃ©

Console â†’ **Add-on â†’ PostgreSQL** â†’ plan *XS* (ou *S* en production).
Copiez la **connection string** (`postgresql://â€¦`).

## 2. API (application Node)

Console â†’ **Create â†’ An application â†’ Node.js**.
Liez le dÃ©pÃ´t Git ; **root path** : `apps/api`.

Variables d'environnement (console â†’ *Environment variables*) :

| Variable | Valeur |
|---|---|
| `CC_NODE_BUILD_TOOL` | `npm install && npx prisma generate && npm run build` |
| `CC_RUN_COMMAND` | `npx prisma migrate deploy && node dist/main.js` |
| `DATABASE_URL` | connection string de l'Ã©tape 1 (`?sslmode=require`) |
| `JWT_SECRET` | alÃ©atoire â‰¥ 64 caractÃ¨res |
| `NODE_ENV` | `production` |
| `PORT` | `4000` (Clever injecte `PORT` â€” utilisez `process.env.PORT` dÃ©jÃ  gÃ©rÃ©) |
| `WEB_ORIGIN` | `https://VOTRE-FRONT.clever-apps.fr` |
| `APP_URL` | `https://VOTRE-FRONT.clever-apps.fr` |
| `MOCK_PAYMENTS` | `false` |
| `PAY_PROVIDERS` | `FEDAPAY,CINETPAY` |
| `FEDAPAY_SECRET_KEY` / `FEDAPAY_MODE` / `CINETPAY_API_KEY` / `CINETPAY_SITE_ID` | clÃ©s fournisseurs |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | credentials Cellar (Â§3) |
| `NOTIFY_*`, `EMAIL_*`, `SMS_*`, `WA_*` | canaux de notification (optionnel au dÃ©but) |

**Alternative Docker** : Â« Create â†’ Docker Â» avec root path `apps/api` â€” le Dockerfile
existant fonctionne tel quel (port exposÃ© 4000).

DÃ©ployez : `git push clever main`. VÃ©rifiez `https://VOTRE-API.clever-apps.fr/api/health`.

## 3. Cellar (S3)

Console â†’ **Add-on â†’ Cellar S3** â†’ crÃ©ez un bucket `santeplus-documents` + des clÃ©s.
Reportez endpoint/keys dans les variables `S3_*` de l'API (Â§2).

## 4. Migrations & seed

Le `CC_RUN_COMMAND` applique `prisma migrate deploy` Ã  chaque dÃ©ploiement.
Pour le seed de dÃ©monstration (optionnel), depuis votre machine :

```bash
cd apps/api
$env:DATABASE_URL="postgresql://...clever..."; npx prisma migrate deploy
$env:DATABASE_URL="postgresql://...clever..."; npm run db:seed
```

âš ï¸ Supprimez les comptes de dÃ©mo avant mise en service rÃ©elle.

## 5. Frontend

**Option A â€” Static site (simple)** :
Console â†’ **Create â†’ Static site**, root path `apps/web` :
- `CC_STATIC_BUILD_COMMAND` = `npm install && npm run build`
- `CC_STATIC_OUTPUT_PATH` = `dist`
- Variable de build : `VITE_API_URL` = URL de l'API (Â§2)

Le fichier `.htaccess` inclus dans `apps/web/public` active le fallback SPA sur Apache
(config statique par dÃ©faut de Clever Cloud).

**Option B â€” mÃªme app Node que l'API (avancÃ©e)** : servir `dist` depuis l'API avec
`express.static` + fallback `index.html` ; Ã©vite le CORS et une URL sÃ©parÃ©e.
(Ã‰volution possible, l'option A est suffisante pour dÃ©marrer.)

## 6. Webhooks paiements

- FedaPay : `https://VOTRE-API.clever-apps.fr/api/payments/webhook/fedapay`
- CinetPay : `https://VOTRE-API.clever-apps.fr/api/payments/webhook/cinetpay`

## 7. Domaine personnalisÃ©

Console â†’ application â†’ *Domain names* â†’ ajoutez `app.votredomaine.bj` / `api.votredomaine.bj`,
CNAME chez le registrar, SSL Let's Encrypt automatique. Mettez Ã  jour `WEB_ORIGIN`,
`APP_URL` et `VITE_API_URL` (redeploy du front).

## 8. Checklist de mise en production

- [ ] `JWT_SECRET` fort, `MOCK_PAYMENTS=false`, clÃ©s live
- [ ] Comptes de dÃ©mo supprimÃ©s, mots de passe changÃ©s
- [ ] Webhooks fournisseurs configurÃ©s
- [ ] Backups PostgreSQL : activez les backups automatiques de l'add-on (console)
- [ ] ScalabilitÃ© : ajoutez une 2áµ‰ instance API si besoin (le cron in-process doit alors
      Ãªtre dÃ©sactivÃ© sur les instances secondaires â€” nous contacter)
- [ ] Test complet de bout en bout (inscription â†’ paiement rÃ©el â†’ tiers payant)
