/**
 * ¿El turno de Atlas falló por algo que se arregla solo esperando?
 *
 * El dueño (08-10): "se sigue cayendo la conexión cada que me salgo de la
 * aplicación". No era la conexión. En el registro de turnos de producción
 * (GET /api/code-agent/atlas-diagnostico), 4 de 25 pedidos terminaron con
 * `estado: "error"`: todos los modelos se colgaron por tiempo y el ÚLTIMO de
 * la cadena contestó "Rate limit exceeded" (o "free tier can only be used
 * from within OpenCode"). Como solo `timeout|abort` se trataba como corte,
 * esos turnos salían por el 502: no guardaban respuesta y nadie los retomaba.
 * Al volver, la pantalla veía el pedido sin contestar y decía que se había
 * cortado. Parecía la conexión; era el servidor rindiéndose.
 *
 * Cupo agotado, saturación o un 5xx del proveedor se resuelven esperando, igual
 * que un corte por tiempo: se guarda el parcial y el servidor reintenta solo
 * (lib/continuacion-servidor.ts), con más espera si fue por cupo.
 */

const POR_TIEMPO = /timeout|abort|sin tiempo|sin candidatos/i;
const POR_CUPO = /rate.?limit|\b429\b|too many requests|sin cupo|quota|overload|saturad|free tier|capacity/i;
const PROVEEDOR_CAIDO = /\b50[234]\b|bad gateway|service unavailable|gateway time|econnreset|socket hang up|fetch failed/i;

export interface FalloDeTurno {
  /** Se arregla esperando: guardar parcial y reintentar, no rendirse. */
  reintentable: boolean;
  /** Cuánto esperar antes del reintento automático del servidor. */
  esperaMs: number;
}

export function clasificarFallo(error: unknown): FalloDeTurno {
  const e = String(error ?? "");
  // Por cupo primero: si esperamos 8 s, el proveedor sigue sin cupo y el
  // reintento se gasta en la misma pared.
  if (POR_CUPO.test(e)) return { reintentable: true, esperaMs: 45_000 };
  if (POR_TIEMPO.test(e) || PROVEEDOR_CAIDO.test(e)) return { reintentable: true, esperaMs: 8_000 };
  return { reintentable: false, esperaMs: 0 };
}
