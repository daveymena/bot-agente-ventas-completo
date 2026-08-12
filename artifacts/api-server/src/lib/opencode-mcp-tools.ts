/**
 * Puente entre las herramientas del operador (`app-operator.ts`) y el
 * protocolo MCP que espera OpenCode (el nuevo cerebro de Atlas, ver
 * `routes/mcp-bridge.ts`).
 *
 * Reglas de seguridad de este archivo (no negociables, ver el plan
 * aprobado "Reemplazar el cerebro de Atlas por OpenCode"):
 * - El set de herramientas expuestas se DERIVA de `READ_ONLY_TOOLS`
 *   (`app-operator.ts`), nunca se hardcodea una lista separada -- así una
 *   herramienta de lectura nueva queda expuesta automáticamente y una
 *   herramienta de mutación nueva automáticamente NO lo está.
 * - `web_search`/`deep_research` se excluyen a propósito: OpenCode ya trae
 *   su propio buscador real (decisión explícita del usuario).
 * - Ninguna herramienta de mutación (`create_product`, `fb_create_ad`,
 *   `dropi_create_order`, etc.) se expone jamás como tool MCP. La única
 *   forma que OpenCode tiene de proponer un cambio es `propose_action`,
 *   que NUNCA ejecuta nada -- solo guarda un borrador para que el admin lo
 *   confirme por el mismo camino que ya existe (`isApproval` +
 *   `executeAction` en `routes/code-agent.ts`, sin tocar).
 */
import { db, architectMemory, type ArchitectMemory } from "@workspace/db";
import {
  executeAction,
  isKnownTool,
  isReadOnlyTool,
  READ_ONLY_TOOLS,
  type OperatorContext,
} from "./app-operator";
import { logger } from "./logger";

// CAUSA RAÍZ de que Atlas nunca investigara (encontrada 2026-08-12): acá se
// excluían `web_search` y `deep_research` porque el plan original asumía que
// OpenCode iba a usar SU PROPIO buscador nativo. Pero ese buscador nativo se
// colgaba y quemaba el turno entero, así que se apagaron las herramientas
// nativas en operator-opencode.ts... y con esta exclusión todavía acá, el
// modelo quedó SIN NINGUNA forma de investigar: contestaba "voy a investigar"
// y no pasaba nada, sin dejar una sola fila en `architect_memory`. Ahora se
// exponen las nuestras, que además corren en segundo plano y no bloquean.
// Se deja el Set (vacío) a propósito: es el lugar natural donde excluir algo
// del puente MCP si hiciera falta más adelante.
const EXCLUDED_FROM_MCP = new Set<string>([]);

/** JSON Schema mínimo por herramienta, a mano -- son datos sensibles
 * (scoping, montos, ids), preferible explícito a inferido del string libre
 * `args` que usa el loop legado. Si se agrega una herramienta de lectura
 * nueva sin entrada acá, cae al esquema genérico permisivo de abajo (con
 * warning en el log) para no romper el arranque -- pero conviene agregarle
 * un esquema real pronto.
 */
