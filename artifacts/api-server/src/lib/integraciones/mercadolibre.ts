/**
 * Mercado Libre — OAuth del vendedor (Colombia: MCO).
 *
 * El dueño crea la app en developers.mercadolibre.com.co con redirect a
 * `https://ventasproia.com/api/integraciones/mercadolibre/callback` y pega
 * acá client_id + client_secret. El flujo:
 *  1. `urlAutorizacion()` → el dueño abre, acepta y vuelve con `?code=`.
 *  2. El callback intercambia el code por access + refresh (cifrados).
 *  3. `tokenValido()` refresca solo cuando falta <10 min para vencer.
 */
import { logger } from "../logger";
import type { PedidoExterno, ProductoExterno } from "./tipos";

export interface CredMeli { clientId: string; clientSecret: string; accessToken?: string; refreshToken?: string; expiraEn?: string; vendedorId?: string }

const AUTH = "https://auth.mercadolibre.com.co/authorization";
const API = "https://api.mercadolibre.com";

export function urlAutorizacion(clientId: string, redirectUri: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri });
  return `${AUTH}?${q}`;
}

export async function intercambiarCodigo(
  clientId: string, clientSecret: string, code: string, redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; expiraEn: string; vendedorId: string }> {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Mercado Libre OAuth ${r.status}: ${d?.message || d?.error || "falló el intercambio"}`.slice(0, 200));
  if (!d.access_token) throw new Error("Mercado Libre no devolvió access_token.");
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiraEn: new Date(Date.now() + Number(d.expires_in || 21600) * 1000).toISOString(),
    vendedorId: String(d.user_id || ""),
  };
}

async function refrescar(clientId: string, clientSecret: string, refreshToken: string) {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`Mercado Libre refresh ${r.status}: ${d?.message || d?.error || "falló"}`.slice(0, 200));
  return {
    accessToken: d.access_token as string,
    refreshToken: (d.refresh_token || refreshToken) as string,
    expiraEn: new Date(Date.now() + Number(d.expires_in || 21600) * 1000).toISOString(),
  };
}

/**
 * Access token vigente. Si vence en <10 min, refresca y devuelve `rotado`
 * para que el llamador lo guarde (el refresh_token también rota en ML).
 */
export async function tokenValido(cred: CredMeli): Promise<{ token: string; rotado?: { accessToken: string; refreshToken: string; expiraEn: string } }> {
  if (!cred.accessToken) throw new Error("Mercado Libre no conectado: falta autorizar (ver urlAutorizacion).");
  const vence = cred.expiraEn ? Date.parse(cred.expiraEn) : 0;
  if (Number.isFinite(vence) && vence - Date.now() > 10 * 60_000) return { token: cred.accessToken };
  if (!cred.refreshToken) throw new Error("Mercado Libre: token vencido y sin refresh_token; hay que re-autorizar.");
  const n = await refrescar(cred.clientId, cred.clientSecret, cred.refreshToken);
  logger.info("[Integraciones] token de Mercado Libre refrescado");
  return { token: n.accessToken, rotado: n };
}

async function meliGET(token: string, path: string): Promise<any> {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 404) return null;
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Mercado Libre ${r.status}: ${JSON.stringify(d?.message || d).slice(0, 200)}`);
  return d;
}

function aProductoExterno(item: any): ProductoExterno {
  const fotos: string[] = (item.pictures || []).map((p: any) => p.secure_url || p.url).filter(Boolean);
  if (!fotos.length && item.thumbnail) fotos.push(String(item.thumbnail).replace(/^http:/, "https:"));
  return {
    idExterno: String(item.id),
    nombre: String(item.title || `Publicación ${item.id}`).slice(0, 200),
    descripcion: null,
    precio: Number(item.price) || 0,
    moneda: item.currency_id || "COP",
    categoriaSugerida: item.category_id || null,
    imagenes: [...new Set(fotos)].slice(0, 20),
    stock: item.available_quantity ?? item.initial_quantity ?? null,
    activo: item.status === "active",
    urlOrigen: item.permalink || null,
    digital: false,
    variantes: (item.variations || []).map((v: any) => (v.attribute_combinations || []).map((a: any) => a.value_name).filter(Boolean).join(" / ")).filter(Boolean),
    extra: { condicion: item.condition || null, garantia: item.warranty || null, envios: item.shipping?.free_shipping ?? null },
  };
}

