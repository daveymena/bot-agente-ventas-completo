import { Router } from "express";
import { createAIClient, getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { db, agents } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import type { TenantRequest } from "../lib/tenantManager";

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

    const nvidiaConfig = getProviderConfig("nvidia");
    if (!nvidiaConfig) {
      return res.status(500).json({ error: "NVIDIA AI engine not configured for Architect" });
    }

    const client = createAIClient(nvidiaConfig);
    
    const systemPrompt = `
Eres el "Arquitecto de Agentes" de Sofía SaaS. Tu misión es diseñar la personalidad, tono y estrategia de ventas de un agente de IA basándote en los deseos del usuario.

REGLAS:
1. Analiza el pedido del usuario (ej: "Quiero un agente rudo que venda mis packs").
2. Genera un DNA completo para el agente.
3. Debes responder SIEMPRE en formato JSON con la siguiente estructura:
{
  "reply": "Tu mensaje amigable al usuario explicando lo que creaste",
  "config": {
    "name": "Nombre del agente",
    "role": "Rol (ej: Vendedor Senior)",
    "tone": "Tono (ej: Persuasivo y Directo)",
    "systemPrompt": "El prompt de sistema DETALLADO que usará el bot en WhatsApp",
    "stages": [
      {"key": "greeting", "name": "Saludo", "prompt": "..."},
      {"key": "presentation", "name": "Presentación", "prompt": "..."},
      {"key": "closing", "name": "Cierre", "prompt": "..."}
    ]
  }
}

IMPORTANTE: El systemPrompt debe ser de alta calidad, enfocado en ventas y siguiendo la estética premium de Sofía (separadores, emojis, brevedad).
`;

    const response = await client.chat.completions.create({
      model: nvidiaConfig.model,
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

      if (existingAgent) {
        // Update
        await db.update(agents)
          .set({
            name: result.config.name,
            role: result.config.role,
            tone: result.config.tone,
            systemPrompt: result.config.systemPrompt,
            stages: result.config.stages,
            isActive: true
          })
          .where(eq(agents.id, existingAgent.id));
        
        logger.info({ tenantId, agentId: existingAgent.id }, "[Architect] Agent updated successfully");
      } else {
        // Create new
        await db.insert(agents).values({
          tenantId,
          name: result.config.name,
          role: result.config.role,
          tone: result.config.tone,
          systemPrompt: result.config.systemPrompt,
          stages: result.config.stages,
          isActive: true,
          language: "es",
          model: "moonshotai/kimi-k2.6"
        });
        logger.info({ tenantId }, "[Architect] New agent created successfully");
      }
    }

    return res.json({ 
      reply: result.reply, 
      configApplied: !!result.config 
    });

  } catch (e) {
    logger.error(e, "[Architect] Error in architect AI:");
    return next(e);
  }
});

export default router;

