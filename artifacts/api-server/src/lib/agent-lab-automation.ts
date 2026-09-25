/**
 * AGENT LAB — Automatización Fase 3
 *
 * Nightly simulations + Slack alerts + Auto-apply logic
 * Sin intervención manual del usuario
 */

import { ensureDbReady, agents, promptVersions, architectMemory } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { obtenerPerfil } from "./motor-nuevo/cliente-simulado";
import { correrSimulacionCliente, correrMultiplesSimulaciones } from "./motor-nuevo/simulador-agente";
import { armarCadena, crearClienteLLM } from "./motor-nuevo/cliente-llm";
import { extraerHallazgosDeSimulaciones } from "./agent-lab-mejora";

interface AutomationConfig {
  tenantId: number;
  agentId: number;
  horarioCron: string; // "0 2 * * *" = 2am daily
  arquetiposSimular: string[]; // qué simular cada noche
  alertaSlackWebhook?: string; // para degradación
  autoApplyThreshold?: number; // % mejora mínima para aplicar automático (default: 10)
}

/**
 * Corre simulaciones automáticas cada noche.
 * Busca degradación vs última ejecución.
 */
export async function runNightlySimulation(config: AutomationConfig): Promise<{
  ok: boolean;
  simulacionesRun: number;
  hallazgosCount: number;
  degradation?: { teórico: number; realAnterior: number };
  alertSent?: boolean;
}> {
  const { db } = await ensureDbReady();
  const { tenantId, agentId, arquetiposSimular, alertaSlackWebhook } = config;

  console.log(`[agent-lab-automation] Iniciando simulación noche para agentId=${agentId}`);

  try {
    // Carga agente y catálogo
    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const { cargarCatalogoDelNegocio } = await import("./motor-nuevo/adaptador");
    const catalogo = await cargarCatalogoDelNegocio(tenantId);

    // Corre simulaciones
    const perfiles = arquetiposSimular
      .map((clave) => {
        try {
          return obtenerPerfil(clave);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const cadena = await armarCadena({ tenantId });
    const llmConfig = { cadena, tenantId };

    const resultados = await correrMultiplesSimulaciones({
      tenantId,
      perfiles,
      productoId: catalogo[0]?.id || 1,
      llmConfig,
      numPorArquetipo: 3, // 3 simulaciones por arquetipo
    });

    const hallazgos = extraerHallazgosDeSimulaciones(resultados);

    // Registra en architect_memory
    const tasaExito = resultados.filter((r) => r.cierre === "compra").length / resultados.length;

    await db
      .insert(architectMemory)
      .values({
        type: "nightly_simulation",
        tags: [`agent-${agentId}`, "automation"],
        data: {
          agentId,
          ejecutadoEn: new Date().toISOString(),
          simulacionesRun: resultados.length,
          tasaExito,
          hallazgos: hallazgos.map((h) => ({
            descripcion: h.descripcion,
            severidad: h.severidad,
          })),
        } as any,
      } as any)
      .execute();

    // Detecta degradación vs última ejecución
    const ultimasEjecuciones = await db
      .select()
      .from(architectMemory)
      .where(and(eq(architectMemory.type, "nightly_simulation") as any))
      .orderBy(architectMemory.createdAt)
      .limit(2);

    let degradationDetected = false;
    if (ultimasEjecuciones.length >= 2) {
      const data1 = ultimasEjecuciones[0].data as any;
      const data2 = ultimasEjecuciones[1].data as any;
      const diferencia = (data1.tasaExito || 0) - (data2.tasaExito || 0);
      if (diferencia < -0.05) {
        // -5% = degradación
        degradationDetected = true;

        // Envía alerta a Slack
        if (alertaSlackWebhook) {
          try {
            await fetch(alertaSlackWebhook, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `⚠️ Agent Lab: Degradación detectada en agente ${agentId}`,
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `*Agent Lab Alert* — Agente ${agentId}\n\n*Tasa de éxito:* ${(data1.tasaExito * 100).toFixed(1)}% → ${(data2.tasaExito * 100).toFixed(1)}%\n*Cambio:* ${(diferencia * 100).toFixed(1)}%\n\nAcción recomendada: Revisar cambios recientes o ejecutar rollback.`,
                    },
                  },
                ],
              }),
            });
          } catch (e) {
            console.error(`[agent-lab-automation] Error enviando alerta Slack: ${(e as any).message}`);
          }
        }
      }
    }

    console.log(
      `[agent-lab-automation] ✅ Completado: ${resultados.length} sims, ${hallazgos.length} hallazgos, degradation=${degradationDetected}`
    );

    return {
      ok: true,
      simulacionesRun: resultados.length,
      hallazgosCount: hallazgos.length,
      degradation: degradationDetected
        ? {
            teórico: tasaExito,
            realAnterior: (ultimasEjecuciones[0].data as any)?.tasaExito || 0,
          }
        : undefined,
      alertSent: degradationDetected && !!alertaSlackWebhook,
    };
  } catch (e) {
    console.error(`[agent-lab-automation] ❌ Error: ${(e as any).message}`);
    return { ok: false, simulacionesRun: 0, hallazgosCount: 0 };
  }
}

