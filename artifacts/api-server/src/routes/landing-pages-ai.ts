import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import type { TenantRequest } from "../lib/tenantManager";
import { callMarketingAI } from "../lib/marketing-team/ai";
import { fotosDelProducto } from "../lib/fotos-de-producto";
import { CONDICIONES_DE_RESPALDO, fraseCostoEnvio, frasePagoEnvio, type CondicionesDelNegocio } from "../lib/modelo-de-negocio";
import { getBusinessContext } from "../lib/business-context";
import { aTextoPlano } from "../lib/texto-plano";
import {
  bloqueDePlantilla,
  casillasQueAplican,
  elegirPlantilla,
  PLANTILLAS,
  tipoDeProducto,
  type Casilla,
  type Plantilla,
} from "../lib/landing/plantillas";
import {
  getOrCreateLanding,
} from "../lib/landingforge-client";

const router = Router();

type LandingSection = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  body?: string;
  cta?: string;
  image?: string;
  /** Galería: las fotos REALES del producto (las del proveedor). */
  images?: string[];
};

/**
 * Lo mínimo aceptable para una casilla que el modelo no escribió.
 *
 * No es una landing de respaldo: es el relleno de UN hueco. Sale solo de datos
 * del producto, sin adjetivos ni promesas, porque una sección obligatoria
 * vacía deja un agujero en la página publicada del dueño.
 */
function rellenoDe(casilla: Casilla, product: any): LandingSection {
  const nombre = product?.name || "el producto";
  const rasgos = Array.isArray(product?.features) && product.features.length
    ? product.features.join(" · ")
    : "";

  const base: Record<string, Partial<LandingSection>> = {
    hero: { title: String(nombre), subtitle: product?.description || "", cta: "Quiero saber más" },
    benefits: { title: "Para qué sirve", body: rasgos || product?.description || "" },
    "how-it-works": { title: "Qué incluye", body: rasgos },
    offer: {
      title: "La oferta",
      subtitle: product?.price ? `${product.price} ${product.currency || ""}`.trim() : "",
      cta: "Comprar ahora",
    },
    logistics: { title: "Envío y pago", body: "" },
    faq: { title: "Preguntas frecuentes", body: "" },
    cta: { title: "Da el siguiente paso", cta: "Comprar ahora" },
  };

  return { id: casilla.type, type: casilla.type, title: "", ...base[casilla.type] } as LandingSection;
}

/**
 * Encaja lo que devolvió el modelo en la plantilla.
 *
 * ── Por qué no se toma la lista del modelo tal cual ───────────────────────
 *
 * Antes se filtraban las secciones por `type` válido y se devolvían en el orden
 * en que el modelo las hubiera escrito. Eso dejaba pasar los tres fallos que
 * arruinaban la página: faltaba una sección obligatoria, sobraba una que el
 * producto no puede sostener, o el precio aparecía antes que los beneficios.
 *
 * Acá se recorre la PLANTILLA, no la respuesta. Cada casilla busca su sección
 * por `type`; si el modelo la escribió, se usa su texto; si no, se rellena con
 * datos del producto. El orden y el conjunto salen de la plantilla siempre, así
 * que la página no puede quedar coja ni desordenada por más raro que conteste
 * el modelo.
 *
 * Lo que el modelo trajo de más se descarta: si no está en la plantilla, es una
 * sección que este producto no tiene con qué llenar.
 */
/**
 * Las fotos REALES del producto, en orden: la principal y las del proveedor.
 *
 * Hasta hoy cada sección mandaba un "imagePrompt" a Pollinations con estilo
 * "neon dark mode SaaS 3D render": una faja salía como una mujer en bikini
 * generada, el antes/después era la misma imagen duplicada con marca de agua,
 * y las cinco fotos reales que Dropi trae de cada producto no se usaban
 * (medido el 12-09-2026 en la landing 4). Una landing de un producto físico
 * se hace con las fotos del producto. La IA queda solo como respaldo cuando
 * no hay ninguna foto real.
 */
