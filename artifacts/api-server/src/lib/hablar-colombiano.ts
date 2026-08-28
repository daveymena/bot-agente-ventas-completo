/**
 * ============================================================
 * EL VOSEO SE CORRIGE AL SALIR, NO SE PIDE
 * ============================================================
 *
 * El registro mezclado (M4) lleva CUATRO rondas de QA sin caer: ❌ ❌ ❌ ❌.
 *
 * Y no es que faltara la regla. El prompt dice, en mayúsculas, "Habla en
 * español COLOMBIANO neutro. Nada de voseo (podés, querés, tenés)". Se corrigió
 * además el propio prompt, que estaba escrito en voseo y le enseñaba al modelo
 * justo lo que le pedía no hacer. Aun así, medido después de ese arreglo:
 *
 *   "Lo siento, pero el precio del curso es fijo en $60.000.
 *    Si DECIDÍS comprar, te envío el link de pago."
 *
 * La conclusión es la misma de siempre en este sistema: una instrucción blanda
 * al modelo no es una garantía. Lo que se puede decidir en el servidor, se
 * decide en el servidor -- pasó con el precio, con la cuenta de cobro, con la
 * entrega y con el producto, y cada vez que la decisión se le quitó al modelo,
 * ese error desapareció.
 *
 * Acá el texto ya redactado se traduce antes de enviarse. El modelo puede
 * escribir como quiera: el cliente lee colombiano.
 *
 * ── Por qué una LISTA y no una regla general ────────────────────────────
 *
 * La tentación es "toda palabra terminada en -ás/-és/-ís es voseo". No sirve:
 * "estás", "más", "atrás", "después", "país" y "además" son español correcto y
 * quedarían destrozados. El voseo son formas concretas de verbos concretos, y
 * así se listan.
 */

/** voseo → colombiano. El orden no importa: cada forma es distinta. */
const TRADUCCION: Array<[RegExp, string]> = (
  [
    // ── Presente: la terminación acentuada ────────────────────────────────
    ["podés", "puedes"], ["querés", "quieres"], ["tenés", "tienes"],
    ["sabés", "sabes"], ["debés", "debes"], ["hacés", "haces"],
    ["decís", "dices"], ["venís", "vienes"], ["vivís", "vives"],
    ["ponés", "pones"], ["salís", "sales"], ["seguís", "sigues"],
    ["elegís", "eliges"], ["preferís", "prefieres"], ["escribís", "escribes"],
    ["recibís", "recibes"], ["decidís", "decides"], ["comprás", "compras"],
    ["mandás", "mandas"], ["buscás", "buscas"], ["necesitás", "necesitas"],
    ["pagás", "pagas"], ["llevás", "llevas"], ["aprendés", "aprendes"],
    ["entendés", "entiendes"], ["conocés", "conoces"], ["creés", "crees"],
    ["mirás", "miras"], ["esperás", "esperas"], ["pensás", "piensas"],
    ["contás", "cuentas"], ["confirmás", "confirmas"], ["respondés", "respondes"],
    ["preguntás", "preguntas"], ["avisás", "avisas"], ["trabajás", "trabajas"],
    ["empezás", "empiezas"], ["terminás", "terminas"], ["probás", "pruebas"],
    ["usás", "usas"], ["dejás", "dejas"], ["tomás", "tomas"],
    ["andás", "andas"], ["estás bien", "estás bien"],

    // ── Imperativos ───────────────────────────────────────────────────────
    ["mandá", "manda"], ["mirá", "mira"], ["dejá", "deja"], ["tomá", "toma"],
    ["esperá", "espera"], ["probá", "prueba"], ["buscá", "busca"],
    ["revisá", "revisa"], ["confirmá", "confirma"], ["contá", "cuenta"],
    ["aprovechá", "aprovecha"], ["empezá", "empieza"], ["terminá", "termina"],
    ["escribí", "escribe"], ["elegí", "elige"], ["seguí", "sigue"],
    ["pedí", "pide"], ["decí", "di"], ["vení", "ven"], ["andá", "ve"],
    ["poné", "pon"], ["salí", "sal"], ["volvé", "vuelve"], ["corré", "corre"],
    ["aprendé", "aprende"], ["fijate", "fíjate"], ["quedate", "quédate"],
    ["acordate", "acuérdate"], ["llevá", "lleva"], ["sacá", "saca"],
    ["cerrá", "cierra"], ["abrí", "abre"], ["sumá", "suma"],

    // ── Imperativo + pronombre, que es como se cuela más seguido ──────────
    ["contame", "cuéntame"], ["decime", "dime"], ["avisame", "avísame"],
    ["escribime", "escríbeme"], ["mandame", "mándame"], ["pasame", "pásame"],
    ["dame", "dame"], ["mostrame", "muéstrame"], ["explicame", "explícame"],
    ["confirmame", "confírmame"], ["esperame", "espérame"], ["ayudame", "ayúdame"],
    ["decile", "dile"], ["contale", "cuéntale"], ["mandale", "mándale"],
    ["preguntale", "pregúntale"], ["dejale", "déjale"], ["referite", "refiérete"],

    // ── El verbo ser ──────────────────────────────────────────────────────
    ["sos", "eres"],
  ] as Array<[string, string]>
)
  // ⚠️ `\b` en JavaScript se define sobre \w, que NO incluye vocales
  // acentuadas: /\bpodés\b/ no matchea "podés" al final de una frase. Por eso
  // el límite de la derecha se hace con un lookahead de "no letra", que sí
  // funciona con tildes y con la ñ.
  .map(([de, a]) => [new RegExp(`\\b${de}(?![a-záéíóúüñ])`, "gi"), a] as [RegExp, string]);

/** Conserva MAYÚSCULAS y Capitalizada, para no romper el énfasis del texto. */
function comoElOriginal(original: string, nuevo: string): string {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return nuevo.toUpperCase();
  }
  if (original[0] === original[0]?.toUpperCase()) {
    return nuevo[0]!.toUpperCase() + nuevo.slice(1);
  }
  return nuevo;
}

/**
 * Traduce a español colombiano lo que el modelo haya escrito en voseo.
 *
 * No toca nada más: ni el tono, ni los emojis, ni el orden. Solo el registro.
 */
export function hablarColombiano(texto: string): string {
  if (!texto) return texto;
  let salida = texto;
  for (const [patron, reemplazo] of TRADUCCION) {
    salida = salida.replace(patron, (m) => comoElOriginal(m, reemplazo));
  }
  return salida;
}

/** Las formas de voseo que quedaron sin traducir. Para pruebas y diagnóstico. */
export function restosDeVoseo(texto: string): string[] {
  const SOSPECHOSAS =
    /\b(?!estás|además|atrás|después|jamás|quizás|país|adiós)([a-záéíóúñ]{3,})(ás|és|ís)(?![a-záéíóúüñ])/gi;
  return [...String(texto).matchAll(SOSPECHOSAS)].map((m) => m[0]);
}
