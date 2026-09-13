# SantéPlus — Dossier du mécanisme de gestion santé
**Version :** 1.0 — 13 septembre 2026
**Objet :** description fidèle du mécanisme actuellement en place (code + données de production), destinée à une analyse actuarielle / audit externe.
**Périmètre :** assurance maladie individuelle et collective (Bénin, FCFA). SantéPlus agit comme plateforme technologique ; le risque est porté par des assureurs/mutuelles partenaires agréés.

---

## 1. Vue d’ensemble

Le mécanisme repose sur trois piliers :

1. **Moteur déterministe de tarification et de remboursement** (`apps/api/src/domain/engine.ts`) : mêmes règles pour le devis, l’estimation avant soins et la décision — pas de calcul caché.
2. **Compte Technique Santé (CTS) par contrat** (`apps/api/src/domain/cts-engine.ts`, `apps/api/src/modules/cts/cts.service.ts`) : journal immuable, suivi prime → frais → budget → consommation → disponible, bandes d’alerte, appels de fonds, clôtures.
3. **Fonds de solidarité mutualiste** (depuis sept. 2026) : les excédents de clôture alimentent un fonds commun qui couvre les déficits des contrats en difficulté, au lieu de les facturer aux malades.

Il n’y a **pas de réassurance externe** : le filet de sécurité est interne (plafonds, fonds de solidarité, fonds propres du partenaire assureur).

---

## 2. Produits et tarification (données de production au 12/09/2026)

### 2.1 Formules individuelles

| Formule | Prime/an (principal) | Adulte supp./an | Enfant/an | Plafond global/an | Plafond RAC/an |
|---|---|---|---|---|---|
| Santé Essentielle (ESS) | 72 000 (6 000/mois) | 48 000 | 48 000 | 500 000 | 200 000 |
| Santé Confort (CONF) | 144 000 (12 000/mois) | 108 000 | 108 000 | 1 200 000 | 150 000 |
| Santé Excellence (EXC) | 300 000 (25 000/mois) | 240 000 | 240 000 | 3 000 000 | 100 000 |

### 2.2 Formules entreprise (co-partage employeur/salarié)

| Formule | Prime/an/salarié | Plafond global/an | Plafond RAC/an |
|---|---|---|---|
| Entreprise Performance | 120 000 (5 000 + 5 000/mois) | 500 000 | 150 000 |
| Entreprise Cadre/VIP | 240 000 (10 000 + 10 000/mois) | 1 200 000 | 100 000 |

### 2.3 Règles tarifaires communes

- **Majoration par âge** (facteur appliqué selon l’âge de l’adulte le plus âgé du foyer) :
  - ESS : 1,0 (0-30) / 1,1 (31-45) / 1,25 (46-55) / 1,4 (56-65) ; âge max 65.
  - CONF : 1,0 / 1,15 / 1,35 / 1,55 ; âge max 65.
  - EXC : 1,0 / 1,15 / 1,3 / 1,5 / 1,7 (66-70) ; âge max 70.
- **Fractionnement** : annuel ×1, trimestriel ×1,03, mensuel ×1,06 (ESS/CONF ; EXC mensuel ×1,06).
- **Frais d’adhésion** : 3 000 FCFA/personne, une seule fois avec la 1ʳᵉ cotisation (plafond entreprise 100 000).
- **Ayants droit** : conjoint inclus ; enfants jusqu’à 21 ans (ESS), 25 (CONF), 26 (EXC) ; max 6/8/10 bénéficiaires.
- **Frais de gestion CTS** : 20 % des primes encaissées (configurable par produit, défaut `managementRate: 20`).

---

## 3. Garanties et partage des coûts (données de production)

### 3.1 Barèmes par formule (taux brut / ticket modérateur / plafond annuel / max par acte)

