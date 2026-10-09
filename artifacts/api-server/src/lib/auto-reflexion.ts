import { db, agents, tenants } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { cuandoLaBaseEsteLista } from "./esperar-base";
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

const PROHIBIDO = [
  "invent", "mentir", "mient", "exager", "alucin", "escasez falsa", "urgencia falsa", "garantía falsa", "testimonio falso",
  "precio", "descuento", "promoción", "stock", "garantía de", "entrega en", "últimas unidades", "clientes satisfechos",
];

const BLOQUE_AUTO = /\n*## MEJORA CONTINUA AUTOMÁTICA\n[\s\S]*$/;

/** Una sola mejora gestionada, reemplazable y acotada; nunca crecimiento infinito del prompt. */
export function indicacionesConMejora(indicaciones: string | null | undefined, accion: string): string {
  const base = String(indicaciones || "").replace(BLOQUE_AUTO, "").trim();
  const mejora = String(accion || "").replace(/\s+/g, " ").trim().slice(0, 500);
  return `${base}${base ? "\n\n" : ""}## MEJORA CONTINUA AUTOMÁTICA\n- ${mejora}`.slice(0, 2000);
}

function objeto(valor: unknown): Record<string, any> {
  if (!valor) return {};
  if (typeof valor === "string") {
    try { const x = JSON.parse(valor); return x && typeof x === "object" ? x : {}; } catch { return {}; }
  }
  return typeof valor === "object" ? { ...(valor as Record<string, any>) } : {};
}

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
      const { motorDelTenant } = await import("./motor-nuevo/activacion");
      const motor = await motorDelTenant(tenantId);
      const meta = objeto(agent.metadata);
      const anterior = motor === "v2" ? String(meta.indicaciones || "") : String(agent.systemPrompt || "");
      const nuevo = indicacionesConMejora(anterior, lesson.accion);

      // Usa el mismo validador del constructor de agentes: una reflexión no
      // puede colar hechos comerciales en instrucciones libres.
      const { validarIndicaciones } = await import("./disenar-agente");
      const validacion = validarIndicaciones(nuevo);
      if (!validacion.ok) {
        logger.warn({ agentId: agent.id, errores: validacion.errores }, "[AutoReflexion] Mejora rechazada por el validador comercial");
        return false;
      }

      await autoTuneEngine.saveVersion({
        agentId: agent.id,
        previousPrompt: anterior,
        newPrompt: nuevo,
        diffSummary: `Auto-reflexión ${motor}: ${lesson.titulo}`,
        reason: lesson.leccion,
        appliedBy: motor === "v2" ? "auto-reflexion-v2" : "auto-reflexion",
        performanceBefore: { gravity: lesson.gravedad, motor },
      });

      if (motor === "v2") {
        meta.indicaciones = nuevo;
        await db.update(agents).set({ metadata: meta as any }).where(eq(agents.id, agent.id));
      } else {
        await db.update(agents).set({ systemPrompt: nuevo }).where(eq(agents.id, agent.id));
      }

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
      await cuandoLaBaseEsteLista();
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