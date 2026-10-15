// Inspection (lecture seule) de la sécurité RLS de la base Supabase de prod.
// Usage : node scripts-dev/inspect-supabase-security.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envProd = readFileSync(path.join(here, '..', '.env.prod'), 'utf8');
const urlMatch = envProd.match(/^\s*DATABASE_URL="?([^"\r\n]+)"?/m);
if (!urlMatch) { console.error('DATABASE_URL introuvable dans .env.prod'); process.exit(1); }
const url = urlMatch[1];

const { PrismaClient } = await import(pathToFileURL(path.join(here, '..', 'apps', 'api', 'node_modules', '.prisma', 'client', 'index.js')).href);
const prisma = new PrismaClient({ datasources: { db: { url } } });

const q = (sql) => prisma.$queryRawUnsafe(sql);

try {
  const me = await q(`SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS rolsuper`);
  console.log('CONNEXION (rôle) :', JSON.stringify(me));

  const tables = await q(`
    select t.table_name,
           coalesce(c.relrowsecurity, false) as rls_enabled,
           pg_size_pretty(pg_total_relation_size('public.' || quote_ident(t.table_name))) as taille
    from information_schema.tables t
    join pg_class c on c.relname = t.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by t.table_name`);
  console.log('\nTABLES PUBLIC :');
  for (const t of tables) console.log(`  ${t.table_name.padEnd(28)} RLS=${t.rls_enabled ? 'ON ' : 'OFF'}  ${t.taille}`);

  const grants = await q(`
    select table_name, grantee, string_agg(distinct privilege_type, ',') privileges
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
    group by table_name, grantee
    order by table_name, grantee`);
  console.log('\nGRANTS Data API (anon/authenticated/service_role) :');
  for (const g of grants) console.log(`  ${g.table_name.padEnd(28)} ${g.grantee.padEnd(15)} ${g.privileges}`);

  const sensitive = await q(`
    select table_name, column_name, upper(udt_name) as type
    from information_schema.columns
    where table_schema = 'public'
      and (column_name ~ '(password|hash|secret|token|key|date_naissance|birth|ssn|nir)' or column_name ilike '%email%')
    order by table_name, column_name`);
  console.log('\nCOLONNES SENSIBLES/PII :');
  for (const c of sensitive) console.log(`  ${c.table_name.padEnd(28)} ${c.column_name.padEnd(30)} ${c.type}`);

  const policies = await q(`
    select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by tablename`);
  console.log('\nPOLICIES RLS :', policies.length === 0 ? 'aucune' : '');
  for (const p of policies) console.log(`  ${p.tablename} :: ${p.policyname} :: ${p.cmd} :: ${p.roles}`);
} finally {
  await prisma.$disconnect();
}
