/**
 * ============================================================
 * DE QUÉ PRODUCTO ESTAMOS HABLANDO
 * ============================================================
 *
 * La conversación real del 2026-09-02, curso de piano:
 *
 *   cliente: "Tienes disponible el curso de piano"
 *   bot:     [ficha del piano]  [video]  "¿Qué te pareció?"
 *   cliente: "Exelente"
 *   bot:     "Necesito nombre completo, ciudad, departamento,
 *             DIRECCIÓN, celular y CÉDULA"
 *
 * Cinco mensajes hablando del piano, y en el sexto el sistema se olvidó de qué
 * producto era. "Exelente" no nombra nada, así que el producto quedó en null y
 * la decisión se cayó a la etiqueta del vendedor -- un agente de dropshipping
 * -- que pidió datos de envío para un curso que llega por Google Drive.
 *
 * ── Por qué es la pieza que faltaba ──────────────────────────────────────
 *
 * Cada rama del agente rearmaba la cadena a mano:
 *
 *   decision.productoDelMensaje?.id ?? decision.productToShow?.id ?? memory.currentProductId
 *
 * Y ahí termina. Si las tres vienen vacías, el producto se perdió -- aunque la
 * ficha se haya mandado hace dos mensajes y esté en el historial. Cada copia de
 * la cadena podía quedar distinta de las otras, y quedaron distintas: el
 * candado de precios usa una, el bloque de envíos otra.
 *
 * La mayoría de los mensajes de una venta NO nombran el producto: "sí", "cuánto
 * vale", "excelente", "cómo pago", "y cuánto se demora". Si el producto solo se
 * conoce cuando lo nombran, se pierde justo en la mitad de la conversación,
 * que es donde se cierra la venta.
 *
 * Acá vive una sola respuesta a esa pregunta, y mira también lo que YA SE
 * ENVIÓ. Una ficha mandada es la prueba más fuerte de qué se está hablando:
 * la eligió el servidor, no el modelo.
 */

export interface ProductoMinimo {
  id: number;
  name?: string | null;
  [k: string]: any;
}

export interface EntradaFoco {
  /** El producto que el cliente nombró en ESTE mensaje. */
  delMensaje?: ProductoMinimo | null;
  /** El que el sistema decidió mostrar en este turno. */
  aMostrar?: ProductoMinimo | null;
  /** El que la conversación tenía marcado como activo. */
  idActivo?: number | null;
  /** El historial, para encontrar la última ficha enviada. */
  historial?: Array<{ role: string; metadata?: any }> | null;
  /** El catálogo de este negocio, para resolver un id a producto. */
  catalogo?: ProductoMinimo[] | null;
}

/** El id de la última ficha que el servidor mandó de verdad. */
export function ultimaFichaEnviada(historial: EntradaFoco["historial"]): number | null {
  if (!historial || historial.length === 0) return null;
  for (let i = historial.length - 1; i >= 0; i--) {
    const m = historial[i];
    if (m?.role !== "agent" && m?.role !== "assistant") continue;
    const id = Number(m?.metadata?.productId);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

/**
 * De qué producto habla esta conversación, ahora.
 *
 * En orden de fuerza: lo que el cliente acaba de nombrar gana sobre lo que
 * había antes -- si cambia de producto, se le sigue. Y lo último es la ficha
 * enviada, que es el rastro que deja el servidor cuando el modelo ya no
 * nombra nada.
 */
export function productoEnFoco(e: EntradaFoco): ProductoMinimo | null {
  const catalogo = e.catalogo || [];
  const porId = (id: number | null | undefined): ProductoMinimo | null => {
    if (!Number.isFinite(Number(id))) return null;
    return catalogo.find((p) => p.id === Number(id)) || null;
  };

  if (e.delMensaje?.id) return porId(e.delMensaje.id) || e.delMensaje;
  if (e.aMostrar?.id) return porId(e.aMostrar.id) || e.aMostrar;

  const activo = porId(e.idActivo ?? null);
  if (activo) return activo;

  return porId(ultimaFichaEnviada(e.historial));
}
