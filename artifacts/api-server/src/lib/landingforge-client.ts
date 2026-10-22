/**
 * Cliente API para LandingForge (generador propio en landing-forge).
 *
 * Habla con NUESTRO sistema vía x-api-key (ver LANDING_API_KEY):
 *   POST /api/generate  — genera landing (prompt o URL de producto)
 *   GET  /api/sites     — lista landings
 *   GET  /api/export/:id — HTML público para enviar al cliente
 *
 * Mantiene las firmas que usan whatsapp.ts y landing-pages-ai.ts
 * (getOrCreateLanding, generateMagicLanding, listLandings, MagicLandingResult).
 */
import { createHmac } from "node:crypto";

// El default de producción es el dominio real de Forge. El commit f553534 lo
// había revertido a localhost: si la variable faltaba en el deploy, TODAS las
// llamadas a Forge apuntaban a la máquina local. Restaurado el 2026-10-14.
const BASE = (process.env.LANDINGFORGE_URL || "https://landings.ventasproia.com").replace(/\/+$/, "");
const API_KEY = process.env.LANDINGFORGE_API_KEY || process.env.LANDING_API_KEY || "";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { "x-api-key": API_KEY } : {}),
    ...extra,
  };
}

async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: headers(opts.headers as any) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LandingForge ${opts.method || "GET"} ${path}: ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Lo único que la landing puede prometer (Forge: lib/ai/hechos.ts). */
export interface HechosLanding {
  marca?: string;
  cobertura?: string;
  entrega?: { metodo?: string; plazo?: string; detalle?: string } | null;
  garantia?: { dias?: number; descripcion?: string } | null;
  envioGratis?: boolean | null;
  pago?: string;
  trato?: "tu" | "usted";
  whatsapp?: string;
}

function diasDeGarantia(t: string): number | undefined {
  const d = /(\d{1,3})\s*d[ií]as?/i.exec(t);
  if (d) return Number(d[1]);
  const m = /(\d{1,2})\s*mes(es)?/i.exec(t);
  return m ? Number(m[1]) * 30 : undefined;
}

/**
 * Variante de `api` con tope de tiempo por operación.
 *
 * Sin tope, una generación de Forge colgada dejaba a Atlas esperando para
 * siempre (06-10: "se quedó 6 minutos y nunca resolvió"). Generar (IA + fotos
 * + revisión) tarda 1 a 4 min; editar ~40 s; el resto es lectura.
 *
 * La borró f553534 junto con las diez funciones que la usan. Restaurada el
 * 2026-10-14.
 */
async function lf<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (API_KEY) h["x-api-key"] = API_KEY;
  const tope = path.includes("/generate") ? 300_000 : path.includes("/ai/") ? 180_000 : 30_000;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...opts, headers: h, signal: opts.signal ?? AbortSignal.timeout(tope) });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error(`LandingForge no respondio en ${Math.round(tope / 1000)} s (${path})`);
    }
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LandingForge ${opts.method || "GET"} ${path}: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Las siguientes funciones las borró f553534 junto con el helper `lf` y
 * el tipo `HechosLanding`: el commit reemplazó el archivo por una copia
 * estancada. Diez quedaron ausentes con consumidores vivos (`facebook.ts`,
 * `app-operator.ts`, `competencia-a-dropi.ts`) y cinco tests en rojo.
 * Restauradas desde 321a96f el 2026-10-14.
 */

/**
 * Hechos del negocio para la landing, de la MISMA fuente que usa el vendedor
 * de WhatsApp (getBusinessContext + condiciones). Antes Forge recibía solo
 * nombre/precio/fotos y el LLM completaba marca, envío y garantía de memoria
 * ("Tu Marca", la marca de otra tienda, "garantía de 30 días" inventada).
 */
