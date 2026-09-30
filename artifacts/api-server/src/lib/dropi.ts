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
 * ── Por qué NO se usa el token de integración (la parte no obvia) ───────────
 * El token de integración parece el camino natural, pero trae un claim
 * `ip_url` con una whitelist y la API rechaza todo lo que venga de otra IP:
 *
 *   401 {"isSuccess":false,"message":"Access denied","ip":"<la IP que vio>"}
 *
 * Esa whitelist la administra Dropi, no el usuario, así que dependeríamos de
 * que su soporte autorice la IP del servidor — y de volver a pedirlo cada vez
 * que el hosting cambie de IP.
 *
 * La vía que SÍ funciona sin ese trámite es la misma que usa el panel web de
 * Dropi: el token de SESIÓN DE USUARIO (`DROPI_token` en el localStorage del
 * panel) contra `POST /api/products/index`. Probado en vivo: responde 200 con
 * el catálogo real y no filtra por IP.
 *
 * Detalles del endpoint, encontrados probando (la API no está documentada):
 *   • Es POST, no GET. Un GET a la misma ruta devuelve
 *     "No tiene permisos para ver este producto", que despista: no es un
 *     problema de permisos, es el método equivocado.
 *   • `POST /api/products` (sin /index) es CREAR producto, no listar.
 *   • Los filtros van en el cuerpo: { pageSize, startData, keywords }.
 *
 * Contrapartida honesta: un token de sesión caduca antes que uno de
 * integración, así que si un día la API empieza a responder 401 hay que
 * regenerarlo desde el panel. `dropiStatus()` lo detecta y lo dice.
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
    return { ok: false, error: "Falta DROPI_TOKEN. Es el token de sesión del panel de Dropi (localStorage → DROPI_token); ponlo en las variables de entorno del servidor." };
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

      // Solo pasa si se configuró un token de INTEGRACIÓN en vez del de
      // sesión: esos sí filtran por IP. (No confundir con el 'Access denied'
      // que Dropify recibe al crear PEDIDOS: eso es un producto de Woo sin
      // `_dropi_token`, medido el 19-09-2026 sobre 41 de 62 productos; ver
      // lib/dropify-tokens.ts.) El mensaje trae la IP que Dropi vio,
      // que es justo el dato para resolverlo — se propaga en vez de perderlo.
      const blockedIp = json?.ip;
      if (blockedIp) {
        logger.warn({ blockedIp, path }, "[Dropi] Rechazado por whitelist de IP");
        return {
          ok: false,
          blockedIp,
          error: `Dropi rechazó la petición por IP (vio ${blockedIp}). Eso pasa con los tokens de INTEGRACIÓN, que traen whitelist. Usa el token de sesión del panel (localStorage → DROPI_token), que no filtra por IP.`,
        };
      }

      // "Token not issued to this api": NO está vencido ni mal copiado.
      //
      // Comprobado el 17-08-2026 sacando el token de adentro del propio
      // plugin Dropify (el que el admin dice, con razón, que está bien
      // integrado): es un JWT válido hasta 2126, emitido por app.dropi.co
      // para el usuario 471208, y con él Dropify lista los 9.999 productos
      // sin problema. api.dropi.co lo rechaza igual, por diseño: separa los
      // tokens de la app de los tokens de su API.
      //
      // Decirle al admin "generá uno nuevo" lo manda a repetir algo que ya
      // hizo y que no puede funcionar. La integración real no pasa por acá.
      if (/not issued to this api/i.test(msg)) {
        return {
          ok: false,
          error:
            "El token de Dropi está bien y no venció: es el mismo que usa Dropify, que funciona. Lo que pasa es que api.dropi.co no acepta tokens emitidos por el panel (app.dropi.co) — son dos puertas distintas y Dropi las separa a propósito. No hay token nuevo que lo arregle. La integración real va por WooCommerce: los productos se importan desde Dropify en WordPress y los pedidos se crean en WooCommerce, que es quien los empuja a Dropi. Ese camino FUNCIONA (19-09-2026, orden Dropi #90133857). Si un pedido da 'Access denied', NO es este token: es que ese producto de Woo no tiene `_dropi_token` (Dropify lo manda por producto) → dropify_reparar_tokens.",
        };
      }

      // Token de sesión realmente vencido (otro mensaje distinto).
      if (res.status === 401 || /token|unauthenticated|unauthorized/i.test(msg)) {
        return { ok: false, error: `Dropi no aceptó el token (${msg}). Puede haber vencido: entra al panel de Dropi, copia el nuevo DROPI_token del localStorage y actualiza la variable de entorno. Si el mensaje habla de "not issued to this api", NO es eso: ese token no sirve para esta API y hay que ir por WooCommerce.` };
      }

      return { ok: false, error: msg };
    }

    return { ok: true, data: (json?.objects ?? json) as T };
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "Dropi no respondió a tiempo (20s)" : e?.message || String(e);
    return { ok: false, error: msg };
  }
}

