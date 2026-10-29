import { describe, it, expect, vi } from "vitest";
import {
  migrarMetricas,
  filaDesdeGraph,
  guardarInsightsDiarios,
  resumenPorCampana,
  descargarInsights,
  crearManejadorInsights,
  programarSincronizacionDiaria,
  hashEstable,
  VENTANA_NOCTURNA_MS,
  MAX_PAGINAS_INSIGHTS,
} from "../metricas";
import { migrarCola, reclamar, listarTrabajos } from "../cola";
import { sqlEnMemoria } from "./sql-pglite";
import type { ClienteGraph } from "../graph";

const filaGraph = (campana: string, fecha: string, spend: string, acciones: unknown[] = []) => ({
  campaign_id: campana,
  campaign_name: `Campaña ${campana}`,
  date_start: fecha,
  spend,
  impressions: "1000",
  clicks: "50",
  reach: "800",
  actions: acciones,
});

describe("filaDesdeGraph", () => {
  it("suma solo los tipos de acción de resultado", () => {
    const f = filaDesdeGraph(
      filaGraph("c1", "2026-10-20", "12.5", [
        { action_type: "lead", value: "3" },
        { action_type: "page_engagement", value: "99" },
        { action_type: "link_click", value: "4" },
      ]),
    );
    expect(f).not.toBeNull();
    expect(f!.resultados).toBe(7);
    expect(f!.gasto).toBe(12.5);
  });

  it("descarta filas sin campaña o sin fecha válida", () => {
    expect(filaDesdeGraph({ date_start: "2026-10-20" })).toBeNull();
    expect(filaDesdeGraph({ campaign_id: "c1", date_start: "20/10/2026" })).toBeNull();
  });

  it("valores negativos o no numéricos cuentan como cero", () => {
    expect(filaDesdeGraph(filaGraph("c1", "2026-10-20", "abc"))!.gasto).toBe(0);
  });
});

describe("descargarInsights", () => {
  it("sigue la paginación con el cursor 'after'", async () => {
    const llamadas: Record<string, string>[] = [];
    const graph: ClienteGraph = {
      get: vi.fn(async (_ruta: string, params: Record<string, string>) => {
        llamadas.push(params);
        if (!params.after) {
          return {
            data: [filaGraph("c1", "2026-10-19", "5")],
            paging: { cursors: { after: "P2" }, next: "https://x" },
          };
        }
        return { data: [filaGraph("c1", "2026-10-20", "7")], paging: {} };
      }),
      post: vi.fn(),
    };
    const filas = await descargarInsights(graph, "T", "act_1");
    expect(filas.map((f) => f.fecha)).toEqual(["2026-10-19", "2026-10-20"]);
    expect(llamadas[1].after).toBe("P2");
    expect(llamadas[0].level).toBe("campaign");
    expect(llamadas[0].time_increment).toBe("1");
  });

  it("tiene tope de páginas para no quedarse en bucle", async () => {
    const graph: ClienteGraph = {
      get: vi.fn(async () => ({
        data: [filaGraph("c1", "2026-10-20", "1")],
        paging: { cursors: { after: "same" }, next: "https://x" },
      })),
      post: vi.fn(),
    };
    await descargarInsights(graph, "T", "act_1");
    expect(graph.get).toHaveBeenCalledTimes(MAX_PAGINAS_INSIGHTS);
  });
});

