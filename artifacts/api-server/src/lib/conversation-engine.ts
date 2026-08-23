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
import { db, conversations, messages, products, productCategories, leads } from "@workspace/db";
import type { MessageMetadata } from "@workspace/db";
import { dbNow } from "./date-utils";
import { renderBloqueNegocio, type BusinessContext } from "./business-context";

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

  /**
   * El mensaje del cliente no nombra NINGÚN producto (ni bien ni mal): es un
   * saludo, un "quiero más información", un "gracias".
   *
   * No es lo mismo que `productSearchFailed`, y confundirlos fue el bug del
   * 2026-08-22. `productSearchFailed` significa "pidió algo que no tenemos" y
   * hace que el bot responda "no lo manejo". Esto significa "no pidió nada
   * todavía", y lo único correcto es no suponer.
   *
   * Antes este caso no existía: si la búsqueda no encontraba nada pero la
   * conversación arrastraba un producto viejo, el motor hacía
   * `productToShow = null`, NO marcaba nada, y la IA se quedaba sola con el
   * historial. Un cliente que llegó de un anuncio de piano recibió un cojín de
   * moto, que era de lo que se había hablado en otra conversación. Meta manda
   * el mismo "¡Hola! Quiero más información" para todos los anuncios, así que
   * este caso le pasa a CADA cliente que llega de publicidad paga.
   */
  mensajeSinProducto: boolean;

  /**
   * El producto que la búsqueda identificó EN ESTE MENSAJE (no en el historial).
   *
   * Existe porque avisar a la IA no alcanza. Hasta ahora, cuando la búsqueda
   * acertaba se hacía `productToShow = null` y a la IA solo le llegaba un texto
   * sugiriéndole el producto; si escribía el id de otro producto del catálogo,
   * el parser lo aceptaba sin comparar contra nada (solo corregía ids
   * INVÁLIDOS). Resultado medido en producción el 17-08-2026: el cliente pidió
   * el curso de IDIOMAS y recibió el de PIANO, que era el que venía en el
   * historial. El emparejador había acertado -- nadie hacía cumplir su
   * resultado.
   *
   * Con esto el parser puede corregir la tarjeta a lo que el cliente REALMENTE
   * pidió, en vez de confiar en que el modelo obedezca.
   */
  productoDelMensaje: { id: number; name: string; score: number } | null;

  /**
   * El cliente pidió explícitamente que le reenvíen la ficha ("mandámela de
   * nuevo", "no me llegó"). Sin esto, una tarjeta ya enviada no se repite:
   * se contesta solo lo que preguntó.
   */
  pidioReenvio: boolean;

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
  // "producto"/"servicio"/"cosa" no identifican QUÉ producto: son sustantivos
  // genéricos que cualquier cliente usa ("quiero info del producto"). Antes
  // "producto curso" dejaba "producto" como término específico y la búsqueda
  // devolvía una coincidencia de nivel 1 (basura) en vez de admitir que no
  // había nada que matchear.
  "producto", "productos", "servicio", "servicios", "cosa", "cosas", "articulo", "articulos",
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
// Fuente única: variables de entorno TRANSFER_NUMBER / TRANSFER_NAME.
// Antes conversation-engine leía TRANSFER_OWNER y payments.ts leía
// TRANSFER_NAME, con defaults distintos ("Deiner Mena" vs "Duvier Mena") →
// el titular podía mostrarse incorrecto/inconsistente. Se unifica en
// TRANSFER_NAME (con fallback a TRANSFER_OWNER por compatibilidad).
const DEFAULT_TRANSFER_NUMBER = process.env.TRANSFER_NUMBER || "";
const DEFAULT_TRANSFER_OWNER = process.env.TRANSFER_NAME || process.env.TRANSFER_OWNER || "";

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
  voice?: { emojis: Record<string, string>; deliveryInfo?: { method: string; timeframe: string; details: string }; guaranteeInfo?: { days: number; description: string }; accessInfo?: { type: string; description: string } },
  // Este es el camino MÁS peligroso de todo el motor: devuelve texto que se le
  // manda al cliente TAL CUAL, sin que la IA lo vea. Antes los datos salían de
  // los valores por defecto de acá abajo ("Google Drive", 7 días, "de por
  // vida"), que son los de TecnoVariedades: cualquier negocio del SaaS que
  // preguntara por entrega o garantía recibía esas promesas escritas a mano.
  //
  // Ahora cada respuesta exige el dato REAL del negocio. Si no está
  // configurado, devuelve null y el mensaje cae en la IA -- que ya tiene el
  // bloque de negocio y la prohibición explícita de inventarlo. Un segundo más
  // de latencia es mejor que prometer algo que el negocio no cumple.
  negocio?: BusinessContext | null
): HardcodedAnswer | null {
  const t = text.toLowerCase();
  const prod = productName ? `*${productName}*` : "el curso";
  const e = voice?.emojis || {};
  const emoji = (key: string, fallback: string) => e[key] || fallback;

  const entrega = negocio?.entrega || null;
  const garantia = negocio?.garantia || null;
  const acceso = negocio?.acceso || null;

  const deliveryMethod = entrega?.metodo || "";
  const deliveryTime = entrega?.plazo || "";
  const accessType = acceso?.tipo || "";

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

  if (entrega && DELIVERY_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("delivery", "📦")} La entrega de ${prod} es *100% digital por ${deliveryMethod}*. Tenemos 2 formas:\n\n1️⃣ *Pago por link* (MercadoPago/PayPal): El sistema detecta tu pago automáticamente y te envía el link de ${deliveryMethod} aquí mismo.\n\n2️⃣ *Pago por consignación* (Nequi/Daviplata): Después de transferir, reenvías la captura del comprobante por este chat y te enviamos el link.\n\nAmbos métodos te dan acceso *${deliveryTime}* desde cualquier dispositivo. ${emoji("benefit", "✅")}${closing}`,
    };
  }

  if (entrega && ACCESS_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("delivery", "🔗")} El acceso a ${prod} es por *${deliveryMethod}*. Una vez confirmado el pago (automático si pagas por link, o manual si envías comprobante), recibirás el enlace directo aquí. Lo abres desde el celular o computador, sin descargas obligatorias. ${emoji("benefit", "✅")}${closing}`,
    };
  }

  if (garantia && GUARANTEE_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("guarantee", "🛡️")} ${garantia.descripcion} ${emoji("benefit", "✅")}${closing}`,
    };
  }

  if (acceso && DURATION_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("benefit", "♾️")} El acceso a ${prod} es *${accessType}*.${acceso.descripcion ? ` ${acceso.descripcion}` : ""} ${emoji("benefit", "✅")}${closing}`,
    };
  }

  // "Qué incluye" NO tiene respuesta enlatada posible: lo que trae cada
  // producto está en su ficha, no en una plantilla. La versión anterior
  // afirmaba "videos en alta definición", "PDFs descargables" y "pago único"
  // para cualquier producto de cualquier negocio. Se manda a la IA, que sí
  // tiene el catálogo delante.

  if (entrega && SUPPORT_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      response: `${emoji("benefit", "💬")} Con ${prod} tenés el material disponible por ${deliveryMethod} cuando quieras. Si surge alguna duda, me escribís por acá mismo y te ayudo. ${emoji("benefit", "✅")}${closing}`,
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

/**
 * Estilo emoji para los mensajes al cliente: sin asteriscos de negrita ni
 * viñetas de punto/guion — usa emojis, que se leen más amigables y pro en
 * WhatsApp/Messenger. Se aplica a TODO mensaje saliente.
 */
export function toEmojiStyle(text: string): string {
  if (!text) return text;
  let t = text;
  // Negritas markdown *texto* → texto (y quitar asteriscos sueltos)
  t = t.replace(/\*([^*\n]+)\*/g, "$1").replace(/\*/g, "");
  // Viñetas al inicio de línea (•, -, ▪, ●, ·, ‣) → ✅, salvo que la línea ya
  // empiece con un emoji.
  t = t.replace(/^[ \t]*[•▪●‣·]\s+/gm, "✅ ");
  t = t.replace(/^[ \t]*-\s+(?=[A-Za-zÁÉÍÓÚÑáéíóúñ0-9])/gm, "✅ ");
  // Separadores largos de guiones/igual (se ven robóticos) → quitar
  t = t.replace(/^[ \t]*[-=_]{3,}[ \t]*$/gm, "");
  // Colapsar líneas vacías de más
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

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

// Cortesías y muletillas que acompañan al saludo sin cambiar la intención.
// "hola amigo" sigue siendo un saludo; "hola precio?" no.
const CORTESIAS = [
  "amigo", "amiga", "señor", "señora", "senor", "senora", "don", "doña", "dona",
  "disculpa", "disculpe", "perdon", "perdón", "por favor", "porfa", "porfis",
  "gracias", "tardes", "dias", "días", "noches", "estas", "estás", "esta", "tal",
  "ahi", "ahí", "todo bien", "que mas", "qué más", "como va", "cómo va", "bendiciones",
];

// Una sola palabra que, sola, ya es un pedido concreto.
const PALABRA_ES_PEDIDO = new Set([
  "precio", "precios", "costo", "costos", "valor", "vale", "cuanto", "cuánto",
  "info", "informacion", "información", "curso", "cursos", "producto", "productos",
  "comprar", "compro", "pagar", "catalogo", "catálogo", "interesa", "interesado",
]);

function quitarSaludoYCortesias(t: string): string {
  let r = ` ${t} `;
  // De más largo a más corto: si "buenas" se fuera primero, "buenas tardes"
  // dejaría "tardes" suelto como si fuera contenido.
  const aQuitar = [...GREETING_PATTERNS, ...CORTESIAS].sort((a, b) => b.length - a.length);
  for (const p of aQuitar) {
    r = r.replace(new RegExp(`(^|[^a-záéíóúñ])${p}([^a-záéíóúñ]|$)`, "gi"), " ");
  }
  return r.replace(/[¡!¿?.,;:*_()\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function esPedidoReal(resto: string): boolean {
  if (!resto) return false;
  const palabras = resto.split(/\s+/).filter(Boolean);
  // Una sola palabra suele ser el nombre de quien escribe ("hola duvier"),
  // no un pedido — salvo que la palabra misma sea el pedido ("hola precio").
  if (palabras.length === 1) return PALABRA_ES_PEDIDO.has(palabras[0]!);
  return palabras.length >= 2;
}

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase().trim();
  const words = t.split(/\s+/);
  const wordCount = words.length;

  // Un saludo es "puro" solo si al quitarle el saludo y las cortesías NO
  // queda un pedido. Antes alcanzaba con que el mensaje tuviera "hola" y
  // ≤8 palabras, así que "¡Hola! Quiero más información" — el texto exacto
  // que manda WhatsApp cuando alguien hace clic en un anuncio de Facebook —
  // y "hola cuanto vale el curso de piano" se clasificaban como saludo: el
  // cliente que venía llegando del anuncio recibía un "¿qué estás buscando?"
  // que ignoraba justamente lo que había venido a buscar.
  // El saludo se detecta por PALABRA ENTERA, igual que se borra.
  //
  // Antes se detectaba con `t.includes(p)` -- subcadena -- mientras que
  // quitarSaludoYCortesias borra solo palabras enteras. Esa asimetría colgaba
  // el proceso: "hola chicas lindas" -> se quita "hola" -> queda "chicas
  // lindas", que TODAVÍA contiene "hi" dentro de "chicas", así que volvía a
  // entrar acá; pero ya no hay nada que borrar, el texto no cambia, y se
  // llama a sí mismo para siempre. Cayó de verdad (17-08-2026): un cliente
  // de Guatemala llegado de un anuncio pago quedó sin respuesta con
  // "Maximum call stack size exceeded". Pasa con cualquier palabra que
  // contenga "hi", "ola" o "hey" adentro (chicas, cola, ahí, chino...).
  const tieneSaludo = GREETING_PATTERNS.some((p) =>
    new RegExp(`(^|[^a-záéíóúñ])${p}([^a-záéíóúñ]|$)`, "i").test(t));

  if (tieneSaludo) {
    const resto = quitarSaludoYCortesias(t);
    // Segundo candado, por si alguna combinación futura vuelve a dejar el
    // texto igual: solo se recurre si el texto REALMENTE se achicó. Con eso
    // la recursión termina siempre, sin depender de que los patrones y el
    // borrado se mantengan sincronizados.
    if (resto.length < t.length && esPedidoReal(resto)) return detectIntent(resto);
    return esPedidoReal(resto) ? "product_query" : "greeting";
  }

  // Intención de pago o detalles post-pago
  // Post-pago: cliente pregunta qué enviar/comprobar después de pagar o sobre requisitos de entrega
  const postPaymentProc = ["que te debo enviar", "que debo enviar", "que te mando", "para confirmarte",
    "comprobante", "para que sepas", "para que veas", "te envió el", "te mando el",
    "ya pagué", "ya pague", "acabo de pagar", "captura", "pantallazo",
    "confirmarte que", "para confirmar el pago", "envío el comprobante",
    "ya transferí", "ya transferi", "acabo de transferir",
    "te llega el", "como sabes", "como confirmo",
    "que necesita", "que necesitas", "para entregar", "como lo envias",
    "como me lo entregas", "correo", "email", "datos necesitas", "entregarselo", "entregárselo"];
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

  const hasPayment = PAYMENT_PATTERNS.some(p => t.includes(p));
  if (hasPayment) {
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

  // Cargar historial completo (últimos 30 mensajes).
  // Desempate por id (serial autoincremental): sin esto, dos mensajes con el
  // mismo createdAt (mismo segundo — cliente que manda dos mensajes seguidos,
  // o respuesta del bot + mensaje del cliente casi simultáneos) quedan en
  // orden indefinido, y el motor podía leer el mensaje equivocado como "el
  // último" — respondiendo a algo viejo en vez del mensaje actual.
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
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

  // "Ya le mandé esa ficha" vale para ESTA sesión, no para siempre.
  //
  // Este set decide si una tarjeta se descarta por repetida (agent.ts). Se
  // armaba recorriendo TODO el historial sin mirar fechas, así que una ficha
  // enviada hace días seguía contando como "ya la tiene".
  //
  // Medido en vivo el 2026-08-22: al admin se le había mandado la ficha del
  // piano el 16 de agosto. Seis días después escribió "hola, quiero info del
  // curso de piano" y recibió SOLO el texto — "te lo dejo aquí para que lo
  // veas con calma" — sin ninguna ficha abajo. El bot le prometió algo que
  // el propio sistema estaba descartando.
  //
  // Un cliente que vuelve días después no tiene la tarjeta a la vista, y esa
  // tarjeta además lleva los enlaces de pago vigentes. Se usa el mismo corte
  // de 4h que define `isNewSession`: dentro de la sesión no se repite, en una
  // visita nueva sí.
  const VENTANA_SESION_MS = 4 * 60 * 60 * 1000;
  const ultimoMensaje = history[history.length - 1]?.createdAt;
  const corteSesion = ultimoMensaje ? new Date(ultimoMensaje).getTime() - VENTANA_SESION_MS : 0;
  const enEstaSesion = (msg: { createdAt: Date }) =>
    !corteSesion || new Date(msg.createdAt).getTime() >= corteSesion;

  for (const msg of agentMessages) {
    const meta = msg.metadata as MessageMetadata | null;
    if (meta?.cardSent && meta.productId) {
      if (enEstaSesion(msg)) sentProductIds.add(meta.productId);
      currentProductId = meta.productId;
      currentProductName = meta.productName || null;
    }
    // También detectar por patrón [CARD: N] en el contenido (retrocompatibilidad)
    const cardMatch = msg.content.match(/\[CARD:\s*(\d+)\s*\]/i);
    if (cardMatch) {
      const pid = parseInt(cardMatch[1]);
      // Mismo corte de sesión que arriba: los mensajes viejos siguen sirviendo
      // para saber DE QUÉ se venía hablando, pero no para descartar una ficha.
      if (enEstaSesion(msg)) sentProductIds.add(pid);
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
  // Los PLURALES faltaban, y eso desviaba búsquedas enteras: "curso" estaba
  // pero "cursos" no, así que en "tienes cursos de inglés?" la palabra
  // "cursos" contaba como término ESPECÍFICO y coincidía con el producto que
  // literalmente se llama "CURSOS DISEÑO GRÁFICO". El cliente preguntaba por
  // inglés y recibía diseño gráfico.
  "cursos", "packs", "megapacks", "programas", "combos", "kits", "series",
  "colecciones", "paquetes", "masters",
]);

function normalizeText(t: string): string {
  return t.toLowerCase()
    // Los acentos se quitan de las DOS partes que se comparan (la pregunta del
    // cliente y el nombre del producto, ver findBestProductMatch), así que
    // sacarlos no rompe nada y arregla un fallo real: el cliente escribe
    // "inglés" y el producto se llama "INGLES" -- sin esto no coincidían, y la
    // búsqueda terminaba eligiendo un producto de otra categoría.
    // Los reemplazos manuales de abajo (reparación, teléfono, decoración)
    // existían justamente por esta falta; quedan por compatibilidad.
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
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

/**
 * ¿El mensaje nombra algo concreto, o no dice nada todavía?
 *
 * Distingue "no tengo ese producto" de "el cliente no pidió nada". Son cosas
 * muy distintas y confundirlas hacía que el bot le ofreciera al cliente el
 * producto de una conversación vieja.
 *
 * Usa el MISMO criterio que `findBestProductMatch` para separar palabras
 * específicas de genéricas — a propósito: si algún día cambian las listas, las
 * dos funciones tienen que cambiar juntas o vuelven a desincronizarse.
 */
export function mensajeNombraProducto(text: string): boolean {
  // Primero se sacan saludos y cortesías con el mismo helper que ya usa
  // `detectIntent` — si no, "¡Hola! Quiero más información" contaba a "hola"
  // como palabra específica y el mensaje parecía nombrar un producto. Ese era
  // exactamente el mensaje que Meta autocompleta para todos los anuncios.
  const sinSaludo = quitarSaludoYCortesias(normalizeText(text));
  const allWords = sinSaludo.split(/\s+/).filter(w =>
    (w.length > 2 || /^\d+$/.test(w)) && !STOP_WORDS.has(w)
  );
  return allWords.some(w => !GENERIC_HEADERS.has(w) && !GENERIC_WORDS.has(w));
}

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
  // PERO: Si no hay nivel 2+, permitir nivel 1 como último recurso
  let valid = evaluations.filter(e => e.level >= 2);

  if (valid.length === 0) {
    // Último recurso: permitir nivel 1 si hay coincidencia genérica
    valid = evaluations.filter(e => e.level >= 1);
    
    if (valid.length === 0) {
      reasoning.push("❌ Ningún producto alcanza el criterio mínimo de coincidencia (nivel 1).");
      reasoning.push(`   Productos revisados: ${productList.length}.`);
      reasoning.push("   Respuesta: informar que no se encontró el producto buscado y listar productos similares.");
      return null;
    }
    
    reasoning.push("⚠️ Usando coincidencia genérica (nivel 1) como último recurso.");
  }

  // Ordenar por nivel descendente, luego por precisión del NOMBRE (no de la
  // descripción). El orden importa, y acá hubo un bug que se midió en
  // producción: dos productos con el mismo nivel (ej. "Guitarra Acústica" y
  // "Guitarra Acústica Premium" contienen ambas "guitarra acústica") empataban
  // en nombre, y el desempate por DESCRIPCIÓN le daba la victoria a "Premium"
  // solo porque su descripción repetía "guitarra". El cliente pedía la guitarra
  // acústica exacta y recibía la Premium.
  //
  // Cuando el nombre ya contiene la frase, la descripción no puede decidir: el
  // nombre MÁS CORTO es el más preciso (coincidencia exacta > "X Premium").
  valid.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;

    // Tiebreaker 1: Palabras específicas en el nombre
    const aNameHits = specificWords.filter(w => normalizeText(a.product.name).includes(w)).length;
    const bNameHits = specificWords.filter(w => normalizeText(b.product.name).includes(w)).length;
    if (bNameHits !== aNameHits) return bNameHits - aNameHits;

    // Tiebreaker 2: Longitud del nombre — el más corto es la coincidencia más
    // exacta (el nombre exacto le gana a "X Premium"/"X Completo"). Va ANTES de
    // la descripción a propósito: el nombre es lo que el cliente ve y nombra.
    const aNameLen = normalizeText(a.product.name).length;
    const bNameLen = normalizeText(b.product.name).length;
    if (bNameLen !== aNameLen) return aNameLen - bNameLen;

    // Tiebreaker 3: Palabras específicas en la descripción (último recurso)
    const aDescHits = specificWords.filter(w => normalizeText(a.product.description || "").includes(w)).length;
    const bDescHits = specificWords.filter(w => normalizeText(b.product.description || "").includes(w)).length;
    if (bDescHits !== aDescHits) return bDescHits - aDescHits;

    return 0;
  });

  const best = valid[0];

  // (Eliminado el bloque de "validación adicional" que re-ordenaba los
  // empates con `nameHits*2 + descHits`. Ese rescore volvía a premiar la
  // descripción y deshacía el orden correcto calculado arriba: con
  // "guitarra acústica" devolvía "Guitarra Acústica Premium" porque su
  // descripción repetía "guitarra". El `valid.sort()` de arriba ya resuelve
  // el empate correctamente con precisión del nombre.)

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
  categoryMap: Map<number, string>,
  // El perfil REAL del negocio de este cliente (business-context.ts). Es
  // opcional a propósito: sin él, el bloque de contexto ya no inventa nada --
  // simplemente no afirma cómo se entrega, si hay garantía ni cuánto dura el
  // acceso. Antes ese hueco se rellenaba con los datos de TecnoVariedades,
  // escritos a mano acá abajo, y el agente los afirmaba con total seguridad
  // aunque el cliente fuera un gimnasio o un restaurante.
  negocio?: BusinessContext | null
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
  let mensajeSinProducto = false;
  let searchReasoning: string | null = null;
  let productoDelMensaje: EngineDecision["productoDelMensaje"] = null;

  // "mandámela de nuevo", "no me llegó", "reenviame la ficha"
  // Sin \b al final a propósito: "reenviame", "llegó", "mandámela" siguen con
  // más letras y un cierre de palabra los dejaba afuera.
  const pidioReenvio = /\b(de nuevo|otra vez|reenvi|re-?envi|no me lleg|no lleg|volv[eé]?[a-z]* a (mandar|enviar|pasar)|p[aá]sa(me|mela)?\s+(de nuevo|otra vez)|manda(me|mela)?\s+(de nuevo|otra vez))/i.test(t);

  // ── "¿Cuál es la forma de pago?" NO es una búsqueda de producto ──────────
  //
  // Cuando el cliente pregunta CÓMO pagar, ya eligió: el producto es el que
  // se venía hablando. Volver a buscarlo en ese texto es pedirle al matcher
  // que encuentre un producto en una frase que no nombra ninguno -- y lo
  // encuentra igual, porque cualquier palabra suelta le da puntaje.
  //
  // Pasó en vivo el 2026-08-23 (conversación 1). El cliente venía viendo el
  // Curso de Piano:
  //   14:40  cliente: "Hola tienes el curso de piano ?"
  //   14:40  bot:     "Sí, claro que lo tenemos 🎹 ..."      → ficha del piano
  //   16:12  cliente: "Cual es la forma de pago"
  //   16:12  bot:     "...avanzar con el Aula Virtual 📚"    → ficha 93
  // Le ofreció pagar OTRO producto en el momento exacto del cierre: la peor
  // parte de la conversación para equivocarse, porque el cliente ya decidió.
  //
  // Con intención de pago o de confirmación se conserva el producto en foco y
  // no se vuelve a resolver. Es además lo que pide el manual: cuando pregunta
  // cómo pagar no se le vuelve a vender, se le cobra.
  // Si el cliente ya venía con un producto en foco, no se vuelve a resolver:
  // se deja pasar al `else if (memory.currentProductId)` de más abajo, que ya
  // maneja bien el caso de pago (conserva el producto y manda su ficha).
  const preguntaComoPagar =
    (intent === "payment_intent" || intent === "confirmation") && !!memory.currentProductId;

  if (!shouldGreet && intent !== "leaving") {
    // Buscar producto mencionado en el mensaje actual
    const match = preguntaComoPagar
      ? null
      : await findBestProductMatch(incomingText, productList, categoryMap);

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
        // ── CONSULTA DE PRODUCTO/DETALLE/GENERAL: la IA decide la tarjeta ──
        // Se le deja a la IA decidir si manda la tarjeta, pero SÍ se le dice
        // cuál producto identificó la búsqueda.
        //
        // Antes acá se guardaba `searchReasoning` y se seguía de largo, y ese
        // texto SOLO se imprimía dentro de `if (productSearchFailed)` -- o sea,
        // solo cuando la búsqueda FALLABA. Cuando acertaba, el resultado se
        // calculaba y se tiraba: la IA no recibía ni el nombre ni el id del
        // producto que el cliente acababa de pedir, y contestaba con lo último
        // que veía en el historial.
        //
        // Reportado en vivo (17-08-2026): el cliente preguntó por el curso de
        // IDIOMAS y el bot le respondió con el de PIANO, que era el producto
        // de la conversación anterior. El catálogo tiene tres productos de
        // idiomas y el emparejador los encontraba bien; el problema era que
        // nadie se lo contaba a la IA.
        productToShow = null;
        shouldSendCard = false;
        productoDelMensaje = { id: p.id, name: p.name, score: match.score };
        searchReasoning =
          `El cliente está preguntando por: "${p.name}" (ID ${p.id}, ${formatPrice(Number(p.price), p.currency || "COP")}).\n` +
          (alreadySent
            ? `⚠️ Su ficha YA se le envió antes. NO la repitas: contestá SOLO lo que preguntó en este mensaje, en pocas líneas y sin volver a listar todo el producto.\n`
            : "") +
          `Ese es el producto de ESTE mensaje. Respondé sobre ÉL, no sobre el que se venía hablando antes.\n` +
          `Si querés mostrar su tarjeta, escribí [CARD: ${p.id}].\n` +
          (match.reasoning ? `Por qué se eligió: ${match.reasoning}` : "");
        console.log(`🤖 [DECISION] Producto identificado para la IA: ${p.name} (ID ${p.id}, score ${match.score})`);
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
        // Mantener producto en contexto como referencia, pero IA decide.
        //
        // Acá estaba el bug del 2026-08-22: esta rama hacía `productToShow =
        // null`, logueaba, y no marcaba NADA. Al bloque de contexto no le
        // llegaba ni el producto ni un aviso, así que la IA se quedaba sola
        // con el historial y ofrecía lo último que veía ahí. Un cliente que
        // llegó de un anuncio de piano recibió un cojín de moto.
        //
        // La distinción que faltaba: si el cliente NO nombró nada, el producto
        // que arrastra la conversación es una suposición, no un dato — y hay
        // que decírselo a la IA en vez de callarse.
        const currentProduct = productList.find(p2 => p2.id === memory.currentProductId);
        if (currentProduct) {
          productToShow = null;
          shouldSendCard = false;
          mensajeSinProducto = !mensajeNombraProducto(incomingText);
          console.log(
            `🤖 [DECISION] Producto en contexto delegado a IA: ${currentProduct?.name} (ID: ${memory.currentProductId})` +
            (mensajeSinProducto ? " — ⚠️ el mensaje NO nombra producto: no darlo por supuesto" : "")
          );
        }
      }
    } else {
      // No hay match ni producto en contexto.
      //
      // Ojo con la diferencia: "pidió algo que no tenemos" hace que el bot
      // responda "no lo manejo", y eso está bien cuando el cliente pidió un
      // saxofón. Pero "¡Hola! Quiero más información" —el texto que Meta
      // autocompleta igual para TODOS los anuncios— no pide nada, y contestarle
      // "no lo manejo" a alguien que acaba de costar plata en publicidad es
      // peor que no contestar.
      if (!mensajeNombraProducto(incomingText)) {
        mensajeSinProducto = true;
        console.log(`🤷 [DECISION] El mensaje no nombra ningún producto - la IA debe preguntar, no suponer`);
      } else if (intent !== "payment_intent" && intent !== "confirmation") {
        productSearchFailed = true;
        console.log(`❌ [DECISION] Sin match y sin producto en contexto - delegado a IA`);
      } else {
        productSearchFailed = true;
        console.log(`❌ [DECISION] Sin match y sin producto en contexto para pago`);
      }
    }
  }

  // ── Construir bloque de contexto para el prompt ─────────────────────────────
  const contextBlock = buildContextBlock(memory, intent, stage, productToShow, shouldSendCard, searchReasoning, productSearchFailed, t, productList, negocio, mensajeSinProducto);

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
    mensajeSinProducto,
    productoDelMensaje,
    pidioReenvio,
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
  allProducts?: Array<any>,
  negocio?: BusinessContext | null,
  mensajeSinProducto?: boolean
): string {
  const lines: string[] = [];

  // ── Para quién trabaja el agente ───────────────────────────────────────────
  // Va PRIMERO, antes que cualquier instrucción: si el agente no sabe de qué
  // negocio es, todo lo que siga lo va a rellenar con lo que se imagine.
  if (negocio) lines.push(renderBloqueNegocio(negocio));

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
    // Antes acá iba solo la lista de ids, sin decirle qué hacer con ella. El
    // modelo la leía y volvía a mandar la ficha completa igual -- mismo texto,
    // mismo precio, mismos beneficios. Para el cliente eso es hablar con una
    // máquina; y WhatsApp además penaliza al número que manda mensajes
    // repetidos. Hay que decirle explícitamente qué hacer, no solo qué pasó.
    const yaMostrados = Array.from(memory.sentProductIds).join(", ");
    lines.push(`\n🔁 YA LE MANDASTE LA FICHA COMPLETA DE: producto(s) ${yaMostrados}`);
    lines.push(`   El cliente YA TIENE el nombre, el precio, lo que incluye y los enlaces de pago de ese producto.`);
    lines.push(`   ❌ NO se la repitas. Repetir lo mismo que ya dijiste te hace sonar a robot y hace que el cliente deje de leer.`);
    lines.push(`   ✅ En vez de eso, RAZONÁ qué le falta saber a ESTE cliente para decidir, y respondé SOLO eso:`);
    lines.push(`      · Si pregunta algo puntual (cuánto dura, si sirve para principiantes, cómo se paga), contestá ESA pregunta y nada más.`);
    lines.push(`      · Si repite la misma pregunta, es que algo no le quedó claro o no está convencido: preguntale qué duda le queda, o tocá un ángulo distinto del que ya usaste.`);
    lines.push(`      · Si no pregunta nada concreto, avanzá la venta: una objeción típica resuelta, o preguntá qué lo está frenando.`);
    lines.push(`   Podés dar por sabido lo que ya le dijiste: referite a eso ("el de $60.000 que te pasé", "el que tiene los 19 módulos") en vez de volver a listarlo.`);
    lines.push(`   Solo volvé a mandar la ficha si el cliente la PIDE explícitamente ("mandámela de nuevo", "no me llegó") o si es un producto DISTINTO.`);
  }

  // Si la búsqueda de producto no encontró nada coherente
  // El resultado de la búsqueda llega a la IA SIEMPRE, no solo cuando falla.
  //
  // Este bloque estaba únicamente dentro de `if (productSearchFailed)`: si la
  // búsqueda acertaba, la IA no recibía nada y respondía con el producto que
  // arrastraba del historial. El razonamiento ocurría y se perdía justo antes
  // de usarse -- que es peor que no razonar, porque parece que funciona.
  if (!productSearchFailed && !product && searchReasoning) {
    lines.push(`\n🔍 QUÉ ESTÁ PIDIENDO EL CLIENTE EN ESTE MENSAJE:`);
    searchReasoning.split("\n").filter(Boolean).forEach((r) => lines.push(r));
    lines.push(`\n⚠️ Contestá sobre ESE producto. Si el historial habla de otro, ese ya pasó: el cliente cambió de tema y hay que seguirlo.`);
  }

  // El mensaje no nombra nada. Es el caso de CADA cliente que llega de un
  // anuncio pago, porque Meta autocompleta el mismo texto para todos.
  // Antes acá no se decía nada y la IA ofrecía lo último que veía en el
  // historial — que podía ser de otra conversación, de otro tema, de otro día.
  if (mensajeSinProducto) {
    lines.push(`\n🤷 ESTE MENSAJE NO NOMBRA NINGÚN PRODUCTO.`);
    lines.push(`El cliente saludó o pidió información en general, pero todavía NO dijo qué le interesa.`);
    lines.push(`\n🚨 REGLA: NO supongas que sigue interesado en el producto del que se habló antes.`);
    lines.push(`   Ese producto puede ser de otra conversación, de otro día o de otro tema.`);
    lines.push(`   ❌ PROHIBIDO abrir con "¿Vienes por el [producto]?" o presentar una ficha por tu cuenta.`);
    if (memory.currentProductName) {
      lines.push(`   (En el historial aparece "${memory.currentProductName}". Es SOLO un antecedente: no lo des por vigente.)`);
    }
    lines.push(`\n✅ QUÉ HACER:`);
    lines.push(`   · Si más arriba figura un ANUNCIO del que llegó el cliente, ESE es el tema: hablá de ese producto.`);
    lines.push(`   · Si no hay anuncio, saludá corto y preguntá UNA sola cosa concreta: qué está buscando.`);
    lines.push(`   · Nunca inventes por dónde vino ni le atribuyas un interés que no expresó.`);
  }

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
    // Acá decía: NUNCA termines con preguntas como "¿qué tipo buscas?" o
    // "¿te interesa alguno?". Contradecía la REGLA FINAL de más abajo (que ya
    // se corrigió y solo prohíbe la pregunta VACÍA) y, peor, se aplicaba
    // justo en el peor momento posible: el cliente pidió algo que NO está en
    // el catálogo. Prohibir preguntar ahí convierte "no lo tengo" en un
    // callejón sin salida y el lead --que costó dinero-- se pierde entero.
    //
    // Preguntar qué necesita cuando no hay producto que ofrecer no es
    // interrogar: es la única forma de avanzar. La regla unificada es la
    // misma del resto del motor: se pregunta cuando la respuesta hace falta
    // para avanzar comercialmente, no para llenar campos.
    lines.push(`3. Dale igual algo útil: si hay algo parecido, decí en una línea por qué podría servirle. Y como no tenés el producto que pidió, SÍ corresponde una sola pregunta concreta para poder ayudarlo (qué necesita exactamente, para qué lo quiere). Lo que no va es la pregunta vacía tipo "¿te interesa alguno?" sin haberle dado nada antes.`);
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
  lines.push(`\n🚨 INSTRUCCIONES DE INTELIGENCIA AVANZADA:`);
  // La identidad sale del perfil del cliente, no de una constante. Antes acá
  // decía literalmente "Eres Sofía, asesora de TecnoVariedades D&S" -- y se le
  // pegaba DESPUÉS del prompt propio del dueño (agent.ts:921), así que ganaba
  // esta línea: todos los negocios del SaaS se presentaban como Sofía.
  const quienSos = negocio?.agentName
    ? `Eres ${negocio.agentName}${negocio.businessName ? `, asesor(a) de ${negocio.businessName}` : ""}.`
    : negocio?.businessName
      ? `Trabajás para ${negocio.businessName}.`
      : `Sos el asesor de ventas de este negocio.`;
  lines.push(`• ACTÚA CON INTELIGENCIA Y LÓGICA: ${quienSos} Analiza profundamente lo que el cliente está diciendo. No respondas como un robot de opciones fijas. Entiende el contexto real.`);
  // La categoría de abajo (${intent}) la calcula detectIntent() por
  // coincidencia de PALABRAS CLAVE en el último mensaje -- no es IA, no lee
  // el historial ni entiende matices. Con un mensaje directo funciona bien,
  // pero un cliente real a veces pregunta indirecto, mezcla dos temas en el
  // mismo mensaje ("no sé, tengo un teclado viejo, ¿me sirve igual?"), o dice
  // algo que a simple vista contradice lo anterior pero en realidad sigue
  // relacionado con lo mismo. Ahí la categoría puede quedar mal calculada.
  // Esta instrucción es la salvaguarda: la IA sí tiene el historial completo
  // (más abajo) y puede razonar de verdad, así que la categoría es solo un
  // punto de partida, nunca la última palabra.
  lines.push(`• La categoría detectada abajo ("${intent}") es un cálculo automático por palabras clave del ÚLTIMO mensaje -- útil como punto de partida, pero puede estar mal si el cliente preguntó indirecto, mezcló dos temas en el mismo mensaje, o dijo algo que a primera vista no encaja con la conversación. NUNCA sigas ciegamente esa categoría si el HISTORIAL COMPLETO de la conversación (más abajo) sugiere algo distinto -- leé todo el hilo, conectá lo que el cliente dice ahora con lo que ya habló antes, y respondé a la intención REAL, no a la etiqueta automática.`);
  lines.push(`• Un mensaje puede tocar MÁS DE UNA COSA a la vez (ej: duda + pregunta de precio en la misma frase). Respondé a todo lo relevante que el cliente planteó, no solo a la primera parte que coincida con una categoría.`);

  if (memory.hasGreeted) {
    lines.push(`• PROHIBIDO saludar ("Hola", "Buenos días", etc.). Ya saludaste en esta conversación. Ve directo a la respuesta.`);
  }

  switch (intent) {
    case "greeting":
      if (!memory.hasGreeted) {
        lines.push(`• Es el PRIMER contacto. Preséntate brevemente${negocio?.agentName ? ` como ${negocio.agentName}` : ""}${negocio?.businessName ? ` de ${negocio.businessName}` : ""} y ofrécele ayuda sin ser invasiva (máximo 2 líneas). No menciones productos aún.`);
      } else if (memory.isNewSession) {
        lines.push(`• El cliente regresa después de mucho tiempo. Saluda brevemente y ofrécele ayuda.`);
      } else {
        lines.push(`• El cliente saludó de nuevo. Ofrece tu ayuda proactivamente.`);
      }
      break;

    case "product_query":
      lines.push(`• El cliente busca un producto. Analiza inteligentemente sus palabras, corrige errores ortográficos mentalmente y busca en el CATÁLOGO.`);
      lines.push(`• Si tenemos el producto, PRESÉNTALO DIRECTAMENTE usando SOLO la etiqueta [CARD: ID] (ej. [CARD: 311]) con una mini frase introductoria. El precio y detalles van en la tarjeta, NO los repitas en tu texto.`);
      lines.push(`• Si definitivamente NO lo tenemos, sé honesto, dile que no lo manejas y ofrécele amablemente ver el catálogo general si lo desea.`);
      break;

    case "details_query":
      if (product) {
        lines.push(`• El cliente hace preguntas sobre "${product.name}" o sobre nuestro proceso.`);
        lines.push(`• USA LA LÓGICA EXTREMA: Lee exactamente qué está preguntando y respóndele como un humano experto. No des respuestas prefabricadas genéricas.`);
        // Estos tres datos estaban escritos a mano ("Google Drive / de por vida
        // / 7 días") y se afirmaban para CUALQUIER cliente del SaaS. Ahora
        // salen del perfil del negocio, y lo que no está configurado NO se
        // afirma: el bloque de arriba ya le prohibió inventarlo.
        const datos: string[] = [];
        if (negocio?.entrega) datos.push(`la entrega es ${negocio.entrega.metodo} (${negocio.entrega.plazo})`);
        if (negocio?.acceso) datos.push(`el acceso es ${negocio.acceso.tipo}`);
        if (negocio?.garantia) datos.push(negocio.garantia.descripcion);
        if (datos.length > 0) {
          lines.push(`• DATOS REALES DEL NEGOCIO: ${datos.join(". ")}.`);
        } else {
          lines.push(`• OJO: no tenés confirmados los datos de entrega, acceso ni garantía de este negocio. Si pregunta por eso, decile con naturalidad que lo confirmás y le respondés — NO lo inventes.`);
        }
        
        const rawText = (incomingText || "").toLowerCase();
        if (["que necesita", "que necesitas", "para entregar", "como lo envias", "como me lo entregas", "correo", "email", "datos necesitas", "que te debo enviar", "comprobante", "ya pagué", "ya transferí", "captura"].some(p => rawText.includes(p))) {
          lines.push(`\n📌 INTELIGENCIA POST-PAGO: El cliente quiere saber qué se requiere para recibir el acceso.`);
          lines.push(`• Dile esto claramente, con tus palabras pero cubriendo esta lógica: "Para entregarte el acceso solo necesito la captura/comprobante de tu pago por aquí (si pagas por Nequi/transferencia). Si usas MercadoPago/PayPal, el sistema detecta el pago y te manda el link automáticamente al chat. ¡No necesito tu correo!"`);
          lines.push(`• NO pidas correos electrónicos, la entrega es directa a este WhatsApp.`);
        }
      } else {
        lines.push(`• El cliente pregunta detalles pero no identificó un producto claro. Guíalo para saber sobre qué producto específico tiene dudas, con amabilidad.`);
      }
      break;

    case "payment_intent":
      if (product) {
        lines.push(`• El cliente QUIERE COMPRAR "${product.name}". ¡Excelente!`);
        lines.push(`• Responde con entusiasmo genuino, dale la bienvenida y dile que los métodos de pago están en la tarjeta de abajo (que se envía sola).`);
        lines.push(`• Sé breve (2 líneas). NO pongas URLs de pago en el texto.`);
      } else {
        lines.push(`• El cliente quiere pagar pero no sabemos qué producto. Pregúntale amablemente.`);
      }
      break;

    case "objection":
      lines.push(`• LÓGICA DE OBJECIÓN: El cliente duda. Usa empatía extrema. Valida su preocupación (ej. "Te entiendo perfectamente").`);
      // Antes acá se prometía "pago único de por vida" y "garantía de 7 días"
      // a ciegas. Para un negocio con suscripción mensual o sin garantía, eso
      // es una mentira que el cliente cobra después.
      lines.push(
        negocio?.acceso
          ? `• Si es precio: recordale el valor real de lo que recibe (acceso ${negocio.acceso.tipo}) y todo lo que incluye.`
          : `• Si es precio: recordale el valor real de lo que recibe y todo lo que incluye. NO prometas "pago único" ni "de por vida" salvo que figure en el catálogo o en los datos del negocio.`
      );
      lines.push(
        negocio?.garantia
          ? `• Si es desconfianza: mencioná la garantía real del negocio — ${negocio.garantia.descripcion}.`
          : `• Si es desconfianza: NO inventes una garantía. Generá confianza con datos verificables (qué incluye, cómo funciona el pago, que puede preguntar lo que quiera antes de comprar).`
      );
      break;

    case "confirmation":
      if (product) {
        lines.push(`• El cliente CONFIRMA la compra de "${product.name}". Agradécele con entusiasmo y dile que proceda con los métodos de pago detallados abajo.`);
        lines.push(`• NO inventes detalles adicionales, simplemente anímalo al cierre rápido.`);
      }
      break;

    case "leaving":
      lines.push(`• El cliente se despide o pospone. Despídete muy amablemente, recuérdale que sigues a su disposición cuando guste. Deja la puerta súper abierta.`);
      break;

    default:
      lines.push(`• Usa tu sentido común y responde fluidamente a lo que el cliente necesite.`);
      if (product) lines.push(`• Mantén en mente que el producto de interés es "${product.name}".`);
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

    // El catálogo entero iba en CADA mensaje. Medido el 2026-08-22 con 83
    // productos: 23.414 caracteres, el 74% de un prompt de 31.700. Eso
    // desborda el límite por minuto de los proveedores (Groq da 8.000 tokens/
    // min, o sea UN mensaje) y en los de pago se factura en cada respuesta.
    //
    // No hace falta mandarlo entero: quién es el producto de este mensaje ya
    // lo decidió `findBestProductMatch` sobre la lista COMPLETA, del lado del
    // servidor. Esta lista es para que la IA escriba un [CARD: ID] válido y
    // sepa qué hay cerca — con el producto en foco garantizado y un presupuesto
    // de caracteres alcanza. Las descripciones bajan de 200 a 110: en 200
    // caracteres entra media ficha repetida, en 110 entra de qué se trata.
    const TOPE_CATALOGO = Number(process.env.MAX_CATALOGO_CHARS || 3500);
    const enFoco = new Set<number>();
    if (product?.id) enFoco.add(product.id);
    if (memory.currentProductId) enFoco.add(memory.currentProductId);

    // Los relevantes primero, para que nunca los recorte el presupuesto.
    const ordenados = [
      ...allProducts.filter((p) => enFoco.has(p.id)),
      ...allProducts.filter((p) => !enFoco.has(p.id)),
    ];

    let usados = 0;
    let mostrados = 0;
    for (const p of ordenados) {
      const bloque = [
        `\n[${mostrados + 1}] ID:${p.id} | ${p.name}`,
        p.price ? `    💰 Precio: ${formatPrice(Number(p.price), p.currency || 'COP')}` : null,
        p.description ? `    📝 ${String(p.description).substring(0, 110)}` : null,
        p.category ? `    🏷️ Categoría: ${p.category}` : null,
      ].filter(Boolean).join("\n");

      // Un producto en foco entra aunque el presupuesto esté justo: si se
      // recorta JUSTO el que el cliente pidió, la IA no puede mandar su ficha.
      if (usados + bloque.length > TOPE_CATALOGO && !enFoco.has(p.id)) continue;

      lines.push(bloque);
      usados += bloque.length;
      mostrados++;
    }

    lines.push(`\n━━━━━━━━━━━━━━━━━━━━━━━`);
    if (mostrados < allProducts.length) {
      // Decirlo importa: sin esto la IA lee "FIN DEL CATÁLOGO" y concluye que
      // lo que no está en la lista no existe -- y le dice al cliente que no se
      // maneja un producto que sí está a la venta.
      lines.push(`⚠️ Esta lista muestra ${mostrados} de ${allProducts.length} productos (se recortó por longitud).`);
      lines.push(`   Si el cliente nombra algo que NO ves acá, NO afirmes que no existe: decile que lo verificás.`);
    }
    lines.push(`FIN DEL CATÁLOGO. Usa [CARD: ID] con el ID exacto del producto de arriba.`);
  }

  // ── REGLA FINAL INQUEBRANTABLE — La IA la lee justo antes de generar ────────
  lines.push(`\n\n🔴🔴🔴 REGLA FINAL INQUEBRANTABLE 🔴🔴🔴`);
  // Antes acá decía "NUNCA termines con una pregunta. NINGUNA." — y esa regla
  // le prohibía al agente lo que hace un vendedor de verdad: calificar y
  // aislar dudas. Medido el 2026-08-22: de seis respuestas a objeciones
  // reales, la MEJOR fue la única que rompió esta regla (al cliente que
  // comparaba precios le preguntó qué le atraía de la otra opción).
  // Además se contradecía con el propio prompt del sistema, que pide "avanzá
  // la venta en cada mensaje" — el mismo patrón del bug b4db407.
  //
  // Lo que estaba mal no era preguntar: era INTERROGAR sin dar nada, y
  // devolver una pregunta cuando el cliente ya había dicho lo que quería.
  lines.push(`NO interrogues: nunca respondas con una pregunta vacía como "¿Qué buscas?" o "¿Te interesa?" cuando el cliente YA te dijo qué quiere. Primero entregá valor o información concreta.`);
  lines.push(`SÍ podés —y debés— preguntar UNA cosa concreta cuando: el cliente duda o pospone (ahí aislá la duda), no sabés para qué lo quiere y eso cambia lo que le recomendás, o hay dos productos posibles y elegir mal arruina la venta.`);
  lines.push(`Una pregunta que hace avanzar la venta vale; tres preguntas seguidas, ninguna.`);
  lines.push(`Eres una IA inteligente: Lee lo que pide el cliente (incluso si tiene errores ortográficos como "pianob" o "megaoack"). Revisa el CATÁLOGO COMPLETO. Si encuentras el producto (ej. ID 311 para piano), DEBES responder ÚNICAMENTE usando la etiqueta [CARD: ID] y una línea super corta introductoria. NO inventes precios en el texto, el precio ya viene en la tarjeta.`);
  lines.push(`Si el cliente pide algo que DEFINITIVAMENTE NO ESTÁ en el catálogo (ej. "naves espaciales"), dile amablemente que no lo manejas y ofrece el catálogo general.`);
  lines.push(`El cliente decide. Vos informás y guiás — preguntás solo cuando esa pregunta lo acerca a decidir.`);
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

    // Actualizar lastMessage en la conversación.
    // dbNow() en vez de new Date().toISOString(): en Postgres esta columna
    // exige un objeto Date, un string la revienta (ver date-utils.ts). El
    // catch de abajo se comía el error en silencio — toda respuesta del
    // agente (saludo, detalles, handoff, fallback) actualizaba el mensaje
    // pero NUNCA lastMessageAt, así que el inbox ordenaba mal las
    // conversaciones recientes sin que se viera ningún error.
    await db.update(conversations)
      .set({ lastMessage: content.substring(0, 200), lastMessageAt: dbNow() })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    console.error(`[ConversationEngine] Error guardando mensaje del agente:`, err);
  }
}

