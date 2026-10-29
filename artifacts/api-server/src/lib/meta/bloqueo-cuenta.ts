/**
 * Exclusión por cuenta publicitaria para las ESCRITURAS a Meta.
 *
 * Problema: dos peticiones de escritura a la misma cuenta, desde dos
 * instancias o dos pestañas, pueden pisarse (presupuesto, estado de campañas)
 * y consumen la misma cuota. Solución: un bloqueo consultivo de Postgres por
 * (negocio, cuenta). Una sola escritura a la vez por cuenta, en todas las
 * instancias, sin cambiar la forma de las respuestas de la interfaz.
 *
 * El bloqueo vive en una conexión dedicada: los bloqueos de sesión de
 * Postgres se liberan solo desde la misma conexión.
 */

import { hashEstable } from "./metricas";

export interface ClienteBloqueo {
  query(texto: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destruir?: boolean): void;
}

export interface PoolBloqueo {
  connect(): Promise<ClienteBloqueo>;
}

export class CuentaOcupadaError extends Error {
  readonly codigo = "cuenta_ocupada";
  constructor(cuenta: string) {
    super(`La cuenta ${cuenta} está atendiendo otra operación. Intenta de nuevo en unos segundos.`);
    this.name = "CuentaOcupadaError";
  }
}

export interface OpcionesBloqueo {
  /** Tiempo máximo esperando el turno antes de rendirse. */
  esperaMaxMs?: number;
  /** Pausa entre intentos de obtener el bloqueo. */
  intervaloMs?: number;
  /** Reloj inyectable para pruebas. */
  ahora?: () => number;
  dormir?: (ms: number) => Promise<void>;
}

const dormirReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Claves de 32 bits para pg_try_advisory_lock(int, int). Estables entre instancias. */
export function clavesDeBloqueo(tenantId: number, cuenta: string): [number, number] {
  return [hashEstable(`meta:${tenantId}`) | 0, hashEstable(`cuenta:${cuenta}`) | 0];
}

export async function conExclusionDeCuenta<T>(
  pool: PoolBloqueo,
  tenantId: number,
  cuenta: string,
  operacion: () => Promise<T>,
  opciones: OpcionesBloqueo = {},
): Promise<T> {
  const esperaMaxMs = opciones.esperaMaxMs ?? 25_000;
  const intervaloMs = opciones.intervaloMs ?? 250;
  const ahora = opciones.ahora ?? (() => Date.now());
  const dormir = opciones.dormir ?? dormirReal;
  const [k1, k2] = clavesDeBloqueo(tenantId, cuenta);

  // Mientras se espera turno NO se retiene una conexión del pool: cada intento
  // toma una conexión, prueba el bloqueo y la suelta si no lo consiguió. Así
  // muchas escrituras en espera no agotan el pool de la aplicación.
  const inicio = ahora();
  for (;;) {
    const cliente = await pool.connect();
    let obtenido = false;
    try {
      const { rows } = await cliente.query(`SELECT pg_try_advisory_lock($1::int, $2::int) AS ok`, [k1, k2]);
      obtenido = rows[0]?.ok === true;
    } catch (e) {
      cliente.release();
      throw e;
    }
    if (obtenido) {
      // Con el bloqueo tomado, la conexión queda ocupada solo durante la operación.
      let desbloqueado = false;
      try {
        return await operacion();
      } finally {
        await cliente
          .query(`SELECT pg_advisory_unlock($1::int, $2::int)`, [k1, k2])
          .then(() => { desbloqueado = true; })
          .catch(() => {});
        // Si no se pudo desbloquear, la conexión se destruye: al cerrarse
        // Postgres libera el bloqueo. Devolverla al pool lo dejaría tomado.
        cliente.release(!desbloqueado);
      }
    }
    cliente.release();
    if (ahora() - inicio >= esperaMaxMs) throw new CuentaOcupadaError(cuenta);
    await dormir(intervaloMs);
  }
}
