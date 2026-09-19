import { Router } from "express";
import { createAIClient, getProviderConfig, getProviderConfigFromSettings, getOpenCodeRotation, modelosPara, type AIProviderConfig } from "@workspace/integrations-openai-ai-server";
import { db, agents, settings, products, productCategories, conversations, messages } from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { esUnSiParaEstePlan } from "../lib/es-un-si";
import { extraerJSON } from "../lib/respuesta-json";
import { dbNow } from "../lib/date-utils";
import type { TenantRequest } from "../lib/tenantManager";
import { getCopilotSessionToken } from "../lib/copilot";
import {
  getOptimizedProviderOrder,
  reportProviderResult,
  getProviderTimeout,
} from "../lib/optimized-rotation";
import { getG4FResponse } from "../lib/providers/g4f-provider";
import { G4F_ENABLED } from "../config/g4f.config";
import { PROVEEDORES } from "./ai-catalog";
import { OPERATOR_SYSTEM_PROMPT, buildToolsDoc, executeAction, isReadOnlyTool, isKnownTool, verifyMutation, mensajeParaAdmin, validarContenidoAnuncio, bloqueoDeMeta, type OperatorContext } from "../lib/app-operator";
import { leerBusinessConfig } from "../lib/ai-keys";
import {
  loadArchitectHistory, saveArchitectTurn, getPendingPlan, setPendingPlan,
  clearPendingPlan, clearArchitectHistory, isApproval, isRejection,
  saveRepairLesson, loadRecentLessons,
} from "../lib/architect-store";
import { toEmojiStyle } from "../lib/conversation-engine";
import { esResumenInterno, pareceIngles, avisoDeTurnoIncompleto } from "../lib/respuesta-al-admin";
import { describePlannedAction } from "../lib/opencode-mcp-tools";
import { MODULO_PUBLICIDAD, FORMATO_ANUNCIO } from "../lib/publicidad-persuasiva";

/**
 * El frontend del operador renderiza "reply" con ReactMarkdown (ver
 * code-agent.tsx), y en Markdown/CommonMark un solo salto de línea DENTRO de
 * un párrafo se colapsa a un espacio -- solo una línea EN BLANCO (salto
 * doble) separa líneas de verdad. El prompt de Atlas (OPERATOR_SYSTEM_PROMPT,
 * reglas 9 y 10) le pide al modelo escribir siempre con dos saltos entre
 * líneas, pero un modelo de la rotación gratis no lo respeta con
 * consistencia -- el síntoma reportado es que la respuesta se ve "toda
 * amontonada" pese a que el texto crudo sí tenía saltos de línea.
 *
 * En vez de confiar 100% en que el modelo obedezca, se normaliza acá:
 * cualquier corrida de uno o más saltos de línea se vuelve exactamente dos.
 * Es seguro específicamente para las respuestas de Atlas porque nunca traen
 * bloques de código ni tablas -- son texto conversacional con líneas de
 * emoji, exactamente el formato que el propio prompt pide separar con
 * líneas en blanco.
 */
/**
 * Nombres técnicos de herramientas dichos al admin, traducidos a lenguaje
 * llano.
 *
 * El prompt ya prohíbe mostrarlos (regla 6.3), pero una regla de prompt no es
 * una garantía: se lo vio en vivo escribiendo "Te propongo diagnosticar
 * primero con atlas_fb_why_not_delivering. ¿Confirmás?". Al admin ese nombre
 * no le dice nada y lo saca de la conversación -- de golpe está leyendo
 * código en vez de hablando con alguien que lo ayuda. Se limpia acá, que es
 * por donde pasa TODA respuesta antes de mostrarse.
 */
const NOMBRES_LLANOS: Array<[RegExp, string]> = [
  [/\batlas_fb_why_not_delivering\b|\bfb_why_not_delivering\b/gi, "revisar por qué no está entregando"],
  [/\batlas_fb_set_ad_status\b|\bfb_set_ad_status\b/gi, "encender o apagar el anuncio"],
  [/\batlas_fb_list_campaigns\b|\bfb_list_campaigns\b/gi, "revisar tus campañas"],
  [/\batlas_fb_campaign_metrics\b|\bfb_campaign_metrics\b/gi, "mirar las métricas"],
  [/\batlas_fb_upload_draft_to_meta\b|\bfb_upload_draft_to_meta\b/gi, "subir el borrador a Meta en pausa"],
  [/\batlas_fb_resume_campaign\b|\bfb_resume_campaign\b/gi, "reactivar la campaña"],
  [/\batlas_fb_pause_campaign\b|\bfb_pause_campaign\b/gi, "pausar la campaña"],
  [/\batlas_fb_ad_draft\b|\bfb_ad_draft\b/gi, "preparar el borrador del anuncio"],
  [/\batlas_system_diagnose\b|\bsystem_diagnose\b/gi, "revisar el sistema a fondo"],
  [/\batlas_list_products\b|\blist_products\b/gi, "revisar tu catálogo"],
  [/\batlas_propose_action\b|\bpropose_action\b/gi, "proponerte el cambio"],
  // Cualquier otro que se escape: se saca el prefijo y los guiones bajos, que
  // es mejor que mostrar "atlas_dropi_create_order" tal cual.
  [/\batlas_([a-z]+(?:_[a-z]+)+)\b/gi, (m: any, n: string) => n.replace(/_/g, " ")] as any,
];

export function paraMarkdown(texto: string): string {
  if (!texto) return texto;
  let t = texto.replace(/\r\n/g, "\n").replace(/\n+/g, "\n\n").trim();
  for (const [patron, reemplazo] of NOMBRES_LLANOS) t = t.replace(patron, reemplazo as any);
  return t;
}

/**
 * El frontend manda TODO el historial de la conversación en cada turno (ver
 * code-agent.tsx). En un hilo que lleva días de uso real (visto en vivo:
 * decenas de turnos, algunos con respuestas largas de investigación) ese
 * payload crece sin límite -- confirmado en vivo el 2026-08-10 que un pedido
 * simple ("decime hola") respondía en 11s con historial vacío, pero el MISMO
 * mensaje real del admin se quedaba colgado sin error ni respuesta con el
 * historial completo de esa conversación de varios días. No se identificó
 * cuál límite exacto se pisa (tokens del modelo, tamaño de body, timeout del
 * proxy) -- no importa cuál sea, la app tiene que degradar sola en vez de
 * colgarse en silencio. Se recorta a los últimos N turnos ANTES de construir
 * cualquier prompt; el admin sigue viendo su historial completo en pantalla
 * (vive aparte, en el navegador/architect_memory), solo se acorta lo que se
 * manda al modelo.
 */
const HISTORIAL_MAX_TURNOS = 30;
function acotarHistorial(historial: unknown): { role: string; content: string }[] {
  if (!Array.isArray(historial)) return [];
  return historial.slice(-HISTORIAL_MAX_TURNOS);
}

/**
 * Detecta cuando el modelo responde ANUNCIANDO lo que va a hacer ("ahora voy a
 * investigar X…") en vez de entregar el resultado. Pasaba que devolvía el
 * anuncio con done:true, el bucle cortaba y el admin recibía la conversación a
 * medias, teniendo que escribir "sigue" para cada paso.
 */
function isAnnouncement(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  // Un anuncio suele ser corto y termina prometiendo el siguiente paso.
  if (t.length > 1200) return false;
  return /\b(ahora\s+(voy|procedo|investig|busc|revis|continú)|voy\s+a\s+(investigar|buscar|revisar|crear|consultar|analizar|completar|seguir)|proceder[ée]|procedo\s+a|d[ée]jame\s+(investigar|buscar|revisar|consultar)|perm[ií]teme\s+(investigar|buscar|revisar)|en\s+seguida|a\s+continuaci[óo]n\s+(voy|investig|busc)|siguiente\s+paso\s*:|estoy\s+(investigando|buscando|revisando|recopilando)|seguir[ée]\s+(investigando|buscando)|luego\s+(crear[ée]|investigar[ée]))/i.test(t);
}

/**
 * Primer proveedor de IA que el admin haya guardado a propósito en
 * Configuración → Modelos de pago (catálogo de 23 proveedores en
 * ai-catalog.ts, con prueba de conexión real vía /api/ai/test).
 *
 * Antes esto no se leía en ningún endpoint de IA del operador/arquitecto: el
 * admin podía elegir "OpenAI" o "Anthropic" con su propia clave, ver
 * "✅ funciona" en el botón Probar conexión, y el sistema seguía usando en
 * silencio el fallback fijo (opencode/groq/nvidia/github) sin tocar jamás lo
 * que el admin configuró explícitamente -- la elección quedaba guardada en la
 * base pero era letra muerta para cualquier respuesta real. Se prueba
 * PRIMERO, antes que cualquier fallback genérico: es una decisión explícita
 * y más reciente que cualquier default del sistema.
 */
function proveedorGuardadoPrioritario(businessConfig: unknown): AIProviderConfig | null {
  const guardados = leerBusinessConfig(businessConfig).aiProviders || {};
  for (const proveedor of Object.keys(guardados)) {
    const cfg = getProviderConfig(proveedor);
    if (cfg) return cfg;
  }
  return null;
}

/** Empujón para que complete el trabajo en el mismo turno, sin anunciarlo. */
const CONTINUE_NUDGE =
  "No anuncies lo que vas a hacer: HAZLO ahora en este mismo turno. " +
  "Llama las herramientas que falten (web_fetch, list_products, etc.) y sigue " +
  "hasta tener el resultado completo. Si ya reuniste la información y toca " +
  "crear o modificar algo, propón el plan con datos reales. " +
  'Solo pon done:true cuando entregues el resultado final o el plan a confirmar.';

const router = Router();

/**
 * Último proveedor de IA que respondió de verdad, como "baseUrl|model".
 * Es solo una pista de rendimiento para no volver a probar primero a los que
 * están caídos (ver callAI en el endpoint del operador). Si queda obsoleta no
 * rompe nada: la rotación igual recorre todos los candidatos.
 */
let ultimoProveedorBueno = "";

/**
 * Traduce el nombre técnico de una herramienta a lo que se le muestra al
 * admin mientras Atlas trabaja.
 *
 * IMPORTANTE: el respaldo NUNCA es el nombre crudo de la herramienta. La
 * regla del producto es que en ninguna parte de la app aparezcan nombres
 * técnicos (`fb_ad_draft`, `deep_research`...) -- quien administra el panel no
 * es programador y eso solo confunde. Ante una herramienta no mapeada se dice
 * algo genérico pero honesto.
 */
function describirTarea(tool: string): string {
  const t = String(tool || "").toLowerCase();
  if (/^(web_search|deep_research|web_fetch|web_scrape)/.test(t)) return "Buscando información en internet";
  if (/image/.test(t)) return "Trabajando con las imágenes";
  if (/product|catalog/.test(t)) return "Revisando tu catálogo de productos";
  if (/whatsapp|wa_/.test(t)) return "Revisando tu WhatsApp";
  if (/conversation|message|chat/.test(t)) return "Revisando tus conversaciones";
  if (/lead|prospect|customer|client/.test(t)) return "Revisando tus prospectos";
  if (/^fb_|facebook|meta_|\bad\b|ads?_|campaign/.test(t)) return "Consultando tu cuenta de Facebook";
  if (/agent/.test(t)) return "Revisando tus agentes de venta";
  if (/analytic|metric|dashboard|report|insight|stats/.test(t)) return "Mirando tus métricas";
  if (/payment|price|pricing|billing|plan/.test(t)) return "Revisando precios y cobros";
  if (/setting|config|brand|store|tienda/.test(t)) return "Revisando la configuración de tu negocio";
  return "Consultando la información de tu negocio";
}

/**
 * AGENT ARCHITECT AI
 * This endpoint allows users to design their agents via natural language chat.
 * Kimi 2.6 will interpret the request and update the agent's DNA.
 */