**ESS** : consultation 70 %/30 %/100 000/10 000 · pharmacie 60 %/40 %/180 000/15 000 par ordonnance · labo 50 %/50 %/30 000/10 000 par acte · hospitalisation 60 %/40 %/150 000/45 000 par jour. Exclusions : maternité, dentaire, optique, spécialisé.
**CONF** : consultation 80 %/20 %/144 000/12 000 · pharmacie 70 %/30 %/360 000/30 000 par ordonnance · labo 70 %/30 %/75 000/15 000 · spécialisé 70 %/30 %/200 000/15 000 (max 5/an) · maternité forfait 200 000, taux 100 %, **copay 0** · dentaire 60 %/40 %/40 000 · optique forfait 30 000/2 ans, **copay 0**.
**EXC** : consultations 90 %/10 %/300 000/25 000 · hospitalisation 90 %/10 %/1 500 000/45 000 par jour · pharmacie 90 %/10 %/600 000/40 000 par ordonnance · labo 90 %/10 %/250 000 · spécialisé 90 %/10 %/500 000 · maternité 80 %/20 %/400 000 · dentaire 80 %/20 %/100 000 · optique 70 %/30 %/80 000.
**ENT-PERF** : consultation 70 %/30 % · pharmacie 70 %/30 % · labo 70 %/30 % · hospitalisation 70 %/30 %/350 000 · maternité forfait 150 000, **copay 0**. Exclusions : dentaire, optique, spécialisé.
**ENT-VIP** : consultation 90 %/10 % · pharmacie 85 %/15 % · labo 85 %/15 % · spécialisé 85 %/15 %/400 000 · maternité 85 %/15 %/300 000 · dentaire 70 %/30 %/60 000 · optique 60 %/40 %/50 000.

### 3.2 Règles de calcul (moteur `estimateClaim`)

Ordre strict appliqué à chaque poste :
1. contrat actif + date dans la période de couverture ;
2. délai de carence global (30 j soins externes ; 90 j hospitalisation ; 300 j maternité CONF/EXC/entreprise ; maternité non couverte sur ESS) ;
3. exclusions de la formule ;
4. plafond annuel par catégorie (cumul contrat ou par personne si `familyLimit`) ;
5. plafond foyer le cas échéant ;
6. plafond annuel global (refus au-delà) ;
7. barème par acte (`maxUnitPrice` : le dépassement reste à charge) ;
8. taux de couverture sur le montant éligible ;
9. ticket modérateur (copay) calculé sur le montant couvert ;
10. **plafond annuel de reste à charge (RAC)** : le patient paie au maximum le reliquat jusqu’au plafond ; l’assureur reprend le surplus de ticket modérateur sur soins éligibles, **sans rouvrir** les plafonds déjà atteints (catégorie, global) ni couvrir les soins exclus/dépassements.

**Il n’y a plus de franchise** (supprimées du moteur, du schéma, des CGA, des certificats et des écrans — migration `20260912_remove_deductibles`).

### 3.3 Taux net effectif

Le taux affiché est un taux brut ; le remboursement net estimé (avant barème/plafonds) vaut `brut × (100 − copay) / 100`. Exemples : 70 %+30 % → **49 %** ; 60 %+40 % → **36 %** ; 80 %+20 % → **64 %** ; 90 %+10 % → **81 %**. Ce taux net est affiché dans le comparateur, les offres, la fiche contrat et les CGA.

---

## 4. Sinistres : instruction des dossiers

### 4.1 Canaux
- **Remboursement** (l’assuré avance puis déclare, facture obligatoire) : statuts `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/PARTIALLY_APPROVED → PAID`, avec `REJECTED`, `INFO_REQUESTED`, `CANCELLED`. Machine à états unique (`domain/claim-machine.ts`).
- **Tiers payant** (chez le prestataire, sans avance si couvert) : `AUTH_REQUIRED → AUTHORIZED → CONFIRMED → PAID`, avec dérogation d’urgence (`AUTHORIZED_EMERGENCY`, justification ≥ 10 caractères, max 10/24 h/prestataire, plafond 500 000).
- **Double validation** obligatoire ≥ 1 000 000 FCFA (deux gestionnaires différents).

### 4.2 Approbation automatique (petits dossiers propres)
Configurable (`autoApproveThreshold`, défaut 0 = désactivé, plafond de sécurité 100 000). Conditions cumulatives : remboursement (hors tiers payant), estimation sans aucun drapeau, montant ≤ seuil, montant approuvé > 0, facture jointe. Échantillon d’audit a posteriori configurable (`autoApproveAuditPercent`, défaut 10 %) avec alerte gestionnaire. Le message assuré distingue approbation et paiement.

