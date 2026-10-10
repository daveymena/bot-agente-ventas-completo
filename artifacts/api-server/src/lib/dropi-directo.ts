/**
 * ============================================================
 * DROPI DIRECTO: sin WooCommerce en el medio
 * ============================================================
 *
 * Pedido del dueño (19-09-2026): "que al cliente ingresar el token jale los
 * productos y realice todo sin WooCommerce". Hasta hoy el pedido iba
 * bot → WooCommerce → Dropify (plugin de WordPress) → Dropi. Dropify no hace
 * nada mágico: llama a `https://api.dropi.co/integrations/…` con un token
 * de integración en la cabecera `dropi-integration-key`. Leído de su código
 * (ProductsModel.php, OrdersModel.php) y verificado ese día: con ese token
 * se creó la orden Dropi #90133857 desde nuestro servidor.
 *
 * Endpoints (los mismos que usa Dropify, ni uno más):
 *   POST products/index      catálogo con filtros (keywords, stockmayor, category, paginado)
 *   GET  products/v2/{id}    detalle + variantes + stock
 *   GET  categories/         categorías
 *   POST orders/myorders     crear el pedido (contraentrega = "CON RECAUDO")
 *
 * El token es POR CLIENTE del SaaS: se guarda cifrado en `tenants.apiKeys`
 * bajo el proveedor "dropi", con el mismo mecanismo que las claves de IA.
 *
 * ── Diferencia con lib/dropi.ts ─────────────────────────────────────────
 * `dropi.ts` usa el token de SESIÓN del panel contra `/api/…`: sirve para
 * mirar catálogo pero `api.dropi.co` rechaza crear pedidos con él ("not
 * issued to this api"). El de integración va contra `/integrations/…` y sí
 * crea pedidos. Son dos puertas; esta es la buena para operar.
 */
import { db, products } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { decryptSecret } from "./credentials-vault";
import { customerProductCopy } from "./dropi";

const BASE = (process.env.DROPI_API_URL || "https://api.dropi.co").replace(/\/+$/, "") + "/integrations/";

// ─── Token por cliente ──────────────────────────────────────────────────────

export async function tokenDropiDelTenant(tenantId: number): Promise<string | null> {
  try {
    const { clavesDelTenant } = await import("./ai-keys-tenant");
    const claves = await clavesDelTenant(tenantId);
    const t = String(claves?.dropi?.apiKey || "").trim();
    return t || null;
  } catch {
    return null;
  }
}

export async function guardarTokenDropi(tenantId: number, token: string): Promise<void> {
  const { guardarClaveDeTenant } = await import("./ai-keys-tenant");
  await guardarClaveDeTenant(tenantId, "dropi", { apiKey: token.trim() });
}

// ─── Diagnóstico del token guardado ─────────────────────────────────────────
//
// Medido en vivo (29-09-2026): el tenant tenía un token de Dropi GUARDADO
// pero INDESCIFRABLE con la clave actual (probablemente encriptado antes de
// fijar CREDENTIALS_ENCRYPTION_KEY). `decryptSecret` devuelve "" en silencio,
// así que `tokenDropiDelTenant` devolvía null y cada herramienta decía
// "primero dropi_conectar" — el admin pegaba tokens, nada cambiaba, y Atlas
// entraba en loop pidiendo lo mismo. "Ausente" e "ilegible" son dos
// situaciones distintas y piden dos mensajes distintos.

export type EstadoTokenDropi =
  | { estado: "ok"; huella: string; vence: string | null }
  | { estado: "ausente" }
  | { estado: "ilegible" };

/** Clasifica un valor CRUDO tal cual está guardado. Pura, para probarla sin base. */
export function diagnosticarValorTokenDropi(valor: unknown): EstadoTokenDropi {
  const t = String(valor || "").trim();
  if (!t) return { estado: "ausente" };
  try {
    const plano = decryptSecret(t);
    // Tiene que ser un JWT (tres partes): un texto plano legacy o basura
    // no es un token usable, aunque descifre.
    if (!plano || plano.split(".").length < 3) return { estado: "ilegible" };
    const info = integracionDelToken(plano);
    return { estado: "ok", huella: `…${plano.slice(-6)}`, vence: info?.vence || null };
  } catch {
    return { estado: "ilegible" };
  }
}

export async function estadoTokenDropi(tenantId: number): Promise<EstadoTokenDropi> {
  try {
    const { clavesDelTenant } = await import("./ai-keys-tenant");
    const claves = await clavesDelTenant(tenantId);
    return diagnosticarValorTokenDropi((claves as any)?.dropi?.apiKey);
  } catch {
    return { estado: "ausente" };
  }
}

/** El mensaje exacto según el estado: lo que el admin tiene que hacer. */
export function mensajeTokenDropi(e: EstadoTokenDropi): string {
  if (e.estado === "ilegible") {
    return (
      `El token de Dropi guardado está dañado (no se puede leer con la clave actual del servidor): ` +
      `hay que reemplazarlo. Pegá de nuevo el token de Dropi → Mis Integraciones con dropi_conectar y se verifica al acto. ` +
      `No sirve el token del panel de Dropi (sesión) ni el de otra tienda.`
    );
  }
  return "Este negocio no tiene token de Dropi: primero dropi_conectar (Dropi → Mis Integraciones → token).";
}

/**
 * Si el negocio ya tiene WooCommerce con productos de Dropify, el token está
 * ahí (meta `_dropi_token`). Se ofrece como sugerencia en el panel para que
 * no haya que ir a buscarlo a Dropi.
 */
export async function tokenSugeridoDesdeWoo(tenantId: number): Promise<string | null> {  try {
    const { getWooCommerceService } = await import("./woocommerce");
    const woo = await getWooCommerceService(tenantId);
    if (!woo) return null;
    const { auditarTokensDropify } = await import("./dropify-tokens");
    const a = await auditarTokensDropify(woo, 3);
    return a.tokens[0]?.token || null;
  } catch {
    return null;
  }
}

/** Lo que dice el token de sí mismo (JWT sin verificar firma; solo para mostrar). */
export function integracionDelToken(token: string): { tienda: string | null; usuario: string | null; vence: string | null } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return {
      tienda: payload.integration_url || null,
      usuario: payload.user_id != null ? String(payload.user_id) : null,
      vence: payload.exp ? new Date(Number(payload.exp) * 1000).toISOString().slice(0, 10) : null,
    };
  } catch {
    return null;
  }
}

// ─── Llamada base ───────────────────────────────────────────────────────────

export interface RespuestaDropi<T = any> { ok: boolean; status?: number; data?: T; error?: string }

/**
 * Cabeceras con las que Dropi acepta el token. Medido 19-09-2026: con el
 * MISMO token, `products/index` desde nuestro servidor daba "Access denied"
 * mientras Dropify (WordPress) creaba órdenes sin problema. Lo único que
 * WordPress manda distinto es su User-Agent, que lleva la URL del sitio
 * (`WordPress/6.x; https://tienda…`), o sea la `integration_url` del token.
 * Se prueban las variantes en orden y se recuerda la que sirvió.
 */
type Variante = "plana" | "wordpress";
const varianteQueSirve = new Map<string, Variante>();

function cabeceras(token: string, variante: Variante): Record<string, string> {
  const base: Record<string, string> = { "Content-Type": "application/json;charset=UTF-8", "dropi-integration-key": token };
  if (variante === "wordpress") {
    const tienda = integracionDelToken(token)?.tienda || "https://tienda.ventasproia.com/";
    base["User-Agent"] = `WordPress/6.6; ${tienda}`;
    base["Referer"] = tienda;
    base["Origin"] = tienda.replace(/\/+$/, "");
  }
  return base;
}

