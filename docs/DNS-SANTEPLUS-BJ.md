# Configuration DNS — santeplus.bj → santeplus.pages.dev

**Réf. DNS-SANTEPLUS-BJ-001 — 2026-10-08**
Objectif : faire servir l'application SantéPlus sur **https://santeplus.bj** (et https://www.santeplus.bj),
via le projet Cloudflare Pages qui sert déjà https://santeplus.pages.dev.

---

## 1. État constaté ce jour (mesures réelles)

| Contrôle | Commande | Résultat du 2026-10-08 |
|---|---|---|
| Résolution santeplus.bj | `nslookup santeplus.bj 8.8.8.8` | **NXDOMAIN** (« Non-existent domain ») |
| Idem côté autoritatif .bj | `nslookup -norecurse santeplus.bj ns1.nic.bj` (et pch.nic.bj) | **NXDOMAIN** — le nom n'est ni délégué, ni apparemment enregistré |
| Serveurs NS du TLD .bj | `nslookup -type=NS bj 8.8.8.8` | `pch.nic.bj`, `ns-bj.nic.fr`, `ns-bj.afrinic.net`, `ns1.nic.bj`, `ns2.nic.bj` |
| Résolution santeplus.pages.dev | `nslookup santeplus.pages.dev 8.8.8.8` | `188.114.96.2`, `188.114.97.2`, `2a06:98c1:3120::2`, `2a06:98c1:3121::2` (IPs anycast Cloudflare ; le résolveur local renvoie `.5`/`::5`, même plage) |
| Zone de pages.dev | `nslookup -type=CNAME santeplus.pages.dev 8.8.8.8` | Déléguée à **Cloudflare** (`bonnie.ns.cloudflare.com`) |
| Front | `curl -sI https://santeplus.pages.dev` | `200`, `Server: cloudflare`, `CF-RAY` |
| API | `curl -s https://santeplus-api-kp5t.onrender.com/api/health` | `200` `{"status":"ok","storage":"object"}` (→ `/health` sans préfixe = 404) |
| CORS API — origine actuelle | `curl -sI -H "Origin: https://santeplus.pages.dev" …/api/health` | `access-control-allow-origin: https://santeplus.pages.dev` ✔ |
| CORS API — nouvelle origine | `curl -sI -H "Origin: https://santeplus.bj" …/api/health` | **pas de header** → à corriger sur Render (§5) |

**Conséquence — étape 0 obligatoire :** il faut d'abord **enregistrer le domaine `santeplus.bj`** auprès
d'un registrar .bj accrédité (Afriregister Bénin, ou agrégateur type Marcaria/Netim/Domgate ; pièces
d'identité demandées, délais possibles de l'ordre de 1 à 2 semaines). Tant que `nslookup` renvoie
NXDOMAIN, aucun enregistrement DNS ne peut être publié.

---

## 2. Choisir l'option A ou B

| | Option A — zone Cloudflare complète **(recommandée)** | Option B — DNS chez un autre registrar |
|---|---|---|
| **apex `santeplus.bj` (sans www)** | ✔ possible (CNAME flattening) | ✘ **impossible** — la doc Cloudflare impose les NS Cloudflare pour un apex |
| `www.santeplus.bj` | ✔ | ✔ (CNAME simple) |
| Protection/CDN Cloudflare | ✔ | seulement via « partial zone » (CNAME setup + enregistrement TXT de vérification) |
| Complexité | NS à changer chez le registrar (1 fois) | aucun changement de NS |

Source : doc officielle Cloudflare *Custom domains* — « To use a custom apex domain … configure your
nameservers to point to Cloudflare's nameservers » et « it is not necessary for your site to be a
Cloudflare zone » **uniquement pour un sous-domaine**.

→ **Option A ci-dessous.** L'option B est décrite en §4 en secours.

---

## 3. Option A — configuration exacte, pas à pas

### 3.1 Enregistrement du domaine (registrar .bj)
1. Vérifier la disponibilité puis enregistrer `santeplus.bj` chez un registrar accrédité .bj.
2. Conserver le login registrar : c'est là que se feront les NS.

