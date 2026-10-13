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

const BASE = (process.env.LANDINGFORGE_URL || "http://localhost:3000").replace(/\/+$/, "");
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