/**
 * Guarda un mensaje del CLIENTE en la base.
 *
 * `saveAgentMessage` fija `role: "agent"` a propósito — es para las respuestas
 * del bot. Los mensajes del cliente se guardan por vías distintas en producción
 * (whatsapp.ts, facebook.ts, message-handler.ts hacen `db.insert(messages)` con
 * `role: "customer"`). Este helper centraliza ese caso para los tests de flujo
 * y para cualquier llamador futuro, evitando el error de intentar meter el rol
 * por el campo `metadata` (que no lo tiene).
 */
export async function saveCustomerMessage(
  conversationId: number,
  content: string,
  stage: Stage,
  metadata: MessageMetadata = {}
): Promise<void> {
  try {
    await db.insert(messages).values({
      conversationId,
      role: "customer",
      content,
      stage,
      metadata,
    });

    await db.update(conversations)
      .set({ lastMessage: content.substring(0, 200), lastMessageAt: dbNow() })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    console.error(`[ConversationEngine] Error guardando mensaje del cliente:`, err);
  }
}

// ─── Actualizar etapa en BD ────────────────────────────────────────────────────

/**
 * Etapa del EMBUDO que le corresponde a cada etapa de la conversación.
 *
 * El CRM no se alimentaba de las conversaciones: el agente venía etiquetando
 * cada charla (greeting / details / closing...) pero el lead se quedaba en
 * "new" para siempre. Con 23 conversaciones activas el embudo mostraba todo en
 * cero, así que no servía para saber dónde se traba la venta -- que es lo
 * único para lo que existe un embudo.
 *
 * "won" NO se pone acá a propósito: que el cliente llegue a cierre no
 * significa que pagó. Ganar un trato exige un pago confirmado, no una
 * conversación entusiasta.
 */
