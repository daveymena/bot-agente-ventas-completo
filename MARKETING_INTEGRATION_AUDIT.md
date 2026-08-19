# MARKETING_INTEGRATION_AUDIT.md

**Fase 0 del MASTER PLAN — Auditoría de integración del Marketing & Growth Team**

> Documento de auditoría **verificado contra el código real** del repositorio
> `bot-agente-ventas-completo` (rama `master`, commit base `71d4a11`).
> Fecha de verificación: 2026-08-18.
> Complementa a `README_INTEGRACION_MARKETING_TEAM.md` (hoja de ruta) — este
> documento registra el estado fáctico de cada pieza que el plan necesita.

---

## 1. Resumen ejecutivo

| Dominio | Estado | Observación |
|---|---|---|
| Agentes de ventas (personas + router) | ✅ Existe | `agent-templates.ts` (11 plantillas), `agent-router.ts`, `conversation-engine.ts`, `agent.ts` |
| Cerebro / orquestador analítico | ✅ Existe | Architect IA (`architect-ai-core.ts` + predictor/reasoner/optimizer/multichannel) |
| Operador con ejecución real | ✅ Existe | `app-operator.ts` + `routes/code-agent.ts` + `operator-opencode.ts` (OpenCode vía MCP) |
| Aprobaciones por chat | ✅ Existe | `architect-store.ts` (`getPendingPlan/isApproval/isRejection`, patrón "sí 42") |
| Integración Meta (Graph/Marketing API) | ✅ Existe y operativa | `lib/facebook.ts` (FacebookService, v21.0), `ad-strategist.ts`, `facebook_drafts`, `ad_agent_logs` |
| Atribución ad → lead → venta | 🔴 ROTA | `extraerContextoDeAnuncio()` guarda contexto en `messages.metadata` y no llega a `leads` ni se cruza con `payments` |
| Dominio MarketingTeam (14 agentes) | 🔴 No existe | Solo media buyer (`ad-strategist` + `ad-growth-agent`) y persona "Andrés" que vende marketing |
| Motor de tareas multi-agente | 🔴 No existe | `architect-store.ts` maneja UNA acción pendiente por turno |
| Experimentos (A/B) | 🔴 No existe | Sin tabla ni criterio de decisión |
| Risk / Approval / Audit generalizados | 🟡 Parcial | Riesgo implícito en `ad-growth-agent` (aprobación por WhatsApp); sin clasificación LOW/HIGH/CRITICAL ni audit general |
| Memoria de marketing | 🟡 Parcial | `architect_memory` reutilizable (memoryType + tags); faltan tipos de aprendizaje de campañas |
| Multi-tenant | ✅ Sólido | Patrón `tenantId` en todas las tablas + middlewares (`resolveTenant/validateSaas/validateLimits`) |
| Dashboard | 🟡 Parcial | Existe `facebook.tsx` (anuncios) pero no panel "Marketing" |
| Chat del orquestador | 🟡 Parcial | App Operator extendible; sin intents de marketing dedicados |

---

## 2. Inventario verificado (archivos → qué hacen)

### 2.1 Agentes y orquestación

| Archivo | Estado | Notas verificadas |
|---|---|---|
| `artifacts/api-server/src/lib/agent-templates.ts` | ✅ | 11 plantillas: general (Sofía), dropshipping, digital_products, services, telecom, **marketing (Andrés)**, courses, b2b, subscriptions, followup, architect |
| `lib/agent-router.ts` | ✅ | Scoring por keywords; incluye lista `marketing` (publicidad, ads, campaña, anuncio, meta ads…) |
| `lib/conversation-engine.ts` | ✅ | `detectIntent`, stages, memoria de conversación |
| `lib/agent.ts` | ✅ | Loop principal de respuesta con fallback de proveedores IA |
| `lib/architect-ai-core.ts` + 5 módulos | ✅ | Memory / Predictor / Reasoner / Optimizer / Multichannel |
| `lib/app-operator.ts` | ✅ | Protocolo `{reply, actions, done}`; ejecuta create_product, edit_agent, etc. |
| `routes/operator-opencode.ts` + `routes/mcp-bridge.ts` | ✅ | Cerebro OpenCode con tools MCP (`propose_action`) |

### 2.2 Meta / publicidad

