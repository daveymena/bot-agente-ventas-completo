/**
 * ============================================================
 * QUÉ SALIÓ DE ESTE BOT Y QUÉ SALIÓ DE OTRO LADO
 * ============================================================
 *
 * ── El problema ───────────────────────────────────────────────────────────
 *
 * WhatsApp marca `fromMe: true` en TODO lo que sale del número: da igual si lo
 * escribió este bot, la IA de Meta, o el dueño desde su celular. Para WhatsApp
 * es la misma cuenta.
 *
 * Hasta ahora eso se resolvía tirando todo lo `fromMe` a la basura
 * (`whatsapp.ts`, "Ignorando: mensaje enviado por nosotros"). Y funcionaba
 * mientras el bot fuera el único que hablaba.
 *
 * Deja de funcionar apenas contesta alguien más: el dueño respondiendo a mano o
 * la IA de Meta atendiendo. Esas respuestas existen para el cliente y no
 * existen para la app -- que es exactamente el "estamos ciegos" que hay que
 * cerrar. Si Meta ya le dijo el precio, este bot no tiene forma de saberlo.
 *
 * ── La solución ───────────────────────────────────────────────────────────
 *
 * Anotar el id de cada mensaje que ESTE proceso manda. Después, cualquier
 * `fromMe` cuyo id no esté anotado vino de otro lado, y hay que guardarlo.
 *
 * ── Por qué un tope y no una lista infinita ───────────────────────────────
 *
 * Un `Set` que solo crece es una fuga de memoria en un proceso que vive
 * semanas. Se guardan los últimos y los viejos se caen: un mensaje propio
 * vuelve por el socket en segundos, no en horas, así que la ventana sobra.
 *
 * ⚠️ Vive en memoria a propósito. Si el proceso se reinicia se pierde, y el
 * peor caso es que un mensaje nuestro se guarde una segunda vez marcado como
 * ajeno. Eso ensucia una fila; persistirlo en base costaría una escritura por
 * cada mensaje enviado para evitar un caso que dura los segundos de un
 * arranque.
 */

/** Cuántos ids se recuerdan. Alcanza de sobra: el eco llega en segundos. */
const TOPE = 500;

const propios = new Set<string>();
/** El orden de llegada, para poder soltar los más viejos primero. */
const orden: string[] = [];

/** Anota que este mensaje lo mandamos nosotros. */
export function anotarMensajePropio(id: string | null | undefined): void {
  const k = String(id || "").trim();
  if (!k) return;
  if (propios.has(k)) return;

  propios.add(k);
  orden.push(k);

  while (orden.length > TOPE) {
    const viejo = orden.shift();
    if (viejo) propios.delete(viejo);
  }
}

/**
 * ¿Este mensaje lo mandamos nosotros?
 *
 * Un id vacío devuelve `false` --o sea, "no es nuestro"--. Es la respuesta
 * conservadora: preferimos guardar de más y ver un mensaje repetido en el
 * historial antes que perder lo que le dijeron al cliente, que es justo lo
 * que se está arreglando.
 */
export function loMandamosNosotros(id: string | null | undefined): boolean {
  const k = String(id || "").trim();
  return k ? propios.has(k) : false;
}

/** Solo para las pruebas: deja el registro limpio entre casos. */
export function olvidarTodo(): void {
  propios.clear();
  orden.length = 0;
}

/** Cuántos ids hay anotados. Para pruebas y diagnóstico. */
export function cuantosAnotados(): number {
  return propios.size;
}
