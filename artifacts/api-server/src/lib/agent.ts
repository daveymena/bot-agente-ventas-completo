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
import { getProviderConfig, getProviderRotation, getProviderConfigFromSettings, createAIClient, getOpenCodeRotation, getOpenCodeGoRotation } from "@workspace/integrations-openai-ai-server";
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
import { getBusinessContext, renderBloqueNegocio, resumenContexto } from "./business-context";
import { analyzeBrain, buildFinalPrompt, type ResponseStrategy, type EmotionalState } from "./response-brain";
import { learnFromLastExchange, retrieveLessons, formatLessonsForPrompt } from "./conversation-learning";
import {
  isPaymentConfirmation,
  isPaymentMethodQuestion,
  isProductDetailsQuestion,
  getPaymentMethodResponse,
  getConfirmationResponse
} from "./payment-confirmation";
import { sendPurchaseEvent } from "./meta-conversions-api";
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
import { tenantManager } from "./tenantManager";
import { variante, varianteDistintaDe } from "./variacion";

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

/**
 * ¿Esto es un nombre de persona, o el telefono disfrazado?
 *
 * WhatsApp no siempre manda el pushName, y el sistema caia al numero como
 * nombre. Resultado, visto con un cliente que llego de un ANUNCIO PAGO:
 *   "¡Hola 51908825398:0! 👋 Bienvenido a TecnoVariedades"
 *
 * Un saludo asi quema el lead en el primer mensaje. Ante la duda es mejor
 * saludar sin nombre: "¡Hola! 👋" es neutro y correcto, decirle el numero no.
 */
function esNombreReal(n: string | null | undefined): boolean {
  const v = String(n || "").trim();
  if (!v || v.length < 2 || v.toLowerCase() === "cliente") return false;
  // Mayoria de digitos, o con el sufijo de dispositivo de un JID: es telefono.
  const digitos = (v.match(/\d/g) || []).length;
  if (digitos >= 6 || digitos > v.length / 2 || /^\+?\d[\d\s:-]*$/.test(v)) return false;
  return true;
}

/**
 * El anuncio del que llego el cliente, leido del ultimo mensaje suyo.
 *
 * Cuando alguien hace clic en un anuncio de Facebook/Instagram, Meta
 * autocompleta el mensaje con un texto identico para TODOS los anuncios
 * ("Hola! Quiero mas informacion"), y adjunta aparte el titular y el link del
 * anuncio real. O sea: el texto no dice nada y el dato que si dice a que le
 * hizo clic viaja en la metadata. Si se ignora, el cliente que costo dinero
 * traer recibe un "que estas buscando?" -- justo lo que el ya habia dicho al
 * hacer clic.
 */