export async function dropiIntegracion<T = any>(token: string, path: string, body?: Record<string, any>, method: "GET" | "POST" = body ? "POST" : "GET", timeoutMs = 12000): Promise<RespuestaDropi<T>> {
  const huella = token.slice(-12);
  const preferida = varianteQueSirve.get(huella);
  // Un token sin tienda (Chatbot Agents) no tiene WordPress que imitar: las
  // cabeceras "wordpress" le inventaban una URL de tienda ajena.
  const conTienda = !!integracionDelToken(token)?.tienda;
  const orden: Variante[] = !conTienda ? ["plana"] : preferida ? [preferida, preferida === "plana" ? "wordpress" : "plana"] : ["wordpress", "plana"];
  let ultima: RespuestaDropi<T> = { ok: false, error: "sin intento" };
  for (const variante of orden) {
    try {
      const res = await fetch(BASE + path.replace(/^\/+/, ""), {
        method,
        headers: cabeceras(token, variante),
        body: method === "POST" ? JSON.stringify(body || {}) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await res.text();
      let json: any = null;
      try { json = JSON.parse(raw); } catch { /* no-JSON */ }
      if (!res.ok || json?.isSuccess === false) {
        const msg = String(json?.message || json?.status || raw.slice(0, 200) || `HTTP ${res.status}`);
        ultima = { ok: false, status: res.status, error: msg, data: json };
        // Solo un rechazo de acceso justifica probar la otra variante.
        // Límite de peticiones: no insistir, Dropi lo empeora.
        if (/exceeded the allowed number/i.test(msg) || res.status === 429) return ultima;
        if (/access denied|unauthor|forbidden|401|403/i.test(msg) || res.status === 401 || res.status === 403) {
          logger.info({ path, variante, status: res.status, msg }, "[DropiDirecto] rechazo de acceso; se prueba otra variante de cabeceras");
          continue;
        }
        return ultima;
      }
      if (preferida !== variante) { varianteQueSirve.set(huella, variante); console.log(`🔑 [DROPI] Dropi acepta el token con cabeceras "${variante}" (${path})`); }
      return { ok: true, status: res.status, data: (json?.objects ?? json) as T };
    } catch (e: any) {
      ultima = { ok: false, error: e?.name === "TimeoutError" ? `Dropi no respondió en ${Math.round(timeoutMs / 1000)}s` : String(e?.message || e) };
      return ultima;
    }
  }
  return ultima;
}

/** IP pública con la que este servidor sale a internet (la que ve Dropi). */
let ipDeSalidaCache: string | null = null;
export async function ipDeSalida(): Promise<string | null> {
  if (ipDeSalidaCache) return ipDeSalidaCache;
  for (const url of ["https://api.ipify.org", "https://ifconfig.me/ip"]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const ip = (await r.text()).trim();
      if (/^[\d.:a-f]+$/i.test(ip)) return (ipDeSalidaCache = ip);
    } catch { /* siguiente */ }
  }
  return null;
}

/**
 * Por qué Dropi rechazó un token, leído del token mismo. Pedido del dueño
 * (23-09-2026): el token de un segundo negocio "lo niega, parece que por IP".
 * El JWT de integración trae `ip_url` (IP autorizada) e `integration_url`
 * (tienda). La tienda la imitamos con cabeceras estilo WordPress; la IP no
 * se puede imitar: si el negocio creó la integración con la IP de SU hosting,
 * todo lo que sale de nuestro servidor es "Access denied". El token que sí
 * funciona (19-09) tiene la IP vacía.
 */
/**
 * Las IP autorizadas que trae el JWT. En los WooCommerce `ip_url` es texto;
 * en los "Chatbot Agents" viene como OBJETO (29-09-2026: el panel mostró
 * "solo acepta las IP [object Object]" al pegar uno). Se extrae toda cadena
 * con forma de IP, venga como venga anidada.
 */
export function ipsAutorizadasDelToken(payload: any): string[] {
  const texto = JSON.stringify([payload?.ip_url ?? null, payload?.ip ?? null, payload?.ips ?? null]);
  const encontradas = texto.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/gi) || [];
  return [...new Set(encontradas)];
}

export async function explicarRechazo(token: string, error: string, ipQueVioDropi?: string | null): Promise<string> {
  let payload: any = null;
  try { payload = JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch { /* no es JWT */ }
  if (!payload) return `Dropi rechazó el token (${error}). Eso no parece un token de integración: copialo de Dropi → Mis Integraciones.`;
  if (!payload.integration_url && /not issued|issued to this api/i.test(error)) {
    return `Dropi rechazó el token (${error}). Es el token de SESIÓN del panel de Dropi, no el de integración: creá una integración en Dropi → Mis Integraciones y pegá ese token.`;
  }
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
    return `Dropi rechazó el token: venció el ${new Date(Number(payload.exp) * 1000).toISOString().slice(0, 10)}. Generá uno nuevo en Dropi → Mis Integraciones.`;
  }
  const ips = ipsAutorizadasDelToken(payload);
  const nuestra = ipQueVioDropi || (await ipDeSalida());
  const tipo = payload.integration_url ? `WooCommerce (tienda ${payload.integration_url})` : "sin tienda (tipo Chatbot/API)";
  if (ips.length && !(nuestra && ips.some((ip) => ip.includes(nuestra)))) {
    // La lista de IPs NO está en el formulario de Dropi: la administra Dropi
    // (dropi.ts, investigado jul-2026; confirmado por el dueño 23-09).
    // La IP va GRABADA en el token al emitirlo: si Dropi autoriza la IP nueva
    // después, este token sigue diciendo la vieja y hay que generar otro.
    return `Dropi rechazó el token (${error}): esta integración ${tipo} se generó autorizando solo ${ips.join(", ")} y nuestro servidor sale por ${nuestra || "otra IP"}. ` +
      `La IP queda grabada dentro del token cuando se genera: si Dropi ya autorizó ${nuestra || "la IP del servidor"}, generá un token NUEVO en Dropi → Mis Integraciones y pegalo acá. ` +
      `Si todavía no la autorizó, hay que pedírselo a soporte de Dropi (la lista no aparece en el formulario).`;
  }
  return `Dropi rechazó el token (${error}). Integración ${tipo}, IP autorizadas: ${ips.join(", ") || "ninguna"}, Dropi nos vio desde ${nuestra || "?"}. ` +
    `Verificado (29-09-2026): un token WooCommerce VÁLIDO sí abre el catálogo directo desde este servidor; si este no abre, lo más probable es que esté REVOCADO ` +
    `(al regenerar en el panel, el anterior muere). Generá uno NUEVO en Dropi → Mis Integraciones, copialo EXACTO (sin cortarlo) y probá de nuevo. ` +
    `Si el nuevo tampoco abre, creá la integración de tipo "Chatbot Agents" en vez de WooCommerce.`;
}

