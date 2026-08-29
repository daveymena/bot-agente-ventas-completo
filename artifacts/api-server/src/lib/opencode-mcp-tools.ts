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
  validarContenidoAnuncio,
  bloqueoDeMeta,
  type OperatorContext,
} from "./app-operator";
import { logger } from "./logger";

// Las herramientas de investigación quedan FUERA del puente a propósito: el
// servidor ya investiga solo antes de hablarle al modelo (investigacionRapida
// en operator-opencode.ts) y le pasa los hallazgos en el contexto.
//
// Por qué se sacaron (2026-08-12, con el admin trabado en vivo): sus
// descripciones venían de la época del segundo plano y le decían al modelo
// "arranca la investigación y decile al admin que te escriba en un minuto".
// El modelo obedecía al pie de la letra: contestaba "estoy investigando, te
// aviso en un minuto", NO llamaba nada, y el turno terminaba sin borrador.
// El admin lo vivía como "promete y nunca publica". Mientras la herramienta
// exista con esa semántica, el modelo va a seguir prometiendo -- sacarla es
// lo único que lo corta de raíz.
const EXCLUDED_FROM_MCP = new Set<string>(["research_start", "research_check", "deep_research"]);

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
  ad_brief: {
    type: "object",
    properties: { productId: { type: "number", description: "Id real del producto, sacado de list_products" } },
    required: ["productId"],
    additionalProperties: false,
  },
  fb_pixel_status: { type: "object", properties: {}, additionalProperties: false },
  // Faltaba, y caía al esquema genérico. Ese genérico es `additionalProperties:
  // true` pero SIN `properties`, así que Atlas no tenía cómo saber que existe
  // un campo `proveedor`: veía una herramienta sin parámetros, la llamaba
  // vacía, y el handler le contestaba "decime qué proveedor probar". Lo vivió
  // el admin el 2026-08-22 pidiendo justamente probar DeepSeek -- el proveedor
  // que paga. Es el quinto lugar donde una lista escrita a mano lo escondía.
  test_ai_models: {
    type: "object",
    properties: {
      proveedor: {
        type: "string",
        enum: [
          "deepseek", "github_copilot_internal", "opencode_go", "opencode",
          "opencode_zen", "groq", "openrouter", "nvidia", "github",
        ],
        description: "Cuál probar. Es obligatorio: la herramienta prueba UN proveedor por vez.",
      },
    },
    required: ["proveedor"],
    additionalProperties: false,
  },
  marketing_diagnostico: {
    type: "object",
    properties: { dias: { type: "number", description: "Ventana a analizar en días, por defecto 30" } },
    additionalProperties: false,
  },
  marketing_aprendizajes: {
    type: "object",
    properties: { limite: { type: "number", description: "Cuántos aprendizajes traer, por defecto 20" } },
    additionalProperties: false,
  },
  marketing_attribution: {
    type: "object",
    properties: { dias: { type: "number", description: "Ventana a analizar en días, por defecto 30" } },
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

/**
 * Da una forma legible a un valor dentro de la descripción de una acción.
 *
 * Antes se usaba `String(v).slice(0, 40)`: cuando Atlas pasaba un objeto o un
 * array (por ejemplo el campo `messages` de update_agent, un array de
 * mensajes), el plan mostraba `messages=[object Object]` — inútil para el
 * admin al momento de aprobar. Un objeto se serializa como JSON compacto y,
 * si queda largo, se recorta con un elipsis para no inundar la propuesta.
 */
function valorLegible(v: any, max = 60): string {
  if (v === null || v === undefined) return String(v);
  const t = typeof v;
  if (t === "string") return (v as string).replace(/\s+/g, " ").trim().slice(0, max) || "(vacío)";
  if (t === "number" || t === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    return String(v).slice(0, max);
  }
}

/**
 * Cómo se lee el destino de una campaña en el plan que aprueba el admin.
 *
 * El destino NO aparecía en ningún plan. El admin pedía "tráfico a WhatsApp",
 * aprobaba un plan que decía solo "crear campaña, presupuesto X/día", y recién
 * en Ads Manager descubría que apuntaba a la web. Reportado tal cual: "le pido
 * de tráfico y me manda a otro lado".
 *
 * La causa de fondo estaba en las herramientas (el parámetro `objetivo` ni
 * siquiera estaba declarado, así que el modelo no podía pasarlo), pero mostrarlo
 * acá es la red que queda para siempre: por esta función pasa TODO plan de TODOS
 * los negocios, así que el admin puede frenar un destino equivocado ANTES del
 * "sí" — sin depender de que el modelo acierte.
 */
function destinoLegible(objetivo: unknown): string {
  const o = String(objetivo || "").toLowerCase();
  if (/mensaje|whatsapp|convers/.test(o)) return "📱 abre WhatsApp (campaña de mensajes)";
  if (/tr[aá]fico|traffic/.test(o)) return "🔗 lleva a la web buscando clics (campaña de tráfico)";
  if (/reconoc|alcance|awareness/.test(o)) return "📣 solo alcance, ni clics ni ventas (reconocimiento)";
  if (/venta|sales/.test(o)) return "🛒 lleva a la web buscando compradores (campaña de ventas)";
  // Que no lo haya dicho es un dato, no un detalle: se crea de ventas a la web.
  return "🛒 lleva a la web buscando compradores (ventas — NO se pidió otro destino)";
}

export function describePlannedAction(a: { tool: string; args: any }): string {
  const g = a.args || {};
  switch (a.tool) {
    case "update_product":
      return `Actualizar producto ${g.id ?? g.name ?? "?"}: ${Object.entries(g).filter(([k]) => k !== "id").map(([k, v]) => `${k}=${valorLegible(v)}`).join(", ")}`;
    case "create_product":
      return `Crear producto "${g.name ?? "?"}" (${g.price ?? "?"} ${g.currency ?? ""})`;
    case "delete_product":
      return `⚠️ ELIMINAR producto ${g.id ?? "?"}`;
    case "create_category":
      return `Crear categoría "${g.name ?? "?"}"`;
    case "update_agent":
      return `Actualizar el agente: ${Object.entries(g).map(([k, v]) => `${k}=${valorLegible(v)}`).join(", ")}`;
    case "update_settings":
      return `Actualizar configuración: ${Object.entries(g).map(([k, v]) => `${k}=${valorLegible(v)}`).join(", ")}`;
    case "create_store":
      return `Crear tienda "${g.name ?? g.slug ?? "?"}"`;
    case "fb_create_ad":
      return `💰 Crear campaña de Facebook para producto ${g.productId ?? "?"} (presupuesto ${g.dailyBudget ?? 5000}/día)
   ➡️ Destino: ${destinoLegible(g.objetivo)}
   Se crea EN PAUSA, no gasta hasta que la actives`;
    case "fb_sync_catalog":
      return `Sincronizar catálogo de productos a Facebook`;
    case "fb_page_publish":
      return `📢 PUBLICAR en el muro de la página de Facebook (público, gratis) el producto ${g.productId ?? "?"} — visible de inmediato para todos`;
    case "crear_anuncio":
      // El destino se muestra solo cuando de verdad se crea la campaña en
      // Meta: si `subirAMeta` no va, esto guarda un borrador local y el
      // objetivo todavía no decide nada. Anunciar un destino ahí sería
      // prometer algo que este paso no hace.
      return `📢 Crear el anuncio de "${valorLegible(g.producto, 60)}" con $${Number(g.dailyBudget || 0).toLocaleString("es-CO")}/día — el sistema busca el producto, escribe el copy con sus datos reales, lo valida y guarda el borrador${g.subirAMeta === true ? `, y ADEMÁS crea la campaña en Meta EN PAUSA (no gasta hasta que la actives)\n   ➡️ Destino: ${destinoLegible(g.objetivo)}` : " (no toca Meta)"}`;
    case "fb_ad_draft":
      // El TEXTO REAL va en el plan, no solo "generar borrador para el
      // producto 76".
      //
      // Visto en vivo (2026-08-19): Atlas anunció "voy a escribir el anuncio,
      // guardarlo y subirlo" y pidió el sí SIN haber mostrado una sola línea
      // del copy. El admin aprobaba un texto que todavía no existía, y recién
      // lo veía cuando ya estaba guardado. La regla del propio sistema dice
      // lo contrario: si lo que se guarda es CONTENIDO, el contenido real
      // tiene que estar a la vista antes de pedir confirmación.
      //
      // Se arregla acá, en la descripción del plan, y no en el prompt: por
      // esta función pasa TODO plan de TODOS los negocios de la plataforma,
      // así que ningún modelo -- ni ninguno que venga después -- puede
      // saltearse la regla. Pedido explícito del admin: esto no es solo para
      // él, es para cada cliente que cree su usuario.
      return [
        `Generar borrador de anuncio para el producto ${g.productId ?? "?"} — no toca la cuenta de Meta, queda guardado local`,
        g.headline ? `\n   🎯 Título: ${valorLegible(g.headline, 90)}` : "",
        g.primaryText ? `\n   ✍️ Texto:\n${String(g.primaryText).split("\n").map((l: string) => `      ${l}`).join("\n")}` : "",
        g.dailyBudget ? `\n   💰 Presupuesto: $${Number(g.dailyBudget).toLocaleString("es-CO")}/día` : "",
      ].filter(Boolean).join("");
    case "set_product_image":
      return `Asignar imagen al producto ${g.productId ?? "?"} (se hospeda permanente): ${valorLegible(g.imageUrl ?? "")}`;
    case "fb_update_draft_creative":
      // Mismo motivo que fb_ad_draft: si el anuncio ya existe en Meta, esto
      // REEMPLAZA el texto que ve el público. Aprobar eso sin leerlo entero
      // es peor todavía que aprobar un borrador nuevo.
      return [
        `✏️ Reemplazar el texto del anuncio (borrador ${g.draftId ?? "?"}) — sigue en el mismo estado en el que estaba (pausado sigue pausado), no se activa solo`,
        g.headline ? `\n   🎯 Título nuevo: ${valorLegible(g.headline, 90)}` : "",
        g.primaryText ? `\n   ✍️ Texto nuevo:\n${String(g.primaryText).split("\n").map((l: string) => `      ${l}`).join("\n")}` : "",
        g.dailyBudget ? `\n   💰 Presupuesto nuevo: $${Number(g.dailyBudget).toLocaleString("es-CO")}/día` : "",
      ].filter(Boolean).join("");
    // La herramienta a la que `propose_action` REDIRIGE todo "activá el
    // anuncio" (ver REDIRIGIR más abajo) no tenía frase propia: caía al
    // `default`, así que el admin veía el volcado técnico
    // `fb_make_campaign_deliver: {"campaignId":"120..."}` justo en la acción
    // que más plata mueve, y encima sin decirle que va a empezar a gastar.
    case "fb_make_campaign_deliver":
      return `▶️ Encender la campaña ${g.campaignId ?? "?"} de Facebook — el sistema decide solo qué prender (campaña, conjunto o anuncio) y prende lo mínimo. EMPIEZA A GASTAR`;
    case "fb_create_pixel":
      return `🎯 Crear un píxel NUEVO en tu cuenta de Facebook${g.nombre ? ` ("${g.nombre}")` : ""} y dejarlo configurado — es un objeto permanente en tu cuenta de Meta. Después hay que instalarlo en la web para que registre compras`;
    case "fb_upload_draft_to_meta":
      return `📤 Subir el borrador ${g.draftId === "auto" ? "que se acaba de crear" : (g.draftId ?? "?")} a Meta EN PAUSA — crea la campaña, el conjunto y el anuncio en tu cuenta.
   ➡️ Destino: ${destinoLegible(g.objetivo)}
   NO gasta: queda pausado hasta que lo actives`;
    case "fb_delete_campaign":
      return `🗑️ BORRAR de Facebook la campaña ${g.campaignId ?? "?"} — se van también sus conjuntos y anuncios. IRREVERSIBLE, no hay papelera${g.borrarAunqueTengaGasto === true ? ", y se pierde su historial de resultados" : ""}`;
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
import { TOOLS as ALL_OPERATOR_TOOLS, herramientasDeLaFamilia } from "./app-operator";

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

  // Herramientas que EXISTEN pero que el modelo no debe elegir a mano porque
  // hay una equivalente que no se puede usar mal.
  //
  // Caso que lo motivó, después de días sin poder encender un anuncio: para
  // "activá el anuncio del piano" el modelo elegía fb_set_ad_status y le
  // pasaba un id de conjunto INVENTADO (120248999000230097, inexistente en la
  // cuenta). La acción moría en Meta con "Object does not exist" DESPUÉS de
  // que el admin ya había confirmado. Elegir entre campaña, conjunto o
  // anuncio y acertar el id no es trabajo del modelo: es una decisión
  // mecánica que el servidor toma leyendo la estructura. Se le saca la opción
  // de equivocarse y se lo manda a la herramienta que solo pide la campaña.
  const REDIRIGIR: Record<string, { hacia: string; porque: string }> = {
    fb_set_ad_status: {
      hacia: "fb_make_campaign_deliver",
      porque: "necesita el id exacto de un anuncio o conjunto, y elegirlo mal hace fallar la acción después de que el admin confirmó",
    },
  };
  const redir = REDIRIGIR[tool];
  if (redir) {
    return {
      ok: false,
      summary:
        `No uses "${tool}": ${redir.porque}. Usá "${redir.hacia}" pasándole SOLO el id de la CAMPAÑA `
        + `(el que devuelve fb_list_campaigns). Esa herramienta averigua sola qué hay que encender y prende lo mínimo necesario.`,
    };
  }

  const toolArgs = args?.args && typeof args.args === "object" ? args.args : {};

  // Datos obligatorios: sin esto el admin veía planes tipo "Generar borrador
  // para el producto ?" (visto en vivo, 2026-08-12) -- imposible de aprobar
  // con criterio, y si lo aprobaba igual, la ejecución fallaba después. Mejor
  // rechazar la propuesta acá y decirle al modelo qué le falta, que dejarlo
  // llegar al admin con un signo de pregunta donde va un id.
  const OBLIGATORIOS: Record<string, string[]> = {
    // `primaryText` es obligatorio a propósito. Reportado en vivo por el
    // admin (2026-08-13) después de varios intentos sin poder crear NI UN
    // anuncio: el modelo escribía un copy completo en el chat, el admin lo
    // leía y confirmaba... pero a la herramienta solo le pasaba el
    // productId. Sin copy, fb_ad_draft rechazaba ("necesito investigación o
    // que escribas el copy completo") y el flujo moría SIEMPRE en el último
    // paso, después de que el admin ya había invertido varios mensajes.
    //
    // Exigirlo acá resuelve dos cosas de una: destraba la creación, y
    // garantiza que el copy que el admin APROBÓ es exactamente el que se
    // guarda -- antes, aunque hubiera funcionado, el texto del chat y el del
    // borrador podían no coincidir.
    fb_ad_draft: ["productId", "primaryText"],
    // crear_anuncio hace TODO el trabajo en el backend: solo necesita el
    // nombre del producto y el presupuesto. El copy lo escribe el servidor.
    crear_anuncio: ["producto", "dailyBudget"],
    // `dailyBudget` obligatorio. Visto en vivo (2026-08-15): Atlas le mostró
    // al admin "$50.000 COP/día" y propuso la acción SIN dailyBudget, así que
    // iba a ejecutarse con el default de 5.000 -- diez veces menos que lo que
    // el admin estaba aprobando. El admin decide leyendo el texto; si el
    // número real es otro, la aprobación no significa nada. Sin default
    // silencioso: si no lo dice, no se propone.
    fb_create_ad: ["productId", "dailyBudget"],
    fb_page_publish: ["productId"],
    set_product_image: ["productId", "imageUrl"],
    update_product: ["id"],
    delete_product: ["id"],
    fb_update_draft_creative: ["draftId"],
    // Faltaba, y dejaba pasar el mismo agujero que el "producto 0" pero con
    // otro campo. Visto en vivo (2026-08-18): el plan que le llegó al admin
    // decía literalmente `subir el borrador a Meta en pausa:
    // {"draftId":null,"imageUrl":null}` -- sin `draftId` no hay nada que
    // subir, así que la acción iba a fallar DESPUÉS de la confirmación. En el
    // mismo turno el modelo además afirmó "✅ Borrador guardado localmente"
    // sin haber guardado nada: si la propuesta no se frena acá, el admin
    // aprueba un plan imposible sobre un borrador que no existe.
    fb_upload_draft_to_meta: ["draftId"],
    // (ver ENCADENADO abajo: draftId puede ser "auto" si en el MISMO plan ya
    // se propuso el fb_ad_draft que lo va a crear)
    fb_pause_campaign: ["campaignId"],
    fb_resume_campaign: ["campaignId"],
    fb_delete_campaign: ["campaignId"],
    // Faltaba, y es la que más importa de las tres: REDIRIGIR manda acá todo
    // "activá el anuncio", así que es el camino por defecto para encender. Sin
    // el campaignId obligatorio, el modelo podía proponerla vacía, el admin
    // aprobaba "Encender la campaña ?" y recién ahí rebotaba con "Falta el id
    // de la campaña" -- el mismo fallo tardío que ya se cerró para pausar.
    fb_make_campaign_deliver: ["campaignId"],
    fb_set_budget: ["adSetId", "dailyBudget"],
  };
  // Un id NUMÉRICO en cero es tan "falta el dato" como un vacío, pero la
  // comprobación de abajo lo dejaba pasar: 0 no es undefined, ni null, ni "",
  // ni "?".
  //
  // Esto es la SEGUNDA vuelta del mismo bug. El 13-08-2026 se cerró el caso
  // "productId ausente" (el admin veía "Generar borrador para el producto ?");
  // el modelo dejó de omitir el campo y pasó a mandarlo en 0, que es el mismo
  // agujero con otra cara. Visto en vivo el 18-08-2026 con el PACK EDUCA A TU
  // PERRO: no encontró el producto en el catálogo, propuso igual con
  // `productId: 0`, el admin aprobó un plan que decía "para el producto 0", y
  // recién ahí la ejecución devolvió "Falta 'productId'" -- toda la
  // conversación perdida en el último paso, justo el fallo tardío que este
  // bloque existe para cerrar. Por eso ahora no se valida "que el campo esté":
  // se valida que el VALOR pueda ser un id de verdad.
  //
  // El rango es el de un serial int32 de Postgres, mismo criterio que
  // fb_update_draft_creative/update_agent (ver app-operator): un número de 18
  // dígitos es un id de Meta puesto donde va uno local, no un id válido acá.
  const CAMPOS_ID = new Set(["productId", "id", "draftId", "leadId"]);
  const esIdInvalido = (k: string, v: any) => {
    if (!CAMPOS_ID.has(k)) return false;
    // "auto" es un marcador legitimo: lo resuelve el servidor al ejecutar,
    // con el id del borrador creado por el paso anterior del mismo plan.
    if (v === "auto") return false;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    return !Number.isInteger(n) || n <= 0 || n > 2_147_483_647;
  };
  // Un presupuesto en 0 es el mismo problema con otro campo, y encima
  // silencioso: `num(0) || defaultDelNicho` termina gastando el default, así
  // que el admin aprueba "$0/día" y se ejecuta otra cosa -- justo lo que se
  // quiso cerrar cuando se hizo obligatorio dailyBudget (15-08-2026).
  const esMontoInvalido = (k: string, v: any) => {
    if (k !== "dailyBudget") return false;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    return !Number.isFinite(n) || n <= 0;
  };
  // Un id vacío o en cero se rechaza en CUALQUIER herramienta, esté o no en
  // OBLIGATORIOS. Ir agregando herramientas a esa lista de a una nos hizo
  // perder el mismo bug tres veces (productId ausente el 13-08, productId en
  // 0 el 18-08, draftId en null el 18-08 a la noche): cada herramienta nueva
  // que reciba un id nace con el agujero abierto hasta que alguien se acuerde
  // de anotarla. Esto lo cierra por defecto -- si el campo se llama como un
  // id, tiene que ser un id.
  const idsRotos = Object.keys(toolArgs).filter(
    (k) => toolArgs[k] !== undefined && CAMPOS_ID.has(k) && esIdInvalido(k, toolArgs[k]),
  );

  // ── Encadenar crear + subir en un solo plan ──────────────────────────
  // El pedido natural del admin es "creá el anuncio y subilo a Meta", pero eso
  // NO entra en un turno del modelo: buscar producto + brief + escribir +
  // guardar + subir se pasa de los 135s y el turno corta sin hacer nada
  // (medido en vivo el 19-08-2026 con el curso de IA).
  //
  // La salida no es darle mas tiempo al modelo -- el proxy corta a ~150s --
  // sino que PROPONGA los dos pasos juntos y el servidor los ejecute en orden
  // despues del "si". Proponer es rapido; ejecutar pasa fuera del turno.
  //
  // El draftId todavia no existe cuando se propone, asi que se acepta "auto"
  // y se resuelve al ejecutar con el id del borrador que acaba de crearse
  // (ver resolverEncadenado en las ramas de aprobacion).
  if (tool === "fb_upload_draft_to_meta") {
    const { eq, and } = await import("drizzle-orm");
    const yaHayDraft = await db
      .select()
      .from(architectMemory)
      .where(and(
        eq(architectMemory.tenantId, ctx.tenantId),
        eq(architectMemory.sessionId, ctx.turnId),
        eq(architectMemory.memoryType, "draft_plan"),
        eq(architectMemory.title, "fb_ad_draft"),
      ))
      .limit(1)
      .then((r: any[]) => r.length > 0)
      .catch(() => false);
    const sinId = toolArgs.draftId === undefined || toolArgs.draftId === null || toolArgs.draftId === "" || toolArgs.draftId === 0;
    if (yaHayDraft && (sinId || toolArgs.draftId === "auto")) {
      toolArgs.draftId = "auto";
    }
  }

  const faltantes = (OBLIGATORIOS[tool] || []).filter(
    (k) =>
      toolArgs[k] === undefined ||
      toolArgs[k] === null ||
      toolArgs[k] === "" ||
      toolArgs[k] === "?" ||
      esIdInvalido(k, toolArgs[k]) ||
      esMontoInvalido(k, toolArgs[k]),
  );
  for (const k of idsRotos) if (!faltantes.includes(k)) faltantes.push(k);
  if (faltantes.length) {
    return {
      ok: false,
      summary:
        `No se puede proponer "${tool}" sin ${faltantes.join(" y ")}. ` +
        (faltantes.includes("primaryText")
          ? `Pasá en "primaryText" el TEXTO COMPLETO del anuncio que le mostraste al admin -- el mismo, palabra por palabra, ` +
            `no un resumen ni una referencia tipo "el copy de arriba". Sumá también "headline" (título corto) y, si lo tenés, ` +
            `"description". Sin el texto adjunto no se guarda nada y el admin se queda sin anuncio después de haberlo aprobado. `
          : `Averigualo primero con una herramienta de lectura (por ejemplo list_products para el id del producto) `) +
        `Volvé a proponer la acción con el dato real. No la propongas con un valor vacío ni inventado: ` +
        `un id en 0 (o cualquier número puesto "para completar") no cuenta como id y hace fallar la acción ` +
        `después de que el admin ya la aprobó.`,
    };
  }

  // ── Validar el CONTENIDO acá, no al ejecutar ────────────────────────────
  // La conversación del PACK EDUCA A TU PERRO (2026-08-14) mostró el costo
  // exacto de validar tarde: el admin armó el anuncio a lo largo de ~10
  // mensajes, confirmó, y recién DESPUÉS del "sí" le saltó "quedó con un
  // hueco sin rellenar: [Enlace a la tienda]". Cada rechazo se comía un turno
  // entero más una confirmación nueva, el mensaje de rechazo estaba escrito
  // para el modelo (le hablaba de "volvé a llamar la herramienta") y el admin
  // no pudo crear NI UN anuncio en toda la sesión.
  //
  // Validando al PROPONER, el rechazo vuelve como resultado de herramienta en
  // el MISMO turno: el modelo todavía está corriendo, corrige el copy y
  // propone de nuevo solo. El admin ve directamente el plan bueno.
  if (tool === "fb_ad_draft" || tool === "fb_create_ad" || tool === "fb_page_publish") {
    // El MISMO umbral que aplica fb_ad_draft al ejecutar (`copyPropio`, 80
    // caracteres). Si no se chequea también acá, un copy corto pasa la
    // propuesta, el admin lo confirma, y recién entonces rebota con
    // "necesito investigación reciente o que escribas el copy completo" --
    // otra vez el fallo tarde, que es la trampa que hay que cerrar de raíz.
    const copy = typeof toolArgs.primaryText === "string" ? toolArgs.primaryText.trim() : "";
    if (tool === "fb_ad_draft" && copy.length > 0 && copy.length < 80) {
      return {
        ok: false,
        summary:
          `El texto del anuncio es demasiado corto (${copy.length} caracteres; hacen falta al menos 80). ` +
          `Un anuncio de una línea no vende y además no alcanza como base verificable. ` +
          `Escribí el anuncio COMPLETO en "primaryText" -- gancho, beneficios concretos del producto, precio real y cierre -- ` +
          `y proponé de nuevo.`,
      };
    }

    const problema = await validarContenidoAnuncio(toolArgs, ctx);
    if (problema) return { ok: false, summary: problema };
  }

  // ── ¿Meta está conectado? Preguntarlo ANTES de hacerle aprobar algo ──────
  // Mismo fallo tardío que el copy, pero peor: "Facebook no configurado
  // (falta token)" no se arregla reescribiendo nada ni volviendo a
  // confirmar. El admin aprobaba una campaña que no tenía forma de correr.
  const bloqueo = await bloqueoDeMeta(tool, ctx);
  if (bloqueo) return { ok: false, summary: bloqueo };

  const description = describePlannedAction({ tool, args: toolArgs });

  await db.insert(architectMemory).values({
    tenantId: ctx.tenantId,
    sessionId: ctx.turnId,
    memoryType: "draft_plan",
    title: tool,
    content: JSON.stringify({ tool, args: toolArgs }),
  });

  logger.info({ tenantId: ctx.tenantId, turnId: ctx.turnId, tool }, "[AtlasMCP] Acción propuesta (sin ejecutar)");
  // El resultado que ve el MODELO tiene que decir, sin ninguna ambigüedad, que
  // todavía no pasó nada.
  //
  // Antes acá se devolvía `description` a secas -- pero esa frase está escrita
  // para la LISTA DEL ADMIN ("Generar borrador de anuncio ... queda guardado
  // local"), no para el modelo. Leída como resultado de herramienta suena a
  // acción cumplida, así que el modelo cierra el turno diciendo que ya quedó
  // guardado. Medido con dos cerebros distintos el 2026-08-14: Atlas reportó
  // "✅ Borrador generado y guardado" y Hermes "Borrador guardado: sí", las
  // dos veces sin que existiera nada. El admin se queda creyendo que tiene un
  // anuncio que nunca se creó.
  //
  // Se arregla del lado del PUENTE y no del prompt a propósito: por acá pasa
  // cualquier cerebro (Atlas, Hermes, el que venga), así que el candado vale
  // para todos sin repetir la regla en cada system prompt.
  return {
    ok: true,
    summary:
      `PROPUESTA REGISTRADA — TODAVÍA NO SE EJECUTÓ NADA. No existe ningún cambio en el sistema en este momento. ` +
      `Lo único que pasó es que "${tool}" quedó anotada, esperando que el admin la apruebe; recién ahí se ejecuta de verdad. ` +
      `Al responderle, NO digas que quedó guardado, creado, publicado ni listo: decile qué preparaste y pedile que lo confirme. ` +
      `Acción en espera: ${description}`,
  };
}

/** Lee y borra las propuestas acumuladas de un turno (llamado UNA vez, al
 * terminar la respuesta de OpenCode, desde routes/code-agent.ts). */
/** Deja anotado que en ESTE turno se ejecutó realmente una herramienta de lectura. */
async function registrarLecturaDelTurno(ctx: any, tool: string): Promise<void> {
  const tenantId = Number(ctx?.tenantId);
  const turnId = String(ctx?.turnId || "");
  if (!Number.isFinite(tenantId) || !turnId) return;
  try {
    await db.insert(architectMemory).values({
      tenantId,
      sessionId: turnId,
      memoryType: "tool_used",
      content: tool,
    } as any);
  } catch {
    // Es telemetría de apoyo: si falla, no puede tumbar la herramienta real.
  }
}

/** Qué herramientas de lectura se ejecutaron de verdad en el turno. */
export async function lecturasDelTurno(tenantId: number, turnId: string): Promise<string[]> {
  const { eq, and } = await import("drizzle-orm");
  try {
    const rows = await db
      .select()
      .from(architectMemory)
      .where(and(
        eq(architectMemory.tenantId, tenantId),
        eq(architectMemory.sessionId, turnId),
        eq(architectMemory.memoryType, "tool_used"),
      ));
    return rows.map((r: ArchitectMemory) => String(r.content));
  } catch {
    return [];
  }
}

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
  const acciones = rows
    .map((r: ArchitectMemory) => {
      try {
        return JSON.parse(r.content) as { tool: string; args: any };
      } catch {
        return null;
      }
    })
    .filter((x: { tool: string; args: any } | null): x is { tool: string; args: any } => !!x);

  // ── Una acción repetida es una sola acción ───────────────────────────────
  // Visto en vivo (2026-08-19) pidiendo borrar una campaña: el modelo llamó
  // `propose_action` CINCO veces con exactamente los mismos argumentos, y el
  // plan le mostró al admin cinco borrados idénticos. Ejecutarlo borraba la
  // campaña una vez y las otras cuatro fallaban con "no encontré la campaña",
  // así que un trabajo que salió bien se reportaba como fallido a medias.
  //
  // Dos llamadas con el MISMO tool y los MISMOS argumentos en un mismo turno
  // no son dos intenciones: son la misma, repetida. Y en algo irreversible
  // como borrar, mostrarle al admin cinco líneas iguales para confirmar es
  // pedirle que apruebe algo que no entiende.
  //
  // Se conserva el ORDEN de la primera aparición: los planes encadenados
  // (crear y después subir lo creado) dependen de él.
  const vistas = new Set<string>();
  const unicas = acciones.filter((a: { tool: string; args: any }) => {
    const huella = `${a.tool}::${JSON.stringify(a.args ?? {})}`;
    if (vistas.has(huella)) return false;
    vistas.add(huella);
    return true;
  });
  if (unicas.length !== acciones.length) {
    logger.info(
      { tenantId, propuestas: acciones.length, unicas: unicas.length },
      "[AtlasMCP] El modelo propuso acciones repetidas -- se dejó una de cada una",
    );
  }
  return unicas;
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
// TODA herramienta de solo lectura va en el núcleo, en todos los pedidos.
//
// El cerebro viejo (`/operator`, code-agent.ts) le pasaba al modelo las 34
// herramientas SIEMPRE, vía buildToolsDoc(). El cerebro nuevo estrenó este
// recorte por palabra clave para bajar los 69s por turno -- y ahí empezó el
// "antes funcionaba y ahora no" que reportó el admin. Es literal: si la frase
// no matchea el patrón correcto, la capacidad desaparece sin que nadie se
// entere. Medido: pedirle "buscá el PRECIO de X" lo mandaba al grupo de
// precios y se quedaba sin buscador, y contestaba "no tengo acceso a una
// herramienta de búsqueda web".
//
// Adivinar por palabras clave es frágil por diseño: cada frase que no
// anticipamos es una capacidad perdida en silencio. Leer no rompe nada -- no
// hay razón de seguridad para esconder una lectura. El recorte se mantiene
// solo para las que MUTAN, que además pasan por propose_action.
const NUCLEO = new Set<string>([
  // ⚠️ Acá había un `...READ_ONLY_TOOLS` que ANULABA todo este archivo.
  //
  // `buildMcpToolRegistry` filtra las herramientas de lectura POR este núcleo.
  // Si el núcleo arranca metiéndolas todas, el filtro no filtra nada: los
  // GRUPOS de abajo no agregan nada porque ya estaban, y GENERAL_EXTRA
  // tampoco. Cada pedido recibía el mismo paquete completo.
  //
  // Medido el 2026-08-28 con las dos puntas del rango:
  //
  //   "publicá un anuncio en Facebook..."  46 tools, 6.414 tokens
  //   "cuántos productos tengo"            46 tools, 6.414 tokens  ← idéntico
  //
  // Y `buildToolsDoc`, que hace el mismo trabajo para /operator y NO tiene
  // este bug, daba 6.853 y 1.662 para esos mismos dos pedidos. O sea que el
  // recorte del 2026-08-27 (commit fb29755) funcionó en una ruta y quedó
  // neutralizado en la otra -- justo en la que usa el panel.
  //
  // Ese es el costo real: contra el tope de 8.000 tokens por minuto de Groq,
  // 6.414 tokens de esquemas no dejan lugar para el system, el perfil del
  // negocio, el catálogo y la conversación. El pedido no entra, Groq lo
  // descarta en medio segundo y el turno se va a los modelos chicos.
  //
  // El núcleo es lo que sigue: lo que hace falta para CUALQUIER pregunta.
  "analyze_system", "list_products", "list_categories", "dashboard_summary",
  "get_agent", "get_settings", "get_store",
  // `web_search`/`web_fetch` van en el núcleo, no en un grupo. Motivo medido
  // en vivo (2026-08-15), con la clave de Tavily ya configurada y funcionando:
  // al pedirle "buscá el precio de curso de adiestramiento canino en
  // Colombia", el enrutador matcheó el grupo de PRECIOS (por la palabra
  // "precio") y le mandó payment_status/optimize_price -- sin buscador. Como
  // un grupo SÍ matcheó, tampoco se activó el respaldo de "ante la duda,
  // mandá todas". Atlas respondió "no tengo acceso a una herramienta de
  // búsqueda web" y, en otro intento, inventó precios etiquetándolos como
  // "datos históricos, no inventados".
  //
  // El patrón de investigación ni siquiera contemplaba "buscar"/"búsqueda",
  // así que pedirle explícitamente que busque era la forma más segura de
  // dejarlo sin buscador. En vez de perseguir palabras clave una por una,
  // van siempre: son de solo lectura, son dos esquemas, y sin ellas el
  // sistema fabrica datos -- que es el riesgo que este proyecto más cuida.
  "web_search", "web_fetch",
]);

const GRUPOS: { patron: RegExp; herramientas: string[] }[] = [
  {
    // ── Anuncios: CREAR ──────────────────────────────────────────────────
    //
    // Crear un anuncio y analizar campañas eran UN solo grupo de 17 tools, así
    // que "publicá este anuncio" arrastraba métricas, atribución, diagnóstico,
    // biblioteca de anuncios y logs: 1.537 tokens de esquemas que ese pedido
    // no usa nunca.
    //
    // No es cosmético. Medido contra producción el 2026-08-28: el pedido de
    // lectura (2.019 tokens de esquemas) se resolvía bien --"140 productos",
    // correcto-- y el de anuncio (4.197) se colgaba pasados los 4 minutos sin
    // proponer nada. Sumando lo que OpenCode reserva para la respuesta más el
    // system, el catálogo y la conversación, el de anuncio no entra en los
    // 8.000 tokens por minuto de Groq. Y Groq es hoy el ÚNICO proveedor vivo.
    //
    // Queda lo que de verdad se usa para crear: si Facebook está conectado, si
    // hay píxel (decide si el objetivo de ventas es viable), qué borradores
    // existen y a qué público apuntar. El trabajo pesado --buscar el producto,
    // armar el brief, escribir el copy, validarlo, guardarlo y subirlo-- lo
    // hace `crear_anuncio` ENTERO del lado del servidor, y las herramientas de
    // escritura ni siquiera viajan por acá: pasan por `propose_action`.
    //
    // `web_search`/`web_fetch` no hace falta listarlas: están en el NÚCLEO y
    // viajan siempre. Eso cubre el caso que reportó el admin en su momento,
    // cuando un pedido de anuncio moría con "todavía no investigaste nada".
    patron: /facebook|anuncio|campa|meta|ads?\b|publicit|p[uú]blico|audiencia|creativ/i,
    herramientas: ["fb_status", "fb_pixel_status", "fb_suggest_audience", "fb_list_drafts", "fb_page_can_post", "fb_page_preview"],
  },
  {
    // ── Anuncios: ANALIZAR ───────────────────────────────────────────────
    // Se activa cuando el pedido pregunta CÓMO VA algo, no cuando pide crear.
    // Un "¿cómo va mi campaña de Facebook?" matchea los dos grupos y recibe la
    // unión, que es lo correcto: ahí sí hacen falta las dos mitades.
    patron: /m[eé]trica|rendimiento|resultado|c[oó]mo va|c[oó]mo est[aá]|gast|roas|cpa|cpc|conversion|analiz|diagn[oó]stic|atribuci|aprendiz|optimiz|competencia|competidor/i,
    herramientas: ["fb_campaign_metrics", "fb_list_adsets", "fb_agent_logs", "fb_ad_library", "marketing_attribution", "marketing_diagnostico", "marketing_aprendizajes", "ad_brief"],
  },
  {
    patron: /whatsapp|wasap|conversaci|chat|mensaje|cliente|lead/i,
    herramientas: ["whatsapp_status", "list_recent_conversations", "predict_customer"],
  },
  {
    // "busc"/"búsqueda" y "competidor" faltaban: pedirle literalmente que
    // buscara algo no matcheaba este grupo. Ver el comentario del NÚCLEO.
    patron: /investig|averigu|indag|research|busc|b[uú]squeda|tendencia|competencia|competidor|mercado|benchmark|qu[eé] funciona/i,
    herramientas: ["fb_ad_library", "web_search", "web_fetch"],
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
    herramientas: ["ad_brief", "optimize_copy", "reason_business_decision"],
  },
];

// Cuando el pedido no cae en ningún grupo (ej. "¿cómo está el sistema?"), NO
// se mandan las 34: se manda el núcleo + un puñado de estados generales.
// Medido: con el respaldo de "mandar todas", ese pedido seguía tardando 45-77s
// mientras uno que sí matcheaba bajó de 69s a 10,6s. El núcleo cubre de sobra
// las preguntas generales del negocio; si de verdad hiciera falta algo
// específico, el admin lo va a nombrar y ahí sí matchea su grupo.
const GENERAL_EXTRA = ["whatsapp_status", "payment_status", "fb_status", "list_recent_conversations"];

function herramientasRelevantes(pedido?: string): Set<string> | null {
  if (!pedido || pedido.trim().length < 3) return null; // sin pista real: mandar todas
  const activos = GRUPOS.filter((g) => g.patron.test(pedido));
  const set = new Set(NUCLEO);
  if (activos.length === 0) {
    for (const h of GENERAL_EXTRA) set.add(h);
    return set;
  }
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
        handler: async (args, ctx) => {
          // Se deja constancia de QUÉ leyó de verdad en este turno. Sirve para
          // desmentirlo después: se lo vio informar "1 lead, 4 conversaciones"
          // cuando el panel mostraba 5 y 23. Las dos consultas son idénticas
          // (mismo filtro de tenant, mismo conteo), así que esos números no
          // salieron de la herramienta: los inventó. Sin este registro no hay
          // forma de distinguir un dato leído de uno recordado.
          registrarLecturaDelTurno(ctx, name).catch(() => {});
          return executeAction(name, args, ctx);
        },
      };
    });

  // Catálogo REAL de acciones de cambio, generado del registro.
  //
  // Antes la única pista de qué se podía cambiar eran tres ejemplos sueltos
  // en este texto ("update_product, fb_create_ad, dropi_create_order"). El
  // resto de las acciones existían pero Atlas no tenía cómo enterarse de que
  // existían. Caso real (16-08-2026): el admin le pidió activar su campaña de
  // piano y Atlas ni lo intentó -- `fb_resume_campaign` está implementada,
  // pero él no sabía el nombre. Se veía como "no quiso" cuando era "no sabía
  // que podía". Listarlas todas convierte eso en imposible.
  const familiaDelPedido = herramientasDeLaFamilia(pedido || "");
  const accionesDeCambio = ALL_OPERATOR_TOOLS
    // fb_set_ad_status no se anuncia: existe, pero para el modelo el camino es
    // fb_make_campaign_deliver (ver REDIRIGIR en proposeAction). Mostrarla solo
    // le da una forma de equivocarse con ids que no leyó.
    .filter((t) => !READ_ONLY_TOOLS.has(t.name) && !EXCLUDED_FROM_MCP.has(t.name) && t.name !== "fb_set_ad_status")
    // ── El CONTRATO de argumentos viaja, no solo el nombre ────────────────
    //
    // Antes esto era solo `nombre: primera frase de la descripción`. El modelo
    // veía QUÉ puede hacer y nunca CÓMO se llaman los parámetros, así que los
    // adivinaba.
    //
    // Medido en producción el 2026-08-28, pidiendo un anuncio a WhatsApp:
    // Atlas propuso `fb_create_ad` con `{ productId: 124, dailyBudget: 20000,
    // whatsappContact: true }`. `whatsappContact` NO EXISTE -- el parámetro
    // real es `objetivo: "mensajes"`. La campaña habría salido de ventas a la
    // web, que es justo lo que el admin viene reportando.
    //
    // Y explica la familia entera de bugs de ids inválidos que volvió tres
    // veces (productId ausente, draftId con un id de campaña de Meta de 18
    // dígitos, productId en 0): el modelo nunca vio el contrato, así que
    // completaba los campos con lo que le parecía. Tapar cada agujero con una
    // validación nueva trataba el síntoma; esto es la causa.
    //
    // Los `args` van SOLO para las herramientas de la familia del pedido. Es
    // el mismo criterio que ya usa el recorte de arriba y por el mismo motivo:
    // mandar el contrato de las ~40 herramientas de cambio costaría más de lo
    // que entra en el presupuesto por minuto. Para las demás sigue yendo el
    // nombre, que es lo que evita el otro fallo ya conocido -- Atlas diciendo
    // "no tengo cómo" sobre algo que sí puede (caso del 16-08-2026).
    .map((t) => {
      const resumen = String(t.description || "").split(/\.\s|\. /)[0].slice(0, 110);
      // `herramientasDeLaFamilia` es el mismo criterio que usa buildToolsDoc,
      // compartido a propósito: cubre las de CAMBIO (que no están en los
      // GRUPOS de este archivo, porque esos solo listan lecturas). Devuelve
      // null cuando no hay pista y ahí van todos los contratos.
      const enFamilia = !familiaDelPedido || familiaDelPedido.has(t.name);
      if (!enFamilia || !t.args) return `${t.name}: ${resumen}`;
      // El contrato se acorta a 200 caracteres. Lo que hace falta para no
      // inventar --los NOMBRES de los campos, cuáles son obligatorios y los
      // valores válidos de los enums-- va al principio de cada `args`; lo que
      // se corta es la explicación larga del final.
      //
      // No es una economía cosmética: mandar los contratos completos llevó el
      // pedido de anuncio de 2.585 a 3.994 tokens, y 4.197 es el tamaño con el
      // que se colgaba en producción.
      //
      // 200 sale de medir, no de elegir un número redondo. Barrido sobre el
      // mismo pedido de anuncio, mirando el costo y si el modelo sigue viendo
      // el parámetro `objetivo` (el que se estaba inventando):
      //
      //   300 -> 3.652 tk   objetivo visible en crear_anuncio y fb_create_ad
      //   200 -> 3.474 tk   objetivo visible en las dos          <- acá
      //   160 -> 3.379 tk   crear_anuncio YA NO lo ve
      //   120 -> 3.257 tk   crear_anuncio YA NO lo ve
      //
      // Por debajo de 200 se ahorran ~100 tokens y se pierde justamente el
      // dato por el que existe todo esto.
      const contrato = String(t.args);
      return `${t.name}: ${resumen}\n    args: ${contrato.length > 200 ? contrato.slice(0, 200) + " …}" : contrato}`;
    });

  const proposeTool: McpToolDef = {
    name: "propose_action",
    description:
      "Proponer un CAMBIO real (crear/editar/eliminar algo, publicar, gastar, enviar) para que el admin lo apruebe -- NUNCA lo ejecuta. " +
      "Pasá el nombre EXACTO de la herramienta de cambio y sus argumentos reales. " +
      "El sistema le muestra la propuesta al admin en español llano y espera su confirmación explícita antes de aplicar nada.\n\n" +
      "ACCIONES DISPONIBLES (usá exactamente estos nombres; si lo que te piden está acá, PODÉS hacerlo -- no digas que no tenés cómo):\n" +
      accionesDeCambio.map((l) => `- ${l}`).join("\n"),
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
