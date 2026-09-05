import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import type { TenantRequest } from "../lib/tenantManager";
import { callMarketingAI } from "../lib/marketing-team/ai";

const router = Router();

type LandingSection = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  body?: string;
  cta?: string;
};

const SECTION_TYPES = ["hero", "benefits", "offer", "before-after", "comparison", "authority", "testimonials", "how-it-works", "logistics", "faq", "cta"] as const;

function fallbackSections(product: any): LandingSection[] {
  const name = product?.name || "tu producto";
  return [
    { id: "hero", type: "hero", title: `${name}: una solución pensada para ti`, subtitle: product?.description || "Descubre una forma clara y sencilla de conseguir el resultado que buscas.", cta: "Quiero conocer la oferta" },
    { id: "benefits", type: "benefits", title: "Lo que puedes conseguir", subtitle: "Beneficios concretos, explicados sin promesas inventadas.", body: Array.isArray(product?.features) && product.features.length ? product.features.join(" · ") : "Más claridad, una experiencia sencilla y una propuesta enfocada en el resultado." },
    { id: "offer", type: "offer", title: "Conoce la oferta", subtitle: `Disponible por ${product?.price ?? "el precio indicado"} ${product?.currency ?? ""}`.trim(), body: "Revisa las condiciones reales de compra antes de confirmar." , cta: "Comprar ahora" },
    { id: "how-it-works", type: "how-it-works", title: "Así funciona", subtitle: "Un proceso simple para empezar.", body: "1. Elige la solución · 2. Completa tu compra · 3. Recibe las instrucciones o entrega correspondiente." },
    { id: "faq", type: "faq", title: "Preguntas frecuentes", subtitle: "Resolvemos las dudas que pueden frenar la decisión.", body: "¿Cómo recibo mi compra? · ¿Qué medios de pago están disponibles? · ¿Qué incluye exactamente?" },
    { id: "cta", type: "cta", title: "Da el siguiente paso", subtitle: "Si esta solución encaja contigo, puedes continuar con tu compra.", cta: "Comprar ahora" },
  ];
}

function normalizeSections(input: unknown, product: any): LandingSection[] {
  if (!Array.isArray(input)) return fallbackSections(product);
  const valid = input.filter((s: any) => s && typeof s === "object" && typeof s.id === "string" && SECTION_TYPES.includes(s.type));
  if (!valid.length) return fallbackSections(product);
  return valid.map((s: any) => {
    let image = s.image ? String(s.image) : undefined;
    if (!image && s.imagePrompt) {
      // Usar IA gratuita (Pollinations) para generar las imágenes on-the-fly al estilo Magic
      const enc = encodeURIComponent(String(s.imagePrompt) + ", high-end SaaS aesthetic, neon dark mode e-commerce magic style, professional photorealistic 3d render, 8k");
      image = `https://image.pollinations.ai/prompt/${enc}?width=1080&height=720&nologo=true`;
    }
    return {
      id: String(s.id), type: String(s.type), title: String(s.title || ""), subtitle: s.subtitle ? String(s.subtitle) : undefined,
      body: s.body ? String(s.body) : undefined, cta: s.cta ? String(s.cta) : undefined,
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

    const result = await callMarketingAI<any>({
      tenantId,
      json: true,
      maxTokens: 2200,
      systemPrompt: `Eres el Landing Agent de VentasPro. Construyes landing pages de respuesta directa que continúan la promesa del anuncio y convierten sin inventar datos. Devuelve SOLO JSON válido. Usa únicamente hechos presentes en PRODUCTO o ANUNCIO FUENTE; si falta un dato, no lo inventes. Nunca fabriques testimonios, garantías, descuentos, urgencia, certificaciones ni resultados cuantificados. Escribe en ${language} para ${country}. La salida debe ser utilizable por un editor visual.`,
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
    const sections = normalizeSections(result?.sections, product);
    const design = result?.design || { tone: "direct-response premium", primary: "#111827", background: "#ffffff", radius: "14px" };
    const name = String(result?.name || `Landing · ${product.name}`);

    return res.json({ ok: true, generatedBy: result ? "ai" : "fallback", name, productId, strategy, sections, design, source: sourceAd ? { type: "facebook-ad", data: sourceAd } : { type: "product", productId } });
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

export default router;
