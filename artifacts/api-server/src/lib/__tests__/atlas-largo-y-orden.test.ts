import { describe, it, expect } from "vitest";
import { ATLAS_NUCLEO, OPERATOR_SYSTEM_PROMPT } from "../app-operator";

/**
 * Atlas contestaba en 40 líneas con la acción al final, el bloque "Lo que
 * revisé" con un renglón por herramienta y dos preguntas de cierre (medido el
 * 11-09-2026). La regla de largo vive en el prompt que usa producción
 * (ATLAS_NUCLEO) y en su gemelo (OPERATOR_SYSTEM_PROMPT): las dos copias ya
 * se desincronizaron antes (emoji del catálogo), así que acá se exige que las
 * dos la tengan.
 */
describe("la regla de largo y orden está en las dos copias del prompt de Atlas", () => {
  for (const [nombre, texto] of [["ATLAS_NUCLEO", ATLAS_NUCLEO], ["OPERATOR_SYSTEM_PROMPT", OPERATOR_SYSTEM_PROMPT]] as const) {
    it(nombre, () => {
      expect(texto).toMatch(/LARGO Y ORDEN/);
      expect(texto).toMatch(/UNA (sola )?línea al final/);
      expect(texto).toMatch(/[Mm]áximo 5 ítems/);
      expect(texto).toMatch(/UN solo cierre/);
      expect(texto).toMatch(/6 a 12 líneas/);
      // No quedó la versión vieja, que no decía cómo.
      expect(texto).not.toMatch(/Sé claro y conciso/);
    });
  }

  it("no contradice la regla del emoji por línea que el admin pidió conservar", () => {
    expect(ATLAS_NUCLEO).toMatch(/El admin prefiere ese formato/);
  });
});
