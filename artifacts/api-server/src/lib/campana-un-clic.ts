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
  /**
   * Investigar el mercado ANTES de escribir el copy. Por defecto SÍ.
   *
   * Es la diferencia entre el botón y Atlas: sin investigación el copy sale de
   * los datos del producto y no de lo que funciona hoy. Medido el 2026-10-02:
   * el mismo `crear_anuncio` devolvía un copy distinto desde el panel que desde
   * el chat, porque el chat guardaba el resultado de la investigación.
   */
  conInvestigacion?: boolean;
}

export interface PasoDeCampana {
  paso: "investigacion" | "segmentacion" | "anuncio";
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
  /** Si el copy salió con investigación de mercado detrás. */
  investigado: boolean;
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

/**
 * La investigación de mercado, inyectable: en producción entra por la misma
 * puerta que usa Atlas (`investigacionRapida`) y se guarda como el
 * `research_result` que `crear_anuncio` lee para el ángulo.
 */
export type InvestigadorDeMercado = (producto: string) => Promise<{ ok: boolean; texto?: string; motivo?: string }>;

/**
 * Investigación REAL del nicho, por la puerta de Atlas.
 *
 * `investigacionRapida` devuelve el texto pero **no lo persiste**, y
 * `crear_anuncio` lee `research_result` de `architect_memory`. Por eso hacía
 * falta guardarlo: sin eso, el mismo `crear_anuncio` escribe un anuncio sin
 * investigación cuando lo dispara el panel (medido el 2026-10-02).
 *
 * Presupuesto acotado a 90 s: el request del panel no puede colgarse 3 minutos.
 * Si no llega, se sigue sin investigación y se dice — nunca se inventa.
 */
export async function investigacionDeProduccion(
  tenantId: number,
  producto: string,
): Promise<{ ok: boolean; texto?: string; motivo?: string }> {
  const { investigacionRapida, guardarInvestigacionDeMercado } = await import("./app-operator");
  const instruccion = `qué ángulos y ganchos funcionan hoy en anuncios de ${producto}`;
  const r = await investigacionRapida(
    { tenantId, sessionId: `panel-${tenantId}-${Date.now()}` },
    instruccion,
    90_000,
  );
  if (!r.ok) return { ok: false, motivo: r.motivo };
  const guardado = await guardarInvestigacionDeMercado(tenantId, instruccion, r.texto);
  if (!guardado.ok) return { ok: false, motivo: guardado.motivo };
  return { ok: true, texto: r.texto };
}

export const PASOS_DE_CAMPANA = ["investigacion", "segmentacion", "anuncio"] as const;

/**
 * Corre el flujo completo de "producto → campaña".
 *
 * El paso que importa es el anuncio: si ese falla, se corta ahí y se devuelve
 * el motivo tal cual (no se sigue con nada más, porque no habría sobre qué).
 */
export async function generarCampana(
  tenantId: number,
  op: OpcionesDeCampana,
  deps: { ejecutar?: EjecutorDeAccion; investigar?: InvestigadorDeMercado } = {},
): Promise<ResultadoCampana> {
  const ejecutar = deps.ejecutar ?? (executeAction as unknown as EjecutorDeAccion);
  const investigar = deps.investigar ?? ((producto: string) => investigacionDeProduccion(tenantId, producto));
  const ctx = { tenantId, objetivoDelAdmin: op.objetivo };
  const pasos: PasoDeCampana[] = [];
  const vacio = { pasos, productoId: null, draftId: null, copy: null, investigado: false };

  const producto = String(op.producto || "").trim();
  if (!producto) {
    return { ok: false, resumen: "Falta el producto: decime cuál querés anunciar.", ...vacio };
  }
  const presupuesto = Number(op.dailyBudget) || 0;
  if (!(presupuesto > 0)) {
    return { ok: false, resumen: "Falta el presupuesto diario. No lo invento: es tu plata.", ...vacio };
  }

  // ── 0. INVESTIGACIÓN DEL MERCADO ────────────────────────────────────────
  // Va PRIMERO y es la diferencia con "crear un anuncio por defecto": el copy
  // se escribe con el ángulo que está funcionando hoy, no solo con la ficha.
  // Si falla, el anuncio sale igual —pero se dice, no se disimula.
  let investigado = false;
  if (op.conInvestigacion !== false) {
    let detalle: string;
    try {
      const inv = await investigar(producto);
      investigado = inv.ok;
      detalle = inv.ok
        ? "Investigué el mercado: el copy va a salir del ángulo que está funcionando hoy, no solo de la ficha del producto."
        : `No pude investigar (${inv.motivo || "sin resultado"}). El anuncio sale igual, con los datos reales del producto.`;
    } catch (e: any) {
      detalle = `Falló la investigación (${e?.message || "error"}). El anuncio sale igual, con los datos reales del producto.`;
    }
    pasos.push({ paso: "investigacion", ok: investigado, detalle });
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
    return { ok: false, resumen: anuncio.summary, pasos, productoId, draftId, copy, investigado };
  }

  const conSegmentacion = pasos.some((p) => p.paso === "segmentacion" && p.ok);
  const resumen = [
    `✅ Anuncio listo para "${producto}"`,
    draftId ? `(borrador ${draftId})` : "",
    op.subirAMeta === true ? "y campaña creada en Meta EN PAUSA." : "— borrador guardado, sin tocar Meta todavía.",
    investigado
      ? "Copy escrito con investigación de mercado."
      : "⚠️ Sin investigación: el copy salió de la ficha del producto, no de lo que funciona hoy.",
    conSegmentacion ? " Incluye segmentación sugerida." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { ok: true, resumen, pasos, productoId, draftId, copy, investigado };
}
