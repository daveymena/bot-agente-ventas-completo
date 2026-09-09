/**
 * ============================================================
 * UNA RESPUESTA, UNA BURBUJA — salvo que haya razón para partirla
 * ============================================================
 *
 * El admin lo pidió el 2026-09-06, después de leer una conversación entera:
 * "el motor de respuesta debe generar un único mensaje lógico por interacción;
 * no dividir una respuesta en múltiples mensajes salvo que exista una razón
 * conversacional real".
 *
 * Así llegaba un turno (conversación real, 06-09):
 *
 *   [13:23] 💰 $60.000 COP  ¿Te muestro cómo es por dentro? 🎬
 *   [13:23] Entonces te comparto los datos del curso de IA...
 *   [13:23] Son 3 cursos, 52 módulos en video 🤖 ...
 *
 * Tres burbujas en el mismo minuto para una sola idea.
 *
 * ── Por qué esto NO es "juntar todo" ─────────────────────────────────────
 *
 * La ficha se parte a propósito, y la razón sigue siendo buena: un mensaje de
 * 30 líneas tapa la pantalla del celular. Eso no cambia.
 *
 * Lo que se corrige es lo otro: pedazos de TEXTO seguidos que son una sola
 * idea partida en tres. La regla queda:
 *
 *   · varios textos seguidos  → un mensaje    (eran una idea partida)
 *   · foto + texto            → siguen aparte (la foto es su propia burbuja)
 *
 * Es la diferencia entre "alguien escribiendo" y "un sistema imprimiendo
 * campos", que es exactamente como lo describió el admin.
 */

export interface ParteDeRespuesta {
  kind: string;
  content?: string | null;
  [k: string]: any;
}

/**
 * Junta los textos SEGUIDOS en uno solo.
 *
 * No toca las fichas, los videos ni nada que no sea texto: esos son otra cosa
 * y tienen su propio motivo para ir aparte. Y no reordena nada — el orden en
 * que el agente decidió decir las cosas se respeta.
 *
 * Los pega con línea en blanco en el medio, que es como se separa un párrafo
 * en WhatsApp. Sin eso quedarían dos frases pegadas que se leen como una sola.
 */
export function unirTextosSeguidos<T extends ParteDeRespuesta>(partes: T[]): T[] {
  const out: T[] = [];

  for (const p of partes || []) {
    const texto = p?.kind === "text" ? String(p.content ?? "").trim() : null;

    // Un texto vacío no es un mensaje: es una burbuja en blanco.
    if (p?.kind === "text" && !texto) continue;

    const previa = out[out.length - 1];
    if (texto && previa?.kind === "text") {
      const antes = String(previa.content ?? "").trim();
      // Si el pedazo nuevo ya está adentro del anterior, no se repite. Pasa
      // cuando el supervisor reescribe y deja el original al lado.
      if (antes.includes(texto)) continue;
      (previa as any).content = `${antes}\n\n${texto}`;
      continue;
    }

    out.push(p);
  }

  return out;
}

/**
 * Junta los renglones de una ficha en un solo mensaje de seguimiento.
 *
 * `mensajesDeSeccion` devuelve la ficha ya partida: el primero va como pie de
 * la foto y el resto salían como mensajes sueltos, uno cada 900ms. Con cuatro
 * pedazos eso son cuatro burbujas seguidas.
 *
 * Se conserva el primero aparte --es el pie de foto, y ahí sí tiene sentido--
 * y todo lo demás se junta en UNO. La pantalla no se tapa (la foto ya ocupó su
 * lugar) y la conversación deja de verse como una ametralladora.
 */
export function unirElRestoDeLaFicha(mensajes: string[]): string[] {
  const limpios = (mensajes || []).map((m) => String(m ?? "").trim()).filter(Boolean);
  if (limpios.length <= 1) return limpios;
  const out = [limpios[0]!];
  let textos: string[] = [];
  const soltarTextos = () => {
    if (textos.length) out.push(textos.join("\n\n"));
    textos = [];
  };
  for (const mensaje of limpios.slice(1)) {
    // El enlace de video merece su propia burbuja y su vista previa. Nunca se
    // lo mezcla con el cierre comercial.
    if (/https?:\/\/\S+/i.test(mensaje)) {
      soltarTextos();
      out.push(mensaje);
    } else {
      textos.push(mensaje);
    }
  }
  soltarTextos();
  return out;
}
