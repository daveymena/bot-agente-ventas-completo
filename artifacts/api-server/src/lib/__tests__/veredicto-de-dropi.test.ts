import { describe, it, expect } from "vitest";
import { leerRastroDropi } from "../woocommerce-estado";
import { PRODUCTO_YA_NO_SE_VENDE } from "../dropshipping";

/**
 * Lo que pasó el 15-09-2026 y se descubrió el 18-09:
 *
 * El bot tomó el pedido #6 ("Bolso by lola 1.1", Cali), lo creó en
 * WooCommerce como #323 y lo dio por "registrado". Dropify sí corrió y sí lo
 * mandó a Dropi — y Dropi lo rechazó porque el proveedor había archivado el
 * producto. Nadie se enteró en tres días: ni el admin, ni el cliente que dio
 * nombre, cédula y dirección, ni el bot, que siguió ofreciendo ese bolso.
 *
 * El veredicto estaba escrito todo el tiempo en la meta de la orden de Woo.
 * Estas pruebas fijan cómo se lee, con los valores reales que dejó el plugin.
 */

const ordenWoo = (meta: Array<{ key: string; value: any }>, status = "processing") => ({ id: 323, status, meta_data: meta });

describe("leer lo que Dropify escribió en la orden de Woo", () => {
  it("el rechazo real del #323 se reconoce como error, con el motivo tal cual", () => {
    const r = leerRastroDropi(ordenWoo([
      { key: "_is_dropi_order", value: "Dropi sync error: El producto actualmente lo clasifica el proveedor como archivado, por lo tanto no se puede procesar la orden." },
    ]));
    expect(r.estado).toBe("error");
    expect(r.detalle).toContain("archivado");
    expect(r.dropiOrderId).toBeNull();
  });

  it("'Yes' + _dropi_order_id es una orden que el proveedor ya tiene", () => {
    const r = leerRastroDropi(ordenWoo([
      { key: "_is_dropi_order", value: "Yes" },
      { key: "_dropi_order_id", value: 987654 },
    ]));
    expect(r.estado).toBe("sincronizada");
    expect(r.dropiOrderId).toBe("987654");
  });

  it("sin productos de Dropify en la orden, lo dice", () => {
    const r = leerRastroDropi(ordenWoo([{ key: "_is_dropi_order", value: "This order do not have dropi products" }]));
    expect(r.estado).toBe("sin_productos_dropi");
  });

  it("sin meta y en processing: el gancho no corrió (auto-sync apagado)", () => {
    const r = leerRastroDropi(ordenWoo([]));
    expect(r.estado).toBe("sin_rastro");
    expect(r.detalle).toMatch(/sincronizar órdenes automáticamente/);
  });

  it("sin meta pero en otro estado: Dropify solo actúa al pasar a processing", () => {
    const r = leerRastroDropi(ordenWoo([], "on-hold"));
    expect(r.estado).toBe("sin_rastro");
    expect(r.detalle).toContain("on-hold");
  });
});

describe("qué rechazos sacan el producto del catálogo", () => {
  it("archivado por el proveedor (el caso real) sí", () => {
    expect(PRODUCTO_YA_NO_SE_VENDE.test("El producto actualmente lo clasifica el proveedor como archivado, por lo tanto no se puede procesar la orden.")).toBe(true);
  });
  it("un rechazo por datos del cliente no toca el producto", () => {
    expect(PRODUCTO_YA_NO_SE_VENDE.test("La ciudad no existe en la cobertura de la transportadora")).toBe(false);
    expect(PRODUCTO_YA_NO_SE_VENDE.test("Access denied")).toBe(false);
  });
});
