# =============================================================================
# BUILD STAGE
# =============================================================================
FROM node:22-slim AS builder

# Deshabilitar corepack para evitar que descargue pnpm 10 automáticamente
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV COREPACK_DEFAULT_TO_LATEST=0
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Instalar dependencias del sistema necesarias para Baileys y builds nativos
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Instalar pnpm directamente via npm (sin corepack para evitar conflictos de versión)
RUN npm install -g pnpm@9.15.9 --no-fund --no-audit

# Copiar manifiestos primero (optimiza cache de Docker layers)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

# Copiar package.json de todos los paquetes del workspace
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/ventas-pro/package.json  ./artifacts/ventas-pro/
COPY lib/api-zod/package.json           ./lib/api-zod/
COPY lib/api-spec/package.json          ./lib/api-spec/
COPY lib/api-client-react/package.json  ./lib/api-client-react/
COPY lib/db/package.json                ./lib/db/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY lib/integrations-openai-ai-react/package.json  ./lib/integrations-openai-ai-react/
COPY scripts/package.json               ./scripts/

# Instalar todas las dependencias
RUN pnpm install --no-frozen-lockfile --prod=false

# Copiar el resto del código fuente
COPY . .

# Build: backend + frontend + libs necesarias
RUN pnpm --filter "@workspace/db" \
         --filter "@workspace/api-zod" \
         --filter "@workspace/api-spec" \
         --filter "@workspace/api-client-react" \
         --filter "@workspace/api-server" \
         --filter "@workspace/ventas-pro" \
         run build

# Verificar que el frontend se construyó correctamente
RUN echo "Verificando build del frontend..." && \
    ls -la /app/artifacts/ventas-pro/dist/public/ && \
    test -f /app/artifacts/ventas-pro/dist/public/index.html && \
    echo "Frontend OK" || (echo "ERROR: index.html no encontrado" && exit 1)

# =============================================================================
# PRODUCTION STAGE - Imagen final ligera
# =============================================================================
FROM node:22-slim

# Deshabilitar corepack en producción también
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV COREPACK_DEFAULT_TO_LATEST=0
ENV NODE_ENV=production
ENV PORT=3002
ENV HOST=0.0.0.0

WORKDIR /app

# Solo instalar lo necesario en producción
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copiar todo el workspace ya compilado desde el builder
COPY --from=builder /app /app

# Crear carpeta de datos persistente
RUN mkdir -p /app/data && chmod 777 /app/data

EXPOSE 3002

# Healthcheck robusto: espera 60s antes del primer chequeo
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3002/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# IMPORTANTE: usar node directamente (NO pnpm) para que SIGTERM se propague correctamente
# pnpm no hace forward de SIGTERM al proceso hijo -> crash en EasyPanel al reiniciar
CMD ["sh", "-c", "node ./scripts/migrate.mjs && exec node --enable-source-maps ./artifacts/api-server/dist/index.mjs"]
