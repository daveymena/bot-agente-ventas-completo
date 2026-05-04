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
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de configuración del monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY lib ./lib
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/ventas-pro/package.json ./artifacts/ventas-pro/
COPY artifacts/api-zod/package.json ./artifacts/api-zod/
COPY artifacts/api-spec/package.json ./artifacts/api-spec/
COPY artifacts/api-client-react/package.json ./artifacts/api-client-react/

# Instalar dependencias
RUN pnpm install --frozen-lockfile

# Copiar el resto del código
COPY . .

# Construir todo el proyecto (Backend + Frontend)
RUN pnpm run build

# Etapa final para ejecución ligera
FROM node:20-slim

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
