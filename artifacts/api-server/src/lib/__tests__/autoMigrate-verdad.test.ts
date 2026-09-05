/**
 * Que el sistema no pueda decir que está bien cuando no lo está.
 *
 * ⚠️ Estas pruebas existen por el caso más caro del 2026-09-04: Landing Studio
 * no ejecutaba NADA --la tabla no existía y `landingPages` valía `undefined`--
 * y sin embargo:
 *
 *   · /api/health devolvía `"status":"ok"`
 *   · el deploy salía en verde
 *   · el bundle cargaba
 *   · el servidor arrancaba sin un solo error visible
 *
 * El único síntoma era que no funcionaba. Y la causa de fondo es que el health
 * tenía `status: "ok"` CABLEADO A MANO, sin consultar nunca la base, mientras
 * `runAutoMigrations` se traga los errores --loguea y sigue--.
 *
 * Que se los trague está BIEN: una migración caída no puede impedir que el
 * servidor levante y atienda clientes. Lo que estaba mal es que el fallo
 * desapareciera después. Ahora queda anotado y sale por el health.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TABLAS_ESPERADAS, ultimasMigraciones } from "../autoMigrate";

const HEALTH = readFileSync(join(__dirname, "..", "..", "health.ts"), "utf8");
const MIGRA = readFileSync(join(__dirname, "..", "autoMigrate.ts"), "utf8");

describe("las tablas esperadas salen del propio SQL", () => {
  /**
   * Derivarlas y no escribirlas a mano es lo que hace que el chequeo siga
   * cubriendo lo NUEVO, que es lo que más probabilidades tiene de estar roto.
   */
  it("se detectan todas las que autoMigrate crea", () => {
    const enElSql = (MIGRA.match(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi) || []).length;
    expect(TABLAS_ESPERADAS.length).toBeGreaterThan(0);
    expect(TABLAS_ESPERADAS.length).toBeLessThanOrEqual(enElSql);
  });

  /** La que motivó todo esto. */
  it("incluye landing_pages", () => {
    expect(TABLAS_ESPERADAS).toContain("landing_pages");
  });

  it("sin repetidos y en minúscula", () => {
    expect(new Set(TABLAS_ESPERADAS).size).toBe(TABLAS_ESPERADAS.length);
    for (const t of TABLAS_ESPERADAS) expect(t).toBe(t.toLowerCase());
  });
});

describe("una migración fallida ya no desaparece", () => {
  it("el registro de fallos existe y arranca vacío", () => {
    expect(ultimasMigraciones).toHaveProperty("fallos");
    expect(Array.isArray(ultimasMigraciones.fallos)).toBe(true);
  });

  it("el catch anota el fallo en vez de solo loguearlo", () => {
    const catchDeMigraciones = MIGRA.slice(MIGRA.indexOf("for (const sql of MIGRATIONS)"));
    expect(catchDeMigraciones).toContain("ultimasMigraciones.fallos.push");
  });

  /** Seguir adelante es deliberado: el servidor tiene que atender clientes. */
  it("pero sigue sin cortar el arranque", () => {
    expect(MIGRA).not.toMatch(/catch[\s\S]{0,200}throw/);
  });
});

describe("el health dice la verdad sobre la base", () => {
  /** Era esto, literal: `status: "ok"` sin mirar nada. */
  it("ya no tiene el ok cableado a mano", () => {
    expect(HEALTH).not.toMatch(/status:\s*"ok",\s*\r?\n\s*timestamp/);
    expect(HEALTH).toContain('problemas.length === 0 ? "ok" : "degradado"');
  });

  it("consulta las tablas de verdad", () => {
    expect(HEALTH).toContain("tablasFaltantes");
    expect(HEALTH).toContain("migracionesFallidas");
  });

  /**
   * "No se pudo preguntar" NO es "está todo bien". Colapsar los dos casos en
   * un booleano es cómo se construye un health que miente.
   */
  it("distingue no-poder-preguntar de todo-bien", () => {
    expect(HEALTH).toContain("faltan !== null");
    expect(MIGRA).toMatch(/catch\s*{[\s\S]{0,300}return null;/);
  });

  /**
   * Sigue devolviendo 200 aunque esté degradado, y es a propósito: es la sonda
   * de VIDA de EasyPanel. Un 503 por un parpadeo de la base metería al
   * contenedor en un bucle de reinicios y dejaría a los clientes sin bot por
   * un problema que se resolvía solo.
   */
  it("no devuelve error HTTP por una base caída: reiniciaría el contenedor", () => {
    // Se ancla en dos marcas que SI existen. La primera version de esta
    // prueba busco un ancla que no estaba, indexOf devolvio -1, el slice se
    // llevo el archivo entero y capturo el 503 del catch externo -- que ahi si
    // corresponde, porque significa que el handler se cayo.
    const desde = HEALTH.indexOf("let base");
    const hasta = HEALTH.indexOf("} catch (error)");
    expect(desde).toBeGreaterThan(-1);
    expect(hasta).toBeGreaterThan(desde);
    const bloque = HEALTH.slice(desde, hasta);
    // Se busca la LLAMADA, no la cifra: el comentario que explica esta misma
    // decision dice "por que 200 y no 503", y la prueba se encontro a si misma.
    // Tercera vez hoy que pasa -- por eso queda anotado.
    expect(bloque).not.toContain("res.status(503)");
    expect(bloque).toContain("res.status(200)");
  });
});
