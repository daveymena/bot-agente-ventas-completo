/**
 * ============================================================
 * CONVERSATION ENGINE — Motor Central de Conversación
 * ============================================================
 *
 * Fuente única de verdad para:
 *  - Detectar intención del mensaje entrante
 *  - Determinar la etapa actual de la conversación
 *  - Construir el contexto estructurado para la IA
 *  - Decidir qué producto mostrar (o no)
 *  - Guardar mensajes del agente en BD con metadata
 *
 * PRINCIPIOS:
 *  - Toda decisión es determinista y trazable
 *  - Nada se improvisa: cada respuesta tiene una razón documentada
 *  - El historial de BD es la única fuente de verdad (no estado en memoria)
 *  - Sin repetición: el motor verifica qué se dijo antes de decidir qué decir
 */

import { eq, and, desc } from "drizzle-orm";
import { db, conversations, messages, products, productCategories } from "@workspace/db";
import type { MessageMetadata } from "@workspace/db";

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export type Intent =
  | "greeting"       // Saludo inicial o de retorno
  | "product_query"  // Pregunta sobre un producto específico
  | "details_query"  // Pregunta sobre detalles (entrega, garantía, acceso, duración)
  | "payment_intent" // Quiere pagar / pide links / métodos de pago
  | "objection"      // Objeción de precio, desconfianza, etc.
  | "confirmation"   // Confirma compra o acción
  | "human_handoff"  // Pide hablar con un humano / asesor personal
  | "leaving"        // Se despide o pierde interés
  | "general";       // Cualquier otra cosa

export type Stage =
  | "greeting"
  | "discovery"
  | "presentation"
  | "details"
  | "objection_handling"
  | "closing"
  | "post_sale";

export interface ConversationMemory {
  // Historial completo de mensajes (de BD)
  history: Array<{
    id: number;
    role: string;
    content: string;
    stage: string | null;
    metadata: MessageMetadata | null;
    createdAt: Date;
  }>;

  // Estado derivado del historial
  hasGreeted: boolean;           // El agente ya envió al menos un mensaje
  currentStage: Stage;           // Etapa actual de la conversación
  currentProductId: number | null; // Producto activo en la conversación
  currentProductName: string | null;
  sentProductIds: Set<number>;   // Todos los productos cuya card ya se envió
  lastCustomerMessage: string;   // Último mensaje del cliente
  lastAgentMessage: string;      // Último mensaje del agente
  messageCount: number;          // Total de mensajes del cliente
  isNewSession: boolean;         // Han pasado >4h desde el último mensaje
  sessionStartedAt: Date | null;

  // ── Estado de pago ─────────────────────────────────────────────────────────
  paymentStatus: string | null;  // pending | confirmed | rejected | refunded
  paymentMethod: string | null;  // nequi | daviplata | transferencia | mercadopago | paypal
  paymentAmount: number | null;
  paidAt: Date | null;
}

export interface EngineDecision {
  intent: Intent;
  stage: Stage;
  shouldSendCard: boolean;
  productToShow: { id: number; name: string; price: number; currency: string; description: string; features: string[] } | null;
  shouldGreet: boolean;
  isRepeatGreeting: boolean;
  contextBlock: string;          // Bloque de contexto para inyectar en el prompt
  debugReason: string;           // Razón legible de la decisión (para logs)
  searchReasoning: string | null; // Razonamiento de la búsqueda de producto (para prompt)
  productSearchFailed: boolean;  // Si no se encontró un producto adecuado

  // ── Estado de pago ─────────────────────────────────────────────────────────
  paymentStatus: string | null;  // Estado de pago detectado/actualizado
  paymentMethod: string | null;
  paymentAmount: number | null;
}

// ─── Constantes de detección ───────────────────────────────────────────────────

const GREETING_PATTERNS = [
  "hola", "buenas", "buen dia", "buenos dias", "buenas tardes",
  "buenas noches", "que tal", "como estas", "ola", "saludos",
  "hey", "hi", "hello", "buen día"
];

const DETAILS_PATTERNS = [
  "cómo", "como", "cuándo", "cuando", "dónde", "donde",
  "entrega", "entregan", "acceso", "garantía", "garantia",
  "incluye", "tiene", "trae", "soporte", "duración", "duracion",
  "tiempo", "funciona", "descarga", "drive", "google", "plataforma",
  "cuánto tarda", "cuanto tarda", "qué incluye", "que incluye"
];

const PAYMENT_PATTERNS = [
  "pago", "pagar", "comprar", "adquirir", "compro",
  "nequi", "daviplata", "transferencia", "transferir",
  "cuenta", "link", "enlace", "precio", "cuánto cuesta",
  "cuanto cuesta", "costo", "vale", "confirmo", "confirmar",
  "procedo", "adelante", "vamos", "dale", "lo quiero", "lo compro"
];

const OBJECTION_PATTERNS = [
  "caro", "costoso", "muy caro", "mucho dinero", "pensarlo",
  "no sé", "no se", "duda", "dudas", "inseguro", "desconfío", "desconfio",
  "estafa", "devolución", "devolucion",
  "reembolso", "no tengo", "sin dinero", "después", "luego",
  "lo pienso", "déjame pensar", "más barato", "descuento", "promoción", "promocion"
];

const CONFIRMATION_PATTERNS = [
  "sí", "si", "ok", "dale", "bueno", "perfecto", "listo",
  "me gustaría", "me gustaria", "adelante", "vamos",
  "de acuerdo", "claro", "por supuesto"
];

const LEAVING_PATTERNS = [
  "adiós", "adios", "chao", "chau", "gracias", "hasta luego",
  "no gracias", "no me interesa", "no quiero", "déjame",
  "molestando", "bye", "hasta pronto"
];

// Patrones que activan el desvío a humano
const HUMAN_HANDOFF_PATTERNS = [
  "habla con humano", "hablar con humano", "quiero hablar con humano",
  "habla con una persona", "hablar con una persona",
  "necesito un asesor", "quiero un asesor",
  "atender un humano", "atención humana", "atencion humana",
  "persona real", "no eres un robot",
  "no me entiendes", "ya te dije que no me entiendes",
  "no me resuelve", "no me ayudas",
  "mejor con una persona", "prefiero hablar con una persona",
  "transfiere", "transfiereme", "conecta con un asesor",
  "soporte humano", "ayuda humana",
];

// Palabras que NO identifican un producto (son preguntas genéricas)
const GENERIC_WORDS = new Set([
  "entrega", "entregan", "acceso", "garantia", "garantía", "soporte",
  "descarga", "drive", "google", "duracion", "duración", "tiempo",
  "incluye", "tiene", "trae", "precio", "valor", "cuanto", "cuánto",
  "cual", "cuál", "transfiere",
  "quiero", "necesito", "funciona", "clases", "lecciones", "modulos",
  "comprar", "adquirir", "pago", "pagar", "link", "enlace", "nequi",
  "daviplata", "transferencia", "dale", "vamos", "adelante",
  "horas", "video", "hora", "cómo", "como", "están", "estan",
  "estado", "estas", "estás", "información", "informacion", "info",
  "detalles", "más", "mas", "saber", "conocer", "ver",
  "interesa", "interes", "interesado", "interesada",
  "busco", "buscando", "buscas",
]);

const STOP_WORDS = new Set([
  "el", "la", "los", "las", "lo", "de", "del", "un", "una",
  "que", "por", "para", "con", "me", "se", "es", "en", "y",
  "e", "a", "su", "le", "no", "te", "les", "nos", "os", "al",
  "este", "esta", "ese", "esa", "mi", "tu", "si", "hay",
  "también", "tambien", "tienes", "tiene", "tengo", "son",
  "muy", "más", "mas", "ya", "fue", "fui", "era",
]);

// ─── Respuestas hardcodeadas para preguntas frecuentes ───────────────────────
// Estas respuestas son deterministas — no dependen de la IA

const DELIVERY_PATTERNS = [
  "entrega", "entregan", "llega", "recibo", "recibir", "cómo llega",
  "como llega", "cómo me lo", "como me lo", "cómo lo recibo", "como lo recibo",
  "dónde lo", "donde lo", "cómo funciona la entrega", "como funciona"
];

const ACCESS_PATTERNS = [
  "acceso", "cómo accedo", "como accedo", "cómo entro", "como entro",
  "dónde descargo", "donde descargo", "cómo descargo", "como descargo",
  "link de acceso", "enlace de acceso", "cómo lo uso", "como lo uso"
];

