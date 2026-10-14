# Agent-Sales-Bot (VentasPro)

WhatsApp AI sales bot + SaaS platform. Express backend, React dashboard, SQLite/PostgreSQL dual-mode DB, Baileys WhatsApp integration, 10 AI agent personas.

## gstack workflow (equipo de ingeniería IA)

Este repo usa [gstack](https://github.com/garrytan/gstack) como workflow de ingeniería con agentes especializados. Los skills están en `~/.config/opencode/skills/gstack*` y se invocan con `/nombre`.

Skills principales para este equipo:
- `/office-hours` — reframing del problema antes de codear.
- `/autoplan` — CEO → design → DX → eng review automático.
- `/review` — staff engineer: bugs que pasan CI pero rompen prod.
- `/qa` — QA lead: abre navegador real y verifica flujos.
- `/ship` — release engineer: tests, PR, push.
- `/investigate` — debugging sistemático.
- `/context-save` / `/context-restore` — guardar/resumir estado.
- `/learn` — memoria acumulada del proyecto.

Reglas:
1. Antes de una feature grande: `/office-hours` o `/autoplan`.
2. Antes de cerrar cualquier PR: `/review`.
3. Cuando hay UI o flujo nuevo: `/qa http://localhost:5174` (dev) o URL de staging.
4. Guardar contexto con `/context-save` al final de sesiones largas.
5. Nunca hacer `git push --force` ni `rm -rf` destructivo sin confirmación explícita del usuario.

## Documentación obligatoria antes de implementar cambios

- `CLAUDE.md` — reglas maestras para la fase actual y separación Atlas/WhatsApp.
- `TRASPASO_2026-09-21.md` — el vendedor de WhatsApp reconstruido: motor v2, bandera por negocio, nichos derivados y las herramientas con las que Atlas diagnostica.
- `artifacts/api-server/src/lib/motor-nuevo/README.md` — arquitectura del motor de ventas v2.
- `WHATSAPP_SALES_PLAYBOOK_RESEARCH_2026.md` — investigación y especificación del comportamiento comercial del vendedor WhatsApp.
- `REDESENO_FRONTEND_UX_UI_2026.md` — auditoría y rediseño visual/responsive 2026.
- `ESTADO_MOTOR_VENTAS.md` — auditoría del motor comercial.
- `ESTADO_WHATSAPP_24AGO.md` — estado operativo de WhatsApp, incidentes reales y precauciones.

## Separación crítica de agentes

- **Atlas / Operator** administra el negocio y puede usar OpenCode/MCP para sus tareas administrativas/estratégicas.
- **Agente vendedor de WhatsApp** es independiente y atiende al cliente final. Su camino crítico no debe pasar por Atlas ni usar OpenCode como intermediario.
- `AgentOrchestrator` consume la cola de WhatsApp y llama a `runAgentReply(conversationId)` para generar las respuestas del vendedor.

## Motor de ventas: v1 y v2

`artifacts/api-server/src/lib/motor-nuevo/` es el motor nuevo. Está en
producción **encendido por defecto** (`v2`, ver `activacion.ts`), fijado
además por `MOTOR_VENDEDOR=v2` en el entorno. Se puede volver a `v1` por
negocio con `MOTOR_VENDEDOR*`, por API (`POST /api/whatsapp/motor`) o
desde Atlas (`vendedor_motor`).

- Los hechos (precio, ficha, video, medios de pago, entrega) los emiten las
  herramientas desde la base; el modelo escribe la conversación.
- El estado explícito vive en `conversations.estado_agente`: no se deducen
  hechos leyendo el historial con regex.
- El nicho se deriva de los datos (ver `motor-nuevo/nicho.ts`): no hay lista
  cerrada de rubros.
- Si falla el v2, el turno cae al v1 automáticamente: antes una respuesta del
  motor viejo que el silencio.

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm run dev
```

The backend runs on http://localhost:3002 and the frontend dev server on http://localhost:5173.

### Default login (auto-seeded on first run)

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before the first run to control the seeded admin account. If unset, `app.ts` falls back to a fixed placeholder that is not safe for real deployment.

## Project Structure

```
artifacts/
  api-server/       → Express backend (src/lib/motor-nuevo/ = vendedor v2)
  ventas-pro/       → Admin dashboard (React + Vite + Tailwind + shadcn/ui)
  stock/            → VentasPro Stock: banco de recursos tipo Adobe Stock (Express + SQLite FTS5 + React). Independiente del panel; ver artifacts/stock/README.md
lib/
  db/               → Drizzle ORM, dual SQLite/PG schema
  api-zod/           → Zod validation schemas
  api-client-react/  → React Query hooks
  integrations-openai-ai-server/ → AI provider abstraction
packages/
  tienda/            → Public storefront
```

## WhatsApp behavior

The seller must behave progressively and contextually, not as a catalog dump or rigid questionnaire:

- Answer the current customer question first.
- Ask at most one strategic question when the answer changes recommendation or reveals an objection.
- Do not repeat information already delivered unless requested.
- Current-message product intent overrides stale historical product context.
- Do not invent prices, discounts, warranties, stock, testimonials, delivery times, or features.
- Use commercial tools for facts/actions and the model for natural language.
- When buying intent is strong, stop explaining and advance the purchase.
- Interpret confirmations such as `sí`, `dale`, `ese`, `me sirve`, `lo quiero` using context, not naive substring matching.
- `gracias` is not automatically a goodbye when another question/intention exists.
- `lo voy a pensar` should diagnose the real blocker before giving up.
- Responses must be readable on WhatsApp: short paragraphs, visual spacing, varied semantic emoji use, and no repetitive canned openings.

See `WHATSAPP_SALES_PLAYBOOK_RESEARCH_2026.md` for the complete examples and evidence-backed rules.

## Frontend behavior

Use `REDESENO_FRONTEND_UX_UI_2026.md` as the visual source of truth for the current redesign:

- Calm Sales OS
- retain Inter + indigo/slate foundation
- reduce global glassmorphism and visual noise
- progressive disclosure
- action-oriented dashboard
- inbox as a core workflow
- mobile as a first-class experience, not compressed desktop

## Existing architecture to preserve

- Monorepo managed with pnpm workspaces.
- ESM throughout (Node 22+).
- Dual database: SQLite locally, PostgreSQL in production.
- Baileys for WhatsApp Web integration.
- SaaS multi-tenant isolation.
- Existing fallback and WhatsApp reliability safeguards.
- Do not rebuild working transport/infrastructure while fixing conversation or UX behavior.

## Verification rule

Before shipping any change:

1. Inspect what code is actually consumed; do not trust dead modules/comments.
2. Reuse existing tests and scripts.
3. Add a regression case for the behavior changed.
4. Run build/tests relevant to the affected area.
5. Verify the real behavior in WhatsApp or UI where possible.
6. Update documentation when architecture or behavioral rules change.
