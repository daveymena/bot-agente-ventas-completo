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
    // Hex en MINÚSCULA (así lo compara el Seller Center; antes se exigía mayúscula).
    expect(firmarSeller(p, "k")).toMatch(/^[0-9a-f]{64}$/);
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

// ── Arreglos del 01-10-2026 (revisión contra la documentación de cada API) ──
import { vi, afterEach } from "vitest";

describe("AliExpress IOP: firma y hora como las pide api-sg", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("manda sign_method=sha256 y timestamp en milisegundos, y la firma valida", async () => {
    let cuerpo = "";
    vi.stubGlobal("fetch", vi.fn(async (_u: string, o: any) => { cuerpo = String(o.body); return new Response(JSON.stringify({ aliexpress_affiliate_product_query_response: { resp_result: { result: { products: { product: [] } } } } }), { status: 200 }); }));
    const { buscarProductos, firmarTop } = await import("../aliexpress");
    await buscarProductos({ appKey: "k", appSecret: "s" }, "mochila");
    const q = Object.fromEntries(new URLSearchParams(cuerpo));
    expect(q.sign_method).toBe("sha256");
    expect(Math.abs(Number(q.timestamp) - Date.now())).toBeLessThan(60_000);
    const { sign, ...resto } = q;
    expect(sign).toBe(firmarTop(resto, "s"));
  });
  it("un error en la raíz ({code, message}) se informa, no se ve como 0 productos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "IncompleteSignature", message: "firma" }), { status: 200 })));
    const { buscarProductos } = await import("../aliexpress");
    await expect(buscarProductos({ appKey: "k", appSecret: "s" }, "x")).rejects.toThrow(/IncompleteSignature/);
  });
});

// 08-10-2026: el precio salía en USD rotulado como COP, los productos entraban
// ACTIVOS al costo del proveedor, y una moneda no soportada tumbaba todo.
describe("AliExpress: precio, borrador y moneda", () => {
  afterEach(() => vi.unstubAllGlobals());
  const producto = {
    product_id: 1005001, product_title: "Corrector de postura",
    sale_price: "4.99", sale_price_currency: "USD",
    target_sale_price: "19900", target_sale_price_currency: "COP",
    product_main_image_url: "https://ae01.alicdn.com/a.jpg",
  };
  const respuesta = (ps: any[]) => new Response(JSON.stringify({ aliexpress_affiliate_product_query_response: { resp_result: { result: { products: { product: ps } } } } }), { status: 200 });

  it("usa el precio en la moneda pedida y entra como BORRADOR con el costo anotado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta([producto])));
    const { buscarProductos } = await import("../aliexpress");
    const [p] = await buscarProductos({ appKey: "k", appSecret: "s" }, "corrector");
    expect(p.precio).toBe(19900);
    expect(p.moneda).toBe("COP");
    expect(p.activo).toBe(false);
    expect(p.extra).toMatchObject({ costoProveedor: 19900, requierePrecioDeVenta: true });
  });

  it("sin precio convertido, rotula el precio con SU moneda (USD), no con COP", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta([{ ...producto, target_sale_price: undefined, target_sale_price_currency: undefined }])));
    const { buscarProductos } = await import("../aliexpress");
    const [p] = await buscarProductos({ appKey: "k", appSecret: "s" }, "corrector");
    expect(p.precio).toBe(4.99);
    expect(p.moneda).toBe("USD");
  });

  it("si Ali no acepta la moneda, reintenta en USD en vez de fallar", async () => {
    const pedidas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, o: any) => {
      const moneda = new URLSearchParams(String(o.body)).get("target_currency") || "";
      pedidas.push(moneda);
      return moneda === "COP"
        ? new Response(JSON.stringify({ code: "InvalidParameter", message: "target_currency not supported" }), { status: 200 })
        : respuesta([{ ...producto, target_sale_price: "4.99", target_sale_price_currency: "USD" }]);
    }));
    const { probarConexion } = await import("../aliexpress");
    const r = await probarConexion({ appKey: "k", appSecret: "s" }, "COP");
    expect(pedidas).toEqual(["COP", "USD"]);
    expect(r).toMatchObject({ ejemplo: "Corrector de postura", moneda: "USD", precio: 4.99 });
  });
});

describe("Falabella Seller Center: firma clave=valor&… en hex minúscula", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("firmarSeller = HMAC-SHA256 de los parámetros ordenados y codificados", async () => {
    const { firmarSeller } = await import("../falabella");
    const esperado = crypto.createHmac("sha256", "clave").update("Action=GetOrders&Timestamp=2026-10-01T10%3A00%3A00.000Z&UserID=a%40b.co", "utf8").digest("hex");
    expect(firmarSeller({ UserID: "a@b.co", Action: "GetOrders", Timestamp: "2026-10-01T10:00:00.000Z" }, "clave")).toBe(esperado);
  });
  it("llama al endpoint de Falabella con la misma codificación que firmó", async () => {
    let url = "";
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { url = u; return new Response(JSON.stringify({ SuccessResponse: { Body: { Orders: {} } } }), { status: 200 }); }));
    const { listarOrdenes } = await import("../falabella");
    await listarOrdenes({ sellerId: "a@b.co", apiKey: "clave" }, 5);
    expect(url).toMatch(/^https:\/\/sellercenter-api\.falabella\.com\/\?Action=GetOrders&/);
    expect(url).toMatch(/&Signature=[0-9a-f]{64}$/);
  });
});

describe("Mercado Libre: la dirección sale del envío", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("listarOrdenes completa ciudad y dirección con /shipments/{id}", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      if (u.includes("/orders/search")) return new Response(JSON.stringify({ results: [{ id: 9, status: "paid", buyer: { first_name: "Ana" }, shipping: { id: 77 }, order_items: [] }] }), { status: 200 });
      if (u.includes("/shipments/77")) return new Response(JSON.stringify({ destination: { receiver_name: "Ana Pérez", receiver_phone: "3001112233", shipping_address: { address_line: "Calle 1 # 2-3", city: { name: "Cali" }, state: { name: "Valle del Cauca" }, neighborhood: { name: "Centro" } } } }), { status: 200 });
      return new Response("{}", { status: 404 });
    }));
    const { listarOrdenes } = await import("../mercadolibre");
    const [o] = await listarOrdenes("tok", "123", 5);
    expect(o).toMatchObject({ ciudad: "Cali", departamento: "Valle del Cauca", direccion: "Calle 1 # 2-3", barrio: "Centro", pagado: true });
  });
});
