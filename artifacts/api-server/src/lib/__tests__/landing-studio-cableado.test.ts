/**
 * Landing AI Studio: que la base esté REALMENTE conectada.
 *
 * ⚠️ Esta prueba existe porque Landing Studio estaba roto de raíz y nadie lo
 * sabía. El informe de estado decía que un commit "exportó el schema de landing
 * pages", y era cierto -- pero lo agregó a `schema/index.ts`, que alimenta el
 * namespace de Postgres, NO el punto de entrada del paquete.
 *
 * Y en `lib/db/src/index.ts` las tablas se re-exportan UNA POR UNA (37 de
 * ellas), no con `export *`. Así que `landingPages` valía `undefined` en
 * ejecución y `db.select().from(undefined)` reventaba: guardar, cargar, listar
 * y el comando de IA fallaban los cuatro.
 *
 * El typecheck lo venía diciendo --"has no exported member 'landingPages'"-- y
 * se leía como un artefacto de compilación viejo, que es exactamente lo que
 * hace peligroso a este tipo de fallo: no explota, no se ve, y el trabajo
 * encima se sigue construyendo sobre una base que no ejecuta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { landingPages } from "@workspace/db";

describe("la tabla de landings llega hasta quien la usa", () => {
  /** Lo que fallaba: importarla del paquete daba undefined. */
  it("se exporta desde @workspace/db, que es de donde la importan las rutas", () => {
    expect(landingPages).toBeDefined();
  });

  it("y trae las columnas que las rutas leen y escriben", () => {
    for (const col of ["id", "tenantId", "productId", "name", "slug", "status", "strategy", "sections", "design", "source", "updatedAt"]) {
      expect(landingPages, `falta la columna ${col}`).toHaveProperty(col);
    }
  });
});

/**
 * Definir la tabla en Drizzle NO la crea en la base.
 *
 * `db:push` se corre a mano y la Postgres de producción vive en la red interna
 * de EasyPanel, así que autoMigrate --que corre solo en cada arranque-- es el
 * único camino. Sin esto el servidor levanta bien y la API revienta contra una
 * tabla que no existe. Es el mismo razonamiento que ya está escrito en ese
 * archivo para las tablas de marketing.
 *
 * Se verifica sobre el código porque las pruebas corren en SQLite: una prueba
 * de integración acá no diría nada sobre la Postgres de producción.
 */
describe("y existe de verdad en produccion", () => {
  const MIGRACIONES = readFileSync(join(__dirname, "..", "autoMigrate.ts"), "utf8");

  it("autoMigrate crea landing_pages", () => {
    expect(MIGRACIONES).toContain("CREATE TABLE IF NOT EXISTS landing_pages");
  });

  it("con las columnas NOT NULL que la ruta insercion llena", () => {
    // La ruta hace insert con name y slug siempre; si la tabla los exige y la
    // ruta no los mandara, cada guardado fallaria por violacion de NOT NULL.
    const ruta = readFileSync(join(__dirname, "..", "..", "routes", "landing-pages.ts"), "utf8");
    expect(MIGRACIONES).toMatch(/slug TEXT NOT NULL/);
    expect(ruta).toContain("slug: slugify(");
  });

  /**
   * El slug es la URL pública: único POR INQUILINO y no global. Dos negocios
   * distintos pueden querer "curso-de-ia" y ninguno tiene por qué ceder.
   */
  it("el slug es unico por inquilino, no global", () => {
    expect(MIGRACIONES).toContain("landing_pages_tenant_slug_idx ON landing_pages (tenant_id, slug)");
  });
});
