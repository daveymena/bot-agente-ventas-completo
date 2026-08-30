import { describe, it, expect } from "vitest";
import { acortarTitular } from "../app-operator";

/**
 * Un carácter de más le costó el anuncio entero.
 *
 * 2026-08-30, en vivo: el admin pidió la campaña, Atlas escribió el titular
 * "IA 2026: herramientas + agentes autónomos" — 41 caracteres — y el
 * validador devolvió error. El turno se cayó y no se creó nada.
 *
 * Él lo dijo así: "me dijo que el copy era muy largo, él debería reducirlo en
 * automático y solo pedir si deseamos agregar o modificar".
 *
 * Tiene razón: recortar en el último espacio antes del tope es una decisión
 * mecánica que no necesita al modelo. Devolver el turno entero por un carácter
 * es hacerle pagar al admin un problema de formato que el servidor resuelve.
 */
describe("El titular se acorta solo, no rompe el anuncio", () => {
  it("el caso real: 41 caracteres quedan dentro del tope", () => {
    const r = acortarTitular("IA 2026: herramientas + agentes autónomos", 40);
    expect(r.length).toBeLessThanOrEqual(40);
    expect(r).toBe("IA 2026: herramientas + agentes");
  });

  it("corta por palabra, no por carácter", () => {
    // Cortar a lo bruto deja "…agentes autóno", que se ve roto.
    expect(acortarTitular("IA 2026: herramientas + agentes autónomos", 40)).not.toMatch(/autóno$/);
    expect(acortarTitular("Curso completo de piano desde cero hasta avanzado", 40)).toBe(
      "Curso completo de piano desde cero hasta",
    );
  });

  it("no toca lo que ya entra", () => {
    for (const t of ["Curso de Piano Completo", "IA 2026: agentes", ""]) {
      expect(acortarTitular(t, 40)).toBe(t);
    }
  });

  it("no deja signos colgando al final", () => {
    // "...herramientas +" con el signo suelto se lee como un error.
    expect(acortarTitular("Domina la IA con herramientas + agentes autónomos ya", 40)).not.toMatch(/[+\-:,.\s]$/);
  });

  it("una sola palabra más larga que el tope se parte igual", () => {
    // No hay por dónde cortar sin partirla, y es preferible a que la corte
    // Meta en un lugar cualquiera.
    const r = acortarTitular("Superextraordinariamentelarguísimapalabraunica", 40);
    expect(r.length).toBeLessThanOrEqual(40);
    expect(r.length).toBeGreaterThan(0);
  });
});
