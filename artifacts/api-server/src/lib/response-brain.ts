/**
 * ============================================================
 * RESPONSE BRAIN — Cerebro de Razonamiento de Respuestas
 * ============================================================
 *
 * Antes de generar cualquier respuesta, el cerebro:
 *  1. Analiza el estado emocional del cliente
 *  2. Revisa el historial para no repetir
 *  3. Elige la estrategia exacta de respuesta
 *  4. Construye el prompt final con contexto completo
 *  5. Define el formato visual según la firma del negocio
 *
 * GARANTÍAS:
 *  - Nunca repite información ya dada
 *  - Nunca improvisa datos del producto
 *  - Siempre responde la pregunta real del cliente
 *  - Adapta el tono al estado emocional detectado
 *  - Usa la firma visual del negocio en cada respuesta
 */

import type { BrandVoice } from "./brand-voice";
import type { ConversationMemory, Intent, Stage } from "./conversation-engine";
import { makeSeparator } from "./brand-voice";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EmotionalState =
  | "excited"      // Entusiasmado, listo para comprar
  | "curious"      // Explorando, haciendo preguntas
  | "hesitant"     // Dudoso, necesita más info
  | "objecting"    // Tiene objeción concreta
  | "frustrated"   // Frustrado o impaciente
  | "satisfied"    // Satisfecho, post-compra
  | "neutral";     // Sin señal emocional clara

export type ResponseStrategy =
  | "hardcoded_greeting"     // Saludo hardcodeado (rápido, consistente)
  | "hardcoded_detail"       // Detalle hardcodeado (entrega, garantía, etc.)
  | "human_handoff"          // Cliente pide humano — respuesta directa
  | "ai_qualification"       // IA hace preguntas para perfilar al lead
  | "ai_product_discovery"   // IA busca y recomienda producto
  | "ai_product_details"     // IA responde sobre producto ya mostrado
  | "ai_payment_close"       // IA facilita el cierre con links
  | "ai_objection_handle"    // IA maneja objeción con empatía
  | "ai_general_response"    // IA responde pregunta general
  | "ai_farewell";           // IA despide al cliente

export interface BrainAnalysis {
  emotionalState: EmotionalState;
  emotionalSignals: string[];      // Señales detectadas
  strategy: ResponseStrategy;
  strategyReason: string;          // Por qué se eligió esta estrategia
  shouldSendCard: boolean;
  shouldIncludePaymentLinks: boolean;
  toneAdjustment: string;          // Instrucción de tono para la IA
  contextSummary: string;          // Resumen del contexto para la IA
  prohibitions: string[];          // Lista de cosas que la IA NO debe hacer
  requirements: string[];          // Lista de cosas que la IA SÍ debe hacer
  formatInstructions: string;      // Instrucciones de formato visual
}

// ─── Detección de estado emocional ───────────────────────────────────────────

const EXCITED_SIGNALS = [
  "genial", "perfecto", "excelente", "increíble", "me encanta", "lo quiero",
  "lo compro", "dale", "vamos", "sí sí", "claro que sí", "qué bueno",
  "!", "😍", "🔥", "💯", "🙌", "👏"
];

const CURIOUS_SIGNALS = [
  "cómo", "qué incluye", "qué trae", "cuánto", "cuándo", "dónde",
  "me puedes explicar", "cuéntame", "más información", "detalles",
  "cómo funciona", "qué es", "para qué sirve"
];

const HESITANT_SIGNALS = [
  "no sé", "lo pienso", "déjame ver", "tal vez", "quizás", "puede ser",
  "no estoy seguro", "tengo dudas", "me da miedo", "no sé si",
  "es que", "pero", "aunque"
];

const OBJECTING_SIGNALS = [
  "caro", "costoso", "mucho", "no tengo", "sin dinero", "estafa",
  "desconfío", "no funciona", "garantía", "devolución", "reembolso",
  "mejor en otro lado", "lo consigo más barato", "no vale"
];

