#!/bin/sh
set -e

echo "Waiting for database..."
until ./node_modules/.bin/prisma migrate deploy 2>/dev/null; do
  echo "Waiting for database to be ready..."
  sleep 2
done

echo "Migrations applied. Checking if database needs seeding..."

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
