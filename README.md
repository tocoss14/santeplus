# SantéPlus Bénin — Plateforme de mutuelle santé digitale

> **Votre santé. Votre couverture. Simplement.**

Plateforme InsurTech complète pour le marché béninois : souscription en ligne (particuliers & entreprises),
gestion digitale des contrats, carte d'assuré avec QR code sécurisé, réseau de soins, tiers payant,
remboursements avec moteur d'estimation automatique et back-office administrateur complet.

---

## Démarrage rapide

### Prérequis
- Node.js ≥ 20, npm ≥ 10
- **PostgreSQL** en local (le plus simple : Docker)

### Installation

```bash
# 1. Démarrer PostgreSQL local (ou pointez DATABASE_URL vers votre PG)
docker compose up -d db

# 2. Installer les dépendances (monorepo npm workspaces)
npm install

# 3. Créer les tables + charger les données de démonstration
npm run db:migrate
npm run db:seed

# 4. Lancer API (port 4000) + Web (port 5173)
npm run dev
```

> La configuration locale se fait dans `apps/api/.env` (`DATABASE_URL` pointe par défaut
> sur `postgresql://santeplus:santeplus_dev@localhost:5432/santeplus`).
> **Déploiement production** : voir [`DEPLOY-RUNSITE.md`](DEPLOY-RUNSITE.md) ou
> [`DEPLOY-CLEVERCLOUD.md`](DEPLOY-CLEVERCLOUD.md).

### Comptes de démonstration — mot de passe : `Demo1234!`

| Compte | Rôle | Espace |
|---|---|---|
| `admin@santeplus.bj` | Super administrateur | `/admin` |
| `gestionnaire@santeplus.bj` | Gestionnaire assurance | `/admin` |
| `support@santeplus.bj` | Agent support | `/admin/claims` |
| `entreprise@santeplus.bj` | Admin entreprise (SOTRABEN) | `/entreprise` |
| `jean@demo.bj` | Assuré — Formule Confort, famille couverte | `/app` |
| `fatou@demo.bj` | Assurée — Formule Essentielle, contrat bientôt à renouveler | `/app` |
| `kossi@demo.bj` | Assuré — souscription en attente de paiement | `/app` |
| `prestataire@santeplus.bj` | Prestataire de santé | `/prestataire` |

**Jeton QR de test** (espace prestataire) : `tok_jean01_demo`

### Scripts utiles

```bash
npm run build        # build API + Web
npm run test         # tests unitaires (moteur de calcul, 16 cas)
npm run db:seed      # réinitialiser les données de démo
```

---

## Périmètre livré (MVP Phase 1 + éléments Phase 2)

### Espace assuré
- Inscription, connexion, profil, changement de mot de passe
- Assistant de souscription en 5 étapes (formule → bénéficiaires → devis → paiement → activation)
- Simulation de cotisation instantanée (fractionnement mensuel/trimestriel/annuel)
- Gestion des ayants droit (règles produit : conjoint, âge max enfants, quota)
- Contrat numérique, échéancier de cotisations, renouvellement
- **Carte d'assuré numérique avec QR code sécurisé** (jeton opaque, régénération)
- Déclaration de dépense avec upload photo facture/ordonnance
- Suivi de remboursement avec timeline et estimation transparente
- Annuaire des prestataires avec recherche + géolocalisation « autour de moi »
- Notifications in-app

### Espace entreprise
- Création de compte entreprise, souscription collective
- Ajout manuel de salariés + **import CSV/Excel avec rapport d'erreurs ligne par ligne**
  (détection doublons email/téléphone/identité, dates invalides, comptes existants)
- Sorties de salariés (résiliation automatique de leur couverture)
- Suivi agrégé de sinistralité (sans détail médical individuel)
- Cotisations collectives centralisées

### Back-office administrateur
- Dashboard professionnel : KPIs, évolution adhésions/cotisations, ratio sinistres/cotisations, stats par produit
- Gestion des demandes de remboursement : file par statut, pièces jointes, **ajustement des montants ligne par ligne**, approbation/refus/partiel/demande d'infos/paiement
- Gestion contrats : recherche, suspension, réactivation, résiliation
- Gestion assurés & utilisateurs internes (création staff, suspension)
- **Moteur de configuration produits** : formules, garanties, plafonds, taux, franchises, exclusions, délais de carence, règles bénéficiaires, tarification — tout éditable sans code
- Réseau de soins (CRUD prestataires, convention, tiers payant)
- Partenaires assureurs/mutuelles (architecture multi-assureurs §23)
- **Rôles & permissions configurables** (matrice éditable en base)
- Journal d'audit complet
- Paramètres système (délais de grâce, seuils de suspension, rappels)

### Portail prestataire
- Vérification de carte par jeton QR : identité, validité, garanties, **plafonds restants en temps réel**
- Alertes (contrat suspendu/expiré) — chaque vérification est journalisée
- **Tiers payant complet** (§8) : saisie des actes au cabinet → calcul instantané
  (couvert / franchises / reste à charge patient) → confirmation → reçu imprimable.
  Plafonds décrémentés en temps réel. **Autorisation préalable obligatoire** au-delà d'un seuil
  configurable (`thirdPartyAuthThreshold`, défaut 150 000 FCFA) : le gestionnaire approuve
  depuis le back-office avant confirmation.

---

## Architecture

Voir [`docs/architecture.md`](docs/architecture.md) pour les choix détaillés, le modèle de données,
la sécurité, la conformité réglementaire (modèle intermédiaire/porteur de risque) et la roadmap.

```
apps/
├─ api/     NestJS + TypeScript + Prisma (SQLite dev / PostgreSQL prod)
└─ web/     React 18 + Vite + TailwindCSS + Recharts + qrcode.react
```

## Déploiement production (Docker)

```bash
cp .env.example .env   # renseigner JWT_SECRET, DB_PASSWORD, clés paiement
docker compose up --build
```
- Web (nginx + SPA) : http://localhost:8080
- API : http://localhost:4000/api
- PostgreSQL : port 5432

Le passage local → production ne change que des variables d'environnement : `DATABASE_URL`
(PostgreSQL managé), `S3_*` (stockage documents), `JWT_SECRET` fort, `MOCK_PAYMENTS=false`.

## Intégrer un vrai moyen de paiement

**Les adaptateurs FedaPay et CinetPay sont implémentés et fonctionnels.** Pour les activer :

1. Créer un compte marchand sur [fedapay.com](https://fedapay.com) ou [cinetpay.com](https://cinetpay.com)
2. Renseigner dans `apps/api/.env` :
   ```env
   PAY_PROVIDERS="MOCK_MOMO,FEDAPAY,CINETPAY"
   FEDAPAY_SECRET_KEY="sk_sandbox_xxx"      # FEDAPAY_MODE=live en production
   CINETPAY_API_KEY="xxx"
   CINETPAY_SITE_ID="xxx"
   ```
3. Redémarrer l'API — les moyens apparaissent automatiquement au parcours de souscription

Sécurité des webhooks : **aucune confiance dans le payload entrant** — chaque notification est
re-vérifiée par appel API serveur→serveur (`GET /transactions/:id` FedaPay, `/v2/payment/check`
CinetPay) avant confirmation du paiement. Webhooks :
- `POST /api/payments/webhook/fedapay` — fail-closed (400 si payload invalide)
- `POST /api/payments/webhook/cinetpay`

Le mode simulation `MOCK_MOMO` reste disponible pour tous les tests sans compte marchand.
