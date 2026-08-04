import { Router } from "express";
import { createAIClient, getProviderConfig, getProviderConfigFromSettings, getOpenCodeRotation, modelosPara, type AIProviderConfig } from "@workspace/integrations-openai-ai-server";
import { db, agents, settings, products, productCategories, conversations, messages } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
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
import { OPERATOR_SYSTEM_PROMPT, buildToolsDoc, executeAction, isReadOnlyTool, verifyMutation } from "../lib/app-operator";
import {
  loadArchitectHistory, saveArchitectTurn, getPendingPlan, setPendingPlan,
  clearPendingPlan, clearArchitectHistory, isApproval, isRejection,
  saveRepairLesson, loadRecentLessons,
} from "../lib/architect-store";
import { toEmojiStyle } from "../lib/conversation-engine";

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

/** Empujón para que complete el trabajo en el mismo turno, sin anunciarlo. */
const CONTINUE_NUDGE =
  "No anuncies lo que vas a hacer: HAZLO ahora en este mismo turno. " +
  "Llama las herramientas que falten (web_fetch, list_products, etc.) y sigue " +
  "hasta tener el resultado completo. Si ya reuniste la información y toca " +
  "crear o modificar algo, propón el plan con datos reales. " +
  'Solo pon done:true cuando entregues el resultado final o el plan a confirmar.';

// Descripción legible de una acción del plan, para mostrarla al admin antes de ejecutar.
function describePlannedAction(a: { tool: string; args: any }): string {
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
    default:
      return `${a.tool}: ${JSON.stringify(g).slice(0, 80)}`;
  }
}

const router = Router();

/**
 * AGENT ARCHITECT AI
 * This endpoint allows users to design their agents via natural language chat.
 * Kimi 2.6 will interpret the request and update the agent's DNA.
 */