const FRUSTRATED_SIGNALS = [
  "ya te dije", "no me entiendes", "otra vez", "siempre lo mismo",
  "no sirve", "mal servicio", "qué pena", "decepcionante", "molesto",
  "harto", "cansado", "no funciona nada"
];

const SATISFIED_SIGNALS = [
  "gracias", "recibí", "llegó", "excelente servicio",
  "muy bueno", "recomiendo", "volvería a comprar", "satisfecho"
];

export function detectEmotionalState(
  text: string,
  history: Array<{ role: string; content: string }>
): { state: EmotionalState; signals: string[] } {
  const t = text.toLowerCase();
  const signals: string[] = [];

  // Revisar también los últimos 2 mensajes del cliente para contexto
  const recentCustomerMessages = history
    .filter(m => m.role === "customer")
    .slice(-3)
    .map(m => m.content.toLowerCase())
    .join(" ");

  const fullContext = `${t} ${recentCustomerMessages}`;

  if (FRUSTRATED_SIGNALS.some(s => fullContext.includes(s))) {
    signals.push(...FRUSTRATED_SIGNALS.filter(s => fullContext.includes(s)));
    return { state: "frustrated", signals };
  }

  if (OBJECTING_SIGNALS.some(s => t.includes(s))) {
    signals.push(...OBJECTING_SIGNALS.filter(s => t.includes(s)));
    return { state: "objecting", signals };
  }

  if (EXCITED_SIGNALS.some(s => t.includes(s))) {
    signals.push(...EXCITED_SIGNALS.filter(s => t.includes(s)));
    return { state: "excited", signals };
  }

  if (SATISFIED_SIGNALS.some(s => t.includes(s))) {
    signals.push(...SATISFIED_SIGNALS.filter(s => t.includes(s)));
    return { state: "satisfied", signals };
  }

  if (HESITANT_SIGNALS.some(s => t.includes(s))) {
    signals.push(...HESITANT_SIGNALS.filter(s => t.includes(s)));
    return { state: "hesitant", signals };
  }

  if (CURIOUS_SIGNALS.some(s => t.includes(s))) {
    signals.push(...CURIOUS_SIGNALS.filter(s => t.includes(s)));
    return { state: "curious", signals };
  }

  return { state: "neutral", signals: [] };
}

// ─── Ajuste de tono según estado emocional ────────────────────────────────────

function getToneAdjustment(
  emotional: EmotionalState,
  voice: BrandVoice
): string {
  const formality = voice.formality === "usted" ? "usted" : "tú";

  switch (emotional) {
    case "excited":
      return `El cliente está entusiasmado. Mantén su energía alta. Sé conciso y facilita la acción inmediata. Usa emojis de celebración. Trata de ${formality}.`;

    case "curious":
      return `El cliente está explorando. Responde su pregunta con claridad y precisión. Agrega UN dato extra que no preguntó pero que le va a interesar. Trata de ${formality}.`;

    case "hesitant":
      return `El cliente tiene dudas. Sé empático y paciente. Valida su preocupación antes de responder. No presiones. Ofrece información que reduzca el riesgo percibido. Trata de ${formality}.`;

    case "objecting":
      return `El cliente tiene una objeción. PRIMERO valida su sentimiento ("Entiendo perfectamente"). LUEGO ofrece una perspectiva diferente con datos concretos. NUNCA ignores la objeción. Trata de ${formality}.`;

    case "frustrated":
      return `El cliente está frustrado. Empieza con disculpa genuina. Sé muy breve. Ofrece solución concreta inmediata. No des explicaciones largas. Trata de ${formality}.`;

    case "satisfied":
      return `El cliente está satisfecho. Celebra con él. Pregunta si necesita algo más. Menciona sutilmente otros productos que podrían interesarle. Trata de ${formality}.`;

    default:
      return `Tono natural y cálido. Directo al punto. Trata de ${formality}.`;
  }
}

// ─── Selección de estrategia ──────────────────────────────────────────────────

// Estados emocionales que REQUIEREN IA en lugar de hardcode
const EMOTIONS_REQUIRING_AI: EmotionalState[] = ["frustrated", "objecting"];

