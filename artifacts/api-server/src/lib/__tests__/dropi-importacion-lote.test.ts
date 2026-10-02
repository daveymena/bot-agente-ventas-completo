import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Importación en lote (29-09-2026): antes el panel importaba de a uno y el
 * endpoint de varios corría dentro de la petición (moría a los ~150 s).
 * Acá se prueba la regla de precio y el ciclo del lote sin tocar Dropi.
 */

const importar = vi.fn();
vi.mock("../dropi-directo", async (orig) => {
  const real: any = await orig();
  return { ...real, importarProductoDropi: (...a: any[]) => importar(...a) };
});
vi.mock("../avisos", () => ({ avisarAlDueno: vi.fn(async () => ({ whatsapp: false, telegram: false })) }));

process.env.DROPI_LOTE_PAUSA_MS = "1";

const esperar = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
};

describe("precio por multiplicador", () => {
  it("redondea a miles terminado en 900 y nunca queda por debajo del factor", async () => {
    const { precioPorFactor } = await import("../dropi-directo");
    expect(precioPorFactor(13000, 2.5)).toBe(32900); // 32.500 → 32.900
    expect(precioPorFactor(13180, 2.5)).toBe(33900); // 32.950 → 33.900 (no 32.900)
    expect(precioPorFactor(10000, 3)).toBe(30900);   // 30.000 → 30.900
    expect(precioPorFactor(0, 2)).toBeNull();
    expect(precioPorFactor(10000, 1)).toBeNull();
  });
});

describe("lote de importación", () => {
  beforeEach(() => { importar.mockReset(); vi.resetModules(); });

  it("importa todos, sin repetidos, y cuenta nuevos, existentes y fallidos", async () => {
    importar.mockImplementation(async (_t: number, _tok: string, id: number) =>
      id === 3 ? { ok: false, error: "archivado" } : { ok: true, productId: id * 10, nombre: `P${id}`, yaExistia: id === 2 });
    const { iniciarLote, loteDelNegocio } = await import("../dropi-importacion-lote");
    const r = iniciarLote(7, "tok", [{ dropiProductId: 1 }, { dropiProductId: 2 }, { dropiProductId: 1 }, { dropiProductId: 3 }], { curar: false });
    expect(r.ok).toBe(true);
    expect(loteDelNegocio(7)!.total).toBe(3); // el 1 repetido cuenta una vez
    await esperar(() => loteDelNegocio(7)!.estado !== "en_curso");
    const l = loteDelNegocio(7)!;
    expect(l.estado).toBe("terminado");
    expect(l.hechos).toBe(3);
    expect(l.importados.map((x) => [x.dropiProductId, x.nuevo])).toEqual([[1, true], [2, false]]);
    expect(l.fallidos).toEqual([{ dropiProductId: 3, error: "archivado" }]);
    expect(importar).toHaveBeenCalledTimes(3);
  });

  it("no deja arrancar un segundo lote mientras corre el primero, y se puede detener", async () => {
    importar.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 20)); return { ok: true, productId: 1, nombre: "x" }; });
    const { iniciarLote, detenerLote, loteDelNegocio } = await import("../dropi-importacion-lote");
    const items = Array.from({ length: 50 }, (_, i) => ({ dropiProductId: i + 1 }));
    expect(iniciarLote(8, "tok", items).ok).toBe(true);
    const segundo = iniciarLote(8, "tok", items);
    expect(segundo.ok).toBe(false);
    expect(detenerLote(8)).toBe(true);
    await esperar(() => loteDelNegocio(8)!.estado !== "en_curso");
    expect(loteDelNegocio(8)!.estado).toBe("detenido");
    expect(loteDelNegocio(8)!.hechos).toBeLessThan(50);
  });
});
