/**
 * ============================================================
 * RECONECTAR NO PUEDE CAMBIARTE DE CUENTA PUBLICITARIA
 * ============================================================
 *
 * Medido con el dueño el 2026-09-07, con su sesion real:
 *
 *   cuentas: "Duvier Davey Mena Mosquera" (1041451215504206, COP)  <- 4 campañas
 *            "VentasPro - Cursos Digitales" (1545022093928422, USD) <- vacia
 *
 * Reconecto Facebook, la deteccion automatica agarro "la primera activa" y lo
 * dejo apuntando a la vacia. La pantalla dijo "no hay campañas" durante dos
 * dias, mientras las 4 campañas seguian ahi con $30.579 gastados.
 *
 * ⚠️ Se lee el codigo sin comentarios. Ya paso cuatro veces en este repo que
 * una prueba pasara porque el texto buscado estaba en un comentario --incluido
 * el que explica el arreglo-- y no en el codigo que corre.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sinComentarios = (ruta: string) =>
  readFileSync(join(__dirname, "..", ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

const PUBLIC = sinComentarios("public.ts");
const FACEBOOK = sinComentarios("facebook.ts");

describe("al reconectar se conserva la cuenta que ya estaba en uso", () => {
  it("mira si ya habia una elegida", () => {
    expect(PUBLIC).toContain("adAccountId");
    expect(PUBLIC).toMatch(/yaElegida/);
  });

  it("comprueba que esa cuenta siga estando disponible", () => {
    // Si el dueño perdio el acceso a esa cuenta, insistir la dejaria rota.
    expect(PUBLIC).toMatch(/seguiaDisponible/);
    expect(PUBLIC).toMatch(/lista\.some\(/);
  });

  it("solo elige otra cuando NO habia ninguna (y ahi gana la activa en COP)", () => {
    // La eleccion automatica sigue existiendo: es lo que hace que conectar por
    // primera vez funcione sin pedirle el id a nadie. Desde el 30-09-2026 vive
    // en elegirCuentaAlConectar (probada en lib/__tests__/cuenta-publicitaria-cop.test.ts):
    // respeta la previa, y si no, prefiere la activa en COP.
    expect(PUBLIC).toMatch(/elegirCuentaAlConectar\(lista, yaElegida/);
  });

  it("la version vieja --elegir siempre la primera-- ya no existe", () => {
    const vieja = /const elegida = lista\.find\(\(c\) => c\.account_status === 1\) \|\| lista\[0\];/;
    expect(vieja.test(PUBLIC)).toBe(false);
  });
});

describe("la pantalla de config NO expone las credenciales del dueño", () => {
  const RUTA = (() => {
    const i = FACEBOOK.indexOf('router.get("/config"');
    return i === -1 ? "" : FACEBOOK.slice(i, i + 3000);
  })();

  it("existe el endpoint", () => {
    expect(RUTA).not.toBe("");
  });

  it("el respaldo del .env se limita al dueño del servidor", () => {
    // Antes caia al entorno para CUALQUIER negocio: a un inquilino se le
    // mostraba el id de cuenta publicitaria, la pagina y el pixel del dueño de
    // la plataforma -- y encima le decia que ya tenia Facebook conectado, asi
    // que nunca conectaba el suyo.
    expect(RUTA).toContain("esDuenoDelServidor");
    expect(RUTA).toContain("getDefaultTenant()");
  });

  it.each(["FB_PAGE_ID", "FB_AD_ACCOUNT_ID", "FB_PIXEL_ID", "FB_ACCESS_TOKEN"])(
    "%s ya no se lee sin pasar por el guardia",
    (v) => {
      // Cada uno tiene que estar envuelto en env(...), nunca suelto con `||`.
      const suelto = new RegExp(`\\|\\|\\s*process\\.env\\.${v}`);
      expect(suelto.test(RUTA)).toBe(false);
      expect(RUTA).toContain(`env(process.env.${v})`);
    },
  );

  it("sigue devolviendo el token enmascarado, nunca entero", () => {
    // La máscara la arma lib/secretos (probada en secretos-no-se-filtran.test.ts).
    expect(RUTA).toContain("accessToken: enmascararSecreto(accessToken)");
  });
});