const GUARANTEE_PATTERNS = [
  "garantía", "garantia", "devolución", "devolucion", "reembolso",
  "si no me gusta", "si no funciona", "puedo devolver", "política de"
];

const DURATION_PATTERNS = [
  "duración", "duracion", "cuánto dura", "cuanto dura", "por cuánto tiempo",
  "por cuanto tiempo", "caduca", "vence", "expira", "de por vida", "permanente"
];

const CONTENT_PATTERNS = [
  "contenido", "qué incluye", "que incluye", "qué trae", "que trae",
  "qué viene", "que viene", "qué tiene", "que tiene", "qué hay",
  "que hay", "módulos", "modulos", "lecciones", "clases", "videos",
  "material", "archivos", "pdfs", "recursos"
];

const SUPPORT_PATTERNS = [
  "soporte", "ayuda", "asistencia", "dudas", "preguntas", "contacto",
  "tutor", "profesor", "instructor", "acompañamiento"
];

// ─── Sub-intenciones de pago (detectadas ANTES de payment_intent genérico) ───
// Estas evitan que se re-envíe la card de pago cuando el cliente:
//   1. Elige un método específico (Nequi, PayPal, etc.)
//   2. Avisa que va a enviar comprobante / ya pagó
//   3. Pregunta cómo / qué enviar para pagar

// Pares [método_normalizado, patrones_que_lo_indican]
const PAYMENT_METHOD_CHOICE_MAP: Array<{ method: string; patterns: string[] }> = [
  {
    method: "nequi",
    patterns: [
      "por nequi", "con nequi", "via nequi", "vía nequi",
      "pagaré nequi", "pagare nequi", "pagaré por nequi", "pagare por nequi",
      "voy con nequi", "prefiero nequi", "me voy por nequi",
      "transfiero por nequi", "transferir por nequi",
    ],
  },
  {
    method: "daviplata",
    patterns: [
      "por daviplata", "con daviplata", "via daviplata", "vía daviplata",
      "pagaré daviplata", "pagare daviplata", "pagaré por daviplata", "pagare por daviplata",
      "voy con daviplata", "prefiero daviplata",
    ],
  },
  {
    method: "transferencia",
    patterns: [
      "por transferencia", "con transferencia", "via transferencia", "vía transferencia",
      "transferencia bancaria", "transferencia directa",
      "voy a transferir", "voy con transferencia",
    ],
  },
  {
    method: "paypal",
    patterns: [
      "por paypal", "con paypal", "via paypal", "vía paypal",
      "pagaré paypal", "pagare paypal", "pagaré por paypal", "pagare por paypal",
      "voy con paypal", "prefiero paypal",
    ],
  },
  {
    method: "tarjeta",
    patterns: [
      "por tarjeta", "con tarjeta", "con la tarjeta",
      "tarjeta de crédito", "tarjeta de credito", "tarjeta de débito", "tarjeta de debito",
      "voy con tarjeta", "prefiero tarjeta", "con pse", "por pse",
      "crédito", "credito",
    ],
  },
  {
    method: "mercadopago",
    patterns: [
      "mercado pago", "mercadopago", "por mercado pago", "con mercado pago",
      "voy con mercado pago", "prefiero mercado pago",
    ],
  },
];

const PAYMENT_PROOF_PATTERNS = [
  "te envío el soporte", "te envio el soporte",
  "te mando el soporte", "te paso el soporte",
  "ya te envío", "ya te envio", "ya te mando", "ya te paso",
  "te envío el comprobante", "te envio el comprobante",
  "te mando el comprobante", "te paso el comprobante",
  "te envío la captura", "te envio la captura", "te mando la captura", "te paso la captura",
  "te envío el recibo", "te envio el recibo", "te paso el recibo",
  "ya pagué", "ya pague", "ya transferí", "ya transferi",
  "ya hice el pago", "realicé el pago", "realice el pago",
  "acabo de pagar", "acabo de transferir",
  "hice la transferencia", "hice el deposito", "hice el depósito",
  "soporte de pago", "comprobante de pago", "captura del pago",
  "pago realizado", "pago hecho", "pago completado", "pago efectuado",
  "envío comprobante", "envio comprobante", "envío soporte", "envio soporte",
];

const PAYMENT_INSTRUCTION_PATTERNS = [
  "qué te envío", "que te envio", "qué te mando", "que te mando",
  "qué te paso", "que te paso", "qué te debo enviar", "que te debo enviar",
  "qué te debo mandar", "que te debo mandar", "qué debo enviar", "que debo enviar",
  "qué debo mandar", "que debo mandar", "qué te tengo que enviar", "que te tengo que enviar",
  "qué tengo que enviar", "que tengo que enviar",
  "cómo te pago", "como te pago", "cómo pago", "como pago",
  "cómo hago el pago", "como hago el pago",
  "a qué cuenta", "a que cuenta", "a qué número", "a que numero",
  "número de cuenta", "numero de cuenta",
  "datos para pagar", "datos del pago", "datos de pago",
  "a quién le pago", "a quien le pago", "a nombre de quién", "a nombre de quien",
];

/**
 * Detecta si el cliente está eligiendo un método de pago específico.
 * Devuelve el método normalizado o null.
 */
export function detectChosenPaymentMethod(text: string): string | null {
  const t = text.toLowerCase();
  for (const { method, patterns } of PAYMENT_METHOD_CHOICE_MAP) {
    if (patterns.some(p => t.includes(p))) return method;
  }
  return null;
}

/**
 * Detecta si el cliente avisa que está enviando o ya envió el comprobante de pago.
 */
export function isPaymentProofIntent(text: string): boolean {
  const t = text.toLowerCase();
  return PAYMENT_PROOF_PATTERNS.some(p => t.includes(p));
}

/**
 * Detecta si el cliente pregunta cómo / qué debe enviar para pagar.
 */
export function isPaymentInstructionIntent(text: string): boolean {
  const t = text.toLowerCase();
  return PAYMENT_INSTRUCTION_PATTERNS.some(p => t.includes(p));
}

// Datos del titular para respuestas hardcodeadas de pago
// (normalmente vienen del agente; estos son fallback)
const DEFAULT_TRANSFER_NUMBER = process.env.TRANSFER_NUMBER || "3136174267";
const DEFAULT_TRANSFER_OWNER = process.env.TRANSFER_OWNER || "Deiner Mena";

/**
 * Genera una respuesta conversacional cuando el cliente:
 *  - Elige un método de pago específico → instrucciones puntuales
 *  - Anuncia que envía/envió comprobante → acuse de recibo
 *  - Pregunta cómo pagar → flujo claro
 *
 * Devuelve null si ninguna sub-intención de pago coincide.
 */
