/**
 * ============================================================
 * LEER LA FICHA QUE EL DUEÑO YA ESCRIBIÓ
 * ============================================================
 *
 * La descripción de cada producto viene estructurada a mano, con sus propios
 * emojis y sus propios bloques. La del curso de piano, tal cual está en la
 * base:
 *
 *   🎹 CURSO COMPLETO DE PIANO — DE CERO A AVANZADO
 *
 *   Aprendé a tocar piano paso a paso, desde los fundamentos...
 *
 *   📚 QUÉ VAS A APRENDER
 *   🎹 Tocar piano: independencia y coordinación de ambas manos...
 *
 *   📦 QUÉ INCLUYE
 *   🎬 19 módulos en video con teoría y lenguaje musical...
 *   🎵 Repertorio: 5 valses de Alberto Martínez, baladas, pop, blues y jazz...
 *   🎻 Técnicas de acompañamiento y música clásica moderna.
 *   📱 Estudiá desde tu celular o computador, donde quieras.
 *
 *   📩 Escríbenos para empezar hoy mismo. 🚀
 *
 * Y el armador de la ficha hacía `descripcion.replace(/\s+/g, " ")` y cortaba
 * a 180 caracteres. O sea que tiraba TODO ese trabajo a la basura y lo que le
 * llegaba al cliente era el título repetido --porque la tarjeta ya lo pone
 * arriba-- pegado a media frase:
 *
 *   *CURSO DE PIANO COMPLETO: DE CERO A NIVEL AVANZADO*
 *   🎹 CURSO COMPLETO DE PIANO — DE CERO A AVANZADO Aprendé a tocar piano
 *   paso a paso, desde los fundamentos hasta las técnicas avanzadas...
 *   🎼 De cero a avanzado
 *   🎼 Partituras y ejercicios
 *
 * Dos emojis iguales adivinados por una tabla, mientras el producto traía
 * 🎬 🎵 🎻 📱 escritos a mano y describiendo cada cosa.
 *
 * Este módulo lee esa estructura en vez de aplanarla. No inventa nada: todo lo
 * que devuelve estaba escrito en la descripción.
 */

/** Cualquier emoji, incluidos los que llevan modificadores. */
const EMOJI = /\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/u;
const EMPIEZA_CON_EMOJI = new RegExp(`^\\s*(${EMOJI.source})\\s*`, "u");

export interface PuntoDeFicha {
  /** El emoji que el dueño le puso a ESTA línea. */
  emoji: string;
  texto: string;
}

export interface FichaLeida {
  /** El emoji del producto, tomado de su propio título. "" si no tiene. */
  emoji: string;
  /** El párrafo de presentación, sin el título repetido. */
  intro: string;
  /** Las líneas con emoji propio, en el orden en que las escribió el dueño. */
  puntos: PuntoDeFicha[];
}

const sinTildes = (t: string) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Deja solo letras y números, para comparar un título con el nombre. */
const soloLetras = (t: string) =>
  sinTildes(t).replace(EMOJI, " ").replace(/[^a-z0-9ñ]+/gi, "");

/**
 * ¿Este bloque es el título, que la tarjeta ya pone arriba?
 *
 * No se compara palabra por palabra: "CURSO COMPLETO DE PIANO — DE CERO A
 * AVANZADO" y "Curso de Piano Completo: De Cero a Nivel Avanzado" son el mismo
 * título escritos distinto. Se mira si comparten la mayor parte de sus
 * palabras largas.
 */
function esElTitulo(bloque: string, nombre: string): boolean {
  const b = soloLetras(bloque);
  const n = soloLetras(nombre);
  if (!b || !n) return false;
  if (b === n || b.includes(n) || n.includes(b)) return true;

  // Un titulo es CORTO. Sin esto, una descripcion de un solo parrafo que
  // nombra el producto ("Curso practico para aprender a manejar Excel desde
  // cero, con ejercicios." para "Curso de Excel") se tomaba por titulo y se
  // descartaba entera: el cliente se quedaba sin presentacion.
  const cuentaPalabras = (t: string) => (sinTildes(t).match(/[a-zñ0-9]+/g) ?? []).length;
  const palabrasBloque = cuentaPalabras(bloque);
  const palabrasNombre = cuentaPalabras(nombre);
  if (palabrasNombre === 0) return false;
  if (palabrasBloque > palabrasNombre * 2) return false;

  const palabras = (t: string) => new Set(sinTildes(t).match(/[a-zñ0-9]{4,}/g) ?? []);
  const pb = palabras(bloque);
  const pn = palabras(nombre);
  if (pb.size === 0 || pn.size === 0) return false;
  let comunes = 0;
  for (const w of pn) if (pb.has(w)) comunes++;
  return comunes / pn.size >= 0.6;
}

/**
 * Bloques que son un encabezado de sección ("📚 QUÉ VAS A APRENDER").
 *
 * Se descartan: en una página web ordenan la lectura, pero en WhatsApp son una
 * línea que no dice nada y empujan hacia abajo lo que sí importa.
 */