router.post("/architect", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { prompt, history: historialCrudo = [] } = req.body;
    const history = acotarHistorial(historialCrudo);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🧠 ANÁLISIS DEL NEGOCIO REAL — Datos de la BD
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // 1. Obtener configuración actual del negocio
    // `settings` es una tabla GLOBAL: una sola fila para toda la plataforma,
    // sin tenant_id. Usarla para el nombre hacia que Atlas creyera que TODOS
    // los negocios se llaman igual. El nombre real es el del tenant, igual que
    // ya se resolvio en agent.ts.
    const [dbSettings] = await db.select().from(settings).limit(1);
    const { tenantManager } = await import("../lib/tenantManager");
    const tenantPropio = await tenantManager.getTenantById(tenantId);
    const businessName = tenantPropio?.brandName || dbSettings?.businessName || "Mi Negocio";
    const businessType = dbSettings?.businessType || "digital_products";

    // 2. Obtener agente actual (si existe)
    const [currentAgent] = await db
      .select()
      .from(agents)
      .where(eq(agents.tenantId, tenantId))
      .limit(1);

    // ── 3. Productos activos DE ESTE NEGOCIO ──────────────────────────────
    //
    // Estas dos consultas no filtraban por tenant. En un SaaS eso significa
    // que el perfil con el que Atlas DISEÑA el agente de un cliente se armaba
    // con los productos y las categorías de TODOS -- le diseñaba el vendedor a
    // uno con el catálogo de otro. Nadie se enteraba: el perfil se ve
    // razonable igual, solo que habla de mercancía ajena.
    //
    // Es el mismo defecto que ya se corrigió en la búsqueda del catálogo del
    // bot (ver agent.ts, "mezclaba productos de TODOS los tenants -- con un
    // solo tenant real activo no se notaba"). Acá quedó sin corregir.
    const activeProducts = await db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))
      .limit(20);

    // Y el CONTEO va aparte del listado. `activeProducts` está limitado a 20,
    // así que usar su `.length` como "productos activos" tapaba el número real
    // en cualquier negocio con más de 20 -- este tiene 84.
    const [{ activosReales }] = await db
      .select({ activosReales: sql<number>`cast(count(*) as integer)` })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));

    // 4. Categorías de productos, también de este negocio
    const categories = await db
      .select()
      .from(productCategories)
      .where(eq(productCategories.tenantId, tenantId))
      .limit(10);

    // 5. Analizar conversaciones recientes (últimas 50)
    const recentConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.tenantId, tenantId))
      .orderBy(desc(conversations.createdAt))
      .limit(50);

    // 6. Analizar mensajes para detectar patrones
    const allMessages = await db
      .select()
      .from(messages)
      .where(
        and(
          // Estaba `recentConversations[0]?.id`: se traian las ultimas 50
          // conversaciones y despues se leian los mensajes de UNA SOLA. Las
          // "objeciones comunes" y las "preguntas frecuentes" con las que
          // Atlas disena el agente salian de un unico chat, y de ahi que
          // parecieran tan pobres.
          inArray(messages.conversationId, recentConversations.length ? recentConversations.map((c) => c.id) : [0]),
          eq(messages.role, "customer")
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(100);

    // ── 6b. Y LO QUE CONTESTO EL BOT, que es donde estan los errores ──────
    //
    // Reportado el 2026-09-03: el admin escribio "revisa las conversaciones,
    // ahi podras ver los errores" y Atlas le contesto pidiendole "acceso o
    // ejemplos concretos de las conversaciones".
    //
    // Parte de eso es el modelo ignorando su contexto (ver la regla dura mas
    // abajo), pero habia un hueco REAL: la consulta de arriba filtra
    // `role: "customer"`, asi que el perfil traia solo lo que escribieron los
    // CLIENTES. Los errores del bot estan en las respuestas del BOT, y esas
    // nunca se cargaban. Atlas no podia revisarlas ni queriendo.
    //
    // Se traen los ultimos intercambios completos --pregunta y respuesta, en
    // orden-- porque una respuesta suelta no se puede juzgar: "$60.000" esta
    // bien o mal segun que le hayan preguntado.
    const intercambios = await db
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, recentConversations.length ? recentConversations.slice(0, 10).map((c: any) => c.id) : [0]))
      .orderBy(desc(messages.createdAt))
      .limit(60);

    const conversacionesReales = (() => {
      const porChat = new Map<number, any[]>();
      for (const m of [...intercambios].reverse()) {
        const lista = porChat.get(m.conversationId) || [];
        lista.push(m);
        porChat.set(m.conversationId, lista);
      }
      return Array.from(porChat.values())
        .slice(0, 4)
        .map((msgs) =>
          msgs
            .slice(-8)
            .map((m) => `${m.role === "customer" ? "Cliente" : "Bot"}: ${String(m.content || "").slice(0, 240)}`)
            .join("\n"),
        );
    })();

    // 7. Detectar objeciones comunes
    const objectionKeywords = ["caro", "costoso", "no sé", "duda", "garantía", "funciona", "estafa"];
    const objectionMessages = allMessages.filter(m => 
      objectionKeywords.some(k => m.content.toLowerCase().includes(k))
    );

    // 8. Detectar preguntas frecuentes
    const faqKeywords = ["entrega", "acceso", "garantía", "duración", "incluye", "soporte"];
    const faqMessages = allMessages.filter(m =>
      faqKeywords.some(k => m.content.toLowerCase().includes(k))
    );

    // 9. Detectar productos más mencionados
    const productMentions = new Map<string, number>();
    activeProducts.forEach(p => {
      const mentions = allMessages.filter(m =>
        m.content.toLowerCase().includes(p.name.toLowerCase())
      ).length;
      if (mentions > 0) productMentions.set(p.name, mentions);
    });

    // 10. Construir perfil del negocio
    const businessProfile = {
      name: businessName,
      type: businessType,
      productsCount: activosReales,
      categoriesCount: categories.length,
      conversationsCount: recentConversations.length,
      topProducts: Array.from(productMentions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name),
      commonObjections: objectionMessages.slice(0, 10).map(m => m.content),
      frequentQuestions: faqMessages.slice(0, 10).map(m => m.content),
      conversacionesReales,
      hasActiveAgent: !!currentAgent,
      currentAgentConfig: currentAgent ? {
        name: currentAgent.name,
        role: currentAgent.role,
        tone: currentAgent.tone,
        hasAdvancedFeatures: !!(currentAgent.metadata as any)?.objectionHandling,
      } : null,
    };

    logger.info({ 
      businessProfile,
      productsAnalyzed: activeProducts.length,
      conversationsAnalyzed: recentConversations.length,
      messagesAnalyzed: allMessages.length
    }, "[Architect] Business profile analyzed");

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Obtener configuración de IA
    let aiConfig = proveedorGuardadoPrioritario((dbSettings as any)?.businessConfig)
      || getProviderConfigFromSettings(dbSettings || {})
      || getProviderConfig("opencode")
      || getProviderConfig("groq")
      || getProviderConfig("nvidia")
      || getProviderConfig("github");

    if (!aiConfig) {
      return res.status(500).json({ error: "No AI engine configured for Architect" });
    }

    logger.info({ provider: aiConfig.baseUrl, model: aiConfig.model }, "[Architect] Using AI provider");

    // Refresh Copilot Token if using github internal
    if (aiConfig.baseUrl === "https://api.githubcopilot.com") {
      const now = new Date();
      const expiresAt = dbSettings?.copilotSessionExpiresAt ? new Date(dbSettings.copilotSessionExpiresAt) : null;
      
      if (dbSettings?.copilotSessionToken && expiresAt && expiresAt > now) {
        logger.info("[Copilot] Usando token de sesión cacheado.");
        aiConfig.apiKey = dbSettings.copilotSessionToken;
      } else {
        logger.info("[Copilot] Token de sesión expirado o no encontrado. Obteniendo uno nuevo...");
        const session = await getCopilotSessionToken(aiConfig.apiKey);
        if (session) {
          aiConfig.apiKey = session.token;
          await db.update(settings)
            .set({ 
              copilotSessionToken: session.token,
              copilotSessionExpiresAt: new Date(session.expires_at).toISOString()
            })
            .where(eq(settings.id, dbSettings!.id));
        }
      }
    }

    const client = createAIClient(aiConfig);
    
    const systemPrompt = `
Te llamas Atlas (nombre completo "Atlas VentasPro"). En este modo actúas como la **ARQUITECTA MAESTRA DEL SISTEMA DE VENTAS CON IA**. Tu misión es REINVENTAR la lógica de negocio, PROGRAMAR estrategias de élite y CONFIGURAR el éxito total.

NO eres un chat genérico. Eres una CONSULTORA EXPERTA que analiza datos reales del negocio para crear agentes profesionales y personalizados. Si el admin te pregunta tu nombre, respondé Atlas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 DATOS REALES DEL NEGOCIO QUE TIENES DISPONIBLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**NEGOCIO:**
• Nombre: ${businessProfile.name}
• Tipo: ${businessProfile.type}
• Productos activos: ${businessProfile.productsCount}
• Categorías: ${businessProfile.categoriesCount}
• Conversaciones analizadas: ${businessProfile.conversationsCount}

**PRODUCTOS MÁS POPULARES:**
${businessProfile.topProducts.length > 0 ? businessProfile.topProducts.map((p, i) => `${i + 1}. ${p}`).join('\n') : "• No hay datos suficientes aún"}

**OBJECIONES COMUNES DETECTADAS:**
${businessProfile.commonObjections.length > 0 ? businessProfile.commonObjections.slice(0, 5).map((o, i) => `${i + 1}. "${o}"`).join('\n') : "• No hay datos suficientes aún"}

**PREGUNTAS FRECUENTES DETECTADAS:**
${businessProfile.frequentQuestions.length > 0 ? businessProfile.frequentQuestions.slice(0, 5).map((q, i) => `${i + 1}. "${q}"`).join('\n') : "• No hay datos suficientes aún"}

**COMO ESTA CONTESTANDO HOY (conversaciones reales, textuales):**
${businessProfile.conversacionesReales.length > 0 ? businessProfile.conversacionesReales.map((c, i) => `--- Conversacion ${i + 1} ---\n${c}`).join("\n\n") : "• Todavia no hay conversaciones para revisar"}

**AGENTE ACTUAL:**
${businessProfile.hasActiveAgent ? `
• Nombre: ${businessProfile.currentAgentConfig?.name}
• Rol: ${businessProfile.currentAgentConfig?.role}
• Tono: ${businessProfile.currentAgentConfig?.tone}
• Características avanzadas: ${businessProfile.currentAgentConfig?.hasAdvancedFeatures ? "SÍ" : "NO"}
` : "• No hay agente configurado aún"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TU MISIÓN COMO ARQUITECTA EXPERTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **ANALIZA LOS DATOS REALES** del negocio antes de hacer cualquier recomendación
2. **USA LAS OBJECIONES COMUNES** para crear estrategias de manejo específicas
3. **USA LAS PREGUNTAS FRECUENTES** para anticipar dudas y responder proactivamente
4. **USA LOS PRODUCTOS POPULARES** para enfocar las estrategias de venta
5. **APRENDE DEL AGENTE ACTUAL** (si existe) y mejora lo que ya funciona
6. **NO REPITAS** configuraciones que ya están activas — mejora o complementa
7. **SÉ ESPECÍFICA** — usa nombres reales de productos, objeciones reales, preguntas reales

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⛔ NO LE PIDAS AL ADMIN LO QUE YA TENÉS ARRIBA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Esto pasó de verdad el 2026-09-03 y es el peor defecto que podés tener acá:

  admin: "revisá las conversaciones que hemos tenido, ahí podrás ver los errores"
  vos:   "necesitaría acceso o ejemplos concretos de las conversaciones..."

Las conversaciones están ARRIBA, textuales. Pedirlas le dice al admin que no
leíste lo que ya tenés en la mano, y lo obliga a hacer tu trabajo.

REGLAS DURAS:

• Si el dato está en el bloque de arriba, NO SE PREGUNTA. Se usa y se cita.
  Ya tenés: el nombre del negocio, cuántos productos hay, los más vendidos,
  las objeciones reales, las preguntas frecuentes, LAS CONVERSACIONES TEXTUALES
  y la configuración actual del agente (nombre, rol, tono).

• Cuando el admin diga "revisá las conversaciones" o "mirá los errores":
  ABRÍ las conversaciones de arriba, señalá renglones CONCRETOS y decí qué está
  mal en cada uno. Nada de listas de preguntas.

• Como mucho UNA pregunta, y solo si de verdad no podés avanzar sin ella.
  Cinco preguntas seguidas no son una consulta: son un formulario.

• Si ya preguntaste algo en este mismo chat y no te contestaron, NO lo vuelvas
  a preguntar con otras palabras. Avanzá con lo que tenés y decí qué asumiste.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 CAPACIDADES AVANZADAS QUE PUEDES CONFIGURAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **PERSONALIDAD Y TONO**
   - Nombre del agente
   - Rol (Vendedor Elite, Consultor, Amigo Experto, etc.)
   - Tono (Profesional, Amigable, Directo, Empático, etc.)
   - Uso de emojis (Ninguno, Moderado, Abundante)
   - Estilo de escritura (Formal, Casual, Técnico, Simple)

2. **INTELIGENCIA CONTEXTUAL**
   - Análisis de intención del cliente
   - Detección de urgencia (baja, media, alta, crítica)
   - Análisis de sentimiento (muy negativo → muy positivo)
   - Comprensión de pain points
   - Detección de motivaciones
   - Identificación de barreras

3. **ESTRATEGIAS DE RESPUESTA**
   - Educativa: Para clientes que no saben mucho
   - Empática: Para objeciones y preocupaciones
   - Persuasiva: Para clientes con alta intención de compra
   - Consultiva: Para comparaciones y decisiones
   - Directa: Para respuestas rápidas y claras

4. **MANEJO DE OBJECIONES**
   - Objeción de precio: "Es muy caro"
   - Objeción de tiempo: "No tengo tiempo"
   - Objeción de confianza: "No sé si funciona"
   - Objeción de necesidad: "No lo necesito ahora"
   - Objeción de comparación: "Hay opciones más baratas"

5. **ESTRATEGIAS DE CIERRE**
   - Cierre directo: "¿Quieres comprarlo?"
   - Cierre alternativo: "¿Prefieres A o B?"
   - Cierre de urgencia: "Oferta por tiempo limitado"
   - Cierre consultivo: "Basado en lo que me dijiste..."
   - Cierre suave: "¿Te gustaría más información?"

6. **ETAPAS DE VENTA**
   - Saludo: Primera impresión
   - Calificación: Entender necesidades
   - Presentación: Mostrar productos
   - Manejo de objeciones: Resolver dudas
   - Cierre: Facilitar la compra
   - Post-venta: Seguimiento

7. **REGLAS DE NEGOCIO**
   - Productos disponibles
   - Precios y descuentos
   - Métodos de pago
   - Forma de entrega (Google Drive)
   - Acceso vitalicio
   - Garantías y políticas

8. **LÍMITES Y RESTRICCIONES**
   - Qué NO debe hacer el agente
   - Qué NO debe prometer
   - Cuándo escalar a humano
   - Información que NO debe inventar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FORMATO DE RESPUESTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Debes responder SIEMPRE en formato JSON con esta estructura COMPLETA:

{
  "reply": "Tu mensaje explicando los cambios que realizaste y por qué",
  "config": {
    "name": "Nombre del agente (ej: Sofía, Carlos, Ana)",
    "role": "Rol específico (ej: Vendedora Elite de Cursos Digitales)",
    "tone": "Tono principal (ej: Profesional y Empática)",
    "systemPrompt": "PROMPT MAESTRO COMPLETO con todas las instrucciones, reglas, personalidad y estrategias",
    "stages": [
      {
        "key": "greeting",
        "name": "Saludo Inicial",
        "prompt": "Instrucciones específicas para el saludo"
      },
      {
        "key": "qualification",
        "name": "Calificación de Necesidades",
        "prompt": "Instrucciones para entender qué necesita el cliente"
      },
      {
        "key": "presentation",
        "name": "Presentación de Productos",
        "prompt": "Instrucciones para mostrar productos relevantes"
      },
      {
        "key": "objection_handling",
        "name": "Manejo de Objeciones",
        "prompt": "Instrucciones para manejar objeciones comunes"
      },
      {
        "key": "closing",
        "name": "Cierre de Venta",
        "prompt": "Instrucciones para facilitar la compra"
      },
      {
        "key": "post_sale",
        "name": "Post-Venta",
        "prompt": "Instrucciones para seguimiento después de la venta"
      }
    ],
    "objectionHandling": {
      "price": "Estrategia específica para objeciones de precio",
      "time": "Estrategia para 'no tengo tiempo'",
      "trust": "Estrategia para falta de confianza",
      "need": "Estrategia para 'no lo necesito'",
      "comparison": "Estrategia para comparaciones"
    },
    "closingStrategies": [
      "Estrategia de cierre 1",
      "Estrategia de cierre 2",
      "Estrategia de cierre 3"
    ],
    "businessRules": {
      "delivery": "Entrega por Google Drive",
      "access": "Acceso vitalicio",
      "payment": "Métodos de pago aceptados",
      "guarantee": "Política de garantía"
    },
    "restrictions": [
      "NO inventar información sobre productos",
      "NO prometer descuentos no autorizados",
      "NO dar información técnica incorrecta"
    ]
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 INSTRUCCIONES DE DISEÑO BASADAS EN DATOS REALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **ANALIZA LOS DATOS PRIMERO**: Antes de responder, revisa los datos reales del negocio arriba
2. **USA OBJECIONES REALES**: Si hay objeciones comunes detectadas, crea estrategias específicas para cada una
3. **USA PREGUNTAS REALES**: Si hay preguntas frecuentes, anticípalas en el prompt del agente
4. **USA PRODUCTOS REALES**: Menciona los productos más populares por nombre en los ejemplos
5. **MEJORA LO EXISTENTE**: Si ya hay un agente, no lo reemplaces — mejóralo o complementa lo que falta
6. **SÉ ESPECÍFICO**: No uses frases genéricas — usa nombres reales, objeciones reales, preguntas reales
7. **INCLUYE EJEMPLOS REALES**: En los prompts, incluye ejemplos basados en conversaciones reales
8. **PIENSA EN EDGE CASES**: Considera situaciones difíciles detectadas en las conversaciones
9. **MANTÉN COHERENCIA**: El tono y personalidad deben ser consistentes con el negocio
10. **USA FORMATO ELITE**: Separadores ━━━━━, emojis estratégicos, estructura clara

**REGLAS CRÍTICAS:**
• Si el usuario pide "mejorar" o "optimizar", NO reemplaces todo — identifica qué falta y agrégalo
• Si hay objeciones comunes, crea respuestas específicas para cada una (no genéricas)
• Si hay preguntas frecuentes, incluye respuestas hardcodeadas en el prompt
• Si hay productos populares, enfoca las estrategias de venta en esos productos
• Si no hay datos suficientes, pregunta al usuario antes de asumir

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ EJEMPLOS DE PETICIONES QUE PUEDES MANEJAR (BASADAS EN DATOS REALES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ANÁLISIS Y PROPUESTAS:**
- "Analiza mi negocio y proponme el mejor agente"
- "¿Qué tipo de agente necesito según mis productos?"
- "Revisa las conversaciones y dime qué mejorar"

**MEJORAS ESPECÍFICAS:**
- "Mejora el manejo de objeciones de precio" → Usa las objeciones reales detectadas
- "Agrega respuestas para las preguntas frecuentes" → Usa las preguntas reales detectadas
- "Enfoca el agente en ${businessProfile.topProducts[0] || "los productos más vendidos"}" → Usa productos reales

**CONFIGURACIÓN DESDE CERO:**
- "Crea un vendedor muy directo y sin rodeos"
- "Quiero un bot amigable que use muchos emojis"
- "Necesito un agente formal para servicios B2B"

**OPTIMIZACIÓN:**
- "El agente repite mucho la misma información" → Analiza el agente actual y corrige
- "Necesito que detecte urgencia y actúe en consecuencia"
- "Quiero que sea más empático con clientes indecisos"

**ADEMAS, TIENES PODERES DE OPERADOR DEL SISTEMA:**
  
  Puedes ayudar al duenio a mejorar los productos directamente:
  - Mejorar descripciones de productos (POST /api/architect-tools/improve-description/:id)
  - Asignar imagenes a productos (POST /api/architect-tools/set-image/:id)
  - Mejora completa de producto (POST /api/architect-tools/improve-product/:id)
  - Mejora masiva de todos los productos (POST /api/architect-tools/improve-all-products)
  - Ver estado completo del sistema (GET /api/architect-tools/analyze-system)
  - Mejorar layout de cards (POST /api/architect-tools/improve-card-layout)
  - Actualizar producto directamente (PATCH /api/architect-tools/products/:id)

  **EJEMPLO:** Usuario: "mejora el producto 5" → Usa POST /api/architect-tools/improve-product/5
  **EJEMPLO:** Usuario: "analiza el sistema" → Usa GET /api/architect-tools/analyze-system
  **EJEMPLO:** Usuario: "mejora todo" → Usa POST /api/architect-tools/improve-all-products

Actúa con la autoridad de una Ingeniera Senior de Software y Directora de Ventas.
¡Diseña agentes que VENDAN y CONVIERTAN basándote en DATOS REALES!
`;

    // ── Helper para llamar IA con un provider ──
    const tryArchitectWithProvider = async (config: AIProviderConfig, providerName: string): Promise<string | null> => {
      const startTime = Date.now();
      try {
        const c = createAIClient(config);
        // Sin overridear timeout/maxRetries aquí, un proveedor colgado usaba
        // el default de createAIClient (60s + 1 reintento, ~120s) antes de
        // pasar al siguiente candidato — incluso para el mensaje inicial.
        const resp = await c.chat.completions.create(
          {
            model: config.model,
            messages: [
              { role: "system", content: systemPrompt },
              ...history,
              { role: "user", content: `Mensaje del usuario: "${prompt}"\n\nRECORDATORIO CRÍTICO: Eres Atlas, la Arquitecta experta (una consultora de IA). NO eres el bot de ventas. TU OBJETIVO: Conversar con el usuario, entender sus necesidades y hacer preguntas si falta información. Usa el campo "reply" del JSON para charlar con el usuario. Si tienes suficiente información, genera la "config". RESPONDE SIEMPRE EN FORMATO JSON ESTRICTO.` }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
          },
          { timeout: 15000, maxRetries: 0 },
        );
        const content = resp.choices[0]?.message?.content;
        if (content) {
          reportProviderResult(providerName, true, Date.now() - startTime);
          return content;
        }
        throw new Error("Empty response");
      } catch (e: any) {
        reportProviderResult(providerName, false, undefined, e.message);
        logger.warn({ provider: providerName, error: e.message }, "[Architect] Provider failed");
        return null;
      }
    };

    // ── Fase 1: Proveedor seleccionado ──
    let rawContent = await tryArchitectWithProvider(aiConfig, dbSettings?.aiProvider || "opencode");

    // ── Fase 2: Rotación inteligente ──
    if (!rawContent) {
      const providerOrder = getOptimizedProviderOrder();
      if (!providerOrder.includes("groq")) providerOrder.unshift("groq");
      logger.info({ order: providerOrder }, "[Architect] Selected provider failed, trying rotation");

      for (const prov of providerOrder) {
        if (prov === "g4f") continue;
        if (prov === dbSettings?.aiProvider) continue; // ya lo intentamos
        let config: AIProviderConfig | null = null;
        if (prov === "opencode") config = getProviderConfig("opencode");
        else if (prov === "nvidia") config = getProviderConfig("nvidia");
        else if (prov === "github") config = getProviderConfig("github");
        else if (prov === "github_copilot_internal") config = getProviderConfig("github_copilot_internal");
        else if (prov === "ollama_local") config = getProviderConfig("ollama_local");
        else config = getProviderConfig(prov);

        if (!config) continue;

        rawContent = await tryArchitectWithProvider(config, prov);
        if (rawContent) break;
      }
    }

    // ── Fase 3: G4F como último respaldo ──
    if (!rawContent && G4F_ENABLED) {
      logger.info("[Architect] All providers failed, trying G4F fallback");
      const g4fResp = await getG4FResponse([
        { role: "system", content: systemPrompt },
        ...history.map((m: any) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
        { role: "user", content: `Mensaje del usuario: "${prompt}"\n\nRECORDATORIO CRÍTICO: Eres Atlas, la Arquitecta experta (una consultora de IA). NO eres el bot de ventas. TU OBJETIVO: Conversar con el usuario, entender sus necesidades y hacer preguntas si falta información. Usa el campo "reply" del JSON para charlar con el usuario. Si tienes suficiente información, genera la "config". RESPONDE SIEMPRE EN FORMATO JSON ESTRICTO.` }
      ], process.env.G4F_MODEL || "gpt-4-turbo");
      if (g4fResp?.content) rawContent = g4fResp.content;
    }

    if (!rawContent) {
      return res.status(500).json({ error: "All AI providers failed. No response from Architect." });
    }

    rawContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(rawContent);

    if (result.config) {
      // Find existing agent for this tenant
      const [existingAgent] = await db
        .select()
        .from(agents)
        .where(eq(agents.tenantId, tenantId))
        .limit(1);

      // Preparar metadata con configuraciones avanzadas
      const metadata = {
        objectionHandling: result.config.objectionHandling || {},
        closingStrategies: result.config.closingStrategies || [],
        businessRules: result.config.businessRules || {},
        restrictions: result.config.restrictions || [],
        lastUpdatedBy: 'architect',
        lastUpdatedAt: new Date().toISOString()
      };

      if (existingAgent) {
        // Update
        await db.update(agents)
          .set({
            name: result.config.name,
            role: result.config.role,
            tone: result.config.tone,
            systemPrompt: result.config.systemPrompt,
            stages: result.config.stages,
            metadata: metadata,
            isActive: true,
            updatedAt: dbNow()
          })
          .where(eq(agents.id, existingAgent.id));
        
        logger.info({ 
          tenantId, 
          agentId: existingAgent.id,
          hasObjectionHandling: !!result.config.objectionHandling,
          hasClosingStrategies: !!result.config.closingStrategies,
          hasBusinessRules: !!result.config.businessRules
        }, "[Architect] Agent updated with advanced config");
      } else {
        // Create new
        await db.insert(agents).values({
          tenantId,
          name: result.config.name,
          role: result.config.role,
          tone: result.config.tone,
          systemPrompt: result.config.systemPrompt,
          stages: result.config.stages,
          metadata: metadata,
          isActive: true,
          language: "es",
          model: "moonshotai/kimi-k2.6"
        });
        logger.info({ 
          tenantId,
          hasAdvancedConfig: true 
        }, "[Architect] New agent created with advanced config");
      }
    }

    return res.json({ 
      reply: result.reply, 
      configApplied: !!result.config,
      advancedFeaturesEnabled: !!(result.config?.objectionHandling || result.config?.closingStrategies)
    });

  } catch (e) {
    logger.error(e, "[Architect] Error in architect AI:");
    return next(e);
  }
});

