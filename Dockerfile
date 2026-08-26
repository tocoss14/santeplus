# ── Build API ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS api-build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci --no-audit --no-fund

COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/src ./apps/api/src

RUN cd apps/api && npx prisma generate && npm run build && cd ../.. && npm prune --omit=dev --workspace=apps/api

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
COPY --from=api-build /app/apps/api/prisma ./apps/api/prisma
COPY --from=api-build /app/apps/api/package.json ./apps/api/package.json
COPY --from=api-build /app/package.json ./

RUN mkdir -p /app/apps/api/uploads

EXPOSE 4000

WORKDIR /app/apps/api

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
