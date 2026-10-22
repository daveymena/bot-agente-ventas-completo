/**
 * Exclusión por cuenta publicitaria en la capa HTTP.
 *
 * Cubre TODAS las escrituras (POST/DELETE) a una cuenta `act_…` de Meta,
 * vengan del módulo que vengan, sin cambiar cada llamada. Las lecturas (GET)
 * no se bloquean. Las escrituras a objetos sueltos (campañas, conjuntos, anuncios
 * por id) siguen protegidas por `fbPost` cuando pasan por FacebookService.
 *
 * Se instala una sola vez al arrancar la API. Sin Postgres no hace nada.
 */

import { conExclusionDeCuenta, type PoolBloqueo } from "./bloqueo-cuenta";

const METODOS_DE_ESCRITURA = new Set(["POST", "DELETE", "PUT", "PATCH"]);
const HOSTS_META = new Set(["graph.facebook.com", "graph-video.facebook.com"]);

/** Id de la cuenta publicitaria a la que apunta una URL de Graph, o null. */
export function cuentaDeUrlMeta(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!HOSTS_META.has(u.hostname)) return null;
  const m = u.pathname.match(/\/v\d+(?:\.\d+)?\/(act_\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

/** Clave de negocio para el bloqueo global: 0 significa "cualquier negocio". */
const NEGOCIO_GLOBAL = 0;

/**
 * Reemplaza `fetch` global por una versión que serializa las escrituras a
 * cuentas publicitarias. Devuelve la función para desinstalar (útil en pruebas).
 */
export function instalarExclusionDeEscrituras(
  pool: PoolBloqueo,
  fetchOriginal: typeof fetch = globalThis.fetch.bind(globalThis),
): () => void {
  const anterior = globalThis.fetch;
  const envuelto: typeof fetch = async (entrada, init) => {
    const metodo = (init?.method || "GET").toUpperCase();
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : null;
    if (!url || !METODOS_DE_ESCRITURA.has(metodo)) return fetchOriginal(entrada, init);
    const cuenta = cuentaDeUrlMeta(url);
    if (!cuenta) return fetchOriginal(entrada, init);
    return conExclusionDeCuenta(pool, NEGOCIO_GLOBAL, cuenta, () => fetchOriginal(entrada, init));
  };
  globalThis.fetch = envuelto;
  return () => {
    globalThis.fetch = anterior;
  };
}