/** ¿El token sirve? Pide un producto del catálogo. */
export async function probarTokenDropi(token: string): Promise<{ ok: boolean; detalle: string; integracion?: ReturnType<typeof integracionDelToken> }> {
  const t = String(token || "").trim();
  if (!t) return { ok: false, detalle: "Falta el token." };
  const r = await dropiIntegracion(t, "products/index", { startData: 0, pageSize: 1, active: true, no_count: true, integration: true, get_stock: false });
  if (!r.ok) {
    const detalle = /exceeded the allowed number/i.test(r.error || "")
      ? "Dropi frenó por demasiados intentos seguidos. Esperá unos minutos antes de probar de nuevo."
      : await explicarRechazo(t, r.error || "sin detalle", (r.data as any)?.ip || null);
    logger.warn({ error: r.error, ipQueVioDropi: (r.data as any)?.ip, integracion: integracionDelToken(t) }, "[DropiDirecto] token rechazado");
    return { ok: false, detalle, integracion: integracionDelToken(t) };
  }
  return { ok: true, detalle: "Token válido: Dropi responde el catálogo.", integracion: integracionDelToken(t) };
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

export interface ProductoDropi {
  id: number;
  name: string;
  description?: string;
  sale_price?: number;
  suggested_price?: number;
  stock?: number;
  user_id?: number;
  type?: string;
  categories?: Array<{ name?: string }>;
  gallery?: any[];
  photos?: any[];
  images?: any[];
  image?: any;
  variations?: any[];
  active?: boolean | number;
  [k: string]: any;
}

const cacheBusquedas = new Map<string, { en: number; r: RespuestaDropi<ProductoDropi[]> }>();
const CACHE_MS = 60_000;

export async function buscarProductosDropi(token: string, opts: { q?: string; conStock?: boolean; categoria?: string | number; pagina?: number; porPagina?: number } = {}): Promise<RespuestaDropi<ProductoDropi[]>> {
  const clave = `${token.slice(-12)}|${JSON.stringify(opts)}`;
  const c = cacheBusquedas.get(clave);
  if (c && Date.now() - c.en < CACHE_MS) return c.r;
  const r = await buscarProductosDropiSinCache(token, opts);
  if (r.ok) cacheBusquedas.set(clave, { en: Date.now(), r });
  return r;
}

async function buscarProductosDropiSinCache(token: string, opts: { q?: string; conStock?: boolean; categoria?: string | number; pagina?: number; porPagina?: number } = {}): Promise<RespuestaDropi<ProductoDropi[]>> {
  const pageSize = Math.min(50, opts.porPagina ?? 20);
  const body: Record<string, any> = {
    // `startData` es un DESPLAZAMIENTO, no un número de página: el SQL que
    // devuelve Dropi en sus errores dice "limit N offset <startData>"
    // (medido 29-09-2026). Con `pagina - 1` la página 2 empezaba en el ítem 1.
    startData: Math.max(0, ((opts.pagina ?? 1) - 1) * pageSize),
    pageSize,
    order_type: "desc",
    order_by: "id",
    keywords: opts.q || "",
    active: true,
    no_count: true,
    integration: true,
    get_stock: false,
  };
  if (opts.conStock) body.stockmayor = 1;
  if (opts.categoria) body.category = opts.categoria;
  const r = await dropiIntegracion<any>(token, "products/index", body);
  if (!r.ok) return r as RespuestaDropi<ProductoDropi[]>;
  const lista = Array.isArray(r.data) ? r.data : (r.data?.objects || r.data?.data || []);
  return { ok: true, data: lista as ProductoDropi[] };
}

export async function detalleProductoDropi(token: string, dropiId: number): Promise<RespuestaDropi<ProductoDropi>> {
  const r = await dropiIntegracion<any>(token, `products/v2/${dropiId}`);
  if (!r.ok) return r as RespuestaDropi<ProductoDropi>;
  const p = r.data?.product || r.data?.objects || r.data;
  return { ok: true, data: p as ProductoDropi };
}

export async function categoriasDropi(token: string): Promise<RespuestaDropi<Array<{ id: number; name: string }>>> {
  const r = await dropiIntegracion<any>(token, "categories/");
  if (!r.ok) return r as any;
  const lista = Array.isArray(r.data) ? r.data : (r.data?.objects || []);
  return { ok: true, data: lista.map((c: any) => ({ id: Number(c.id), name: String(c.name || "") })) };
}

/** CDN donde Dropi guarda las fotos; `gallery[].urlS3` viene relativa (medido 19-09-2026). */
const CDN_DROPI = (process.env.DROPI_CDN_URL || "https://d39ru7awumhhs2.cloudfront.net").replace(/\/+$/, "");
const ES_FOTO = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i;

export function fotosDe(p: ProductoDropi): string[] {
  const urls: string[] = [];
  const add = (v: string) => {
    const u = String(v || "").trim();
    if (!u) return;
    if (!ES_FOTO.test(u)) return;
    if (/^https?:\/\//i.test(u)) urls.push(u);
    else urls.push(`${CDN_DROPI}/${u.replace(/^\/+/, "")}`);
  };
  const visit = (v: any) => {
    if (!v) return;
    if (typeof v === "string") { add(v); return; }
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (typeof v === "object") [v.urlS3, v.url, v.src, v.thumbnail, v.image, v.photo].forEach((x) => (typeof x === "string" ? add(x) : visit(x)));
  };
  // 1. La galería, principal primero (gallery[].main).
  const gal = Array.isArray(p.gallery) ? [...p.gallery].sort((a: any, b: any) => (b?.main ? 1 : 0) - (a?.main ? 1 : 0)) : [];
  [gal, p.photos, p.images, p.image].forEach(visit);
  // 2. Las fotos de cada variación (color/talla): en los VARIABLE la galería
  //    del padre suele traer una sola foto y el resto vive acá.
  for (const v of Array.isArray(p.variations) ? p.variations : []) {
    [v?.gallery, v?.photos, v?.images, v?.image, v?.urlS3, v?.url].forEach(visit);
    for (const av of Array.isArray(v?.attribute_values) ? v.attribute_values : []) [av?.image, av?.urlS3, av?.url].forEach(visit);
  }
  // 3. Cualquier otra foto en el objeto (claves que no conocíamos), sin
  //    meterse en la descripción ni en el proveedor.
  const barrer = (v: any, prof = 0) => {
    if (!v || prof > 6) return;
    if (typeof v === "string") { if (ES_FOTO.test(v) && (/^https?:\/\//i.test(v) || /^colombia\//i.test(v))) add(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => barrer(x, prof + 1)); return; }
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "description" || k === "user" || k === "plan" || k === "warehouse" || k === "city") continue; barrer(x, prof + 1); }
  };
  barrer(p);
  // 4. Las imágenes que el proveedor pegó en la descripción, al final.
  for (const m of String(p.description || "").matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) add(m[1]);
  return [...new Set(urls)];
}

/** Stock total sumando bodegas (`warehouse_product[].stock`); si no viene, `stock`. */
export function stockDe(p: ProductoDropi): number | null {
  const wp = Array.isArray((p as any).warehouse_product) ? (p as any).warehouse_product : [];
  if (wp.length) return wp.reduce((acc: number, w: any) => acc + (Number(w?.stock) || 0), 0);
  return typeof p.stock === "number" ? p.stock : (p.stock != null ? Number(p.stock) : null);
}

/** Proveedor: `user.id` y su tienda. */
export function proveedorDe(p: ProductoDropi): { id: number | null; nombre: string | null } {
  const u = (p as any).user || (p as any).supplier || (p as any).owner || null;
  return { id: Number(u?.id ?? p.user_id ?? (p as any).supplier_id) || null, nombre: u?.store_name || u?.name || (p as any).supplier_name || (p as any).store_name || null };
}

/** Ciudad de la bodega que despacha (el detalle y el listado la traen distinto). */
export function bodegaDe(p: ProductoDropi): string | null {
  const wp = (p as any).warehouse_product?.[0] || (p as any).warehouses?.[0] || (p as any).warehouse || null;
  return wp?.warehouse?.city?.name || wp?.city?.name || wp?.city || (p as any).city?.name || null;
}

/**
 * La garantía REAL del proveedor, extraída de la description de Dropi.
 *
 * Dropi NO tiene un campo estructurado de garantía (medido 03-10-2026 contra
 * products/v2: ni `warranty` ni `garantia`; `dropi_app_description=null`).
 * Lo que sí pasa (medido en productos reales: AB Roller #1620647 la trae, la
 * Mochila Antirrobo #2248412 no): el PROVEEDOR escribe la política como
 * texto dentro de la description, generalmente bajo un rótulo
 * "GARANTÍAS"/"GARANTÍA"/"Warranty" seguido de las condiciones.
 *
 * Devuelve el RESUMEN honesto (los días/plazo + la condición principal que
 * se pueda caber en una línea) — la landing y el bot lo muestran como dato
 * del proveedor. Si no la menciona: null (no se inventa nada).
 */
export function garantiaDesdeDropi(p: ProductoDropi): string | null {
  const desc = String((p as any).description || "");
  if (!desc || !/garant[ií]|warranty/i.test(desc)) return null;
  const plano = desc
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|tr|p|div|h[1-6]|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\r/g, "");
  const m = plano.match(/(garant[ií]as?|warranty)[^\w\n]{0,10}([\s\S]{0,600})/i);
  if (!m) return null;
  const cuerpo = m[2]
    .split(/\n{2,}/)[0]
    .split(/\n(?=[A-ZÁÉÍÓÚÑ¿¡][^\n]{3,60}:)/)[0]
    .split(/\n(?=[A-ZÁÉÍÓÚÑ ]{4,30}$)/)[0]
    .trim();
  const lineas = cuerpo
    .split("\n")
    .map((l) => l.replace(/^[-*•·\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!lineas.length) return null;
  // Unir las dos primeras reglas en una frase que la landing quepa con gracejo.
  const resumen = lineas.join(" ");
  // Recorte defensivo: la landing no debe recibir 600 chars de política.
  return resumen.length > 220 ? `${resumen.slice(0, 217).trimEnd()}…` : resumen || null;
}

/**
 * Lo que Atlas y el panel muestran de un producto de Dropi. Existe porque
 * cada herramienta leía los campos a su manera: `dropi_buscar` y el radar
 * usaban `p.stock` y `p.user_id`, que en el listado NO vienen (el stock está
 * por bodega en `warehouse_product[]`, el proveedor en `user`). Resultado
 * medido el 29-09-2026: "stock desconocido" en los 8 candidatos del radar,
 * que además perdían los 30 puntos de stock.
 */
export function resumenProductoDropi(p: ProductoDropi) {
  const sugerido = p.suggested_price != null ? Number(p.suggested_price) : null;
  const costo = p.sale_price != null ? Number(p.sale_price) : null;
  return {
    id: Number(p.id),
    nombre: String(p.name || ""),
    precioSugerido: sugerido,
    costo,
    margenPct: sugerido && costo != null && sugerido > 0 ? Math.round(((sugerido - costo) / sugerido) * 100) : null,
    stock: stockDe(p),
    proveedor: proveedorDe(p).nombre,
    bodega: bodegaDe(p),
    categoria: p.categories?.[0]?.name || null,
    foto: fotosDe(p)[0] || null,
  };
}

/** Una línea legible para el admin. */
export function lineaProductoDropi(r: ReturnType<typeof resumenProductoDropi>): string {
  const f = (v: number | null) => (v == null ? "—" : `$${Math.round(v).toLocaleString("es-CO")}`);
  return `#${r.id} ${r.nombre} — sugerido ${f(r.precioSugerido)} · costo ${f(r.costo)}` +
    (r.margenPct != null ? ` · margen ${r.margenPct}%` : "") +
    ` · stock ${r.stock ?? "?"}` + (r.bodega ? ` (${r.bodega})` : "") + (r.proveedor ? ` · ${r.proveedor}` : "");
}

/** ¿Está disponible para vender? (activo y con stock) */
export function disponible(p: ProductoDropi | null | undefined): { ok: boolean; motivo?: string; stock: number | null } {
  if (!p) return { ok: false, motivo: "no existe en Dropi", stock: null };
  const stock = stockDe(p);
  const activo = p.active === undefined ? true : (p.active === true || p.active === 1);
  if (!activo) return { ok: false, motivo: "archivado/inactivo por el proveedor", stock };
  if (stock != null && stock <= 0) return { ok: false, motivo: "sin stock", stock };
  return { ok: true, stock };
}

// ─── Variantes (color/talla) de Dropi ───────────────────────────────────────

/**
 * Una variación de Dropi, reducida a lo que el bot necesita: `id` (para
 * despachar la variante EXACTA y no una cualquiera), `stock` y `valores`
 * ("NEGRO", "M") tal como los escribiría el cliente.
 *
 * Dropi trae las variantes en varias formas según el producto: `attribute_values`
 * con el nombre del atributo, `attributes`, o solo `name` ("M / NEGRO"). Acá se
 * normalizan todas; `variantesDeDropi` además acepta la forma ya guardada en
 * `metadata.dropiVariantes` ({ id, stock, valores }), así que volver a llamarla
 * sobre lo que ya se persistió no cambia nada.
 */
export interface VarianteDropi {
  id: number;
  stock: number | null;
  valores: string[];
  atributos: Array<{ nombre: string | null; valor: string }>;
}

const CLAVE = (t: unknown) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function variantesDeDropi(p: any): VarianteDropi[] {
  const fuente = Array.isArray(p?.variations) ? p.variations : Array.isArray(p) ? p : [];
  const out: VarianteDropi[] = [];
  for (const v of fuente) {
    if (!v || typeof v !== "object") continue;
    // Ya guardada en metadata: { id, stock, valores, atributos }.
    if (Array.isArray((v as any).valores)) {
      const valores: string[] = (v as any).valores.map((x: any) => String(x ?? "").trim()).filter(Boolean);
      if (!valores.length) continue;
      const guardados = Array.isArray((v as any).atributos) ? (v as any).atributos : [];
      const atributos: Array<{ nombre: string | null; valor: string }> = guardados.length
        ? guardados
          .map((a: any) => (a && typeof a === "object"
            ? { nombre: a.nombre != null ? String(a.nombre) : null, valor: String(a.valor ?? "").trim() }
            : { nombre: null as string | null, valor: String(a ?? "").trim() }))
          .filter((a: { valor: string }) => a.valor)
        : valores.map((valor) => ({ nombre: null as string | null, valor }));
      out.push({ id: Number(v.id) || 0, stock: v.stock != null ? Number(v.stock) : null, valores, atributos });
      continue;
    }
    const bruto: any[] = [];
    if (Array.isArray(v.attribute_values)) bruto.push(...v.attribute_values);
    if (Array.isArray(v.attributes)) bruto.push(...v.attributes);
    if (v.attribute_value != null || v.value != null || v.valor != null) bruto.push(v.attribute_value ?? v.value ?? v.valor);
    const atributos: Array<{ nombre: string | null; valor: string }> = [];
    for (const b of bruto) {
      if (b == null) continue;
      if (typeof b !== "object") {
        const valor = String(b).trim();
        if (valor) atributos.push({ nombre: null, valor });
        continue;
      }
      const valor = String(b.value ?? b.val ?? b.valor ?? b.label ?? b.attribute_value ?? b.name ?? "").trim();
      if (!valor) continue;
      const crudo = b.attribute?.name ?? b.attribute?.nombre ?? b.attribute_name ?? b.attributeName ?? b.attribute ?? b.tipo ?? null;
      const nombre = crudo == null ? null : String(crudo).trim();
      atributos.push({ nombre: nombre && CLAVE(nombre) !== CLAVE(valor) ? nombre : null, valor });
    }
    if (!atributos.length && v.name) {
      // "M / NEGRO", "Rojo, M", "M - Negro": un solo string con todo adentro.
      for (const parte of String(v.name).split(/\s*[\/|,]\s*|\s+-\s+/)) {
        const valor = parte.trim();
        if (valor) atributos.push({ nombre: null, valor });
      }
    }
    if (!atributos.length) continue;
    out.push({
      id: Number(v.id ?? v.variation_id ?? v.variacion_id) || 0,
      stock: v.stock != null ? Number(v.stock) : v.total_stock != null ? Number(v.total_stock) : null,
      atributos,
      valores: atributos.map((a) => a.valor),
    });
  }
  return out;
}

/**
 * Las variantes como `products.opciones` (lo que valida el bot, la landing y el
 * checkout). Un grupo por atributo real: { nombre: "Color", valores: [...] }.
 *
 * Sin variantes devuelve la lista vacía y no cambia nada para quien no las usa.
 */
export function opcionesDesdeVariantes(vs: VarianteDropi[]): Array<{ nombre: string; valores: string[]; obligatoria: boolean }> {
  const grupos = new Map<string, Set<string>>();
  for (const v of vs) {
    for (const a of v.atributos) {
      const g = (a.nombre || "").trim() || "Variante";
      if (!grupos.has(g)) grupos.set(g, new Set());
      grupos.get(g)!.add(a.valor);
    }
  }
  return [...grupos.entries()]
    .map(([nombre, valores]) => ({ nombre, valores: [...valores], obligatoria: true }))
    .filter((g) => g.valores.length > 0);
}

/**
 * Qué variación compró el cliente, según lo que dijo.
 *
 * Se busca por valor exacto ("M", "NEGRO") y después por contención
 * ("Rojo talla M" → la variación Rojo-M). Dos claves, y solo dos, devuelven
 * null: el valor ambiguo (talla "M" repitida en varios colores) y el que no
 * matchea a nadie. Adivinar acá es despachar el color equivocado y pagar la
 * devolución, así que quien llama prefiere mandar la variante solo como texto
 * en las notas antes que mandar un `variation_id` al azar.
 */
export function varianteElegida(vs: VarianteDropi[], elegida?: string | null): VarianteDropi | null {
  const texto = CLAVE(elegida);
  if (!texto) return null;
  const exactos = vs.filter((v) => v.valores.some((val) => CLAVE(val) === texto));
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) return null;
  const contiene = vs.filter((v) =>
    v.valores.some((val) => {
      const n = CLAVE(val);
      return n.length >= 3 && (texto.includes(n) || n.includes(texto));
    }),
  );
  return contiene.length === 1 ? contiene[0] : null;
}

// ─── Importar al catálogo del bot ───────────────────────────────────────────

export interface ResultadoImportacion { ok: boolean; productId?: number; yaExistia?: boolean; error?: string; nombre?: string; curadoPor?: string; complementadoDesde?: string[] }

/**
 * Trae un producto de Dropi al catálogo del negocio. Si ya estaba (mismo
 * dropiProductId), actualiza stock/fotos/proveedor y no duplica. El precio
 * de venta lo decide el dueño; si no lo pasa, se usa el sugerido por Dropi.
 */
/**
 * Precio de venta = costo del proveedor × factor, redondeado como precio de
 * vitrina colombiano (hacia arriba a miles, terminado en 900): 13.000 × 2,5 =
 * 32.500 → 32.900. Pura: la usa la importación por lotes.
 */
export function precioPorFactor(costo: number, factor: number): number | null {
  if (!(costo > 0) || !(factor > 1)) return null;
  const crudo = costo * factor;
  let v = Math.ceil(crudo / 1000) * 1000 - 100;
  if (v < crudo) v += 1000; // 32.950 → 33.900, nunca por debajo del factor
  return v;
}

export async function importarProductoDropi(tenantId: number, token: string, dropiId: number, opts: { precio?: number | null; factorSobreCosto?: number | null; categoria?: string | null; curar?: boolean; postImportacion?: boolean } = {}): Promise<ResultadoImportacion> {
  const r = await detalleProductoDropi(token, dropiId);
  if (!r.ok || !r.data) return { ok: false, error: `No se pudo leer el producto ${dropiId} en Dropi: ${r.error}` };
  const p = r.data;
  const porFactor = opts.factorSobreCosto ? precioPorFactor(Number(p.sale_price) || 0, Number(opts.factorSobreCosto)) : null;
  const precio = Number(opts.precio) || porFactor || Number(p.suggested_price) || Number(p.sale_price) || 0;
  if (!precio) return { ok: false, error: "El producto no trae precio sugerido; pasá un precio de venta." };
  const prov = proveedorDe(p);

  // ── Fotos sin repetidas POR CONTENIDO ──────────────────────────────────
  // Dropi suele traer la misma foto bajo varias URLs; se comparan los bytes.
  let imageUrls = fotosDe(p);
  try {
    const { fotosUnicasDelProducto } = await import("./fotos-de-producto");
    imageUrls = await fotosUnicasDelProducto({ imageUrl: imageUrls[0] || null, metadata: { imagenes: imageUrls } }, { max: 20, timeoutMs: 6000 });
  } catch { /* se usan tal cual */ }

  // ── Curación con IA (gratuitos primero; DeepSeek al final) ─────────────
  // Ver lib/curador-de-producto.ts: ficha para el comprador, sin frases de
  // proveedor ni inventos; si la info es escasa busca en otras tiendas.
  let ficha: import("./curador-de-producto").FichaCurada | null = null;
  if (opts.curar !== false) {
    try {
      const { curarProducto } = await import("./curador-de-producto");
      const bodega = bodegaDe(p);
      ficha = await curarProducto(tenantId, {
        id: Number(p.id), nombre: String(p.name || ""), descripcionHtml: p.description || "",
        atributos: (p as any).attributes || [], categoria: p.categories?.[0]?.name || null,
        proveedor: prov.nombre, bodegaCiudad: bodega, costo: Number(p.sale_price) || null,
        precioSugerido: Number(p.suggested_price) || null, stock: stockDe(p),
        variaciones: Array.isArray(p.variations) ? p.variations : [],
      });
    } catch (e: any) {
      logger.warn({ dropiId, err: e?.message }, "[DropiDirecto] la curación falló; se importa con la limpieza básica");
    }
  }

  // ── Variantes (color/talla) → productos.opciones ────────────────────────
  // Sin esto el bot cierra la venta preguntando "¿cuál color?" sin tener
  // contra qué validar, y el pedido sale a Dropi como texto en las notas:
  // el proveedor recibe "TALLA: M" pero en el sistema se despacha una
  // variación cualquiera (ver despatch de `variation_id` en dropshipping.ts).
  const variantes = variantesDeDropi(p);
  const opciones = opcionesDesdeVariantes(variantes);

  const dropi = {
    source: "dropi",
    dropiProductId: Number(p.id),
    dropiSupplierId: prov.id,
    dropiSupplierNombre: prov.nombre,
    dropiStock: stockDe(p),
    dropiCost: Number(p.sale_price) || null,
    dropiType: p.type || null,
    dropiVariations: Array.isArray(p.variations) ? p.variations.map((v: any) => ({ id: v.id, stock: v.stock, attributes: v.attribute_values || v.attributes || v.name })) : [],
    dropiVariantes: variantes.map((v) => ({ id: v.id, stock: v.stock, valores: v.valores, atributos: v.atributos })),
    dropiBodega: bodegaDe(p),
    imageUrls,
    imagenes: imageUrls,
    dropiRevisadoEn: new Date().toISOString(),
    // La garantía del PROVEEDOR (texto real de la description de Dropi). Solo
    // si existe: si el proveedor no la escribió, `garantia` queda en null y
    // la landing/bot siguen el default sin prometer nada.
    ...(garantiaDesdeDropi(p) ? { garantia: garantiaDesdeDropi(p) } : {}),
    ...(ficha ? { curado: { por: ficha.curadoPor || null, en: new Date().toISOString(), beneficioPrincipal: ficha.beneficioPrincipal, copyWhatsapp: ficha.copyWhatsapp, preguntasFrecuentes: ficha.preguntasFrecuentes, complementadoDesde: ficha.complementadoDesde } } : {}),
  };
  const nombreFinal = ficha?.nombre || String(p.name || `Producto Dropi ${p.id}`);
  const descripcionFinal = ficha?.descripcion || customerProductCopy(p.description, String(p.name || ""));
  const featuresFinal = ficha?.caracteristicas || [];
  // Nombre real de categoría, nunca el del proveedor tal cual (ver lib/taxonomia.ts).
  const { categoriaReal } = await import("./taxonomia");
  const categoriaFinal = categoriaReal({ nombre: String(ficha?.nombre || p.name || ""), categoriaSugerida: opts.categoria || ficha?.categoria, categoriaProveedor: p.categories?.[0]?.name || null, descripcion: p.description || null });

  // ¿Ya estaba? (mismo producto de Dropi en este negocio)
  const existentes = await db.select().from(products).where(eq(products.tenantId, tenantId));
  const previo = (existentes as any[]).find((x) => {
    try { const m = typeof x.metadata === "string" ? JSON.parse(x.metadata) : x.metadata; return Number(m?.dropiProductId) === Number(p.id); } catch { return false; }
  });
  if (previo) {
    const m = (() => { try { return typeof previo.metadata === "string" ? JSON.parse(previo.metadata) : (previo.metadata || {}); } catch { return {}; } })();
    const previas = (() => {
      try { const o = typeof previo.opciones === "string" ? JSON.parse(previo.opciones) : previo.opciones; return Array.isArray(o) && o.length ? o : []; }
      catch { return []; }
    })();
    await db.update(products).set({
      metadata: JSON.stringify({ ...m, ...dropi }),
      imageUrl: imageUrls[0] || previo.imageUrl || null,
      // Las opciones se rellenan solo si están vacías: si el dueño ajustó
      // los valores a mano, una re-sincronización no las pisa.
      ...(opciones.length && !previas.length ? { opciones } : {}),
      // Si se curó, la ficha nueva reemplaza a la vieja (era el crudo del proveedor).
      ...(ficha ? { name: nombreFinal, description: descripcionFinal, features: featuresFinal, category: categoriaFinal } : {}),
      isActive: disponible(p).ok ? previo.isActive : false,
    } as any).where(eq(products.id, previo.id));
    return { ok: true, productId: previo.id, yaExistia: true, nombre: nombreFinal, curadoPor: ficha?.curadoPor, complementadoDesde: ficha?.complementadoDesde };
  }

  const [creado] = await db.insert(products).values({
    tenantId,
    name: nombreFinal,
    description: descripcionFinal,
    features: featuresFinal,
    price: String(precio),
    currency: "COP",
    category: categoriaFinal,
    categoryId: await (await import("./categorias")).asegurarCategoria(tenantId, categoriaFinal, "physical"),
    kind: "physical",
    isActive: disponible(p).ok,
    imageUrl: imageUrls[0] || null,
    ...(opciones.length ? { opciones } : {}),
    metadata: JSON.stringify(dropi),
  } as any).returning();
  logger.info({ tenantId, productId: (creado as any).id, dropiId: p.id, curadoPor: ficha?.curadoPor || null }, "[DropiDirecto] Producto importado");
  // Post-importación (01-10-2026): producto NUEVO → en segundo plano se
  // buscan los activos del fabricante y se arma la landing en borrador,
  // avisando al dueño. El lote masivo lo apaga (decenas de trabajos a la
  // vez quemarían la cuota de IA); esos se lanzan de a uno después.
  if (opts.postImportacion !== false) {
    try {
      const { lanzarPostImportacion } = await import("./dropi-post-importacion");
      lanzarPostImportacion(tenantId, Number((creado as any).id));
    } catch { /* la importación ya salió: esto es accesorio */ }
  }
  return { ok: true, productId: (creado as any).id, nombre: (creado as any).name, curadoPor: ficha?.curadoPor, complementadoDesde: ficha?.complementadoDesde };
}

// ─── Crear el pedido directo en Dropi ───────────────────────────────────────

export interface PedidoParaDropi {
  nombre: string; telefono: string; documento?: string | null;
  direccion: string; barrio?: string | null; ciudad: string; departamento: string;
  notas?: string | null; cantidad: number; precioUnitario: number;
  contraentrega: boolean; referencia: string | number;
  email?: string | null;
  /**
   * La transportadora que ELIGIÓ el cliente. Sin `id` no se manda nada: Dropi
   * identifica la transportadora por `distributionCompany: { id, name }`, y un
   * nombre solo no le dice nada.
   */
  transportadora?: { id?: number | null; nombre: string } | null;
}

/**
 * La variación EXACTA que se le manda a Dropi.
 *
 * Primero se resuelve contra lo que ya está en `metadata.dropiVariantes` (sin
 * salir a la red); si no, contra el detalle en vivo del producto; y solo como
 * último recurso queda `metadata.dropiVariationId`. Si el texto del cliente no
 * identifica UNA variación (talla "M" repetida en tres colores), devuelve
 * `variationId: null` y la variante sigue viajando como texto en las notas:
 * mandar un id al azar es enviar la prenda equivocada.
 */
export async function varianteParaDespacho(p: {
  meta: any;
  variante?: string | null;
  token?: string | null;
  dropiProductId: number;
}): Promise<{ variationId: number | null; stock: number | null; detalle: string }> {
  const texto = String(p.variante || "").trim();
  const local = variantesDeDropi(p.meta?.dropiVariantes);
  if (texto && local.length) {
    const v = varianteElegida(local, texto);
    if (v?.id) return { variationId: v.id, stock: v.stock, detalle: `variación ${v.id} resuelta en la metadata (${v.valores.join("/")})` };
  }
  if (texto && p.token) {
    const det = await detalleProductoDropi(p.token, p.dropiProductId);
    if (det.ok && det.data) {
      const vs = variantesDeDropi(det.data);
      const v = varianteElegida(vs, texto);
      if (v?.id) return { variationId: v.id, stock: v.stock, detalle: `variación ${v.id} resuelta contra Dropi en vivo (${v.valores.join("/")})` };
      return { variationId: null, stock: null, detalle: vs.length ? `Dropi no tiene UNA variación única para "${texto}" (hay ${vs.length}): viaja solo en las notas` : `Dropi no trae variaciones para "${texto}"` };
    }
  }
  if (p.meta?.dropiVariationId) {
    return { variationId: Number(p.meta.dropiVariationId), stock: p.meta?.dropiStock ?? null, detalle: "variación fijada en la metadata del producto" };
  }
  return { variationId: null, stock: null, detalle: texto ? `sin variación para "${texto}": viaja solo en las notas` : "sin variante elegida" };
}

/**
 * Normaliza ciudad/departamento para Dropi: mayúsculas, sin acentos ni
 * puntuación, espacios simples. El formulario guarda "Cali" y Dropi valida
 * cobertura contra su catálogo ("CALI"); mandarlo crudo es pedir un rechazo
 * por formato cuando la cobertura existe.
 */
export function normalizarCiudadParaDropi(ciudad: string): string {
  return String(ciudad || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ciudad y departamento COMO LOS NOMBRA DROPI.
 *
 * Venta real perdida (conversación 2, 06-10): el cliente confirmó en Bogotá y
 * el pedido rebotó "por el nombre del departamento". Mandábamos
 * state "BOGOTA D C" (de "Bogotá D.C.") y Dropi llama a Bogotá ciudad
 * "BOGOTA", departamento "CUNDINAMARCA" (verificado 07-10 contra su
 * cotizador con el token del negocio).
 */
export function destinoParaDropi(ciudad: string, departamento: string): { city: string; state: string } {
  let city = normalizarCiudadParaDropi(ciudad);
  let state = normalizarCiudadParaDropi(departamento);
  const esBogota = (x: string) => /^(BOGOTA( D ?C)?|SANTA ?FE DE BOGOTA( D ?C)?|DISTRITO CAPITAL( DE BOGOTA)?)$/.test(x);
  if (esBogota(city) || (esBogota(state) && (!city || esBogota(city)))) {
    return { city: "BOGOTA", state: "CUNDINAMARCA" };
  }
  if (esBogota(state)) state = "CUNDINAMARCA";
  // "Valle" a secas → el nombre completo que usa Dropi
  if (state === "VALLE") state = "VALLE DEL CAUCA";
  return { city, state };
}

/**
 * El mismo payload que arma Dropify (OrdersModel.php `save`), porque es el
 * que Dropi acepta. `rate_type` "CON RECAUDO" = contraentrega.
 */
/**
 * La talla/color PRIMERO y en mayúsculas. Este corrector no tiene variantes
 * en Dropi: la talla solo viaja en las notas, y el proveedor tiene que verla
 * de un vistazo, no escondida después de "Pedido desde la landing…".
 * Formatos que llegan: "Talla/variante: M" (WhatsApp) y "Talla: M" (landing).
 */
export function notasParaElProveedor(notas: string | null | undefined, documento?: string | null): string {
  const partes = String(notas || "").split(/\s*[·|]\s*/).map((x) => x.trim()).filter(Boolean);
  const esVariante = (x: string) => /^(talla(\/variante)?|color|modelo|variante)\s*:/i.test(x);
  const variantes = partes.filter(esVariante).map((x) => {
    const [k, ...v] = x.split(":");
    return `${k.replace(/\/variante/i, "").trim().toUpperCase()}: ${v.join(":").trim().toUpperCase()}`;
  });
  const resto = partes.filter((x) => !esVariante(x));
  return [variantes.join(" — "), ...resto, documento ? `Documento: ${documento}` : ""].filter(Boolean).join(" | ");
}

export async function crearPedidoDropi(token: string, producto: { dropiProductId: number; nombre: string; supplierId?: number | null; stock?: number | null; variationId?: number | null }, pedido: PedidoParaDropi): Promise<RespuestaDropi<{ id: number | string; raw: any }>> {
  const partes = String(pedido.nombre || "").trim().split(/\s+/);
  const name = partes[0] || pedido.nombre;
  const surname = partes.slice(1).join(" ") || ".";
  const total = pedido.precioUnitario * pedido.cantidad;
  const item: Record<string, any> = {
    id: producto.dropiProductId,
    name: producto.nombre,
    quantity: pedido.cantidad,
    stock: producto.stock ?? 0,
    price: pedido.precioUnitario,
    token,
    user_id: producto.supplierId ?? undefined,
  };
  if (producto.variationId) item.variation_id = producto.variationId;
  const body: Record<string, any> = {
    total_order: total,
    notes: notasParaElProveedor(pedido.notas, pedido.documento),
    name, surname,
    dir: `${pedido.direccion}${pedido.barrio ? ` ${pedido.barrio}` : ""}`,
    country: "CO",
    ...destinoParaDropi(pedido.ciudad, pedido.departamento),
    phone: pedido.telefono,
    client_email: pedido.email || `${pedido.telefono}@whatsapp.local`,
    payment_method_id: 1,
    status: "PENDIENTE CONFIRMACION",
    type: "FINAL_ORDER",
    rate_type: pedido.contraentrega ? "CON RECAUDO" : "SIN RECAUDO",
    products: [item],
    calculate_costs_and_shiping: true,
    supplier_id: producto.supplierId ?? undefined,
    shop_order_id: pedido.referencia,
    create_product_if_not_exist: false,
  };
  if (pedido.transportadora?.id) {
    body.distributionCompany = { id: Number(pedido.transportadora.id), name: String(pedido.transportadora.nombre || "") };
  }
  let r = await dropiIntegracion<any>(token, "orders/myorders", body, "POST", 60000);
  if (!r.ok && body.distributionCompany) {
    // Dropi puede rechazar la transportadora elegida para esa ciudad o ese
    // pedido. Se reintenta UNA sola vez sin elegir ninguna, que es como se
    // creaba siempre (`calculate_costs_and_shiping: true`): un pedido parado
    // por la transportadora es peor que uno con la que Dropi asigna sola.
    const { distributionCompany: _omitida, ...sinTransportadora } = body;
    logger.warn({ shop_order_id: pedido.referencia, transportadora: body.distributionCompany, error: r.error || r.data }, "[DropiDirecto] Rechazó la transportadora elegida; se reintenta sin elegir");
    r = await dropiIntegracion<any>(token, "orders/myorders", sinTransportadora, "POST", 60000);
    if (r.ok) logger.warn({ shop_order_id: pedido.referencia }, "[DropiDirecto] Pedido creado sin la transportadora elegida (Dropi asigna la suya)");
  }
  if (!r.ok) return r as any;
  const obj = r.data?.objects ?? r.data;
  const id = obj?.id ?? obj?.order?.id ?? null;
  return { ok: true, data: { id, raw: obj } };
}

// ─── Disponibilidad ─────────────────────────────────────────────────────────

/**
 * Revisa en Dropi cada producto importado del negocio y desactiva los que ya
 * no se pueden vender (archivado/sin stock); reactiva los que volvieron.
 * Dropify tiene su cron de stock apagado, así que esto es lo único que
 * mantiene el catálogo honesto. Devuelve qué cambió, para avisar.
 */
export async function verificarDisponibilidadDropi(tenantId: number, token: string): Promise<{ revisados: number; desactivados: Array<{ id: number; nombre: string; motivo: string }>; reactivados: Array<{ id: number; nombre: string }>; errores: number }> {
  const lista = await db.select().from(products).where(eq(products.tenantId, tenantId));
  const out = { revisados: 0, desactivados: [] as Array<{ id: number; nombre: string; motivo: string }>, reactivados: [] as Array<{ id: number; nombre: string }>, errores: 0 };
  for (const p of lista as any[]) {
    let m: any = {};
    try { m = typeof p.metadata === "string" ? JSON.parse(p.metadata) : (p.metadata || {}); } catch { /* sin metadata */ }
    const dropiId = Number(m?.dropiProductId);
    if (!dropiId) continue;
    out.revisados++;
    const r = await detalleProductoDropi(token, dropiId);
    if (!r.ok) { out.errores++; continue; }
    const d = disponible(r.data);
    const nuevoMeta = { ...m, dropiStock: d.stock, dropiRevisadoEn: new Date().toISOString(), dropiMotivo: d.ok ? null : d.motivo };
    if (!d.ok && p.isActive) {
      await db.update(products).set({ isActive: false, metadata: JSON.stringify(nuevoMeta) } as any).where(eq(products.id, p.id));
      out.desactivados.push({ id: p.id, nombre: p.name, motivo: d.motivo || "no disponible" });
    } else if (d.ok && !p.isActive && m?.dropiMotivo) {
      // Solo se reactiva lo que ESTE chequeo desactivó (dropiMotivo), no lo que apagó el dueño.
      await db.update(products).set({ isActive: true, metadata: JSON.stringify({ ...nuevoMeta, dropiMotivo: null }) } as any).where(eq(products.id, p.id));
      out.reactivados.push({ id: p.id, nombre: p.name });
    } else {
      await db.update(products).set({ metadata: JSON.stringify(nuevoMeta) } as any).where(eq(products.id, p.id));
    }
  }
  return out;
}

/**
 * Los productos que vinieron por WooCommerce (metadata.woocommerce) no traen
 * `dropiProductId`. Se lo busca en Woo (`_dropi_product` trae el id) para
 * que también puedan ir directo a Dropi. Devuelve cuántos quedaron vinculados.
 */
export async function vincularCatalogoDeWoo(tenantId: number): Promise<{ vinculados: number; sinDato: number }> {
  const out = { vinculados: 0, sinDato: 0 };
  const { getWooCommerceService } = await import("./woocommerce");
  const woo = await getWooCommerceService(tenantId);
  if (!woo) return out;
  const lista = await db.select().from(products).where(eq(products.tenantId, tenantId));
  for (const p of lista as any[]) {
    let m: any = {};
    try { m = typeof p.metadata === "string" ? JSON.parse(p.metadata) : (p.metadata || {}); } catch { continue; }
    if (m?.dropiProductId || !m?.woocommerce?.id) continue;
    try {
      const wp = await woo.getProduct(Number(m.woocommerce.id));
      const raw = String((wp.meta_data || []).find((x) => x.key === "_dropi_product")?.value || "");
      const id = raw.match(/s:2:"id";i:(\d+);/)?.[1] || (() => { try { return JSON.parse(raw)?.id; } catch { return null; } })();
      const supplier = raw.match(/s:7:"user_id";i:(\d+);/)?.[1] || null;
      if (!id) { out.sinDato++; continue; }
      await db.update(products).set({ metadata: JSON.stringify({ ...m, source: m.source || "dropi", dropiProductId: Number(id), dropiSupplierId: supplier ? Number(supplier) : m.dropiSupplierId ?? null }) } as any).where(eq(products.id, p.id));
      out.vinculados++;
    } catch { out.sinDato++; }
  }
  return out;
}

// ─── Pedidos reales y margen ────────────────────────────────────────────────
//
// Medido el 19-09-2026 con `GET orders/myorders?result_number=N`: cada pedido
// trae `total_order` (lo que paga el cliente), `shipping_amount` (el flete
// que Dropi cobra, con recaudo si rate_type = CON RECAUDO), la transportadora
// y en `orderdetails[].product` el `sale_price` = costo del proveedor. Con eso
// la ganancia por pedido es total − costo − flete, sin suponer nada.

export interface PedidoDropi {
  id: number; estado: string; fecha: string; ciudad: string; departamento: string;
  total: number; flete: number | null; transportadora: string | null; conRecaudo: boolean;
  guia: string | null; referenciaTienda: string | null;
  productos: Array<{ dropiId: number; nombre: string; cantidad: number; costo: number | null; sugerido: number | null }>;
}

export async function listarPedidosDropi(token: string, n = 20): Promise<RespuestaDropi<PedidoDropi[]>> {
  const r = await dropiIntegracion<any>(token, `orders/myorders?result_number=${Math.min(100, Math.max(1, n))}&start=0&orderBy=id&orderDirection=desc`, undefined, "GET", 20000);
  if (!r.ok) return r as any;
  const lista = Array.isArray(r.data) ? r.data : (r.data?.objects || []);
  const pedidos: PedidoDropi[] = lista.map((o: any) => ({
    id: Number(o.id), estado: String(o.status || ""), fecha: String(o.created_at || ""), ciudad: String(o.city || ""), departamento: String(o.state || ""),
    total: Number(o.total_order) || 0, flete: o.shipping_amount != null ? Number(o.shipping_amount) : null,
    transportadora: o.shipping_company || o.distribution_company?.name || null, conRecaudo: String(o.rate_type || "").toUpperCase() === "CON RECAUDO",
    guia: o.shipping_guide || null, referenciaTienda: o.shop_order_id != null ? String(o.shop_order_id) : null,
    productos: (Array.isArray(o.orderdetails) ? o.orderdetails : []).map((d: any) => ({
      dropiId: Number(d.product_id ?? d.product?.id), nombre: String(d.product?.name || ""), cantidad: Number(d.quantity) || 1,
      costo: d.product?.sale_price != null ? Number(d.product.sale_price) : null, sugerido: d.product?.suggested_price != null ? Number(d.product.suggested_price) : null,
    })),
  }));
  return { ok: true, data: pedidos };
}

export interface MargenDropi {
  producto: { id: number | null; nombre: string; dropiId: number };
  precioVenta: number; costoProveedor: number | null; precioSugerido: number | null; stock: number | null;
  flete: { estimado: number | null; base: string; minimo: number | null; maximo: number | null; pedidos: number };
  ganancia: number | null; margenPct: number | null; texto: string;
}

/**
 * Margen real de un producto: precio de venta (el del catálogo o el que pase
 * el admin) − costo del proveedor (Dropi, `sale_price`) − flete. El flete se
 * estima con los pedidos REALES del negocio: primero los de ese mismo
 * producto, si no hay, el promedio de todos los pedidos con recaudo.
 */
export async function margenDeProductoDropi(tenantId: number, token: string, ref: { productId?: number | null; dropiId?: number | null; precio?: number | null }): Promise<{ ok: boolean; error?: string; data?: MargenDropi }> {
  let productId: number | null = ref.productId ? Number(ref.productId) : null;
  let dropiId: number | null = ref.dropiId ? Number(ref.dropiId) : null;
  let nombre = "";
  let precioCatalogo: number | null = null;
  if (productId) {
    const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
    if (!p) return { ok: false, error: `No hay producto ${productId} en el catálogo.` };
    let m: any = {}; try { m = typeof (p as any).metadata === "string" ? JSON.parse((p as any).metadata) : ((p as any).metadata || {}); } catch { /* sin metadata */ }
    dropiId = dropiId || Number(m?.dropiProductId) || null;
    nombre = String((p as any).name || ""); precioCatalogo = Number((p as any).price) || null;
    if (!dropiId) return { ok: false, error: `"${nombre}" no está vinculado a Dropi (sin dropiProductId).` };
  }
  if (!dropiId) return { ok: false, error: "Falta productId o dropiId." };
  const det = await detalleProductoDropi(token, dropiId);
  if (!det.ok || !det.data) return { ok: false, error: `Dropi no devolvió el producto ${dropiId}: ${det.error}` };
  const d = det.data;
  nombre = nombre || String(d.name || "");
  const costo = d.sale_price != null ? Number(d.sale_price) : null;
  const sugerido = d.suggested_price != null ? Number(d.suggested_price) : null;
  const precio = Number(ref.precio) || precioCatalogo || sugerido || 0;

  // Flete medido sobre pedidos reales.
  const ped = await listarPedidosDropi(token, 50);
  const conFlete = (ped.ok ? ped.data || [] : []).filter((o) => o.flete != null && o.flete > 0);
  const delProducto = conFlete.filter((o) => o.productos.some((x) => x.dropiId === dropiId));
  const base = delProducto.length ? delProducto : conFlete.filter((o) => o.conRecaudo);
  const fletes = base.map((o) => o.flete as number);
  const flete = fletes.length ? Math.round(fletes.reduce((a, b) => a + b, 0) / fletes.length) : null;
  const ganancia = flete != null && costo != null && precio ? Math.round(precio - costo - flete) : null;
  const margenPct = ganancia != null && precio ? Math.round((ganancia / precio) * 100) : null;
  const f = (v: number | null) => (v == null ? "—" : `$${Math.round(v).toLocaleString("es-CO")}`);
  const baseTxt = !fletes.length ? "sin pedidos reales para estimar el flete" : delProducto.length ? `promedio de ${delProducto.length} pedido(s) reales de este producto` : `promedio de ${fletes.length} pedido(s) reales del negocio con recaudo`;
  const texto = [
    `💰 *${nombre}* (Dropi #${dropiId})`,
    `• Precio de venta: ${f(precio)}${precioCatalogo && precio === precioCatalogo ? " (catálogo)" : ""}${sugerido ? ` · sugerido por Dropi ${f(sugerido)}` : ""}`,
    `• Costo del proveedor: ${f(costo)}`,
    `• Flete con recaudo: ${f(flete)} (${baseTxt}${fletes.length ? `, rango ${f(Math.min(...fletes))}–${f(Math.max(...fletes))}` : ""})`,
    ganancia != null ? `• *Ganancia por pedido entregado: ${f(ganancia)}* (${margenPct}% del precio)` : "• Ganancia: falta un dato (flete o costo) para calcularla",
    stockDe(d) != null ? `• Stock en Dropi: ${stockDe(d)}` : "",
    "_No incluye devoluciones ni el costo del anuncio: con eso se calcula cuánto podés pagar por venta._",
  ].filter(Boolean).join("\n");
  return { ok: true, data: { producto: { id: productId, nombre, dropiId }, precioVenta: precio, costoProveedor: costo, precioSugerido: sugerido, stock: stockDe(d), flete: { estimado: flete, base: baseTxt, minimo: fletes.length ? Math.min(...fletes) : null, maximo: fletes.length ? Math.max(...fletes) : null, pedidos: fletes.length }, ganancia, margenPct, texto } };
}

// ─── Transportadoras: cuáles llegan a la ciudad ────────────────────────────

export interface TransportadoraDropi { id: number | null; nombre: string; precio?: number | null }
export interface TransportadorasCiudad {
  transportadoras: TransportadoraDropi[];
  /**
   * "cobertura" = filtradas por las que llegan a esa ciudad; "general" = las
   * que lista Dropi sin poder filtrar (el despacho igual confirma: si Dropi
   * rechaza, el pedido se crea sin elegir transportadora).
   */
  fuente: "cobertura" | "general";
  nota: string;
  /** Lo que Dropi SÍ dice de la ciudad (trajectory/bycity): si la cubre, el trayecto y si acepta contraentrega. */
  ciudad?: { nombre: string; cubierta: boolean; trayecto: string | null; aceptaContraentrega: boolean | null } | null;
}

/**
 * Las transportadoras que maneja la cuenta de Dropi, SIN filtro de ciudad.
 * (Idea del dueño 01-10-2026: "Enviamos con…" desde el cotizador de Dropi.)
 *
 * Dropi NO dice por API qué transportadora llega a cada ciudad —eso se
 * confirma al despachar—, así que la landing las nombra como las que maneja
 * la tienda en general y el renderer solo muestra la línea si vienen de acá
 * (nunca inventadas). Vacío cuando no hay token o Dropi no lista.
 */
export async function transportadorasGenerales(token: string): Promise<string[]> {
  try {
    const gen = await dropiIntegracion<any>(token, "distribution_companies", undefined, "GET", 20000);
    if (!gen.ok) return [];
    const nombres: string[] = [];
    for (const c of listaDeObjetos(gen.data)) {
      const nombre = String(c?.name ?? c?.nombre ?? c?.company_name ?? c?.company ?? c?.distribution_company ?? "").trim();
      if (nombre && !nombres.some((n) => n.toUpperCase() === nombre.toUpperCase())) nombres.push(nombre);
    }
    return nombres.slice(0, 6);
  } catch {
    return [];
  }
}

/** El array venga donde venga: plano, `objects`, `data`, etc. */
function listaDeObjetos(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["objects", "data", "transportadoras", "distribution_companies", "companies", "results", "list"]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function caminarJson(v: any, prof: number, cb: (o: Record<string, any>) => void): void {
  if (!v || prof > 8) return;
  if (Array.isArray(v)) { for (const x of v) caminarJson(x, prof + 1, cb); return; }
  if (typeof v !== "object") return;
  cb(v);
  for (const x of Object.values(v)) caminarJson(x, prof + 1, cb);
}

const NUM = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Elige entre ciudades homónimas la del departamento pedido.
 *
 * 09-10-2026, caso Armenia: Dropi devuelve TODAS las ciudades y `coinciden`
 * puede traer varios municipios con el mismo nombre. Tomar el primero
 * hacía que un pueblo sin recaudo negara la contraentrega de la capital.
 * Se prefiere el que coincide con el departamento (por campo de texto o
 * por `department_id` vía el endpoint `department`); sin desempate, el
 * primero como antes. Nunca falla: si Dropi no ayuda, no se bloquea nada.
 */
async function eligeCiudadPorDepartamento(token: string, coinciden: any[], departamento: string): Promise<any> {
  if (!coinciden.length) return undefined;
  if (coinciden.length === 1 || !departamento) return coinciden[0];
  const norm = (s: unknown) => normalizarCiudadParaDropi(String(s || ""));
  const porTexto = coinciden.find((c) =>
    [c?.department, c?.departamento, c?.state, c?.region].some((v) => v && norm(v) === departamento),
  );
  if (porTexto) return porTexto;
  try {
    const r = await dropiIntegracion<any>(token, "department", undefined, "GET", 15000);
    const lista = Array.isArray(r.data) ? r.data : [];
    const enDepto = coinciden.find((c) => {
      const id = Number(c?.department_id);
      if (!Number.isFinite(id)) return false;
      const nombre = lista.find((d: any) => Number(d?.id) === id)?.name || "";
      return norm(nombre) === departamento;
    });
    if (enDepto) return enDepto;
  } catch { /* sin desempate: primero como antes */ }
  return coinciden[0];
}

/**
 * Qué transportadoras llegan a la ciudad, en el orden de Dropi y, si la
 * respuesta trae precios por empresa, de la más económica a la más cara.
 *
 * Camino: `GET distribution_companies` (la lista real que manda el pedido)
 * cruzada con `POST trajectory/bycity` para la ciudad. El flete NUNCA sale de
 * acá hacia el cliente: `precio` es solo para ORDENAR, y se queda en el
 * sistema (dueño, 25-09-2026).
 */
export async function transportadorasQueLlegan(
  token: string,
  destino: { ciudad: string; departamento?: string },
): Promise<RespuestaDropi<TransportadorasCiudad>> {
  const ciudad = normalizarCiudadParaDropi(destino.ciudad);
  const departamento = normalizarCiudadParaDropi(destino.departamento || "");
  const gen = await dropiIntegracion<any>(token, "distribution_companies", undefined, "GET", 20000);
  if (!gen.ok) return gen as any;
  const base: TransportadoraDropi[] = [];
  for (const c of listaDeObjetos(gen.data)) {
    const nombre = String(c?.name ?? c?.nombre ?? c?.company_name ?? c?.company ?? c?.distribution_company ?? "").trim();
    if (!nombre) continue;
    const id = NUM(c?.id ?? c?.company_id ?? c?.distribution_company_id);
    if (!base.some((b) => b.nombre.toUpperCase() === nombre.toUpperCase())) base.push({ id, nombre });
  }
  if (!base.length) {
    return { ok: false, error: "Dropi no listó transportadoras (distribution_companies vacío o con forma nueva)." };
  }
  const cov = await dropiIntegracion<any>(
    token,
    "trajectory/bycity",
    { city: ciudad, department: departamento, rate_type: "CON RECAUDO" },
    "POST",
    20000,
  );
  if (!cov.ok) {
    return {
      ok: true,
      data: {
        transportadoras: base, fuente: "general",
        nota: `Dropi no filtró por ciudad (${String(cov.error || "").slice(0, 120)}): se muestran las ${base.length} que lista en general. Al despachar se confirma que la elegida llega.`,
      },
    };
  }
  // ── Forma REAL de trajectory/bycity (medida el 30-09-2026) ─────────────
  // Dropi ignora el filtro y devuelve TODAS las ciudades (1.475), cada una
  // con su trayecto, si acepta recaudo y una tabla de escalones de tarifa
  // por peso ({id:1, name:"NACIONAL", price:6350}…). Esos escalones NO son
  // precios por transportadora: el código anterior cruzaba su `id` (1, 2, 3…)
  // con el id de la transportadora y "ordenaba por precio" con datos
  // inventados; además daba la misma lista para Cali y para Quibdó.
  // Con el token de integración, Dropi NO dice qué transportadora llega ni
  // cuánto cobra cada una: eso se confirma al despachar.
  const ciudades = Array.isArray(cov.data?.cities) ? (cov.data.cities as any[]) : null;
  if (ciudades) {
    const coinciden = ciudades.filter((c) => normalizarCiudadParaDropi(String(c?.name || "")) === ciudad);
    if (!coinciden.length) {
      return {
        ok: true,
        data: {
          transportadoras: base, fuente: "general", ciudad: { nombre: ciudad, cubierta: false, trayecto: null, aceptaContraentrega: null },
          nota: `Dropi no tiene a ${ciudad} en su cobertura (revisá cómo está escrita la ciudad). No se puede confirmar qué transportadora llega.`,
        },
      };
    }
    // 09-10-2026, caso Armenia: Dropi devuelve TODAS las ciudades y puede
    // haber homónimos (varios municipios con el mismo nombre). Antes se
    // tomaba el primero: si ese era un pueblo sin recaudo, el vendedor
    // sentenciaba "NO hay contraentrega" para la capital que sí la tiene.
    const c = await eligeCiudadPorDepartamento(token, coinciden, departamento);
    const tarifas = String(c?.rate_type || "");
    const aceptaContraentrega = tarifas ? /CON RECAUDO/i.test(tarifas) : null;
    const trayecto = c?.trajectory_type ? String(c.trajectory_type) : null;
    return {
      ok: true,
      data: {
        transportadoras: base.map((t) => ({ id: t.id, nombre: t.nombre })),
        fuente: "general",
        ciudad: { nombre: ciudad, cubierta: true, trayecto, aceptaContraentrega },
        nota:
          `Dropi cubre ${ciudad}${trayecto ? ` (trayecto ${trayecto.toLowerCase()})` : ""}` +
          (aceptaContraentrega === false ? ", pero SIN contraentrega" : aceptaContraentrega ? " y acepta contraentrega" : "") +
          `. Dropi no dice por API qué transportadora llega ni su precio: estas son las ${base.length} que maneja en general y al despachar se confirma la elegida.` +
          (coinciden.length > 1 ? ` Hay ${coinciden.length} municipios llamados ${ciudad}: se prefirió el del departamento pedido.` : ""),
      },
    };
  }

  // Forma alternativa (lista por empresa con su precio): solo se usan objetos
  // que nombran la EMPRESA de forma explícita, nunca un `id` suelto ni
  // números encontrados en el texto.
  const precios = new Map<string, number>();
  caminarJson(cov.data, 0, (o) => {
    if (o.from != null || o.until != null) return; // escalón de tarifa por peso, no una empresa
    const idEmpresa = NUM(o.company_id ?? o.distribution_company_id ?? o.transportadora_id);
    const nombre = String(o.company_name ?? o.company ?? o.transportadora ?? "").trim();
    if (idEmpresa == null && !nombre) return;
    const precio = NUM(o.price ?? o.precio ?? o.valor ?? o.cost ?? o.costo ?? o.flete ?? o.shipping_cost);
    if (precio == null) return;
    if (idEmpresa != null) precios.set(`id:${idEmpresa}`, precio);
    if (nombre) precios.set(`n:${CLAVE(nombre)}`, precio);
  });
  const llegan = base
    .map((t) => {
      const p = (t.id != null ? precios.get(`id:${t.id}`) : undefined) ?? precios.get(`n:${CLAVE(t.nombre)}`);
      return { ...t, precio: p ?? null };
    })
    .filter((t) => t.precio != null);
  if (llegan.length) {
    llegan.sort((a, b) => (a.precio ?? Number.MAX_SAFE_INTEGER) - (b.precio ?? Number.MAX_SAFE_INTEGER));
    return { ok: true, data: { transportadoras: llegan, fuente: "cobertura", nota: `Ordenadas de la más económica a la más cara para ${ciudad}.` } };
  }
  return {
    ok: true,
    data: {
      transportadoras: base, fuente: "general",
      nota: `${ciudad}: Dropi no indicó qué transportadoras llegan, así que se muestran las ${base.length} que maneja en general. Al despachar se confirma que la elegida llega.`,
    },
  };
}

// ─── Transportadoras: sondeo de rutas (solo lectura) ────────────────────────

/**
 * Prueba las rutas candidatas de Dropi para listar transportadoras, ciudades y
 * cotizar flete, y devuelve qué respondió cada una. Existe porque la
 * documentación de integraciones de Dropi no es pública (25-09-2026): se sabe
 * que existen "Cotizador de flete", "Consultar transportadoras" y "Listar
 * ciudades", pero no sus rutas exactas. Ninguna candidata crea nada: son
 * listados y cotizaciones.
 */
export async function sondearTransportadorasDropi(
  token: string,
  destino: { ciudad: string; departamento: string; valor?: number },
): Promise<Array<{ ruta: string; metodo: string; ok: boolean; status?: number; muestra: string }>> {
  const ciudad = normalizarCiudadParaDropi(destino.ciudad);
  const departamento = normalizarCiudadParaDropi(destino.departamento);
  const valor = Math.max(1, Math.round(destino.valor || 50000));
  const candidatas: Array<{ ruta: string; metodo: "GET" | "POST"; body?: Record<string, any> }> = [
    { ruta: "distributioncompanies", metodo: "GET" },
    { ruta: "distribution_companies", metodo: "GET" },
    { ruta: "department", metodo: "GET" },
    { ruta: "trajectory/bycity", metodo: "POST", body: { city: ciudad, department: departamento, rate_type: "CON RECAUDO" } },
    { ruta: "orders/cotizaEnvioTransportadoraV2", metodo: "POST", body: { EnvioConCobro: true, amount: valor, ciudad_destino: { nombre: ciudad, departamento } } },
    { ruta: "orders/cotizaEnvioTransportadora", metodo: "POST", body: { EnvioConCobro: true, amount: valor, ciudad_destino: { nombre: ciudad, departamento } } },
  ];
  const salida: Array<{ ruta: string; metodo: string; ok: boolean; status?: number; muestra: string }> = [];
  for (const c of candidatas) {
    const r = await dropiIntegracion<any>(token, c.ruta, c.body, c.metodo, 15000);
    const muestra = JSON.stringify(r.ok ? r.data : (r.data ?? r.error)).slice(0, 500);
    salida.push({ ruta: c.ruta, metodo: c.metodo, ok: r.ok, status: r.status, muestra });
    if (/exceeded the allowed number/i.test(muestra)) break; // no insistir con el límite de Dropi
  }
  return salida;
}
