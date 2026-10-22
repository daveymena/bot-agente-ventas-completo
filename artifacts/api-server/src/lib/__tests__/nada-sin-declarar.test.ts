import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * NINGÚN identificador usado sin declarar. En todo el proyecto.
 *
 * ── Por qué existe esta prueba ───────────────────────────────────────────
 *
 * El 2026-08-31 el bot pasó el día contestándole "Estoy teniendo problemas
 * técnicos" a cada cliente que preguntaba por un producto. Los saludos
 * funcionaban --son texto fijo-- así que desde afuera parecía andar, y la
 * suite marcaba 1.194 pruebas en verde.
 *
 * Eran cuatro identificadores usados y nunca declarados:
 *
 *   agent.ts    `pidePagar`                    -> el que tenía el bot mudo
 *   agent.ts    `etapaDelTrato`                -> leído antes de su `let`
 *   agent.ts    `processPurchaseConfirmation`  -> revienta al CONFIRMAR una compra
 *   email.ts    `smtp`                         -> revienta al mandar el correo
 *                                                 de pago confirmado
 *   app.ts      `__dirname`                    -> revienta al instalar un
 *                                                 cliente nuevo
 *
 * ── Por qué no los agarró nada ───────────────────────────────────────────
 *
 * El build usa **esbuild**, que borra los tipos sin comprobarlos: para él un
 * nombre inexistente es código válido. `tsc` sí los marca, pero nadie lo corre
 * en CI, y `agent.ts` además tenía `// @ts-nocheck` en la línea 1.
 *
 * Y las pruebas no podían verlo: ninguna recorre `runAgentReply` de punta a
 * punta. O sea que había cinco `ReferenceError` esperando en producción y
 * ninguna de las tres redes --tipos, build, pruebas-- los tocaba.
 *
 * ── Por qué SOLO estos tres códigos ──────────────────────────────────────
 *
 * El proyecto tiene cientos de errores de tipo y exigir que estén todos en
 * cero haría fallar la suite desde el minuto uno; una prueba que siempre falla
 * es una prueba que se ignora. Estos tres son distintos: no son cuestiones de
 * calidad, son código que se cae al ejecutarse.
 *
 *   TS2304  no existe ese nombre
 *   TS2448  variable usada antes de declararse
 *   TS2454  variable usada antes de asignarse
 */

const RAIZ = path.resolve(__dirname, "../../..");
const QUE_REVIENTAN = /error (TS2304|TS2448|TS2454):/;

describe("nada se usa sin declarar", () => {
  it(
    "tsc no encuentra un solo identificador inexistente",
    () => {
      let salida = "";
      try {
        salida = execFileSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], {
          cwd: RAIZ,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          shell: process.platform === "win32",
        });
      } catch (e: any) {
        // tsc sale con código 1 mientras haya CUALQUIER error de tipo, y hoy
        // hay cientos. Lo que importa no es el código de salida: es si entre
        // ellos hay alguno de los que se caen al ejecutarse.
        salida = `${e?.stdout || ""}${e?.stderr || ""}`;
      }

      const graves = salida
        .split(/\r?\n/)
        .filter((l) => QUE_REVIENTAN.test(l));

      expect(
        graves,
        graves.length
          ? `Hay ${graves.length} identificador(es) que van a lanzar ReferenceError en producción:\n${graves.join("\n")}`
          : "",
      ).toEqual([]);
    },
    // tsc sobre el proyecto entero tarda; el tope por defecto no alcanza.
    600_000,
  );
});
