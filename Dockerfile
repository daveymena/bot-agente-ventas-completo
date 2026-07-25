FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Instalar dependencias del sistema necesarias para baileys y sharp
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de configuración del monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc .pnpmrc* ./

# Copiar package.json de todos los paquetes para optimizar cache de pnpm install
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/ventas-pro/package.json ./artifacts/ventas-pro/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/db/package.json ./lib/db/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY lib/integrations-openai-ai-react/package.json ./lib/integrations-openai-ai-react/
COPY packages/tienda/package.json ./packages/tienda/
COPY scripts/package.json ./scripts/

# Instalar dependencias (sin --no-optional para incluir módulos nativos de Linux)
# --frozen-lockfile evita re-resolución, saltando el check de exotic subdeps de libsignal
RUN pnpm install --frozen-lockfile 2>&1 | grep -v "ERR_PNPM_EXOTIC_SUBDEP\|ERR_PNPM_IGNORED_BUILDS" || true

# Copiar el resto del código
COPY . .

# Construir Backend
RUN pnpm --filter @workspace/api-server run build

# Construir Frontend (Admin)
RUN pnpm --filter @workspace/ventas-pro run build

# Construir Frontend (Tienda Pública)
RUN pnpm --filter @workspace/tienda run build

# Etapa final para ejecución ligera
FROM node:22-slim

WORKDIR /app
RUN corepack enable
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copiar solo lo necesario desde el build
COPY --from=base /app /app

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

# Healthcheck para Easypanel — la ruta real es /api/health (ver src/health.ts).
# Antes apuntaba a /api/healthz (inexistente): el check fallaba siempre, Easypanel
# marcaba el contenedor como unhealthy y lo reiniciaba cada ~40s, cortando la
# sesión de WhatsApp repetidamente. start-period amplio para dar tiempo al build
# de la DB y la conexión inicial.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Volumen persistente para sesión de WhatsApp (evita rescanear QR al reiniciar)
VOLUME /app/artifacts/api-server/.baileys-auth

# Guardar DB por defecto aparte (no se pierde por el volumen)
RUN mkdir -p /app/default-db && cp /app/data/tecnovariedades.db /app/default-db/ 2>/dev/null || true

# Copiar entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Comando de arranque
CMD ["/app/entrypoint.sh"]
