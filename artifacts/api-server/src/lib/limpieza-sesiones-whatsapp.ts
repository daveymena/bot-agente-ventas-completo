/**
 * ============================================================================
 * MANTENIMIENTO DE LAS CARPETAS DE SESIÓN DE WHATSAPP
 * ============================================================================
 *
 * `useMultiFileAuthState` de Baileys guarda el estado de cada sesión como UN
 * ARCHIVO POR CLAVE, en una carpeta por negocio. Eso está bien para un cliente
 * y se vuelve un problema con muchos:
 *
 *   Medido el 2026-10-14 en un servidor con UN solo negocio conectado:
 *     18.006 archivos   →  17.177 eran `lid-mapping-*`  (el 95%)
 *                        5.106 de esos estaban VACÍOS (0 bytes)
 *     Listar la carpeta tardaba 2.120 ms
 *
 * Esos archivos son el mapeo entre el teléfono (`PN`) y el identificador nuevo
 * de WhatsApp (`LID`). Baileys los usa como caché: si falta uno, lo vuelve a
 * pedir al servidor. **NO son credenciales** — borrarlos no desvincula la
 * sesión ni obliga a escanear el QR otra vez.
 *
 * Con 100 negocios, el mismo patrón da ~1.8 millones de archivos en un
 * contenedor Docker: el disco se arrastra, los backups se inflan y el listado
 * de cada carpeta bloquea el event loop.
 *
 * ── Qué se borra y qué NO ──────────────────────────────────────────────────
 *
 * SOLO los `lid-mapping-*` de 0 bytes. Nada más.
 *
 * Los que TIENEN datos también se podrían tirar (son caché), pero eso obliga a
 * Baileys a repoblarlos con llamadas de red justo cuando el negocio está
 * atendiendo. Los vacíos, en cambio, no aportan nada: no hay nada que perder.
 *
 * Las credenciales (`creds.json`), las claves de identidad y las pre-keys NO se
 * tocan nunca. Están en una lista blanca explícita abajo, y hay un test que lo
 * verifica: el día que alguien amplíe el borrado, el test lo detiene.
 */

import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger";

/**
 * Lo que NUNCA se borra, ni por error.
 *
 * Si un archivo coincide con alguno de estos patrones, se saltea aunque cumpla
 * la condición de borrado. Es la red de seguridad: el borrado se equivoca hacia
 * el lado de no tocar nada.
 */
export const NUNCA_BORRAR = [
  "creds.json",
  "app-state-sync-key",
  "app-state-sync-version",
  "identity-key",
  "session-",
  "pre-key-",
  "sender-key-",
  "device-list-",
  "tctoken",
  "lid-mapping", // ← se maneja aparte, con su propia regla
];

/** ¿Este nombre es una credencial que jamás se toca? */
export function esCredencial(nombre: string): boolean {
  if (nombre.startsWith("lid-mapping")) return false; // tiene su propia regla
  return NUNCA_BORRAR.some((p) => nombre.startsWith(p));
}

/**
 * ¿Este archivo es basura de caché que se puede borrar?
 *
 * Regla única y angosta: un mapeo LID **vacío**. Un `lid-mapping` con datos es
 * caché útil y se queda.
 */
export function esBasuraDeCache(nombre: string, bytes: number): boolean {
  return nombre.startsWith("lid-mapping") && bytes === 0;
}

export interface ResultadoDeLimpieza {
  /** Carpetas recorridas (una por negocio conectado). */
  carpetas: number;
  /** Archivos borrados. */
  borrados: number;
  /** Bytes liberados (los archivos son de 0 bytes, pero se informa igual). */
  bytesLiberados: number;
  /** Archivos que quedaron en total. */
  restantes: number;
  /** Carpetas donde algo falló (no se interrumpe el resto por una). */
  errores: number;
}

/**
 * Limpia una carpeta de sesión.
 *
 * Nunca lanza: si algo falla se cuenta y se sigue. Una limpieza que rompe el
 * arranque del bot sería peor que la basura que viene a quitar.
 */
export function limpiarCarpetaDeSesion(dir: string): { borrados: number; bytes: number; restantes: number } {
  let borrados = 0;
  let bytes = 0;
  let restantes = 0;

  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return { borrados: 0, bytes: 0, restantes: 0 };
  }

  for (const nombre of entradas) {
    const ruta = join(dir, nombre);
    try {
      const st = statSync(ruta);
      if (!st.isFile()) continue;

      if (esCredencial(nombre)) {
        restantes++;
        continue;
      }

      if (esBasuraDeCache(nombre, st.size)) {
        unlinkSync(ruta);
        borrados++;
        bytes += st.size;
        continue;
      }

      restantes++;
    } catch {
      // Archivo que se fue entre el listado y el stat, o sin permiso: se sigue.
      restantes++;
    }
  }

  return { borrados, bytes, restantes };
}

/**
 * Limpia TODAS las carpetas de sesión de un directorio de tenants.
 *
 * Estructura esperada: `<base>/tenant-<id>/`. Se ignoran los archivos sueltos
 * de `<base>` (ahí vive la sesión global heredada, que no se toca desde acá).
 */
export function limpiarSesionesDeTenants(base: string): ResultadoDeLimpieza {
  const resultado: ResultadoDeLimpieza = {
    carpetas: 0,
    borrados: 0,
    bytesLiberados: 0,
    restantes: 0,
    errores: 0,
  };

  let entradas: string[];
  try {
    entradas = readdirSync(base);
  } catch {
    return resultado; // el directorio todavía no existe: nada que limpiar
  }

  for (const nombre of entradas) {
    if (!nombre.startsWith("tenant-")) continue;
    const dir = join(base, nombre);
    try {
      if (!statSync(dir).isDirectory()) continue;
      const r = limpiarCarpetaDeSesion(dir);
      resultado.carpetas++;
      resultado.borrados += r.borrados;
      resultado.bytesLiberados += r.bytes;
      resultado.restantes += r.restantes;
    } catch (err: any) {
      resultado.errores++;
      logger.warn({ err: err?.message, dir }, "[LimpiezaWA] no se pudo limpiar una carpeta de sesión");
    }
  }

  return resultado;
}

/**
 * Programa la limpieza cada 24 h.
 *
 * Corre a los 5 minutos del arranque para no competir con WhatsApp
 * reconectando y las migraciones. `unref()` para que no impida el apagado
 * ordenado: un temporizador de mantenimiento no debe retener el proceso.
 */
export function programarLimpiezaDeSesiones(base: string): void {
  const PRIMERA_MS = 5 * 60 * 1000;
  const CADA_MS = 24 * 60 * 60 * 1000;

  const correr = () => {
    try {
      const r = limpiarSesionesDeTenants(base);
      if (r.borrados > 0) {
        logger.info(r, "[LimpiezaWA] archivos de caché LID vacíos eliminados");
      } else {
        logger.debug({ carpetas: r.carpetas, restantes: r.restantes }, "[LimpiezaWA] nada que limpiar");
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, "[LimpiezaWA] la limpieza falló, se reintenta mañana");
    }
  };

  setTimeout(correr, PRIMERA_MS).unref?.();
  setInterval(correr, CADA_MS).unref?.();
}
