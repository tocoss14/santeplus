# SantéPlus — Plateforme technologique d’assurance maladie
**Document de présentation destiné aux assureurs et mutuelles partenaires**

---

## 1. Positionnement

SantéPlus est une **plateforme technologique d’intermédiation**, pas un porteur de risque : les contrats sont portés par des assureurs/mutuelles partenaires agréés, qui gardent la maîtrise des tarifs, barèmes et garanties. Nous fournissons le moteur, les parcours et le pilotage — vous gardez la gouvernance actuarielle et réglementaire.

## 2. Moteur déterministe et auditable

- **Tarification** : primes par foyer (principal + adultes + enfants), majorations par âge, fractionnement annuel/trimestriel/mensuel, frais d’adhésion — calculs purs, reproductibles, testés (300+ tests unitaires).
- **Remboursement** : pipeline strict en 10 étapes (activité du contrat, carences globales et par catégorie, exclusions, plafonds catégorie/foyer/global, barème par acte, taux, ticket modérateur, plafond annuel de reste à charge). Zéro franchise depuis sept. 2026.
- **Machine à états unique** des sinistres (remboursement et tiers payant), double validation ≥ 1 000 000 F, approbation automatique des petits dossiers propres (seuil plafonné à 100 000 F, audit a posteriori échantillonné).

## 3. Compte Technique Santé (CTS) par contrat

- **Journal immuable** (13 types d’écritures, contre-écritures uniquement) : primes souscrites/facturées/encaissées → frais (20 % paramétrable) → budget → engagements → consommations.
- **Bandes de pilotage** automatiques (50/30/10 %), alertes, statut carte indicatif sans coupure mécanique de droits.
- **Appels de fonds** : proposition cible − disponible, part individuelle plafonnée (min 100 000 F, une prime annuelle), facture, encaissement vérifié seul déclencheur de réactivation.
- **Clôture** : excédent mesuré, crédit de renouvellement (70 % du reliquat, déduction ou boost), jamais retirable.
- **Stop-loss contractuel** : seuil + plafond, alerte critique, reconstitution budgétaire via le fonds.

## 4. Fonds de solidarité mutualiste (opérationnel)

- **Alimentation** : part dynamique des excédents de clôture indexée sur la sinistralité globale (< 80 % → 15 %, 80-100 % → 25 %, > 100 % → 40 %), portée à 30 % en reconstitution (solde < 15 % des primes).
- **Emplois** : couverture proportionnelle des déficits (part équitable du solde, plancher à zéro, jamais négatif), backstop des appels de fonds, reconstitution post stop-loss jusqu’à 30 % du budget.
- **Pilotage** : solde, statut (OK/VIDE/RECONSTITUTION), ratio de solidarité global et **par modèle**, ventilation par produit, distribution des contrats — exposés via API et tableau de bord.
- **Choix de modèle par contrat** : MUTUALITE (défaut, solidaire, sortie après 24 mois anti-antisélection) ou INDIVIDUEL (auto-assuré, 100 % de l’excédent conservé, aucun recours au fonds). Moteurs et barèmes strictement identiques.
- **Validation actuarielle** : scénarios 70/20/7/3 — fonds positif au portefeuille en années normale et sévère, couverture ~49 % des besoins en année systémique grave (solde plancher), neutralité du mix 50/50. Pas de réassurance externe : le risque systémique reste aux fonds propres du porteur.

## 5. Pilotage et conformité

- **Analytique** : sinistralité (S/P), réserves RBNS + IBNR (Chain Ladder 24 mois), rentabilité par produit, performance prestataires, évolution du portefeuille.
- **Comptabilité OHADA** (journaux OD/BQ), audit de tous les accès sensibles, anti-fraude (doublons, z-scores prestataires, cumuls suspects, dossiers d’instruction).
- **Données de santé chiffrées** (AES-256-GCM, clé dédiée), permissions granulaires par rôle, compte technique masqué aux assurés.
- **Produits configurables** sans redéploiement : garanties, taux, tickets, plafonds, carences, exclusions, majorations d’âge, paramètres CTS et solidarité.

## 6. Réseau et distribution

- Recrutement prestataires en ligne, conventionnement par niveau, tiers payant avec seuils d’autorisation, PWA mobile offline-first.
- Distributeurs avec commissions (nouvelle affaire, renouvellement, overrides) et garde-fous anti-fraude (clawback).
- Collectifs entreprises : import CSV salariés, co-partage employeur/salarié, pilotage agrégé sans données médicales individuelles.

## 7. Ce que nous vous proposons

- **Marque blanche ou co-branding**, vos produits et barèmes, vos règles de souscription.
- **Transparence actuarielle** : accès complet au CTS, au fonds de solidarité (ratio publié) et aux triangles de développement.
- **Déploiement mobile-first** pensé pour le Bénin : mobile money (MTN MoMo, Moov Money, FedaPay, CinetPay), QR offline, PWA légère.

**Un moteur éprouvé, une mutualité mesurable, un risque piloté.** Parlons de vos produits.
