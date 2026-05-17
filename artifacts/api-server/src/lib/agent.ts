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
  const hasIntroduced = agentMessages.some(m => 
    m.content.toLowerCase().includes("sofía") || 
    m.content.toLowerCase().includes("te habla") ||
    m.content.toLowerCase().includes("asesora")
  );

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

  // Extract preferred products mentioned
  const productKeywords = ["piano", "guitarra", "excel", "diseño", "trading", "idiomas", "hacking"];
  const preferredProducts = productKeywords.filter(k => allText.includes(k));

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
  
  let currentProductInContext = null;
  let productForRequest = null;

  const [convo] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!convo) {
    console.log(`❌ [AGENT-ERROR] Conversación ${conversationId} no encontrada - ${new Date().toISOString()}`);
    return null;
  }
  console.log(`📱 [AGENT-INFO] Conversación encontrada: ${convo.contactPhone}, Estado: ${convo.status}, Etapa: ${convo.currentStage} - ${new Date().toISOString()}`);

  // Obtener el último mensaje del cliente para el routing
  const lastCustomerMessage = await db
    .select()
    .from(messages)
    .where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.role, "customer")
    ))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  
  const lastMessageText = lastCustomerMessage[0]?.content || "";
  
  // Usar el Agent Router para seleccionar el mejor agente
  const { getActiveAgent } = await import("./agent-router");
  const activeAgent = await getActiveAgent(lastMessageText, conversationId, convo.tenantId);
  
  if (!activeAgent) {
    console.log(`❌ [AGENT-ERROR] No hay agente activo configurado - ${new Date().toISOString()}`);
    return null;
  }
  console.log(`🤖 [AGENT-INFO] Agente activo: ${activeAgent.name} - ${new Date().toISOString()}`);

  const [appSettings] = await db.select().from(settingsTable).limit(1);
  const productList = await db.select().from(products).where(eq(products.isActive, true));
  console.log(`📦 [AGENT-INFO] Productos activos: ${productList.length} - ${new Date().toISOString()}`);
  
  // Obtener historial de la conversación para contexto
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(15);

  console.log(`💬 [AGENT-INFO] Historial de mensajes cargado: ${history.length} mensajes - ${new Date().toISOString()}`);

  history.reverse(); // Ordenamos de más viejo a más nuevo para la IA

  // 🆕 DETECTAR TARJETAS YA ENVIADAS (evitar repetición)
  const sentCards = new Set<number>();
  for (const msg of history) {
    if (msg.role === "agent" && msg.content.includes("[CARD:")) {
      const cardMatch = msg.content.match(/\[CARD:\s*(\d+)\s*\]/);
      if (cardMatch) {
        sentCards.add(parseInt(cardMatch[1]));
      }
    }
  }
  console.log(`🃏 [AGENT-MEMORY] Tarjetas ya enviadas: [${Array.from(sentCards).join(', ')}] - ${new Date().toISOString()}`);

  // Context Intelligence Enhancement: Analyze conversation context
  const conversationContext = analyzeConversationContext(history);
  console.log(`🧠 [AGENT-ANALYSIS] Contexto analizado - Presentado: ${conversationContext.hasIntroduced}, Tema: ${conversationContext.currentTopic}, Interés: ${conversationContext.leadBehavior.interestLevel}, Estilo: ${conversationContext.leadBehavior.communicationStyle} - ${new Date().toISOString()}`);
  
  logger.info({ 
    conversationId, 
    hasIntroduced: conversationContext.hasIntroduced,
    currentTopic: conversationContext.currentTopic,
    interestLevel: conversationContext.leadBehavior.interestLevel,
    emotionalState: conversationContext.leadBehavior.emotionalState.sentiment,
    communicationStyle: conversationContext.leadBehavior.communicationStyle
  }, "[Agent] Context analysis completed");

  // Crear un catálogo COMPLETO con toda la información para que la IA pueda responder preguntas
  const productsBlock = productList
    .map((p) => {
      const features = (p.features as string[]) || [];
      const featuresText = features.length > 0 
        ? `\nCaracterísticas:\n${features.map(f => `  • ${f}`).join('\n')}`
        : '';
      
      return `
[PRODUCTO ID: ${p.id}]
Nombre: ${p.name}
Precio: ${formatPrice(Number(p.price), p.currency)}
Descripción: ${p.description || "No disponible"}
Categoría: ${p.category || "General"}${featuresText}
Imagen: ${p.imageUrl || "No disponible"}
Estado: ${p.isActive ? "Activo" : "Inactivo"}
`;
    })
    .join("\n");

  // Error Resilience Enhancement: Check payment gateway health before generating payment info
  const pg = new PaymentGateway();
  const lastCustomerMsg = [...history].reverse().find(m => m.role === "customer");
  const lastText = lastCustomerMsg?.content.toLowerCase() || "";
  
  // Context Intelligence Enhancement: Detect topic transitions
  const topicTransition = detectTopicTransition(history.slice(0, -1), lastText);
  if (topicTransition) {
    console.log(`🔄 [AGENT-TRANSITION] Cambio de tema detectado: ${topicTransition.from || 'ninguno'} → ${topicTransition.to} (confianza: ${topicTransition.confidence}) - ${new Date().toISOString()}`);
    logger.info({ 
      conversationId, 
      transition: topicTransition 
    }, "[Agent] Topic transition detected");
  }
  
  let paymentInfo = "";
  const paymentKeywords = ["pago", "pagar", "comprar", "transferencia", "nequi", "daviplata", "adquirir", "compro", "cuenta", "link", "enlace"];
  // NOTA: "precio" y "valor" NO están aquí porque el cliente puede preguntar precio sin querer comprar
  if (paymentKeywords.some(k => lastText.includes(k))) {
    console.log(`💳 [AGENT-PAYMENT] Solicitud de pago detectada: "${lastText.substring(0, 50)}" - ${new Date().toISOString()}`);
    
    // PRIORIDAD DE RESOLUCIÓN DEL PRODUCTO (anti cross-product bug):
    // 1. Nombre exacto mencionado en el mensaje actual
    // 2. ID explícito que el cliente haya pedido (productForRequest)
    // 3. Tema actual de la conversación — solo si hay coincidencia fuerte
    // 4. Si no hay certeza: NO generar link, pedir aclaración
    let paymentProduct = productList.find(p => lastText.includes(p.name.toLowerCase()));
    
    if (!paymentProduct && productForRequest) {
      paymentProduct = productForRequest;
      console.log(`🎯 [AGENT-PAYMENT] Usando producto de la solicitud actual: ${paymentProduct.name} (ID: ${paymentProduct.id})`);
    }
    
    if (!paymentProduct && conversationContext.currentTopic) {
      // Solo match fuerte: el nombre completo del producto debe contener el tema
      const topic = conversationContext.currentTopic.toLowerCase();
      paymentProduct = productList.find(p => p.name.toLowerCase().includes(topic) && topic.length > 4);
      if (paymentProduct) console.log(`🧠 [AGENT-PAYMENT] Usando producto del contexto (match fuerte): ${paymentProduct.name} (ID: ${paymentProduct.id})`);
    }

    if (paymentProduct) {
      console.log(`✅ [AGENT-PAYMENT] Producto CONFIRMADO para pago: ${paymentProduct.name} (ID: ${paymentProduct.id}) - ${new Date().toISOString()}`);
      try {
        const paymentServicesHealthy = arePaymentServicesHealthy();
        if (!paymentServicesHealthy) {
          paymentInfo = `\n━━━━━━━━━━━━━━━━━━━━━━━━\n💳 *OPCIONES DE PAGO — ${paymentProduct.name}*\n━━━━━━━━━━━━━━━━━━━━━━━━\nEstoy actualizando los enlaces. Te los envío en un segundo. ⏳`;
        } else {
          // PayPal se genera dinámicamente (caduca), MercadoPago es estático por producto
          const links = await retryWithBackoff(
            () => pg.getAllLinks(paymentProduct!, { phone: convo.contactPhone, name: convo.contactName }),
            { maxRetries: 2, baseDelay: 1000 },
            `payment_links_product_${paymentProduct!.id}_conv_${conversationId}`
          );
          console.log(`🔗 [AGENT-PAYMENT] Links generados para ${paymentProduct.name} — MP: ${!!links.mercadopago?.url}, PayPal: ${!!links.paypal?.url}`);
          
          paymentInfo = `
✨ 💻 *PROGRAMA PROFESIONAL: ${paymentProduct.name.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━━

*RESUMEN DEL PROGRAMA:*
Formación estructurada para llevar tus habilidades al siguiente nivel con metodología probada y práctica.

*BENEFICIOS INCLUIDOS:*
✅ Contenido en alta resolución
✅ Acceso inmediato y de por vida
✅ Actualizaciones constantes
✅ Soporte garantizado TecnoVariedades

💰 *PRECIO ESPECIAL:*
*${formatPrice(Number(paymentProduct.price), paymentProduct.currency)}*
━━━━━━━━━━━━━━━━━━━━━━━

💳 *ENLACES DE PAGO SEGURO:*

🔹 *Tarjeta de Crédito / PSE (Colombia):*
${links.mercadopago?.url || links.mercadopago?.shortUrl || "Enlace no disponible"}

🔹 *PayPal (Internacional):*
${links.paypal?.url || links.paypal?.shortUrl || "Enlace no disponible"}

🔹 *Transferencia Directa:*
📍 *Nequi/Daviplata:* ${links.transfer.options[0]?.number || "3136174267"}
👤 *Titular:* ${links.transfer.options[0]?.name || "Deiner Mena"}

_¿Deseas confirmar tu compra ahora o tienes alguna pregunta adicional?_`;
        }
      } catch (error) {
        console.error(`❌ [AGENT-PAYMENT] Error generando links para ${paymentProduct.name}:`, error);
        paymentInfo = `\n💳 Estoy preparando tu link de pago para *${paymentProduct.name}*. Dame un instante. ⏳`;
      }
    } else {
      // Sin producto identificado — NO generar link incorrecto
      console.log(`⚠️ [AGENT-PAYMENT] No se pudo identificar el producto. Solicitando aclaración al cliente.`);
      paymentInfo = `\n━━━━━━━━━━━━━━━━━━━━━━━━\n💳 Para enviarte el link de pago correcto, ¿me confirmas cuál pack te interesa adquirir hoy?\n━━━━━━━━━━━━━━━━━━━━━━━━`;
    }
  }

  // Context Intelligence Enhancement: Generate personalized context
  const personalizedContext = generatePersonalizedContext(conversationContext, lastText);

  // Determinar producto en contexto para inteligencia avanzada si no se ha detectado aún
  if (!currentProductInContext && conversationContext.currentTopic) {
    const topic = conversationContext.currentTopic.toLowerCase();
    currentProductInContext = productList.find(p => p.name.toLowerCase().includes(topic) && topic.length > 4) || null;
  }

  // 🧠 INTELIGENCIA AVANZADA: Análisis profundo del mensaje
  const intelligentContext = AdvancedIntelligence.generateIntelligentContext(
    lastText,
    history,
    currentProductInContext
  );
  console.log(`🧠 [ADVANCED-INTELLIGENCE] Contexto inteligente generado - ${new Date().toISOString()}`);
  
  const systemPrompt = `
Eres **SOFÍA**, vendedora experta y consejera de confianza de TecnoVariedades D&S. Tienes la habilidad de ENTENDER lo que el cliente realmente necesita incluso cuando no lo dice con claridad. Eres empática, natural y nunca robótica.

━━━━━━━━━━━━━━━━━━━━━━━
🧠 CÓMO PIENSAS Y ACTÚAS
━━━━━━━━━━━━━━━━━━━━━━━

1. **ESCUCHA ACTIVA**: Interpreta la intención del cliente, no solo sus palabras. Si dice "algo para aprender diseño" entiende que busca un curso. Si dice "tengo poco presupuesto" recomienda primero las opciones accesibles.
2. **NO REPITAS**: Nunca vuelvas a decir lo que ya dijiste. Si el cliente pregunta algo que ya respondiste, amplía o da más detalle — no copies la respuesta anterior.
3. **RESPUESTAS CORTAS Y RICAS**: Máximo 3 oraciones de texto seguido. El producto ya habla por sí solo en la [CARD]. Tú solo conectas emocionalmente.
4. **PRESENTA LAS CARDS COMO UN REGALO**: Cuando tengas un producto para recomendar, preséntalo con entusiasmo breve antes de la card. Ej: "¡Este es ideal para lo que buscas! 👇"
5. **SIGUE EL HILO**: Si el cliente cambia de tema, adáptate. Si vuelve al mismo, no empieces de cero.
6. **CIERRA CON CALIDEZ**: Cuando el cliente pida información de pago, sé entusiasta y dile que el sistema adjunta los links automáticamente.

━━━━━━━━━━━━━━━━━━━━━━━
📋 LO QUE SIEMPRE ES CIERTO
━━━━━━━━━━━━━━━━━━━━━━━
✅ Entrega 100% digital por Google Drive.
✅ Acceso inmediato y permanente (de por vida).
✅ Garantía de 7 días — sin preguntas.
✅ Pago único, no suscripción.
✅ Métodos: MercadoPago, PayPal, Nequi, Daviplata.

━━━━━━━━━━━━━━━━━━━━━━━
📦 CATÁLOGO
━━━━━━━━━━━━━━━━━━━━━━━
${productList.length > 0 ? productsBlock : "No hay productos disponibles aún."}

🚨 REGLAS ABSOLUTAS:
• NO inventes precios, nombres ni características. Usa SOLO lo que dice el catálogo.
• NO escribas enlaces ni números de cuenta — el sistema los adjunta solo.
• NO repitas la card si ya la enviaste — en su lugar, responde la duda directamente.
• NO uses frases genéricas de apertura como "¡Hola! Claro que sí, con gusto te ayudo." Ve directo al punto.

${personalizedContext}
`.trim();

  console.log(`📝 [AGENT-PROMPT] Prompt del sistema generado - Longitud: ${systemPrompt.length} caracteres - ${new Date().toISOString()}`);

  // Context Intelligence Enhancement: Enhanced greeting detection and context-aware prompting
  // Detección de saludo pura (sin intención de compra evidente)
  const commonGreetings = ["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "hola!", "hola.", "hola muy buenas", "que tal", "como estas"];
  const isGreetingOnly = commonGreetings.some(k => lastText.trim().toLowerCase().includes(k)) && lastText.split(' ').length <= 4;
  // 🎯 BÚSQUEDA DE PRODUCTOS INTELIGENTE CON RAZONAMIENTO SEMÁNTICO
  
  const lastTextLower = lastText.toLowerCase();
  
  // 🔍 PASO 1: IDENTIFICAR EL PRODUCTO ACTUAL EN LA CONVERSACIÓN
  // Buscar el último mensaje del AGENTE que contenga [CARD:]
  const lastAgentCardMessage = history.slice().reverse().find(msg => 
    msg.role === "agent" && msg.content.includes("[CARD:")
  );
  
  if (lastAgentCardMessage) {
    const cardMatch = lastAgentCardMessage.content.match(/\[CARD:\s*(\d+)\s*\]/);
    if (cardMatch) {
      const productId = parseInt(cardMatch[1]);
      currentProductInContext = productList.find(p => p.id === productId);
      console.log(`📌 [PRODUCT-CONTEXT] Producto actual en conversación: ${currentProductInContext?.name} (ID: ${currentProductInContext?.id})`);
    }
  }
  
  // 🔍 PASO 2: VERIFICAR SI EL CLIENTE ESTÁ PREGUNTANDO SOBRE EL PRODUCTO ACTUAL
  const isQuestionAboutCurrentProduct = lastTextLower.includes("cómo") ||
                                        lastTextLower.includes("como") ||
                                        lastTextLower.includes("cuándo") ||
                                        lastTextLower.includes("cuando") ||
                                        lastTextLower.includes("dónde") ||
                                        lastTextLower.includes("donde") ||
                                        lastTextLower.includes("qué") ||
                                        lastTextLower.includes("que") ||
                                        lastTextLower.includes("cuál") ||
                                        lastTextLower.includes("cual") ||
                                        lastTextLower.includes("entregan") ||
                                        lastTextLower.includes("entrega") ||
                                        lastTextLower.includes("acceso") ||
                                        lastTextLower.includes("garantía") ||
                                        lastTextLower.includes("garantia") ||
                                        lastTextLower.includes("incluye") ||
                                        lastTextLower.includes("tiene") ||
                                        lastTextLower.includes("trae") ||
                                        lastTextLower.includes("soporte") ||
                                        lastTextLower.includes("duración") ||
                                        lastTextLower.includes("duracion") ||
                                        lastTextLower.includes("tiempo");
  
  // Si está preguntando sobre el producto actual, NO buscar otro producto
  if (isQuestionAboutCurrentProduct && currentProductInContext) {
    console.log(`❓ [PRODUCT-QUESTION] Cliente preguntando sobre producto actual: ${currentProductInContext.name}`);
    productForRequest = null; // NO enviar tarjeta de nuevo
  }
  
  // 🔍 PASO 3: VERIFICAR SI EL CLIENTE ESTÁ CONFIRMANDO
  const isConfirmation = (lastTextLower.includes("sí") || 
                         lastTextLower.includes("si") ||
                         lastTextLower.includes("ok") ||
                         lastTextLower.includes("dale") ||
                         lastTextLower.includes("bueno") ||
                         lastTextLower.includes("perfecto") ||
                         lastTextLower.includes("me gustaría") ||
                         lastTextLower.includes("quiero") ||
                         lastTextLower.includes("adelante")) &&
                         !lastTextLower.includes("no");
  
  // Si el cliente está confirmando, MANTENER el producto anterior
  if (isConfirmation && currentProductInContext) {
    console.log(`✅ [PRODUCT-CONFIRMATION] Cliente confirmando producto: ${currentProductInContext.name} (ID: ${currentProductInContext.id})`);
    productForRequest = null; // NO enviar tarjeta de nuevo
  }
  
  // 🔍 PASO 4: BÚSQUEDA SEMÁNTICA REAL EN EL CATÁLOGO
  // Solo buscar si NO hay producto en contexto o si el cliente menciona un producto diferente
  if (!isQuestionAboutCurrentProduct && !isConfirmation) {
    console.log(`🔍 [PRODUCT-SEARCH] Buscando producto en catálogo para: "${lastText}"`);
    
    // Búsqueda semántica: buscar en nombre, descripción y categoría
    const searchResults = productList
      .map(product => {
        const productText = `${product.name} ${product.description} ${product.category}`.toLowerCase();
        const words = lastTextLower.split(/\s+/).filter(w => w.length > 3);
        
        // Calcular score de coincidencia
        let score = 0;
        for (const word of words) {
          if (productText.includes(word)) {
            score += 1;
            // Bonus si coincide con el nombre
            if (product.name.toLowerCase().includes(word)) {
              score += 2;
            }
          }
        }
        
        return { product, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);
    
    if (searchResults.length > 0) {
      const bestMatch = searchResults[0];
      console.log(`🎯 [PRODUCT-SEARCH] Mejor coincidencia: ${bestMatch.product.name} (Score: ${bestMatch.score})`);
      console.log(`   Otros resultados: ${searchResults.slice(1, 3).map(r => `${r.product.name} (${r.score})`).join(', ')}`);
      
      // Solo usar el producto si NO fue enviado antes
      if (!sentCards.has(bestMatch.product.id)) {
        productForRequest = bestMatch.product;
        console.log(`✅ [PRODUCT-SEARCH] Producto seleccionado: ${productForRequest.name} (ID: ${productForRequest.id})`);
      } else {
        console.log(`🚫 [PRODUCT-SKIP] Producto ${bestMatch.product.name} ya fue enviado`);
      }
    } else {
      console.log(`❌ [PRODUCT-SEARCH] No se encontró coincidencia en el catálogo`);
    }
  }
  
  // Si encontramos un producto, agregarlo al prompt
  let productInstruction = "";
  
  // CASO 1: Hay un producto actual en la conversación (el cliente está preguntando sobre él)
  if (currentProductInContext && !productForRequest) {
    const features = (currentProductInContext.features as string[]) || [];
    const featuresText = features.length > 0 
      ? `\nCaracterísticas:\n${features.map(f => `  • ${f}`).join('\n')}`
      : '';
    
    productInstruction = `\n\n📌 PRODUCTO ACTUAL EN CONVERSACIÓN:\nNombre: ${currentProductInContext.name}\nID: ${currentProductInContext.id}\nPrecio: ${formatPrice(Number(currentProductInContext.price), currentProductInContext.currency)}\nDescripción: ${currentProductInContext.description}${featuresText}\n\n🚨 CRÍTICO:\n- El cliente está preguntando sobre ESTE producto\n- NO cambies a otro producto\n- NO vuelvas a enviar [CARD: ${currentProductInContext.id}] (ya lo enviaste)\n- Responde su pregunta usando SOLO la información de arriba\n- NO inventes datos que no estén en la descripción\n- Si pregunta sobre entrega: "Se entrega 100% digital por Google Drive. Acceso inmediato."\n- Si pregunta sobre garantía: "Acceso de por vida. 7 días para reembolso si no te gusta."\n- Si pregunta sobre duración: "Acceso permanente de por vida. Sin límite de tiempo."\n- Si pregunta sobre soporte: "Es auto-aprendizaje. Tienes acceso a todo el contenido en Drive."`;
  }
  // CASO 2: Hay un nuevo producto para recomendar
  else if (productForRequest) {
    const features = (productForRequest.features as string[]) || [];
    const featuresText = features.length > 0 
      ? `\nCaracterísticas:\n${features.map(f => `  • ${f}`).join('\n')}`
      : '';
    
    productInstruction = `\n\n🎯 PRODUCTO A RECOMENDAR:\nNombre: ${productForRequest.name}\nID: ${productForRequest.id}\nPrecio: ${formatPrice(Number(productForRequest.price), productForRequest.currency)}\nDescripción: ${productForRequest.description}${featuresText}\n\n🚨 DEBES incluir [CARD: ${productForRequest.id}] en tu respuesta.\n🚨 USA SOLO la información de arriba. NO inventes datos.\n🚨 Si la descripción dice "20 secciones", di "20 secciones", NO "283 clases".\n🚨 Si el precio es COP 20,000, di "COP 20,000", NO otro precio.\n🚨 NO menciones características que no estén en la descripción.`;
  }
  // CASO 3: Ya se envió una tarjeta antes
  else if (sentCards.size > 0) {
    productInstruction = `\n\n🚫 IMPORTANTE: Ya enviaste la tarjeta del producto anteriormente.\n✅ El cliente ya tiene toda la información del producto.\n✅ NO vuelvas a enviar [CARD: ID].\n✅ Responde de forma natural a su pregunta sin repetir información.\n✅ Si pregunta sobre entrega, pago o acceso, responde directamente sin mostrar la tarjeta de nuevo.`;
  }

  const baseSystemPrompt = activeAgent?.systemPrompt || systemPrompt;
  let finalPrompt = "";
  let responsePrefill = "";
  
  // 🎯 ESTRATEGIA SIMPLIFICADA: Dejar que la IA razone
  console.log(`📊 [STAGE-ANALYSIS] Analizando contexto para conversación ${conversationId}`);
  console.log(`   - isGreetingOnly: ${isGreetingOnly}`);
  console.log(`   - hasIntroduced: ${conversationContext.hasIntroduced}`);
  console.log(`   - currentTopic: ${conversationContext.currentTopic}`);
  console.log(`   - productForRequest: ${productForRequest?.name || 'ninguno'}`);
  console.log(`   - currentStage: ${convo.currentStage}`);
  
  // Detectar intención de pago
  const isPurchaseIntent = lastTextLower.includes("pago") || 
                           lastTextLower.includes("comprar") || 
                           lastTextLower.includes("adquirir") || 
                           lastTextLower.includes("cuenta") || 
                           lastTextLower.includes("nequi") || 
                           lastTextLower.includes("daviplata") ||
                           lastTextLower.includes("link") || 
                           lastTextLower.includes("enlace") ||
                           lastTextLower.includes("transferencia");
  
  // 🎯 ESTRATEGIA 1: INTENCIÓN DE PAGO (CIERRE)
  if (isPurchaseIntent) {
    console.log(`💳 [AGENT-STRATEGY] Cliente quiere comprar - Facilitando pago`);
    finalPrompt = baseSystemPrompt + intelligentContext + `\n\n🚨 CONTEXTO: El cliente quiere comprar.
Tu objetivo es animarlo a realizar el pago.
¡MUY IMPORTANTE!: TÚ NO DEBES INVENTAR NI ESCRIBIR LOS ENLACES DE PAGO NI LOS NÚMEROS DE CUENTA. El sistema los adjuntará de forma automática e invisible al final de tu mensaje. Solo dile que debajo le dejas los enlaces seguros.${productInstruction}`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n💳 *¡PERFECTO! VAMOS A PROCESAR TU COMPRA*\n\n`;
  }
  
  // 🎯 ESTRATEGIA 2: PRIMERA VEZ (SALUDO + PRESENTACIÓN)
  else if (isGreetingOnly && !conversationContext.hasIntroduced) {
    console.log(`👋 [AGENT-STRATEGY] Primer contacto - Presentación`);
    finalPrompt = baseSystemPrompt + intelligentContext + `\n\n🚨 CONTEXTO: Es el primer contacto con el cliente.
Tu objetivo es PRESENTAR la empresa de forma cálida y DESCUBRIR qué le interesa.
Sé breve, amigable y haz una pregunta clara.`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n👋 *¡Bienvenido/a!*\n\n`;
  }
  
  // 🎯 ESTRATEGIA 3: CLIENTE RECURRENTE (SALUDO CÁLIDO)
  else if (isGreetingOnly && conversationContext.hasIntroduced) {
    console.log(`👋 [AGENT-STRATEGY] Cliente recurrente - Saludo cálido`);
    finalPrompt = baseSystemPrompt + intelligentContext + `\n\n🚨 CONTEXTO: El cliente ya conoce TecnoVariedades.
Tu objetivo es REACTIVAR su interés de forma cálida.
Sé breve, personalizado y pregunta cómo puedes ayudar.`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n👋 *¡Qué gusto verte de nuevo!*\n\n`;
  }
  
  // 🎯 ESTRATEGIA 4: CONVERSACIÓN GENERAL (RAZONAMIENTO LIBRE)
  else {
    console.log(`💬 [AGENT-STRATEGY] Conversación general - Razonamiento libre`);
    finalPrompt = baseSystemPrompt + intelligentContext + `\n\n🚨 CONTEXTO: El cliente está explorando o preguntando algo específico.
Tu objetivo es ENTENDER su pregunta, RAZONAR sobre la mejor respuesta, y RESPONDER de forma coherente.
Busca en el catálogo el producto que mejor responda a su necesidad.
Explica POR QUÉ recomiendas ese producto.${productInstruction}`;
    responsePrefill = ``;
  }

  const chatMessages = [
    ...history.map(m => ({
      role: m.role === "customer" ? "user" : "assistant",
      content: m.content
    })),
    { role: "system", content: finalPrompt + `

🚨 REGLAS DE FORMATO FINAL (NO NEGOCIABLES):

① JAMÁS repitas información que ya enviaste en mensajes anteriores del historial.
② El formato de presentación de un nuevo producto es SIEMPRE:
   - 1-2 frases que conecten la recomendación con lo que el cliente pidió
   - Luego: [CARD: ID] al final — NADA después de la card.
③ Cuando el cliente ya recibió la card y pregunta algo, responde SIN volver a enviar la card.
④ PROHIBIDO escribir URLs, links de pago o cuentas bancarias. El sistema los adjunta solo.
⑤ Tus respuestas sin card deben ser máximo 3 oraciones. Con card: máximo 2 oraciones previas.
⑥ NUNCA uses saludos genéricos como "¡Hola! Con mucho gusto.", "Claro que sí.", etc. Ve al punto.
⑦ Si el cliente ya expresó intención de compra, no vuelvas a describir el producto — ve directo al pago.
⑧ Usa EXACTAMENTE los datos del catálogo. Precio, nombre, descripción — sin inventar nada.
⑨ Respeta el flujo de la conversación. Si el cliente habla de algo nuevo, adáptate con naturalidad.` },

    // Prefill: el mensaje del asistente ya empieza con el formato correcto, la IA solo continúa
    ...(responsePrefill ? [{ role: "assistant", content: responsePrefill }] : [])
  ];

  console.log(`🤖 [AGENT-AI] Preparando llamada a IA - Mensajes: ${chatMessages.length}, Prompt final: ${finalPrompt.length} caracteres - ${new Date().toISOString()}`);

  // Error Resilience Enhancement: Enhanced AI provider rotation with comprehensive fallback
  const customerInfo = { name: convo.contactName, phone: convo.contactPhone };
  
  const result = await executeWithFallback(
    async () => {
      console.log(`🔄 [AGENT-AI] Iniciando rotación de proveedores de IA - ${new Date().toISOString()}`);
      const rotationQueue: { config: any; source: string }[] = [];
      
      // Obtener configuración activa de la base de datos (TIENE LA MÁS ALTA PRIORIDAD)
      const dbConfig = appSettings ? getProviderConfigFromSettings(appSettings) : null;
      const activeProvider = appSettings?.aiProvider || "none";

      console.log(`⚙️ [AGENT-AI] Proveedor activo en BD: ${activeProvider}`);

      // 🥇 1. PRIMERO: Proveedor configurado en el Dashboard (Base de Datos)
      // Cubre: opencode, github, nvidia, ollama_local, openai_default, github_copilot_internal
      if (dbConfig && healthMonitor.isServiceHealthy(activeProvider)) {
        rotationQueue.push({ config: dbConfig, source: activeProvider });
      } else if (dbConfig) {
        console.log(`⚠️ [AGENT-AI] Proveedor DB '${activeProvider}' en COOLDOWN, añadiendo como fallback...`);
        rotationQueue.push({ config: dbConfig, source: activeProvider }); // Añadir de todos modos como prioridad 1
      }

      // 🥈 2. FALLBACKS del sistema (solo si el proveedor DB no es suficiente)
      const copilotEnv = getProviderConfig("github_copilot_internal");
      const nvidiaEnv = getProviderConfig("nvidia");
      const githubEnv = getProviderConfig("github");
      const nvidiaFast = getProviderConfig("nvidia_fast");
      const ollamaConfig = getProviderConfig("ollama_local");

      // Solo añadir fallbacks si el activo no los cubre ya
      if (activeProvider !== "github_copilot_internal" && copilotEnv && healthMonitor.isServiceHealthy("copilot_internal")) {
        rotationQueue.push({ config: copilotEnv, source: "copilot_internal" });
      }
      if (activeProvider !== "nvidia" && nvidiaEnv && healthMonitor.isServiceHealthy("nvidia_70b")) {
        rotationQueue.push({ config: nvidiaEnv, source: "nvidia_70b" });
      }
      if (activeProvider !== "github" && githubEnv && healthMonitor.isServiceHealthy("github_env")) {
        rotationQueue.push({ config: githubEnv, source: "github_env" });
      }
      if (activeProvider !== "nvidia" && nvidiaFast && healthMonitor.isServiceHealthy("nvidia_8b")) {
        rotationQueue.push({ config: nvidiaFast, source: "nvidia_8b" });
      }
      if (activeProvider !== "ollama_local" && ollamaConfig && healthMonitor.isServiceHealthy("ollama_local")) {
        rotationQueue.push({ config: ollamaConfig, source: "ollama_local" });
      }

      console.log(`🔄 [AGENT-AI] Cola de rotación preparada con ${rotationQueue.length} proveedores: ${rotationQueue.map(q => q.source).join(" -> ")}`);

      if (rotationQueue.length === 0) {
        console.error("❌ [AGENT-ERROR] No hay proveedores de IA configurados o saludables");
        throw new Error("No hay proveedores de IA disponibles en este momento");
      }

      // Check if any AI providers are healthy
      if (!areAIProvidersHealthy()) {
        console.log(`⚠️ [AGENT-WARNING] Todos los proveedores de IA parecen no saludables, intentando de todos modos - ${new Date().toISOString()}`);
        logger.warn({ conversationId }, "[Agent] All AI providers appear unhealthy, attempting anyway");
      }

      let raw = "";
      let lastError: Error | null = null;
      
      // 🚀 HARDCODED FIRST-TIME GREETING (Bypass AI entirely)
      if (isGreetingOnly && !conversationContext.hasIntroduced) {
        console.log(`⚡ [AGENT-FAST-TRACK] Enviando presentación hardcodeada instantánea - ${new Date().toISOString()}`);
        
        raw = `👋 ¡Hola! Bienvenido a *${convo.tenantId === 1 ? 'TecnoVariedades D&S' : 'nuestra tienda'}* 😊

Es un gusto saludarte. ¿Cómo te puedo ayudar el día de hoy?`;
      } else if (isGreetingOnly && conversationContext.hasIntroduced) {
        console.log(`⚡ [AGENT-FAST-TRACK] Enviando saludo recurrente hardcodeado instantáneo - ${new Date().toISOString()}`);
        raw = `👋 *¡Qué gusto verte de nuevo!* 🌟

¿En qué te puedo ayudar el día de hoy?`;
      } else {
        for (const { config, source } of rotationQueue) {
          try {
            console.log(`🎯 [AGENT-AI] Intentando proveedor: ${source} (${config.model}) - ${new Date().toISOString()}`);
            logger.debug({ 
              conversationId, 
              provider: source, 
              model: config.model 
            }, "[Agent] Attempting AI provider");
          
          // 🔑 INTERCAMBIO DE TOKEN PARA GITHUB COPILOT (VentasPro Elite Mode)
          // Si es Copilot y no parece un token de sesión fresco (tid=), intentamos obtener uno nuevo
          const isGithubPat = config.apiKey.startsWith("gho_") || config.apiKey.startsWith("ghp_") || config.apiKey.startsWith("ghu_");
          const isExpiredOrOld = config.apiKey.startsWith("eyJ") && source === "github_copilot_internal"; 

          if (config.baseUrl === "https://api.githubcopilot.com" && (isGithubPat || isExpiredOrOld)) {
            console.log(`🔑 [AGENT-AI] Detectado token de GitHub (${isGithubPat ? 'PAT' : 'Old Session'}). Solicitando nuevo pase de entrada...`);
            const { getCopilotSessionToken } = await import("./copilot");
            const session = await getCopilotSessionToken(config.apiKey);
            if (session) {
              config.apiKey = session.token;
              console.log("✅ [AGENT-AI] Pase de entrada de Copilot renovado exitosamente.");
            } else {
              console.error("❌ [AGENT-AI] No se pudo renovar el pase de entrada de Copilot.");
              throw new Error("Sesión de Copilot expirada o inválida. Por favor, re-autentica en el Dashboard.");
            }
          }

            console.log(`🔧 [AGENT-AI] Creando cliente para ${source}...`);
            const client = createAIClient(config);
            console.log(`📡 [AGENT-AI] Enviando petición a ${source} (${config.model})...`);
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
            
            // 🛡️ GARANTÍA DE TARJETA VISUAL: Si el sistema decidió recomendar un producto y el modelo olvidó la etiqueta, la inyectamos nosotros
            if (productForRequest && !raw.toLowerCase().includes("[card:")) {
              console.log(`🔧 [AGENT-POSTPROCESS] El modelo olvidó incluir la tarjeta. Agregándola automáticamente: [CARD: ${productForRequest.id}]`);
              raw = raw.trim() + `\n\n[CARD: ${productForRequest.id}]`;
            }

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

      // 🚀 POST-PROCESAMIENTO ANTI-HALLUCINACIÓN (Cero tolerancia a mentiras técnicas)
      if (raw && raw.includes("[CARD:")) {
        // 🚨 CRÍTICO: Eliminar TODO el texto después de [CARD: ID]
        const cardMatch = raw.match(/\[CARD:\s*\d+\s*\]/i);
        if (cardMatch) {
          const cardEndIndex = raw.indexOf(cardMatch[0]) + cardMatch[0].length;
          const textAfterCard = raw.substring(cardEndIndex).trim();
          
          if (textAfterCard) {
            console.log(`🗑️ [AGENT-POSTPROCESS] Eliminando texto después de [CARD:]: "${textAfterCard.substring(0, 100)}..."`);
            raw = raw.substring(0, cardEndIndex);
          }
        }
        
        // Si hay una tarjeta, borramos cualquier mención a "lecciones", "módulos" o números aleatorios que la IA suele inventar
        raw = raw.replace(/\d+\s*(lecciones|clases|módulos|modulos|videos|videos|gb|gigas)/gi, "");
        // También borramos descripciones largas que suelen ser inventadas
        raw = raw.replace(/✨.*?🎹/gs, "🎹"); 
      }

      // Prepend prefill so the final message starts with the formatted header
      if (responsePrefill && raw && !raw.startsWith("━")) {
        raw = responsePrefill + raw;
      }

      // 💳 ADJUNTAR TARJETA DE PAGO DINÁMICA SI EXISTE
      if (paymentInfo && raw) {
        raw = raw + "\n" + paymentInfo;
        console.log(`💳 [AGENT-FINAL] Card de pago adjuntada a la respuesta - ${new Date().toISOString()}`);
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
      
      // 🚨 NUEVO: Si hay tarjetas, NO agregar texto después de la última tarjeta
      const textAfterLastCard = raw.slice(lastIndex).trim();
      if (textAfterLastCard && cardCount === 0) {
        // Solo agregar si NO hay tarjetas (mensaje sin productos)
        parts.push({ kind: "text", content: textAfterLastCard });
      } else if (textAfterLastCard && cardCount > 0) {
        // Si hay tarjetas, descartar el texto después
        console.log(`🗑️ [AGENT-PARSER] Descartando texto después de tarjeta: "${textAfterLastCard.substring(0, 50)}..."`);
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