export function imagenesRealesDe(product: any): string[] {
  // Galería del dueño + Dropi/Woo + principal, en una sola lista (lib/fotos-de-producto).
  return fotosDelProducto(product, process.env.APP_URL || "https://ventasproia.com", 8);
}

export function normalizeSections(input: unknown, product: any, casillas: Casilla[], condiciones?: CondicionesDelNegocio | null): LandingSection[] {
  const reales = imagenesRealesDe(product);
  const esFisico = String(product?.kind || "digital") === "physical";
  // Un "antes/después" sin fotos reales de antes y después es una imagen
  // inventada con una persona inventada: en un físico no va. (En digital la
  // plantilla lo usa solo como texto.)
  const casillasUtiles = esFisico ? casillas.filter((c) => c.type !== "before-after") : casillas;
  // La foto que le toca a cada sección, rotando las reales: hero la principal.
  const realPara: Record<string, string | undefined> = {
    hero: reales[0], benefits: reales[1] ?? reales[0], "how-it-works": reales[2] ?? reales[1], offer: reales[0],
    comparison: reales[1], authority: undefined, testimonials: undefined, logistics: undefined, faq: undefined, cta: reales[0],
  };
  const delModelo = Array.isArray(input)
    ? input.filter((s: any) => s && typeof s === "object" && typeof s.type === "string")
    : [];
  const usadas = new Set<number>();

  const salida: LandingSection[] = casillasUtiles.map((casilla, i) => {
    const idx = delModelo.findIndex((s: any, j: number) => !usadas.has(j) && String(s.type) === casilla.type);
    const relleno = rellenoDe(casilla, product);
    const s: any = idx === -1 ? {} : delModelo[idx];
    if (idx !== -1) usadas.add(idx);

    // Foto real primero. Una URL que trajo el modelo solo vale si es una
    // imagen real (http y no un generador). Pollinations queda como último
    // respaldo, con estilo de FOTO DE PRODUCTO, no de render 3D neón.
    let image: string | undefined = realPara[casilla.type];
    const delModeloUrl = typeof s.image === "string" && /^https?:\/\//.test(s.image) && !/pollinations/i.test(s.image) ? s.image : undefined;
    if (!image && delModeloUrl) image = delModeloUrl;
    if (!image && reales.length === 0 && s.imagePrompt && ["hero", "benefits", "offer"].includes(casilla.type)) {
      const enc = encodeURIComponent(`${String(s.imagePrompt)}, clean product photography, studio light, white background, no people, no text`);
      image = `https://image.pollinations.ai/prompt/${enc}?width=1080&height=720&nologo=true`;
    }
    // La logística NO la escribe el modelo: no conoce las condiciones y
    // deja huecos ("[El negocio debe completar aquí los detalles de envío]",
    // 12-09-2026). Sale del perfil del negocio, que sí las tiene.
    let body = s.body ? aTextoPlano(s.body) : relleno.body;
    if (casilla.type === "logistics" && esFisico) {
      const c = condiciones ?? CONDICIONES_DE_RESPALDO;
      body = [
        `${fraseCostoEnvio(c)}.`,
        `${frasePagoEnvio(c)}.`,
        `Llega en ${c.envio.plazo}, ${c.envio.cobertura}.`,
        "Antes de despachar te confirmamos los datos de envío por WhatsApp.",
      ].join("\n");
    }
    return {
      // El id sale de la casilla, no del modelo: el editor los usa como clave y
      // dos secciones con el mismo id se pisan al guardar.
      id: `${casilla.type}-${i + 1}`,
      type: casilla.type,
      title: aTextoPlano(s.title || relleno.title || ""),
      subtitle: s.subtitle ? aTextoPlano(s.subtitle) : relleno.subtitle,
      body,
      cta: s.cta ? String(s.cta) : relleno.cta,
      image,
    };
  });

  // Galería con las fotos reales, después de los beneficios: en un físico es
  // lo que más se mira, y hasta hoy esas fotos no aparecían en ningún lado.
  if (esFisico && reales.length >= 2) {
    const pos = salida.findIndex((x) => x.type === "benefits");
    salida.splice(pos === -1 ? 1 : pos + 1, 0, {
      id: "gallery-1", type: "gallery", title: "Así es", subtitle: "Fotos reales del producto", images: reales.slice(0, 6),
    });
  }
  return salida;
}

