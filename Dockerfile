# ── Build API (standalone, sans workspaces) ────────────────────────────────
FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app

COPY apps/api/package.json apps/api/package-lock.json* ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/prisma ./prisma
COPY apps/api/src ./src

RUN npx prisma generate
RUN npm run build

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
