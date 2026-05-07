import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { createAIClient, getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { db, agents, products, conversations, messages } from "@workspace/db";
import { logger } from "../lib/logger";
import type { TenantRequest } from "../lib/tenantManager";

const router = Router();

const ARCHITECT_SYSTEM = `Eres el "Arquitecto de Agentes IA" de VentasPro — el experto definitivo en diseñar bots de ventas por WhatsApp que convierten prospectos en clientes para cualquier negocio latinoamericano.

TIPOS DE NEGOCIOS QUE DOMINAS:
- Tienda online / dropshipping / ecommerce
- Servicios digitales (cursos, membresías, software)
- Servicios físicos (salones, gimnasios, clínicas, talleres)
- Inmobiliaria y arrendamientos
- Consultoría y asesorías B2B
- Restaurantes y delivery
- Tecnología y soporte técnico
- Moda, belleza y cuidado personal
- Cualquier otro tipo de negocio

CAPACIDADES:
1. Crear agentes desde cero con ADN completo
2. Mejorar agentes existentes según feedback
3. Analizar catálogo de productos y optimizar el pitch de ventas
4. Adaptar estrategia al tipo de negocio, público y región

SIEMPRE responde en JSON exactamente con esta estructura:
{
  "reply": "Respuesta conversacional amigable para el usuario (usa emojis, explica qué creaste/mejoraste, máx 4 párrafos)",
  "config": {
    "name": "Nombre del agente (ej: Ana, Carlos, Luna, Sofía)",
    "role": "Rol muy específico (ej: Especialista en Ventas de Cursos Digitales)",
    "tone": "Descripción detallada del tono y personalidad",
    "systemPrompt": "Prompt de sistema COMPLETO (mínimo 400 palabras). Incluye: identidad, restricciones, ejemplos de respuesta, instrucciones de formato WhatsApp (negrita *texto*, emojis, separadores ━━━), cuándo enviar [CARD: ID], cómo manejar objeciones, cómo cerrar ventas",
    "stages": [
      {"key": "greeting", "name": "Bienvenida", "prompt": "Instrucción específica de bienvenida para este negocio"},
      {"key": "qualification", "name": "Calificación", "prompt": "Cómo identificar al prospecto ideal"},
      {"key": "needs_discovery", "name": "Descubrimiento de Necesidades", "prompt": "Preguntas para entender qué necesita"},
      {"key": "presentation", "name": "Presentación", "prompt": "Cómo presentar productos/servicios con impacto"},
      {"key": "objection_handling", "name": "Manejo de Objeciones", "prompt": "Cómo responder dudas y objeciones típicas del sector"},
      {"key": "closing", "name": "Cierre de Venta", "prompt": "Técnicas de cierre específicas para este negocio"},
      {"key": "follow_up", "name": "Seguimiento", "prompt": "Cómo hacer seguimiento post-venta y fidelización"}
    ]
  }
}

REGLA: Si el usuario SOLO hace preguntas o pide consejos sin pedir crear/cambiar el agente, pon null en "config" y solo responde en "reply".
REGLA: Adapta al mercado colombiano/latinoamericano. Usa COP cuando menciones precios de ejemplo.
REGLA: El systemPrompt debe ser accionable, específico al negocio, con ejemplos concretos de mensajes.`;

router.post("/architect", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { prompt, history = [] } = req.body;

    const [currentAgent] = await db.select().from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.isActive, true)))
      .orderBy(desc(agents.id)).limit(1);

    const productList = await db.select({ id: products.id, name: products.name, price: products.price, category: products.category, kind: products.kind })
      .from(products).where(and(eq(products.tenantId, tenantId), eq(products.isActive, true))).limit(20);

    const recentConvos = await db.select({ id: conversations.id, contactName: conversations.contactName })
      .from(conversations).where(eq(conversations.tenantId, tenantId)).orderBy(desc(conversations.createdAt)).limit(5);

    let contextBlock = "";
    if (currentAgent) {
      const stages = (currentAgent.stages as any[]) || [];
      contextBlock += `\n\n--- AGENTE ACTUAL ---\nNombre: ${currentAgent.name} | Rol: ${currentAgent.role} | Tono: ${currentAgent.tone}\nEtapas configuradas: ${stages.map((s: any) => s.name).join(", ") || "ninguna"}\nPrompt actual (resumen): ${currentAgent.systemPrompt?.slice(0, 200)}...`;
    } else {
      contextBlock += "\n\n--- SIN AGENTE CONFIGURADO --- Este tenant aún no tiene agente activo.";
    }
    if (productList.length > 0) {
      contextBlock += `\n\n--- CATÁLOGO (${productList.length} productos activos) ---\n${productList.map(p => `• ${p.name} | Precio: ${p.price} | Categoría: ${p.category || "sin categoría"} | Tipo: ${p.kind}`).join("\n")}`;
    }
    if (recentConvos.length > 0) {
      contextBlock += `\n\n--- CONTEXTO DEL NEGOCIO ---\nClientes recientes: ${recentConvos.map(c => c.contactName || "Anónimo").join(", ")}`;
    }

    const providerConfig = getProviderConfig("github") || getProviderConfig("nvidia");
    if (!providerConfig) return res.status(500).json({ error: "Proveedor de IA no configurado. Configura el token de GitHub en Ajustes." });

    const client = createAIClient(providerConfig);

    const completion = await client.chat.completions.create({
      model: providerConfig.model,
      messages: [
        { role: "system", content: ARCHITECT_SYSTEM + contextBlock },
        ...history.slice(-10),
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 3500,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let result: { reply?: string; config?: any };
    try { result = JSON.parse(raw); } catch { result = { reply: raw, config: null }; }

    if (result.config?.name) {
      if (currentAgent) {
        await db.update(agents).set({
          name: result.config.name, role: result.config.role, tone: result.config.tone,
          systemPrompt: result.config.systemPrompt, stages: result.config.stages, isActive: true,
        }).where(eq(agents.id, currentAgent.id));
        logger.info({ tenantId, agentId: currentAgent.id }, "[Architect] Agent updated");
      } else {
        await db.insert(agents).values({
          tenantId, name: result.config.name, role: result.config.role, tone: result.config.tone,
          systemPrompt: result.config.systemPrompt, stages: result.config.stages, isActive: true, language: "es", model: providerConfig.model,
        });
        logger.info({ tenantId }, "[Architect] New agent created");
      }
    }

    return res.json({
      reply: result.reply || "Configuración aplicada.",
      configApplied: !!(result.config?.name),
      currentAgent: currentAgent ? { id: currentAgent.id, name: currentAgent.name, role: currentAgent.role, tone: currentAgent.tone, stagesCount: ((currentAgent.stages as any[]) || []).length } : null,
    });
  } catch (e) {
    logger.error(e, "[Architect] Error:");
    return next(e);
  }
});

router.get("/current", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const [agent] = await db.select().from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.isActive, true)))
      .orderBy(desc(agents.id)).limit(1);
    const productCount = await db.select({ id: products.id }).from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));
    return res.json({ agent: agent || null, productCount: productCount.length });
  } catch (e) { return next(e); }
});

export default router;
