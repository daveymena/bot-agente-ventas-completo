/**
 * ============================================================
 * NO PROMETAS LO QUE NO VAS A ENTREGAR EN ESTE MISMO MENSAJE
 * ============================================================
 *
 * Los cuatro defectos que se corrigieron el 2026-09-01 eran el MISMO defecto
 * visto desde cuatro lados: el texto anuncia una cosa y sale otra.
 *
 *   · "Te paso la ficha completa"            -> no salio ninguna ficha
 *   · "¿Te muestro el video? 🎬" + "Si"      -> salieron los medios de pago
 *   · "¡Sí! Mira 👇"                          -> salio otro producto
 *   · "si, ¿cuanto vale?"                     -> salio el video, no el precio
 *
 * Cada uno se arreglo en su sitio, y esta bien que asi sea. Pero arreglar
 * cuatro veces el mismo defecto en cuatro lugares distintos significa que
 * falta el candado que los cubre a todos: nadie estaba comparando lo que el
 * mensaje DICE contra lo que el mensaje LLEVA.
 *
 * Este modulo no decide que mandar --de eso se ocupan `embudo.ts` y
 * `ficha-parcial.ts`--. Solo contesta una pregunta, la ultima antes de enviar:
 * ¿esto cumple lo que promete?
 *
 * Es a proposito conservador. Solo marca promesas EXPLICITAS y verificables.
 * Un falso positivo borra una frase buena; un falso negativo deja pasar un
 * cliente esperando algo que no llega. Lo segundo cuesta mas, pero lo primero
 * tampoco es gratis, asi que los patrones exigen el verbo de entrega al lado
 * del objeto prometido.
 */

/** Lo que un mensaje puede prometer y despues no cumplir. */
export type Promesa = "ficha" | "video" | "precio" | "pago" | "tienda";

export const NOMBRE_DE_PROMESA: Record<Promesa, string> = {
  ficha: "la ficha del producto",
  video: "el video",
  precio: "el precio",
  pago: "los medios de pago",
  tienda: "el enlace de la tienda",
};

/**
 * El verbo de entrega. Va pegado al objeto: "te paso la ficha" promete, pero
 * "la ficha dice que..." no promete nada, y "te repaso lo importante" tampoco.
 */
const ENTREGA = String.raw`(te\s+(?:la|lo|los|las)?\s*(?:paso|mando|env[ií]o|comparto|dejo|muestro|adjunto)|ac[aá]\s+(?:te\s+)?(?:va|dejo)|aqu[ií]\s+(?:abajo|te\s+dejo|va)|ya\s+te\s+(?:la|lo)\s+(?:paso|mando|env[ií]o))`;

const PATRONES: Array<{ promesa: Promesa; re: RegExp }> = [
  {
    promesa: "ficha",
    // "te paso la ficha", "te mando la info completa", "aquí abajo te dejo todo"
    re: new RegExp(`${ENTREGA}[^.!?\\n]{0,40}\\b(ficha|info|informaci[oó]n|detalles|todo lo que trae|el temario)\\b`, "i"),
  },
  {
    promesa: "video",
    re: new RegExp(`${ENTREGA}[^.!?\\n]{0,40}\\b(video|vidio|clase de muestra)\\b`, "i"),
  },
  {
    promesa: "precio",
    re: new RegExp(`${ENTREGA}[^.!?\\n]{0,40}\\b(precio|valor|cu[aá]nto (?:vale|cuesta|est[aá]))\\b`, "i"),
  },
  {
    promesa: "pago",
    re: new RegExp(`${ENTREGA}[^.!?\\n]{0,40}\\b(medios de pago|formas de pago|m[eé]todos de pago|datos de pago|el link de pago|enlace de pago|la cuenta)\\b`, "i"),
  },
  {
    promesa: "tienda",
    re: new RegExp(`${ENTREGA}[^.!?\\n]{0,40}\\b(tienda|cat[aá]logo|p[aá]gina|enlace del producto)\\b`, "i"),
  },
];

/**
 * "¡Sí! Mira 👇" y sus variantes.
 *
 * No nombran nada, pero apuntan hacia abajo: prometen que ALGO viene debajo.
 * Si no viene, es la peor version del defecto, porque encima afirma.
 */
