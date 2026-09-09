/**
 * Cliente API para LandingForge — generación profesional de landings.
 *
 * Flujo estilo Magic/eCom Magic:
 *   1. Login → JWT cookie
 *   2. Importar producto desde URL de WooCommerce
 *   3. Generar brief estratégico con IA
 *   4. Crear landing con maqueta automática
 *   5. Generar todas las secciones (copy + imágenes IA)
 *   6. Publicar → URL lista para enviar al cliente
 */

const BASE = process.env.LANDINGFORGE_URL || "https://landingforge.2xs2bu.easypanel.host";
const EMAIL = process.env.LANDINGFORGE_EMAIL || "daveymena162@gmail.com";
const PASSWORD = process.env.LANDINGFORGE_PASSWORD || "6715320D.";

let cachedCookie: string | null = null;
let cookieExpiry = 0;

/* ──────────────────────── auth ──────────────────────── */

async function login(): Promise<string> {
  if (cachedCookie && Date.now() < cookieExpiry) return cachedCookie;

  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`LandingForge login failed: ${res.status}`);

  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/lf_session=([^;]+)/);
  if (!match) throw new Error("LandingForge: no session cookie");

  cachedCookie = `lf_session=${match[1]}`;
  cookieExpiry = Date.now() + 29 * 24 * 60 * 60 * 1000; // 29 days
  return cachedCookie;
}

async function api<T = any>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const cookie = await login();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LandingForge ${opts.method || "GET"} ${path}: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/* ──────────────────────── products ──────────────────────── */

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

