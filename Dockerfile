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
COPY scripts/package.json ./scripts/

# Instalar dependencias
RUN pnpm install --frozen-lockfile --no-optional 2>&1 | grep -v "ERR_PNPM_IGNORED_BUILDS" || true

# Copiar el resto del código
COPY . .

# Construir solo el API Server (Backend)
RUN pnpm --filter @workspace/api-server run build

# Etapa final para ejecución ligera
FROM node:22-slim

WORKDIR /app
RUN corepack enable

# Copiar solo lo necesario desde el build
COPY --from=base /app /app

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

# Comando de arranque: Inicia el API Server (que ahora también sirve el Frontend)
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
