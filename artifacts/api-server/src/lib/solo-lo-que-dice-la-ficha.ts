/**
 * ============================================================
 * DEL PRODUCTO SOLO SE AFIRMA LO QUE DICE SU FICHA
 * ============================================================
 *
 * Conversación real del 2026-09-02, 09:45, curso de IA (id 124, digital, con
 * enlace de entrega). Dos mentiras en el mismo mensaje:
 *
 *   "📚 Módulo 1 – Fundamentos de IA
 *    🛠️ Módulo 2 – Herramientas esenciales
 *    ⚙️ Módulo 3 – Agentes autónomos
 *    📦 Módulo 4 – Proyectos prácticos
 *    Pago contra entrega: pagas cuando recibes el material en tu WhatsApp"
 *
 * Ese temario NO EXISTE. El curso real es "MASTER EN AGENTES IA — 39 módulos",
 * "CURSO COMPLETO DE CLAUDE AI — 13 módulos", n8n, Claude Code, OpenClaw. El
 * bot se inventó un plan de estudios de cuatro módulos y se lo describió al
 * cliente como si fuera el producto. Y un mensaje después mandó la ficha de
 * verdad, contradiciéndose solo.
 *
 * ── De dónde salía el "contra entrega" ───────────────────────────────────
 *
 * No del código. El agente activo tiene esto escrito en su prompt, en la base
 * de datos:
 *
 *   🚚 CÓMO FUNCIONA LA ENTREGA (datos FIJOS, nunca los cambies)
 *   • Entrega en 3 a 5 días hábiles...
 *   • PAGO CONTRA ENTREGA: paga en efectivo cuando recibe el paquete.
 *
 * Es una plantilla de dropshipping puesta sobre un negocio que vende cursos.
 * El prompt le ordena no cambiarlo, y el modelo obedece. Ningún arreglo del
 * camino de envíos lo podía tapar, porque el texto no venía de ahí.
 *
 * Y ese es justamente el punto: **la personalidad del agente es un dato que
 * escribe el dueño, y puede estar mal.** El servidor tiene que poder
 * desmentirla cuando contradice al producto. Un curso que llega por un enlace
 * no se paga contra entrega, lo diga quien lo diga.
 */

const N = (s: unknown) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export interface ProductoConFicha {
  id?: number;
  name?: string | null;
  description?: string | null;
  kind?: string | null;
  deliveryLink?: string | null;
}

/** Lo que solo puede ser cierto de algo que viaja en un camión. */
const PROMESA_FISICA =
  /\bpago contra ?entrega\b|\bcontra ?entrega\b|\bpagas? cuando (lo )?recib\w+\b|\bpaga(s|r)? al recibir\b|\bdias habiles\b|\bdías hábiles\b|\bnumero de guia\b|\btransportadora\b|\bcuando (te )?llegue el paquete\b|\benvio a todo el pais\b|\bmensajero\b/i;

/**
 * ¿Este mensaje le promete a alguien una entrega física de algo digital?
 *
 * Solo se pregunta cuando el producto en juego es digital -- que es cuando la
 * promesa es imposible de cumplir.
 */
export function prometeEntregaFisica(texto: string, producto: ProductoConFicha | null | undefined): boolean {
  if (!producto) return false;
  const kind = N(producto.kind);
  const esFisico = kind === "physical" || kind === "fisico" || kind === "dropshipping";
  if (esFisico) return false;
  return PROMESA_FISICA.test(N(texto));
}

/** Las líneas que hacen esa promesa, para poder sacarlas sin llevarse el resto. */
export function sinLaPromesaFisica(texto: string): string {
  const lineas = String(texto || "").split("\n");
  const quedan = lineas.filter((l) => !PROMESA_FISICA.test(N(l)));
  return quedan.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * El temario que el modelo escribió, ¿está en la ficha del dueño?
 *
 * Se buscan las líneas que enumeran contenido ("Módulo 1 – ...", "Clase 2:
 * ...", "Unidad 3 ..."). Cada una tiene que poder respaldarse con la
 * descripción real: si el dueño no lo escribió, el bot no lo puede afirmar.
 *
 * El listón es bajo a propósito -- alcanza con que UNA palabra con peso de la
 * línea aparezca en la ficha. No se trata de que el modelo copie literal, sino
 * de que no invente un plan de estudios entero, que es lo que pasó.
 */
const LINEA_DE_TEMARIO =
  /^\s*[^\p{L}\p{N}]{0,4}\s*(modulo|módulo|clase|unidad|leccion|lección|capitulo|capítulo|nivel)\s*n?[°º]?\s*\d+/iu;

/** Palabras sin peso: aparecen en cualquier texto y no prueban nada. */
const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "en", "con", "para", "por", "un", "una",
  "que", "como", "sus", "tus", "mas", "muy", "todo", "toda", "desde", "hasta", "sin",
  "aprende", "aprendes", "curso", "modulo", "modulos", "clase", "clases", "unidad",
  "leccion", "lecciones", "capitulo", "nivel", "practico", "practicos", "ejemplos",
  "paso", "cero", "avanzado", "completo", "principales", "esenciales",
]);

/**
 * El marcador de temario, EN CUALQUIER PARTE del texto -- no solo al principio
 * de un renglón.
 *
 * ⚠️ La primera versión medía por línea, y se le escapó el caso del curso de
 * piano (2026-09-02, 10:42): el mensaje llegó casi entero en UNA sola línea, y
 * ahí "Nivel 1 – Fundamentos... Nivel 2 – Lectura musical..." quedaba mezclado
 * con el resto del texto, que sí está respaldado. El renglón entero pasaba.
 *
 * WhatsApp junta líneas, y el modelo escribe corrido tan seguido como en
 * bloques. Medir por renglón es medir por como quedó formateado, no por lo que
 * dice.
 */
