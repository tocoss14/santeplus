# Déploiement Clever Cloud — SantéPlus Bénin

> Clever Cloud (https://www.clever-cloud.com) : PaaS français établi depuis 2011, EU,
> support francophone. Recommandé pour la mise en service avec des données réelles
> (maturité + argument due diligence assureur).

## Architecture cible

| Composant Clever Cloud | Rôle | Type |
|---|---|---|
| **Application Node.js** (ou Docker) | API NestJS + cron interne | XS ou S (2 instances possible) |
| **PostgreSQL managed** | Base de données | XS/S (add-on) |
| **Cellar S3** | Documents médicaux | add-on |
| **Static + redirect** ou app Node séparée | Frontend React | voir §5 |

## 0. Préparer

```bash
npm install -g clever-tools
clever login
cd "C:\Users\HP\Desktop\mutuelle santé"
git init && git add . && git commit -m "feat: SantéPlus Bénin"
# Créez l'app depuis la console ou la CLI (étape 2) puis :
git remote add clever URL_GIT_FOURNIE_PAR_CLEVER
```

## 1. PostgreSQL managé

Console → **Add-on → PostgreSQL** → plan *XS* (ou *S* en production).
Copiez la **connection string** (`postgresql://…`).

## 2. API (application Node)

Console → **Create → An application → Node.js**.
Liez le dépôt Git ; **root path** : `apps/api`.

Variables d'environnement (console → *Environment variables*) :

| Variable | Valeur |
|---|---|
| `CC_NODE_BUILD_TOOL` | `npm install && npx prisma generate && npm run build` |
| `CC_RUN_COMMAND` | `npx prisma migrate deploy && node dist/main.js` |
| `DATABASE_URL` | connection string de l'étape 1 (`?sslmode=require`) |
| `JWT_SECRET` | aléatoire ≥ 64 caractères |
| `NODE_ENV` | `production` |
| `PORT` | `4000` (Clever injecte `PORT` — utilisez `process.env.PORT` déjà géré) |
| `WEB_ORIGIN` | `https://VOTRE-FRONT.clever-apps.fr` |
| `APP_URL` | `https://VOTRE-FRONT.clever-apps.fr` |
| `MOCK_PAYMENTS` | `false` |
| `PAY_PROVIDERS` | `FEDAPAY,CINETPAY` |
| `FEDAPAY_SECRET_KEY` / `FEDAPAY_MODE` / `CINETPAY_API_KEY` / `CINETPAY_SITE_ID` | clés fournisseurs |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | credentials Cellar (§3) |
| `NOTIFY_*`, `EMAIL_*`, `SMS_*`, `WA_*` | canaux de notification (optionnel au début) |

**Alternative Docker** : « Create → Docker » avec root path `apps/api` — le Dockerfile
existant fonctionne tel quel (port exposé 4000).

Déployez : `git push clever main`. Vérifiez `https://VOTRE-API.clever-apps.fr/api/admin/health`.

## 3. Cellar (S3)

Console → **Add-on → Cellar S3** → créez un bucket `santeplus-documents` + des clés.
Reportez endpoint/keys dans les variables `S3_*` de l'API (§2).

## 4. Migrations & seed

Le `CC_RUN_COMMAND` applique `prisma migrate deploy` à chaque déploiement.
Pour le seed de démonstration (optionnel), depuis votre machine :

```bash
cd apps/api
$env:DATABASE_URL="postgresql://...clever..."; npx prisma migrate deploy
$env:DATABASE_URL="postgresql://...clever..."; npm run db:seed
```

⚠️ Supprimez les comptes de démo avant mise en service réelle.

## 5. Frontend

**Option A — Static site (simple)** :
Console → **Create → Static site**, root path `apps/web` :
- `CC_STATIC_BUILD_COMMAND` = `npm install && npm run build`
- `CC_STATIC_OUTPUT_PATH` = `dist`
- Variable de build : `VITE_API_URL` = URL de l'API (§2)

Le fichier `.htaccess` inclus dans `apps/web/public` active le fallback SPA sur Apache
(config statique par défaut de Clever Cloud).

**Option B — même app Node que l'API (avancée)** : servir `dist` depuis l'API avec
`express.static` + fallback `index.html` ; évite le CORS et une URL séparée.
(Évolution possible, l'option A est suffisante pour démarrer.)

## 6. Webhooks paiements

- FedaPay : `https://VOTRE-API.clever-apps.fr/api/payments/webhook/fedapay`
- CinetPay : `https://VOTRE-API.clever-apps.fr/api/payments/webhook/cinetpay`

## 7. Domaine personnalisé

Console → application → *Domain names* → ajoutez `app.votredomaine.bj` / `api.votredomaine.bj`,
CNAME chez le registrar, SSL Let's Encrypt automatique. Mettez à jour `WEB_ORIGIN`,
`APP_URL` et `VITE_API_URL` (redeploy du front).

## 8. Checklist de mise en production

- [ ] `JWT_SECRET` fort, `MOCK_PAYMENTS=false`, clés live
- [ ] Comptes de démo supprimés, mots de passe changés
- [ ] Webhooks fournisseurs configurés
- [ ] Backups PostgreSQL : activez les backups automatiques de l'add-on (console)
- [ ] Scalabilité : ajoutez une 2ᵉ instance API si besoin (le cron in-process doit alors
      être désactivé sur les instances secondaires — nous contacter)
- [ ] Test complet de bout en bout (inscription → paiement réel → tiers payant)