export function tryPaymentSubIntentAnswer(
  text: string,
  customerName: string | null,
  productName: string | null,
  transferInfo?: { number?: string; owner?: string }
): { matched: true; response: string; subIntent: "method_chosen" | "proof_sending" | "instructions"; chosenMethod?: string } | null {
  const number = transferInfo?.number || DEFAULT_TRANSFER_NUMBER;
  const owner = transferInfo?.owner || DEFAULT_TRANSFER_OWNER;
  const name = (customerName && customerName !== "cliente") ? customerName.split(" ")[0] : null;
  const greet = name ? `${name}` : "";
  const prod = productName ? ` por *${productName}*` : "";

  // 1) Cliente eligió un método específico
  const chosenMethod = detectChosenPaymentMethod(text);
  if (chosenMethod) {
    let response = "";
    switch (chosenMethod) {
      case "nequi":
      case "daviplata": {
        const app = chosenMethod === "nequi" ? "Nequi" : "Daviplata";
        response =
          `¡Perfecto${greet ? `, ${greet}` : ""}! 🙌\n\n` +
          `Transfiere a *${app}*:\n` +
          `📱 *${number}*\n` +
          `👤 A nombre de *${owner}*\n\n` +
          `Cuando me envíes la captura del pago${prod}, verifico al instante y te paso el acceso. 📲`;
        break;
      }
      case "transferencia": {
        response =
          `¡Listo${greet ? `, ${greet}` : ""}! 🙌\n\n` +
          `Puedes transferir a *Nequi/Daviplata*:\n` +
          `📱 *${number}*\n` +
          `👤 A nombre de *${owner}*\n\n` +
          `Apenas me envíes el comprobante, lo valido y te activo el acceso${prod}. ✅`;
        break;
      }
      case "paypal": {
        response =
          `¡Genial${greet ? `, ${greet}` : ""}! 💳\n\n` +
          `Usa el enlace de *PayPal* que te compartí en el mensaje anterior. ` +
          `La confirmación es automática — apenas se procese el pago, te llega el acceso${prod}. ✨`;
        break;
      }
      case "tarjeta":
      case "mercadopago": {
        response =
          `¡Excelente${greet ? `, ${greet}` : ""}! 💳\n\n` +
          `Usa el enlace de *Tarjeta / PSE* (Mercado Pago) que aparece arriba. ` +
          `La confirmación es automática y recibes el acceso${prod} de inmediato. ⚡`;
        break;
      }
    }
    return { matched: true, response, subIntent: "method_chosen", chosenMethod };
  }

  // 2) Cliente avisa que envía / envió el comprobante
  if (isPaymentProofIntent(text)) {
    const variants = [
      `¡Perfecto${greet ? `, ${greet}` : ""}! 🙌 Envíame la captura cuando puedas. La reviso al instante y te activo el acceso${prod}. 👀`,
      `${greet ? `${greet}, ` : ""}quedó atenta 📲 Apenas reciba el comprobante, valido el pago y te paso el enlace de acceso${prod}.`,
      `¡Genial! 🎉 Mándame la captura y la verifico enseguida. En cuanto confirme el pago${prod}, te llega el acceso. ✅`,
    ];
    const idx = (text.length + (name?.length || 0)) % variants.length;
    return { matched: true, response: variants[idx], subIntent: "proof_sending" };
  }

  // 3) Cliente pregunta cómo / qué enviar
  if (isPaymentInstructionIntent(text)) {
    const response =
      `Solo necesito la *captura del pago*${greet ? `, ${greet}` : ""} 📸\n\n` +
      `Si pagas por *Nequi/Daviplata*, transfiere a *${number}* (a nombre de *${owner}*) y mándame el comprobante por aquí.\n\n` +
      `Si usas *Tarjeta/PSE* o *PayPal*, la confirmación llega sola — no necesitas enviar nada. ✨`;
    return { matched: true, response, subIntent: "instructions" };
  }

  return null;
}

export interface HardcodedAnswer {
  matched: boolean;
  response: string;
  intent: "details_query" | "human_handoff";
}

export function tryHardcodedAnswer(
  text: string,
  productName: string | null,
  voice?: { emojis: Record<string, string>; deliveryInfo?: { method: string; timeframe: string; details: string }; guaranteeInfo?: { days: number; description: string }; accessInfo?: { type: string; description: string } }
): HardcodedAnswer | null {
  const t = text.toLowerCase();
  const prod = productName ? `*${productName}*` : "el curso";
  const e = voice?.emojis || {};
  const emoji = (key: string, fallback: string) => e[key] || fallback;

  const deliveryMethod = voice?.deliveryInfo?.method || "Google Drive";
  const deliveryTime = voice?.deliveryInfo?.timeframe || "inmediato";
  const guaranteeDays = voice?.guaranteeInfo?.days || 7;
  const accessType = voice?.accessInfo?.type || "de por vida";

  // Helper: cierres conversacionales variados (a veces sin pregunta de cierre)
  // Se rota según la longitud del texto entrante para no repetir siempre lo mismo.
  const closingVariants = [
    "",                                        // sin cierre (suena natural y no presiona)
    `\n\n¿Te queda alguna duda?`,
    `\n\n¿Hay algo más que quieras saber?`,
    `\n\n¿Todo claro hasta aquí?`,
    `\n\n¿Quieres saber algo más antes de continuar?`,
  ];
  const closing = closingVariants[text.length % closingVariants.length];

  if (DELIVERY_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("delivery", "📦")} La entrega de ${prod} es *100% digital por ${deliveryMethod}*. Tenemos 2 formas:\n\n1️⃣ *Pago por link* (MercadoPago/PayPal): El sistema detecta tu pago automáticamente y te envía el link de ${deliveryMethod} aquí mismo.\n\n2️⃣ *Pago por consignación* (Nequi/Daviplata): Después de transferir, reenvías la captura del comprobante por este chat y te enviamos el link.\n\nAmbos métodos te dan acceso *${deliveryTime}* desde cualquier dispositivo. ${emoji("benefit", "✅")}${closing}`,
    };
  }

  if (ACCESS_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("delivery", "🔗")} El acceso a ${prod} es por *${deliveryMethod}*. Una vez confirmado el pago (automático si pagas por link, o manual si envías comprobante), recibirás el enlace directo aquí. Lo abres desde el celular o computador, sin descargas obligatorias. ${emoji("benefit", "✅")}${closing}`,
    };
  }

  if (GUARANTEE_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("guarantee", "🛡️")} Tienes *${guaranteeDays} días de garantía* sin preguntas. Si no te convence por cualquier razón, te devolvemos el dinero completo. ${emoji("benefit", "✅")}${closing}`,
    };
  }

  if (DURATION_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("benefit", "♾️")} El acceso a ${prod} es *${accessType}*. Pagas una sola vez y queda tuyo — sin mensualidades, sin caducidad. ${emoji("benefit", "✅")}${closing}`,
    };
  }

  if (CONTENT_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("product", "📚")} ${prod} incluye todo el material por *${deliveryMethod}*:\n${emoji("benefit", "✅")} Videos en alta definición\n${emoji("benefit", "✅")} PDFs y recursos descargables\n${emoji("benefit", "✅")} Acceso *${accessType}*\n${emoji("benefit", "✅")} Pago único — sin suscripciones${closing}`,
    };
  }

  if (SUPPORT_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("benefit", "💬")} ${prod} es de *auto-aprendizaje* a tu ritmo, con todo el material disponible en ${deliveryMethod} cuando quieras. Si surge alguna duda, me escribes por aquí mismo y te ayudo. ${emoji("benefit", "✅")}${closing}`,
    };
  }

  // Desvío a humano: respuesta directa sin IA
  if (HUMAN_HANDOFF_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "human_handoff",
      response: `${emoji("benefit", "👤")} Claro, te conecto con un asesor humano en unos momentos.\n\nMientras tanto, te invito a seguir planteando tus dudas por aquí. Un miembro de nuestro equipo te atenderá personalmente lo antes posible. ${emoji("benefit", "✅")}`,
    };
  }

  return null;
}

export function hasHardcodedAnswerBeenGiven(
  memory: ConversationMemory,
  currentIntent: "delivery" | "access" | "guarantee" | "duration" | "content" | "support"
): boolean {
  for (const msg of memory.history) {
    if (msg.role !== "agent") continue;
    const content = msg.content.toLowerCase();
    switch (currentIntent) {
      case "delivery":
        if (content.includes("entrega") && (content.includes("digital") || content.includes("drive"))) return true;
        break;
      case "access":
        if (content.includes("acceso") && (content.includes("drive"))) return true;
        break;
      case "guarantee":
        if (content.includes("garant") && content.includes("día")) return true;
        break;
      case "duration":
        if (content.includes("acceso") && (content.includes("por vida") || content.includes("caduca"))) return true;
        break;
      case "content":
        if (content.includes("incluye") || (content.includes("material") && content.includes("drive"))) return true;
        break;
      case "support":
        if (content.includes("auto-aprendizaje") || content.includes("ritmo")) return true;
        break;
    }
  }
  return false;
}

export function detectHardcodedIntent(text: string): "delivery" | "access" | "guarantee" | "duration" | "content" | "support" | null {
  const t = text.toLowerCase();
  if (DELIVERY_PATTERNS.some(p => t.includes(p))) return "delivery";
  if (ACCESS_PATTERNS.some(p => t.includes(p))) return "access";
  if (GUARANTEE_PATTERNS.some(p => t.includes(p))) return "guarantee";
  if (DURATION_PATTERNS.some(p => t.includes(p))) return "duration";
  if (CONTENT_PATTERNS.some(p => t.includes(p))) return "content";
  if (SUPPORT_PATTERNS.some(p => t.includes(p))) return "support";
  return null;
}

// ─── Post-procesamiento: eliminar URLs y datos de pago si no es payment_intent ─

