#!/usr/bin/env bash
# =============================================================================
# SantéPlus — contrôle unique : DNS + HTTPS + CORS du domaine custom
#
# Usage :
#   ./scripts-dev/check-santeplus-bj.sh                      # santeplus.bj (défaut)
#   ./scripts-dev/check-santeplus-bj.sh santeplus.pages.dev  # autre domaine
#   NO_WWW=1 ./scripts-dev/check-santeplus-bj.sh ...         # zone sans sous-domaine www
#
# Sortie : [ OK ] / [FAIL] / [WARN] / [INFO] / [SKIP]
#   exit 0 = tout est en place (warnings éventuels affichés)
#   exit 1 = au moins un échec
#   exit 2 = outil manquant (curl / nslookup / openssl)
#
# Procédure de mise en place : docs/DNS-SANTEPLUS-BJ.md (§3 = config, §5 = manuel)
# À lancer depuis la racine du dépôt. Requiert Git Bash (Windows) ou Linux/macOS.
# =============================================================================
set -u
set -o pipefail   # rc = rc réel de curl même derrière un pipe (ex. | tr -d '\r')

DOMAIN="${1:-santeplus.bj}"
API="${2:-https://santeplus-api-kp5t.onrender.com}"
WEB="https://${DOMAIN}"
RESOLVER="8.8.8.8"
DOC="docs/DNS-SANTEPLUS-BJ.md"

OK=0; NB_FAIL=0; NB_WARN=0

ok()   { printf '[ OK ] %s\n' "$*"; OK=$((OK+1)); }
bad()  { printf '[FAIL] %s\n' "$*"; NB_FAIL=$((NB_FAIL+1)); }
warn() { printf '[WARN] %s\n' "$*"; NB_WARN=$((NB_WARN+1)); }
info() { printf '[INFO] %s\n' "$*"; }
skip() { printf '[SKIP] %s\n' "$*"; }

for tool in curl nslookup openssl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Outil manquant : $tool"; exit 2; }
done

# --- utilitaires -------------------------------------------------------------

nsq() { # nsq <type|default> <nom> -> réponse nslookup sans CR, 2 essais si délai dépassé
  local try out
  out=""
  for try in 1 2; do
    if [ "$1" = "default" ]; then
      out=$(nslookup "$2" "$RESOLVER" 2>&1 | tr -d '\r')
    else
      out=$(nslookup -type="$1" "$2" "$RESOLVER" 2>&1 | tr -d '\r')
    fi
    if [ -n "$out" ] && ! printf '%s' "$out" | grep -qi "timed out"; then
      printf '%s' "$out"; return 0
    fi
    sleep 1
  done
  printf '%s' "$out"   # 2e échec : on renvoie la dernière réponse (timeout)
}

is_nxdomain() { printf '%s' "$1" | grep -qi "Non-existent domain"; }
is_timeout()  { printf '%s' "$1" | grep -qi "timed out"; }

ips_of() { # IPs publiques d'une réponse nslookup (hors adresse du résolveur)
  printf '%s' "$1" \
    | grep -Eo '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' \
    | grep -v "^${RESOLVER}$" | sort -u
  printf '%s' "$1" | grep -Eo '\b[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,}\b' | sort -u
}

header_val() { # header_val <bloc-entetes> <nom-header>
  printf '%s\n' "$1" | grep -i "^$2:" | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r'
}

lower() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }

# =============================================================================
printf '\nSantéPlus — vérification de %s (API : %s)\n' "$WEB" "$API"

# --- 1. DNS -------------------------------------------------------------------
printf '\n== 1. DNS (résolveur %s) ==\n' "$RESOLVER"
DNS_OK=1

out=$(nsq NS "$DOMAIN")
if is_nxdomain "$out"; then
  bad "D1 $DOMAIN : NXDOMAIN — domaine non enregistré/non délégué (étape 0, $DOC §3.1)"
  DNS_OK=0
elif is_timeout "$out"; then
  bad "D1 délai DNS dépassé sur $RESOLVER (2 essais) — relancer le script (ou vérifier le réseau)"
  DNS_OK=0
else
  ns_list=$(printf '%s' "$out" | grep -i "nameserver =" | sed 's/.*=[[:space:]]*//' | sort -u | tr '\n' ' ')
  if printf '%s' "$ns_list" | grep -qi "\.ns\.cloudflare\.com"; then
    ok "D1 NS délégués vers Cloudflare :$ns_list"
  elif [ -n "${ns_list// }" ]; then
    warn "D1 NS non Cloudflare :$ns_list — apex impossible sans zone Cloudflare ($DOC §2, §3.2)"
  else
    warn "D1 réponse NS illisible — vérifier à la main : nslookup -type=NS $DOMAIN $RESOLVER"
  fi
fi

