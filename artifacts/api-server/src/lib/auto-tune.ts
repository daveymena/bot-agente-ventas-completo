import { db, promptVersions, agents as agentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";
import type { PromptVersion, InsertPromptVersion } from "@workspace/db";
import { responseAnalyticsEngine } from "./response-analytics";
import { architectMemory } from "@workspace/db";
import { personalityEngine } from "./personality-engine";

export class AutoTuneEngine {
  async saveVersion(data: InsertPromptVersion): Promise<PromptVersion> {
    const [version] = await db
      .insert(promptVersions)
      .values({
        ...data,
        performanceBefore: data.performanceBefore || null,
        performanceAfter: data.performanceAfter || null,
        isActive: data.isActive ?? true,
      })
      .returning();
    logger.info({ versionId: version.id, agentId: data.agentId }, "[AutoTune] Version saved");
    return version;
  }

  async getVersionHistory(agentId?: number, limit = 20) {
    let query = db
      .select()
      .from(promptVersions)
      .orderBy(desc(promptVersions.createdAt))
      .limit(limit);

    if (agentId) {
      query = query.where(eq(promptVersions.agentId, agentId)) as any;
    }

    return query;
  }

  /** Lee una versión sin aplicarla -- se usa para validar de quién es antes
   * de dejar que alguien la restaure (ver la ruta de rollback). */
  async getVersion(versionId: number) {
    const [version] = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, versionId))
      .limit(1);
    return version || null;
  }

  async rollbackToVersion(versionId: number) {
    const [version] = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, versionId))
      .limit(1);

    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    if (version.agentId) {
      if (version.appliedBy === "auto-reflexion-v2") {
        const [agente] = await db.select({ metadata: agentsTable.metadata })
          .from(agentsTable).where(eq(agentsTable.id, version.agentId as number)).limit(1);
        let metadata: Record<string, any> = {};
        if (typeof agente?.metadata === "string") {
          try { metadata = JSON.parse(agente.metadata) || {}; } catch { metadata = {}; }
        } else if (agente?.metadata && typeof agente.metadata === "object") metadata = { ...(agente.metadata as any) };
        metadata.indicaciones = version.previousPrompt as string;
        await db.update(agentsTable).set({ metadata: metadata as any }).where(eq(agentsTable.id, version.agentId as number));
      } else {
        await db
          .update(agentsTable)
          .set({ systemPrompt: version.previousPrompt as string })
          .where(eq(agentsTable.id, version.agentId as number));
      }
    }

    if (version.profileId) {
      await personalityEngine.updateProfile(version.profileId as number, {
        systemPromptCore: version.previousPrompt as string,
      } as any);
    }

    logger.info({ versionId, agentId: version.agentId }, "[AutoTune] Rolled back");
    return { ok: true, message: "Rolled back successfully" };
  }

  async deactivateVersion(versionId: number) {
    await db
      .update(promptVersions)
      .set({ isActive: false })
      .where(eq(promptVersions.id, versionId));
  }

  async generateTuneSuggestion(agentId: number, performanceData: Record<string, any>) {
    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, agentId))
      .limit(1);

    if (!agent) return null;

    const currentPrompt = agent.systemPrompt as string;
    const conversionRate = performanceData.conversionRate || 0;
    const confusionRate = performanceData.confusionRate || 0;

    let suggestion = "";
    if (conversionRate < 10) {
      suggestion = "La tasa de conversion es baja. Enfatizar llamado a la accion, agregar urgencia y destacar garantia.";
    }
    if (confusionRate > 20) {
      suggestion = "Alto indice de confusion. Simplificar explicaciones, usar ejemplos concretos, reducir opciones.";
    }

    if (!suggestion) {
      suggestion = "Rendimiento estable. Mantener tono y enfoque actual.";
    }

    const diffSummary = `Ajuste automatico por rendimiento: conversion=${conversionRate}%, confusion=${confusionRate}%`;

    return {
      agentId,
      previousPrompt: currentPrompt,
      newPrompt: `${currentPrompt}\n\n## MEJORA CONTINUA\n${suggestion}`,
      diffSummary,
      reason: suggestion,
      performanceBefore: performanceData,
      appliedBy: "auto-tune",
    };
  }

  async applyAutoTune(agentId: number, tenantId: number) {
    try {
      // tenantId ahora es obligatorio y va primero: estas consultas se
      // filtran por negocio (antes miraban las métricas de TODOS los tenants).
      const performance = await responseAnalyticsEngine.getConversionRate(tenantId, agentId, 30);
      const stats = await responseAnalyticsEngine.getStats(tenantId, agentId, 30);

      const performanceData = {
        ...performance,
        confusionRate: stats.total > 0 ? Math.round((Number(stats.confused || 0) / Number(stats.total)) * 100) : 0,
      };

      const suggestion = await this.generateTuneSuggestion(agentId, performanceData);
      if (!suggestion) return null;

      if (Number(stats.total) < 10) {
        logger.info({ agentId, total: stats.total }, "[AutoTune] Not enough data, skipping");
        return null;
      }

      const version = await this.saveVersion(suggestion);

      await db
        .update(agentsTable)
        .set({ systemPrompt: suggestion.newPrompt })
        .where(eq(agentsTable.id, agentId));

      if (tenantId) {
        await db.insert(architectMemory).values({
          tenantId,
          sessionId: "auto-tune",
          memoryType: "reflection",
          title: `Auto-tune aplicado al agente ${agentId}`,
          content: suggestion.reason,
          tags: ["auto-tune", "prompt", "mejora"],
          metadata: { versionId: version.id, agentId, performanceBefore: performanceData },
        } as any);
      }

      logger.info({ agentId, versionId: version.id }, "[AutoTune] Auto-tune applied");
      return { version, suggestion: suggestion.reason };
    } catch (e) {
      logger.error({ agentId, error: e }, "[AutoTune] Failed");
      return null;
    }
  }
}

export const autoTuneEngine = new AutoTuneEngine();