export function sanitizeResponse(text: string, intent: Intent): string {
  if (intent === "payment_intent" || intent === "confirmation") return text;

  // Eliminar URLs (http/https)
  let clean = text.replace(/https?:\/\/[^\s\n]+/g, "").trim();

  // Eliminar líneas que solo contienen datos de pago
  const paymentLinePatterns = [
    /🔹\s*\*?(Tarjeta|PayPal|Transferencia|Nequi|Daviplata)[^]*?(?=\n\n|\n🔹|$)/gi,
    /💳\s*\*?ENLACES DE PAGO[^]*/gi,
    /📍\s*\*?Nequi[^]*?(?=\n|$)/gi,
    /👤\s*\*?Titular[^]*?(?=\n|$)/gi,
    /pref_id=[^\s]*/gi,
    /token=EC-[^\s]*/gi,
  ];

  for (const pattern of paymentLinePatterns) {
    clean = clean.replace(pattern, "");
  }

  // Limpiar líneas vacías múltiples
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();

  return clean;
}

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase().trim();
  const words = t.split(/\s+/);
  const wordCount = words.length;

  // Saludo puro: mensaje corto con palabra de saludo
  const isGreeting = GREETING_PATTERNS.some(p => t.includes(p)) && wordCount <= 8;
  if (isGreeting) return "greeting";

  // Intención de pago (alta prioridad)
  // Pero si el mensaje contiene palabras de pago combinadas con consulta post-pago
  // (ej: "Después de pagar que me entregas?"), NO es payment_intent sino details_query
  const hasPayment = PAYMENT_PATTERNS.some(p => t.includes(p));
  if (hasPayment) {
    // Post-pago: cliente pregunta qué enviar/comprobar después de pagar
    const postPaymentProc = ["que te debo enviar", "que debo enviar", "que te mando", "para confirmarte",
      "comprobante", "para que sepas", "para que veas", "te envió el", "te mando el",
      "ya pagué", "ya pague", "acabo de pagar", "captura", "pantallazo",
      "confirmarte que", "para confirmar el pago", "envío el comprobante",
      "ya transferí", "ya transferi", "acabo de transferir",
      "te llega el", "como sabes", "como confirmo"];
    const isPostPaymentProcess = postPaymentProc.some(p => t.includes(p));

    if (isPostPaymentProcess) {
      return "details_query";
    }

    // Post-pago: cliente pregunta sobre entrega/garantía después del pago
    const afterPayment = ["después de pagar", "despues de pagar", "luego de pagar", "cuando pague", "cuando paga",
      "después del pago", "despues del pago", "luego del pago"];
    const isPostPaymentQuestion = afterPayment.some(p => t.includes(p));
    const alsoHasDeliveryDetails = (["entrega", "entregan", "recibir", "acceso", "garantía", "garantia",
      "incluye", "trae", "qué me", "que me", "me entregan"].some(d => t.includes(d)));
    if (isPostPaymentQuestion || (alsoHasDeliveryDetails && t.length > 30)) {
      return "details_query";
    }
    return "payment_intent";
  }

  // Objeción
  if (OBJECTION_PATTERNS.some(p => t.includes(p))) return "objection";

  // Despedida
  if (LEAVING_PATTERNS.some(p => t.includes(p))) return "leaving";

  // Desvío a humano
  if (HUMAN_HANDOFF_PATTERNS.some(p => t.includes(p))) return "human_handoff";

  // Confirmación
  if (CONFIRMATION_PATTERNS.some(p => t.includes(p)) && !t.includes("no ")) return "confirmation";

  // Pregunta sobre producto (tiene palabras que no son genéricas)
  // Va ANTES de details_query para que "tienes curso de guitarra" no se malinterprete como detalle
  const productWords = words.filter(w => w.length > 3 && !GENERIC_WORDS.has(w) && !STOP_WORDS.has(w));
  if (productWords.length > 0) return "product_query";

  // Pregunta de detalles (sobre entrega, garantía, acceso, etc.)
  if (DETAILS_PATTERNS.some(p => t.includes(p))) return "details_query";

  return "general";
}

// ─── Carga de memoria desde BD ────────────────────────────────────────────────

export async function loadConversationMemory(conversationId: number): Promise<ConversationMemory> {
  const [convo] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  // Cargar historial completo (últimos 30 mensajes)
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(30)
    .then(rows => rows.reverse()); // Cronológico

  const agentMessages = history.filter(m => m.role === "agent");
  const customerMessages = history.filter(m => m.role === "customer");

  // ¿Ya saludó el agente?
  const hasGreeted = agentMessages.length > 0;

  // Producto activo: el último producto cuya card se envió
  let currentProductId: number | null = null;
  let currentProductName: string | null = null;
  const sentProductIds = new Set<number>();

  for (const msg of agentMessages) {
    const meta = msg.metadata as MessageMetadata | null;
    if (meta?.cardSent && meta.productId) {
      sentProductIds.add(meta.productId);
      currentProductId = meta.productId;
      currentProductName = meta.productName || null;
    }
    // También detectar por patrón [CARD: N] en el contenido (retrocompatibilidad)
    const cardMatch = msg.content.match(/\[CARD:\s*(\d+)\s*\]/i);
    if (cardMatch) {
      const pid = parseInt(cardMatch[1]);
      sentProductIds.add(pid);
      // Actualizar ID si no lo teníamos o si es más reciente
      if (currentProductId === null || meta?.cardSent) {
        currentProductId = pid;
      }
      // Si no tenemos nombre de producto aún, buscarlo en la BD
      if (currentProductName === null) {
        try {
          const [productRow] = await db
            .select({ name: products.name })
            .from(products)
            .where(eq(products.id, pid))
            .limit(1);
          currentProductName = productRow?.name || null;
        } catch {
          // Silencioso: si falla la búsqueda, queda null
        }
      }
    }
  }

  // Etapa actual
  const currentStage = mapStage(convo?.currentStage || "greeting");

  // Último mensaje de cada rol
  const lastCustomerMsg = [...customerMessages].pop();
  const lastAgentMsg = [...agentMessages].pop();

  // ¿Nueva sesión? (>4h desde el último mensaje)
  let isNewSession = false;
  if (history.length >= 2) {
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const diffHours = (new Date(last.createdAt).getTime() - new Date(prev.createdAt).getTime()) / 3_600_000;
    if (diffHours > 4) isNewSession = true;
  }

  return {
    history,
    hasGreeted,
    currentStage,
    currentProductId,
    currentProductName,
    sentProductIds,
    lastCustomerMessage: lastCustomerMsg?.content || "",
    lastAgentMessage: lastAgentMsg?.content || "",
    messageCount: customerMessages.length,
    isNewSession,
    sessionStartedAt: history[0] ? new Date(history[0].createdAt) : null,

    // Estado de pago desde BD
    paymentStatus: convo?.paymentStatus || null,
    paymentMethod: convo?.paymentMethod || null,
    paymentAmount: convo?.paymentAmount ? Number(convo.paymentAmount) : null,
    paidAt: convo?.paidAt ? new Date(convo.paidAt) : null,
  };
}

function mapStage(raw: string): Stage {
  const map: Record<string, Stage> = {
    greeting: "greeting",
    discovery: "discovery",
    qualification: "discovery",
    presentation: "presentation",
    details: "details",
    objection_handling: "objection_handling",
    closing: "closing",
    post_sale: "post_sale",
  };
  return map[raw] || "greeting";
}

// ─── Búsqueda semántica de producto ───────────────────────────────────────────

// Palabras genéricas que por sí solas NO definen un producto
const GENERIC_HEADERS = new Set([
  "megapack", "mega", "pack", "curso", "programa", "master", "pack",
  "combo", "duo", "trio", "kit", "box", "serie", "coleccion",
  "paquete", "curso intensivo", "curso completo",
]);

