// @ts-nocheck
import { eq, and, asc, desc } from "drizzle-orm";
import {
  db,
  agents,
  conversations,
  messages,
  products,
  productCategories,
  leads,
  settings as settingsTable,
} from "@workspace/db";
import { getProviderConfig, getProviderConfigFromSettings, createAIClient } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { PaymentGateway } from "./payments";
import { 
  healthMonitor,
  executeWithFallback, 
  determineFallbackResponse, 
  retryWithBackoff,
  notifyOperatorOfFailure,
  areAIProvidersHealthy,
  arePaymentServicesHealthy,
  getSystemHealthSummary
} from "./fallbackSystem";
import {
  loadConversationMemory,
  computeDecision,
  saveAgentMessage,
  persistStage,
  buildChatHistory,
  detectIntent,
  tryHardcodedAnswer,
  sanitizeResponse,
  detectHardcodedIntent,
  hasHardcodedAnswerBeenGiven,
  type Stage,
} from "./conversation-engine";
import { getBrandVoice, formatWithBrandVoice } from "./brand-voice";
import { analyzeBrain, buildFinalPrompt, type ResponseStrategy, type EmotionalState } from "./response-brain";
import { 
  isPaymentConfirmation, 
  isPaymentMethodQuestion, 
  isProductDetailsQuestion,
  getPaymentMethodResponse,
  getConfirmationResponse
} from "./payment-confirmation";
import { getAgentType } from "./agent-router";
import { 
  analyzeCustomerObjection, 
  generateObjectionResponse,
  getStrategicSalesGuidance,
  type ObjectionAnalysis,
  type PersonalizationData,
  type EmotionalContext
} from "./objectionHandler";
import { AdvancedIntelligence } from "./advanced-intelligence";

// ============================================================
// 🎯 UNIFIED KEYWORD CONSTANTS - SINGLE SOURCE OF TRUTH
// ============================================================
// ⚠️ IMPORTANTE: Esta es la ÚNICA definición de keywords en todo el sistema
// Evita duplicación de lógica y mantiene consistencia en la detección de intenciones

export const PAYMENT_KEYWORDS = [
  // Compra / Adquisición
  'pago', 'pagar', 'comprar', 'adquirir', 'compro', 'comprare',
  // Métodos de pago
  'nequi', 'daviplata', 'transferencia', 'transferir',
  // Consultas sobre pago
  'cuenta', 'link', 'enlace', 'precio', 'cuánto', 'costo', 'vale',
  // Confirmación de compra
  'confirmo', 'confirmar', 'procedo', 'adelante', 'vamos', 'dale'
];

export const OBJECTION_KEYWORDS = [
  'caro', 'costoso', 'mucho', 'pensarlo', 'después', 'luego',
  'no sé', 'duda', 'inseguro', 'desconfío', 'estafa', 'funciona',
  'garantía', 'devolución', 'reembolso', 'no tengo', 'sin dinero'
];

export const URGENCY_KEYWORDS = [
  'rápido', 'urgente', 'ya', 'ahora', 'hoy', 'inmediato',
  'cuanto antes', 'pronto', 'necesito ya'
];

export const LEAVING_KEYWORDS = [
  'adiós', 'chao', 'gracias', 'luego', 'después', 'no gracias',
  'no me interesa', 'no quiero', 'déjame', 'molestando'
];

// Interest level indicators for lead behavior analysis
export const HIGH_INTEREST_KEYWORDS = [
  'necesito', 'urgente', 'cuando', 'precio', 'comprar', 'adquirir'
];

export const MEDIUM_INTEREST_KEYWORDS = [
  'interesa', 'información', 'detalles', 'características'
];

export const LOW_INTEREST_KEYWORDS = [
  'hola', 'buenas', 'que tal'
];

// Decision capacity indicators
export const HIGH_DECISION_KEYWORDS = [
  'compro', 'quiero', 'necesito', 'decidido'
];

export const LOW_DECISION_KEYWORDS = [
  'tal vez', 'no se', 'pensando', 'viendo'
];

// Helper functions for intent detection

export function hasPaymentIntent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return PAYMENT_KEYWORDS.some(k => lowerText.includes(k));
}

export function hasObjectionIntent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return OBJECTION_KEYWORDS.some(k => lowerText.includes(k));
}

export function hasUrgencyIntent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return URGENCY_KEYWORDS.some(k => lowerText.includes(k));
}

export function hasLeavingIntent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return LEAVING_KEYWORDS.some(k => lowerText.includes(k));
}

// ============================================================

// Context Intelligence Enhancement Types
interface ConversationContext {
  hasIntroduced: boolean;
  currentTopic: string | null;
  previousTopics: string[];
  leadBehavior: LeadBehaviorPattern;
  interactionCount: number;
  lastInteractionTime: Date | null;
  // ✅ Nuevo: Rastrear tarjetas enviadas para evitar repetición
  cardsSentFor: Set<number>; // IDs de productos cuya tarjeta ya fue enviada
  lastCardSentAt: Date | null;
}

interface LeadBehaviorPattern {
  interestLevel: 'low' | 'medium' | 'high';
  priceInquiries: number;
  urgencyIndicators: string[];
  decisionCapacity: 'low' | 'medium' | 'high';
  preferredProducts: string[];
  objectionPatterns: string[];
  communicationStyle: 'direct' | 'detailed' | 'casual' | 'formal';
  emotionalState: EmotionalContext;
  objectionAnalysis?: ObjectionAnalysis;
}

interface TopicTransition {
  from: string | null;
  to: string;
  confidence: number;
}

