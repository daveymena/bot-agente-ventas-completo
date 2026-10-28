Warning: truncated output (original token count: 77291)
Total output lines: 5362

import { eq, and, asc, desc, ne, sql } from "drizzle-orm";
import {
  db,
  agents,
  conversations,
  messages,
  products,
  productCategories,
  leads,
  settings as settingsTable,
  facebookDrafts,
} from "@workspace/db";
import { getProviderConfig, getProviderRotation, getProviderConfigFromSettings, createAIClient, getOpenCodeRotation, getOpenCodeGoRotation } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { supervisarRespuesta } from "./supervisor";
import { hablarColombiano } from "./hablar-colombiano";
import { calcularEstado, renderEstado, puedeMandarPago, pidePagar, type EtapaTrato } from "./estado-cognitivo";
// Se usaba sin importar: con `@ts-nocheck` puesto nadie lo notaba, y reventaba
// justo al confirmar una compra -- el peor momento posible.
import { processPurchaseConfirmation } from "./payment-confirmation";
import { proximoPaso, renderPaso, necesidadDeclarada, type Paso } from "./embudo";
import { opcionesPendientes, preguntaPorLaOpcion } from "./opciones-del-producto";
import { preguntasSueltas } from "./estado-cognitivo";
import { seccionQueCorresponde, elSiContestaLaOferta, elCierreOfrece, pideAlgoEntregable, preguntaPorVarios, esAfirmacionSuelta, elProductoSaleDeLaPreguntaMisma, queOfrecioElBot, elVideoYaSalio, sePuedeOfrecerElVideo } from "./ficha-parcial";
import { promesasDe, promesasIncumplidas, sinLaPromesa, sinElMontoQueVaEnLaFicha, niegaLoQueSiSale, loQueEntregaLaSeccion, NOMBRE_DE_PROMESA } from "./promesas";
import { medirEmojis } from "./emojis-con-medida";
import { preguntaPorLoInterno, delataLoInterno, respuestaSegura, vocabularioDelNegocio } from "./nada-interno";
import { videoDeProducto } from "./video-de-producto";
import { seDespachaPorTransportadora } from "./entrega-del-producto";
import { CONDICIONES_DE_RESPALDO, bloqueTrasElSi, marcaDeModelo, modeloDelProducto } from "./modelo-de-negocio";
import { verificarPrecios } from "./precio-verificado";
import { productoEnFoco } from "./producto-en-foco";
import { entenderAlCliente, type Entendimiento } from "./entender-al-cliente";
import { pideEntregable, preguntaPorVariosProductos, pedidosLeidos } from "./lectura-del-cliente";
import { sinLoQueYaLeyo, yaLoDijo } from "./no-repetir";
import { sinPreguntarLoQueYaVa } from "./no-pedir-lo-que-ya-va";
import { nombreDePila } from "./nombre-de-pila";
import { vioLaFichaHacePoco, yaLeDijimos } from "./customer-profile";
import { datosYaDichos } from "./datos-ya-dichos";
import { afirmaTenerlo, negarloSeriaMentira, productosNombrados } from "./nombra-productos-reales";
import { prometeEntregaFisica, sinLaPromesaFisica, sinElTemarioInventado, lineasDeTemarioInventadas, comoSeEntregaDeVerdad } from "./solo-lo-que-dice-la-ficha";

/**
 * El video de este producto, sin reventar si el metadata viene raro.
 *
 * ⚠️ Recibe el PRODUCTO, no su metadata. La diferencia costó una venta: en el
 * clasificador del cierre se le pasaba `producto.metadata`, así que adentro
 * hacía `metadata.metadata` -> undefined y devolvía "" para TODO producto.
 * Como devolver "" es una respuesta válida ("no tiene video"), nada fallaba:
 * el bot ofrecía el video y después no lo reconocía cuando el cliente decía
 * que sí.
 *
 * Por eso el aviso: si llega algo que ya parece un metadata, se avisa fuerte
 * en vez de contestar "" como si el producto no tuviera video.
 */
function videoDeProductoSeguro(p: any): string {
  if (p && typeof p === "object" && !("metadata" in p) && ("videoIntro" in p || "videoUrl" in p)) {
    console.warn("⚠️ [VIDEO] videoDeProductoSeguro recibió un metadata, no un producto. Se lee igual, pero el llamador está mal.");
    try { return videoDeProducto(p); } catch { return ""; }
  }
  try { return videoDeProducto(p?.metadata); } catch { return ""; }
}
import { responderPreguntas, aperturaPara } from "./conocimiento-producto";
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
  cardConRespaldo,
  loadConversationMemory,
  computeDecision,
  saveAgentMessage,
  persistStage,
  buildChatHistory,
  detectIntent,
  tryHardcodedAnswer,
  isPaymentProofIntent,
  nombraAlgoConcreto,
  preguntaSobreLoQueSeHabla,
  sanitizeResponse,
  detectHardcodedIntent,
  hasHardcodedAnswerBeenGiven,
  type Stage,
} from "./conversation-engine";
import { getBrandVoice, formatWithBrandVoice } from "./brand-voice";
import { registrarTurnoAtendido } from "./monitoring";

/**
 * Modelos de RAZONAMIENTO: no pueden atender a un cliente.
 *
 * Medido en producción el 2026-08-29, con DeepSeek recién habilitado: el bot
 * contestó con `deepseek/deepseek-reasoner` y tardó 26 y 30 SEGUNDOS. Las
 * respuestas eran buenas -- el problema es que nadie espera medio minuto en
 * WhatsApp: para cuando llega, el cliente cerró el chat.
 *
 * `deepseek-chat`, el MISMO proveedor, responde en ~800 ms. La diferencia no
 * es el proveedor: es que un modelo de razonamiento gasta el presupuesto
 * pensando antes de escribir.
 *
 * Se exporta para que la prueba use ESTA expresión y no una copia: una prueba
 * que reimplementa la regla sigue en verde aunque el código real se rompa.
 */
export const MODELO_DE_RAZONAMIENTO = /reasoner|thinking|-r1\b|reasoning/i;
import { getBusinessContext, renderBloqueNegocio, resumenContexto, datosQueFaltan } from "./business-context";
import { expandirPorCuenta } from "./copilot-cuentas";
import { construirPlaybook, quitarInventos, quitarMuletillaDeApertura, extraerApertura } from "./sales-playbook";
import { analyzeBrain, buildFinalPrompt, type ResponseStrategy, type EmotionalState } from "./response-brain";
import { learnFromLastExchange, retrieveLessons, formatLessonsForPrompt } from "./conversation-learning";
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
  optimizedRotation,
} from "./optimized-rotation";
import { deepseekVaPrimero } from "./deepseek-al-frente";
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
    // Faltaban los dos campos de control de fichas. Sin ellos el objeto no
    // cumple el tipo, y quien lo lea encuentra undefined donde espera datos.
    cardsSentFor: new Set<number>(),
    lastCardSentAt: null,
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
export function anuncioDeOrigen(
  history: Array<{ role: string; metadata?: any; createdAt?: Date | string | null }>,
) {
  // El `externalAdReply` viaja pegado UNICAMENTE al primer mensaje del cliente.
  // Antes esta funcion miraba solo el ultimo mensaje suyo y devolvia null si no
  // lo tenia, asi que el anuncio se perdia apenas el cliente escribia una
  // segunda vez ("cuanto cuesta?"). Se pagaba el clic, se sabia por que producto
  // venia, y ese dato duraba un solo turno.
  //
  // Ahora se busca hacia atras entre SUS mensajes, con dos frenos para no
  // arrastrar un anuncio viejo a una conversacion nueva:
  //   - como mucho 10 mensajes suyos hacia atras;
  //   - como mucho 24h de antiguedad respecto del ultimo mensaje.
  const MAX_MENSAJES = 10;
  const MAX_HORAS = 24;

  const fecha = (v: unknown): number => {
    const t = v instanceof Date ? v.getTime() : v ? new Date(v as string).getTime() : NaN;
    return Number.isFinite(t) ? t : NaN;
  };

  const ultimo = fecha(history[history.length - 1]?.createdAt);
  let vistos = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.role !== "customer") continue;
    if (++vistos > MAX_MENSAJES) break;

    const md = m.metadata || {};
    if (!(md.adTitle || md.adBody || md.adUrl || md.adId)) continue;

    const cuando = fecha(m.createdAt);
    if (Number.isFinite(ultimo) && Number.isFinite(cuando)) {
      const horas = (ultimo - cuando) / 3_600_000;
      if (horas > MAX_HORAS) break; // anuncio de otra visita, no de esta
    }

    return {
      titulo: String(md.adTitle || ""),
      cuerpo: String(md.adBody || ""),
      url: String(md.adUrl || ""),
      anuncioId: String(md.adId || ""),
    };
  }
  return null;
}