| Archivo | Estado | Notas verificadas |
|---|---|---|
| `lib/facebook.ts` | ✅ | FacebookService: campañas, ad sets, insights, presupuestos, catálogo, `resolveInterestIds()` contra taxonomía real |
| `lib/ad-strategist.ts` (~1230 líneas) | ✅ | `WINNING_STRATEGIES_BY_NICHE` (12 nichos), plantilla PAS, imagen IA, borrador, publicación |
| `lib/ad-growth-agent.ts` (~488 líneas) | ✅ | Protección de gasto (1 h), tendencia (6 h), tope diario (15 min); asistido: sugiere y espera "sí 42" |
| `lib/facebook-page-posts.ts`, `facebook-messenger.ts`, `facebook-comments.ts`, `facebook-marketplace.ts` | ✅ | Posts de página, Messenger, comentarios, marketplace |
| `lib/meta-conversions-api.ts` | 🟡 | Solo `sendPurchaseEvent` (purchase); no hay eventos de lead/initiate_checkout |
| `lib/remarketing.ts` + `remarketing-scheduler.ts` | ✅ | Campañas email/WhatsApp a leads; envío progresivo; opt-out firmado con HMAC |
| `routes/facebook.ts` | ✅ | Webhooks con verificación de firma X-Hub-Signature-256 (rechaza sin firma si FB_APP_SECRET está seteado) |
| `lib/tenant-facebook-credentials.ts` + `credentials-vault.ts` | ✅ | Credenciales Meta por tenant, cifradas |

### 2.3 Datos (tablas Drizzle, `lib/db/src/schema/` — 31 tablas)

| Tabla | Uso en el plan |
|---|---|
| `leads` | CRM; `source` texto libre, sin contexto de anuncio → **se agrega `ad_context` JSONB** |
| `conversations` | Canal, agente asignado, estado de pago |
| `messages` | `metadata.adTitle/adBody/adUrl/adId` — el contexto del anuncio YA se guarda acá |
| `payments` | `conversationId`, `leadId`, `productId`, `amount`, `status` — todo lo necesario para ROAS real |
| `follow_ups` | Seguimiento de oportunidades (FollowUpAgent) |
| `facebook_drafts` | Borradores de anuncios con `strategy` (jsonb), `campaignId/adSetId/adId`, `fbStatus` |
| `ad_agent_logs` | Decisiones del agente de crecimiento (suggested/approved/rejected/auto_applied) |
| `architect_memory` | Memoria con `memoryType` (fact, decision, research_evidence, research_result, draft_plan…) y `tags[]` |
| `response_analytics` | Resultados del bot por mensaje (outcome: sale_completed, objection_raised…) |
| `tenants` | `facebookIntegration` jsonb; `isAdmin`; plan |
| `settings` | ⚠️ Global (una fila, sin tenantId) — la config de marketing NO debe ir acá; va en tabla nueva `marketing_budgets` |

### 2.4 Backend / API

- Express en `artifacts/api-server/src/app.ts`; routers montados en `routes/index.ts`.
- Cadena de seguridad: `resolveTenantMiddleware → validateSaasMiddleware → validateLimitsMiddleware` (app.ts:658-660).
- Zod en `lib/api-zod` (generado por orval desde OpenAPI spec; `manual.ts` es el hueco para esquemas manuales).
- Tests: `vitest.config.ts` en api-server + `src/tests/` (patrón para Fase 9).

### 2.5 Frontend

- `artifacts/ventas-pro/src/pages/`: `agents.tsx`, `facebook.tsx`, `leads.tsx`, `conversations.tsx`, `architect.tsx`, `dashboard.tsx`, `admin/facebook-credentials.page.tsx`.
- Patrón de página: `Layout` + hooks de `@workspace/api-client-react` + shadcn/ui.

---

## 3. Brechas priorizadas (verificadas en código)

