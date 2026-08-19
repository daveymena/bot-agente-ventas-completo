/**
 * MARKETING TEAM — ExperimentManager (MASTER PLAN §13)
 * 
 * Todo marketing profesional trabaja con hipótesis. Cada experimento registra
 * hipótesis, variable, control y variante, presupuesto, duración, resultado y
 * aprendizaje. NO se declara ganador con datos insuficientes: la conclusión
 * exige superar el mínimo de impresiones configurado.
 */

import { db, marketingExperiments, marketingTasks } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { writeAuditLog } from "../audit";
import { saveLearning } from "./marketing-memory";

export interface ExperimentDraft {
  tenantId: number;
  productId?: number | null;
  campaignId?: string | null;
  hypothesis: string;
  variable: string;
  controlLabel?: string | null;
  variantLabel?: string | null;
  controlDraftId?: number | null;
  variantDraftId?: number | null;
  budget?: number | null;
  durationDays?: number | null;
  minImpressions?: number;
}

/** Crea un experimento nuevo (EN_PRUEBA). */
export async function createExperiment(draft: ExperimentDraft) {
  const [row] = await db
    .insert(marketingExperiments)
    .values({
      tenantId: draft.tenantId,
      productId: draft.productId ?? null,
      campaignId: draft.campaignId ?? null,
      hypothesis: draft.hypothesis,
      variable: draft.variable,
      controlLabel: draft.controlLabel ?? null,
      variantLabel: draft.variantLabel ?? null,
      controlDraftId: draft.controlDraftId ?? null,
      variantDraftId: draft.variantDraftId ?? null,
      budget: draft.budget != null ? String(draft.budget) : null,
      durationDays: draft.durationDays ?? null,
      minImpressions: draft.minImpressions ?? 1000,
      status: "EN_PRUEBA",
      startedAt: new Date(),
    })
    .returning();

  await writeAuditLog({
    tenantId: draft.tenantId,
    agent: "ExperimentManager",
    action: "CREATE_EXPERIMENT",
    resource: `experiment:${row?.id}`,
    after: { hypothesis: draft.hypothesis, variable: draft.variable },
    approval: "admin",
    result: "SUCCESS",
  });
  return row;
}

/**
 * Concluye un experimento. Regla anti-fake: si las impresiones reportadas no
 * superan el mínimo, el resultado queda INCONCLUSO (no GANADOR/PERDEDOR).
 * Al concluir, registra el aprendizaje en la memoria de marketing.
 */
export async function concludeExperiment(
  tenantId: number,
  experimentId: number,
  report: {
    controlImpressions?: number;
    variantImpressions?: number;
    controlConversions?: number;
    variantConversions?: number;
    winner?: "control" | "variant" | null;
    conclusion?: string;
  },
): Promise<any> {
  const existing = (await db
    .select()
    .from(marketingExperiments)
    .where(and(eq(marketingExperiments.id, experimentId), eq(marketingExperiments.tenantId, tenantId)))
    .limit(1))[0];
  if (!existing) throw new Error("Experimento no encontrado");

  const min = existing.minImpressions ?? 1000;
  const impressions = Math.min(report.controlImpressions ?? 0, report.variantImpressions ?? 0);
  let status: string;
  let learning = report.conclusion ?? null;

  if (impressions < min) {
    status = "INCONCLUSO";
    learning = `Muestra insuficiente (${impressions} < ${min} impresiones): no se puede declarar ganador. Continuar o cancelar.`;
  } else {
    status = report.winner ? (report.winner === "control" ? "GANADOR" : "PERDEDOR") : "INCONCLUSO";
    if (status === "GANADOR" || status === "PERDEDOR") {
      await saveLearning(tenantId, {
        product: existing.campaignId ? `campaña ${existing.campaignId}` : undefined,
        winner: status === "GANADOR" ? (report.winner === "control" ? existing.controlLabel || "Control" : existing.variantLabel || "Variante") : undefined,
        loser: status === "PERDEDOR" ? (report.winner === "control" ? existing.controlLabel || "Control" : existing.variantLabel || "Variante") : undefined,
        tags: [`experiment:${existing.id}`, "experiment", existing.variable],
        content: `Experimento #${existing.id}: ${existing.hypothesis}. Resultado: ${status}. ${report.conclusion || ""}`,
      });
    }
  }

  const [updated] = await db
    .update(marketingExperiments)
    .set({
      status,
      result: {
        control: { impressions: report.controlImpressions ?? null, conversions: report.controlConversions ?? null },
        variant: { impressions: report.variantImpressions ?? null, conversions: report.variantConversions ?? null },
        winner: report.winner ?? null,
      },
      conclusion: learning,
      learning,
      endedAt: new Date(),
    })
    .where(eq(marketingExperiments.id, experimentId))
    .returning();

  await writeAuditLog({
    tenantId,
    agent: "ExperimentManager",
    action: "CONCLUDE_EXPERIMENT",
    resource: `experiment:${experimentId}`,
    after: { status, winner: report.winner ?? null },
    approval: "system",
    result: "SUCCESS",
  });
  return updated;
}

/** Crea la tarea de ejecución de un experimento en el motor de tareas. */
export async function scheduleExperiment(tenantId: number, experimentId: number, assignedAgent = "ExperimentManager") {
  const [task] = await db
    .insert(marketingTasks)
    .values({
      tenantId,
      assignedAgent,
      action: "run_experiment",
      input: { experimentId },
      risk: "MEDIUM",
      approvalRequired: false,
      status: "PENDING",
    })
    .returning();
  return task;
}
