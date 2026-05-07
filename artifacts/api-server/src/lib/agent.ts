import { and, asc, desc, eq } from "drizzle-orm";
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
  executeWithFallback, 
  determineFallbackResponse, 
  retryWithBackoff,
  notifyOperatorOfFailure,
  areAIProvidersHealthy,
  arePaymentServicesHealthy,
  getSystemHealthSummary
} from "./fallbackSystem";
import { 
  analyzeCustomerObjection, 
  generateObjectionResponse,
  getStrategicSalesGuidance,
  type ObjectionAnalysis,
  type PersonalizationData,
  type EmotionalContext
} from "./objectionHandler";

// Context Intelligence Enhancement Types
interface ConversationContext {
  hasIntroduced: boolean;
  currentTopic: string | null;
  previousTopics: string[];
  leadBehavior: LeadBehaviorPattern;
  interactionCount: number;
  lastInteractionTime: Date | null;
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
  console.log(`🔄 [STAGE-ANALYSIS] Analizando etapa para conversación ${conversationId} - Etapa actual: ${convo.currentStage} - ${new Date().toISOString()}`);
  
  // ANALIZAR ETAPA PARA EL DASHBOARD
  let nextStage: string = convo.currentStage;
  const allTextLower = lastText.toLowerCase();

  console.log(`🔍 [STAGE-ANALYSIS] Mensaje del cliente: "${lastText.substring(0, 50)}" - ${new Date().toISOString()}`);

  if (allTextLower.includes("hola") || allTextLower.includes("buen")) {
    nextStage = "greeting";
    console.log(`👋 [STAGE-DETECTION] Saludo detectado - ${new Date().toISOString()}`);
  }
  if (allTextLower.includes("precio") || allTextLower.includes("cuanto") || allTextLower.includes("costo") || allTextLower.includes("informacion")) {
    nextStage = "qualification";
    console.log(`❓ [STAGE-DETECTION] Calificación detectada - ${new Date().toISOString()}`);
  }
  if (res.content.includes("[CARD:")) {
    nextStage = "presentation";
    console.log(`📋 [STAGE-DETECTION] Presentación detectada (tarjeta en respuesta) - ${new Date().toISOString()}`);
  }
  if (allTextLower.includes("pago") || allTextLower.includes("comprar") || allTextLower.includes("adquirir") || allTextLower.includes("cuenta") || allTextLower.includes("nequi")) {
    nextStage = "closing";
    console.log(`💰 [STAGE-DETECTION] Cierre detectado - ${new Date().toISOString()}`);
  }