export async function hechosParaLanding(tenantId: number | null | undefined, producto?: any): Promise<HechosLanding> {
  const { getBusinessContext, normalizarMetadata } = await import("./business-context");
  const ctx = await getBusinessContext(tenantId ?? null);
  const fisico = (producto?.kind ?? "physical") !== "digital";
  const c = ctx.condiciones;
  const meta = normalizarMetadata(producto?.metadata);
  const gProd = typeof meta?.garantia === "string" && meta.garantia.trim() ? meta.garantia.trim() : "";
  const garantia = gProd
    ? { dias: diasDeGarantia(gProd), descripcion: gProd.slice(0, 300) }
    : ctx.garantia
      ? { dias: ctx.garantia.dias || undefined, descripcion: ctx.garantia.descripcion || undefined }
      : null;
  let whatsapp: string | undefined;
  try {
    const { db, tenants } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [t] = tenantId ? await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1) : [];
    const tel = String((t as any)?.contactPhone || "").replace(/\D/g, "");
    if (tel.length >= 10) whatsapp = tel;
  } catch { /* sin teléfono propio: el de la plataforma */ }
  return {
    marca: ctx.businessName || undefined,
    // La cobertura solo si el negocio la dijo: el país solo no prueba que se
    // envíe a todo el país.
    cobertura: fisico ? (c.envio.cobertura ? [c.envio.cobertura, c.pais && /^co$/i.test(c.pais) ? "Colombia" : c.pais].filter(Boolean).join(", ") : undefined) : ctx.cobertura || undefined,
    entrega: fisico
      ? { metodo: "envío a domicilio", plazo: c.envio.plazo || undefined }
      : ctx.entrega ? { metodo: ctx.entrega.metodo, plazo: ctx.entrega.plazo, detalle: ctx.entrega.detalle } : null,
    garantia,
    // "incluido" = el flete va en el precio: para el cliente, envío gratis.
    envioGratis: fisico ? c.envio.costo === "incluido" : null,
    pago: fisico
      ? c.envio.pago === "contraentrega" ? "pago contra entrega" : c.envio.pago === "anticipado" ? "pago anticipado" : "pago contra entrega o anticipado"
      : undefined,
    trato: /usted/i.test(ctx.tono || "") ? "usted" : "tu",
    whatsapp,
  };
}

export async function landingStatus(): Promise<any> {
  return lf("/api/landingforge/status");
}

function mapGenerate(d: any, fallbackName: string): MagicLandingResult {
  return {
    ok: !!d.ok,
    landingId: String(d.landingId || ""),
    url: String(d.url || ""),
    slug: String(d.slug || ""),
    productName: String(d.productName || fallbackName),
    sectionsGenerated: Number(d.sectionsGenerated ?? d.sections?.length ?? 0),
    sections: Array.isArray(d.sections) ? d.sections : [],
    editorUrl: d.editorUrl || undefined,
    exportUrl: d.exportUrl || undefined,
    error: d.error,
    analisis: d.analisis || undefined,
  };
}

/** IDs del forge para los proveedores del panel (los que no aparecen acá
 *  hacen que el forge use su propia configuración: nunca rompe la llamada). */
const FORGE_IDS: Record<string, string> = {
  opencode: "opencode",
  opencode_go: "opencode",
  groq: "groq",
  openrouter: "openrouter",
  google_ai_studio: "gemini",
  ollama_cloud: "ollama-cloud",
  github: "github-models",
  openai: "openai",
  anthropic: "anthropic",
};

/**
 * IA activa de Atlas traducida a los IDs que LandingForge entiende.
 *
 * El admin la elige con el botón «Usar para Atlas» (PUT /api/ai/active);
 * con esto la landing se genera con la MISMA IA que contesta el chat, en vez
 * de la que el forge tenga configurada por su lado. Devuelve undefined si no
 * hay nada elegible: la generación sigue funcionando con la del forge.
 */
export async function aiActivaParaForge(): Promise<{ providerId: string; model?: string } | undefined> {
  try {
    const { db, settings } = await import("@workspace/db");
    const { leerBusinessConfig } = await import("./ai-keys");
    const [row] = await db.select().from(settings).limit(1);
    const prov = (row as any)?.aiProvider as string | null | undefined;
    const forgeId = prov ? FORGE_IDS[prov] : undefined;
    if (!forgeId) return undefined;
    const model = prov
      ? leerBusinessConfig((row as any).businessConfig).aiProviders?.[prov]?.model || undefined
      : undefined;
    return model ? { providerId: forgeId, model } : { providerId: forgeId };
  } catch {
    return undefined;
  }
}