function normalizeStrategy(strategy: any, product: any, sourceAd: any) {
  return {
    objective: strategy?.objective || "sales",
    language: strategy?.language || "es",
    country: strategy?.country || "CO",
    currency: strategy?.currency || product?.currency || "COP",
    avatar: strategy?.avatar || "Cliente ideal definido a partir de los datos disponibles del producto.",
    awareness: strategy?.awareness || "problem-aware",
    pain: strategy?.pain || "",
    desire: strategy?.desire || "",
    mechanism: strategy?.mechanism || "",
    promise: strategy?.promise || "",
    objections: Array.isArray(strategy?.objections) ? strategy.objections : [],
    angle: strategy?.angle || "beneficio principal",
    sourceAd: sourceAd || null,
  };
}

/**
 * Genera la landing con el generador local (sin LandingForge). Es lo que usa
 * la ruta /generate y también Atlas (`landing_crear`): antes la lógica vivía
 * adentro del handler y Atlas no podía crear landings.
 */
export async function generarLandingLocal(opts: {
  tenantId: number; product: any; brandName?: string | null; plantillaId?: string | null;
  sourceAd?: any; language?: string; country?: string; objective?: string;
}) {
  const { tenantId, product } = opts;
  const productId = Number(product.id);
  const sourceAd = opts.sourceAd || null;
  const language = String(opts.language || "es");
  const country = String(opts.country || "CO");
  const objective = String(opts.objective || "sales");
    const promptProduct = {
      id: product.id, name: product.name, description: product.description, price: product.price,
      currency: product.currency, kind: product.kind, imageUrl: product.imageUrl, highlight: product.highlight,
      features: product.features, paymentLink: product.paymentLink, deliveryLink: product.deliveryLink,
    };

    const negocio = { brandName: opts.brandName };
    const plantilla = elegirPlantilla(product as any, opts.plantillaId, negocio);
    const casillas = casillasQueAplican(plantilla, product as any, negocio);

    // 2.200 tokens no alcanzaban para 7 secciones con ítems y una FAQ con
    // respuestas: el JSON llegaba cortado, `tryParseJson` rescataba un objeto
    // parcial sin `sections`, y la landing salía entera de relleno con
    // generatedBy="ai" (12-09-2026, faja). Más tope, y abajo se verifica que
    // de verdad haya secciones antes de llamarlo "ai".
    const llamar = () => callMarketingAI<any>({
      tenantId,
      json: true,
      maxTokens: 4000,
      systemPrompt: `${bloqueDePlantilla(plantilla, product as any, negocio)}\nEres el Landing Agent de VentasPro. Construyes landing pages de respuesta directa que continúan la promesa del anuncio y convierten sin inventar datos. Devuelve SOLO JSON válido. Usa únicamente hechos presentes en PRODUCTO o ANUNCIO FUENTE; si falta un dato, no lo inventes. Nunca fabriques testimonios, garantías, descuentos, urgencia, certificaciones ni resultados cuantificados. Escribe en ${language} para ${country}. La salida debe ser utilizable por un editor visual.

ESTRUCTURA DEL TEXTO (AIDA, pedido del dueño): la página NO describe el producto, guía al que llega.
1. ATENCIÓN — el hero abre con el PROBLEMA o dolor real de quien busca esto (una pregunta o una situación reconocible), no con el nombre del producto. El título es el dolor o el deseo; el subtítulo, la promesa concreta.
2. INTERÉS — los beneficios cuentan qué cambia para la persona (resultado), no la característica en frío. Característica → qué significa → qué gana.
3. DESEO — recién ahí el producto como la solución: qué es, qué trae, cómo se usa o se recibe. Con los datos reales del catálogo.
4. ACCIÓN — el cierre repite la promesa del hero y pide UNA cosa con el mismo verbo del botón (físico: pedir y pagar al recibir; digital: acceder ahora).
Frases cortas. Una idea por línea. Sin adjetivos de relleno ("increíble", "premium", "de alta calidad") salvo que estén en el producto.`,
      userPrompt: JSON.stringify({
        tarea: "crear_landing",
        objetivo: objective,
        producto: promptProduct,
        anuncio_fuente: sourceAd,
        formato: {
          name: "string",
          strategy: { avatar: "string", awareness: "string", pain: "string", desire: "string", mechanism: "string", promise: "string", objections: ["string"], angle: "string", objective, language, country, currency: product.currency },
          sections: [{ id: "string", type: "hero|benefits|offer|before-after|comparison|authority|testimonials|how-it-works|logistics|faq|cta", title: "string", subtitle: "string", body: "string: en benefits, how-it-works, comparison y offer va UNA LÍNEA POR ÍTEM (3 a 6 ítems cortos y concretos, sin adjetivos de relleno); en faq va UNA LÍNEA POR PREGUNTA con la respuesta después de ' | ' (ej: '¿Cuánto tarda en llegar? | Entre 3 y 5 días hábiles'); en hero y cta, un párrafo corto", cta: "string: el mismo verbo en hero, offer y cta", imagePrompt: "SOLO si el producto no tiene foto: descripción en inglés (max 15 palabras) de una FOTO DE PRODUCTO limpia, sin personas ni texto" }],
          design: { tone: "string", primary: "string", background: "string", radius: "string" },
          source: { type: sourceAd ? "facebook-ad" : "product", reference: sourceAd || null }
        }
      }),
    });

    // El modelo a veces envuelve la respuesta: { landing: {...} }, { data: {...} }
    // o -- medido el 14-09-2026 con gemma4, 1 de cada 3 veces -- devuelve el
    // MISMO sobre que recibió: { tarea, objetivo, formato: { name, strategy,
    // sections… } }. Con la lista fija de claves eso caía a la landing de
    // relleno sin aviso. Se busca `sections` en cualquier nivel (hasta 4).
    const desenvolver = (r: any, nivel = 0): any => {
      if (!r || typeof r !== "object" || Array.isArray(r) || nivel > 4) return null;
      if (Array.isArray(r.sections) && r.sections.length) return r;
      for (const v of Object.values(r)) {
        const hallado = desenvolver(v, nivel + 1);
        if (hallado) return hallado;
      }
      return null;
    };
    const describir = (r: any): string => {
      if (!r || typeof r !== "object") return String(r);
      const claves = Object.keys(r).slice(0, 12).join(",");
      return `claves=[${claves}] ${JSON.stringify(r).slice(0, 300)}`;
    };
    let crudo = await llamar();
    let result = desenvolver(crudo);
    if (!result) {
      // Se deja constancia de QUÉ llegó: sin esto la landing salía de relleno
      // con generatedBy="fallback" y nadie sabía si el modelo contestó en otro
      // formato, se cortó, o no contestó (14-09-2026).
      console.log(`[Landing] el modelo no devolvió secciones para el producto ${productId}: se reintenta una vez. Llegó: ${describir(crudo)}`);
      crudo = await llamar();
      result = desenvolver(crudo);
      if (!result) console.log(`[Landing] segundo intento sin secciones para el producto ${productId}. Llegó: ${describir(crudo)}`);
    }
    const conSecciones = !!result && Array.isArray(result.sections) && result.sections.length > 0;

    const strategy = normalizeStrategy(result?.strategy, product, sourceAd);
    const sections = normalizeSections(result?.sections, product, casillas, (await getBusinessContext(tenantId).catch(() => null))?.condiciones);
    const design = result?.design || { tone: "direct-response premium", primary: "#111827", background: "#ffffff", radius: "14px" };
    const name = String(result?.name || `Landing · ${product.name}`);

    return { ok: true as const, generatedBy: conSecciones ? "ai" : "fallback", name, productId, strategy, sections, design,
      plantilla: { id: plantilla.id, nombre: plantilla.nombre, para: plantilla.para, cuando: plantilla.cuando }, source: sourceAd ? { type: "facebook-ad", data: sourceAd } : { type: "product", productId } };
}