const MARCADOR_DE_TEMARIO =
  /(m[oó]dulo|clase|unidad|lecci[oó]n|cap[ií]tulo|nivel)\s*n?[°º]?\s*\d+/giu;

/**
 * Cuánto de un bloque está respaldado por la ficha.
 *
 * Antes alcanzaba con UNA palabra, y para un renglón corto estaba bien. Para un
 * bloque entero no: cualquier párrafo largo acierta una palabra por casualidad.
 * El "Nivel 1 – Fundamentos: conoce el teclado y las notas, postura correcta de
 * manos y cuerpo" tiene ocho palabras con peso y solo "manos" está en la ficha
 * -- una de ocho, y con el criterio viejo pasaba.
 *
 * Un tercio es el corte: un temario de verdad reusa el vocabulario del
 * producto; uno inventado casi no lo toca.
 */
const RESPALDO_MINIMO = 1 / 3;

function respaldo(bloque: string, ficha: string): { ratio: number; conPeso: number } {
  const palabras = N(bloque)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !VACIAS.has(w));
  if (palabras.length === 0) return { ratio: 1, conPeso: 0 };
  const apoyadas = palabras.filter((w) => ficha.includes(w)).length;
  return { ratio: apoyadas / palabras.length, conPeso: palabras.length };
}

/**
 * Los pedazos de temario que el producto no respalda.
 *
 * Se corta el texto EN los marcadores: cada bloque va desde un "Módulo N" o
 * "Nivel N" hasta el siguiente. Así da igual si el modelo escribió en renglones
 * o de corrido.
 */
export function lineasDeTemarioInventadas(
  texto: string,
  producto: ProductoConFicha | null | undefined,
): string[] {
  const ficha = N(`${producto?.name || ""} ${producto?.description || ""}`);
  // Sin ficha no hay contra qué comparar: no se acusa a nadie sin prueba.
  if (ficha.trim().length < 40) return [];

  const t = String(texto || "");
  const marcas: number[] = [];
  for (const m of t.matchAll(MARCADOR_DE_TEMARIO)) {
    if (typeof m.index === "number") marcas.push(m.index);
  }
  if (marcas.length === 0) return [];

  const inventadas: string[] = [];
  for (let i = 0; i < marcas.length; i++) {
    const desde = marcas[i];
    const hasta = i + 1 < marcas.length ? marcas[i + 1] : t.length;
    const bloque = t.slice(desde, hasta).trim();
    if (!bloque) continue;
    const { ratio, conPeso } = respaldo(bloque, ficha);
    // Un bloque sin ninguna palabra con peso es solo un encabezado: no afirma
    // nada, no se toca.
    if (conPeso === 0) continue;
    if (ratio < RESPALDO_MINIMO) inventadas.push(bloque);
  }
  return inventadas;
}

/**
 * Saca el temario cuando alguna parte está inventada.
 *
 * Cae ENTERO, no solo los bloques marcados. Sacando los inventados y dejando
 * los demás quedaba un "Nivel 2" suelto, sin 1, 3 ni 4 -- una lista con
 * huecos se lee peor que ninguna, y el cliente se pregunta qué le falta.
 *
 * Y hay un motivo de fondo: si el modelo se invento parte del plan de
 * estudios, la lista entera dejó de ser confiable. El contenido real ya va en
 * la ficha, que la escribió el dueño.
 *
 * Si NADA está inventado no se toca nada: un temario que sale de la ficha sale
 * completo.
 */
export function sinElTemarioInventado(
  texto: string,
  producto: ProductoConFicha | null | undefined,
): string {
  const malas = lineasDeTemarioInventadas(texto, producto);
  if (malas.length === 0) return texto;

  const t = String(texto || "");
  const marcas: number[] = [];
  for (const m of t.matchAll(MARCADOR_DE_TEMARIO)) {
    if (typeof m.index === "number") marcas.push(m.index);
  }
  if (marcas.length === 0) return texto;

  // Desde el primer marcador hasta donde termina el ultimo bloque.
  const desde = marcas[0];
  const ultimo = t.slice(marcas[marcas.length - 1]);
  const hasta = t.length - (ultimo.length - ultimo.trimEnd().length);

  const salida = (t.slice(0, desde) + " " + t.slice(hasta))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Sacar la lista deja al mensaje prometiendo un contenido que ya no está --
  // "Te paso el contenido completo:" y después nada. Se remite a la ficha, que
  // es donde el contenido SÍ es el que escribió el dueño, y que el servidor
  // manda en este mismo turno. Es el mismo remedio que usa el candado de
  // precios cuando tiene que sacar un monto.
  const pie = "Te dejo la ficha completa acá abajo 👇";
  return salida ? `${salida}\n\n${pie}` : pie;
}

/**
 * Lo que corresponde decir de la entrega de ESTE producto, con los datos
 * reales. Reemplaza --no discute-- lo que dijera la personalidad del agente.
 */
export function comoSeEntregaDeVerdad(producto: ProductoConFicha): string {
  return producto.deliveryLink
    ? "📩 Te llega por un enlace de acceso apenas confirmemos el pago."
    : "📩 Es digital: te lo enviamos por aquí mismo apenas confirmemos el pago.";
}