### 3.2 Zone Cloudflare
1. Dashboard Cloudflare → **Add a site** → `santeplus.bj` → plan **Free**.
2. Cloudflare affiche **2 noms de serveurs attribués** (forme `<a>.ns.cloudflare.com` / `<b>.ns.cloudflare.com`).
   ⚠️ Ce sont **ces valeurs-là** (et pas d'autres) qu'il faut utiliser.
3. Sur le registrar .bj → remplacer les NS du domaine par les 2 NS Cloudflare.
4. Retour dashboard : attendre le statut **Active** (vérification automatique, de 5 min à 24 h).

### 3.3 Associer le domaine au projet Pages
Dashboard Cloudflare → **Workers & Pages** → projet **santeplus** (celui qui publie
`santeplus.pages.dev`) → onglet **Custom domains** → **Set up a domain** → saisir puis valider :
- `santeplus.bj`
- `www.santeplus.bj` (répéter l'opération)

> ⚠️ Il faut passer par cet écran **avant** de créer les enregistrements : un CNAME créé « à la main »
> sans association préalable donne une erreur **522** (doc officielle Cloudflare).

### 3.4 Enregistrements DNS attendus — état final exact

Si le domaine est déjà sur Cloudflare, les 2 lignes sont créées **automatiquement** par l'étape 3.3 ;
sinon les créer manuellement dans **DNS → Records** :

| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| `CNAME` | `@` (apex) | `santeplus.pages.dev` | **Proxied** (orange — aplati par le CNAME flattening Cloudflare) |
| `CNAME` | `www` | `santeplus.pages.dev` | **Proxied** (orange) |

Aucune autre ligne n'est nécessaire (pas de MX à créer tant que la messagerie n'est pas branchée).

### 3.5 Réglages SSL/TLS (dashboard Cloudflare, zone santeplus.bj)
1. **SSL/TLS → Overview** : mode **Full (strict)**.
2. **SSL/TLS → Edge Certificates** :
   - **Always Use HTTPS** → *On*
   - **Automatic HTTPS Rewrites** → *On*
   - Minimum TLS version → 1.2 (1.3 si dispo)
3. **HSTS** : **ne pas l'activer dans un premier temps** (verrouillage difficile à annuler ; à activer
   seulement après une semaine sans anomalie).
4. **CAA** : uniquement si la zone contient déjà des enregistrements CAA, autoriser Let's Encrypt
   (certificats Pages) :
   ```
   @    300    IN    CAA    0    issue "letsencrypt.org"
   ```

### 3.6 Retombées applicatives — OBLIGATOIRE (Render)

L'API NestJS dérive **tout** son CORS **et** son anti-CSRF de `WEB_ORIGIN` / `APP_URL`
(`apps/api/src/config.ts:9-10`, `apps/api/src/main.ts:93` et `:115-116`) sous forme de **liste
séparée par virgules**. Sans mise à jour, chaque appel depuis `https://santeplus.bj` sera refusé
(403 « Origine non autorisée ») — c'est déjà mesurable (§1, dernière ligne).

Sur **Render → service API → Environment** (`WEB_ORIGIN` est en `sync:false` dans `render.yaml` →
modification **manuelle**, pas de commit) :

```
WEB_ORIGIN=https://santeplus.pages.dev,https://santeplus.bj
APP_URL=https://santeplus.pages.dev,https://santeplus.bj
```

(`APP_URL` : à adapter seulement si elle est définie aujourd'hui — sinon la valeur par défaut suit
`WEB_ORIGIN`.) Render redémarre l'API (~1 min, cf. RUNBOOK §4).

Vérification après redémarrage :

```bash
curl -sI -H "Origin: https://santeplus.bj" https://santeplus-api-kp5t.onrender.com/api/health \
  | grep -i access-control-allow-origin
# attendu : access-control-allow-origin: https://santeplus.bj
```

### 3.7 Côté front — aucun rebuild nécessaire
`API_BASE` du front est figé à la build via `VITE_API_URL` (`apps/web/src/api.ts`, `DEPLOY_FREE.md`) :
c'est une URL absolue vers l'API Render, indépendante de l'origine du navigateur. Le build publié sur
Pages fonctionne donc **tel quel** sur `santeplus.bj`. (Vérifier au passage que le build de production
**a bien défini `VITE_API_URL`** — c'est ce qui fait fonctionner `santeplus.pages.dev` aujourd'hui.)

---

## 4. Option B — en secours (DNS hors Cloudflare, sous-domaine uniquement)

Si la zone ne peut pas être transférée sur Cloudflare :

1. **D'abord** associer `www.santeplus.bj` dans Workers & Pages → Custom domains → *Set up a domain* (cf. §3.3).
2. Puis, chez le DNS provider, créer **exactement** :

| Type | Nom | Contenu |
|---|---|---|
| `CNAME` | `www` | `santeplus.pages.dev` |

