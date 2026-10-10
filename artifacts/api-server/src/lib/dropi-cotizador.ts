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
  /** id de Dropi (distributionCompany); lo trae la cotización por integración. */
  id?: number | null;
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
  /** Detalle por transportadora que no cotizó (sin tarifa, sin cobertura...). */
  motivos?: Array<{ transportadora: string; motivo: string }>;
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
    if (!r.ok && json && !json.message && !json.error) json.message = `HTTP ${r.status}: ${t.slice(0, 160)}`;
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

// ─── Cotización por la API de INTEGRACIONES (token de cada negocio) ────────
//
// Verificado en vivo el 30-09-2026 con el token de integración desde el VPS:
//   POST /integrations/trajectory/bycity  → { cities: [{ name, department_id, cod_dane, rate_type }] }
//   GET  /integrations/department         → [{ id, name }]
//   POST /integrations/orders/cotizaEnvioTransportadoraV2
//        { EnvioConCobro, amount, ciudad_destino: { nombre, departamento, cod_dane },
//          products: [{ id, quantity, price, type, variation_id? }] }
//     → [{ transportadora, transportadora_id, objects: { precioEnvio, seguroEnvio, trayecto }, error? }]
// El de api-v2 (abajo) respondía 400 a los dos tokens; este no depende de la
// sesión del dueño, así que sirve para CUALQUIER negocio con su token.

const cacheCiudadesInt = new Map<string, { en: number; lista: Array<{ nombre: string; depto: number; dane: string; tarifas: string }> }>();
const cacheDeptosInt = new Map<string, { en: number; lista: Array<{ id: number; nombre: string }> }>();

/** Solo para tests: las cachés de 12 h contaminarían un test con otro. */
export function vaciarCacheCotizador(): void {
  cacheCiudadesInt.clear();
  cacheDeptosInt.clear();
}

async function ciudadesPorIntegracion(token: string, ciudad: string, departamento: string): Promise<Array<{ nombre: string; depto: number; dane: string; tarifas: string }>> {
  const k = token.slice(-12);
  const c = cacheCiudadesInt.get(k);
  if (c && Date.now() - c.en < DOCE_HORAS) return c.lista;
  const { dropiIntegracion } = await import("./dropi-directo");
  const r = await dropiIntegracion<any>(token, "trajectory/bycity", { city: ciudad, department: departamento, rate_type: "CON RECAUDO" }, "POST", 25000);
  const crudas = Array.isArray(r.data?.cities) ? r.data.cities : Array.isArray(r.data) ? r.data : [];
  const lista = crudas.map((x: any) => ({ nombre: String(x.name || ""), depto: Number(x.department_id), dane: String(x.cod_dane || ""), tarifas: String(x.rate_type || "") })).filter((x: { dane: string }) => x.dane);
  // Hoy Dropi ignora el filtro y devuelve todas (1.475): solo esa lista completa se guarda.
  if (lista.length > 100) cacheCiudadesInt.set(k, { en: Date.now(), lista });
  return lista;
}

async function departamentosPorIntegracion(token: string) {
  const k = token.slice(-12);
  const c = cacheDeptosInt.get(k);
  if (c && Date.now() - c.en < DOCE_HORAS) return c.lista;
  const { dropiIntegracion } = await import("./dropi-directo");
  const r = await dropiIntegracion<any>(token, "department", undefined, "GET", 15000);
  const lista = (Array.isArray(r.data) ? r.data : []).map((d: any) => ({ id: Number(d.id), nombre: String(d.name || "") }));
  if (lista.length) cacheDeptosInt.set(k, { en: Date.now(), lista });
  return lista;
}

