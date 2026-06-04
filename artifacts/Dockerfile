# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# BUILD RELOAD - bump version 1.1
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY . .

# BUILD RELOAD - bump version 1.1
# Instalar dependencias (incluye workspace packages)
RUN echo '$$(date)' > /app/build-timestamp.txt && \
    echo 'Forcing Docker build to rebuild from scratch' > /app/force-rebuild.txt && \
    pnpm install --frozen-lockfile

# Build del proyecto
RUN echo '$$(date)' > /app/build-timestamp.txt && \
    echo 'Forcing Docker build to rebuild from scratch' > /app/force-rebuild.txt && \
    pnpm --filter @workspace/api-server run build && \
    pnpm --filter @workspace/ventas-pro run build && \
    rm -f /app/force-rebuild.txt

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copiar node_modules completo (incluye .pnpm virtual store + symlinks)
# Necesario porque pnpm workspaces usan symlinks que deben preservarse
COPY --from=builder /app/node_modules /app/node_modules

# Copiar workspace packages (necesarios para las symlinks de pnpm)
COPY --from=builder /app/artifacts/ /app/artifacts/
COPY --from=builder /app/lib/ /app/lib/
COPY --from=builder /app/scripts/ /app/scripts/

# Copiar config de workspace (necesario para resolución de symlinks)
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json /app/
COPY --from=builder /app/.npmrc /app/

# Exponer puerto
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Iniciar servidor (sincroniza BD primero)
CMD ["sh", "-c", "node ./lib/db/node_modules/drizzle-kit/bin.cjs push --config ./lib/db/drizzle.config.ts --force && node --enable-source-maps ./artifacts/api-server/dist/index.mjs"]
