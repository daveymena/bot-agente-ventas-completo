import { describe, it, expect } from "vitest";
import { ipsAutorizadasDelToken, resumenProductoDropi, explicarRechazo } from "../dropi-directo";

/**
 * Fallos medidos el 29-09-2026 en producción (servidor nuevo 161.97.182.95):
 *  1. Al pegar un token "Chatbot Agents" el panel decía "solo acepta las IP
 *     [object Object]": en ese tipo `ip_url` viene como objeto.
 *  2. El radar y dropi_buscar leían `p.stock` / `p.user_id`, que el listado
 *     de Dropi no trae: "stock desconocido" en todos los candidatos.
 */

const jwt = (payload: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.firma`;

describe("IP autorizadas del token de Dropi", () => {
  it("lee la IP aunque ip_url venga como objeto (Chatbot Agents)", () => {
    expect(ipsAutorizadasDelToken({ ip_url: { ip: "144.91.112.79" } })).toEqual(["144.91.112.79"]);
    expect(ipsAutorizadasDelToken({ ip_url: [{ value: "1.2.3.4" }, { value: "5.6.7.8" }] })).toEqual(["1.2.3.4", "5.6.7.8"]);
  });

  it("sigue leyendo el formato texto (WooCommerce) y el vacío", () => {
    expect(ipsAutorizadasDelToken({ ip_url: "9.9.9.9" })).toEqual(["9.9.9.9"]);
    expect(ipsAutorizadasDelToken({ ip_url: "" })).toEqual([]);
    expect(ipsAutorizadasDelToken({})).toEqual([]);
  });

  it("el rechazo nombra las IP reales y pide un token NUEVO, nunca [object Object]", async () => {
    const t = jwt({ ip_url: { ip: "144.91.112.79" }, exp: 4102444800 });
    const msg = await explicarRechazo(t, "Access denied", "161.97.182.95");
    expect(msg).not.toContain("[object Object]");
    expect(msg).toContain("144.91.112.79");
    expect(msg).toContain("161.97.182.95");
    expect(msg).toMatch(/token NUEVO/);
    // Ya es Chatbot: no se le sugiere crear un Chatbot.
    expect(msg).not.toMatch(/probá crear la integración de tipo "Chatbot Agents"/);
  });
});

describe("resumen de producto del listado de Dropi", () => {
  // Forma real medida (producto 2283742, 29-09-2026): sin `stock` ni `user_id` arriba.
  const crudo: any = {
    id: 2283742,
    name: "Faja de Embarazo GT",
    sale_price: "24000.00",
    suggested_price: "29000.00",
    user: { id: 365543, store_name: "Variedades L&G" },
    gallery: [{ url: null, main: true, urlS3: "colombia/products/2283742/img_0.webp" }],
    categories: [{ name: "Hogar" }],
    warehouse_product: [{ stock: 100, warehouse: { city: { name: "BOGOTA" } } }],
  };

  it("suma el stock por bodega y toma el proveedor de `user`", () => {
    const r = resumenProductoDropi(crudo);
    expect(r.stock).toBe(100);
    expect(r.proveedor).toBe("Variedades L&G");
    expect(r.bodega).toBe("BOGOTA");
    expect(r.costo).toBe(24000);
    expect(r.precioSugerido).toBe(29000);
    expect(r.margenPct).toBe(17);
    expect(r.foto).toMatch(/^https:\/\/.+2283742\/img_0\.webp$/);
  });
});
