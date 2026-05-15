import { Router } from "express";
import { createAIClient, getProviderConfig, getProviderConfigFromSettings } from "@workspace/integrations-openai-ai-server";
import { db, agents, settings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import type { TenantRequest } from "../lib/tenantManager";
import { getCopilotSessionToken } from "../lib/copilot";

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

    // Obtener configuración de DB o ENV
    const [dbSettings] = await db.select().from(settings).limit(1);
    let aiConfig = getProviderConfigFromSettings(dbSettings || {}) || getProviderConfig("github") || getProviderConfig("nvidia");

    if (!aiConfig) {
      return res.status(500).json({ error: "No AI engine configured for Architect" });
    }

    // Refresh Copilot Token if using github internal
    if (aiConfig.baseUrl === "https://api.githubcopilot.com") {
      const session = await getCopilotSessionToken(aiConfig.apiKey);
      if (session) {
        aiConfig.apiKey = session.token;
      }
    }

    const client = createAIClient(aiConfig);
    
    const systemPrompt = `
Eres la **ARQUITECTA MAESTRA DEL SISTEMA DE VENTAS CON IA**. Tu misión es REINVENTAR la lógica de negocio, PROGRAMAR estrategias de élite y CONFIGURAR el éxito total.

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
🎯 INSTRUCCIONES DE DISEÑO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **ANALIZA LA PETICIÓN**: Entiende exactamente qué quiere el usuario
2. **DISEÑA CON INTELIGENCIA**: Crea un agente que use análisis contextual
3. **SÉ ESPECÍFICO**: No uses frases genéricas, sé muy específico en cada prompt
4. **INCLUYE EJEMPLOS**: En los prompts, incluye ejemplos de cómo responder
5. **PIENSA EN EDGE CASES**: Considera situaciones difíciles y cómo manejarlas
6. **MANTÉN COHERENCIA**: El tono y personalidad deben ser consistentes
7. **USA FORMATO ELITE**: Separadores ━━━━━, emojis estratégicos, estructura clara

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ EJEMPLOS DE PETICIONES QUE PUEDES MANEJAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- "Crea un vendedor muy directo y sin rodeos"
- "Quiero un bot amigable que use muchos emojis"
- "Necesito un agente que maneje bien las objeciones de precio"
- "Haz que el bot sea más empático con clientes indecisos"
- "Configura estrategias de cierre más agresivas"
- "Quiero que el bot detecte urgencia y actúe en consecuencia"
- "Haz que el bot sea experto en cursos de piano"
- "Configura el bot para vender packs con descuento"

Actúa con la autoridad de una Ingeniera Senior de Software y Directora de Ventas.
¡Diseña agentes que VENDAN y CONVIERTAN!
`;

    const response = await client.chat.completions.create({
      model: aiConfig.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");

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
            updatedAt: new Date()
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
    let aiConfig = getProviderConfigFromSettings(dbSettings || {}) || getProviderConfig("github") || getProviderConfig("nvidia");

    if (!aiConfig) {
      return res.status(500).json({ error: "No AI engine configured for Architect" });
    }

    // Refresh Copilot Token if using github internal
    if (aiConfig.baseUrl === "https://api.githubcopilot.com") {
      const session = await getCopilotSessionToken(aiConfig.apiKey);
      if (session) {
        aiConfig.apiKey = session.token;
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

    const response = await client.chat.completions.create({
      model: aiConfig.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");

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
            updatedAt: new Date()
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
          updatedAt: new Date()
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

export default router;

