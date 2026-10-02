import { describe, it, expect, beforeAll } from "vitest";
import { db, products } from "@workspace/db";
import { cargarCatalogoDelNegocio } from "../adaptador";
import { condicionesSinRespaldo } from "../condiciones-sin-respaldo";

/**
 * Pedido del dueño (30-09-2026): el vendedor de WhatsApp respondía "lo voy a
 * consultar" a cosas que el sistema YA sabe. Causas medidas:
 *  1) Los productos de Dropi guardan el stock en metadata.dropiStock; el
 *     vendedor solo miraba la columna `stock` (vacía) → "reviso existencias".
 *  2) La garantía cargada en el producto no le llegaba.
 *  3) El candado de letra chica solo miraba nombre y descripción, así que
 *     borraba una garantía que SÍ estaba en las características.
 */
const TENANT = 9417;

describe("el vendedor recibe lo que el sistema ya sabe", () => {
  let id = 0;
  beforeAll(async () => {
    const [p] = await db.insert(products).values({
      tenantId: TENANT, name: "Mochila Transportadora", description: "Para gatos.", price: "90000", currency: "COP", isActive: true, kind: "physical",
      features: ["Burbuja 360°"],
      metadata: JSON.stringify({ source: "dropi", dropiProductId: 2094072, dropiStock: 99, garantia: "30 días por defectos de fábrica" }),
    } as any).returning();
    id = p.id;
  });

  it("toma el stock de Dropi y la garantía del producto", async () => {
    const cat = await cargarCatalogoDelNegocio(TENANT);
    const p = cat.find((x) => x.id === id)!;
    expect(p.stock).toBe(99);
    expect(p.caracteristicas).toContain("Garantía: 30 días por defectos de fábrica");
  });

  it("una garantía que está en las características NO se borra; una inventada sí", async () => {
    const cat = await cargarCatalogoDelNegocio(TENANT);
    const p = cat.find((x) => x.id === id)!;
    expect(condicionesSinRespaldo("Tiene garantía de 30 días por defectos de fábrica.", { producto: p })).toHaveLength(0);
    const sinGarantia = { ...p, caracteristicas: ["Burbuja 360°"] };
    expect(condicionesSinRespaldo("Tiene garantía de 30 días.", { producto: sinGarantia }).length).toBeGreaterThan(0);
  });
});

describe("productos digitales", () => {
  it("si el negocio no cargó la entrega, el vendedor igual sabe cómo llega el acceso (no 'lo consulto')", async () => {
    const { hechosYProhibiciones } = await import("../nicho");
    const r = hechosYProhibiciones({} as any, "digital", []);
    expect(r.hechos.join(" ")).toMatch(/acceso se envía por este mismo chat/);
    expect(r.prohibiciones.join(" ")).not.toMatch(/di que lo confirmas/);
    expect(r.sinConfirmar.join(" ")).not.toMatch(/cómo se entrega/);
  });

  it("un digital sin stock cargado está disponible, no 'revisamos existencias'", async () => {
    const { ejecutores } = await import("../herramientas");
    const ctx: any = { catalogo: [{ id: 7, name: "Curso de Piano", description: null, price: 60000, currency: "COP", kind: "digital", stock: null }], estado: { detalleProducto: {}, datos: {} } };
    const r: any = (ejecutores as any).consultar_disponibilidad(ctx, { productoId: 7 });
    expect(r.mensaje).toMatch(/disponible siempre/);
  });
});
