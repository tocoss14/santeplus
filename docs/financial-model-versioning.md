# Versionnement des modèles financiers

> Référentiel technique de la coexistence V1_LEGACY / V2_MUTUAL. Pour la procédure
> de migration d'un contrat, voir
> [migration-v1-v2-financial-model.md](./migration-v1-v2-financial-model.md).

## 1. Principe

Chaque contrat est rattaché à **une et une seule version de modèle financier** au
moment de sa création (`Contract.financialModelVersionId`). Cette affectation
détermine le moteur de calcul (CTS / position technique / résultats) pour **toute
la vie du contrat**. Elle n'est changée que par une migration volontaire,
traçable et certifiée.

Deux versions de référence existent :

| Code        | Moteur | Statut par défaut | Rôle                                        |
|-------------|--------|-------------------|---------------------------------------------|
| `V1_LEGACY` | `V1`   | `ARCHIVED`        | Modèle historique gelé (READ_ONLY)          |
| `V2_MUTUAL` | `V2`   | `ACTIVE`          | Modèle mutualiste cible, défaut des nouveaux contrats |

Identifiants fixes seedés : `fmv_v1_legacy`, `fmv_v2_mutual`.

## 2. Règles d'invariance (non négociables)

1. **Aucune suppression** : tables, colonnes, règles, tests ou écrans V1 ne
   peuvent être retirés.
2. **Aucune écriture historique modifiée** : les écritures produites sous V1
   portent V1 pour toujours — jamais de réétiquetage rétroactif.
3. **Aucun recalcul du passé avec V2** : les positions/results historiques V1
   restent calculés et archivés selon V1.
4. **Aucune conversion silencieuse** : passer un contrat de V1 à V2 exige le
   workflow de migration complet (7 phases) avec snapshot préalable.
5. **Une seule version ACTIVE** à un instant donné. L'activation ou la
   réactivation suspend mécaniquement toute autre version ACTIVE.
6. **V1 ne reçoit aucune nouvelle fonctionnalité** : management fee 20 %, CTS
   V1, appels de fonds, crédit de renouvellement et fonds de solidarité V1 sont
   figés (corrections de bugs exceptées).

## 3. Cycle de vie des versions

Statuts : `DRAFT` → `ACTIVE` → `ARCHIVED` (avec `SUSPENDED` intermédiaire
possible).

- **Activation** (`POST /admin/financial-models/versions/:id/activate`) :
  suspend l'ACTIVE précédente, active la cible, journalise
  `FINANCIAL_MODEL_ACTIVATED`. Justification ≥ 10 caractères obligatoire.
- **Archivage** (`.../archive`) : la version passe `ARCHIVED` + `archivedAt`,
  journalise `FINANCIAL_MODEL_ARCHIVED` avec le nombre de contrats actifs
  rattachés au moment de l'archivage. **READ_ONLY** : les contrats existants
  continuent d'être servis par leur moteur, sans aucune réécriture.
- **Réactivation** (`.../reactivate`) : permission `financial-model.admin`,
  justification, journal `FINANCIAL_MODEL_REACTIVATED` avec
  `retroactiveEffect: false`. Suspend l'ACTIVE du moment.

## 4. Moteurs et étanchéité

- **V1** : `apps/api/src/modules/cts/cts.service.ts` — inchangé. Continue de
  servir tous les contrats `V1_LEGACY`.
- **V2** : `apps/api/src/modules/financial-model/cts-v2.service.ts` — agrège
  cotisations payées, prestations engagées (`APPROVED`, `PARTIALLY_APPROVED`)
  et payées (`PAID`), puis consomme les fonctions pures de
  `apps/api/src/domain/financial-model-v2.ts` (position technique, réserves,
  résultat technique/net, affectation solidarité, indicateurs prudentiels).
- Le moteur V2 **n'écrit jamais** dans les tables V1 (`CtsJournal`, `FundCall`,
  solidarité) et ne lit que le périmètre des contrats V2 explicitement passés.

**Routage par modèle** : le moteur applicatif est choisi d'après
`contract.financialModelVersion.engineVersion`. Un contrat V1 qui appelle une
route V2 reçoit une erreur explicite (jamais un calcul mixte).

## 5. Formule de la position technique V2

