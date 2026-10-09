/**
 * MEJORA CONTINUA — el reentrenamiento REAL del vendedor (no el reseteo).
 *
 * Pedido del dueño (09-10-2026): "que reentrene". Hasta hoy había dos cosas
 * separadas: `conversation-learning` guarda lecciones de cada fallo en la
 * memoria del negocio, y `agente_reentrenar` BORRA todo y empieza de cero.
 * Faltaba el paso del medio: convertir lo aprendido en reglas permanentes.
 *
 * Ciclo:
 *   1. JUNTAR: lee las lecciones automáticas (tag `lesson`) del negocio.
 *   2. CONSOLIDAR: la recomendación que se repite ≥ UMBRAL (3 veces) se
 *      promueve a indicación permanente con `corregirForma` (valida, no
 *      duplica y regenera las fichas). El dueño siempre manda: si ya existe
 *      una indicación parecida, no se duplica.
 *   3. PODAR: se borran las lecciones ya consolidadas y las de más de 30
 *      días (eran las que degradaban el prompt, ver `reentrenar-agente`).
 *   4. REPORTAR: qué regla nueva quedó y qué se podó, para avisar al dueño.
 *
 * Dos modos: `planDeMejora` (lectura pura, lo que muestra `mejora_ver`) y
 * `aplicarMejora` (aplica y poda, lo que ejecuta `mejora_aplicar`).
 * Nunca toca conversaciones, clientes ni lo que el dueño cargó a mano.
 */
import { and, eq } from "drizzle-orm";
import { db, architectMemory } from "@workspace/db";
import { logger } from "./logger";

/** Veces que debe repetirse una recomendación para volverse regla. */
export const UMBRAL_PROMOCION = 3;
/** Días tras los cuales una lección no consolidada se poda. */
export const DIAS_PODA = 30;

export interface Leccion {
  id: number;
  outcome: string;
  recomendacion: string;
  creadaEn: Date | null;
}

export interface Promocion {
  recomendacion: string;
  veces: number;
  outcomes: string[];
}

export interface PlanMejora {
  promociones: Promocion[];
  podarIds: number[];
  lecciones: number;
  resumen: string;
}