function esEncabezado(texto: string): boolean {
  const limpio = texto.replace(EMPIEZA_CON_EMOJI, "").trim();
  if (!limpio || limpio.length > 40) return false;
  // Sin signos de puntuación de frase y en mayúsculas: es un rótulo.
  return !/[.,;:]/.test(limpio) && limpio === limpio.toUpperCase();
}

/**
 * La despedida que cierra la descripción ("📩 Escríbenos para empezar hoy").
 *
 * En la web invita a escribir. En WhatsApp el cliente YA está escribiendo:
 * repetírselo ahí lo trata como si no estuviera en la conversación.
 */
function esLlamadoAEscribir(texto: string): boolean {
  // ⚠️ Aca estaba la palabra "whatsapp" suelta, y eso borraba features reales:
  // el curso de IA tiene una linea "🔗 Conecta WhatsApp, Telegram, Slack y
  // Google" que desaparecia de la ficha sin que nadie se enterara. Justo el
  // defecto que se estaba arreglando --informacion a medias-- introducido por
  // el arreglo.
  //
  // Ahora se exige el VERBO de invitacion dirigido al cliente. "Escribenos por
  // WhatsApp" es un llamado; "Conecta WhatsApp" es lo que el curso enseña.
  return /\b(escr[ií]b[ei]nos|escr[ií]beme|cont[aá]ctanos|contactenos|escribinos)\b/i.test(texto)
    || /\b(empezar|comenzar) hoy\b|\bno te lo pierdas\b|\bap[uú]rate\b|\b[uú]ltimos cupos\b/i.test(texto);
}

/**
 * Lee la descripción respetando lo que el dueño escribió.
 *
 * Si la descripción no tiene estructura (un párrafo suelto sin emojis),
 * `puntos` viene vacío y el llamador cae a las `features`, que es lo que se
 * hacía antes.
 */
export function leerFicha(descripcion: string | null | undefined, nombre: string): FichaLeida {
  const crudo = String(descripcion || "").replace(/\r/g, "");
  const bloques = crudo
    .split(/\n\s*\n|\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  let emoji = "";
  let intro = "";
  const puntos: PuntoDeFicha[] = [];

  for (const [i, bloque] of bloques.entries()) {
    const m = bloque.match(EMPIEZA_CON_EMOJI);
    const suEmoji = m?.[1] ?? "";
    const texto = bloque.replace(EMPIEZA_CON_EMOJI, "").trim();

    // El título: su emoji es el del producto, y el texto se descarta porque la
    // tarjeta ya lo muestra arriba.
    if (i === 0 && esElTitulo(bloque, nombre)) {
      if (suEmoji) emoji = suEmoji;
      continue;
    }
    if (esEncabezado(bloque)) continue;
    if (esLlamadoAEscribir(texto)) continue;

    if (suEmoji) {
      puntos.push({ emoji: suEmoji, texto: texto.replace(/\s+/g, " ") });
    } else if (!intro) {
      intro = texto.replace(/\s+/g, " ");
    }
  }

  return { emoji, intro, puntos };
}

/**
 * Cuanto texto entra en un pie de foto de WhatsApp.
 *
 * El limite real ronda los 1024 caracteres y WhatsApp corta EN SECO lo que
 * sobra: sin aviso, a mitad de palabra. La ficha va como pie de la imagen del
 * producto, asi que una descripcion rica se entregaba mutilada.
 *
 * Se deja margen porque encima del cuerpo van el titulo, el resumen y el
 * cierre, y porque los emojis pesan mas de un caracter.
 */
export const PRESUPUESTO_PIE_DE_FOTO = 900;

/**
 * Reparte los puntos entre los que ENTRAN y los que quedan para despues.
 *
 * Nunca parte un punto por la mitad: o entra entero o pasa al resto. Un punto
 * cortado es peor que uno ausente, porque el cliente lee una frase que no
 * termina y no sabe si el problema es del producto o del bot.
 *
 * Y no se muestra un "y N cosas mas": eso es justo lo que se siente como
 * informacion a medias. Lo que falta se cuenta cuando el cliente pregunta,
 * que es cuando de verdad lo quiere saber.
 */
export function repartirPuntos(
  puntos: PuntoDeFicha[],
  presupuesto = PRESUPUESTO_PIE_DE_FOTO,
  maximo = 6,
): { entran: PuntoDeFicha[]; resto: PuntoDeFicha[] } {
  const entran: PuntoDeFicha[] = [];
  const resto: PuntoDeFicha[] = [];
  let usado = 0;

  for (const p of puntos) {
    const cuesta = p.emoji.length + 1 + p.texto.length + 1;
    if (entran.length < maximo && usado + cuesta <= presupuesto) {
      entran.push(p);
      usado += cuesta;
    } else {
      resto.push(p);
    }
  }

  // Si no entro ninguno --puntos larguisimos-- entra el primero igual: una
  // ficha sin nada debajo del titulo no dice nada del producto.
  if (entran.length === 0 && puntos.length > 0) {
    entran.push(puntos[0]);
    resto.shift();
  }
  return { entran, resto };
}
