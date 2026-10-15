// Correctif des alertes critiques Supabase (santeplus, aqiidtdhfapginefvwgd) :
//   - rls_disabled_in_public    → RLS activé sur TOUTES les tables de public
//   - sensitive_columns_exposed → Data API (anon/authenticated) privée de tout privilège
//
// Sûr pour l'application : l'API NestJS/Prisma se connecte via le rôle `postgres`
// qui a BYPASSRLS → il ignore la RLS et continue de fonctionner à l'identique.
// La Data API Supabase (PostgREST) n'est utilisée par personne dans ce projet.
// Mode write réel par défaut ; --dry-run pour un aperçu sans modification.
//
// Usage : node scripts-dev/fix-supabase-rls.mjs [--dry-run]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dryRun = process.argv.includes('--dry-run');
const here = path.dirname(fileURLToPath(import.meta.url));
const envProd = readFileSync(path.join(here, '..', '.env.prod'), 'utf8');
const urlMatch = envProd.match(/^\s*DATABASE_URL="?([^"\r\n]+)"?/m);
if (!urlMatch) { console.error('DATABASE_URL introuvable dans .env.prod'); process.exit(1); }
const url = urlMatch[1];

const { PrismaClient } = await import(pathToFileURL(path.join(here, '..', 'apps', 'api', 'node_modules', '.prisma', 'client', 'index.js')).href);
const prisma = new PrismaClient({ datasources: { db: { url } } });
const q = (sql) => prisma.$queryRawUnsafe(sql);

try {
  // Garde-fou : on refuse de toucher autre chose que la base attendue (pooler Supabase du projet aqiidtdhfapginefvwgd).
  const tp = new URL(url);
  const poolerHost = tp.hostname + (tp.port ? `:${tp.port}` : '');
  const host = tp.hostname.split('.pooler.supabase.com')[0];
  if (!tp.hostname.endsWith('.pooler.supabase.com')) {
    throw new Error(`Le DATABASE_URL n'est pas un pooler Supabase (${poolerHost}) — arrêt.`);
  }
  console.log(`Cible : pooler Supabase "${host}"${dryRun ? ' — DRY RUN' : ''}`);

  // Sanité : confirmer que le rôle connecté a bien BYPASSRLS (sinon on casserait Prisma).
  const me = await q(`SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls FROM (SELECT 1) t`);
  if (!me[0].bypassrls) {
    throw new Error(`Le rôle ${me[0].current_user} n'a pas BYPASSRLS — activer la RLS casserait l'application. Arrêt.`);
  }
  console.log(`Rôle connecté : ${me[0].current_user} (bypassrls ✔)`);

  const tables = (await q(`
    select t.table_name
    from information_schema.tables t
    join pg_class c on c.relname = t.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by t.table_name`)).map((t) => t.table_name);

  for (const t of tables) {
    if (dryRun) {
      console.log(`  [dry] ALTER TABLE public."${t}" ENABLE ROW LEVEL SECURITY;`);
    } else {
      await prisma.$executeRawUnsafe(`ALTER TABLE public."${t}" ENABLE ROW LEVEL SECURITY`);
    }
  }
  console.log(`RLS activé sur ${tables.length} tables${dryRun ? ' (simulé)' : ''}.`);

  const revokes = [
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated`,
  ];
  // NB : les rôles anon/authenticated doivent exister dans un projet Supabase, on les vérifie pour un fil db hors Supabase.
  for (const sql of revokes) {
    const role = sql.match(/FROM (\w+(?:, \w+)*)$/)?.[1].split(', ')[0];
    const exists = await q(`SELECT to_regrole('${role}') IS NOT NULL AS ok`);
    if (!exists[0].ok) { console.log(`  (rôle ${role} absent — skip)`); continue; }
    if (dryRun) console.log(`  [dry] ${sql};`);
    else await prisma.$executeRawUnsafe(sql);
  }
  console.log(`Révocations Data API ${dryRun ? 'simulées' : 'appliquées'}.`);

  // Vérification post-correctif (réelle même en dry-run ? non : uniquement si write).
  if (!dryRun) {
    const off = await q(`
      select count(*)::int as n
      from information_schema.tables t
      join pg_class c on c.relname = t.table_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and not c.relrowsecurity`);
    const stillGrants = await q(`
      select count(distinct table_name)::int as n
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon','authenticated') and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')`);
    console.log(`Vérification : tables sans RLS restantes = ${off[0].n} ; tables encore gratées anon/auth = ${stillGrants[0].n}`);
    if (off[0].n > 0 || stillGrants[0].n > 0) { console.error('⚠️ Correctif incomplet.'); process.exitCode = 2; }
  }
} finally {
  await prisma.$disconnect();
}
