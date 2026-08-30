#!/bin/sh
set -e

echo "Waiting for database..."
until npx prisma migrate deploy; do
  echo "Waiting for database to be ready..."
  sleep 2
done

echo "Checking if database needs seeding..."
# Check if users table is empty (meaning seed hasn't run)
USER_COUNT=$(npx prisma db execute --stdin <<< "SELECT COUNT(*)::int FROM \"User\"" 2>/dev/null | grep -o '[0-9]*' | head -1 || echo "0")

if [ "$USER_COUNT" = "0" ] 2>/dev/null || [ -z "$USER_COUNT" ]; then
  echo "Database is empty — running seed..."
  npx tsx prisma/seed.ts || echo "Seed failed or already seeded, continuing..."
else
  echo "Database already has $USER_COUNT users — skipping seed."
fi

echo "Starting application..."
exec node dist/main.js
