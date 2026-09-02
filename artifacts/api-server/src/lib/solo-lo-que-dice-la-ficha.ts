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

export function lineasDeTemarioInventadas(
  texto: string,
  producto: ProductoConFicha | null | undefined,
): string[] {
  const ficha = N(`${producto?.name || ""} ${producto?.description || ""}`);
  // Sin ficha no hay contra qué comparar: no se acusa a nadie sin prueba.
  if (ficha.trim().length < 40) return [];

  const inventadas: string[] = [];
  for (const linea of String(texto || "").split("\n")) {
    if (!LINEA_DE_TEMARIO.test(linea)) continue;
    const palabras = N(linea)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !VACIAS.has(w));
    if (palabras.length === 0) continue;
    // Con que UNA palabra con peso esté en la ficha, se acepta.
    const respaldada = palabras.some((w) => ficha.includes(w));
    if (!respaldada) inventadas.push(linea);
  }
  return inventadas;
}

export function sinElTemarioInventado(
  texto: string,
  producto: ProductoConFicha | null | undefined,
): string {
  const malas = new Set(lineasDeTemarioInventadas(texto, producto));
  if (malas.size === 0) return texto;
  return String(texto || "")
    .split("\n")
    .filter((l) => !malas.has(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
