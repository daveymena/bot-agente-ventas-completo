/**
 * ============================================================================
 * EL FORMATO DE WHATSAPP SE MIDE AL SALIR, NO SE PIDE
 * ============================================================================
 *
 * El prompt del motor dice, textual (`motor.ts`, bloque CÓMO HABLAS):
 *
 *   "Mensajes de 2 a 4 frases [...] Nada de listas con viñetas, nada de
 *    títulos ni de fichas armadas a mano: esto es un chat, no un folleto.
 *    Un emoji suelto está bien; cinco no. No empieces todas las respuestas
 *    con 'Perfecto', 'Claro', 'Excelente' ni con el nombre del cliente."
 *
 * Y esa era **la única regla del motor que no tenía ninguna comprobación**.
 * Las ocho verificaciones que ya existían cuidan la VERDAD (cifras inventadas,
 * promesas sin respaldo, fichas que no corresponden) o el ENVÍO (no anunciar lo
 * que no se mandó). Ninguna miraba cómo se ve el mensaje.
 *
 * El motor v1 sí lo medía (`emojis-con-medida.ts`) y quedó marcado
 * "RETIRAR CON EL V1" sin reemplazo en el v2: una regresión. Este módulo la
 * cierra, y además cubre lo que al v1 le faltaba.
 *
 * ── Medir ≠ reescribir ────────────────────────────────────────────────────
 *
 * Esto NO reescribe el texto por atrás: eso fue lo que partió respuestas a la
 * mitad en el motor viejo ("empezar h..."). Detecta y devuelve un diagnóstico
 * para que el motor pida **una** reescritura, igual que hace con las cifras
 * inventadas. Si el modelo insiste, sale lo que escribió: el formato es menos
 * grave que dejar al cliente sin respuesta.
 *
 * ── Lo que NO se toca ─────────────────────────────────────────────────────
 *
 *   · Las FICHAS. Ahí un emoji por línea es el formato correcto, lo escribió el
 *     dueño en la descripción de cada producto, y lo pega el servidor: no pasa
 *     por acá.
 *   · Las LISTAS. El prompt pide no armar listas a mano, pero cuando el modelo
 *     enumera opciones reales (tres modelos de un producto) una lista es lo
 *     legible. Se permite si tiene 3+ ítems con viñeta — el mismo criterio que
 *     ya usa `emojis-con-medida.ts` para no dejar la lista coja.
 */

/** Un emoji, con modificadores de tono y secuencias ZWJ. */
const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;

/** El emoji que abre un renglón (viñeta de lista). Regex propia: `EMOJI` es
 *  global y `test()` sobre una global arrastra `lastIndex` entre llamadas. */
const ANCLA = /^[ \t]*(?:\p{Extended_Pictographic}|[-*•·–—]|\d+[.)])/u;

/**
 * Aperturas que el prompt prohíbe y que delatan al bot.
 *
 * Lista corta y cerrada a propósito: perseguir cualquier palabra amable daría
 * falsos positivos y le borraría una frase buena a un cliente real. Estas son
 * las que el dueño vio repetirse en producción.
 */
const APERTURAS_PROHIBIDAS = /^(?:¡?(?:perfecto|claro|excelente|genial|buen[ií]simo|por supuesto|entendido|listo|de acuerdo)\b|hola\s)/i;

/** Cuántas frases puede tener una respuesta conversacional. */
const MAX_FRASES = 5;
/** Y cuántas líneas, contando los separadores de bloque. */
const MAX_LINEAS = 6;
/** Cuántos emojis en total. El prompt dice "cinco no". */
const MAX_EMOJIS = 4;
/** Cuántas veces puede repetirse el mismo emoji. */
const MAX_REPETIDO = 2;

export interface ProblemaDeFormato {
  /** Clave estable, para logs y tests. */
  tipo: "frases" | "lineas" | "emojis" | "emoji_repetido" | "apertura" | "titulo" | "parrafo_largo";
  /** Qué vio, en palabras del negocio. Es lo que se le pasa al modelo. */
  detalle: string;
}

export interface MedidaDeFormato {
  problemas: ProblemaDeFormato[];
  /** Datos crudos, para el log y para calibrar los topes con datos reales. */
  metricas: {
    frases: number;
    lineas: number;
    emojis: number;
    emojiMasRepetido: number;
    palabras: number;
    oracionMasLarga: number;
  };
}

/** Cuenta emojis sin el bug de `lastIndex` de las regex globales. */
function contarEmojis(texto: string): { total: number; maxRepetido: number } {
  const vistos = new Map<string, number>();
  let total = 0;
  for (const m of texto.matchAll(EMOJI)) {
    const e = m[0];
    total++;
    vistos.set(e, (vistos.get(e) ?? 0) + 1);
  }
  let maxRepetido = 0;
  for (const n of vistos.values()) if (n > maxRepetido) maxRepetido = n;
  return { total, maxRepetido };
}

/**
 * Corta en frases por cierre real (. ! ? …) o por salto de línea.
 *
 * Los puntos suspensivos y los signos de cierre en español (`¡!`, `¿?`) no
 * cuentan como dos cortes.
 */
function frasesDe(texto: string): string[] {
  return texto
    .split(/\n+/)
    .flatMap((linea) => linea.split(/(?<=[.!?…])\s+/))
    .map((f) => f.trim())
    .filter(Boolean);
}

