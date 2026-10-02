/**
 * CAMPAÑA EN UN CLIC
 * ==================
 *
 * Lo que Atlas hace conversando, acá se hace con un botón. NO reimplementa
 * nada: encadena las MISMAS herramientas del operador (`executeAction`) en el
 * orden que pide el plan de `LANDING_Y_ACTIVOS_AUTOMATIZACION.md`, y devuelve
 * cada paso con su resultado para que el panel lo muestre y el admin decida.
 *
 * Por qué existe (y no una copia del flujo):
 *
 *   · El "un clic" del lado Atlas es la herramienta `crear_anuncio`, que ya
 *     busca el producto, arma el brief con datos reales, escribe el copy con
 *     UNA llamada al modelo, lo valida, aplica el freno de margen de Dropi,
 *     evita campañas duplicadas y guarda el borrador (y sube a Meta en pausa
 *     si se lo piden). Duplicar eso sería tener dos verdades que se separan.
 *   · Lo único que faltaba era la puerta de ENTRADA: un camino que no pase por
 *     el chat. Eso es esto.
 *
 * Regla que hereda de todo el repo: ningún paso inventa datos. Si una
 * herramienta se niega (no encontró el producto, el producto pierde plata por
 * pedido, Meta rechaza), el paso queda marcado con su motivo y no se rellena
 * con nada.
 */

import { executeAction } from "./app-operator";

export type ObjetivoDeCampana = "ventas" | "trafico" | "mensajes" | "reconocimiento";

export interface OpcionesDeCampana {
  /** El nombre del producto, tal como lo dijo el admin. */
  producto: string;
  /** Presupuesto diario. Obligatorio: es plata del admin, no se inventa. */
  dailyBudget: number;
  /** Decide a DÓNDE va la gente y A QUIÉN le muestra Meta el anuncio. */
  objetivo?: ObjetivoDeCampana;
  destinoWeb?: "landing" | "tienda";
  /** Si es true, además crea la campaña en Meta EN PAUSA. Por defecto false. */
  subirAMeta?: boolean;
  /** Pedir la segmentación sugerida (solo lectura, no gasta ni toca Meta). */
  conSegmentacion?: boolean;
}

export interface PasoDeCampana {
  paso: "segmentacion" | "anuncio";
  ok: boolean;
  /** En palabras del negocio: esto se muestra en el panel. */
  detalle: string;
}

export interface ResultadoCampana {
  ok: boolean;
  /** Resumen en palabras del negocio, para mostrar tal cual. */
  resumen: string;
  pasos: PasoDeCampana[];
  productoId: number | null;
  draftId: number | null;
  copy: { headline?: string; primaryText?: string } | null;
}

/** Lo que devuelve una herramienta del operador. */
export interface ResultadoHerramienta {
  ok: boolean;
  summary: string;
  data?: any;
}

/**
 * El ejecutor se inyecta para poder probar el encadenado sin base de datos ni
 * red: en producción es `executeAction` y nada cambia.
 */
export type EjecutorDeAccion = (tool: string, args: any, ctx: any) => Promise<ResultadoHerramienta>;

export const PASOS_DE_CAMPANA = ["segmentacion", "anuncio"] as const;

/**
 * Corre el flujo completo de "producto → campaña".
 *
 * El paso que importa es el anuncio: si ese falla, se corta ahí y se devuelve
 * el motivo tal cual (no se sigue con nada más, porque no habría sobre qué).
 */
export async function generarCampana(
  tenantId: number,
  op: OpcionesDeCampana,
  deps: { ejecutar?: EjecutorDeAccion } = {},
): Promise<ResultadoCampana> {
  const ejecutar = deps.ejecutar ?? (executeAction as unknown as EjecutorDeAccion);
  const ctx = { tenantId, objetivoDelAdmin: op.objetivo };
  const pasos: PasoDeCampana[] = [];
  const vacio = { pasos, productoId: null, draftId: null, copy: null };

  const producto = String(op.producto || "").trim();
  if (!producto) {
    return { ok: false, resumen: "Falta el producto: decime cuál querés anunciar.", ...vacio };
  }
  const presupuesto = Number(op.dailyBudget) || 0;
  if (!(presupuesto > 0)) {
    return { ok: false, resumen: "Falta el presupuesto diario. No lo invento: es tu plata.", ...vacio };
  }

  // ── 1. Segmentación sugerida ────────────────────────────────────────────
  // Va PRIMERO y es solo lectura: si falla, el anuncio sale igual. Es una
  // sugerencia, no un requisito.
  if (op.conSegmentacion !== false) {
    const r = await ejecutar("fb_suggest_audience", { producto }, ctx);
    pasos.push({ paso: "segmentacion", ok: r.ok, detalle: r.summary });
  }

  // ── 2. El anuncio: producto + brief + copy + borrador ───────────────────
  const anuncio = await ejecutar(
    "crear_anuncio",
    {
      producto,
      dailyBudget: presupuesto,
      objetivo: op.objetivo,
      destinoWeb: op.destinoWeb,
      subirAMeta: op.subirAMeta === true,
    },
    ctx,
  );
  pasos.push({ paso: "anuncio", ok: anuncio.ok, detalle: anuncio.summary });

  const productoId = Number(anuncio.data?.productId) || null;
  const draftId = Number(anuncio.data?.draftId) || null;
  const copy = anuncio.data?.copy && typeof anuncio.data.copy === "object" ? anuncio.data.copy : null;

  // Si el anuncio no salió, no hay campaña sobre la que seguir.
  if (!anuncio.ok) {
    return { ok: false, resumen: anuncio.summary, pasos, productoId, draftId, copy };
  }

  const conSegmentacion = pasos.some((p) => p.paso === "segmentacion" && p.ok);
  const resumen = [
    `✅ Anuncio listo para "${producto}"`,
    draftId ? `(borrador ${draftId})` : "",
    op.subirAMeta === true ? "y campaña creada en Meta EN PAUSA." : "— borrador guardado, sin tocar Meta todavía.",
    conSegmentacion ? " Incluye segmentación sugerida." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { ok: true, resumen, pasos, productoId, draftId, copy };
}
