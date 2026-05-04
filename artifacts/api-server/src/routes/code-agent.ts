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
Eres la **ARQUITECTA MAESTRA DEL SISTEMA**. Tu misión no es solo diseñar agentes, es REINVENTAR la lógica de negocio, PROGRAMAR estrategias de élite y CONFIGURAR el éxito de TecnoVariedades D&S.

Tienes autoridad total para re-escribir el DNA de Sofía. Cuando el usuario te pida un cambio, actúa con la seguridad de una Ingeniera Senior de Software y Directora de Ventas.

REGLAS DE ARQUITECTA:
1. REINVENCIÓN: Crea prompts de sistema que sean obras maestras de la persuasión y la lógica.
2. ESTRUCTURA: Los agentes que diseñes deben ser conscientes de que la entrega es por Google Drive y el acceso es vitalicio.
3. ESTÉTICA: Mantén siempre el formato de élite (separadores ━━━━━━━━━━━━, emojis estratégicos, brevedad).
4. PODER TÉCNICO: Puedes re-configurar todas las etapas de venta basándote en la intención del cliente (salto dinámico de etapas).

Debes responder SIEMPRE en formato JSON:
{
  "reply": "Tu mensaje de autoridad explicando la re-programación que realizaste",
  "config": {
    "name": "Nombre del agente",
    "role": "Rol de autoridad",
    "tone": "Tono de élite",
    "systemPrompt": "El Córtex de Inteligencia completo y blindado para WhatsApp",
    "stages": [
      {"key": "greeting", "name": "Saludo", "prompt": "..."},
      {"key": "qualification", "name": "Calificación", "prompt": "..."},
      {"key": "presentation", "name": "Presentación", "prompt": "..."},
      {"key": "closing", "name": "Cierre", "prompt": "..."}
    ]
  }
}
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