### 4.3 Garde-fous anti-fraude
Détection de doublons (montant/date/contrat + hash des pièces), job quotidien : z-scores prestataires (montants/volumes sur 30 j) et cumuls suspects (même médicament, même jour, plusieurs bénéficiaires). Dossiers `FraudCase` avec workflow d’instruction.

### 4.4 Seuils d’entente préalable (tiers payant)
ESS 120 000 · CONF 200 000 · EXC 150 000 · ENT-PERF 150 000 · ENT-VIP 100 000 (défaut système 150 000 ; seuils par acte possibles). EXC et ENT-VIP exigent l’entente préalable pour hospitalisations. Ordonnance obligatoire pour la pharmacie et les actes à prescription.

---

## 5. Compte Technique Santé (CTS)

### 5.1 Comptabilité par contrat (journal immuable, 13 types)
Enchaînement : `PRIME` (souscrite/facturée/encaissée) → `FRAIS` (20 %) → `BUDGET` (prime − frais) → `ENGAGEMENT` (sinistre estimé, idempotent par sinistre) → `CONSOMMATION` (payé, libère l’engagement) → `ANNULATION`/`REMBOURSEMENT`/`AJUSTEMENT`/`PAIEMENT`/`APPEL_FONDS`/`CREDIT_RENOUVELLEMENT`/`STOP_LOSS`/`SOLIDARITE`. Contre-écritures uniquement, jamais de modification/suppression (§40.4).

### 5.2 Bandes de pilotage (sur disponible/budget)
NORMAL (≥ 50 %) · SURVEILLANCE (< 50 %) · ALERTE (< 30 %) · CRITIQUE (< 10 %) · EPUISE (≤ 0). Alertes automatiques, résolues au retour à la normale. Le statut de carte dérivé est **indicatif seul, sans coupure mécanique de droits** (§40.20).

### 5.3 Appels de fonds
Proposition `cible − disponible` (cible défaut = reconstitution du budget, montant choisi par humain). À l’envoi : facture APF, échéance +30 j, notification. **La part facturée à l’assuré est plafonnée au minimum entre 100 000 FCFA et une prime annuelle du contrat** ; le surplus est demandé au Fonds de solidarité. Le déficit n’est jamais facturé automatiquement ; l’encaissement d’un appel crédite le CTS et peut réactiver (si plus d’échéance en retard et disponible > 0).

### 5.4 Clôture et renouvellement
Réservée aux contrats terminés/expirés : excédent = budget − consommé − engagé. **20 % de l’excédent vont au Fonds de solidarité** ; le crédit de renouvellement = 70 % du reliquat (déduction sur la prochaine échéance ou boost de budget). Le crédit n’est pas retirable. Clôture définitive après confirmation.

### 5.5 Stop-loss
Seuil + plafond configurables par produit/contrat : au-delà du seuil d’exposition, écriture `STOP_LOSS` + alerte CRITIQUE (dédupliquée avec hystérésis). Actuellement **signal d’alarme** : à relier à une reconstitution budgétaire explicite (chantier identifié).

---

## 6. Fonds de solidarité mutualiste

- **Alimentation** : 20 % des excédents de clôture (`solidarity.surplusShare`), enregistrés en mouvements `CONTRIBUTION` + écriture contrat `SOLIDARITE`.
- **Emplois** : couverture des déficits (`COVERAGE`), plafonnée par le déficit réel, le solde du fonds et 500 000 FCFA par contrat (`solidarity.maxCoveragePerContract`) ; backstop automatique du surplus des appels de fonds.
- **Pilotage** : endpoint `GET /admin/solidarity/fund` (solde, statut OK/VIDE/DÉSACTIVÉ, configuration, derniers mouvements, **ratio de solidarité** = couvertures / primes encaissées) ; action `POST /admin/contracts/:id/solidarity-cover` ; carte dédiée dans Admin → Comptes techniques avec bouton « Couvrir » par contrat critique.
- **Paramètres** (SystemConfig, modifiables sans redéploiement) : `solidarity.enabled=true`, `surplusShare=0.2`, `individualFundCallCap=100000`, `maxCoveragePerContract=500000`.
- **Validation actuarielle (sept. 2026, scénarios 70/20/7/3 %)** : fonds positif au niveau portefeuille en scénarios sévère (+0,9 % des primes) et modéré ; en année systémique grave, le fonds couvre ~1/4 des besoins, le reste relevant des fonds propres de l’assureur. Les excédents EXC/entreprise compensent les déficits ESS/CONF : c’est la mutualisation attendue.

