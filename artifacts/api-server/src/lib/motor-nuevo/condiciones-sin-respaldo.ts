/**
 * ============================================================
 * LA LETRA CHICA NO SE INVENTA
 * ============================================================
 *
 * Chat real del dueño (27-09-2026), curso de piano, motor v2:
 *
 *   cliente: precio
 *   bot:     "Es un solo pago y el acceso te queda de por vida, con
 *             garantía de 7 días."
 *            [maqueta de precio: 💰 $60.000 COP (Pago único)]
 *
 * El NÚMERO salió bien: lo pone la maqueta leyendo la base, y por eso
 * `montosInventados` no tenía nada que corregir. Lo que se inventó fue la
 * letra chica que el modelo escribió ENCIMA de la maqueta: ni la garantía de
 * 7 días ni el acceso de por vida están cargados en este negocio. Son
 * promesas que suenan a curso online, que el cliente puede reclamar y que el
 * negocio tendría que cumplir.
 *
 * Es exactamente la misma clase de defecto que ya costó caro con los precios,
 * y la lección del proyecto es la misma: **lo que se puede decidir en el
 * servidor, se decide en el servidor.** El prompt ya dice "Garantía/
 * devolución/tiempos: solo lo cargado por el dueño"; el modelo lo escribió
 * igual. Una instrucción no es un candado.
 *
 * ── Cómo se decide qué se borra ──────────────────────────────────────────
 *
 * Igual que en `desglose.ts` (motor viejo): cada afirmación tiene al lado lo
 * que tendría que aparecer en la ficha del producto, en los hechos del
 * negocio o en lo que el dueño cargó, para respaldarla.
 *
 *   · Si el respaldo está, la frase QUEDA. El vendedor sí puede decir lo que
 *     el dueño cargó, y decirlo es parte de vender.
 *   · Si no está, se saca la FRASE, no el mensaje: el resto de la respuesta
 *     casi siempre es correcto, y un mensaje cortado a la mitad es peor que
 *     uno con una promesa de menos.
 *
 * Quedan fuera, a propósito:
 *   · las preguntas ("¿quieres saber de la garantía?"): preguntar no promete;
 *   · lo que dice la verdad ("eso te lo confirmo con el equipo", "no
 *     manejamos devoluciones"): es justo la conducta que queremos.
 *
 * ⚠️ Solo van acá promesas COMERCIALES verificables, que el negocio tendría
 * que sostener si el cliente las reclama. Nada de palabras que un vendedor
 * honesto usaría sin comprometer a nadie: un falso positivo le borra una
 * frase buena a un cliente real. Hay pruebas que fijan los dos lados.
 */
import type { Producto } from "./herramientas";
import type { GuionDelNegocio } from "./nicho";

export interface PromesaVigilada {
  /** Familia, para el log. No se le muestra a nadie. */
  nombre: string;
  /** Lo que el texto afirma. */
  dice: RegExp;
  /** Lo que tendría que estar cargado para poder afirmarlo. */
  respalda: RegExp;
}

/**
 * Las cinco familias que aparecieron en chats reales y que el negocio tendría
 * que cumplir. No es una lista de palabras prohibidas: es una lista de cosas
 * que hay que TENER CARGADAS para poder prometer.
 */
export const PROMESAS_VIGILADAS: PromesaVigilada[] = [
  {
    // "garantía de 7 días", "te devolvemos el 100%", "el reembolso es fácil".
    nombre: "garantia",
    dice: /\b(garant[ií]as?|garantizad\w*|garantizamos|te (?:lo )?devolvemos|devoluci[oó]n(?:es)?|reembols\w*)\b/i,
    respalda: /garant|devoluc|reembols|cambio/i,
  },
  {
    // "el acceso te queda de por vida", "acceso ilimitado", "para siempre".
    nombre: "acceso_perpetuo",
    dice: /\b(de por vida|para siempre|vitalici\w*|acceso (?:ilimitado|permanente|perpetuo|indefinido))\b/i,
    respalda: /de por vida|para siempre|vitalici|ilimitad|permanente|perpetu|indefinid/i,
  },
  {
    // "te dan certificado al terminar".
    nombre: "certificado",
    dice: /\b(certificad\w*|certificaci[oó]n\w*|diplomas?)\b/i,
    respalda: /certificad|certificaci|diploma/i,
  },
  {
    // "incluye soporte", "tienes acompañamiento personalizado", "un tutor".
    nombre: "soporte",
    dice: /\b(soporte|acompa[ñn]amiento|asesor[ií]a personalizada|tutor[ií]as?|mentor[ií]as?)\b/i,
    respalda: /soporte|acompa[ñn]a|asesor|tutor|mentor/i,
  },
  {
    // "y las actualizaciones futuras te llegan gratis".
    nombre: "actualizaciones",
    dice: /\bactualizaci[oó]n(?:es)?\b/i,
    respalda: /actualiza/i,
  },
];