/** El slug de un link de producto: /producto/<slug>/ -> "<slug>". */
function slugDeUrl(u: string): string {
  return (String(u || "").match(/\/(?:p|producto|product|products)\/([^/?#]+)/i)?.[1] || "").toLowerCase();
}

/**
 * Que producto vino a buscar el cliente que llego de un anuncio.
 *
 * Antes esto se resolvia SOLO por parecido de texto: se pegaba el titular y
 * el cuerpo del anuncio al mensaje y decidia el motor de coincidencias. El
 * unico dato duro que se miraba era un link con ID numerico (/p/123).
 *
 * Con el catalogo real eso falla, porque los productos vienen de WooCommerce
 * y sus links son por SLUG, no por numero:
 *   https://.../producto/renovador-negro-perfecto-x-200ml/
 * El `(\d+)` nunca engancha ahi, asi que se caia al parecido de texto -- y con
 * dos productos del mismo nombre en el catalogo (ids 125 y 128, precios
 * distintos) el parecido no puede acertar: es una moneda al aire sobre cual de
 * los dos cotizar.
 *
 * Se resuelve en escalera, de mas duro a mas blando, y solo se cae al texto si
 * ninguna resuelve:
 *   1. El adId de Meta contra facebook_drafts, que guarda el producto con el
 *      que se creo ESE anuncio. Es exacto: identifica al anuncio, no se parece.
 *   2. Link con ID numerico (/p/123).
 *   3. Link por slug, comparado como segmento COMPLETO contra el permalink de
 *      WooCommerce -- "…-x-200ml" no puede matchear "…-x-200ml-2".
 */
export async function productoDelAnuncio(
  anuncio: { anuncioId?: string; url?: string } | null,
  productList: Array<any>,
): Promise<{ id: number; name: string; via: string } | null> {
  if (!anuncio) return null;

  const adId = String(anuncio.anuncioId || "").trim();
  if (adId) {
    try {
      const [d] = await db
        .select({ productId: facebookDrafts.productId })
        .from(facebookDrafts)
        .where(eq(facebookDrafts.adId, adId))
        .limit(1);
      if (d?.productId) {
        const p = productList.find((x: any) => x.id === d.productId);
        if (p) return { id: p.id, name: p.name, via: "adId" };
      }
    } catch {
      // Si la consulta falla se sigue por las otras vias: un problema de BD no
      // puede dejar al cliente sin respuesta.
    }
  }

  const url = String(anuncio.url || "");

  const num = Number(url.match(/\/(?:p|producto|product)\/(\d+)(?:[/?#]|$)/)?.[1] || 0);
  if (num) {
    const p = productList.find((x: any) => x.id === num);
    if (p) return { id: p.id, name: p.name, via: "url-id" };
  }

  const slug = slugDeUrl(url);
  if (slug && !/^\d+$/.test(slug)) {
    const p = productList.find((x: any) => {
      const perma = (x?.metadata as any)?.woocommerce?.permalink;
      return perma ? slugDeUrl(perma) === slug : false;
    });
    if (p) return { id: p.id, name: p.name, via: "url-slug" };
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

  // ── Motor de ventas v2 (bandera por negocio) ──────────────────────────────
  //
  // El enganche va DESPUÉS del límite del plan y ANTES de todo lo demás, en el
  // mismo punto único por donde pasan todas las respuestas: así el motor nuevo
  // hereda el candado en vez de esquivarlo, y ningún canal (WhatsApp,
  // Messenger, comentarios) se queda afuera por olvido.
  //
  // Si algo falla, se cae al motor viejo. Preferimos una respuesta del motor
  // anterior antes que silencio: el cliente está escribiendo AHORA.
  if (convo.tenantId) {
    try {
      const { motorDelTenant } = await import("./motor-nuevo/activacion");
      if ((await motorDelTenant(convo.tenantId)) === "v2") {
        const { responderComoVendedor } = await import("./motor-nuevo/adaptador");
        const respuestaV2 = await responderComoVendedor(conversationId);
        if (respuestaV2) {
          console.log(
            `🆕 [MOTOR-V2] ${conversationId} · ${respuestaV2.aiProvider} · ${respuestaV2.nicho} · ` +
              `${respuestaV2.traza.length} herramienta(s)${respuestaV2.modoPlan ? " · modo plan" : ""}` +
              `${respuestaV2.corregido ? " · cifra corregida" : ""}`,
          );
          registrarTurnoAtendido(respuestaV2.aiProvider.split("/")[0], respuestaV2.aiProvider, false);
          return respuestaV2 as any;
        }
        logger.warn({ conversationId }, "[MOTOR-V2] sin respuesta: se cae al motor anterior");
      }
    } catch (e: any) {
      logger.error({ err: e?.message, conversationId }, "[MOTOR-V2] falló el turno: se cae al motor anterior");
    }
  }

  // ── 2. Cargar memoria estructurada desde BD (fuente única de verdad) ──────
  t1 = Date.now();
  const memory = await loadConversationMemory(conversationId);
  logTime(`2. Cargar memoria: ${Date.now() - t1}ms`);
  
  const lastText = memory.lastCustomerMessage;
  const customerName = convo.contactName || "cliente";
  // Con el que se le HABLA. El pushName de WhatsApp trae nombre y apellido
  // ("Duvier Mena"), y saludar con apellido delata la maquina en el primer
  // mensaje. Ver `nombre-de-pila.ts`.
  const nombreCorto = nombreDePila(customerName);

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

  // ── 2c. CLIENTE PIDE EL LINK DE LA LANDING ────────────────────────────────
  // "Pasarle eso al bot": si el cliente pide la página/enlace/landing de un
  // producto y existe una publicada, se le manda el link directo. Es dato
  // real del negocio, no texto de IA, y ahorra el viaje al modelo.
  {
    const texto = String(lastText || "").toLowerCase();
    const pidePagina =
      /(landing|p[áa]gina|enlace|link|url)/.test(texto) &&
      /(dame|pasame|pásame|mandame|mándame|enviame|envíame|me pasas|me envias|me mandas|cu[áa]l es|d[óo]nde|tienes|ten[eé]s|de compra|de pago|quiero)/.test(texto);
    if (pidePagina && convo.tenantId) {
      try {
        const { landingPages } = await import("@workspace/db");
        const filas = await db.select().from(landingPages).where(eq(landingPages.tenantId, convo.tenantId));
        // La MÁS RECIENTE primero: sin orden salía la primera de la tabla, o
        // sea la landing vieja aunque hubiera una nueva del mismo producto.
        const publicadas = filas
          .filter((l: any) => l.status === "published" && l.publishedUrl)
          .sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        if (publicadas.length) {
          const nombre = String(memory.currentProductName || "").toLowerCase();
          const focoId = Number(memory.currentProductId || 0);
          const elegida: any =
            publicadas.find((l: any) => focoId && Number(l.productId) === focoId) ||
            publicadas.find((l: any) => nombre && String(l.name).toLowerCase().includes(nombre)) ||
            publicadas[0];
          const raw = `Acá está la página de *${String(elegida.name).trim()}*:\n${elegida.publishedUrl}`;
          console.log(`🔗 [LANDING-LINK] Cliente pidió el enlace → ${elegida.publishedUrl} - ${ts()}`);
          await saveAgentMessage(conversationId, raw, memory.currentStage, { intent: "landing_link", isHardcoded: true });
          const totalTime = Date.now() - startTime;
          console.log(`🏁 [AGENT-END] Completado en ${totalTime}ms (link de landing) - ${ts()}`);
          return { content: raw, stage: memory.currentStage, parts: [{ kind: "text", content: raw }], cardProductIds: [] };
        }
      } catch (e: any) {
        console.error(`⚠️ [LANDING-LINK] Error buscando landing: ${e?.message}`);
      }
    }
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
      // ── Modo de catálogo del NEGOCIO: manda sobre todo lo demás ───────────
      //
      // Se resuelve antes que la especialidad del agente porque es una
      // decisión del dueño, no del agente: si el negocio dice "acá solo vendo
      // digital", ningún agente suyo puede ofrecer un producto físico.
      //
      // El filtro es duro a propósito. Instruir al modelo para que "no
      // confunda" físicos con digitales ya se intentó y falló las dos veces
      // (prometió Google Drive de un frasco, y envío a domicilio de un curso).
      // Si el producto no está en la lista, no hay nada que confundir.
      // `getBusinessContext` está cacheado 60s por tenant, así que pedirlo acá
      // y otra vez más abajo no agrega consultas.
      const negocioParaCatalogo = await getBusinessContext(convo.tenantId).catch(() => null);
      const modoNegocio = negocioParaCatalogo?.modoCatalogo ?? "mixto";
      if (modoNegocio !== "mixto") {
        const esDigital = modoNegocio === "digital";
        const antesModo = productList.length;
        // Un producto es FÍSICO solo cuando se despacha por transportadora
        // (kind físico Y sin evidencia de digital). Todo lo demás es digital,
        // incluidos los cursos mal marcados `physical` por el importador de
        // WooCommerce: un curso de IA con "39 módulos" en la descripción no
        // puede filtrarse del catálogo digital por una bandera equivocada.
        const soloDelModo = productList.filter((p: any) =>
          esDigital ? !seDespachaPorTransportadora(p) : seDespachaPorTransportadora(p),
        );
        if (soloDelModo.length > 0) {
          productList = soloDelModo;
          console.log(`🏷️ [MODO] El negocio vende solo ${modoNegocio}: ${soloDelModo.length} de ${antesModo} productos - ${ts()}`);
        } else {
          console.log(`⚠️ [MODO] El negocio dice vender solo ${modoNegocio} pero no tiene productos de ese tipo; se deja el catálogo completo`);
        }
      }

      const especialidad = String((activeAgent as any).especialidad || "").toLowerCase();
      if (especialidad === "digital" || especialidad === "dropshipping") {
        const esDigital = especialidad === "digital";
        const antes = productList.length;
        // Mismo criterio que el modo de negocio: se clasifica por si se
        // despacha de verdad, no por la bandera `kind` suelta.
        const filtrado = productList.filter((p: any) =>
          esDigital ? !seDespachaPorTransportadora(p) : seDespachaPorTransportadora(p),
        );
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
      categoryMap = new Map(allCategories.map((c: any) => [c.id, c.name.toLowerCase()]));
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
  // Se resuelve por dato duro (adId de Meta, link por id o por slug). Si
  // ninguna via engancha, `delAnuncio` es null y decide el motor por texto,
  // que es el comportamiento de siempre.
  const delAnuncio = await productoDelAnuncio(anuncio, productList);
  if (delAnuncio) {
    textoDecision = `${textoParaDecidir} ${delAnuncio.name}`;
    console.log(`📣 [ANUNCIO] Producto resuelto por ${delAnuncio.via}: #${delAnuncio.id} "${delAnuncio.name}"`);
  } else if (anuncio) {
    // Vale la pena verlo en el log: es justo el caso en que el bot puede
    // terminar hablando del producto equivocado.
    console.log(`⚠️ [ANUNCIO] No se pudo resolver el producto por dato duro (adId="${anuncio.anuncioId}", url="${anuncio.url}"): decide el parecido de texto.`);
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

  // ── 5-bis. QUE ENTIENDA LA IA, Y QUE ESO MANDE DESDE EL PRINCIPIO ────────
  //
  // Esto vivía DESPUÉS de `computeDecision`, y por eso agregar comprensión no
  // cambiaba el comportamiento. `computeDecision` deriva `stage`,
  // `shouldSendCard` y sobre todo `contextBlock` —el párrafo que de verdad
  // entra al prompt del redactor— a partir del intent de las listas de
  // palabras. Parchear `decision.intent` después corrige la ETIQUETA y deja
  // intacto el PÁRRAFO: el sistema entendía una cosa y le pedía otra al
  // modelo. Medido el 2026-09-06 leyendo conversation-engine.ts:2111.
  //
  // Ahora se entiende PRIMERO y el intent entendido entra al motor, así que
  // todo lo que el motor deriva sale de una sola lectura coherente.
  //
  // El servidor no cede nada de lo que importa: el precio, el enlace, la
  // ficha y la cuenta los sigue poniendo él, y los candados de salida siguen
  // corriendo después. Si el modelo no contesta, tarda o devuelve basura,
  // `entenderAlCliente` da null y el motor decide con los patrones de siempre.
  let entendimiento: Entendimiento | null = null;
  try {
    // El foco previo se arma con lo que YA es dato duro en este punto: el
    // producto del anuncio (resuelto por adId o link) y el que la conversación
    // arrastra. No depende de `decision`, que todavía no existe.
    const focoPrevio = productoEnFoco({
      aMostrar: delAnuncio ? ({ id: delAnuncio.id, name: delAnuncio.name } as any) : null,
      idActivo: memory.currentProductId,
      historial: memory.history as any,
      catalogo: productList as any[],
    });
    entendimiento = await entenderAlCliente({
      mensaje: String(lastText || ""),
      historial: memory.history as any,
      catalogo: (productList as any[]).map((p: any) => ({ id: p.id, name: p.name })),
      productoEnFocoId: focoPrevio?.id ?? null,
      tenantId: convo.tenantId,
    });
  } catch (e: any) {
    console.log(`[ENTENDER] no se pudo, se sigue con los patrones: ${e?.message} - ${ts()}`);
  }

  // Por debajo de 0.5 el motor sigue con sus patrones, que es exactamente lo
  // que hacía antes de que existiera esta capa.
  const mandaElEntendimiento = !!entendimiento && entendimiento.confianza >= 0.5;
  const intentEntendido = mandaElEntendimiento ? entendimiento!.intencion : null;
  if (!mandaElEntendimiento) {
    // Que se vea en test-ia: un turno sin lectura se decide con las listas.
    console.log(`🧠 [ENTENDER] sin lectura confiable (${entendimiento ? `confianza ${entendimiento.confianza}` : "null"}): deciden los patrones - ${ts()}`);
  }

  t1 = Date.now();
  const decision = await computeDecision(
    memory, textoDecision, productList, categoryMap, negocio, intentEntendido,
    mandaElEntendimiento ? entendimiento : null,
  );
  logTime(`5. Motor de decisión: ${Date.now() - t1}ms`);

  console.log(`🎯 [ENGINE-DECISION] ${decision.debugReason} - ${ts()}`);

  if (mandaElEntendimiento) {
    const en = entendimiento!;
    console.log(
      `🧠 [ENTENDER] ${en.intencion}/${en.subintencion ?? "-"} conf:${en.confianza} ` +
      `directo:${en.responderDirectamente} reformula:${en.reformulaPregunta} ` +
      `fallóAnterior:${en.respuestaAnteriorFallida} — ${en.esperando} - ${ts()}`,
    );
    console.log(
      `🧠 [LECTURA] nombró:[${en.productosNombrados.join(",")}] sobreElFoco:${en.sobreElFoco} ` +
      `noHay:${en.pideAlgoQueNoHay} pide:[${en.pide.join(",")}] - ${ts()}`,
    );
    // El producto SOLO se rellena si los patrones no encontraron ninguno.
    // Cuando ya hay uno resuelto por el servidor, ese manda: el modelo elige
    // mal el id seguido (visto: escribió 115 y 101 para el producto 124).
    if (!decision.productToShow && !decision.productoDelMensaje && en.productoId) {
      const p = (productList as any[]).find((x: any) => x.id === en.productoId);
      if (p) {
        (decision as any).productToShow = p;
        console.log(`🧠 [ENTENDER] el mensaje no nombra producto pero la conversación iba del ${p.id}: ${p.name} - ${ts()}`);
      }
    }
  }

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

    // Limitar catálogo a 100 productos (una línea por producto, ~50 chars) para
    // que la IA vea TODOS los IDs válidos. Antes MAX_CATALOG era 10 por miedo a
    // los proveedores free-tier, pero el catálogo compacto es barato (100
    // productos ≈ 5.000 chars) y con 10 la IA no podía recomendar productos
    // fuera de los primeros: "tenes el curso de mantenimiento de pc" no
    // encontraba el producto y el bot contestaba otra cosa.
    // El producto en foco siempre se incluye; el resto se llena desde el inicio de la lista.
    const MAX_CATALOG = 100;
    let catalogSlice = productList;
    if (productList.length > MAX_CATALOG) {
      // Con más de 100, los que el cliente NOMBRÓ en este mensaje van
      // primero: EXCEL (id 118) existía, activo, y el modelo contestó "de
      // Excel no manejamos curso" porque quedó fuera de los 100 primeros
      // (chat real, 12-09-2026). El servidor lo tenía identificado
      // (productoDelMensaje) y no se lo estaba mostrando.
      const palabras = new Set(String(lastText || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-zñ0-9]{4,}/g) ?? []);
      const nombrado = (p: any) => (String(p.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-zñ0-9]{4,}/g) ?? []).some((w) => palabras.has(w) && !/^(curso|cursos|pack|mega|megapack|completo|online|para|desde|hasta|nivel|todo|todos|combo)$/.test(w));
      const prioritarios: any[] = [];
      const meter = (id: number | null | undefined) => {
        if (typeof id !== "number") return;
        const p = productList.find((x) => x.id === id);
        if (p && !prioritarios.inclu…47291 tokens truncated…        // pueda distinguir el número verdadero de uno inventado.
        let cuentasDelNegocio: string[] = [];
        try {
          const { credencialesDe } = await import("./tenant-payment-credentials");
          const tReal = await tenantManager.getTenantById(convo.tenantId);
          cuentasDelNegocio = (credencialesDe(tReal as any)?.transfer?.accounts || [])
            .map((c: any) => String(c?.number || ""))
            .filter(Boolean);
        } catch (e: any) {
          logger.warn({ err: e?.message }, "[Supervisor] no se pudieron leer las cuentas del negocio");
        }

        let respondidoDeConocimiento = false;
        try {
          const idFoco = idsEnContexto[0] ?? null;
          // Lo que el dueño cargó desde Atlas para ESTE producto. Va primero:
          // él conoce su catálogo mejor que la tabla de fábrica, y sin esto un
          // cliente nuevo del SaaS no tiene ninguna respuesta propia.
          const { conocimientoCargado } = await import("./conocimiento-cargado");
          const cargadas = await conocimientoCargado(convo.tenantId, idFoco);
          // Mismo guardián que arriba: el conocimiento de fábrica es de cursos
          // digitales y no aplica a un producto FÍSICO (los datos de envío no
          // son una pregunta de "dispositivos" ni de "presencial").
          const kindFoco = (productList as any[]).find((p: any) => p.id === idFoco)?.kind ?? null;
          // Plural a propósito: el cliente suele encadenar dos preguntas en un
          // mismo mensaje y antes solo se contestaba la primera.
          // La respuesta escrita es la del producto EN FOCO. Si el cliente
          // preguntó por otra cosa que no tenemos ("el Renovador, ¿cómo me
          // llega?" con el Pack Idiomas en foco), contestarle "por un enlace
          // de acceso" es hablarle del producto equivocado (medido 13-09).
          const conocidas = decision.nombraOtroProducto ? [] : responderPreguntas(idFoco, lastText, 2, cargadas, kindFoco);
          if (decision.nombraOtroProducto) console.log(`📗 [CONOCIMIENTO] no aplica: la pregunta es sobre algo que no es el producto en foco - ${ts()}`);
          const conocida = conocidas.length
            ? {
                id: conocidas.map((c) => c.id).join("+"),
                texto: conocidas.map((c) => c.texto).join("\n\n"),
                sinResponder: conocidas.every((c) => c.sinResponder),
              }
            : null;
          // ── Solo se pisa al modelo si NO usó el dato ────────────────────
          //
          // El dato verificado ya viaja en el prompt (bloque 📗), así que lo
          // normal es que el modelo conteste con él, en sus palabras y atado a
          // lo que el cliente preguntó. Reemplazar SIEMPRE por el texto fijo
          // era lo que hacía sonar al agente como un contestador: la respuesta
          // pensada se descartaba aunque fuera mejor.
          //
          // El reemplazo queda como RED, no como regla: si el modelo ignoró el
          // dato --o improvisó uno propio-- se pone el verificado. Se compara
          // por las palabras con contenido del dato, no por el texto entero:
          // el modelo lo va a decir distinto, y eso es exactamente lo que se
          // busca.
          const yaLoDijo = (() => {
            if (!conocida || conocida.sinResponder) return false;
            const primeraParte = finalParts.find((p: any) => p.kind === "text");
            const dicho = String(primeraParte?.content || "").toLowerCase();
            if (!dicho) return false;
            const claves = conocida.texto
              .toLowerCase()
              .replace(/[^a-záéíóúñü0-9\s]/g, " ")
              .split(/\s+/)
              .filter((p) => p.length > 4);
            if (claves.length === 0) return false;
            const acertadas = claves.filter((c) => dicho.includes(c)).length;
            // La mitad de las palabras con contenido alcanza: si dice "7 días
            // de garantía" con otras palabras alrededor, contestó lo mismo.
            return acertadas / claves.length >= 0.5;
          })();

          if (conocida && yaLoDijo) {
            respondidoDeConocimiento = true;
            console.log(`📗 [CONOCIMIENTO] "${conocida.id}" — el modelo ya lo respondió con sus palabras, no se pisa - ${ts()}`);
          } else if (conocida) {
            const primera = finalParts.find((p: any) => p.kind === "text");
            if (primera) {
              // La apertura va PEGADA cuando la respuesta es de una línea.
              //
              // Con el salto doble, un dato de un renglón ocupaba tres bloques
              // ("Claro que sí 😊" / vacío / "Tienes 7 días de garantía…") y se
              // leía como un mensaje largo para algo simple. El admin lo dijo
              // así: "a veces se desborda al responder algo sencillo".
              //
              // Cuando la respuesta trae lista de viñetas, el bloque aparte sí
              // se lee mejor y se conserva.
            const apertura = aperturaPara(`${convo.contactPhone || ""}:${conocida.id}:${Date.now()}`);
              primera.content = conocida.texto.includes("\n")
                ? `${apertura}\n\n${conocida.texto}`
                : `${apertura} ${conocida.texto}`;
              respondidoDeConocimiento = true;
              console.log(
                `📖 [CONOCIMIENTO] "${conocida.id}"${conocida.sinResponder ? " (sin respuesta cargada)" : ""} - ${ts()}`,
              );
            }
          }
        } catch (e: any) {
          logger.warn({ err: e?.message }, "[Conocimiento] no se pudo resolver la pregunta");
        }

        for (const parte of finalParts) {
          if (parte.kind !== "text" || !parte.content) continue;
          // ⚠️ Acá decía `if (respondidoDeConocimiento) continue;` -- se
          // saltaba el supervisor ENTERO. El razonamiento era correcto a
          // medias: la RESPUESTA está verificada, sí. Pero dos cosas no.
          //
          // La primera es la apertura: no sale del conocimiento, la elige
          // `aperturaPara()`, y una de las que puede tocar es "Claro que sí".
          // Medido en la ronda 4 (2026-08-27) con el mismo mensaje que ya
          // había fallado en la ronda 3:
          //
          //   cliente: "me lo dejas en 30 mil? ... me devuelves la plata?
          //             ... tienes algo físico con envío a Quibdó?"
          //   bot:     "Claro que sí 😊 Tienes 7 días de garantía ✅"
          //
          // La regla que existe para eso (R10) estaba escrita y desplegada, y
          // no se ejecutó nunca porque este `continue` la saltaba.
          //
          // La segunda es que "verificado" habla de si el texto es CIERTO, no
          // de si viene al caso: acá contestó una de tres preguntas.
          //
          // Ahora se supervisa igual, avisando que el texto está verificado
          // para que no se revise su veracidad -- solo su pertinencia.
          const revision = supervisarRespuesta({
            respuesta: parte.content,
            respuestaVerificada: respondidoDeConocimiento,
            mensajeCliente: lastText,
            productos: productList as any,
            idsEnContexto,
            // La verdad del servidor: si no hay ficha, no se mandó nada, por
            // más que el texto diga "ya te lo mandé".
            llevaCard: hayCard,
            // Las cuentas de cobro REALES. Todo lo que el modelo escriba como
            // número de cuenta y no esté acá, es plata a una cuenta ajena.
            cuentasReales: cuentasDelNegocio,
            // Hay rubros donde regatear es como se vende. El default es no.
            negociaPrecio: negocio?.negociaPrecio === true,
            // Lo que YA se le mandó a este cliente. Sin esto el agente no
            // compara lo que va a decir contra lo que ya dijo -- y le ofrece
            // contarle el contenido que acaba de enviarle.
            yaEnviado: (memory.history as any[])
              .filter((m) => m.role !== "customer")
              .map((m) => String(m.content || "")),
          });

          if (revision.hallazgos.length === 0) continue;

          logger.warn(
            { conversationId, hallazgos: revision.hallazgos, bloquear: revision.bloquear, idsEnContexto },
            "[Supervisor] La respuesta no pasó la revisión",
          );
          console.log(
            `🔍 [SUPERVISOR] ${revision.hallazgos.map((h) => h.regla).join(", ")}` +
            `${revision.bloquear ? " (BLOQUEADA)" : ""} - ${ts()}`,
          );

          if (!revision.bloquear) {
            // Corregible: sale el texto ya saneado.
            parte.content = revision.texto;
            continue;
          }

          // Bloqueada: la respuesta afirma algo que el servidor sabe que no
          // corresponde -- otro producto, o una fórmula en vez de contestar.
          // Enviarla igual es lo que costó clientes, así que NO sale.
          //
          // No se regenera acá a propósito: otra llamada al modelo duplica la
          // latencia de CADA mensaje que falle y puede volver a equivocarse.
          // Sale un texto que no afirma nada, y la verdad la lleva la ficha,
          // que la elige el servidor. Sin ficha, se pregunta en vez de
          // inventar: preguntar una cosa concreta no pierde la venta;
          // contestar sobre el producto equivocado, sí.
          // Si la regla sabe cuál era la respuesta correcta, se usa esa: un
          // texto genérico a veces deja al cliente peor que antes.
          // ── Nunca dos veces la misma salida ────────────────────────────
          //
          // Medido el 2026-08-27: el supervisor bloqueó tres turnos seguidos y
          // las tres veces salió EXACTAMENTE el mismo texto. El cliente nombró
          // el producto, después pegó el nombre completo de la ficha, y recibió
          // la misma frase palabra por palabra. Se destrabó con un "hola".
          //
          // Cambiar una alucinación por un bucle no es arreglar: es mover el
          // problema. Un bucle además es peor, porque el cliente entiende que
          // del otro lado no hay nadie.
          //
          // Si la salida anterior ya fue un bloqueo, se escala: se le muestra
          // lo que sí se puede ofrecer en vez de repetir la pregunta.
          const ultimaDelAgente = [...(memory.history as any[])]
            .reverse()
            .find((m) => m.role !== "customer")?.content ?? "";
          const yaVeniaBloqueado = /dato equivocado|ficha aquí abajo con todos los detalles|Dejame verificarlo/i.test(
            String(ultimaDelAgente),
          );

          if (yaVeniaBloqueado) {
            const cercanos = (productList as any[]).slice(0, 5).map((p) => `• ${p.name}`).join("\n");
            parte.content = cercanos
              ? `Perdona, no te estoy entendiendo bien 🙏\n\nEstos son algunos de los cursos que tenemos:\n\n${cercanos}\n\n¿Alguno de estos, o buscas otra cosa?`
              : `Perdona, no te estoy entendiendo bien 🙏 ¿Me dices con otras palabras qué necesitas?`;
            console.log(`🔁 [SUPERVISOR] Segundo bloqueo seguido: se escala a menú en vez de repetir - ${ts()}`);
          } else {
            // ⚠️ No preguntar lo que el servidor YA SABE.
            //
            // Ronda 3 de QA (2026-08-27), dos veces en trece minutos: el bot
            // escribió "Para confirmarte el acceso AL CURSO DE PIANO…", el
            // cliente mandó el comprobante, y el turno siguiente salió con
            // "¿me confirmas de cuál producto quieres que te cuente?".
            //
            // El producto no se había perdido -- está en `idsEnContexto`, que
            // es lo mismo que acaba de usar el supervisor para revisar. Lo que
            // fallaba era el texto de salida: preguntaba de cuál producto se
            // hablaba teniéndolo en la mano. Para el cliente eso se lee como
            // que del otro lado no lo están escuchando, y es lo que hacía
            // parecer que el bot "arranca de cero en cada mensaje".
            // Se resuelve más abajo, cuando ya se eligió `idEnFoco`: antes
            // miraba `idsEnContexto[0]`, que podía ser otro producto distinto
            // del que se termina mandando -- el texto nombraba uno y la ficha
            // era de otro.
            // ── NO PROMETAS LO QUE NADIE VA A CUMPLIR ─────────────────────
            //
            // Acá decía "Déjame confirmarte ese dato del X y te respondo
            // enseguida 🙏". Visto en vivo el 2026-08-31: el cliente preguntó
            // "¿tienes curso de inteligencia artificial?", recibió esa frase,
            // y la conversación se murió ahí. No hay ningún mecanismo que
            // responda después -- no existe un trabajo pendiente, nadie avisa
            // al admin, nadie vuelve. Es una promesa rota por construcción, y
            // encima sobre una pregunta que el servidor SÍ podía contestar:
            // el producto estaba identificado, tenía su nombre en la mano.
            //
            // Cuando el supervisor bloquea lo que escribió el modelo, lo que
            // corresponde no es prometer: es mandar la FICHA, que la arma el
            // servidor con datos verificados y contesta "¿lo tenés?" mejor que
            // cualquier frase.
            // ── CUÁL ficha se manda: la que el cliente pidió ──────────────
            //
            // Acá estaba `idsEnContexto[0]`, y ese arreglo empieza por
            // `decision.productToShow` -- una elección del MODELO. Para un
            // mensaje sin producto nombrado ("?", "y eso", "cuánto") el modelo
            // igual elige alguno, y esa corazonada le ganaba al producto que
            // la conversación venía tratando.
            //
            // Conversación real (2026-09-01):
            //
            //   cliente: "Me interesa el curso de piano"
            //   bot:     "Te paso la ficha completa así lo miras con calma."   (y no mandó ninguna)
            //   cliente: "?"
            //   bot:     "¡Sí! Mira 👇" + [ficha de INTELIGENCIA ARTIFICIAL 2026]
            //
            // Preguntó por piano dos veces y recibió otro curso, anunciado con
            // un "¡Sí!" que da a entender que es lo que pidió. Peor que no
            // contestar: contradice al cliente con confianza.
            //
            // El orden correcto es el de la evidencia, de más fuerte a más
            // débil: lo que el cliente NOMBRÓ en este mensaje, después el
            // producto que la conversación viene tratando, y sólo al final la
            // elección del modelo.
            const idEnFoco =
              decision.productoDelMensaje?.id
              ?? memory.currentProductId
              ?? decision.productToShow?.id
              ?? idsEnContexto[0];
            // ¿Lo eligió el cliente, o lo estamos deduciendo? Si nadie lo
            // nombró y no es el producto en curso, mandarlo con un "¡Sí!" es
            // afirmar algo que no consta.
            const loPidioElCliente =
              typeof idEnFoco === "number"
              && (decision.productoDelMensaje?.id === idEnFoco || memory.currentProductId === idEnFoco);
            const yaLaVio = typeof idEnFoco === "number" && memory.sentProductIds?.has(idEnFoco);

            const nombreEnFoco = (productList as any[]).find((pr: any) => pr.id === idEnFoco)?.name;

            if (revision.reemplazoSugerido) {
              parte.content = revision.reemplazoSugerido;
            } else if (hayCard) {
              parte.content = "Te paso la ficha aquí abajo con todos los detalles 👇";
            } else if (nombreEnFoco && typeof idEnFoco === "number" && !yaLaVio && loPidioElCliente) {
              finalParts.push({ kind: "card", productId: idEnFoco, paymentOnly: false } as any);
              parte.content = `¡Sí! Mirá 👇`;
              console.log(`🧯 [SUPERVISOR] Bloqueó el texto: se manda la ficha de ${idEnFoco} (${nombreEnFoco}) en vez de prometer - ${ts()}`);
            } else if (nombreEnFoco && typeof idEnFoco === "number" && !yaLaVio) {
              // Hay un candidato, pero nadie lo nombró: se ofrece, no se afirma.
              finalParts.push({ kind: "card", productId: idEnFoco, paymentOnly: false } as any);
              parte.content = `¿Te referís al ${nombreEnFoco}? Te dejo la ficha 👇`;
              console.log(`🧯 [SUPERVISOR] Ficha de ${idEnFoco} (${nombreEnFoco}) ofrecida sin afirmar: el cliente no lo nombró - ${ts()}`);
            } else if (nombreEnFoco) {
              // Ya tiene la ficha delante: repetirla es el defecto que el admin
              // ya reportó ("me ofrece lo que acaba de mandarme"). Se pregunta
              // algo concreto, que sí lleva a alguna parte.
              parte.content = `Sí, tenemos el ${nombreEnFoco} 🙌 ¿Qué te gustaría saber puntualmente?`;
            } else {
              parte.content = "Para no darte un dato equivocado, ¿me confirmas de cuál producto quieres que te cuente?";
            }
          }
        }
      } catch (e: any) {
        // Un fallo del candado no puede dejar al cliente sin respuesta.
        logger.error({ err: e?.message }, "[Precios] fallo el verificador");
      }

      // ── Último filtro: el cliente lee colombiano ──────────────────────────
      //
      // El voseo lleva CUATRO rondas de QA sin caer, con la regla escrita en
      // mayúsculas en el prompt y con el prompt ya corregido. Medido después
      // de ese arreglo: "Si DECIDÍS comprar, te envío el link de pago".
      //
      // Pedirle al modelo no alcanza. Se traduce acá, que es lo único que en
      // este sistema funcionó siempre: lo que se puede decidir en el servidor,
      // se decide en el servidor.
      for (const parte of finalParts) {
        if (parte.kind === "text" && (parte as any).content) {
          // El voseo y los emojis se arreglan en el MISMO punto y por el mismo
          // motivo: las dos reglas estaban escritas en el prompt y el modelo
          // las cumple casi siempre -- casi. Medido sobre 109 mensajes: 11
          // llevaban 5 emojis o mas y 5 repetian el mismo tres veces.
          //
          // Solo se mide el texto que redacta el modelo. La ficha NO pasa por
          // aca: ahi un emoji por linea es el formato correcto y lo escribio
          // el dueño en la descripcion de cada producto.
          const medido = medirEmojis(hablarColombiano(String((parte as any).content)));
          if (medido.quitados > 0) {
            console.log(`[EMOJIS] Se quitaron ${medido.quitados} que sobraban - ${ts()}`);
          }
          (parte as any).content = medido.texto;
        }
      }

      // ── La ficha ya lo dice: el texto no lo repite ────────────────────────
      //
      // Reportado por el admin (2026-08-27): "le pregunté por el precio y
      // mandó una cantidad de cosas y repitió el precio".
      //
      // Es literal: el mensaje sale con DOS partes. El modelo redacta un texto
      // y el servidor adjunta la sección de la ficha -- y las dos traen el
      // precio. El cliente lee $60.000, después un párrafo, y otra vez
      // $60.000. A una pregunta de tres palabras.
      //
      // Ninguna de las dos partes está mal por separado; el problema es que
      // nadie miraba el mensaje COMPLETO. Así que acá se mira: si va una
      // sección corta -- de esas que ya se bastan solas -- el texto se recorta
      // a su primera frase y se le quitan los montos, que los pone la ficha.
      const seccionAdjunta = (finalParts.find((p: any) => p.kind === "card") as any)?.seccion;
      const SE_BASTA_SOLA = new Set(["precio", "pago", "pago_link", "pago_transferencia", "entrega", "video", "tienda"]);
      // ── La presentación también se basta sola ─────────────────────────
      //
      // Desde el 18-09-2026 la ficha "completa" es la presentación entera al
      // estilo del agente de Meta (título, frase, "Lo que incluye", entrega y
      // la pregunta de cierre). Medido ese día con el prompt reentrenado: el
      // modelo escribió SU propia ficha (con "Material PDF" y "Entrega
      // inmediata" inventados) y el cliente recibió las dos, una atrás de la
      // otra. Lo que Meta hace es un saludo de una línea y después la ficha:
      // del texto del modelo queda solo la primera frase que no sea una
      // viñeta ni una pregunta.
      const esPresentacion = seccionAdjunta === "completa"
        || (seccionAdjunta === "info" && !(finalParts.find((p: any) => p.kind === "card") as any)?.yaVioContenido);
      if (esPresentacion) {
        for (const parte of finalParts) {
          if (parte.kind !== "text" || !(parte as any).content) continue;
          const lineas = String((parte as any).content).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          const saludo = lineas
            // Ni viñetas (emoji o • al inicio), ni títulos en negrita, ni preguntas: eso lo trae la ficha.
            .filter((l) => !/^(?:[•\-*]|\p{Extended_Pictographic})/u.test(l) && !/^\*[^*]+\*$/.test(l) && !/[?¿]/.test(l))
            .map((l) => sinElMontoQueVaEnLaFicha(l).trim())
            .filter(Boolean)[0] || "";
          const primeraFrase = saludo.split(/(?<=[.!])\s+/)[0] || "";
          // Un saludo no trae cifras ni datos del producto. "Ideal para
          // aprender desde cero, 30 lecciones en video HD" (medido 18-09,
          // con 30 lecciones inventadas) no es un saludo: es la ficha del
          // modelo colada, y la ficha real viene debajo. Se descarta.
          const pareceDato = /\d|\b(m[oó]dulos?|lecciones?|clases?|horas?|video|acceso|drive|entrega|descarg\w*|incluye|partituras?)\b/i.test(primeraFrase);
          (parte as any).content = primeraFrase.length <= 160 && !pareceDato ? primeraFrase : "";
        }
        for (let i = finalParts.length - 1; i >= 0; i--) {
          if (finalParts[i].kind === "text" && !(finalParts[i] as any).content) finalParts.splice(i, 1);
        }
        console.log(`✂️ [DESBORDE] Presentación: del texto del modelo queda solo el saludo - ${ts()}`);
      }
      if (seccionAdjunta && SE_BASTA_SOLA.has(String(seccionAdjunta))) {
        for (const parte of finalParts) {
          if (parte.kind !== "text" || !(parte as any).content) continue;
          // El dato VA en la tarjeta adjunta: el texto no puede decir que no lo
          // tiene ni que lo va a confirmar. Chat real 19-09 15:14: "El precio
          // exacto te lo confirmo con el equipo, no lo tengo a mano" + tarjeta
          // con $60.000 en el mismo turno; y lo repitió al "Sí" con los medios
          // de pago. Se reemplaza por una frase de acompañamiento.
          if (/no lo tengo|no la tengo|te lo confirmo|te confirmo|lo confirmo con|con el equipo|no quiero pasarte|no tengo (?:el|ese) (?:dato|precio|valor)|en un momento te (?:paso|confirmo|digo)/i.test(String((parte as any).content))) {
            const sec = String(seccionAdjunta);
            const nombre = (() => { const c: any = finalParts.find((x: any) => x.kind === "card"); const pr = c?.productId ? (productList as any[]).find((x: any) => x.id === c.productId) : null; return pr?.name ? ` del ${pr.name}` : ""; })();
            (parte as any).content = sec === "precio"
              ? `Acá va el precio${nombre} 👇`
              : sec === "pago" || sec === "pago_link" || sec === "pago_transferencia"
                ? "Te dejo los medios de pago 👇 Apenas hagas el pago, mándame el comprobante y activo el acceso."
                : "Acá te lo dejo 👇";
            console.log(`🧹 [SERVIDOR] El texto decía que no tenía el dato que va en la tarjeta (${sec}): se reemplazó por una frase de acompañamiento - ${ts()}`);
          }
          // Sin viñetas ni títulos: a "Precio" el modelo mandaba la ficha entera
          // otra vez (título, 5 viñetas) y encima salía la sección con el
          // precio (reproducido en producción el 19-09-2026). Las líneas de
          // lista no tienen punto final, así que el corte por frases de abajo
          // las dejaba enteras.
          const original = String((parte as any).content)
            .split(/\r?\n/)
            .filter((l) => !/^\s*(?:[•\-*]|\p{Extended_Pictographic})/u.test(l) && !/^\s*\*[^*]+\*\s*$/.test(l))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          // ── Se descartan las frases del monto, no todo lo que venga después ─
          //
          // Antes esto se quedaba con la PRIMERA frase y tiraba el resto. Si
          // justo esa era la del precio --que es lo normal cuando el cliente
          // pregunta cuánto vale-- se descartaba, y como el resto ya se había
          // perdido, el mensaje quedaba vacío. Medido con el agente entero el
          // 2026-09-06:
          //
          //   cliente: "cuanto vale?"
          //   modelo:  "El curso vale *$60.000*, en un solo pago. 💰
          //             ¿Te queda alguna otra duda o lista para separar tu cupo?"
          //   cliente recibe: [solo la ficha, sin una palabra]
          //
          // La ficha traía el precio, así que el dato llegaba; lo que se perdía
          // era la conversación. Un mensaje que es solo una tarjeta se lee como
          // un folleto automático, que es justo lo que el dueño viene pidiendo
          // que no pase.
          //
          // Ahora se filtra frase por frase: la del monto se va (la ficha lo
          // dice) y lo demás se queda. El tope de dos mantiene el mensaje corto,
          // que era el objetivo original de este bloque.
          const frases = original.split(/(?<=[.!?])\s+/);
          const sobreviven = frases
            .map((f) => sinElMontoQueVaEnLaFicha(f).trim())
            .filter(Boolean);
          (parte as any).content = sobreviven.slice(0, 2).join(" ");
        }
        const antes = finalParts.length;
        for (let i = finalParts.length - 1; i >= 0; i--) {
          if (finalParts[i].kind === "text" && !(finalParts[i] as any).content) finalParts.splice(i, 1);
        }
        if (antes !== finalParts.length || true) {
          console.log(`✂️ [DESBORDE] Sección "${seccionAdjunta}": el texto se recortó para no repetir la ficha - ${ts()}`);
        }
      }

      // NOTA DE ORDEN: esto corre DESPUES del supervisor a proposito.
      //
      // Estaba antes, y no servia de nada: el supervisor, cuando bloquea el
      // texto del modelo, adjunta la ficha de `productoDelMensaje` -- que es
      // justo el producto mal casado-- y pisaba la correccion. Medido tres
      // veces contra produccion: la correccion se aplicaba y el resultado
      // seguia siendo el producto equivocado.
      //
      // Cualquier cosa que corrija la SALIDA tiene que correr despues de todo
      // lo que puede cambiarla.
      // -- UNA PREGUNTA SOBRE EL NEGOCIO NO CAMBIA DE PRODUCTO -----------
      //
      // Medido en produccion el 2026-09-01, hablando del curso de piano:
      //
      //   cliente: "¿tienes pagina web?"
      //   bot:     "Si, tenemos pagina web" + [ficha de DESARROLLO WEB]
      //
      // El modelo caso las palabras "pagina web" con el NOMBRE de otro curso
      // del catalogo y emitio su tarjeta. "¿tienes pagina web?", "¿cuanto
      // vale?" y "¿como pago?" son preguntas sobre lo que se viene hablando,
      // no pedidos de un producto nuevo.
      //
      // La regla: si el cliente NO nombro un producto y hay uno en foco, la
      // tarjeta es la del que esta en foco. Un cambio de producto de verdad
      // ('contame del de ingles') si llena `productoDelMensaje`, asi que
      // esos no entran aca.
      if (
        pideEntregable(entendimiento, String(lastText || ""))
        // El cliente no lo nombro, o lo que se creyo nombrado sale de las
        // palabras de la pregunta misma ("pagina web" -> el curso DESARROLLO
        // WEB). Las dos cosas significan lo mismo: no eligio otro producto.
        && (
          !decision.productoDelMensaje?.id
          || elProductoSaleDeLaPreguntaMisma(String(decision.productoDelMensaje?.name || ""), String(lastText || ""))
        )
        && typeof memory.currentProductId === "number"
        && !decision.nombraOtroProducto
      ) {
        for (const parte of finalParts as any[]) {
          if (parte.kind !== "card") continue;
          if (parte.productId === memory.currentProductId) continue;
          const traido = (productList as any[]).find((x: any) => x.id === parte.productId);
          const enFoco = (productList as any[]).find((x: any) => x.id === memory.currentProductId);
          console.log(`[FOCO] El modelo trajo "${traido?.name ?? parte.productId}" para una pregunta sobre "${enFoco?.name ?? memory.currentProductId}": se corrige - ${ts()}`);
          parte.productId = memory.currentProductId;
          cardProductId = memory.currentProductId;
        }
      }

      // -- LO DE ADENTRO NO SALE --------------------------------------------
      //
      // Pedido del admin: "seguridad para que no diga nada interno de la
      // aplicacion... son del dueño y nadie debe saber. Veo que a veces le
      // preguntan y dice cosas que no debe."
      //
      // Medido contra produccion antes de escribir esto:
      //   "¿eres un bot o una persona?"      -> "Soy Camila, una persona real"
      //   "¿que inteligencia artificial usas?" -> empezaba a contarlo
      //   "¿como esta hecha esta aplicacion?"  -> la describia
      //
      // Dos capas, porque cubren cosas distintas: la PREGUNTA (el cliente
      // pidio lo de adentro) y la RESPUESTA (el modelo lo solto sin que se lo
      // pidieran, contando de que esta hecho para justificar algo).
      {
        // El catalogo de ESTE negocio. Sin el, el guardia asume que nadie
        // vende tecnologia y le corta la conversacion a la academia de
        // programacion, al hosting y al curso de IA: medido el 2026-09-02,
        // 5 de 19 preguntas normales de cliente y 2 de 9 mensajes de venta.
        // Con el catalogo delante, el negocio siempre puede hablar de lo que
        // vende, y ningun dueño tiene que configurar nada en Atlas.
        const vocabNegocio = vocabularioDelNegocio(productList as any[]);
        const loQuePregunta = preguntaPorLoInterno(String(lastText || ""), vocabNegocio);
        const nombreDelBot = String((activeAgent as any)?.name || "").trim() || "el asistente";

        if (loQuePregunta) {
          // UNA respuesta, no una por cada parte. Antes este bucle le ponia la
          // misma frase a TODAS las partes de texto, asi que si el turno traia
          // dos o tres, al cliente le llegaba la misma linea repetida.
          console.log(`[INTERNO] Preguntaron por ${loQuePregunta}: se contesta sin delatar nada - ${ts()}`);
          const partes = finalParts as any[];
          const textos = partes.filter((p) => p.kind === "text" && String(p.content || "").trim());
          if (textos.length > 0) {
            textos[0].content = respuestaSegura(loQuePregunta, nombreDelBot);
            for (let i = partes.length - 1; i >= 0; i--) {
              if (partes[i].kind === "text" && partes[i] !== textos[0]) partes.splice(i, 1);
            }
          }
        } else {
          for (const parte of finalParts as any[]) {
            if (parte.kind !== "text" || !String(parte.content || "").trim()) continue;
            if (delataLoInterno(String(parte.content), vocabNegocio)) {
              console.log(`[INTERNO] La respuesta mencionaba algo de adentro: se reemplaza - ${ts()}`);
              parte.content = respuestaSegura("tripas", nombreDelBot);
            }
          }
        }
      }

      // -- ULTIMO CANDADO: no prometas lo que no va a salir -----------------
      //
      // Los cuatro defectos del 2026-09-01 eran el mismo defecto visto desde
      // cuatro lados: el texto anuncia una cosa y sale otra. Cada uno se
      // arreglo en su sitio, y esta bien. Pero haber arreglado cuatro veces lo
      // mismo en cuatro lugares distintos significa que faltaba el candado que
      // los cubre a todos -- nadie comparaba lo que el mensaje DICE contra lo
      // que el mensaje LLEVA.
      //
      // Corre al final, sobre lo que ya quedo decidido, porque la unica prueba
      // de que algo se entrega es que este en la salida.
      {
        const seccionQueSale = (finalParts.find((p: any) => p.kind === "card") as any)?.seccion ?? null;
        const hayFicha = finalParts.some((p: any) => p.kind === "card");
        const textos = finalParts
          .filter((p: any) => p.kind === "text")
          .map((p: any) => String(p.content || ""));

        for (const parte of finalParts as any[]) {
          if (parte.kind !== "text" || !String(parte.content || "").trim()) continue;
          const incumplidas = promesasIncumplidas(String(parte.content), {
            hayFicha, seccion: seccionQueSale, mensajes: textos,
          });
          if (!incumplidas.length) continue;

          const limpio = sinLaPromesa(String(parte.content), incumplidas);
          console.log(
            `[PROMESAS] El texto prometia ${incumplidas.map((x) => NOMBRE_DE_PROMESA[x]).join(", ")} y no sale en este turno: se quita la frase - ${ts()}`,
          );
          // Si al sacar la promesa no queda nada, mejor una pregunta honesta
          // que un mensaje mocho: el turno tiene que seguir la conversacion.
          // Si el cliente nombró algo que NO tenemos y el texto quedó vacío,
          // la pregunta genérica lo deja peor: le preguntó por el Renovador y
          // recibió "¿qué te gustaría saber?" (medido 13-09). Se le dice la verdad.
          parte.content = limpio
            || (decision.nombraOtroProducto
              ? "Ese producto no lo tengo en el catálogo 😕 Si querés, te cuento qué sí manejo o me decís qué buscás y te oriento."
              : "¿Qué te gustaría saber puntualmente? 🙌");
        }
      }

      console.log(`📋 [PARSER] partes:${finalParts.length} cards:${cardCount} - ${ts()}`);

      // ── Guardar mensaje del agente en BD ──────────────────────────────────
      const agentMeta = {
        intent: decision.intent,
        aiProvider: usedProvider,
        cardSent: cardCount > 0,
        // El producto en foco NO es solo el de la tarjeta enviada. Si el bot
        // respondió con texto sin tarjeta ("¿quieres que te pase la info?"), el
        // producto que el cliente NOMBRÓ en este mensaje (productoDelMensaje)
        // es lo que debe quedar en foco. Antes esto solo miraba la tarjeta o
        // productToShow, así que una respuesta sin tarjeta dejaba el foco vacío
        // y el "Si" de confirmación volvía al producto viejo del historial.
        productId: cardProductId || decision.productToShow?.id || decision.productoDelMensaje?.id,
        productName: cardProductId
          ? productList.find(p => p.id === cardProductId)?.name
          : decision.productToShow?.name || decision.productoDelMensaje?.name,
        isHardcoded: false,
        // ── QUÉ OFRECIÓ ESTA FICHA ────────────────────────────────────────
        //
        // El "¿Te muestro el video? 🎬" no viaja en una parte de texto: lo
        // arma la FICHA al enviarse. Y `textoGuardado` (más abajo) solo guarda
        // las partes de texto, así que en el historial quedaba nada más
        // "¡Claro que sí! Te paso la ficha…" y la oferta desaparecía.
        //
        // Consecuencia medida el 2026-08-31, con el mecanismo anti-checkout ya
        // escrito y sin poder actuar:
        //
        //   bot:     "💰 $60.000 COP — ¿Te muestro el video? 🎬"
        //   cliente: "Si"
        //   bot:     [los tres medios de pago]
        //
        // El detector busca la oferta con una expresión sobre el último
        // mensaje guardado del bot, y ahí no estaba. Guardarla en los metadatos
        // la vuelve un HECHO en vez de algo a adivinar sobre un texto que
        // además puede cambiar de redacción en cualquier momento.
        ofreceLaFicha: cardCount > 0 ? ofrecimientoDeLaFicha : undefined,
        // ── QUÉ VIDEO SALIÓ CON LA FICHA ─────────────────────────────────
        //
        // El video lo manda el render de la ficha, no una parte de texto, así
        // que en el historial no quedaba rastro: `elVideoYaSalio` nunca lo
        // encontraba y el cliente lo recibía en CADA ficha (chat real del
        // dueño, 13-09 07:11: video dos veces en el mismo minuto). Misma
        // condición que usa el render (whatsapp.ts): completa, o info cuando
        // ya vio el contenido, y solo si no salió antes.
        videoEnviado: (() => {
          const c = (finalParts as any[]).find((p: any) => p.kind === "card");
          if (!c) return undefined;
          const pr = (productList as any[]).find((x: any) => x.id === c.productId);
          const url = videoDeProductoSeguro(pr);
          if (!url || c.videoYaEnviado) return undefined;
          const sale = c.seccion === "completa" || c.seccion === "video" || (c.seccion === "info" && c.yaVioContenido);
          return sale ? url : undefined;
        })(),
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
      // ── Se guarda lo que SE ENVIÓ, no lo que el modelo escribió ───────────
      //
      // Acá se guardaba `raw`: el texto crudo, ANTES del supervisor. O sea que
      // la base conservaba justo la versión que se habia decidido no mandar.
      //
      // Y eso no es un problema de registro, es un problema que se retroalimenta:
      // el modelo lee los últimos 12 mensajes de la conversación para armar su
      // contexto. Si ahí está su propio texto SIN corregir, aprende del error
      // que el supervisor le tapó.
      //
      // Medido el 2026-08-26: el cliente vio "$60.000 COP" (corregido), pero en
      // la base quedó "💰 $149.000 COP" -- un precio que no existe en el
      // catálogo. En el turno siguiente el modelo lo lee como si fuera suyo y
      // bueno. Lo mismo con el voseo y con el número de Nequi inventado: se
      // bloqueaban al salir y volvían por la memoria.
      // ── EL PRECIO, VERIFICADO CONTRA LA FICHA QUE DE VERDAD SALE ─────────
      //
      // El candado de precios ya corre en el supervisor, pero ahí el producto
      // todavía puede no estar identificado -- y cuando `idsEnContexto` viene
      // vacío afloja el criterio de "tiene que ser el precio de ESTE producto"
      // a "de ALGÚN producto del catálogo". Con 140 productos eso no filtra
      // nada: casi toda cifra redonda es el precio de alguno.
      //
      // Medido contra producción el 2026-09-02. A "¿cuánto vale y cómo me
      // llega?" el bot contestó "💰 El valor es de $45.000 COP" sobre el curso
      // de $60.000. Los $45.000 son el precio de OTRO producto, y por eso
      // pasaron: quince mil pesos regalados.
      //
      // Acá abajo el dato ya no falta. La ficha está resuelta y corregida, así
      // que se sabe EXACTAMENTE de qué producto habla el mensaje, y el mismo
      // candado se puede aplicar en su versión estricta.
      //
      // Va acá y no antes por la regla que este proyecto ya pagó tres veces:
      // cualquier cosa que corrija la salida tiene que correr después de todo
      // lo que puede cambiarla. Y solo actúa cuando HAY ficha -- sin ficha no
      // se toca nada, porque borrar un precio que era correcto es el otro bug,
      // el de "💰 — pago único" sin el número.
      try {
        const idsDeLaFicha = finalParts
          .filter((p: any) => p.kind === "card")
          .map((p: any) => p.productId)
          .filter((n: any): n is number => typeof n === "number");

        if (idsDeLaFicha.length > 0) {
          for (const parte of finalParts as any[]) {
            if (parte.kind !== "text" || !String(parte.content || "").trim()) continue;
            const rev = verificarPrecios(String(parte.content), productList as any[], idsDeLaFicha);
            if (rev.inventados.length > 0) {
              console.log(
                `💰 [PRECIO] Monto que no es el de la ficha (${idsDeLaFicha.join(",")}): ${rev.inventados.join(", ")} - se saca la frase - ${ts()}`,
              );
              parte.content = rev.texto;
            }
          }
        }
      } catch (e) {
        console.log(`⚠️ [PRECIO] No se pudo verificar contra la ficha: ${String(e)} - ${ts()}`);
      }

      // ── DEL PRODUCTO SOLO SE AFIRMA LO QUE DICE SU FICHA ─────────────────
      //
      // Conversacion real del 2026-09-02, 09:45, sobre el curso de IA
      // (digital, con enlace de entrega):
      //
      //   "Modulo 1 - Fundamentos de IA / Modulo 2 - Herramientas esenciales
      //    Modulo 3 - Agentes autonomos / Modulo 4 - Proyectos practicos
      //    Pago contra entrega: pagas cuando recibes el material"
      //
      // Ese temario NO EXISTE: el curso real es "MASTER EN AGENTES IA, 39
      // modulos", "CLAUDE AI, 13 modulos", n8n, OpenClaw. Se invento un plan
      // de estudios y se lo describio al cliente como si fuera el producto. Y
      // un mensaje despues mando la ficha de verdad, contradiciendose solo.
      //
      // El "contra entrega" no venia del codigo: el agente activo lo tiene
      // escrito en SU PROMPT, en la base --"PAGO CONTRA ENTREGA... datos
      // FIJOS, nunca los cambies"--, una plantilla de dropshipping puesta
      // sobre un negocio de cursos. Ningun arreglo del camino de envios lo
      // podia tapar.
      //
      // Y ese es el punto: la personalidad del agente es un dato que escribe
      // el dueño, y puede estar mal. El servidor tiene que poder desmentirla
      // cuando contradice al producto. Un curso que llega por enlace no se
      // paga contra entrega, lo diga quien lo diga.
      try {
        const prodFicha = productoEnFoco({
          delMensaje: decision.productoDelMensaje as any,
          aMostrar: decision.productToShow as any,
          idActivo: memory.currentProductId,
          historial: memory.history as any,
          catalogo: productList as any[],
        });
        if (prodFicha) {
          for (const parte of finalParts as any[]) {
            if (parte.kind !== "text" || !String(parte.content || "").trim()) continue;
            let txt = String(parte.content);

            const inventadas = lineasDeTemarioInventadas(txt, prodFicha as any);
            if (inventadas.length > 0) {
              console.log(`📋 [FICHA] ${inventadas.length} linea(s) de temario que no estan en la ficha del producto ${(prodFicha as any).id}: se sacan - ${ts()}`);
              txt = sinElTemarioInventado(txt, prodFicha as any);
            }

            // Una garantía con días o porcentajes que nadie definió es una
            // promesa que el negocio después no puede cumplir. Se quita la
            // frase, no el mensaje (medido 19-09: "Garantía de 7 días, te
            // devolvemos el 100 %" sobre un negocio sin garantía cargada).
            {
              const { garantiaInventada, sinLaGarantiaInventada, frasesDeFormatoInventado, sinElFormatoInventado, limpiarLineasVacias } = await import("./desglose");
              // Portal, usuario y contraseña, PDFs, videos, módulos… solo si
              // la ficha o el negocio lo dicen. El modelo lo repitió aun con
              // la prohibición en el prompt (medido 19-09): se quita la frase.
              const formato = frasesDeFormatoInventado(txt, prodFicha as any, negocio as any);
              if (formato.length) {
                console.log(`🛡️ [FICHA] ${formato.length} frase(s) afirmaban un formato/plataforma que ni el producto ${(prodFicha as any).id} ni el negocio definen: se quitan - ${ts()}`);
                txt = sinElFormatoInventado(txt, prodFicha as any, negocio as any)
                  || "Lo que te puedo asegurar es lo que dice la ficha; el detalle de cómo se entrega te lo confirmo con el equipo 🙌";
              }
              if (garantiaInventada(txt, prodFicha as any, negocio as any)) {
                console.log(`🛡️ [FICHA] Afirmaba una garantía que ni el producto ${(prodFicha as any).id} ni el negocio definen: se quita la frase - ${ts()}`);
                // Lo que queda sin la promesa suele ser relleno ("entiendo tu
                // inquietud 😊", medido 19-09): se le suma la verdad, que es
                // lo único útil que se puede decir de una garantía sin definir.
                const restante = sinLaGarantiaInventada(txt);
                const honesto = "Sobre la garantía puntual te confirmo con el equipo y te escribo 🙌";
                txt = limpiarLineasVacias(/confirm|te escribo|con el equipo/i.test(restante) ? restante : [restante, honesto].filter(Boolean).join("\n\n"));
              }
            }

            if (prometeEntregaFisica(txt, prodFicha as any)) {
              console.log(`🚚 [FICHA] Prometia entrega fisica de un producto digital (${(prodFicha as any).id}): se corrige - ${ts()}`);
              const limpio = sinLaPromesaFisica(txt);
              txt = limpio ? `${limpio}

${comoSeEntregaDeVerdad(prodFicha as any)}` : comoSeEntregaDeVerdad(prodFicha as any);
            }

            if (txt.trim()) parte.content = txt;
          }
        }
      } catch (e: any) {
        console.log(`⚠️ [FICHA] No se pudo revisar contra la ficha: ${e?.message} - ${ts()}`);
      }

      // ── NADA DE LO QUE YA LEYO SE VUELVE A MANDAR ────────────────────────
      //
      // Medido el 2026-09-02: el cliente pidio "mas informacion" y recibio la
      // MISMA ficha que le habian mandado dos minutos antes, seguida del mismo
      // "Te paso el precio?" palabra por palabra.
      //
      // El guardia que ya existia tenia una excepcion para el cliente que pide
      // el video o el precio --cosas que todavia no vio-- y "tienes mas
      // informacion?" entraba por ahi. La excepcion se comia la regla.
      //
      // Va acá, sobre lo que esta por salir, porque la repeticion no llega por
      // un solo camino: la ficha viene del parser, el cierre de `invitacionDe`,
      // el saludo de su propia funcion. Cada uno con su regla y su hueco.
      // ── NI PIDAS PERMISO PARA LO QUE YA VA EN ESTE MISMO ENVIO ──────────
      //
      // Medido en produccion el 2026-09-05 a las 11:02: cuatro mensajes en el
      // mismo minuto, dos de ellos pidiendo permiso para algo que salio igual
      // dos renglones despues. El dueno: "se esta autorrespondiendo el mismo,
      // no espera".
      //
      // Va ANTES del guardia de lo repetido a proposito: si primero se quita la
      // pregunta sobrante, lo que queda es el texto que de verdad se compara
      // contra el historial. Al reves, una pregunta condenada podria salvar del
      // filtro a un mensaje que ya no aporta nada.
      try {
        const revisadoPermiso = sinPreguntarLoQueYaVa(finalParts as any[]);
        if (revisadoPermiso.quitadas > 0) {
          console.log(`[PERMISO] Se quitaron ${revisadoPermiso.quitadas} pregunta(s) que ofrecian lo que ya iba en el envio - ${ts()}`);
          finalParts.length = 0;
          (finalParts as any[]).push(...(revisadoPermiso.partes as any[]));
        }
      } catch (e: any) {
        console.log(`[PERMISO] No se pudo revisar: ${e?.message} - ${ts()}`);
      }

      try {
        const revisado = sinLoQueYaLeyo(finalParts as any[], memory.history as any);
        const quedaAlgo = (revisado.partes as any[]).some((p: any) => p.kind === "card" || String(p.content || "").trim());
        if (revisado.quitadas > 0 && !quedaAlgo) {
          // El cliente repitió la pregunta porque NO le contestaron (chat
          // real 13-09 13:19-13:20): quitarlo todo lo dejaba en silencio,
          // que es peor que repetir. Se manda igual.
          console.log(`🔁 [REPETIDO] Todo era repetido, pero callarse es peor: se manda igual - ${ts()}`);
        } else if (revisado.quitadas > 0) {
          console.log(`🔁 [REPETIDO] Se quitaron ${revisado.quitadas} parte(s) que el cliente ya habia leido - ${ts()}`);
          finalParts.length = 0;
          (finalParts as any[]).push(...revisado.partes);
        }

        // Y la ficha: si ya se envio y ademas hay texto nuevo, no se repite.
        // Sola si se deja -- un mensaje vacio es peor que una ficha repetida.
        const hayTexto = (finalParts as any[]).some((p: any) => p.kind === "text" && String(p.content || "").trim());
        if (hayTexto) {
          // Solo la ficha COMPLETA cuenta como repetida. Una sección que
          // ENTREGA algo (precio, pago, entrega, video, tienda) no es la ficha
          // otra vez: es lo que el cliente acaba de pedir. Medido el 13-09 con
          // la conversación 90 (cliente en EE.UU.): "¿qué cuesta?" → el texto
          // perdió el monto porque iba en la sección de precio, y acá la
          // sección se quitó por "repetida" → le llegó "Son ** (pesos
          // colombianos)". El cliente nunca supo el precio.
          const ENTREGA_ALGO = new Set(["precio", "pago", "pago_link", "pago_transferencia", "entrega", "video", "tienda"]);
          const repetidas = (finalParts as any[]).filter(
            (p: any) => p.kind === "card" && memory.sentProductIds?.has(p.productId) && !ENTREGA_ALGO.has(String(p.seccion || "")),
          );
          if (repetidas.length > 0 && decision.intent !== "payment_intent" && decision.intent !== "confirmation" && !decision.pidioReenvio) {
            console.log(`🔁 [REPETIDO] La ficha de ${repetidas.map((p: any) => p.productId).join(",")} ya la tenia: no se reenvia - ${ts()}`);
            const quedan = (finalParts as any[]).filter((p: any) => !repetidas.includes(p));
            finalParts.length = 0;
            (finalParts as any[]).push(...quedan);
          }
        }
      } catch (e: any) {
        console.log(`⚠️ [REPETIDO] No se pudo revisar: ${e?.message} - ${ts()}`);
      }

      const textoEnviado = finalParts
        .filter((p: any) => p.kind === "text" && p.content)
        .map((p: any) => p.content)
        .join("\n\n");
      const textoGuardado = (textoEnviado || raw)
        .replace(/\[CARD:\s*[^\]]*\]/gi, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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
            // La firma pide un Date, no su texto. Con `@ts-nocheck` esto pasaba
            // y del otro lado quedaba una fecha inservible.
            timestamp: new Date(),
          });
          // Marcar conversación como estado pagado
          await db.update(conversations)
            .set({ paymentStatus: 'pending', paymentMethod: memory.paymentMethod || null, paymentAmount: pPrice })
            .where(eq(conversations.id, conversationId));

          // SIN Purchase a Meta acá (2026-10-01): el pago está PENDIENTE, no
          // verificado, y mandarlo contaminaba la optimización de las campañas
          // (Meta aprendía de ventas que todavía no existían). El Purchase
          // sale solo desde un pago real vía `avisarCompraRealAMeta`
          // (lib/compra-verificada-meta.ts): webhooks de pasarela,
          // aprobación del comprobante o confirm_transfer_payment.
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
          // No se puede BORRAR el producto en foco con una respuesta que no
          // trae tarjeta. Antes `agentMeta.productId ?? null` ponía currentProductId
          // en null cada vez que el bot respondía con texto suelto (un saludo,
          // un "te paso la info"), así que el producto que se venía conversando
          // desaparecía y la confirmación siguiente ("Si") caía en el producto
          // viejo del historial. Si este turno no definió un producto nuevo,
          // se conserva el que ya estaba en contexto.
          currentProductId: agentMeta.productId ?? memory.currentProductId ?? null,
          currentProductName: agentMeta.productName ?? memory.currentProductName ?? null,
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
        // Qué modelo contestó de verdad. No es lo mismo que el elegido en el
        // panel: la cadena rota cuando uno falla, y sin esto no hay forma de
        // saber desde afuera si respondió el modelo bueno o el de respaldo.
        // Justo la pregunta que hubo que responder para entender por qué el
        // bot "hace lo que quiere" con un formato ya escrito.
        aiProvider: usedProvider,
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
        // El camino normal informa qué modelo contestó; el de emergencia
        // tiene que decir que NO contestó ninguno, no omitir el dato.
        aiProvider: "fallback",
        cardProductIds: [] as any[],
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
