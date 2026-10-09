/**
 * Facturación por negocio (09-10-2026): cada negocio conecta su sistema y la
 * factura sale al confirmarse el pago. Acá se prueba lo que se le manda a cada
 * sistema, con un Alegra y un receptor falsos.
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import * as alegra from "../facturacion/alegra";
import * as webhook from "../facturacion/webhook";
import { lineaDeFactura, facturaGuardada } from "../facturacion";
import type { ConfigAlegra, VentaAFacturar } from "../facturacion/tipos";

const venta: VentaAFacturar = {
  pagoId: 47, tenantId: 1, fecha: "2026-10-09", moneda: "COP", total: 89900,
  metodoPago: "nequi",
  cliente: { nombre: "Elkin", documento: null, correo: null, telefono: "573001112233" },
  items: [{ productId: 155, nombre: "Corrector de postura", precio: 89900, cantidad: 1, digital: false }],
};

const cfg: ConfigAlegra = { correo: "negocio@x.co", token: "tok", contactoPorDefecto: "1", electronica: true };

function alegraFalso(itemsExistentes: any[] = []) {
  const llamadas: Array<{ url: string; method: string; body: any; auth: string }> = [];
  const pedir = async (url: string, init: RequestInit) => {
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : null;
    llamadas.push({ url, method, body, auth: String((init.headers as any)?.Authorization || "") });
    let r: any = {};
    if (url.includes("/items?")) r = itemsExistentes;
    else if (url.endsWith("/items") && method === "POST") r = { id: "900" };
    else if (url.endsWith("/invoices")) r = { id: "5001", numberTemplate: { prefix: "FE", number: "123" } };
    else if (url.includes("/contacts/")) r = { id: "1", name: "Consumidor final" };
    return new Response(JSON.stringify(r), { status: 200 });
  };
  return { llamadas, pedir };
}

describe("Alegra", () => {
  it("crea el ítem si no existe y factura con lo que se cobró, como electrónica", async () => {
    const { llamadas, pedir } = alegraFalso();
    const f = await alegra.emitir(cfg, venta, pedir);

    const item = llamadas.find((l) => l.url.endsWith("/items") && l.method === "POST")!;
    expect(item.body).toMatchObject({ name: "Corrector de postura", price: 89900, reference: "vp-155", type: "product" });

    const factura = llamadas.find((l) => l.url.endsWith("/invoices"))!;
    expect(factura.body).toMatchObject({
      date: "2026-10-09", dueDate: "2026-10-09", client: { id: "1" },
      items: [{ id: "900", price: 89900, quantity: 1 }],
      paymentForm: "CASH", paymentMethod: "TRANSFER", stamp: { generateStamp: true },
    });
    expect(factura.auth).toBe(`Basic ${Buffer.from("negocio@x.co:tok").toString("base64")}`);
    expect(f).toMatchObject({ proveedor: "alegra", idExterno: "5001", numero: "FE123", electronica: true });
  });

  it("reusa el ítem SOLO si la referencia es exacta (vp-155 no es vp-1550)", async () => {
    const { llamadas, pedir } = alegraFalso([{ id: "7", reference: "vp-1550" }, { id: "8", reference: "vp-155" }]);
    await alegra.emitir(cfg, venta, pedir);
    expect(llamadas.some((l) => l.url.endsWith("/items") && l.method === "POST")).toBe(false);
    expect(llamadas.find((l) => l.url.endsWith("/invoices"))!.body.items[0].id).toBe("8");
  });

  it("sin factura electrónica no pide el timbrado a la DIAN", async () => {
    const { llamadas, pedir } = alegraFalso();
    await alegra.emitir({ ...cfg, electronica: false }, venta, pedir);
    expect(llamadas.find((l) => l.url.endsWith("/invoices"))!.body.stamp).toBeUndefined();
  });

  it("el error de Alegra le llega al admin tal cual", async () => {
    const pedir = async () => new Response(JSON.stringify({ message: "La resolución está vencida" }), { status: 400 });
    await expect(alegra.emitir(cfg, venta, pedir as any)).rejects.toThrow(/La resolución está vencida/);
  });

  it("sin contacto por defecto no se intenta (no inventamos datos tributarios del cliente)", async () => {
    await expect(alegra.emitir({ ...cfg, contactoPorDefecto: "" }, venta)).rejects.toThrow(/Consumidor final/);
  });
});

describe("Webhook genérico", () => {
  it("manda la venta firmada y usa el número que devuelve el sistema", async () => {
    let recibido: any = null;
    const pedir = async (_url: string, init: RequestInit) => {
      recibido = init;
      return new Response(JSON.stringify({ numero: "FV-77", id: 9 }), { status: 200 });
    };
    const f = await webhook.emitir({ url: "https://erp.negocio.co/ventas", secreto: "s3cr3t" }, venta, pedir as any);
    const cuerpo = String(recibido.body);
    expect(JSON.parse(cuerpo)).toMatchObject({ evento: "venta.pagada", datos: { pagoId: 47, total: 89900 } });
    expect(recibido.headers["x-ventaspro-firma"]).toBe(`sha256=${createHmac("sha256", "s3cr3t").update(cuerpo).digest("hex")}`);
    expect(f).toMatchObject({ proveedor: "webhook", numero: "FV-77", idExterno: "9" });
  });

  it("no acepta URLs sin https", () => {
    expect(webhook.validarConfig({ url: "http://x.co", secreto: "a" })).toMatch(/https/);
  });
});

describe("lo que ve el cliente", () => {
  it("dice factura electrónica con su número y el negocio", () => {
    const l = lineaDeFactura({ proveedor: "alegra", idExterno: "1", numero: "FE123", electronica: true, emitidaEn: "" }, "Tienda Momo");
    expect(l).toContain("Factura electrónica N° FE123");
    expect(l).toContain("Tienda Momo");
  });

  it("un pago ya facturado se reconoce por su metadata (no se factura dos veces)", () => {
    expect(facturaGuardada(JSON.stringify({ factura: { proveedor: "alegra", numero: "FE1" } }))?.numero).toBe("FE1");
    expect(facturaGuardada(null)).toBeNull();
  });
});
