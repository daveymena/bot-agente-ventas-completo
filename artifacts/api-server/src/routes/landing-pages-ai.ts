import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import type { TenantRequest } from "../lib/tenantManager";
import { callMarketingAI } from "../lib/marketing-team/ai";
import {
  bloqueDePlantilla,
  casillasQueAplican,
  elegirPlantilla,
  PLANTILLAS,
  tipoDeProducto,
  type Casilla,
  type Plantilla,
} from "../lib/landing/plantillas";

const router = Router();

type LandingSection = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  body?: string;
  cta?: string;
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
function normalizeSections(input: unknown, product: any, casillas: Casilla[]): LandingSection[] {
  const delModelo = Array.isArray(input)
    ? input.filter((s: any) => s && typeof s === "object" && typeof s.type === "string")
    : [];
  const usadas = new Set<number>();

  return casillas.map((casilla, i) => {
    const idx = delModelo.findIndex((s: any, j: number) => !usadas.has(j) && String(s.type) === casilla.type);
    if (idx === -1) return rellenoDe(casilla, product);
    usadas.add(idx);
    const s: any = delModelo[idx];
    const relleno = rellenoDe(casilla, product);

    let image = s.image ? String(s.image) : undefined;
    if (!image && s.imagePrompt) {
      // Usar IA gratuita (Pollinations) para generar las imágenes on-the-fly al estilo Magic
      const enc = encodeURIComponent(String(s.imagePrompt) + ", high-end SaaS aesthetic, neon dark mode e-commerce magic style, professional photorealistic 3d render, 8k");
      image = `https://image.pollinations.ai/prompt/${enc}?width=1080&height=720&nologo=true`;
    }
    return {
      // El id sale de la casilla, no del modelo: el editor los usa como clave y
      // dos secciones con el mismo id se pisan al guardar.
      id: `${casilla.type}-${i + 1}`,
      type: casilla.type,
      title: String(s.title || relleno.title || ""),
      subtitle: s.subtitle ? String(s.subtitle) : relleno.subtitle,
      body: s.body ? String(s.body) : relleno.body,
      cta: s.cta ? String(s.cta) : relleno.cta,
      image,
    };
  });
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
    const promptProduct = {
      id: product.id, name: product.name, description: product.description, price: product.price,
      currency: product.currency, kind: product.kind, imageUrl: product.imageUrl, highlight: product.highlight,
      features: product.features, paymentLink: product.paymentLink, deliveryLink: product.deliveryLink,
    };

    // ── La estructura se decide ACÁ, antes de hablar con el modelo ──────────
    //
    // Es el cambio de fondo: qué secciones lleva la página y en qué orden ya no
    // sale de lo que se le ocurra al modelo, sino de una plantilla elegida por
    // el tipo de producto. El modelo escribe el texto de cada casilla.
    const negocio = { brandName: req.tenant?.brandName };
    const plantilla = elegirPlantilla(product as any, req.body?.plantilla, negocio);
    const casillas = casillasQueAplican(plantilla, product as any, negocio);

    const result = await callMarketingAI<any>({
      tenantId,
      json: true,
      maxTokens: 2200,
      systemPrompt: `${bloqueDePlantilla(plantilla, product as any, negocio)}\nEres el Landing Agent de VentasPro. Construyes landing pages de respuesta directa que continúan la promesa del anuncio y convierten sin inventar datos. Devuelve SOLO JSON válido. Usa únicamente hechos presentes en PRODUCTO o ANUNCIO FUENTE; si falta un dato, no lo inventes. Nunca fabriques testimonios, garantías, descuentos, urgencia, certificaciones ni resultados cuantificados. Escribe en ${language} para ${country}. La salida debe ser utilizable por un editor visual.`,
      userPrompt: JSON.stringify({
        tarea: "crear_landing",
        objetivo: objective,
        producto: promptProduct,
        anuncio_fuente: sourceAd,
        formato: {
          name: "string",
          strategy: { avatar: "string", awareness: "string", pain: "string", desire: "string", mechanism: "string", promise: "string", objections: ["string"], angle: "string", objective, language, country, currency: product.currency },
          sections: [{ id: "string", type: "hero|benefits|offer|before-after|comparison|authority|testimonials|how-it-works|logistics|faq|cta", title: "string", subtitle: "string", body: "string", cta: "string", imagePrompt: "descripción en inglés (max 20 palabras) para generar una imagen 3D premium o mockup de SaaS relacionado a esta sección, si aplica" }],
          design: { tone: "string", primary: "string", background: "string", radius: "string" },
          source: { type: sourceAd ? "facebook-ad" : "product", reference: sourceAd || null }
        }
      }),
    });

    const strategy = normalizeStrategy(result?.strategy, product, sourceAd);
    const sections = normalizeSections(result?.sections, product, casillas);
    const design = result?.design || { tone: "direct-response premium", primary: "#111827", background: "#ffffff", radius: "14px" };
    const name = String(result?.name || `Landing · ${product.name}`);

    return res.json({ ok: true, generatedBy: result ? "ai" : "fallback", name, productId, strategy, sections, design,
      plantilla: { id: plantilla.id, nombre: plantilla.nombre, para: plantilla.para, cuando: plantilla.cuando }, source: sourceAd ? { type: "facebook-ad", data: sourceAd } : { type: "product", productId } });
  } catch (e) {
    return next(e);
  }
});

router.post("/:id/command", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const instruction = String(req.body?.instruction || "").trim();
    if (!instruction) return res.status(400).json({ message: "La instrucción está vacía." });

    const [landing] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).limit(1);
    if (!landing) return res.status(404).json({ message: "Landing no encontrada" });

    const current = { name: landing.name, strategy: landing.strategy, sections: landing.sections, design: landing.design, source: landing.source };
    const result = await callMarketingAI<any>({
      tenantId,
      json: true,
      maxTokens: 1800,
      systemPrompt: `Eres un editor de landing pages. Analiza la instrucción del usuario y el estado actual. Devuelve SOLO JSON con {message, operations}. No escribas prosa fuera del JSON. Las operaciones deben ser seguras y pequeñas. No inventes claims. Operaciones permitidas: update_section {sectionId,patch} (puedes parchear imagePrompt con un prompt en inglés para cambiar imagen), add_section {section} (con imagePrompt opcional), remove_section {sectionId}, move_section {sectionId,direction}, update_design {patch}, set_seo {patch}, set_cta {sectionId,cta}.`,
      userPrompt: JSON.stringify({ instruction, selectedSectionId: req.body?.selectedSectionId || null, current }),
    });

    if (!result?.operations || !Array.isArray(result.operations)) {
      return res.status(422).json({ ok: false, message: "El motor IA no pudo convertir la instrucción en una operación segura.", operations: [] });
    }
    return res.json({ ok: true, message: result.message || "Cambio preparado.", operations: result.operations });
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
