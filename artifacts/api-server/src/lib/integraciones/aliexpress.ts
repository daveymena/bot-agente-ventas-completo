/**
 * AliExpress — API oficial de afiliados (Portals/Open Platform).
 *
 * El dueño crea la app y pega acá app_key + app_secret (+ tracking_id de
 * afiliado si quiere comisionar). Dos usos:
 *  1. Fuente PRIMARIA de activos del fabricante (fotos + video real) para
 *     `activos-fabricante.ts`, en vez del scraping con puppeteer (que puede
 *     toparse con captcha desde el VPS).
 *  2. Importar productos a `products` (con sus fotos y video ya resueltos).
 *
 * Pedidos AL proveedor (aliexpress.ds.order.create) requieren OAuth del
 * comprador + aprobación de AliExpress: NO implementado, queda documentado
 * en el resumen de la herramienta para no vender humo.
 *
 * Firma estilo Top (HMAC-SHA256, hex mayúsculas) sobre clave+valor
 * concatenados en orden alfabético. Implementada desde la documentación;
 * si Ali rechaza la firma, el error de la API lo dice y se ajusta con las
 * claves reales (hoy no hay app creada para probar).
 */
import crypto from "node:crypto";
import { logger } from "../logger";
import type { ProductoExterno } from "./tipos";

export interface CredAli { appKey: string; appSecret: string; trackingId?: string }

const GATEWAY = "https://api-sg.aliexpress.com/sync";

function fechaTop(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Firma Top: HMAC-SHA256(app_secret, concat(k+v ordenados)) en hex MAYÚSCULAS. Pura (testeable). */
export function firmarTop(params: Record<string, string>, appSecret: string): string {
  const base = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", appSecret).update(base, "utf8").digest("hex").toUpperCase();
}

async function llamarApi(cred: CredAli, metodo: string, especificos: Record<string, string>): Promise<any> {
  const params: Record<string, string> = {
    method: metodo,
    app_key: cred.appKey,
    timestamp: fechaTop(),
    format: "json",
    v: "2.0",
    sign_method: "hmac",
    ...especificos,
  };
  params.sign = firmarTop(params, cred.appSecret);
  const cuerpo = new URLSearchParams(params).toString();
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: cuerpo,
    signal: AbortSignal.timeout(30_000),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`AliExpress ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const err = data?.error_response || data?.error_response?.msg;
  if (err) throw new Error(`AliExpress: ${err.msg || err.sub_msg || JSON.stringify(err).slice(0, 200)} (código ${err.code || "?"})`);
  return data;
}

function listaProductosRespuesta(data: any): any[] {
  const r = data?.aliexpress_affiliate_product_query_response?.resp_result?.result
    || data?.resp_result?.result;
  const ps = r?.products?.product;
  if (!ps) return [];
  return Array.isArray(ps) ? ps : [ps];
}

function aProductoExterno(p: any, moneda = "COP"): ProductoExterno {
  const fotos: string[] = [];
  const chicas = p.product_small_image_urls?.string;
  if (Array.isArray(chicas)) fotos.push(...chicas.filter(Boolean));
  else if (typeof chicas === "string" && chicas) fotos.push(chicas);
  if (p.product_main_image_url) fotos.unshift(p.product_main_image_url);
  const precio = Number(String(p.sale_price || p.target_sale_price || "0").replace(/[^0-9.]/g, "")) || 0;
  return {
    idExterno: String(p.product_id || p.productId),
    nombre: String(p.product_title || p.productTitle || `Producto ${p.product_id || ""}`).slice(0, 200),
    descripcion: null,
    precio,
    moneda,
    categoriaSugerida: p.second_level_category_name || p.first_level_category_name || null,
    imagenes: [...new Set(fotos)].slice(0, 20),
    videoUrl: p.product_video_url || null,
    stock: null,
    activo: true,
    urlOrigen: p.product_detail_url || p.promotion_link || null,
    digital: false,
    extra: {
      precioOriginal: p.original_price || p.target_original_price || null,
      evaluacion: p.evaluate_rate || null,
      vendidos: p.last_volume || p.sale_volume || null,
      linkAfiliado: p.promotion_link || null,
    },
  };
}

/** Búsqueda ordenada por lo que MÁS se vende (LAST_VOLUME_DESC). */
export async function buscarProductos(
  cred: CredAli,
  consulta: string,
  opts: { pagina?: number; porPagina?: number; moneda?: string; idioma?: string } = {},
): Promise<ProductoExterno[]> {
  const params: Record<string, string> = {
    keywords: consulta,
    sorting: "LAST_VOLUME_DESC",
    page_no: String(opts.pagina || 1),
    page_size: String(Math.min(opts.porPagina || 20, 50)),
    target_currency: opts.moneda || "COP",
    target_language: opts.idioma || "ES",
  };
  if (cred.trackingId) params.tracking_id = cred.trackingId;
  const data = await llamarApi(cred, "aliexpress.affiliate.product.query", params);
  const moneda = opts.moneda || "COP";
  return listaProductosRespuesta(data).map((p) => aProductoExterno(p, moneda));
}

/** Detalle con TODAS las fotos (`product_small_image_urls`) y el video. */
export async function detalleProductos(
  cred: CredAli,
  ids: Array<string | number>,
  moneda = "COP",
): Promise<ProductoExterno[]> {
  if (!ids.length) return [];
  const params: Record<string, string> = {
    product_ids: ids.map(String).join(","),
    target_currency: moneda,
    target_language: "ES",
  };
  if (cred.trackingId) params.tracking_id = cred.trackingId;
  const data = await llamarApi(cred, "aliexpress.affiliate.productdetail.get", params);
  const r = data?.aliexpress_affiliate_productdetail_get_response?.resp_result?.result
    || data?.resp_result?.result;
  const ps = r?.products?.product;
  const lista = !ps ? [] : Array.isArray(ps) ? ps : [ps];
  return lista.map((p: any) => aProductoExterno(p, moneda));
}

/**
 * Fotos + video del fabricante para `activos-fabricante.ts`: la fuente
 * primaria cuando hay credenciales (sin scraping, sin captcha).
 */
export async function activosDelFabricante(
  cred: CredAli,
  idProductoAli: string | number,
): Promise<{ fotos: string[]; video: string | null; titulo: string }> {
  const [d] = await detalleProductos(cred, [idProductoAli]);
  if (!d) throw new Error(`AliExpress no devolvió el producto ${idProductoAli}.`);
  logger.info({ idProductoAli, fotos: d.imagenes.length, video: !!d.videoUrl }, "[Integraciones] activos del fabricante desde API");
  return { fotos: d.imagenes, video: d.videoUrl || null, titulo: d.nombre };
}

export { aProductoExterno };
