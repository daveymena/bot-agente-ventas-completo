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
  productToShow: { id: number; name: string; price: number; currency: string; description: string; features: string[]; kind?: string | null } | null;
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
   * El cliente pidió VER EL CATÁLOGO ("¿qué cursos tienen?"), no un producto
   * puntual. Ni `productSearchFailed` (que haría contestar "no lo tengo") ni
   * `mensajeSinProducto` (que haría devolverle la pregunta): pidió algo
   * concreto y lo que corresponde es mostrarle la oferta.
   */
  pidioVerCatalogo: boolean;

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
  "procedo", "adelante", "vamos", "dale", "lo quiero", "lo compro",
  // "lo quiero" ya estaba, pero el orden con demostrativo se escapaba: medido
  // con la simulación, "ese quiero" y "quiero ese" caían en intención genérica
  // y el bot volvía a preguntar qué buscaba a alguien que acababa de decidir.
  "ese quiero", "esa quiero", "quiero ese", "quiero esa",
  "ese me llevo", "me llevo ese", "ese mismo quiero",
];

const OBJECTION_PATTERNS = [
  "caro", "costoso", "muy caro", "mucho dinero", "pensarlo",
  "no sé", "no se", "duda", "dudas", "inseguro", "desconfío", "desconfio",
  "estafa", "devolución", "devolucion",
  "reembolso", "no tengo", "sin dinero",
  // "después" y "luego" estaban sueltos, y eso convertía "hasta luego" en una
  // objeción: el cliente se despedía y el bot le trabajaba una duda que no
  // puso. Van como frase, que es lo que realmente significa posponer.
  "para despues", "para después", "mas adelante", "más adelante",
  "lo dejo para", "luego lo veo", "luego te digo", "despues te digo",
  "lo pienso", "déjame pensar", "más barato", "descuento", "promoción", "promocion",
  // Las objeciones más comunes del manual de venta no estaban en la lista, así
  // que `objectionHandler.ts` --11 tipos, 8 estrategias-- nunca se activaba
  // para ellas: caían en "consulta de producto" y el bot contestaba como si le
  // hubieran preguntado una característica. "Lo voy a pensar" es LA objeción
  // clásica y no estaba: solo estaban "pensarlo" y "lo pienso".
  "lo voy a pensar", "voy a pensarlo", "lo tengo que pensar",
  "no estoy seguro", "no estoy segura", "no me convence",
  "realmente funciona", "de verdad funciona", "si funciona",
  "si no me gusta", "y si no funciona",
  "es confiable", "sera confiable", "será confiable", "son confiables",
  "como se que llega", "cómo sé que llega", "como se que llegara",
  "desconfianza", "me da cosa", "es seguro",
];

const CONFIRMATION_PATTERNS = [
  "sí", "si", "ok", "dale", "bueno", "perfecto", "listo",
  "me gustaría", "me gustaria", "adelante", "vamos",
  "de acuerdo", "claro", "por supuesto",
  // Formas de decir que sí que faltaban. Sin ellas, el cliente aceptaba y el
  // motor lo leía como "consulta de producto": se quedaba en presentación en
  // vez de cerrar. Medido: de 11 formas de confirmar, 5 no se reconocían.
  "hazlo", "correcto", "esta bien", "está bien", "envialo", "envíalo",
  "confirmado", "de una", "obvio", "exacto", "asi es", "así es",
  // "me sirve" parecía estar cubierto, pero lo cubría el bug: "sirve" contiene
  // "si" como subcadena. Al comparar por palabra entera quedó a la vista que
  // esta forma de aceptar nunca estuvo en la lista.
  "me sirve", "eso busco", "eso mismo",
];

// OJO: "gracias" a secas NO va aca, y es deliberado.
//
// Estuvo en esta lista y convertia en despedida CUALQUIER mensaje que la
// contuviera. En Colombia casi todo cliente educado cierra con "Gracias", asi
// que "Me interesa el curso de piano. Gracias." y "¿Tiene garantia? Gracias"
// se leian como que el cliente se iba, y el bot le contestaba "fue un placer
// atenderte" a alguien que acababa de decir que le interesaba.
//
// Caso real (conversacion 19, 2026-08-25): el cliente pregunto "Donde es la
// academia. Gracias." y recibio una despedida. Insistio, no lo atendieron, y
// termino yendose. Venta perdida.
//
// El agradecimiento a secas ("gracias", "muchas gracias", "ok gracias") si es
// una despedida, y eso lo resuelve esGraciasASecas(): mira si queda algo mas
// en el mensaje, en vez de buscar la palabra suelta.
const LEAVING_PATTERNS = [
  "adiós", "adios", "chao", "chau", "hasta luego",
  "no gracias", "no me interesa", "no quiero", "déjame",
  "molestando", "bye", "hasta pronto",
  // "Gracias por ahora no" dejo de matchear al sacar "gracias" de la lista:
  // el cliente igual se esta yendo, asi que va la frase que lo dice de verdad.
  "por ahora no", "por el momento no", "ahora no",
];

/**
 * true si el mensaje es SOLO un agradecimiento, sin nada mas que responder.
 *
 * Es la diferencia entre "gracias" (se despide) y "¿cuanto dura? gracias"
 * (pregunta y ademas es amable). Se saca el agradecimiento y la cortesia; si
 * no queda ninguna palabra con contenido, era una despedida.
 */
