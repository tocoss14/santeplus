#!/bin/sh
set -e

echo "Resolving failed migrations (if any)..."
./node_modules/.bin/prisma migrate resolve --rolled-back "20260901_add_ged_rgpd" 2>/dev/null || true
./node_modules/.bin/prisma migrate resolve --rolled-back "20260901_add_act_branch" 2>/dev/null || true
./node_modules/.bin/prisma migrate resolve --rolled-back "20260901_add_compta_branch_disease" 2>/dev/null || true

echo "Waiting for database..."
until ./node_modules/.bin/prisma migrate deploy; do
  echo "Waiting for database to be ready..."
  sleep 2
done
echo "Migrate deploy done — syncing schema drift (db push)..."
./node_modules/.bin/prisma db push --accept-data-loss || echo "db push warning (non-fatal)"
echo "Migrations + db push applied. Checking if database needs seeding..."

# Use node to check user count (POSIX-compatible, no bashisms)
USER_COUNT=$(node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.user.count().then(c => { console.log(c); process.exit(0); }).catch(() => { console.log(0); process.exit(0); });
" 2>/dev/null || echo "0")

echo "User count: ${USER_COUNT}"

if [ "$USER_COUNT" = "0" ]; then
  echo "Database is empty — running seed..."
  npx tsx prisma/seed.ts && echo "Seed completed." || echo "Seed failed — continuing without seed data."
else
  echo "Database has ${USER_COUNT} users — skipping seed."
fi

echo "Starting application..."
exec node dist/main.js
