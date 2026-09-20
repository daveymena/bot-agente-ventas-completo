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

# Puppeteer NO descarga su propio Chrome (~180 MB): en la etapa final se
# instala el `chromium` de Debian y se apunta ahí con PUPPETEER_EXECUTABLE_PATH.
# Sin esto, el `pnpm install` se descarga un navegador entero que después no se
# usa, engordando el build para nada.
ENV PUPPETEER_SKIP_DOWNLOAD=true

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
# ffmpeg: motor propio de videos de anuncio (lib/video-anuncio.ts).
# chromium + fuentes: necesarios para el scraping con navegador real (ver la
# herramienta fb_ad_library en app-operator.ts). Facebook devuelve 403 a
# clientes HTTP simples como curl -- verificado en vivo -- así que la única
# forma de leer la Biblioteca de Anuncios pública es renderizando la página.
# Las fuentes evitan que el texto salga en cuadraditos al capturar.
RUN apt-get update && apt-get install -y \
    curl \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

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

# El directorio /app/data es el volumen persistente (montado via easypanel.yml)
# La autenticación de WhatsApp se guarda en /app/data/.baileys-auth
RUN mkdir -p /app/data

# Guardar DB por defecto aparte (no se pierde por el volumen)
RUN mkdir -p /app/default-db && cp /app/data/tecnovariedades.db /app/default-db/ 2>/dev/null || true

# Copiar entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Comando de arranque
CMD ["/app/entrypoint.sh"]
