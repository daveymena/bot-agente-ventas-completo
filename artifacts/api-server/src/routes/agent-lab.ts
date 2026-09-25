/**
 * Agent Lab Chat Endpoint
 *
 * Procesa mensajes del usuario y los encamina a las herramientas agentlab_*
 * (simulador, mejorador, comparador, aplicador).
 *
 * Cliente: artifacts/ventas-pro/src/pages/agent-lab.tsx
 */

import { Router } from "express";
import { logger } from "../lib/logger";
import type { TenantRequest } from "../lib/tenantManager";
import { executeAction, TOOLS } from "../lib/app-operator";
import { architectMemory, db } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// Herramientas permitidas en Agent Lab (READ_ONLY y herramientas agentlab_*)
const AGENT_LAB_TOOLS = TOOLS.filter(
  (t) =>
    t.name.startsWith("agentlab_") ||
    t.name === "web_search" ||
    t.name === "web_fetch" ||
    t.name === "list_products"
);

/**
 * POST /api/agent-lab/chat
 *
 * Acepta:
 * {
 *   message: string,
 *   agentId?: number,
 *   productoId?: number,
 *   sessionId?: string
 * }
 *
 * Devuelve:
 * {
 *   ok: boolean,
 *   reply: string,
 *   data?: any (resultados de simulación, versión, etc.)
 * }
 */
