import { describe, it, expect } from "vitest";
import { migrarMetricas, guardarInsightsDiarios, historicoDesdeTabla, type FilaDiaria } from "../metricas";
import { sqlEnMemoria } from "./sql-pglite";

// "Ahora" fijo: 2026-10-21 10:00 UTC. El histórico cubre hasta ayer (2026-10-20).
const AHORA = new Date("2026-10-21T10:00:00Z");

function diasAtras(n: number): string {
  const d = new Date(Date.UTC(2026, 9, 20));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function filas(campana: string, cantidad: number, gasto: number, resultados = 2): FilaDiaria[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    campanaId: campana,
    campanaNombre: `Campaña ${campana}`,
    fecha: diasAtras(i),
    gasto,
    impresiones: 1000,
    clics: 40,
    alcance: 500,
    resultados,
  }));
}

describe("historicoDesdeTabla", () => {
  it("devuelve null si faltan días en la tabla", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarMetricas(sql);
    await guardarInsightsDiarios(sql, 1, "act_1", filas("c1", 3, 10));
    expect(await historicoDesdeTabla(sql, 1, "act_1", 7, AHORA)).toBeNull();
  });

  it("devuelve null si la última sincronización es vieja", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarMetricas(sql);
    await guardarInsightsDiarios(sql, 1, "act_1", filas("c1", 7, 10));
    const dentroDeTresDias = new Date("2026-10-25T10:00:00Z");
    expect(await historicoDesdeTabla(sql, 1, "act_1", 7, dentroDeTresDias)).toBeNull();
  });

  it("suma la ventana completa con cobertura", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarMetricas(sql);
    await guardarInsightsDiarios(sql, 1, "act_1", [...filas("c1", 7, 10), ...filas("c2", 7, 5, 0)]);
    const h = await historicoDesdeTabla(sql, 1, "act_1", 7, AHORA);
    expect(h).not.toBeNull();
    expect(h!.hasta).toBe("2026-10-20");
    expect(h!.desde).toBe(diasAtras(6));
    expect(h!.totals.spend).toBe(7 * 10 + 7 * 5);
    expect(h!.totals.results).toBe(14);
    const c1 = h!.campaigns.find((c) => c.id === "c1")!;
    expect(c1.costPerResult).toBeCloseTo(70 / 14);
    expect(c1.ctr).toBeCloseTo(40 / 1000);
    expect(c1.reach).toBe(0);
    expect(h!.campaigns.find((c) => c.id === "c2")!.costPerResult).toBe(0);
  });

  it("nunca mezcla datos de otro negocio", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarMetricas(sql);
    await guardarInsightsDiarios(sql, 2, "act_9", filas("cX", 7, 999));
    expect(await historicoDesdeTabla(sql, 1, "act_1", 7, AHORA)).toBeNull();
  });
});