function selectStrategy(
  intent: Intent,
  memory: ConversationMemory,
  emotional: EmotionalState,
  hardcodedDetailAlreadyGiven: boolean
): { strategy: ResponseStrategy; reason: string } {
  // ── OVERRIDE POR EMOCIÓN ────────────────────────────────────────────────
  // Si el cliente está frustrado u objetando, TODO va por IA
  if (EMOTIONS_REQUIRING_AI.includes(emotional)) {
    return {
      strategy: "ai_general_response",
      reason: `Cliente ${emotional} — requiere razonamiento empático, no respuesta predefinida`,
    };
  }

  // ── SALUDOS ──────────────────────────────────────────────────────────────
  if (intent === "greeting") {
    return {
      strategy: "hardcoded_greeting",
      reason: memory.hasGreeted
        ? "Cliente regresa — saludo de retorno hardcodeado"
        : "Primer contacto — saludo de bienvenida hardcodeado",
    };
  }

  // ── DETALLES ─────────────────────────────────────────────────────────────
  if (intent === "details_query") {
    if (hardcodedDetailAlreadyGiven) {
      return {
        strategy: "ai_general_response",
        reason: "Detalle ya explicado antes — IA responde sin repetir",
      };
    }
    // Si el cliente está dudoso, mejor que la IA responda con más contexto
    if (emotional === "hesitant" || emotional === "curious") {
      return {
        strategy: "ai_general_response",
        reason: `Cliente ${emotional} — IA da contexto más rico que respuesta fija`,
      };
    }
    return {
      strategy: "hardcoded_detail",
      reason: "Pregunta de detalle operativo — respuesta hardcodeada precisa",
    };
  }

  // ── PAGO ─────────────────────────────────────────────────────────────────
  if (intent === "payment_intent") {
    return {
      strategy: "ai_payment_close",
      reason: "Cliente quiere pagar — IA facilita cierre con links",
    };
  }

  // ── OBJECIÓN ─────────────────────────────────────────────────────────────
  if (intent === "objection" || emotional === "objecting") {
    return {
      strategy: "ai_objection_handle",
      reason: "Objeción detectada — IA responde con empatía estratégica",
    };
  }

  // ── DESPEDIDA ────────────────────────────────────────────────────────────
  if (intent === "leaving") {
    return {
      strategy: "ai_farewell",
      reason: "Cliente se despide — IA cierra con calidez",
    };
  }

  // ── PRODUCTO ─────────────────────────────────────────────────────────────
  if (intent === "product_query") {
    if (memory.currentProductId && memory.sentProductIds.has(memory.currentProductId)) {
      return {
        strategy: "ai_product_details",
        reason: "Producto ya mostrado — IA responde detalles sin repetir card",
      };
    }
    return {
      strategy: "ai_product_discovery",
      reason: "Nuevo producto solicitado — IA recomienda con card",
    };
  }

  // ── CONFIRMACIÓN ─────────────────────────────────────────────────────────
  if (intent === "confirmation") {
    return {
      strategy: "ai_payment_close",
      reason: "Cliente confirma — IA facilita el pago",
    };
  }

  // ── DESVÍO A HUMANO ───────────────────────────────────────────────────────
  if (intent === "human_handoff") {
    return {
      strategy: "human_handoff",
      reason: "Cliente quiere hablar con un humano — respuesta directa sin IA",
    };
  }

  // ── GENERAL / RESTO ──────────────────────────────────────────────────────
  // Si no hay intenciones claras pero el lead es nuevo y no se han mostrado productos, calificamos
  if (intent === "general" && memory.sentProductIds.size === 0 && memory.messageCount < 3) {
    return {
      strategy: "ai_qualification",
      reason: "Lead nuevo sin intención clara — IA realiza calificación inicial",
    };
  }

  return {
    strategy: "ai_general_response",
    reason: `Intención "${intent}" — IA responde con análisis completo`,
  };
}

// ─── Constructor de prohibiciones ────────────────────────────────────────────

