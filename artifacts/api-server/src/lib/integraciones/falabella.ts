/**
 * Falabella Seller Center — FASE 4 (estructura mínima, sin probar).
 *
 * La API de Seller Center firma cada llamada con HMAC-SHA256 de los
 * parámetros ordenados. No hay app creada ni credenciales, así que esto es
 * el andamio: credenciales + firma + lectura de órdenes/producto, con tests
 * de la firma. Cuando el dueño abra la cuenta de seller, se valida contra
 * la API real y se agregan importar/publicar/webhooks.
 */
import crypto from "node:crypto";
import { logger } from "../logger";
import type { PedidoExterno } from "./tipos";

export interface CredFala { sellerId: string; apiKey: string; endpoint?: string }

/** Firma Seller Center: HMAC-SHA256(apiKey, concat(k+v ordenados)). Pura (testeable). */
/**
 * Firma del Seller Center (familia SellerCenter de Rocket, la que usa
 * Falabella): parámetros ORDENADOS, `clave=valor` con encoding RFC 3986 y
 * unidos con `&`; HMAC-SHA256 con la API key, en hex MINÚSCULA. La versión
 * anterior pegaba `clavevalor` sin `=`/`&` y en mayúsculas: toda llamada
 * habría vuelto "E7: Signature mismatching".
 */
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function firmarSeller(params: Record<string, string>, apiKey: string): string {
  const base = Object.keys(params).sort().map((k) => `${rfc3986(k)}=${rfc3986(params[k]!)}`).join("&");
  return crypto.createHmac("sha256", apiKey).update(base, "utf8").digest("hex");
}

function base(cred: CredFala): string {
  // Endpoint unificado de Falabella Seller Center (el anterior era el de Sodimac Chile).
  return String(cred.endpoint || "https://sellercenter-api.falabella.com").replace(/\/+$/, "");
}

async function sellerGET(cred: CredFala, accion: string, extra: Record<string, string> = {}): Promise<any> {
  const params: Record<string, string> = {
    Action: accion,
    Format: "JSON",
    Timestamp: new Date().toISOString(),
    UserID: cred.sellerId,
    Version: "1.0",
    ...extra,
  };
  const firma = firmarSeller(params, cred.apiKey);
  // La URL usa EXACTAMENTE la misma codificación que se firmó.
  const query = Object.keys(params).sort().map((k) => `${rfc3986(k)}=${rfc3986(params[k]!)}`).join("&");
  const url = `${base(cred)}/?${query}&Signature=${firma}`;
  // Falabella pide User-Agent con formato SELLER/TECNOLOGIA/VERSION/INTEGRACION/UNIDAD.
  const r = await fetch(url, { headers: { "User-Agent": `${cred.sellerId}/Node/1.0/PROPIA/FACO` }, signal: AbortSignal.timeout(30_000) });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Falabella ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  if (d?.ErrorResponse) throw new Error(`Falabella: ${d.ErrorResponse.Head?.ErrorMessage || "error"}`.slice(0, 200));
  return d?.SuccessResponse?.Body ?? d;
}

/** Órdenes recientes del seller. */
export async function listarOrdenes(cred: CredFala, limite = 50): Promise<PedidoExterno[]> {
  const cuerpo: any = await sellerGET(cred, "GetOrders", { Limit: String(Math.min(limite, 100)) });
  const ordenes = cuerpo?.Orders?.Order;
  const lista = !ordenes ? [] : Array.isArray(ordenes) ? ordenes : [ordenes];
  return lista.map((o: any): PedidoExterno => {
    const dir = o.AddressShipping || o.AddressBilling || {};
    const itemsRaw = o.OrderLines?.OrderLine;
    const items = (!itemsRaw ? [] : Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw]).map((l: any) => ({
      idExterno: String(l.SellerSku || l.Sku || ""),
      sku: String(l.SellerSku || l.Sku || "") || null,
      nombre: String(l.Name || "Item"),
      cantidad: Number(l.Quantity) || 1,
      precio: Number(l.PaidPrice || l.UnitPrice) || 0,
    }));
    return {
      idExterno: String(o.OrderId || o.OrderNumber || ""),
      nombre: [dir.FirstName, dir.LastName].filter(Boolean).join(" ") || null,
      telefono: dir.Phone || null,
      departamento: dir.Region || null,
      ciudad: dir.City || null,
      direccion: [dir.Address1, dir.Address2].filter(Boolean).join(" ") || null,
      notas: `Orden Falabella #${o.OrderNumber || o.OrderId} · ${o.Statuses?.Status || ""}`,
      items,
      pagado: /pending/i.test(String(o.PaymentMethod || "")) ? false : true,
      metodoPago: o.PaymentMethod || "falabella",
    };
  });
}

/** Prueba la conexión (lee 1 orden; si no hay, igual valida la firma). */
export async function probarConexion(cred: CredFala): Promise<{ ok: boolean; ordenes: number }> {
  const ordenes = await listarOrdenes(cred, 1);
  logger.info({ seller: cred.sellerId }, "[Integraciones] Falabella conectado");
  return { ok: true, ordenes: ordenes.length };
}
