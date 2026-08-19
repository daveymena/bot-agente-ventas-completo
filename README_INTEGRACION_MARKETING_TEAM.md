# README — Cómo integrar el MASTER PLAN de Marketing & Growth en esta base

> **Qué es este documento**
> Responde a una sola pregunta: *"¿cómo se implementaría el MASTER PLAN de
> Marketing & Growth sobre el repositorio real `bot-agente-ventas-completo`?"*
>
> No es la implementación (no se tocó código). Es la **hoja de ruta de integración**
> que un agente de IA (Claude, OpenCode, etc.) o un desarrollador debe seguir,
> construida sobre el estado **verificado** del repo en la fecha de este documento.
>
> **Lecturas obligatorias antes de tocar cualquier archivo** (regla de oro del repo):
> 1. `AGENTS.md` — reglas del proyecto y quick start.
> 2. `API_MOTOR_EJECUTIVO.md` — mapeo completo de endpoints del API.
> 3. `ARQUITECTURA_AGENCIA_MARKETING.md` — plan previo de "agencia de marketing" (7 roles).
> 4. `AUDIT_REPORT.md` — auditoría de seguridad y funcionalidad.
> 5. `DOCUMENTACION_PLATAFORMA.md` — estado de la plataforma y pendientes.
> 6. `HANDOFF_ARQUITECTO_FACEBOOK.md` — fixes de Meta/Arquitecto ya aplicados.
> 7. El propio `MASTER_PLAN_MARKETING_TEAM_INTEGRACION.md` (el documento objetivo).
>
> **Regla de oro:** reutilizar antes de crear. **NO reescribir el proyecto desde cero.**

---

## 1. La base real (inventario verificado)

### 1.1 Stack y estructura

| Capa | Ubicación | Qué es |
|---|---|---|
| Monorepo | raíz (`pnpm-workspace.yaml`) | pnpm workspaces, ESM, Node 22+ |
| Backend | `artifacts/api-server/` | Express (puerto 3002), esbuild, ESM |
| Dashboard admin | `artifacts/ventas-pro/` | React 19 + Vite + Tailwind + shadcn/ui |
| Tienda pública | `packages/tienda/` | Storefront React + Vite (app separada) |
| Base de datos | `lib/db/` | Drizzle ORM, dual **SQLite (dev) / PostgreSQL (prod)** — **31 tablas** exportadas en `lib/db/src/schema/*.ts` |
| Validación | `lib/api-zod/` | Esquemas Zod de todos los endpoints |
| Cliente API | `lib/api-client-react/` | Hooks React Query (generados del spec) |
| IA | `lib/integrations-openai-ai-server/` | 30+ proveedores, fallback `opencode → groq → github → openrouter` |
| Agentes de IA | `.claude/`, `.opencode/`, `opencode-core/`, `OpenCode-puete-ia/` | Configuración y puentes para agentes de código |

### 1.2 Componentes que ya existen y son reutilizables