function buildProhibitions(
  memory: ConversationMemory,
  strategy: ResponseStrategy,
  intent: Intent
): string[] {
  const prohibitions: string[] = [];

  // Nunca saludar si ya saludó
  if (memory.hasGreeted) {
    prohibitions.push('NO empieces con "Hola", "¡Hola!", "Buenos días", "Buenas tardes" ni ningún saludo. Ya saludaste antes.');
  }

  // Nunca repetir cards ya enviadas
  if (memory.sentProductIds.size > 0) {
    const ids = Array.from(memory.sentProductIds).join(", ");
    prohibitions.push(`NO envíes [CARD: ${ids}] — esa(s) tarjeta(s) ya se mostraron antes.`);
  }

  // Nunca inventar datos
  prohibitions.push("NO inventes precios, características ni datos que no estén en el catálogo.");

  // Nunca escribir links si no es pago
  if (intent !== "payment_intent" && intent !== "confirmation") {
    prohibitions.push("NO escribas URLs, links de pago ni números de cuenta. El sistema los adjunta automáticamente cuando corresponde.");
  }

  // Nunca repetir info ya dada
  if (memory.history.length > 2) {
    prohibitions.push("NO repitas información que ya diste en mensajes anteriores. Si ya explicaste algo, amplía con un detalle nuevo.");
  }

  // Respuestas breves y humanas. La ÚNICA lista permitida es la de CONTENIDO
  // de un producto ("qué incluye", "modalidad", "beneficios"), que va con
  // emojis (✅ por ítem) y se lee de un vistazo. Para el resto —objeción,
  // argumento, saludo, charla— nada de listas: prosa corta y natural.
  prohibitions.push("Al argumentar, saludar o charlar: no escribas párrafos largos ni listas con viñetas; prosa corta y natural de 1-3 líneas. (Excepción: el CONTENIDO de un producto —qué incluye, modalidad, beneficios— sí va en lista con emojis.)");

  // Nunca frases genéricas de relleno ni etiquetas de robot
  prohibitions.push('No uses muletillas vacías ("¡Claro que sí!", "Con mucho gusto", "Estoy aquí para ayudarte") ni etiquetas de sistema ("OBJECIÓN DETECTADA", etc.).');

  return prohibitions;
}

// ─── Constructor de requisitos ────────────────────────────────────────────────

function buildRequirements(
  strategy: ResponseStrategy,
  memory: ConversationMemory,
  voice: BrandVoice,
  productName: string | null
): string[] {
  const requirements: string[] = [];
  const sep = makeSeparator(voice);

  switch (strategy) {
    case "ai_qualification":
      requirements.push(`Haz solo UNA pregunta breve para entender qué busca o su nivel de experiencia.`);
      requirements.push(`No ofrezcas productos todavía hasta saber qué necesita.`);
      break;

    case "ai_product_discovery":
      requirements.push(`Escribe SOLO 1 línea corta y entusiasta antes de la card (ej: "¡Aquí lo tienes! 👇" o "Mira esto 🔥").`);
      requirements.push(`NO menciones el precio, el contenido ni los detalles — todo eso ya está en la card.`);
      requirements.push(`Incluye [CARD: ID] justo después de esa línea.`);
      requirements.push(`NADA después de [CARD: ID].`);
      break;

    case "ai_product_details":
      if (productName) {
        requirements.push(`Responde sobre "${productName}" usando SOLO los datos del catálogo.`);
        requirements.push(`No mandes un párrafo denso: la gente no lee muros de texto. Rompé la info en líneas cortas y usá un emoji por idea como ancla visual, para que se lea de un vistazo y se sienta ligero.`);
        requirements.push(`Los emojis van según lo que describas (📚 contenido, 💻 modalidad, ✅ cada beneficio, 💰 precio, 📦 acceso). Que cada línea respire.`);
        requirements.push(`Si es un solo dato puntual (precio, duración, garantía), una línea corta con su emoji alcanza.`);
        requirements.push(`No hagas preguntas innecesarias. Entrega la información y deja que el cliente tome la iniciativa.`);
      }
      break;

    case "ai_payment_close":
      requirements.push(`Confirma el producto con entusiasmo (1 línea).`);
      requirements.push(`NO describas el producto — ni su contenido, características, beneficios ni precio.`);
      requirements.push(`Di que los enlaces de pago están listos abajo (el sistema los adjunta automáticamente).`);
      requirements.push(`Sé breve: máximo 2 líneas + emoji.`);
      break;

    case "ai_objection_handle":
      requirements.push(`Valida su preocupación con empatía genuina, en tus propias palabras (nunca una frase de plantilla ni una etiqueta).`);
      requirements.push(`Da UNA razón concreta y honesta que reduzca el riesgo (garantía de ${voice.guaranteeInfo.days} días, acceso de por vida, o el valor real que recibe).`);
      requirements.push(`Tono humano y tranquilo, sin presionar. Termina invitando suavemente al siguiente paso.`);
      break;

    case "ai_farewell":
      requirements.push(`Despídete con calidez: "${voice.phrases.farewell}"`);
      requirements.push(`Deja la puerta abierta para futuras consultas.`);
      requirements.push(`Máximo 2 líneas.`);
      break;

    case "ai_general_response":
      requirements.push(`Responde la pregunta directamente en la primera línea.`);
      requirements.push(`Agrega contexto útil en 1-2 líneas adicionales si es necesario.`);
      requirements.push(`NO termines con una pregunta. Entrega la información y deja que el cliente tome la iniciativa.`);
      break;
  }

  return requirements;
}

