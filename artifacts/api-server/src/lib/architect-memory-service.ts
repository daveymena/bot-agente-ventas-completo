/**
 * ============================================================
 * ARCHITECT MEMORY SERVICE
 * ============================================================
 * Sistema de memoria persistente del Architect IA
 * Aprende de cada interacción y mejora continuamente
 */

import { db, architectMemory } from "@workspace/db";
import { eq, and, desc, like } from "drizzle-orm";
import { logger } from "./logger";

export type MemoryType =
  | "fact"
  | "preference"
  | "decision"
  | "observation"
  | "instruction"
  | "reflection"
  | "marketing_learning";

export interface Memory {
  id: number;
  tenantId: number | null;
  sessionId: string;
  memoryType: MemoryType;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
  confidence?: number; // 0-100 % de certeza
  impact?: number; // 0-100 % de importancia
}

export class ArchitectMemoryService {
  /**
   * Guardar una lección aprendida
   */
  async recordLearning(
    tenantId: number,
    type: MemoryType,
    title: string,
    content: string,
    tags: string[] = [],
    metadata: Record<string, any> = {}
  ): Promise<Memory | null> {
    try {
      const [memory] = await db
        .insert(architectMemory)
        .values({
          tenantId,
          sessionId: `learning_${Date.now()}`,
          memoryType: type,
          title,
          content,
          tags,
          metadata: {
            ...metadata,
            confidence: metadata.confidence || 80,
            impact: metadata.impact || 60,
            source: metadata.source || "system",
          },
        })
        .returning();

      logger.info({ memoryId: memory.id, title, tags }, "📚 Learning recorded");
      return memory as Memory;
    } catch (error) {
      logger.error({ error }, "Failed to record learning");
      return null;
    }
  }

  /**
   * Registrar un éxito de venta
   */
  async recordSuccess(
    tenantId: number,
    conversationId: number,
    productName: string,
    strategy: string,
    result: Record<string, any>
  ): Promise<Memory | null> {
    return this.recordLearning(
      tenantId,
      "decision",
      `✅ Venta exitosa: ${productName}`,
      `Estrategia ${strategy} funcionó correctamente. ${JSON.stringify(result)}`,
      ["sales-success", "conversion", strategy.toLowerCase()],
      {
        conversationId,
        productName,
        strategy,
        revenue: result.revenue,
        confidence: 95, // Alta confianza en éxitos
        impact: 85,
      }
    );
  }

  /**
   * Registrar un fracaso y aprender de él
   */
  async recordFailure(
    tenantId: number,
    conversationId: number,
    reason: string,
    context: Record<string, any>
  ): Promise<Memory | null> {
    return this.recordLearning(
      tenantId,
      "observation",
      `❌ Fracaso de venta: ${reason}`,
      `Conversación ${conversationId} no resultó. Motivo: ${reason}. Contexto: ${JSON.stringify(context)}`,
      ["sales-failure", "lost-lead", reason.toLowerCase()],
      {
        conversationId,
        reason,
        context,
        confidence: 70,
        impact: 75,
      }
    );
  }

  /**
   * Recuperar memorias relevantes para una situación
   */
  async retrieveRelevantMemories(
    tenantId: number,
    query: string,
    limit: number = 5
  ): Promise<Memory[]> {
    try {
      const memories = await db
        .select()
        .from(architectMemory)
        .where(
          and(
            eq(architectMemory.tenantId, tenantId),
            like(architectMemory.content, `%${query}%`)
          )
        )
        .orderBy(desc(architectMemory.createdAt))
        .limit(limit);

      return memories as Memory[];
    } catch (error) {
      logger.error({ error, query }, "Failed to retrieve memories");
      return [];
    }
  }

  /**
   * Obtener lecciones de alto impacto
   */
  async getHighImpactLessons(tenantId: number, minImpact: number = 75): Promise<Memory[]> {
    try {
      const memories = await db
        .select()
        .from(architectMemory)
        .where(eq(architectMemory.tenantId, tenantId))
        .orderBy(desc(architectMemory.updatedAt))
        .limit(20);

      return memories
        .filter((m: any) => (m.metadata?.impact || 0) >= minImpact)
        .sort((a: any, b: any) => (b.metadata?.impact || 0) - (a.metadata?.impact || 0)) as Memory[];
    } catch (error) {
      logger.error({ error }, "Failed to get high impact lessons");
      return [];
    }
  }