function anuncioDeOrigen(history: Array<{ role: string; metadata?: any }>) {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.role !== "customer") continue;
    const md = m.metadata || {};
    if (md.adTitle || md.adBody || md.adUrl || md.adId) {
      return {
        titulo: String(md.adTitle || ""),
        cuerpo: String(md.adBody || ""),
        url: String(md.adUrl || ""),
        anuncioId: String(md.adId || ""),
      };
    }
    return null; // solo interesa el mensaje actual, no anuncios de hace dias
  }
  return null;
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

  // ── Límite del plan contratado ────────────────────────────────────────────
  // AGUJERO REAL cerrado el 2026-08-12: el límite mensual de mensajes existía
  // solo como middleware HTTP, pero los mensajes de WhatsApp entran por el
  // socket de Baileys y NUNCA pasan por una ruta HTTP -- así que el bot
  // respondía sin límite alguno. Un cliente del plan más barato podía generar
  // decenas de miles de respuestas con IA que paga el dueño de la plataforma,
  // sin ningún tope. Es fuga de dinero directa, no un detalle de producto.
  //
  // Este es el punto ÚNICO por donde pasan todas las respuestas del agente
  // (WhatsApp, Messenger y comentarios de Facebook), así que el candado va
  // acá y cubre todos los canales de una.
  if (convo.tenantId) {
    try {
      const { checkMessageLimit } = await import("../middleware/featureLimits");
      const { tenantManager } = await import("./tenantManager");
      const tenant = await tenantManager.getTenantById(convo.tenantId);
      const plan = (tenant as any)?.plan || (tenant as any)?.subscriptionPlan || "basic";
      const limite = await checkMessageLimit(convo.tenantId, plan);
      if (!limite.allowed) {
        logger.warn(
          { tenantId: convo.tenantId, plan, usados: limite.current, tope: limite.limit },
          "[Agent] Límite mensual del plan alcanzado -- no se genera respuesta con IA",
        );
        // Se devuelve null (no responde) en vez de lanzar: el mensaje del
        // cliente igual queda guardado, y el dueño del negocio ve el aviso en
        // su panel. Contestarle al cliente final "tu plan se acabó" sería
        // exponerle al comprador un problema comercial que no es suyo.
        return null;
      }
    } catch (e: any) {
      // Ante un fallo del chequeo NO se bloquea la respuesta: dejar mudo al
      // bot de un cliente que sí pagó es peor que dejar pasar algunos
      // mensajes de más.
      logger.warn({ err: e?.message, tenantId: convo.tenantId }, "[Agent] No se pudo verificar el límite del plan; se responde igual");
    }
  }

  // ── 2. Cargar memoria estructurada desde BD (fuente única de verdad) ──────
  t1 = Date.now();
  const memory = await loadConversationMemory(conversationId);
  logTime(`2. Cargar memoria: ${Date.now() - t1}ms`);
  
  const lastText = memory.lastCustomerMessage;
  const customerName = convo.contactName || "cliente";

  // ¿Llegó de un anuncio? El titular del anuncio dice qué producto vino a
  // buscar; el texto que escribió no (Meta lo autocompleta igual para todos).
  // Se usa SOLO para decidir producto y etapa: para hablarle se sigue usando
  // lo que el cliente realmente escribió.
  const anuncio = anuncioDeOrigen(memory.history as any);
  const textoParaDecidir = anuncio
    ? `${lastText} ${anuncio.titulo} ${anuncio.cuerpo}`.trim()
    : lastText;
  if (anuncio) {
    console.log(`📣 [ANUNCIO] Cliente llegó del anuncio "${anuncio.titulo}" (${anuncio.url || "sin link"})`);
  }

  console.log(`🧠 [ENGINE] Memoria cargada - hasGreeted:${memory.hasGreeted} stage:${memory.currentStage} product:${memory.currentProductName || "none"} sentCards:[${Array.from(memory.sentProductIds).join(",")}] isNewSession:${memory.isNewSession} - ${ts()}`);

  // Puntuación de lead + seguimiento inteligente automático (leadScoring.ts /
  // followUpScheduler.ts). Estaba completamente construido pero NUNCA se
  // llamaba desde el flujo real de WhatsApp -- el único import que existía
  // era en whatsapp.ts (la clase base), pero ninguna llamada real lo
  // invocaba en ningún lado del código (confirmado: cero resultados al
  // buscar "processMessageForLeadScoring(" en todo el repo salvo su propia
  // definición). Por eso `follow_ups` seguía en 0 filas aunque ya había
  // conversaciones reales. Fire-and-forget: no debe bloquear ni retrasar la
  // respuesta real al cliente, y processMessageForScoring ya atrapa sus
  // propios errores internamente (documentado como "no crítico").
  if (lastText) {
    import("./leadScoring")
      .then(({ processMessageForLeadScoring }) => processMessageForLeadScoring(conversationId, lastText))
      .catch((err) => console.error(`⚠️ [LEAD-SCORING] Error en scoring/follow-up para conversación ${conversationId}:`, err?.message || err));
  }

  // ── 2b. APRENDIZAJE: evaluar el intercambio anterior y adaptar ─────────────
  // El agente NO es un bot de respuestas: aprende de cada turno. Si la
  // respuesta anterior falló (el cliente repitió la pregunta, se confundió,
  // se frustró o se fue), se guarda la lección en la memoria del negocio y
  // se usa en el prompt de ESTA respuesta para no repetir el error.
  // Fire-and-forget controlado: nunca bloquea ni retrasa la respuesta.
  if (convo.tenantId && lastText && memory.lastAgentMessage) {
    const msgClienteAnterior =
      [...memory.history].reverse().find((m) => m.role === "customer" && m.content !== lastText)?.content ?? null;

    import("./conversation-learning")
      .then(({ learnFromLastExchange }) =>
        learnFromLastExchange({
          tenantId: convo.tenantId!,
          customerMsg: lastText,
          prevCustomerMsg: msgClienteAnterior,
          agentReply: memory.lastAgentMessage,
          productName: memory.currentProductName,
          intent: detectIntent(lastText),
        }),
      )
      .catch((err) => console.error(`⚠️ [LEARNING] Error evaluando intercambio para conversación ${conversationId}:`, err?.message || err));
  }

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
  
    // ¿Necesitamos cargar el catálogo? Cargamos SIEMPRE excepto en un saludo
    // puro (solo "hola"/"buenas"), porque un cliente puede preguntar por un
    // producto nombrándolo directamente ("photoshop tienes?", "curso de excel")
    // sin usar ninguna palabra genérica como "producto" o "precio". Antes un
    // regex estrecho no cargaba el catálogo en esos casos y la IA inventaba
    // IDs de producto inexistentes → la card se rechazaba y no se mostraba.
    // Cargar el catálogo cuesta ~6ms (son pocos productos), así que es barato.
    const isPureGreeting = /^\s*(hola+|buenas?|buenos?\s*d[ií]as?|buenas?\s*tardes?|buenas?\s*noches?|hey|hi|holi+|ola+|q(ue)?\s*tal|saludos)[\s!.,]*$/i.test(lastText.trim());
    const shouldLoadProducts = !isPureGreeting || memory.hasGreeted;

    let productList: any[] = [];
    let categoryMap = new Map<number, string>();

    if (shouldLoadProducts) {
      // Cargar el catálogo. Límite amplio (200): con el catálogo COMPACTO el
      // costo en prompt es bajo y así la IA ve TODOS los IDs válidos — antes,
      // con límite 50 sobre 81 productos, si el cliente preguntaba por uno de
      // los otros 31 su ID no estaba disponible y la card se rechazaba.
      t1 = Date.now();
      // eq(products.tenantId, ...): sin esto, el catálogo que ve la IA
      // mezclaba productos de TODOS los tenants -- con un solo tenant real
      // activo no se notaba, pero en cuanto exista un segundo con productos
      // propios, el agente de un negocio le ofrecería productos ajenos.
      productList = await db.select().from(products)
        .where(and(eq(products.isActive, true), eq(products.tenantId, convo.tenantId)))
        .limit(200);
      logTime(`4b. Cargar productos: ${Date.now() - t1}ms`);

      // ── Cada agente ve SOLO los productos de su especialidad ──────────────
      //
      // Un curso digital y una rodillera térmica no se venden igual: el
      // digital se entrega con un link al instante, el físico necesita
      // dirección, cédula y transportadora. Mezclarlos en un mismo catálogo
      // hace que el agente de digitales prometa envíos y el de físicos
      // ofrezca "acceso de por vida".
      //
      // `especialidad` vacía = agente general, ve todo (compatibilidad con
      // los negocios que tienen un solo agente para ambas cosas).
      const especialidad = String((activeAgent as any).especialidad || "").toLowerCase();
      if (especialidad === "digital" || especialidad === "dropshipping") {
        const tipoQueVende = especialidad === "digital" ? "digital" : "physical";
        const antes = productList.length;
        const filtrado = productList.filter((p: any) => (p.kind || "digital") === tipoQueVende);
        // Si el filtro deja el catálogo vacío, el negocio no tiene productos
        // de ese tipo: se deja el catálogo completo antes que dejar al agente
        // sin nada que ofrecer.
        if (filtrado.length > 0) {
          productList = filtrado;
          console.log(`🎯 [ESPECIALIDAD] ${activeAgent.name} vende ${especialidad}: ${filtrado.length} de ${antes} productos - ${ts()}`);
        } else {
          console.log(`⚠️ [ESPECIALIDAD] ${activeAgent.name} es de ${especialidad} pero no hay productos de ese tipo; se deja el catálogo completo`);
        }
      }

      // Si no hay productos activos, fallback a todos los del tenant (p.ej. datos de prueba)
      if (productList.length === 0) {
        productList = await db.select().from(products)
          .where(eq(products.tenantId, convo.tenantId))
          .limit(200);
        logTime(`4b. Fallback - Cargar todos los productos: ${Date.now() - t1}ms`);
      }
      
      t1 = Date.now();
      const allCategories = await db.select().from(productCategories).where(eq(productCategories.tenantId, convo.tenantId));
      categoryMap = new Map(allCategories.map(c => [c.id, c.name.toLowerCase()]));
      logTime(`4c. Cargar categorías: ${Date.now() - t1}ms`);
      
      console.log(`📦 [AGENT-INFO] Productos cargados: ${productList.length} (selectivo) - ${ts()}`);
    } else {
      console.log(`📦 [AGENT-INFO] Productos omitidos (no necesarios) - ${ts()}`);
    }

  // ── 5. Motor de decisión ──────────────────────────────────────────────────
  // El link del anuncio suele apuntar al producto exacto (/p/123 o
  // /producto/123). Eso es un dato duro, no una adivinanza sobre el titular:
  // si resuelve, se le suma el nombre real del producto al texto con el que
  // decide el motor, para que no se equivoque de curso.
  let textoDecision = textoParaDecidir;
  const idEnLink = Number(String(anuncio?.url || "").match(/\/(?:p|producto|product)\/(\d+)/)?.[1] || 0);
  if (idEnLink) {
    const delAnuncio = productList.find((p: any) => p.id === idEnLink);
    if (delAnuncio) {
      textoDecision = `${textoParaDecidir} ${delAnuncio.name}`;
      console.log(`📣 [ANUNCIO] Link resuelto al producto #${idEnLink} "${delAnuncio.name}"`);
    }
  }

  // ── 4b. El negocio REAL de este cliente ───────────────────────────────────
  // Tiene que resolverse ANTES del motor de decisión, porque el bloque de
  // contexto que arma computeDecision es justo donde antes estaban escritos a
  // mano el nombre ("Sofía, de TecnoVariedades") y los datos de entrega,
  // acceso y garantía. Cacheado 60s por tenant, así que no agrega consultas
  // por mensaje. Si falla, devuelve un contexto vacío: el agente deja de
  // afirmar esos datos en vez de inventarlos.
  t1 = Date.now();
  const negocio = await getBusinessContext(convo.tenantId);
  logTime(`4b. Contexto de negocio: ${Date.now() - t1}ms`);
  console.log(`🏢 [NEGOCIO] ${resumenContexto(negocio)} - ${ts()}`);

  t1 = Date.now();
  const decision = await computeDecision(memory, textoDecision, productList, categoryMap, negocio);
  logTime(`5. Motor de decisión: ${Date.now() - t1}ms`);
  
  console.log(`🎯 [ENGINE-DECISION] ${decision.debugReason} - ${ts()}`);

  // ── 6. Obtener la voz del negocio (ANTES de cualquier respuesta) ─────────
  t1 = Date.now();
  // `settings` es una tabla GLOBAL (una sola fila para toda la plataforma,
  // no tiene tenant_id) -- antes SOLO se usaba esa fila para el nombre del
  // negocio, así que todos los tenants mostraban el mismo businessName. Se
  // trae el tenant real dueño de esta conversación y se usa su brandName/
  // agentName reales (los que configura en el dashboard) por encima del
  // default global o el preset hardcodeado de getBrandVoice().
  const realTenant = await tenantManager.getTenantById(convo.tenantId);
  const voice = getBrandVoice(
    activeAgent.metadata as Record<string, any> | null,
    { businessName: realTenant?.brandName || appSettings?.businessName }
  );
  if (realTenant?.brandName) voice.businessName = realTenant.brandName;
  if (realTenant?.agentName) voice.agentName = realTenant.agentName;
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

  // ── 8. Construir catálogo para la IA ──────────────────────────────────────
  // COMPACTO por diseño: una línea por producto (ID | nombre | precio | cat).
  // Así la IA SIEMPRE tiene la lista completa de IDs válidos para elegir la
  // card correcta, sin inflar el prompt. Antes se volcaban 50 productos con
  // descripciones de 120 chars → ~19.500 chars → respuestas de hasta 57s y
  // límites de tokens. La descripción completa se incluye SOLO del producto
  // que se está discutiendo (el relevante), no de todo el catálogo.
  t1 = Date.now();
  let productsBlock = "";
  const needsCatalog = decision.intent !== "greeting" && decision.intent !== "leaving";

  if (productList.length > 0 && needsCatalog) {
    // Producto en foco: el que la decisión eligió o el último con card enviada
    const focusId = decision.productToShow?.id ?? memory.currentProductId ?? null;

    // Limitar catálogo a 20 productos para no exceder tokens de proveedores free-tier.
    // El producto en foco siempre se incluye; el resto se llena desde el inicio de la lista.
    const MAX_CATALOG = 10;
    let catalogSlice = productList;
    if (productList.length > MAX_CATALOG) {
      const focusProduct = focusId ? productList.find(p => p.id === focusId) : null;
      catalogSlice = productList.slice(0, MAX_CATALOG);
      if (focusProduct && !catalogSlice.find(p => p.id === focusProduct.id)) {
        catalogSlice[MAX_CATALOG - 1] = focusProduct;
      }
    }

    const compact = catalogSlice.map(p => {
      const cat = categoryMap.get(p.categoryId) || p.category || "";
      const catStr = cat ? ` (${cat})` : "";
      return `[ID: ${p.id}] ${p.name} — ${formatPrice(Number(p.price), p.currency)}${catStr}`;
    }).join("\n");

    // Detalle ampliado solo del producto en foco (si existe)
    let focusDetail = "";
    const focus = focusId ? productList.find(p => p.id === focusId) : null;
    if (focus) {
      const features = (focus.features as string[]) || [];
      const featStr = features.length > 0 ? `\nCaracterísticas: ${features.join(", ")}` : "";
      const descStr = focus.description ? `\n${focus.description.substring(0, 300)}` : "";
      focusDetail = `\n\nPRODUCTO EN FOCO:\n[ID: ${focus.id}] *${focus.name}* — ${formatPrice(Number(focus.price), focus.currency)}${descStr}${featStr}`;
    }

    productsBlock = compact + focusDetail;
    console.log(`📦 [CATALOG] Catálogo compacto para IA: ${catalogSlice.length} productos (de ${productList.length} totales)${focus ? ` (foco: ${focus.name})` : ""} - ${ts()}`);
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
Eres un VENDEDOR PROFESIONAL experto: cálido y humano, pero con foco claro en CERRAR la venta. Guías al cliente con seguridad hacia la compra sin presionar. NO eres un robot ni suenas automatizado.

• Escuchas activamente: entiendes TODO el contexto, no solo la última pregunta. Detectas qué necesita realmente el cliente.
• Vendes por VALOR, no por presión: conectas el producto con el beneficio real para el cliente (qué logrará, qué problema resuelve), no solo listas características.
• Precisión total: das datos exactos (precio, qué incluye, cómo se entrega). Nunca inventas productos, precios ni promesas. Los datos del bloque "EL NEGOCIO PARA EL QUE TRABAJÁS" y del catálogo los respondes con total seguridad. Lo que NO esté ahí, no lo sabes: lo dices con naturalidad, ofreces confirmarlo y rediriges al valor.
• Avanzas la venta en cada mensaje: tras dar información, das el siguiente paso natural (mostrar el producto ideal, resolver la duda que falta, o invitar a comprar). Cierra cuando el cliente muestra interés — no lo dejes en el aire.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FORMATO OBLIGATORIO (CRÍTICO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONDE SIEMPRE USANDO ESTE PATRÓN (sin excepciones):

🎹 Idea 1 corta
✅ Idea 2 corta
💰 Idea 3 corta
🎓 Idea 4 corta

REGLA 1: CADA LÍNEA = UN EMOJI + TEXTO CORTO (máximo 5 palabras)
REGLA 2: SALTOS DE LÍNEA ENTRE CADA IDEA
REGLA 3: NUNCA párrafos largos sin emojis
REGLA 4: NUNCA asteriscos (*) ni guiones (-) ni viñetas (•)

❌ PROHIBIDO: "El curso cuesta 60mil e incluye todo el material"
✅ CORRECTO:
💰 $60.000
📦 Incluye todo el material
🎓 100+ horas contenido
(El ejemplo es solo de FORMATO. Los datos reales salen del catálogo y del bloque del negocio.)
• PREFIERE ENTREGAR INFORMACIÓN A INTERROGAR: si el cliente ya nombró un producto o categoría, entrégale la info y la card directamente. Solo pregunta UNA cosa concreta cuando el mensaje sea tan ambiguo que mostrar la opción equivocada arruinaría la venta. Nunca repitas una pregunta ya respondida.

${renderBloqueNegocio(negocio)}

📌 PROCESO DE PAGO Y ENTREGA:
• Pago por LINK (MercadoPago o PayPal): el cliente paga con tarjeta, PSE o PayPal. El sistema GENERA el enlace automáticamente y detecta el pago solo; al confirmarse, se le entrega el producto en este chat.
• Pago por CONSIGNACIÓN (Nequi/Daviplata/transferencia): el cliente transfiere y envía el comprobante por este chat; se verifica y se le entrega el producto.
• Los enlaces de pago (MercadoPago/PayPal) los GENERA EL SISTEMA en el momento — tú NO los escribes ni los inventas, solo confirmas con entusiasmo y el sistema los adjunta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 CATÁLOGO DE PRODUCTOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${productList.length > 0 ? productsBlock : "No hay productos disponibles."}

⚠️ INSTRUCCIONES CRÍTICAS:
[1] NUNCA inventes productos, precios, características, promociones ni descuentos. Usa SOLO los datos del catálogo.
[2] NUNCA escribas links, URLs, números de cuenta, ni datos de pago. El sistema los adjunta automáticamente.
[3] NUNCA digas "te lo envío", "te mando el link", "te llega" ni prometas tiempos de entrega.
[4] Si el cliente pregunta algo FUERA del contexto del negocio (charla casual, opiniones, etc.), responde de forma natural y amable. Si es posible, redirige suavemente al tema de ventas.
[5] Los datos del bloque "EL NEGOCIO PARA EL QUE TRABAJÁS" respóndelos SIEMPRE con seguridad — NUNCA digas "no sé" sobre ellos. Lo que ese bloque marque como NO confirmado (entrega, garantía, acceso) NO lo afirmes bajo ninguna circunstancia: decí que lo confirmás y le respondés. Para datos ESPECÍFICOS de un producto que no estén en el catálogo, admítelo con naturalidad y redirige al valor; no inventes.
[6] No repitas información que ya diste. Usa la MEMORIA de la conversación.
[6b] El "[ID: N]" del catálogo es INTERNO, solo para que TÚ elijas la card correcta. NUNCA menciones ese número al cliente (nada de "el curso ID 82", "producto 82", etc.). Refiérete al producto SIEMPRE por su NOMBRE.
[6c] Los datos de pago (número de Nequi/Daviplata y el NOMBRE del titular) van EXACTOS como aparecen en los datos del negocio. NUNCA cambies, adivines ni "corrijas" el nombre del titular ni el número — cópialos tal cual.
${isPaymentIntent ? "[7] ✅ El cliente quiere COMPRAR. Confirma con entusiasmo y cierra. Termina tu mensaje con [CARD: ID] del producto — el sistema adjunta AUTOMÁTICAMENTE la tarjeta con los enlaces dinámicos de MercadoPago y PayPal. NUNCA escribas [PAGAR:...], enlaces, URLs ni números de cuenta: SOLO usa [CARD: ID]." : `[7] 🧠 ANALIZA EL CONTEXTO y elige el producto CORRECTO del catálogo. Usa [CARD: ID] al final de tu mensaje para mostrar la tarjeta del producto que mejor corresponda. El ÚNICO marcador válido es [CARD: ID] — nunca uses [PAGAR:...] ni escribas enlaces. Si no estás segura, pregunta UNA cosa concreta antes de mostrar una card. NUNCA muestres un producto que no tenga relación con lo que el cliente busca.`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤝 PRINCIPIOS DE CONVERSACIÓN HUMANA Y PROFESIONAL (siempre)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Conversás, no contestás: leés TODA la conversación como contexto (no solo el último mensaje) y respondés a lo que el cliente realmente necesita en este punto. Si cambió de tema, acompañás el cambio con naturalidad.
• SOS humano: variás el ritmo de tus respuestas (a veces corta y directa, a veces con un toque cálido), usás el nombre del cliente con moderación, reconocés lo que dijo antes ("como te decía…", "entendí que buscabas…") y NUNCA repetís textualmente una respuesta anterior.
• Empatía primero: si el cliente no entendió, no repites lo mismo con otras palabras: cambiás el enfoque, simplificás, das un ejemplo concreto y confirmás ("¿quedó más claro así?"). Si está frustrado, disculpate breve y genuino, y pasá a UNA solución concreta.
• Inicio y cierre natural: al saludar, preguntás de forma genuina qué busca; al despedirse el cliente, cerrás con calidez, dejás la puerta abierta ("cuando quieras, acá estoy") y no insistís ni presionás.
• Resolvés, no te limitás a informar: cada respuesta avanza la conversación un paso (dato → siguiente paso), y si la duda del cliente no es de ventas, la resolvés con respeto y redirigís con suavidad.
• Profesionalismo: datos exactos, sin prometer lo que no existe, sin spam de emojis, sin exclamaciones forzadas. La calidez no reemplaza la claridad.`).trim()
    // tenants.agentPrompt: instrucciones libres que el dueño escribe en su
    // dashboard ("Prompt del agente" en Configuración). Antes existían en la
    // BD pero el flujo de WhatsApp nunca las leía -- se agregan siempre al
    // final, tanto si el agente activo tiene su propio systemPrompt como si
    // se usa el template por defecto, para que apliquen en cualquier caso.
    + (realTenant?.agentPrompt?.trim()
        ? `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📝 INSTRUCCIONES ESPECÍFICAS DEL NEGOCIO\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${realTenant.agentPrompt.trim()}`
        : "");

  // NOTA DE SEGURIDAD: Este runAgentReply() es el motor conversacional de
  // cara al CLIENTE (WhatsApp/Facebook Messenger llaman directamente a esta
  // función). Antes existía aquí un bloque que, si el agente activo se
  // llamaba "arquitecto", inyectaba instrucciones dándole a la IA acceso a
  // /query (SQL crudo), /code/write, /code/delete, etc. — alcanzable por
  // CUALQUIER mensaje de un cliente si el enrutador de agentes elegía esa
  // persona. El endpoint legítimo de diseño de agentes (POST
  // /api/architect-tools/architect en code-agent.ts) no pasa por esta
  // función, así que ese bloque no tenía ningún caso de uso real — se quitó.

  // ── 10. INTEGRAR contexto del motor DENTRO del cerebro ────────────────────
  // El bloque de contexto del motor (engineContext) se inyecta como contexto adicional
  // para que el prompt final tenga TODA la información disponible
  // Pasar todos los productos a AdvancedIntelligence para mejor análisis contextual
  const aiProductContext = productList.length > 0 ? productList.slice(0, 10) : [];
  // El cliente puede no ser colombiano: la ficha de producto ya le muestra el
  // precio en su moneda, pero el agente también habla de precios en texto
  // libre y ahí decía "$60.000" a secas -- que un mexicano lee como 60 mil
  // pesos MEXICANOS. Y le ofrecía Nequi, que afuera no existe.
  const { contextoDeMoneda: ctxMoneda } = await import("./moneda-por-pais");
  const monedaCliente = await ctxMoneda(convo.contactPhone, 0);
  const bloqueMoneda = monedaCliente.esColombia
    ? ""
    : `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🌎 ESTE CLIENTE NO ES DE COLOMBIA${monedaCliente.pais ? ` (${monedaCliente.pais})` : ""}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
      + `Los precios del catálogo están en PESOS COLOMBIANOS. Cuando le digas un precio, aclarale SIEMPRE que es en pesos colombianos y, si sabés el equivalente, dáselo en dólares. Nunca digas "$60.000" a secas: lo va a leer como su propia moneda.\n`
      + `Para pagar, ofrecele SOLO PayPal o tarjeta internacional. NO le ofrezcas Nequi ni Daviplata (son billeteras colombianas, no las tiene) ni el checkout de MercadoPago Colombia (le rechaza la tarjeta).\n`
      + `El producto es digital: lo recibe igual esté donde esté, sin envíos ni aduana. Decíselo, es de las primeras dudas que tiene alguien comprando de otro país.`;

  const bloqueAnuncio = anuncio
    ? `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📣 ESTE CLIENTE LLEGÓ DESDE UN ANUNCIO\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
      + `Anuncio: "${anuncio.titulo}"\n`
      + (anuncio.cuerpo ? `Texto del anuncio: "${anuncio.cuerpo}"\n` : "")
      + (anuncio.url ? `Link del anuncio: ${anuncio.url}\n` : "")
      + `\nEl mensaje que ves ("${lastText}") lo autocompletó Facebook al hacer clic — NO lo escribió él.\n`
      + `Ya sabés qué vino a buscar: hablale DE ESE PRODUCTO desde el primer mensaje.\n`
      + `NO le preguntes "¿qué estás buscando?" ni "¿en qué te ayudo?" — ya te lo dijo con el clic.\n`
      + `Saludá en una línea corta y pasá directo al producto del anuncio.`
    : "";

  // ── Pedido de producto físico (dropshipping) ───────────────────────────────
  //
  // Acá vive la diferencia real con un producto digital: hay que sacarle al
  // cliente a dónde se lo mandan, guardarlo, y cuando esté completo crear el
  // pedido en WooCommerce (que es quien lo empuja a Dropi). Antes de esto el
  // agente podía cerrar la venta y los datos se perdían: no existía ni un
  // campo de dirección en toda la base.
  let bloqueDropshipping = "";
  try {
    const esDropshipping =
      String((activeAgent as any).especialidad || "").toLowerCase() === "dropshipping";
    // El producto en juego: el que se identificó en este mensaje o el que
    // viene en contexto.
    const idEnJuego = decision.productoDelMensaje?.id ?? decision.productToShow?.id ?? memory.currentProductId ?? null;
    const productoEnJuego = idEnJuego ? productList.find((p: any) => p.id === idEnJuego) : null;
    const esFisico = String((productoEnJuego as any)?.kind || "") === "physical";

    if (esDropshipping || esFisico) {
      const ds = await import("./dropshipping");
      let pedido = await ds.pedidoEnCurso(conversationId);

      // Se abre el pedido recién cuando el cliente muestra intención de
      // comprar. Abrirlo en la primera pregunta llenaría la tabla de
      // borradores de gente que solo estaba mirando.
      const quiereComprar =
        decision.intent === "payment_intent" || decision.intent === "confirmation";
      if (!pedido && productoEnJuego && esFisico && quiereComprar) {
        pedido = await ds.abrirPedido({
          tenantId: convo.tenantId,
          conversationId,
          leadId: convo.leadId ?? null,
          productId: (productoEnJuego as any).id,
          productName: (productoEnJuego as any).name,
          unitPrice: Number((productoEnJuego as any).price) || 0,
          telefono: convo.contactPhone || null,
        });
      }

      if (pedido) {
        // Lo que el cliente acaba de escribir puede traer datos de envío:
        // se leen y se guardan sin pedirle que llene ningún formulario.
        const nuevos = ds.extraerDatosDeEnvio(lastText, pedido);
        if (Object.keys(nuevos).length > 0) {
          pedido = (await ds.guardarDatos(pedido.id, nuevos)) || pedido;
          console.log(`📋 [DROPSHIPPING] Datos capturados: ${Object.keys(nuevos).join(", ")} - ${ts()}`);
        }

        const faltan = ds.datosQueFaltan(pedido);
        if (faltan.length === 0 && pedido.estado === "completo") {
          const r = await ds.despacharPedido(pedido);
          bloqueDropshipping = r.ok
            ? `\n\n✅ PEDIDO CONFIRMADO (#${r.wooOrderId}). Ya quedó registrado y se despacha.\n`
              + `Confirmáselo al cliente con entusiasmo, repetile la dirección a la que llega y decile que la entrega es en ${ds.HECHOS_DROPSHIPPING.diasDeEntrega} y que paga al recibir.\n`
              + `NO le pidas más datos: ya están todos.`
            : `\n\n⚠️ Los datos están completos pero el pedido NO se pudo registrar (${r.error}).\n`
              + `Decile que ya tomaste sus datos y que en un momento le confirmás el despacho. NO inventes número de pedido ni de guía.`;
          console.log(`📦 [DROPSHIPPING] Despacho: ${r.ok ? `orden Woo #${r.wooOrderId}` : `FALLÓ (${r.error})`} - ${ts()}`);
        } else {
          const ya = ds.CAMPOS_DE_ENVIO
            .filter((c) => String((pedido as any)[c.campo] ?? "").trim())
            .map((c) => `${c.campo}: ${(pedido as any)[c.campo]}`);
          const siguiente = ds.CAMPOS_DE_ENVIO.find((c) => c.campo === faltan[0]);
          bloqueDropshipping =
            `\n\n📦 PEDIDO EN CURSO — ${pedido.productName}\n`
            + (ya.length ? `Datos que YA tenés (no los vuelvas a pedir): ${ya.join(" · ")}\n` : "")
            + `Todavía falta: ${faltan.join(", ")}.\n`
            + (siguiente
              ? `Pedí SOLO esto ahora, con tus palabras y en una línea: ${variante(siguiente.pregunta, `${conversationId}|${siguiente.campo}`)}\n`
              : "")
            + `Una cosa a la vez. Nunca mandes la lista entera de datos de golpe.`;
        }
      }

      // Los hechos fijos (entrega 3 a 5 días, contraentrega) van siempre que
      // haya un físico de por medio, haya pedido abierto o no.
      bloqueDropshipping = `\n\n${ds.contextoDeDropshipping()}${bloqueDropshipping}`;
    }
  } catch (e: any) {
    // Un fallo acá no puede dejar al cliente sin respuesta: se pierde el
    // bloque de pedido y el agente contesta igual.
    console.error(`⚠️ [DROPSHIPPING] ${e?.message || e}`);
  }

  // ── 10b. LECCIONES APRENDIDAS: adaptar esta respuesta con la experiencia ──
  // Se recuperan las lecciones de conversaciones anteriores del MISMO
  // negocio y producto (confusión, frustración, abandono, avances) y se
  // inyectan como contexto esencial. Así el agente no repite errores y
  // prueba alternativas. Si no hay lecciones o la memoria falla, no pasa
  // nada: el bloque queda vacío.
  let bloqueLecciones = "";
  if (convo.tenantId) {
    try {
      const lecciones = await retrieveLessons(convo.tenantId, {
        productName: memory.currentProductName,
        outcome: undefined,
        limit: 3,
      });
      const formateadas = formatLessonsForPrompt(lecciones, 800);
      if (formateadas) bloqueLecciones = `\n\n${formateadas}`;
    } catch (e: any) {
      console.error(`⚠️ [LEARNING] No se pudieron recuperar lecciones: ${e?.message || e}`);
    }
  }

  const engineContextBlock = `${decision.contextBlock}\n\n${AdvancedIntelligence.generateIntelligentContext(
    lastText,
    memory.history,
    aiProductContext.length > 0 ? aiProductContext : null
  )}${bloqueAnuncio}${bloqueMoneda}${bloqueDropshipping}${bloqueLecciones}`;

  // ── 11. ATENDER SEGÚN ESTRATEGIA DEL CEREBRO ─────────────────────────────

  // ── 11a. SALUDO (si el cerebro decidió hardcoded_greeting) ────────────────
  // Si el cliente llegó de un anuncio NO entra acá aunque solo haya escrito
  // "hola": ya sabemos a qué le hizo clic, y contestarle "¿qué estás buscando?"
  // es tirar a la basura el clic que se pagó. Esos van por el camino normal,
  // que sí muestra el producto del anuncio.
  if (brain.strategy === "hardcoded_greeting" && !anuncio) {
    if (!memory.hasGreeted) {
      console.log(`⚡ [FAST-TRACK] Primer saludo hardcodeado - ${ts()}`);
      const business = voice.businessName || "nuestra tienda";
      // Varía entre clientes: el mismo texto de bienvenida repetido a cientos
      // de contactos distintos es el patrón que WhatsApp penaliza.
      const quien = esNombreReal(customerName) ? ` ${customerName}` : "";
      const raw = variante([
        `¡Hola${quien}! 👋 Bienvenido a *${business}*. ¿Qué estás buscando hoy?`,
        `¡Hola${quien}! 😊 Soy de *${business}*. Contame qué necesitás y te ayudo.`,
        `¡Qué tal${quien}! 👋 Acá *${business}*. ¿En qué te puedo ayudar?`,
        `¡Hola${quien}! 🙌 Bienvenido a *${business}*. Decime qué te interesa.`,
      ], String(conversationId));

      await saveAgentMessage(conversationId, raw, "greeting", { intent: "greeting", isHardcoded: true });
      await persistStage(conversationId, "greeting");
      const totalTime = Date.now() - startTime;
      console.log(`🏁 [AGENT-END] Completado en ${totalTime}ms - ${ts()}`);
      return { content: raw, stage: "greeting", parts: [{ kind: "text", content: raw }], cardProductIds: [] };
    }

    // Saludo de retorno — adaptado al estado emocional
    console.log(`⚡ [FAST-TRACK] Saludo de retorno hardcodeado - ${ts()}`);
    const emocion = brain.emotionalState;
    const nm = (customerName && customerName !== "cliente") ? ` ${customerName}` : "";
    // El saludo de retorno era UNA sola frase fija: el mismo cliente que
    // vuelve tres veces recibía tres veces el mismo texto palabra por palabra
    // (medido el 17-08-2026: idéntico a las 13:40 y a las 15:51), que es
    // justamente el patrón por el que WhatsApp castiga una cuenta. La semilla
    // incluye cuántos mensajes lleva la conversación, así que cambia cada vez
    // que vuelve; y nunca repite el último texto enviado.
    const semilla = `${conversationId}|${memory.messageCount}`;
    const raw = emocion === "frustrated"
      ? varianteDistintaDe([
          `Hola de nuevo${nm}. Contame qué pasó y lo resolvemos 🤝`,
          `${nm ? `${nm.trim()},` : "Hey,"} acá estoy 🤝 Decime qué salió mal y lo vemos.`,
          `Hola${nm} 🙌 Contame qué pasó y te ayudo a resolverlo.`,
        ], semilla, memory.lastAgentMessage)
      : varianteDistintaDe([
          `¡Hey${nm}! Qué bueno verte de nuevo 😊 ¿En qué te ayudo?`,
          `¡Hola${nm}! 👋 ¿Qué andás buscando hoy?`,
          `${nm ? `¡${nm.trim()}!` : "¡Hola!"} 😊 Contame en qué te puedo ayudar.`,
          `¡Qué gusto verte${nm}! 🙌 ¿Qué necesitás?`,
        ], semilla, memory.lastAgentMessage);

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
        voice,
        negocio
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
      voice,
      negocio
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
  //
  // Tope de tamaño del prompt. Medido contra la API real de Groq con el modelo
  // que usa el bot (llama-3.1-8b-instant, 16-08-2026):
  //   15.000 caracteres (3.648 tokens) -> responde bien
  //   ~22.000 en adelante              -> 429 por límite de tokens por minuto
  //   32.000 en adelante               -> 413 "Request too large"
  // El tier gratis corta en 6.000 tokens, y la plantilla del system prompt
  // sola ya son 11.422 caracteres: alcanza con que el negocio tenga su propio
  // prompt largo para pasarse. Los 413/429 que se veían en el panel salen de
  // acá -- NO de inyectar el catálogo, que no se inyecta.
  //
  // Pasarse no degrada la respuesta: la ANULA, y el cliente recibe "problemas
  // técnicos" en el momento en que estaba interesado. Por eso se recorta antes
  // de mandar, empezando por lo menos crítico.
  const TOPE_PROMPT = Number(process.env.MAX_PROMPT_CHARS || 18000);
  let promptArmado = buildFinalPrompt(systemPrompt, brain, voice) + `\n\n${engineContextBlock}`;
  if (promptArmado.length > TOPE_PROMPT) {
    const antes = promptArmado.length;
    // El contexto del motor (qué producto mostrar, en qué etapa va) y el
    // bloque del anuncio son los que cambian la respuesta; el análisis de
    // AdvancedIntelligence es el más largo y el más prescindible.
    const base = buildFinalPrompt(systemPrompt, brain, voice);
    // El bloque de dropshipping va en lo esencial: si se recorta, el agente
    // vuelve a pedir datos que el cliente ya dio, o promete una entrega que no
    // corresponde. Es de lo último que se puede sacrificar.
    const esencial = `${decision.contextBlock}${bloqueAnuncio}${bloqueMoneda}${bloqueDropshipping}${bloqueLecciones}`;
    promptArmado = `${base}\n\n${esencial}`;
    if (promptArmado.length > TOPE_PROMPT) {
      // Todavía no entra: lo que sobra es el prompt del negocio o del agente.
      // Se corta por el final, avisando en el propio texto para que el modelo
      // sepa que viene truncado y no complete lo que falta por su cuenta.
      const corte = Math.max(TOPE_PROMPT - esencial.length - 200, 2000);
      promptArmado = `${base.slice(0, corte)}\n[…instrucciones recortadas por longitud…]\n\n${esencial}`;
    }
    console.log(`✂️ [PROMPT] Recortado de ${antes} a ${promptArmado.length} chars (tope ${TOPE_PROMPT}) - ${ts()}`);
  }
  const finalPrompt = promptArmado;

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
  // Modelos válidos verificados contra la API de OpenCode Zen (opencode.ai/zen).
  // IMPORTANTE:
  //  - Sin prefijo "opencode/": la API lo rechaza ("Model not supported").
  //  - "deepseek-v4-flash-free" es un modelo de razonamiento que gasta TODO el
  //    presupuesto de tokens en reasoning_content y devuelve content vacío →
  //    NO sirve para chat. Se reemplaza por modelos que sí devuelven contenido.
  //  - "qwen3.6-plus-free" y "nemotron-3-super-free" NO existen en la API.
  // Los modelos salen del entorno, no del código. Estaban incrustados acá y
  // eso hacía que OPENCODE_MODEL no sirviera para nada: el admin cambiaba la
  // variable en EasyPanel, reiniciaba, y el agente seguía pidiendo los mismos
  // tres de siempre (2026-08-16).
  //
  // El default pasa a deepseek-v4-flash-free por pedido explícito del admin y
  // porque los otros dos dan problemas medidos: `nemotron-3-ultra-free` es de
  // razonamiento y gasta el presupuesto de tokens pensando (se cortaba con
  // finish_reason "length" incluso para responder "OK"), y `mimo-v2.5-free`
  // ya venía documentado en el proyecto por envolver la salida en bloques de
  // código.
  const OPENCODE_FREE_MODELS = {
    razonamiento: process.env.OPENCODE_MODEL_RAZONAMIENTO || process.env.OPENCODE_MODEL || "deepseek-v4-flash-free",
    balanceado: process.env.OPENCODE_MODEL_BALANCEADO || process.env.OPENCODE_MODEL || "deepseek-v4-flash-free",
    rapido: process.env.OPENCODE_MODEL_RAPIDO || process.env.OPENCODE_MODEL || "deepseek-v4-flash-free",
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

  // ── Las claves del PROPIO cliente, si cargó alguna ──────────────────────
  // Se leen una vez por respuesta y se pasan a la cola armadas, sin tocar
  // process.env: dos clientes distintos corren en el MISMO proceso, así que
  // volcar una clave al entorno la haría atender conversaciones ajenas.
  const clavesPropias: { proveedor: string; config: any }[] = [];
  try {
    const tenantIdDelChat = Number((convo as any)?.tenantId) || 0;
    if (tenantIdDelChat) {
      const { clavesDelTenant } = await import("./ai-keys-tenant");
      const { getProviderConfigConClave } = await import("@workspace/integrations-openai-ai-server");
      for (const [proveedor, datos] of Object.entries(await clavesDelTenant(tenantIdDelChat))) {
        const cfg = datos?.apiKey ? getProviderConfigConClave(proveedor, datos.apiKey, datos.model) : null;
        if (cfg) clavesPropias.push({ proveedor, config: cfg });
      }
    }
  } catch (e: any) {
    // Nunca dejar a un cliente sin respuesta por no poder leer sus claves.
    logger.warn({ err: e?.message }, "[Agent] no se pudieron leer las claves propias del cliente");
  }

  const result = await executeWithFallback(
    async () => {
      const dbConfig = appSettings ? getProviderConfigFromSettings(appSettings) : null;
      const activeProvider = appSettings?.aiProvider || "none";
      const isUserSelected = activeProvider !== "opencode" && activeProvider !== "none" && !!dbConfig;

      // ── Helper: pushear fallbacks disponibles ──
      const pushFallbacks = (queue: { config: any; source: string }[]) => {
        // Lo que cargó ESTE cliente manda sobre todo lo demás: es su cuenta.
        // Se resuelve sin pasar por process.env, que es global al proceso y
        // era justamente lo que mezclaba a un cliente con otro.
        for (const { proveedor, config } of clavesPropias) {
          queue.push({ config, source: `${proveedor}_cliente` });
        }
        // Cada proveedor entra con TODOS sus modelos, no con uno.
        //
        // La cuota se agota por MODELO, no por cuenta (medido: con la misma
        // clave, uno devolvía 429 mientras otro respondía en 832ms). Zen y Go
        // ya rotaban así; el resto iba con uno fijo, así que si ese caía se
        // perdía el proveedor entero teniendo modelos suyos que sí responden.
        // Ahora cada modelo es un candidato propio y la cola sigue de largo.
        const conModelos = (proveedor: string, salud: string) => {
          if (activeProvider === proveedor || !healthMonitor.isServiceHealthy(salud)) return [];
          return getProviderRotation(proveedor).map((config) => ({
            config,
            source: `${proveedor}/${config.model}`,
          }));
        };
        const nvidiaFast = getProviderConfig("nvidia_fast");
        // DeepSeek primero: es de pago y responde en ~800ms medidos contra su
        // API, contra los 8-55s de los gratis. Acá cada segundo lo espera un
        // cliente real escribiendo por WhatsApp, y una venta perdida cuesta
        // miles de veces lo que cuesta el token (~2 COP por mensaje).
        queue.push(...conModelos("deepseek", "deepseek"));
        // Copilot: la cuenta del admin. Va antes que los gratis sueltos porque
        // es la de mejor calidad del resto. El intercambio de token (PAT ->
        // token de sesión de Copilot) lo hace más abajo quien detecta la
        // baseUrl api.githubcopilot.com.
        queue.push(...conModelos("github_copilot_internal", "copilot_internal"));
        // Groq: respaldo rápido y gratuito (antes estaba configurado pero nunca se usaba)
        queue.push(...conModelos("groq", "groq"));
        queue.push(...conModelos("nvidia", "nvidia_70b"));
        // GitHub Models ya NO va en la cadena: GitHub lo está retirando.
        // Verificado el 2026-08-19 contra los dos endpoints -- el viejo
        // (models.inference.ai.azure.com) devuelve 404 y el nuevo
        // (models.github.ai/inference) devuelve 410 Gone con
        // "github_models_retirement_brownout". Un proveedor muerto en la cola
        // no es neutral: se lleva su intento y su timeout mientras un cliente
        // espera la respuesta. Copilot es OTRA API (api.githubcopilot.com),
        // sigue viva y queda arriba.
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

          // El nombre con el que se reporta salud al rotador. Se corta en "/"
          // (opencode/mimo-v2.5-free → opencode) pero NO en "_": recortar ahí
          // convertía "opencode_go" y "opencode_zen" en "opencode", así que
          // un fallo del gratuito ponía en cooldown al de pago y viceversa --
          // justo los dos que existen para cubrirse entre sí.
          const providerName = source.split("/")[0];
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
              // El timeout de 60s + 1 reintento vive HARDCODEADO dentro de
              // createAIClient (provider.ts) y se ignoraba aquí: un proveedor
              // colgado bloqueaba la respuesta al cliente de WhatsApp hasta
              // ~120s en vez de fallar a los `timeout`ms calculados arriba y
              // pasar al siguiente proveedor. En el momento exacto en que un
              // cliente pregunta "cómo pago" es cuando MENOS se puede tardar.
              // timeout + maxRetries en las RequestOptions de esta llamada
              // sobreescriben el default del cliente para ESTA petición.
              () => client.chat.completions.create(
                {
                  model: config.model,
                  messages: chatMessages as any,
                  temperature: 0.65,
                  presence_penalty: 0.7,
                  frequency_penalty: 0.5,
                },
                { timeout, maxRetries: 0 },
              ),
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
            // Un 200 con el contenido VACÍO es un fallo, aunque no tire error.
            // Antes solo se contaba como fallo lo que caía en el catch, así que
            // un modelo que siempre devuelve vacío nunca se marcaba enfermo y
            // seguía siendo el primero de la cola en CADA mensaje, quemando un
            // viaje de ida y vuelta por cliente. Hay varios así: 8 de los 26
            // modelos de OpenCode Go contestan 200 sin una sola letra.
            reportProviderResult(providerName, false, Date.now() - startTime, "respuesta vacía");
            console.log(`⚠️ [AI] ${source} contestó 200 pero VACÍO — se pasa al siguiente - ${ts()}`);
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
          } else if (prov === "groq") {
            // groq estaba en AI_FALLBACK_ORDER desde siempre pero este bucle
            // NO tenía rama para él, así que se ignoraba en silencio: el
            // admin creía tener respaldo y no tenía ninguno.
            //
            // Se vio en producción (2026-08-16) con el peor resultado
            // posible: la cuota gratuita de Zen se agotó
            // ("FreeUsageLimitError: Rate limit exceeded" en los tres
            // modelos), opencode devolvió vacío, y como groq nunca entraba a
            // la cola el agente tiraba "Todos los proveedores fallaron". El
            // cliente recibía "Estoy teniendo problemas técnicos" ante
            // CUALQUIER pregunta -- con una campaña paga corriendo.
            const cfg = getProviderConfig("groq");
            if (cfg) rotationQueue.push({ config: cfg, source: "groq" });
          } else if (prov === "openrouter") {
            // Mismo caso que groq: getProviderConfig("openrouter") existe
            // desde siempre, pero sin rama acá nunca entraba a la cola. El
            // admin lo tiene configurado y funcionando.
            const cfg = getProviderConfig("openrouter");
            if (cfg) rotationQueue.push({ config: cfg, source: "openrouter" });
          } else if (prov === "opencode_go") {
            // Nivel de pago: no se queda sin cuota a mitad del día como el
            // gratuito, así que sirve de red cuando el free se agota.
            //
            // Se encolan TODOS sus modelos útiles, no solo Luna. Antes, si
            // Luna fallaba, se abandonaba Go entero y se saltaba al siguiente
            // proveedor, desperdiciando los otros modelos pagos que sí
            // responden. Cuáles son "útiles" está medido en provider.ts: de
            // los 26 que Go lista, solo 4 sirven de verdad.
            for (const cfg of getOpenCodeGoRotation()) {
              rotationQueue.push({ config: cfg, source: `opencode_go/${cfg.model}` });
            }
          } else if (prov === "opencode_zen") {
            // Zen gratuito: se encolan TODOS sus modelos, no uno solo.
            //
            // La cuota gratuita se agota POR MODELO, no por cuenta. Medido en
            // producción (2026-08-16): con la misma clave,
            // deepseek-v4-flash-free devolvía 429 "cuota agotada" mientras
            // nemotron-3-ultra-free respondía en 832ms. Usando un único
            // modelo, agotar ese uno hacía caer TODO Zen pudiendo seguir
            // dentro del mismo proveedor.
            //
            // getOpenCodeRotation() ya existía para esto y no estaba
            // conectada a nadie.
            for (const cfg of getOpenCodeRotation()) {
              rotationQueue.push({ config: cfg, source: `opencode_zen/${cfg.model}` });
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
          } else {
            // Cualquier otro proveedor que el admin ponga en
            // AI_FALLBACK_ORDER entra solo, sin necesidad de una rama propia.
            //
            // La causa raíz del apagón del 2026-08-16 fue justamente esto:
            // groq y openrouter estaban configurados, resolvían bien, y aun
            // así el bot contestaba "problemas técnicos" porque nadie había
            // escrito su `else if`. Se ignoraban EN SILENCIO. Con este caso
            // por defecto, agregar un proveedor pasa a ser configuración y no
            // un cambio de código -- y sobre todo, deja de haber proveedores
            // invisibles.
            const cfg = getProviderConfig(prov);
            if (cfg) rotationQueue.push({ config: cfg, source: prov });
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

      // 2a-bis. Eliminar marcadores que la IA a veces inventa y que NADIE
      // procesa ([PAGAR: id], [PAGO], [LINK], [ENLACE]...). El pago se entrega
      // por la CARD (paymentOnly), que genera los links dinámicos de
      // MercadoPago/PayPal en el canal. Sin esta limpieza, esos marcadores se
      // mostrarían LITERALES al cliente. El [CARD: id] real se preserva.
      raw = raw.replace(/\[\s*(PAGAR|PAGO|LINK|ENLACE|PAY|URL)\s*:?[^\]]*\]/gi, "").trim();

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
      // Sin separadores ni firma mecánica: un vendedor humano no envía "━━━" ni
      // firma cada mensaje. Dejamos el texto natural tal como lo generó la IA.
      raw = formatWithBrandVoice(raw, voice, {
        addSeparator: false,
        addSignature: false,
        isImportant: false,
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
        // 0. El producto que la búsqueda identificó en ESTE mensaje manda sobre
        //    el que eligió el modelo.
        //
        //    Antes acá solo se corregían ids INVÁLIDOS: si el modelo escribía
        //    un id que existía en el catálogo pero era de OTRO producto, se
        //    aceptaba sin comparar contra nada. En vivo (17-08-2026) el cliente
        //    escribió "me interesa el curso de idiomas" y recibió el curso de
        //    piano -- el emparejador había encontrado PACK IDIOMAS
        //    correctamente, pero al modelo solo le llegaba una sugerencia en
        //    texto y él siguió con el producto del historial. Una sugerencia no
        //    es una garantía; esto sí.
        const identificado = decision.productoDelMensaje;
        if (identificado && validIds.has(identificado.id) && numId !== identificado.id) {
          console.log(`🔒 [PARSER] La IA escribió ${numId} pero el cliente pidió "${identificado.name}" (ID ${identificado.id}, score ${identificado.score}). Se corrige.`);
          resolvedId = identificado.id;
        }
        // 1. Si el ID es válido, usarlo directamente
        else if (!isNaN(numId) && validIds.has(numId)) {
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

        // ── NO REPETIR UNA FICHA YA ENVIADA ──────────────────────────────────
        // Si al cliente ya se le mandó la tarjeta de ESE producto, volver a
        // mandarla completa es lo que lo hace sonar a robot: repite precio,
        // beneficios y enlaces que ya tiene. Se contesta SOLO lo que preguntó
        // (el texto que la IA escribió antes de la tarjeta) y se descarta la
        // tarjeta.
        //
        // Excepciones: si la pidió de nuevo, o si está por pagar (ahí la
        // tarjeta lleva los enlaces de pago vigentes), o si la IA no escribió
        // nada más que la tarjeta -- en ese caso quitarla dejaría un mensaje
        // vacío y es preferible repetirla.
        const esFlujoDePago = (decision.intent === "payment_intent" || decision.intent === "confirmation");
        const yaEnviada = resolvedId !== -1 && memory.sentProductIds.has(resolvedId);
        if (yaEnviada && !esFlujoDePago && !decision.pidioReenvio && textBefore) {
          console.log(`🔁 [PARSER] La ficha de ${resolvedId} ya se envió antes: no se repite, se contesta solo lo que preguntó.`);
          resolvedId = -1;
        }

        if (resolvedId !== -1) {
          const isPaymentFlow = esFlujoDePago;
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

      // Se guarda lo que el cliente REALMENTE recibió, sin el marcador interno.
      //
      // Dos motivos. Uno: `[CARD: 123]` se veía literal en la pantalla de
      // Conversaciones, como si el bot hubiera mandado ese texto. Dos, y más
      // grave: al reconstruir la memoria, `sentProductIds` se llena también
      // buscando `[CARD: N]` dentro del texto guardado -- así que una tarjeta
      // RECHAZADA por el parser (id inválido, o ya enviada antes) quedaba
      // igualmente registrada como enviada, y el producto no se le mostraba
      // nunca al cliente. La verdad de qué se envió está en `agentMeta`
      // (cardSent + productId), que sale de las partes ya resueltas.
      const textoGuardado = raw.replace(/\[CARD:\s*[\w-]+\s*\]/gi, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      // Si el mensaje era SOLO la tarjeta, queda vacío al quitar el marcador:
      // se deja constancia legible de qué ficha se envió.
      const soloFicha = agentMeta.productName ? `📦 Ficha enviada: ${agentMeta.productName}` : "📦 Ficha del producto enviada";
      await saveAgentMessage(conversationId, textoGuardado || soloFicha, decision.stage, agentMeta);
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

          // Meta Conversions API: este era el hueco real -- el pixel del
          // navegador (packages/tienda/src/lib/pixel.ts) manda ViewContent/
          // AddToCart/InitiateCheckout, pero como la compra se confirma
          // DENTRO de la conversación de WhatsApp (no en el checkout del
          // navegador), nunca había un evento "Purchase" real yendo a Meta.
          // Sin esto, el optimization_goal=OFFSITE_CONVERSIONS que ya arma
          // ad-strategist.ts/facebook.ts para las campañas con pixel no
          // tiene ninguna señal de conversión real de la que aprender, sin
          // importar qué tan bien segmentada esté la campaña.
          if (realTenant?.facebook?.pixelId && realTenant?.facebook?.accessToken) {
            const [productRow] = await db.select({ currency: products.currency }).from(products).where(eq(products.id, pId)).limit(1);
            sendPurchaseEvent({
              pixelId: realTenant.facebook.pixelId,
              accessToken: realTenant.facebook.accessToken,
              value: Number(pPrice) || 0,
              currency: productRow?.currency || "COP",
              contentIds: [pId],
              customerEmail,
              customerPhone: customer?.contactPhone,
            }).catch(() => {}); // sendPurchaseEvent ya loguea sus propios errores -- no debe romper el flujo de venta real
          }
        } catch (e) {
          console.log(`⚠️ No se pudo procesar confirmación de pago: ${(e as Error).message}`);
        }
      }

      // Persistir productos en el contexto de la conversación
      // El sistema actualiza lastMessage de todas formas
      //
      // lastMessageAt usa dbNow(), NO new Date().toISOString(): en Postgres
      // esta columna es timestamp en modo Date y Drizzle espera un objeto
      // Date, no un string — pasarle un string reventaba AQUÍ MISMO justo
      // después de que la IA generara una respuesta de venta válida, y el
      // cliente de WhatsApp recibía "problemas técnicos" en vez de esa
      // respuesta real. Ver date-utils.ts para el detalle completo.
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