async function cotizarPorIntegracion(
  token: string,
  e: { dropiProductId: number; variationId?: number | null; esVariable?: boolean; ciudad: string; departamento?: string | null; conRecaudo?: boolean; precioVenta: number; cantidad?: number; costoUnitario?: number | null },
): Promise<ResultadoCotizacion> {
  const conRecaudo = e.conRecaudo !== false;
  const cantidad = Math.max(1, e.cantidad || 1);
  const ciudades = await ciudadesPorIntegracion(token, e.ciudad, String(e.departamento || ""));
  if (!ciudades.length) return { ok: false, error: "Dropi no devolvió la lista de ciudades." };
  const deptos = await departamentosPorIntegracion(token);
  const nombreDepto = (id: number) => deptos.find((d) => d.id === id)?.nombre || "";
  const candidatas = ciudades.filter((c) => norm(c.nombre) === norm(e.ciudad));
  const enDepto = e.departamento ? candidatas.filter((c) => norm(nombreDepto(c.depto)) === norm(e.departamento)) : [];
  if (!candidatas.length) return { ok: false, error: `Dropi no tiene a ${e.ciudad} en su cobertura.` };
  // 10-10-2026, caso Armenia: si se pidió un departamento y ningún homónimo
  // es de ahí, NO se cotiza en silencio otra ciudad (era cotizar Antioquia
  // creyendo que era Quindío). Se devuelve el error con dónde sí la tiene.
  if (e.departamento && !enDepto.length) {
    const donde = [...new Set(candidatas.map((c) => nombreDepto(c.depto)).filter(Boolean))];
    if (donde.length) {
      return { ok: false, error: `Dropi no lista ${e.ciudad} en la cobertura de ${e.departamento} (la tiene en: ${donde.join(", ")}). Verifica ciudad y departamento.` };
    }
    logger.warn({ ciudad: e.ciudad, departamento: e.departamento }, "[DropiCotizador] sin departamentos para desempatar; se usa el primer homónimo");
  }
  const ciudad = enDepto[0] || candidatas[0];
  if (!ciudad) return { ok: false, error: `Dropi no tiene a ${e.ciudad} en su cobertura.` };
  const departamento = nombreDepto(ciudad.depto) || String(e.departamento || "");
  const aceptaContraentrega = ciudad.tarifas ? /CON RECAUDO/i.test(ciudad.tarifas) : null;
  const { dropiIntegracion } = await import("./dropi-directo");
  const producto: Record<string, any> = {
    id: e.dropiProductId, quantity: cantidad, price: Math.round(e.precioVenta / cantidad),
    type: e.esVariable || e.variationId ? "VARIABLE" : "SIMPLE",
  };
  if (e.variationId) producto.variation_id = e.variationId;
  const r = await dropiIntegracion<any>(token, "orders/cotizaEnvioTransportadoraV2", {
    EnvioConCobro: conRecaudo, amount: Math.round(e.precioVenta),
    ciudad_destino: { nombre: ciudad.nombre, departamento, cod_dane: ciudad.dane },
    products: [producto],
  }, "POST", 25000);
  if (!r.ok || !Array.isArray(r.data)) return { ok: false, error: String(r.error || "Dropi no cotizó").slice(0, 200) };
  const motivos: Array<{ transportadora: string; motivo: string }> = [];
  const costo = e.costoUnitario && e.costoUnitario > 0 ? e.costoUnitario * cantidad : null;
  const lista: CotizacionTransportadora[] = r.data.map((t: any) => {
    const nombre = String(t.transportadora || t.distributionCompany?.name || "").trim();
    const flete = num(t.objects?.precioEnvio);
    const error = t.error ? (typeof t.error === "string" ? t.error : JSON.stringify(t.error)) : "";
    if (error && nombre) motivos.push({ transportadora: nombre, motivo: error.slice(0, 160) });
    const disponible = !error && flete != null && flete > 0;
    return {
      id: num(t.transportadora_id ?? t.distributionCompany?.id),
      transportadora: nombre,
      disponible,
      flete: disponible ? flete : null,
      seguro: num(t.objects?.seguroEnvio),
      comisionDropi: null,
      alProveedor: costo,
      // Lo que queda: precio cobrado − costo del proveedor − flete. Sin costo
      // conocido no se inventa una ganancia.
      ganancia: disponible && costo != null ? Math.round(e.precioVenta - costo - (flete || 0)) : null,
      totalCobrado: Math.round(e.precioVenta),
    };
  }).filter((t: CotizacionTransportadora) => t.transportadora);
  lista.sort((a, b) => (a.disponible === b.disponible ? (a.flete ?? 9e9) - (b.flete ?? 9e9) : a.disponible ? -1 : 1));
  return { ok: true, autenticacion: "integracion", ciudad: { nombre: ciudad.nombre, departamento, aceptaContraentrega }, transportadoras: lista, motivos };
}

