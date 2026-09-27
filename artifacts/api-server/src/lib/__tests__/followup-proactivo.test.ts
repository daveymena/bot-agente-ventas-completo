import { describe, expect, it } from "vitest";
import { calcularFechaSeguimiento, politicaDeSeguimiento } from "../followUpScheduler";

describe("seguimiento proactivo según intención comercial", () => {
  it("recupera un cierre antes que un lead que apenas explora", () => {
    const cierre = politicaDeSeguimiento("closing", 90);
    const tibio = politicaDeSeguimiento("warm", 35);
    const frio = politicaDeSeguimiento("cold", 5);

    expect(cierre.tipo).toBe("checkout_recovery");
    expect(cierre.prioridad).toBe("urgent");
    expect(cierre.demoraMs).toBe(6 * 60 * 60 * 1000);
    expect(tibio.demoraMs).toBe(3 * 24 * 60 * 60 * 1000);
    expect(frio.demoraMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("da prioridad alta a un lead caliente con puntaje suficiente", () => {
    expect(politicaDeSeguimiento("hot", 75).prioridad).toBe("high");
    expect(politicaDeSeguimiento("hot", 60).prioridad).toBe("medium");
    expect(politicaDeSeguimiento("negotiating", 65)).toMatchObject({
      prioridad: "high",
      tipo: "decision_support",
    });
  });

  it("calcula la fecha desde una referencia estable", () => {
    const desde = new Date("2026-09-27T12:00:00.000Z");
    expect(calcularFechaSeguimiento("closing", 90, desde).toISOString()).toBe("2026-09-27T18:00:00.000Z");
    expect(calcularFechaSeguimiento("warm", 30, desde).toISOString()).toBe("2026-09-30T12:00:00.000Z");
  });
});
