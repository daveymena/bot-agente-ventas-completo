/**
 * ============================================================
 * LOS EMOJIS SE MIDEN AL SALIR, NO SE PIDEN
 * ============================================================
 *
 * Las reglas ya estaban escritas en el prompt, y bien escritas
 * (`response-brain.ts`): un dato por línea con su emoji, no repetir siempre el
 * mismo, 1 o 2 en una frase corta, nunca llenar cada palabra.
 *
 * Medido sobre 109 mensajes del bot en producción el 2026-09-01: se cumplen el
 * 90% de las veces. El promedio es 1,6 emojis por mensaje, que está bien. Pero
 * 11 mensajes llevaban 5 o más, y 5 repetían el mismo emoji tres veces o más.
 * El peor: 8 emojis en 76 palabras.
 *
 * Es la misma conclusión de siempre en este sistema: una instrucción blanda al
 * modelo no es una garantía. Pasó con el precio, con la cuenta de cobro, con el
 * voseo y con el producto — y cada vez que la decisión se le quitó al modelo,
 * el error desapareció. Acá se aplica igual: el modelo escribe como quiera y el
 * cliente lee un mensaje medido.
 *
 * ── Lo que este módulo NO toca ──────────────────────────────────────────
 *
 * La FICHA. Ahí un emoji por línea es el formato correcto, lo escribió el dueño
 * en la descripción de cada producto, y es lo que hace que se lea de un
 * vistazo. Esto se aplica solo al texto conversacional que redacta el modelo.
 */

/** Un emoji, incluidos los que llevan modificadores de tono o secuencias ZWJ. */
const EMOJI = /\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;

/** Cuántas veces puede aparecer el MISMO emoji en un mensaje. */
const MAX_REPETIDO = 2;

/** Cuántos emojis puede llevar una línea. Más de uno ya es adorno. */
const MAX_POR_LINEA = 1;

/**
 * Cuántos emojis puede llevar el mensaje entero.
 *
 * Se cuenta sobre las líneas con texto: un mensaje de seis líneas puede llevar
 * más que uno de una, porque ahí cada emoji está anclando un dato distinto.
 */
function techoDelMensaje(lineasConTexto: number): number {
  return Math.max(2, Math.min(4, lineasConTexto));
}

export interface Medida {
  texto: string;
  /** Cuántos se quitaron. 0 si el mensaje ya estaba bien. */
  quitados: number;
}

/**
 * Deja el texto con los emojis medidos.
 *
 * Quita SIEMPRE los últimos, no los primeros: el primero de una línea es el
 * que ancla el dato y el que el lector usa para orientarse; los que sobran
 * están al final, decorando.
 */
export function medirEmojis(texto: string): Medida {
  const original = String(texto || "");
  if (!original.trim()) return { texto: original, quitados: 0 };

  const lineas = original.split("\n");
  const conTexto = lineas.filter((l) => l.trim()).length;
  const techo = techoDelMensaje(conTexto);

  const vistos = new Map<string, number>();
  let total = 0;
  let quitados = 0;

  const salida = lineas.map((linea) => {
    let enEstaLinea = 0;
    return linea.replace(EMOJI, (emoji) => {
      const repetidas = vistos.get(emoji) ?? 0;

      const sobra =
        enEstaLinea >= MAX_POR_LINEA ||
        repetidas >= MAX_REPETIDO ||
        total >= techo;

      if (sobra) {
        quitados++;
        return "";
      }
      vistos.set(emoji, repetidas + 1);
      enEstaLinea++;
      total++;
      return emoji;
    });
  });

  // Al quitar emojis quedan espacios dobles y espacios antes de un signo.
  //
  // ⚠️ Y también DESPUÉS de los signos de apertura, que en español van pegados
  // a la palabra. Medido en producción el 2026-09-02, en mensajes reales que
  // recibió un cliente:
  //
  //   "¡🎉 Buenísimo que preguntes!"  →  "¡ Buenísimo que preguntes!"
  //   "¿🚀 Listo para empezar?"       →  "¿ Listo para empezar?"
  //
  // El emoji se iba y el espacio se quedaba. La limpieza cubría el espacio
  // ANTES de un signo de cierre, pero no el de después de uno de apertura --
  // y ese es justo el que se ve, porque queda al principio de la frase. Un bot
  // que escribe "¡ Hola" parece roto, y es lo primero que el cliente lee.
  const limpio = salida
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/([¡¿])[ \t]+/g, "$1")
    .replace(/[ \t]+$/gm, "");

  return { texto: limpio, quitados };
}

/** Igual que `medirEmojis`, cuando solo interesa el texto. */
export function conEmojisMedidos(texto: string): string {
  return medirEmojis(texto).texto;
}
