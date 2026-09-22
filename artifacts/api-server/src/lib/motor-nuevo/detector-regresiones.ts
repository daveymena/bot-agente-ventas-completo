/**
 * FASE 12 — DETECTOR DE REGRESIONES V1 vs V2
 * ==========================================
 *
 * Compara el mismo turno por los dos motores y clasifica la diferencia.
 * Las etiquetas son clasificación TÉCNICA de comportamiento, no un ganador
 * global: toda regresión debe investigarse.
 *
 * Entrada por turno: lo que ya devuelven `/api/whatsapp/sombra` y
 * `correrEnSombra` (texto, tarjetas, intención, producto, tools, estado,
 * siguiente acción) + hallazgos del evaluador por motor.
 */

export type ClaseDiferencia = "SAFE" | "BETTER" | "REGRESSION" | "UNCERTAIN";

export interface TurnoComparado {
  mensaje: string;
  textoV1: string;
  textoV2: string;
  tarjetasV1: Array<{ productId: number; seccion: string | null }>;
  tarjetasV2: Array<{ productId: number; seccion: string | null }>;
  intencionV1?: string | null;
  intencionV2?: string | null;
  productoV1?: number | null;
  productoV2?: number | null;
  toolCallsV1?: string[];
  toolCallsV2?: string[];
  nextActionV1?: string | null;
  nextActionV2?: string | null;
}

export interface FilaReporte {
  conversationId: number | string;
  turn: number;
  intencionV1: string | null;
  intencionV2: string | null;
  productoV1: number | null;
  productoV2: number | null;
  toolCallsV1: string[];
  toolCallsV2: string[];
  stateV2: unknown;
  nextActionV2: string | null;
  hallazgosV1: number;
  hallazgosV2: number;
  clase: ClaseDiferencia;
  motivo: string;
}

function tarjetasIguales(
  a: TurnoComparado["tarjetasV1"],
  b: TurnoComparado["tarjetasV2"],
): boolean {
  const k = (t: { productId: number; seccion: string | null }) => `${t.productId}:${t.seccion}`;
  const sa = [...a].map(k).sort().join("|");
  const sb = [...b].map(k).sort().join("|");
  return sa === sb;
}

/**
 * Clasifica UN turno. Reglas deterministas, sin modelo:
 * - V2 con hallazgos nuevos que V1 no tenía → REGRESSION.
 * - V2 limpia hallazgos que V1 tenía → BETTER.
 * - Ambos limpios y mismas tarjetas/producto → SAFE.
 * - Ambos con hallazgos, o divergencia de producto/tools sin hallazgos → UNCERTAIN.
 */
export function clasificarTurno(
  t: TurnoComparado,
  hallazgosV1: number,
  hallazgosV2: number,
): { clase: ClaseDiferencia; motivo: string } {
  if (hallazgosV2 > hallazgosV1) {
    return { clase: "REGRESSION", motivo: `V2 suma ${hallazgosV2 - hallazgosV1} hallazgo(s) que V1 no tenía` };
  }
  if (hallazgosV1 > hallazgosV2) {
    return { clase: "BETTER", motivo: `V2 limpia ${hallazgosV1 - hallazgosV2} hallazgo(s) de V1` };
  }
  if (hallazgosV1 > 0) {
    return { clase: "UNCERTAIN", motivo: "ambos motores tienen hallazgos: revisar a mano" };
  }
  const mismoProducto = (t.productoV1 ?? null) === (t.productoV2 ?? null);
  const mismasTarjetas = tarjetasIguales(t.tarjetasV1, t.tarjetasV2);
  if (mismoProducto && mismasTarjetas) {
    return { clase: "SAFE", motivo: "sin hallazgos y mismo producto/tarjetas" };
  }
  return {
    clase: "UNCERTAIN",
    motivo: `sin hallazgos pero divergen (producto ${t.productoV1 ?? "—"}→${t.productoV2 ?? "—"}, tarjetas ${t.tarjetasV1.length}→${t.tarjetasV2.length})`,
  };
}

export function compararConversacion(params: {
  conversationId: number | string;
  turnos: TurnoComparado[];
  hallazgosV1PorTurno: Map<number, number> | Record<number, number>;
  hallazgosV2PorTurno: Map<number, number> | Record<number, number>;
  estadosV2?: unknown[];
}): { filas: FilaReporte[]; resumen: Record<ClaseDiferencia, number> } {
  const n1 = (turn: number) =>
    params.hallazgosV1PorTurno instanceof Map
      ? params.hallazgosV1PorTurno.get(turn) ?? 0
      : (params.hallazgosV1PorTurno as Record<number, number>)[turn] ?? 0;
  const n2 = (turn: number) =>
    params.hallazgosV2PorTurno instanceof Map
      ? params.hallazgosV2PorTurno.get(turn) ?? 0
      : (params.hallazgosV2PorTurno as Record<number, number>)[turn] ?? 0;

  const filas = params.turnos.map((t, i) => {
    const turn = i + 1;
    const h1 = n1(turn);
    const h2 = n2(turn);
    const { clase, motivo } = clasificarTurno(t, h1, h2);
    return {
      conversationId: params.conversationId,
      turn,
      intencionV1: t.intencionV1 ?? null,
      intencionV2: t.intencionV2 ?? null,
      productoV1: t.productoV1 ?? null,
      productoV2: t.productoV2 ?? null,
      toolCallsV1: t.toolCallsV1 ?? [],
      toolCallsV2: t.toolCallsV2 ?? [],
      stateV2: params.estadosV2?.[i] ?? null,
      nextActionV2: t.nextActionV2 ?? null,
      hallazgosV1: h1,
      hallazgosV2: h2,
      clase,
      motivo,
    } satisfies FilaReporte;
  });

  const resumen: Record<ClaseDiferencia, number> = { SAFE: 0, BETTER: 0, REGRESSION: 0, UNCERTAIN: 0 };
  for (const f of filas) resumen[f.clase] += 1;
  return { filas, resumen };
}