router.post("/architect", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { prompt, history = [] } = req.body;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🧠 ANÁLISIS DEL NEGOCIO REAL — Datos de la BD
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // 1. Obtener configuración actual del negocio
    const [dbSettings] = await db.select().from(settings).limit(1);
    const businessName = dbSettings?.businessName || "Mi Negocio";
    const businessType = dbSettings?.businessType || "digital_products";

    // 2. Obtener agente actual (si existe)
    const [currentAgent] = await db
      .select()
      .from(agents)
      .where(eq(agents.tenantId, tenantId))
      .limit(1);

    // 3. Obtener productos activos
    const activeProducts = await db
      .select()
      .from(products)
      .where(eq(products.isActive, true))
      .limit(20);

    // 4. Obtener categorías de productos
    const categories = await db.select().from(productCategories).limit(10);

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
          eq(messages.conversationId, recentConversations[0]?.id || 0),
          eq(messages.role, "customer")
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(100);

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
      productsCount: activeProducts.length,
      categoriesCount: categories.length,
      conversationsCount: recentConversations.length,
      topProducts: Array.from(productMentions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name),
      commonObjections: objectionMessages.slice(0, 10).map(m => m.content),
      frequentQuestions: faqMessages.slice(0, 10).map(m => m.content),
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
    let aiConfig = getProviderConfigFromSettings(dbSettings || {}) 
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
Eres la **ARQUITECTA MAESTRA DEL SISTEMA DE VENTAS CON IA**. Tu misión es REINVENTAR la lógica de negocio, PROGRAMAR estrategias de élite y CONFIGURAR el éxito total.

NO eres un chat genérico. Eres una CONSULTORA EXPERTA que analiza datos reales del negocio para crear agentes profesionales y personalizados.

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
              { role: "user", content: `Mensaje del usuario: "${prompt}"\n\nRECORDATORIO CRÍTICO: Eres la Arquitecta experta (una consultora de IA). NO eres el bot de ventas. TU OBJETIVO: Conversar con el usuario, entender sus necesidades y hacer preguntas si falta información. Usa el campo "reply" del JSON para charlar con el usuario. Si tienes suficiente información, genera la "config". RESPONDE SIEMPRE EN FORMATO JSON ESTRICTO.` }
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
        { role: "user", content: `Mensaje del usuario: "${prompt}"\n\nRECORDATORIO CRÍTICO: Eres la Arquitecta experta (una consultora de IA). NO eres el bot de ventas. TU OBJETIVO: Conversar con el usuario, entender sus necesidades y hacer preguntas si falta información. Usa el campo "reply" del JSON para charlar con el usuario. Si tienes suficiente información, genera la "config". RESPONDE SIEMPRE EN FORMATO JSON ESTRICTO.` }
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

    const { prompt, history = [] } = req.body;

    const [dbSettings] = await db.select().from(settings).limit(1);
    let aiConfig = getProviderConfigFromSettings(dbSettings || {})
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
Eres la **ARQUITECTA VISUAL MAESTRA** con capacidades de análisis de negocio y generación de propuestas.

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
              { role: "user", content: `Mensaje del usuario: "${prompt}"\n\nRECORDATORIO CRÍTICO: Eres la Arquitecta Visual (una consultora experta). NO eres el bot de ventas. TU OBJETIVO: Conversar con el usuario para entender qué bot necesita crear. Usa el campo "reply" del JSON para responderle, hacerle preguntas y asesorarlo. Cuando tengas información suficiente o propongas algo, llena también los campos de preview y configuración. RESPONDE SIEMPRE EN FORMATO JSON ESTRICTO.` }
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
        { role: "user", content: `Mensaje del usuario: "${prompt}"\n\nRECORDATORIO CRÍTICO: Eres la Arquitecta Visual (una consultora experta). NO eres el bot de ventas. TU OBJETIVO: Conversar con el usuario para entender qué bot necesita crear. Usa el campo "reply" del JSON para responderle, hacerle preguntas y asesorarlo. Cuando tengas información suficiente o propongas algo, llena también los campos de preview y configuración. RESPONDE SIEMPRE EN FORMATO JSON ESTRICTO.` }
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

    const { prompt, history = [] } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt requerido" });

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
    if (dbSettings?.aiProvider) pushCfg(dbSettings.aiProvider, getProviderConfigFromSettings(dbSettings));
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
    if (candidates.length === 0) return res.status(500).json({ error: "No hay motor de IA configurado" });

    // Llama a la IA probando proveedores en orden hasta que uno responda
    const callAI = async (msgs: any[]): Promise<string | null> => {
      // The reverse proxy has a finite request timeout. A long serial fallback
      // chain used to outlive it and surface as a generic 502 even though the
      // app was healthy. Give the operator a bounded, predictable window.
      const deadline = Date.now() + 45_000;
      for (const cand of candidates) {
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
            { timeout: Math.min(10_000, remaining), maxRetries: 0 },
          );
          const c = resp.choices[0]?.message?.content;
          if (c) {
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
    const sys = OPERATOR_SYSTEM_PROMPT.replace("${TOOLS}", buildToolsDoc()) + lessonsBlock;
    const ctx = { tenantId };
    const sessionId: string = (req.body?.sessionId as string) || "default";

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
            `explicá el motivo real en "reply" y devolvé "actions": [] con "done": true.`,
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
      if (isApproval(String(prompt))) {
        // EJECUTAR el plan aprobado, con VERIFICACIÓN tras cada cambio y
        // AUTO-REPARACIÓN si algo falla (ver attemptSelfRepair arriba).
        const executed: any[] = [];
        const lines: string[] = [];
        for (const a of pending.actions) {
          let r = await executeAction(a.tool, a.args || {}, ctx);
          let repairLog: string[] = [];
          if (!r.ok) {
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
          lines.push(`${r.ok ? "✅" : "❌"} ${r.summary}${repairText}${verification ? `\n   ${verification}` : ""}`);
        }
        await clearPendingPlan(tenantId, sessionId);
        const allOk = executed.every((item) => item.ok);
        const reply = toEmojiStyle(
          `${allOk ? "✅ Plan ejecutado y verificado" : "⚠️ El plan terminó con errores; no voy a decir que quedó listo"}:\n\n${lines.join("\n")}`,
        );
        await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
        logger.info({ tenantId, executed: executed.length }, "[AppOperator] Plan aprobado y ejecutado");
        return res.json({ reply, executed, actionsCount: executed.length, status: allOk ? "executed" : "partial_failure" });
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

    for (let step = 0; step < MAX_STEPS; step++) {
      const rawAI = await callAI(messages);
      if (!rawAI) {
        return res.status(502).json({ error: "Todos los proveedores de IA fallaron" });
      }
      let content = rawAI.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
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

      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      finalReply = parsed.reply || finalReply;

      const reads = actions.filter((a: any) => isReadOnlyTool(a.tool));
      const mutations = actions.filter((a: any) => !isReadOnlyTool(a.tool));

      // Si hay MUTACIONES → ya tenemos el plan de cambios. Ejecutamos las
      // lecturas de este turno (para grounding) pero PARAMOS aquí: no seguimos
      // el loop, para no recolectar la misma mutación dos veces.
      if (mutations.length > 0) {
        for (const m of mutations) plannedActions.push({ tool: m.tool, args: m.args || {} });
        for (const a of reads) await executeAction(a.tool, a.args || {}, ctx);
        resolved = true;
        break;
      }

      // Solo lecturas → ejecutar y devolver datos reales para que la IA se apoye
      if (reads.length > 0) {
        const results: any[] = [];
        for (const a of reads) {
          const sig = `${a.tool}:${JSON.stringify(a.args || {})}`;
          const seenCount = (seenReads.get(sig) || 0) + 1;
          seenReads.set(sig, seenCount);
          if (seenCount > 2) {
            loopSignature = sig;
            break;
          }
          const r = await executeAction(a.tool, a.args || {}, ctx);
          results.push({ tool: a.tool, ok: r.ok, summary: r.summary, data: r.data });
        }

        if (loopSignature) {
          finalReply = toEmojiStyle(
            `${finalReply ? finalReply + "\n\n" : ""}⚠️ Me detuve porque estaba repitiendo la misma consulta (${loopSignature}) sin avanzar. Esto es lo que alcancé a averiguar antes de frenar -- decime qué falta y lo completo.`,
          );
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
      resolved = true;
      break;
    }

    // Se acabaron los MAX_STEPS sin que ninguna salida normal se disparara
    // (el modelo seguía pidiendo lecturas o anunciando pasos sin cerrar).
    // Avisar en vez de devolver la última respuesta parcial como si fuera
    // definitiva.
    if (!resolved && plannedActions.length === 0) {
      finalReply = toEmojiStyle(
        `${finalReply ? finalReply + "\n\n" : ""}⚠️ Llegué al límite de pasos (10) sin terminar la tarea por completo. Esto es lo que alcancé a hacer -- decime si querés que siga desde acá.`,
      );
    }

    // ── ¿Quedó un plan de cambios? → guardar como pendiente y pedir confirmación ──
    if (plannedActions.length > 0) {
      const planText = plannedActions
        .map((a, i) => `${i + 1}. ${describePlannedAction(a)}`)
        .join("\n");
      const reply = toEmojiStyle(
        `${finalReply ? finalReply + "\n\n" : ""}📋 Plan propuesto (requiere tu confirmación):\n${planText}\n\n❓ ¿Confirmas? Responde sí para ejecutar, o dime qué ajusto.`,
      );
      await setPendingPlan(tenantId, sessionId, plannedActions, reply);
      await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
      logger.info({ tenantId, planned: plannedActions.length }, "[AppOperator] Plan propuesto, esperando confirmación");
      return res.json({ reply, plan: plannedActions, status: "awaiting_confirmation" });
    }

    // Solo lectura / respuesta informativa → sin cambios que confirmar
    finalReply = toEmojiStyle(finalReply);
    await saveArchitectTurn(tenantId, sessionId, "assistant", finalReply);
    logger.info({ tenantId }, "[AppOperator] Respuesta informativa (sin cambios)");
    return res.json({ reply: finalReply, status: "info" });
  } catch (e) {
    logger.error(e, "[AppOperator] Error");
    return next(e);
  }
});

/**
 * GET /api/code-agent/history — Devuelve la conversación persistida del
 * Architect para que la UI la restaure al volver a la página (antes el hilo
 * vivía solo en el estado de React y se borraba al navegar).
 */
router.get("/history", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const sessionId = String(req.query.sessionId || "default");

    const [history, pending] = await Promise.all([
      loadArchitectHistory(tenantId, sessionId),
      getPendingPlan(tenantId, sessionId),
    ]);
    return res.json({ history, awaitingConfirmation: !!pending });
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

export default router;

