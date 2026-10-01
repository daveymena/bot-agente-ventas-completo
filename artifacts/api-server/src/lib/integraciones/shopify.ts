/**
 * Shopify — app personalizada (token `shpat_…`), Admin REST 2025-07.
 *
 * El dueño crea la app en el admin de su tienda (Aplicaciones → Desarrollo de
 * apps) y pega acá el dominio `*.myshopify.com` + el token. OAuth de Partner
 * queda para después; la app personalizada ya permite importar, publicar,
 * leer pedidos y registrar webhooks.
 */
import crypto from "node:crypto";
import { logger } from "../logger";
import type { PedidoExterno, ProductoExterno } from "./tipos";

export interface CredShopify { tienda: string; token: string; secreto?: string; moneda?: string }

function base(cred: CredShopify): string {
  const tienda = String(cred.tienda || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!tienda) throw new Error("Falta el dominio de la tienda (*.myshopify.com).");
  return `https://${tienda}/admin/api/2025-07`;
}

async function shopifyGET(cred: CredShopify, path: string): Promise<any> {
  const r = await fetch(`${base(cred)}${path}`, {
    headers: { "X-Shopify-Access-Token": cred.token, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Shopify ${r.status}: ${JSON.stringify(data?.errors || data).slice(0, 200)}`);
  return { data, link: r.headers.get("link") };
}

async function shopifyPOST(cred: CredShopify, path: string, body: unknown): Promise<any> {
  const r = await fetch(`${base(cred)}${path}`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": cred.token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Shopify ${r.status}: ${JSON.stringify(data?.errors || data).slice(0, 200)}`);
  return data;
}

/** Lee la tienda (para probar la conexión y saber la moneda). */
export async function probarConexion(cred: CredShopify): Promise<{ nombre: string; moneda: string; dominio: string }> {
  const { data } = await shopifyGET(cred, "/shop.json");
  return { nombre: data?.shop?.name || "tienda", moneda: data?.shop?.currency || "COP", dominio: data?.shop?.myshopify_domain || cred.tienda };
}

function mapearProducto(p: any): ProductoExterno {
  const variantes: any[] = p.variants || [];
  const primera = variantes[0] || {};
  const imagenes: string[] = (p.images || []).map((i: any) => i.src).filter(Boolean);
  return {
    idExterno: String(p.id),
    nombre: p.title || `Producto ${p.id}`,
    descripcion: p.body_html || null,
    precio: Number(primera.price) || 0,
    imagenes,
    stock: variantes.reduce((n: number, v: any) => n + (Number(v.inventory_quantity) || 0), 0) || null,
    activo: p.status === "active",
    variantes: variantes.map((v: any) => v.title).filter((t: string) => t && t !== "Default Title"),
    urlOrigen: p.handle ? undefined : undefined,
    digital: variantes.length > 0 && variantes.every((v: any) => v.requires_shipping === false),
    extra: {
      handle: p.handle || null,
      vendor: p.vendor || null,
      tipo: p.product_type || null,
      etiquetas: p.tags || null,
      varianteId: primera.id || null,
      skuVariante: primera.sku || null,
    },
  };
}

/** Todos los productos (paginado por page_info, tope de seguridad 10 páginas). */
export async function listarProductos(cred: CredShopify, limite = 250): Promise<ProductoExterno[]> {
  const todos: ProductoExterno[] = [];
  let pageInfo = "";
  for (let pagina = 0; pagina < 10; pagina++) {
    const q = pageInfo ? `?limit=250&page_info=${encodeURIComponent(pageInfo)}` : `?limit=${Math.min(limite, 250)}`;
    const { data, link } = await shopifyGET(cred, `/products.json${q}`);
    for (const p of data?.products || []) todos.push(mapearProducto(p));
    const siguiente = String(link || "").match(/<([^>]+)>;\s*rel="next"/);
    if (!siguiente) break;
    pageInfo = new URL(siguiente[1]).searchParams.get("page_info") || "";
    if (!pageInfo || todos.length >= limite) break;
  }
  return todos.slice(0, limite);
}

/** Un producto con sus variantes (para publicar/verificar). */
export async function leerProducto(cred: CredShopify, id: string | number): Promise<ProductoExterno> {
  const { data } = await shopifyGET(cred, `/products/${id}.json`);
  if (!data?.product) throw new Error(`Producto ${id} no existe en Shopify.`);
  return mapearProducto(data.product);
}

/** Publica un producto interno en Shopify (siempre como borrador activo). */
export async function publicarProducto(cred: CredShopify, p: { nombre: string; descripcion: string; precio: number; imagenes: string[]; variantes?: string[] }): Promise<{ id: string }> {
  const data = await shopifyPOST(cred, "/products.json", {
    product: {
      title: p.nombre.slice(0, 200),
      body_html: p.descripcion || "",
      status: "active",
      images: (p.imagenes || []).slice(0, 10).map((src) => ({ src })),
      variants: [{ price: String(p.precio || 0), inventory_management: null as unknown as string }],
    },
  });
  if (!data?.product?.id) throw new Error("Shopify no devolvió el producto creado.");
  logger.info({ shopifyId: data.product.id }, "[Integraciones] producto publicado en Shopify");
  return { id: String(data.product.id) };
}

function mapearPedido(o: any): PedidoExterno {
  const dir: any = o.shipping_address || o.billing_address || {};
  const cliente: any = o.customer || {};
  const nombre = [dir.first_name, dir.last_name].filter(Boolean).join(" ") || [cliente.first_name, cliente.last_name].filter(Boolean).join(" ") || null;
  return {
    idExterno: String(o.id),
    nombre,
    telefono: dir.phone || o.phone || cliente.phone || null,
    departamento: dir.province || null,
    ciudad: dir.city || null,
    direccion: [dir.address1, dir.address2].filter(Boolean).join(" ") || null,
    barrio: null,
    notas: `Pedido Shopify ${o.name || `#${o.id}`} · ${o.financial_status || "pendiente"}`,
    items: (o.line_items || []).map((l: any) => ({
      idExterno: String(l.product_id || l.variant_id || l.id),
      sku: l.sku || null,
      nombre: l.title || `Item ${l.id}`,
      cantidad: Number(l.quantity) || 1,
      precio: Number(l.price) || 0,
    })),
    pagado: ["paid", "partially_paid"].includes(String(o.financial_status || "")),
    metodoPago: o.gateway || o.payment_gateway_names?.[0] || "shopify",
  };
}

/** Pedidos recientes (los pagados primero, para no dejar plata sin conciliar). */
export async function listarPedidos(cred: CredShopify, limite = 50): Promise<PedidoExterno[]> {
  const { data } = await shopifyGET(cred, `/orders.json?status=any&limit=${Math.min(limite, 250)}&order=created_at+desc`);
  return (data?.orders || []).map(mapearPedido);
}

/** Registra el webhook orders/create apuntando a nuestro endpoint público. */
export async function registrarWebhookPedidos(cred: CredShopify, urlPublica: string): Promise<{ id: string }> {
  const data = await shopifyPOST(cred, "/webhooks.json", {
    webhook: { topic: "orders/create", address: urlPublica, format: "json" },
  });
  if (!data?.webhook?.id) throw new Error("Shopify no registró el webhook.");
  return { id: String(data.webhook.id) };
}

/**
 * Verifica la firma del webhook: `x-shopify-hmac-sha256` = base64(HMAC-SHA256
 * del cuerpo CRUDO con el secreto). El cuerpo crudo sale de `req.rawBody`
 * (app.ts lo guarda en express.json verify) — con el body ya parseado la
 * firma NUNCA coincide.
 */
export function firmaShopifyValida(rawBody: Buffer, secreto: string, firmaRecibida: string): boolean {
  try {
    if (!rawBody || !secreto || !firmaRecibida) return false;
    const esperada = crypto.createHmac("sha256", secreto).update(rawBody).digest("base64");
    const a = Buffer.from(esperada);
    const b = Buffer.from(String(firmaRecibida));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Pedido del webhook → PedidoExterno (misma forma que listarPedidos). */
export function pedidoDelWebhook(o: any): PedidoExterno {
  return mapearPedido(o);
}