/** Trae el spec COMPLETO de una landing Forge (bloques, textos, imágenes). */
export async function getForgeSpec(landingId: string): Promise<{ ok: boolean; spec?: any; error?: string }> {
  try {
    const d = await lf<any>(`/api/sites/${encodeURIComponent(landingId)}`, { method: "GET" });
    if (!d?.spec) return { ok: false, error: "Forge no devolvió spec." };
    return { ok: true, spec: d.spec };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Pone el píxel de la cuenta publicitaria en ESA landing (no en todas: Forge
 * no separa negocios y un píxel global mezclaría los de distintos clientes).
 *
 * 08-10: la landing del corrector salió sin píxel; Meta no veía quién entraba
 * ni quién compraba, y la campaña de ventas terminó comprando clics.
 * Devuelve qué pasó, para decírselo al dueño.
 */
/** ¿Esta URL es una landing pública de Forge? Las de VentasPro también usan
 *  /l/:slug, así que se mira el HOST, no solo la ruta (revisión 08-10). */
export function esLandingDeForge(url: string): boolean {
  try {
    const u = new URL(String(url || ""));
    if (!/^\/l\/[^/]+/.test(u.pathname)) return false;
    // BASE puede ser la dirección INTERNA de EasyPanel; la pública es la que
    // va en los anuncios. Cualquiera de las dos cuenta como Forge.
    const hosts = new Set([new URL(BASE).host, "landings.ventasproia.com"]);
    if (process.env.LANDINGFORGE_PUBLIC_URL) hosts.add(new URL(process.env.LANDINGFORGE_PUBLIC_URL).host);
    return hosts.has(u.host);
  } catch {
    return false;
  }
}

export async function ponerPixelEnLanding(urlLanding: string, pixelId: string): Promise<{ ok: boolean; motivo: string }> {
  if (!esLandingDeForge(urlLanding)) return { ok: false, motivo: "no es una landing de Forge" };
  const slug = /\/l\/([^/?#]+)/.exec(String(urlLanding || ""))?.[1];
  if (!slug || !pixelId) return { ok: false, motivo: "no es una landing de Forge o no hay píxel" };
  try {
    const { landings } = await listLandings();
    const fila = (landings || []).find((x) => x.landing?.slug === slug);
    if (!fila) return { ok: false, motivo: `no encontré la landing ${slug} en Forge` };
    const actual = await getForgeSpec(fila.landing.id);
    if (!actual.ok || !actual.spec) return { ok: false, motivo: actual.error || "Forge no devolvió la landing" };
    const pixeles = actual.spec.settings?.pixels || {};
    if (pixeles.metaPixelId === pixelId) return { ok: true, motivo: "ya lo tenía" };
    const spec = { ...actual.spec, settings: { ...(actual.spec.settings || {}), pixels: { ...pixeles, metaPixelId: pixelId } } };
    const r = await putForgeSpec(fila.landing.id, spec);
    return r.ok ? { ok: true, motivo: "puesto" } : { ok: false, motivo: r.error || "no se pudo guardar" };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}

/** Guarda el spec editado (Forge rellena con fotos lo que quede vacío). */
export async function putForgeSpec(landingId: string, spec: any): Promise<{ ok: boolean; spec?: any; error?: string }> {
  try {
    const d = await lf<any>(`/api/sites/${encodeURIComponent(landingId)}`, {
      method: "PUT",
      body: JSON.stringify({ spec }),
    });
    return { ok: true, spec: d?.spec };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Aplica una instrucción del admin al spec de una landing con la IA del
 * forge (la MISMA que Atlas eligió, si se la pudimos traducir) y la guarda.
 * Guarda con save:false + PUT para que Forge corra fillSectionImages: sin
 * eso, un bloque nuevo quedaría sin foto y el prune lo borraría.
 */
export async function editForgeSpec(
  landingId: string,
  instruction: string,
): Promise<{ ok: boolean; spec?: any; ops?: string[]; reply?: string; error?: string }> {
  try {
    const get = await getForgeSpec(landingId);
    if (!get.ok) return { ok: false, error: get.error };
    const edit = await lf<any>("/api/ai/edit", {
      method: "POST",
      body: JSON.stringify({
        spec: get.spec,
        instruction,
        save: false,
        aiProvider: (await aiActivaParaForge()) || undefined,
      }),
    });
    const spec = edit?.spec || get.spec;
    const put = await putForgeSpec(landingId, spec);
    if (!put.ok) return { ok: false, error: put.error };
    return {
      ok: true,
      spec: put.spec || spec,
      ops: Array.isArray(edit?.ops) ? edit.ops.map((o: any) => String(o?.op || o?.path || "?")).slice(0, 20) : [],
      reply: edit?.reply,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Resumen legible del spec para que Atlas sepa QUÉ hay y QUÉ falta. */
export function resumirSpec(spec: any): {
  producto: string;
  precio: string;
  fotosProducto: string[];
  bloques: Array<{ i: number; tipo: string; titulo: string; fotos: string[]; items?: Array<{ i: number; nombre: string; foto: string }> }>;
} {
  const bloques: Array<{ i: number; tipo: string; titulo: string; fotos: string[]; items?: Array<{ i: number; nombre: string; foto: string }> }> = [];
  const fotosProducto: string[] = [];
  const verFoto = (u: unknown): string => (typeof u === "string" && /^https?:/.test(u) ? u : "");
  const fotoCorta = (u: string): string => (u.length > 80 ? u.slice(0, 77) + "..." : u);
  const blocks: any[] = Array.isArray(spec?.blocks) ? spec.blocks : [];
  blocks.forEach((b: any, i: number) => {
    if (!b) return;
    const p = b.props || {};
    const fotos = [p.image, p.poster, ...(Array.isArray(p.images) ? p.images : [])]
      .map(verFoto)
      .filter(Boolean) as string[];
    const items = Array.isArray(p.items)
      ? p.items.map((it: any, j: number) => ({
        i: j,
        nombre: String(it?.name || it?.title || "").slice(0, 40),
        foto: verFoto(it?.avatar || it?.image),
      }))
      : undefined;
    if (b.type === "hero" || b.type === "gallery") fotos.forEach((f) => { if (!fotosProducto.includes(f)) fotosProducto.push(f); });
    bloques.push({
      i,
      tipo: String(b.type || "?"),
      titulo: String(p.title || p.heading || "").slice(0, 60),
      fotos: fotos.map(fotoCorta),
      items,
    });
  });
  const product = spec?.product || {};
  return {
    producto: String(product.name || spec?.title || ""),
    precio: String(product.price || spec?.product?.price || ""),
    fotosProducto,
    bloques,
  };
}

/** Ficha de cualquier tienda (Shopify, Woo, AliExpress…) con el extractor de
 *  Forge. `navegador` abre Chromium real para páginas que cargan por JS. */
export async function extraerFichaForge(url: string, navegador = false): Promise<{ ok: boolean; product?: any; confidence?: number; warnings?: string[]; error?: string }> {
  try {
    const d = await lf<any>("/api/extract", { method: "POST", body: JSON.stringify({ url, ...(navegador ? { mode: "browser" } : {}) }) });
    if (!d?.ok || !d.product) return { ok: false, error: d?.error || "Forge no pudo leer la página" };
    return { ok: true, product: d.product, confidence: d.confidence, warnings: d.warnings || [] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Enlace de entrada SSO a Landing Forge (dueño de la plataforma).
 * Formato que verifica Forge (src/lib/auth.ts): sso.<exp>.<hex64> con
 * HMAC-SHA256("sso.<exp>") y la LANDINGFORGE_API_KEY compartida, válido
 * 2 minutos. Sin clave (Forge en modo abierto) devuelve solo la URL base.
 * Se perdió en la reescritura del cliente (Arena 12-10) y rompía el build:
 * lo usan routes/landing-forge-entrada.ts y __tests__/forge-entrada-sso.test.ts.
 */
export function enlaceDeEntradaForge(siguiente = "/"): string {
  const base = (process.env.LANDINGFORGE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const clave = process.env.LANDINGFORGE_API_KEY || process.env.LANDING_API_KEY || "";
  if (clave.length < 16) return `${base}/`;
  const exp = Math.floor(Date.now() / 1000) + 120;
  const firma = createHmac("sha256", clave).update(`sso.${exp}`).digest("hex");
  return `${base}/api/auth/sso?next=${encodeURIComponent(siguiente)}&t=${encodeURIComponent(`sso.${exp}.${firma}`)}`;
}

/* ──────────────────────── tipos (compat) ──────────────────────── */

export interface LFProduct {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  currency: string;
  kind: "physical" | "digital";
  description?: string;
  category?: string;
  checkoutUrl?: string;
}

export interface LFBrief {
  id: string;
  data: Record<string, any>;
  generatedBy: string;
}

export interface LFLanding {
  id: string;
  slug: string;
  status: "draft" | "published";
  title?: string;
  productId: string;
}

export interface MagicLandingResult {
  ok: boolean;
  landingId: string;
  url: string;
  slug: string;
  productName: string;
  sectionsGenerated: number;
  /** Secciones que devolvió Forge (las usa `mapGenerate`). */
  sections?: any[];
  editorUrl?: string;
  exportUrl?: string;
  analisis?: any;
  error?: string;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "producto";

const publicUrl = (id: string) => `${BASE}/api/export/${id}`;

/* ──────────────────────── landings (nuestro API) ──────────────────────── */

/** Listar landings existentes. */
export async function listLandings(): Promise<{ landings: Array<{ landing: LFLanding; productName: string }> }> {
  const data = await api<{ sites: Array<{ id: string; name: string; slug: string }> }>("/api/sites");
  return {
    landings: (data.sites || []).map((s) => ({
      landing: { id: s.id, slug: s.slug, status: "published" as const, title: s.name, productId: "" },
      productName: s.name,
    })),
  };
}

/** Importar producto desde URL (usa nuestro extractor: nombre, precio, fotos, videos). */
export async function importProduct(url: string): Promise<{ product: LFProduct; images: number }> {
  const data = await api<{ product: any }>("/api/extract", {
    method: "POST",
    body: JSON.stringify({ url, mode: "browser" }),
  });
  const p = data.product || {};
  return {
    product: {
      id: slugify(p.name || "producto"),
      name: p.name || "Producto",
      slug: slugify(p.name || "producto"),
      priceCents: Math.round(Number(p.price || 0) * 100),
      currency: p.currency || "COP",
      kind: "physical",
      description: p.description,
    },
    images: (p.images || []).length,
  };
}

/** Crear producto manual (nuestro sistema no guarda productos: devuelve objeto local). */
export async function createProduct(data: {
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  kind: "physical" | "digital";
  category?: string;
  checkoutUrl?: string;
}): Promise<{ product: LFProduct; images: number }> {
  const price = Number(String(data.price || "").replace(/[^\d]/g, "")) || 0;
  return {
    product: {
      id: slugify(data.name),
      name: data.name,
      slug: slugify(data.name),
      priceCents: price * 100,
      currency: data.currency || "COP",
      kind: data.kind,
      description: data.description,
      category: data.category,
      checkoutUrl: data.checkoutUrl,
    },
    images: 0,
  };
}

/** Brief: nuestro /api/generate ya lo hace internamente; stub compatible. */
export async function generateBrief(_productId: string): Promise<{ brief: LFBrief }> {
  return { brief: { id: `brief-${Date.now()}`, data: {}, generatedBy: "landing-forge" } };
}

/** Crear + generar landing en una llamada (nuestro sistema es síncrono). */
export async function createLanding(opts: {
  productId: string;
  skeletonKey: string;
  briefId?: string;
  title?: string;
  prompt?: string;
  productUrl?: string;
}): Promise<{ landing: LFLanding }> {
  const prompt =
    opts.prompt ||
    `Landing para vender ${opts.title || "este producto"}` +
      (opts.productUrl ? ` (ficha: ${opts.productUrl})` : "");
  const body: any = { prompt, pro: true };
  if (opts.productUrl) body.url = opts.productUrl;
  const data = await api<{ spec: any }>("/api/generate", { method: "POST", body: JSON.stringify(body) });
  const spec = data.spec;
  return { landing: { id: spec.id, slug: spec.slug, status: "published", title: spec.name, productId: opts.productId } };
}

/** Sin jobs en nuestro sistema: devuelve hecho. */
export async function generateLandingSections(
  landingId: string,
): Promise<{ jobId: string }> {
  return { jobId: `done-${landingId}` };
}

/** Sin jobs: siempre done. */
export async function getJobStatus(_jobId: string): Promise<{
  status: "running" | "done" | "error";
  progress: number;
  total: number;
  error?: string;
}> {
  return { status: "done", progress: 1, total: 1 };
}

/** Nuestras landings quedan publicadas al generarse: devuelve URL del HTML. */
export async function publishLanding(
  landingId: string,
  slug?: string,
): Promise<{ landing: LFLanding; url: string }> {
  const data = await api<{ spec: any }>(`/api/sites/${landingId}`);
  const spec = data.spec;
  return {
    landing: { id: spec.id, slug: slug || spec.slug, status: "published", title: spec.name, productId: "" },
    url: publicUrl(spec.id),
  };
}

/** Productos: nuestro sistema no los guarda; lista vacía compatible. */
export async function listProducts(): Promise<{ products: LFProduct[] }> {
  return { products: [] };
}

/** Traer catálogo Dropi a través de NUESTRO generador (usa su token Dropi). */
export async function listDropiProducts(q = "", limit = 24): Promise<{ products: any[]; error?: string }> {
  const r = await api<{ products: any[]; error?: string }>(
    `/api/dropi/products?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  return r;
}

/** Probar conexión Dropi del generador. */
export async function testDropi(): Promise<any> {
  return api("/api/dropi/test", { method: "POST", body: JSON.stringify({}) });
}

/* ──────────────────────── high-level ──────────────────────── */

/**
 * Genera landing para una URL de producto usando NUESTRO generador.
 * Flujo: extraer (navegador) → generar pro → URL pública del HTML.
 */
export async function generateMagicLanding(
  productUrl: string,
  opts?: { title?: string; size?: "section" | "square" | "story" | "wide" },
): Promise<MagicLandingResult> {
  try {
    const data = await api<{ spec: any; engine: string; warnings: string[] }>("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt: `Landing para vender ${opts?.title || "este producto"} (ficha: ${productUrl})`,
        url: productUrl,
        pro: true,
      }),
    });
    const spec = data.spec;
    console.log(`[LandingForge] Landing generada: ${spec.id} (engine=${data.engine})`);
    return {
      ok: true,
      landingId: spec.id,
      url: publicUrl(spec.id),
      slug: spec.slug,
      productName: spec.product?.name || spec.name,
      sectionsGenerated: spec.blocks?.length || 0,
    };
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[LandingForge] Error: ${msg}`);
    return { ok: false, landingId: "", url: "", slug: "", productName: "", sectionsGenerated: 0, error: msg };
  }
}

/**
 * Genera landing bajo demanda para un producto del catálogo local.
 * Si ya existe una landing con el mismo nombre, la reutiliza.
 */
export async function getOrCreateLanding(
  productName: string,
  productUrl: string,
  productKind: "physical" | "digital",
  productData?: {
    description?: string; price?: string; currency?: string; category?: string;
    checkoutUrl?: string; images?: string[]; dropiProductId?: string;
  },
): Promise<MagicLandingResult> {
  try {
    const { landings } = await listLandings();
    const existing = landings.find((l) => l.productName.toLowerCase() === productName.toLowerCase());
    if (existing) {
      return {
        ok: true,
        landingId: existing.landing.id,
        url: publicUrl(existing.landing.id),
        slug: existing.landing.slug,
        productName,
        sectionsGenerated: 0,
      };
    }
  } catch {
    // Si falla la list, simplemente crear nueva
  }

  try {
    const priceNum = Number(String(productData?.price || "").replace(/[^\d]/g, "")) || 0;
    const images = productData?.images || [];
    // source = datos duros: la IA escribe el copy pero NO inventa precio/nombre/fotos
    const source: any = {
      name: productName,
      price: priceNum || undefined,
      currency: productData?.currency || "COP",
      images,
      description: productData?.description || "",
      brand: "",
      host: "dropi",
    };
    const parts = [
      `Landing para vender ${productName}`,
      priceNum ? `a ${priceNum} ${productData?.currency || "COP"}` : "",
      productData?.description ? `. ${productData.description.slice(0, 400)}` : "",
      productKind === "digital" ? " (producto digital, acceso inmediato)" : " (pago contra entrega)",
    ].filter(Boolean);
    const data = await api<{ spec: any; engine: string }>("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt: parts.join(" "),
        source,
        ...(productUrl ? { url: productUrl } : {}),
        pro: true,
      }),
    });
    const spec = data.spec;
    console.log(`[LandingForge] Landing generada: ${spec.id} (engine=${data.engine})`);
    return {
      ok: true,
      landingId: spec.id,
      url: publicUrl(spec.id),
      slug: spec.slug,
      productName,
      sectionsGenerated: spec.blocks?.length || 0,
    };
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[LandingForge] Error creando landing: ${msg}`);
    return { ok: false, landingId: "", url: "", slug: "", productName, sectionsGenerated: 0, error: msg };
  }
}
