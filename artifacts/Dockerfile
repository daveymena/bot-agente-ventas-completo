# =============================================================================
# BUILD STAGE - Compilar backend + frontend
# =============================================================================
FROM node:22-alpine AS builder

# Deshabilitar corepack para evitar que descargue pnpm 10 automáticamente
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV COREPACK_DEFAULT_TO_LATEST=0

WORKDIR /app

# Instalar pnpm directamente (sin corepack)
RUN npm install -g pnpm@9.15.9 --no-fund --no-audit

# --- Copiar SOLO los manifiestos primero (optimiza cache de Docker) ---
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./

# Copiar package.json de cada paquete del workspace
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/ventas-pro/package.json  ./artifacts/ventas-pro/
COPY lib/api-zod/package.json           ./lib/api-zod/
COPY lib/api-spec/package.json          ./lib/api-spec/
COPY lib/api-client-react/package.json  ./lib/api-client-react/
COPY lib/db/package.json                ./lib/db/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY lib/integrations-openai-ai-react/package.json  ./lib/integrations-openai-ai-react/
COPY scripts/package.json               ./scripts/

# Instalar dependencias
RUN pnpm install --no-frozen-lockfile --prod=false

# --- Copiar el resto del código fuente ---
COPY . .

# Build backend (api-server)
RUN pnpm --filter @workspace/api-server run build

# Build frontend (ventas-pro)
RUN pnpm --filter @workspace/ventas-pro run build

# Verificar que el frontend se compiló
RUN echo "Verificando build del frontend..." && \
    ls -la /app/artifacts/ventas-pro/dist/public/ && \
    test -f /app/artifacts/ventas-pro/dist/public/index.html && \
    echo "Frontend OK" || (echo "ERROR: index.html no encontrado" && exit 1)

# =============================================================================
# PRODUCTION STAGE - Imagen final ligera
# =============================================================================
FROM node:22-alpine

# Deshabilitar corepack en producción
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV COREPACK_DEFAULT_TO_LATEST=0
ENV NODE_ENV=production
ENV PORT=3002
ENV HOST=0.0.0.0

WORKDIR /app

# Dependencias mínimas del sistema
RUN apk add --no-cache sqlite python3 make g++

# Copiar el workspace completo desde el builder
COPY --from=builder /app/node_modules         /app/node_modules
COPY --from=builder /app/artifacts/           /app/artifacts/
COPY --from=builder /app/lib/                 /app/lib/
COPY --from=builder /app/scripts/             /app/scripts/
COPY --from=builder /app/pnpm-lock.yaml       /app/
COPY --from=builder /app/pnpm-workspace.yaml  /app/
COPY --from=builder /app/package.json         /app/
COPY --from=builder /app/.npmrc               /app/

# Crear carpeta de datos persistente
RUN mkdir -p /app/data && chmod 777 /app/data

EXPOSE 3002

# Healthcheck robusto con 60s de start-period
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3002/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# IMPORTANTE: exec node (no pnpm) para que SIGTERM se propague correctamente
CMD ["sh", "-c", "node ./scripts/migrate.mjs && exec node --enable-source-maps ./artifacts/api-server/dist/index.mjs"]
