#!/bin/sh
set -e

echo "Waiting for database..."
until npx prisma migrate deploy; do
  echo "Waiting for database to be ready..."
  sleep 2
done

echo "Starting application..."
exec node dist/main.js