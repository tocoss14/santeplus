# Architecture — SantéPlus Bénin

## 1. Vision & principes

Plateforme InsurTech conçue selon le modèle cible du cahier des charges :

```
PARTICULIER / ENTREPRISE
        ↓
    PLATEFORME (technologie, parcours, paiement, carte, remboursements)
        ↓
   PRODUIT DE MUTUELLE / ASSURANCE (configurable, sans code)
        ↓
   ASSUREUR / MUTUELLE PARTENAIRE (porteur du risque)
        ↓
     RÉSEAU DE SOINS (prestataires conventionnés)
```

Décisions structurantes :
1. **Monolithe modulaire** : coût d'exploitation minimal, un seul déploiement au lancement ;
   chaque module (paiements, réclamations, notifications…) a des frontières nettes et peut être
   extrait en service indépendant quand le volume l'exigera.
2. **Le risque n'est jamais porté par la plateforme** : chaque produit est rattaché à un
   `InsurerPartner` (assureur ou mutuelle agréée). Le rôle juridique est affiché sur les contrats
   (`platformRole` en configuration) — conformément au §22 du cahier des charges.
3. **Multi-everything prêt** : multi-assureurs (table partenaires), multi-pays/devise (champ
   `currency` XOF partout, montants entiers), multi-moyens de paiement (interface provider),
   multi-canaux de notification.

## 2. Choix techniques & justifications

| Domaine | Choix | Alternatives écartées | Pourquoi |
|---|---|---|---|
| Backend | **NestJS 10 + TypeScript** | Express nu, Django, Laravel | Structure modulaire native (modules/guards/pipes), DI testable, DI guard RBAC intégré, gros vivier de compétences JS/TS, typage end-to-end partagé avec le front |
| ORM/BDD | **Prisma + SQLite (dev) → PostgreSQL (prod)** | MongoDB, MySQL | Schéma relationnel strict (contrats, sinistres = données transactionnelles), migrations versionnées ; SQLite = démo zéro-install, PG = production robuste et économique |
| Frontend | **React 18 + Vite + TailwindCSS** | Angular, Vue, Next.js SSR | SPA légère (~200 Ko gzip) adaptée aux connexions faibles, PWA-possible, écosystème mobile-friendly |
| Auth | **JWT access 12 h + refresh 30 j**, bcryptjs | Sessions serveur | Sans état (scale horizontal), refresh rotatif ; bcryptjs sans dépendance native (déploiements Windows/Docker simplifiés) |
| Autorisation | **RBAC en base (`RolePermission`) + garde globale** | Permissions codées en dur | Le cahier des charges exige des permissions configurables (§18) : matrice éditée dans l'admin, cache 30 s |
| Paiements | **Interface `PaymentProvider`** + registry | Intégration unique MTN ou Wave | Indépendance fournisseur (§14) ; Mock opérationnel, squelettes FedaPay/CinetPay (agrégateurs présents au Bénin) |
| Fichiers | Stockage local abstrait (`FileObject`) | S3 direct | Aucune donnée médicale exposée publiquement : streaming authentifié + contrôle de propriété ; migration S3-compatible = remplacer `FilesService.save/stream` |
| Tests | **Vitest** sur le moteur métier pur | E2E only | Les règles d'argent/plafond/carence sont des fonctions pures (`domain/engine.ts`) : 16 cas nominaux + erreurs rapides à exécuter ; smoke tests HTTP/UI manuels scriptés |

## 3. Modèle de données (entités clés)

```
User ─┬─< Contract(principal) ─┬─< Beneficiary ─< BeneficiaryChange (historique)
      │                        ├─< Contribution (échéancier cotisations)
      │                        ├─< Payment
      │                        ├─< Claim ─┬─< ClaimItem (par catégorie)
      │                        │          └─< ClaimDocument >── FileObject
      │                        └─ cardToken (QR tiers payant)
      ├─< Notification
      ├─< AuditLog
      └─> Company ─< Contract(kind=GROUP) ←— (employees: User.companyId)
                                         └─< Contract individuels liés (groupContractId)

Product ─┬─< ProductGuarantee >── Guarantee (catalogue catégories)
         ├─< ProductExclusion
         └─> InsurerPartner

RolePermission · SystemConfig · Provider(réseau de soins)
```

Choix notables :
- **Montants en entiers FCFA** (pas de centimes dans la zone UEMOA) → zéro erreur d'arrondi monétaire.
- **Enums en String** + validation Zod : portabilité SQLite/PostgreSQL sans migration d'enums.
- **Plafonds consommés** sur les montants *éligibles* approuvés (`ClaimItem.amountEligible`), par
  année d'anniversaire de contrat.
- **Salariés = contrats individuels rattachés** à un contrat collectif (`groupContractId`) : le
  moteur de remboursement/tiers payant est uniforme quel que soit le type de contrat.
- **Historique bénéficiaires** (`BeneficiaryChange`) : traçabilité ajout/modif/retrait exigée §16.

## 4. Moteurs métier (purs, testés)

`apps/api/src/domain/engine.ts` :
- `computeQuote()` : tarification = base (principal) + adultes supp. + enfants, × facteur de
  fractionnement configurable par produit. Validation âges min/max.
