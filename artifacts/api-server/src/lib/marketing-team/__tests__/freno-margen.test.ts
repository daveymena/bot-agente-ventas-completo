import { describe, expect, it } from "vitest";
import { evaluarFrenoMargen } from "../budget-guard";

describe("evaluarFrenoMargen", () => {
  it("no juzga sin ticket o margen", () => {
    expect(evaluarFrenoMargen({ gasto: 50000, ventas: 0, ticketPromedio: null, margenFraccion: 0.4 }).accion).toBe("observar");
    expect(evaluarFrenoMargen({ gasto: 50000, ventas: 2, ticketPromedio: 60000, margenFraccion: null }).accion).toBe("observar");
  });
  it("mata sin ventas si gasto > 2x objetivo", () => {
    // ticket 60000 x margen 0.4 = objetivo 24000; gasto 50000 > 48000
    const r = evaluarFrenoMargen({ gasto: 50000, ventas: 0, ticketPromedio: 60000, margenFraccion: 0.4 });
    expect(r.accion).toBe("matar");
    expect(r.cpaObjetivo).toBe(24000);
  });
  it("observa sin ventas dentro del presupuesto de prueba", () => {
    const r = evaluarFrenoMargen({ gasto: 10000, ventas: 0, ticketPromedio: 60000, margenFraccion: 0.4 });
    expect(r.accion).toBe("observar");
  });
  it("mata con CPA alto y muestra suficiente", () => {
    // gasto 120000 / 3 ventas = CPA 40000 > 1.25 x 24000 = 30000
    const r = evaluarFrenoMargen({ gasto: 120000, ventas: 3, ticketPromedio: 60000, margenFraccion: 0.4 });
    expect(r.accion).toBe("matar");
    expect(r.cpa).toBe(40000);
  });
  it("ok con CPA sano", () => {
    const r = evaluarFrenoMargen({ gasto: 40000, ventas: 3, ticketPromedio: 60000, margenFraccion: 0.4 });
    expect(r.accion).toBe("ok");
  });
});
