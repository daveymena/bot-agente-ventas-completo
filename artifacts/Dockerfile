# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# Copiar archivos de configuración
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY . .

# Instalar dependencias
RUN pnpm install --frozen-lockfile

# Build del proyecto
RUN pnpm --filter @workspace/api-server run build
RUN pnpm --filter @workspace/ventas-pro run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# Copiar solo lo necesario del builder
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/api-server/package.json ./
COPY --from=builder /app/artifacts/ventas-pro/dist/public ./public

# Instalar solo dependencias de producción
RUN pnpm install --prod --frozen-lockfile

# Copiar el frontend
COPY --from=builder /app/artifacts/ventas-pro/dist/public ./public

# Exponer puerto
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Iniciar servidor
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
