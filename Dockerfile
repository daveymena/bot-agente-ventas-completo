FROM node:20-slim AS base

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
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de configuración del monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

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

# Forzar instalación completa para el build (ignorar NODE_ENV=production de EasyPanel)
RUN pnpm install --no-frozen-lockfile --prod=false

# Copiar el resto del código
COPY . .

# Construir solo los proyectos necesarios (Backend + Frontend)
# Saltarse typecheck y build solo lo necesario
RUN pnpm --filter "@workspace/api-server" --filter "@workspace/ventas-pro" --filter "@workspace/db" --filter "@workspace/api-zod" --filter "@workspace/api-spec" --filter "@workspace/api-client-react" --filter "@workspace/integrations-openai-ai-server" --filter "@workspace/integrations-openai-ai-react" run build

# Etapa final para ejecución ligera y estable
FROM node:20-slim

WORKDIR /app
RUN corepack enable

# Instalar dependencias mínimas para producción
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de configuración
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

# Copiar package.json de todos los paquetes para pnpm workspace
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/ventas-pro/package.json ./artifacts/ventas-pro/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/db/package.json ./lib/db/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY lib/integrations-openai-ai-react/package.json ./lib/integrations-openai-ai-react/
COPY scripts/package.json ./scripts/

# Crear carpetas de persistencia para EasyPanel
RUN mkdir -p /app/data && chmod 777 /app/data

# Variables de entorno y argumentos de construcción
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

# Instalar TODAS las dependencias de producción del workspace completo
# Esto incluye protobufjs y otras deps transitivas de baileys
ENV CI=true
RUN pnpm install --prod=false --no-frozen-lockfile

# Copiar código compilado desde el builder
COPY --from=base /app/artifacts/api-server/dist /app/artifacts/api-server/dist
COPY --from=base /app/artifacts/ventas-pro/dist /app/artifacts/ventas-pro/dist
COPY --from=base /app/lib /app/lib

# Comando de arranque optimizado
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
