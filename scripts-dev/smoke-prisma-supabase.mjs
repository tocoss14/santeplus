// Smoke test : avec la RLS activée, la lecture applicative Prisma (rôle postgres,
// BYPASSRLS) doit toujours retourner les vraies données.
// Usage : node scripts-dev/smoke-prisma-supabase.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = readFileSync(path.join(here, '..', '.env.prod'), 'utf8').match(/^\s*DATABASE_URL="?([^"\r\n]+)"?/m)?.[1];

const { PrismaClient } = await import(pathToFileURL(path.join(here, '..', 'apps', 'api', 'node_modules', '.prisma', 'client', 'index.js')).href);
const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  const [users, contracts, payments, refresh] = await Promise.all([
    prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "User"'),
    prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "Contract"'),
    prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "Payment"'),
    prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "RefreshToken"'),
  ]);
  console.log('Lecture applicative OK :', JSON.stringify({
    User: users[0].n, Contract: contracts[0].n, Payment: payments[0].n, RefreshToken: refresh[0].n,
  }));
} finally {
  await prisma.$disconnect();
}
