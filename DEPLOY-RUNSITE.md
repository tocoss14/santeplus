# DÃ©ploiement Runsite â€” SantÃ©Plus BÃ©nin

> Runsite (https://runsite.app) : PaaS europÃ©en, dÃ©ploiement via GitHub, PostgreSQL managÃ©,
> S3-compatible, SSL automatique. Compte Ã  crÃ©er sur https://dashboard.runsite.app (sans carte bancaire).

## Architecture cible

| Service Runsite | RÃ´le | Plan conseillÃ© |
|---|---|---|
| **Web Service** (Dockerfile `apps/api`) | API NestJS + cron interne | Starter â‚¬5 (Standard â‚¬12 si montÃ©e en charge) |
| **Static Site** (`apps/web`, build Vite â†’ `dist`) | Frontend React | Free |
| **PostgreSQL** | Base de donnÃ©es | Starter â‚¬5 |
| **S3 Storage** | Documents mÃ©dicaux (factures, ordonnances) | 5 GB gratuits |

## 1. PrÃ©parer le dÃ©pÃ´t GitHub

```bash
cd "C:\Users\HP\Desktop\mutuelle santÃ©"
git init
git add .
git commit -m "feat: plateforme mutuelle santÃ© SantÃ©Plus BÃ©nin"
# CrÃ©ez un dÃ©pÃ´t vide sur github.com puis :
git remote add origin https://github.com/VOTRE-COMPTE/santeplus.git
git push -u origin main
```

> âš ï¸ VÃ©rifiez que `.env` n'est **pas** commitÃ© (il est dans `.gitignore`).

## 2. CrÃ©er la base PostgreSQL

1. Dashboard Runsite â†’ **New service â†’ PostgreSQL** â†’ plan *Starter*
2. Nom : `santeplus-db`
3. Une fois crÃ©Ã©e, copiez la **connection string** (bouton *Connect*) â€” elle ressemble Ã  :
   `postgresql://user:password@host:5432/dbname?sslmode=require`

## 3. CrÃ©er le stockage S3

1. **New service â†’ S3 Storage**
2. CrÃ©ez un bucket `santeplus-documents`
3. GÃ©nÃ©rez des **access keys** â†’ notez `endpoint`, `bucket`, `access key id`, `secret`

## 4. DÃ©ployer l'API

1. **New service â†’ Web Service** â†’ connectez le dÃ©pÃ´t GitHub
2. Runsite dÃ©tecte le `Dockerfile` de `apps/api` :
   - **Root directory** : `apps/api`
   - **Port** : 4000 (le Dockerfile expose 4000 ; renseignez-le si demandÃ©)
   - **Health check path** : `/api/health`
3. Variables d'environnement :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | la connection string de l'Ã©tape 2 |
| `JWT_SECRET` | chaÃ®ne alÃ©atoire â‰¥ 64 caractÃ¨res (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `PORT` | `4000` |
| `NODE_ENV` | `production` |
| `WEB_ORIGIN` | `https://VOTRE-FRONT.runsite.app` (URL de l'Ã©tape 5) |
| `APP_URL` | `https://VOTRE-FRONT.runsite.app` |
| `MOCK_PAYMENTS` | `false` |
| `PAY_PROVIDERS` | `FEDAPAY,CINETPAY` |
| `FEDAPAY_SECRET_KEY` / `FEDAPAY_MODE` | vos clÃ©s (`sandbox` pour tester, `live` en production) |
| `CINETPAY_API_KEY` / `CINETPAY_SITE_ID` | vos clÃ©s |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` | valeurs de l'Ã©tape 3 |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | clÃ©s S3 |
| `NOTIFY_EMAIL_TOPICS` / `NOTIFY_SMS_TOPICS` | vides au dÃ©but (console), puis listes de sujets |
| `EMAIL_API_URL` / `EMAIL_API_KEY`â€¦ | si passerelle e-mail/SMS/WhatsApp configurÃ©e |

4. **Deploy** â†’ le conteneur exÃ©cute `npx prisma migrate deploy` puis dÃ©marre l'API.
   VÃ©rifiez : `https://VOTRE-API.runsite.app/api/health` â†’ `{"status":"ok"}`

## 5. DÃ©ployer le frontend

1. **New service â†’ Static Site** â†’ mÃªme dÃ©pÃ´t GitHub
2. Configuration :
   - **Root directory** : `apps/web`
   - **Build command** : `npm install && npm run build`
   - **Output directory** : `dist`
   - **Variable de build** : `VITE_API_URL` = `https://VOTRE-API.runsite.app`
3. **Deploy** â†’ ouvrez l'URL fournie : la landing page doit charger les formules.

Le fichier `apps/web/public/_redirects` (`/* /index.html 200`) assure le fallback SPA.
Si les routes profondes (ex. `/app/contrat`) renvoient 404 aprÃ¨s refresh, ajoutez la mÃªme
rÃ¨gle dans les rÃ©glages *Redirects* du service sur le dashboard.

## 6. Replier CORS

Dans l'API, `WEB_ORIGIN` doit contenir l'URL exacte du frontend (sans slash final).
Si vous ajoutez un domaine custom plus tard, mettez les deux sÃ©parÃ©s par une virgule.

## 7. Charger les donnÃ©es de dÃ©monstration (optionnel)

Depuis votre machine, avec la connection string de production :

```bash
cd apps/api
$env:DATABASE_URL="postgresql://...runsite..."; npx prisma migrate deploy
$env:DATABASE_URL="postgresql://...runsite..."; npm run db:seed
```

âš ï¸ Le seed crÃ©e des comptes de dÃ©monstration (`Demo1234!`) â€” **Ã  supprimer avant mise en
service rÃ©elle** (admin â†’ utilisateurs â†’ suspendre/supprimer les comptes `*@demo.bj`,
`*@santeplus.bj` sauf le vÃ´tre, dont le mot de passe aura Ã©tÃ© changÃ©).

## 8. Webhooks paiements

Dans les portails FedaPay / CinetPay, renseignez :
- FedaPay : `https://VOTRE-API.runsite.app/api/payments/webhook/fedapay`
- CinetPay : `https://VOTRE-API.runsite.app/api/payments/webhook/cinetpay`

## 9. Domaine personnalisÃ© (optionnel)

Dashboard â†’ votre service â†’ *Domains* â†’ ajoutez `app.votredomaine.bj` et `api.votredomaine.bj`,
puis crÃ©ez les CNAME chez votre registrar. SSL automatique. Mettez Ã  jour `WEB_ORIGIN`/`APP_URL`
et `VITE_API_URL` (redeploy frontend) en consÃ©quence.

## 10. Checklist de mise en production

- [ ] `JWT_SECRET` fort et unique
- [ ] `MOCK_PAYMENTS=false`, clÃ©s live FedaPay/CinetPay
- [ ] Comptes de dÃ©mo supprimÃ©s, mots de passe admin changÃ©s
- [ ] Webhooks fournisseurs pointent vers l'URL de prod
- [ ] Backups PostgreSQL activÃ©s (par dÃ©faut chez Runsite â€” vÃ©rifiez la rÃ©tention)
- [ ] Limite de dÃ©pense configurÃ©e (dashboard â†’ Spending limits)
- [ ] Test complet : inscription â†’ souscription â†’ paiement rÃ©el â†’ carte QR â†’ tiers payant
