# Post-mortem — [TITRE COURT : nature de l'incident, ex. « Exfiltration PII via Data API »]

> ⚠️ **Règle de rédaction** : **aucune donnée réelle** dans ce document — pas d'email, de numéro adhérent,
> de jeton, de hash, de contenu de fichier ni d'IP source. On note des *compteurs*, des *timestamps*, des
> *noms de table/colonne* et des proportions (%). Les extractions détaillées vont dans un document séparé,
> hors du dépôt (à côté de `.env.prod`, chiffré). Ce gabarit doit pouvoir être commité tel quel.
> Processus référencé : [SECURITE-SUPABASE-LOGS.md](SECURITE-SUPABASE-LOGS.md) — les phases T1–T5 ci-dessous
> pointent ses sections.

- **Projet** : santeplus (`aqiidtdhfapginefvwgd`, pooler `aws-0-eu-west-1`)
- **Statut** : BROUILLON / FINAL (rayer l'un ou l'autre)
- **Criticité** : SEV-1 / SEV-2 / SEV-3 (rayer) — **Périmètre** : Data API (PostgREST + clé anon) / accès DB direct / autre

---

## 1. Résumé pour la direction (5 lignes max)

| Champ | Valeur |
|---|---|
| Nature apparente | _ex. exfiltration de N lignes via PostgREST avec clé anon_ |
| Contenue ou étendue ? | _ex. contenue : RLS deny-by-default → 0 ligne exportée_ |
| Tables/colonnes touchées | _ex. `User.passwordHash` (bcrypt, jamais en clair), `RefreshToken` (N jetons)…_ |
| Notification requise ? | _oui/non — autorité (CNIL/RGPD 72 h) et/ou clients ; échéance calendée_ |
| Correctif principal appliqué | _ex. rotation clé anon ; mot de passe DB ; IP restrict ; pause projet_ |

## 2. Chronologie (UTC)

> Pour chaque étape : timestamp + fait observé + source (logs, script, ticket). Si un timestamp est estimé,
> le marquer explicitement avec `~`.

| Date/heure (UTC) | Événement | Source |
|---|---|---|
| AAAA-MM-JJ hh:mm | Premier signe (connexion/requête anormale) | `postgres_logs` via Log Explorer |
| AAAA-MM-JJ hh:mm | Détection (par quoi/par qui : lint, script, alerte, utilisateur) | — |
| AAAA-MM-JJ hh:mm | T1 : rotation clés anon/service | Dashboard API keys |
| AAAA-MM-JJ hh:mm | T1 : rotation mot de passe DB / mise hors ligne | Dashboard |
| AAAA-MM-JJ hh:mm | T2 : **export des logs** (rétention 1 j !) | copie chiffrée, hors dépôt |
| AAAA-MM-JJ hh:mm | T3 : vérifications de posture (`scripts-dev/*`) | exit/status des scripts |
| AAAA-MM-JJ hh:mm | Clôture partielle / rétabli service | — |

**Fenêtre d'exposition estimée** : de ___ à ___ (durée ___ ; si incomplète : écrire « au moins ___ »).

## 3. Cause racine

- **Mécanisme technique** (1–3 puces, précises) : _ex. table `X` sans RLS + grant anon SELECT avant le correctif
  du JJ-MM → tout lecteur disposant de la clé anon pouvait SELECT sans restriction_.
- **Pourquoi le Security Advisor ne l'a pas évitée** : _ex. lint détecté le JJ-MM mais non traité / scan pas encore passé_.
- **Facteurs organisationnels** (au-delà du technique) : _ex. revue de sécurité absente des PR, secrets partagés…_.

## 4. Ce qui s'est passé (factuel, sans hypothèse)

- **Données accessibles/affectées** (compteurs par table, jamais de contenu) :

  | Table | Compteur avant | Compteur après | Δ | Interprétation |
  |---|---|---|---|---|
  | `User` | | | | |
  | `RefreshToken` | | | | |
  | `PasswordResetToken` | | | | |
  | `Payment` | | | | |
  | `AuditLog` | | | | |

- **Volume / pattern API** : _nb de requêtes, nb d'IP distinctes, distribution temporelle — sans valeurs réelles_, d'après les logs.
- **Ce qui n'a PAS fuit** (tout ce qui a été vérifié intact — aussi important que le reste) :
  _ex. champs chiffrés (protégés par `FIELD_ENCRYPTION_KEY` hors base), fichiers R2, migrations `_prisma_migrations`_.

## 5. Impact

- **Personnes concernées (compteurs, pas listes)** : adhérents ___ / contacts entreprise ___ / prestataires ___.
- **PII exposées (types précis)** : _email ? nom ? birthDate ? hash de mot de passe ?_
- **Impact réglementaire** : autorité notifiée le ___ (délai 72 h respecté OUI/NON) ; clients notifiés le ___.
- **Impact fonctionnel de l'application** : _ex. interruption de X min (pause), sessions invalidées par rotation_.

## 6. Ce qui a marché / ce qui a manqué

- **✅ Bien passé** :
  - _ex. posture RLS deny-by-default déjà en place → 0 ligne exportée_ ;
  - scripts `scripts-dev/audit-supabase-security.mjs` et `smoke-prisma-supabase.mjs` rejoués en moins de X min.
- **❌ Manqué / en retard** :
  - _ex. logs DB pas encore activés → fenêtre d'exposition non observable précisément_ ;
  - rétention 1 j (plan Free) → export effectué le JJ à hh:mm, après coup.

## 7. Plan d'actions

> Chaque ligne : action | type | propriétaire | échéance | preuve attendue. Pas d'intention vague.

| # | Action | Type | Propriétaire | Échéance | Preuve |
|---|---|---|---|---|---|
| 1 | _ex. rotation `JWT_SECRET` (déconnexion forcée de tous les JWT)_ | préventif | | JJ-MM | _reconnexion générale observée_ |
| 2 | _ex. test e2e « garde de posture » (RLS/grants/fonctions publiques)_ | détectif | | JJ-MM | _rouge si une table redevient accessible via anon_ |
| 3 | _ex. logs Database activés + export quotidien_ | détectif | | JJ-MM | _`SHOW log_connections` = on_ |
| 4 | _ex. MFA organisation pour tous les membres_ | préventif | | JJ-MM | _rappel au prochain audit_ |

## 8. Leçons tirées (3–5 maximum)

> Format canonique : « À l'avenir, nous ___, car ___. » Sans accusation nominale ; le « nous » est collectif.

1. À l'avenir, nous **vérifierons l'état de posture de la base en CI** (RLS, grants, fonctions publiques), car une
   dérive silencieuse a permis ___.
2. À l'avenir, nous **activerons et exporterons les logs DB avant toute action**, car la rétention de 1 jour ___.
3. À l'avenir, nous ___.

## 9. Approbation

| Rôle | Nom / fonction | Date | OK |
|---|---|---|---|
| Rédacteur | | | |
| Relecteur | | | |
| Décideur (publication / notification) | | | |
