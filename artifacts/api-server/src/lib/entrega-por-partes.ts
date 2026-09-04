/**
 * ENTREGAR A MEDIDA QUE SE TERMINA, EN VEZ DE TODO JUNTO AL FINAL.
 *
 * Pedido el 2026-09-03: "lo más importante: que no dé todo de una, sino que
 * entregue por partes, ya que se está agotando el tiempo de respuestas".
 *
 * El servidor YA parte un pedido grande en tareas y las resuelve una por una
 * (`partesPendientes` en operator-opencode.ts). Lo que hacía era acumularlas
 * todas en un solo texto y mandarlo recién al terminar la última. Con un
 * presupuesto de 135s por turno y ~45s por parte, eso significa que un turno
 * que se corta en la parte 3 entrega CERO -- las dos partes que ya estaban
 * hechas se pierden con él.
 *
 * Ahora cada parte sale apenas está lista. Si el turno se muere después, lo
 * entregado sigue entregado.
 *
 * ── Por qué hace falta restar, y por qué se puede restar sin adivinar ──────
 *
 * Las partes se siguen acumulando en el texto completo, porque los candados
 * del final (el que detecta "ya lo hice" sin haberlo hecho, el que revisa las
 * promesas, el supervisor) tienen que juzgar TODO lo que se dijo en el turno,
 * no el último pedazo. Si se los alimentara solo con la última parte, un
 * "borrador guardado" escrito en la parte 2 pasaría sin control.
 *
 * Entonces el texto final contiene lo ya entregado. Mandarlo tal cual
 * repetiría en pantalla todo lo que el admin acaba de leer, así que se resta.
 *
 * Y se puede restar sin heurísticas porque el mismo archivo controla las dos
 * puntas: la parte se agrega VERBATIM y se resta VERBATIM. No hay que
 * adivinar dónde empieza ni dónde termina.
 *
 * Lo que NO se resta son los avisos que los candados agregan arriba o abajo:
 * esos son nuevos y tienen que llegar. Es la razón por la que esto no se
 * resuelve cortando por longitud -- el aviso de "todavía no se guardó nada" se
 * antepone al texto, así que el largo entregado deja de coincidir con el
 * principio del mensaje.
 */

/** Lo que se manda cuando no quedó nada nuevo que decir. */
export const CIERRE_SIN_NOVEDAD = "Listo, eso era todo lo que faltaba.";

/**
 * Saca del texto final las partes que ya se entregaron por separado.
 *
 * `partes` son los textos EXACTOS que se emitieron. Cada uno se quita una sola
 * vez: si el modelo repitió el mismo párrafo en dos partes distintas --pasa, y
 * es su culpa, no del que resta-- se quita una aparición por parte entregada y
 * la otra queda, que es lo correcto.
 */
export function quitarPartesYaEntregadas(texto: string, partes: string[]): string {
  let resto = String(texto || "");
  for (const parte of partes) {
    const p = String(parte || "").trim();
    if (!p) continue;
    const i = resto.indexOf(p);
    if (i === -1) continue; // Un candado lo reescribió: se deja y se repite. Repetir es feo; tragarse un aviso es peligroso.
    resto = resto.slice(0, i) + resto.slice(i + p.length);
  }
  // Los separadores quedan huérfanos al sacar el texto del medio.
  return resto.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * El mensaje de cierre del turno.
 *
 * Si después de restar no quedó nada, el turno igual tiene que cerrar con
 * algo: un `result` vacío deja la pantalla con el indicador prendido y sin
 * mensaje, que se lee como que se colgó -- justo lo que este cambio viene a
 * evitar.
 */
export function mensajeDeCierre(texto: string, partesEntregadas: string[]): string {
  const resto = quitarPartesYaEntregadas(texto, partesEntregadas);
  if (resto) return resto;
  return partesEntregadas.length > 0 ? CIERRE_SIN_NOVEDAD : "";
}