| Componente | Archivo(s) | Qué hace hoy |
|---|---|---|
| **Agentes de ventas (personas)** | `artifacts/api-server/src/lib/agent-templates.ts` | 11 plantillas de agente (Sofía/general, dropshipping, digital, servicios, telecom, **marketing**, cursos, b2b, suscripciones, follow-up, architect) con prompt + stages |
| **Router de agentes** | `lib/agent-router.ts` | Scoring por palabras clave → elige el agente activo para cada mensaje |
| **Motor de conversación** | `lib/conversation-engine.ts` + `lib/agent.ts` | Intentos, stages, memoria de conversación, respuestas hardcodeadas, fallback |
| **Orquestador analítico (Architect IA)** | `lib/architect-ai-core.ts`, `lib/architect-{memory,predictor,reasoner,optimizer,multichannel}.ts` | Motor "cerebro" con memoria, predicción, razonamiento, optimización y multichannel |
| **Memoria persistente** | `lib/architect-memory-service.ts` + tabla `architect_memory` | `memoryType` (fact, preference, decision, observation, instruction, reflection, research_evidence, research_result, draft_plan), `tags[]`, `metadata` |
| **Operador con ejecución real** | `lib/app-operator.ts`, `routes/code-agent.ts`, `routes/operator-opencode.ts`, `routes/mcp-bridge.ts` | Chat admin que EJECUTA acciones (crear producto, editar agente, etc.) con protocolo JSON `{reply, actions, done}`; confirmación por `architect-store.ts` (`getPendingPlan/isApproval/isRejection`, patrón "sí 42") |
| **Meta / Facebook Ads** | `lib/facebook.ts` (FacebookService, Graph v21.0), `lib/facebook-page-posts.ts`, `lib/facebook-messenger.ts`, `lib/facebook-comments.ts`, `lib/facebook-marketplace.ts` | Cuentas, campañas, ad sets, insights, presupuestos, catálogo, posts de página |
| **Estratega de anuncios** | `lib/ad-strategist.ts` (~1230 líneas) | Elige estrategia por nicho (`WINNING_STRATEGIES_BY_NICHE`), arma copy (plantilla PAS), genera imagen con IA, guarda borrador, publica en Meta |
| **Agente de crecimiento (asistido)** | `lib/ad-growth-agent.ts` (~488 líneas) | Protección de gasto (1 h), revisión de tendencia (6 h), tope diario (15 min). **Nunca ejecuta solo**: sugiere por WhatsApp y espera aprobación del admin |
| **Registro de decisiones de ads** | tabla `ad_agent_logs` | `checkType`, `status` (suggested/approved/rejected/auto_applied/no_action), `suggestedAction`, `metricsSnapshot` |
| **Borradores de anuncios** | tabla `facebook_drafts` | `campaignId`, `adSetId`, `adId`, `strategy` (jsonb), `primaryText`, `headline`, `description`, `images[]`, `niche`, `budget`, `fbStatus` |
| **Píxel / Conversions API** | `lib/meta-conversions-api.ts` | `sendPurchaseEvent` (hoy solo purchase) |
| **Remarketing** | `lib/remarketing.ts` + `lib/remarketing-scheduler.ts` | Campañas de email/WhatsApp a leads, progresivas (no masivas), opt-out firmado |
| **CRM / leads** | `lib/leadScoring.ts`, `lib/sales-ai.ts`, `lib/objectionHandler.ts`, `lib/followUpScheduler.ts` | Scoring, manejo de objeciones, follow-ups |
| **WhatsApp** | `lib/whatsapp.ts`, `lib/whatsapp-factory.ts`, `lib/whatsapp-singleton.ts`, `lib/whatsappManagerByTenant.ts` | Baileys, sesiones por tenant; `extraerContextoDeAnuncio()` lee `externalAdReply` de Meta (adTitle, adBody, adUrl, ctwaClid) y lo guarda en `messages.metadata` |
| **Datos de venta** | tablas `leads`, `conversations`, `messages`, `follow_ups`, `payments` | `payments` ya tiene `conversationId`, `leadId`, `productId`, `amount`, `method`, `status`, `verificationSource` |
| **Tienda / productos** | `routes/store.ts`, `routes/products.ts`, `packages/tienda`, tablas `stores`, `store_products`, `store_categories`, `store_layouts` | Storefront público con checkout y pagos |
| **Multi-tenant + auth + seguridad** | `middlewares resolveTenantMiddleware / validateSaasMiddleware / validateLimitsMiddleware` (app.ts), `tenants` (con `facebookIntegration` jsonb), `security-shield.ts`, `credentials-vault.ts` (encriptación de credenciales FB) | Aislamiento por `tenantId`, JWT, límites por plan, credenciales cifradas |
| **Dashboard existente** | `artifacts/ventas-pro/src/pages/{agents,facebook,leads,conversations,architect,dashboard,admin/facebook-credentials}.tsx` | Gestión de agentes, anuncios FB, leads, chat, Architect IA |
| **Documentación** | `ARQUITECTURA_AGENCIA_MARKETING.md`, `ARCHITECT_IA_DIAGNOSTICO.md`, `ARQUITECTURA_ANALISIS.md`, `FACEBOOK_PIXEL_CONFIG.md`, `ESTADO_ANUNCIOS_ATLAS.md`, etc. | Planes, diagnósticos y estados previos (algunos describen funcionalidad que hoy ya existe) |

