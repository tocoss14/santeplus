# Runbook sécurité Supabase — logs & post-incident (santeplus, `aqiidtdhfapginefvwgd`)

> Procédures opérationnelles pour le projet Supabase de prod (`aws-0-eu-west-1.pooler.supabase.com`).
> Complément de [RUNBOOK-CONTINUITE.md](RUNBOOK-CONTINUITE.md). Scripts de vérification :
> [audit-supabase-security.mjs](../scripts-dev/audit-supabase-security.mjs),
> [inspect-supabase-security.mjs](../scripts-dev/inspect-supabase-security.mjs),
> [fix-supabase-rls.mjs](../scripts-dev/fix-supabase-rls.mjs) (`--dry-run` disponible),
> [smoke-prisma-supabase.mjs](../scripts-dev/smoke-prisma-supabase.mjs).

---

## Partie 1 — Bascule des logs (procédure pas à pas)

### Pourquoi
État mesuré le 13/10/2026 : `log_connections=off`, `log_disconnections=off`, `log_min_duration_statement=-1`
(rien n'est journalisé). Le rôle `postgres` **ne peut pas** faire `ALTER SYSTEM` (pas superuser sur Supabase) :
seules les voies ci-dessous sont supportées. C'est aujourd'hui le principal angle mort de traçabilité.

### 1.1 Journaliser les connexions / déconnexions (Dashboard)
1. Dashboard Supabase → projet **santeplus** → **Database** → **Settings**.
2. Activer **Log connections** (bascule) ; déconnexions : via la Management API ou le CLI
   (pas de bascule SQL documentée) :
   ```bash
   # CLI (une fois installé : npm i -g supabase, puis supabase login)
   supabase postgres-config update --project-ref aqiidtdhfapginefvwgd --experimental \
     --config log_connections=true --config log_disconnections=true
   ```
   ou Management API (jeton personnel, voir §1.4) :
   ```bash
   curl -X PUT "https://api.supabase.com/v1/projects/aqiidtdhfapginefvwgd/config/database/postgres" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
     -d '{"log_connections": true}'
   ```

### 1.2 Journaliser les requêtes lentes (SQL Editor, au niveau du rôle)
SQL Editor du Dashboard :
```sql
-- Requêtes ≥ 1 s (suffisant en routine) :
ALTER ROLE "postgres" SET "log_min_duration_statement" TO '1s';

-- Option temporaire d'audit : tout journaliser (volume élevé, valeurs en clair !)
-- ALTER ROLE "postgres" SET "log_statement" TO 'all';

-- Vérification :
SHOW log_min_duration_statement;
SHOW log_connections;
SELECT rolname, rolconfig FROM pg_roles
WHERE rolname IN ('postgres','authenticator','anon','authenticated','service_role');
```
⚠️ **Portée** : `ALTER ROLE` s'applique aux sessions futures du rôle visé, pas à tout le projet.
⚠️ `log_statement='all'` expose les valeurs de requêtes (emails, tokens… en texte) dans les logs — à activer
ponctuellement, jamais en permanence.

### 1.3 Où lire les logs
- **Dashboard → Logs (Log Explorer)** : filtres par type/level/statut/chemin ; sans sélection de type, il
  interroge Postgres + API Gateway. Le filtre « User » ne marche pas pour les logs Postgres seuls.
- **Logs → Explorer → Run SQL**, source **Logs** (table ClickHouse `logs`) ; les requêtes PostgREST
  apparaissent en Postgres sous le rôle **`authenticator`** (pas `anon`) :
  ```sql
  SELECT timestamp,
         log_attributes['parsed.user_name'] AS user_name,
         log_attributes['parsed.query']     AS query,
         event_message
  FROM logs
  WHERE source = 'postgres_logs'
    AND log_attributes['parsed.user_name'] = 'authenticator'
  ORDER BY timestamp DESC LIMIT 100;
  ```
- **Rétention plan gratuit : 1 jour** (Pro 7 j, Team 28 j, Enterprise 90 j). En cas d'incident :
  **exporter/copier tout de suite** car le lendemain c'est perdu.

### 1.4 Jeton Management API (pour lints + config logs)
1. supabase.com → **Organisation → Personal access tokens** → Create token.
2. Lister les lints Security Advisor :
   ```bash
   curl "https://api.supabase.com/v1/projects/aqiidtdhfapginefvwgd/advisors/security" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
   ```
   (endpoint expérimental, scope `database:read` / permission `advisors_read`).
3. **Ne jamais stocker ce jeton dans le dépôt** — `.env.prod` gitignore sur la même ligne de conduite.

---

## Partie 2 — Checklist post-incident

À dérouler dans l'ordre ; cocher chaque étape. Les étapes SQL sont jouables via le
SQL Editor du Dashboard ou psql avec le `DATABASE_URL` de `.env.prod`.

### T1. Clore la faille (minutes)
- [ ] Identifier la source : session DB inhabituelle (§1.3 pour requêtes), appel PostgREST depuis l'extérieur avec une clé API ?
- [ ] **Faire tourner les identifiants suspects** :
      * clé `anon` / `service_role` : Dashboard → **Project Settings → API keys → Reveal/Rotate**
        (la rotation `anon` casse les clients publics qui l'utilisent — ici l'app n'utilise pas la Data API, donc immédiat et sans impact) ;
      * mot de passe DB : Dashboard → **Database → Settings → reset database password** ;
      * jeton access token si compromise → supprimer/regénérer dans l'organisation.
- [ ] **Dernier recours — faire cesser l'accès aux données** : le plan Free se met en pause automatiquement après inactivité ; pour une mise hors ligne immédiate, faire évaluer par le support Supabase ou sauvegarder puis laisser s'appliquer la pause.
- [ ] Bloquer les IP sources si possible (Dashboard → **Network → IP restrictions**, plan Pro requis) ;
      sinon l'exposition reste contenue par la posture RLS deny-by-default — vérifier les origines
      CORS dans **Project Settings → API**.

### T2. Mesurer l'exposition (30 min max)
- [ ] Logs : **télécharger d'abord** (rétention 1 j sur Free) — où aller : Dashboard → Logs, `source='postgres_logs'`,
      filtrer `authenticator` (PostgREST) et lookups sur `User`, `RefreshToken`, `Payment`, `PasswordResetToken`.
- [ ] Vérifier que les données chiffrées restent illisibles hors clé : `FIELD_ENCRYPTION_KEY` est devenue la
      protection réelle des données alphanumériques (nationalId, motifs médicaux) — elle ne doit jamais être
      stockée dans la base ou les logs, seulement dans les secrets Render.
- [ ] Compter et comparer : nombre de lignes de `AuditLog`, `RefreshToken`, `PasswordResetToken` vs un snapshot connu
      (compteurs de [smoke-prisma-supabase.mjs](../scripts-dev/smoke-prisma-supabase.mjs) : User, Contract, Payment).
- [ ] Si compromission de données personnelles confirmée (emails, dates de naissance, documents) :
      notification autorité de protection (RGPD/CNIL, délai 72 h) selon périmètre juridique applicable et
      préparation de la communication client — voir modèles de messagerie dans [RUNBOOK-CONTINUITE.md](RUNBOOK-CONTINUITE.md).

### T3. Détecter tout ce qui a pu céder (1 h)
- [ ] Jouer : `SELECT COUNT(*) FROM "User"` vs snapshot ; recherches sur `AuditLog` en filtrant par auteur ou action.
- [ ] **Rejouer les 4 verrous de posture** (état attendu = cible du 13/10/2026) :
  1. RLS sur toutes les tables :
     ```sql
     SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND relkind='r' AND NOT relrowsecurity;  -- attendu 0
     ```
  2. Aucun privilège Data API résiduel :
     ```sql
     SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema='public' AND grantee IN ('anon','authenticated')
       AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE');  -- attendu 0
     ```
  3. Aucune fonction/fonction `SECURITY DEFINER` dans `public` :
     ```sql
     SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public';  -- attendu 0 ligne
     ```
  4. Data API : `curl https://aqiidtdhfapginefvwgd.supabase.co/rest/v1/User?select=passwordHash&limit=1`
     avec une clé `anon` valide → s'il retourne des lignes, T1 n'a pas été fait correctement.
- [ ] Runtime : `node scripts-dev/audit-supabase-security.mjs` (sortie complète rôles/activité/extensions).
- [ ] Durcissement de l'organisation : activer le **MFA des membres** de l'organisation, révoquer les
      accès sans justification ; vérifier les connexions 48 dernières heures (Organisation → Members / Audit).

### T4. Vérifier les accès périphériques
- [ ] **Render** (API NestJS) : vérifier `DATABASE_URL`, `JWT_SECRET` (rotation = tous les JWT invalides →
      reconnexion de tous les utilisateurs, à planifier) ; relancer le service après rotation password DB.
- [ ] **Vercel** : rien ne doit être codé en dur côté front — vérifier qu'aucun secret DB
      ne s'y est glissé (Settings → Environment Variables).
- [ ] Vercel/Koyeb tokens : rotation si un canal d'incident est suspecté (valeurs dans `.env.prod`).
- [ ] Rejouer `prisma migrate deploy` (la table `_prisma_migrations` doit être intacte).

### T5. Conclure (day+1)
- [ ] Relire les lints : `GET /v1/projects/{ref}/advisors/security` (§1.4) — les lints `rls_disabled_in_public`
      et `sensitive_columns_exposed` doivent être résolus ; corriger tout lint **nouveau**.
- [ ] Post-mortem court : cause root, fenêtre d'exposition (timestamps logs T2), jeux de données touchés,
      personnes notifiées, correctifs validés (références aux scripts). Archiver dans ce dépôt
      (ex. docs/POSTMORTEM-YYYYMMDD.md) **sans aucune donnée réelle** (emails, id) dans le post-mortem.

---

## Références
- Config Postgres/LOG : <https://supabase.com/docs/guides/database/postgres/postgres-log-config>
- Logging connexions : <https://supabase.com/docs/guides/platform/postgres-connection-logging>
- Log Explorer & champs : <https://supabase.com/docs/guides/observability/logs> /
  <https://supabase.com/docs/guides/observability/log-field-reference>
- Requêtes SQL sur les logs (ClickHouse `logs`) : <https://supabase.com/docs/guides/observability/advanced-log-filtering>
- Security Advisor + API : <https://supabase.com/docs/guides/observability/advisors> /
  <https://supabase.com/docs/reference/api/v1-get-security-advisors>
- Reset password **postgres** : <https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB>
- Maintenance/pause Free : <https://supabase.com/docs/guides/platform/free-project-pausing>
- Rétention & quotas logs : <https://supabase.com/pricing>
