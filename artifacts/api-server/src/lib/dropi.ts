/**
 * Puente con Dropi (dropshipping) — https://api.dropi.co
 *
 * Permite vender productos de proveedores de Dropi desde esta tienda sin tener
 * stock propio: se importan al catálogo, el bot los vende como cualquier otro
 * producto, y al cerrarse la venta se crea la orden en Dropi para que el
 * proveedor despache.
 *
 * ── Cómo se autentica (investigado contra la API real, jul-2026) ────────────
 * Dropi emite tokens JWT por INTEGRACIÓN (Dropi → Mis Integraciones → Agregar).
 * El tipo de integración importa, y mucho:
 *
 *   • "WOOCOMERCE"      → el JWT trae `integration_url` apuntando a un
 *                         WordPress real. Ese camino EXIGE montar y mantener un
 *                         WooCommerce, que es justo lo que no queremos.
 *   • "Chatbot Agents"  → `integration_url` viene VACÍO: la integración habla
 *                         directo contra la API, sin WordPress de por medio.
 *                         Es la que usa este puente.
 *
 * El token no vence en la práctica (exp ≈ año 2126).
 *
 * ── La restricción por IP (la parte no obvia) ───────────────────────────────
 * El JWT incluye un claim `ip_url` con las IPs autorizadas, y la API rechaza
 * TODO lo que venga de otra IP con:
 *
 *   401 {"isSuccess":false,"message":"Access denied","ip":"<la IP que vio>"}
 *
 * Ese mensaje es la mejor herramienta de diagnóstico que hay: dice exactamente
 * qué IP hay que pedirle a Dropi que autorice. Por eso `dropiRequest` la
 * extrae y la propaga en el error en vez de tragarse el 401 — sin eso, el
 * síntoma es un "no funciona" opaco imposible de resolver.
 *
 * Ojo: la IP que importa es la del SERVIDOR donde corre esta app (el de
 * Easypanel), no la del navegador del admin.
 */
import { logger } from "./logger";

const DROPI_API_URL = process.env.DROPI_API_URL || "https://api.dropi.co";

export function getDropiToken(): string {
  return process.env.DROPI_TOKEN || process.env.DROPI_API_TOKEN || "";
}

export function isDropiConfigured(): boolean {
  return !!getDropiToken();
}

export interface DropiResult<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  /** IP que Dropi vio en la petición — solo cuando rechaza por whitelist. */
  blockedIp?: string;
}

/**
 * Llama a la API de Dropi. Devuelve un resultado tipado en vez de lanzar, para
 * que las herramientas del Architect puedan explicar el fallo en lugar de
 * romper el turno entero.
 */
export async function dropiRequest<T = any>(
  path: string,
  body?: Record<string, any>,
  method: "GET" | "POST" | "PUT" = "POST",
): Promise<DropiResult<T>> {
  const token = getDropiToken();
  if (!token) {
    return { ok: false, error: "Falta DROPI_TOKEN. Genéralo en Dropi → Mis Integraciones (tipo 'Chatbot Agents') y ponlo en las variables de entorno." };
  }

  const url = `${DROPI_API_URL.replace(/\/+$/, "")}${path.startsWith("/") ? path : "/" + path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        // Dropi acepta ambos encabezados según el endpoint; mandar los dos
        // evita depender de cuál valida cada ruta.
        Authorization: `Bearer ${token}`,
        "X-Authorization": `Bearer ${token}`,
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
      signal: AbortSignal.timeout(20000),
    });

    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* respuesta no-JSON */ }

    if (!res.ok || json?.isSuccess === false) {
      const msg = json?.message || `HTTP ${res.status}`;
      // El 401 por whitelist trae la IP vista: es LA pista para resolverlo.
      const blockedIp = json?.ip;
      if (blockedIp) {
        logger.warn({ blockedIp, path }, "[Dropi] Rechazado por whitelist de IP");
        return {
          ok: false,
          blockedIp,
          error: `Dropi rechazó la petición por IP no autorizada. Vio la IP ${blockedIp} — pídele a soporte de Dropi que la agregue a la whitelist de la integración.`,
        };
      }
      return { ok: false, error: msg };
    }

    return { ok: true, data: (json?.objects ?? json) as T };
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "Dropi no respondió a tiempo (20s)" : e?.message || String(e);
    return { ok: false, error: msg };
  }
}

/** Diagnóstico: ¿el token sirve y desde qué IP nos ve Dropi? */
export async function dropiStatus(): Promise<DropiResult> {
  if (!isDropiConfigured()) {
    return { ok: false, error: "Dropi no está configurado (falta DROPI_TOKEN)" };
  }
  const r = await dropiRequest("/integrations/products", { pageSize: 1, startData: 0 });
  if (r.ok) return { ok: true, data: { message: "Conexión con Dropi OK" } };
  return r;
}

export interface DropiProduct {
  id: number;
  name: string;
  description?: string;
  sale_price?: number;
  suggested_price?: number;
  stock?: number;
  gallery?: Array<{ url?: string; urlS3?: string }>;
  categories?: Array<{ name?: string }>;
}

/** Busca productos en el catálogo de proveedores de Dropi. */
export async function dropiSearchProducts(query: string, limit = 10): Promise<DropiResult<DropiProduct[]>> {
  const r = await dropiRequest<any>("/integrations/products", {
    pageSize: Math.min(limit, 50),
    startData: 0,
    ...(query ? { name: query, keywords: query } : {}),
  });
  if (!r.ok) return r as DropiResult<DropiProduct[]>;
  const list = Array.isArray(r.data) ? r.data : (r.data as any)?.objects || [];
  return { ok: true, data: list as DropiProduct[] };
}

/** Trae un producto puntual por id. */
export async function dropiGetProduct(id: number): Promise<DropiResult<DropiProduct>> {
  const r = await dropiRequest<any>(`/integrations/products/${id}`, {}, "GET");
  if (!r.ok) return r as DropiResult<DropiProduct>;
  const p = Array.isArray(r.data) ? r.data[0] : r.data;
  return p ? { ok: true, data: p as DropiProduct } : { ok: false, error: `Producto ${id} no encontrado en Dropi` };
}

export interface DropiOrderInput {
  dropiProductId: number;
  quantity: number;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  clientCity?: string;
  clientDepartment?: string;
  notes?: string;
}

/**
 * Crea una orden real en Dropi: a partir de acá el proveedor despacha y
 * cobra contra entrega. Es una acción con consecuencias económicas, así que
 * quien la llama debe pedir confirmación explícita antes (ver DESTRUCTIVE_TOOLS
 * en app-operator.ts).
 */
export async function dropiCreateOrder(input: DropiOrderInput): Promise<DropiResult> {
  return dropiRequest("/integrations/orders", {
    products: [{ id: input.dropiProductId, quantity: input.quantity }],
    name: input.clientName,
    phone: input.clientPhone,
    dir: input.clientAddress,
    city: input.clientCity || "",
    department: input.clientDepartment || "",
    notes: input.notes || "",
  });
}

/** Primera imagen utilizable de un producto de Dropi. */
export function dropiProductImage(p: DropiProduct): string | null {
  const g = p.gallery?.[0];
  return g?.urlS3 || g?.url || null;
}