> ⚠️ **Importante:** `ARQUITECTURA_AGENCIA_MARKETING.md` propone un equipo de 7 roles
> (`lib/agency/account-director.ts`, etc.) — **ese directorio `lib/agency/` NO existe todavía
> en el código**: es un plan previo, no una implementación. El MASTER PLAN que queremos
> integrar es la generalización de esa misma idea. Ver sección 3.

---

## 2. Mapeo del MASTER PLAN → base real

| Sección del MASTER PLAN | Estado en esta base | Dónde encajaría / qué reutilizar |
|---|---|---|
| **2. Visión (Orquestador + equipos)** | 🟡 Parcial | Ya hay un "cerebro" (Architect IA) y un operador que ejecuta. Falta el concepto de *equipos/dominios* (Ventas, Marketing, Tienda) como capa explícita |
| **3–5. Objetivo y MarketingTeam (14 agentes)** | 🔴 No existe como dominio | `ad-strategist` + `ad-growth-agent` cubren solo el rol "media buyer/optimizador". Faltan strategist, researcher, audience, offer, creative, copywriter, experiments, performance, diagnostics, budget, scaling |
| **6–13. Responsabilidades de cada agente** | 🔴 Parcial | Ver tabla 1.2: hay piezas sueltas (facebook.ts, ad-strategist, meta-conversions-api) que se reutilizan, no se reescriben |
| **14. Integración con Sales Team** | 🔴 Rota | **Eslabón crítico:** `extraerContextoDeAnuncio()` guarda el contexto del anuncio en `messages.metadata` y ahí muere: no se copia a `leads` ni se cruza con `payments`. No existe CAC/ROAS reales (documentado en `ARQUITECTURA_AGENCIA_MARKETING.md`) |
| **15–16. Closed-loop / "el negocio no crece"** | 🔴 No existe | Es comportamiento del orquestador de marketing (a construir) sobre los datos existentes |
| **20–21. Sistema de tareas (Task) y handoffs** | 🟡 Parcial | `architect-store.ts` tiene *un* plan pendiente por turno; no hay motor multi-agente con dependencias/estados |
| **22–23. Tools y permisos; Risk / Approval / Audit** | 🟡 Parcial | Patrón de aprobación por WhatsApp ya existe (`isApproval/isRejection` "sí 42" en ad-growth-agent). Falta clasificación de riesgo (LOW/MEDIUM/HIGH/CRITICAL) y audit log general (hoy solo `ad_agent_logs`) |
| **26. Multi-tenant** | 🟢 Sólido | Patrón `tenantId` en todas las tablas + middlewares. Se replica el patrón, no se inventa otro |
| **27. Meta Integration** | 🟢 Existe y funciona | `FacebookService` + `ad-strategist` + `facebook_drafts` + `facebook-credentials`. **Prohibido duplicar** |
| **28–29. Dashboard y chat del orquestador** | 🟡 Parcial | Dashboard: existe `facebook.tsx` (gestión de anuncios) pero no un panel de Marketing. Chat: existe el App Operator (chat admin) que se puede extender |
| **31–33. Memoria del negocio, growth loop, no confundir automatización con inteligencia** | 🟡 Parcial | `architect_memory` es reutilizable (memoryType + tags). Faltan tipos/memoria de campaña, creativo, experimento, ganador/perdedor |
| **35–38. Fases 0–9, reglas, criterio de terminado** | — | Ver sección 7 de este README (plan adaptado a esta base) |

---

## 3. Brechas reales (GAP analysis)