/**
 * Lo que dice la verdad en vez de prometer. No se toca: es la conducta que
 * queremos y borrarla dejaría al cliente sin respuesta.
 */
const DICE_LA_VERDAD =
  /te (?:lo )?confirm|lo confirmo|confirmarte|con el equipo|te escribo|te aviso|te averiguo|no (?:tengo|tenemos|manejamos|hay|ofrecemos|incluye|incluimos)|sin garant|no viene con/i;

export interface RespaldoDelNegocio {
  producto?: Pick<Producto, "name" | "description"> | null;
  /** `guion.hechos` + `guion.datosDelNegocio`: lo que el dueño SÍ cargó. */
  guion?: Pick<GuionDelNegocio, "hechos" | "datosDelNegocio"> | null;
  /** Respuestas cargadas en `product_knowledge` que aplican a este producto. */
  conocimiento?: (string | null | undefined)[];
}

/** Todo lo que este negocio tiene cargado, en un solo texto para buscar. */
export function textoQueRespalda(r: RespaldoDelNegocio): string {
  return [
    r.producto?.name,
    r.producto?.description,
    ...(r.guion?.hechos ?? []),
    ...(r.guion?.datosDelNegocio ?? []),
    ...(r.conocimiento ?? []),
  ]
    .filter(Boolean)
    .map(String)
    .join(" \n ");
}

/** Corta el texto en frases, respetando los renglones. */
function frasesDe(texto: string): { linea: number; frase: string }[] {
  const salida: { linea: number; frase: string }[] = [];
  String(texto || "")
    .split(/\r?\n/)
    .forEach((linea, i) => {
      for (const frase of linea.split(/(?<=[.!?…])\s+/)) {
        if (frase.trim()) salida.push({ linea: i, frase: frase.trim() });
      }
    });
  return salida;
}

/** ¿Esta frase promete algo que nadie cargó? */
function prometeSinRespaldo(frase: string, respaldo: string): PromesaVigilada | null {
  // Preguntar no es prometer. "¿Te cuento de la garantía?" se deja pasar.
  if (/\?\s*$/.test(frase)) return null;
  if (DICE_LA_VERDAD.test(frase)) return null;
  for (const promesa of PROMESAS_VIGILADAS) {
    if (promesa.dice.test(frase) && !promesa.respalda.test(respaldo)) return promesa;
  }
  return null;
}

/** Las frases del texto que prometen condiciones que el negocio no cargó. */
export function condicionesSinRespaldo(
  texto: string,
  r: RespaldoDelNegocio,
): { frase: string; promesa: string }[] {
  const respaldo = textoQueRespalda(r);
  const malas: { frase: string; promesa: string }[] = [];
  for (const { frase } of frasesDe(texto)) {
    const promesa = prometeSinRespaldo(frase, respaldo);
    if (promesa) malas.push({ frase, promesa: promesa.nombre });
  }
  return malas;
}

/** Renglón que quedó solo con emojis, viñetas o puntuación después de recortar. */
const LINEA_VACIA = /^[\s\p{Extended_Pictographic}\p{Emoji_Component}•\-*·:,.!?¡¿…]*$/u;

/**
 * El texto sin esas frases. Si NO había ninguna, devuelve el original tal
 * cual: este guardián no reescribe respuestas buenas.
 */
export function sinCondicionesSinRespaldo(texto: string, r: RespaldoDelNegocio): string {
  const malas = new Set(condicionesSinRespaldo(texto, r).map((m) => m.frase));
  if (!malas.size) return texto;

  const lineas = String(texto || "")
    .split(/\r?\n/)
    .map((linea) =>
      linea
        .split(/(?<=[.!?…])\s+/)
        .filter((f) => !malas.has(f.trim()))
        .join(" ")
        .trim(),
    )
    .map((l) => (LINEA_VACIA.test(l) ? "" : l));

  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
