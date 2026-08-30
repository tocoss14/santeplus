#!/usr/bin/env bash
set -euo pipefail
# Restore — test de reprise
# Usage: DATABASE_URL=postgres://... ./scripts/restore-db.sh backups/santeplus_20260831.sql.gz
# ou:    ./scripts/restore-db.sh --latest
: "${DATABASE_URL:?DATABASE_URL manquant}"
FILE="${1:-}"
if [[ "$FILE" == "--latest" ]]; then
  FILE=$(ls -t backups/santeplus_*.sql.gz 2>/dev/null | head -1)
fi
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Fichier introuvable: $FILE" >&2
  echo "Usage: $0 <dump.sql.gz> | --latest" >&2
  exit 1
fi
echo "[restore] $FILE -> $DATABASE_URL"
echo "[restore] ATTENTION: ecrase la base ! Ctrl+C pour annuler (5s)"
sleep 5
gunzip -c "$FILE" | psql "$DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1
echo "[restore] OK — verif"
psql "$DATABASE_URL" -c "SELECT count(*) as users FROM \"User\"; SELECT count(*) as contracts FROM \"Contract\";"
echo "[restore] Termine — relancer: npx prisma generate (si schema change)"