const TOOL_SCHEMAS: Record<string, object> = {
  analyze_system: { type: "object", properties: {}, additionalProperties: false },
  research_start: {
    type: "object",
    properties: {
      instruccion: { type: "string", description: "Qué investigar, en lenguaje natural. Ej: 'qué ángulos funcionan hoy en anuncios de cursos de piano online para adultos'" },
    },
    required: ["instruccion"],
    additionalProperties: false,
  },
  research_check: { type: "object", properties: {}, additionalProperties: false },
  fb_ad_library: {
    type: "object",
    properties: {
      query: { type: "string", description: "Nicho o producto a espiar, ej: 'curso de piano'" },
      pais: { type: "string", description: "Código ISO2 del país, por defecto CO" },
      limite: { type: "number", description: "Cuántos anuncios traer, por defecto 8" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  deep_research: {
    type: "object",
    properties: {
      instruccion: { type: "string", description: "Qué investigar, en lenguaje natural." },
    },
    required: ["instruccion"],
    additionalProperties: false,
  },
  web_search: {
    type: "object",
    properties: {
      query: { type: "string", description: "Qué buscar" },
      limit: { type: "number", description: "Cuántos resultados, por defecto 6" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  list_products: {
    type: "object",
    properties: {
      limit: { type: "number" },
      search: { type: "string", description: "Filtra por nombre, sin distinguir mayúsculas" },
    },
    additionalProperties: false,
  },
  list_categories: { type: "object", properties: {}, additionalProperties: false },
  get_agent: { type: "object", properties: {}, additionalProperties: false },
  get_settings: { type: "object", properties: {}, additionalProperties: false },
  get_store: { type: "object", properties: {}, additionalProperties: false },
  payment_status: { type: "object", properties: {}, additionalProperties: false },
  fb_status: { type: "object", properties: {}, additionalProperties: false },
  fb_suggest_audience: {
    type: "object",
    properties: { productId: { type: "number" } },
    required: ["productId"],
    additionalProperties: false,
  },
  generate_image: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      purpose: { type: "string", enum: ["ad_feed", "ad_story", "card", "square"] },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  fb_page_can_post: { type: "object", properties: {}, additionalProperties: false },
  fb_page_preview: {
    type: "object",
    properties: { productId: { type: "number" } },
    required: ["productId"],
    additionalProperties: false,
  },
  fb_list_drafts: { type: "object", properties: {}, additionalProperties: false },
  fb_agent_logs: {
    type: "object",
    properties: {
      limit: { type: "number" },
      checkType: { type: "string", enum: ["spend_protection", "trend_review", "daily_cap"] },
      status: { type: "string", enum: ["suggested", "applied", "rejected", "no_action"] },
    },
    additionalProperties: false,
  },
  fb_campaign_metrics: {
    type: "object",
    properties: {
      campaignIds: { type: "array", items: { type: "string" } },
      days: { type: "number" },
    },
    additionalProperties: false,
  },
  whatsapp_status: { type: "object", properties: {}, additionalProperties: false },
  dashboard_summary: { type: "object", properties: {}, additionalProperties: false },
  list_recent_conversations: {
    type: "object",
    properties: { limit: { type: "number" } },
    additionalProperties: false,
  },
  predict_customer: {
    type: "object",
    properties: { phone: { type: "string", description: "Número o parte del número del cliente" } },
    required: ["phone"],
    additionalProperties: false,
  },
  optimize_price: {
    type: "object",
    properties: { productId: { type: "number" } },
    required: ["productId"],
    additionalProperties: false,
  },
  optimize_copy: {
    type: "object",
    properties: { productId: { type: "number" } },
    required: ["productId"],
    additionalProperties: false,
  },
  analyze_channel_performance: { type: "object", properties: {}, additionalProperties: false },
  reason_business_decision: {
    type: "object",
    properties: {
      situation: { type: "string", description: 'Ej: "bajar el precio del curso de piano"' },
      data: { type: "object", description: "Métricas reales que tengas: conversionRate, aov, monthlyVisitors, revenue, etc." },
      goals: { type: "array", items: { type: "string" } },
    },
    required: ["situation"],
    additionalProperties: false,
  },
  web_fetch: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
    additionalProperties: false,
  },
  web_scrape_images: {
    type: "object",
    properties: { url: { type: "string" }, limit: { type: "number", description: "Por defecto 12" } },
    required: ["url"],
    additionalProperties: false,
  },
  search_product_images: {
    type: "object",
    properties: {
      query: { type: "string", description: 'Ej: "curso excel online profesional"' },
      limit: { type: "number", description: "Por defecto 6" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  fb_list_adsets: {
    type: "object",
    properties: { campaignId: { type: "string" } },
    required: ["campaignId"],
    additionalProperties: false,
  },
  dropi_status: { type: "object", properties: {}, additionalProperties: false },
  dropi_search_products: {
    type: "object",
    properties: { query: { type: "string" }, limit: { type: "number", description: "Por defecto 10" } },
    required: ["query"],
    additionalProperties: false,
  },
};

const GENERIC_FALLBACK_SCHEMA = { type: "object", additionalProperties: true } as const;

// ── Descripción legible de una acción propuesta (movida acá desde
// routes/code-agent.ts, que ahora la importa) para que la use tanto el
// camino legado como propose_action. ──────────────────────────────────────
export function describePlannedAction(a: { tool: string; args: any }): string {
  const g = a.args || {};
  switch (a.tool) {
    case "update_product":
      return `Actualizar producto ${g.id ?? g.name ?? "?"}: ${Object.entries(g).filter(([k]) => k !== "id").map(([k, v]) => `${k}=${v}`).join(", ")}`;
    case "create_product":
      return `Crear producto "${g.name ?? "?"}" (${g.price ?? "?"} ${g.currency ?? ""})`;
    case "delete_product":
      return `⚠️ ELIMINAR producto ${g.id ?? "?"}`;
    case "create_category":
      return `Crear categoría "${g.name ?? "?"}"`;
    case "update_agent":
      return `Actualizar el agente: ${Object.entries(g).map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(", ")}`;
    case "update_settings":
      return `Actualizar configuración: ${Object.entries(g).map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(", ")}`;
    case "create_store":
      return `Crear tienda "${g.name ?? g.slug ?? "?"}"`;
    case "fb_create_ad":
      return `💰 Crear campaña de Facebook para producto ${g.productId ?? "?"} (presupuesto ${g.dailyBudget ?? 5000}/día) — se crea EN PAUSA, no gasta hasta que la actives`;
    case "fb_sync_catalog":
      return `Sincronizar catálogo de productos a Facebook`;
    case "fb_page_publish":
      return `📢 PUBLICAR en el muro de la página de Facebook (público, gratis) el producto ${g.productId ?? "?"} — visible de inmediato para todos`;
    case "fb_ad_draft":
      return `Generar borrador de anuncio (copy + segmentación) para el producto ${g.productId ?? "?"} — no toca la cuenta de Meta, queda guardado local`;
    case "set_product_image":
      return `Asignar imagen al producto ${g.productId ?? "?"} (se hospeda permanente): ${String(g.imageUrl ?? "").slice(0, 60)}`;
    case "fb_update_draft_creative":
      return `✏️ Actualizar el copy del anuncio (borrador ${g.draftId ?? "?"})${g.headline ? ` — nuevo título: "${String(g.headline).slice(0, 50)}"` : ""} — sigue en el mismo estado en el que estaba (pausado sigue pausado), no se activa solo`;
    case "fb_pause_campaign":
      return `⏸️ Pausar la campaña ${g.campaignId ?? "?"} de Facebook — deja de gastar`;
    case "fb_resume_campaign":
      return `▶️ Reactivar la campaña ${g.campaignId ?? "?"} de Facebook — vuelve a gastar según su presupuesto diario`;
    case "fb_set_budget":
      return `💰 Cambiar el presupuesto diario del conjunto de anuncios ${g.adSetId ?? "?"} a $${g.dailyBudget ?? "?"}`;
    default:
      return `${a.tool}: ${JSON.stringify(g).slice(0, 80)}`;
  }
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: object;
  /** ctx.turnId identifica el turno para el que corre esta llamada -- lo usa
   * propose_action para saber en qué "draft_plan" acumular. */
  handler: (args: any, ctx: OperatorContext & { turnId: string }) => Promise<{ ok: boolean; summary: string; data?: any }>;
}

/** Nombres de tool + descripción reales, tomados de app-operator.ts (no se
 * duplican acá para no divergir -- se resuelven perezosamente vía
 * executeAction, que ya sabe despachar por nombre). Solo necesitamos la
 * descripción visible para el handshake MCP `tools/list`; se toma de
 * TOOL_MAP indirectamente pidiéndole a executeAction que corra la lectura. */
import { TOOLS as ALL_OPERATOR_TOOLS } from "./app-operator";

function readOnlyToolDescriptions(): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of ALL_OPERATOR_TOOLS) map.set(t.name, t.description);
  return map;
}

/**
 * Guarda una propuesta de mutación para este turno. NUNCA ejecuta la
 * herramienta real -- solo valida que exista y que sea de mutación (si el
 * modelo intenta "proponer" una lectura, se rechaza: para eso están las
 * herramientas de lectura directas) y la deja en `architectMemory` para que
 * `routes/code-agent.ts` la levante después de que OpenCode termine de
 * responder.
 */
async function proposeAction(
  args: { tool?: string; args?: any; humanSummary?: string },
  ctx: OperatorContext & { turnId: string },
): Promise<{ ok: boolean; summary: string }> {
  const tool = String(args?.tool || "").trim();
  if (!tool) return { ok: false, summary: "Falta el nombre de la herramienta a proponer." };
  if (!isKnownTool(tool)) return { ok: false, summary: `"${tool}" no es una herramienta real de esta app -- no la propongas, revisá el nombre exacto.` };
  if (isReadOnlyTool(tool)) return { ok: false, summary: `"${tool}" es de solo lectura -- llamala directo, no hace falta proponerla ni confirmarla.` };

  const toolArgs = args?.args && typeof args.args === "object" ? args.args : {};
  const description = describePlannedAction({ tool, args: toolArgs });

  await db.insert(architectMemory).values({
    tenantId: ctx.tenantId,
    sessionId: ctx.turnId,
    memoryType: "draft_plan",
    title: tool,
    content: JSON.stringify({ tool, args: toolArgs }),
  });

  logger.info({ tenantId: ctx.tenantId, turnId: ctx.turnId, tool }, "[AtlasMCP] Acción propuesta (sin ejecutar)");
  return { ok: true, summary: description };
}

/** Lee y borra las propuestas acumuladas de un turno (llamado UNA vez, al
 * terminar la respuesta de OpenCode, desde routes/code-agent.ts). */
export async function drainDraftPlan(tenantId: number, turnId: string): Promise<{ tool: string; args: any }[]> {
  const { eq, and } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(architectMemory)
    .where(and(eq(architectMemory.tenantId, tenantId), eq(architectMemory.sessionId, turnId), eq(architectMemory.memoryType, "draft_plan")));
  if (rows.length === 0) return [];
  await db
    .delete(architectMemory)
    .where(and(eq(architectMemory.tenantId, tenantId), eq(architectMemory.sessionId, turnId), eq(architectMemory.memoryType, "draft_plan")));
  return rows
    .map((r: ArchitectMemory) => {
      try {
        return JSON.parse(r.content) as { tool: string; args: any };
      } catch {
        return null;
      }
    })
    .filter((x: { tool: string; args: any } | null): x is { tool: string; args: any } => !!x);
}

/** Arma el registro completo de tools MCP: las de lectura (derivadas de
 * READ_ONLY_TOOLS, delegando la ejecución real a executeAction) + propose_action. */
// ── Subconjunto de herramientas por pedido ──────────────────────────────────
// Medido en vivo (2026-08-12): el modelo solo (mistral, sin herramientas)
// responde en 2,5s, pero un turno de Atlas para algo tan simple como "dame 3
// productos" tardaba 69s. La diferencia no es el modelo: son las 34
// herramientas con sus esquemas completos + el prompt de sistema, que se
// mandan ENTERAS en cada turno. El modelo tiene que digerir todo eso antes de
// contestar.
//
// Solución: mandarle solo lo que puede llegar a necesitar según lo que pidió
// el admin. El núcleo va siempre (son las lecturas básicas del negocio, y
// `propose_action` que se agrega aparte); los grupos se suman por palabra
// clave. Ante la duda -- si el pedido no matchea ningún grupo -- se mandan
// TODAS, para no romper un caso raro por ahorrar tokens.
const NUCLEO = new Set([
  "analyze_system", "list_products", "list_categories", "dashboard_summary",
  "get_agent", "get_settings", "get_store",
]);

const GRUPOS: { patron: RegExp; herramientas: string[] }[] = [
  {
    patron: /facebook|anuncio|campa|meta|ads?\b|publicit|p[uú]blico|audiencia|creativ/i,
    herramientas: ["fb_status", "fb_suggest_audience", "fb_page_can_post", "fb_page_preview", "fb_list_drafts", "fb_agent_logs", "fb_campaign_metrics", "fb_list_adsets", "fb_ad_library", "generate_image", "search_product_images"],
  },
  {
    patron: /whatsapp|wasap|conversaci|chat|mensaje|cliente|lead/i,
    herramientas: ["whatsapp_status", "list_recent_conversations", "predict_customer"],
  },
  {
    patron: /investig|averigu|indag|research|tendencia|competencia|mercado|benchmark|qu[eé] funciona/i,
    herramientas: ["research_start", "research_check", "fb_ad_library", "web_search", "web_fetch", "deep_research"],
  },
  {
    patron: /precio|cobr|pago|vender|venta|ingreso|factur|suscrip/i,
    herramientas: ["payment_status", "optimize_price", "analyze_channel_performance"],
  },
  {
    patron: /imagen|foto|dise[ñn]|portada/i,
    herramientas: ["generate_image", "search_product_images", "web_scrape_images"],
  },
  {
    patron: /dropi|proveedor|dropshipping|stock/i,
    herramientas: ["dropi_status", "dropi_search_products"],
  },
  {
    patron: /copy|texto|redact|descripci|t[ií]tulo/i,
    herramientas: ["optimize_copy", "reason_business_decision"],
  },
];

function herramientasRelevantes(pedido?: string): Set<string> | null {
  if (!pedido || pedido.trim().length < 3) return null; // sin pista: mandar todas
  const activos = GRUPOS.filter((g) => g.patron.test(pedido));
  if (activos.length === 0) return null; // no matcheó nada: mandar todas
  const set = new Set(NUCLEO);
  for (const g of activos) for (const h of g.herramientas) set.add(h);
  return set;
}

export function buildMcpToolRegistry(pedido?: string): McpToolDef[] {
  const descriptions = readOnlyToolDescriptions();
  const relevantes = herramientasRelevantes(pedido);
  const readTools: McpToolDef[] = [...READ_ONLY_TOOLS]
    .filter((name) => !EXCLUDED_FROM_MCP.has(name))
    .filter((name) => !relevantes || relevantes.has(name))
    .map((name) => {
      const schema = TOOL_SCHEMAS[name];
      if (!schema) {
        logger.warn({ tool: name }, "[AtlasMCP] Herramienta de lectura sin esquema MCP explícito -- usando esquema genérico permisivo, agregale un esquema real en TOOL_SCHEMAS.");
      }
      return {
        name,
        description: descriptions.get(name) || name,
        inputSchema: schema || GENERIC_FALLBACK_SCHEMA,
        handler: async (args, ctx) => executeAction(name, args, ctx),
      };
    });

  const proposeTool: McpToolDef = {
    name: "propose_action",
    description:
      "Proponer un CAMBIO real (crear/editar/eliminar algo, publicar, gastar, enviar) para que el admin lo apruebe -- NUNCA lo ejecuta. " +
      "Pasá el nombre EXACTO de la herramienta de cambio (ej: update_product, fb_create_ad, dropi_create_order) y sus argumentos reales. " +
      "El sistema le muestra la propuesta al admin en español llano y espera su confirmación explícita antes de aplicar nada.",
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string", description: "Nombre exacto de la herramienta de cambio a proponer" },
        args: { type: "object", description: "Argumentos reales para esa herramienta" },
      },
      required: ["tool", "args"],
      additionalProperties: false,
    },
    handler: proposeAction,
  };

  return [...readTools, proposeTool];
}
