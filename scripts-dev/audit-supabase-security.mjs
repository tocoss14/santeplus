// Audit sécurité Supabase (partie DB) — lecture seule, via le pooler du projet.
// Usage : node scripts-dev/audit-supabase-security.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = readFileSync(path.join(here, '..', '.env.prod'), 'utf8').match(/^\s*DATABASE_URL="?([^"\r\n]+)"?/m)?.[1];

const { PrismaClient } = await import(pathToFileURL(path.join(here, '..', 'apps', 'api', 'node_modules', '.prisma', 'client', 'index.js')).href);
const prisma = new PrismaClient({ datasources: { db: { url } } });
const q = (sql) => prisma.$queryRawUnsafe(sql).catch((e) => [{ erreur: e.message.split('\n')[0] }]);

try {
  console.log('=== RÔLES ===');
  const roles = await q(`
    select r.rolname, r.rolsuper, r.rolbypassrls, r.rolcanlogin, r.rolreplication,
           r.rolconnlimit, r.rolvaliduntil::text as valid_until
    from pg_roles r
    where r.rolname not like 'pg\\_%'
    order by r.rolsuper desc, r.rolbypassrls desc, r.rolcanlogin desc, r.rolname`);
  console.log(JSON.stringify(roles, null, 1));

  console.log('=== ACTIVITÉ (sessions groupées par rôle, 60 dernières minutes) ===');
  const activity = await q(`
    select usename, application_name, coalesce(client_addr::text, 'local') as client,
           count(*)::int as sessions, max(query_start)::text as last_query_start
    from pg_stat_activity
    where datname is not null and query_start > now() - interval '60 minutes'
    group by 1, 2, 3
    order by max(query_start) desc
    limit 25`);
  console.log(JSON.stringify(activity, null, 1));

  console.log('=== POSTURE SCHÉMA public ===');
  const owners = await q(`
    select pg_get_userbyid(c.relowner) as owner, count(*)::int as objets
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','S')
    group by 1`);
  console.log(JSON.stringify(owners));

  console.log('=== FONCTIONS public (SECURITY DEFINER signalées) ===');
  const fns = await q(`
    select p.proname, p.prosecdef as secdef, pg_get_userbyid(p.proowner) as owner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.prosecdef desc, p.proname`);
  console.log(JSON.stringify(fns));

  console.log('=== EXTENSIONS ===');
  const exts = await q(`select extname, extversion from pg_extension order by extname`);
  console.log(JSON.stringify(exts));

  console.log('=== POLICIES (résumé) ===');
  const pol = await q(`select count(*)::int as nb from pg_policies where schemaname = 'public'`);
  console.log(JSON.stringify(pol));

  console.log('=== DOSSIERS postgres (postgres_role contextuel) ===');
  const ctx = await q(`select current_setting('request.jwt.claim.sub', true) as jwt_sub, inet_client_addr()::text as client_ip`);
  console.log(JSON.stringify(ctx));

  console.log('=== SETTINGS LOG VISIBLES ===');
  const cfg = await q(`select name, setting from pg_settings where name in ('log_min_duration_statement','log_statement','log_connections','log_disconnections','track_activity_query_size')`);
  console.log(JSON.stringify(cfg));
} finally {
  await prisma.$disconnect();
}
