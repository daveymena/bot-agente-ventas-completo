import { describe, it, expect } from "vitest";
import { sinAccionesRepetidas } from "../../routes/operator-opencode";

/**
 * Un plan con TRES acciones para el mismo anuncio.
 *
 * Lo que vio el admin el 2026-08-30, pidiendo UNA campaña de web:
 *
 *   Crear el anuncio de "...AGENTES AUTONOM" con $15.000/día
 *   Crear el anuncio de "...AGENTES AUTONOM" con $15.000/día
 *   Crear el anuncio de "...AGENTES AUTÓNOM" con $15.000/día
 *
 * Confirmar eso crea tres campañas cuando pidió una — y cada una gasta cuando
 * se activa. El plan se arma sumando lo que el modelo propone en varias vueltas
 * del turno, y nadie miraba si ya estaba propuesto.
 */
describe("El plan no propone dos veces lo mismo", () => {
  it("el caso real: tres acciones, una sola queda", () => {
    const plan = [
      { tool: "crear_anuncio", args: { producto: "IA 2026: HERRAMIENTAS + AGENTES AUTONOMOS", dailyBudget: 15000 } },
      { tool: "crear_anuncio", args: { producto: "IA 2026: HERRAMIENTAS + AGENTES AUTONOMOS", dailyBudget: 15000 } },
      { tool: "crear_anuncio", args: { producto: "IA 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS", dailyBudget: 15000 } },
    ];
    expect(sinAccionesRepetidas(plan)).toHaveLength(1);
  });

  it("el acento no hace distinta a la misma acción", () => {
    // El modelo escribe el mismo nombre de las dos formas en el mismo turno.
    const plan = [
      { tool: "crear_anuncio", args: { producto: "AUTÓNOMOS" } },
      { tool: "crear_anuncio", args: { producto: "autonomos" } },
    ];
    expect(sinAccionesRepetidas(plan)).toHaveLength(1);
  });

  it("dos anuncios DISTINTOS siguen siendo dos", () => {
    // El admin pidió WhatsApp y web: son dos campañas legítimas y no se pueden
    // colapsar. Es el caso que hace peligroso deduplicar solo por herramienta.
    const plan = [
      { tool: "crear_anuncio", args: { producto: "IA 2026", objetivo: "mensajes", dailyBudget: 15000 } },
      { tool: "crear_anuncio", args: { producto: "IA 2026", objetivo: "trafico", dailyBudget: 15000 } },
    ];
    expect(sinAccionesRepetidas(plan)).toHaveLength(2);
  });

  it("distinto presupuesto es distinta acción", () => {
    const plan = [
      { tool: "crear_anuncio", args: { producto: "IA 2026", dailyBudget: 15000 } },
      { tool: "crear_anuncio", args: { producto: "IA 2026", dailyBudget: 30000 } },
    ];
    expect(sinAccionesRepetidas(plan)).toHaveLength(2);
  });

  it("conserva el orden y la primera de cada una", () => {
    const plan = [
      { tool: "update_product", args: { id: 1 } },
      { tool: "crear_anuncio", args: { producto: "X" } },
      { tool: "update_product", args: { id: 1 } },
    ];
    const r = sinAccionesRepetidas(plan);
    expect(r.map((a) => a.tool)).toEqual(["update_product", "crear_anuncio"]);
  });

  it("no se cae con un plan vacío o sin args", () => {
    expect(sinAccionesRepetidas([])).toEqual([]);
    expect(sinAccionesRepetidas([{ tool: "analyze_system" }, { tool: "analyze_system" }])).toHaveLength(1);
  });
});