function esGraciasASecas(texto: string): boolean {
  const limpio = texto
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    // Fuera puntuacion y emojis: "¡Gracias! 🙏" es igual de despedida.
    .replace(/[^a-z0-9ñ\s]/gi, " ");
  const RELLENO = new Set([
    "gracias", "gracia", "grasias", "graciass",
    "muchas", "mucha", "muchisimas", "mil",
    "ok", "oka", "okay", "okey", "listo", "lista", "vale", "bueno", "buenas",
    "de", "nada", "igual", "igualmente", "amable", "amigo", "amiga",
    "senor", "senora", "bye", "saludos",
    // Intensificadores de cortesia: "gracias, muy amable" es tan despedida
    // como "gracias" a secas.
    "muy", "tan", "super", "atencion", "atento", "atenta", "amablemente",
  ]);
  const restantes = limpio.split(/\s+/).filter(Boolean).filter((p) => !RELLENO.has(p));
  // Menciono "gracias" y no quedo nada mas: se esta despidiendo.
  return restantes.length === 0 && /graci|grasi/.test(limpio);
}

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
  // Relleno puro. No son inocuos: contaban como palabras ESPECÍFICAS y hacían
  // daño por los dos lados. "¿tienen algo de veterinaria?" emparejaba "algo"
  // contra "algoritmos" y devolvía PACK PROGRAMACIÓN; y en "algo de excel
  // avanzado" inflaban la cuenta de términos, de modo que EXCEL —que está en el
  // catálogo— no llegaba al umbral y el cliente no recibía nada.
  "algo", "algun", "alguno", "alguna", "algunos", "algunas",
  "otro", "otra", "otros", "otras", "sobre", "acerca",
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
    // ⚠️ Estas formas estaban a medias, y el motivo es el sesgo de haber
    // escrito el motor para UN negocio: `nequi` y `daviplata` --lo que usaban
    // SUS clientes-- tienen "prefiero X", "me voy por X", "pagaré X"; la
    // opción genérica se quedó con cuatro variantes secas.
    //
    // Consecuencia: una clienta mexicana escribiendo "prefiero transferencia"
    // no era entendida, mientras "prefiero nequi" sí. El camino del negocio
    // original quedó pulido y el de todos los demás, no.
    patterns: [
      "por transferencia", "con transferencia", "via transferencia", "vía transferencia",
      "transferencia bancaria", "transferencia directa",
      "voy a transferir", "voy con transferencia",
      "prefiero transferencia", "prefiero transferir", "me voy por transferencia",
      "quiero transferir", "hago transferencia", "hago la transferencia",
      "pagaré por transferencia", "pagare por transferencia", "te transfiero",
      "deposito", "depósito", "te deposito",
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
export function detectChosenPaymentMethod(text: string, billeteras?: string[]): string | null {
  const t = text.toLowerCase();
  // Las billeteras que el negocio configuró se detectan primero: si un negocio
  // peruano cobra por Yape y el cliente escribe "te pago por Yape", eso tiene
  // que reconocerse igual que "por Nequi" en Colombia. Sin esto, el SaaS solo
  // entiende los medios de pago del país donde se escribió el código.
  for (const b of billeteras || []) {
    const nombre = String(b || "").trim().toLowerCase();
    if (nombre.length >= 3 && t.includes(nombre)) return "transferencia";
  }
  for (const { method, patterns } of PAYMENT_METHOD_CHOICE_MAP) {
    if (patterns.some(p => t.includes(p))) return method;
  }
  return null;
}

/**
 * Cómo nombrar el pago por transferencia para ESTE negocio.
 *
 * Estaba escrito "Nequi/Daviplata" a mano en tres lugares. Son billeteras
 * colombianas: a un negocio de otro país le decía a sus clientes que
 * transfirieran a una app que allá no existe.
 *
 * Si el negocio configuró sus medios, se usan los suyos. Si no, se cae a
 * "transferencia" a secas -- que es cierto en cualquier país y no promete una
 * app que el cliente no tiene. Nunca se inventa una marca.
 */
export function nombreDeTransferencia(billeteras?: string[]): string {
  const limpias = (billeteras || [])
    .map((b) => String(b || "").trim())
    .filter((b) => b.length > 0)
    .slice(0, 3);
  if (limpias.length === 0) return "transferencia";
  return limpias.join("/");
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
  transferInfo?: { number?: string; owner?: string; billeteras?: string[] }
): { matched: true; response: string; subIntent: "method_chosen" | "proof_sending" | "instructions"; chosenMethod?: string } | null {
  const number = transferInfo?.number || DEFAULT_TRANSFER_NUMBER;
  const owner = transferInfo?.owner || DEFAULT_TRANSFER_OWNER;
  // ── Cómo se llama acá el pago por transferencia ──────────────────────
  //
  // Estaba escrito "Nequi/Daviplata" a mano. Son billeteras COLOMBIANAS: a un
  // negocio mexicano, argentino o español le decía a sus clientes que
  // transfirieran a una app que en su país no existe. Y este SaaS se vende a
  // "cualquier tipo de negocio", que es justo lo que eso rompe.
  //
  // Ahora sale de la configuración de cobros del negocio, y el default es
  // genérico: "transferencia" funciona en todos lados aunque no diga la marca.
  // Ver `nombreDeTransferencia` abajo.
  const billeteras = nombreDeTransferencia(transferInfo?.billeteras);
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
          `Puedes transferir a *${billeteras}*:\n` +
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
      `Si pagas por *${billeteras}*, transfiere a *${number}* (a nombre de *${owner}*) y mándame el comprobante por aquí.\n\n` +
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
  // "el curso" era el nombre por defecto, y este SaaS se vende a cualquier
  // negocio: uno de bolsos leía "la entrega de el curso". "El producto" es
  // cierto siempre.
  const prod = productName ? `*${productName}*` : "el producto";
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
      // Decía "100% digital", nombraba "Nequi/Daviplata" y prometía acceso
      // "desde cualquier dispositivo". Tres supuestos de un solo negocio, en
      // el camino MÁS peligroso del motor: este texto se le manda al cliente
      // tal cual, sin que la IA lo vea.
      //
      // Un negocio de productos físicos le contestaba a alguien preguntando
      // por el envío de un bolso que "la entrega es 100% digital". Ahora usa
      // solo el método que el negocio configuró, que es cierto sea cual sea
      // el producto, y no nombra billeteras de un país.
      response: `${emoji("delivery", "📦")} La entrega de ${prod} es *por ${deliveryMethod}*. Tenemos 2 formas:\n\n1️⃣ *Pago por link*: el sistema detecta tu pago automáticamente y te lo enviamos por acá.\n\n2️⃣ *Pago por transferencia*: después de transferir, mandás la captura del comprobante por este chat y te lo enviamos.\n\nEn los dos casos lo recibís *${deliveryTime}*. ${emoji("benefit", "✅")}${closing}`,
    };
  }

  if (entrega && ACCESS_PATTERNS.some(p => t.includes(p))) {
    return {
      matched: true,
      intent: "details_query",
      // "sin descargas obligatorias" y "desde el celular o computador" son
      // promesas que solo tienen sentido en un producto digital.
      response: `${emoji("delivery", "🔗")} El acceso a ${prod} es por *${deliveryMethod}*. Una vez confirmado el pago (automático si pagás por link, o manual si mandás comprobante), lo recibís acá mismo. ${emoji("benefit", "✅")}${closing}`,
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

/**
 * Markdown → formato de WhatsApp.
 *
 * WhatsApp NO entiende markdown. Usa `*negrita*` con UN asterisco, `_cursiva_`
 * y `~tachado~`; todo lo demás se muestra literal, con sus asteriscos y sus
 * corchetes a la vista.
 *
 * Los modelos escriben markdown por defecto, y eso llegaba crudo al cliente.
 * Visto en conversaciones REALES de leads pagados (2026-08-29):
 *
 *   "El **Pack Contabilidad** es justo lo que necesitás"
 *   "**[Curso de Piano Completo: De Cero a Nivel Avanzado](CARD: 123)**"
 *   "el precio del curso es fijo en **$60.000 COP**"
 *
 * El segundo es el peor: el cliente ve corchetes, paréntesis y la palabra
 * CARD. Parece un error de sistema, y alguien que está por pagar y ve un error
 * de sistema no paga.
 *
 * Se convierte en vez de borrar: la intención de resaltar el precio o el
 * nombre del producto es correcta, lo que estaba mal era la sintaxis.
 */
export function markdownAWhatsapp(texto: string): string {
  return texto
    // Enlaces markdown: se queda el texto visible. Incluye el caso del
    // "[...](CARD: 123)" que el modelo inventa, donde el destino no es
    // siquiera una URL.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // **negrita** y __negrita__ -> *negrita*. El orden importa: primero los
    // dobles, porque si no el primer paso se comería un asterisco y dejaría
    // el otro suelto.
    .replace(/\*\*\*([^*]+)\*\*\*/g, "*$1*")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/__([^_]+)__/g, "*$1*")
    // Encabezados: WhatsApp no los tiene. Se deja el texto en negrita, que es
    // lo que el modelo quería decir.
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    // Bloques de código: el modelo a veces envuelve un precio o un número.
    .replace(/```[a-z]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export function sanitizeResponse(text: string, intent: Intent): string {
  // El markdown se limpia SIEMPRE, incluso en pago y confirmación: son
  // justamente los mensajes donde el cliente está por transferir plata, y
  // donde un "**$60.000**" mal formateado hace dudar.
  const enFormatoWhatsapp = markdownAWhatsapp(text);
  if (intent === "payment_intent" || intent === "confirmation") return enFormatoWhatsapp;

  // Eliminar URLs (http/https)
  let clean = enFormatoWhatsapp.replace(/https?:\/\/[^\s\n]+/g, "").trim();

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
  // La puntuación (¿?, ¡!, etc.) hacía que "¿qué incluye?" se leyera como "¿qué"
  // e "incluye?" — palabras que no coinciden con las de parada/genéricas, así
  // que una consulta de detalles se clasificaba como búsqueda de producto y el
  // bot terminaba ofreciendo OTRO producto del catálogo. Se quita igual que en
  // normalizeText().
  const t = text.toLowerCase().replace(/[^\w\sáéíóúñü]/g, " ").replace(/\s+/g, " ").trim();
  const words = t.split(/\s+/).filter(Boolean);
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
  const isPostPaymentProcess = postPaymentProc.some(p => contieneFrase(t, p));

  if (isPostPaymentProcess) {
    return "details_query";
  }

  // Post-pago: cliente pregunta sobre entrega/garantía después del pago
  const afterPayment = ["después de pagar", "despues de pagar", "luego de pagar", "cuando pague", "cuando paga",
    "después del pago", "despues del pago", "luego del pago"];
  const isPostPaymentQuestion = afterPayment.some(p => contieneFrase(t, p));
  const alsoHasDeliveryDetails = (["entrega", "entregan", "recibir", "acceso", "garantía", "garantia",
    "incluye", "trae", "qué me", "que me", "me entregan"].some(d => contieneFrase(t, d)));
  if (isPostPaymentQuestion || (alsoHasDeliveryDetails && t.length > 30)) {
    return "details_query";
  }

  // Posponer le gana a pagar. "Más adelante lo compro" trae el verbo de compra,
  // pero lo que dice es que NO ahora; como el pago se evalúa primero, se leía
  // como intención de compra y el bot le mandaba los datos para pagar a alguien
  // que acababa de pedir tiempo. Eso es presionar, y es lo que hace que el
  // cliente deje de contestar.
  const POSTERGACION = [
    "para despues", "para después", "mas adelante", "más adelante",
    "lo dejo para", "luego lo veo", "lo voy a pensar", "voy a pensarlo",
    "lo tengo que pensar",
  ];
  const posterga = POSTERGACION.some(p => contieneFrase(t, p));

  const hasPayment = !posterga && PAYMENT_PATTERNS.some(p => contieneFrase(t, p));
  if (hasPayment) {
    return "payment_intent";
  }

  // Objeción
  if (OBJECTION_PATTERNS.some(p => contieneFrase(t, p))) return "objection";

  // Despedida
  if (esGraciasASecas(t) || LEAVING_PATTERNS.some(p => contieneFrase(t, p))) return "leaving";

  // Desvío a humano
  if (HUMAN_HANDOFF_PATTERNS.some(p => contieneFrase(t, p))) return "human_handoff";

  // Confirmación
  //
  // Una confirmación es un mensaje CORTO que acepta: "dale", "está bien",
  // "envíalo". En una frase larga, "si" casi siempre es el condicional --"quiero
  // saber SI sirve para principiantes"--, no un sí.
  //
  // Comparar por palabra entera no alcanza acá, porque la palabra ES "si": la
  // que distingue es el largo. Sin este límite, esa pregunta se leía como
  // aceptación y el motor saltaba al CIERRE: el cliente preguntaba si el curso
  // le servía y recibía los datos de pago.
  //
  // El límite vale también para los patrones de varias palabras: "me sirve" es
  // aceptación en "ese me sirve", pero es una pregunta en "quiero saber si me
  // sirve para principiantes".
  const patronConfirmacion = CONFIRMATION_PATTERNS.find(p => contieneFrase(t, p));
  if (patronConfirmacion && !t.includes("no ") && wordCount <= 4) {
    return "confirmation";
  }

  // Pregunta sobre producto (tiene palabras que no son genéricas)
  // Va ANTES de details_query para que "tienes curso de guitarra" no se malinterprete como detalle
  const productWords = words.filter(w => w.length > 3 && !GENERIC_WORDS.has(w) && !STOP_WORDS.has(w));
  if (productWords.length > 0) return "product_query";

  // Pregunta de detalles (sobre entrega, garantía, acceso, etc.)
  if (DETAILS_PATTERNS.some(p => contieneFrase(t, p))) return "details_query";

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
  // "curso completo" ya figuraba arriba, pero como FRASE — y la búsqueda parte
  // el mensaje en palabras sueltas, así que "completo" nunca caía acá y contaba
  // como término específico. Con el catálogo real eso hacía que "quiero el
  // completo" diera nivel 4 (¡frase exacta!) contra CURSO DE PIANO COMPLETO,
  // cuando casi siempre el cliente se refiere al MEGAPACK COMPLETO 81 EN 1.
  // Un adjetivo de tamaño no identifica un producto: si eso es todo lo que
  // dijo, hay que preguntarle cuál.
  "completo", "completa", "completos", "completas",
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
 * Raíz de una palabra, para que singular y plural coincidan.
 *
 * No es un lematizador: solo saca la "s"/"es" final. Alcanza porque las DOS
 * partes que se comparan pasan por acá, así que basta con que caigan en la
 * misma forma ("ingles" y "ingles" → "ingl"): no importa que la raíz no sea
 * una palabra real. El largo mínimo evita destrozar palabras cortas ("mes").
 */
function raizPalabra(p: string): string {
  if (p.length > 4 && p.endsWith("es")) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith("s")) return p.slice(0, -1);
  return p;
}

/**
 * ¿El texto contiene esta frase como PALABRAS COMPLETAS?
 *
 * Antes se comparaba con `includes()` sobre el texto entero, y eso emparejaba
 * pedazos de otras palabras. Medido con el catálogo real: "¿tienen algo de
 * veterinaria?" devolvía PACK PROGRAMACIÓN, porque "algo" está dentro de
 * "algoritmos" en su descripción. El cliente preguntaba por veterinaria y el
 * bot le ofrecía programación con total seguridad.
 *
 * Se compara por raíz para no perder los plurales, que sí son coincidencias
 * legítimas: el cliente escribe "libros" y el producto se llama "PACK DE
 * LIBROS", o pide "perros" y el pack se llama "EDUCA A TU PERRO".
 */
function contieneFrase(texto: string, frase: string): boolean {
  const t = texto.split(/\s+/).filter(Boolean).map(raizPalabra);
  const f = frase.split(/\s+/).filter(Boolean).map(raizPalabra);
  if (f.length === 0) return false;
  for (let i = 0; i + f.length <= t.length; i++) {
    if (f.every((w, j) => t[i + j] === w)) return true;
  }
  return false;
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

/**
 * El cliente pide VER QUÉ HAY, no un producto puntual.
 *
 * "¿qué cursos tienen?", "muéstrame el catálogo", "¿qué más manejan?".
 *
 * Existe porque estos mensajes caían en `productSearchFailed`, que es la rama
 * de "pidió algo que NO está en el catálogo". Medido con la simulación de
 * conversación: las seis formas más comunes de preguntar por el catálogo
 * terminaban ahí, y esa rama le ordena al modelo:
 *
 *   "El cliente está buscando algo que NO existe en el catálogo actual.
 *    Dile la VERDAD: el producto que busca no está disponible."
 *
 * O sea que a quien pedía ver el catálogo se le contestaba que no hay. Es de
 * los primeros mensajes más frecuentes que existen, y ese lead se pierde
 * entero. La causa: la frase trae alguna palabra suelta ("bueno", "mas") que
 * `mensajeNombraProducto` cuenta como término específico, así que tampoco caía
 * en "no nombró nada".
 *
 * Tampoco corresponde devolverle la pregunta al cliente: pidió algo concreto
 * --ver la oferta-- y contestar "¿qué estás buscando?" es el interrogatorio que
 * hay que evitar.
 */
const CATALOGO_PATTERNS = [
  "que cursos", "cuales cursos", "que productos", "cuales productos",
  "que packs", "que mas tienen", "que mas manejan", "que mas hay",
  "que tienen", "que manejan", "que venden", "que ofrecen", "que hay",
  "catalogo", "lista de cursos", "listado", "todos los cursos",
  "ver los cursos", "opciones tienen", "variedad",
];

export function pidePlantillaDeCatalogo(text: string): boolean {
  const t = normalizeText(text);
  return CATALOGO_PATTERNS.some(p => t.includes(normalizeText(p)));
}

/**
 * El mensaje señala al producto que ya está sobre la mesa: "ese quiero",
 * "quiero ese", "ese mismo".
 *
 * Un demostrativo solo puede referirse a algo ya mencionado. Sin esto,
 * "ese quiero" no nombra ninguna palabra específica --"ese" es palabra de
 * parada y "quiero" es genérica-- así que el motor lo marcaba como "el mensaje
 * no nombra producto" y le ordenaba al modelo: "NO supongas que sigue
 * interesado en el producto del que se habló antes. PROHIBIDO abrir con
 * ¿vienes por el [producto]?".
 *
 * Es decir: el cliente decía "ese quiero" --una decisión de compra-- y el bot
 * volvía a preguntarle qué buscaba. "lo quiero" y "dale ese" sí funcionaban;
 * se escapaba justo el orden con demostrativo.
 */
function señalaAlProductoEnFoco(text: string): boolean {
  const t = normalizeText(text);
  return /\b(ese|esa|eso|esos|esas|este|esta|esto|aquel|aquella)\b/.test(t);
}

export async function findBestProductMatch(
  text: string,
  productList: Array<{ id: number; name: string; description: string | null; category: string | null; categoryId: number | null }>,
  categoryMap: Map<number, string>
  // `fiel` separa "esto ES lo que pidió" de "esto es lo más parecido que hay".
  // Sin esa distinción el llamador trataba igual a los dos, y una coincidencia
  // hallada en la letra chica de una descripción se le afirmaba a la IA como si
  // el cliente la hubiera nombrado.
): Promise<{ product: typeof productList[0]; score: number; reasoning: string; fiel: boolean } | null> {
  const reasoning: string[] = [];
  // Se sacan saludos y cortesías ANTES de contar, igual que en
  // `mensajeNombraProducto` — que ya lo hacía, y el comentario de esa función
  // avisa que las dos tienen que usar el mismo criterio o se desincronizan.
  // Acá faltaba, y el efecto no era perder un saludo: era diluir la cuenta.
  //
  // "hola quiero saber del curso de piano porfa" dejaba "hola" y "porfa" como
  // palabras ESPECÍFICAS. Con 3 específicas, el nivel 3 exige 2 en el nombre y
  // "piano" es una sola: el producto correcto no llegaba al umbral. Antes eso
  // no se notaba porque lo rescataba el fallback de nivel 1 — es decir, el caso
  // bueno acertaba por el mismo camino que hacía contestar INGLES a quien
  // preguntaba por cocina. Al sacar el fallback quedó a la vista.
  const normalized = normalizeText(quitarSaludoYCortesias(normalizeText(text)));
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
      if (contieneFrase(productName, fullPhrase)) {
        level = 4;
        matchDetail = `frase exacta "${fullPhrase}" en el nombre`;
      }
    }

    // Nivel 3.5: TODAS las palabras específicas están en el NOMBRE (tiebreaker mejorado)
    // Esto prioriza "Piano Mega Pack" sobre "DJ Producción Mega Pack" cuando se busca "piano mega pack"
    if (level < 3.5) {
      const nameHits = specificWords.filter(w => contieneFrase(productName, w));
      if (nameHits.length === specificWords.length && specificWords.length > 1) {
        level = 3.5;
        matchDetail = `TODAS las palabras específicas en el nombre: ${nameHits.join(", ")}`;
      }
    }

    // Nivel 3: Coincidencia directa de palabras específicas en el NOMBRE
    if (level < 3) {
      const nameHits = specificWords.filter(w => contieneFrase(productName, w));
      if (nameHits.length >= Math.max(1, Math.ceil(specificWords.length * 0.5))) {
        level = 3;
        matchDetail = `${nameHits.length}/${specificWords.length} palabras específicas en el nombre: ${nameHits.join(", ")}`;
      }
    }

    // Nivel 3: CATEGORÍA coincide + alguna palabra específica en nombre o descripción
    if (level < 3 && catName) {
      const catKeywords = categoryHints[catName] || [catName];
      const categoryMatch = specificWords.some(w =>
        catKeywords.some(ck => contieneFrase(normalizeText(ck), w) || contieneFrase(w, normalizeText(ck)))
      );
      if (categoryMatch) {
        const contentHits = specificWords.filter(w => contieneFrase(combined, w));
        if (contentHits.length > 0) {
          level = 3;
          matchDetail = `categoría "${catName}" detectada + coincidencia en contenido: ${contentHits.join(", ")}`;
        }
      }
    }

    // Nivel 2: Coincidencia de palabras específicas solo en DESCRIPCIÓN
    if (level < 2) {
      const descHits = specificWords.filter(w => contieneFrase(productDesc, w));
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
      const exactAliasHits = specificWords.filter(w => normalizedAliases.some(a => contieneFrase(a, w)));
      if (exactAliasHits.length >= Math.max(1, Math.ceil(specificWords.length * 0.6))) {
        // ✅ VALIDACIÓN CRUZADA: que al menos 1 palabra específica aparezca
        // en el NOMBRE o DESCRIPCIÓN real del producto (no solo en alias)
        const hasContentMatch = specificWords.some(w =>
          contieneFrase(productName, w) || contieneFrase(productDesc, w)
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

    // Nivel 1 (insuficiente): solo palabras genéricas. Se calcula ÚNICAMENTE
    // para poder explicarlo en el log; nunca se devuelve como producto.
    if (level === 0) {
      const anyHit = allWords.filter(w => contieneFrase(combined, w));
      if (anyHit.length > 0) {
        level = 1;
        matchDetail = `solo coincidencia genérica: ${anyHit.join(", ")}`;
      }
    }

    evaluations.push({ product: p, level, matchDetail, categoryHit: level >= 3 && catName !== "" });
  }

  // Filtrar: el nivel 1 NUNCA es un resultado. Si nada llega a nivel 2, la
  // respuesta honesta es "no lo tengo".
  //
  // Acá vivía el peor bug del buscador, y no se veía en los tests porque el
  // catálogo de prueba tenía 5 productos genéricos. Con el catálogo REAL (83
  // cursos) el nivel 1 se activaba con la palabra "curso" -- que está marcada
  // como GENÉRICA, pero el último recurso usaba `allWords`, no `specificWords`.
  // Resultado: "¿tienen curso de cocina?" emparejaba con los 83 productos por
  // la palabra "curso", el desempate elegía el nombre más corto y el bot
  // contestaba INGLES. Lo mismo con "un curso de derecho penal" → INGLES.
  //
  // Y no quedaba en un log: el llamador descarta el nivel 1 como producto pero
  // igual guarda `reasoning`, que dice "✅ Producto seleccionado: INGLES", y ese
  // texto se le inyecta a la IA junto a "el cliente pide algo que no existe".
  // Con un producto en contexto entra por la otra rama, que le ordena al modelo
  // "Contestá sobre ESE producto". De ahí salían las respuestas con el producto
  // equivocado dichas con total seguridad.
  //
  // Un "no lo manejo" hace perder una venta que no existía. Ofrecerle inglés a
  // quien pregunta por cocina hace perder al cliente.
  const valid = evaluations.filter(e => e.level >= 2);

  if (valid.length === 0) {
    const casiMatch = evaluations.filter(e => e.level === 1).length;
    reasoning.push("❌ Ningún producto coincide de verdad con lo que pide el cliente.");
    reasoning.push(`   Productos revisados: ${productList.length}.`);
    if (casiMatch > 0) {
      reasoning.push(`   (${casiMatch} coincidían solo por palabras genéricas como "curso" o "pack" — eso no identifica nada.)`);
    }
    reasoning.push("   Respuesta: decir la verdad (no está en el catálogo) y ofrecer lo más parecido que SÍ exista.");
    return null;
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
    const aNameHits = specificWords.filter(w => contieneFrase(normalizeText(a.product.name), w)).length;
    const bNameHits = specificWords.filter(w => contieneFrase(normalizeText(b.product.name), w)).length;
    if (bNameHits !== aNameHits) return bNameHits - aNameHits;

    // Tiebreaker 2: Longitud del nombre — el más corto es la coincidencia más
    // exacta (el nombre exacto le gana a "X Premium"/"X Completo"). Va ANTES de
    // la descripción a propósito: el nombre es lo que el cliente ve y nombra.
    const aNameLen = normalizeText(a.product.name).length;
    const bNameLen = normalizeText(b.product.name).length;
    if (bNameLen !== aNameLen) return aNameLen - bNameLen;

    // Tiebreaker 3: Palabras específicas en la descripción (último recurso)
    const aDescHits = specificWords.filter(w => contieneFrase(normalizeText(a.product.description || ""), w)).length;
    const bDescHits = specificWords.filter(w => contieneFrase(normalizeText(b.product.description || ""), w)).length;
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

  // El nivel 2 NO es una identificación: es un parecido encontrado en la letra
  // chica de la descripción. Medido con el catálogo real: "me interesa un curso
  // de soldadura" daba nivel 2 contra CURSO REPARACIÓN DE CELULARES, porque esa
  // descripción menciona soldadura. No existe un curso de soldadura, y el bot lo
  // presentaba como si fuera lo que el cliente pidió.
  //
  // El texto de acá abajo NO es solo un log: se le inyecta al prompt de la IA.
  // Decirle "✅ Producto seleccionado" en un caso así es pedirle que afirme algo
  // que no es cierto. Se nombra por lo que es, para que ofrezca y pregunte en
  // vez de dar por hecho.
  if (best.level >= 3) {
    reasoning.push(`✅ Producto seleccionado: "${best.product.name}" (nivel ${best.level})`);
    reasoning.push(`   Razón: ${best.matchDetail}`);
    if (best.categoryHit) reasoning.push("   Coincidencia de categoría confirmada.");
  } else {
    reasoning.push(`⚠️ SIN coincidencia fiel. Lo más parecido: "${best.product.name}" (nivel ${best.level}).`);
    reasoning.push(`   Razón: ${best.matchDetail}`);
    reasoning.push(`   ⛔ NO afirmes que es lo que pidió: el parecido está en la descripción, no en el nombre.`);
    reasoning.push(`   ✅ Ofrecelo como alternativa y preguntá si le sirve.`);
  }

  return {
    product: best.product,
    score: best.level * 25,
    reasoning: reasoning.join("\n"),
    fiel: best.level >= 3,
  };
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
  let pidioVerCatalogo = false;
  let searchReasoning: string | null = null;
  // ¿La búsqueda IDENTIFICÓ el producto, o solo encontró algo parecido? Decide
  // si a la IA se le ordena contestar sobre ese producto o solo ofrecerlo.
  let coincidenciaFiel = false;
  let productoDelMensaje: EngineDecision["productoDelMensaje"] = null;

  // "mándamela de nuevo", "no me llegó", "reenviame la ficha"
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

  // ── Preguntas de DETALLE sobre el producto en foco tampoco son búsqueda ──
  //
  // "¿qué trae?", "¿qué incluye?", "¿cómo lo recibo?", "¿tiene garantía?",
  // "¿cuánto cuesta?" — todas preguntan por el producto QUE SE VIENE HABLANDO.
  // Volver a correr el matcher en esas frases genéricas encuentra un producto
  // al azar por palabras sueltas ("contenido", "producto") y le cambia el
  // producto al cliente en plena conversación.
  //
  // Pasó en vivo el 2026-08-23 (conversación 1): Duvier venía viendo el curso
  // de DISEÑO GRÁFICO y preguntó "¿qué trae el producto? que contenido?" —
  // el bot respondió con el curso de EXCEL. El cliente dijo "no sé de qué me
  // hablas". Mismo patrón que el bug de "¿cómo pago?": una pregunta sobre el
  // producto actual no es una búsqueda de producto nuevo.
  const preguntaDeDetalleSobreFoco =
    (intent === "details_query" || intent === "objection") && !!memory.currentProductId;

  if (!shouldGreet && intent !== "leaving") {
    // Buscar producto mencionado en el mensaje actual
    const encontrado = await findBestProductMatch(incomingText, productList, categoryMap);

    // Preguntar POR el producto en foco no es buscar otro producto… salvo que el
    // cliente haya nombrado otro. Las dos guardas de arriba cancelaban la
    // búsqueda entera, y con eso se llevaban puesto el caso más común de todos:
    //
    //   (viendo el curso de piano) "¿y el curso de inglés cuánto vale?"
    //
    // "cuánto vale" se clasifica como intención de PAGO, así que la búsqueda ni
    // corría: el cliente preguntaba el precio del inglés y el bot le contestaba
    // el del piano. Con la ficha de pago del piano. Es el mismo desenlace que ya
    // documenta `coherencia-cambio-producto.test.ts`, donde el bot terminó
    // cobrando un producto que el cliente nunca pidió.
    //
    // Las guardas existían porque el buscador devolvía cualquier cosa ante
    // frases genéricas ("¿qué trae? ¿qué contenido?" daba EXCEL). Eso ya no
    // pasa: esas frases devuelven null, y un parecido de descripción viene con
    // fiel=false. Así que ahora la búsqueda SIEMPRE corre, y solo una
    // coincidencia FIEL —el producto nombrado por su nombre— puede mover el
    // foco. "¿cómo pago?" y "¿qué incluye?" siguen sin moverlo, que era el
    // punto original.
    const preguntaSobreElFoco = preguntaComoPagar || preguntaDeDetalleSobreFoco;
    const match = preguntaSobreElFoco && !encontrado?.fiel ? null : encontrado;

    // Razonamiento de búsqueda (para inyectar en el prompt)
    searchReasoning = match?.reasoning || null;
    coincidenciaFiel = !!match?.fiel;

    // 🤖 DECISIÓN DE PRODUCTO DELEGADA A LA IA
    // La IA recibe el catálogo completo y analiza el contexto de la conversación
    // para elegir qué producto mostrar. El keyword matching solo sirve como
    // sugerencia/advertencia, no como decisión final.
    // Antes el umbral era `score >= 50`, que es exactamente el nivel 2: una
    // coincidencia hallada SOLO en la descripción entraba acá y se le presentaba
    // a la IA como "el cliente está preguntando por X". Ahora el nivel 2 cae al
    // camino de "no lo tengo, pero mirá esto parecido", que es la respuesta
    // honesta y además la que puede salvar la venta.
    if (match && match.fiel) {
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
            kind: (p as any).kind ?? null,
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
            kind: (currentProduct as any).kind ?? null,
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
            kind: (currentProduct as any).kind ?? null,
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
          // Una consulta de DETALLES ("¿qué incluye?", "¿cuánto dura?", "¿cómo lo
          // recibo?") SÍ se refiere al producto en foco: el cliente pregunta por
          // algo del curso que venía viendo. Marcarla como mensajeSinProducto le
          // decía a la IA "no asumas que sigue interesado en el producto anterior"
          // y el modelo terminaba contestando con OTRO producto del catálogo
          // (ej. Excel) que el cliente jamás nombró. Solo el saludo/pregunta
          // general sin producto es mensajeSinProducto.
          // Un demostrativo ("ese quiero") señala el producto que ya está sobre
          // la mesa: no es un mensaje "sin producto", es una referencia a él.
          mensajeSinProducto =
            intent !== "details_query" &&
            !mensajeNombraProducto(incomingText) &&
            !señalaAlProductoEnFoco(incomingText);
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
      if (pidePlantillaDeCatalogo(incomingText)) {
        // Pidió ver la oferta. No es "no tengo lo que buscás" ni "no dijo nada":
        // dijo algo concreto y la respuesta correcta es mostrarle qué hay.
        pidioVerCatalogo = true;
        console.log(`📚 [DECISION] El cliente pide ver el catálogo - mostrar opciones, no negar`);
      } else if (!mensajeNombraProducto(incomingText)) {
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
  const contextBlock = buildContextBlock(memory, intent, stage, productToShow, shouldSendCard, searchReasoning, productSearchFailed, t, productList, negocio, mensajeSinProducto, coincidenciaFiel, pidioVerCatalogo);

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
    pidioVerCatalogo,
    productoDelMensaje,
    pidioReenvio,
    paymentStatus: memory.paymentStatus,
    paymentMethod: memory.paymentMethod,
    paymentAmount: memory.paymentAmount,
  };
}

// ─── Constructor del bloque de contexto ───────────────────────────────────────

export function buildContextBlock(
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
  mensajeSinProducto?: boolean,
  coincidenciaFiel?: boolean,
  pidioVerCatalogo?: boolean
): string {
  const lines: string[] = [];

  // ── Para quién trabaja el agente ───────────────────────────────────────────
  // Va PRIMERO, antes que cualquier instrucción: si el agente no sabe de qué
  // negocio es, todo lo que siga lo va a rellenar con lo que se imagine.
  if (negocio) lines.push(renderBloqueNegocio(negocio));

  // ── Qué vende este negocio: el índice va ARRIBA, y es deliberado ──────────
  //
  // El prompt se recorta por el FINAL cuando pasa el tope (ver agent.ts), y el
  // catálogo vivía en la cola. Con el catálogo real el contextBlock mide
  // ~10.000 caracteres, así que el recorte es una posibilidad real -- y lo
  // primero en morir sería justo el dato que evita que el bot niegue un
  // producto que sí vende.
  //
  // Solo id y nombre: 140 productos en ~4.400 caracteres, medido. El detalle
  // (precio, descripción) va más abajo y ESE sí se puede recortar, porque el
  // precio real lo pone la ficha, que la arma el servidor.
  if (allProducts && allProducts.length > 0) {
    lines.push(`\n\n━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📇 TODO LO QUE VENDE ESTE NEGOCIO (${allProducts.length} productos)`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Si está en esta lista, EXISTE y se vende. Manda su ficha con [CARD: ID].`);
    for (const p of allProducts) {
      lines.push(`[${p.id}] ${p.name}`);
    }
    lines.push(`Si el cliente nombra algo que NO está acá, no lo tenemos: díselo con naturalidad y ofrece lo más parecido que sí esté. Nunca inventes un producto.`);
  }

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
    lines.push(`   ✅ En vez de eso, RAZONA qué le falta saber a ESTE cliente para decidir, y responde SOLO eso:`);
    lines.push(`      · Si pregunta algo puntual (cuánto dura, si sirve para principiantes, cómo se paga), contesta ESA pregunta y nada más.`);
    lines.push(`      · Si repite la misma pregunta, es que algo no le quedó claro o no está convencido: pregúntale qué duda le queda, o toca un ángulo distinto del que ya usaste.`);
    lines.push(`      · Si no pregunta nada concreto, avanza la venta: una objeción típica resuelta, o pregunta qué lo está frenando.`);
    lines.push(`   Puedes dar por sabido lo que ya le dijiste: refiérete a eso ("el de $60.000 que te pasé", "el que tiene los 19 módulos") en vez de volver a listarlo.`);
    lines.push(`   Solo vuelve a mandar la ficha si el cliente la PIDE explícitamente ("mándamela de nuevo", "no me llegó") o si es un producto DISTINTO.`);
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
    // Esta orden solo vale si la búsqueda IDENTIFICÓ el producto. Cuando apenas
    // encontró un parecido, mandarla dejaba el prompt diciendo las dos cosas a la
    // vez ("no afirmes que es lo que pidió" + "contestá sobre ESE producto"), y
    // ante esa contradicción el modelo termina afirmando.
    if (coincidenciaFiel) {
      lines.push(`\n⚠️ Contesta sobre ESE producto. Si el historial habla de otro, ese ya pasó: el cliente cambió de tema y hay que seguirlo.`);
    } else {
      lines.push(`\n⚠️ OJO: eso es lo más parecido del catálogo, NO lo que el cliente nombró. Ofrecelo como alternativa y pregunta si le sirve; no lo des por hecho.`);
    }
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
    lines.push(`   · Si más arriba figura un ANUNCIO del que llegó el cliente, ESE es el tema: habla de ese producto.`);
    lines.push(`   · Si no hay anuncio, saludá corto y pregunta UNA sola cosa concreta: qué está buscando.`);
    lines.push(`   · Nunca inventes por dónde vino ni le atribuyas un interés que no expresó.`);
  }

  // El cliente pidió ver la oferta. Antes esto caía en `productSearchFailed` y
  // el modelo recibía la orden de decirle que lo que busca no existe — a
  // alguien que no pidió nada puntual, solo quería ver qué hay.
  if (pidioVerCatalogo) {
    lines.push(`\n📚 EL CLIENTE PIDIÓ VER QUÉ HAY. No pidió un producto puntual.`);
    lines.push(`\n🚨 NO le digas que no tienes lo que busca: no pidió nada que puedas no tener.`);
    lines.push(`🚨 NO le devuelvas la pregunta ("¿qué estás buscando?"). Ya te dijo qué quiere: ver la oferta.`);
    lines.push(`\n✅ QUÉ HACER: mostrale entre 3 y 5 opciones concretas del catálogo de arriba, con nombre y precio,`);
    lines.push(`   en una lista corta. Elige las más distintas entre sí para que se vea la variedad.`);
    lines.push(`   Cerrá con UNA sola pregunta para que elija ("¿cuál te llama la atención?"). Una. No un cuestionario.`);
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
    lines.push(`3. Dale igual algo útil: si hay algo parecido, di en una línea por qué podría servirle. Y como no tienes el producto que pidió, SÍ corresponde una sola pregunta concreta para poder ayudarlo (qué necesita exactamente, para qué lo quiere). Lo que no va es la pregunta vacía tipo "¿te interesa alguno?" sin haberle dado nada antes.`);
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
  lines.push(`• La categoría detectada abajo ("${intent}") es un cálculo automático por palabras clave del ÚLTIMO mensaje -- útil como punto de partida, pero puede estar mal si el cliente preguntó indirecto, mezcló dos temas en el mismo mensaje, o dijo algo que a primera vista no encaja con la conversación. NUNCA sigas ciegamente esa categoría si el HISTORIAL COMPLETO de la conversación (más abajo) sugiere algo distinto -- leé todo el hilo, conectá lo que el cliente dice ahora con lo que ya habló antes, y responde a la intención REAL, no a la etiqueta automática.`);
  lines.push(`• Un mensaje puede tocar MÁS DE UNA COSA a la vez (ej: duda + pregunta de precio en la misma frase). Responde a todo lo relevante que el cliente planteó, no solo a la primera parte que coincida con una categoría.`);

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
          lines.push(`• OJO: no tienes confirmados los datos de entrega, acceso ni garantía de este negocio. Si pregunta por eso, dile con naturalidad que lo confirmas y le respondes — NO lo inventes.`);
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
    // ── Cómo se entrega ESTE producto: se afirma, no se deja deducir ────────
    //
    // El perfil del negocio ya decía "el catálogo tiene digitales y físicos,
    // fijate cuál es antes de hablar de entrega". Eso es una instruccion
    // blanda y el modelo la ignoro: con un catalogo mixto (56 fisicos y 84
    // digitales) leyo la linea de los digitales, que va primera, y se la
    // aplico a un producto fisico.
    //
    // Caso real (conversacion 19, 2026-08-25): al Renovador Negro Perfecto
    // x 200ml -- un frasco que se envia por mensajeria -- le prometio "acceso
    // inmediato por Google Drive". Quien pague eso espera una descarga y no
    // le llega nada: es una devolucion, o un reclamo.
    //
    // El `kind` del producto lo sabe el servidor. Se afirma acá, y se prohibe
    // explicitamente lo del otro tipo, en vez de confiar en que lo deduzca.
    const tipoProducto = String((product as any).kind || "digital");
    if (tipoProducto === "physical") {
      lines.push(`• Tipo: PRODUCTO FÍSICO 📦`);
      lines.push(`\n🚨 ENTREGA DE ESTE PRODUCTO — es FÍSICO, se ENVÍA:`);
      lines.push(`   ✅ Se envía a la dirección del cliente y la entrega se coordina por WhatsApp.`);
      lines.push(`   ❌ NUNCA digas Google Drive, enlace, descarga, "acceso inmediato", "acceso de por vida" ni nada digital: este producto NO se descarga.`);
      lines.push(`   ❌ NO prometas plazos de envío que no figuren arriba. Si te preguntan cuánto tarda y no lo sabes, di que lo confirmas.`);
      lines.push(`   ✅ Para enviarlo hace falta dirección y ciudad: pedilas cuando el cliente quiera comprar.`);
    } else {
      lines.push(`• Tipo: PRODUCTO DIGITAL 💻`);
      lines.push(`\n🚨 ENTREGA DE ESTE PRODUCTO — es DIGITAL:`);
      lines.push(`   ❌ NUNCA prometas envío físico, paquete, domicilio ni dirección de entrega: no se manda nada por correo.`);
    }

    lines.push(`\n🚨 USA SOLO los datos de arriba. NO inventes características ni precios.`);
    lines.push(`🚨 La descripción de arriba es la ÚNICA verdad sobre QUÉ ES este producto. Si no dice para qué sirve, NO lo deduzcas del nombre: pregunta o di que lo confirmas. (Un "Renovador Negro Perfecto x 200ml" es para el carro, no para el cabello — adivinar por el nombre le costó una venta a este negocio.)`);
    if (!shouldSendCard) {
      lines.push(`🚨 NO envíes [CARD: ${product.id}] — ya se mostró antes.`);
    }
  }

  // ── Catálogo completo — SIEMPRE se inyecta para que la IA no improvise ─────
  if (allProducts && allProducts.length > 0) {
    lines.push(`\n\n━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📋 CATÁLOGO COMPLETO DE PRODUCTOS (usa SOLO esta información)`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
    // OJO: acá decía "Si el producto no aparece en esta lista, NO EXISTE".
    //
    // Era falso y caro. Con 140 productos reales, en el presupuesto de 3.500
    // caracteres entraban 16: el 11%. O sea que la "REGLA ABSOLUTA" le estaba
    // diciendo al modelo que el 89% del catálogo no existe. Cincuenta líneas
    // más abajo el mismo bloque aclaraba lo contrario ("no afirmes que no
    // existe"), pero la primera es la que dice ABSOLUTA y es la que ganó.
    //
    // Medido el 2026-08-25: dos listas de productos distintas con un minuto de
    // diferencia, y "Hmm, creo que no tengo ese producto 😅" sobre el Renovador
    // Negro Perfecto -- que el mismo bot había cotizado una hora antes.
    //
    // Ahora hay dos niveles: el ÍNDICE de abajo trae los 140 nombres (cuesta
    // ~4.400 caracteres, medido) y las fichas detalladas van solo para lo
    // relevante. El modelo ya no tiene que adivinar qué existe.
    lines.push(`🚨 REGLA ABSOLUTA: NO inventes datos. Precio, contenido y entrega salen de acá o de la ficha, nunca de tu memoria.`);

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
    // Baja de 3.500 a 1.200 porque el índice de arriba ya cubre QUÉ existe, y
    // el producto en foco ya trae su descripción completa en el bloque
    // "PRODUCTO EN CONTEXTO". Estas fichas solo aportan el vecindario, así que
    // no vale la pena pagarlas dos veces.
    const TOPE_CATALOGO = Number(process.env.MAX_CATALOGO_CHARS || 1200);
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
        // El catalogo es mixto. Sin marcarlo, la IA elige un producto de esta
        // lista y le aplica la entrega del otro tipo.
        String((p as any).kind || "digital") === "physical"
          ? `    📦 FÍSICO (se envía)`
          : `    💻 DIGITAL (enlace)`,
      ].filter(Boolean).join("\n");

      // Un producto en foco entra aunque el presupuesto esté justo: si se
      // recorta JUSTO el que el cliente pidió, la IA no puede mandar su ficha.
      if (usados + bloque.length > TOPE_CATALOGO && !enFoco.has(p.id)) continue;

      lines.push(bloque);
      usados += bloque.length;
      mostrados++;
    }

    lines.push(`\n━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`FIN DEL CATÁLOGO. Usa [CARD: ID] con el ID exacto del índice.`);
  }

  // ── Dónde está parado el agente ────────────────────────────────────────────
  //
  // Medido el 2026-08-25: el bot escribió "El link de acceso lo tenés que
  // recibir por WhatsApp, no por aquí" -- POR WHATSAPP. No sabía en qué canal
  // estaba, así que mandaba al cliente a otro lado desde el lado correcto.
  //
  // Y el voseo: el negocio vende en Colombia, cobra por Nequi y Daviplata, y
  // el agente hablaba en argentino ("podés", "querés", "te tiro un bonus").
  // Suena a que no es de acá, que es lo último que conviene cuando el cliente
  // está decidiendo si te transfiere plata.
  lines.push(`\n\n━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`📍 DÓNDE ESTÁS`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Estás hablando por WHATSAPP, en este mismo chat. Todo lo que mandes le llega acá.`);
  lines.push(`❌ NUNCA digas "te llega por WhatsApp", "recibilo por WhatsApp" ni "no por aquí": ESTO es WhatsApp.`);
  lines.push(`🇨🇴 Habla en español COLOMBIANO neutro, de "tú" o impersonal: "puedes", "quieres", "tienes".`);
  lines.push(`❌ Nada de voseo argentino (puedes, quieres, tienes, recibís) ni de "che", "tranqui", "te tiro".`);

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
  // ⚠️ Estas líneas estaban escritas EN VOSEO ("podés", "debés", "entregá",
  // "aislá", "sabés") doce renglones debajo de la regla que prohíbe el voseo.
  // El modelo copia el registro de lo que lee, así que el prompt le enseñaba
  // justo lo que le pedía no hacer -- y el voseo seguía saliendo en producción.
  lines.push(`NO interrogues: nunca respondas con una pregunta vacía como "¿Qué buscas?" o "¿Te interesa?" cuando el cliente YA te dijo qué quiere. Primero entrega valor o información concreta.`);
  lines.push(`SÍ puedes —y debes— preguntar UNA cosa concreta cuando: el cliente duda o pospone (ahí aísla la duda), no sabes para qué lo quiere y eso cambia lo que le recomiendas, o hay dos productos posibles y elegir mal arruina la venta.`);
  lines.push(`Una pregunta que hace avanzar la venta vale; tres preguntas seguidas, ninguna.`);
  lines.push(`Eres una IA inteligente: Lee lo que pide el cliente (incluso si tiene errores ortográficos como "pianob" o "megaoack"). Revisa el CATÁLOGO COMPLETO. Si encuentras el producto (ej. ID 311 para piano), DEBES responder ÚNICAMENTE usando la etiqueta [CARD: ID] y una línea super corta introductoria. NO inventes precios en el texto, el precio ya viene en la tarjeta.`);
  lines.push(`Si el cliente pide algo que DEFINITIVAMENTE NO ESTÁ en el catálogo (ej. "naves espaciales"), dile amablemente que no lo manejas y ofrece el catálogo general.`);
  lines.push(`El cliente decide. Tú informas y guías — preguntas solo cuando esa pregunta lo acerca a decidir.`);
  // ── CÓMO SE ESCRIBE ──────────────────────────────────────────────────────
  //
  // Pedido del admin (2026-08-27), después de leer una conversación entera del
  // bot: "no dejas de usar chuleta habiendo tanto emoji". El reclamo de fondo
  // es más grande que el emoji: todas las respuestas salían con la misma
  // forma -- lista de viñetas iguales, misma cantidad de líneas, y siempre
  // una pregunta al final. Eso es lo que se lee como catálogo automático.
  //
  // Va acá, al final, porque es lo último que el modelo lee antes de escribir
  // -- y porque el prompt se recorta desde el final solo cuando no entra, así
  // que lo que va antes es lo que no se puede perder (precio, catálogo,
  // entrega). El estilo se degrada; los datos no.
  lines.push(`\n\n━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`✍️ CÓMO SE ESCRIBE`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Escribes como una persona que atiende por WhatsApp, no como un catálogo. La forma del mensaje la decide lo que preguntó el cliente, no una plantilla.`);
  lines.push(`TAMAÑO PROPORCIONAL: pregunta corta, respuesta corta. "¿precio?" se contesta con el precio y nada más. Si escribe un párrafo largo, ahí sí desarrollas.`);
  lines.push(`VARÍA LA FORMA entre mensajes: a veces una sola frase, a veces dos párrafos cortos, a veces una lista. Si el mensaje anterior fue una lista, este no.`);
  lines.push(`LISTAS solo cuando de verdad hay varias cosas que enumerar. Tres frases seguidas con viñeta no son una lista, son un muro.`);
  lines.push(`NO TERMINES SIEMPRE PREGUNTANDO. Muchas respuestas cierran solas: "Son $60.000, pago único." ya está completo. La pregunta va cuando de verdad hace avanzar.`);
  lines.push(`NO ARRANQUES SIEMPRE IGUAL. Nada de "¡Perfecto!" / "¡Genial!" / "¡Excelente!" en cada mensaje, y menos si ya lo usaste hace poco. "Claro", "Sí, tenemos", "Mira", "Te explico", "Ese sí" o entrar directo al dato también sirven.`);
  lines.push(`EMOJIS CON CRITERIO, no de relleno: uno que aporte vale más que cinco. NO pongas ✅ delante de cada renglón -- usa el que corresponda a la idea (🎹 piano, 🎨 diseño, 🤖 IA, ⚙️ automatización, 💰 precio, 💳 pago, 🔗 enlace, 📦 envío, ♾️ acceso, 🛡️ garantía). Pueden ir al final de la frase, no solo al principio. Un mensaje SIN ningún emoji también está bien.`);
  lines.push(`NO REPITAS LO YA DICHO: si el precio ya salió y ahora pregunta cómo paga, hablas de pago y nada más. Cada mensaje suma al anterior, no lo reinicia.`);
  lines.push(`NO CIERRES EN CADA MENSAJE. Si preguntó cuánto dura, contestas cuánto dura. Empujar la compra ahí rompe la conversación.`);
  lines.push(`SEGUÍ SU ESTILO: si escribe corto y sin emojis, respondes parecido; si escribe suelto y con emojis, puedes soltarte. Nunca imites sus errores de ortografía.`);
  lines.push(`Si no sabes un dato, lo dices: "déjame confirmarte eso". Inventar para sostener la charla es lo único que no se perdona.`);
  lines.push(`🔴🔴🔴 FIN REGLA FINAL 🔴🔴🔴`);

  return lines.join("\n");
}

/**
 * El idioma con el que se escribe un precio, deducido de su moneda.
 *
 * Estaba fijo en "es-CO", que es el formato colombiano: sin decimales y con
 * punto de miles. Aplicado a otras monedas da precios raros --un producto de
 * 890.50 MXN se mostraba como "$891"-- y en las que sí usan centavos eso no es
 * un detalle de estilo, es un precio equivocado.
 *
 * No se busca cubrir el mundo: se cubren las monedas de los países donde este
 * SaaS se vende, y cualquier otra cae en un formato neutro que al menos no
 * miente.
 */
const IDIOMA_POR_MONEDA: Record<string, string> = {
  COP: "es-CO", MXN: "es-MX", ARS: "es-AR", CLP: "es-CL", PEN: "es-PE",
  UYU: "es-UY", BOB: "es-BO", PYG: "es-PY", CRC: "es-CR", GTQ: "es-GT",
  DOP: "es-DO", USD: "en-US", EUR: "es-ES", BRL: "pt-BR",
};

/** Monedas sin centavos: mostrarlos sería inventar precisión que no existe. */
const MONEDAS_SIN_CENTAVOS = new Set(["COP", "CLP", "PYG", "ARS", "JPY", "KRW"]);

export function formatPrice(price: number, currency: string): string {
  const moneda = (currency || "COP").toUpperCase();
  try {
    return new Intl.NumberFormat(IDIOMA_POR_MONEDA[moneda] || "es", {
      style: "currency",
      currency: moneda,
      maximumFractionDigits: MONEDAS_SIN_CENTAVOS.has(moneda) ? 0 : 2,
    }).format(price);
  } catch {
    return `${moneda} ${price.toLocaleString()}`;
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