  if (nextStage !== convo.currentStage) {
    console.log(`🔄 [STAGE-UPDATE] Actualizando etapa: ${convo.currentStage} → ${nextStage} - ${new Date().toISOString()}`);
    logger.info({ from: convo.currentStage, to: nextStage }, "[Stage] Actualizando etapa");
    await db.update(conversations)
      .set({ currentStage: nextStage })
      .where(eq(conversations.id, conversationId)); // now correctly typed as number
    console.log(`✅ [STAGE-UPDATE] Etapa actualizada exitosamente - ${new Date().toISOString()}`);
  } else {
    console.log(`➡️ [STAGE-UPDATE] Etapa sin cambios: ${convo.currentStage} - ${new Date().toISOString()}`);
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
 * Analyzes conversation history to build context intelligence.
 * Accepts dynamic product keyword map for tenant-aware topic detection.
 */
function analyzeConversationContext(history: any[], productKeywords: Record<string, string[]> = {}): ConversationContext {
  const agentMessages = history.filter(m => m.role === "assistant");
  const customerMessages = history.filter(m => m.role === "customer");
  
  // Check if agent has already introduced itself (generic check — looks for a greeting pattern)
  const hasIntroduced = agentMessages.length > 0 && agentMessages.some(m => {
    const c = m.content.toLowerCase();
    return c.includes("bienvenido") || c.includes("hola") || c.includes("buenas") || 
           c.includes("soy ") || c.includes("te habla") || c.includes("asesor") ||
           c.length > 30; // Any substantive agent response counts as introduced
  });

  // Analyze lead behavior patterns
  const leadBehavior = analyzeLeadBehaviorPattern(customerMessages);
  
  // Detect current and previous topics using tenant's actual catalog keywords
  const topicAnalysis = analyzeTopicProgression(history, productKeywords);
  
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
  const highInterestKeywords = ["necesito", "urgente", "cuando", "precio", "comprar", "adquirir"];
  const mediumInterestKeywords = ["interesa", "información", "detalles", "características"];
  const lowInterestKeywords = ["hola", "buenas", "que tal"];
  
  let interestLevel: 'low' | 'medium' | 'high' = 'low';
  if (highInterestKeywords.some(k => allText.includes(k))) {
    interestLevel = 'high';
  } else if (mediumInterestKeywords.some(k => allText.includes(k))) {
    interestLevel = 'medium';
  }

  // Count price inquiries
  const priceKeywords = ["precio", "costo", "valor", "cuanto", "pago", "pagar"];
  const priceInquiries = priceKeywords.reduce((count, keyword) => 
    count + (allText.match(new RegExp(keyword, 'g')) || []).length, 0
  );

  // Detect urgency indicators
  const urgencyKeywords = ["urgente", "rapido", "ya", "ahora", "inmediato", "pronto"];
  const urgencyIndicators = urgencyKeywords.filter(k => allText.includes(k));

  // Decision capacity indicators
  const highDecisionKeywords = ["compro", "quiero", "necesito", "decidido"];
  const lowDecisionKeywords = ["tal vez", "no se", "pensando", "viendo"];
  
  let decisionCapacity: 'low' | 'medium' | 'high' = 'medium';
  if (highDecisionKeywords.some(k => allText.includes(k))) {
    decisionCapacity = 'high';
  } else if (lowDecisionKeywords.some(k => allText.includes(k))) {
    decisionCapacity = 'low';
  }

  // Preferred products: detected generically from high-interest signals (tenant-agnostic)
  const preferredProducts: string[] = [];

  // Detect objection patterns
  const objectionKeywords = ["caro", "costoso", "mucho dinero", "no tengo", "presupuesto"];
  const objectionPatterns = objectionKeywords.filter(k => allText.includes(k));

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
 * Builds a dynamic keyword map from the tenant's actual product catalog.
 * Each product name generates keyword variants so topic detection works
 * for ANY business — not just TecnoVariedades.
 */
function buildDynamicKeywordMap(productList: { id: number; name: string; description?: string | null }[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const p of productList) {
    const nameLower = p.name.toLowerCase();
    const words = nameLower
      .replace(/[^\wáéíóúüñ ]/gi, " ")
      .split(" ")
      .filter(w => w.length > 3);
    if (words.length === 0) continue;
    // Key = first meaningful word (or full name if short)
    const key = words[0];
    if (!map[key]) map[key] = [];
    // Add all words and the full name as keywords
    map[key].push(...words, nameLower);
    // Also add significant words from description
    if (p.description) {
      const descWords = p.description.toLowerCase().split(" ").filter(w => w.length > 4).slice(0, 5);
      map[key].push(...descWords);
    }
    map[key] = [...new Set(map[key])];
  }
  return map;
}

/**
 * Analyzes topic progression and transitions in conversation.
 * Accepts a dynamic keyword map built from the tenant's product catalog.
 */
function analyzeTopicProgression(history: any[], productKeywords: Record<string, string[]>): { currentTopic: string | null, previousTopics: string[] } {
  const topics: string[] = [];
  
  for (const message of history) {
    const text = message.content.toLowerCase();
    for (const [topic, keywords] of Object.entries(productKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        topics.push(topic);
        break;
      }
    }
  }

  const uniqueTopics = [...new Set(topics)];
  const currentTopic = topics.length > 0 ? topics[topics.length - 1] : null;
  const previousTopics = uniqueTopics.slice(0, -1);

  return { currentTopic, previousTopics };
}

/**
 * Detects topic transitions between messages using tenant's catalog keywords.
 */
function detectTopicTransition(history: any[], currentMessage: string, productKeywords: Record<string, string[]>): TopicTransition | null {
  if (history.length === 0) return null;

  const topicAnalysis = analyzeTopicProgression([...history, { content: currentMessage, role: "customer" }], productKeywords);
  const previousAnalysis = analyzeTopicProgression(history, productKeywords);

  if (topicAnalysis.currentTopic !== previousAnalysis.currentTopic) {
    return {
      from: previousAnalysis.currentTopic,
      to: topicAnalysis.currentTopic || "general",
      confidence: 0.8,
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
    personalizedInstructions += "\nCONTEXTO DE PRESENTACIÓN: Ya te presentaste como Sofía anteriormente. NO te presentes de nuevo.\n";
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
  console.log(`🔍 [AGENT-START] runAgentReply iniciado para conversación ${conversationId} - ${new Date().toISOString()}`);
  
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!convo) {
    console.log(`❌ [AGENT-ERROR] Conversación ${conversationId} no encontrada - ${new Date().toISOString()}`);
    return null;
  }
  console.log(`📱 [AGENT-INFO] Conversación encontrada: ${convo.contactPhone}, Estado: ${convo.status}, Etapa: ${convo.currentStage} - ${new Date().toISOString()}`);

  const tenantId = convo.tenantId;

  // ── MULTI-TENANT AGENT RESOLUTION ──────────────────────────────────────
  // Priority: 1) Agent explicitly assigned to this conversation
  //           2) Active agent for this tenant
  //           3) Any active agent (global fallback — should not happen in prod)
  let activeAgent = null;

  if (convo.agentId) {
    const [assigned] = await db.select().from(agents).where(eq(agents.id, convo.agentId)).limit(1);
    if (assigned) {
      activeAgent = assigned;
      console.log(`🤖 [AGENT-INFO] Usando agente asignado a la conversación: ${assigned.name} (ID: ${assigned.id})`);
    }
  }

  if (!activeAgent && tenantId) {
    const [tenantAgent] = await db.select().from(agents)
      .where(and(eq(agents.isActive, true), eq(agents.tenantId, tenantId)))
      .orderBy(desc(agents.id))
      .limit(1);
    if (tenantAgent) {
      activeAgent = tenantAgent;
      console.log(`🤖 [AGENT-INFO] Usando agente activo del tenant ${tenantId}: ${tenantAgent.name} (ID: ${tenantAgent.id})`);
    }
  }

  if (!activeAgent) {
    // Fallback: any active agent (handles legacy rows without tenant_id)
    const [fallbackAgent] = await db.select().from(agents).where(eq(agents.isActive, true)).limit(1);
    if (fallbackAgent) {
      activeAgent = fallbackAgent;
      console.log(`⚠️ [AGENT-WARN] Fallback global: ${fallbackAgent.name} (sin tenant) - ${new Date().toISOString()}`);
    }
  }

  if (!activeAgent) {
    console.log(`❌ [AGENT-ERROR] No hay agente configurado para tenant ${tenantId} - ${new Date().toISOString()}`);
    return null;
  }
  // ────────────────────────────────────────────────────────────────────────

  const [appSettings] = await db.select().from(settingsTable).limit(1);

  // ── MULTI-TENANT PRODUCT CATALOG ────────────────────────────────────────
  const productFilter = tenantId
    ? and(eq(products.isActive, true), eq(products.tenantId, tenantId))
    : eq(products.isActive, true);
  const productList = await db.select().from(products).where(productFilter);
  console.log(`📦 [AGENT-INFO] Productos del tenant ${tenantId}: ${productList.length} - ${new Date().toISOString()}`);
  // ────────────────────────────────────────────────────────────────────────

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(25);

  console.log(`💬 [AGENT-INFO] Historial de mensajes cargado: ${history.length} mensajes - ${new Date().toISOString()}`);

  history.reverse(); // Ordenamos de más viejo a más nuevo para la IA

  // Build dynamic keyword map from tenant's actual product catalog
  const dynamicKeywordMap = buildDynamicKeywordMap(productList);

  // Context Intelligence Enhancement: Analyze conversation context with tenant catalog
  const conversationContext = analyzeConversationContext(history, dynamicKeywordMap);
  console.log(`🧠 [AGENT-ANALYSIS] Contexto analizado - Presentado: ${conversationContext.hasIntroduced}, Tema: ${conversationContext.currentTopic}, Interés: ${conversationContext.leadBehavior.interestLevel}, Estilo: ${conversationContext.leadBehavior.communicationStyle} - ${new Date().toISOString()}`);
  
  logger.info({ 
    conversationId, 
    hasIntroduced: conversationContext.hasIntroduced,
    currentTopic: conversationContext.currentTopic,
    interestLevel: conversationContext.leadBehavior.interestLevel,
    emotionalState: conversationContext.leadBehavior.emotionalState.sentiment,
    communicationStyle: conversationContext.leadBehavior.communicationStyle
  }, "[Agent] Context analysis completed");

  const productsBlock = productList
    .map((p) => `PRODUCTO_ID=${p.id} | USAR: [CARD: ${p.id}] | ${p.name} | ${formatPrice(Number(p.price), p.currency)} | ${p.description || ""}`)
    .join("\n");

  const pg = new PaymentGateway();
  const lastCustomerMsg = [...history].reverse().find(m => m.role === "customer");
  const lastText = lastCustomerMsg?.content.toLowerCase() || "";
  
  // ── DYNAMIC PRODUCT SEARCH — must happen before payment section ──────────
  // Universal: searches the tenant's own catalog, no hardcoded IDs or names
  const commonGreetingsEarly = ["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "hola!", "hola.", "que tal", "como estas", "hi", "hey"];
  const searchTermsEarly = lastText.toLowerCase()
    .split(/[\s,]+/)
    .filter(w => w.length > 3 && !commonGreetingsEarly.includes(w));

  let productForRequest = searchTermsEarly.length > 0
    ? (productList.find(p => lastText.includes(p.name.toLowerCase()))
        || productList.find(p => {
          const nameLower = p.name.toLowerCase();
          return searchTermsEarly.some(term => nameLower.includes(term));
        }))
    : null;
  // ────────────────────────────────────────────────────────────────────────

  // Context Intelligence Enhancement: Detect topic transitions (tenant-aware)
  const topicTransition = detectTopicTransition(history.slice(0, -1), lastText, dynamicKeywordMap);
  if (topicTransition) {
    console.log(`🔄 [AGENT-TRANSITION] Cambio de tema: ${topicTransition.from || 'ninguno'} → ${topicTransition.to} - ${new Date().toISOString()}`);
    logger.info({ conversationId, transition: topicTransition }, "[Agent] Topic transition detected");
  }
  
  // ── PAYMENT LINK GENERATION ─────────────────────────────────────────────
  // Detects payment intent and generates links for the identified product
  let paymentInfo = "";
  const paymentKeywords = ["pago", "pagar", "comprar", "transferencia", "nequi", "daviplata", "adquirir", "compro", "cuenta", "precio", "valor", "link", "enlace", "pay", "purchase"];
  if (paymentKeywords.some(k => lastText.includes(k))) {
    console.log(`💳 [AGENT-PAYMENT] Solicitud de pago detectada: "${lastText.substring(0, 50)}" - ${new Date().toISOString()}`);
    
    // Priority: 1) exact name in message, 2) product from context, 3) ask for clarification
    let paymentProduct = productList.find(p => lastText.includes(p.name.toLowerCase()))
      || productForRequest
      || (conversationContext.currentTopic
          ? productList.find(p => p.name.toLowerCase().includes(conversationContext.currentTopic!.toLowerCase()) && conversationContext.currentTopic!.length > 4)
          : null);

    if (paymentProduct) {
      console.log(`✅ [AGENT-PAYMENT] Producto para pago: ${paymentProduct.name} (ID: ${paymentProduct.id}) - ${new Date().toISOString()}`);
      try {
        if (!arePaymentServicesHealthy()) {
          paymentInfo = `\n━━━━━━━━━━━━━━━━━━━━━━━━\n💳 *PAGO — ${paymentProduct.name}*\n━━━━━━━━━━━━━━━━━━━━━━━━\nEstoy generando tu enlace de pago. Te lo envío en un momento. ⏳`;
        } else {
          const links = await retryWithBackoff(
            () => pg.getAllLinks(paymentProduct!, { phone: convo.contactPhone, name: convo.contactName }),
            { maxRetries: 2, baseDelay: 1000 },
            `payment_links_${paymentProduct!.id}_${conversationId}`
          );
          console.log(`🔗 [AGENT-PAYMENT] Links para ${paymentProduct.name} — MP: ${!!links.mercadopago?.url}, PayPal: ${!!links.paypal?.url}`);
          
          // Build payment block — only shows methods that are configured
          const paymentLines: string[] = [];
          if (links.transfer?.options?.[0]?.number) {
            paymentLines.push(`📍 *Transferencia (Nequi/Daviplata):* ${links.transfer.options[0].number}`);
            paymentLines.push(`👤 *Titular:* ${links.transfer.options[0].name || ""}`);
          }
          if (links.mercadopago?.url) {
            paymentLines.push(`\n🔸 *Tarjeta / PSE (MercadoPago):*\n${links.mercadopago.url}`);
          }
          if (links.paypal?.url) {
            paymentLines.push(`\n🔸 *PayPal (USD):*\n${links.paypal.url}`);
          }
          
          paymentInfo = `\n━━━━━━━━━━━━━━━━━━━━━━━━\n💳 *PAGO — ${paymentProduct.name}*\n━━━━━━━━━━━━━━━━━━━━━━━━\n${paymentLines.join("\n")}\n━━━━━━━━━━━━━━━━━━━━━━━━\nEnvía tu comprobante de pago aquí mismo para confirmar tu acceso. ✅`;
        }
      } catch (error) {
        console.error(`❌ [AGENT-PAYMENT] Error generando links:`, error);
        paymentInfo = `\n💳 Estoy preparando tu enlace de pago para *${paymentProduct.name}*. Dame un instante. ⏳`;
      }
    } else {
      paymentInfo = `\n━━━━━━━━━━━━━━━━━━━━━━━━\n💳 Para enviarte el enlace de pago correcto, ¿me confirmas cuál producto o servicio te interesa?\n━━━━━━━━━━━━━━━━━━━━━━━━`;
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // Context Intelligence Enhancement: Generate personalized context
  const personalizedContext = generatePersonalizedContext(conversationContext, lastText);

  // Universal agent name and brand — pulled from active DB agent, never hardcoded
  const agentName = activeAgent?.name || "Sofía";
  const agentTone = (activeAgent as any)?.tone || "professional";
  const agentRole = (activeAgent as any)?.role || "sales";
  const dbSystemPrompt = activeAgent?.systemPrompt || "";

  // Universal base prompt — adapts to any business/agent from DB
  const universalBasePrompt = dbSystemPrompt ? `${dbSystemPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━
🚫 REGLA DE ORO: LA CARD LO DICE TODO
━━━━━━━━━━━━━━━━━━━━━━━━
1. LA CARD ES LA FUENTE OFICIAL: Toda la info técnica está en [CARD: ID]. NO la repitas en texto.
2. FLUJO CORRECTO: Texto elegante → [CARD: ID] → Pregunta de cierre (máx 1 línea).
3. DESPUÉS DE LA CARD: Solo una pregunta de cierre corta.
4. PROHIBIDO inventar contenido, beneficios o características que no estén en la descripción del catálogo.

━━━━━━━━━━━━━━━━━━━━━━━━
🧠 CÓRTEX DE RAZONAMIENTO UNIVERSAL
━━━━━━━━━━━━━━━━━━━━━━━━
1. ANALIZA: Entiende la intención detrás de cada palabra. ¿El cliente tiene miedo? ¿Tiene prisa? ¿Busca valor?
2. CONCIENCIA: Eres ${agentName}. Cada mensaje debe acercar al cliente al cierre o resolver su necesidad real.
3. EMPATÍA COGNITIVA: Adapta tu tono (${agentTone}) al estado emocional detectado.
4. ROL: Eres un agente de ${agentRole}. Actúa siempre desde ese rol.
5. RAZONA: Si el cliente objeta, entiende el porqué y ofrece soluciones basadas en el catálogo real.

━━━━━━━━━━━━━━━━━━━━━━━━
✨ FORMATO VISUAL OBLIGATORIO ✨
━━━━━━━━━━━━━━━━━━━━━━━━
CADA mensaje DEBE:
1️⃣ Empezar con ━━━━━━━━━━━━━━━━━━━━━━━━
2️⃣ Tener un emoji temático y título en negrita
3️⃣ Terminar con ━━━━━━━━━━━━━━━━━━━━━━━━
4️⃣ Dejar línea en blanco entre secciones. Sin párrafos densos.
REGLA ABSOLUTA: Ningún mensaje puede ser texto plano sin formato.` :
  `Eres ${agentName}, un agente de ventas especializado. No eres un bot, eres un profesional que entiende el arte de la persuasión y el valor de cada proceso.

━━━━━━━━━━━━━━━━━━━━━━━━
🧠 RAZONAMIENTO DE ÉLITE
━━━━━━━━━━━━━━━━━━━━━━━━
1. ANALIZA: Entiende la intención detrás de cada palabra del cliente.
2. EMPATÍA: Adapta tu tono y comunicación al estado emocional detectado.
3. CATÁLOGO: Usa [CARD: ID] para mostrar productos. NUNCA repitas en texto lo que ya dice la tarjeta.
4. CIERRE: Cada mensaje debe acercar al cliente a la decisión de compra.

━━━━━━━━━━━━━━━━━━━━━━━━
✨ FORMATO VISUAL OBLIGATORIO ✨
━━━━━━━━━━━━━━━━━━━━━━━━
CADA mensaje DEBE:
1️⃣ Empezar con ━━━━━━━━━━━━━━━━━━━━━━━━
2️⃣ Tener un emoji temático y título en negrita
3️⃣ Terminar con ━━━━━━━━━━━━━━━━━━━━━━━━
REGLA ABSOLUTA: Ningún mensaje puede ser texto plano sin formato.`;

  const systemPrompt = `${universalBasePrompt}

${productList.length > 0 ? `📦 CATÁLOGO DISPONIBLE:\n${productsBlock}` : ""}

${personalizedContext}`.trim();

  console.log(`📝 [AGENT-PROMPT] Prompt del sistema generado - Longitud: ${systemPrompt.length} caracteres - ${new Date().toISOString()}`);

  // ── GREETING DETECTION ─────────────────────────────────────────────────
  const commonGreetings = commonGreetingsEarly; // reuse already-defined list
  const isGreetingOnly = commonGreetings.some(k => lastText.trim().toLowerCase().includes(k)) && lastText.split(' ').length <= 5;

  // ── STAGE-AWARE PROMPTING from agent.stages in DB ─────────────────────
  // Map conversation current stage → agent's configured stage prompt
  const currentStage = convo.currentStage || "greeting";
  const agentStages = (activeAgent as any).stages as Array<{ key: string; name: string; prompt: string }> | null;
  const matchingStage = agentStages?.find(s =>
    s.key === currentStage ||
    s.key.toLowerCase().includes(currentStage.toLowerCase()) ||
    currentStage.toLowerCase().includes(s.key.toLowerCase())
  );
  const stageInstruction = matchingStage
    ? `\n\n📍 INSTRUCCIÓN DE ETAPA (${matchingStage.name.toUpperCase()}): ${matchingStage.prompt}`
    : "";

  const baseSystemPrompt = systemPrompt;
  let finalPrompt = "";
  let responsePrefill = "";

  if (isGreetingOnly && !conversationContext.hasIntroduced) {
    // ── PRIMERA VEZ: Presentación adaptada al negocio del tenant ──────────
    console.log(`👋 [AGENT-STRATEGY] Primer contacto - Presentación de ${agentName} (tenant ${tenantId}) - ${new Date().toISOString()}`);
    const greetingStage = agentStages?.find(s => s.key === "greeting" || s.key === "hook" || s.key === "bienvenida");
    const greetingInstruction = greetingStage?.prompt
      || `Preséntate como ${agentName}. Menciona qué ofreces según tu perfil. Pregunta en qué puedes ayudar. Máx 4 líneas. Sin tarjetas [CARD].`;
    finalPrompt = baseSystemPrompt + `\n\n🚨 PRIMERA VISITA: ${greetingInstruction}\nPROHIBIDO enviar tarjetas [CARD: ID] en este mensaje.`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n👋 *¡BIENVENIDO/A!* 😊\n\n`;

  } else if (isGreetingOnly && conversationContext.hasIntroduced) {
    // ── CLIENTE RECURRENTE ─────────────────────────────────────────────────
    console.log(`👋 [AGENT-STRATEGY] Cliente recurrente - Saludo sin presentación - ${new Date().toISOString()}`);
    finalPrompt = baseSystemPrompt + `\n\n🚨 CLIENTE RECURRENTE: Ya te conoce. Saluda con calidez y pregunta en qué puedes ayudar. Máx 2 líneas. Sin tarjetas [CARD].`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n👋 *¡Qué gusto verte de nuevo!* 🌟\n\n`;

  } else if (productForRequest) {
    // ── PRODUCTO IDENTIFICADO ──────────────────────────────────────────────
    console.log(`🎯 [AGENT-STRATEGY] Producto identificado: ${productForRequest.name} (ID: ${productForRequest.id}) - ${new Date().toISOString()}`);
    finalPrompt = baseSystemPrompt + stageInstruction + `\n\n🚨 ACCIÓN: Presenta "${productForRequest.name}" con entusiasmo. Envía [CARD: ${productForRequest.id}] en línea sola. Cierra con UNA pregunta de cierre.`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n✨ *PARA TI*\n\n`;

  } else {
    // ── CONVERSACIÓN REGULAR ──────────────────────────────────────────────
    console.log(`💬 [AGENT-STRATEGY] Conversación regular, etapa: ${currentStage} - ${new Date().toISOString()}`);
    finalPrompt = baseSystemPrompt + stageInstruction + `\n\n🚨 REGLA: Responde con formato visual (separadores + emojis). Rol: ${agentRole}. Tono: ${agentTone}.`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n💬 *${agentName.toUpperCase()}*\n\n`;
  }

  const chatMessages = [
    ...history.map(m => ({
      role: m.role === "customer" ? "user" : "assistant",
      content: m.content
    })),
    {
      role: "system",
      content: finalPrompt + `\n\n🚨 REGLA FINAL: (1) Sin saludos repetidos si ya te presentaste. (2) NUNCA repitas texto técnico que ya está en [CARD: ID]. (3) Adapta tu respuesta al rol "${agentRole}" y tono "${agentTone}".`
    },
    ...(responsePrefill ? [{ role: "assistant", content: responsePrefill }] : [])
  ];

  console.log(`🤖 [AGENT-AI] Preparando llamada a IA - Mensajes: ${chatMessages.length}, Prompt final: ${finalPrompt.length} caracteres - ${new Date().toISOString()}`);

  // Error Resilience Enhancement: Enhanced AI provider rotation with comprehensive fallback
  const customerInfo = { name: convo.contactName, phone: convo.contactPhone };
  
  const result = await executeWithFallback(
    async () => {
      console.log(`🔄 [AGENT-AI] Iniciando rotación de proveedores de IA - ${new Date().toISOString()}`);
      // Enhanced provider rotation with health checking
      const rotationQueue = [];
      
      // PRIORITY 1: GitHub (GPT-4o-mini) - Ultra rápido y estable
      const envConfig = getProviderConfig("github");
      if (envConfig) {
        rotationQueue.push({ config: envConfig, source: "environment" });
        console.log(`🌍 [AGENT-AI] Priorizando GitHub (GPT-4o-mini): ${envConfig.model} - ${new Date().toISOString()}`);
      }

      // PRIORITY 2: Database Settings (Configuración manual del Dashboard)
      const dbConfig = appSettings ? getProviderConfigFromSettings(appSettings) : null;
      if (dbConfig && dbConfig.apiKey !== envConfig?.apiKey) {
        rotationQueue.push({ config: dbConfig, source: "database" });
        console.log(`📊 [AGENT-AI] Proveedor de BD agregado como respaldo: ${dbConfig.model} - ${new Date().toISOString()}`);
      }

      // PRIORITY 3: NVIDIA (Reserva pesada, puede ser lento)
      const nvidiaConfig = getProviderConfig("nvidia");
      if (nvidiaConfig && nvidiaConfig.apiKey !== envConfig?.apiKey) {
        rotationQueue.push({ config: nvidiaConfig, source: "nvidia" });
        console.log(`🟢 [AGENT-AI] Proveedor NVIDIA agregado como última opción: ${nvidiaConfig.model} - ${new Date().toISOString()}`);
      }

      // Check if any AI providers are healthy
      if (!areAIProvidersHealthy()) {
        console.log(`⚠️ [AGENT-WARNING] Todos los proveedores de IA parecen no saludables, intentando de todos modos - ${new Date().toISOString()}`);
        logger.warn({ conversationId }, "[Agent] All AI providers appear unhealthy, attempting anyway");
      }

      let raw = "";
      let lastError: Error | null = null;
      
      // 🚀 DYNAMIC FIRST-TIME GREETING using agent data from DB
      if (isGreetingOnly && !conversationContext.hasIntroduced) {
        console.log(`⚡ [AGENT-FAST-TRACK] Generando presentación dinámica para ${agentName} - ${new Date().toISOString()}`);
        // Build greeting dynamically from agent stages or system prompt
        const stages = (activeAgent as any)?.stages as Array<{ key: string; prompt: string }> | null;
        const greetingStage = stages?.find(s => s.key === "greeting" || s.key === "hook");
        const greetingHint = greetingStage?.prompt || `Saluda como ${agentName}. Sé breve (máx 4 líneas). Pregunta en qué puede ayudar.`;
        
        // Use AI for greeting so it adapts to the business — still fast via provider rotation
        finalPrompt = baseSystemPrompt + `\n\n🚨 INSTRUCCIÓN: ${greetingHint}\nPROHIBIDO enviar tarjetas [CARD: ID] en este mensaje.`;
        responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n👋 *¡BIENVENIDO/A!* 😊\n\n`;
      } else if (isGreetingOnly && conversationContext.hasIntroduced) {
        console.log(`⚡ [AGENT-FAST-TRACK] Enviando saludo recurrente para ${agentName} - ${new Date().toISOString()}`);
        raw = `━━━━━━━━━━━━━━━━━━━━━━━━
👋 *¡Qué gusto verte de nuevo!* 🌟

¡Hola! Es un verdadero placer saludarte nuevamente. 😊
¿En qué te puedo ayudar el día de hoy?
━━━━━━━━━━━━━━━━━━━━━━━━`;
      } else {
        for (const { config, source } of rotationQueue) {
          try {
            console.log(`🎯 [AGENT-AI] Intentando proveedor: ${source} (${config.model}) - ${new Date().toISOString()}`);
            logger.debug({ 
              conversationId, 
              provider: source, 
              model: config.model 
            }, "[Agent] Attempting AI provider");
          
          const client = createAIClient(config);
          const completion = await retryWithBackoff(
            () => client.chat.completions.create({
              model: config.model,
              messages: chatMessages as any,
              temperature: 0.7,
              presence_penalty: 0.6, // Evita repeticiones
            }),
            { maxRetries: 1, baseDelay: 500 }, // Quick retries for each provider
            `AI_completion_${source}_conversation_${conversationId}`
          );
          
          raw = completion.choices[0]?.message?.content?.trim() ?? "";
          if (raw) {
            console.log(`✅ [AGENT-AI] Respuesta generada exitosamente con ${source} - Longitud: ${raw.length} caracteres - ${new Date().toISOString()}`);
            logger.info({ 
              conversationId,
              provider: source,
              response: raw.slice(0, 100),
              contextApplied: {
                hasIntroduced: conversationContext.hasIntroduced,
                topicTransition: topicTransition?.to,
                interestLevel: conversationContext.leadBehavior.interestLevel
              }
            }, "[Agent] Context-aware response generated successfully");
            break;
          }
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.log(`❌ [AGENT-ERROR] Proveedor ${source} falló: ${lastError.message} - ${new Date().toISOString()}`);
          logger.warn({ 
            conversationId, 
            provider: source, 
            error: lastError.message 
          }, "[Agent] Provider failed, trying next");
        }
        }
      }

      if (!raw) {
        console.log(`💥 [AGENT-CRITICAL] Todos los proveedores de IA fallaron - ${new Date().toISOString()}`);
        throw lastError || new Error("All AI providers failed to generate response");
      }

      // Prepend prefill so the final message starts with the formatted header
      if (responsePrefill && raw && !raw.startsWith("━")) {
        raw = responsePrefill + raw;
      }

      // Parser con validador inteligente de IDs

      const re = /\[CARD:\s*([\w-]+)\s*\]/gi;
      const parts: any[] = [];
      let lastIndex = 0;
      let m;
      let cardCount = 0;
      
      // Build a Set of valid IDs for fast lookup
      const validIds = new Set(productList.map(p => p.id));

      // Smart ID resolver: if the AI-generated ID doesn't exist, find closest product by name
      const resolveCardId = (rawId: string): number | string => {
        const numId = Number(rawId);
        if (!isNaN(numId) && validIds.has(numId)) {
          return numId; // exact match — trust it
        }
        
        // AI made up an ID — try fuzzy match
        // 1. Try with last customer message
        // 2. Try with conversation topic (context)
        const searchTerm = (lastText + " " + (conversationContext.currentTopic || "")).toLowerCase();
        
        const matched = productList.find(p =>
          p.name.toLowerCase().split(' ').some(word => word.length > 3 && searchTerm.includes(word))
        );

        if (matched) {
          console.log(`🔧 [AGENT-PARSER] ID inválido "${rawId}" → corregido a ${matched.id} (${matched.name}) usando contexto: "${searchTerm}"`);
          return matched.id;
        }
        
        console.log(`⚠️ [AGENT-PARSER] ID inválido "${rawId}" sin coincidencia en contexto "${searchTerm}" — descartando tarjeta`);
        return -1; // sentinel for "discard"
      };

      console.log(`🔍 [AGENT-PARSER] Analizando respuesta para tarjetas - Texto: "${raw.substring(0, 100)}..." - ${new Date().toISOString()}`);
      
      while ((m = re.exec(raw)) !== null) {
        if (raw.slice(lastIndex, m.index).trim()) {
          parts.push({ kind: "text", content: raw.slice(lastIndex, m.index).trim() });
        }
        
        const resolvedId = resolveCardId(m[1]);
        if (resolvedId !== -1) {
          parts.push({ kind: "card", productId: resolvedId });
          cardCount++;
        }
        lastIndex = m.index + m[0].length;
      }
      if (raw.slice(lastIndex).trim()) {
        parts.push({ kind: "text", content: raw.slice(lastIndex).trim() });
      }

      console.log(`📋 [AGENT-PARSER] Respuesta procesada - Partes: ${parts.length}, Tarjetas: ${cardCount}, Texto final: ${parts.filter(p => p.kind === "text").length} segmentos - ${new Date().toISOString()}`);

      const processingTime = Date.now() - startTime;
      console.log(`⏱️ [AGENT-SUCCESS] Respuesta completada en ${processingTime}ms - ${new Date().toISOString()}`);

      return {
        content: raw,
        stage: "conversacion",
        parts,
        cardProductIds: parts.filter(p => p.kind === "card").map(p => p.productId),
      };
    },
    () => {
      // Fallback response when all AI providers fail
      console.log(`🆘 [AGENT-FALLBACK] Usando respuesta de emergencia - ${new Date().toISOString()}`);
      logger.warn({ conversationId }, "[Agent] All AI providers failed, using intelligent fallback");
      return determineFallbackResponse(lastText, conversationContext);
    },
    {
      conversationId,
      customerMessage: lastText,
      customerInfo
    }
  );

  console.log(`📤 [AGENT-FINAL] Resultado final - Contenido: ${result.content?.substring(0, 50)}..., Partes: ${result.parts?.length}, Etapa: ${result.stage} - ${new Date().toISOString()}`);

  // ACTUALIZAR ETAPA EN SEGUNDO PLANO
  updateConversationStage(convo, lastText, result, conversationId).catch(err => {
    console.log(`⚠️ [AGENT-WARNING] Error actualizando etapa: ${err.message} - ${new Date().toISOString()}`);
    logger.error({ err }, "[Stage] Error actualizando etapa");
  });

  const totalTime = Date.now() - startTime;
  console.log(`🏁 [AGENT-END] runAgentReply completado en ${totalTime}ms para conversación ${conversationId} - ${new Date().toISOString()}`);

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