/** Diagnóstico: ¿el token sirve todavía? */
export async function dropiStatus(): Promise<DropiResult> {
  if (!isDropiConfigured()) {
    return { ok: false, error: "Dropi no está configurado (falta DROPI_TOKEN)" };
  }
  const r = await dropiRequest("/api/products/index", { pageSize: 1, startData: 0 });
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
  photos?: Array<{ url?: string; urlS3?: string; src?: string; thumbnail?: string }>;
  images?: Array<{ url?: string; urlS3?: string; src?: string; thumbnail?: string }>;
  image?: string | { url?: string; urlS3?: string; src?: string };
  categories?: Array<{ name?: string }>;
}

/** Busca productos en el catálogo de proveedores de Dropi. */
export async function dropiSearchProducts(query: string, limit = 10): Promise<DropiResult<DropiProduct[]>> {
  const r = await dropiRequest<any>("/api/products/index", {
    pageSize: Math.min(limit, 50),
    startData: 0,
    ...(query ? { keywords: query } : {}),
  });
  if (!r.ok) return r as DropiResult<DropiProduct[]>;
  const list = Array.isArray(r.data) ? r.data : (r.data as any)?.objects || [];
  return { ok: true, data: list as DropiProduct[] };
}

/**
 * Trae un producto puntual por id.
 *
 * No hay endpoint de "traer uno" que funcione con este token, así que se
 * busca por id dentro del listado. Es la misma llamada que ya sabemos que
 * responde, y evita depender de una ruta no verificada.
 */
export async function dropiGetProduct(id: number): Promise<DropiResult<DropiProduct>> {
  const r = await dropiRequest<any>("/api/products/index", { pageSize: 50, startData: 0, id });
  if (!r.ok) return r as DropiResult<DropiProduct>;
  const list: DropiProduct[] = Array.isArray(r.data) ? r.data : (r.data as any)?.objects || [];
  const p = list.find((x) => Number(x.id) === Number(id)) || (list.length === 1 ? list[0] : null);
  return p ? { ok: true, data: p } : { ok: false, error: `Producto ${id} no encontrado en Dropi` };
}

/**
 * Productos CON ÓRDENES: lo más parecido a "los más vendidos" que Dropi expone.
 *
 * Medido el 29-09-2026: la API de integraciones (`/integrations/products/index`,
 * la del token por negocio) NO tiene señal de ventas. Su `order_by` va directo
 * a una columna de `products` ("sales" → SQL "column does not exist") y
 * `with_orders` tampoco existe ahí. El único lugar con ese filtro es el
 * catálogo del panel web: el interruptor "Con órdenes" manda `with_orders`
 * a `api-v2.dropi.co/bff/catalog/products/v4/index` con el token de SESIÓN
 * (cabeceras `X-Authorization: Bearer …` y `X-Country-Code`, leídas del
 * código del panel). Dropi no ordena por cantidad vendida en ningún lado:
 * lo que se obtiene es "tiene órdenes", no un ranking.
 */