/**
 * VISUAL ARCHITECT AI - Con vista previa y propuestas
 * Genera configuraciones visuales y propuestas basadas en el negocio
 */
router.post("/visual-architect", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { prompt, history: historialCrudo = [] } = req.body;
    const history = acotarHistorial(historialCrudo);

    const [dbSettings] = await db.select().from(settings).limit(1);
    let aiConfig = proveedorGuardadoPrioritario((dbSettings as any)?.businessConfig)
      || getProviderConfigFromSettings(dbSettings || {})
      || getProviderConfig("opencode")
      || getProviderConfig("groq")
      || getProviderConfig("nvidia")
      || getProviderConfig("github");

    if (!aiConfig) {
      return res.status(500).json({ error: "No AI engine configured for Visual Architect" });
    }

    logger.info({ provider: aiConfig.baseUrl, model: aiConfig.model }, "[Visual Architect] Using AI provider");

    // Refresh Copilot Token if using github internal
    if (aiConfig.baseUrl === "https://api.githubcopilot.com") {
      const now = new Date();
      const expiresAt = dbSettings?.copilotSessionExpiresAt ? new Date(dbSettings.copilotSessionExpiresAt) : null;
      
      // Si tenemos un token válido en cache, usarlo
      if (dbSettings?.copilotSessionToken && expiresAt && expiresAt > now) {
        logger.info("[Copilot] Usando token de sesión cacheado.");
        aiConfig.apiKey = dbSettings.copilotSessionToken;
      } else {
        // Si no, pedir uno nuevo
        logger.info("[Copilot] Token de sesión expirado o no encontrado. Obteniendo uno nuevo...");
        const session = await getCopilotSessionToken(aiConfig.apiKey);
        if (session) {
          aiConfig.apiKey = session.token;
          // Guardar en cache
          await db.update(settings)
            .set({ 
              copilotSessionToken: session.token,
              copilotSessionExpiresAt: new Date(session.expires_at).toISOString()
            })
            .where(eq(settings.id, dbSettings!.id));
        }
      }
    }


    const client = createAIClient(aiConfig);

    
    const systemPrompt = `
Te llamas Atlas (nombre completo "Atlas VentasPro"). En este modo actúas como la **ARQUITECTA VISUAL MAESTRA** con capacidades de análisis de negocio y generación de propuestas. Si el admin te pregunta tu nombre, respondé Atlas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TUS CAPACIDADES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **ANALIZAR NEGOCIOS**: Cuando el usuario describe su negocio, analízalo y genera un perfil
2. **GENERAR PROPUESTAS**: Crea propuestas específicas según el tipo de negocio
3. **CREAR VISTAS PREVIAS**: Genera ejemplos visuales de cómo respondería el agente
4. **SIMULAR CONVERSACIONES**: Crea conversaciones de ejemplo entre cliente y agente
5. **CONFIGURAR TODO**: Personalidad, objeciones, cierres, reglas de negocio

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FORMATO DE RESPUESTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Responde SIEMPRE en JSON con esta estructura:

{
  "reply": "Tu mensaje explicando la propuesta o configuración",
  "businessProfile": {
    "type": "Tipo de negocio detectado",
    "industry": "Industria",
    "products": ["producto1", "producto2"],
    "targetAudience": "Audiencia objetivo",
    "goals": ["objetivo1", "objetivo2"]
  },
  "agentPreview": {
    "name": "Nombre del agente",
    "role": "Rol específico",
    "tone": "Tono principal",
    "personality": "Descripción de la personalidad en 2-3 líneas",
    "sampleResponses": [
      "Ejemplo de respuesta 1 (saludo)",
      "Ejemplo de respuesta 2 (presentación de producto)",
      "Ejemplo de respuesta 3 (manejo de objeción)",
      "Ejemplo de respuesta 4 (cierre)"
    ],
    "objectionHandling": {
      "price": "Estrategia para objeción de precio",
      "time": "Estrategia para 'no tengo tiempo'",
      "trust": "Estrategia para falta de confianza",
      "need": "Estrategia para 'no lo necesito'"
    },
    "closingStrategies": [
      "Estrategia de cierre 1",
      "Estrategia de cierre 2",
      "Estrategia de cierre 3"
    ],
    "businessRules": {
      "delivery": "Forma de entrega",
      "payment": "Métodos de pago",
      "guarantee": "Garantía",
      "access": "Tipo de acceso"
    }
  },
  "simulation": [
    {"role": "client", "text": "Mensaje del cliente 1"},
    {"role": "agent", "text": "Respuesta del agente 1"},
    {"role": "client", "text": "Mensaje del cliente 2"},
    {"role": "agent", "text": "Respuesta del agente 2"}
  ],
  "config": {
    "name": "Nombre",
    "role": "Rol",
    "tone": "Tono",
    "systemPrompt": "Prompt completo",
    "stages": [...],
    "objectionHandling": {...},
    "closingStrategies": [...],
    "businessRules": {...}
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 EJEMPLOS DE PROPUESTAS SEGÚN NEGOCIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**CURSOS DIGITALES:**
- Agente educativo y motivador
- Enfoque en transformación personal
- Manejo de objeciones sobre valor del conocimiento
- Cierres consultivos

**E-COMMERCE:**
- Agente directo y eficiente
- Enfoque en beneficios del producto
- Manejo de objeciones de precio con comparaciones
- Cierres con urgencia

**SERVICIOS PROFESIONALES:**
- Agente formal y experto
- Enfoque en resultados y ROI
- Manejo de objeciones con casos de éxito
- Cierres consultivos

**CONSULTORÍA:**
- Agente estratégico y analítico
- Enfoque en solución de problemas
- Manejo de objeciones con datos
- Cierres basados en valor

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ INSTRUCCIONES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Si el usuario describe su negocio → Analiza y genera businessProfile + agentPreview + simulation
2. Si el usuario pide un tipo específico de agente → Genera agentPreview + simulation
3. Si el usuario pide aplicar → Genera config completo
4. SIEMPRE genera ejemplos realistas y específicos
5. SIEMPRE crea simulaciones de al menos 4 intercambios
6. SÉ CREATIVO pero REALISTA

¡Diseña agentes que VENDAN y se VEA PROFESIONAL!
`;

    // ── Helper para llamar IA con un provider ──
    const tryVisualWithProvider = async (config: AIProviderConfig, providerName: string): Promise<string | null> => {
      const startTime = Date.now();
      try {
        const c = createAIClient(config);
        const resp = await c.chat.completions.create(
          {
            model: config.model,
            messages: [
              { role: "system", content: systemPrompt },
              ...history,
              { role: "user", content: `Mensaje del usuario: "${prompt}"\n\nRECORDATORIO CRÍTICO: Eres Atlas, la Arquitecta Visual (una consultora experta). NO eres el bot de ventas. TU OBJETIVO: Conversar con el usuario para entender qué bot necesita crear. Usa el campo "reply" del JSON para responderle, hacerle preguntas y asesorarlo. Cuando tengas información suficiente o propongas algo, llena también los campos de preview y configuración. RESPONDE SIEMPRE EN FORMATO JSON ESTRICTO.` }
            ],
            temperature: 0.8,
            response_format: { type: "json_object" }
          },
          { timeout: 15000, maxRetries: 0 },
        );
        const content = resp.choices[0]?.message?.content;
        if (content) {
          reportProviderResult(providerName, true, Date.now() - startTime);
          return content;
        }
        throw new Error("Empty response");
      } catch (e: any) {
        reportProviderResult(providerName, false, undefined, e.message);
        return null;
      }
    };

    // ── Fase 1: Proveedor seleccionado ──
    let rawContent = await tryVisualWithProvider(aiConfig, dbSettings?.aiProvider || "opencode");

    // ── Fase 2: Rotación inteligente ──
    if (!rawContent) {
      const providerOrder = getOptimizedProviderOrder();
      if (!providerOrder.includes("groq")) providerOrder.unshift("groq");
      for (const prov of providerOrder) {
        if (prov === "g4f") continue;
        if (prov === dbSettings?.aiProvider) continue;
        let config: AIProviderConfig | null = null;
        if (prov === "opencode") config = getProviderConfig("opencode");
        else if (prov === "nvidia") config = getProviderConfig("nvidia");
        else if (prov === "github") config = getProviderConfig("github");
        else if (prov === "github_copilot_internal") config = getProviderConfig("github_copilot_internal");
        else if (prov === "ollama_local") config = getProviderConfig("ollama_local");
        else config = getProviderConfig(prov);
        if (!config) continue;
        rawContent = await tryVisualWithProvider(config, prov);
        if (rawContent) break;
      }
    }

    // ── Fase 3: G4F como último respaldo ──
    if (!rawContent && G4F_ENABLED) {
      const g4fResp = await getG4FResponse([
        { role: "system", content: systemPrompt },
        ...history.map((m: any) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
        { role: "user", content: `Mensaje del usuario: "${prompt}"\n\nRECORDATORIO CRÍTICO: Eres Atlas, la Arquitecta Visual (una consultora experta). NO eres el bot de ventas. TU OBJETIVO: Conversar con el usuario para entender qué bot necesita crear. Usa el campo "reply" del JSON para responderle, hacerle preguntas y asesorarlo. Cuando tengas información suficiente o propongas algo, llena también los campos de preview y configuración. RESPONDE SIEMPRE EN FORMATO JSON ESTRICTO.` }
      ], process.env.G4F_MODEL || "gpt-4-turbo");
      if (g4fResp?.content) rawContent = g4fResp.content;
    }

    if (!rawContent) {
      return res.status(500).json({ error: "All AI providers failed for Visual Architect." });
    }

    rawContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(rawContent);

    // Si hay config completo, guardarlo
    let configApplied = false;
    if (result.config) {
      const [existingAgent] = await db
        .select()
        .from(agents)
        .where(eq(agents.tenantId, tenantId))
        .limit(1);

      const metadata = {
        objectionHandling: result.config.objectionHandling || {},
        closingStrategies: result.config.closingStrategies || [],
        businessRules: result.config.businessRules || {},
        restrictions: result.config.restrictions || [],
        lastUpdatedBy: 'visual-architect',
        lastUpdatedAt: new Date().toISOString()
      };

      if (existingAgent) {
        await db.update(agents)
          .set({
            name: result.config.name,
            role: result.config.role,
            tone: result.config.tone,
            systemPrompt: result.config.systemPrompt,
            stages: result.config.stages,
            metadata: metadata,
            isActive: true,
            updatedAt: dbNow()
          })
          .where(eq(agents.id, existingAgent.id));
      } else {
        await db.insert(agents).values({
          tenantId,
          name: result.config.name,
          role: result.config.role,
          tone: result.config.tone,
          systemPrompt: result.config.systemPrompt,
          stages: result.config.stages,
          metadata: metadata,
          isActive: true,
          language: "es",
          model: "moonshotai/kimi-k2.6"
        });
      }
      configApplied = true;
    }

    return res.json({ 
      reply: result.reply,
      businessProfile: result.businessProfile,
      agentPreview: result.agentPreview,
      simulation: result.simulation,
      configApplied
    });

  } catch (e) {
    logger.error(e, "[Visual Architect] Error:");
    return next(e);
  }
});

