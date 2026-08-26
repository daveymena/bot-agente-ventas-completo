/**
 * Sofía Conversational Engine
 *
 * Capa determinista para WhatsApp. La IA puede interpretar lenguaje y
 * redactar, pero NO define hechos comerciales, activos, precios ni promesas.
 *
 * Esta pieza es deliberadamente pura: no toca DB, proveedores de IA ni
 * WhatsApp. Esto permite probar la lógica comercial sin red ni credenciales.
 */

export type SofiaIntent =
  | "greeting"
  | "product_interest"
  | "price"
  | "details"
  | "faq"
  | "payment_methods"
  | "payment_link"
  | "payment_confirmation"
  | "objection_price"
  | "objection_trust"
  | "objection_time"
  | "delivery"
  | "media_request"
  | "comparison"
  | "recommendation"
  | "thanks"
  | "goodbye"
  | "unknown";

export type SofiaStage =
  | "greeting"
  | "discovery"
  | "consideration"
  | "evaluation"
  | "payment"
  | "verification"
  | "delivery"
  | "post_sale";

export type SofiaAssetKind = "image" | "video" | "catalog_card" | "payment";

export interface SofiaProductFacts {
  id: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  features: string[];
  imageUrl?: string | null;
  introVideoUrl?: string | null;
  paymentLinks?: Partial<Record<"card" | "paypal" | "pse" | "nequi" | "daviplata", string>>;
  deliveryLink?: string | null;
  faq?: Record<string, string>;
  kind?: "digital" | "physical";
}

export interface SofiaConversationState {
  productId?: number;
  stage: SofiaStage;
  lastIntent: SofiaIntent;
  factsAlreadyShared: string[];
  assetsSent: string[];
  paymentMethodsShown: string[];
  priceShown: boolean;
  productImageSent: boolean;
  introVideoSent: boolean;
  customerName?: string;
}

export interface SofiaMessageContext {
  text: string;
  state: SofiaConversationState;
  product?: SofiaProductFacts;
}

