/**
 * ============================================================
 * ¿EL CLIENTE NOMBRÓ UN PRODUCTO QUE SÍ EXISTE?
 * ============================================================
 *
 * Medido contra producción el 2026-09-04, con el agente completo:
 *
 *   cliente: "¿cuál es la diferencia real entre el curso de marketing digital
 *             y el de desarrollo web para lo que necesito?"
 *   bot:     "Hmm, creo que no tengo ese producto en el catálogo 😅. Lo que sí
 *             manejo es: INGLES, MARKETING DIGITAL, FX PREMIERE,
 *             DESARROLLO WEB, ..."
 *
 * Dice que no lo tiene Y LO LISTA EN LA MISMA FRASE. Los dos que le pidieron.
 *
 * ── Por qué pasa ─────────────────────────────────────────────────────────
 *
 * El candado que produce esa respuesta existe por una razón seria: la IA
 * fabricaba productos que no existen, con detalle inventado ("el de pastas te
 * enseña desde la masa base hasta rellenos y salsas"). Es el peor error posible
 * en un bot de ventas, porque es el único que el cliente puede verificar solo.
 *
 * Pero se dispara con `productSearchFailed`, que significa "el buscador no
 * pudo resolver UN producto". Y cuando el cliente nombra DOS para compararlos,
 * el buscador tampoco resuelve uno solo: falla igual. Ahí el candado cambia una
 * comparación legítima --de mercancía real-- por una negación falsa.
 *
 * El momento en que un cliente compara dos productos es el momento en que está
 * por decidir. Perderlo ahí es caro.
 *
 * ── Qué resuelve este módulo ────────────────────────────────────────────
 *
 * Una pregunta chica y verificable: ¿alguno de los productos del catálogo está
 * NOMBRADO en el mensaje del cliente? Si la respuesta es sí, decir "no tengo
 * ese producto" es demostrablemente falso, y el candado no debe tapar la
 * respuesta.
 *
 * No decide qué contestar. Solo desmiente la negación cuando es mentira.
 */

/** Sin acentos, sin puntuación, en minúscula. Para comparar lo que se lee. */
function comoSeLee(texto: string): string {
  const ACENTOS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" };
  return String(texto || "")
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ACENTOS[c] ?? c)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palabras que aparecen en medio catálogo y no identifican nada.
 *
 * Sin esto, un producto llamado "CURSO COMPLETO" haría que CUALQUIER mensaje
 * que diga "curso" cuente como nombrarlo, y el candado anti-invento quedaría
 * apagado justo para el caso que existe para atajar.
 */
const GENERICAS = new Set([
  "curso", "cursos", "producto", "productos", "pack", "combo", "premium",
  "completo", "completa", "basico", "basica", "avanzado", "avanzada",
  "para", "con", "del", "las", "los", "una", "uno", "por", "que", "mas",
  "nivel", "clase", "clases", "taller", "plan", "gratis", "nuevo", "nueva",
]);

/** Las palabras del nombre que de verdad lo identifican. */
function palabrasQueIdentifican(nombre: string): string[] {
  return comoSeLee(nombre)
    .split(" ")
    .filter((p) => p.length >= 4 && !GENERICAS.has(p));
}

/**
 * Los productos del catálogo que el cliente nombró en su mensaje.
 *
 * Un producto cuenta como nombrado si TODAS sus palabras identificatorias
 * aparecen en el mensaje. Se exige todas y no algunas a propósito: con "alguna"
 * bastaría decir "web" para dar por nombrado "DESARROLLO WEB", y también
 * "DISEÑO WEB" y "HOSTING WEB" -- tres productos distintos por una palabra
 * suelta. Pedir el nombre entero es lo que hace que esto sea evidencia y no
 * una corazonada.
 *
 * Un producto sin ninguna palabra identificatoria (llamado solo "Curso") no
 * puede contar: no hay forma de nombrarlo sin ambigüedad.
 */
export function productosNombrados(
  mensaje: string,
  productos: Array<{ name?: string | null } | null | undefined>,
): string[] {
  const texto = ` ${comoSeLee(mensaje)} `;
  if (!texto.trim()) return [];

  const encontrados: string[] = [];
  for (const p of productos || []) {
    const nombre = String(p?.name || "").trim();
    if (!nombre) continue;
    const claves = palabrasQueIdentifican(nombre);
    if (claves.length === 0) continue;
    if (claves.every((k) => texto.includes(` ${k} `) || texto.includes(` ${k}s `))) {
      encontrados.push(nombre);
    }
  }
  return encontrados;
}

/**
 * ¿Decir "no tengo ese producto" sería mentira?
 *
 * Es la pregunta que el candado necesita antes de reemplazar una respuesta:
 * si el cliente nombró algo del catálogo, negarlo es falso y además queda en
 * evidencia, porque el propio mensaje de negación lista los productos.
 */
export function negarloSeriaMentira(
  mensaje: string,
  productos: Array<{ name?: string | null } | null | undefined>,
): boolean {
  return productosNombrados(mensaje, productos).length > 0;
}
