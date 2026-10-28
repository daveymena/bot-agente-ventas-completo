Warning: truncated output (original token count: 77218)
Total output lines: 5358

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
  …65218 tokens truncated…e de texto: lo
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