export interface SofiaDecision {
  intent: SofiaIntent;
  stage: SofiaStage;
  answerScope: "minimal" | "specific" | "expanded";
  shouldUseAI: boolean;
  shouldSendAsset: boolean;
  assetKind?: SofiaAssetKind;
  assetUrl?: string;
  allowedFacts: string[];
  forbiddenClaims: string[];
  suggestedFollowUp?: string;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const hasAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

/**
 * Detecta la intención del ÚLTIMO mensaje. No intenta reconstruir toda la
 * conversación ni usa respuestas anteriores como hechos.
 */
export function detectSofiaIntent(text: string): SofiaIntent {
  const t = normalize(text);
  if (!t) return "unknown";

  if (hasAny(t, ["gracias", "muchas gracias", "te agradezco"])) return "thanks";
  if (hasAny(t, ["chao", "adios", "hasta luego", "nos vemos"])) return "goodbye";
  if (hasAny(t, ["comprobante", "comprobante de pago", "ya pague", "ya hice el pago", "transferi"])) return "payment_confirmation";
  if (hasAny(t, ["cual enlace", "que enlace", "donde pago", "link de pago", "enlace de pago"])) return "payment_link";
  if (hasAny(t, ["como pago", "formas de pago", "medios de pago", "metodos de pago", "puedo pagar"])) return "payment_methods";
  if (hasAny(t, ["cuanto vale", "cuanto cuesta", "precio", "valor", "costo", "cuanto es"])) return "price";
  if (hasAny(t, ["que incluye", "que trae", "incluye", "caracteristicas", "mas informacion", "informacion del curso", "detalles"])) return "details";
  if (hasAny(t, ["cuando recibo", "como recibo", "como me llega", "acceso", "entrega"])) return "delivery";
  if (hasAny(t, ["es estafa", "es confiable", "puedo confiar", "es seguro", "tengo miedo", "no confio"])) return "objection_trust";
  if (hasAny(t, ["esta caro", "muy caro", "es mucho", "no tengo dinero", "no me alcanza"])) return "objection_price";
  if (hasAny(t, ["no tengo tiempo", "cuanto tiempo", "es dificil", "puedo aprender desde cero"])) return "objection_time";
  if (hasAny(t, ["video", "muestra una foto", "foto", "imagen", "verlo", "muestrame"])) return "media_request";
  if (hasAny(t, ["cual me recomiendas", "cual recomiendas", "que me recomiendas", "cual es mejor"])) return "recommendation";
  if (hasAny(t, ["entre", "comparar", "diferencia", "diferencias"])) return "comparison";
  if (hasAny(t, ["quiero el curso", "me interesa el curso", "me interesa", "quiero comprar", "quiero adquirir"])) return "product_interest";
  if (hasAny(t, ["hola", "buenas", "buenos dias", "buenas tardes", "buenas noches"])) return "greeting";
  if (hasAny(t, ["garantia", "certificado", "donde es", "academia", "soporte"])) return "faq";

  return "unknown";
}

function nextStage(intent: SofiaIntent, current: SofiaStage): SofiaStage {
  if (intent === "payment_confirmation") return "verification";
  if (intent === "payment_methods" || intent === "payment_link") return "payment";
  if (intent === "delivery") return "delivery";
  if (intent === "details" || intent === "faq" || intent === "media_request" || intent === "objection_trust" || intent === "objection_price" || intent === "objection_time") return "evaluation";
  if (intent === "price" || intent === "product_interest") return "consideration";
  if (intent === "greeting") return "discovery";
  if (intent === "thanks" || intent === "goodbye") return current;
  return current;
}

/**
 * Decide QUÉ debe decir/hacer el sistema antes de pedirle lenguaje a la IA.
 * Una pregunta de precio nunca autoriza a generar una ficha ni un cierre.
 */
export function planSofiaResponse(ctx: SofiaMessageContext): SofiaDecision {
  const intent = detectSofiaIntent(ctx.text);
  const stage = nextStage(intent, ctx.state.stage);
  const p = ctx.product;

  const allowedFacts = p
    ? [
        `name:${p.name}`,
        `price:${p.price} ${p.currency}`,
        ...p.features.map((f) => `feature:${f}`),
        ...(p.faq ? Object.entries(p.faq).map(([k, v]) => `faq:${k}=${v}`) : []),
      ]
    : [];

  const forbiddenClaims = [
    "inventar características, módulos, lecciones, grupos, certificados o beneficios",
    "mencionar un enlace de pago que no esté presente en paymentLinks",
    "decir que se envió una imagen/video/enlace cuando no existe una acción enviada",
    "prometer acceso, entrega o reembolso distinto a la ficha real",
    "usar información de otro producto",
    "repetir toda la ficha cuando el cliente hizo una pregunta concreta",
    "vosear: podés, necesitás, andás, querés",
  ];

  const base: SofiaDecision = {
    intent,
    stage,
    answerScope: "specific",
    shouldUseAI: true,
    shouldSendAsset: false,
    allowedFacts,
    forbiddenClaims,
  };

  switch (intent) {
    case "greeting":
      return { ...base, answerScope: "minimal", suggestedFollowUp: "preguntar qué producto le interesa" };
    case "price":
      return { ...base, answerScope: "minimal", suggestedFollowUp: "esperar la siguiente pregunta; no empujar pago automáticamente" };
    case "details":
      return { ...base, answerScope: "specific", suggestedFollowUp: "ofrecer una siguiente acción solo si aporta valor" };
    case "media_request":
      if (p?.introVideoUrl && !ctx.state.introVideoSent) {
        return { ...base, answerScope: "minimal", shouldSendAsset: true, assetKind: "video", assetUrl: p.introVideoUrl };
      }
      if (p?.imageUrl && !ctx.state.productImageSent) {
        return { ...base, answerScope: "minimal", shouldSendAsset: true, assetKind: "image", assetUrl: p.imageUrl };
      }
      return { ...base, answerScope: "minimal" };
    case "payment_methods":
      return { ...base, answerScope: "specific", shouldSendAsset: false };
    case "payment_link":
      return { ...base, answerScope: "specific", shouldSendAsset: true, assetKind: "payment" };
    case "payment_confirmation":
      return { ...base, answerScope: "minimal", shouldUseAI: false };
    case "objection_trust":
      return { ...base, answerScope: "specific", suggestedFollowUp: "usar únicamente garantía, modalidad, medios de pago y activos reales" };
    case "objection_price":
      return { ...base, answerScope: "specific", suggestedFollowUp: "responder valor/precio sin inventar descuentos" };
    case "objection_time":
      return { ...base, answerScope: "specific" };
    case "delivery":
      return { ...base, answerScope: "specific" };
    case "thanks":
    case "goodbye":
      return { ...base, answerScope: "minimal", shouldUseAI: false };
    default:
      return { ...base, answerScope: "specific" };
  }
}

/**
 * Validador de salida. Debe ejecutarse DESPUÉS de cualquier generación de IA
 * y antes de persistir/enviar el texto.
 */
export function validateSofiaOutput(
  output: string,
  decision: SofiaDecision,
  product?: SofiaProductFacts,
): { ok: boolean; sanitized: string; violations: string[] } {
  const violations: string[] = [];
  let sanitized = output.trim();

  if (!sanitized) return { ok: false, sanitized: "", violations: ["empty_response"] };

  const forbiddenPhrases = [
    "discord",
    "grupo privado",
    "24 lecciones",
    "auto-rítmico",
    "auto ritmico",
    "podés",
    "necesitás",
    "andás",
    "querés",
    "te dejo el link de pago acá abajo",
    "los enlaces de pago están listos abajo",
  ];

  for (const phrase of forbiddenPhrases) {
    if (normalize(sanitized).includes(normalize(phrase))) violations.push(`forbidden_phrase:${phrase}`);
  }

  if (product) {
    const mentionedPrice = sanitized.match(/\$\s?[\d.,]+/g) || [];
    if (mentionedPrice.length && !mentionedPrice.some((x) => normalize(x).includes(String(product.price)))) {
      violations.push("price_not_matching_catalog");
    }

    // Si la pregunta fue precio, no permitimos que la respuesta derive en ficha.
    if (decision.intent === "price") {
      const lines = sanitized.split(/\n+/).filter(Boolean);
      if (lines.length > 4 || /incluye|acceso|garantia|pago|enlace|drive/i.test(sanitized)) {
        violations.push("price_answer_scope_exceeded");
      }
    }
  }

  if (decision.intent === "payment_link" && !product?.paymentLinks) {
    violations.push("payment_link_without_catalog_link");
  }

  return { ok: violations.length === 0, sanitized, violations };
}

/**
 * Construye un estado nuevo sin contaminar la memoria con lo que la IA quiso
 * decir. Solo registra lo que realmente fue enviado.
 */
export function applySofiaSentState(
  state: SofiaConversationState,
  decision: SofiaDecision,
  sentAsset?: { kind: SofiaAssetKind; id: string },
  sentFactKeys: string[] = [],
): SofiaConversationState {
  const next: SofiaConversationState = {
    ...state,
    stage: decision.stage,
    lastIntent: decision.intent,
    factsAlreadyShared: [...new Set([...state.factsAlreadyShared, ...sentFactKeys])],
    assetsSent: [...state.assetsSent],
    paymentMethodsShown: [...state.paymentMethodsShown],
    priceShown: state.priceShown || decision.intent === "price",
    productImageSent: state.productImageSent,
    introVideoSent: state.introVideoSent,
  };

  if (sentAsset) {
    next.assetsSent = [...new Set([...next.assetsSent, sentAsset.id])];
    if (sentAsset.kind === "image") next.productImageSent = true;
    if (sentAsset.kind === "video") next.introVideoSent = true;
  }

  return next;
}
