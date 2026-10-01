# ---------------------------------------------------------------------------
# Landing Forge Premium – VentasProIA
# Imagen de producción con la salida `standalone` de Next.js.
#   docker build -t landing-forge-premium .
#   docker run -p 3000:3000 --env-file .env.local \
#     -v landings:/app/.data landing-forge-premium
# ---------------------------------------------------------------------------

# --- 1. Dependencias -------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# --- 2. Build --------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- 3. Runtime ------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Valores por defecto de la tienda (se pueden sobreescribir al correr).
ENV STORE_SLUG=sofia-premium
ENV STORE_BASE=https://ventasproia.com
ENV LANDINGS_DIR=/app/.data/landings

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Carpeta persistente de las landings publicadas en /l/[slug].
RUN mkdir -p /app/.data/landings && chown -R nextjs:nodejs /app/.data
VOLUME ["/app/.data"]

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/store/whatsapp').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