if [ "$DNS_OK" -eq 1 ]; then
  # D2 — apex résout
  out=$(nsq default "$DOMAIN")
  if is_nxdomain "$out"; then
    bad "D2 $DOMAIN : NXDOMAIN — domaine non enregistré/non délégué ($DOC §3.1)"
    DNS_OK=0
  elif is_timeout "$out"; then      bad "D2 délai DNS dépassé (2 essais) — relancer le script"
    DNS_OK=0
  else
    ips=$(ips_of "$out")
    if [ -n "$ips" ]; then
      ok "D2 apex résout : $(printf '%s' "$ips" | tr '\n' ' ')"
    else
      bad "D2 $DOMAIN ne renvoie aucune adresse ($DOC §3.4)"
      DNS_OK=0
    fi
  fi
fi

if [ "$DNS_OK" -eq 1 ]; then
  # D3 — www résout
  out=$(nsq default "www.$DOMAIN")
  if is_timeout "$out"; then
    bad "D3 délai DNS dépassé sur www.$DOMAIN (2 essais) — relancer le script"
  elif is_nxdomain "$out" || [ -z "$(ips_of "$out")" ]; then
    if [ "${NO_WWW:-0}" = "1" ]; then
      warn "D3 www.$DOMAIN ne résout pas (ignoré : NO_WWW=1)"
    else
      bad "D3 www.$DOMAIN ne résout pas — CNAME www manquant ($DOC §3.4)"
    fi
  else
    ok "D3 www résout : $(ips_of "$out" | tr '\n' ' ')"
  fi
fi

# --- 2. HTTPS -----------------------------------------------------------------
printf '\n== 2. HTTPS ==\n'
if [ "$DNS_OK" -ne 1 ]; then
  skip "Section HTTPS ignorée : le domaine ne résout pas encore (voir échecs D1/D2)"
else
  # H1 — page principale derrière Cloudflare
  hdr=$(curl -sI --max-time 25 "$WEB/" 2>/dev/null | tr -d '\r'); rc=$?
  hcode=$(printf '%s\n' "$hdr" | head -1 | awk '{print $2}')
  if [ "$rc" -ne 0 ]; then
    bad "H1 $WEB/ inaccessible (curl rc=$rc)"
  elif [ "$hcode" = "200" ]; then
    ok "H1 $WEB/ -> 200"
    if printf '%s' "$hdr" | grep -qi '^server:.*cloudflare'; then
      ok "H1 derrière le proxy Cloudflare (server: cloudflare)"
    else
      warn "H1 en-tête server:cloudflare absent — proxy non actif ?"
    fi
  else
    bad "H1 $WEB/ -> code $hcode (attendu 200)"
  fi

  # H2 — www
  if [ "${NO_WWW:-0}" = "1" ]; then
    skip "H2 www ignoré (NO_WWW=1)"
  else
    wcode=$(curl -sL -o /dev/null -w '%{http_code}' --max-time 25 "https://www.$DOMAIN/" 2>/dev/null); wrc=$?
    if [ "$wrc" -eq 0 ] && [ "$wcode" = "200" ]; then
      ok "H2 https://www.$DOMAIN/ -> 200 (redirections suivies)"
    else
      bad "H2 https://www.$DOMAIN/ inaccessible (code $wcode, curl rc=$wrc)"
    fi
  fi

  # H3 — redirection HTTP -> HTTPS (Always Use HTTPS)
  h3code=""; h3url=""
  read -r h3code h3url <<EOF
$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "http://$DOMAIN/" 2>/dev/null)
EOF
  case "$h3code" in
    301|302|307|308)
      case "$h3url" in
        https://*) ok "H3 http:// -> $h3code vers $h3url" ;;
        *)         bad "H3 redirection $h3code sans passage en https ($h3url) — Always Use HTTPS ? ($DOC §3.5)" ;;
      esac ;;
    200) bad "H3 http://$DOMAIN/ renvoie 200 sans redirection — activer Always Use HTTPS ($DOC §3.5)" ;;
    *)   bad "H3 http://$DOMAIN/ -> code $h3code (attendu 301/308 vers https)" ;;
  esac

  # H4 — certificat TLS
  cert=$(echo | timeout 20 openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null \
         | openssl x509 -noout -subject -enddate 2>/dev/null)
  if [ -z "$cert" ]; then
    bad "H4 certificat TLS introuvable pour $DOMAIN (s_client échoué)"
  else
    subj=$(printf '%s\n' "$cert" | sed -n 's/^subject=//p')
    end=$(printf '%s\n' "$cert" | sed -n 's/^notAfter=//p' | sed 's/ GMT$//')
    # match insensible à la casse, sans pipe (grep -q en pipe plante sous MSYS)
    case "$(lower "$subj")" in
      *"$(lower "$DOMAIN")"*) ok "H4 certificat couvre $DOMAIN (subject: $subj)" ;;
      *)                       bad "H4 certificat ne couvre pas $DOMAIN (subject: $subj)" ;;
    esac
    if end_epoch=$(date -u -d "$end GMT" +%s 2>/dev/null); then
      now=$(date -u +%s); left=$(( (end_epoch - now) / 86400 ))
      if [ "$left" -lt 0 ]; then
        bad "H4 certificat EXPIRÉ le $end"
      elif [ "$left" -lt 14 ]; then
        warn "H4 certificat expire bientôt : $end ($left j)"
      else
        ok "H4 certificat valide jusqu'au $end ($left j)"
      fi
    else
      warn "H4 date de fin illisible : $end"
    fi
  fi