function normalizeText(t: string): string {
  return t.toLowerCase()
    .replace(/mega\s*pack/g, "megapack")
    .replace(/reparaci[oó]n/g, "reparacion")
    .replace(/celulares?\b/g, "celular")
    .replace(/mascotas?\b/g, "mascota")
    .replace(/tel[eé]fono/g, "telefono")
    .replace(/hogar/g, "casa")
    .replace(/cocina/g, "cocina")
    .replace(/ba[oñ]o/g, "bano")
    .replace(/decoraci[oó]n/g, "decoracion")
    .replace(/pianob/g, "piano")
    .replace(/[^\w\sáéíóúñü]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Razona lógicamente qué producto corresponde a lo que el usuario pide.
 * No usa puntos arbitrarios: clasifica en niveles de coincidencia y elige el más veraz.
 *
 * Lógica de razonamiento:
 *  1. Coincidencia EXACTA de frase del usuario en el nombre del producto → Nivel 4 (máximo)
 *  2. Coincidencia de palabras ESPECÍFICAS (no genéricas) en nombre del producto → Nivel 3
 *  3. Coincidencia en CATEGORÍA + al menos una palabra específica en nombre/descripción → Nivel 3
 *  4. Coincidencia de palabras ESPECÍFICAS solo en descripción → Nivel 2
 *  5. Solo palabras genéricas como "megapack" o "curso" → Nivel 1 (insuficiente, se descarta)
 *
 * Si un producto obtiene Nivel 1, se descarta directamente.
 * Si varios productos obtienen el mismo nivel, gana el de nombre más similar a la consulta.
 *
 * Si ningún producto alcanza Nivel 2 o más, devuelve null → no hay un producto verdadero.
 */
export async function findBestProductMatch(
  text: string,
  productList: Array<{ id: number; name: string; description: string | null; category: string | null; categoryId: number | null }>,
  categoryMap: Map<number, string>
): Promise<{ product: typeof productList[0]; score: number; reasoning: string } | null> {
  const reasoning: string[] = [];
  const normalized = normalizeText(text);
  const allWords = normalized.split(/\s+/).filter(w =>
    (w.length > 2 || /^\d+$/.test(w)) && !STOP_WORDS.has(w)
  );

  // Separar: palabras específicas vs genéricas
  const genericWords = allWords.filter(w => GENERIC_HEADERS.has(w));
  const specificWords = allWords.filter(w => !GENERIC_HEADERS.has(w) && !GENERIC_WORDS.has(w) && !STOP_WORDS.has(w));

  // Razonamiento: categorías a las que apunta la consulta
  const targetCategories: string[] = [];
  const categoryHints: Record<string, string[]> = {
    // ← Quién busca qué → devuelve estas categorías como keywords
    "reparacion": ["reparacion", "reparación", "celular", "telefono", "móvil", "movil", "electronica"],
    "celular": ["reparacion", "reparación", "celular", "telefono", "móvil", "movil", "electronica"],
    "telefono": ["reparacion", "reparación", "celular", "telefono", "electronica"],
    "electronica": ["reparacion", "reparación", "electronica", "tecnologia"],
    "tecnologia": ["tecnologia", "electronica", "informatica"],
    "diseno": ["diseno", "diseño", "grafico", "photoshop", "illustrator", "adobe"],
    "marketing": ["marketing", "redes", "seo", "publicidad", "ventas", "negocios"],
    "idiomas": ["idiomas", "ingles", "francés", "aleman", "portugués"],
    "ingles": ["idiomas", "ingles", "inglés"],
    "frances": ["idiomas", "frances", "francés"],
    "trading": ["trading", "forex", "bolsa", "inversiones", "acciones"],
    "programacion": ["programacion", "programación", "codigo", "python", "desarrollo", "web"],
    "web": ["programacion", "programación", "web", "desarrollo", "html", "css", "react"],
    "hogar": ["hogar", "cocina", "bano", "limpieza", "decoracion", "decoración", "mascota"],
    "cocina": ["cocina", "hogar", "cocinar", "utensilios"],
    "decoracion": ["decoracion", "decoración", "hogar", "muebles", "casa"],
    "mascota": ["mascota", "hogar", "perro", "gato", "animales"],
    "fitness": ["fitness", "gimnasio", "ejercicio", "salud", "deporte"],
    "gimnasio": ["fitness", "gimnasio", "ejercicio", "pesas", "entrenamiento"],
    "excel": ["excel", "office", "hoja", "calculo"],
    "powerpoint": ["powerpoint", "office", "presentaciones", "diapositivas"],
    "word": ["word", "office", "documentos", "texto"],
    "piano": ["piano", "teclado", "musica", "música"],
    "guitarra": ["guitarra", "musica", "música"],
  };

  // ── MAPEO INVERSO DE CATEGORÍAS (BD → hints) ─────────────
  // La BD puede tener categorías llamadas "megapacks" o "cursos",
  // pero el buscador inteligente debe asociar nombres de BD reales a conceptos canónicos.
  const categoryAlias: Record<string, string[]> = {
    // Cada categoría mapea SOLO a keywords directamente relacionadas
    // NUNCA mapees una categoría a keywords ajenas (ej: "megapacks" → "piano")
    "megapacks": ["electronica", "tecnologia", "informatica", "programacion", "ofimatica"],
    "cursos":   ["educacion", "aprendizaje", "capacitacion", "formacion"],
    "suscripciones": ["suscripcion", "membresia", "acceso", "plataforma"],
    "servicios": ["servicio", "consultoria", "asesoria", "soporte"],
  };

  // Construir el buscador directo: BD → conceptos (case-insensitive)
  const categoryAliasLower: Record<string, string[]> = {};
  for (const [key, vals] of Object.entries(categoryAlias)) {
    categoryAliasLower[key.toLowerCase()] = vals;
  }

  // Detectar categorías sugeridas por las palabras de la consulta
  for (const word of specificWords) {
    if (categoryHints[word]) {
      targetCategories.push(...categoryHints[word]);
    }
  }

  // Construir un set de conceptos objetivo (palabras clave que tiene la consulta, normalizadas)
  const targetConceptSet = new Set(targetCategories.map(c => normalizeText(c)));

  // Si no hay palabras específicas que generen categoría, no hay forma de buscar
  if (specificWords.length === 0) {
    reasoning.push("❌ La consulta solo contiene palabras genéricas (ej: 'megapack', 'curso'). No se puede determinar qué producto busca.");
    return null;
  }

  // Evaluar cada producto con razonamiento lógico
  const evaluations: Array<{
    product: typeof productList[0];
    level: number;        // 1 = insuficiente, 2 = débil, 3 = bueno, 4 = exacto
    matchDetail: string;
    categoryHit: boolean;
  }> = [];

  for (const p of productList) {
    const catName = p.categoryId
      ? (categoryMap.get(p.categoryId) || "")
      : (p.category || "");
    const productName = normalizeText(p.name);
    const productDesc = normalizeText(p.description || "");
    const combined = `${productName} ${productDesc} ${catName}`;

    let level = 0;
    let matchDetail = "";

    // Nivel 4: La frase completa de la consulta aparece en el NOMBRE del producto
    {
      const fullPhrase = specificWords.join(" ");
      if (productName.includes(fullPhrase)) {
        level = 4;
        matchDetail = `frase exacta "${fullPhrase}" en el nombre`;
      }
    }

    // Nivel 3.5: TODAS las palabras específicas están en el NOMBRE (tiebreaker mejorado)
    // Esto prioriza "Piano Mega Pack" sobre "DJ Producción Mega Pack" cuando se busca "piano mega pack"
    if (level < 3.5) {
      const nameHits = specificWords.filter(w => productName.includes(w));
      if (nameHits.length === specificWords.length && specificWords.length > 1) {
        level = 3.5;
        matchDetail = `TODAS las palabras específicas en el nombre: ${nameHits.join(", ")}`;
      }
    }

    // Nivel 3: Coincidencia directa de palabras específicas en el NOMBRE
    if (level < 3) {
      const nameHits = specificWords.filter(w => productName.includes(w));
      if (nameHits.length >= Math.max(1, Math.ceil(specificWords.length * 0.5))) {
        level = 3;
        matchDetail = `${nameHits.length}/${specificWords.length} palabras específicas en el nombre: ${nameHits.join(", ")}`;
      }
    }

    // Nivel 3: CATEGORÍA coincide + alguna palabra específica en nombre o descripción
    if (level < 3 && catName) {
      const catKeywords = categoryHints[catName] || [catName];
      const categoryMatch = specificWords.some(w =>
        catKeywords.some(ck => normalizeText(ck).includes(w) || w.includes(normalizeText(ck)))
      );
      if (categoryMatch) {
        const contentHits = specificWords.filter(w => combined.includes(w));
        if (contentHits.length > 0) {
          level = 3;
          matchDetail = `categoría "${catName}" detectada + coincidencia en contenido: ${contentHits.join(", ")}`;
        }
      }
    }

    // Nivel 2: Coincidencia de palabras específicas solo en DESCRIPCIÓN
    if (level < 2) {
      const descHits = specificWords.filter(w => productDesc.includes(w));
      if (descHits.length >= Math.max(1, Math.ceil(specificWords.length * 0.6))) {
        level = 2;
        matchDetail = `${descHits.length}/${specificWords.length} palabras en descripción: ${descHits.join(", ")}`;
      }
    }

    // Nivel 2 (búsqueda expandida de categoría):
    // Las palabras específicas de la consulta coinciden EXACTAMENTE con alias de la
    // categoría del producto — sin substrings ni coincidencias parciales.
    // Esto permite buscar "reparación de celulares" y encontrar productos de la categoría
    // "electronica" (cuyos alias incluyen "reparacion" y "celular"), pero NO permite que
    // "curso de inglés" devuelva productos de electrónica, mecánica, etc.
    // VA ANTES del nivel 1 para que la categoría expandida tenga prioridad.
    if (level === 0 && specificWords.length > 0 && catName) {
      const normalizedAliases = [...(categoryAliasLower[catName] || [])].map(s => normalizeText(s));
      // Coincidencia exacta: alias contiene la palabra de la consulta (no al revés)
      const exactAliasHits = specificWords.filter(w => normalizedAliases.some(a => a.includes(w)));
      if (exactAliasHits.length >= Math.max(1, Math.ceil(specificWords.length * 0.6))) {
        // ✅ VALIDACIÓN CRUZADA: que al menos 1 palabra específica aparezca
        // en el NOMBRE o DESCRIPCIÓN real del producto (no solo en alias)
        const hasContentMatch = specificWords.some(w =>
          productName.includes(w) || productDesc.includes(w)
        );
        if (hasContentMatch) {
          level = 2;
          matchDetail = `búsqueda expandida por categoría "${catName}": alias=[${exactAliasHits.join(",")}]`;
        } else {
          level = 1;
          matchDetail = `categoría "${catName}" coincide pero sin respaldo en nombre/descripción del producto`;
        }
      }
    }

    // Nivel 1 (insuficiente): Solo palabras genéricas — ÚLTIMO RECURSO después de agotar nivel 2+
    if (level === 0) {
      const anyHit = allWords.filter(w => combined.includes(w));
      if (anyHit.length > 0) {
        level = 1;
        matchDetail = `solo coincidencia genérica: ${anyHit.join(", ")}`;
      }
    }

    evaluations.push({ product: p, level, matchDetail, categoryHit: level >= 3 && catName !== "" });
  }

  // Filtrar: descartar nivel 1 (insuficiente)
  const valid = evaluations.filter(e => e.level >= 2);

  if (valid.length === 0) {
    reasoning.push("❌ Ningún producto alcanza el criterio mínimo de coincidencia (nivel 2).");
    reasoning.push(`   Productos revisados: ${productList.length}.`);
    reasoning.push("   Respuesta: informar que no se encontró el producto buscado y listar productos similares.");
    return null;
  }

  // Ordenar por nivel descendente, luego por cantidad de palabras específicas coincidentes en el nombre
  valid.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    const aNameHits = specificWords.filter(w => normalizeText(a.product.name).includes(w)).length;
    const bNameHits = specificWords.filter(w => normalizeText(b.product.name).includes(w)).length;
    return bNameHits - aNameHits;
  });

  const best = valid[0];
  
  // ── VALIDACIÓN ADICIONAL: Si hay múltiples productos con el mismo nivel,
  // asegurarse de que el mejor sea realmente el mejor
  if (valid.length > 1 && valid[0].level === valid[1].level) {
    // Si hay empate, preferir el que tenga más coincidencias en el nombre
    const topLevel = valid[0].level;
    const topProducts = valid.filter(e => e.level === topLevel);
    
    if (topProducts.length > 1) {
      // Calcular score adicional basado en coincidencias exactas
      const scores = topProducts.map(e => {
        const nameHits = specificWords.filter(w => normalizeText(e.product.name).includes(w)).length;
        const descHits = specificWords.filter(w => normalizeText(e.product.description || "").includes(w)).length;
        return { product: e, score: nameHits * 2 + descHits };
      });
      
      scores.sort((a, b) => b.score - a.score);
      reasoning.push(`⚠️ Múltiples productos con nivel ${topLevel}. Seleccionando por coincidencias: ${scores[0].product.product.name}`);
      return { product: scores[0].product.product, score: topLevel * 25, reasoning: reasoning.join("\n") };
    }
  }
  
  reasoning.push(`✅ Producto seleccionado: "${best.product.name}" (nivel ${best.level})`);
  reasoning.push(`   Razón: ${best.matchDetail}`);
  if (best.categoryHit) reasoning.push("   Coincidencia de categoría confirmada.");

  return { product: best.product, score: best.level * 25, reasoning: reasoning.join("\n") };
}

