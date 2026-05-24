/**
 * ============================================================
 * BRAND VOICE — Firma Visual y Tono por Negocio
 * ============================================================
 *
 * Cada negocio define su propia identidad visual y tono.
 * El sistema adapta TODAS las respuestas a esa firma.
 *
 * Adaptable a cualquier nicho:
 *  - Cursos digitales (TecnoVariedades)
 *  - Dropshipping / productos físicos
 *  - Servicios profesionales
 *  - Telecomunicaciones
 *  - Restaurantes / comida
 *  - Salud y bienestar
 *  - Inmobiliaria
 *  - etc.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ToneStyle =
  | "warm_professional"   // Cálido y profesional (cursos, servicios)
  | "energetic"           // Energético y urgente (dropshipping, ofertas)
  | "inspiring"           // Inspirador y emocional (coaching, bienestar)
  | "formal"              // Formal y corporativo (B2B, legal, finanzas)
  | "friendly_casual"     // Amigable y casual (restaurantes, moda)
  | "educational"         // Educativo y paciente (cursos, tutorías)
  | "luxury"              // Exclusivo y premium (lujo, alta gama)
  | "technical";          // Técnico y preciso (tecnología, software)

export type EmojiSet = {
  greeting: string;       // Para saludos
  product: string;        // Para mostrar productos
  benefit: string;        // Para listar beneficios
  price: string;          // Para precios
  delivery: string;       // Para entrega/acceso
  guarantee: string;      // Para garantías
  payment: string;        // Para pagos
  urgency: string;        // Para urgencia/escasez
  success: string;        // Para confirmaciones
  question: string;       // Para preguntas de cierre
  separator: string;      // Separador visual
};

export interface BrandVoice {
  // Identidad
  businessName: string;
  agentName: string;
  agentRole: string;
  niche: string;           // "digital_products" | "dropshipping" | "services" | etc.

  // Tono y estilo
  tone: ToneStyle;
  language: "es" | "en" | "pt";
  formality: "tú" | "usted";   // Tratamiento al cliente

  // Visual
  emojis: EmojiSet;
  separatorChar: string;   // "━" | "─" | "•" | "=" | "~"
  separatorLength: number; // Cuántos caracteres de separador

  // Firma al final de mensajes importantes (opcional)
  signature?: string;      // Ej: "_TecnoVariedades D&S — Cursos Digitales_"

  // Frases características del negocio
  phrases: {
    greeting_new: string;       // Primera vez que escribe
    greeting_return: string;    // Cliente que regresa
    product_intro: string;      // Antes de mostrar un producto
    payment_ready: string;      // Cuando va a dar links de pago
    objection_empathy: string;  // Inicio de manejo de objeción
    closing_question: string;   // Pregunta de cierre estándar
    farewell: string;           // Despedida
    guarantee_mention: string;  // Cómo menciona la garantía
  };

  // Información del negocio para respuestas hardcodeadas
  deliveryInfo: {
    method: string;        // "Google Drive" | "envío físico" | "videollamada" | etc.
    timeframe: string;     // "inmediato" | "3-7 días" | "24h" | etc.
    details: string;       // Descripción completa de cómo funciona la entrega
  };
  guaranteeInfo: {
    days: number;
    description: string;
  };
  accessInfo: {
    type: string;          // "de por vida" | "mensual" | "anual" | etc.
    description: string;
  };
}

// ─── Preset por defecto: TecnoVariedades (cursos digitales) ──────────────────

export const TECNOVARIEDADES_VOICE: BrandVoice = {
  businessName: "TecnoVariedades D&S",
  agentName: "Sofía",
  agentRole: "Asesora de Ventas",
  niche: "digital_products",

  tone: "warm_professional",
  language: "es",
  formality: "tú",

  emojis: {
    greeting:   "🎯",
    product:    "🎓",
    benefit:    "✅",
    price:      "💰",
    delivery:   "📦",
    guarantee:  "🛡️",
    payment:    "💳",
    urgency:    "⚡",
    success:    "🎉",
    question:   "🤔",
    separator:  "━",
  },
  separatorChar: "━",
  separatorLength: 23,

  signature: "_TecnoVariedades D&S — Cursos y Megapacks Digitales_",

  phrases: {
    greeting_new:
      "¡Bienvenido/a a *TecnoVariedades D&S*! 🔥\nEs un placer saludarte.\n\nEstoy a tu entera disposición para ayudarte con lo que necesites hoy. 😊",
    greeting_return:
      "¡Qué gusto verte de nuevo! 🌟\n¿En qué puedo ayudarte hoy?",
    product_intro:
      "¡Justo lo que necesitas! 👇",
    payment_ready:
      "¡Perfecto! Los enlaces de pago están listos 💳\nPuedes pagar con tarjeta, PayPal, Nequi o Daviplata:",
    objection_empathy:
      "Entiendo perfectamente tu preocupación 🤝",
    closing_question:
      "¿Tienes alguna pregunta antes de proceder? 😊",
    farewell:
      "¡Fue un placer atenderte! Cualquier duda, aquí estoy 🌟",
    guarantee_mention:
      "Tienes *7 días de garantía* — si no estás satisfecho, te devolvemos el dinero sin preguntas 🛡️",
  },

  deliveryInfo: {
    method: "Google Drive",
    timeframe: "inmediato",
    details:
      "La entrega es *100% digital*. Una vez confirmado tu pago, recibes el enlace de Google Drive directamente por este chat. ¡Acceso inmediato desde cualquier dispositivo! ✅",
  },
  guaranteeInfo: {
    days: 7,
    description:
      "Tienes *7 días de garantía* sin preguntas. Si por cualquier razón no estás satisfecho, te devolvemos el dinero completo. Sin complicaciones. ✅",
  },
  accessInfo: {
    type: "de por vida",
    description:
      "El acceso es *de por vida*. No caduca, no tiene mensualidad. Pagas una sola vez y el contenido es tuyo para siempre. ✅",
  },
};

// ─── Presets para otros nichos ────────────────────────────────────────────────

export const DROPSHIPPING_VOICE: BrandVoice = {
  businessName: "Mi Tienda",
  agentName: "Max",
  agentRole: "Asesor de Ventas",
  niche: "dropshipping",

  tone: "energetic",
  language: "es",
  formality: "tú",

  emojis: {
    greeting:   "🛒",
    product:    "📦",
    benefit:    "✅",
    price:      "🏷️",
    delivery:   "🚚",
    guarantee:  "🔒",
    payment:    "💳",
    urgency:    "🔥",
    success:    "🎉",
    question:   "❓",
    separator:  "─",
  },
  separatorChar: "─",
  separatorLength: 23,

  phrases: {
    greeting_new:
      "¡Hola! 👋 Bienvenido/a a nuestra tienda.\n¿En qué producto puedo ayudarte hoy? 🛒",
    greeting_return:
      "¡Hola de nuevo! 😊 ¿Qué necesitas hoy?",
    product_intro:
      "¡Mira esto! 👇",
    payment_ready:
      "¡Listo para pagar! 💳 Aquí tienes las opciones:",
    objection_empathy:
      "Te entiendo 🤝",
    closing_question:
      "¿Lo pedimos? 🚚",
    farewell:
      "¡Gracias por tu compra! Cualquier duda, escríbenos 😊",
    guarantee_mention:
      "Tienes *30 días de garantía* — si hay algún problema, lo resolvemos 🔒",
  },

  deliveryInfo: {
    method: "envío físico",
    timeframe: "3-7 días hábiles",
    details:
      "El envío es a domicilio en *3-7 días hábiles* según tu ciudad. Te enviamos el número de guía por este chat para que puedas rastrear tu pedido. 🚚",
  },
  guaranteeInfo: {
    days: 30,
    description:
      "Tienes *30 días de garantía*. Si el producto llega dañado o no es lo que esperabas, lo cambiamos o te devolvemos el dinero. ✅",
  },
  accessInfo: {
    type: "entrega física",
    description:
      "El producto llega a tu domicilio en *3-7 días hábiles*. Te notificamos cuando salga de bodega. 📦",
  },
};

export const SERVICES_VOICE: BrandVoice = {
  businessName: "Mi Agencia",
  agentName: "Carlos",
  agentRole: "Consultor",
  niche: "services",

  tone: "formal",
  language: "es",
  formality: "usted",

  emojis: {
    greeting:   "💼",
    product:    "📋",
    benefit:    "✅",
    price:      "💰",
    delivery:   "📅",
    guarantee:  "🤝",
    payment:    "💳",
    urgency:    "⏰",
    success:    "✨",
    question:   "❓",
    separator:  "═",
  },
  separatorChar: "═",
  separatorLength: 23,

  phrases: {
    greeting_new:
      "Buenos días/tardes. Bienvenido/a. 💼\n¿En qué servicio puedo asesorarle hoy?",
    greeting_return:
      "Bienvenido/a de nuevo. ¿En qué le puedo ayudar?",
    product_intro:
      "Le presento nuestra propuesta: 📋",
    payment_ready:
      "Perfecto. Aquí están los datos para proceder con el pago: 💳",
    objection_empathy:
      "Comprendo su preocupación. Permítame explicarle 🤝",
    closing_question:
      "¿Tiene alguna pregunta adicional antes de proceder?",
    farewell:
      "Ha sido un placer. Quedamos a su disposición. ✨",
    guarantee_mention:
      "Incluimos *garantía de satisfacción* — si no cumplimos los entregables acordados, hacemos las correcciones necesarias sin costo adicional 🤝",
  },

  deliveryInfo: {
    method: "entrega digital / videollamada",
    timeframe: "según cronograma acordado",
    details:
      "La entrega se realiza según el cronograma acordado en el contrato. Los entregables digitales se envían por correo electrónico y los servicios presenciales/virtuales se coordinan por agenda. 📅",
  },
  guaranteeInfo: {
    days: 14,
    description:
      "Incluimos *14 días de revisiones* sin costo adicional. Si los entregables no cumplen las especificaciones acordadas, realizamos los ajustes necesarios. 🤝",
  },
  accessInfo: {
    type: "según contrato",
    description:
      "El acceso y duración del servicio se define en el contrato. Incluye soporte durante el período acordado. 📋",
  },
};

// ─── Función para obtener la voz del negocio ──────────────────────────────────

export function getBrandVoice(
  agentMetadata?: Record<string, any> | null,
  settingsData?: { businessName?: string } | null
): BrandVoice {
  // Si el agente tiene una voz personalizada en su metadata, usarla
  if (agentMetadata?.brandVoice) {
    return agentMetadata.brandVoice as BrandVoice;
  }

  // Si el agente tiene un niche definido, usar el preset correspondiente
  const niche = agentMetadata?.niche || agentMetadata?.agentType || "digital_products";

  const presets: Record<string, BrandVoice> = {
    digital_products: TECNOVARIEDADES_VOICE,
    courses: TECNOVARIEDADES_VOICE,
    dropshipping: DROPSHIPPING_VOICE,
    services: SERVICES_VOICE,
    marketing: SERVICES_VOICE,
    b2b: SERVICES_VOICE,
    telecom: SERVICES_VOICE,
    subscriptions: TECNOVARIEDADES_VOICE,
    followup: TECNOVARIEDADES_VOICE,
    general: TECNOVARIEDADES_VOICE,
  };

  const voice = presets[niche] || TECNOVARIEDADES_VOICE;

  // Personalizar con el nombre del negocio si está disponible
  if (settingsData?.businessName && settingsData.businessName !== "Mi Negocio") {
    return {
      ...voice,
      businessName: settingsData.businessName,
    };
  }

  return voice;
}

// ─── Formateador de respuestas con la firma visual ────────────────────────────

export function formatWithBrandVoice(
  content: string,
  voice: BrandVoice,
  options: {
    addSeparator?: boolean;
    addSignature?: boolean;
    isImportant?: boolean;   // Para mensajes de producto/pago
  } = {}
): string {
  let result = content.trim();

  // Agregar separador visual si es un mensaje importante
  if (options.isImportant && options.addSeparator) {
    const sep = voice.separatorChar.repeat(voice.separatorLength);
    result = `${sep}\n${result}\n${sep}`;
  }

  // Agregar firma si se solicita
  if (options.addSignature && voice.signature) {
    result = `${result}\n\n${voice.signature}`;
  }

  return result;
}

// ─── Constructor del separador visual ─────────────────────────────────────────

export function makeSeparator(voice: BrandVoice): string {
  return voice.separatorChar.repeat(voice.separatorLength);
}
