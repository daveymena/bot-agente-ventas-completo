/**
 * Rescatar el JSON de la respuesta de un modelo.
 *
 * Por qué existe: Atlas NO usa function-calling nativo. Le pide al modelo que
 * devuelva `{ "reply": ..., "actions": [...], "done": ... }` como texto y lo
 * parsea con JSON.parse. O sea que publicar un anuncio depende por completo de
 * que el modelo formatee perfecto.
 *
 * Y el operador ROTA entre varios proveedores (opencode, groq, github,
 * openrouter...), empezando por el último que respondió. Se manda
 * `response_format: json_object`, pero no todos lo respetan: los que no,
 * contestan cosas como
 *
 *     Claro, aquí tienes el borrador: { "reply": ..., "actions": [...] }
 *
 * y `JSON.parse` del texto entero revienta. Antes eso costaba un paso completo
 * del turno (se le pedía reformatear); con un modelo que siempre agrega
 * preámbulo, se agotaban los pasos y el anuncio NUNCA se publicaba. Para el
 * admin se ve como "a veces publica y a veces no", que es exactamente lo que
 * pasa: depende de qué proveedor de la rotación contestó.
 *
 * Esto no reemplaza el reintento: lo evita cuando el JSON está ahí y solo
 * viene envuelto en palabras.
 */

/**
 * Devuelve el objeto JSON contenido en `texto`, o null si no hay ninguno.
 *
 * Estrategia, en orden:
 *  1. Sacar las vallas de markdown (```json ... ```), que es el caso más común.
 *  2. Parsear el texto entero: si el modelo hizo las cosas bien, termina acá.
 *  3. Si no, recortar desde la PRIMERA llave hasta la ÚLTIMA y parsear eso.
 *     Cubre preámbulo y epílogo en la misma pasada.
 */
export function extraerJSON(texto: string): any | null {
  const limpio = String(texto || "")
    .replace(/```json\r?\n?/gi, "")
    .replace(/```\r?\n?/g, "")
    .trim();
  if (!limpio) return null;

  try {
    const directo = JSON.parse(limpio);
    // Un modelo puede devolver `"texto"` o `123`, que son JSON válidos pero no
    // la respuesta que se le pidió. Solo sirve un objeto.
    if (directo && typeof directo === "object" && !Array.isArray(directo)) return directo;
  } catch {
    // Sigue al recorte.
  }

  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1 || fin <= inicio) return null;

  try {
    const recortado = JSON.parse(limpio.slice(inicio, fin + 1));
    if (!recortado || typeof recortado !== "object" || Array.isArray(recortado)) return null;

    // El recorte por llaves es agresivo a propósito, y por eso hay que
    // verificar la FORMA: si el modelo devolvió `[{"tool":"fb_ad_draft"}]`,
    // el recorte pesca el objeto de adentro del array y parece válido. Darlo
    // por bueno sería peor que fallar: `parsed.actions` quedaría undefined y
    // el turno terminaría en silencio, sin publicar y sin avisar de nada.
    // Devolviendo null se dispara el reintento, que sí puede arreglarlo.
    const tieneForma = "reply" in recortado || "actions" in recortado || "done" in recortado;
    return tieneForma ? recortado : null;
  } catch {
    return null;
  }
}