export async function cotizarEnvioDropi(
  tenantId: number,
  e: { dropiProductId: number; variationId?: number | null; esVariable?: boolean; ciudad: string; departamento?: string | null; conRecaudo?: boolean; precioVenta: number; cantidad?: number; pesoKg?: number | null; costoUnitario?: number | null },
): Promise<ResultadoCotizacion> {
  const conRecaudo = e.conRecaudo !== false;
  const tokens = await tokensParaCotizar(tenantId);
  if (!tokens.length) return { ok: false, error: "Sin token de Dropi para cotizar." };
  const errores: string[] = [];
  // 1) API de integraciones con el token del negocio (la que funciona).
  const deIntegracion = tokens.find((t) => t.tipo === "integracion");
  if (deIntegracion) {
    try {
      const r = await cotizarPorIntegracion(deIntegracion.token, e);
      if (r.ok) {
        logger.info({ tenantId, ciudad: r.ciudad?.nombre, n: r.transportadoras?.length }, "[DropiCotizador] cotización por integración");
        return r;
      }
      // Una ciudad fuera de cobertura es una respuesta, no un fallo de acceso.
      if (/cobertura/i.test(String(r.error))) return r;
      errores.push(`integración: ${r.error}`);
    } catch (err: any) {
      errores.push(`integración: ${String(err?.message || err).slice(0, 120)}`);
    }
  }
  // 2) Respaldo: la calculadora del panel (api-v2).
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
    esVariable: String(m?.dropiType || "").toUpperCase() === "VARIABLE" || (Array.isArray(m?.dropiVariations) && m.dropiVariations.length > 0),
    ciudad: destino.ciudad,
    departamento: destino.departamento || null,
    conRecaudo: destino.conRecaudo,
    precioVenta: precioUnitario * cantidad,
    cantidad,
    pesoKg: Number(m?.pesoKg) || null,
    costoUnitario: Number(m?.dropiCost) || null,
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
  if (mejor.id) return { id: mejor.id, nombre: mejor.transportadora, flete: mejor.flete };
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

/**
 * Departamentos con TODAS sus ciudades, como las conoce Dropi (1.475 en
 * Colombia). Para los selectores del formulario: el cliente elige de la lista
 * y el nombre coincide exacto con el que Dropi valida al despachar.
 * null si el negocio no tiene token de Dropi o Dropi no respondió.
 */
export async function geografiaDeDropi(tenantId: number): Promise<Array<{ nombre: string; ciudades: string[] }> | null> {
  const { tokenDropiDelTenant } = await import("./dropi-directo");
  const token = await tokenDropiDelTenant(tenantId).catch(() => null);
  if (!token) return null;
  const [ciudades, deptos] = await Promise.all([ciudadesPorIntegracion(token, "MEDELLIN", "ANTIOQUIA"), departamentosPorIntegracion(token)]);
  // Si un día Dropi respeta el filtro y devuelve pocas, no sirve como lista completa.
  if (ciudades.length < 100 || !deptos.length) return null;
  return deptos
    .map((d) => ({
      nombre: d.nombre,
      ciudades: [...new Set(ciudades.filter((c) => c.depto === d.id).map((c) => c.nombre))].sort((a, b) => a.localeCompare(b, "es")),
    }))
    .filter((d) => d.ciudades.length)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