// ─── Constructor de instrucciones de formato ──────────────────────────────────

function buildFormatInstructions(
  voice: BrandVoice,
  strategy: ResponseStrategy
): string {
  // Guía de ESTILO HUMANO — corta y clara. Nada de formato mecánico:
  // los modelos débiles copian los muros de instrucciones, y los separadores/
  // viñetas hacen que suene a robot. Un gran vendedor escribe natural.
  const e = voice.emojis;
  return `
[CÓMO ESCRIBIR — REGLA DE ORO]
Parecé una conversación de WhatsApp, no una ficha de producto. Poco texto, natural y fácil de leer:
- Frases cortas, de tú a tú, como una persona real.
- Nada de párrafos densos ni discursos: si hay varios datos, separalos en líneas cortas con aire.
- PROHIBIDO: separadores (━ ─ ═ •••), TÍTULOS EN MAYÚSCULAS, y etiquetas de sistema ("OBJECIÓN DETECTADA", "DEBES HACER", etc.).
- Varía tus palabras. Que nunca suene a plantilla.
- Si vas a mostrar un producto, UNA frase natural y luego [CARD: ID]. Nada después de la card.
- Cuando el cliente vaya a pagar, una frase breve confirmando; el sistema adjunta los enlaces (no los escribas tú).

[EMOJIS Y DISEÑO — QUE SE LEA LIVIANO]
Los emojis son anclas visuales: la gente los usa para leer rápido y sin cansarse. Reglas:
- Rompé el texto en líneas cortas con aire. Un dato por línea, cada uno con su emoji, en vez de un párrafo cargado.
- Cada emoji tiene que significar algo del dato: 🎨 para una herramienta, 📐 para otra, ✅ para un beneficio, 💰 para el precio, 📦 para el acceso. No repitas siempre el mismo.
- En una frase conversacional corta, 1 o 2 emojis alcanzan (😊 👍 🙌).
- Usá el emoji según el MOMENTO de la venta:
  · cercanía/emoción: 😊 👍 🙌
  · producto: ${e.product}
  · beneficio: ${e.benefit} ⭐
  · precio: ${e.price}
  · entrega/acceso: ${e.delivery}
  · pago: ${e.payment} 📱
  · confirmar/cerrar: ${e.success} 👉
  · urgencia (solo si es real): ${e.urgency}
- NUNCA: emojis aleatorios sin relación, emojis para inventar promesas, ni llenar cada palabra.
- El cliente debe sentir que chatea con una persona que escribe liviano y claro, no que lee un anuncio cargado.`;
}