export async function dropiProductosConOrdenes(opts: { q?: string; categoria?: number | null; limite?: number } = {}): Promise<DropiResult<DropiProduct[]>> {
  const token = getDropiToken();
  if (!token) return { ok: false, error: "Falta DROPI_TOKEN (token de sesión del panel de Dropi): sin él no hay filtro de productos con órdenes." };
  const base = (process.env.DROPI_BFF_URL || "https://api-v2.dropi.co").replace(/\/+$/, "");
  const body: Record<string, any> = {
    pageSize: Math.min(Math.max(opts.limite || 20, 1), 50),
    startData: 0,
    order_by: "id",
    order_type: "desc",
    with_orders: true,
    with_collection: true,
    privated_product: false,
    get_stock: false,
    no_count: true,
    ...(opts.q ? { keywords: opts.q } : {}),
    ...(opts.categoria ? { category: opts.categoria } : {}),
  };
  try {
    const res = await fetch(`${base}/bff/catalog/products/v4/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Authorization": `Bearer ${token}`, "X-Country-Code": "co" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* no-JSON */ }
    if (!res.ok || json?.isSuccess === false || json?.is_successful === false) {
      const msg = String(json?.message || json?.error || raw.slice(0, 160) || `HTTP ${res.status}`);
      return { ok: false, error: res.status === 401 || /unauth|token/i.test(msg) ? `el token de sesión de Dropi (DROPI_TOKEN) ya no sirve (${msg}): hay que renovarlo desde el panel` : msg };
    }
    const lista = json?.data?.objects ?? json?.objects ?? json?.data ?? [];
    return { ok: true, data: (Array.isArray(lista) ? lista : []) as DropiProduct[] };
  } catch (e: any) {
    return { ok: false, error: e?.name === "TimeoutError" ? "Dropi no respondió a tiempo (20s)" : e?.message || String(e) };
  }
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
  return dropiRequest("/api/orders", {
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
  return dropiProductImages(p)[0] || null;
}

/** Todas las imágenes utilizables, priorizando la principal y eliminando duplicados. */
export function dropiProductImages(p: DropiProduct): string[] {
  const sources: any[] = [p.gallery, p.photos, p.images, p.image];
  const urls: string[] = [];
  const visit = (value: any) => {
    if (!value) return;
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value)) urls.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      [value.urlS3, value.url, value.src, value.thumbnail].forEach(visit);
    }
  };
  sources.forEach(visit);
  return [...new Set(urls)];
}

/** Convierte el copy HTML de WooCommerce/Dropi en texto limpio para el bot. */
export function cleanProductCopy(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n• ")
    .replace(/<\s*\/(?:p|h[1-6]|ul|ol|li|div)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n")
    .replace(/\n{2,}(?=•)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Frases que el proveedor le escribe AL REVENDEDOR, no al comprador final.
 *
 * Los textos de Dropi vienen redactados para quien va a revender: hablan de
 * "cargar tus pedidos en la plataforma", dan una linea de proveeduria, citan
 * precios sugeridos y margenes. Eso se importaba tal cual y quedaba visible
 * en la tienda publica. Encontrado en vivo el 17-08-2026 en el producto
 * "A612 Cinturon Termico": la descripcion que veia cualquier cliente incluia
 * el telefono de soporte del proveedor y la instruccion de contactarlo antes
 * de cargar pedidos.
 *
 * Se descarta la linea entera, no solo la frase: son lineas que en su
 * totalidad hablan del negocio mayorista y no le dicen nada al comprador.
 */
const PARA_EL_REVENDEDOR: RegExp[] = [
  /carg(?:ar|a|ues|as)\s+(?:tus?\s+)?pedidos/i,
  /proveedur[ií]a/i,
  /\bdropshipper|dropship|drop\s?shipping/i,
  /pol[ií]ticas?\s+de\s+(?:despacho|garant[ií]a)\s+vigentes?/i,
  /precio\s+sugerido|precio\s+de\s+venta\s+sugerido/i,
  /margen\s+de\s+ganancia|tu\s+utilidad|tu\s+ganancia/i,
  /\btu\s+cliente\s+final\b/i,
  /(?:contactar|comunicarse|escribir)\s+(?:a|con)\s+(?:nuestra?|la)\s+l[ií]nea/i,
  /antes\s+de\s+(?:cargar|publicar|vender|ofrecer)/i,
  /requisito\s+indispensable/i,
  /\bcat[aá]logo\s+mayorista\b|\bmayorista\b|\bdistribuidor\b/i,
  /\bstock\s+disponible\s+en\s+bodega\b|\bbodega\b/i,
  /\bdropi\b/i,
];

/** Telefonos colombianos sueltos: en una ficha de producto solo pueden ser del proveedor. */
const TELEFONO_SUELTO = /(?:\+?57[\s.-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/;

/** ¿Esta linea esta escrita para el revendedor y no para el comprador? */
export function esLineaDeProveedor(linea: string): boolean {
  return PARA_EL_REVENDEDOR.some((rx) => rx.test(linea)) || TELEFONO_SUELTO.test(linea);
}

/** Reduce el copy al contenido comercial que el cliente necesita leer. */
export function customerProductCopy(value: string | null | undefined, name: string): string {
  const lines = cleanProductCopy(value || name).split("\n").map((line) => line.trim()).filter(Boolean);
  const result: string[] = [];
  let bullets = 0;
  let paragraphs = 0;
  let skippingWarranty = false;

  for (const line of lines) {
    // Lo que el proveedor le escribe al revendedor no llega nunca al cliente.
    if (esLineaDeProveedor(line)) continue;
    const normalized = line.toLowerCase();
    if (/garant[ií]as? que|garant[ií]a:?$|compra sin riesgo/.test(normalized)) {
      skippingWarranty = true;
      continue;
    }
    if (skippingWarranty && (line.startsWith("•") || !/^[A-ZÁÉÍÓÚÑ0-9 /&-]{5,55}$/.test(line))) continue;
    if (line.startsWith("•")) {
      if (bullets++ >= 8) continue;
      result.push(line);
      continue;
    }
    if (line.length < 70 && /^[A-ZÁÉÍÓÚÑ0-9 /&-]{5,55}$/.test(line)) {
      result.push(line);
      continue;
    }
    if (paragraphs++ < 3) result.push(line);
  }

  const copy = result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return copy.slice(0, 1200).trim() || name;
}
