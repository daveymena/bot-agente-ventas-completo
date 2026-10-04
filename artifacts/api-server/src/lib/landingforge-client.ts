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
  };
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
        whatsapp: WHATSAPP_DEFAULT,
        description: productData?.description || undefined,
        images: productData?.images?.length ? productData.images : undefined,
        videos: productData?.videos?.length ? productData.videos : undefined,
        prompt: productData?.prompt || undefined,
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
