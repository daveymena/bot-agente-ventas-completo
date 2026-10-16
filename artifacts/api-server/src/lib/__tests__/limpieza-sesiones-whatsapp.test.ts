/**
 * LA LIMPIEZA DE LAS CARPETAS DE SESIÓN DE WHATSAPP.
 *
 * El riesgo de este módulo es obvio: si borra un archivo de más, un negocio
 * queda desvinculado y hay que escanear el QR otra vez. Por eso los tests que
 * importan no son los que prueban que borra — son los que prueban que **NO**
 * borra.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  esCredencial,
  esBasuraDeCache,
  limpiarCarpetaDeSesion,
  limpiarSesionesDeTenants,
  NUNCA_BORRAR,
} from "../limpieza-sesiones-whatsapp";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wa-limpieza-"));
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* no crítico */ }
});

/** Crea un archivo de `bytes` tamaño con contenido opcional. */
const crear = (nombre: string, bytes = 0) =>
  writeFileSync(join(dir, nombre), bytes > 0 ? "x".repeat(bytes) : "");

describe("qué se considera borrable (la regla es ANGOSTA a propósito)", () => {
  test("un mapeo LID vacío SÍ", () => {
    expect(esBasuraDeCache("lid-mapping-1234_reverse.json", 0)).toBe(true);
    expect(esBasuraDeCache("lid-mapping-1234.json", 0)).toBe(true);
  });

  test("un mapeo LID CON datos NO (es caché útil)", () => {
    expect(esBasuraDeCache("lid-mapping-1234.json", 15)).toBe(false);
  });

  test("cualquier otra cosa NO", () => {
    expect(esBasuraDeCache("creds.json", 0)).toBe(false);
    expect(esBasuraDeCache("pre-key-1.json", 0)).toBe(false);
    expect(esBasuraDeCache("app-state-sync-key-abc.json", 0)).toBe(false);
  });
});

describe("🔴 las credenciales NUNCA se borran", () => {
  test("todos los nombres críticos están protegidos", () => {
    for (const p of NUNCA_BORRAR) {
      if (p === "lid-mapping") continue; // tiene su propia regla
      expect(esCredencial(`${p}algo.json`), `${p} debería estar protegido`).toBe(true);
    }
  });

  test("creds.json sobrevive aunque esté VACÍO (el peor caso)", () => {
    crear("creds.json", 0);
    crear("lid-mapping-1.json", 0);

    const r = limpiarCarpetaDeSesion(dir);

    expect(r.borrados).toBe(1);
    expect(existsSync(join(dir, "creds.json"))).toBe(true);
    expect(existsSync(join(dir, "lid-mapping-1.json"))).toBe(false);
  });

  test("un borrado real deja intactas TODAS las credenciales", () => {
    // Un estado de sesión verosímil.
    crear("creds.json", 700);
    crear("app-state-sync-key-AAAA.json", 200);
    crear("app-state-sync-version-regular.json", 50);
    crear("identity-key-12345.json", 100);
    crear("session-99999.json", 150);
    crear("pre-key-1.json", 80);
    crear("sender-key-1.json", 60);
    crear("device-list-1.json", 40);
    crear("tctoken-1.json", 30);
    // Y la basura.
    for (let i = 0; i < 50; i++) crear(`lid-mapping-${i}${i % 2 ? "_reverse" : ""}.json`, 0);

    const r = limpiarCarpetaDeSesion(dir);

    expect(r.borrados).toBe(50);
    for (const critico of [
      "creds.json",
      "app-state-sync-key-AAAA.json",
      "identity-key-12345.json",
      "session-99999.json",
      "pre-key-1.json",
      "sender-key-1.json",
      "device-list-1.json",
      "tctoken-1.json",
    ]) {
      expect(existsSync(join(dir, critico)), `${critico} NO debía borrarse`).toBe(true);
    }
  });
});

describe("la limpieza de una carpeta", () => {
  test("cuenta lo que borró y lo que dejó", () => {
    crear("creds.json", 700);
    crear("lid-mapping-a.json", 0);
    crear("lid-mapping-b.json", 0);
    crear("lid-mapping-c.json", 20); // con datos: se queda

    const r = limpiarCarpetaDeSesion(dir);

    expect(r.borrados).toBe(2);
    expect(r.restantes).toBe(2); // creds + el lid con datos
  });

  test("una carpeta que no existe no lanza", () => {
    expect(() => limpiarCarpetaDeSesion(join(dir, "no-existe"))).not.toThrow();
    expect(limpiarCarpetaDeSesion(join(dir, "no-existe")).borrados).toBe(0);
  });

  test("una carpeta vacía no rompe nada", () => {
    expect(limpiarCarpetaDeSesion(dir).borrados).toBe(0);
  });

  test("ignora los subdirectorios", () => {
    // Un directorio llamado como un archivo borrable no debe intentar borrarse.
    mkdtempSync(join(dir, "lid-mapping-dir"));
    expect(() => limpiarCarpetaDeSesion(dir)).not.toThrow();
  });
});

describe("la limpieza de todos los negocios", () => {
  test("recorre solo las carpetas tenant-*", () => {
    const base = mkdtempSync(join(tmpdir(), "wa-base-"));
    try {
      // Dos negocios con basura. `mkdtempSync` crea el directorio y devuelve su
      // ruta: hay que usarla, no descartarla.
      for (const t of ["tenant-1", "tenant-2"]) {
        const d = mkdtempSync(join(base, t));
        crear2(d, "creds.json", 500);
        crear2(d, "lid-mapping-x.json", 0);
      }
      // Un archivo suelto en la base (la sesión global heredada): NO se toca.
      crear2(base, "creds.json", 500);
      crear2(base, "lid-mapping-suelto.json", 0);

      const r = limpiarSesionesDeTenants(base);

      expect(r.carpetas).toBe(2);
      expect(r.borrados).toBe(2);
      // El de la base sigue ahí: este módulo solo entra a tenant-*.
      expect(existsSync(join(base, "lid-mapping-suelto.json"))).toBe(true);
      expect(existsSync(join(base, "creds.json"))).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("un directorio base inexistente no lanza", () => {
    expect(() => limpiarSesionesDeTenants(join(dir, "no-existe"))).not.toThrow();
  });

  test("es idempotente: correrla dos veces no borra de más", () => {
    crear("creds.json", 500);
    crear("lid-mapping-1.json", 0);

    const primera = limpiarCarpetaDeSesion(dir);
    const segunda = limpiarCarpetaDeSesion(dir);

    expect(primera.borrados).toBe(1);
    expect(segunda.borrados).toBe(0);
    expect(readdirSync(dir)).toHaveLength(1);
  });
});

/** Helper para la carpeta base (el `crear` de arriba usa el `dir` del test). */
function crear2(directorio: string, nombre: string, bytes: number) {
  writeFileSync(join(directorio, nombre), bytes > 0 ? "x".repeat(bytes) : "");
}
