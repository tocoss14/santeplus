# ─────────────────────────────────────────────────────────────────────────────
# Frontend — build Vite + nginx qui proxifie /api/ vers l'API.
#
# La config nginx est montée en TEMPLATE : ${API_UPSTREAM} est substitué par
# envsubst au boot (mécanisme officiel de l'image nginx). Override possible :
#   docker run -e API_UPSTREAM=http://autre-host:4000 ...
# ─────────────────────────────────────────────────────────────────────────────
# Même mécanisme que nginx.prod.conf (stack Docker prod) : template + envsubst.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
# Valeur par défaut (docker compose : nom du service API sur le réseau Docker)
ENV API_UPSTREAM=http://api:4000
EXPOSE 80
