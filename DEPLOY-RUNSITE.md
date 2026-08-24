# Déploiement Runsite — SantéPlus Bénin

> Runsite (https://runsite.app) : PaaS européen, déploiement via GitHub, PostgreSQL managé,
> S3-compatible, SSL automatique. Compte à créer sur https://dashboard.runsite.app (sans carte bancaire).

## Architecture cible

| Service Runsite | Rôle | Plan conseillé |
|---|---|---|
| **Web Service** (Dockerfile `apps/api`) | API NestJS + cron interne | Starter €5 (Standard €12 si montée en charge) |
| **Static Site** (`apps/web`, build Vite → `dist`) | Frontend React | Free |
| **PostgreSQL** | Base de données | Starter €5 |
| **S3 Storage** | Documents médicaux (factures, ordonnances) | 5 GB gratuits |

## 1. Préparer le dépôt GitHub

```bash
cd "C:\Users\HP\Desktop\mutuelle santé"
git init
git add .
git commit -m "feat: plateforme mutuelle santé SantéPlus Bénin"
# Créez un dépôt vide sur github.com puis :
git remote add origin https://github.com/VOTRE-COMPTE/santeplus.git
git push -u origin main
```

> ⚠️ Vérifiez que `.env` n'est **pas** commité (il est dans `.gitignore`).

## 2. Créer la base PostgreSQL

1. Dashboard Runsite → **New service → PostgreSQL** → plan *Starter*
2. Nom : `santeplus-db`
3. Une fois créée, copiez la **connection string** (bouton *Connect*) — elle ressemble à :
   `postgresql://user:password@host:5432/dbname?sslmode=require`

## 3. Créer le stockage S3

1. **New service → S3 Storage**
2. Créez un bucket `santeplus-documents`
3. Générez des **access keys** → notez `endpoint`, `bucket`, `access key id`, `secret`

## 4. Déployer l'API

1. **New service → Web Service** → connectez le dépôt GitHub
2. Runsite détecte le `Dockerfile` de `apps/api` :
   - **Root directory** : `apps/api`
   - **Port** : 4000 (le Dockerfile expose 4000 ; renseignez-le si demandé)
   - **Health check path** : `/api/admin/health`
3. Variables d'environnement :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | la connection string de l'étape 2 |
| `JWT_SECRET` | chaîne aléatoire ≥ 64 caractères (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `PORT` | `4000` |
| `NODE_ENV` | `production` |
| `WEB_ORIGIN` | `https://VOTRE-FRONT.runsite.app` (URL de l'étape 5) |
| `APP_URL` | `https://VOTRE-FRONT.runsite.app` |
| `MOCK_PAYMENTS` | `false` |
| `PAY_PROVIDERS` | `FEDAPAY,CINETPAY` |
| `FEDAPAY_SECRET_KEY` / `FEDAPAY_MODE` | vos clés (`sandbox` pour tester, `live` en production) |
| `CINETPAY_API_KEY` / `CINETPAY_SITE_ID` | vos clés |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` | valeurs de l'étape 3 |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | clés S3 |
| `NOTIFY_EMAIL_TOPICS` / `NOTIFY_SMS_TOPICS` | vides au début (console), puis listes de sujets |
| `EMAIL_API_URL` / `EMAIL_API_KEY`… | si passerelle e-mail/SMS/WhatsApp configurée |

4. **Deploy** → le conteneur exécute `npx prisma migrate deploy` puis démarre l'API.
   Vérifiez : `https://VOTRE-API.runsite.app/api/admin/health` → `{"status":"ok"}`

## 5. Déployer le frontend

1. **New service → Static Site** → même dépôt GitHub
2. Configuration :
   - **Root directory** : `apps/web`
   - **Build command** : `npm install && npm run build`
   - **Output directory** : `dist`
   - **Variable de build** : `VITE_API_URL` = `https://VOTRE-API.runsite.app`
3. **Deploy** → ouvrez l'URL fournie : la landing page doit charger les formules.

Le fichier `apps/web/public/_redirects` (`/* /index.html 200`) assure le fallback SPA.
Si les routes profondes (ex. `/app/contrat`) renvoient 404 après refresh, ajoutez la même
règle dans les réglages *Redirects* du service sur le dashboard.

## 6. Replier CORS

Dans l'API, `WEB_ORIGIN` doit contenir l'URL exacte du frontend (sans slash final).
Si vous ajoutez un domaine custom plus tard, mettez les deux séparés par une virgule.

## 7. Charger les données de démonstration (optionnel)

Depuis votre machine, avec la connection string de production :

```bash
cd apps/api
$env:DATABASE_URL="postgresql://...runsite..."; npx prisma migrate deploy
$env:DATABASE_URL="postgresql://...runsite..."; npm run db:seed
```

⚠️ Le seed crée des comptes de démonstration (`Demo1234!`) — **à supprimer avant mise en
service réelle** (admin → utilisateurs → suspendre/supprimer les comptes `*@demo.bj`,
`*@santeplus.bj` sauf le vôtre, dont le mot de passe aura été changé).

## 8. Webhooks paiements

Dans les portails FedaPay / CinetPay, renseignez :
- FedaPay : `https://VOTRE-API.runsite.app/api/payments/webhook/fedapay`
- CinetPay : `https://VOTRE-API.runsite.app/api/payments/webhook/cinetpay`

## 9. Domaine personnalisé (optionnel)

Dashboard → votre service → *Domains* → ajoutez `app.votredomaine.bj` et `api.votredomaine.bj`,
puis créez les CNAME chez votre registrar. SSL automatique. Mettez à jour `WEB_ORIGIN`/`APP_URL`
et `VITE_API_URL` (redeploy frontend) en conséquence.

## 10. Checklist de mise en production

- [ ] `JWT_SECRET` fort et unique
- [ ] `MOCK_PAYMENTS=false`, clés live FedaPay/CinetPay
- [ ] Comptes de démo supprimés, mots de passe admin changés
- [ ] Webhooks fournisseurs pointent vers l'URL de prod
- [ ] Backups PostgreSQL activés (par défaut chez Runsite — vérifiez la rétention)
- [ ] Limite de dépense configurée (dashboard → Spending limits)
- [ ] Test complet : inscription → souscription → paiement réel → carte QR → tiers payant
