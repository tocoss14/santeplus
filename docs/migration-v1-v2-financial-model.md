# Migration contrôlée d'un contrat : V1_LEGACY → V2_MUTUAL

> Procédure opérationnelle de migration d'un contrat individuel ou collectif du
> modèle financier V1 vers V2. Le référentiel technique complet est dans
> [financial-model-versioning.md](./financial-model-versioning.md).

## 1. Garanties

- **Volontaire** : aucune migration automatique. Le contrat bascule
  uniquement après les 7 phases complètes.
- **Traçable** : chaque phase écrit dans `FinancialModelMigration`
  (status, analysis, snapshot, verification) et l'étape de certification
  écrit dans `AuditLog` (`FINANCIAL_MODEL_MIGRATION_CERTIFIED`).
- **Réversible par preuve** : le snapshot complet pris en phase SNAPSHOT
  constitue l'état de référence intact du contrat avant bascule. Il n'est
  jamais réécrit.
- **Sans réétiquetage rétroactif** : la migration ne modifie **aucune
  écriture** (contributions, sinistres, journal CTS, appels de fonds).
  Elle change uniquement le rattachement du contrat
  (`financialModelVersionId`) et son `migrationStatus`.

## 2. Les 7 phases

| # | Phase           | Effet                                                                                   |
|---|-----------------|-----------------------------------------------------------------------------------------|
| 1 | `ANALYSIS`      | Création du dossier de migration (contrat, versions from/to, créateur)                   |
| 2 | `PREVIEW`       | Collecte des données du contrat + écarts de règles V1↔V2 (analyse JSON)                  |
| 3 | `VALIDATION`    | Contrôle humain de l'analyse                                                             |
| 4 | `SNAPSHOT`      | **Snapshot complet figé** : contrat, contributions, sinistres, journal CTS, appels fonds |
| 5 | `MIGRATION`     | Point de bascule unique : `financialModelVersionId → V2`, `migrationStatus = MIGRATION_PENDING` |
| 6 | `VERIFICATION`  | Contrôles post-migration vs snapshot (écritures intactes, contrat sur V2)                 |
| 7 | `CERTIFICATION` | Clôture : `MIGRATION_PENDING → MIGRATED_TO_V2`, horodatage `certifiedAt`, écriture audit |

Sécurités :

- `MIGRATION` est **impossible sans snapshot** (refus explicite).
- `CERTIFICATION` est **impossible si `VERIFICATION.ok = false`**.
- Après `CERTIFICATION`, toute nouvelle avance est refusée.

## 3. Comment migrer un contrat

Chaque appel avance d'**une** phase :

```bash
curl -X POST http://localhost:4100/api/admin/financial-models/migrations/advance \
  -H "Authorization: Bearer $TOKEN" -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"contractId":"<CONTRACT_ID>"}'
```

Répéter 7 fois (une par phase). Suivre l'avancement :

```bash
curl "http://localhost:4100/api/admin/financial-models/migrations?contractId=<CONTRACT_ID>" \
  -H "Authorization: Bearer $TOKEN"
```

Habilitations requises : `financial-model.admin`
(`INSURANCE_MANAGER` ou `SUPER_ADMIN`).

## 4. Valeurs de `Contract.migrationStatus`

- `NULL` — contrat créé directement sous son modèle (cas général).
- `MIGRATION_PENDING` — bascule effectuée, en attente de certification.
- `MIGRATED_TO_V2` — migration certifiée.

## 5. Ce que la migration ne fait pas

- Elle ne recalcule **aucune position ni résultat historique**.
- Elle ne convertit **aucune cotisation, appel de fonds ou crédit de
  renouvellement** V1 en équivalent V2.
- Elle ne réétiquette **aucune écriture comptable** : les écritures passées
  restent rattachées à V1, les futures relèveront de V2.

## 6. Couverture de tests

`apps/api/tests/financial/v2/migration-workflow.spec.ts` vérifie : la séquence
exacte des 7 phases, le refus de `MIGRATION` sans snapshot, la bascule du
contrat uniquement en phase 5, la vérification vs snapshot (succès et échec),
la certification avec journal d'audit.
