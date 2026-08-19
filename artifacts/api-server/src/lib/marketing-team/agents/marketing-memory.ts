/**
 * MARKETING TEAM — MarketingMemoryAgent (MASTER PLAN §19)
 * 
 * Memoria específica del dominio de marketing. Reutiliza la infraestructura
 * existente architect_memory (architectMemoryService) con la convención de
 * tags `marketing:*`, `campaign:<id>`, `product:<id>`, `winner`/`loser`,
 * `experiment:<id>`, etc. Todo plan nuevo consulta esta memoria ANTES de
 * crear (regla del MASTER PLAN §19).
 */

import { architectMemoryService } from "../../architect-memory-service";
import type { Learning } from "../types";

export async function saveLearning(
  tenantId: number,
  learning: Learning,
): Promise<void> {
  await architectMemoryService.recordLearning(
    tenantId,
    "marketing_learning",
    learning.winner
      ? `Ganador: ${learning.winner}`
      : learning.loser
        ? `Perdedor: ${learning.loser}`
        : `Aprendizaje: ${learning.product ?? "general"}`,
    learning.content,
    [
      "marketing",
      ...(learning.product ? [`product:${learning.product}`] : []),
      ...(learning.winner ? ["winner"] : []),
      ...(learning.loser ? ["loser"] : []),
      ...learning.tags,
    ],
    {
      product: learning.product ?? null,
      productId: learning.productId ?? null,
      winner: learning.winner ?? null,
      loser: learning.loser ?? null,
      format: learning.format ?? null,
      audience: learning.audience ?? null,
      metric: learning.metric ?? null,
      value: learning.value ?? null,
    },
  );
}

type MemoryRow = { title: string; content: string; tags: string[]; metadata: Record<string, any> | null; createdAt: Date };

function toMemoryRow(m: any): MemoryRow {
  return {
    title: m.title,
    content: m.content,
    tags: m.tags ?? [],
    metadata: m.metadata ?? null,
    createdAt: m.createdAt,
  };
}

/** Aprendizajes previos relevantes para un producto (el plan los consulta antes). */
export async function getLearningsForProduct(
  tenantId: number,
  productName?: string,
  limit = 10,
): Promise<MemoryRow[]> {
  const memories = await architectMemoryService.retrieveRelevantMemories(
    tenantId,
    productName ?? "marketing",
    limit,
  );
  return memories
    .filter((m: any) => m.tags?.includes("marketing") || m.memoryType === "marketing_learning")
    .map(toMemoryRow);
}

/** Aprendizajes ganadores/perdedores para el reporte del dashboard. */
export async function listLearnings(
  tenantId: number,
  limit = 50,
): Promise<MemoryRow[]> {
  const all = await architectMemoryService.retrieveRelevantMemories(tenantId, "", limit * 3);
  return all
    .filter((m: any) => m.tags?.includes("marketing") || m.memoryType === "marketing_learning")
    .slice(0, limit)
    .map(toMemoryRow);
}
