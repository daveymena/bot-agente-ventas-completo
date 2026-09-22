import { db, agents, tenants } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { responseAnalyticsEngine } from "./response-analytics";
import { autoTuneEngine } from "./auto-tune";
import { architectMemoryService } from "./architect-memory-service";
import { getProviderConfig } from "@workspace/integrations-openai-ai-server";

interface ReflectionLesson {
  titulo: string;
  leccion: string;
  gravedad: "baja" | "media" | "alta";
  accion: string;
}

const PROHIBIDO = ["invent", "mentir", "mient", "exager", "alucin", "escasez falsa", "urgencia falsa", "garantía falsa", "testimonio falso"];

/**
 * Curación pura de una lección: rechaza las que fabrican datos o son genéricas.
 * Exportada para poder testearla sin DB ni LLM.
 */
export function esLeccionValida(leccion: { leccion: string; accion: string }): boolean {
  const contenido = (leccion.leccion + " " + leccion.accion).toLowerCase();
  if (PROHIBIDO.some((palabra) => contenido.includes(palabra))) return false;
  if (leccion.leccion.length < 20 || leccion.leccion.includes("sé más amable")) return false;
  return true;
}

export class AutoReflexionEngine {
  private readonly MIN_SAMPLES = 5;

  /**
   * Motor de auto-reflexión curada.
   * Detecta patrones de error en segundo plano y aplica mejoras aditivas al prompt.
   */
  async runAutoReflexion(tenantId: number) {
    try {
      logger.info({ tenantId }, "[AutoReflexion] Iniciando ciclo de reflexión");

      const activeAgents = await db
        .select()
        .from(agents)
        .where(and(eq(agents.tenantId, tenantId), eq(agents.isActive, true)));

      const results: Array<{ agentId: number; lesson: string; status: string }> = [];

      for (const agent of activeAgents) {
        const stats = await responseAnalyticsEngine.getStats(tenantId, agent.id, 30);
        const conv = await responseAnalyticsEngine.getConversionRate(tenantId, agent.id, 30);

        const confused = Number(stats.confused || 0);
        const left = Number(stats.left || 0);
        const total = Number(stats.total || 0);
        const sentiment = Number(stats.avgSentiment || 0);

        if (total < this.MIN_SAMPLES) {
          logger.info({ agentId: agent.id, total }, "[AutoReflexion] Insuficiente data para reflexionar");
          continue;
        }

        const confusionRate = (confused / total) * 100;
        const abandonmentRate = (left / total) * 100;

        if (confusionRate > 15 || abandonmentRate > 25 || sentiment < 0.3) {
          logger.info({ agentId: agent.id, confusionRate, abandonmentRate, sentiment }, "[AutoReflexion] Señal de error detectada");

          const lesson = await this.reflectOnErrors(tenantId, agent, {
            confusionRate,
            abandonmentRate,
            sentiment,
            conversionRate: conv.conversionRate,
            total,
          });

          if (lesson) {
            const applied = await this.curateAndApply(tenantId, agent, lesson);
            if (applied) {
              results.push({ agentId: agent.id, lesson: lesson.titulo, status: "aplicado" });
            }
          }
        }
      }

      return {
        tenantId,
        timestamp: new Date(),
        appliedImprovements: results,
      };
    } catch (e: any) {
      logger.error({ tenantId, error: e }, "[AutoReflexion] Error en ciclo de reflexión");
      return { error: e.message };
    }
  }