async function updateConversationStage(convo: any, lastText: string, res: any, conversationId: number) {
  console.log(`🔄 [STAGE-ANALYSIS] Analizando etapa dinámica para conversación ${conversationId}`);
  
  let nextStage: string = convo.currentStage;
  const text = lastText.toLowerCase();
  const responseText = res.content.toLowerCase();

  // Detección basada en Intención, no en orden lineal
  if (text.includes("pago") || text.includes("comprar") || text.includes("adquirir") || text.includes("cuenta") || text.includes("nequi") || text.includes("link") || text.includes("enlace")) {
    nextStage = "closing"; // Salto directo al cierre si hay intención de pago
  } 
  else if (responseText.includes("[card:") || text.includes("qué incluye") || text.includes("qué trae") || text.includes("característica")) {
    nextStage = "presentation"; // Presentación si se muestra tarjeta o hay dudas técnicas
  }
  else if (text.includes("precio") || text.includes("cuánto") || text.includes("costo") || text.includes("información")) {
    nextStage = "qualification"; // Calificación si pregunta general
  }
  else if (text.length < 15 && (text.includes("hola") || text.includes("buen"))) {
    nextStage = "greeting"; // Saludo solo si es mensaje corto de entrada
  }

  if (nextStage !== convo.currentStage) {
    console.log(`🔄 [STAGE-DYNAMIC] Cambio de etapa detectado: ${convo.currentStage} → ${nextStage}`);
    await db.update(conversations)
      .set({ currentStage: nextStage })
      .where(eq(conversations.id, conversationId));
  }
}