  /**
   * Aplicar lecciones a una nueva situación
   */
  async applyLearnings(tenantId: number, situation: string): Promise<{
    relevantLessons: Memory[];
    recommendation: string;
    confidence: number;
  }> {
    const lessons = await this.retrieveRelevantMemories(tenantId, situation, 10);

    if (lessons.length === 0) {
      return {
        relevantLessons: [],
        recommendation: "No se encontraron lecciones previas. Proceder con estrategia estándar.",
        confidence: 40,
      };
    }

    // Calcular confianza basada en lecciones similares
    const avgConfidence = lessons.reduce((sum, l) => sum + (l.metadata?.confidence || 0), 0) / lessons.length;
    const successCount = lessons.filter((l) => l.memoryType === "decision").length;
    const successRate = (successCount / lessons.length) * 100;

    return {
      relevantLessons: lessons.slice(0, 5),
      recommendation: `Basado en ${lessons.length} lecciones previas (${successRate.toFixed(0)}% éxito), se recomienda...`,
      confidence: Math.min(avgConfidence, 95),
    };
  }

  /**
   * Analizar patrones en memorias
   */
  async analyzePatterns(tenantId: number): Promise<Record<string, any>> {
    try {
      const memories = await db.select().from(architectMemory).where(eq(architectMemory.tenantId, tenantId));

      const patterns = {
        totalMemories: memories.length,
        byType: {} as Record<string, number>,
        successRate: 0,
        avgConfidence: 0,
        topTags: [] as string[],
        recentTrends: [] as string[],
      };

      // Contar por tipo
      memories.forEach((m: any) => {
        patterns.byType[m.memoryType] = (patterns.byType[m.memoryType] || 0) + 1;
      });

      // Calcular tasa de éxito
      const decisions = memories.filter((m: any) => m.memoryType === "decision");
      const successes = decisions.filter((d: any) => d.title.includes("✅"));
      patterns.successRate = decisions.length > 0 ? (successes.length / decisions.length) * 100 : 0;

      // Promedio de confianza
      patterns.avgConfidence =
        memories.reduce((sum: any, m: any) => sum + (m.metadata?.confidence || 0), 0) / memories.length || 0;

      // Tags más frecuentes
      const tagCounts = new Map<string, number>();
      memories.forEach((m: any) => {
        m.tags?.forEach((tag: any) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      });
      patterns.topTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);

      return patterns;
    } catch (error) {
      logger.error({ error }, "Failed to analyze patterns");
      return {};
    }
  }

  /**
   * Limpiar memorias antiguas o de baja confianza
   */
  async cleanupMemories(tenantId: number, daysOld: number = 90, minConfidence: number = 20): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Obtener memorias a eliminar
      const toDelete = await db
        .select()
        .from(architectMemory)
        .where(
          and(
            eq(architectMemory.tenantId, tenantId),
            like(architectMemory.createdAt, cutoffDate.toISOString().split("T")[0] + "%")
          )
        );

      // Filtrar por confianza baja
      const lowConfidenceIds = toDelete
        .filter((m: any) => (m.metadata?.confidence || 100) < minConfidence)
        .map((m: any) => m.id);

      if (lowConfidenceIds.length === 0) return 0;

      // Eliminar
      const result = await db
        .delete(architectMemory)
        .where(and(eq(architectMemory.tenantId, tenantId), like(architectMemory.createdAt, cutoffDate.toISOString())));

      logger.info(
        { count: lowConfidenceIds.length, tenantId },
        "🗑️ Cleaned up low-confidence memories"
      );
      return lowConfidenceIds.length;
    } catch (error) {
      logger.error({ error }, "Failed to cleanup memories");
      return 0;
    }
  }
}

export const architectMemoryService = new ArchitectMemoryService();