  private async reflectOnErrors(tenantId: number, agent: any, metrics: Record<string, any>): Promise<ReflectionLesson | null> {
    const config = getProviderConfig("groq") ?? getProviderConfig("deepseek");
    if (!config?.apiKey) {
      logger.warn("[AutoReflexion] Sin proveedor de texto configurado para reflexionar");
      return null;
    }

    const prompt = `Eres un experto en optimización de agentes de ventas.
Analiza las siguientes métricas de rendimiento del agente "${agent.name}" (Rol: ${agent.role}):
- Tasa de Confusión: ${metrics.confusionRate.toFixed(1)}%
- Tasa de Abandono: ${metrics.abandonmentRate.toFixed(1)}%
- Sentimiento Promedio: ${metrics.sentiment}
- Tasa de Conversión: ${metrics.conversionRate}%
- Muestra: ${metrics.total} mensajes.

Tu misión es identificar UNA sola lección concreta y acotada para mejorar la conversación.
NO des consejos genéricos como "sé más amable".
Busca fallos en:
- Exceso de preguntas.
- Falta de claridad en el precio.
- No manejar una objeción común.
- Tono demasiado robótico o agresivo.

Responde estrictamente en JSON:
{
  "titulo": "Nombre corto de la mejora",
  "leccion": "Qué está fallando y qué hacer distinto",
  "gravedad": "baja" | "media" | "alta",
  "accion": "Instrucción concreta para agregar al systemPrompt"
}`;

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "system", content: "Eres un optimizador de prompts. Respondé SOLO con JSON válido." }, { role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, "[AutoReflexion] El proveedor rechazó la reflexión");
        return null;
      }
      const data: any = await response.json();
      const content = data?.choices?.[0]?.message?.content || "";
      try {
        return JSON.parse(content) as ReflectionLesson;
      } catch {
        logger.warn("[AutoReflexion] El proveedor no devolvió JSON válido");
        return null;
      }
    } catch (e: any) {
      logger.warn({ agentId: agent.id, err: e }, "[AutoReflexion] Error llamando al LLM para reflexión");
      return null;
    }
  }

  private async curateAndApply(tenantId: number, agent: any, lesson: ReflectionLesson): Promise<boolean> {
    if (!esLeccionValida(lesson)) {
      logger.warn({ lesson: lesson.titulo }, "[AutoReflexion] Lección rechazada por curación");
      return false;
    }

    const existing = await architectMemoryService.retrieveRelevantMemories(tenantId, lesson.titulo);
    if (existing.length > 0 && existing[0].content.includes(lesson.accion)) {
      logger.info({ lesson: lesson.titulo }, "[AutoReflexion] Lección duplicada, saltando");
      return false;
    }

    try {
      const currentPrompt = agent.systemPrompt as string;
      const newPrompt = `${currentPrompt}\n\n## MEJORA CONTINUA\n- ${lesson.accion}`;

      await autoTuneEngine.saveVersion({
        agentId: agent.id,
        previousPrompt: currentPrompt,
        newPrompt,
        diffSummary: `Auto-reflexión: ${lesson.titulo}`,
        reason: lesson.leccion,
        appliedBy: "auto-reflexion",
        performanceBefore: { gravity: lesson.gravedad },
      });

      await db.update(agents).set({ systemPrompt: newPrompt }).where(eq(agents.id, agent.id));

      await architectMemoryService.recordLearning(
        tenantId,
        "reflection",
        lesson.titulo,
        lesson.leccion,
        ["auto-reflexion"],
        { accion: lesson.accion, gravedad: lesson.gravedad }
      );

      logger.info({ agentId: agent.id, lesson: lesson.titulo }, "[AutoReflexion] Mejora aplicada exitosamente");
      return true;
    } catch (e: any) {
      logger.error({ agentId: agent.id, error: e }, "[AutoReflexion] Error aplicando lección");
      return false;
    }
  }
}

export const autoReflexionEngine = new AutoReflexionEngine();

const CADA_MS = 12 * 60 * 60 * 1000;

export function registrarAutoReflexion() {
  if (process.env.AUTOREFLEXION_ENABLED !== "true") {
    logger.info("[AutoReflexion] Inactivo por defecto (AUTOREFLEXION_ENABLED=true para activar)");
    return;
  }
  logger.info("[AutoReflexion] Activo: ciclo cada 12 horas");
  const correr = async () => {
    try {
      const negocios = await db.select({ id: tenants.id }).from(tenants);
      for (const n of negocios) {
        await autoReflexionEngine.runAutoReflexion(n.id).catch((e) =>
          logger.error({ tenantId: n.id, err: e?.message }, "[AutoReflexion] fallo por negocio")
        );
      }
    } catch (e: any) {
      logger.error({ err: e?.message }, "[AutoReflexion] fallo general");
    }
  };
  void correr();
  setInterval(() => { void correr(); }, CADA_MS).unref?.();
}