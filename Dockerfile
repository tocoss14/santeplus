# ── Build API (standalone, sans workspaces) ────────────────────────────────
FROM node:20-alpine AS build
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
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./

RUN mkdir -p /app/uploads

EXPOSE 4000

WORKDIR /app

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