// ─── Función principal: analizar y construir el contexto completo ─────────────

export function analyzeBrain(
  text: string,
  intent: Intent,
  memory: ConversationMemory,
  voice: BrandVoice,
  productName: string | null,
  hardcodedDetailAlreadyGiven: boolean = false
): BrainAnalysis {
  // 1. Estado emocional
  const { state: emotionalState, signals: emotionalSignals } = detectEmotionalState(
    text,
    memory.history
  );

  // 2. Estrategia — el cerebro decide con TODA la información
  const { strategy, reason: strategyReason } = selectStrategy(intent, memory, emotionalState, hardcodedDetailAlreadyGiven);

  // 3. Tono
  const toneAdjustment = getToneAdjustment(emotionalState, voice);

  // 4. Prohibiciones
  const prohibitions = buildProhibitions(memory, strategy, intent);

  // 5. Requisitos
  const requirements = buildRequirements(strategy, memory, voice, productName);

  // 6. Formato
  const formatInstructions = buildFormatInstructions(voice, strategy);

  // 7. Resumen de contexto
  const contextSummary = buildContextSummary(memory, voice, productName);

  // 8. Flags
  const shouldSendCard = strategy === "ai_product_discovery";
  const shouldIncludePaymentLinks = strategy === "ai_payment_close";

  return {
    emotionalState,
    emotionalSignals,
    strategy,
    strategyReason,
    shouldSendCard,
    shouldIncludePaymentLinks,
    toneAdjustment,
    contextSummary,
    prohibitions,
    requirements,
    formatInstructions,
  };
}

// ─── Resumen de contexto para la IA ──────────────────────────────────────────

function buildContextSummary(
  memory: ConversationMemory,
  voice: BrandVoice,
  productName: string | null
): string {
  const parts: string[] = [
    `mensajes del cliente: ${memory.messageCount}`,
    `ya saludaste: ${memory.hasGreeted ? "sí" : "no"}`,
  ];

  if (productName) parts.push(`producto en contexto: "${productName}"`);
  if (memory.sentProductIds.size > 0) parts.push(`cards ya enviadas: [${Array.from(memory.sentProductIds).join(", ")}]`);
  if (memory.lastAgentMessage) {
    const preview = memory.lastAgentMessage.substring(0, 70).replace(/\n/g, " ");
    parts.push(`tu último mensaje fue: "${preview}..."`);
  }

  return `\n(contexto: ${parts.join(" · ")})`;
}

// ─── Constructor del prompt final completo ────────────────────────────────────

export function buildFinalPrompt(
  baseSystemPrompt: string,
  brain: BrainAnalysis,
  voice: BrandVoice
): string {
  // Instrucciones internas EN SECRETO para el modelo. Se usan marcadores discretos
  // (no separadores visuales) para que el modelo NO los copie en su respuesta.
  const sections: string[] = [baseSystemPrompt];

  sections.push(brain.contextSummary);

  sections.push(`\n(cliente ahora mismo: ${brain.emotionalState}${brain.emotionalSignals.length ? " — señales: " + brain.emotionalSignals.slice(0, 3).join(", ") : ""}. ${brain.toneAdjustment})`);

  sections.push(`\n(tu objetivo en este mensaje: ${brain.strategyReason})`);

  if (brain.requirements.length > 0) {
    sections.push(`\n(haz esto: ${brain.requirements.join(" · ")})`);
  }

  if (brain.prohibitions.length > 0) {
    sections.push(`\n(evita: ${brain.prohibitions.join(" · ")})`);
  }

  sections.push(brain.formatInstructions);

  // CRÍTICO: el modelo debe devolver SOLO el mensaje para el cliente, sin repetir
  // ni mencionar estas instrucciones internas.
  sections.push(`\n[IMPORTANTE] Responde ÚNICAMENTE con el mensaje tal cual se lo enviarías al cliente por WhatsApp. No expliques tu razonamiento, no menciones "estrategia", "objetivo" ni estas instrucciones, no uses encabezados. Solo el mensaje humano y natural.`);

  return sections.join("\n");
}