// ─── Motor de decisión principal ──────────────────────────────────────────────

export async function computeDecision(
  memory: ConversationMemory,
  incomingText: string,
  productList: Array<any>,
  categoryMap: Map<number, string>
): Promise<EngineDecision> {
  const intent = detectIntent(incomingText);
  const t = incomingText.toLowerCase();

  // ── Determinar etapa siguiente ──────────────────────────────────────────────
  let stage: Stage = memory.currentStage;

  if (intent === "greeting") {
    stage = memory.hasGreeted ? "greeting" : "greeting";
  } else if (intent === "payment_intent") {
    stage = "closing";
  } else if (intent === "objection") {
    stage = "objection_handling";
  } else if (intent === "product_query") {
    stage = memory.currentProductId ? "presentation" : "discovery";
  } else if (intent === "details_query") {
    // Si no hay producto en contexto, mantenerse en discovery pero con la conducta de details
    // para activar hardcoded answers o preguntar por el producto
    stage = memory.currentProductId ? "details" : "details";
  } else if (intent === "confirmation") {
    stage = "closing";
  } else if (intent === "leaving") {
    stage = memory.currentStage;
  }

  // ── Decidir si saludar ──────────────────────────────────────────────────────
  const shouldGreet = intent === "greeting";
  const isRepeatGreeting = shouldGreet && memory.hasGreeted;

  // ── Decidir qué producto mostrar ────────────────────────────────────────────
  let productToShow: EngineDecision["productToShow"] = null;
  let shouldSendCard = false;
  let productSearchFailed = false;
  let searchReasoning: string | null = null;

  if (!shouldGreet && intent !== "leaving") {
    // Buscar producto mencionado en el mensaje actual
    const match = await findBestProductMatch(incomingText, productList, categoryMap);

    // Razonamiento de búsqueda (para inyectar en el prompt)
    searchReasoning = match?.reasoning || null;

    // 🤖 DECISIÓN DE PRODUCTO DELEGADA A LA IA
    // La IA recibe el catálogo completo y analiza el contexto de la conversación
    // para elegir qué producto mostrar. El keyword matching solo sirve como
    // sugerencia/advertencia, no como decisión final.
    if (match && match.score >= 50) {
      const p: any = match.product;
      const alreadySent = memory.sentProductIds.has(p.id);

      if (intent === "payment_intent" || intent === "confirmation") {
        // ── PAGO: la IA necesita un producto concreto. Usar el match como sugerencia ──
        // pero la IA puede sobreescribirlo con [CARD: ID] en su respuesta.
        if (!alreadySent || p.id !== memory.currentProductId) {
          productToShow = {
            id: p.id, name: p.name, price: Number(p.price),
            currency: p.currency || "COP", description: p.description || "",
            features: (p.features as string[]) || [],
          };
          shouldSendCard = true;
          console.log(`💳 [DECISION] Producto para pago sugerido: ${p.name} (ID: ${p.id})`);
        } else {
          const currentProduct = productList.find(p2 => p2.id === memory.currentProductId);
          if (currentProduct) {
            productToShow = {
              id: currentProduct.id, name: currentProduct.name, price: Number(currentProduct.price),
              currency: currentProduct.currency || "COP", description: currentProduct.description || "",
              features: (currentProduct.features as string[]) || [],
            };
          }
          shouldSendCard = true;
          console.log(`💳 [DECISION] Mismo producto en pago: ${currentProduct?.name} (ID: ${memory.currentProductId})`);
        }
      } else {
        // ── CONSULTA DE PRODUCTO/DETALLE/GENERAL: la IA decide ──
        // Incluir el match como análisis contextual, pero no forzar card
        productToShow = null;
        shouldSendCard = false;
        searchReasoning = match.reasoning;
        console.log(`🤖 [DECISION] Match encontrado pero delegado a IA: ${p.name} (score: ${match.score})`);
      }
    } else if (memory.currentProductId) {
      if (intent === "payment_intent" || intent === "confirmation") {
        const currentProduct = productList.find(p2 => p2.id === memory.currentProductId);
        if (currentProduct) {
          productToShow = {
            id: currentProduct.id, name: currentProduct.name, price: Number(currentProduct.price),
            currency: currentProduct.currency || "COP", description: currentProduct.description || "",
            features: (currentProduct.features as string[]) || [],
          };
        }
        shouldSendCard = true;
        console.log(`💳 [DECISION] Producto en contexto para pago: ${currentProduct?.name} (ID: ${memory.currentProductId})`);
      } else {
        // Mantener producto en contexto como referencia, pero IA decide
        const currentProduct = productList.find(p2 => p2.id === memory.currentProductId);
        if (currentProduct) {
          productToShow = null;
          shouldSendCard = false;
          console.log(`🤖 [DECISION] Producto en contexto delegado a IA: ${currentProduct?.name} (ID: ${memory.currentProductId})`);
        }
      }
    } else {
      // No hay match ni producto en contexto
      if (intent !== "payment_intent" && intent !== "confirmation") {
        productSearchFailed = true;
        console.log(`❌ [DECISION] Sin match y sin producto en contexto - delegado a IA`);
      } else {
        productSearchFailed = true;
        console.log(`❌ [DECISION] Sin match y sin producto en contexto para pago`);
      }
    }
  }

  // ── Construir bloque de contexto para el prompt ─────────────────────────────
  const contextBlock = buildContextBlock(memory, intent, stage, productToShow, shouldSendCard, searchReasoning, productSearchFailed, t, productList);

  // ── Razón de la decisión (para logs) ────────────────────────────────────────
  const debugReason = [
    `intent=${intent}`,
    `stage=${stage}`,
    `hasGreeted=${memory.hasGreeted}`,
    `isNewSession=${memory.isNewSession}`,
    `currentProduct=${memory.currentProductName || "none"}`,
    `sentCards=[${Array.from(memory.sentProductIds).join(",")}]`,
    `shouldSendCard=${shouldSendCard}`,
    `productToShow=${productToShow?.name || "none"}`,
  ].join(" | ");

  return {
    intent,
    stage,
    shouldSendCard,
    productToShow,
    shouldGreet,
    isRepeatGreeting,
    contextBlock,
    debugReason,
    searchReasoning,
    productSearchFailed,
    paymentStatus: memory.paymentStatus,
    paymentMethod: memory.paymentMethod,
    paymentAmount: memory.paymentAmount,
  };
}