function formatPrice(price: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency} ${price.toFixed(2)}`;
  }
}

// Context Intelligence Enhancement Functions

/**
 * Analyzes conversation history to build context intelligence
 */
function analyzeConversationContext(history: any[]): ConversationContext {
  const agentMessages = history.filter(m => m.role === "assistant");
  const customerMessages = history.filter(m => m.role === "customer");
  
  // Check if agent has already introduced itself
  // Detectamos si ya hubo al menos UN mensaje del agente (cualquier saludo cuenta como presentación)
  const hasIntroduced = agentMessages.length > 0;

  // Analyze lead behavior patterns
  const leadBehavior = analyzeLeadBehaviorPattern(customerMessages);
  
  // Detect current and previous topics
  const topicAnalysis = analyzeTopicProgression(history);
  
  return {
    hasIntroduced,
    currentTopic: topicAnalysis.currentTopic,
    previousTopics: topicAnalysis.previousTopics,
    leadBehavior,
    interactionCount: customerMessages.length,
    lastInteractionTime: history.length > 0 ? new Date(history[history.length - 1].createdAt) : null
  };
}

/**
 * Analyzes customer behavior patterns for personalization with advanced intelligence
 */
function analyzeLeadBehaviorPattern(customerMessages: any[]): LeadBehaviorPattern {
  const allText = customerMessages.map(m => m.content.toLowerCase()).join(" ");
  const conversationHistory = customerMessages.map(m => m.content);
  const lastMessage = customerMessages[customerMessages.length - 1]?.content || "";
  
  // Interest level indicators
  let interestLevel: 'low' | 'medium' | 'high' = 'low';
  if (HIGH_INTEREST_KEYWORDS.some(k => allText.includes(k))) {
    interestLevel = 'high';
  } else if (MEDIUM_INTEREST_KEYWORDS.some(k => allText.includes(k))) {
    interestLevel = 'medium';
  }

  // Count price inquiries - ✅ Usando CONSTANTE UNIFICADA
  const priceInquiries = PAYMENT_KEYWORDS.reduce((count, keyword) => 
    count + (allText.match(new RegExp(keyword, 'g')) || []).length, 0
  );

  // Detect urgency indicators - ✅ Usando CONSTANTE UNIFICADA
  const urgencyIndicators = URGENCY_KEYWORDS.filter(k => allText.includes(k));

  // Decision capacity indicators - ✅ Usando CONSTANTES UNIFICADAS
  let decisionCapacity: 'low' | 'medium' | 'high' = 'medium';
  if (HIGH_DECISION_KEYWORDS.some(k => allText.includes(k))) {
    decisionCapacity = 'high';
  } else if (LOW_DECISION_KEYWORDS.some(k => allText.includes(k))) {
    decisionCapacity = 'low';
  }

  // Extract preferred products mentioned
  const productKeywords = ["piano", "guitarra", "excel", "diseño", "trading", "idiomas", "hacking"];
  const preferredProducts = productKeywords.filter(k => allText.includes(k));

  // Detect objection patterns - ✅ Usando CONSTANTE UNIFICADA
  const objectionPatterns = OBJECTION_KEYWORDS.filter(k => allText.includes(k));

  // Advanced Intelligence: Analyze communication style
  const communicationStyle = analyzeCommunicationStyle(allText, customerMessages);

  // Advanced Intelligence: Analyze emotional state
  const emotionalState = analyzeEmotionalIntelligence(lastMessage);

  // Advanced Intelligence: Analyze objections if present
  let objectionAnalysis: ObjectionAnalysis | undefined;
  if (objectionPatterns.length > 0 || lastMessage.toLowerCase().includes('no') || 
      lastMessage.toLowerCase().includes('pero') || lastMessage.toLowerCase().includes('sin embargo')) {
    objectionAnalysis = analyzeCustomerObjection(lastMessage, conversationHistory);
    
    logger.info({
      objectionType: objectionAnalysis.type,
      confidence: objectionAnalysis.confidence,
      strategy: objectionAnalysis.strategy,
      sentiment: objectionAnalysis.sentiment
    }, "[Agent] Objection detected and analyzed");
  }

  return {
    interestLevel,
    priceInquiries,
    urgencyIndicators,
    decisionCapacity,
    preferredProducts,
    objectionPatterns,
    communicationStyle,
    emotionalState,
    objectionAnalysis
  };
}

/**
 * Analyzes customer communication style for personalization
 */
function analyzeCommunicationStyle(allText: string, messages: any[]): 'direct' | 'detailed' | 'casual' | 'formal' {
  const avgMessageLength = messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length;
  const hasQuestions = messages.some(m => m.content.includes('?'));
  const hasFormalWords = ['usted', 'podría', 'quisiera', 'agradecería'].some(w => allText.includes(w));
  const hasCasualWords = ['che', 'bro', 'genial', 'súper', 'jaja'].some(w => allText.includes(w));
  
  if (hasFormalWords) return 'formal';
  if (hasCasualWords) return 'casual';
  if (avgMessageLength > 100 || hasQuestions) return 'detailed';
  return 'direct';
}

/**
 * Analyzes emotional intelligence from customer messages
 */
function analyzeEmotionalIntelligence(message: string): EmotionalContext {
  const messageLower = message.toLowerCase();
  
  // Sentiment analysis
  const positiveWords = ['genial', 'perfecto', 'excelente', 'me gusta', 'fantástico', 'increíble'];
  const negativeWords = ['malo', 'terrible', 'no me gusta', 'horrible', 'pesimo', 'decepcionante'];
  const frustrationWords = ['no funciona', 'no sirve', 'cansado', 'harto', 'molesto', 'problema'];
  const excitementWords = ['emocionado', 'ansioso', 'esperando', 'genial', 'súper'];
  const confusionWords = ['no entiendo', 'confuso', 'no sé', 'explícame', 'no comprendo'];
  
  let sentiment: EmotionalContext['sentiment'] = 'neutral';
  const emotions: string[] = [];
  let frustration = 0;
  let excitement = 0;
  let confusion = 0;
  
  if (positiveWords.some(w => messageLower.includes(w))) {
    sentiment = 'positive';
    emotions.push('positive');
  }
  if (negativeWords.some(w => messageLower.includes(w))) {
    sentiment = 'negative';
    emotions.push('negative');
  }
  if (frustrationWords.some(w => messageLower.includes(w))) {
    emotions.push('frustration');
    frustration = 70;
    sentiment = 'very_negative';
  }
  if (excitementWords.some(w => messageLower.includes(w))) {
    emotions.push('excitement');
    excitement = 80;
    sentiment = 'very_positive';
  }
  if (confusionWords.some(w => messageLower.includes(w))) {
    emotions.push('confusion');
    confusion = 60;
  }
  
  // Engagement level based on message characteristics
  const messageLength = message.length;
  const hasQuestions = message.includes('?');
  const hasExclamations = message.includes('!');
  
  let engagement: EmotionalContext['engagement'] = 'low';
  if (messageLength > 100 || hasQuestions || hasExclamations) {
    engagement = 'high';
  } else if (messageLength > 50) {
    engagement = 'medium';
  }
  
  return {
    sentiment,
    emotions,
    engagement,
    frustration,
    excitement,
    confusion
  };
}

/**
 * Analyzes topic progression and transitions in conversation
 */
function analyzeTopicProgression(history: any[]): { currentTopic: string | null, previousTopics: string[] } {
  const productKeywords = {
    "piano": ["piano", "teclado", "música", "musica"],
    "guitarra": ["guitarra", "música", "musica"],
    "excel": ["excel", "office", "hoja de calculo"],
    "diseño": ["diseño", "photoshop", "illustrator", "canva"],
    "trading": ["trading", "forex", "bolsa", "inversiones"],
    "idiomas": ["idiomas", "inglés", "ingles", "francés", "alemán"],
    "hacking": ["hacking", "ciberseguridad", "seguridad"],
    "marketing": ["marketing", "seo", "redes sociales"],
    "fitness": ["fitness", "gimnasio", "ejercicio"],
    "programación": ["programación", "programacion", "codigo", "python"]
  };

  const topics: string[] = [];
  
  // Analyze each message for topic mentions
  for (const message of history) {
    const text = message.content.toLowerCase();
    for (const [topic, keywords] of Object.entries(productKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        topics.push(topic);
        break; // Only count one topic per message
      }
    }
  }

  const uniqueTopics = [...new Set(topics)];
  const currentTopic = topics.length > 0 ? topics[topics.length - 1] : null;
  const previousTopics = uniqueTopics.slice(0, -1);

  return { currentTopic, previousTopics };
}

/**
 * Detects topic transitions between messages
 */
function detectTopicTransition(history: any[], currentMessage: string): TopicTransition | null {
  if (history.length === 0) return null;

  const topicAnalysis = analyzeTopicProgression([...history, { content: currentMessage, role: "customer" }]);
  const previousAnalysis = analyzeTopicProgression(history);

  if (topicAnalysis.currentTopic !== previousAnalysis.currentTopic) {
    return {
      from: previousAnalysis.currentTopic,
      to: topicAnalysis.currentTopic || "general",
      confidence: 0.8 // Simple confidence score
    };
  }

  return null;
}

/**
 * Generates personalized context for agent prompt with advanced intelligence
 */
function generatePersonalizedContext(context: ConversationContext, lastMessage: string): string {
  const { leadBehavior, hasIntroduced, currentTopic, previousTopics } = context;
  
  let personalizedInstructions = "";

  // Introduction context
  if (hasIntroduced) {
    personalizedInstructions += "\nCONTEXTO DE PRESENTACIÓN: Ya saludaste al cliente anteriormente. NO vuelvas a decir 'Hola', '¡Hola!', 'Buenos días' ni ningún saludo de apertura. Ve DIRECTO al punto.\n";
  }

  // Topic transition context
  if (previousTopics.length > 0 && currentTopic) {
    personalizedInstructions += `\nCONTEXTO DE TEMA: El cliente cambió de ${previousTopics[previousTopics.length - 1]} a ${currentTopic}. Enfócate COMPLETAMENTE en ${currentTopic} y olvida temas anteriores.\n`;
  }

  // Advanced Intelligence: Objection handling context
  if (leadBehavior.objectionAnalysis) {
    const objection = leadBehavior.objectionAnalysis;
    personalizedInstructions += `\nMANEJO DE OBJECIONES DETECTADAS:
- Tipo de objeción: ${objection.type}
- Estrategia recomendada: ${objection.strategy}
- Sentimiento del cliente: ${objection.sentiment}
- Respuesta sugerida: ${objection.suggestedResponse}
IMPORTANTE: Usa esta información para responder de manera empática y estratégica.\n`;
  }

  // Advanced Intelligence: Emotional intelligence context
  if (leadBehavior.emotionalState.sentiment !== 'neutral') {
    personalizedInstructions += `\nCONTEXTO EMOCIONAL:
- Estado emocional: ${leadBehavior.emotionalState.sentiment}
- Emociones detectadas: ${leadBehavior.emotionalState.emotions.join(', ')}
- Nivel de compromiso: ${leadBehavior.emotionalState.engagement}`;
    
    if (leadBehavior.emotionalState.frustration > 50) {
      personalizedInstructions += "\n- CRÍTICO: Cliente frustrado. Usa empatía y soluciones inmediatas.";
    }
    if (leadBehavior.emotionalState.excitement > 50) {
      personalizedInstructions += "\n- OPORTUNIDAD: Cliente emocionado. Aprovecha para cerrar venta.";
    }
    if (leadBehavior.emotionalState.confusion > 50) {
      personalizedInstructions += "\n- ACCIÓN: Cliente confundido. Simplifica y clarifica información.";
    }
    personalizedInstructions += "\n";
  }

  // Advanced Intelligence: Communication style adaptation
  personalizedInstructions += `\nESTILO DE COMUNICACIÓN DETECTADO: ${leadBehavior.communicationStyle}`;
  switch (leadBehavior.communicationStyle) {
    case 'direct':
      personalizedInstructions += "\n- Sé directo y conciso. Evita explicaciones largas.";
      break;
    case 'detailed':
      personalizedInstructions += "\n- Proporciona información detallada y completa.";
      break;
    case 'casual':
      personalizedInstructions += "\n- Usa un tono casual y relajado. Evita formalidades excesivas.";
      break;
    case 'formal':
      personalizedInstructions += "\n- Mantén un tono formal y profesional.";
      break;
  }

  // Lead behavior personalization
  if (leadBehavior.interestLevel === 'high') {
    personalizedInstructions += "\nPERSONALIZACIÓN: Cliente con ALTO interés. Avanza hacia el cierre de venta.\n";
  } else if (leadBehavior.interestLevel === 'low') {
    personalizedInstructions += "\nPERSONALIZACIÓN: Cliente con interés inicial. Genera curiosidad y valor.\n";
  }

  // Price sensitivity
  if (leadBehavior.priceInquiries > 2) {
    personalizedInstructions += "\nPERSONALIZACIÓN: Cliente muy enfocado en precio. Enfatiza valor y beneficios.\n";
  }

  // Urgency handling
  if (leadBehavior.urgencyIndicators.length > 0) {
    personalizedInstructions += "\nPERSONALIZACIÓN: Cliente con urgencia. Facilita proceso de compra rápido.\n";
  }

  // Objection handling
  if (leadBehavior.objectionPatterns.length > 0) {
    personalizedInstructions += "\nPERSONALIZACIÓN: Cliente con objeciones de precio. Usa estrategias de reducción de riesgo.\n";
  }

  return personalizedInstructions;
}

export async function runAgentReply(conversationId: number) {
  const startTime = Date.now();
  const ts = () => new Date().toISOString();
  console.log(`🔍 [AGENT-START] runAgentReply iniciado para conversación ${conversationId} - ${ts()}`);

  // ── 1. Cargar conversación ────────────────────────────────────────────────
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!convo) {
    console.log(`❌ [AGENT-ERROR] Conversación ${conversationId} no encontrada - ${ts()}`);
    return null;
  }

  // ── 2. Cargar memoria estructurada desde BD (fuente única de verdad) ──────
  const memory = await loadConversationMemory(conversationId);
  const lastText = memory.lastCustomerMessage;
  const customerName = convo.contactName || "cliente";

  console.log(`🧠 [ENGINE] Memoria cargada - hasGreeted:${memory.hasGreeted} stage:${memory.currentStage} product:${memory.currentProductName || "none"} sentCards:[${Array.from(memory.sentProductIds).join(",")}] isNewSession:${memory.isNewSession} - ${ts()}`);

  // ── 3. Seleccionar agente activo ──────────────────────────────────────────
  const { getActiveAgent } = await import("./agent-router");
  const activeAgent = await getActiveAgent(lastText, conversationId, convo.tenantId);
  if (!activeAgent) {
    console.log(`❌ [AGENT-ERROR] No hay agente activo configurado - ${ts()}`);
    return null;
  }
  console.log(`🤖 [AGENT-INFO] Agente activo: ${activeAgent.name} - ${ts()}`);

  // ── 4. Cargar productos y categorías ─────────────────────────────────────
  const [appSettings] = await db.select().from(settingsTable).limit(1);
  const productList = await db.select().from(products).where(eq(products.isActive, true));
  const allCategories = await db.select().from(productCategories);
  const categoryMap = new Map(allCategories.map(c => [c.id, c.name.toLowerCase()]));
  console.log(`📦 [AGENT-INFO] Productos activos: ${productList.length} - ${ts()}`);

  // ── 5. Motor de decisión ──────────────────────────────────────────────────
  const decision = await computeDecision(memory, lastText, productList, categoryMap);
  console.log(`🎯 [ENGINE-DECISION] ${decision.debugReason} - ${ts()}`);

  // ── 6. Obtener la voz del negocio (ANTES de cualquier respuesta) ─────────
  const voice = getBrandVoice(
    activeAgent.metadata as Record<string, any> | null,
    appSettings ? { businessName: appSettings.businessName } : null
  );

  // ── 7. CEREBRO DE RAZONAMIENTO: analiza ANTES de cualquier camino ────────
  // El cerebro detecta emoción, elige estrategia, define prohibiciones y requisitos.
  // El cerebro tiene la AUTORIDAD TOTAL para decidir si usar fast-track o IA.
  const hcIntent = decision.intent === "details_query" ? detectHardcodedIntent(lastText) : null;
  const hardcodedYaDado = hcIntent ? hasHardcodedAnswerBeenGiven(memory, hcIntent) : false;
  const brain = analyzeBrain(
    lastText,
    decision.intent,
    memory,
    voice,
    decision.productToShow?.name || memory.currentProductName,
    hardcodedYaDado
  );
  console.log(`🧠 [BRAIN] estado:${brain.emotionalState} estrategia:${brain.strategy} — ${brain.strategyReason} - ${ts()}`);

  // ── 8. Construir catálogo para el prompt ──────────────────────────────────
  const productsBlock = productList.map(p => {
    const features = (p.features as string[]) || [];
    return `[PRODUCTO ID: ${p.id}] ${p.name} | Precio: ${formatPrice(Number(p.price), p.currency)} | ${p.description || ""}${features.length ? " | " + features.join(", ") : ""}`;
  }).join("\n");

  // ── 9. Construir prompt base del sistema ──────────────────────────────────
  const hasSentCardAlready = memory.sentProductIds.size > 0;

  const systemPrompt = (activeAgent.systemPrompt || `Eres **${voice.agentName}**, ${voice.agentRole} de ${voice.businessName}.