### 🔴 GAP-1 — Atribución cortada (PRIORIDAD MÁXIMA)
**Evidencia en código:**
- `whatsapp.ts:520` `extraerContextoDeAnuncio()` → `anuncio: {titulo, cuerpo, url, anuncioId}`.
- `whatsapp.ts:1588` lo pasa a `message-handler.handleIncomingMessage({... anuncio})`.
- `services/message-handler.ts:156-164` lo guarda en `messages.metadata` (adTitle, adBody, adUrl, adId).
- **Nunca** se copia a `leads` (creado en `message-handler.ts:99` con `source: "whatsapp"`) ni se cruza con `payments`.
**Consecuencia:** no existe CAC/ROAS reales por anuncio; el sistema optimiza contra "costo por resultado" de Meta (conversaciones, no plata).
**Fix:** columna `leads.ad_context` + copiado al crear lead + módulo `attribution.ts` que cruza con `payments`.

### 🔴 GAP-2 — No existe el dominio MarketingTeam
**Evidencia:** no hay `lib/agency/` ni `lib/marketing-team/`; `ARQUITECTURA_AGENCIA_MARKETING.md` es un plan sin implementar.
**Fix:** crear `lib/marketing-team/` con 14 agentes que DELEGAN en las piezas existentes (no duplican).

### 🟠 GAP-3 — Sin motor de tareas multi-agente
**Evidencia:** `architect-store.ts` (un plan pendiente), `ad_agent_logs` (solo 4 acciones).
**Fix:** tabla `marketing_tasks` con estados del MASTER PLAN + scheduler (patrón `followUpScheduler`).

### 🟠 GAP-4 — Sin experimentos
**Fix:** tabla `marketing_experiments` (hipótesis, control, variante, estado, resultado, aprendizaje) + criterio de decisión basado en muestra (`sampleBasedConfidence` de `ad-growth-agent.ts`).

### 🟠 GAP-5 — Risk/Approval/Audit no generalizados
**Evidencia:** aprobación existe solo en `ad-growth-agent` (WhatsApp "sí 42").
**Fix:** `risk-engine.ts` (LOW/MEDIUM/HIGH/CRITICAL), `approval-engine.ts` (generaliza), `marketing_audit_logs`.

### 🟠 GAP-6 — Memoria de marketing ausente
**Evidencia:** `architect_memory.memoryType` no tiene tipo de aprendizaje de campaña.
**Fix:** extender `MemoryType` con `"marketing_learning"` + convención de tags `marketing:*`, `campaign:<id>`, `product:<id>`.

### 🟡 GAP-7 — Dashboard y chat
**Fix:** página `marketing.tsx` + intents de marketing en `agent-router.ts`/`app-operator.ts`.

### 🟡 GAP-8 — Config de marketing por tenant
**Fix:** tabla `marketing_budgets` con `tenantId` (NO usar `settings`, que es global).

---

## 4. Riesgos de la integración

| Riesgo | Mitigación |
|---|---|
| Romper WhatsApp/ventas al tocar `message-handler.ts` | Cambio mínimo y aditivo (solo cuando `params.anuncio` existe); tests existentes |
| Duplicar integración Meta | Regla: agentes de marketing solo importan `FacebookService`/`ad-strategist`; prohibido Graph directo fuera de `lib/facebook.ts` |
| Aislamiento multi-tenant | Toda tabla nueva con `tenantId` FK; rutas nuevas pasan por la cadena de middlewares existente |
| Gasto accidental en modo autónomo | Guardrails obligatorios en `marketing_budgets` (`max_daily_spend`, `max_budget_change_percent`, `max_scale_percent`, `approval_required`) |
| Atribución falsa | Nunca marcar SUCCESS sin verificación de API; `messages.metadata.adId` (ctwaClid) como fuente primaria |

---

## 5. Línea base de typecheck (verificada 2026-08-18)

El typecheck del api-server (`tsc -p tsconfig.json --noEmit`) **ya venía rojo antes de
esta integración**: al momento de la auditoría registraba **~253 errores preexistentes**
(TS7006 implicit any, TS18046 unknown, TS7030 sin return, desincronizaciones PG/SQLite)
en ~40 archivos que **no tienen relación con marketing** (analytics, facebook, app-operator,
code-agent, tests viejos, etc.). El typecheck de librerías (`tsc --build`) sí pasaba.

