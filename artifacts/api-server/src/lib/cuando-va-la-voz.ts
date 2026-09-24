/**
 * ============================================================
 * ¿ESTE TURNO VA POR VOZ O POR TEXTO?
 * ============================================================
 *
 * Pedido del dueño (2026-09-24): "si va a enviar audio, no lo envíe con texto:
 * o manda texto o manda audio". Y después lo precisó:
 *
 *   · una FICHA (producto, precio, pago, entrega) va con TEXTO + IMAGEN como
 *     siempre, porque es información que el cliente necesita tener a mano;
 *   · un RAZONAMIENTO que responde una duda puede ir "en ocasiones en audio y
 *     otras en texto, estilo humano".
 *
 * Antes se mandaban LOS DOS: el texto y, acto seguido, una nota de voz que leía
 * ese mismo texto. El cliente recibía lo mismo dos veces, una para leer y otra
 * para escuchar. Eso es lo que este módulo viene a cortar.
 *
 * ── Cómo se decide ───────────────────────────────────────────────────────
 *
 *  1. Si el turno trae una ficha (una tarjeta de producto): NUNCA voz. Va
 *     texto + imagen, que es lo programado, y la voz calla.
 *  2. Si el turno es solo razonamiento (solo texto), puede ir por voz. Pero no
 *     cualquier cosa: un "sí", un "dale" o un "en un momento" no se habla --
 *     tiene que ser una explicación de cierto largo para que valga escucharla.
 *  3. Y entre esos, VARÍA: no todas las explicaciones van habladas. Una
 *     probabilidad decide, para que la conversación no suene robótica (siempre
 *     voz) ni de formulario (siempre texto).
 *
 * La probabilidad y el largo mínimo son configurables por entorno
 * (WHATSAPP_AUDIO_PROB, WHATSAPP_AUDIO_MIN_CHARS). El azar se inyecta en las
 * pruebas para que la decisión sea verificable sin depender del dado.
 */

export interface OpcionesVoz {
  /** El turno trae una ficha/tarjeta de producto. */
  tieneFicha: boolean;
  /** El texto del razonamiento (lo que se leería). */
  texto: string;
  /** La voz está encendida (WHATSAPP_AUDIO_ENABLED). */
  activo: boolean;
  /** Probabilidad de hablar una explicación. Default 0.5. */
  prob?: number;
  /** Largo mínimo para que valga la pena hablar. Default 120. */
  minChars?: number;
  /** Fuente de azar, inyectable para pruebas. Default Math.random. */
  azar?: () => number;
}

/** Por debajo de esto no se habla: es una confirmación, no una explicación. */
export const MIN_CHARS_POR_DEFECTO = 120;
/** Ni siempre voz ni siempre texto. */
export const PROB_POR_DEFECTO = 0.5;

export function decideSiMandaVoz(o: OpcionesVoz): boolean {
  if (!o.activo) return false;

  // Una ficha se lee y se mira; hablarle encima del texto es lo que el dueño
  // pidió evitar. Aplica aunque el turno traiga además algo de razonamiento.
  if (o.tieneFicha) return false;

  const texto = String(o.texto || "").trim();
  const minChars = Number.isFinite(o.minChars as number) ? (o.minChars as number) : MIN_CHARS_POR_DEFECTO;
  if (texto.length < minChars) return false;

  const prob = Number.isFinite(o.prob as number) ? (o.prob as number) : PROB_POR_DEFECTO;
  const azar = o.azar ?? Math.random;
  return azar() < Math.min(1, Math.max(0, prob));
}