Estás conversando con **${customerName}**.

━━━━━━━━━━━━━━━━━━━━━━━
🧠 CÓMO PIENSAS Y ACTÚAS
━━━━━━━━━━━━━━━━━━━━━━━
1. ESCUCHA ACTIVA: Interpreta la intención real del cliente.
2. MEMORIA: Recuerda todo lo que ya se habló. No repitas información.
3. RESPUESTAS CORTAS: Máx 3 líneas + emoji. Sin paredes de texto.
4. NO REPITAS: Si ya diste info, amplía con algo nuevo.
5. FLUJO NATURAL: Charla, no catálogo.

━━━━━━━━━━━━━━━━━━━━━━━
📋 INFORMACIÓN DEL NEGOCIO
━━━━━━━━━━━━━━━━━━━━━━━
✅ Entrega: ${voice.deliveryInfo.details}
✅ Acceso: ${voice.accessInfo.description}
✅ Garantía: ${voice.guaranteeInfo.description}

━━━━━━━━━━━━━━━━━━━━━━━
📦 CATÁLOGO COMPLETO
━━━━━━━━━━━━━━━━━━━━━━━
${productList.length > 0 ? productsBlock : "No hay productos disponibles."}

🚨 REGLAS ABSOLUTAS:
• NO inventes precios, nombres ni características.
• NO escribas URLs ni números de cuenta — el sistema los adjunta.
${hasSentCardAlready ? "• NO repitas la card si ya la enviaste — responde la duda directamente." : "• Cuando recomiendes un producto nuevo, USA [CARD: ID] al final."}
• NO uses frases genéricas de apertura.`).trim();

  // ── 10. INTEGRAR contexto del motor DENTRO del cerebro ────────────────────
  // El bloque de contexto del motor (engineContext) se inyecta como contexto adicional
  // para que el prompt final tenga TODA la información disponible
  const engineContextBlock = `${decision.contextBlock}\n\n${AdvancedIntelligence.generateIntelligentContext(
    lastText,
    memory.history,
    decision.productToShow ? productList.find(p => p.id === decision.productToShow!.id) : null
  )}`;

  // ── 11. ATENDER SEGÚN ESTRATEGIA DEL CEREBRO ─────────────────────────────

  // ── 11a. SALUDO (si el cerebro decidió hardcoded_greeting) ────────────────
  if (brain.strategy === "hardcoded_greeting") {
    if (!memory.hasGreeted) {
      console.log(`⚡ [FAST-TRACK] Primer saludo hardcodeado - ${ts()}`);
      const greetingRaw = voice.phrases.greeting_new.replace(/\{name\}/g, customerName);
      const raw = customerName !== "cliente"
        ? `${voice.emojis.greeting} ¡Hola *${customerName}*! ${greetingRaw.replace(/^.*?Bienvenido\/?\w*/i, "").trim()}`
        : greetingRaw;

      await saveAgentMessage(conversationId, raw, "greeting", { intent: "greeting", isHardcoded: true });
      await persistStage(conversationId, "greeting");
      const totalTime = Date.now() - startTime;
      console.log(`🏁 [AGENT-END] Completado en ${totalTime}ms - ${ts()}`);
      return { content: raw, stage: "greeting", parts: [{ kind: "text", content: raw }], cardProductIds: [] };
    }

    // Saludo de retorno — adaptado al estado emocional
    console.log(`⚡ [FAST-TRACK] Saludo de retorno hardcodeado - ${ts()}`);
    const emocion = brain.emotionalState;
    const pre = emocion === "excited" ? `${voice.emojis.success} ¡Qué alegría verte de nuevo, *${customerName}*! 🔥`
              : emocion === "frustrated" ? `${voice.emojis.guarantee} Hola de nuevo, *${customerName}*. Veamos cómo resolverlo 🤝`
              : `${voice.emojis.success} ¡Qué gusto verte de nuevo, *${customerName}*! 🌟`;
    const raw = `${pre}\n\n${voice.phrases.greeting_return.replace(/^(¡Qué gusto verte de nuevo!|Bienvenido)/i, "").trim() || "¿En qué puedo ayudarte hoy?"}`;

    await saveAgentMessage(conversationId, raw, memory.currentStage, { intent: "greeting", isHardcoded: true });
    const totalTime = Date.now() - startTime;
    console.log(`🏁 [AGENT-END] Completado en ${totalTime}ms - ${ts()}`);
    return { content: raw, stage: memory.currentStage, parts: [{ kind: "text", content: raw }], cardProductIds: [] };
  }

  // ── 11b. DETALLE HARDCODEADO (duración, contenido, soporte) ─
  // Entrega/garantía/acceso requieren razonamiento contextual → van a IA
  if (brain.strategy === "hardcoded_detail") {
    const hcIntent = detectHardcodedIntent(lastText);
    const needsReasoning = hcIntent === "delivery" || hcIntent === "guarantee" || hcIntent === "access";
    if (!needsReasoning) {
      const hardcoded = tryHardcodedAnswer(
        lastText,
        decision.productToShow?.name || memory.currentProductName,
        voice
      );
      if (hardcoded) {
        console.log(`⚡ [FAST-TRACK] Respuesta hardcodeada para details_query - ${ts()}`);
        const raw = hardcoded.response;
        await saveAgentMessage(conversationId, raw, "details", {
          intent: hardcoded.intent,
          productId: decision.productToShow?.id || memory.currentProductId || undefined,
          productName: decision.productToShow?.name || memory.currentProductName || undefined,
          isHardcoded: true,
        });
        await persistStage(conversationId, "details");
        const totalTime = Date.now() - startTime;
        console.log(`🏁 [AGENT-END] Completado en ${totalTime}ms (hardcoded) - ${ts()}`);
        return {
          content: raw,
          stage: "details",
          parts: [{ kind: "text", content: raw }],
          cardProductIds: [],
        };
      }
    } else {
      console.log(`🧠 [BRAIN] ${hcIntent} requiere razonamiento → IA en vez de hardcode - ${ts()}`);
    }
  }

  // ── 11c. RUTA IA — construir prompt final con cerebro + contexto del motor ─
  const finalPrompt = buildFinalPrompt(systemPrompt, brain, voice) + `\n\n${engineContextBlock}`;

  // ── Construir mensajes para la IA ─────────────────────────────────────────
  const chatHistory = buildChatHistory(memory);
  const chatMessages = [
    ...chatHistory,
    {
      role: "system",
      content: finalPrompt,
    },
    ...(decision.shouldSendCard && decision.productToShow
      ? [{ role: "assistant", content: "" }]
      : []),
  ];

  console.log(`🤖 [AGENT-AI] Enviando a IA - mensajes:${chatMessages.length} prompt:${finalPrompt.length}chars - ${ts()}`);

  // ── Seleccionar modelo OpenCode según estrategia del cerebro ─────────────
  const OPENCODE_FREE_MODELS = {
    razonamiento: "opencode/qwen3.6-plus-free",
    balanceado: "opencode/deepseek-v4-flash-free",
    rapido: "opencode/nemotron-3-super-free",
  } as const;

  function selectOpenCodeModel(strategy: ResponseStrategy, emotional: EmotionalState): string {
    if (emotional === "frustrated" || emotional === "objecting") {
      console.log(`🎯 [MODEL-SELECT] Emoción ${emotional} → qwen3.6-plus-free (mejor razonamiento) - ${ts()}`);
      return OPENCODE_FREE_MODELS.razonamiento;
    }
    switch (strategy) {
      case "ai_objection_handle":
        return OPENCODE_FREE_MODELS.razonamiento;
      case "ai_payment_close":
      case "ai_farewell":
        return OPENCODE_FREE_MODELS.rapido;
      case "ai_product_details":
        return OPENCODE_FREE_MODELS.rapido;
      case "ai_general_response":
      case "ai_product_discovery":
      default:
        return OPENCODE_FREE_MODELS.balanceado;
    }
  }

  //   ── 12. Llamada a IA con rotación de proveedores ──────────────────────────
  const customerInfo = { name: convo.contactName, phone: convo.contactPhone };

  const result = await executeWithFallback(
    async () => {
      const dbConfig = appSettings ? getProviderConfigFromSettings(appSettings) : null;
      const activeProvider = appSettings?.aiProvider || "none";
      const isUserSelected = activeProvider !== "opencode" && activeProvider !== "none" && !!dbConfig;

      // ── Helper: pushear fallbacks disponibles ──
      const pushFallbacks = (queue: { config: any; source: string }[]) => {
        const copilotEnv = getProviderConfig("github_copilot_internal");
        const nvidiaEnv = getProviderConfig("nvidia");
        const githubEnv = getProviderConfig("github");
        const nvidiaFast = getProviderConfig("nvidia_fast");
        const ollamaConfig = getProviderConfig("ollama_local");
        if (activeProvider !== "nvidia" && nvidiaEnv && healthMonitor.isServiceHealthy("nvidia_70b"))
          queue.push({ config: nvidiaEnv, source: "nvidia_70b" });
        if (activeProvider !== "github_copilot_internal" && copilotEnv && healthMonitor.isServiceHealthy("copilot_internal"))
          queue.push({ config: copilotEnv, source: "copilot_internal" });
        if (activeProvider !== "github" && githubEnv && healthMonitor.isServiceHealthy("github_env"))
          queue.push({ config: githubEnv, source: "github_env" });
        if (activeProvider !== "nvidia" && nvidiaFast && healthMonitor.isServiceHealthy("nvidia_8b"))
          queue.push({ config: nvidiaFast, source: "nvidia_8b" });
        if (activeProvider !== "ollama_local" && ollamaConfig && healthMonitor.isServiceHealthy("ollama_local"))
          queue.push({ config: ollamaConfig, source: "ollama_local" });
      };

      // ── Helper: probar cola de proveedores ──
      const tryQueue = async (queue: { config: any; source: string }[]): Promise<{ raw: string; usedProvider: string }> => {
        for (const { config, source } of queue) {
          try {
            console.log(`🎯 [AI] Intentando proveedor: ${source} - ${ts()}`);
            if (config.baseUrl === "https://api.githubcopilot.com") {
              const isGithubPat = config.apiKey.startsWith("gho_") || config.apiKey.startsWith("ghp_") || config.apiKey.startsWith("ghu_");
              if (isGithubPat) {
                const { getCopilotSessionToken } = await import("./copilot");
                const session = await getCopilotSessionToken(config.apiKey);
                if (session) config.apiKey = session.token;
              }
            }
            const client = createAIClient(config);
            const completion = await retryWithBackoff(
              () => client.chat.completions.create({
                model: config.model,
                messages: chatMessages as any,
                temperature: 0.65,
                presence_penalty: 0.7,
                frequency_penalty: 0.5,
              }),
              { maxRetries: 1, baseDelay: 500 },
              `AI_${source}_conv_${conversationId}`
            );
            const result = completion.choices[0]?.message?.content?.trim() ?? "";
            if (result) {
              console.log(`✅ [AI] Respuesta de ${source} - ${result.length}chars - ${ts()}`);
              return { raw: result, usedProvider: source };
            }
          } catch (err: any) {
            console.log(`❌ [AI] ${source} falló: ${err.message} - ${ts()}`);
          }
        }
        return { raw: "", usedProvider: "unknown" };
      };

      // ── Fase 1: Cola inicial ──
      const rotationQueue: { config: any; source: string }[] = [];

      if (isUserSelected) {
        rotationQueue.push({ config: dbConfig, source: activeProvider });
        console.log(`🎯 [AI] Proveedor seleccionado: ${activeProvider} (exclusivo) - ${ts()}`);
      } else {
        const opencodeEnv = getProviderConfig("opencode");
        if (opencodeEnv) {
          opencodeEnv.model = selectOpenCodeModel(brain.strategy, brain.emotionalState);
          const modelName = opencodeEnv.model.replace("opencode/", "");
          rotationQueue.push({ config: opencodeEnv, source: `opencode/${modelName}` });
        }
        if (dbConfig && activeProvider !== "opencode")
          rotationQueue.push({ config: dbConfig, source: activeProvider });
        pushFallbacks(rotationQueue);
      }

      if (rotationQueue.length === 0) throw new Error("No hay proveedores de IA disponibles");

      let { raw, usedProvider } = await tryQueue(rotationQueue);

      // ── Fase 2: Si proveedor seleccionado falló → rotación inteligente ──
      if (!raw && isUserSelected) {
        console.log(`🔄 [ROTATION] ${activeProvider} falló — activando rotación inteligente - ${ts()}`);
        const fallbackQueue: { config: any; source: string }[] = [];
        const opencodeEnv = getProviderConfig("opencode");
        if (opencodeEnv) {
          opencodeEnv.model = selectOpenCodeModel(brain.strategy, brain.emotionalState);
          const modelName = opencodeEnv.model.replace("opencode/", "");
          fallbackQueue.push({ config: opencodeEnv, source: `opencode/${modelName}` });
        }
        pushFallbacks(fallbackQueue);
        if (fallbackQueue.length > 0) {
          const result = await tryQueue(fallbackQueue);
          raw = result.raw;
          usedProvider = result.usedProvider;
        }
      }

      if (!raw) throw new Error("Todos los proveedores fallaron");

      // ── Post-procesamiento ────────────────────────────────────────────────

      // 1. Sanitizar: eliminar URLs y datos de pago si no es payment_intent
      raw = sanitizeResponse(raw, decision.intent);

      // 2. Card: garantizar que la IA incluyó la card si el motor decidió mostrarla
      if (decision.shouldSendCard && decision.productToShow && !raw.toLowerCase().includes("[card:")) {
        console.log(`🔧 [POST] IA olvidó la card. Agregando [CARD: ${decision.productToShow.id}]`);
        raw = raw.trim() + `\n\n[CARD: ${decision.productToShow.id}]`;
      }

      // 3. Card: eliminar si el motor decidió NO mostrarla
      if (!decision.shouldSendCard && raw.match(/\[CARD:\s*\d+\s*\]/i)) {
        console.log(`🔧 [POST] Motor decidió no mostrar card. Eliminando.`);
        raw = raw.replace(/\[CARD:\s*\d+\s*\]/gi, "").trim();
      }

      // 4. Card: eliminar todo texto después de la card
      const cardMatch = raw.match(/\[CARD:\s*\d+\s*\]/i);
      if (cardMatch) {
        const cardEnd = raw.indexOf(cardMatch[0]) + cardMatch[0].length;
        const after = raw.substring(cardEnd).trim();
        if (after) {
          console.log(`🗑️ [POST] Eliminando texto después de card: "${after.substring(0, 60)}"`);
          raw = raw.substring(0, cardEnd);
        }
      }

      // 5. Decorar con la voz del negocio (firma visual)
      // Solo decorar si NO hay card (la card tiene su propio formato estricto)
      const hasCard = /\[CARD:\s*\d+\s*\]/i.test(raw);
      const isImportant = !hasCard && (brain.strategy === "ai_product_discovery" || brain.strategy === "ai_payment_close");
      raw = formatWithBrandVoice(raw, voice, {
        addSeparator: isImportant,
        addSignature: isImportant && voice.signature ? true : false,
        isImportant,
      });

      // ── Parser de partes ──────────────────────────────────────────────────
      const validIds = new Set(productList.map(p => p.id));
      const re = /\[CARD:\s*([\w-]+)\s*\]/gi;
      const parts: any[] = [];
      let lastIndex = 0;
      let cardCount = 0;
      let cardProductId: number | null = null;
      let m: RegExpExecArray | null;

      while ((m = re.exec(raw)) !== null) {
        // Texto antes de la card → solo incluir si NO hay card (se decide al final)
        const textBefore = raw.slice(lastIndex, m.index).trim();
        if (textBefore) parts.push({ kind: "text", content: textBefore, _beforeCard: true });

        const numId = Number(m[1]);
        const resolvedId = (!isNaN(numId) && validIds.has(numId))
          ? numId
          : (() => {
              const fallback = productList.find(p =>
                p.name.toLowerCase().split(" ").some(w => w.length > 3 && lastText.toLowerCase().includes(w))
              );
              if (fallback) {
                console.log(`🔧 [PARSER] ID inválido "${m![1]}" → ${fallback.id} (${fallback.name})`);
                return fallback.id;
              }
              return -1;
            })();

        if (resolvedId !== -1) {
          parts.push({ kind: "card", productId: resolvedId });
          cardProductId = resolvedId;
          cardCount++;
        }
        lastIndex = m.index + m[0].length;
      }

      // Texto después de la última card → descartar si hay cards
      const textAfter = raw.slice(lastIndex).trim();
      if (textAfter && cardCount === 0) {
        parts.push({ kind: "text", content: textAfter });
      }

      // Eliminar textos _beforeCard si hay cards
      const finalParts = cardCount > 0
        ? parts.filter((p: any) => !p._beforeCard)
        : parts.map((p: any) => { delete p._beforeCard; return p; });
      finalParts.forEach((p: any) => delete p._beforeCard);

      console.log(`📋 [PARSER] partes:${finalParts.length} cards:${cardCount} - ${ts()}`);

      // ── Guardar mensaje del agente en BD ──────────────────────────────────
      const agentMeta = {
        intent: decision.intent,
        aiProvider: usedProvider,
        cardSent: cardCount > 0,
        productId: cardProductId || decision.productToShow?.id,
        productName: cardProductId
          ? productList.find(p => p.id === cardProductId)?.name
          : decision.productToShow?.name,
        isHardcoded: false,
      };

      await saveAgentMessage(conversationId, raw, decision.stage, agentMeta);
      await persistStage(conversationId, decision.stage);

      const totalTime = Date.now() - startTime;
      console.log(`🏁 [AGENT-END] Completado en ${totalTime}ms proveedor:${usedProvider} - ${ts()}`);

      return {
        content: raw,
        stage: decision.stage,
        parts: finalParts,
        cardProductIds: finalParts.filter((p: any) => p.kind === "card").map((p: any) => p.productId),
      };
    },
    () => {
      console.log(`🆘 [FALLBACK] Usando respuesta de emergencia - ${ts()}`);
      const emo = brain.emotionalState;
      const fallbackText = emo === "frustrated"
        ? `${voice.emojis.guarantee} Disculpa los inconvenientes técnicos. Estoy reiniciando mis sistemas para atenderte mejor. ¿Puedes intentarlo de nuevo en un momento? 🙏`
        : emo === "excited"
        ? `${voice.emojis.greeting} ¡Perdona la demora! Estoy procesando tu solicitud. Dame solo un momento y te respondo al instante ⚡🙏`
        : `${voice.emojis.guarantee} Estoy teniendo problemas técnicos. Por favor intenta de nuevo en unos minutos. 🙏`;
      saveAgentMessage(conversationId, fallbackText, memory.currentStage, { intent: decision.intent, isHardcoded: true });
      return {
        content: fallbackText,
        stage: memory.currentStage,
        parts: [{ kind: "text", content: fallbackText }],
        cardProductIds: [],
      };
    },
    { conversationId, customerMessage: lastText, customerInfo }
  );

  return result;
}


export async function ensureBootstrapData() {
  // No tocamos nada aquí para no sobreescribir lo que ya hay
}

// Error Resilience Enhancement: Export system health monitoring functions
export function getAgentSystemHealth() {
  return getSystemHealthSummary();
}

export function checkAIProvidersStatus() {
  return {
    healthy: areAIProvidersHealthy(),
    timestamp: new Date()
  };
}

export function checkPaymentServicesStatus() {
  return {
    healthy: arePaymentServicesHealthy(),
    timestamp: new Date()
  };
}
