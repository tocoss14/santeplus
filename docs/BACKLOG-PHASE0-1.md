# Backlog détaillé — Phases 0 et 1 (SantéPlus → Mutuelle agréée ARSS)

## Statut des quick wins (10)
- [x] QW1 Publier les 4 formules (page Offres)
- [x] QW2 Modulation par 5 tranches d'âge (tableau publié ; moteur à aligner)
- [x] QW3 Taux de prise en charge par soin (tableau publié)
- [x] QW4 Délais de carence (tableau publié)
- [x] QW5 Exclusions (liste publiée)
- [~] QW6 Simulateur familial (existant, à enrichir composition dynamique)
- [x] QW7 Conditions générales / IPID (page CGA)
- [x] QW8 FAQ structurée
- [~] QW9 Réseau de soins (existant, à enrichir conventionnement/tarification)
- [x] QW10 Réclamation et médiation

## Phase 0 — Audits (M1-3)
- [ ] Audit de sécurité indépendant (pentest, OWASP, chiffrement)
- [ ] Audit fonctionnel détaillé + cartographie
- [ ] Tests de montée en charge (178k adhérents, 50k connexions simultanées)
- [ ] Sécurisation juridique PI (contrat de licence/cession)

## Phase 1 — Modules réglementaires (M3-9)
### Comptabilité SYSCOHADA (4 mois)
- [ ] Plan comptable paramétrable + comptes auxiliaires
- [ ] Imputation automatique cotisations/prestations/frais
- [ ] Comptabilité analytique par formule/segment
- [ ] États de synthèse (bilan, CR, flux, annexe)
- [ ] Reporting fiscal (TVA, IBIC, TSCA)
- [ ] Exports FEC + clôture mensuelle/annuelle

### Conformité ARSS (3 mois)
- [ ] 15 états types ARSS automatisés
- [ ] Ratios prudentiels (marge solvabilité, ratio gestion, fonds réserve)
- [ ] Alertes de conformité + veille réglementaire
- [ ] Exports PDF/Excel/XML

### Actuarial (4 mois)
- [ ] SAP mensuel
- [ ] IBNR (chain-ladder / Bornhuetter-Ferguson)
- [ ] Sinistralité par cohorte/formule/tranche
- [ ] États actuariaux ARSS + projections
- [ ] Alertes seuils (75% formule, 80% global)

### BI v1 (3 mois)
- [ ] Datamart consolidé + ETL
- [ ] 10 indicateurs cibles
- [ ] 5 tableaux de bord par profil
- [ ] Alertes automatiques + exports

## Modules métiers à compléter
### Gestion des sinistres (refonte)
- [ ] Workflow multi-étapes + contrôle médical optionnel
- [ ] Scoring automatique des dossiers
- [ ] Plafonds annuels par catégorie (décrément)
- [ ] Tiers payant prestataires conventionnés
- [ ] Historique complet par adhérent

### Contrôle médical
- [ ] File d'attente priorisée
- [ ] Workflow validation / refus / justificatifs
- [ ] Messagerie sécurisée prestataires
- [ ] Reporting de contrôle

### Réseau de soins (extension)
- [ ] Conventionnement + tarification par acte
- [ ] Géolocalisation 12 départements (250 prestataires An1)
- [ ] Notation et qualité
- [ ] Espace prestataire

### Impayés et relances
- [ ] Détection automatique
- [ ] Workflow relance J+3/J+7/J+15/J+30/J+60
- [ ] Tableau de bord impayés + réactivation

## Estimation
- Phase 0 : 3 mois
- Phase 1 : 6 mois (97 M FCFA)
- Couverture cible : 100 % modules critiques