router.post("/generate", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const productId = Number(req.body?.productId);
    if (!Number.isFinite(productId)) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);

    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
    if (!product) return sendError(res, ERROR_CODES.PRODUCT_NOT_FOUND);

    const sourceAd = req.body?.sourceAd || null;
    const language = String(req.body?.language || "es");
    const country = String(req.body?.country || "CO");
    const objective = String(req.body?.objective || "sales");

    // ── Intentar LandingForge primero (generación profesional estilo Magic) ──
    const LF_ENABLED = !!process.env.LANDINGFORGE_URL;
    if (LF_ENABLED) {
      try {
        const lfResult = await generateLandingViaForge(product, { language, country, objective });
        if (lfResult.ok) {
          // Mapear section types de LandingForge a tipos del bot para el editor
          const lfToBotType: Record<string, string> = {
            hero_hook: "hero", hero: "hero", trust_bar: "benefits",
            problem_agitation: "benefits", before_after: "before-after",
            benefits_grid: "benefits", unique_mechanism: "benefits",
            how_to_use: "how-it-works", specs_included: "how-it-works",
            comparison_table: "benefits", testimonials: "testimonials",
            offer_cod: "offer", shipping_guarantee: "logistics",
            faq: "faq", final_cta: "cta",
          };
          const mappedSections = lfResult.sections.map((s: any) => ({
            ...s,
            type: lfToBotType[s.type] || s.type,
          }));
          // Normalizar con la plantilla local para que el editor pueda usarlo
          const plantilla = elegirPlantilla(product as any, null, { brandName: req.tenant?.brandName });
          const casillas = casillasQueAplican(plantilla, product as any, { brandName: req.tenant?.brandName });
          const normalizedSections = normalizeSections(mappedSections, product, casillas, (await getBusinessContext(tenantId).catch(() => null))?.condiciones);

          return res.json({
            ok: true,
            generatedBy: "landingforge",
            name: lfResult.name,
            productId,
            landingforgeUrl: lfResult.url,
            landingforgeLandingId: lfResult.landingId,
            strategy: lfResult.strategy,
            sections: normalizedSections,
            design: lfResult.design,
            plantilla: { id: plantilla.id, nombre: plantilla.nombre, para: plantilla.para, cuando: plantilla.cuando },
            source: sourceAd ? { type: "facebook-ad", data: sourceAd } : { type: "product", productId },
          });
        }
        // Si LandingForge falló, continuar con el generador local
        console.log(`[LandingForge] Falló para producto ${productId}, usando generador local: ${lfResult.error}`);
      } catch (lfErr) {
        console.log(`[LandingForge] Error para producto ${productId}, usando generador local: ${(lfErr as Error).message}`);
      }
    }

    // ── Fallback: generador local existente ──────────────────────────────────
    return res.json(await generarLandingLocal({
      tenantId, product, brandName: req.tenant?.brandName, plantillaId: req.body?.plantilla, sourceAd, language, country, objective,
    }));
  } catch (e) {
    return next(e);
  }
});

