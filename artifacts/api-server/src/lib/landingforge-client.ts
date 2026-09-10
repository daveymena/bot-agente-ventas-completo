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
const EMAIL = process.env.LANDINGFORGE_EMAIL;
const PASSWORD = process.env.LANDINGFORGE_PASSWORD;

let cachedCookie: string | null = null;
let cookieExpiry = 0;

/* ──────────────────────── auth ──────────────────────── */

async function login(): Promise<string> {
  if (cachedCookie && Date.now() < cookieExpiry) return cachedCookie;
  if (!EMAIL || !PASSWORD) throw new Error("LandingForge: LANDINGFORGE_EMAIL y LANDINGFORGE_PASSWORD no configurados");

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
  // Parse SSE: find ALL data: lines, parse each, return last valid JSON
  const lines = text.split("\n");
  let lastParsed: any = null;
  for (const line of lines) {
    const match = line.match(/^data:\s*(.+)/);
    if (match) {
      try {
        lastParsed = JSON.parse(match[1]);
      } catch {
        // skip malformed lines
      }
    }
  }
  return lastParsed || { status: "done", progress: 0, total: 0 };
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

    // 2. Generar brief (no bloqueante: si falla, creamos landing sin brief)
    let briefId: string | undefined;
    try {
      const { brief } = await generateBrief(product.id);
      briefId = brief.id;
      console.log(`[LandingForge] Brief generado: ${brief.id}`);
    } catch (briefErr) {
      console.log(`[LandingForge] Brief no generado, continuando sin brief: ${(briefErr as Error).message}`);
    }

    // 3. Crear landing (usar physical_cod_standard que es el único skeleton disponible)
    const { landing } = await createLanding({
      productId: product.id,
      skeletonKey: "physical_cod_standard",
      briefId,
      title: opts?.title,
    });
    console.log(`[LandingForge] Landing creada: ${landing.id}`);

    // 4. Generar secciones
    const { jobId } = await generateLandingSections(landing.id, { size: opts?.size });
    console.log(`[LandingForge] Job de generación: ${jobId}`);

    // 5. Esperar resultado (polling cada 2s, max 90s — no bloquear 5 minutos)
    let status;
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 2000));
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
 * Crea el producto directamente en LandingForge (sin scraping de URL).
 */
export async function getOrCreateLanding(
  productName: string,
  productUrl: string,
  productKind: "physical" | "digital",
  productData?: { description?: string; price?: string; currency?: string; category?: string; checkoutUrl?: string },
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

  // Crear producto directamente en LandingForge (más confiable que scraping)
  try {
    const { product: lfProduct } = await createProduct({
      name: productName,
      description: productData?.description || "",
      price: productData?.price,
      currency: productData?.currency || "COP",
      kind: productKind,
      category: productData?.category,
      checkoutUrl: productData?.checkoutUrl || productUrl || undefined,
    });
    console.log(`[LandingForge] Producto creado: ${lfProduct.id} (${lfProduct.name})`);

    // Generar brief (no bloqueante)
    let briefId: string | undefined;
    try {
      const { brief } = await generateBrief(lfProduct.id);
      briefId = brief.id;
      console.log(`[LandingForge] Brief generado: ${brief.id}`);
    } catch (briefErr) {
      console.log(`[LandingForge] Brief no generado: ${(briefErr as Error).message}`);
    }

    // Crear landing
    const { landing } = await createLanding({
      productId: lfProduct.id,
      skeletonKey: "physical_cod_standard",
      briefId,
      title: productName,
    });
    console.log(`[LandingForge] Landing creada: ${landing.id}`);

    // Generar secciones
    const { jobId } = await generateLandingSections(landing.id, { size: "section" });
    console.log(`[LandingForge] Job de generación: ${jobId}`);

    // Polling cada 2s, max 90s
    let status;
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      status = await getJobStatus(jobId);
      if (status.status === "done" || status.status === "error") break;
    }

    if (status?.status === "error") {
      return { ok: false, landingId: landing.id, url: "", slug: "", productName, sectionsGenerated: 0, error: status.error };
    }

    // Publicar
    const published = await publishLanding(landing.id);
    console.log(`[LandingForge] Publicada: ${published.url}`);

    return {
      ok: true,
      landingId: landing.id,
      url: published.url,
      slug: published.landing.slug,
      productName,
      sectionsGenerated: status?.progress ?? 0,
    };
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[LandingForge] Error creando landing: ${msg}`);
    return { ok: false, landingId: "", url: "", slug: "", productName, sectionsGenerated: 0, error: msg };
  }
}