fi

# --- 3. CORS (API Render) -----------------------------------------------------
printf '\n== 3. CORS / API ==\n'

# C0 — santé de l'API (premier appel : réveil Render possible, 45 s)
health=$(curl -s --max-time 45 "$API/api/health" 2>/dev/null); hrc=$?
if [ "$hrc" -ne 0 ]; then
  bad "C0 API injoignable (curl rc=$hrc) — réveil Render en cours ? Relancer dans 1 min"
elif printf '%s' "$health" | grep -q '"status":"ok"'; then
  storage=$(printf '%s' "$health" | sed -n 's/.*"storage":"\([a-z]*\)".*/\1/p')
  if [ "$storage" = "object" ]; then
    ok "C0 /api/health : 200, storage=object (R2 actif)"
  else
    warn "C0 /api/health : storage=$storage — uploads NON persistants si 'disk'"
  fi
else
  bad "C0 /api/health : réponse inattendue -> $(printf '%s' "$health" | head -c 120)"
fi

# C1 — requête simple avec Origin
hdr=$(curl -sI --max-time 20 -H "Origin: $WEB" "$API/api/health" 2>/dev/null | tr -d '\r')
acao=$(lower "$(header_val "$hdr" access-control-allow-origin)")
if [ "$acao" = "$(lower "$WEB")" ]; then
  ok "C1 ACAO exact pour Origin $WEB"
elif [ -z "$acao" ]; then
  bad "C1 aucun ACAO pour $WEB — mettre à jour WEB_ORIGIN sur Render ($DOC §3.6)"
else
  bad "C1 ACAO inattendu : '$acao' (attendu '$WEB')"
fi

# C2 — preflight des mutations (login = route réellement utilisée par le front)
hdr=$(curl -sI -X OPTIONS --max-time 20 \
        -H "Origin: $WEB" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        "$API/api/auth/login" 2>/dev/null | tr -d '\r')
pcode=$(printf '%s\n' "$hdr" | head -1 | awk '{print $2}')
pacao=$(lower "$(header_val "$hdr" access-control-allow-origin)")
pameth=$(header_val "$hdr" access-control-allow-methods)
if [ "$pcode" != "200" ] && [ "$pcode" != "204" ]; then
  bad "C2 preflight OPTIONS -> $pcode (attendu 204)"
elif [ "$pacao" != "$(lower "$WEB")" ]; then
  bad "C2 preflight sans ACAO pour $WEB — WEB_ORIGIN à corriger ($DOC §3.6)"
elif [ -z "$pameth" ]; then
  bad "C2 preflight sans access-control-allow-methods"
else
  ok "C2 preflight login -> $pcode, ACAO=$pacao, methods=$pameth"
fi

# C3 — contrôle négatif : origine étrangère refusée
hdr=$(curl -sI --max-time 20 -H "Origin: https://evil.example" "$API/api/health" 2>/dev/null | tr -d '\r')
if [ -z "$(header_val "$hdr" access-control-allow-origin)" ]; then
  ok "C3 origine étrangère refusée (pas d'ACAO)"
else
  bad "C3 FENTE : ACAO renvoyé pour une origine inconnue !"
fi

# --- verdict ------------------------------------------------------------------
printf '\n================= VERDICT =================\n'
printf 'OK=%s  AVERTISSEMENTS=%s  ECHECS=%s\n' "$OK" "$NB_WARN" "$NB_FAIL"
if [ "$NB_FAIL" -eq 0 ]; then
  if [ "$NB_WARN" -eq 0 ]; then
    printf 'RESULTAT : TOUT EST EN PLACE — %s est operationnel.\n' "$WEB"
  else
    printf 'RESULTAT : EN PLACE, mais %s avertissement(s) a relire ci-dessus.\n' "$NB_WARN"
  fi
  exit 0
else
  printf 'RESULTAT : PAS EN PLACE — %s echec(s).\n' "$NB_FAIL"
  printf 'Procedure : %s (§3 = configuration, §5 = commandes manuelles)\n' "$DOC"
  exit 1
fi