/**
 * Genera una landing profesional via LandingForge (estilo Magic/eCom Magic).
 *
 * Usa el pipeline completo del cliente: crear producto → brief → landing →
 * generar secciones → publicar. Si LandingForge falla en cualquier paso,
 * devuelve ok:false para que el caller use el generador local.
 *
 * Las secciones se normalizan con normalizeSections() para que coincidan
 * con la plantilla del bot (hero, benefits, offer, etc.).
 */
async function generateLandingViaForge(
  product: any,
  opts: { language: string; country: string; objective: string },
): Promise<{
  ok: boolean; name: string; url: string; landingId: string;
  strategy: any; sections: any[]; design: any; error?: string;
}> {
  // Construir URL del producto para LandingForge
  const productUrl = product.paymentLink || product.checkoutUrl || `https://ventasproia.com/tienda/producto/${product.id}`;

  // Usar el pipeline completo del cliente (incluye dedup de landings existentes)
  const result = await getOrCreateLanding(
    product.name,
    productUrl,
    (product.kind === "physical" ? "physical" : "digital") as "physical" | "digital",
    {
      description: product.description || "",
      price: product.price ? String(product.price) : undefined,
      currency: product.currency || "COP",
      category: product.category || undefined,
      checkoutUrl: product.paymentLink || undefined,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      name: product.name,
      url: "",
      landingId: result.landingId,
      strategy: null,
      sections: [],
      design: null,
      error: result.error,
    };
  }

  // Construir strategy y design genéricos (LandingForge genera su propio contenido)
  const strategy = {
    objective: opts.objective,
    language: opts.language,
    country: opts.country,
    currency: product.currency || "COP",
    avatar: "",
    awareness: "problem-aware",
    pain: "",
    desire: "",
    mechanism: "",
    promise: "",
    objections: [],
    angle: "",
    sourceAd: null,
  };

  const design = {
    tone: "professional",
    primary: "#111827",
    background: "#ffffff",
    radius: "14px",
  };

  // Mapear secciones del formato LandingForge al formato del bot
  const sections = (result as any).sections?.map((s: any, i: number) => ({
    id: s.id || `section-${i + 1}`,
    type: s.sectionType || "hero",
    title: s.copy?.title || "",
    subtitle: s.copy?.subtitle || "",
    body: s.copy?.body || "",
    cta: s.copy?.cta || "",
    image: s.imageUrl || undefined,
  })) || [];

  return {
    ok: true,
    name: product.name,
    url: result.url,
    landingId: result.landingId,
    strategy,
    sections,
    design,
  };
}