- `buildSchedule()` : échéancier avec répartition exacte au FCFA.
- `estimateClaim()` : chaîne de contrôle — contrat actif → période → **délai de carence** →
  exclusions → plafond restant par garantie → taux → franchise (fixe/%) → reste à charge.
  Ne décide jamais seul : produit une **estimation** + flags (`DUPLICATE_SUSPECT`,
  `WAITING_PERIOD`, `OUT_OF_PERIOD`…) soumis à validation gestionnaire (§10).

## 5. Sécurité

- Helmet, CORS restreint à l'origine web, limiteur de débit sur login/register.
- Verrouillage compte après 5 échecs (15 min) — à porter sur Redis en cluster.
- Mots de passe bcrypt (10 rounds), politique minimale 8 caractères lettre+chiffre.
- Pièce d'identité chiffrée AES-256-GCM en base (`nationalIdEnc`), déchiffrage à la demande uniquement.
- **QR carte = jeton opaque 32 hex** : aucune donnée personnelle encodée ; vérification serveur ;
  régénération immédiate possible ; chaque vérification prestataire journalisée (`AuditLog`).
- Documents médicaux : jamais servis statiquement — stream via `/api/files/:id/view` après contrôle
  propriétaire / rôle staff / lien contrat.
- Cloisonnement entreprises : toutes les requêtes company filtrent sur `user.companyId`.
- Journal d'audit automatique (intercepteur) sur toute mutation : qui, quoi, quand, IP, succès/échec.
- Validation systématique des entrées par schémas **Zod** côté serveur (jamais de confiance client).

## 6. Conformité CIMA / Bénin

- La plateforme est positionnée comme **outil d'intermédiaire technologique** ; les produits portent
  la marque du partenaire assureur/mutuelle (`insurerPartnerId` sur produits et contrats).
- Mention légale paramétrable (`SystemConfig.platformRole`) affichée landing + footer + documents.
- Séparation stricte des responsabilités : souscripteur / assuré principal / bénéficiaire /
  entreprise / prestataire / administrateur = rôles distincts.
- Traçabilité complète (audit) et conservation des pièces (documents) pour les contrôles.
- Point d'attention avant commercialisation : agrément/partenariat formel avec un porteur de risque,
  hébergement des données de santé, DPO & registre des traitements (APDP Bénin).

## 7. Roadmap

### Phase 2 (fondations déjà en place)
- ~~Paiements réels~~ ✅ **Adaptateurs FedaPay & CinetPay implémentés** avec re-vérification
  serveur→serveur des webhooks (aucune confiance dans le payload entrant) ; activation par clés API
- ~~Tiers payant~~ ✅ **Livré** : initiate/confirm côté prestataire, autorisation préalable
  configurable (`thirdPartyAuthThreshold`), plafonds consommés en temps réel
  (`CONFIRMED`/`AUTHORIZED` inclus dans `CLAIM_STATUSES_CONSUMING_CAPS`), reçu imprimable,
  notifications gestionnaire + assuré
- ~~Notifications SMS/e-mail réels~~ ✅ **`NotificationDispatchService` centralisé** : IN_APP
  systématique + routage par sujet vers e-mail (API HTTP), SMS (passerelle générique) et
  **WhatsApp Business Cloud API** (prioritaire sur le SMS si configuré). Sujets configurables via
  `NOTIFY_EMAIL_TOPICS` / `NOTIFY_SMS_TOPICS`. Sans clés, transports journalisés en console (démo).
  Tous les points d'émission (paiements, sinistres, cron, tiers payant) passent par ce service.
- ~~PDF officiels~~ ✅ **Certificat d'adhésion** (`/contracts/:id/certificate`) et
  **Attestation collective entreprise** (`/company/me/attestation`) générés en PDF réel (pdfkit),
  téléchargeables depuis les espaces assuré et entreprise.
- Application prestataire dédiée : **scanner QR caméra livré** dans le portail web (jsQR,
  `getUserMedia` rear-camera, repli saisie manuelle) — une PWA/app native peut s'appuyer dessus.
- Application prestataire dédiée (scan QR caméra)
- PDF officiels (certificat d'adhésion, attestation entreprise) — aujourd'hui pages imprimables
- Pro-rata cotisation à l'entrée/sortie de salarié en cours d'année

### Phase 3
- OCR factures (service `DocumentAnalysis` à brancher sur un moteur vision) + pré-remplissage des demandes
- Chatbot assuré branché sur les mêmes endpoints autorisés que l'app (jamais au-delà des droits)
- Détection d'anomalies (doublons croisés inter-assurés, patterns de fraude)
- Multi-langues (i18n), multi-devises, portail assureur partenaire (déclarations)
- Code-splitting front (bundle actuel 700 Ko → lazy-load recharts/admin)

## 8. Qualité & tests

- `npm run test` : moteur de calcul (devis, échéanciers, estimation sinistre : plafonds, franchises,
  carence, exclusions, doublon suspect, hors période).
- Smoke tests HTTP exécutés lors du développement : auth, RBAC négatif (403 membre→admin),
  souscription→paiement→activation, devis, vérification QR, stats admin.
- Smoke tests UI Playwright : 10 scénarios verts (landing, offres, dashboard assuré, carte QR,
  remboursements, annuaire, dashboard admin, revue de demande, vérification prestataire, espace entreprise).