/**
 * APPLY PREVIEW - Aplica una vista previa al agente real
 */
router.post("/apply-preview", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { preview } = req.body;

    if (!preview) {
      return res.status(400).json({ error: "Preview data required" });
    }

    // Generar system prompt completo basado en el preview
    const systemPrompt = `
Eres ${preview.name}, ${preview.role}.

PERSONALIDAD:
${preview.personality}

TONO: ${preview.tone}

REGLAS DE NEGOCIO:
${Object.entries(preview.businessRules).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

MANEJO DE OBJECIONES:
${Object.entries(preview.objectionHandling).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

ESTRATEGIAS DE CIERRE:
${preview.closingStrategies.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

Responde SIEMPRE de forma profesional, clara y orientada a la venta.
`;

    const [existingAgent] = await db
      .select()
      .from(agents)
      .where(eq(agents.tenantId, tenantId))
      .limit(1);

    const metadata = {
      objectionHandling: preview.objectionHandling,
      closingStrategies: preview.closingStrategies,
      businessRules: preview.businessRules,
      lastUpdatedBy: 'visual-architect-preview',
      lastUpdatedAt: new Date().toISOString()
    };

    if (existingAgent) {
      await db.update(agents)
        .set({
          name: preview.name,
          role: preview.role,
          tone: preview.tone,
          systemPrompt: systemPrompt,
          metadata: metadata,
          isActive: true,
          updatedAt: dbNow()
        })
        .where(eq(agents.id, existingAgent.id));
    } else {
      await db.insert(agents).values({
        tenantId,
        name: preview.name,
        role: preview.role,
        tone: preview.tone,
        systemPrompt: systemPrompt,
        metadata: metadata,
        isActive: true,
        language: "es",
        model: "moonshotai/kimi-k2.6"
      });
    }

    logger.info({ tenantId, agentName: preview.name }, "[Visual Architect] Preview applied");

    return res.json({ success: true });

  } catch (e) {
    logger.error(e, "[Visual Architect] Error applying preview:");
    return next(e);
  }
});

/**
 * GET CURRENT AGENT CONFIGURATION
 * Returns the current agent configuration with all advanced features
 */
router.get("/current", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.tenantId, tenantId))
      .limit(1);

    if (!agent) {
      return res.json({ 
        exists: false,
        message: "No agent configured yet. Use the Architect to create one."
      });
    }

    return res.json({
      exists: true,
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        tone: agent.tone,
        systemPrompt: agent.systemPrompt,
        stages: agent.stages,
        metadata: agent.metadata,
        isActive: agent.isActive,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt
      },
      advancedFeatures: {
        hasObjectionHandling: !!(agent.metadata as any)?.objectionHandling,
        hasClosingStrategies: !!(agent.metadata as any)?.closingStrategies,
        hasBusinessRules: !!(agent.metadata as any)?.businessRules,
        hasRestrictions: !!(agent.metadata as any)?.restrictions
      }
    });
  } catch (e) {
    logger.error(e, "[Architect] Error getting current agent:");
    return next(e);
  }
});

/**
 * APP OPERATOR — Arquitecto IA con ejecución real de acciones.
 * El modelo decide acciones (JSON) y el backend las ejecuta contra la BD en un
 * bucle, como si fuera el programador/administrador de la app.
 * POST /api/code-agent/operator  { prompt, history }
 */