router.post("/:id/command", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const instruction = String(req.body?.instruction || "").trim();
    if (!instruction) return res.status(400).json({ message: "La instrucción está vacía." });

    // Calcula, APLICA y GUARDA (antes solo devolvía operaciones que nadie
    // aplicaba y la pantalla decía "Cambio aplicado").
    const { editarLanding } = await import("../lib/landing/editar");
    const r = await editarLanding(tenantId, id, instruction, req.body?.selectedSectionId || null);
    if (!r.ok) return res.status(422).json({ ok: false, message: r.message, operations: [] });
    return res.json({ ok: true, message: `${r.message} (${r.aplicadas.join(", ")})`, operations: r.aplicadas });
  } catch (e) {
    return next(e);
  }
});

/**
 * Las plantillas que le sirven a un producto.
 *
 * El panel las usa para dejar que el dueño elija otra estructura; se le manda
 * `?productId=` para no ofrecerle una plantilla con logística para un curso.
 * Sin producto, van todas.
 */
router.get("/plantillas", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    const productId = Number(req.query?.productId);
    let para: string | null = null;
    let sugerida: string | null = null;

    if (Number.isFinite(productId)) {
      const [product] = await db.select().from(products)
        .where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
      if (product) {
        para = tipoDeProducto(product.kind);
        sugerida = elegirPlantilla(product as any, null, { brandName: req.tenant?.brandName }).id;
      }
    }

    const lista = PLANTILLAS.filter((p) => !para || p.para === para).map((p: Plantilla) => ({
      id: p.id, nombre: p.nombre, para: p.para, cuando: p.cuando,
      secciones: p.casillas.map((c) => c.type),
    }));

    return res.json({ ok: true, sugerida, plantillas: lista });
  } catch (e) {
    return next(e);
  }
});

export default router;