/** Importar producto desde URL de WooCommerce/tienda. Scrapea nombre, precio, fotos. */
export async function importProduct(url: string): Promise<{ product: LFProduct; images: number }> {
  return api("/api/products/import", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

/** Crear producto manualmente (sin URL). */
export async function createProduct(data: {
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  kind: "physical" | "digital";
  category?: string;
  checkoutUrl?: string;
}): Promise<{ product: LFProduct; images: number }> {
  const form = new FormData();
  form.append("name", data.name);
  if (data.description) form.append("description", data.description);
  if (data.price) form.append("price", data.price);
  if (data.currency) form.append("currency", data.currency);
  form.append("kind", data.kind);
  if (data.category) form.append("category", data.category);
  if (data.checkoutUrl) form.append("checkoutUrl", data.checkoutUrl);

  const cookie = await login();
  const res = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  if (!res.ok) throw new Error(`LandingForge createProduct: ${res.status}`);
  return res.json();
}

/** Listar productos existentes. */
export async function listProducts(): Promise<{ products: LFProduct[] }> {
  return api("/api/products");
}

/* ──────────────────────── briefs ──────────────────────── */

export interface LFBrief {
  id: string;
  data: Record<string, any>;
  generatedBy: string;
}

/** Generar brief estratégico con IA para un producto. */
export async function generateBrief(productId: string): Promise<{ brief: LFBrief }> {
  return api("/api/briefs/generate", {
    method: "POST",
    body: JSON.stringify({ productId }),
  });
}

/* ──────────────────────── landings ──────────────────────── */

export interface LFLanding {
  id: string;
  slug: string;
  status: "draft" | "published";
  title?: string;
  productId: string;
}

/** Crear landing para un producto con una maqueta (skeleton). */
export async function createLanding(opts: {
  productId: string;
  skeletonKey: string;
  briefId?: string;
  title?: string;
}): Promise<{ landing: LFLanding }> {
  return api("/api/landings", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

/** Listar landings de un producto. */
export async function listLandings(): Promise<{ landings: Array<{ landing: LFLanding; productName: string }> }> {
  return api("/api/landings");
}

/** Generar todas las secciones de una landing (copy + imágenes IA). Devuelve jobId. */
export async function generateLandingSections(
  landingId: string,
  opts?: { onlyPending?: boolean; size?: "section" | "square" | "story" | "wide" },
): Promise<{ jobId: string }> {
  return api(`/api/landings/${landingId}/generate`, {
    method: "POST",
    body: JSON.stringify(opts ?? {}),
  });
}

/** Consultar progreso de un job de generación (SSE). */
export async function getJobStatus(jobId: string): Promise<{
  status: "running" | "done" | "error";
  progress: number;
  total: number;
  error?: string;
  sections?: Array<{ id: string; sectionType: string; status: string; imageUrl?: string }>;
}> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}/stream`);
  if (!res.ok) throw new Error(`LandingForge job status: ${res.status}`);
  const text = await res.text();
  // Parse SSE events, get last one
  const events = text.split("\n\n").filter(Boolean);
  const last = events[events.length - 1];
  const dataLine = last?.match(/data: (.+)/)?.[1];
  return dataLine ? JSON.parse(dataLine) : { status: "done", progress: 0, total: 0 };
}

/** Publicar landing → devuelve URL pública. */
export async function publishLanding(
  landingId: string,
  slug?: string,
): Promise<{ landing: LFLanding; url: string }> {
  return api(`/api/landings/${landingId}/publish`, {
    method: "POST",
    body: JSON.stringify({ slug, publish: true }),
  });
}

/* ──────────────────────── high-level: generateMagicLanding ──────────────────────── */

export interface MagicLandingResult {
  ok: boolean;
  landingId: string;
  url: string;
  slug: string;
  productName: string;
  sectionsGenerated: number;
  error?: string;
}

/**
 * Genera una landing profesional estilo Magic para un producto de WooCommerce.
 *
 * Flujo completo:
 *   1. Importar producto desde URL (scrapea nombre, precio, fotos)
 *   2. Generar brief estratégico con IA
 *   3. Crear landing con maqueta automática
 *   4. Generar todas las secciones (copy + imágenes IA)
 *   5. Esperar a que termine la generación
 *   6. Publicar → URL lista
 *
 * @param productUrl - URL del producto en WooCommerce/tienda
 * @param opts - Opciones adicionales
 */
export async function generateMagicLanding(
  productUrl: string,
  opts?: { title?: string; size?: "section" | "square" | "story" | "wide" },
): Promise<MagicLandingResult> {
  try {
    // 1. Importar producto
    const { product, images } = await importProduct(productUrl);
    console.log(`[LandingForge] Producto importado: ${product.name} (${images} imágenes)`);

    // 2. Generar brief
    const { brief } = await generateBrief(product.id);
    console.log(`[LandingForge] Brief generado: ${brief.id}`);

    // 3. Crear landing (elegir skeleton según tipo)
    const skeleton = product.kind === "digital" ? "digital_completa" : "fisica_completa";
    const { landing } = await createLanding({
      productId: product.id,
      skeletonKey: skeleton,
      briefId: brief.id,
      title: opts?.title,
    });
    console.log(`[LandingForge] Landing creada: ${landing.id}`);

    // 4. Generar secciones
    const { jobId } = await generateLandingSections(landing.id, { size: opts?.size });
    console.log(`[LandingForge] Job de generación: ${jobId}`);

    // 5. Esperar resultado (polling cada 3s, max 5 min)
    let status;
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      status = await getJobStatus(jobId);
      if (status.status === "done" || status.status === "error") break;
    }

    if (status?.status === "error") {
      return { ok: false, landingId: landing.id, url: "", slug: "", productName: product.name, sectionsGenerated: 0, error: status.error };
    }

    // 6. Publicar
    const published = await publishLanding(landing.id);
    console.log(`[LandingForge] Publicada: ${published.url}`);

    return {
      ok: true,
      landingId: landing.id,
      url: published.url,
      slug: published.landing.slug,
      productName: product.name,
      sectionsGenerated: status?.progress ?? 0,
    };
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[LandingForge] Error: ${msg}`);
    return { ok: false, landingId: "", url: "", slug: "", productName: "", sectionsGenerated: 0, error: msg };
  }
}

/**
 * Genera landing bajo demanda para un producto del catálogo local.
 * Si ya existe una landing publicada para ese producto, la reutiliza.
 */
export async function getOrCreateLanding(
  productName: string,
  productUrl: string,
  productKind: "physical" | "digital",
): Promise<MagicLandingResult> {
  // Buscar si ya existe
  try {
    const { landings } = await listLandings();
    const existing = landings.find(
      (l) => l.productName.toLowerCase() === productName.toLowerCase() && l.landing.status === "published",
    );
    if (existing) {
      return {
        ok: true,
        landingId: existing.landing.id,
        url: `${BASE}/l/${existing.landing.slug}`,
        slug: existing.landing.slug,
        productName,
        sectionsGenerated: 0,
      };
    }
  } catch {
    // Si falla la list, simplemente crear nueva
  }

  return generateMagicLanding(productUrl);
}