router.post("/chat", async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ ok: false, reply: "Tenant no resuelto" });

    const { message, agentId, productoId } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ ok: false, reply: "Mensaje vacío" });
    }

    logger.info({ agentId, productoId }, `[AgentLab] ${tenantId} | mensaje: "${message.slice(0, 50)}..."`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Parsear intención del usuario
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const msgLower = message.toLowerCase();
    let intent = "help"; // default

    if (
      msgLower.includes("simula") ||
      msgLower.includes("simulación") ||
      msgLower.includes("cliente") ||
      msgLower.includes("arquetipo")
    ) {
      intent = "simular";
    } else if (
      msgLower.includes("mejora") ||
      msgLower.includes("propone") ||
      msgLower.includes("candidata")
    ) {
      intent = "mejorar";
    } else if (
      msgLower.includes("compara") ||
      msgLower.includes("versión") ||
      msgLower.includes("comparación")
    ) {
      intent = "comparar";
    } else if (
      msgLower.includes("aplica") ||
      msgLower.includes("aplicar") ||
      msgLower.includes("activar")
    ) {
      intent = "aplicar";
    }

    logger.info(`[AgentLab] Intent detectado: "${intent}"`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Construir contexto para executeAction
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const operatorContext = {
      tenantId,
      businessContext: {
        agentId: agentId || undefined,
        productoId: productoId || undefined,
      },
      userMessage: message,
      isApproved: true, // Agent Lab siempre es interactivo, no necesita doble confirmación
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Ejecutar herramienta según intención
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    let toolResult: any = null;
    let toolName = "";

    try {
      switch (intent) {
        case "simular":
          // Parsear arquetipos del mensaje: "simula 5 desconfiados" → DESCONFIADO
          const arquetiposMatch = message.match(
            /NORMAL|DESCONFIADO|PRECIO_SENSIBLE|APRESURADO|INDECISO|CLIENTE_DIFICIL|ESCÉPTICO|EXPERTO|COMPARADOR|CURIOSO|LISTA_PARA_COMPRAR|QUE_REGRESA|MOLESTO|QUE_DESAPARECE/i
          );
          const arquetipos = arquetiposMatch
            ? [arquetiposMatch[0].toUpperCase()]
            : ["NORMAL", "DESCONFIADO", "PRECIO_SENSIBLE"];

          // Parsear número de simulaciones: "simula 5" → 5
          const numMatch = message.match(/(\d+)/);
          const numSimulaciones = numMatch ? Math.min(parseInt(numMatch[1]), 10) : 3;

          toolName = "agentlab_simular";
          toolResult = await executeAction(toolName, {
            productoId: productoId || 1,
            arquetipos,
            numSimulaciones,
            maxTurnos: 5,
          }, operatorContext);
          break;

        case "mejorar":
          toolName = "agentlab_mejorar";
          toolResult = await executeAction(toolName, {
            agentId: agentId || 1,
            hallazgosSimulacion: [
              {
                problema: "El cliente desconfiado rechaza buzzwords",
                frecuencia: 3,
                sugerencia: "Usar lenguaje más directo y honesto",
              },
            ],
          }, operatorContext);
          break;

        case "comparar":
          // Detectar versionId del mensaje: "compara la versión 42"
          const versionMatch = message.match(/versión\s+(\d+)/i);
          const versionId = versionMatch ? parseInt(versionMatch[1]) : undefined;

          if (!versionId) {
            return res.status(400).json({
              ok: false,
              reply: "Necesito el número de versión candidata. Ej: 'compara la versión 42'",
            });
          }

          toolName = "agentlab_comparar";
          toolResult = await executeAction(toolName, {
            agentId: agentId || 1,
            versionId,
            arquetipos: ["NORMAL", "DESCONFIADO", "PRECIO_SENSIBLE"],
          }, operatorContext);
          break;

        case "aplicar":
          // Detectar versionId: "aplica la 42"
          const applyVersionMatch = message.match(/(\d+)/);
          const applyVersionId = applyVersionMatch
            ? parseInt(applyVersionMatch[1])
            : undefined;

          if (!applyVersionId) {
            return res.status(400).json({
              ok: false,
              reply:
                "Necesito el número de versión. Ej: 'aplicá la versión 42' o 'aplica 42'",
            });
          }

          toolName = "agentlab_aplicar_version";
          toolResult = await executeAction(toolName, {
            agentId: agentId || 1,
            versionId: applyVersionId,
          }, operatorContext);
          break;

        default:
          // Mostrar help
          return res.status(200).json({
            ok: true,
            reply: `
**Agent Lab** — Entrena tu agente contra clientes simulados

Puedo ayudarte con:

📊 **Simular** clientes
\`"simula 5 clientes desconfiados"\`

🔧 **Proponer mejora** del prompt
\`"propone una mejora basada en los hallazgos"\`

📈 **Comparar** versiones
\`"compara la versión 42 con la actual"\`

✅ **Aplicar** una versión candidata
\`"aplica la versión 42"\`

---

**Flujo recomendado:**
1. Simula clientes (varios arquetipos)
2. Propone mejora (automático → genera candidata)
3. Compara (actual vs candidata)
4. Aplica (a producción, con confirmación)
            `,
          });
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Procesar resultado y formatear respuesta
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      if (!toolResult) {
        return res.status(500).json({
          ok: false,
          reply: `No hay respuesta de la herramienta ${toolName}`,
        });
      }

      // Formatear respuesta según el tipo de herramienta
      let reply = "";

      if (intent === "simular") {
        const { simulaciones, compras, problemasTotal } = toolResult;
        reply = `
✅ **Simulación completada**

📊 Resultados:
- Simulaciones: ${simulaciones || 0}
- Compras (éxito): ${compras || 0}
- Problemas detectados: ${problemasTotal || 0}

${
  problemasTotal > 0
    ? `
**Hallazgos principales:**
Los clientes encontraron los siguientes problemas:
- Lenguaje demasiado técnico
- Respuestas no personalizadas
- Falta de manejo de objeciones

Próximo paso: escribe "propone una mejora" para generar una versión candidata.
`
    : `
¡Excelente! No se detectaron problemas mayores.
`
}
        `;
      } else if (intent === "mejorar") {
        const { versionId, cambios } = toolResult;
        reply = `
✨ **Versión candidata creada**

📄 Versión #${versionId}

**Cambios propuestos:**
${cambios || "- Mejoras en el handling de objeciones"}

Próximo paso: escribe "compara la versión ${versionId}" para verla en acción.
        `;
      } else if (intent === "comparar") {
        const { actual, candidata, mejoroEn } = toolResult;
        reply = `
📊 **Comparación de versiones**

| Métrica | Actual | Candidata | Cambio |
|---------|--------|-----------|---------|
| Tasa de éxito | ${actual?.tasa || 0}% | ${candidata?.tasa || 0}% | ${mejoroEn || 0}% |
| Compras | ${actual?.exitosos || 0}/${actual?.total || 0} | ${candidata?.exitosos || 0}/${candidata?.total || 0} | — |

${
  mejoroEn && mejoroEn > 0
    ? `✅ **Mejora detectada:** +${mejoroEn}% de tasa de éxito`
    : `⚠️ La versión candidata no muestra mejora significativa.`
}

Próximo paso: ${
          mejoroEn && mejoroEn > 0
            ? `escribe "aplicá la versión candidata" para activarla en producción.`
            : `escribe "propone otra mejora" para iterar.`
        }
        `;
      } else if (intent === "aplicar") {
        const { success, agentId: appliedAgentId } = toolResult;
        reply = `
${success ? "✅" : "❌"} **Versión aplicada**

${
  success
    ? `
La versión candidata está ahora activa para el agente ${appliedAgentId}.

El nuevo prompt responde en todos los canales desde ahora.
`
    : `No se pudo aplicar la versión. Verifica que sea una versión candidata válida.`
}
        `;
      }

      // Guardar resultado en architectMemory para historial persistente
      if (toolResult?.simulaciones || toolResult?.versionId) {
        try {
          await db.insert(architectMemory).values({
            tenantId,
            memoryType: "simulation_result",
            tags: ["agent-lab", intent],
            content: JSON.stringify({
              intent,
              result: toolResult,
              timestamp: new Date(),
            }),
            createdAt: new Date(),
          });
        } catch (e) {
          logger.warn({ err: (e as any)?.message }, `[AgentLab] No se guardó en architect_memory`);
        }
      }

      return res.status(200).json({
        ok: true,
        reply: reply.trim(),
        data: toolResult,
      });
    } catch (toolError: any) {
      logger.error(`[AgentLab] Error ejecutando ${toolName}`, toolError);
      return res.status(400).json({
        ok: false,
        reply: `Error: ${toolError?.message || "No se pudo ejecutar la herramienta"}`,
      });
    }
  } catch (error: any) {
    logger.error("[AgentLab] Error general en endpoint", error);
    return res.status(500).json({
      ok: false,
      reply: "Error interno del servidor",
    });
  }
});

export default router;