```
Position = Cotisations + Autres ressources (recouvrements)
         − Prestations engagées − Prestations payées
         − Charges − Provisions (RBNS + IBNR)
         − Dotations réserves
         + Cession réassurance (quota-share sur charges)
```

Résultat technique = ressources − charges techniques ; l'excédent alimente le
Fonds de solidarité **uniquement à hauteur de son besoin de comblement**, le
reste part en réserve.

## 6. Journalisation comptable

`AccountingEntry.financialModelVersion` (index dédié) porte la version du
modèle ayant produit l'écriture. Les nouvelles écritures V2 sont tamponnées
`V2_MUTUAL` ; les écritures V1 existantes ne sont **jamais** réétiquetées.
Les audits sont filtrables par modèle (`V1`, `V2`, `ALL`).

## 7. Consolidation et agrégats

Il est **interdit d'additionner** des indicateurs V1 et V2 sans règles de
consolidation explicites (les deux modèles ne mesurent pas les mêmes
économies). Le dashboard admin affiche des compteurs **séparés** par modèle ;
les rapports mentionnent la version du modèle sur laquelle ils portent.

## 8. Permissions et audit

- Clé de permission : `financial-model.admin`
  (`PERMISSION_LABELS`, `DEFAULT_ROLE_PERMISSIONS.INSURANCE_MANAGER`,
  backfill SQL idempotent dans la migration `20260927_financial_model_versioning`).
- Toutes les routes `/admin/financial-models` mutations passent par
  `@RequirePermissions('financial-model.admin')` (SUPER_ADMIN bypass).
- Chaque transition écrit dans `AuditLog` avec justification, acteur et
  métadonnées JSON.

## 9. Alerte hebdomadaire de solvabilité V2

`apps/api/src/jobs/v2-solvency-alert.job.ts` — cron **lundi 07:00** (via
CronService) : recalcule la position consolidée V2 avec le moteur `cts-v2` et
notifie les gestionnaires actifs (`SUPER_ADMIN`, `INSURANCE_MANAGER`) si la
marge de solvabilité passe sous le seuil. Portefeuille vide = marge
indéterminée, jamais une fausse alerte.

Configuration (SystemConfig, modifiable via `POST /admin/config`) :

| Clé | Défaut | Rôle |
|-----|--------|------|
| `v2SolvencyAlert.enabled` | `true` | Active/désactive le contrôle |
| `v2SolvencyAlert.threshold` | `1` | Marge minimale (1 = 100 % des engagements) |

Déduplication hebdomadaire : le titre de la notification porte la semaine ISO
(ex. « … — 2026-S39 ») — une seule alerte par semaine tant que le seuil reste
franchi. Chaque alerte est journalisée dans l'audit (`V2_SOLVENCY_ALERT`,
meta : ratio, seuil, semaine, agrégats). Exécution manuelle :
`POST /admin/financial-models/run-solvency-check` (`financial-model.admin`).

### Historisation pluri-annuelle (table `V2SolvencySnapshot`)

À chaque exécution (breach ou non), le job persiste un point hebdomadaire dans
`V2SolvencySnapshot` — upsert par `weekKey` (semaine ISO) : re-exécuter la
même semaine rafraîchit le point au lieu d'empiler des doublons. Chaque point
porte le ratio, le seuil en vigueur, le flag breach, le nombre de contrats et
les flux cumulés.

Le graphique admin en profite : `portfolioSolvencySeries` préfixe la fenêtre
vivante (12 mois recalculés à la volée) par l'historique persisté antérieur
(un point par mois calendaire, plafond 48 mois → **60 mois au total**). Le
calcul redevient vivant dès que les flux de la fenêtre couvrent la période :
les points persistés de la fenêtre sont écartés pour ne jamais compter deux
fois. La courbe survit ainsi aux reconstructions de données et remonte sur
plusieurs années dès que le job a tourné quelques semaines.

## 10. Couverture de tests

Suite dédiée `apps/api/tests/financial/v2/` (13 fichiers) : cotisations,
charges, réserves, prestations, RBNS, IBNR, solvabilité, solidarité, résultats,
coexistence A=V1/B=V2 sans dépendance croisée, archivage READ_ONLY,
réactivation tracée, workflow de migration 7 phases. Tous les tests V1
préexistants (559) restent inchangés et verts.
