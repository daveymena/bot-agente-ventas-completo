/**
 * A/B TEST ROUTING — Fase 2 Real
 *
 * Lógica para segmentar tráfico entre versión control y tratamiento.
 * Usa conversation.id % 100 para determinismo.
 */

import { ensureDbReady, promptVersions, architectMemory } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export interface ABTestConfig {
  versionId: number;
  trafficPercent: number;
  startedAt: Date;
  endAt: Date;
  status: "running" | "paused" | "completed";
}

/**
 * Lee si hay A/B test activo para este tenant + agente.
 * Retorna null si no hay ninguno, o la configuración si hay.
 */
export async function getActiveABTestConfig({
  tenantId,
  agentId,
}: {
  tenantId: number;
  agentId: number;
}): Promise<ABTestConfig | null> {
  const { db } = await ensureDbReady();

  const active = await db
    .select()
    .from(promptVersions)
    .where(
      and(
        eq(promptVersions.tenantId, tenantId),
        eq(promptVersions.agentId, agentId),
        eq(promptVersions.isActive, false) // Versión candidata, no aplicada
      )
    )
    .orderBy(promptVersions.createdAt);

  for (const version of active) {
    const config = version.performanceBefore
      ? (JSON.parse(String(version.performanceBefore)) as any)
      : null;

    if (
      config &&
      config.abTestActive &&
      config.status === "running" &&
      new Date() < new Date(config.endAt)
    ) {
      return {
        versionId: version.id,
        trafficPercent: config.trafficPercent,
        startedAt: new Date(config.startedAt),
        endAt: new Date(config.endAt),
        status: "running",
      };
    }
  }

  return null;
}

/**
 * Determina si una conversación debe usar la versión candidata (tratamiento)
 * o la versión actual (control).
 *
 * Usa conversationId % 100 para asignación determinística.
 */
export function asignarGrupoABTest(
  conversationId: number | string,
  trafficPercent: number
): "treatment" | "control" {
  const id = typeof conversationId === "string" ? parseInt(conversationId) : conversationId;
  const hash = Math.abs(id % 100);

  return hash < trafficPercent ? "treatment" : "control";
}

/**
 * Registra la asignación A/B test en architect_memory.
 * Usada para auditoría y cálculo de métricas posteriores.
 */
export async function logABTestAssignment({
  conversationId,
  versionId,
  grupo,
}: {
  conversationId: number;
  versionId: number | null; // null = control
  grupo: "treatment" | "control";
}): Promise<void> {
  const { db } = await ensureDbReady();

  try {
    await db
      .insert(architectMemory)
      .values({
        type: "ab_test_assignment",
        conversationId: String(conversationId),
        tags: versionId ? [`ab-test-v${versionId}`, grupo] : [grupo],
        data: {
          conversationId,
          versionId,
          grupo,
          asignadoEn: new Date().toISOString(),
        } as any,
      } as any)
      .execute();
  } catch (e) {
    // No fallar la conversación por logging
    console.error(`[ab-test-routing] Error logging assignment: ${(e as any).message}`);
  }
}

/**
 * Lee la versión candidata (para override del prompt).
 */
export async function getVersionCandidata(versionId: number): Promise<string | null> {
  const { db } = await ensureDbReady();

  const [version] = await db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.id, versionId));

  return version?.newPrompt ?? null;
}
