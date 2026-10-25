import { describe, it, expect, vi } from "vitest";
vi.mock("../app-operator", () => ({ executeAction: vi.fn(async (name: string) => {
  if (name === "analyze_system") return { ok: true, data: { products: 142, physicalProducts: 58, digitalProducts: 84, productsWithoutImage: 3 } };
  if (name === "whatsapp_status") return { ok: true, data: { state: "connected" } };
  if (name === "fb_status") return { ok: true, data: { ok: true, cuentaPuedeGastar: true } };
  if (name === "fb_list_campaigns") return { ok: true, data: { campañas: [] } };
  return { ok: true, data: { totalLeads: 17 } };
}) }));
import { diagnosticoDelNegocio } from "../diagnostico-de-inicio";
import { monedaDelCatalogo } from "../../../../ventas-pro/src/lib/moneda-producto";

describe("hallazgos del catálogo en navegador", () => {
  it("el inicio de Atlas informa el total real, no una página de 50", async () => {
    const d = await diagnosticoDelNegocio({ tenantId: 1 });
    expect(d.productos).toEqual({ total: 142, fisicos: 58, digitales: 84, sinFoto: 3 });
    expect(d.texto).toContain("142 productos");
  });
  it("un catálogo COP no crea precios en MXN", () => {
    expect(monedaDelCatalogo([{currency:"COP"},{currency:"COP"},{currency:"USD"}])).toBe("COP");
  });
  it("preserva moneda elegida y permite negocios con otra moneda", () => {
    expect(monedaDelCatalogo([{currency:"USD"}],"EUR")).toBe("EUR");
    expect(monedaDelCatalogo([{currency:"MXN"}])).toBe("MXN");
    expect(monedaDelCatalogo([{currency:null}])).toBe("COP");
  });
});
