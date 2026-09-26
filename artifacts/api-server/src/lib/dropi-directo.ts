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

/**
 * Si el negocio ya tiene WooCommerce con productos de Dropify, el token está
 * ahí (meta `_dropi_token`). Se ofrece como sugerencia en el panel para que
 * no haya que ir a buscarlo a Dropi.
 */
export async function tokenSugeridoDesdeWoo(tenantId: number): Promise<string | null> {
  try {
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
  const orden: Variante[] = preferida ? [preferida, preferida === "plana" ? "wordpress" : "plana"] : ["wordpress", "plana"];
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
async function explicarRechazo(token: string, error: string, ipQueVioDropi?: string | null): Promise<string> {
  let payload: any = null;
  try { payload = JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch { /* no es JWT */ }
  if (!payload) return `Dropi rechazó el token (${error}). Eso no parece un token de integración: copialo de Dropi → Mis Integraciones.`;
  if (!payload.integration_url && /not issued|issued to this api/i.test(error)) {
    return `Dropi rechazó el token (${error}). Es el token de SESIÓN del panel de Dropi, no el de integración: creá una integración en Dropi → Mis Integraciones y pegá ese token.`;
  }
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
    return `Dropi rechazó el token: venció el ${new Date(Number(payload.exp) * 1000).toISOString().slice(0, 10)}. Generá uno nuevo en Dropi → Mis Integraciones.`;
  }
  const ips = [payload.ip_url, payload.ip].flat().filter((x: any) => x != null && String(x).trim() !== "").map(String);
  const nuestra = ipQueVioDropi || (await ipDeSalida());
  const tipo = payload.integration_url ? `WooCommerce (tienda ${payload.integration_url})` : "sin tienda (tipo Chatbot/API)";
  if (ips.length && !(nuestra && ips.some((ip) => ip.includes(nuestra)))) {
    // La lista de IPs NO está en el formulario de Dropi: la administra Dropi
    // (dropi.ts, investigado jul-2026; confirmado por el dueño 23-09).
    return `Dropi rechazó el token (${error}): esa integración ${tipo} solo acepta las IP ${ips.join(", ")} y nuestro servidor sale por ${nuestra || "otra IP"}. ` +
      `Esa lista la maneja Dropi, no aparece en el formulario: probá crear la integración de tipo "Chatbot Agents" en vez de WooCommerce, o pedile a soporte de Dropi que autorice la IP ${nuestra || "del servidor"} para esa integración.`;
  }
  return `Dropi rechazó el token (${error}). Integración ${tipo}, IP autorizadas: ${ips.join(", ") || "ninguna"}, Dropi nos vio desde ${nuestra || "?"}. ` +
    `Si es de tipo WooCommerce, probá crear una de tipo "Chatbot Agents".`;
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
  const body: Record<string, any> = {
    startData: Math.max(0, (opts.pagina ?? 1) - 1),
    pageSize: Math.min(50, opts.porPagina ?? 20),
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

/** ¿Está disponible para vender? (activo y con stock) */
export function disponible(p: ProductoDropi | null | undefined): { ok: boolean; motivo?: string; stock: number | null } {
  if (!p) return { ok: false, motivo: "no existe en Dropi", stock: null };
  const stock = stockDe(p);
  const activo = p.active === undefined ? true : (p.active === true || p.active === 1);
  if (!activo) return { ok: false, motivo: "archivado/inactivo por el proveedor", stock };
  if (stock != null && stock <= 0) return { ok: false, motivo: "sin stock", stock };
  return { ok: true, stock };
}

// ─── Importar al catálogo del bot ───────────────────────────────────────────

export interface ResultadoImportacion { ok: boolean; productId?: number; yaExistia?: boolean; error?: string; nombre?: string; curadoPor?: string; complementadoDesde?: string[] }

/**
 * Trae un producto de Dropi al catálogo del negocio. Si ya estaba (mismo
 * dropiProductId), actualiza stock/fotos/proveedor y no duplica. El precio
 * de venta lo decide el dueño; si no lo pasa, se usa el sugerido por Dropi.
 */
export async function importarProductoDropi(tenantId: number, token: string, dropiId: number, opts: { precio?: number | null; categoria?: string | null; curar?: boolean } = {}): Promise<ResultadoImportacion> {
  const r = await detalleProductoDropi(token, dropiId);
  if (!r.ok || !r.data) return { ok: false, error: `No se pudo leer el producto ${dropiId} en Dropi: ${r.error}` };
  const p = r.data;
  const precio = Number(opts.precio) || Number(p.suggested_price) || Number(p.sale_price) || 0;
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

  const dropi = {
    source: "dropi",
    dropiProductId: Number(p.id),
    dropiSupplierId: prov.id,
    dropiSupplierNombre: prov.nombre,
    dropiStock: stockDe(p),
    dropiCost: Number(p.sale_price) || null,
    dropiType: p.type || null,
    dropiVariations: Array.isArray(p.variations) ? p.variations.map((v: any) => ({ id: v.id, stock: v.stock, attributes: v.attribute_values || v.attributes || v.name })) : [],
    dropiBodega: bodegaDe(p),
    imageUrls,
    imagenes: imageUrls,
    dropiRevisadoEn: new Date().toISOString(),
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
    await db.update(products).set({
      metadata: JSON.stringify({ ...m, ...dropi }),
      imageUrl: imageUrls[0] || previo.imageUrl || null,
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
    metadata: JSON.stringify(dropi),
  } as any).returning();
  logger.info({ tenantId, productId: (creado as any).id, dropiId: p.id, curadoPor: ficha?.curadoPor || null }, "[DropiDirecto] Producto importado");
  return { ok: true, productId: (creado as any).id, nombre: (creado as any).name, curadoPor: ficha?.curadoPor, complementadoDesde: ficha?.complementadoDesde };
}

// ─── Crear el pedido directo en Dropi ───────────────────────────────────────

export interface PedidoParaDropi {
  nombre: string; telefono: string; documento?: string | null;
  direccion: string; barrio?: string | null; ciudad: string; departamento: string;
  notas?: string | null; cantidad: number; precioUnitario: number;
  contraentrega: boolean; referencia: string | number;
  email?: string | null;
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
  const body = {
    total_order: total,
    notes: notasParaElProveedor(pedido.notas, pedido.documento),
    name, surname,
    dir: `${pedido.direccion}${pedido.barrio ? ` ${pedido.barrio}` : ""}`,
    country: "CO",
    state: normalizarCiudadParaDropi(pedido.departamento),
    city: normalizarCiudadParaDropi(pedido.ciudad),
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
  const r = await dropiIntegracion<any>(token, "orders/myorders", body, "POST", 60000);
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