describe("almacén de métricas", () => {
  it("guardar dos veces actualiza, no duplica", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarMetricas(sql);
    const fila = filaDesdeGraph(filaGraph("c1", "2026-10-20", "10"))!;
    await guardarInsightsDiarios(sql, 1, "act_1", [fila]);
    await guardarInsightsDiarios(sql, 1, "act_1", [{ ...fila, gasto: 25 }]);
    const r = await resumenPorCampana(sql, 1, "act_1", "2026-10-01", "2026-10-31");
    expect(r).toHaveLength(1);
    expect(r[0].gasto).toBe(25);
  });

  it("el resumen nunca mezcla negocios ni cuentas", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarMetricas(sql);
    const fila = filaDesdeGraph(filaGraph("c1", "2026-10-20", "10"))!;
    await guardarInsightsDiarios(sql, 1, "act_1", [fila]);
    await guardarInsightsDiarios(sql, 2, "act_9", [{ ...fila, gasto: 999 }]);
    const del1 = await resumenPorCampana(sql, 1, "act_1", "2026-10-01", "2026-10-31");
    expect(del1[0].gasto).toBe(10);
    expect(await resumenPorCampana(sql, 1, "act_9", "2026-10-01", "2026-10-31")).toHaveLength(0);
  });

  it("calcula costo por resultado y lo deja en null sin resultados", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarMetricas(sql);
    await guardarInsightsDiarios(sql, 1, "act_1", [
      { campanaId: "c1", campanaNombre: "a", fecha: "2026-10-19", gasto: 10, impresiones: 0, clics: 0, alcance: 0, resultados: 4 },
      { campanaId: "c2", campanaNombre: "b", fecha: "2026-10-19", gasto: 5, impresiones: 0, clics: 0, alcance: 0, resultados: 0 },
    ]);
    const r = await resumenPorCampana(sql, 1, "act_1", "2026-10-01", "2026-10-31");
    expect(r.find((x) => x.campanaId === "c1")!.costoPorResultado).toBe(2.5);
    expect(r.find((x) => x.campanaId === "c2")!.costoPorResultado).toBeNull();
  });
});

describe("trabajo sincronizar_insights", () => {
  it("baja las métricas y las guarda para el negocio del trabajo", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarCola(sql);
    await migrarMetricas(sql);
    await programarSincronizacionDiaria(sql, [{ tenantId: 7, cuenta: "act_7" }], "2026-10-21");
    const graph: ClienteGraph = {
      get: vi.fn(async () => ({ data: [filaGraph("c7", "2026-10-20", "30")], paging: {} })),
      post: vi.fn(),
    };
    const manejador = crearManejadorInsights({ sql, graph, tokenDe: async (id) => (id === 7 ? "TOKEN7" : null) });
    // La demora puede ser mayor a 0: forzamos la elegibilidad para la prueba.
    await sql.query(`UPDATE meta_trabajos SET disponible_en = now()`);
    const trabajo = (await reclamar(sql))!;
    await manejador(trabajo);
    const r = await resumenPorCampana(sql, 7, "act_7", "2026-10-01", "2026-10-31");
    expect(r[0].gasto).toBe(30);
  });

  it("sin conexión de Meta el trabajo falla con mensaje claro", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarCola(sql);
    await migrarMetricas(sql);
    await programarSincronizacionDiaria(sql, [{ tenantId: 8, cuenta: "act_8" }], "2026-10-21");
    await sql.query(`UPDATE meta_trabajos SET disponible_en = now()`);
    const trabajo = (await reclamar(sql))!;
    const manejador = crearManejadorInsights({
      sql,
      graph: { get: vi.fn(), post: vi.fn() },
      tokenDe: async () => null,
    });
    await expect(manejador(trabajo)).rejects.toThrow(/sin conexión de Meta/);
  });
});

describe("programarSincronizacionDiaria", () => {
  it("es idempotente por cuenta y fecha", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarCola(sql);
    const cuentas = [{ tenantId: 1, cuenta: "act_1" }, { tenantId: 2, cuenta: "act_2" }];
    const a = await programarSincronizacionDiaria(sql, cuentas, "2026-10-21");
    const b = await programarSincronizacionDiaria(sql, cuentas, "2026-10-21");
    expect(a.encolados).toBe(2);
    expect(b.repetidos).toBe(2);
    const otroDia = await programarSincronizacionDiaria(sql, cuentas, "2026-10-22");
    expect(otroDia.encolados).toBe(2);
  });

  it("la demora queda dentro de la ventana de 6 h y es estable", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarCola(sql);
    await programarSincronizacionDiaria(sql, [{ tenantId: 3, cuenta: "act_3" }], "2026-10-21");
    const [t] = await listarTrabajos(sql, 3);
    expect(t.estado).toBe("pendiente");
    const esperado = hashEstable("3:act_3") % VENTANA_NOCTURNA_MS;
    const { rows } = await sql.query(
      `SELECT EXTRACT(EPOCH FROM (disponible_en - creado_en)) * 1000 AS ms FROM meta_trabajos WHERE tenant_id = 3`,
    );
    const ms = Math.round(Number(rows[0].ms));
    expect(ms).toBeGreaterThanOrEqual(esperado - 5);
    expect(ms).toBeLessThanOrEqual(esperado + 5);
  });
});
