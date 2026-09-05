/**
 * El selector de estilo del editor tiene que nombrar familias que existan.
 *
 * ⚠️ Esta prueba existe porque el fallo ya pasó, y es de los peores que hay:
 * uno que NO se ve. El editor ofrecía siete estilos --elegante, startup, corp,
 * bold, minimalista, dark_premium, warm-- y ninguno existía del lado del
 * servidor. `tokensDe()` no los reconocía, caía al respaldo, y los siete
 * botones producían EXACTAMENTE la misma landing.
 *
 * Nada en la pantalla lo delataba: los botones respondían, la pastilla se
 * pintaba de color, la vista previa se recargaba. Solo aparecía comparando las
 * dos listas, que es justo lo que nadie hace.
 *
 * Se verifica del lado del servidor y sobre el archivo del editor porque el
 * contrato es de ida y vuelta: el editor manda `?familia=` y el renderer lo
 * resuelve. Si las dos listas se separan otra vez, esto falla acá.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FAMILIAS, esFamilia, tokensDe, TOKENS } from "../design-system";

const EDITOR = readFileSync(
  join(__dirname, "..", "..", "..", "..", "..", "ventas-pro", "src", "pages", "landing-studio-v2.tsx"),
  "utf8",
);

/** Los `value:` de la lista FAMILIAS del editor. */
function familiasDelEditor(): string[] {
  const bloque = EDITOR.slice(EDITOR.indexOf("const FAMILIAS"), EDITOR.indexOf("];", EDITOR.indexOf("const FAMILIAS")));
  return Array.from(bloque.matchAll(/value:\s*"([^"]+)"/g)).map((m) => m[1]);
}

describe("las dos listas de familias no se pueden separar", () => {
  it("el editor ofrece al menos una familia", () => {
    expect(familiasDelEditor().length).toBeGreaterThan(0);
  });

  /** LA PRUEBA QUE IMPORTA: cada estilo del editor tiene que existir. */
  it.each(familiasDelEditor())("\"%s\" existe en el renderer", (valor) => {
    expect(esFamilia(valor), `el editor ofrece "${valor}", que el renderer no conoce: caería al respaldo y daría la misma landing que los demás`).toBe(true);
  });

  /**
   * Y no alcanza con que existan: si dos estilos distintos resolvieran a los
   * mismos tokens, el admin elegiría entre botones que dan lo mismo -- que es
   * el síntoma exacto que tenía.
   */
  it("dos estilos distintos no dan la misma landing", () => {
    const vistos = new Map<string, string>();
    for (const valor of familiasDelEditor()) {
      const familia = tokensDe(valor).familia;
      const gemelo = vistos.get(familia);
      expect(gemelo, `"${valor}" y "${gemelo}" resuelven a la misma familia`).toBeUndefined();
      vistos.set(familia, valor);
    }
  });

  /** El editor debería ofrecer TODAS: esconder la mitad del catálogo es perderlas. */
  it("no deja familias sin ofrecer", () => {
    const ofrecidas = new Set(familiasDelEditor());
    const faltan = FAMILIAS.filter((f) => !ofrecidas.has(f));
    expect(faltan, `el renderer sabe dibujar ${faltan.join(", ")} pero el editor no las ofrece`).toHaveLength(0);
  });

  /** Y la etiqueta que ve el admin es la del design system, no una inventada. */
  it("los nombres visibles son los del design system", () => {
    for (const f of FAMILIAS) {
      expect(EDITOR, `falta la etiqueta "${TOKENS[f].nombre}"`).toContain(`label: "${TOKENS[f].nombre}"`);
    }
  });
});
