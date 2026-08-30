# Sauvegarde & Reprise — SantéPlus

## Principe
- **Quotidien** `pg_dump --clean --if-exists` compressé `gzip -9`, rotation 7 jours, upload optionnel S3.
- **Restauration** testée en 1 commande.

## Scripts
- `scripts/backup-db.sh` — dump `DATABASE_URL` → `backups/santeplus_YYYYMMDD_HHMMSS.sql.gz`
- `scripts/restore-db.sh` — restore `--latest` ou fichier donné

## Cron prod (Fly.io / Render)
```cron
0 2 * * * /app/scripts/backup-db.sh >> /var/log/backup.log 2>&1
```
Variables : `DATABASE_URL` (obligatoire), `BACKUP_DIR` (défaut `./backups`), `RETENTION_DAYS=7`, `S3_BUCKET_BACKUP` + `S3_ENDPOINT` si offsite.

## Test de reprise (à faire 1×/mois)
```bash
# 1. Backup manuel
DATABASE_URL=postgres://... ./scripts/backup-db.sh
# 2. Restore sur base de staging
DATABASE_URL=postgres://staging ./scripts/restore-db.sh --latest
# 3. Verif
psql $DATABASE_URL -c "SELECT status, count(*) FROM \"Contract\" GROUP BY status;"
# 4. Idempotence migrations (shadow DB non requise)
npx prisma migrate deploy  # doit afficher "No pending migrations"
# Si colonne déjà existante (ex: adhesionFee), marquer:
npx prisma migrate resolve --applied 20260831_add_adhesion_fees
```

## Entrypoint idempotent
`apps/api/entrypoint.sh` fait `prisma migrate deploy || prisma db push --accept-data-loss` pour les environnements sans droit `CREATE DATABASE` (shadow DB).

## RPO/RTO
- RPO 24h (dump quotidien), RTO ~15 min (gunzip + psql + `prisma generate`).
- Stocker 1 dump/mois offsite (S3) pour rétention longue.