const ETAPA_DEL_EMBUDO: Record<string, string> = {
  greeting: "new",
  discovery: "contacted",
  details: "qualified",
  presentation: "qualified",
  objection_handling: "proposal",
  closing: "proposal",
  // post_sale llega cuando ya hubo compra; el lead pasa a ganado solo por el
  // camino del pago confirmado, no por esta vía.
  human_handoff: "contacted",
};

/** Orden del embudo: un lead avanza, nunca retrocede por una charla suelta. */
const ORDEN_EMBUDO = ["new", "contacted", "qualified", "proposal", "won", "lost"];

export async function persistStage(conversationId: number, stage: Stage): Promise<void> {
  try {
    await db.update(conversations)
      .set({ currentStage: stage })
      .where(eq(conversations.id, conversationId));

    // Reflejar el avance en el lead (el embudo del panel sale de ahí).
    const destino = ETAPA_DEL_EMBUDO[stage];
    if (!destino) return;
    const [convo] = await db
      .select({ leadId: conversations.leadId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!convo?.leadId) return;

    const [lead] = await db.select().from(leads).where(eq(leads.id, convo.leadId)).limit(1);
    if (!lead) return;
    // Un trato ya ganado o perdido no vuelve al embudo por un mensaje nuevo,
    // y tampoco se retrocede: si ya estaba en "proposal", que el cliente
    // salude otra vez no lo devuelve a "new".
    if (lead.stage === "won" || lead.stage === "lost") return;
    const actual = ORDEN_EMBUDO.indexOf(String(lead.stage || "new"));
    const nuevo = ORDEN_EMBUDO.indexOf(destino);
    if (nuevo <= actual) return;

    await db.update(leads).set({ stage: destino }).where(eq(leads.id, lead.id));
    console.log(`📊 [CRM] Lead ${lead.id}: ${lead.stage} → ${destino} (conversación en "${stage}")`);
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