3. L'**apex `santeplus.bj` restera introuvable** : à compenser par une page d'accueil chez le
   registrar (redirection) ou par un enregistrement A vers un hébergement qui renvoie vers `www`.
4. Pour HTTPS + proxy, la zone partielle (« CNAME setup ») ajoute un TXT de vérification Cloudflare
   `_cf-custom-domain.<nom>` — valeurs fournies par le dashboard.

---

## 5. Commandes de vérification (Git Bash / terminal, copier-coller)

> **Ctrl unique recommandé :** `./scripts-dev/check-santeplus-bj.sh` — vérifie DNS + HTTPS + CORS
> en une passe et répond « tout est en place ? » (`exit 0` = oui, `exit 1` = non, chaque échec
> renvoie vers la section concernée de ce document). Options : domaine en 1er argument,
> `NO_WWW=1` pour une zone sans sous-domaine www. Les commandes manuelles ci-dessous restent
> valables pour un diagnostic ciblé.

```bash
# 1. NS délégués (attendu : les 2 NS Cloudflare)
nslookup -type=NS santeplus.bj 8.8.8.8

# 2. Apex et www résolvent (attendu : IPs anycast Cloudflare)
nslookup santeplus.bj 8.8.8.8
nslookup www.santeplus.bj 8.8.8.8

# 3. HTTPS 200 derrière Cloudflare
curl -sI https://santeplus.bj | head -5        # attendu : HTTP/2 200, server: cloudflare
curl -sI https://www.santeplus.bj | head -5

# 4. Redirection HTTP → HTTPS (Always Use HTTPS)
curl -sI http://santeplus.bj | head -3         # attendu : 301/308 vers https://

# 5. Certificat
curl -svI https://santeplus.bj 2>&1 | grep -E "subject:|issuer:"

# 6. CORS API pour la nouvelle origine (après §3.6)
curl -sI -H "Origin: https://santeplus.bj" https://santeplus-api-kp5t.onrender.com/api/health \
  | grep -i access-control-allow-origin        # attendu : https://santeplus.bj

# 7. Contrôle réciproque : origine inconnue toujours refusée
curl -sI -H "Origin: https://evil.example" https://santeplus-api-kp5t.onrender.com/api/health \
  | grep -i access-control-allow-origin || echo "OK — pas d'ACAO"
```

**Test final humain** : ouvrir `https://santeplus.bj` dans un navigateur, se connecter, vérifier
zéro erreur console (CORS/COEP), charger une image (carte/réseau) et faire un upload.

---

## 6. Délais de propagation

| Étape | Délai typique |
|---|---|
| Enregistrement .bj chez le registrar | jours à ~2 semaines (validation du registrant) |
| Changement de NS vers Cloudflare | 1 h → 48 h (TTL du parent .bj) |
| Enregistrements DNS une fois zone Active | minutes |
| Certificat HTTPS Pages | automatique, minutes |
| Mise à jour `WEB_ORIGIN` sur Render | ~1 min (redémarrage) |

---

## 7. Rollback (si ça dégrade)

1. **Le front `santeplus.pages.dev` reste intact** : il ne sert qu'à ne pas perdre l'accès.
2. **Retirer le domaine** : Workers & Pages → projet → Custom domains → ⋯ → *Remove domain*
   (et supprimer les 2 CNAME si créés à la main).
3. **Côté Render** : remettre `WEB_ORIGIN=https://santeplus.pages.dev` (et `APP_URL` idem),
   ce qui réactive exactement l'état CORS d'aujourd'hui.
4. ⚠️ **Ne pas** pointer le DNS ailleurs puis revenir « à la main » : la doc Cloudflare prévient que
   le domaine devient *inactive* puis *active* de nouveau avec des erreurs pour les visiteurs ;
   pour dévier temporairement le trafic, utiliser une **Origin Rule / Redirect Rule** à la place.
5. Conserver les NS d'origine du registrar **notées avant** le changement (§3.2-2).

---

## 8. Qui fait quoi

| Action | Qui |
|---|---|
| Enregistrer `santeplus.bj`, changer les NS | **Vous** (registrar .bj) |
| Zone Cloudflare + Custom domains + SSL/TLS | **Vous** (dashboard Cloudflare) |
| `WEB_ORIGIN` / `APP_URL` sur Render | **Vous** (dashboard Render) — valeurs exactes en §3.6 |
| Produire cette doc, vérifications DNS/HTTP/CORS, mise à jour du runbook | Assistant |

Une fois en place : remonter le résultat dans `docs/RUNBOOK-CONTINUITE.md` §6 (état du site).
