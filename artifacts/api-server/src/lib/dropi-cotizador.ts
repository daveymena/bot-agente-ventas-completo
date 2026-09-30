/**
 * Cotizador de flete POR TRANSPORTADORA — el mismo que usa el panel de Dropi.
 *
 * Pedido del dueño (30-09-2026): que la automatización deje elegir talla y
 * transportadora DISPONIBLE, sabiendo el precio. El token de integración no lo
 * trae: trajectory/bycity solo dice si la ciudad está cubierta (ver
 * transportadorasQueLlegan). El panel web cotiza así (leído de su código):
 *
 *   GET {api-v2}/logistic/freight-calculator/location/departments
 *   GET {api-v2}/logistic/freight-calculator/location/departments/{id}/cities?rate_type=CON RECAUDO
 *   GET {api-v2}/logistic/freight-calculator/carrier/shipping-quote/{productoDropiId}
 *       ?variation_id&department_id&city_id&cod_dane&destination&product_type
 *        &shipping_type(bool con recaudo)&insurance&amount(precio venta)&quantity&weight
 *   → result[]: { conveyor, totalFreight, insuranceShipping, dropiComision,
 *                 amountToSupplier, amountearned, totalCollected, isSuccess }
 *
 * Autenticación: `X-Authorization: Bearer <token>` + `X-Country-Code`. El panel
 * usa el token de SESIÓN. Se prueba primero el de integración del negocio (por
 * si Dropi lo acepta) y, solo para el dueño del servidor, el de sesión del
 * .env (DROPI_TOKEN). El flete es para elegir y calcular margen: al cliente
 * NO se le muestra (regla del dueño, 25-09-2026).
 */
import { logger } from "./logger";

const BASE = (process.env.DROPI_BFF_URL || "https://api-v2.dropi.co").replace(/\/+$/, "") + "/logistic/freight-calculator/";

export interface CotizacionTransportadora {
  transportadora: string;
  disponible: boolean;
  flete: number | null;
  seguro: number | null;
  comisionDropi: number | null;
  alProveedor: number | null;
  ganancia: number | null;
  totalCobrado: number | null;
}

export interface ResultadoCotizacion {
  ok: boolean;
  error?: string;
  ciudad?: { nombre: string; departamento: string; aceptaContraentrega: boolean | null };
  transportadoras?: CotizacionTransportadora[];
  autenticacion?: "integracion" | "sesion";
}

const norm = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