const SEÑALA_ABAJO = /(mir[aá]|ac[aá]|aqu[ií]|abajo|te dejo)[^.!?\n]{0,20}👇|👇/u;

/** Qué promete este texto. */
export function promesasDe(texto: string): Promesa[] {
  const t = String(texto || "");
  if (!t.trim()) return [];
  const out = new Set<Promesa>();
  for (const { promesa, re } of PATRONES) if (re.test(t)) out.add(promesa);
  // La flecha sola promete "algo debajo"; se trata como ficha, que es lo que
  // el bot manda debajo el 99% de las veces.
  if (!out.size && SEÑALA_ABAJO.test(t)) out.add("ficha");
  return [...out];
}

/** Con qué se cumple cada promesa en este turno. */
export interface LoQueVaASalir {
  /** Va una ficha de producto adjunta. */
  hayFicha: boolean;
  /** Qué sección de la ficha se va a mandar, si va alguna. */
  seccion?: string | null;
  /** El texto de TODOS los mensajes que van a salir en este turno. */
  mensajes: string[];
}

/** Las secciones que efectivamente entregan cada cosa. */
const SECCION_ENTREGA: Record<Promesa, string[]> = {
  ficha: ["completa", "info"],
  video: ["video"],
  precio: ["precio", "pago", "pago_link", "pago_transferencia", "completa"],
  pago: ["pago", "pago_link", "pago_transferencia"],
  tienda: ["tienda"],
};

/**
 * Las promesas del texto que este turno NO cumple.
 *
 * Se mira lo que va a salir, no lo que se penso mandar: la unica prueba de
 * que algo se entrego es que este en los mensajes.
 */
export function promesasIncumplidas(texto: string, sale: LoQueVaASalir): Promesa[] {
  const prometidas = promesasDe(texto);
  if (!prometidas.length) return [];

  const todo = (sale.mensajes || []).join("\n");
  const seccion = String(sale.seccion || "");

  return prometidas.filter((p) => {
    if (SECCION_ENTREGA[p].includes(seccion)) return false;
    switch (p) {
      case "ficha":
        return !sale.hayFicha;
      case "video":
        return !/https?:\/\/\S+/i.test(todo);
      case "precio":
        // Un precio de verdad lleva cifra. "hablamos del precio" no cumple.
        return !/\d[\d.,]{2,}/.test(todo);
      case "pago":
        return !/https?:\/\/\S+/i.test(todo) && !/\b\d{10}\b/.test(todo);
      case "tienda":
        return !/https?:\/\/\S+/i.test(todo);
    }
  });
}

/**
 * Quita del texto la frase que promete algo que no va a salir, dejando el
 * resto intacto.
 *
 * Se corta por frases y no se reescribe el mensaje entero a proposito: el
 * saludo, el reconocimiento de lo que pregunto y el cierre suelen estar bien;
 * lo unico que sobra es el anuncio de algo que no viene. Si al sacar la frase
 * no queda nada, devuelve "" y el llamador decide con que reemplazarlo.
 */
export function sinLaPromesa(texto: string, incumplidas: Promesa[]): string {
  if (!incumplidas.length) return texto;
  // ── Se corta después de los signos de CIERRE, no de los de apertura ────
  //
  // Acá el separador incluía `¡` y `¿`, y eso es un error de puntuación con
  // consecuencia visible: una frase no TERMINA en un signo de apertura,
  // empieza. Cortar después de él dejaba el signo solo, como un pedazo aparte:
  //
  //   "¡Buenísimo que te haya llamado la atención! 👇"
  //     -> ["¡", "Buenísimo que te haya llamado la atención!", "👇"]
  //
  // Se descartaba el "👇" (que era la promesa incumplida) y el resto se volvía
  // a unir con un espacio, así que al cliente le llegaba:
  //
  //   "¡ Buenísimo que te haya llamado la atención!"
  //
  // Medido en producción el 2026-09-04. Es el mismo defecto que ya se había
  // corregido en `emojis-con-medida.ts` -- "un bot que escribe '¡ Hola' parece
  // roto, y es lo primero que el cliente lee" -- reaparecido por otra puerta.
  const frases = String(texto).split(/(?<=[.!?])\s*|\n+/);
  const quedan = frases.filter((f) => {
    if (!f || !f.trim()) return false;
    const p = promesasDe(f);
    return !p.some((x) => incumplidas.includes(x));
  });
  return quedan
    .join(" ")
    .replace(/\s+/g, " ")
    // Por si el texto original ya traía el signo separado, o queda un signo de
    // apertura huérfano al descartar la frase que lo seguía.
    .replace(/([¡¿])\s+/g, "$1")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[¡¿]\s*$/g, "")
    .trim();
}

