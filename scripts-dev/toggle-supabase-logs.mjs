// Partie 1 du runbook docs/SECURITE-SUPABASE-LOGS.md — bascule des logs Supabase.
// Lit le jeton Management API depuis ~/env.prod (JAMAIS affiché).
// Étapes : test jeton -> PUT log_connections/log_disconnections -> GET relecture
//          -> ALTER ROLE log_min_duration_statement via Prisma -> contrôle SQL.
// Usage : node scripts-dev/toggle-supabase-logs.mjs [--check]   (--check : lecture seule)
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const checkOnly = process.argv.includes('--check');
const TOKEN = (readFileSync(path.join(os.homedir(), 'env.prod'), 'utf8').match(/^\s*SUPABASE_ACCESS_TOKEN=(\S+)\s*$/m) || [])[1];
if (!TOKEN) { console.error('⛔ jeton absent/vide dans ~/env.prod'); process.exit(1); }

const REF = 'aqiidtdhfapginefvwgd';
const api = (pathUrl, opts = {}) =>
  fetch(`https://api.supabase.com/v1/projects/${REF}${pathUrl}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });

// 1) Diagnostic : configuration actuelle (GET) — le jeton est invalide → 401 ici.
const initial = await api('/config/database/postgres');
console.log(`API Management : GET config/database/postgres -> ${initial.status}`);
if (!initial.ok) { console.error(`⛔ jeton refusé (${initial.status}) — vérifier la valeur sbp_ dans ~/env.prod`); process.exit(1); }

const before = await initial.json();
console.log('Actuellement :', JSON.stringify({
  log_connections: before.log_connections ?? '?',
  log_disconnections: before.log_disconnections ?? '?',
}));

if (!checkOnly) {
  // 2) Bascule : un seul PUT pour les deux réglages (idempotent, dérollable via false).
  for (const [key] of [['log_connections'], ['log_disconnections']]) {
    const put = await api('/config/database/postgres', {
      method: 'PUT',
      body: JSON.stringify({ [key]: true }),
    });
    console.log(`PUT ${key}:true -> ${put.status}`);
    if (!put.ok) {
      console.error(`⛔ échec ${key} (${put.status}) : ${JSON.stringify(await put.json().catch(() => ({})))}`);
      process.exit(2);
    }
  }
}

// 3) Relecture d'état après opération.
const after = await api('/config/database/postgres');
const cfg = await after.json();
console.log('API renvoie : log_connections =', cfg.log_connections, '| log_disconnections =', cfg.log_disconnections);

// 4) SQL : log_min_duration_statement au niveau du rôle postgres (canal Prisma).
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const prismaRef = path.resolve(here, '..', 'apps', 'api', 'node_modules', '.prisma', 'client', 'index.js').replace(/\\/g, '/');
const { PrismaClient } = await import(`file://${prismaRef}`);
const dbUrl = readFileSync(path.resolve(here, '..', '.env.prod'), 'utf8').match(/^\s*DATABASE_URL="?([^"\r\n]+)"?/m)[1];
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
try {
  if (!checkOnly) await prisma.$executeRawUnsafe(`ALTER ROLE "postgres" SET "log_min_duration_statement" TO '1s'`);
  const cfgRole = await prisma.$queryRawUnsafe(`SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('postgres','authenticator') ORDER BY rolname`);
  console.log('SQL pg_roles.rolconfig :', JSON.stringify(cfgRole));
  const shown = await prisma.$queryRawUnsafe(`SHOW log_min_duration_statement`);
  console.log('SHOW log_min_duration_statement (session POSTGRES) :', JSON.stringify(shown));
} finally {
  await prisma.$disconnect();
}
console.log(checkOnly ? '--check terminé (aucune modification)' : '✅ Bascule appliquée');
