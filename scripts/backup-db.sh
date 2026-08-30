#!/usr/bin/env bash
set -euo pipefail
# Backup quotidien — pg_dump + rotation 7 jours
# Usage: DATABASE_URL=postgres://... ./scripts/backup-db.sh
# Cron: 0 2 * * * /app/scripts/backup-db.sh >> /var/log/backup.log 2>&1
: "${DATABASE_URL:?DATABASE_URL manquant}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/santeplus_$STAMP.sql.gz"
echo "[backup] dump -> $FILE"
pg_dump --no-owner --no-acl --clean --if-exists "$DATABASE_URL" | gzip -9 > "$FILE"
SIZE=$(du -h "$FILE" | cut -f1)
echo "[backup] OK $FILE ($SIZE)"
# Rotation
find "$BACKUP_DIR" -name "santeplus_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete || true
echo "[backup] rotation >${RETENTION_DAYS}j nettoyee"
# Optionnel: upload S3 si S3_BUCKET_BACKUP defini
if [[ -n "${S3_BUCKET_BACKUP:-}" && -n "${S3_ENDPOINT:-}" ]]; then
  echo "[backup] upload S3 $S3_BUCKET_BACKUP"
  aws s3 cp "$FILE" "s3://$S3_BUCKET_BACKUP/" --endpoint-url "$S3_ENDPOINT" || echo "[backup] S3 upload echoue (non bloquant)"
fi
