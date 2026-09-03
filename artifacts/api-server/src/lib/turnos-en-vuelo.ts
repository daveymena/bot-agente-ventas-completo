/**
 * PARAR A ATLAS CUANDO YA NO QUERÉS QUE SIGA.
 *
 * Reportado el 2026-09-03, con la captura de la pantalla: "no hay forma de
 * detener a Atlas, se queda trabajando y si uno quiere detenerlo no se puede
 * porque no hay cómo". Y era literal: mientras el turno corría, el botón de
 * enviar se volvía un spinner deshabilitado. La única salida era recargar la
 * página -- que no para nada, solo deja de mirar: el servidor seguía gastando
 * los 135 s del turno, y hasta cuatro veces si el pedido encadenaba
 * continuaciones.
 *
 * Cerrar la pestaña NO es lo mismo que pedir que pare, y por eso esto no se
 * colgó del `req.on("close")` que ya existe. Ese caso está resuelto al revés a
 * propósito: si el admin se va, el turno sigue y se guarda, porque lo que
 * estaba haciendo probablemente lo quiere. Acá está diciendo lo contrario.
 *
 * ── Qué se puede parar de verdad, y qué no ────────────────────────────────
 *
 * Se corta ANTES de empezar cada tramo nuevo: el próximo candidato de la
 * cadena, la próxima vuelta de herramientas, la próxima continuación. Y la
 * llamada que esté en vuelo se aborta por señal, así que tampoco hay que
 * esperar a que venza su timeout.
 *
 * Lo que NO se deshace es lo que ya se ejecutó. Si Atlas ya creó el borrador
 * del anuncio, ese borrador queda creado. Parar es dejar de avanzar, no
 * volver el tiempo atrás -- y así se lo dice la pantalla, sin prometer de más.
 */

/** Un turno vivo: su señal de cancelación y cuándo arrancó. */
interface TurnoEnVuelo {
  controlador: AbortController;
  desde: number;
}

/**
 * La clave es tenant + sesión, no solo la sesión.
 *
 * Dos negocios distintos pueden tener los dos su charla `default` abierta al
 * mismo tiempo -- es el id por defecto y lo tiene todo el mundo. Con la sesión
 * sola, el botón de parar de uno cortaba el turno del otro.
 */
export function claveDeTurno(tenantId: string, sessionId: string): string {
  return `${tenantId}::${sessionId}`;
}

const enVuelo = new Map<string, TurnoEnVuelo>();

/**
 * Anota que este turno arrancó y devuelve su señal.
 *
 * Si ya había uno vivo con la misma clave se lo aborta: es el caso de mandar
 * un pedido nuevo sin esperar al anterior, y dejar dos corriendo sobre la
 * misma charla es peor que cortar el viejo (se pisan el historial).
 */
export function empezarTurno(clave: string): AbortSignal {
  enVuelo.get(clave)?.controlador.abort(new Error("empezó un turno nuevo en esta charla"));
  const controlador = new AbortController();
  enVuelo.set(clave, { controlador, desde: Date.now() });
  return controlador.signal;
}

/** El turno terminó (bien o mal). Sin esto el mapa crece para siempre. */
export function terminarTurno(clave: string): void {
  enVuelo.delete(clave);
}

/**
 * Pedido explícito de parar. Devuelve si había algo que parar, para que la
 * ruta pueda contestar la verdad en vez de un "listo" a ciegas.
 */
export function pedirDetener(clave: string): boolean {
  const turno = enVuelo.get(clave);
  if (!turno) return false;
  turno.controlador.abort(new Error("lo detuvo el admin"));
  enVuelo.delete(clave);
  return true;
}

/** ¿Hay un turno corriendo ahora mismo en esta charla? */
export function hayTurnoEnVuelo(clave: string): boolean {
  return enVuelo.has(clave);
}

/**
 * Se usa en los bordes de cada tramo: si volvió true, no se empieza nada más.
 *
 * Va contra la señal recibida y no contra el mapa: cuando `pedirDetener` borra
 * la entrada, el turno que la tenía sigue teniendo su señal ya abortada, que es
 * exactamente lo que hay que mirar.
 */
export function fueDetenido(senal: AbortSignal | undefined): boolean {
  return senal?.aborted === true;
}

/** Solo para las pruebas: deja el registro limpio entre casos. */
export function olvidarTurnos(): void {
  for (const { controlador } of enVuelo.values()) controlador.abort(new Error("reinicio de pruebas"));
  enVuelo.clear();
}
