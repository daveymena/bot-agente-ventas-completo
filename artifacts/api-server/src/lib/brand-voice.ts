/**
 * ============================================================
 * BRAND VOICE — Firma Visual y Tono por Negocio
 * ============================================================
 *
 * Cada negocio define su propia identidad visual y tono.
 * El sistema adapta TODAS las respuestas a esa firma.
 */

export type ToneStyle =
  | "warm_professional" | "energetic" | "inspiring" | "formal"
  | "friendly_casual" | "educational" | "luxury" | "technical";

export type EmojiSet = {
  greeting: string; product: string; benefit: string; price: string;
  delivery: string; guarantee: string; payment: string; urgency: string;
  success: string; question: string; separator: string;
};

export interface BrandVoice {
  businessName: string;
  agentName: string;
  agentRole: string;
  niche: string;
  tone: ToneStyle;
  language: "es" | "en" | "pt";
  formality: "tú" | "usted";
  emojis: EmojiSet;
  separatorChar: string;
  separatorLength: number;
  signature?: string;
  phrases: {
    greeting_new: string;
    greeting_return: string;
    product_intro: string;
    payment_ready: string;
    objection_empathy: string;
    closing_question: string;
    farewell: string;
    guarantee_mention: string;
  };
  deliveryInfo: { method: string; timeframe: string; details: string };
  guaranteeInfo: { days: number; description: string };
  accessInfo: { type: string; description: string };
}

export const TECNOVARIEDADES_VOICE: BrandVoice = {
  businessName: "TecnoVariedades D&S",
  agentName: "Sofía",
  agentRole: "Asesora de Ventas",
  niche: "digital_products",
  tone: "warm_professional",
  language: "es",
  formality: "tú",
  emojis: {
    greeting: "🎯", product: "🎓", benefit: "✅", price: "💰",
    delivery: "📦", guarantee: "🛡️", payment: "💳", urgency: "⚡",
    success: "🎉", question: "🤔", separator: "━",
  },
  separatorChar: "━",
  separatorLength: 23,
  signature: "_TecnoVariedades D&S — Cursos y Megapacks Digitales_",
  phrases: {
    greeting_new: "¡Hola! 👋 Bienvenido a *TecnoVariedades*. ¿Qué estás buscando hoy?",
    greeting_return: "¡Hey! Qué bueno verte de nuevo 😊 ¿En qué te ayudo?",
    product_intro: "Mira esto 👇",
    payment_ready: "Listo, te dejo las opciones para pagar 💳",
    objection_empathy: "Entiendo perfectamente tu preocupación 🤝",
    closing_question: "Quedo a tu disposición si deseas proceder o si necesitas más información. 😊",
    farewell: "¡Fue un placer atenderte! Cualquier duda, aquí estoy 🌟",
    guarantee_mention: "Tienes *7 días de garantía* — si no estás satisfecho, te devolvemos el dinero sin preguntas 🛡️",
  },
  deliveryInfo: {
    method: "Google Drive",
    timeframe: "inmediato",
    details: "La entrega es *100% digital*. Una vez confirmado tu pago, recibes el enlace de Google Drive directamente por este chat. ¡Acceso inmediato desde cualquier dispositivo! ✅",
  },
  guaranteeInfo: {
    days: 7,
    description: "Tienes *7 días de garantía* sin preguntas. Si por cualquier razón no estás satisfecho, te devolvemos el dinero completo. Sin complicaciones. ✅",
  },
  accessInfo: {
    type: "de por vida",
    description: "El acceso es *de por vida*. No caduca, no tiene mensualidad. Pagas una sola vez y el contenido es tuyo para siempre. ✅",
  },
};