/**
 * Quita el monto de una frase, y descarta la frase entera si al quitarlo queda
 * anunciando un precio que ya no dice.
 *
 * Cuando la ficha lleva el precio, el texto que la acompaña no debe repetirlo:
 * el numero va una sola vez. Esa limpieza ya existia y solo comprobaba que
 * quedaran seis caracteres. Medido en produccion el 2026-09-01:
 *
 *   cliente: "¿cuánto vale?"
 *   bot:     "💰 El curso de piano completo tiene un valor de , pago único."
 *
 * Quedaron cincuenta caracteres, asi que la frase paso -- con el precio en el
 * aire. La regla correcta no es de longitud: si se quito un monto y la frase
 * SIGUE anunciando un precio, la frase ya no se sostiene y se descarta. La
 * ficha lo dice bien; una frase rota solo puede restar.
 *
 * Devuelve "" cuando hay que descartarla.
 */
export function sinElMontoQueVaEnLaFicha(texto: string): string {
  const original = String(texto || "");
  const sinMonto = original
    .replace(/\$\s?\d[\d.,]*\s?(COP|USD)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (sinMonto === original) return original;

  // Se quito un monto. Si la frase todavia anuncia un precio, le falta el dato
  // que la sostenia.
  if (/\b(valor|precio|vale|cuesta|sale|queda|cobr\w+)\b/i.test(sinMonto)) return "";

  return sinMonto.replace(/[\s,:;.-]+$/, "").length >= 6 ? sinMonto : "";
}

/**
 * El texto NIEGA tener algo que este mismo turno si va a entregar.
 *
 * Es el reverso de `promesasIncumplidas`, y aparecio al arreglar aquello:
 * cuando el servidor pasa a entregar el video que el producto tiene, el
 * modelo --que no sabia que existia-- ya habia escrito que no lo tenia. El
 * cliente leia "no tengo videos para mostrarte" y justo debajo le llegaba
 * el video.
 *
 * Negar algo y entregarlo en el mismo mensaje es peor que cualquiera de las
 * dos cosas por separado: deja al cliente sin saber cual de las dos es
 * cierta.
 */
const NIEGA: Record<Promesa, RegExp> = {
  ficha: /\bno (tengo|dispongo de|cuento con|puedo (pasarte|mandarte|enviarte))\b[^.!?\n]{0,40}\b(ficha|info|informaci[oó]n|detalles)\b/i,
  video: /\bno (tengo|hay|dispongo de|cuento con|puedo (mostrarte|pasarte|mandarte|enviarte))\b[^.!?\n]{0,40}\b(video|videos|clase de muestra)\b|\bno (tengo|hay|dispongo de|cuento con)\b[^.!?\n]{0,20}\b(uno|ninguno|nada)\b|\bno [^.!?\n]{0,20}video[^.!?\n]{0,30}(disponible|para (mostrar|enviar|pasar))/i,
  precio: /\bno (tengo|puedo (darte|pasarte|decirte))\b[^.!?\n]{0,30}\b(precio|valor)\b/i,
  pago: /\bno (tengo|manejo|dispongo de)\b[^.!?\n]{0,40}\b(medios de pago|formas de pago|link de pago|enlace de pago)\b/i,
  tienda: /\bno (tenemos|tengo|hay)\b[^.!?\n]{0,40}\b(tienda|p[aá]gina web|sitio web|cat[aá]logo)\b/i,
};

export function niegaLoQueSiSale(texto: string, queSale: Promesa): boolean {
  return NIEGA[queSale].test(String(texto || ""));
}

/** La seccion que se va a mandar, traducida a lo que promete entregar. */
export function loQueEntregaLaSeccion(seccion: string): Promesa | null {
  if (seccion === "video") return "video";
  if (seccion === "tienda") return "tienda";
  if (seccion === "precio") return "precio";
  if (seccion === "pago" || seccion === "pago_link" || seccion === "pago_transferencia") return "pago";
  if (seccion === "completa" || seccion === "info") return "ficha";
  return null;
}