/** "Evitar presión. Dejar el precio..." → "evitar presion dejar el precio" */
export function normalizarRecomendacion(t: string): string {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** La recomendación vive al final del contenido: "Recomendación: ...". */
export function recomendacionDe(contenido: string): string {
  const m = String(contenido || "").match(/recomendaci[oó]n:\s*([\s\S]+)/i);
  return (m?.[1] || "").trim().slice(0, 300);
}

function tagsDe(fila: any): string[] {
  try {
    const t = fila?.tags;
    if (Array.isArray(t)) return t.map(String);
    if (typeof t === "string") return (JSON.parse(t) as unknown[]).map(String);
    return [];
  } catch {
    return [];
  }
}

function fechaDe(fila: any): Date | null {
  const crudo = String(fila?.createdAt || "").trim();
  if (!crudo) return null;
  const d = new Date(crudo.includes("T") ? crudo : crudo.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

/** Todas las lecciones automáticas del negocio, con su recomendación. */
export async function leerLecciones(tenantId: number): Promise<Leccion[]> {
  const filas = await db
    .select({ id: architectMemory.id, title: architectMemory.title, content: architectMemory.content, tags: architectMemory.tags, createdAt: architectMemory.createdAt, metadata: architectMemory.metadata })
    .from(architectMemory)
    .where(eq(architectMemory.tenantId, tenantId))
    .limit(500);
  const lecciones: Leccion[] = [];
  for (const f of filas as any[]) {
    if (!tagsDe(f).includes("lesson")) continue;
    let outcome = "";
    try {
      outcome = String((f.metadata as any)?.outcome || tagsDe(f).find((t) => t.startsWith("outcome:"))?.slice(8) || "");
    } catch {
      outcome = "";
    }
    lecciones.push({ id: f.id, outcome, recomendacion: recomendacionDe(f.content), creadaEn: fechaDe(f) });
  }
  return lecciones;
}

/**
 * Qué se promueve y qué se poda. `indicaciones` son las reglas vigentes
 * (para no duplicar); `ahora` permite fijar el tiempo en tests.
 */
export function decidirMejora(lecciones: Leccion[], indicaciones: string[], ahora = new Date()): PlanMejora {
  const vigentes = new Set(indicaciones.map(normalizarRecomendacion).filter(Boolean));
  const porRecomendacion = new Map<string, { texto: string; veces: number; outcomes: Set<string>; ids: number[] }>();
  for (const l of lecciones) {
    const clave = normalizarRecomendacion(l.recomendacion);
    if (!clave) continue;
    let g = porRecomendacion.get(clave);
    if (!g) {
      g = { texto: l.recomendacion, veces: 0, outcomes: new Set(), ids: [] };
      porRecomendacion.set(clave, g);
    }
    g.veces += 1;
    if (l.outcome) g.outcomes.add(l.outcome);
    g.ids.push(l.id);
  }
  const promociones: Promocion[] = [];
  const consolidados = new Set<number>();
  for (const [clave, g] of porRecomendacion) {
    if (g.veces >= UMBRAL_PROMOCION && !vigentes.has(clave)) {
      promociones.push({ recomendacion: g.texto, veces: g.veces, outcomes: [...g.outcomes] });
      for (const id of g.ids) consolidados.add(id);
    }
  }
  const limite = ahora.getTime() - DIAS_PODA * 24 * 3600 * 1000;
  const podar = new Set<number>(consolidados);
  for (const l of lecciones) {
    if (l.creadaEn && l.creadaEn.getTime() < limite) podar.add(l.id);
  }
  const resumen = lecciones.length === 0
    ? "Sin lecciones pendientes: el vendedor no acumuló fallos desde la última mejora."
    : `${promociones.length} regla(s) nueva(s) por fallos repetidos (${promociones.map((p) => `${p.veces}×`).join(", ") || "—"}), ${podar.size} lección(es) a podar.`;
  return { promociones, podarIds: [...podar], lecciones: lecciones.length, resumen };
}

/** Lectura pura: qué haría la mejora sin tocar nada. */
export async function planDeMejora(tenantId: number): Promise<PlanMejora> {
  const lecciones = await leerLecciones(tenantId);
  let indicaciones: string[] = [];
  try {
    const { loQueSabeElVendedor } = await import("./correcciones-del-dueno");
    indicaciones = ((await loQueSabeElVendedor(tenantId)) as any)?.indicaciones || [];
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[MejoraContinua] no se leyeron indicaciones");
  }
  return decidirMejora(lecciones, indicaciones);
}

export interface ReporteMejora extends PlanMejora {
  aplicadas: string[];
  noAplicadas: string[];
  podadas: number;
}

/** Aplica el plan: promueve reglas con `corregirForma` y poda lecciones. */
export async function aplicarMejora(tenantId: number): Promise<ReporteMejora> {
  const plan = await planDeMejora(tenantId);
  const { corregirForma } = await import("./correcciones-del-dueno");
  const aplicadas: string[] = [];
  const noAplicadas: string[] = [];
  for (const p of plan.promociones) {
    try {
      const r = await corregirForma(tenantId, p.recomendacion);
      if (r.ok) aplicadas.push(p.recomendacion);
      else noAplicadas.push(`${p.recomendacion} (${r.mensaje})`);
    } catch (e: any) {
      noAplicadas.push(`${p.recomendacion} (${e?.message || "error"})`);
    }
  }
  let podadas = 0;
  try {
    for (const id of plan.podarIds) {
      await db.delete(architectMemory).where(and(eq(architectMemory.id, id), eq(architectMemory.tenantId, tenantId)));
      podadas += 1;
    }
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[MejoraContinua] no se pudo podar");
  }
  return { ...plan, aplicadas, noAplicadas, podadas };
}
