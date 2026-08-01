# ─────────────────────────────────────────────────────────────────────────────
# Tienda (storefront) — build estático con Vite + servido por nginx.
# Servicio independiente en EasyPanel; nginx proxya /api al api-server.
# ─────────────────────────────────────────────────────────────────────────────

# ── Etapa 1: build ──
FROM node:22-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Config del monorepo (para cache de instalación)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc .pnpmrc* ./

# package.json de la tienda y de sus dependencias de workspace
COPY packages/tienda/package.json ./packages/tienda/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/

# Instalar SOLO el subárbol de la tienda (evita baileys y otras deps del backend)
RUN pnpm install --filter @workspace/tienda... --filter @workspace/tienda \
    2>&1 | grep -v "ERR_PNPM_EXOTIC_SUBDEP\|ERR_PNPM_IGNORED_BUILDS" || true

# Copiar el código y construir
COPY . .
RUN pnpm --filter @workspace/tienda run build

# ── Etapa 2: servir con nginx ──
FROM nginx:1.27-alpine

# La imagen oficial de nginx sustituye ${API_UPSTREAM} en los templates al arrancar.
ENV API_UPSTREAM=http://api-server:3002
COPY packages/tienda/nginx.conf.template /etc/nginx/templates/default.conf.template

# Artefactos estáticos de la tienda
COPY --from=build /app/packages/tienda/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