export const DROPSHIPPING_VOICE: BrandVoice = {
  businessName: "Mi Tienda", agentName: "Max", agentRole: "Asesor de Ventas",
  niche: "dropshipping", tone: "energetic", language: "es", formality: "tú",
  emojis: { greeting: "🛒", product: "📦", benefit: "✅", price: "🏷️", delivery: "🚚", guarantee: "🔒", payment: "💳", urgency: "🔥", success: "🎉", question: "❓", separator: "─" },
  separatorChar: "─", separatorLength: 23,
  phrases: {
    greeting_new: "¡Hola! 👋 Bienvenido/a a nuestra tienda.\n¿En qué producto puedo ayudarte hoy? 🛒",
    greeting_return: "¡Hola de nuevo! 😊 ¿Qué necesitas hoy?",
    product_intro: "¡Mira esto! 👇",
    payment_ready: "¡Listo para pagar! 💳 Aquí tienes las opciones:",
    objection_empathy: "Te entiendo 🤝",
    closing_question: "¿Lo pedimos? 🚚",
    farewell: "¡Gracias por tu compra! Cualquier duda, escríbenos 😊",
    guarantee_mention: "Tienes *30 días de garantía* — si hay algún problema, lo resolvemos 🔒",
  },
  deliveryInfo: { method: "envío físico", timeframe: "3-7 días hábiles", details: "El envío es a domicilio en *3-7 días hábiles* según tu ciudad. Te enviamos el número de guía por este chat para que puedas rastrear tu pedido. 🚚" },
  guaranteeInfo: { days: 30, description: "Tienes *30 días de garantía*. Si el producto llega dañado o no es lo que esperabas, lo cambiamos o te devolvemos el dinero. ✅" },
  accessInfo: { type: "entrega física", description: "El producto llega a tu domicilio en *3-7 días hábiles*. Te notificamos cuando salga de bodega. 📦" },
};

export const SERVICES_VOICE: BrandVoice = {
  businessName: "Mi Agencia", agentName: "Carlos", agentRole: "Consultor", niche: "services",
  tone: "formal", language: "es", formality: "usted",
  emojis: { greeting: "💼", product: "📋", benefit: "✅", price: "💰", delivery: "📅", guarantee: "🤝", payment: "💳", urgency: "⏰", success: "✨", question: "❓", separator: "═" },
  separatorChar: "═", separatorLength: 23,
  phrases: {
    greeting_new: "Buenos días/tardes. Bienvenido/a. 💼\n¿En qué servicio puedo asesorarle hoy?",
    greeting_return: "Bienvenido/a de nuevo. ¿En qué le puedo ayudar?",
    product_intro: "Le presento nuestra propuesta: 📋",
    payment_ready: "Perfecto. Aquí están las opciones para proceder con el pago: 💳",
    objection_empathy: "Comprendo su preocupación. Permítame explicarle 🤝",
    closing_question: "¿Tiene alguna pregunta adicional antes de proceder?",
    farewell: "Ha sido un placer. Quedamos a su disposición. ✨",
    guarantee_mention: "Incluimos *garantía de satisfacción* — si no cumplimos los entregables acordados, hacemos las correcciones necesarias sin costo adicional 🤝",
  },
  deliveryInfo: { method: "entrega digital / videollamada", timeframe: "según cronograma acordado", details: "La entrega se realiza según el cronograma acordado en el contrato. Los entregables digitales se envían por correo electrónico y los servicios presenciales/virtuales se coordinan por agenda. 📅" },
  guaranteeInfo: { days: 14, description: "Incluimos *14 días de revisiones* sin costo adicional. Si los entregables no cumplen las especificaciones acordadas, realizamos los ajustes necesarios. 🤝" },
  accessInfo: { type: "según contrato", description: "El acceso y duración del servicio se define en el contrato. Incluye soporte durante el período acordado. 📋" },
};

