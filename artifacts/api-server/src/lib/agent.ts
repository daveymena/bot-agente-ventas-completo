// @ts-nocheck
import { eq, and, asc, desc, sql } from "drizzle-orm";
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
import {
  getOptimizedProviderOrder,
  reportProviderResult,
  getProviderTimeout,
  resetProviderRotation,
} from "./optimized-rotation";
import { getG4FResponse, initializeG4F } from "./providers/g4f-provider";
import { G4F_ENABLED } from "../config/g4f.config";
import { dbNow } from "./date-utils";

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
  const logTime = (label: string) => {
    const elapsed = Date.now() - startTime;
    console.log(`⏱️ [TIMING] ${label}: ${elapsed}ms - ${ts()}`);
  };
  
  console.log(`🔍 [AGENT-START] runAgentReply iniciado para conversación ${conversationId} - ${ts()}`);

  // ── 1. Cargar conversación ────────────────────────────────────────────────
  let t1 = Date.now();
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  logTime(`1. Cargar conversación: ${Date.now() - t1}ms`);
  
  if (!convo) {
    console.log(`❌ [AGENT-ERROR] Conversación ${conversationId} no encontrada - ${ts()}`);
    return null;
  }

  // ── 2. Cargar memoria estructurada desde BD (fuente única de verdad) ──────
  t1 = Date.now();
  const memory = await loadConversationMemory(conversationId);
  logTime(`2. Cargar memoria: ${Date.now() - t1}ms`);
  
  const lastText = memory.lastCustomerMessage;
  const customerName = convo.contactName || "cliente";

  console.log(`🧠 [ENGINE] Memoria cargada - hasGreeted:${memory.hasGreeted} stage:${memory.currentStage} product:${memory.currentProductName || "none"} sentCards:[${Array.from(memory.sentProductIds).join(",")}] isNewSession:${memory.isNewSession} - ${ts()}`);

  // ── 3. Seleccionar agente activo ──────────────────────────────────────────
  t1 = Date.now();
  const { getActiveAgent } = await import("./agent-router");
  const activeAgent = await getActiveAgent(lastText, conversationId, convo.tenantId);
  logTime(`3. Seleccionar agente: ${Date.now() - t1}ms`);
  
  if (!activeAgent) {
    console.log(`❌ [AGENT-ERROR] No hay agente activo configurado - ${ts()}`);
    return null;
  }
  console.log(`🤖 [AGENT-INFO] Agente activo: ${activeAgent.name} - ${ts()}`);

  // ── 4. Cargar productos y categorías (OPTIMIZADO - SELECTIVO) ─────────────
  t1 = Date.now();
  const [appSettings] = await db.select().from(settingsTable).limit(1);
  logTime(`4a. Cargar settings: ${Date.now() - t1}ms`);
  
    // Determinar si necesitamos productos basado en intención
    // Primero hacer un análisis rápido de intención sin cargar todo
    const needsProductsQuick = lastText.toLowerCase().match(/qué|producto|precio|comprar|pago|nequi|daviplata|transferencia|link|enlace|adquirir|compro|megapack|piano|curso|pack|suscripci|membres|idiomas|idioma/i);
  
    let productList: any[] = [];
    let categoryMap = new Map<number, string>();
    
    if (needsProductsQuick) {
      // Solo cargar si es probable que sea product_query o payment_intent
      t1 = Date.now();
      productList = await db.select().from(products)
        .where(eq(products.isActive, true))
        .limit(50); // Limitar a 50 productos más recientes
      logTime(`4b. Cargar productos: ${Date.now() - t1}ms`);
      
      // Si no hay productos activos, hacer fallback a todos los productos (para casos de datos de prueba)
      if (productList.length === 0) {
        productList = await db.select().from(products)
          .limit(50); // Fallback: cargar cualquier producto activo o no
        logTime(`4b. Fallback - Cargar todos los productos: ${Date.now() - t1}ms`);
      }
      
      t1 = Date.now();
      const allCategories = await db.select().from(productCategories);
      categoryMap = new Map(allCategories.map(c => [c.id, c.name.toLowerCase()]));
      logTime(`4c. Cargar categorías: ${Date.now() - t1}ms`);
      
      console.log(`📦 [AGENT-INFO] Productos cargados: ${productList.length} (selectivo) - ${ts()}`);
    } else {
      console.log(`📦 [AGENT-INFO] Productos omitidos (no necesarios) - ${ts()}`);
    }

  // ── 5. Motor de decisión ──────────────────────────────────────────────────
  t1 = Date.now();
  const decision = await computeDecision(memory, lastText, productList, categoryMap);
  logTime(`5. Motor de decisión: ${Date.now() - t1}ms`);
  
  console.log(`🎯 [ENGINE-DECISION] ${decision.debugReason} - ${ts()}`);

  // ── 6. Obtener la voz del negocio (ANTES de cualquier respuesta) ─────────
  t1 = Date.now();
  const voice = getBrandVoice(
    activeAgent.metadata as Record<string, any> | null,
    appSettings ? { businessName: appSettings.businessName } : null
  );
  logTime(`6. Obtener voz del negocio: ${Date.now() - t1}ms`);

  // ── 7. CEREBRO DE RAZONAMIENTO: analiza ANTES de cualquier camino ────────
  t1 = Date.now();
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
  logTime(`7. Análisis del cerebro: ${Date.now() - t1}ms`);
  
  console.log(`🧠 [BRAIN] estado:${brain.emotionalState} estrategia:${brain.strategy} — ${brain.strategyReason} - ${ts()}`);

  // ── 8. Construir catálogo COMPLETO para la IA (ella decide el producto) ──
  t1 = Date.now();
  let productsBlock = "";
  const needsFullCatalog = decision.intent !== "greeting" && decision.intent !== "leaving";
  
  if (productList.length > 0 && needsFullCatalog) {
    productsBlock = productList.map(p => {
      const features = (p.features as string[]) || [];
      const featStr = features.length > 0 ? ` | Características: ${features.join(", ")}` : "";
      const descStr = p.description ? ` | ${p.description.substring(0, 120)}` : "";
      return `[ID: ${p.id}] *${p.name}* — ${formatPrice(Number(p.price), p.currency)}${descStr}${featStr}`;
    }).join("\n\n");
    console.log(`📦 [CATALOG] Catálogo completo para IA: ${productList.length} productos - ${ts()}`);
  } else if (productList.length > 0) {
    productsBlock = productList.map(p => {
      return `[ID: ${p.id}] ${p.name} — ${formatPrice(Number(p.price), p.currency)}`;
    }).join("\n");
    console.log(`📦 [CATALOG] Catálogo básico para greeting/leaving: ${productList.length} productos`);
  } else {
    productsBlock = "[Catálogo disponible bajo demanda]";
    console.log(`📦 [CATALOG] Sin catálogo disponible`);
  }
  logTime(`8. Construir catálogo: ${Date.now() - t1}ms`);

  // ── 9. Construir prompt base del sistema ──────────────────────────────────
  const hasSentCardAlready = memory.sentProductIds.size > 0;
  const isPaymentIntent = (decision.intent === "payment_intent" || decision.intent === "confirmation");

  const systemPrompt = (activeAgent.systemPrompt || `Eres **${voice.agentName}**, ${voice.agentRole} de ${voice.businessName}.
Estás conversando con **${customerName}** en WhatsApp.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 IDENTIDAD Y PERSONALIDAD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Eres un asesor de ventas excepcionalmente inteligente y natural. Conversas como un ser humano real: cálido, empático, con sentido del humor cuando corresponde. NO eres un robot ni suenas automatizado.

• Escuchas activamente: entiendes el contexto completo de la conversación, no solo la última pregunta.
• Piensas antes de responder: analizas qué necesita realmente el cliente y respondes con precisión.
• Eres versátil: puedes hablar DE VENTAS (productos, precios, pagos) y también DE TEMAS GENERALES (el clima, tecnología, recomendaciones, actualidad). Si el cliente pregunta algo ajeno al negocio, responde de forma natural y luego retoma el hilo.
• Nunca inventas información que no esté en el catálogo o en el contexto proporcionado.
• Usas emojis de forma NATURAL (1-2 por mensaje, no más). Solo cuando aportan calidez.
• Tus respuestas son CONCISAS pero COMPLETAS. Ni te alargas ni eres demasiado cortante.
• REGLA ESTRICTA DE NO INTERROGAR: Nunca hagas preguntas al cliente pidiendo más detalles, ni terminando con "¿Qué tipo buscas?". Simplemente entrégale la información de las opciones o de las categorías y deja que el cliente sea quien decida y pregunte si le interesa.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DATOS DEL NEGOCIO — PROCESO COMPLETO DE ENTREGA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Método de entrega: ${voice.deliveryInfo.details}
• Acceso: ${voice.accessInfo.description}
• Garantía: ${voice.guaranteeInfo.description}

📌 PROCESO DE PAGO Y ENTREGA (explícale esto al cliente cuando pregunte):
• Opción 1 — Pago por LINK (MercadoPago o PayPal): El cliente paga con tarjeta, PSE o PayPal. El sistema DETECTA EL PAGO AUTOMÁTICAMENTE y le envía el link de Google Drive del producto directamente a este chat. No necesita hacer nada más.
• Opción 2 — Pago por CONSIGNACIÓN (Nequi/Daviplata/transferencia): El cliente transfiere al número indicado, luego ENVÍA LA CAPTURA O COMPROBANTE por este chat. El equipo verifica y envía el link de Google Drive. El cliente debe reenviar el comprobante aquí mismo.
• Importante: CADA PRODUCTO tiene su propio link de Google Drive configurado. Se envía automáticamente al confirmar el pago.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 CATÁLOGO DE PRODUCTOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${productList.length > 0 ? productsBlock : "No hay productos disponibles."}

⚠️ INSTRUCCIONES CRÍTICAS:
[1] NUNCA inventes productos, precios, características, promociones ni descuentos. Usa SOLO los datos del catálogo.
[2] NUNCA escribas links, URLs, números de cuenta, ni datos de pago. El sistema los adjunta automáticamente.
[3] NUNCA digas "te lo envío", "te mando el link", "te llega" ni prometas tiempos de entrega.
[4] Si el cliente pregunta algo FUERA del contexto del negocio (charla casual, opiniones, etc.), responde de forma natural y amable. Si es posible, redirige suavemente al tema de ventas.
[5] Si NO SABES algo, admítelo con honestidad. No improvises ni inventes.
[6] No repitas información que ya diste. Usa la MEMORIA de la conversación.
${isPaymentIntent ? "[7] ✅ El cliente quiere COMPRAR. Confirma brevemente y con entusiasmo. El sistema mostrará automáticamente la tarjeta con métodos de pago del producto que elijas." : `[7] 🧠 ANALIZA EL CONTEXTO de la conversación y elige el producto CORRECTO del catálogo. Usa [CARD: ID] al final de tu mensaje para mostrar la tarjeta del producto que mejor corresponda a lo que el cliente pregunta. Si no estás segura, pregunta más detalles antes de mostrar una card. NUNCA muestres un producto que no tenga relación con lo que el cliente busca.`}`).trim();

  // ── 9b. CONTEXTO DEL SISTEMA PARA EL ARQUITECTO ──────────────────────────
  const isArchitect = activeAgent.name.toLowerCase().includes("arquitecto") || 
    String((activeAgent.metadata as any)?.agentType || "").includes("architect");
  let architectSystemContext = "";
  if (isArchitect) {
    const agentsCount = (await db.select({ count: sql<number>`count(*)` }).from(agents)).at(0)?.count || 0;
    const productsAnalyzed = productList.length;
    const productsWithoutImage = productList.filter((p: any) => !p.imageUrl).length;
    const productCategories = [...new Set(productList.map((p: any) => p.category).filter(Boolean))];
    
    architectSystemContext = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CONTEXTO DEL SISTEMA (EN VIVO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Negocio: ${voice.businessName}
• Productos activos: ${productsAnalyzed}
• Productos sin imagen: ${productsWithoutImage}
• Categorías: ${productCategories.length > 0 ? productCategories.join(", ") : "Ninguna"}
• Agentes disponibles: ${agentsCount}
• Cliente actual: ${customerName}

🎯 TIENES PODER ABSOLUTO SOBRE EL CODIGO Y EL SISTEMA:

📂 MANIPULACION DE ARCHIVOS (POST /api/architect-tools/code)
  • /code/read — Leer cualquier archivo del proyecto
  • /code/write — Modificar o crear cualquier archivo
  • /code/delete — Eliminar archivos
  • /code/list — Explorar directorios
  • /code/search — Buscar en todo el codigo fuente
  • /code/analyze — Ver estructura completa del proyecto
  • /code/changes — Ver historial de cambios del arquitecto
  • /code/revert-change — Revertir cambios previos

🎨 FRONTEND (POST/GET /api/architect-tools/frontend)
  • /frontend/routes — Ver rutas del frontend
  • /frontend/add-route — Agregar nueva pagina al frontend
  • /frontend/add-nav-item — Agregar item al menu de navegacion

📦 PRODUCTOS (via /api/architect-tools)
  • GET /products — Listar productos
  • POST /products — Crear producto
  • PATCH /products/:id — Modificar producto
  • DELETE /products/:id — Eliminar producto
  • POST /improve-product/:id — Mejorar producto
  • POST /improve-all-products — Mejora masiva

🛠️ SERVICIOS (via /api/architect-tools)
  • GET /services — Listar servicios
  • POST /services — Crear servicio

🗄️ BASE DE DATOS Y SISTEMA
  • POST /query — SQL directo
  • POST /execute — Acciones del sistema
  • GET /system-config — Configuracion completa
  • GET /all-agents — Todos los agentes
  • GET /analyze-system — Analisis completo

🤖 AUTO-MODIFICACION
  • POST /update-architect-prompt — Modificar tu propio prompt
  • POST /update-system-config — Modificar config del negocio

Cuando el usuario te pida algo, USA estas herramientas directamente.
Si te dice "mejora el producto X", busca el ID y llama a la API.
Si te dice "crea una pagina nueva", usa /frontend/add-route.
Si te dice "cambia el codigo de X", usa /code/read + /code/write.
`;
  }

  // ── 10. INTEGRAR contexto del motor DENTRO del cerebro ────────────────────
  // El bloque de contexto del motor (engineContext) se inyecta como contexto adicional
  // para que el prompt final tenga TODA la información disponible
  // Pasar todos los productos a AdvancedIntelligence para mejor análisis contextual
  const aiProductContext = productList.length > 0 ? productList.slice(0, 10) : [];
  const engineContextBlock = `${architectSystemContext}${decision.contextBlock}\n\n${AdvancedIntelligence.generateIntelligentContext(
    lastText,
    memory.history,
    aiProductContext.length > 0 ? aiProductContext : null
  )}`;

  // ── 11. ATENDER SEGÚN ESTRATEGIA DEL CEREBRO ─────────────────────────────

  // ── 11a. SALUDO (si el cerebro decidió hardcoded_greeting) ────────────────
  if (brain.strategy === "hardcoded_greeting") {
    if (!memory.hasGreeted) {
      console.log(`⚡ [FAST-TRACK] Primer saludo hardcodeado - ${ts()}`);
      let greetingRaw = voice.phrases.greeting_new.replace(/\{name\}/g, customerName);
      
      // PARCHE DE SEGURIDAD: Evitar que el saludo inicial termine en pregunta
      greetingRaw = greetingRaw.replace(/¿[^?]*\?\s*😊/g, "Aquí estamos listos para mostrarte lo que tenemos para ti. 😊");
      greetingRaw = greetingRaw.replace(/¿[^?]*\?/g, "");

      let raw = customerName !== "cliente"
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

  // ── 11c. DESVÍO A HUMANO (respuesta hardcodeada) ─
  if (brain.strategy === "human_handoff") {
    console.log(`⚡ [FAST-TRACK] Respuesta hardcodeada para human_handoff - ${ts()}`);
    const hardcoded = tryHardcodedAnswer(
      lastText,
      decision.productToShow?.name || memory.currentProductName,
      voice
    );
    if (hardcoded && hardcoded.intent === "human_handoff") {
      const raw = hardcoded.response;
      await saveAgentMessage(conversationId, raw, "human_handoff", {
        intent: "human_handoff",
        isHardcoded: true,
      });
      await persistStage(conversationId, "human_handoff");
      const totalTime = Date.now() - startTime;
      console.log(`🏁 [AGENT-END] Completado en ${totalTime}ms (hardcoded human_handoff) - ${ts()}`);
      return {
        content: raw,
        stage: "human_handoff",
        parts: [{ kind: "text", content: raw }],
        cardProductIds: [],
      };
    }
    // Si no coincide con un patrón de human_handoff, caer en IA general
    console.log(`🧠 [BRAIN] No se encontró patrón de human_handoff, usando IA general`);
  }

  // ── 11c. RUTA IA — construir prompt final con cerebro + contexto del motor ─
  const finalPrompt = buildFinalPrompt(systemPrompt, brain, voice) + `\n\n${engineContextBlock}`;

  // ── Construir mensajes para la IA (OPTIMIZADO - HISTORIAL REDUCIDO) ──────
  // Solo últimos 2 mensajes para contexto (suficiente para entender conversación)
  const chatHistory = buildChatHistory(memory, 2); // últimos 2 mensajes (era 5)
  console.log(`💬 [CHAT-HISTORY] Usando últimos 2 mensajes (reducido de 5)`);
  const chatMessages = [
    ...chatHistory,
    {
      role: "system",
      content: finalPrompt,
    },
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
  
  const t12Start = Date.now();
  console.log(`⏱️ [TIMING] Iniciando llamada a IA - ${ts()}`);

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
        if (activeProvider !== "nvidia" && nvidiaEnv && healthMonitor.isServiceHealthy("nvidia_70b"))
          queue.push({ config: nvidiaEnv, source: "nvidia_70b" });
        if (activeProvider !== "github" && githubEnv && healthMonitor.isServiceHealthy("github_env"))
          queue.push({ config: githubEnv, source: "github_env" });
        if (activeProvider !== "github_copilot_internal" && copilotEnv && healthMonitor.isServiceHealthy("copilot_internal"))
          queue.push({ config: copilotEnv, source: "copilot_internal" });
        if (activeProvider !== "nvidia" && nvidiaFast && healthMonitor.isServiceHealthy("nvidia_8b"))
          queue.push({ config: nvidiaFast, source: "nvidia_8b" });
      };

      // ── Helper: probar cola de proveedores ──
      const tryQueue = async (queue: { config: any; source: string }[]): Promise<{ raw: string; usedProvider: string }> => {
        for (const { config, source } of queue) {
          // G4F: manejo especial (no usa OpenAI client)
          if (source === "g4f") {
            if (!G4F_ENABLED) continue;
            console.log(`🆘 [G4F] Intentando G4F con 111+ proveedores - ${ts()}`);
            const g4fResponse = await getG4FResponse(
              chatMessages.map((m: any) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
              process.env.G4F_MODEL || "gpt-4-turbo"
            );
            if (g4fResponse?.content) {
              console.log(`✅ [G4F] Respuesta obtenida: ${g4fResponse.content.length}chars - ${ts()}`);
              return { raw: g4fResponse.content, usedProvider: "g4f" };
            }
            console.log(`❌ [G4F] No se obtuvo respuesta - ${ts()}`);
            continue;
          }

          const providerName = source.split("/")[0].split("_")[0];
          const timeout = getProviderTimeout(providerName);
          const startTime = Date.now();
          try {
            console.log(`🎯 [AI] Intentando proveedor: ${source} (timeout: ${timeout}ms) - ${ts()}`);
            if (config.baseUrl === "https://api.githubcopilot.com") {
              const { getCopilotSessionToken } = await import("./copilot");
              let session = await getCopilotSessionToken(config.apiKey);
              if (!session && process.env.GITHUB_TOKEN) {
                session = await getCopilotSessionToken(process.env.GITHUB_TOKEN);
              }
              if (session) config.apiKey = session.token;
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
              { maxRetries: 0, baseDelay: 500 },
              `AI_${source}_conv_${conversationId}`
            );
            const result = completion.choices[0]?.message?.content?.trim() ?? "";
            if (result) {
              const elapsed = Date.now() - startTime;
              reportProviderResult(providerName, true, elapsed);
              console.log(`✅ [AI] Respuesta de ${source} - ${result.length}chars (${elapsed}ms) - ${ts()}`);
              return { raw: result, usedProvider: source };
            }
          } catch (err: any) {
            const elapsed = Date.now() - startTime;
            reportProviderResult(providerName, false, undefined, err.message);
            console.log(`❌ [AI] ${source} falló en ${elapsed}ms: ${err.message} - ${ts()}`);
          }
        }
        return { raw: "", usedProvider: "unknown" };
      };

      // ── Helper: G4F como último respaldo ──
      const tryG4FFallback = async (): Promise<string> => {
        if (!G4F_ENABLED) return "";
        console.log(`🆘 [G4F] Último respaldo — intentando G4F con 111+ proveedores - ${ts()}`);
        const g4fResponse = await getG4FResponse(
          chatMessages.map((m: any) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
          process.env.G4F_MODEL || "gpt-4-turbo"
        );
        if (g4fResponse?.content) {
          console.log(`✅ [G4F] Respuesta obtenida: ${g4fResponse.content.length}chars - ${ts()}`);
          return g4fResponse.content;
        }
        return "";
      };

      // ── Fase 1: Cola inicial con orden optimizado ──
      const rotationQueue: { config: any; source: string }[] = [];

      if (activeProvider === "g4f") {
        console.log(`🎯 [AI] G4F seleccionado como proveedor principal - ${ts()}`);
        // G4F se maneja por separado (no usa OpenAI client), se prueba primero
      } else if (isUserSelected) {
        rotationQueue.push({ config: dbConfig, source: activeProvider });
        console.log(`🎯 [AI] Proveedor seleccionado: ${activeProvider} (exclusivo) - ${ts()}`);
      } else {
        const optimizedOrder = getOptimizedProviderOrder();
        console.log(`🎯 [AI] Orden optimizado: [${optimizedOrder.join(", ")}] - ${ts()}`);

        for (const prov of optimizedOrder) {
          if (prov === "g4f") continue; // G4F va al final
          if (prov === "opencode") {
            const opencodeEnv = getProviderConfig("opencode");
            if (opencodeEnv) {
              opencodeEnv.model = selectOpenCodeModel(brain.strategy, brain.emotionalState);
              const modelName = opencodeEnv.model.replace("opencode/", "");
              rotationQueue.push({ config: opencodeEnv, source: `opencode/${modelName}` });
            }
          } else if (prov === "nvidia_nim_bridge") {
            const cfg = getProviderConfig("nvidia_nim_bridge");
            if (cfg)
              rotationQueue.push({ config: cfg, source: "nvidia_nim_bridge" });
          } else if (prov === "nvidia") {
            const cfg = getProviderConfig("nvidia");
            if (cfg && healthMonitor.isServiceHealthy("nvidia_70b"))
              rotationQueue.push({ config: cfg, source: "nvidia_70b" });
          } else if (prov === "github") {
            const cfg = getProviderConfig("github");
            if (cfg && healthMonitor.isServiceHealthy("github_env"))
              rotationQueue.push({ config: cfg, source: "github_env" });
          }
        }
        if (dbConfig && activeProvider !== "opencode")
          rotationQueue.push({ config: dbConfig, source: activeProvider });
        pushFallbacks(rotationQueue);
      }

      if (rotationQueue.length === 0) {
        console.log(`🔄 [RESET] Queue vacío — reseteando cooldowns y usando G4F - ${ts()}`);
        resetProviderRotation();
      }

      let { raw, usedProvider } = rotationQueue.length > 0
        ? await tryQueue(rotationQueue)
        : { raw: "", usedProvider: "unknown" };

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

      // ── Fase 3: G4F como último respaldo ──
      if (!raw) {
        console.log(`🔄 [G4F-FALLBACK] Todos los proveedores fallaron — usando G4F - ${ts()}`);
        const g4fContent = await tryG4FFallback();
        if (g4fContent) {
          raw = g4fContent;
          usedProvider = "g4f";
        }
      }

      if (!raw) throw new Error("Todos los proveedores fallaron");

      // ── Post-procesamiento ────────────────────────────────────────────────

      // 1. Sanitizar: eliminar URLs y datos de pago si no es payment_intent
      raw = sanitizeResponse(raw, decision.intent);

      // 2a. Payment/Confirmation: FORZAR card con métodos de pago (requisito crítico)
      const isPaymentFlow = (decision.intent === "payment_intent" || decision.intent === "confirmation");
      if (isPaymentFlow && decision.shouldSendCard && decision.productToShow) {
        const hasCardMarker = raw.includes("[CARD:");
        raw = hasCardMarker ? raw : `${raw}\n\n[CARD: ${decision.productToShow.id}]`;
        console.log(`🔧 [POST] Payment flow: card asegurada para ${decision.productToShow.id} - ${ts()}`);
      }

      // 2b. Para intents NO payment: la IA decide autónomamente si incluir [CARD: ID] o no.
      // El system prompt ya le indica que puede usar [CARD: ID] si es natural.
      // No forzamos ni eliminamos cards — confiamos en el criterio de la IA.

      // 3. Solo eliminar cards en intents donde claramente no corresponde (saludo, despedida, humano)
      if ((decision.intent === "greeting" || decision.intent === "leaving" || decision.intent === "human_handoff") && raw.match(/\[CARD:\s*\d+\s*\]/i)) {
        console.log(`🔧 [POST] Intent=${decision.intent} no requiere card. Eliminando.`);
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
        let resolvedId = -1;

        // ── VALIDACIÓN ESTRICTA DE PRODUCTO ──────────────────────────────────
        // 1. Si el ID es válido, usarlo directamente
        if (!isNaN(numId) && validIds.has(numId)) {
          resolvedId = numId;
          console.log(`✅ [PARSER] ID válido: ${numId} (${productList.find(p => p.id === numId)?.name})`);
        }
        // 2. Si el ID es inválido, usar SOLO el productToShow de decision (no fallback)
        else if (decision.productToShow && validIds.has(decision.productToShow.id)) {
          resolvedId = decision.productToShow.id;
          console.log(`🔧 [PARSER] ID inválido "${m![1]}" → usando productToShow: ${decision.productToShow.id} (${decision.productToShow.name})`);
        }
        // 3. Si no hay productToShow, rechazar la card
        else {
          console.log(`❌ [PARSER] ID inválido "${m![1]}" y sin productToShow válido. Card rechazada.`);
          resolvedId = -1;
        }

        if (resolvedId !== -1) {
          const isPaymentFlow = (decision.intent === "payment_intent" || decision.intent === "confirmation");
          parts.push({ kind: "card", productId: resolvedId, paymentOnly: isPaymentFlow });
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

      // Limpiar flag interno _beforeCard
      const finalParts = parts.map((p: any) => { delete p._beforeCard; return p; });

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

      // ── 11c. PROCESAR CONFIRMACIÓN DE PAGO ───────────────────────────────────
      // Si el cliente acaba de confirmar la compra y hay producto en contexto,
      // registramos el pago como pendiente y enviamos notificación a la empresa.
      if (decision.intent === "confirmation" && decision.productToShow) {
        try {
          const pId = decision.productToShow.id;
          const pName = decision.productToShow.name;
          const pPrice = decision.productToShow.price;
          
          // ⚠️ VALIDACIÓN CRÍTICA: Asegurar que el producto en pago sea el correcto
          // Verificar que el productId en la tarjeta coincida con el productToShow
          const cardProductIds = finalParts.filter((p: any) => p.kind === "card").map((p: any) => p.productId);
          if (cardProductIds.length > 0 && !cardProductIds.includes(pId)) {
            console.log(`❌ [PAYMENT-VALIDATION] MISMATCH: Producto en pago (${pId}) no coincide con tarjeta (${cardProductIds.join(",")})`);
            // Usar el producto de la tarjeta como fuente de verdad
            const correctProduct = productList.find(p => cardProductIds.includes(p.id));
            if (correctProduct) {
              console.log(`🔧 [PAYMENT-VALIDATION] Corrigiendo a producto correcto: ${correctProduct.name} (ID: ${correctProduct.id})`);
            }
          }
          
          const [customer] = await db.select().from(conversations)
            .where(eq(conversations.id, conversationId)).limit(1);

          // Intentar obtener email del lead asociado
          let customerEmail = 'sin_email';
          if (customer?.leadId) {
            const [leadRecord] = await db.select({ email: leads.email }).from(leads).where(eq(leads.id, customer.leadId)).limit(1);
            if (leadRecord?.email) customerEmail = leadRecord.email;
          }

          await processPurchaseConfirmation({
            conversationId,
            productId: pId,
            productName: pName,
            price: pPrice,
            paymentMethod: memory.paymentMethod || 'no_especificado',
            customerId: customer?.contactPhone || 'desconocido',
            customerEmail,
            customerPhone: customer?.contactPhone || 'sin_telefono',
            timestamp: new Date().toISOString(),
          });
          // Marcar conversación como estado pagado
          await db.update(conversations)
            .set({ paymentStatus: 'pending', paymentMethod: memory.paymentMethod || null, paymentAmount: pPrice })
            .where(eq(conversations.id, conversationId));
        } catch (e) {
          console.log(`⚠️ No se pudo procesar confirmación de pago: ${(e as Error).message}`);
        }
      }

      // Persistir productos en el contexto de la conversación
      // El sistema actualiza lastMessage de todas formas
      await db.update(conversations)
        .set({
          lastMessage: raw.substring(0, 200),
          lastMessageAt: dbNow(),
          currentProductId: agentMeta.productId ?? null,
          currentProductName: agentMeta.productName ?? null,
        })
        .where(eq(conversations.id, conversationId));

      const totalTime = Date.now() - startTime;
      const aiTime = Date.now() - t12Start;
      console.log(`⏱️ [TIMING] Llamada a IA: ${aiTime}ms`);
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
    timestamp: new Date().toISOString()
  };
}

export function checkPaymentServicesStatus() {
  return {
    healthy: arePaymentServicesHealthy(),
    timestamp: new Date().toISOString()
  };
}
