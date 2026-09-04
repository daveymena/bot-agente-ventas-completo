import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * `agent.ts` NO puede volver a quedar fuera del chequeo de tipos.
 *
 * El 2026-08-31 el bot estuvo un día entero contestándole "Estoy teniendo
 * problemas técnicos" a cada cliente que preguntaba por un producto. Los
 * saludos funcionaban --son texto fijo-- así que desde afuera parecía andar.
 *
 * La causa fueron TRES identificadores usados y nunca importados, todos en
 * este archivo:
 *
 *   `etapaDelTrato`   leído 95 líneas antes de su `let` (zona muerta temporal)
 *   `pidePagar`       usado sin importar -> ReferenceError en cada venta
 *   `processPurchaseConfirmation`  ídem, y revienta AL CONFIRMAR UNA COMPRA
 *
 * Los tres son errores que TypeScript marca con los ojos cerrados. No los
 * marcó porque la línea 1 del archivo decía `// @ts-nocheck`: 3.000 líneas, el
 * corazón de la venta, sin chequear.
 *
 * Y las 1.194 pruebas pasaban con los tres bugs adentro, porque ninguna
 * recorre `runAgentReply` de punta a punta. O sea que el tipado era la ÚNICA
 * red que podía agarrarlos, y estaba desactivada.
 *
 * Sacarlo costó once errores, cuatro de ellos bugs reales. No vale la pena
 * volver a ponerlo nunca.
 */

const RUTA = path.resolve(__dirname, "../agent.ts");

describe("el archivo más crítico del bot se chequea", () => {
  it("agent.ts NO tiene @ts-nocheck", () => {
    const codigo = readFileSync(RUTA, "utf8");
    // Se mira solo el arranque: el resto del archivo lo MENCIONA en
    // comentarios que explican esta misma historia, y esos no desactivan nada.
    const arranque = codigo.split(/\r?\n/).slice(0, 15).join("\n");
    expect(arranque).not.toMatch(/^\s*\/\/\s*@ts-nocheck/m);
  });

  it("tampoco se cuela un @ts-ignore suelto arriba de todo", () => {
    const codigo = readFileSync(RUTA, "utf8");
    const arranque = codigo.split(/\r?\n/).slice(0, 5).join("\n");
    expect(arranque).not.toMatch(/@ts-ignore/);
  });

  it("los tres identificadores del incidente están importados", () => {
    // No comprueba el tipado --de eso se ocupa tsc-- sino que estas tres
    // importaciones concretas no se borren por accidente en un refactor.
    const codigo = readFileSync(RUTA, "utf8");
    for (const nombre of ["pidePagar", "processPurchaseConfirmation", "puedeMandarPago"]) {
      const importado = new RegExp(`import\\s*\\{[^}]*\\b${nombre}\\b[^}]*\\}\\s*from`, "s").test(codigo);
      expect(importado, `${nombre} tiene que estar importado`).toBe(true);
    }
  });
});