// ─── Constructor del bloque de contexto ───────────────────────────────────────

function buildContextBlock(
  memory: ConversationMemory,
  intent: Intent,
  stage: Stage,
  product: EngineDecision["productToShow"],
  shouldSendCard: boolean,
  searchReasoning?: string | null,
  productSearchFailed?: boolean,
  incomingText?: string,
  allProducts?: Array<any>
): string {
  const lines: string[] = [];

  // ── Estado de la conversación ──────────────────────────────────────────────
  lines.push(`\n\n━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🧠 CONTEXTO DE CONVERSACIÓN`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`• Etapa: ${stage}`);
  lines.push(`• Intención detectada: ${intent}`);
  lines.push(`• Mensajes del cliente: ${memory.messageCount}`);
  lines.push(`• Ya saludaste: ${memory.hasGreeted ? "SÍ" : "NO"}`);
  lines.push(`• Nueva sesión (>4h): ${memory.isNewSession ? "SÍ" : "NO"}`);

  if (memory.sentProductIds.size > 0) {
    lines.push(`• Productos ya mostrados: [${Array.from(memory.sentProductIds).join(",")}]`);
  }

  // Si la búsqueda de producto no encontró nada coherente
  if (productSearchFailed) {
    lines.push(`\n🔍 RESULTADO DE BÚSQUEDA EN CATÁLOGO:`);
    lines.push(`No se identificó un producto que coincida fielmente con lo que pide el cliente.`);
    lines.push(`El cliente está buscando algo que NO existe en el catálogo actual.`);
    if (searchReasoning) {
      lines.push(`\n📋 RAZONAMIENTO DE LA BÚSQUEDA:`);
      searchReasoning.split("\n").forEach(r => lines.push(`  ${r}`));
    }
    lines.push(`\n✅ TU ACCIÓN:`);
    lines.push(`1. Dile la VERDAD: el producto que busca no está disponible.`);
    lines.push(`2. Menciona brevemente qué productos SÍ tienes más similares si los hay.`);
    lines.push(`3. Simplemente ofrécele la información y deja que el cliente decida si le interesa. NUNCA termines con preguntas como "¿qué tipo buscas?" o "¿te interesa alguno?".`);
    lines.push(`4. Sé honesto y directo, no inventes productos ni des información falsa.`);
    lines.push(`5. NUNCA muestres una tarjeta de un producto que no tiene que ver con lo que busca.`);
  }

  // ── Estado de pago de la conversación ───────────────────────────────────────
  if (memory.paymentStatus || memory.paymentMethod) {
    lines.push(`\n\n━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`💰 ESTADO DE PAGO`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`• Estado: ${memory.paymentStatus || 'sin estado registrado'}`);
    lines.push(`• Método: ${memory.paymentMethod || 'sin método registrado'}`);
    lines.push(`• Monto: ${memory.paymentAmount ? formatPrice(memory.paymentAmount, 'COP') : 'sin monto registrado'}`);
    lines.push(`• Pagado el: ${memory.paidAt ? memory.paidAt.toLocaleString('es-CO') : 'pendiente'}`);
    if (memory.paymentStatus === 'confirmed') {
      lines.push(`\n✅ El pago ESTÁ CONFIRMADO. Informa al cliente que su acceso está listo.`);
    }
  }

  // ── Reglas según intención ─────────────────────────────────────────────────
  lines.push(`\n🚨 INSTRUCCIONES PARA ESTA RESPUESTA:`);

  if (memory.hasGreeted) {
    lines.push(`• PROHIBIDO empezar con "Hola", "¡Hola!", "Buenos días" o cualquier saludo. Ya saludaste. Ve directo al punto.`);
  }

  switch (intent) {
    case "greeting":
      if (!memory.hasGreeted) {
        lines.push(`• Es el PRIMER contacto. Preséntate brevemente como Sofía de TecnoVariedades y pregúntale en qué le puedes ayudar, pero sin ser invasiva.`);
        lines.push(`• Sé cálida, breve (máx 2 líneas).`);
        lines.push(`• NO menciones productos ni precios todavía.`);
      } else if (memory.isNewSession) {
        lines.push(`• El cliente regresa después de un tiempo. Salúdalo brevemente por su nombre y ofrécele tu ayuda.`);
        lines.push(`• NO menciones conversaciones anteriores a menos que él lo haga.`);
      } else {
        lines.push(`• El cliente saludó de nuevo en la misma sesión. Responde brevemente ofreciendo tu ayuda de manera proactiva.`);
      }
      break;

    case "product_query":
      lines.push(`• El cliente pregunta por un producto o tiene un interés. Revisa el CATÁLOGO COMPLETO con mucha atención.`);
      lines.push(`• Usa tu inteligencia: si el cliente escribe con errores (ej. "pianob", "megaoack"), entiende el contexto y busca la mejor coincidencia.`);
      lines.push(`• Si encuentras el producto ideal en el catálogo, PRESÉNTALO DIRECTAMENTE usando la etiqueta [CARD: ID] (ej. [CARD: 311]).`);
      lines.push(`• Cuando uses [CARD: ID], tu respuesta de texto debe ser EXTREMADAMENTE CORTA (1 línea máximo). No repitas precios ni detalles, la tarjeta ya los tiene.`);
      lines.push(`• Si el producto DEFINITIVAMENTE NO ESTÁ en el catálogo (ej. pide algo completamente ajeno), admite honestamente que no lo tienes y menciona los más similares.`);
      lines.push(`• NUNCA interrogues al cliente (evita preguntarle "¿qué tipo buscas?" o "¿puedes darme más detalles?"). Dale la información y que el cliente decida.`);
      break;

    case "details_query":
      if (product) {
        lines.push(`• El cliente pregunta detalles sobre "${product.name}".`);
        lines.push(`• Responde SOLO la pregunta puntual. No repitas toda la info del producto.`);
        lines.push(`• Entrega: 100% digital por Google Drive, acceso inmediato.`);
        lines.push(`• Garantía: 7 días sin preguntas.`);
        lines.push(`• Duración: acceso de por vida.`);
        lines.push(`• NO envíes la tarjeta de nuevo.`);
        // Post-pago: si pregunta qué enviar/comprobante, explica el proceso completo
        const rawText = (incomingText || "").toLowerCase();
        if (["que te debo enviar", "comprobante", "confirmarte", "para que sepas",
             "ya pagué", "ya pague", "acabo de pagar", "ya transferí", "ya transferi",
             "captura", "pantallazo", "como confirmo", "como sabes", "comprobante de",
             "te envio", "te mando", "ya hice el", "ya realicé", "ya realize"].some(p => rawText.includes(p))) {
          lines.push(`\n📌 PROCESO POST-PAGO — Explícale claramente:`);
          lines.push(`• Si pagó por LINK (MercadoPago/PayPal): El sistema DETECTA el pago automáticamente y le envía el link de Google Drive del producto a este chat. No necesita hacer nada.`);
          lines.push(`• Si pagó por CONSIGNACIÓN (Nequi/Daviplata/transferencia): Debe REENVIAR la captura/comprobante del pago por este chat. El equipo verifica y envía el link de Google Drive de inmediato.`);
          lines.push(`• Respuesta sugerida: "Si pagaste por Nequi/Daviplata, reenvíame la captura del comprobante por aquí para verificar y enviarte tu link de acceso. Si pagaste por MercadoPago o PayPal, el sistema lo detecta automáticamente y te llega el link."`);
          lines.push(`• NO envies la tarjeta ni los links de pago otra vez — ya se enviaron antes.`);
          lines.push(`• NO digas "te lo envío" ni "te mando el link" — el sistema lo hace automáticamente.`);
        }
      } else {
        lines.push(`• El cliente pregunta detalles pero no hay producto en contexto.`);
        lines.push(`• PROHIBIDO inventar información de productos.`);
        lines.push(`• Pregúntale sobre qué producto quiere información específica.`);
        lines.push(`• NO menciones precios, garantías ni características de productos que no estén en el bloque de PRODUCTO EN CONTEXTO.`);
      }
      break;

    case "payment_intent":
      if (product) {
        lines.push(`• El cliente QUIERE COMPRAR "${product.name}". Confirma con entusiasmo.`);
        lines.push(`• Responde de forma natural y cálida. NO te alargues — 2-3 líneas máximo.`);
        lines.push(`• No describas el producto otra vez; la tarjeta con métodos de pago se envía automáticamente abajo.`);
        lines.push(`• NO escribas URLs, links ni números de cuenta.`);
        lines.push(`• Sé breve pero humano. Ej: "¡Excelente elección! 💪 Te dejo aquí los datos para el pago"`);
      } else {
        lines.push(`• El cliente quiere pagar pero no hay producto identificado.`);
        lines.push(`• Pregúntale qué producto quiere adquirir de forma amable.`);
      }
      break;

    case "objection":
      lines.push(`• El cliente tiene una objeción. Valida su preocupación con empatía genuina.`);
      lines.push(`• NO presiones. Escucha, entiende y ofrece soluciones.`);
      lines.push(`• Si es precio: recuerda el valor, la garantía de 7 días y el acceso de por vida.`);
      lines.push(`• Si es desconfianza: menciona la garantía y que es pago único sin letra chica.`);
      break;

    case "confirmation":
      if (product) {
        lines.push(`• El cliente CONFIRMA que quiere comprar "${product.name}". ¡Genial!`);
        lines.push(`• Responde con entusiasmo genuino y brevedad (2-3 líneas máximo).`);
        lines.push(`• La tarjeta de pago con todos los métodos se envía automáticamente abajo.`);
        lines.push(`• NO inventes ni reescribas descripción del producto.`);
        lines.push(`• NO escribas URLs, links ni números de cuenta.`);
      }
      break;

    case "leaving":
      lines.push(`• El cliente se despide. Despídete amablemente y deja la puerta abierta.`);
      lines.push(`• No insistas en vender. Sé breve y cálida.`);
      break;

    default:
      lines.push(`• Responde de forma natural y útil a lo que el cliente pregunta.`);
      if (product) {
        lines.push(`• Mantén el contexto del producto "${product.name}".`);
      }
  }

  // ── Datos del producto activo ──────────────────────────────────────────────
  if (product) {
    lines.push(`\n📦 PRODUCTO EN CONTEXTO:`);
    lines.push(`• Nombre: ${product.name}`);
    lines.push(`• ID: ${product.id}`);
    lines.push(`• Precio: ${formatPrice(product.price, product.currency)}`);
    lines.push(`• Descripción: ${product.description}`);
    if (product.features.length > 0) {
      lines.push(`• Características:`);
      product.features.forEach(f => lines.push(`  ✅ ${f}`));
    }
    lines.push(`\n🚨 USA SOLO los datos de arriba. NO inventes características ni precios.`);
    if (!shouldSendCard) {
      lines.push(`🚨 NO envíes [CARD: ${product.id}] — ya se mostró antes.`);
    }
  }

  // ── Catálogo completo — SIEMPRE se inyecta para que la IA no improvise ─────
  if (allProducts && allProducts.length > 0) {
    lines.push(`\n\n━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📋 CATÁLOGO COMPLETO DE PRODUCTOS (usa SOLO esta información)`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🚨 REGLA ABSOLUTA: NO inventes ningún dato que no esté aquí. Si el producto no aparece en esta lista, NO EXISTE.`);
    allProducts.forEach((p, i) => {
      lines.push(`\n[${i + 1}] ID:${p.id} | ${p.name}`);
      if (p.price) lines.push(`    💰 Precio: ${formatPrice(Number(p.price), p.currency || 'COP')}`);
      if (p.description) lines.push(`    📝 ${String(p.description).substring(0, 200)}`);
      if (p.category) lines.push(`    🏷️ Categoría: ${p.category}`);
    });
    lines.push(`\n━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`FIN DEL CATÁLOGO. Usa [CARD: ID] con el ID exacto del producto de arriba.`);
  }

  // ── REGLA FINAL INQUEBRANTABLE — La IA la lee justo antes de generar ────────
  lines.push(`\n\n🔴🔴🔴 REGLA FINAL INQUEBRANTABLE 🔴🔴🔴`);
  lines.push(`NUNCA termines tu respuesta con una pregunta. NINGUNA. Ni "¿Qué idioma buscas?", ni "¿Te interesa?", ni "¿Podrías darme más detalles?".`);
  lines.push(`Eres una IA inteligente: Lee lo que pide el cliente (incluso si tiene errores ortográficos como "pianob" o "megaoack"). Revisa el CATÁLOGO COMPLETO. Si encuentras el producto (ej. ID 311 para piano), DEBES responder ÚNICAMENTE usando la etiqueta [CARD: ID] y una línea super corta introductoria. NO inventes precios en el texto, el precio ya viene en la tarjeta.`);
  lines.push(`Si el cliente pide algo que DEFINITIVAMENTE NO ESTÁ en el catálogo (ej. "naves espaciales"), dile amablemente que no lo manejas y ofrece el catálogo general.`);
  lines.push(`El cliente decide. Tú informas. No interrogas.`);
  lines.push(`🔴🔴🔴 FIN REGLA FINAL 🔴🔴🔴`);

  return lines.join("\n");
}

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currency || "COP",
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
  }
}

// ─── Guardar mensaje del agente en BD ─────────────────────────────────────────

export async function saveAgentMessage(
  conversationId: number,
  content: string,
  stage: Stage,
  metadata: MessageMetadata
): Promise<void> {
  try {
    await db.insert(messages).values({
      conversationId,
      role: "agent",
      content,
      stage,
      metadata,
    });

    // Actualizar lastMessage en la conversación
    await db.update(conversations)
      .set({ lastMessage: content.substring(0, 200), lastMessageAt: new Date() })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    console.error(`[ConversationEngine] Error guardando mensaje del agente:`, err);
  }
}

// ─── Actualizar etapa en BD ────────────────────────────────────────────────────

export async function persistStage(conversationId: number, stage: Stage): Promise<void> {
  try {
    await db.update(conversations)
      .set({ currentStage: stage })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    console.error(`[ConversationEngine] Error actualizando etapa:`, err);
  }
}

// ─── Construir historial para la IA ───────────────────────────────────────────

export function buildChatHistory(memory: ConversationMemory, maxMessages?: number): Array<{ role: string; content: string }> {
  const history = maxMessages ? memory.history.slice(-maxMessages) : memory.history;
  return history.map(m => ({
    role: m.role === "customer" ? "user" : "assistant",
    content: m.content,
  }));
}
