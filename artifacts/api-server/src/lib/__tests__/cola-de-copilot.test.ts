/**
 * Varias cuentas de Copilot, en cola.
 *
 * El admin lo pidió el 2026-08-24 y lo resumió el 2026-09-05 así: *"eso está
 * implementado pero no lo ejecutamos"*. Tenía razón, y el motivo era preciso:
 *
 *   · la rotación estaba escrita y probada (aparta 1 hora al candidato sin
 *     cuota y sigue con el siguiente)
 *   · `ai-keys.ts` YA LEÍA `row.copilotTokens` desde ese mismo día
 *   · pero la COLUMNA nunca se creó, no había endpoint que la escribiera y no
 *     había campo en el panel
 *
 * Resultado: `ai-keys` leía `undefined` en silencio, `COPILOT_TOKENS` no se
 * poblaba nunca, y `cuentasDeCopilot()` caía al token único. Había UN
 * candidato: no había nada que rotar.
 *
 * Es el mismo patrón que dejó a Landing Studio sin ejecutar --código correcto
 * leyendo algo que nadie creó-- y por eso ahora el /health verifica las tablas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizarTokensDeCopilot, cuentasDeCopilot } from "../copilot-cuentas";

describe("la lista tolera los formatos que existen de verdad", () => {
  /** El formato viejo guardaba un string suelto. Romperlo dejaba sin Copilot. */
  it("acepta un token suelto (formato viejo)", () => {
    expect(normalizarTokensDeCopilot("tok1")).toEqual(["tok1"]);
  });

  it("acepta una lista de strings", () => {
    expect(normalizarTokensDeCopilot(["a", "b"])).toEqual(["a", "b"]);
  });

  /** El formato nuevo lleva el correo, para saber cuál recargar. */
  it("acepta la lista con la cuenta de origen", () => {
    expect(normalizarTokensDeCopilot([{ token: "a", cuenta: "uno@x.com" }, { token: "b" }])).toEqual(["a", "b"]);
  });

  /**
   * Dos veces el mismo token no es más cuota: es el mismo límite pegándole dos
   * veces al mismo lugar, y encima gasta un intento del turno.
   */
  it("no repite un token", () => {
    expect(normalizarTokensDeCopilot(["a", "a", "b"])).toEqual(["a", "b"]);
  });

  it("descarta la basura sin romperse", () => {
    expect(normalizarTokensDeCopilot([null, "", "  ", 42, { sinToken: 1 }, "ok"])).toEqual(["ok"]);
    expect(normalizarTokensDeCopilot(null)).toEqual([]);
    expect(normalizarTokensDeCopilot(undefined)).toEqual([]);
  });
});

describe("de dónde salen las cuentas", () => {
  const guardado = { ...process.env };
  const limpiar = () => { delete process.env.COPILOT_TOKENS; delete process.env.GITHUB_TOKEN; };

  it("usa la lista cuando está", () => {
    limpiar();
    process.env.COPILOT_TOKENS = JSON.stringify(["a", "b", "c"]);
    expect(cuentasDeCopilot()).toEqual(["a", "b", "c"]);
    Object.assign(process.env, guardado);
  });

  /** ESTE es el caso que tenía producción: una sola cuenta, nada que rotar. */
  it("cae al token único cuando no hay lista", () => {
    limpiar();
    process.env.GITHUB_TOKEN = "solo-uno";
    expect(cuentasDeCopilot()).toEqual(["solo-uno"]);
    Object.assign(process.env, guardado);
  });

  /** Un JSON roto no puede dejar sin Copilot: se cae al token único. */
  it("un JSON mal formado no rompe nada", () => {
    limpiar();
    process.env.COPILOT_TOKENS = "{esto no es json";
    process.env.GITHUB_TOKEN = "respaldo";
    expect(cuentasDeCopilot()).toEqual(["respaldo"]);
    Object.assign(process.env, guardado);
  });

  it("sin nada configurado devuelve vacío, no un candidato falso", () => {
    limpiar();
    expect(cuentasDeCopilot()).toEqual([]);
    Object.assign(process.env, guardado);
  });
});

/**
 * El tramo que faltaba, verificado sobre el código: sin estas tres piezas la
 * rotación existe pero nunca tiene más de un candidato.
 */
describe("el camino completo existe, no solo la rotación", () => {
  const raiz = join(__dirname, "..", "..", "..", "..", "..");
  const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

  it("la columna existe en Postgres y en SQLite", () => {
    expect(leer("lib/db/src/schema/settings.ts")).toContain('copilotTokens: jsonb("copilot_tokens")');
    expect(leer("lib/db/src/sqlite-schema.ts")).toContain('copilotTokens: text("copilot_tokens"');
  });

  /** Definirla en Drizzle NO la crea: autoMigrate es el único camino. */
  it("autoMigrate la crea en producción", () => {
    expect(leer("artifacts/api-server/src/lib/autoMigrate.ts"))
      .toContain("ALTER TABLE settings ADD COLUMN IF NOT EXISTS copilot_tokens JSONB");
  });

  it("hay endpoints para agregar, listar y sacar cuentas", () => {
    const ruta = leer("artifacts/api-server/src/routes/settings.ts");
    expect(ruta).toContain('router.get("/copilot-accounts"');
    expect(ruta).toContain('router.post("/copilot-accounts"');
    expect(ruta).toContain('router.delete("/copilot-accounts/:posicion"');
  });

  /** Y ai-keys sigue leyendo la columna, que es lo que lo conecta todo. */
  it("ai-keys vuelca la lista al entorno", () => {
    const claves = leer("artifacts/api-server/src/lib/ai-keys.ts");
    expect(claves).toContain("copilotTokens");
    expect(claves).toContain("process.env.COPILOT_TOKENS");
  });
});

describe("los tokens nunca se devuelven al navegador", () => {
  const ruta = readFileSync(join(__dirname, "..", "..", "routes", "settings.ts"), "utf8");
  const bloque = ruta.slice(ruta.indexOf('router.get("/copilot-accounts"'), ruta.indexOf('router.post("/copilot-accounts"'));

  /** Son credenciales: el panel necesita saber CUÁNTAS hay, no cuáles son. */
  it("el listado devuelve el correo y los últimos 4, nunca el token", () => {
    expect(bloque).toContain("slice(-4)");
    expect(bloque).not.toMatch(/token:\s*c\?\.token/);
  });
});
