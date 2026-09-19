/**
 * La API de INTEGRACIONES de Dropi — la misma que usa el plugin Dropify.
 *
 * Es distinta de la que usa `dropi.ts` (`/api/products/index` con token de
 * sesión del panel): esta va por `https://api.dropi.co/integrations/…` con el
 * encabezado `dropi-integration-key` y el token de integración que Dropify
 * guarda en cada producto de Woo (meta `_dropi_token`). Ese token filtra por
 * IP, pero el bot y el WordPress corren en el mismo servidor de EasyPanel, y
 * Dropify ya crea órdenes desde ahí (la #323 fue rechazada por "producto
 * archivado", no por "Access denied"): la IP está autorizada.
 *
 * Por qué hace falta: Dropify trae el cron de stock APAGADO en su propio
 * código (`update_stock_job` empieza con `return true; //no quiero que se
 * ejecute mas este cron`). Woo nunca se entera de que el proveedor archivó o
 * agotó un producto, así que resincronizar desde Woo tampoco lo detectaría.
 * La única fuente de verdad sobre disponibilidad es Dropi mismo.
 */
import { logger } from "./logger";
import type { WooCommerceService } from "./woocommerce";

const DROPI_INTEGRATIONS_URL = (process.env.DROPI_API_URL || "https://api.dropi.co").replace(/\/+$/, "") + "/integrations/";

export interface CredencialesDropiDeProducto {
  dropiProductId: number | null;
  token: string | null;
  /** Lo que Dropify guardó al importar (nombre, tipo, stock de ese momento…). */
  guardado: any;
}

/** Lee del producto de Woo el id en Dropi y el token de integración que Dropify le dejó. */
export async function credencialesDropiDesdeWoo(woo: WooCommerceService, wooProductId: number): Promise<CredencialesDropiDeProducto> {
  const p = await woo.getProduct(wooProductId);
  const meta = (p.meta_data || []) as Array<{ key: string; value: any }>;
  const token = String(meta.find((m) => m.key === "_dropi_token")?.value || "").trim() || null;
  const raw = meta.find((m) => m.key === "_dropi_product")?.value;
  let guardado: any = raw;
  if (typeof raw === "string") {
    try { guardado = JSON.parse(raw); } catch {
      // Dropify serializa con PHP: `s:2:"id";i:12345;` — con sacar el id alcanza.
      const m = raw.match(/s:2:"id";i:(\d+);/);
      guardado = m ? { id: Number(m[1]) } : raw;
    }
  }
  const dropiProductId = Number(guardado?.id) || null;
  return { dropiProductId, token, guardado };
}

export interface ProductoEnDropi {
  ok: boolean;
  status?: number;
  /** Respuesta cruda de Dropi (`objects`), para no adivinar el formato. */
  data?: any;
  error?: string;
}

/** GET /integrations/products/{id} con el token de integración. */
export async function consultarProductoEnDropi(dropiProductId: number, token: string): Promise<ProductoEnDropi> {
  try {
    const res = await fetch(`${DROPI_INTEGRATIONS_URL}products/${dropiProductId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json;charset=UTF-8", "dropi-integration-key": token },
      signal: AbortSignal.timeout(20000),
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* no-JSON */ }
    if (!res.ok || json?.isSuccess === false) {
      return { ok: false, status: res.status, error: json?.message || raw.slice(0, 300) || `HTTP ${res.status}`, data: json };
    }
    return { ok: true, status: res.status, data: json?.objects ?? json };
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "Dropi no respondió a tiempo (20s)" : e?.message || String(e);
    logger.warn({ dropiProductId, err: msg }, "[Dropi] No se pudo consultar el producto por integraciones");
    return { ok: false, error: msg };
  }
}