/** ¿Este renglón es una viñeta de lista? */
function esViñeta(linea: string): boolean {
  return ANCLA.test(linea.trim());
}

/** ¿Este renglón parece un título armado a mano? */
function pareceTitulo(linea: string): boolean {
  const t = linea.trim();
  if (!t || t.length > 60) return false;
  // "**Precio**", "## Ficha", "PRECIO:" — títulos que el prompt prohíbe.
  if (/^\*{1,2}[^*]+\*{1,2}:?$/.test(t)) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  // Todo en mayúsculas y sin terminar en puntuación de frase.
  if (t.length >= 4 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t) && !/[.!?…]$/.test(t)) return true;
  return false;
}

/**
 * Mide el formato de una respuesta conversacional.
 *
 * Devuelve los problemas encontrados, no un texto reescrito: quien llama decide
 * si pide una reescritura o si manda lo que hay.
 */
export function medirFormato(texto: string): MedidaDeFormato {
  const t = String(texto || "");
  const problemas: ProblemaDeFormato[] = [];

  if (!t.trim()) {
    return {
      problemas,
      metricas: { frases: 0, lineas: 0, emojis: 0, emojiMasRepetido: 0, palabras: 0, oracionMasLarga: 0 },
    };
  }

  const lineas = t.split("\n").filter((l) => l.trim());
  const frases = frasesDe(t);
  const { total: emojis, maxRepetido } = contarEmojis(t);
  const palabras = t.trim().split(/\s+/).length;
  const oracionMasLarga = frases.reduce((max, f) => Math.max(max, f.split(/\s+/).length), 0);

  // ── La apertura ─────────────────────────────────────────────────────────
  // Es lo PRIMERO que el cliente lee, y el prompt lo prohíbe explícitamente.
  const primera = (lineas[0] || "").trim();
  if (APERTURAS_PROHIBIDAS.test(primera)) {
    problemas.push({
      tipo: "apertura",
      detalle: `arranca con "${primera.slice(0, 24)}". El prompt prohíbe empezar con Perfecto/Claro/Excelente ni con un saludo genérico: entrá directo a lo que el cliente preguntó`,
    });
  }

  // ── Longitud ────────────────────────────────────────────────────────────
  // Las listas tienen su propia licencia: enumerar tres modelos reales no es
  // "folleto". Sin 3+ viñetas, se aplican los topes de la prosa.
  const viñetas = lineas.filter(esViñeta).length;
  const esLista = viñetas >= 3;

  if (!esLista) {
    if (frases.length > MAX_FRASES) {
      problemas.push({
        tipo: "frases",
        detalle: `${frases.length} frases. El prompt pide 2 a 4: decí lo esencial y dejá que pregunte`,
      });
    }
    if (lineas.length > MAX_LINEAS) {
      problemas.push({
        tipo: "lineas",
        detalle: `${lineas.length} bloques separados. Un chat no es un folleto: juntá lo que va junto`,
      });
    }
    if (oracionMasLarga > 40) {
      problemas.push({
        tipo: "parrafo_largo",
        detalle: `una frase de ${oracionMasLarga} palabras. En un celular eso no se lee`,
      });
    }
  }

  // ── Emojis ──────────────────────────────────────────────────────────────
  if (emojis > MAX_EMOJIS) {
    problemas.push({
      tipo: "emojis",
      detalle: `${emojis} emojis. El prompt dice que un emoji suelto está bien y cinco no: dejá los que anclan la idea`,
    });
  } else if (maxRepetido > MAX_REPETIDO) {
    problemas.push({
      tipo: "emoji_repetido",
      detalle: `el mismo emoji ${maxRepetido} veces. Leído de corrido parece un bot`,
    });
  }

  // ── Títulos armados a mano ──────────────────────────────────────────────
  const titulos = lineas.filter(pareceTitulo);
  if (titulos.length && !esLista) {
    problemas.push({
      tipo: "titulo",
      detalle: `"${titulos[0].trim().slice(0, 30)}" parece un título. Esto es un chat: escribilo como se lo dirías hablando`,
    });
  }

  return {
    problemas,
    metricas: {
      frases: frases.length,
      lineas: lineas.length,
      emojis,
      emojiMasRepetido: maxRepetido,
      palabras,
      oracionMasLarga,
    },
  };
}

/** ¿Hay que pedir una reescritura? Solo si hay algo que valga corregir. */
export function hayProblemaDeFormato(texto: string): boolean {
  return medirFormato(texto).problemas.length > 0;
}

/**
 * El texto que se le devuelve al modelo para pedirle la reescritura.
 *
 * Dice QUÉ está mal y QUÉ hacer, en ese orden, y pide una sola corrección. No
 * repite el prompt entero: el modelo ya lo tiene.
 */
export function pedidoDeReescritura(m: MedidaDeFormato): string {
  const lista = m.problemas.map((p) => `- ${p.detalle}`).join("\n");
  return (
    "Tu respuesta quedó mal formateada para WhatsApp. Reescribila UNA vez, sin cambiar lo que dice:\n" +
    lista +
    "\n\nMantené los mismos datos y el mismo tono. Solo el formato: mensaje corto, de chat, sin adorno."
  );
}
