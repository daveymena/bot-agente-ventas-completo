/**
 * El resumen de dónde se le va el tiempo a Atlas.
 *
 * La parte que se puede probar sin base: el resumen en castellano. Es lo que
 * contesta la pregunta que el admin hace de verdad ("¿por qué tarda tanto?")
 * sin obligarlo a leer milisegundos.
 */
import { describe, it, expect } from "vitest";
import { resumirTurnos } from "../diagnostico-de-turnos";

const turno = (totalMs: number, estado: string, tramos: any[] = []) => ({ totalMs, estado, tramos });

describe("resumen de los turnos de Atlas", () => {
  it("sin turnos, lo dice en vez de inventar un promedio", () => {
    expect(resumirTurnos([])).toBe("Todavía no hay turnos medidos.");
  });

  it("cuenta los turnos y da promedio y peor caso", () => {
    const r = resumirTurnos([turno(2000, "completo"), turno(8000, "completo")]);
    expect(r).toContain("2 turnos medidos");
    expect(r).toContain("promedio 5.0s");
    expect(r).toContain("el peor 8.0s");
  });

  it("cuenta aparte los que no terminaron", () => {
    const r = resumirTurnos([turno(1000, "completo"), turno(135000, "cortado"), turno(500, "error")]);
    expect(r).toContain("2 sin terminar");
  });

  it("no menciona fallos cuando no los hubo", () => {
    expect(resumirTurnos([turno(1000, "completo")])).not.toContain("sin terminar");
  });

  /**
   * Lo importante del resumen: sumar la MISMA etapa entre turnos. Una etapa
   * que aparece poco pero se lleva 40s importa más que una que aparece siempre
   * y se lleva 200ms -- mirando un solo turno eso no se ve.
   */
  it("señala la etapa que más tiempo se lleva sumando todos los turnos", () => {
    const r = resumirTurnos([
      turno(50000, "completo", [{ etapa: "investigar", ms: 40000 }, { etapa: "responder", ms: 1000 }]),
      turno(10000, "completo", [{ etapa: "responder", ms: 900 }]),
    ]);
    expect(r).toContain("investigar");
  });

  /** Una etapa frecuente pero barata NO puede ganarle a una cara y rara. */
  it("gana la que suma más tiempo, no la que aparece más veces", () => {
    const r = resumirTurnos([
      turno(1000, "completo", [{ etapa: "barata", ms: 100 }]),
      turno(1000, "completo", [{ etapa: "barata", ms: 100 }]),
      turno(1000, "completo", [{ etapa: "barata", ms: 100 }]),
      turno(60000, "completo", [{ etapa: "cara", ms: 55000 }]),
    ]);
    expect(r).toContain("cara");
    expect(r).not.toContain("donde más se va el tiempo: barata");
  });

  it("aguanta turnos sin tramos sin romperse", () => {
    expect(() => resumirTurnos([{ totalMs: 1000, estado: "completo" }])).not.toThrow();
  });
});
