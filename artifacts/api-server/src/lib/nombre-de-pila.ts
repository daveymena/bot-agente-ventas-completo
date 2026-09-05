/**
 * ============================================================
 * AL CLIENTE SE LE HABLA POR EL NOMBRE, NO POR EL NOMBRE COMPLETO
 * ============================================================
 *
 * Producción, 2026-09-05 07:48:
 *
 *   cliente: "Hola"
 *   bot:     "¡Duvier Mena! 😊 Cuéntame en qué te puedo ayudar."
 *
 * Nadie saluda a un conocido con el apellido. Es de las señales más rápidas de
 * que del otro lado hay una máquina leyendo un campo, y aparece en el PRIMER
 * mensaje -- justo donde se decide si vale la pena seguir escribiendo.
 *
 * El nombre sale del `pushName` de WhatsApp, que el cliente escribió una vez
 * para todo el mundo: "Duvier Mena", "MARIA FERNANDA", "Andrés | Ventas".
 *
 * ── Por qué existe este archivo y no un `.split(" ")[0]` más ──────────────
 *
 * Porque ya había uno. `conversation-engine.ts` cortaba el nombre desde hacía
 * tiempo, y `facebook-comments.ts` también; el atajo hardcodeado de `agent.ts`
 * --que es el que contesta los saludos-- no. Arreglado en dos lados de tres, y
 * el que faltaba era el que más se ve.
 *
 * Es el mismo patrón que ya mordió con el diccionario de emojis y con el aviso
 * de contradicción: se arregla una copia y la gemela queda intacta. Con una
 * sola función el proximo arreglo llega a todos.
 */

/** Nombres que no son nombres: no se saluda con ellos. */
const NO_ES_NOMBRE = new Set([
  "cliente",
  "usuario",
  "user",
  "contacto",
  "whatsapp",
  "null",
  "undefined",
]);

/**
 * El nombre con el que se le habla.
 *
 * Devuelve `null` cuando no hay uno usable, para que quien llame decida el
 * saludo sin nombre. Nunca devuelve cadena vacía: un `¡Hola !` con el espacio
 * colgando delata lo mismo que el apellido.
 */
export function nombreDePila(nombre: unknown): string | null {
  let t = String(nombre ?? "").trim();
  if (!t) return null;

  // "Andrés | Ventas", "María - Tienda": la gente pone su rubro en el nombre
  // de WhatsApp. Lo que va antes del separador es la persona.
  t = t.split(/[|·•/\\]|\s[-–—]\s/)[0].trim();

  // Los emojis y adornos del pushName ("✨Duvier✨") no son parte del nombre.
  t = t.replace(/[^\p{L}\p{M}\s'.-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;

  const primera = t.split(" ")[0].replace(/[.'-]+$/, "");
  if (!primera) return null;
  if (NO_ES_NOMBRE.has(primera.toLowerCase())) return null;

  // Una inicial suelta ("J. Pérez") no sirve para saludar.
  if (primera.replace(/[^\p{L}]/gu, "").length < 2) return null;

  // ⚠️ "MARIA FERNANDA" llega en mayúsculas de imprenta desde el pushName, y
  // gritarle el nombre al cliente se lee igual de automático que el apellido.
  // Solo se reescribe cuando viene TODO en mayúsculas: "McCarthy" y "DeSoto"
  // se dejan como los escribió su dueño.
  if (primera === primera.toLocaleUpperCase("es") && primera.length > 1) {
    return primera.charAt(0) + primera.slice(1).toLocaleLowerCase("es");
  }
  return primera;
}
