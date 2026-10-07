/**
 * Cliente API para LandingForge (motor actual: landing-forge en
 * https://landings.ventasproia.com).
 *
 * Endpoints usados:
 *   GET  /api/landingforge/status    - estado del servicio y la IA
 *   POST /api/landingforge/generate - generar landing (extrae URL + IA + guarda)
 *   GET  /api/landingforge/list      - listar landings generadas
 *   GET  /api/health                 - salud del servicio
 *
 * Autenticacion: header x-api-key con LANDINGFORGE_API_KEY (las escrituras
 * lo exigen; el dashboard usa mismo-origen, el bot usa la key).
 */

const BASE = (process.env.LANDINGFORGE_URL || "https://landings.ventasproia.com").replace(/\/+$/, "");
const API_KEY = process.env.LANDINGFORGE_API_KEY || process.env.LANDING_API_KEY || "";
const WHATSAPP_DEFAULT = process.env.WHATSAPP_NUMBER || process.env.ADMIN_PHONE || "573136174267";

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

export interface LFSection {
  id: string;
  sectionType: string;
  copy: { title: string; subtitle: string; body: string; cta: string; [k: string]: any };
  imageUrl?: string;
  [k: string]: any;
}

export interface MagicLandingResult {
  ok: boolean;
  landingId: string;
  url: string;
  slug: string;
  productName: string;
  sectionsGenerated: number;
  sections?: LFSection[];
  editorUrl?: string;
  exportUrl?: string;
  error?: string;
  /** Fase 1 del forge: el analisis previo (avatar/dolores/angulo). */
  analisis?: { avatar?: string; promesa?: string; angulo?: string; dolores?: string[] } | null;
}

export interface ProductData {
  description?: string;
  price?: string;
  currency?: string;
  category?: string;
  checkoutUrl?: string;
  images?: string[];
  videos?: string[];
  prompt?: string;
  /** Origen del trafico ("facebook" en fisico: el forge analiza angulo y diseno para trafico frio). */
  trafico?: string;
  /** Negocio dueño: con esto se mandan sus HECHOS (marca, envío, garantía). */
  tenantId?: number | null;
  /** Fila del producto: su garantía real (metadata.garantia, de Dropi). */
  producto?: any;
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
    cobertura: fisico ? [c.envio.cobertura, c.pais && /^co$/i.test(c.pais) ? "Colombia" : c.pais].filter(Boolean).join(", ") : ctx.cobertura || undefined,
    entrega: fisico
      ? { metodo: "envío a domicilio", plazo: c.envio.plazo }
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

async function lf<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (API_KEY) headers["x-api-key"] = API_KEY;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LandingForge ${opts.method || "GET"} ${path}: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function landingStatus(): Promise<any> {
  return lf("/api/landingforge/status");
}

export async function listLandings(): Promise<{
  landings: Array<{ landing: LFLanding; productName: string }>;
  total?: number;
}> {
  return lf("/api/landingforge/list");
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

export async function getOrCreateLanding(
  productName: string,
  productUrl: string,
  productKind: "physical" | "digital",
  productData?: ProductData,
): Promise<MagicLandingResult> {
  try {
    const { landings } = await listLandings();
    const existing = (landings || []).find(
      (l) => l.productName?.toLowerCase() === productName.toLowerCase() && l.landing?.status === "published",
    );
    if (existing) {
      return {
        ok: true,
        landingId: existing.landing.id,
        url: `${BASE}/l/${existing.landing.slug}`,
        slug: existing.landing.slug,
        productName,
        sectionsGenerated: 0,
        sections: [],
      };
    }
  } catch {
  }

  const hechos = productData?.tenantId !== undefined
    ? await hechosParaLanding(productData.tenantId, productData.producto).catch((e) => {
        console.warn(`[LandingForge] Sin hechos del negocio: ${(e as Error).message}`);
        return undefined;
      })
    : undefined;

  try {
    const d = await lf<any>("/api/landingforge/generate", {
      method: "POST",
      body: JSON.stringify({
        productUrl,
        productName,
        productKind,
        price: productData?.price,
        currency: productData?.currency || "COP",
        checkoutUrl: productData?.checkoutUrl || productUrl || undefined,
        whatsapp: hechos?.whatsapp || WHATSAPP_DEFAULT,
        hechos,
        description: productData?.description || undefined,
        images: productData?.images?.length ? productData.images : undefined,
        videos: productData?.videos?.length ? productData.videos : undefined,
        prompt: productData?.prompt || undefined,
        trafico: productData?.trafico || (productKind === "physical" ? "facebook" : "organico"),
        // La misma IA que Atlas (botón «Usar para Atlas»); el forge la ignora si no la entiende.
        aiProvider: (await aiActivaParaForge()) || undefined,
      }),
    });
    console.log(`[LandingForge] Landing generada: ${d.landingId} (${d.sectionsGenerated} secciones)`);
    return mapGenerate(d, productName);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[LandingForge] Error creando landing: ${msg}`);
    return { ok: false, landingId: "", url: "", slug: "", productName, sectionsGenerated: 0, sections: [], error: msg };
  }
}

export async function generateMagicLanding(
  productUrl: string,
  opts?: { title?: string; size?: "section" | "square" | "story" | "wide" },
): Promise<MagicLandingResult> {
  const name = opts?.title || "Producto";
  return getOrCreateLanding(name, productUrl, "physical");
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
