/**
 * POS tienda física (09-10-2026): inventario con auditoría, venta que
 * descuenta y factura (o deja recibo), caja con arqueo, devoluciones que
 * no devuelven más de lo vendido, reportes y exportación.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

let dbMod: any;
let tenantId = 0;
let prodA = 0;
let prodB = 0;

async function crearProducto(nombre: string, precio: number, stock: number | null) {
  const [p] = await dbMod.db.insert(dbMod.products).values({
    tenantId, name: nombre, description: `${nombre} de prueba`, price: precio, currency: "COP", stock,
  }).returning({ id: dbMod.products.id });
  return (p as any).id as number;
}

describe("POS tienda física", () => {
  beforeAll(async () => {
    dbMod = await import("@workspace/db");
    await dbMod.ensureDbReady();
    const email = `pos-test-${Date.now()}@test.local`;
    const [tenant] = await dbMod.db.insert(dbMod.tenants).values({
      name: "POS Test", email, slug: `pos-${Date.now()}`, brandName: "POS Test",
    }).returning();
    tenantId = tenant.id;
    const { activarTiendaFisica } = await import("../pos");
    await activarTiendaFisica(tenantId);
    prodA = await crearProducto("Camiseta POS", 50000, null);
    prodB = await crearProducto("Gorra POS", 30000, 10);
  });

  afterAll(async () => {
    if (!dbMod) return;
    try {
      await dbMod.db.delete(dbMod.posDevoluciones);
      await dbMod.db.delete(dbMod.cajaSesiones);
      await dbMod.db.delete(dbMod.inventoryMovements);
      await dbMod.db.delete(dbMod.payments);
      await dbMod.db.delete(dbMod.products);
      await dbMod.db.delete(dbMod.tenants);
    } catch { /* noop */ }
  });

  it("sin control de inventario no hay venta", async () => {
    const { venderEnTienda } = await import("../pos");
    await expect(venderEnTienda(tenantId, { items: [{ productId: prodA, cantidad: 1 }], metodoPago: "efectivo" }))
      .rejects.toThrow(/control de inventario/);
  });

  it("la entrada suma y audita", async () => {
    const { registrarEntrada, inventarioDelNegocio } = await import("../pos");
    expect((await registrarEntrada(tenantId, prodA, 20, "Inventario inicial")).stock).toBe(20);
    const inv = await inventarioDelNegocio(tenantId);
    expect(inv.totalUnidades).toBe(30);
    expect(inv.valorizado).toBe(20 * 50000 + 10 * 30000);
    expect(inv.sinControl).toBe(0);
  });

  it("la venta descuenta, crea pago confirmado y deja recibo sin facturación", async () => {
    const { venderEnTienda } = await import("../pos");
    const r = await venderEnTienda(tenantId, {
      items: [
        { productId: prodA, cantidad: 2 },
        { productId: prodB, cantidad: 1, descuentoPct: 10 },
      ],
      metodoPago: "efectivo",
      cliente: { nombre: "Cliente Mostrador" },
    });
    expect(r.total).toBe(2 * 50000 + 30000 * 0.9);
    expect(r.factura).toBeNull();
    expect(r.facturaError).toMatch(/facturación/i);
    const [pa] = await dbMod.db.select().from(dbMod.products).where(eq(dbMod.products.id, prodA));
    const [pb] = await dbMod.db.select().from(dbMod.products).where(eq(dbMod.products.id, prodB));
    expect((pa as any).stock).toBe(18);
    expect((pb as any).stock).toBe(9);
  });

  it("sin stock suficiente no vende", async () => {
    const { venderEnTienda } = await import("../pos");
    await expect(venderEnTienda(tenantId, { items: [{ productId: prodB, cantidad: 99 }], metodoPago: "efectivo" }))
      .rejects.toThrow(/Sin stock suficiente/);
  });

  it("caja: apertura, venta en turno y cierre con arqueo", async () => {
    const { abrirCaja, cajaAbierta, venderEnTienda, cerrarCaja } = await import("../pos");
    const caja = await abrirCaja(tenantId, 100000, "cajero-1") as any;
    expect(caja.estado).toBe("abierta");
    expect(await cajaAbierta(tenantId)).not.toBeNull();
    await expect(abrirCaja(tenantId, 0)).rejects.toThrow(/Ya hay una caja abierta/);
    await venderEnTienda(tenantId, { items: [{ productId: prodA, cantidad: 1 }], metodoPago: "efectivo", cajaId: caja.id });
    await venderEnTienda(tenantId, { items: [{ productId: prodB, cantidad: 1 }], metodoPago: "tarjeta", cajaId: caja.id });
    const cerrada = await cerrarCaja(tenantId, 100000 + 50000, "cajero-1") as any;
    expect(cerrada.ventasEfectivo).toBe(50000);
    expect(cerrada.ventasOtros).toBe(30000);
    expect(cerrada.esperado).toBe(150000);
    expect(cerrada.diferencia).toBe(0);
    expect(await cajaAbierta(tenantId)).toBeNull();
  });

  it("la devolución reintegra y no devuelve más de lo vendido", async () => {
    const { venderEnTienda, devolverVenta } = await import("../pos");
    const v = await venderEnTienda(tenantId, { items: [{ productId: prodB, cantidad: 2 }], metodoPago: "efectivo" });
    const d = await devolverVenta(tenantId, v.pagoId, [{ productId: prodB, cantidad: 1 }], "Talla");
    expect(d.total).toBe(30000);
    await expect(devolverVenta(tenantId, v.pagoId, [{ productId: prodB, cantidad: 2 }], "Otra"))
      .rejects.toThrow(/solo quedan 1 por devolver/);
    const [pb] = await dbMod.db.select().from(dbMod.products).where(eq(dbMod.products.id, prodB));
    expect((pb as any).stock).toBe(9 - 1 - 2 + 1 + 0); // 10 −1 −1 −2 +1 = 7
  });

  it("reporte y exportación salen en formato estándar", async () => {
    const { reporteVentas, exportarVentas } = await import("../pos");
    const r = await reporteVentas(tenantId, {});
    expect(r.ventas).toBeGreaterThanOrEqual(4);
    expect(r.porMetodo.efectivo).toBeGreaterThan(0);
    expect(r.porProducto[0].cantidad).toBeGreaterThan(0);
    expect(r.devoluciones).toBe(1);
    const csv = await exportarVentas(tenantId, { formato: "csv" });
    expect(csv.formato).toBe("csv");
    expect(csv.contenido.split("\n")[0]).toBe("fecha;venta;items;subtotal;descuento;impuesto;total;metodo;cliente;documento;factura;sistema");
    expect(csv.contenido).toMatch(/Camiseta POS/);
  });
});