/** IDs de las publicaciones del vendedor (scroll por offset, tope 1000). */
export async function listarIds(token: string, vendedorId: string, limite = 100): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ids.length < limite; offset += 50) {
    const d: any = await meliGET(token, `/users/${vendedorId}/items/search?limit=50&offset=${offset}&sort=date_created_desc`);
    const page: string[] = d?.results || [];
    ids.push(...page);
    if (page.length < 50 || !d?.paging || offset + 50 >= Number(d.paging.total || 0)) break;
  }
  return ids.slice(0, limite);
}

/** Detalle por lotes de 20 (límite del multiget). */
export async function leerItems(token: string, ids: string[]): Promise<ProductoExterno[]> {
  const out: ProductoExterno[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    const d: any = await meliGET(token, `/items?ids=${lote.join(",")}`);
    for (const r of d || []) {
      if (r?.code === 200 && r?.body) out.push(aProductoExterno(r.body));
    }
  }
  return out;
}

/** Categoría sugerida para publicar (domain discovery, sitio MCO). */
export async function sugerirCategoria(token: string, titulo: string): Promise<{ id: string; nombre: string } | null> {
  const d: any = await meliGET(token, `/sites/MCO/domain_discovery/search?q=${encodeURIComponent(titulo)}&limit=1`);
  const c = d?.[0] || d?.results?.[0];
  if (!c?.category_id) return null;
  return { id: c.category_id, nombre: c.category_name || c.category_id };
}

/** Publica un producto interno en Mercado Libre (requiere categoría). */
export async function publicarItem(
  token: string,
  p: { titulo: string; precio: number; moneda?: string; categoriaId: string; imagenes: string[]; stock?: number; descripcion?: string },
): Promise<{ id: string; link: string }> {
  const r = await fetch(`${API}/items`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: p.titulo.slice(0, 60),
      category_id: p.categoriaId,
      price: Number(p.precio) || 0,
      currency_id: p.moneda || "COP",
      available_quantity: Math.max(1, Number(p.stock) || 1),
      buying_mode: "buy_it_now",
      listing_type_id: "gold_special",
      condition: "new",
      pictures: (p.imagenes || []).slice(0, 10).map((source) => ({ source })),
      ...(p.descripcion ? { description: { plain_text: p.descripcion.slice(0, 4000) } } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d?.id) throw new Error(`Mercado Libre publicar ${r.status}: ${JSON.stringify(d?.message || d?.cause || d).slice(0, 250)}`);
  return { id: d.id, link: d.permalink || "" };
}

function aPedidoExterno(o: any): PedidoExterno {
  const comprador: any = o.buyer || {};
  const envio: any = o.shipping?.receiver_address || {};
  const nombre = [comprador.first_name, comprador.last_name].filter(Boolean).join(" ") || null;
  const items = (o.order_items || []).map((l: any) => ({
    idExterno: String(l.item?.id || ""),
    sku: l.item?.seller_sku || null,
    nombre: l.item?.title || "Item",
    cantidad: Number(l.quantity) || 1,
    precio: Number(l.unit_price) || 0,
  }));
  return {
    idExterno: String(o.id),
    nombre,
    telefono: comprador.phone?.number ? `${comprador.phone.area_code || ""}${comprador.phone.number}` : null,
    departamento: envio.state?.name || null,
    ciudad: envio.city?.name || null,
    direccion: [envio.street_name, envio.street_number].filter(Boolean).join(" ") || null,
    barrio: envio.neighborhood?.name || null,
    notas: `Orden Mercado Libre #${o.id} · ${o.status || ""}`,
    items,
    pagado: ["paid", "approved"].includes(String(o.status || "")),
    metodoPago: o.payments?.[0]?.payment_type || "mercadolibre",
  };
}

/** Órdenes recientes del vendedor. */
export async function listarOrdenes(token: string, vendedorId: string, limite = 50): Promise<PedidoExterno[]> {
  const d: any = await meliGET(token, `/orders/search?seller=${vendedorId}&limit=${Math.min(limite, 50)}&sort=date_desc`);
  return ((d?.results || []) as any[]).map(aPedidoExterno);
}

/** Lee una orden por id (lo que trae la notificación orders_v2). */
export async function leerOrden(token: string, idOrden: string | number): Promise<PedidoExterno> {
  const d: any = await meliGET(token, `/orders/${idOrden}`);
  if (!d?.id) throw new Error(`Orden ${idOrden} no encontrada.`);
  return aPedidoExterno(d);
}

/** Extrae el id de orden de una notificación `orders_v2` ({resource: "/orders/123"}). */
export function idOrdenDeNotificacion(notif: any): string | null {
  const m = String(notif?.resource || "").match(/\/orders\/(\d+)/);
  return m ? m[1] : null;
}