Durante la Fase 0–1–5 se corrigieron además **~10 errores preexistentes de bajo riesgo**
que bloqueaban o ensuciaban el gate:
- `@types/node` faltante en `lib/integrations-openai-ai-server` (su tsconfig lo exigía).
- `vite/client` faltante en `artifacts/mockup-sandbox/tsconfig.json`.
- `vitest` no declarado como devDependency del api-server (había 4 archivos de test).
- `vitest.config.ts` era JSON en un `.ts` (inválido) + faltaba `vitest.setup.js`.
- Columnas fantasma/desincronizadas: `conversations.currentProductId` (referenciada en
  webhooks.ts y **no existía en ningún esquema** → se quitó el filtro), `tenants.isActive`
  (se agregó a drizzle PG + SQLite + migraciones), `leads.optOut`/`leads.adContext` en SQLite.
- `sendError()` aceptaba números donde iba `details` (33 callers) → tipo ampliado e ignorados.
- `return` faltantes en catches (pricing, store, marketing) y `(p: any)`/scope fixes
  (whatsapp, public, restore-opencode, tenants).

**Estado verificado al cierre de las Fases 0–1–5:**
- `pnpm run typecheck:libs` → ✅ verde.
- Archivos nuevos del dominio (`lib/marketing-team/**`, `routes/marketing.ts`,
  `message-handler.ts`, tests) → **0 errores**.
- Tests del dominio → **35/35 pasando** (`USE_SQLITE=true npx vitest run
  src/lib/marketing-team/__tests__/`), incluida la integración de atribución real.
- Quedan ~246 errores preexistentes ajenos a marketing (tarea de limpieza separada,
  documentada acá para que nadie los atribuya a esta integración).

## 6. Estado de implementación (fases del MASTER PLAN)

| Fase | Estado | Entregables |
|---|---|---|
| 0. Auditoría | ✅ | Este documento + `README_INTEGRACION_MARKETING_TEAM.md` |
| 1. Domain contract | ✅ | `lib/marketing-team/types.ts` + 5 tablas nuevas (tasks, experiments, campaigns, budgets, audit_logs) + schemas Zod manuales |
| 2. Marketing Team | ✅ (14/14) | Estratega, Researcher, Audience, Offer, Creative, Copy, Memoria, Performance, Diagnostic, **MetaAdsManager, ExperimentManager, OptimizationAgent, BudgetManager, ScalingAgent** |
| 3. Orchestration | ✅ | `orchestrator.ts`: detectIntent, planGrowth, runDiagnosticCycle, formatReport; `routes/marketing.ts` completo + **`POST /api/marketing/chat`** (intents: growth_plan, diagnostic, performance, create_campaign) |
| 4. Meta | ✅ (delegación) | MetaAdsManager envuelve `FacebookService`/`AdStrategist` existentes (listCampaigns, insights, drafts, pause, budget). **Pendiente: verificación en vivo con cuenta real** |
| 5. Sales feedback | ✅ | `attribution.ts` + `leads.ad_context` + copiado en message-handler + endpoints `/api/marketing/attribution` y `/funnel` |
| 6. Optimization | ✅ | ExperimentManager (hipótesis/control/variante, anti-fake por muestra), OptimizationAgent (propuestas priorizadas), ScalingAgent (ganadores con ROAS) |
| 7. Autonomía | ✅ (núcleo) | RiskEngine (LOW/MEDIUM/HIGH/CRITICAL) + BudgetGuard (guardrails) + `canExecuteAutonomously` + audit de cada acción. El flujo de aprobación humana usa el patrón "sí 42" existente |
| 8. Memory | ✅ | `marketing-memory.ts` sobre `architect_memory` (memoryType `marketing_learning` + tags) |
| 9. Testing | 🟡 Parcial | 35 tests pasando (unit + integración de atribución en SQLite). Falta: tests de los 5 agentes nuevos + mocks de Meta + tests del chat |

## 7. Conclusión

El repositorio tiene **60–70 % de la infraestructura** que el MASTER PLAN necesita. La
integración NO es construir una plataforma paralela: es (1) cerrar el eslabón de atribución
(✅ hecho), (2) crear el dominio `lib/marketing-team/` que orquesta los agentes
especializados delegando en las piezas existentes (🟡 en curso), (3) agregar las tablas de
tareas/experimentos/presupuesto/audit con patrón `tenantId` (✅ hecho), y (4) exponer
`routes/marketing.ts` + página en el dashboard (rutas ✅, frontend pendiente). Las fases
restantes continúan en el mismo orden, verificando build y tests en cada fase.
