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
# Excluir mockup-sandbox que no es necesario para producción
# Usar -r para recursivo pero excluir mockup-sandbox
RUN pnpm -r --filter "!@workspace/mockup-sandbox" --if-present run build

# Etapa final para ejecución ligera y estable
FROM node:20-slim

WORKDIR /app
RUN corepack enable

# Instalar dependencias mínimas para producción (SQLite3 y Sharp)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copiar solo lo necesario desde el build para reducir tamaño y fallos
COPY --from=base /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/
COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/artifacts/api-server/dist /app/artifacts/api-server/dist
COPY --from=base /app/artifacts/api-server/package.json /app/artifacts/api-server/
COPY --from=base /app/artifacts/ventas-pro/dist /app/artifacts/ventas-pro/dist
COPY --from=base /app/lib /app/lib

# Crear carpetas de persistencia para EasyPanel
RUN mkdir -p /app/data && chmod 777 /app/data

# Variables de entorno y argumentos de construcción
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
ENV NODE_ENV=production
ENV PORT=3002

# Crear carpeta para sesiones de WhatsApp (persistencia)
RUN mkdir -p /app/data && chmod 777 /app/data

EXPOSE 3002

# Comando de arranque optimizado
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