1. **🔴 Atribución cortada (prioridad #1).** El dato existe y se tira:
   `whatsapp.ts → extraerContextoDeAnuncio()` → `messages.metadata.adTitle/adBody/adUrl/adId` →
   nunca llega a `leads` ni se cruza con `payments`. Sin esto **ningún** agente de marketing
   puede medir CAC/ROAS reales y el sistema optimiza contra lo que Meta reporta (conversaciones
   iniciadas), no contra plata cobrada.

2. **🔴 No existe el dominio MarketingTeam.** Lo más cercano son dos piezas del rol
   "media buyer" (`ad-strategist` + `ad-growth-agent`) y la persona "Andrés" de
   `agent-templates.ts`, que **vende** marketing como servicio — no opera el crecimiento
   del negocio del tenant.

3. **🟠 Sin motor de tareas multi-agente.** `architect-store.ts` maneja una acción pendiente
   por turno. Un equipo de 14 agentes necesita `Task {parentTaskId, dependencies, status,
   approvalRequired}` con estados (PENDING…CANCELLED).

4. **🟠 Sin motor de experimentos.** No existe tabla ni lógica de hipótesis/control/variante/
   resultado. `ad_agent_logs` registra acciones, `facebook_drafts.strategy` guarda la estrategia
   usada, pero no hay noción de A/B con criterio de decisión.

5. **🟠 Sin Risk/Approval/Audit generalizados.** El patrón "sugerir → aprobar por WhatsApp"
   ya funciona (ad-growth-agent). Falta generalizarlo: clasificación de riesgo por acción,
   guardrails de presupuesto (`max_daily_spend`, `max_budget_change_percent`,
   `max_scale_percent`, `approval_required`) y un audit log que cubra a todos los agentes.

6. **🟠 Memoria de marketing ausente.** `architect_memory` sirve de infraestructura, pero
   faltan tipos de aprendizaje: campaña ganadora/perdedora, hook que funcionó, objeto
   comunes de los clientes, ROAS por ángulo.

7. **🟡 Dashboard y chat.** No hay página "Marketing" en `ventas-pro`; el chat admin
   (App Operator) no entiende aún intents de marketing ("crea una campaña", "¿qué está
   fallando?").

8. **🟡 `settings` es global (una fila, sin `tenantId`).** La configuración de marketing
   por tenant debe vivir en `tenants` (jsonb, como ya hace con `facebookIntegration`) o en
   tablas nuevas con `tenantId`.

---

## 4. Arquitectura objetivo sobre esta base

### 4.1 Dónde viviría cada pieza (propuesta de ubicación)

```
artifacts/api-server/src/lib/marketing-team/          ← NUEVO dominio (equipo)
├── types.ts                  ← Contratos: MarketingTask, AgentHandoff, Risk, Approval,
│                                Experiment, Insight, Learning, CampaignPlan
├── orchestrator.ts           ← detectIntent → selectAgents → createTasks → resolveDependencies
│                                → execute → collectResults → synthesize → report
├── agents/
│   ├── marketing-strategist.ts
│   ├── market-researcher.ts
│   ├── audience-strategist.ts
│   ├── offer-strategist.ts
│   ├── creative-director.ts
│   ├── copywriter.ts
│   ├── meta-ads-manager.ts   ← DELEGA en FacebookService/ad-strategist (nada nuevo de Meta)
│   ├── experiment-manager.ts
│   ├── performance-analyst.ts
│   ├── diagnostic-agent.ts
│   ├── optimization-agent.ts
│   ├── budget-manager.ts
│   ├── scaling-agent.ts
│   └── marketing-memory.ts   ← Envuelve architectMemoryService
├── attribution.ts            ← Cierra el circuito ad → lead → venta (brecha #1)
├── risk-engine.ts            ← LOW / MEDIUM / HIGH / CRITICAL por acción
├── approval-engine.ts        ← Generaliza el patrón "sí 42" (architect-store.isApproval)
└── audit-log.ts              ← Escribe en marketing_audit_log

artifacts/api-server/src/routes/marketing.ts           ← NUEVO router: /api/marketing/*
lib/db/src/schema/…                                    ← Tablas nuevas (ver 4.2)
lib/api-zod/                                            ← Schemas Zod de /api/marketing/*
lib/api-client-react/                                  ← Hooks generados para el frontend
artifacts/ventas-pro/src/pages/marketing.tsx            ← Panel de Marketing (ver 4.6)
```

### 4.2 Tablas nuevas (patrón `tenantId`, Drizzle en `lib/db/src/schema/`)

| Tabla propuesta | Campos clave (según MASTER PLAN §27) |
|---|---|
| `marketing_tasks` | id, tenantId, parentTaskId, requestedBy, assignedAgent, domain, action, priority, status (PENDING/PLANNING/RUNNING/WAITING_APPROVAL/BLOCKED/COMPLETED/FAILED/CANCELLED), input, output, dependencies, risk, approvalRequired, timestamps |
| `marketing_experiments` | id, tenantId, productId, campaignId, hypothesis, variable, control, variant, budget, duration, status (EN_PRUEBA/GANADOR/PERDEDOR/INCONCLUSO), result, conclusion, learning |
| `marketing_campaigns` | id, tenantId, productId, name, objective, status, budget, metaIds (campaignId/adSetId/adId jsonb), kpis, createdAt |
| `marketing_budgets` | tenantId, maxDailySpend, maxBudgetChangePercent, maxScalePercent, approvalRequired, currentSpend, currency |
| `marketing_audit_log` | timestamp, tenantId, agent, taskId, action, resource, before, after, approval, result, error, requestId |

**Cambios sobre tablas existentes:**
- `leads` → agregar `adContext jsonb` (`adTitle`, `adBody`, `adUrl`, `adId`/`ctwaClid`) para cerrar atribución.
- `architect_memory` → extender `MemoryType` (en `lib/db/src/schema/architect-memory.ts`) con
  `"marketing_learning"` y convención de tags (`marketing:*`, `campaign:<id>`, `product:<id>`).
- `settings` → NO tocarla (es global); la config de marketing va en `marketing_budgets`/`tenants`.

### 4.3 Contratos (Fase 1 del plan)

Los contratos se definen en `types.ts` + `lib/api-zod`, **reutilizando lo que ya exista**
(no duplicar): `AgentHandoff` puede partir del resultado JSON ya usado por
`app-operator.ts` (`{reply, actions, done}`) y de `AgentStage` (`lib/db/src/schema/agents.ts`).

```ts
// sketch conceptual (NO implementado)
type MarketingTask = {
  id: string; organizationId: number; parentTaskId?: string;
  requestedBy: string; assignedAgent: string; domain: "marketing";
  action: string; priority: "low" | "medium" | "high";
  status: "PENDING" | "PLANNING" | "RUNNING" | "WAITING_APPROVAL"
        | "BLOCKED" | "COMPLETED" | "FAILED" | "CANCELLED";
  input: Record<string, unknown>; output?: Record<string, unknown>;
  dependencies: string[]; risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  approvalRequired: boolean; createdAt: Date; updatedAt: Date;
};
```

### 4.4 Orquestación: cómo se conecta sin crear otro sistema

El MASTER PLAN pide "un Orquestador", pero el repo ya tiene piezas que cumplen ese rol.
**No se crea un orquestador nuevo**: se **extiende** lo existente.

| Capacidad del plan | Pieza existente a extender |
|---|---|
| `detect_intent` | `conversation-engine.detectIntent()` + `agent-router.ts` (agregar dominio `marketing` al scoring) |
| `select_agents` | `agent-router.ts` o el nuevo `marketing-team/orchestrator.ts` elige agentes del equipo |
| `create_tasks` / `resolve_dependencies` | Nueva tabla `marketing_tasks` + scheduler (patrón de `followUpScheduler.ts`/`remarketing-scheduler.ts`) |
| `execute` | `app-operator.ts` (tools) + `operator-opencode.ts` (cerebro OpenCode vía MCP) para acciones; agentes de marketing para análisis |
| `collect_results` / `synthesize` / `report` | `architect-ai-core.ts` (reasoner/synthesize) + formato de respuesta (emojis semánticos, ya usado en prompts de agentes) |

### 4.5 Chat del orquestador

- **Admin (dashboard):** extender `app-operator.ts` / `operator-opencode.ts` con tools
  read-only de marketing (`read_campaign_insights`, `read_experiments`, `list_learnings`)
  y `propose_action` (ya existe en `opencode-mcp-tools.ts`) para cambios con riesgo.
- **WhatsApp (usuario final):** el flujo normal de `agent.ts` → si el intent es de
  crecimiento ("quiero vender más el curso de piano"), derivar al dominio marketing.

### 4.6 Dashboard (integrar, no crear app aparte)

Nueva página `artifacts/ventas-pro/src/pages/marketing.tsx` (mismo patrón que
`facebook.tsx`/`agents.tsx`): campañas activas, experimentos, alertas, recomendaciones,
tareas, creativos, presupuesto, resultados, aprendizajes. Navegación agregada al layout.

---

## 5. Integraciones clave (cómo se haría cada una)

### 5.1 Cerrar la atribución (PRIORIDAD #1 — desbloquea todo lo demás)

```
Meta click-to-WhatsApp
   ↓ externalAdReply (título, cuerpo, url, ctwaClid)
whatsapp.ts → extraerContextoDeAnuncio()   [YA funciona]
   ↓
messages.metadata {adTitle, adBody, adUrl, adId}   [YA se guarda]
   ↓   NUEVO: al crear/actualizar el lead
leads.adContext (jsonb)
   ↓   NUEVO: JOIN analytics
payments (conversationId, leadId, productId, amount)  [YA tiene los campos]
   ↓
CAC y ROAS REALES por anuncio/campaña  → alimenta PerformanceAnalyst, ScalingAgent, DiagnosticAgent
```

Entregable concreto: `lib/marketing-team/attribution.ts` + migración SQL
(`lib/db/migrations/` ya tiene el patrón de migraciones) + endpoint de reporte.

### 5.2 Meta Ads Manager (reutilizar, nunca duplicar)

- `meta-ads-manager.ts` envuelve a `FacebookService` (`lib/facebook.ts`) y a
  `ad-strategist.ts` (borradores) — **no crea endpoints nuevos de Graph API**.
- Estados verificables: toda acción se marca `SUCCESS` solo si la API respondió el ID/estado
  (ej.: `facebook_drafts.campaignId/adSetId/adId` ya se llenan al crear en Meta).
- Si falta permiso/capacidad → devolver `MANUAL_ACTION_REQUIRED`.
- Webhooks/Conversions API: extender `meta-conversions-api.ts` (hoy solo
  `sendPurchaseEvent`) solo si hace falta un evento distinto.

### 5.3 Aprobaciones y riesgo (generalizar lo que ya existe)

- `risk-engine.ts`: tabla de clasificación del MASTER PLAN (§30) — leer métricas LOW,
  crear borrador LOW, crear/pausar anuncio MEDIUM, cambiar/escalar presupuesto HIGH,
  facturación/administradores CRITICAL.
- `approval-engine.ts`: generaliza el flujo de `ad-growth-agent.ts`
  (sugerir → registrar en `ad_agent_logs` → notificar por WhatsApp → `isApproval/isRejection`
  "sí 42" → ejecutar → verificar → auditar). Nunca "fingir" éxito: verificar con la API.

### 5.4 Memoria de marketing

- `marketing-memory.ts` envuelve `architectMemoryService` con `tenantId` + tags
  (`marketing:winner`, `marketing:loser`, `hook:<texto>`, `audience:25-44`,
  `experiment:<id>`, `product:<id>`).
- Cada ciclo de planificación consulta la memoria ANTES de crear (el plan §19 lo exige).

### 5.5 Multi-tenant (replicar el patrón existente)

- Toda tabla nueva lleva `tenantId` con FK a `tenants` (onDelete cascade), igual que
  `ad_agent_logs`, `facebook_drafts`, etc.
- Las rutas nuevas pasan por la cadena existente de middlewares
  (`resolveTenantMiddleware → validateSaasMiddleware → validateLimitsMiddleware`).
- Credenciales Meta ya están cifradas por tenant (`tenant-facebook-credentials.ts` +
  `credentials-vault.ts`) — el equipo de marketing las consume, nunca las reemplaza.

---

## 6. Flujos de ejemplo (de punta a punta)

### 6.1 "Quiero vender más el curso de piano"

```
Usuario (chat admin o WhatsApp) → orchestrator.detectIntent("vender más el curso de piano")
  → selectAgents: [Product Agent → MarketResearcher → MarketingStrategist →
                   AudienceStrategist → OfferStrategist → CreativeDirector →
                   Copywriter → MetaAdsManager → ExperimentManager]
  → createTasks en marketing_tasks (con dependencias)
  → ejecución:
       1. Product Agent lee el producto real (routes/products.ts + tabla products)
       2. Researcher consulta memoria (¿qué ganó antes?) + investigación (research_result)
       3. Estratega define ángulo/oferta/KPIs (borrador de plan)
       4. Creative + Copy producen N variantes (primary text, headline, CTA)
       5. MetaAdsManager crea borradores en facebook_drafts (NO publica sin aprobación)
       6. Si hay presupuesto → ApprovalEngine pide aprobación al admin por WhatsApp
  → collectResults + synthesize → reporte formateado (🎯/📊/🚀)
  → marketing-memory guarda el plan y las variantes
```

### 6.2 "Las campañas funcionan pero el negocio no crece"

```
PerformanceAnalyst: leads ↑, ventas ↓ → DiagnosticAgent revisa el embudo completo:
  CTR 🟢 → CPC 🟢 → leads 🟢 → ventas 🔴
  Conclusión: el problema NO es adquisición.
  Acción: NO subir presupuesto. Deriva a:
    - SalesAgent (sales-ai.ts) / calidad de lead
    - FollowUpAgent (followUpScheduler.ts) / seguimiento
    - OfferStrategist / oferta y precio
  Si el problema sale del dominio marketing → el orquestador activa OTRO equipo
  (store, ventas, productos) — el MASTER PLAN §25 lo exige.
```

### 6.3 Fatiga creativa (decisión autónoma dentro de límites)

```
Datos: CTR ↓, CPC ↑, frequency ↑, CPA ↑ → DiagnosticAgent: "compatible con fatiga creativa"
  → OptimizationAgent: hipótesis + plan (3 conceptos nuevos, ganador como control)
  → Risk: MEDIUM → si approvalRequired=false y dentro de max_budget_change_percent
     → ejecuta y audita; si no, botones [Revisar] [Aprobar] [Rechazar]
```

---

## 7. Plan por fases (adaptado a esta base)

| Fase | Entregable concreto | Archivos |
|---|---|---|
| **0. Auditoría** | `MARKETING_INTEGRATION_AUDIT.md` (verificar TODO lo de la sección 1 antes de tocar código; fuente: `AUDIT_REPORT.md`, `ARQUITECTURA_AGENCIA_MARKETING.md`, este README) | raíz |
| **1. Domain contract** | `marketing-team/types.ts` + schemas Zod + tablas nuevas (4.2) | `lib/marketing-team/types.ts`, `lib/api-zod`, `lib/db/src/schema/` |
| **2. Marketing Team** | Los 14 agentes (6–13 del plan) como módulos; los que solo analizan primero (sin ejecución) | `lib/marketing-team/agents/*.ts` |
| **3. Orchestration** | `orchestrator.ts` + `routes/marketing.ts` (`/api/marketing/tasks|experiments|campaigns|insights`) + intents en `agent-router.ts`/`conversation-engine.ts` | `lib/marketing-team/orchestrator.ts`, `routes/marketing.ts`, `routes/index.ts` |
| **4. Meta** | Conectar agentes a `FacebookService`/`ad-strategist`/`facebook_drafts` (cero infraestructura nueva) | `lib/marketing-team/agents/meta-ads-manager.ts` |
| **5. Sales feedback** | `attribution.ts` + `leads.adContext` + endpoint de CAC/ROAS reales | `lib/marketing-team/attribution.ts`, migración, `routes/marketing.ts` |
| **6. Optimization** | ExperimentManager + PerformanceAnalyst + DiagnosticAgent + OptimizationAgent + Scaler | `lib/marketing-team/agents/…` |
| **7. Autonomía** | `risk-engine.ts`, `approval-engine.ts`, guardrails de presupuesto (generalizar ad-growth-agent) | `lib/marketing-team/{risk-engine,approval-engine}.ts` |
| **8. Memory** | `marketing-memory.ts` + `MemoryType "marketing_learning"` + consulta obligatoria en cada ciclo | `lib/marketing-team/agents/marketing-memory.ts`, `lib/db/src/schema/architect-memory.ts` |
| **9. Testing** | Unit + integración + mocks de Meta + multi-tenant + permisos + riesgo + aprobación (ya hay `vitest.config.ts` y `src/tests/`) | `artifacts/api-server/src/tests/marketing/` |

> Orden recomendado de implementación real: **Fase 0 → 5 (atribución) → 2 (análisis) →
> 1 → 3 → 4 → 6 → 8 → 7 → 9**. Sin atribución, nada de optimización tiene sentido.

---

## 8. Reglas de integración y criterio de terminado

**Reglas (heredadas de `AGENTS.md` y del propio MASTER PLAN §43):**

1. Leer antes de tocar: `AGENTS.md`, `.claude/`, `.opencode/`, `opencode-core/`,
   `OpenCode-puete-ia/`, `API_MOTOR_EJECUTIVO.md`, `ARQUITECTURA_AGENCIA_MARKETING.md`.
2. **Reutilizar antes de crear** (Meta, orquestador, memoria, approvals, multi-tenant).
3. NO: reescribir todo, duplicar servicios, crear otro orquestador, crear otro sistema de
   agentes, reemplazar la integración Meta, romper tienda/ventas/WhatsApp, borrar docs.
4. Si una implementación existente resuelve la necesidad → extenderla, no reemplazarla.

**Criterio de terminado (MASTER PLAN §44):** una feature no está terminada porque compile:
debe funcionar, estar integrada, manejar errores, respetar permisos y multi-tenancy, tener
logs, validación, pruebas, documentación y no romper lo existente.

---

## 9. Decisiones que necesita el dueño antes de empezar

1. **Nivel de autonomía:** ¿el sistema puede ejecutar solo acciones de riesgo MEDIUM/HIGH
   dentro de límites, o todo cambio real requiere aprobación humana? (Hoy el repo es
   conservador: asistido, no autónomo.)
2. **Guardrails de presupuesto:** valores de `max_daily_spend`, `max_budget_change_percent`,
   `max_scale_percent` por plan (basic/pro/…).
3. **Alcance de canales:** ¿solo Meta (lo que ya está integrado) o preparar la capa para
   Google/TikTok/orgánico en el futuro?
4. **Ventana de prueba mínima** para declarar ganador/perdedor en experimentos (muestra
   mínima e impresiones, siguiendo el patrón `sampleBasedConfidence` de `ad-growth-agent.ts`).
5. **Dónde vive el plan de agencia previo:** `ARQUITECTURA_AGENCIA_MARKETING.md` (7 roles)
   y el MASTER PLAN (14 agentes) deben reconciliarse en una sola arquitectura — se propone
   que el MASTER PLAN sea la referencia y la doc previa se marque como superada.

---

## 10. Resumen en una página

La base ya tiene el 60–70 % de la infraestructura que el MASTER PLAN necesita: agentes con
personas y router, un cerebro (Architect IA), un operador que ejecuta con aprobaciones, la
integración oficial de Meta funcionando, CRM/ventas/WhatsApp, memoria persistente y
multi-tenant sólido. **Lo que falta no es "construir una plataforma de marketing", sino
agregar un dominio `marketing-team` que reúna las piezas sueltas** (estratega, research,
creative, copy, experimentos, diagnóstico, presupuesto, escalado) **y cerrar el eslabón de
atribución** para que todo el sistema optimice contra ventas reales y no contra lo que
reporta Meta. Cada pieza nueva es un módulo dentro de `lib/marketing-team/`, una tabla con
`tenantId`, un router `/api/marketing/*` y una página en el dashboard existente — siguiendo
los patrones que el repo ya usa.
