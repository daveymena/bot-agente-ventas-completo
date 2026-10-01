import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { firmarTop } from "../aliexpress";
import { firmarSeller } from "../falabella";
import { firmaShopifyValida } from "../shopify";
import { idOrdenDeNotificacion } from "../mercadolibre";
import { skuDe } from "../tipos";
import { limpiarHtml } from "../importador";

/**
 * Integraciones (01-10-2026): firmas y SKU estables. Todo lo que toca red o
 * base queda fuera: acá se amarra lo que, si cambia, rompe webhooks (firma
 * que no coincide = pedidos que no entran) o duplica el catálogo (SKU que
 * cambia = el upsert crea en vez de actualizar).
 */
describe("firmas", () => {
  it("Top (AliExpress): ordena clave+valor y firma en mayúsculas", () => {
    const f1 = firmarTop({ b: "2", a: "1" }, "secreto");
    const f2 = firmarTop({ a: "1", b: "2" }, "secreto");
    expect(f1).toBe(f2);
    expect(f1).toMatch(/^[0-9A-F]{64}$/);
    expect(firmarTop({ a: "1", b: "2" }, "otro")).not.toBe(f1);
  });

  it("Seller (Falabella): determinista y sensible al secreto", () => {
    const p = { Action: "GetOrders", UserID: "7" };
    expect(firmarSeller(p, "k")).toBe(firmarSeller(p, "k"));
    expect(firmarSeller(p, "k")).toMatch(/^[0-9A-F]{64}$/);
    expect(firmarSeller(p, "otra")).not.toBe(firmarSeller(p, "k"));
  });

  it("Shopify: base64(HMAC-SHA256(cuerpo crudo)) con timingSafeEqual", () => {
    const secreto = "shpss_secreto";
    const cuerpo = Buffer.from(JSON.stringify({ id: 123 }), "utf8");
    const buena = crypto.createHmac("sha256", secreto).update(cuerpo).digest("base64");
    expect(firmaShopifyValida(cuerpo, secreto, buena)).toBe(true);
    expect(firmaShopifyValida(cuerpo, secreto, buena + "x")).toBe(false);
    expect(firmaShopifyValida(cuerpo, "otro", buena)).toBe(false);
    expect(firmaShopifyValida(cuerpo, secreto, "")).toBe(false);
    // Con el body ya parseado y re-serializado la firma NO coincide: por eso
    // el webhook usa req.rawBody (documentado en shopify.ts).
    const reSerializado = Buffer.from(JSON.stringify(JSON.parse(cuerpo.toString()), null, 2), "utf8");
    expect(firmaShopifyValida(reSerializado, secreto, buena)).toBe(false);
  });
});

describe("SKU estables (el upsert depende de esto)", () => {
  it("prefijos por plataforma", () => {
    expect(skuDe("shopify", 123)).toBe("shopify-123");
    expect(skuDe("aliexpress", 456)).toBe("ali-456");
    expect(skuDe("mercadolibre", "MCO123")).toBe("meli-MCO123");
    expect(skuDe("falabella", 7)).toBe("fala-7");
  });
});

describe("limpieza de descripciones", () => {
  it("saca HTML y entidades sin romper el texto", () => {
    expect(limpiarHtml("<p>Hola <b>mundo</b></p>")).toBe("Hola mundo");
    expect(limpiarHtml("A&nbsp;&amp;&nbsp;B")).toBe("A & B");
    expect(limpiarHtml("<script>x()</script>real")).toBe("real");
    expect(limpiarHtml(null)).toBe("");
  });
});

describe("notificación de Mercado Libre", () => {
  it("saca el id de orden del resource", () => {
    expect(idOrdenDeNotificacion({ topic: "orders_v2", resource: "/orders/123456" })).toBe("123456");
    expect(idOrdenDeNotificacion({ topic: "orders_v2" })).toBeNull();
    expect(idOrdenDeNotificacion({ topic: "ping" })).toBeNull();
  });
});
