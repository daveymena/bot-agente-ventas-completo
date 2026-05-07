# VentasPro — Bot Agente de Ventas IA

Bot de ventas inteligente con WhatsApp integrado, agente IA (Sofía), pagos MercadoPago/PayPal, y dashboard completo.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (puerto 8080)
- `pnpm --filter @workspace/ventas-pro run dev` — Frontend dashboard (puerto 23665)
- `pnpm run typecheck` — typecheck completo
- `pnpm run build` — build todo
- `pnpm --filter @workspace/api-spec run codegen` — regenerar hooks y schemas desde OpenAPI
- `pnpm --filter @workspace/db run push` — aplicar cambios de schema a la DB

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (Replit managed en dev, EasyPanel en prod)
- IA: Replit AI Proxy (gpt-5-mini, principal) → GitHub Models (fallback) → Ollama EasyPanel (fallback)
- WhatsApp: @whiskeysockets/baileys
- Pagos: MercadoPago + PayPal + Transferencia
- Frontend: React + Vite + TailwindCSS + shadcn/ui
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/lib/agent.ts` — lógica principal del agente IA (Sofía)
- `artifacts/api-server/src/lib/whatsapp.ts` — integración WhatsApp via Baileys
- `artifacts/api-server/src/lib/payments.ts` — pasarelas de pago
- `artifacts/api-server/src/lib/fallbackSystem.ts` — sistema de fallback de IA
- `artifacts/api-server/src/lib/objectionHandler.ts` — manejo de objeciones
- `artifacts/ventas-pro/src/pages/` — páginas del dashboard
- `lib/db/src/schema/` — esquema de base de datos (fuente de verdad)
- `lib/api-spec/openapi.yaml` — contrato API (fuente de verdad)

## Architecture decisions

- Multi-tenant desde el inicio: cada tenant tiene su propio agente, productos y conversaciones
- WhatsApp auto-arranca en boot; QR se genera en `/api/whatsapp/connect`
- IA con fallback: Replit AI Proxy (gpt-5-mini) → GitHub Models → Ollama EasyPanel
- Pagos sin redirect en WhatsApp: links directos de MercadoPago y PayPal
- Cookie-based auth con `tenant_id` httpOnly

## Product

Dashboard para gestionar un bot de ventas por WhatsApp con:
- Agente IA configurable (Sofía) con personalidad y etapas de venta
- Conversaciones en tiempo real con clientes de WhatsApp
- Catálogo de productos con tarjetas enviadas automáticamente
- Leads/prospectos con embudo de ventas
- Pagos integrados (MercadoPago, PayPal, Transferencia)
- Analytics y dashboard de métricas

## User preferences

- Usuario admin EasyPanel: daveymena16@gmail.com / 6715320Dvd (tenant slug: sofia-premium)
- Usuario admin Replit DB (dev vacía): deinermena25@gmail.com / Dvd6715320 (tenant slug: tecnovariedades)
- BD activa: EXTERNAL_DATABASE_URL → EasyPanel (79.143.187.160:5432/tecnovariedades-db)
- Moneda: COP (Colombia)
- Zona horaria: America/Bogota
- Número de transferencia: 3136174267 (Deiner Mena)

## Gotchas

- `GITHUB_TOKEN` = placeholder ("GITHUB_PERSONAL_ACCESS_TOKEN"), token real en `GITHUB_PERSONAL_ACCESS_TOKEN` pero revocado (401). El código resuelve automáticamente via `resolveGithubToken()`. Para volver a usar GitHub Models: actualiza el secret `GITHUB_TOKEN` con un nuevo PAT real.
- `AI_INTEGRATIONS_OPENAI_BASE_URL` y `AI_INTEGRATIONS_OPENAI_API_KEY` → Replit AI proxy (activo, proveedor principal). Cargado automáticamente en dev por Replit.
- Ollama en EasyPanel usa modelos `:cloud` que requieren suscripción de pago — no disponibles sin upgrade.
- Agente activo en EasyPanel DB: **Luna (ID:5)** (tenant_id=1). Asistente de Soporte (ID:3) desactivado.
- `DATABASE_URL` en Replit apunta a la DB gestionada por Replit (para dev); la DB de EasyPanel es para producción
- WhatsApp requiere escanear QR cada vez que se reinicia sin sesión guardada
- El tenant_id se resuelve por cookie httpOnly — el frontend debe hacer login primero

## Deployment (EasyPanel)

- DB: `postgres://postgres:6715320Dvd@79.143.187.160:5432/tecnovariedades-db?sslmode=disable`
- Ollama: `https://tecnovariedades-ollama.er7iaf.easypanel.host`
- Ver `Dockerfile` para configuración de producción
- Puerto de producción: 3001

## Pointers

- Ver skill `pnpm-workspace` para estructura del workspace y TypeScript