router.post("/operator", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { prompt, history: historialCrudo = [] } = req.body;
    const history = acotarHistorial(historialCrudo);
    if (!prompt) return res.status(400).json({ error: "prompt requerido" });

    // ── Progreso en vivo ──────────────────────────────────────────────────
    // Un turno puede tardar decenas de segundos: varios pasos, cada uno con
    // su llamada a la IA y sus lecturas reales. Sin nada en pantalla el admin
    // ve un spinner quieto y no puede distinguir "está trabajando" de "se
    // colgó" -- la queja original. Con `stream: true` el cliente recibe avisos
    // de lo que está pasando y, al final, EXACTAMENTE el mismo objeto que
    // devuelve la vía normal; sin ese flag el comportamiento no cambia en
    // nada, así que un cliente viejo sigue funcionando igual.
    const streaming = req.body?.stream === true;
    if (streaming) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      // Sin esto el proxy (Traefik/nginx) acumula la respuesta y entrega todos
      // los avisos de golpe al final -- justo lo que se quiere evitar.
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
    }
    const sse = (event: string, data: any) => {
      if (!streaming || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    /** Aviso corto, en lenguaje llano, de lo que Atlas está haciendo ahora. */
    const progreso = (texto: string) => sse("progress", { texto });
    /**
     * Cierra el turno. Con streaming manda el resultado como último evento;
     * sin streaming responde JSON normal. Todas las salidas del handler pasan
     * por acá para que las dos vías devuelvan lo mismo.
     */
    const finish = (payload: any, status = 200) => {
      if (streaming) {
        // Con SSE las cabeceras ya se enviaron, así que no se puede cambiar el
        // código de estado: un fallo se comunica como evento "error" y el
        // frontend muestra su mensaje amable.
        sse(status === 200 ? "result" : "error", payload);
        res.end();
        return;
      }
      return res.status(status).json(payload);
    };

    const [dbSettings] = await db.select().from(settings).limit(1);

    // Lista de proveedores a intentar, con fallback y sin duplicados
    const seenP = new Set<string>();
    const candidates: { name: string; config: AIProviderConfig }[] = [];
    const pushCfg = (name: string, cfg: AIProviderConfig | null) => {
      if (!cfg) return;
      const key = cfg.baseUrl + "|" + cfg.model;
      if (seenP.has(key)) return;
      seenP.add(key);
      candidates.push({ name, config: cfg });
    };
    // Proveedores que el admin eligió y guardó a propósito en Configuración →
    // Modelos de pago (pantalla ai-catalog.ts/AIProviders.tsx, catálogo de 23
    // proveedores con prueba de conexión real). Antes esta lista NUNCA se
    // leía acá: el admin podía elegir "OpenAI" con su propia clave, probar
    // la conexión con éxito en esa pantalla, y el Arquitecto igual seguía
    // usando en silencio la lista fija de abajo (opencode/groq/github/...) sin
    // tocar jamás lo que el admin configuró -- la elección quedaba guardada
    // pero era letra muerta. Van primero: fue una decisión explícita del
    // admin, más reciente y más específica que cualquier fallback genérico.
    const catalogoGuardado = leerBusinessConfig((dbSettings as any)?.businessConfig).aiProviders || {};

    // ⚠️ El ORDEN acá decide si Atlas usa herramientas o inventa.
    //
    // Medido en vivo (2026-08-27): a "¿cuántos productos tengo?" Atlas
    // contestó "2" -- con 138 cargados -- y a "buscá PACK IDIOMAS" contestó
    // "no existe, ¿lo creo?" sobre un producto que sí está. El stream no
    // mostró NINGÚN paso de herramienta: pasaba de "Entendiendo tu pedido"
    // directo al resultado.
    //
    // La causa no es el prompt ni las herramientas: es qué modelo contesta.
    // Un modelo débil devuelve JSON PERFECTAMENTE VÁLIDO con "actions": []
    // y un "reply" inventado. Para el bucle de abajo eso es una respuesta
    // buena -- no hay error que dispare el fallback, así que la cadena nunca
    // llega a los modelos fuertes que están más abajo. El comentario de acá
    // ya lo advertía ("un modelo débil genera JSON mal formado o 'listo' sin
    // haber llamado ninguna herramienta"), pero los gratis guardados por el
    // admin se probaban ANTES y le ganaban de mano.
    //
    // Se respeta lo que el admin eligió -- eso no cambia -- pero se separa lo
    // que eligió: primero su proveedor seleccionado, después los DE PAGO que
    // guardó, después los fuertes de siempre, y los gratis al final, que es
    // donde sirven: de respaldo cuando lo bueno no responde.
    //
    // La marca `gratis` sale del propio catálogo (PROVEEDORES), no de una
    // lista repetida acá: una segunda lista se desincroniza al primer
    // proveedor nuevo, y ya pasó en este archivo.
    const ES_GRATIS = new Set(PROVEEDORES.filter((p) => p.gratis).map((p) => p.id));
    const guardados = Object.keys(catalogoGuardado);
    // Su elección explícita va primero: es la más específica de todas.
    if (dbSettings?.aiProvider) pushCfg(dbSettings.aiProvider, getProviderConfigFromSettings(dbSettings));
    for (const proveedor of guardados.filter((p) => !ES_GRATIS.has(p))) {
      pushCfg(proveedor, getProviderConfig(proveedor));
    }
    // El operador EJECUTA acciones reales (BD, Facebook) a partir de un JSON
    // estricto — a diferencia del bot de ventas (alto volumen, tolera un
    // modelo chico), acá un modelo débil genera JSON mal formado o "listo"
    // sin haber llamado ninguna herramienta, y el admin ve comportamiento
    // errático ("a veces sí, a veces no"). Se prueban primero los modelos
    // fuertes (GPT-4o real vía Copilot, luego GPT-4o-mini) — es uso de admin,
    // bajo volumen, la cuota de Copilot no es un problema aquí — y solo se
    // cae a la rotación de modelos gratis pequeños si esos no responden.
    pushCfg("github_copilot_internal", getProviderConfig("github_copilot_internal"));
    pushCfg("github", getProviderConfig("github"));
    pushCfg("mimo", getProviderConfig("mimo")); // API propia de Xiaomi, si hay clave
    // Recién acá los gratis que el admin guardó: sirven de respaldo, no de
    // primera opción (ver el bloque de arriba).
    for (const proveedor of guardados.filter((p) => ES_GRATIS.has(p))) {
      pushCfg(proveedor, getProviderConfig(proveedor));
    }
    // Rotación DENTRO de OpenCode Zen: la cuota gratis se agota por modelo,
    // así que al recibir 429 se pasa al siguiente modelo antes de abandonar Zen.
    for (const cfg of getOpenCodeRotation()) pushCfg(`opencode:${cfg.model}`, cfg);
    pushCfg("groq", getProviderConfig("groq"));
    // Modelos gratis de otros proveedores especializados en RAZONAR: el
    // operador planifica y usa herramientas, no le sirve un modelo "rápido".
    // Solo entran los que tengan clave configurada (getProviderConfig da null).
    for (const m of modelosPara("razonar")) {
      const base = getProviderConfig(m.proveedor);
      if (base) pushCfg(`${m.proveedor}:${m.modelo}`, { ...base, model: m.modelo });
    }
    pushCfg("nvidia", getProviderConfig("nvidia"));
    if (candidates.length === 0) return finish({ error: "No hay motor de IA configurado" }, 500);

    // callAI se llama una vez por paso (hasta 10), y antes CADA paso volvía a
    // recorrer la lista de proveedores desde el principio: si los primeros
    // estaban caídos o lentos, se pagaban 15s por cada uno OTRA VEZ en cada
    // paso. Con 3-4 pasos son 90-120s tirados en proveedores que ya se sabía
    // que no responden -- la causa principal de que el turno se sintiera
    // lentísimo y terminara chocando contra el límite de 130s ("se quedó
    // colgado"). Empezando por el último que funcionó, ese costo se paga una
    // sola vez.
    //
    // Se guarda la CLAVE del proveedor (no el índice) en una variable de
    // módulo: así el aprendizaje sobrevive entre peticiones -- importa para
    // las auto-continuaciones, que son peticiones nuevas y si no volverían a
    // empezar de cero. Guardar el índice sería incorrecto: la lista de
    // candidatos se arma por petición y puede tener otro orden o largo.
    const idxUltimoBueno = Math.max(
      0,
      candidates.findIndex((c) => c.config.baseUrl + "|" + c.config.model === ultimoProveedorBueno),
    );
    // Llama a la IA probando proveedores en orden hasta que uno responda
    const callAI = async (msgs: any[]): Promise<string | null> => {
      // The reverse proxy has a finite request timeout. A long serial fallback
      // chain used to outlive it and surface as a generic 502 even though the
      // app was healthy. Give the operator a bounded, predictable window.
      //
      // 45s (con 10s por candidato) resultó insuficiente para prompts pesados
      // (system prompt + doc de herramientas grande, varios candidatos en la
      // rotación): confirmado en vivo que "Todos los proveedores de IA
      // fallaron" (este mismo 502, más abajo) se disparaba de forma
      // reproducible ~50-55s después de iniciado el turno para un pedido de
      // varias partes ("qué errores tenemos en los productos, qué
      // información debe ir, qué formato") mientras una versión más corta
      // del mismo pedido sí respondía bien en ~26s. 70s/15s le da a cada
      // candidato (incluidos los modelos gratis más lentos bajo carga) más
      // margen real antes de agotar la rotación completa, sin acercarse al
      // requestDeadline de 130s del turno completo (ver más abajo).
      const deadline = Date.now() + 70_000;
      // Se prueban todos, pero empezando por el último que funcionó (rotación
      // circular), no siempre desde el índice 0.
      for (let salto = 0; salto < candidates.length; salto++) {
        const i = (idxUltimoBueno + salto) % candidates.length;
        const cand = candidates[i];
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const cfg: AIProviderConfig = { ...cand.config };
        try {
          if (cfg.baseUrl === "https://api.githubcopilot.com") {
            const session = await getCopilotSessionToken(cfg.apiKey);
            if (session) cfg.apiKey = session.token;
          }
          const client = createAIClient(cfg);
          // createAIClient trae 60s + 1 reintento fijos por defecto (ver
          // provider.ts): sin overridearlo aquí, un solo candidato colgado
          // podía bloquear hasta ~120s, y con varios candidatos en la cola
          // (rotación de opencode, groq, github...) el operador nunca
          // respondía. 15s es generoso para el Architect (no es tan sensible
          // a latencia como el bot de ventas) pero acotado.
          const resp = await client.chat.completions.create(
            {
              model: cfg.model,
              messages: msgs,
              temperature: 0.2,
              response_format: { type: "json_object" },
            },
            { timeout: Math.min(15_000, remaining), maxRetries: 0 },
          );
          const c = resp.choices[0]?.message?.content;
          if (c) {
            // Los pasos siguientes (y las próximas peticiones) arrancan por este.
            ultimoProveedorBueno = cfg.baseUrl + "|" + cfg.model;
            logger.info({ provider: cand.name, model: cfg.model }, "[AppOperator] respondió");
            return c;
          }
          // 200 con content vacío = modelo "de razonamiento" que solo devuelve
          // reasoning_content. No sirve para el bucle: se pasa al siguiente.
          logger.warn({ provider: cand.name, model: cfg.model }, "[AppOperator] respuesta vacía, rotando");
        } catch (e: any) {
          const msg = String(e?.message || "");
          const agotado = /429|rate.?limit|FreeUsageLimit|quota/i.test(msg);
          logger.warn(
            { provider: cand.name, model: cfg.model, agotado, err: msg.slice(0, 120) },
            agotado ? "[AppOperator] cuota agotada, rotando al siguiente modelo" : "[AppOperator] proveedor falló, rotando",
          );
        }
      }
      return null;
    };

    // Lecciones de reparaciones pasadas de este negocio (ver
    // saveRepairLesson más abajo): así el Operador no tropieza dos veces con
    // el mismo error entre conversaciones distintas -- lo sabe de antemano
    // en vez de tener que fallar primero para descubrirlo.
    const lessons = await loadRecentLessons(tenantId);
    const lessonsBlock = lessons.length
      ? `\n\nLECCIONES DE ERRORES PASADOS EN ESTE NEGOCIO (evita repetirlos):\n${lessons.map((l) => `- ${l}`).join("\n")}`
      : "";
    // El módulo de publicidad, solo si el turno habla de anuncios. Mismo
    // motivo que en operator-opencode.ts: estaba escrito y no lo leía nadie
    // (se usaba únicamente como validador), así que los dos cerebros armaban
    // los anuncios con la doctrina vieja del prompt y después el validador les
    // rechazaba lo que el prompt les había pedido escribir. Condicionado
    // porque este prompt ya roza el tope de caracteres.
    const HABLA_DE_ANUNCIOS = /anuncio|publicidad|campa[nñ]a|copy|pauta|creativ|publicit|\bads?\b/i;
    const moduloBlock = HABLA_DE_ANUNCIOS.test(String(prompt))
      ? `\n\n${MODULO_PUBLICIDAD}\n\n${FORMATO_ANUNCIO}`
      : "";
    // Se le pasa el pedido para que mande solo las herramientas que hacen
    // falta: las 82 no entran en el límite por minuto de Groq, y por eso el
    // modelo bueno se descartaba y contestaba uno chico. Ver buildToolsDoc.
    // ── LOS NUMEROS DE AHORA, MEDIDOS EN ESTE TURNO ──────────────────────
    //
    // Medido el 2026-09-02, dos veces con horas de diferencia:
    //
    //   admin: "cuantos productos activos tengo?"
    //   Atlas: "104 activos (de 140 totales). Los 16 restantes estan
    //           inactivos."
    //
    // 140 menos 104 son 36. Y la segunda vez devolvio la MISMA frase byte por
    // byte, incluso cuando se le pidio explicitamente el texto crudo de la
    // herramienta. No estaba contando: estaba recordando.
    //
    // El motivo es de diseño, no del modelo. `sessionId` cae a "default" y
    // `loadArchitectHistory` le devuelve la conversacion guardada, con su
    // respuesta vieja adentro. Una vez que Atlas dice un numero equivocado, lo
    // repite para siempre -- no tiene ningun motivo para volver a llamar la
    // herramienta si la respuesta ya esta en su historial.
    //
    // Un conteo no es un recuerdo. Se mide cada turno y se le pone delante,
    // mas fresco que cualquier cosa que tenga guardada. Es una consulta barata
    // y cierra la clase entera, no el caso.
    let estadoBlock = "";
    try {
      const [{ tot }] = await db.select({ tot: sql<number>`cast(count(*) as integer)` }).from(products).where(eq(products.tenantId, tenantId));
      const [{ act }] = await db.select({ act: sql<number>`cast(count(*) as integer)` }).from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));
      estadoBlock =
        `

ESTADO REAL DEL CATALOGO, MEDIDO AHORA MISMO (${new Date().toISOString()}):
` +
        `- Productos en total: ${tot}
` +
        `- ACTIVOS: ${act}
` +
        `- Inactivos: ${tot - act}
` +
        `Estos tres numeros son la verdad de este momento. Usalos TAL CUAL si te preguntan ` +
        `por cantidades del catalogo, aunque en la conversacion guardada figure otro numero: ` +
        `lo de arriba se acaba de contar y lo del historial puede estar vencido. No los restes ` +
        `ni los deduzcas.`;
    } catch (e: any) {
      logger.warn({ tenantId, err: e?.message }, "[Atlas] no se pudo medir el catalogo para este turno");
    }

    const sys = OPERATOR_SYSTEM_PROMPT.replace("${TOOLS}", buildToolsDoc(String(prompt || ""))) + lessonsBlock + moduloBlock + estadoBlock;
    const sessionId: string = (req.body?.sessionId as string) || "default";
    // Mismo criterio que la ruta del puente: el tipo de campaña sale del
    // mensaje del admin, no de que el modelo se acuerde de pasarlo. Las dos
    // rutas comparten `interpretarObjetivo` para que no diverjan -- que es lo
    // que ya pasó una vez con el recorte de herramientas.
    const { interpretarObjetivo: leerObjetivo } = await import("../lib/objetivos-campana");
    const ctx: OperatorContext = {
      tenantId,
      sessionId,
      objetivoDelAdmin: leerObjetivo(String(prompt || "")) || undefined,
    };

    // Errores de CUENTA de Meta (certificación de política de no
    // discriminación, método de pago, verificación de identidad/negocio) no
    // se arreglan con ninguna herramienta del sistema -- son una acción que
    // solo el dueño de la cuenta puede hacer fuera de la app, en una URL
    // específica que Meta. Lanzar self-repair igual sólo desperdicia pasos y
    // termina creando y borrando campañas de prueba reales en Ads Manager
    // para nada (confirmado en vivo 2026-08-08: campaña→conjunto→creativo se
    // crean bien, y el /ads final rechaza con "certifica en
    // facebook.com/certification/nondiscrimination", código 3/2859002 -- ni
    // reintentar ni "arreglar" nada del lado del código cambia ese resultado).
    const isUnfixableMetaAccountError = (msg: string) =>
      /facebook\.com\/certification|m[eé]todo de pago|payment method|verificar tu identidad|business verification/i.test(
        msg || "",
      );

    // Cuando una acción YA APROBADA falla, en vez de reportar el error y
    // seguir, se le da al modelo hasta MAX_REPAIR_STEPS turnos para
    // diagnosticar con las herramientas disponibles, corregir lo que haga
    // falta (ej: generar y asignar la imagen que faltaba) y reintentar la
    // acción original -- todo dentro del mismo alcance que el admin ya
    // aprobó, nunca una mutación distinta sin avisar. Cada paso de la
    // reparación queda logueado y visible en la respuesta final, no oculto.
    const MAX_REPAIR_STEPS = 3;
    async function attemptSelfRepair(
      action: { tool: string; args: any },
      failureSummary: string,
    ): Promise<{ fixed: boolean; result: any; log: string[] }> {
      const log: string[] = [];
      const repairMessages: any[] = [
        { role: "system", content: sys },
        {
          role: "user",
          content:
            `La siguiente acción, YA APROBADA por el admin, falló al ejecutarse:\n` +
            `Herramienta: ${action.tool}\nArgumentos: ${JSON.stringify(action.args)}\nError: ${failureSummary}\n\n` +
            `Diagnosticá la causa usando las herramientas de lectura que necesites. Si podés resolver el ` +
            `problema con alguna herramienta disponible (ej: falta una imagen → generala y asignala), hacelo. ` +
            `Cuando creas que ya se puede reintentar, incluí "${action.tool}" en "actions" (con los argumentos ` +
            `corregidos si hacía falta cambiar algo). Si no se puede arreglar con las herramientas que tenés, ` +
            `explicá el motivo real en "reply" y devolvé "actions": [] con "done": true.\n\n` +
            `IMPORTANTE, tenés solo ${MAX_REPAIR_STEPS} pasos para reparar esto -- priorizá TERMINAR la tarea ` +
            `sobre seguir juntando más información: en cuanto tengas lo mínimo real que necesitás (ej: si el ` +
            `error era por falta de investigación, con 2-3 resultados reales de web_search ya alcanza), incluí ` +
            `"${action.tool}" en el MISMO "actions" junto con esas llamadas, en vez de gastar otro paso entero ` +
            `solo investigando de nuevo. Si un método falla (ej: deep_research sin tiempo), no insistas con el ` +
            `mismo ni sigas probando alternativas indefinidamente -- pasá a usar lo que SÍ te funcionó (ej: ` +
            `web_search) y avanzá con eso. El objetivo es completar "${action.tool}", no maximizar cuánto investigás.`,
        },
      ];

      for (let step = 0; step < MAX_REPAIR_STEPS; step++) {
        const rawAI = await callAI(repairMessages);
        if (!rawAI) break;
        const content = rawAI.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch {
          break;
        }
        const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
        if (actions.length === 0) break;

        const results: any[] = [];
        for (const a of actions) {
          const r = await executeAction(a.tool, a.args || {}, ctx);
          results.push({ tool: a.tool, ok: r.ok, summary: r.summary });
          log.push(`${r.ok ? "🔧✅" : "🔧❌"} ${r.summary}`);
          if (a.tool === action.tool && r.ok) {
            return { fixed: true, result: r, log };
          }
        }
        repairMessages.push({ role: "assistant", content });
        repairMessages.push({
          role: "user",
          content: "Resultado: " + JSON.stringify(results) + "\n\nSi ya se puede reintentar la acción original, hacelo ahora.",
        });
      }
      return { fixed: false, result: null, log };
    }

    // ── MEMORIA PERSISTENTE: cargar la conversación guardada en el servidor ──
    // Así el Architect recuerda aunque el navegador se haya cerrado. Si el
    // frontend manda history y no hay nada guardado, se usa ese como respaldo.
    const persisted = await loadArchitectHistory(tenantId, sessionId);
    const convo = persisted.length > 0 ? persisted : (Array.isArray(history) ? history : []);
    await saveArchitectTurn(tenantId, sessionId, "user", String(prompt));

    // ── ¿Hay un PLAN PENDIENTE esperando confirmación? ──
    const pending = await getPendingPlan(tenantId, sessionId);
    if (pending && pending.actions.length > 0) {
      // ── Y si la lista no lo reconocio, que lo lea el modelo ──────────────
      //
      // `isApproval` es una lista de palabras que crecio una por vez, cada vez
      // que el admin uso una que no estaba. Hoy reconoce 21 de 24 formas
      // medidas. Pero hay respuestas que ninguna lista puede cubrir, porque el
      // sentido no esta en las palabras sino en la pregunta que contestan:
      //
      //   Atlas: "PUBLICAR en el muro de la pagina. Confirmas?"
      //   admin: "En el muro"
      //   Atlas: "No me quedo claro si queres que lo haga."
      //
      // "En el muro" solo significa que si EN RELACION con lo que se pregunto.
      //
      // Se consulta unicamente cuando la lista ya dijo que no y tampoco es un
      // rechazo, asi que lo barato se sigue resolviendo gratis. Y el modulo
      // esta escrito para equivocarse hacia el NO: ante duda, error o demora
      // devuelve false y Atlas vuelve a preguntar, que es lo que hace hoy.
      // Acá un falso positivo publica en la pagina o crea una campaña que
      // gasta: preguntar de nuevo cuesta un mensaje.
      const aprobadoPorElModelo =
        !isRejection(String(prompt)) &&
        (await esUnSiParaEstePlan(String(prompt), pending.actions.map((a: any) => describePlannedAction(a)).join(" · ")));
      if (aprobadoPorElModelo) {
        logger.info({ tenantId, prompt: String(prompt).slice(0, 60) }, "[Atlas] la lista no lo reconocio pero el modelo lo leyo como un si");
      }
      if (isApproval(String(prompt)) || aprobadoPorElModelo) {
        // EJECUTAR el plan aprobado, con VERIFICACIÓN tras cada cambio y
        // AUTO-REPARACIÓN si algo falla (ver attemptSelfRepair arriba).
        const executed: any[] = [];
        const lines: string[] = [];
        for (const a of pending.actions) {
          let r = await executeAction(a.tool, a.args || {}, ctx);
          let repairLog: string[] = [];
          if (!r.ok && !isUnfixableMetaAccountError(r.summary)) {
            const originalError = r.summary;
            const repair = await attemptSelfRepair(a, originalError);
            repairLog = repair.log;
            if (repair.fixed && repair.result) {
              r = repair.result;
              await saveRepairLesson(tenantId, a.tool, originalError, repairLog.join(" / "));
            }
          }
          const verification = r.ok ? await verifyMutation(a.tool, a.args || {}, ctx) : "";
          executed.push({ tool: a.tool, args: a.args, ok: r.ok, summary: r.summary, verification, repairLog });
          const repairText = repairLog.length ? `\n   ${repairLog.join("\n   ")}` : "";
          // En el fallo, el summary está escrito para el modelo ("volvé a
          // llamar la herramienta", nombres internos) -- se limpia antes de
          // mostrárselo al admin. Ver mensajeParaAdmin.
          const paraElAdmin = r.ok ? r.summary : mensajeParaAdmin(r.summary);
          lines.push(`${r.ok ? "✅" : "❌"} ${paraElAdmin}${repairText}${verification ? `\n   ${verification}` : ""}`);
        }
        await clearPendingPlan(tenantId, sessionId);
        const allOk = executed.every((item) => item.ok);
        // AUTO-EVALUACIÓN DE ATLAS: si el plan terminó con errores, se guarda
        // la lección (qué herramienta, qué error, qué se intentó) para que el
        // próximo turno la lea en loadRecentLessons y no tropiece dos veces
        // con el mismo problema -- Atlas no se queda en el error, lo registra,
        // lo analiza y busca otra alternativa la próxima vez.
        if (!allOk) {
          try {
            const fallos = executed
              .filter((item: any) => !item.ok)
              .map((item: any) => `${item.tool}: ${String(item.summary || "").slice(0, 160)}`)
              .join(" | ");
            await saveRepairLesson(
              tenantId,
              "plan_multi_action",
              fallos || "error desconocido en ejecución del plan",
              "Plan ejecutado con fallos parciales; revisar el detalle por acción y ajustar el enfoque en el próximo intento",
            );
            logger.info({ tenantId, fallos: executed.filter((i: any) => !i.ok).length }, "[AppOperator] Lección de plan fallido guardada para auto-evaluación");
          } catch (e: any) {
            logger.warn({ err: e?.message }, "[AppOperator] No se pudo guardar lección del plan fallido");
          }
        }
        // join("\n\n"), no "\n": el frontend renderiza con ReactMarkdown, que
        // colapsa un solo salto de línea a un espacio -- con un solo plan
        // que ejecuta VARIAS acciones (ej: dos fb_ad_draft en la misma
        // confirmación), los resultados quedaban pegados uno contra el otro
        // sin ninguna separación visible entre un borrador y el siguiente.
        const reply = paraMarkdown(toEmojiStyle(
          `${allOk ? "✅ Plan ejecutado y verificado" : "⚠️ El plan terminó con errores; no voy a decir que quedó listo"}:\n\n${lines.join("\n\n")}`,
        ));
        await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
        logger.info({ tenantId, executed: executed.length }, "[AppOperator] Plan aprobado y ejecutado");
        return finish({ reply, executed, actionsCount: executed.length, status: allOk ? "executed" : "partial_failure" });
      }
      if (isRejection(String(prompt))) {
        await clearPendingPlan(tenantId, sessionId);
        // Continúa abajo para re-planificar según la nueva instrucción.
      } else {
        // Ni aprobó ni rechazó claramente → re-planificamos con su mensaje
        // (puede estar ajustando el plan). Limpiamos el plan viejo.
        await clearPendingPlan(tenantId, sessionId);
      }
    }

    const messages: any[] = [
      { role: "system", content: sys },
      ...convo.map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: String(prompt) },
    ];

    // ── FASE PLAN: ejecutamos SOLO lecturas (mirar antes de actuar); las
    //    mutaciones se ACUMULAN como plan y NO se ejecutan hasta aprobación. ──
    let finalReply = "";
    const plannedActions: any[] = [];
    const MAX_STEPS = 10;
    // resolved marca si el bucle terminó por una de las salidas normales
    // (plan listo, resultado final, JSON irrecuperable). Si se apagan los
    // MAX_STEPS sin que ninguna se dispare, antes se devolvía lo último que
    // hubiera en finalReply sin avisar -- parecía que "se perdía" en silencio.
    let resolved = false;
    // Firma de cada lectura ya ejecutada en este turno (tool+args). Si el
    // modelo pide la MISMA lectura con los MISMOS argumentos una tercera vez,
    // no está progresando -- está en bucle -- así que se corta y se avisa en
    // vez de seguir gastando pasos repitiendo lo mismo.
    const seenReads = new Map<string, number>();
    let loopSignature: string | null = null;
    // Red de seguridad de tiempo total: cada callAI ya está acotado a 45s,
    // pero nada acotaba la SUMA de hasta 10 pasos + sus lecturas (búsquedas
    // web, fetch de páginas, etc). Un pedido de investigación real podía
    // encadenar varias búsquedas y superar varios minutos, tiempo en el que
    // el cliente (o algún proxy intermedio) cortaba la conexión y el
    // frontend mostraba el genérico "Error: Error del servidor" sin haber
    // recibido nunca una respuesta real del servidor. Con esto, si se supera
    // el límite entre pasos, se corta acá con una respuesta real (parcial
    // pero real) en vez de dejar que algo externo la corte primero.
    // 130s: probado en vivo que el proxy/reverse-proxy delante de
    // bot-agenwhatsapp corta la respuesta al cliente en algún punto entre
    // ~150-160s del turno completo (confirmado: el trabajo se completaba
    // bien del lado del servidor -- research_evidence quedaba guardado --
    // pero el cliente recibía un 502 antes de que la respuesta volviera).
    // Este límite tiene que quedar claramente por debajo de ese corte para
    // que el aviso de "tardando más de lo esperado" (más abajo) llegue a
    // tiempo, en vez de que el proxy gane la carrera primero.
    const requestDeadline = Date.now() + 130_000;
    // deep_research (app-operator.ts) necesita saber cuánto le queda al
    // TURNO completo, no armarse su propio presupuesto fresco -- un agente
    // externo real tarda ~60-70s, así que si ya se gastaron varios pasos
    // (ej: unos web_search antes) puede no quedar tiempo real, y sin esto
    // el error se reportaba como "sin cuota" en vez de "sin tiempo".
    ctx.turnDeadline = requestDeadline;
    let timedOut = false;
    // hasRecentResearch() (ver app-operator.ts) solo bloquea la herramienta
    // fb_ad_draft -- protege que se GUARDE un borrador sin investigar, pero
    // no protege la respuesta de TEXTO. Si el admin solo pide "mostrame el
    // borrador" (sin querer guardarlo todavía), el modelo nunca toca esa
    // herramienta, así que ese gate nunca se dispara -- y un modelo débil
    // (típicamente uno de los proveedores gratuitos del fallback) puede
    // directamente inventar copy de marketing completo en su "reply",
    // presentándolo como si viniera de una "investigación previa" real que
    // nunca hizo. Confirmado en vivo: un pedido de investigar cursos de
    // piano devolvió "+10.000 alumnos", un precio "antes $120.000" que no
    // existe, y una URL de imagen inventada, sin haber llamado web_search
    // ni ninguna otra herramienta en todo el turno. Esto viola directamente
    // el principio central del proyecto (nunca fabricar datos/métricas) --
    // ver PRINCIPIOS OBLIGATORIOS #4 en OPERATOR_SYSTEM_PROMPT, que hasta
    // ahora dependía 100% de que el modelo lo respetara solo, sin ningún
    // control real del servidor.
    let usedWebSearchThisTurn = false;
    const FABRICATED_RESEARCH_CLAIM =
      /investigaci[oó]n\s+(previa|realizada|real)|seg[uú]n\s+mi\s+investigaci[oó]n|basado\s+en\s+mi\s+conocimiento/i;
    const AD_COPY_SHAPE =
      /gancho\s*\(hook\)|texto\s+principal|primary\s+text|t[ií]tulo\s*\(headline\)|borrador\s+del\s+anuncio/i;

    for (let step = 0; step < MAX_STEPS; step++) {
      if (Date.now() > requestDeadline) {
        timedOut = true;
        break;
      }
      progreso(step === 0 ? "Entendiendo tu pedido" : "Analizando lo que encontré");
      const rawAI = await callAI(messages);
      if (!rawAI) {
        return finish({ error: "Todos los proveedores de IA fallaron" }, 502);
      }
      let content = rawAI.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      // `extraerJSON` rescata el objeto aunque venga envuelto en palabras
      // ("Claro, aquí tienes: {...}"). Se manda response_format json_object,
      // pero el operador ROTA entre proveedores y no todos lo respetan: con
      // uno que siempre antepone una frase, cada paso se gastaba pidiéndole
      // reformatear y el anuncio no se publicaba nunca. Para el admin eso se
      // ve como "a veces publica y a veces no" -- y es literal: depende de qué
      // proveedor de la rotación contestó ese turno.
      const rescatado = extraerJSON(content);
      let parsed: any;
      if (rescatado) {
        parsed = rescatado;
      } else {
        // Un JSON roto no significa que el modelo no tenga nada útil que
        // decir -- antes se rendía al primer error. Se le devuelve el error
        // exacto y se le pide reformatear, con los pasos que queden.
        if (step < MAX_STEPS - 1) {
          messages.push({ role: "assistant", content });
          messages.push({
            role: "user",
            content: 'Tu respuesta anterior no era JSON válido y no se pudo procesar. Responde EXCLUSIVAMENTE con el JSON { "reply": "...", "actions": [...], "done": true|false }, sin texto antes ni después, sin bloques de código markdown.',
          });
          continue;
        }
        finalReply = content;
        resolved = true;
        break;
      }

      const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
      finalReply = parsed.reply || finalReply;

      // Filtrar acciones sin "tool" válido ANTES de clasificarlas -- si no,
      // una acción rota (tool undefined/inventado) caía en "mutación" por
      // descarte (no está en READ_ONLY_TOOLS) y terminaba mostrada como
      // "undefined: {}" en el plan propuesto al admin.
      const actions = rawActions.filter((a: any) => isKnownTool(a?.tool));
      const invalidActions = rawActions.filter((a: any) => !isKnownTool(a?.tool));
      if (invalidActions.length > 0) {
        logger.warn({ invalidActions }, "[AppOperator] El modelo devolvió acciones con 'tool' inválido/faltante, descartadas");
        // Si SOBREVIVIÓ alguna acción válida, antes se seguía de largo: se
        // ejecutaba la parte que se entendió y la otra desaparecía sin que
        // nadie se enterara. Ese es el "publicó a medias" -- por ejemplo
        // guardó el borrador y nunca lo subió a Meta, con el admin creyendo
        // que sí. Se le devuelve al modelo qué nombres no existen para que
        // corrija en el paso siguiente, en vez de perder la mitad del pedido.
        if (actions.length > 0 && step < MAX_STEPS - 1) {
          const nombresMalos = invalidActions
            .map((a: any) => String(a?.tool ?? "(sin nombre)"))
            .join(", ");
          messages.push({ role: "assistant", content });
          messages.push({
            role: "user",
            content:
              `Estas herramientas que nombraste no existen y se descartaron: ${nombresMalos}. ` +
              `Volvé a proponer ESE paso usando los nombres exactos de la lista de herramientas. ` +
              `Lo que ya era válido no hace falta repetirlo.`,
          });
          continue;
        }
      }

      const reads = actions.filter((a: any) => isReadOnlyTool(a.tool));
      const mutations = actions.filter((a: any) => !isReadOnlyTool(a.tool));

      // Si TODAS las acciones de este paso eran inválidas y no quedó ninguna
      // válida, pedirle al modelo que reintente en vez de seguir con un paso
      // vacío silencioso (mismo patrón que el retry de JSON mal formado).
      if (rawActions.length > 0 && actions.length === 0 && step < MAX_STEPS - 1) {
        messages.push({ role: "assistant", content });
        messages.push({
          role: "user",
          content: `Las acciones que devolviste no tienen un "tool" válido (revisa el nombre exacto de la herramienta). Reintenta con el nombre correcto, o si no necesitás ejecutar nada, devolvé "actions": [].`,
        });
        continue;
      }

      // Si hay MUTACIONES → ya tenemos el plan de cambios. Ejecutamos las
      // lecturas de este turno (para grounding) pero PARAMOS aquí: no seguimos
      // el loop, para no recolectar la misma mutación dos veces.
      if (mutations.length > 0) {
        // ── Validar ANTES de armar el plan, no después del "sí" ───────────
        // Esta ruta arma plannedActions por su cuenta, sin pasar por
        // proposeAction, así que las validaciones de contenido y de conexión
        // con Meta no la cubrían. Sin esto, el mismo agujero de siempre: el
        // admin aprueba y recién ahí rebota. Acá el modelo todavía está en el
        // loop, así que se le devuelve el motivo y reintenta -- mismo patrón
        // exacto que el retry de "tool inválida" de unas líneas más arriba.
        const rechazos: string[] = [];
        for (const m of mutations) {
          const args = m.args || {};
          if (m.tool === "fb_ad_draft" || m.tool === "fb_create_ad" || m.tool === "fb_page_publish") {
            const problema = await validarContenidoAnuncio(args, ctx);
            if (problema) { rechazos.push(problema); continue; }
          }
          const bloqueo = await bloqueoDeMeta(m.tool, ctx);
          if (bloqueo) rechazos.push(bloqueo);
        }
        if (rechazos.length > 0 && step < MAX_STEPS - 1) {
          logger.info({ tenantId, rechazos: rechazos.length }, "[AppOperator] Plan rechazado antes de proponerlo -- se le devuelve al modelo para que corrija");
          messages.push({ role: "assistant", content });
          messages.push({ role: "user", content: rechazos.join("\n\n") });
          continue;
        }
        // Sin intentos restantes: NO se propone algo que va a fallar igual.
        // Se le dice al admin en su idioma qué pasa y se corta.
        if (rechazos.length > 0) {
          const reply = paraMarkdown(toEmojiStyle(
            `No pude dejarlo listo:\n\n${rechazos.map((r) => `❌ ${mensajeParaAdmin(r)}`).join("\n\n")}`,
          ));
          await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
          return finish({ reply, status: "info", needsContinuation: false });
        }

        progreso("Preparando el plan de cambios para que lo apruebes");
        for (const m of mutations) plannedActions.push({ tool: m.tool, args: m.args || {} });
        for (const a of reads) await executeAction(a.tool, a.args || {}, ctx);
        resolved = true;
        break;
      }

      // Solo lecturas → ejecutar y devolver datos reales para que la IA se apoye
      if (reads.length > 0) {
        // Las lecturas son de solo lectura y entre sí no dependen una de otra
        // (listar productos, ver estado de WhatsApp, buscar en la web...).
        // Antes se ejecutaban EN SERIE: si el modelo pedía tres en un paso, el
        // turno pagaba la suma de las tres. En paralelo paga solo la más lenta.
        // El control de bucle (seenReads) se aplica ANTES de lanzarlas, para
        // que siga cortando igual si el modelo repite la misma consulta.
        const aEjecutar: any[] = [];
        for (const a of reads) {
          const sig = `${a.tool}:${JSON.stringify(a.args || {})}`;
          const seenCount = (seenReads.get(sig) || 0) + 1;
          seenReads.set(sig, seenCount);
          if (seenCount > 2) {
            loopSignature = sig;
            break;
          }
          aEjecutar.push(a);
        }

        // Se avisa ANTES de lanzarlas (van en paralelo): es el tramo más lento
        // del turno, justo donde el admin necesita ver que algo pasa. Sin
        // repetir el mismo texto si dos lecturas caen en la misma categoría.
        for (const texto of new Set(aEjecutar.map((a) => describirTarea(a.tool)))) progreso(texto);

        const results = await Promise.all(
          aEjecutar.map(async (a) => {
            if (a.tool === "web_search" || a.tool === "deep_research") usedWebSearchThisTurn = true;
            // Una lectura que explote no debe tumbar todo el paso: se reporta
            // como fallida y el modelo sigue con las demás.
            try {
              const r = await executeAction(a.tool, a.args || {}, ctx);
              return { tool: a.tool, ok: r.ok, summary: r.summary, data: r.data };
            } catch (e: any) {
              logger.warn({ tool: a.tool, err: e?.message }, "[AppOperator] lectura falló");
              return { tool: a.tool, ok: false, summary: `No se pudo completar: ${e?.message || "error"}` };
            }
          }),
        );

        if (loopSignature) {
          finalReply = paraMarkdown(toEmojiStyle(
            `${finalReply ? finalReply + "\n\n" : ""}⚠️ Me detuve porque estaba repitiendo la misma consulta (${loopSignature}) sin avanzar. Esto es lo que alcancé a averiguar antes de frenar -- decime qué falta y lo completo.`,
          ));
          resolved = true;
          break;
        }

        messages.push({ role: "assistant", content });
        messages.push({
          role: "user",
          content: "RESULTADOS DE LECTURAS (datos reales):\n" + JSON.stringify(results) +
            '\n\nUsa estos datos reales. Si vas a cambiar algo, propón el plan con ids/valores reales y pide confirmación. Responde {"reply":"...","actions":[...],"done":true}.',
        });
        // No cortamos si dijo done:true pero su reply es solo un anuncio de lo
        // que "va a hacer": ahí todavía no hay resultado, hay que seguir.
        if (parsed.done && !isAnnouncement(finalReply)) { resolved = true; break; }
        if (parsed.done) {
          messages.push({ role: "user", content: CONTINUE_NUDGE });
        }
        continue;
      }

      // No hay acciones. Si la respuesta es un anuncio ("ahora voy a…") en vez
      // de un resultado, la empujamos a completarlo en lugar de devolverla.
      if (isAnnouncement(finalReply) && step < MAX_STEPS - 1) {
        messages.push({ role: "assistant", content });
        messages.push({ role: "user", content: CONTINUE_NUDGE });
        continue;
      }
      // Copy de marketing con forma de "investigación previa" pero sin haber
      // llamado web_search en NINGÚN paso de este turno -- fabricación
      // disfrazada de research real (ver comentario arriba, en la
      // declaración de estos regex). Se rechaza y se obliga a investigar de
      // verdad antes de responder, en vez de dejar pasar el texto inventado.
      if (
        !usedWebSearchThisTurn &&
        FABRICATED_RESEARCH_CLAIM.test(finalReply) &&
        AD_COPY_SHAPE.test(finalReply) &&
        step < MAX_STEPS - 1
      ) {
        messages.push({ role: "assistant", content });
        messages.push({
          role: "user",
          content:
            'Tu respuesta anterior presenta copy de anuncio como si viniera de una "investigación previa", pero no llamaste a web_search en ningún momento de este turno -- eso es fabricar datos, algo que este sistema no puede permitir. Descartá esa respuesta. Llamá a web_search de verdad con una consulta real sobre el nicho ANTES de escribir cualquier copy, y basá el hook/ángulo en lo que encuentres. Si preferís no investigar ahora, decilo explícitamente en vez de inventar hallazgos.',
        });
        continue;
      }
      resolved = true;
      break;
    }

    // Se acabaron los MAX_STEPS sin que ninguna salida normal se disparara
    // (el modelo seguía pidiendo lecturas o anunciando pasos sin cerrar).
    // Avisar en vez de devolver la última respuesta parcial como si fuera
    // definitiva.
    // El admin que usa esto no es programador -- un mensaje tipo "⚠️ esto
    // está tardando más de lo esperado" o pedirle que escriba "continuá" se
    // lee como que el sistema está roto. En vez de mostrar eso, se sigue
    // solo: el texto queda en tono natural (lo que ya se encontró, sin
    // alarmar) y needsContinuation le dice al frontend que mande el próximo
    // paso automáticamente, sin que el admin tenga que escribir nada ni
    // enterarse de que hizo falta más de un turno.
    let needsContinuation = false;
    if (!resolved && plannedActions.length === 0) {
      needsContinuation = true;
      finalReply = paraMarkdown(toEmojiStyle(
        finalReply
          ? `${finalReply}\n\nDejame seguir un poco más con esto...`
          : "Dejame investigar esto un poco más...",
      ));
    }

    // ── LO QUE SALE TIENE QUE SER UNA RESPUESTA ─────────────────────────────
    //
    // El mismo candado que en operator-opencode.ts, y por el mismo motivo: un
    // resumen interno de traspaso ("Goal / Remaining Tasks / Prompt for next
    // agent") no es una respuesta para el admin, y la REGLA CERO del prompt no
    // puede atajarlo porque ese texto no lo escribe Atlas siguiendo su prompt.
    //
    // Va en los dos motores a propósito: /operator y /operator-opencode
    // publican por caminos distintos, y arreglarlo en uno solo deja el otro
    // abierto -- que es exactamente como este proyecto ya perdió tiempo antes.
    if (esResumenInterno(finalReply) || pareceIngles(finalReply)) {
      logger.warn(
        { tenantId, sessionId, largo: String(finalReply || "").length },
        "[AppOperator] La respuesta era un resumen interno o quedó en inglés: no se publica",
      );
      finalReply = avisoDeTurnoIncompleto();
    }

    // ── ¿Quedó un plan de cambios? → guardar como pendiente y pedir confirmación ──
    if (plannedActions.length > 0) {
      const planText = plannedActions
        .map((a, i) => `${i + 1}. ${describePlannedAction(a)}`)
        .join("\n");
      const reply = paraMarkdown(toEmojiStyle(
        `${finalReply ? finalReply + "\n\n" : ""}📋 Plan propuesto (requiere tu confirmación):\n${planText}\n\n❓ ¿Confirmas? Responde sí para ejecutar, o dime qué ajusto.`,
      ));
      await setPendingPlan(tenantId, sessionId, plannedActions, reply);
      await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
      logger.info({ tenantId, planned: plannedActions.length }, "[AppOperator] Plan propuesto, esperando confirmación");
      return finish({ reply, plan: plannedActions, status: "awaiting_confirmation" });
    }

    // Solo lectura / respuesta informativa → sin cambios que confirmar
    finalReply = paraMarkdown(toEmojiStyle(finalReply));
    await saveArchitectTurn(tenantId, sessionId, "assistant", finalReply);
    logger.info({ tenantId, needsContinuation }, "[AppOperator] Respuesta informativa (sin cambios)");
    return finish({ reply: finalReply, status: "info", needsContinuation });
  } catch (e) {
    logger.error(e, "[AppOperator] Error");
    // Con streaming las cabeceras ya salieron: el manejador de errores de
    // Express intentaría escribir un JSON con su propio código de estado y
    // fallaría, dejando la conexión colgada -- justo el síntoma que este
    // trabajo vino a eliminar. Se cierra con un evento de error propio.
    if (!res.headersSent) return next(e);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "turno interrumpido" })}\n\n`);
    } catch { /* la conexión ya estaba cerrada */ }
    if (!res.writableEnded) res.end();
    return;
  }
});

/**
 * GET /api/code-agent/history — Devuelve la conversación persistida del
 * Architect para que la UI la restaure al volver a la página (antes el hilo
 * vivía solo en el estado de React y se borraba al navegar).
 */
/**
 * GET /api/code-agent/sessions — las conversaciones guardadas del negocio.
 *
 * El historial SIEMPRE se guardó por sessionId, pero el panel usaba una sola
 * sesión fija ("default"): abrir una charla nueva significaba BORRAR la
 * anterior. El admin lo reportó -- "a veces quiero continuar una charla y no
 * puedo porque ya cerré o limpié la actual".
 *
 * Los datos ya estaban ahí; lo que faltaba era poder verlos. Esto devuelve
 * cada conversación con su primer mensaje --que funciona como título, igual
 * que en ChatGPT-- y cuándo fue la última vez que se habló.
 */
router.get("/sessions", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { db, architectMemory } = await import("@workspace/db");
    const { and, eq, asc } = await import("drizzle-orm");

    const filas = await db
      .select({
        sessionId: architectMemory.sessionId,
        content: architectMemory.content,
        createdAt: architectMemory.createdAt,
      })
      .from(architectMemory)
      .where(
        and(
          eq(architectMemory.tenantId, tenantId),
          eq(architectMemory.memoryType, "observation"),
        ),
      )
      .orderBy(asc(architectMemory.createdAt));

    // Se agrupa en memoria y no con SQL a propósito: son los mensajes de un
    // solo negocio, y hacerlo acá evita un DISTINCT ON que ata la consulta a
    // Postgres (este proyecto también corre sobre SQLite).
    const porSesion = new Map<string, { titulo: string; mensajes: number; ultimo: any }>();
    for (const f of filas) {
      const id = String(f.sessionId || "default");
      const texto = String(f.content || "").replace(/^(usuario|assistant|admin)\s*:\s*/i, "").trim();
      const previo = porSesion.get(id);
      if (!previo) {
        porSesion.set(id, {
          // El PRIMER mensaje es el título: es lo que el admin escribió al
          // abrir la charla, así que es lo que va a reconocer después.
          titulo: texto.slice(0, 80) || "Conversación",
          mensajes: 1,
          ultimo: f.createdAt,
        });
      } else {
        previo.mensajes++;
        previo.ultimo = f.createdAt;
      }
    }

    const sesiones = Array.from(porSesion.entries())
      .map(([id, d]) => ({ sessionId: id, titulo: d.titulo, mensajes: d.mensajes, ultimoMensaje: d.ultimo }))
      // La más reciente primero: es la que se quiere retomar.
      .sort((a, b) => new Date(b.ultimoMensaje as any).getTime() - new Date(a.ultimoMensaje as any).getTime());

    return res.json({ sesiones });
  } catch (e) {
    return next(e);
  }
});

router.get("/history", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const sessionId = String(req.query.sessionId || "default");

    const [history, pending] = await Promise.all([
      // Para MOSTRAR: la charla entera (tope alto), no los 40 del modelo.
      loadArchitectHistory(tenantId, sessionId, 1000),
      getPendingPlan(tenantId, sessionId),
    ]);
    // `hayAlgoPendiente`: el último turno guardado quedó a medio hacer. La
    // página que restaura lo usa para seguir sola en vez de dejarlo frenado
    // -- el encadenado de continuaciones vive en la página, así que si el
    // admin se fue, murió con ella.
    const ultimo = history[history.length - 1];
    // `turnoEnCurso`: si el servidor está de verdad trabajando en esta charla.
    // Medido 19-09-2026 18:07: un deploy reinició el servidor a mitad de un
    // turno; el pedido del admin quedó guardado sin respuesta y la página,
    // al ver "último = user", se bloqueó 10 minutos en "Retomando…" sin
    // dejar escribir ni detener. Con esto la página sabe que no hay nada
    // que esperar.
    const { claveDeTurno, hayTurnoEnVuelo } = await import("../lib/turnos-en-vuelo");
    return res.json({
      history,
      awaitingConfirmation: !!pending,
      hayAlgoPendiente: ultimo?.role === "assistant" && ultimo?.parcial === true,
      turnoEnCurso: hayTurnoEnVuelo(claveDeTurno(String(tenantId), sessionId)),
    });
  } catch (e) {
    return next(e);
  }
});

/**
 * DELETE /api/code-agent/history — Borra la conversación persistida (botón
 * "nueva conversación"), incluido cualquier plan pendiente de aprobación.
 */
router.delete("/history", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const sessionId = String(req.query.sessionId || "default");
    await clearArchitectHistory(tenantId, sessionId);
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/code-agent/upload — Subir una imagen/archivo desde el chat del
 * Architect (botón 📎). Recibe la imagen como data URL base64 (sin multer),
 * la guarda permanente en el volumen y devuelve la URL absoluta para usarla.
 */
/**
 * POST /api/code-agent/upload-document
 *
 * Sube un documento de trabajo (PDF, Word, Excel, PowerPoint, texto) y
 * devuelve su TEXTO, para que Atlas lo pueda leer y analizar.
 *
 * Antes el chat solo aceptaba imágenes: un catálogo de proveedor en PDF o una
 * lista de precios en Excel había que copiarlos y pegarlos a mano.
 *
 * El archivo NO se guarda: se lee, se extrae el texto y se descarta. Lo que
 * interesa es el contenido, no tener el archivo dando vueltas en el volumen --
 * y un catálogo de proveedor puede traer datos que no hay por qué conservar.
 */
router.post("/upload-document", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { file, filename } = req.body || {};
    if (!file || typeof file !== "string") {
      return res.status(400).json({ error: "Falta 'file' (data URL base64)" });
    }
    const nombre = String(filename || "documento");

    // data:<mime>;base64,<datos>
    const coma = file.indexOf(",");
    const base64 = coma >= 0 ? file.slice(coma + 1) : file;
    const buffer = Buffer.from(base64, "base64");

    // Tope de 15MB: un PDF más grande que eso casi siempre es un escaneo, que
    // igual no tiene texto extraíble.
    if (buffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ error: "El archivo supera 15MB. Si es un PDF escaneado, mandame la página que te interesa como imagen." });
    }

    const { leerDocumento } = await import("../lib/leer-documentos");
    const r = await leerDocumento(buffer, nombre);
    if (!r.ok) return res.status(400).json({ error: r.resumen });

    // Para el chat se recorta más que el tope del lector: un texto enorme
    // dentro del prompt no solo no entra, sino que le tapa al modelo la
    // pregunta real del admin.
    const PARA_EL_CHAT = 30_000;
    const texto = r.texto.length > PARA_EL_CHAT ? r.texto.slice(0, PARA_EL_CHAT) : r.texto;

    return res.json({
      ok: true,
      tipo: r.tipo,
      nombre,
      resumen: r.resumen,
      recortado: r.texto.length > PARA_EL_CHAT,
      texto,
    });
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/code-agent/voz
 *
 * Devuelve la respuesta de Atlas hablada, en MP3.
 *
 * Se genera bajo pedido y no se guarda en ningún lado: el audio de una
 * respuesta ya leída no le sirve a nadie, y guardarlo llenaría el volumen con
 * archivos que nadie vuelve a abrir.
 *
 * Si el servicio de voz falla se devuelve 204 (sin contenido) y NO un error:
 * quedarse sin voz es un problema menor y la pantalla ya tiene la respuesta
 * escrita. Un 500 acá haría que la página muestre un error por algo que no
 * afecta al trabajo.
 */
router.post("/voz", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { texto, voz } = req.body || {};
    if (!texto || typeof texto !== "string") {
      return res.status(400).json({ error: "Falta 'texto'" });
    }

    const { hablar, VOZ_POR_DEFECTO } = await import("../lib/voz-de-atlas");
    // Solo las dos voces colombianas, y no lo que venga en el cuerpo: el nombre
    // de la voz viaja al SSML, y aceptar cualquier cadena del cliente es
    // dejarle armar el XML a alguien de afuera.
    const VOCES = new Set(["es-CO-SalomeNeural", "es-CO-GonzaloNeural"]);
    const elegida = VOCES.has(String(voz)) ? String(voz) : VOZ_POR_DEFECTO;

    const mp3 = await hablar(String(texto), elegida);
    if (!mp3) return res.status(204).end();

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(mp3.length));
    res.setHeader("Cache-Control", "no-store");
    return res.end(mp3);
  } catch (e) {
    return next(e);
  }
});

router.post("/upload", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const { image, filename } = req.body || {};
    if (!image || typeof image !== "string") return res.status(400).json({ error: "Falta 'image' (data URL base64)" });

    const { saveUploadedImage } = await import("../lib/image-store");
    const rel = await saveUploadedImage(image, filename);
    if (!rel) return res.status(400).json({ error: "No se pudo guardar la imagen" });

    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    const url = base ? `${base}${rel}` : rel;
    return res.json({ ok: true, url, path: rel });
  } catch (e) {
    return next(e);
  }
});

/**
 * GET /api/code-agent/diagnostico — Diagnóstico del negocio para el saludo.
 *
 * Devuelve el estado del negocio (productos, WhatsApp, Facebook, campañas) y
 * el siguiente paso recomendado. El frontend lo usa en vez del saludo fijo
 * para que Atlas abra proponiendo, no saludando.
 */
router.get("/diagnostico", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const { diagnosticoDelNegocio } = await import("../lib/diagnostico-de-inicio");
    const ctx: OperatorContext = { tenantId };
    const d = await diagnosticoDelNegocio(ctx);
    return res.json({ ok: true, ...d });
  } catch (e) {
    return next(e);
  }
});

export default router;

