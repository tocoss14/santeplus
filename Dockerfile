# ── Build API (standalone, sans workspaces) ────────────────────────────────
FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app

# Sonde de version (GET /api/version) — deux sources de SHA :
# - APP_VERSION : passée par la CI GitHub (docker/build-push-action).
# - RENDER_GIT_COMMIT : SHA du deploy, injecté par Render — au RUNTIME, pas en
#   build-arg. Un ARG Docker ne lit pas l'environnement d'exécution : sur
#   Render cette variable est donc vide au build, et la couche de tampon
#   ci-dessous n'est PAS invalidée à chaque commit (un push docs/e2e-only ne
#   change aucun fichier copié). C'est pourquoi /api/version donne la priorité
#   au SHA runtime ; le tampon ne sert plus que d'horodatage et de secours
#   pour les images sans runtime Render (GHCR, local).
ARG APP_VERSION=""
ARG RENDER_GIT_COMMIT=""

COPY apps/api/package.json apps/api/package-lock.json* ./
RUN npm install --ignore-scripts --no-audit --no-fund --legacy-peer-deps

COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/prisma ./prisma
COPY apps/api/src ./src

RUN npx prisma generate
RUN npm run build

# Tampon de version lu par GET /api/version : ${APP_VERSION:-$RENDER_GIT_COMMIT},
# vide hors CI et hors Render. BuildKit ne rejoue cette couche que si un ARG
# qu'elle référence change de valeur ; comme Render n'injecte
# RENDER_GIT_COMMIT qu'au runtime, un commit sans changement de fichier copié
# réutilise le tampon du commit précédent. D'où la priorité au SHA runtime :
# ici le tampon est indicatif — version de l'IMAGE et builtAt du build.
RUN printf '{"version":"%s","builtAt":"%s"}\n' "${APP_VERSION:-$RENDER_GIT_COMMIT}" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" > dist/build-info.json

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./

RUN mkdir -p /app/uploads

EXPOSE 4000

WORKDIR /app

# Boucle d'attente base : si PostgreSQL est momentanément indisponible au boot
# (instance suspendue, redémarrage plateforme, réseau), l'ancien CMD lançait
# `migrate deploy` une fois puis démarrait l'API quoi qu'il arrive — crash
# immédiat du conteneur (« Container failed to start ») et service marqué
# offline. L'API attend désormais que la base réponde avant de démarrer.
#
# Garde préalable : une variable d'environnement manquante est une erreur de
# configuration, pas une base indisponible — elle doit être signalée en une
# seconde (message explicite) au lieu de faire boucler le conteneur jusqu'au
# timeout de la plateforme, qui ne donnait aucune cause exploitable.
CMD ["sh", "-c", "if [ -z \"$DATABASE_URL\" ]; then echo 'FATAL: DATABASE_URL absente — variable non définie dans la plateforme (Secret non saisi ?). Rien à retenter, le service ne peut pas démarrer.'; exit 1; fi; ./node_modules/.bin/prisma migrate resolve --rolled-back 20260826120000_emergency_override 2>/dev/null; until ./node_modules/.bin/prisma migrate deploy; do echo 'Waiting for database to be ready...'; sleep 3; done; echo 'Migrations applied.'; node dist/main.js"]