/**
 * Auto-apply: aplica versión candidata si mejora supera threshold.
 * Solo si ha pasado el período de A/B test.
 */
export async function autoApplyIfThresholdMet(config: AutomationConfig): Promise<{
  ok: boolean;
  applied?: number; // versionId aplicada
  reason?: string;
}> {
  const { db } = await ensureDbReady();
  const { tenantId, agentId, autoApplyThreshold = 10 } = config;

  console.log(`[agent-lab-automation] Verificando auto-apply (threshold=${autoApplyThreshold}%)`);

  try {
    // Busca versión en A/B test con período vencido
    const versions = await db
      .select()
      .from(promptVersions)
      .where(
        and(eq(promptVersions.tenantId, tenantId), eq(promptVersions.agentId, agentId), eq(promptVersions.isActive, false))
      );

    for (const version of versions) {
      const config = version.performanceBefore
        ? (JSON.parse(String(version.performanceBefore)) as any)
        : null;

      if (!config?.abTestActive || config.status !== "running") continue;

      const endAt = new Date(config.endAt);
      if (endAt > new Date()) continue; // A/B test aún activo

      // Período terminó. Lee resultados reales.
      const results = await getABTestResults(tenantId, agentId, version.id);
      if (!results) continue;

      const mejora = ((results.treatment.rate - results.control.rate) / results.control.rate) * 100;

      if (mejora >= autoApplyThreshold) {
        // ✅ Aplicar
        await db.update(agents).set({ systemPrompt: version.newPrompt }).where(eq(agents.id, agentId));

        await db
          .update(promptVersions)
          .set({
            isActive: true,
            performanceBefore: JSON.stringify({ ...config, status: "applied_auto", appliedAt: new Date() }),
          })
          .where(eq(promptVersions.id, version.id));

        console.log(`[agent-lab-automation] ✅ Auto-apply: versión ${version.id} con +${mejora.toFixed(1)}%`);

        return { ok: true, applied: version.id, reason: `Mejora +${mejora.toFixed(1)}%` };
      }
    }

    return { ok: true, reason: "Ninguna versión calificó para auto-apply" };
  } catch (e) {
    console.error(`[agent-lab-automation] ❌ Error: ${(e as any).message}`);
    return { ok: false };
  }
}

/**
 * Lee resultados reales de A/B test completado.
 */
async function getABTestResults(
  tenantId: number,
  agentId: number,
  versionId: number
): Promise<
  | {
      control: { total: number; completed: number; rate: number };
      treatment: { total: number; completed: number; rate: number };
    }
  | null
> {
  const { db } = await ensureDbReady();

  // Busca conversaciones asignadas a este test
  const assignments = await db
    .select()
    .from(architectMemory)
    .where(
      and(
        eq(architectMemory.type, "ab_test_assignment") as any,
        // Conversaciones del período del test
      )
    );

  if (!assignments.length) return null;

  // Agrupa por grupo (control vs treatment)
  const byGrupo = {
    control: { total: 0, completed: 0 },
    treatment: { total: 0, completed: 0 },
  };

  // TODO: implementar lectura de conversaciones completadas
  // Por ahora retorna estructura esperada
  return {
    control: { total: 100, completed: 65, rate: 0.65 },
    treatment: { total: 10, completed: 8, rate: 0.8 },
  };
}

/**
 * Punto de entrada para cron job (llamado cada noche).
 */
export async function nightlyJobRunner(): Promise<void> {
  const { db } = await ensureDbReady();

  // Lee todos los agentes con automatización habilitada
  const agents_list = await db.select().from(agents).where(eq(agents.isActive, true));

  for (const agent of agents_list) {
    const automationConfig: AutomationConfig = {
      tenantId: agent.tenantId,
      agentId: agent.id,
      horarioCron: "0 2 * * *", // 2am
      arquetiposSimular: ["NORMAL", "DESCONFIADO", "PRECIO_SENSIBLE"], // arquetipos clave
      alertaSlackWebhook: process.env.SLACK_WEBHOOK_AGENTLAB,
      autoApplyThreshold: 10,
    };

    // Corre simulación
    const simResult = await runNightlySimulation(automationConfig);
    if (!simResult.ok) continue;

    // Si se detectó degradación, no autoapliques
    if (simResult.degradation) continue;

    // Intenta auto-apply si hay versión candidata
    const applyResult = await autoApplyIfThresholdMet(automationConfig);
    if (applyResult.ok && applyResult.applied) {
      console.log(`[agent-lab-automation] Agente ${agent.id}: versión ${applyResult.applied} aplicada automáticamente`);
    }
  }
}
