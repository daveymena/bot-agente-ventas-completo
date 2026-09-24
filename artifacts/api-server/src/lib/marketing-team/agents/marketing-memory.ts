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
  const esDeMarketing = (m: any) => m.tags?.includes("marketing") || m.memoryType === "marketing_learning";
  const vistos = new Set<number | string>();
  const out: MemoryRow[] = [];
  const agregar = (m: any) => {
    const k = (m?.id ?? `${m?.title}|${m?.createdAt}`) as any;
    if (vistos.has(k)) return;
    vistos.add(k);
    out.push(toMemoryRow(m));
  };

  // 1) Por nombre de producto (búsqueda LIKE sobre content, como antes).
  if (productName) {
    const porProducto = await architectMemoryService
      .retrieveRelevantMemories(tenantId, productName, limit)
      .catch(() => []);
    porProducto.filter(esDeMarketing).forEach(agregar);
  }

  // 2) Relleno con lo más reciente de marketing. Sin esto, un aprendizaje
  // guardado con el producto en los tags/metadata pero NO en el texto no se
  // encontraba nunca (auditoría 24-09: learnings siempre vacíos).
  if (out.length < limit) {
    const recientes = await architectMemoryService
      .retrieveRelevantMemories(tenantId, "marketing", limit * 3)
      .catch(() => []);
    recientes.filter(esDeMarketing).forEach(agregar);
  }

  // 3) Filtro final: si pidieron un producto, lo relevante primero.
  if (productName) {
    const clave = productName.toLowerCase();
    out.sort((a, b) => {
      const ra = String(a.title + " " + a.content).toLowerCase().includes(clave) ? 0 : 1;
      const rb = String(b.title + " " + b.content).toLowerCase().includes(clave) ? 0 : 1;
      return ra - rb;
    });
  }

  return out.slice(0, limit);
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