export function getBrandVoice(agentMetadata?: Record<string, any> | null, settingsData?: { businessName?: string } | null): BrandVoice {
  if (agentMetadata?.brandVoice) return agentMetadata.brandVoice as BrandVoice;
  const niche = agentMetadata?.niche || agentMetadata?.agentType || "digital_products";
  const presets: Record<string, BrandVoice> = {
    digital_products: TECNOVARIEDADES_VOICE, courses: TECNOVARIEDADES_VOICE,
    dropshipping: DROPSHIPPING_VOICE, services: SERVICES_VOICE, marketing: SERVICES_VOICE,
    b2b: SERVICES_VOICE, telecom: SERVICES_VOICE, subscriptions: TECNOVARIEDADES_VOICE,
    followup: TECNOVARIEDADES_VOICE, general: TECNOVARIEDADES_VOICE,
  };
  const voice = presets[niche] || TECNOVARIEDADES_VOICE;
  return settingsData?.businessName && settingsData.businessName !== "Mi Negocio"
    ? { ...voice, businessName: settingsData.businessName }
    : voice;
}

/**
 * Formato visual HUMANO para WhatsApp.
 *
 * No agrega decoraciones a la fuerza. Lee el contenido que ya produjo el
 * agente y le da ritmo: aperturas menos mecánicas, aire entre ideas y
 * presentación natural de respuestas de precio/datos puntuales.
 */
function hashTexto(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function humanizarWhatsApp(content: string, voice: BrandVoice): string {
  let result = content.trim();
  if (!result) return result;

  // Elimina aperturas de plantilla sin alterar el significado posterior.
  const aperturas = [
    "Claro que sí!", "Claro que sí.", "Claro que sí 😊", "¡Claro que sí!",
    "Perfecto!", "Perfecto.", "¡Perfecto!", "Genial!", "Genial.", "¡Genial!",
  ];
  const aperturaNatural = ["Claro 😊", "Sí, claro.", "Te cuento:", "Sí 🙌", "Por supuesto 😊"];
  const idx = hashTexto(result) % aperturaNatural.length;
  for (const apertura of aperturas) {
    if (result.toLowerCase().startsWith(apertura.toLowerCase())) {
      result = aperturaNatural[idx] + result.slice(apertura.length);
      break;
    }
  }

  // Si el modelo entregó varias ideas en un solo párrafo, dales aire sin
  // convertir todo en una lista artificial.
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/[ \t]+([,.;!?])/g, "$1");
  result = result.replace(/([¡¿])[ \t]+/g, "$1");

  // Precio puntual: se mantiene conversacional; no se envuelve siempre en
  // encabezados ni separadores. El emoji solo aparece si ya lo puso el agente.
  const soloPrecio = /^(?:💰\s*)?(?:\*?\$[\d.,]+\s*(?:COP|USD|EUR)?\*?)(?:\s*[.!])?$/i.test(result);
  if (soloPrecio && !result.startsWith("💰")) {
    const formas = ["💰 ", ""];
    result = formas[hashTexto(result) % formas.length] + result;
  }

  // Evita cierres robóticos repetidos cuando la respuesta ya entregó el dato.
  result = result.replace(/\n?¿(?:te|quieres) (?:paso|muestro) (?:el )?precio\?\s*$/i, "");
  result = result.replace(/\n?¿(?:te|quieres) (?:que )?te muestro cómo es por dentro\?\s*$/i, "");

  return result.trim();
}

export function formatWithBrandVoice(content: string, voice: BrandVoice, options: { addSeparator?: boolean; addSignature?: boolean; isImportant?: boolean } = {}): string {
  let result = humanizarWhatsApp(content, voice);

  // Los separadores/firma quedan bajo control explícito del llamador.
  if (options.isImportant && options.addSeparator) {
    const sep = voice.separatorChar.repeat(voice.separatorLength);
    result = `${sep}\n${result}\n${sep}`;
  }
  if (options.addSignature && voice.signature) result = `${result}\n\n${voice.signature}`;
  return result;
}

export function makeSeparator(voice: BrandVoice): string {
  return voice.separatorChar.repeat(voice.separatorLength);
}