---

## 7. Cotisations, paiements, vie du contrat

- Moyens : MTN MoMo, Moov Money (CinetPay), FedaPay (mobile + carte), simulation mock en test. Paiement = première échéance + éventuels frais d’adhésion ; activation à l’encaissement vérifié (jamais de réactivation administrative sans paiement, §17.7 : bande saine + aucune échéance en retard requises).
- Relances : rappel à J-3/J-1, recouvrement gradué J+3/J+7, **suspension J+15**, **résiliation J+45** (grâce configurables : 15 j / 45 j).
- Renouvellement : nouvel échéancier, application du crédit confirmé, règlement pour activer.

---

## 8. Réseau de soins et parcours patient

- Vérification QR en temps réel (droits, garanties, plafonds restants), carte numérique + PDF, annuaire prestataires avec tiers payant.
- Portail prestataire (web + PWA mobile, file d’attente hors ligne avec cache plafonds 36 h), facturation par lots, rejets/avoirs, réconciliation.
- Données de démo : 12 établissements (Cotonou, Abomey-Calavi, Porto-Novo, Parakou). L’efficacité réelle dépend de la densité du réseau conventionné en tiers payant.

---

## 9. Souscription et contrôle d’identité

Parcours : identité exacte (prénom/nom/naissance comme sur l’acte ou la pièce) → formule → **acte de naissance obligatoire** (ou pièce) avec vérification backend : le document est comparé **à la fois au profil et à la saisie initiale** ; toute divergence bloque. Photo, bénéficiaires, devis, paiement mobile, carte immédiate. Garanties figées par formule ; toute demande de modification tarifaire passe par un gestionnaire avec estimation d’impact.

---

## 10. Gouvernance, rôles, données

- Rôles : SUPER_ADMIN, INSURANCE_MANAGER, SUPPORT_AGENT, COMPANY_ADMIN, MEMBER, PROVIDER ; permissions granulaires (`cts.view/manage`, `claims.decide`, `products.manage`, `config.manage`, …). L’onglet technique est masqué aux assurés et la route personnelle CTS exige `cts.view`.
- Données médicales **chiffrées** (AES-256-GCM, clé dédiée `FIELD_ENCRYPTION_KEY`), accès restreint (propriétaire, gestionnaires, prestataire concerné), audit de tous les accès sensibles, rétention configurable (désactivée par défaut en attente de validation juridique CIMA/Bénin).
- Pilotage : sinistralité, réserves RBNS + IBNR (Chain Ladder 24 mois), rentabilité par produit, performance prestataires, portefeuille ; comptabilité OHADA (journaux OD/BQ).

---

## 11. Limites et hypothèses à faire valider par l’analyste

1. **Pas de réassurance externe** : le risque systémique repose sur les fonds propres du partenaire + le fonds de solidarité (dimensionné pour la redistribution courante, pas pour une année catastrophique).
2. **Valeurs de démarrage** : part solidarité 20 %, plafonds RAC 200/150/100 k, seuils d’approbation auto — à recalibrer sur sinistralité réelle observée.
3. **Stop-loss non reconstituant** : alerte + écriture, sans crédit budgétaire automatique (à finaliser).
4. **Délais de carence et exclusions ESS** (maternité/dentaire/optique/spécialisé) : choix de solvabilité à fort impact commercial et social.
5. **Suspension J+15 / résiliation J+45** : sévère pour revenus irréguliers ; mécanismes de rattrapage à évaluer.
6. Le comparateur affiche taux brut **et** net estimé ; vérifier la compréhension réelle par des tests utilisateurs.
