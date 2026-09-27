# ── Build API (standalone, sans workspaces) ────────────────────────────────
FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app

# Sonde de version (GET /api/version) : la CI passe le SHA du commit via
# --build-arg APP_VERSION. Runsite (qui reconstruit l'image lui-même) ne le
# passe pas — la version reste alors vide et seule la date de build permet de
# distinguer une image reconstruite d'une image recyclée.
ARG APP_VERSION=""

COPY apps/api/package.json apps/api/package-lock.json* ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/prisma ./prisma
COPY apps/api/src ./src

RUN npx prisma generate
RUN npm run build

# Tampon de version lu par GET /api/version. Place après le build pour que
# tout nouveau commit produise un horodatage frais ; un re-build sans cache
# d'un même commit rafraîchit aussi builtAt (détecte une image reconstruite).
RUN printf '{"version":"%s","builtAt":"%s"}\n' "$APP_VERSION" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" > dist/build-info.json

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

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate resolve --rolled-back 20260826120000_emergency_override 2>/dev/null; ./node_modules/.bin/prisma migrate deploy; echo 'Migrations applied.'; node dist/main.js"]