async function pedir(ruta: string, token: string, params?: Record<string, string>): Promise<{ ok: boolean; status: number; json: any }> {
  const url = BASE + ruta + (params ? `?${new URLSearchParams(params)}` : "");
  try {
    const r = await fetch(url, { headers: { "X-Authorization": `Bearer ${token}`, "X-Country-Code": "co", Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    let json: any = null;
    try { json = JSON.parse(t); } catch { json = { raw: t.slice(0, 200) }; }
    return { ok: r.ok && json?.isSuccess !== false, status: r.status, json };
  } catch (e: any) {
    return { ok: false, status: 0, json: { message: e?.name === "TimeoutError" ? "Dropi no respondió" : String(e?.message || e) } };
  }
}

// Departamentos y ciudades cambian poco: caché de 12 h por token.
const cacheDeptos = new Map<string, { en: number; lista: Array<{ id: number; nombre: string }> }>();
const cacheCiudades = new Map<string, { en: number; lista: Array<{ id: number; nombre: string; dane: string; tarifas: string; depto: number }> }>();
const DOCE_HORAS = 12 * 3600_000;

async function departamentos(token: string) {
  const k = token.slice(-12);
  const c = cacheDeptos.get(k);
  if (c && Date.now() - c.en < DOCE_HORAS) return { ok: true as const, lista: c.lista };
  const r = await pedir("location/departments", token);
  if (!r.ok) return { ok: false as const, status: r.status, error: String(r.json?.message || r.json?.error || `HTTP ${r.status}`) };
  const lista = (Array.isArray(r.json?.result) ? r.json.result : []).map((d: any) => ({ id: Number(d.department_id ?? d.id), nombre: String(d.name || "") }));
  cacheDeptos.set(k, { en: Date.now(), lista });
  return { ok: true as const, lista };
}

async function ciudadesDe(token: string, deptoId: number, conRecaudo: boolean) {
  const k = `${token.slice(-12)}|${deptoId}|${conRecaudo}`;
  const c = cacheCiudades.get(k);
  if (c && Date.now() - c.en < DOCE_HORAS) return c.lista;
  const r = await pedir(`location/departments/${deptoId}/cities`, token, { rate_type: conRecaudo ? "CON RECAUDO" : "SIN RECAUDO" });
  const lista = r.ok && Array.isArray(r.json?.result)
    ? r.json.result.map((x: any) => ({ id: Number(x.id), nombre: String(x.name || ""), dane: String(x.cod_dane || ""), tarifas: String(x.rate_type || ""), depto: Number(x.department_id ?? deptoId) }))
    : [];
  if (r.ok) cacheCiudades.set(k, { en: Date.now(), lista });
  return lista;
}

/** Los tokens con los que se intenta, en orden. */
async function tokensParaCotizar(tenantId: number): Promise<Array<{ token: string; tipo: "integracion" | "sesion" }>> {
  const out: Array<{ token: string; tipo: "integracion" | "sesion" }> = [];
  try {
    const { tokenDropiDelTenant } = await import("./dropi-directo");
    const t = await tokenDropiDelTenant(tenantId);
    if (t) out.push({ token: t, tipo: "integracion" });
  } catch { /* sin token */ }
  // La sesión del .env es la cuenta del DUEÑO del servidor: solo para él.
  const { envSoloDelDueno } = await import("./respaldo-del-dueno");
  const sesion = envSoloDelDueno(tenantId, process.env.DROPI_TOKEN || process.env.DROPI_API_TOKEN).trim();
  if (sesion) out.push({ token: sesion, tipo: "sesion" });
  return out;
}

export async function cotizarEnvioDropi(
  tenantId: number,
  e: { dropiProductId: number; variationId?: number | null; esVariable?: boolean; ciudad: string; departamento?: string | null; conRecaudo?: boolean; precioVenta: number; cantidad?: number; pesoKg?: number | null },
): Promise<ResultadoCotizacion> {
  const conRecaudo = e.conRecaudo !== false;
  const tokens = await tokensParaCotizar(tenantId);
  if (!tokens.length) return { ok: false, error: "Sin token de Dropi para cotizar." };
  const errores: string[] = [];
  for (const { token, tipo } of tokens) {
    const deps = await departamentos(token);
    if (!deps.ok) { errores.push(`${tipo}: ${deps.error}`); continue; }
    // Ciudad: primero en el departamento dicho; si no se dijo o no está, en todos.
    const buscada = norm(e.ciudad);
    const candidatosDepto = e.departamento ? deps.lista.filter((d: { id: number; nombre: string }) => norm(d.nombre) === norm(e.departamento)) : [];
    const ordenDeptos = [...candidatosDepto, ...deps.lista.filter((d: { id: number; nombre: string }) => !candidatosDepto.includes(d))];
    let ciudad: { id: number; nombre: string; dane: string; tarifas: string; depto: number } | null = null;
    let depto: { id: number; nombre: string } | null = null;
    for (const d of ordenDeptos) {
      const cs = await ciudadesDe(token, d.id, conRecaudo);
      const hit = cs.find((x: { id: number; nombre: string }) => norm(x.nombre) === buscada);
      if (hit) { ciudad = hit; depto = d; break; }
    }
    if (!ciudad || !depto) return { ok: false, error: `Dropi no tiene a ${e.ciudad} en su cobertura${conRecaudo ? " con contraentrega" : ""}.`, autenticacion: tipo };
    const params: Record<string, string> = {
      variation_id: e.variationId ? String(e.variationId) : "",
      department_id: String(depto.id),
      city_id: String(ciudad.id),
      cod_dane: ciudad.dane,
      destination: `${depto.nombre}, ${ciudad.nombre}`.toLowerCase(),
      product_type: e.esVariable || e.variationId ? "VARIABLE" : "SIMPLE",
      shipping_type: String(conRecaudo),
      insurance: "0",
      amount: String(Math.round(e.precioVenta)),
      quantity: String(Math.max(1, e.cantidad || 1)),
      weight: String(e.pesoKg && e.pesoKg > 0 ? e.pesoKg : 1),
    };
    const q = await pedir(`carrier/shipping-quote/${e.dropiProductId}`, token, params);
    if (!q.ok) { errores.push(`${tipo}: ${String(q.json?.message || q.json?.error || `HTTP ${q.status}`).slice(0, 160)}`); continue; }
    const lista: CotizacionTransportadora[] = (Array.isArray(q.json?.result) ? q.json.result : []).map((t: any) => ({
      transportadora: String(t.conveyor || t.name || "").trim(),
      disponible: t.isSuccess !== false,
      flete: num(t.totalFreight),
      seguro: num(t.insuranceShipping),
      comisionDropi: num(t.dropiComision),
      alProveedor: num(t.amountToSupplier),
      ganancia: num(t.amountearned),
      totalCobrado: num(t.totalCollected),
    })).filter((t: CotizacionTransportadora) => t.transportadora);
    lista.sort((a, b) => (a.disponible === b.disponible ? (a.flete ?? 9e9) - (b.flete ?? 9e9) : a.disponible ? -1 : 1));
    logger.info({ tenantId, tipo, ciudad: ciudad.nombre, n: lista.length }, "[DropiCotizador] cotización lista");
    return {
      ok: true,
      autenticacion: tipo,
      ciudad: { nombre: ciudad.nombre, departamento: depto.nombre, aceptaContraentrega: ciudad.tarifas ? /CON RECAUDO/i.test(ciudad.tarifas) : null },
      transportadoras: lista,
    };
  }
  return { ok: false, error: `Dropi no cotizó: ${errores.join(" · ") || "sin respuesta"}` };
}

// ─── Para el catálogo del negocio y para el despacho ───────────────────────

const cacheGenerales = new Map<string, { en: number; lista: Array<{ id: number; nombre: string }> }>();

/** La lista oficial de transportadoras de Dropi (id + nombre), para mandar `distributionCompany`. */
async function transportadorasGenerales(token: string): Promise<Array<{ id: number; nombre: string }>> {
  const k = token.slice(-12);
  const c = cacheGenerales.get(k);
  if (c && Date.now() - c.en < DOCE_HORAS) return c.lista;
  const { dropiIntegracion } = await import("./dropi-directo");
  const r = await dropiIntegracion<any>(token, "distribution_companies", undefined, "GET", 20000);
  const crudo = Array.isArray(r.data) ? r.data : (r.data?.objects || r.data?.data || []);
  const lista = (Array.isArray(crudo) ? crudo : [])
    .map((x: any) => ({ id: Number(x?.id), nombre: String(x?.name || x?.nombre || "").trim() }))
    .filter((x: { id: number; nombre: string }) => x.id && x.nombre);
  if (lista.length) cacheGenerales.set(k, { en: Date.now(), lista });
  return lista;
}

/**
 * Cotiza un producto DEL CATÁLOGO del negocio (usa su dropiProductId, su
 * precio y la variante elegida) hacia la ciudad del cliente.
 */
export async function cotizarProductoDelCatalogo(
  tenantId: number,
  productId: number,
  destino: { ciudad: string; departamento?: string | null; cantidad?: number; precioUnitario?: number | null; variationId?: number | null; conRecaudo?: boolean },
): Promise<ResultadoCotizacion & { producto?: string }> {
  const { db, products } = await import("@workspace/db");
  const { and, eq } = await import("drizzle-orm");
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
  if (!p) return { ok: false, error: "Producto no encontrado en este negocio." };
  let m: any = {};
  try { m = typeof (p as any).metadata === "string" ? JSON.parse((p as any).metadata) : ((p as any).metadata || {}); } catch { /* sin metadata */ }
  const dropiProductId = Number(m?.dropiProductId);
  if (!dropiProductId) return { ok: false, error: `"${p.name}" no está vinculado a Dropi.` };
  const cantidad = Math.max(1, destino.cantidad || 1);
  const precioUnitario = Number(destino.precioUnitario) || Number(p.price) || 0;
  const r = await cotizarEnvioDropi(tenantId, {
    dropiProductId,
    variationId: destino.variationId ?? null,
    esVariable: Array.isArray(m?.dropiVariations) && m.dropiVariations.length > 0,
    ciudad: destino.ciudad,
    departamento: destino.departamento || null,
    conRecaudo: destino.conRecaudo,
    precioVenta: precioUnitario * cantidad,
    cantidad,
    pesoKg: Number(m?.pesoKg) || null,
  });
  return { ...r, producto: String(p.name) };
}

/**
 * La transportadora DISPONIBLE más económica, con su id de Dropi. La usa el
 * despacho cuando el cliente no eligió (regla del dueño: económicas primero).
 * null si no se pudo cotizar: el pedido sale igual y Dropi asigna.
 */
export async function transportadoraMasEconomica(
  tenantId: number,
  productId: number,
  destino: { ciudad: string; departamento?: string | null; cantidad?: number; precioUnitario?: number | null; variationId?: number | null; conRecaudo?: boolean },
): Promise<{ id: number; nombre: string; flete: number | null } | null> {
  const r = await cotizarProductoDelCatalogo(tenantId, productId, destino);
  if (!r.ok) return null;
  const mejor = (r.transportadoras || []).find((t) => t.disponible);
  if (!mejor) return null;
  const { tokenDropiDelTenant } = await import("./dropi-directo");
  const token = await tokenDropiDelTenant(tenantId);
  if (!token) return null;
  const generales = await transportadorasGenerales(token);
  const hit = generales.find((g) => norm(g.nombre) === norm(mejor.transportadora));
  return hit ? { id: hit.id, nombre: hit.nombre, flete: mejor.flete } : null;
}

/**
 * El id de Dropi de una transportadora a partir del nombre que eligió el
 * cliente (landing, WhatsApp). null si Dropi no la lista: el pedido sale igual.
 */
export async function transportadoraConId(tenantId: number, nombre: string): Promise<{ id: number; nombre: string } | null> {
  const { tokenDropiDelTenant } = await import("./dropi-directo");
  const token = await tokenDropiDelTenant(tenantId);
  if (!token || !String(nombre || "").trim()) return null;
  const hit = (await transportadorasGenerales(token)).find((g) => norm(g.nombre) === norm(nombre));
  return hit ? { id: hit.id, nombre: hit.nombre } : null;
}
