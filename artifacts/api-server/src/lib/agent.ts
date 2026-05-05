// @ts-nocheck
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
━━━━━━━━━━━━━━━━━━━━━━━━
💳 *PAGO — ${paymentProduct.name}*
━━━━━━━━━━━━━━━━━━━━━━━━
📍 *Nequi / Daviplata:* ${links.transfer.options[0]?.number || "No disponible"}
👤 *Titular:* ${links.transfer.options[0]?.name || ""}

🔸 *Tarjeta / PSE (MercadoPago):*
${links.mercadopago?.url || "No disponible"}

🔸 *PayPal (USD):*
${links.paypal?.url || "No disponible"}
━━━━━━━━━━━━━━━━━━━━━━━━
Envía tu comprobante aquí mismo para activar tu acceso en Drive. 📁`;
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
  const systemPrompt = `
Eres **SOFÍA**, Agente de Ventas de TecnoVariedades D&S. Tu trabajo es ENTENDER lo que el cliente pregunta, RAZONAR sobre la mejor solución, y RESPONDER con información COMPLETA y PRECISA.

━━━━━━━━━━━━━━━━━━━━━━━━
🧠 PROTOCOLO DE RAZONAMIENTO (CRÍTICO)
━━━━━━━━━━━━━━━━━━━━━━━━

ANTES de responder, SIEMPRE haz este análisis:

1. **COMPRENSIÓN**: ¿Qué pregunta realmente el cliente?
   - "Me interesa piano" → Cliente busca aprender PIANO
   - "Qué incluye" → Cliente quiere saber CONTENIDO
   - "Cuánto cuesta" → Cliente pregunta PRECIO
   - "Cómo se entrega" → Cliente pregunta FORMA DE ENTREGA
   - "Tiene garantía" → Cliente pregunta GARANTÍA
   - "Cuánto tiempo acceso" → Cliente pregunta DURACIÓN
   - "Necesito soporte" → Cliente pregunta SOPORTE
   - "Sí me gustaría" → Cliente CONFIRMA compra

2. **BÚSQUEDA EN CATÁLOGO**: Busca el producto que mejor coincida
   - Lee TODOS los productos disponibles
   - Entiende qué ofrece cada uno
   - Selecciona el que mejor responde a la pregunta del cliente
   - **IMPORTANTE**: Cuando encuentres el producto, SIEMPRE incluye [CARD: ID] en tu respuesta

3. **RESPUESTA COMPLETA**: Responde TODAS las preguntas típicas
   - **Qué incluye**: Describe el contenido basándote en la descripción del producto
   - **Precio**: Menciona el precio exacto del producto
   - **Entrega**: "Se entrega 100% digital por Google Drive. Acceso inmediato."
   - **Garantía**: "Acceso de por vida. Si no te gusta, puedes solicitar reembolso en 7 días."
   - **Duración**: "Acceso permanente de por vida. Sin límite de tiempo."
   - **Soporte**: "Es auto-aprendizaje. Tienes acceso a todo el contenido en Google Drive."
   - **Pago**: "Aceptamos MercadoPago, PayPal y Transferencia Directa (Nequi/Daviplata)"

4. **RESPUESTA**: Presenta el producto con confianza
   - Explica brevemente por qué es la mejor opción
   - Usa [CARD: ID] para mostrar detalles (OBLIGATORIO)
   - Sé entusiasta pero profesional
   - Cierra con una pregunta clara

━━━━━━━━━━━━━━━━━━━━━━━━
📦 CATÁLOGO DISPONIBLE (INFORMACIÓN COMPLETA)
━━━━━━━━━━━━━━━━━━━━━━━━
${productList.length > 0 ? productsBlock : "No hay productos disponibles"}

━━━━━━━━━━━━━━━━━━━━━━━━
📋 INFORMACIÓN SOBRE ENTREGA Y GARANTÍA
━━━━━━━━━━━━━━━━━━━━━━━━
✅ FORMA DE ENTREGA: 100% Digital por Google Drive
✅ ACCESO: Inmediato después del pago (máximo 10 minutos)
✅ DURACIÓN: De por vida (permanente)
✅ GARANTÍA: 7 días para solicitar reembolso si no te gusta
✅ SOPORTE: Auto-aprendizaje con acceso a todo el contenido
✅ MÉTODOS DE PAGO: MercadoPago, PayPal, Transferencia Directa (Nequi/Daviplata)

🎯 CÓMO RESPONDER PREGUNTAS COMUNES (SIN REPETIR LA TARJETA):

**Si preguntan "¿Cómo me entregan el acceso?":**
"📧 El acceso se entrega de forma inmediata por correo electrónico. Recibirás un enlace a Google Drive con todo el contenido. Máximo 10 minutos después del pago. ¿Listo para proceder?"

**Si preguntan "¿Cuánto tiempo tengo acceso?":**
"♾️ El acceso es de por vida. Una vez que pagas, es tuyo para siempre. Sin mensualidades ni renovaciones. ¿Te gustaría adquirirlo?"

**Si preguntan "¿Tiene garantía?":**
"✅ Sí, tienes 7 días para solicitar reembolso si no te gusta. Sin preguntas. ¿Procedemos con tu compra?"

**Si preguntan "¿Cómo pago?":**
"💳 Puedes pagar por MercadoPago/PSE, PayPal o Transferencia Directa (Nequi/Daviplata). Los links ya te los envié arriba. ¿Cuál prefieres?"

**Si preguntan sobre el contenido:**
"📦 Ya te envié toda la información del producto arriba. ¿Tienes alguna duda específica sobre el contenido?"

🚨 REGLA CRÍTICA: Si ya enviaste la tarjeta [CARD: ID], NO la vuelvas a enviar. Responde de forma natural y directa.

━━━━━━━━━━━━━━━━━━━━━━━━
🚫 REGLAS ABSOLUTAS
━━━━━━━━━━━━━━━━━━━━━━━━
1. **COHERENCIA**: Si el cliente pregunta por PIANO, NO recomiendes GUITARRA
2. **CONFIRMACIÓN**: Si el cliente dice "Sí" o "Me gustaría", MANTÉN el producto anterior
3. **TARJETAS OBLIGATORIAS**: SIEMPRE incluye [CARD: ID] cuando recomiendes un producto
4. **BÚSQUEDA ACTIVA**: Si el cliente pregunta por algo, BUSCA en el catálogo y RECOMIENDA un producto
5. **INFORMACIÓN COMPLETA**: Responde TODAS las preguntas sobre el producto (qué incluye, precio, entrega, garantía, etc.)
6. **🚨 NO INVENTAR NADA**: 
   - SOLO usa información que esté en el catálogo
   - NO inventes precios, características, ni detalles
   - Si el catálogo dice "20 secciones", di "20 secciones", NO "283 clases"
   - Si el precio es COP 20,000, di "COP 20,000", NO "COP 50,000"
   - Si no sabes algo, di "Déjame verificar esa información"
7. **FORMATO**: Usa separadores ━━━━━━━━━━━━━━━━━━━━━━━━ y emojis
8. **DATOS REALES**: Toda la información del producto está en el catálogo arriba. Úsala EXACTAMENTE como aparece.

━━━━━━━━━━━━━━━━━━━━━━━━
✨ EJEMPLO DE RESPUESTA CORRECTA
━━━━━━━━━━━━━━━━━━━━━━━━

Cliente: "Me interesa piano, qué incluye y cuánto cuesta?"

Tu respuesta:
━━━━━━━━━━━━━━━━━━━━━━━━
🎹 *PERFECTO PARA TI*

Veo que te interesa aprender piano. Tenemos exactamente lo que necesitas:

[CARD: 311]

🚨 IMPORTANTE: NO agregues texto DESPUÉS de [CARD: ID]. La tarjeta contiene TODA la información (precio, características, métodos de pago). Si necesitas explicar algo, hazlo ANTES de la tarjeta, no después.

🚨 CRÍTICO: SOLO menciona información que esté en el catálogo. NO inventes precios, características, ni detalles. Si el catálogo dice "20 secciones", NO digas "283 clases". Usa los datos EXACTOS del catálogo.

**Qué incluye:**
- Contenido completo de piano desde cero hasta nivel avanzado
- Acceso a todos los materiales en Google Drive
- Descarga directa disponible

**Precio:** COP 20,000.00

**Forma de entrega:** 100% digital por Google Drive. Acceso inmediato después del pago.

**Garantía:** Acceso de por vida. Si no te gusta, puedes solicitar reembolso en 7 días.

¿Te gustaría proceder con la compra?
━━━━━━━━━━━━━━━━━━━━━━━━

${personalizedContext}
`.trim();

  console.log(`📝 [AGENT-PROMPT] Prompt del sistema generado - Longitud: ${systemPrompt.length} caracteres - ${new Date().toISOString()}`);

  // Context Intelligence Enhancement: Enhanced greeting detection and context-aware prompting
  // Detección de saludo pura (sin intención de compra evidente)
  const commonGreetings = ["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "hola!", "hola.", "hola muy buenas", "que tal", "como estas"];
  const isGreetingOnly = commonGreetings.some(k => lastText.trim().toLowerCase().includes(k)) && lastText.split(' ').length <= 4;
  // 🎯 BÚSQUEDA DE PRODUCTOS INTELIGENTE CON RAZONAMIENTO
  // Primero: Detectar si es confirmación
  // Segundo: Buscar el producto basándose en el tema detectado
  
  let productForRequest = null;
  const lastTextLower = lastText.toLowerCase();
  
  // 🔍 VERIFICAR SI EL CLIENTE ESTÁ CONFIRMANDO O RECHAZANDO
  const isConfirmation = lastTextLower.includes("sí") || 
                         lastTextLower.includes("si") ||
                         lastTextLower.includes("ok") ||
                         lastTextLower.includes("dale") ||
                         lastTextLower.includes("bueno") ||
                         lastTextLower.includes("perfecto") ||
                         lastTextLower.includes("me gustaría") ||
                         lastTextLower.includes("quiero") ||
                         lastTextLower.includes("adelante");
  
  // Si el cliente está confirmando, MANTENER el producto anterior
  if (isConfirmation && history.length > 0) {
    // Buscar el último mensaje del AGENTE que contenga [CARD:
    const lastAgentCardMessage = history.slice().reverse().find(msg => 
      msg.role === "agent" && msg.content.includes("[CARD:")
    );
    
    if (lastAgentCardMessage) {
      // Extraer el ID del producto del mensaje anterior
      const cardMatch = lastAgentCardMessage.content.match(/\[CARD:\s*(\d+)\s*\]/);
      if (cardMatch) {
        const productId = parseInt(cardMatch[1]);
        productForRequest = productList.find(p => p.id === productId);
        console.log(`✅ [PRODUCT-CONFIRMATION] Cliente confirmando producto anterior: ${productForRequest?.name} (ID: ${productForRequest?.id})`);
      }
    } else {
      console.log(`⚠️ [PRODUCT-CONFIRMATION] Cliente confirmando pero no hay [CARD:] anterior en el historial`);
    }
  }
  
  // 🚫 EVITAR REPETIR TARJETAS: Si el producto ya fue enviado, NO incluirlo de nuevo
  if (productForRequest && sentCards.has(productForRequest.id)) {
    console.log(`🚫 [PRODUCT-SKIP] Producto ${productForRequest.name} (ID: ${productForRequest.id}) ya fue enviado. No se incluirá tarjeta.`);
    productForRequest = null; // No incluir la tarjeta de nuevo
  }
  
  // Si no es confirmación, buscar producto basándose en el tema detectado
  if (!productForRequest && conversationContext.currentTopic) {
    // Mapeo de temas a IDs de productos
    const topicToProductId: { [key: string]: number } = {
      "piano": 311,
      "guitarra": 251,
      "excel": 286,
      "diseño": 312,
      "trading": 313,
      "idiomas": 305,
      "programación": 246,
      "hacking": 230,
      "marketing": 274,
      "fitness": 268,
    };
    
    const productId = topicToProductId[conversationContext.currentTopic];
    if (productId && !sentCards.has(productId)) {
      productForRequest = productList.find(p => p.id === productId);
      console.log(`🎯 [PRODUCT-TOPIC] Tema detectado: ${conversationContext.currentTopic} → Producto: ${productForRequest?.name} (ID: ${productForRequest?.id})`);
    } else if (productId && sentCards.has(productId)) {
      console.log(`🚫 [PRODUCT-SKIP] Producto para tema "${conversationContext.currentTopic}" (ID: ${productId}) ya fue enviado.`);
    }
  }
  
  // Si encontramos un producto, agregarlo al prompt
  let productInstruction = "";
  if (productForRequest) {
    const features = (productForRequest.features as string[]) || [];
    const featuresText = features.length > 0 
      ? `\nCaracterísticas:\n${features.map(f => `  • ${f}`).join('\n')}`
      : '';
    
    productInstruction = `\n\n🎯 PRODUCTO A RECOMENDAR:\nNombre: ${productForRequest.name}\nID: ${productForRequest.id}\nPrecio: ${formatPrice(Number(productForRequest.price), productForRequest.currency)}\nDescripción: ${productForRequest.description}${featuresText}\n\n🚨 DEBES incluir [CARD: ${productForRequest.id}] en tu respuesta.\n🚨 USA SOLO la información de arriba. NO inventes datos.`;
  } else if (sentCards.size > 0) {
    // Si ya se envió una tarjeta, informar a la IA para que NO la repita
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
    finalPrompt = baseSystemPrompt + `\n\n🚨 CONTEXTO: El cliente quiere comprar.
Tu objetivo es FACILITAR el pago de forma rápida y clara.
Presenta las opciones de pago disponibles (MercadoPago, PayPal, Transferencia).${productInstruction}`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n💳 *¡PERFECTO! VAMOS A PROCESAR TU COMPRA*\n\n`;
  }
  
  // 🎯 ESTRATEGIA 2: PRIMERA VEZ (SALUDO + PRESENTACIÓN)
  else if (isGreetingOnly && !conversationContext.hasIntroduced) {
    console.log(`👋 [AGENT-STRATEGY] Primer contacto - Presentación`);
    finalPrompt = baseSystemPrompt + `\n\n🚨 CONTEXTO: Es el primer contacto con el cliente.
Tu objetivo es PRESENTAR la empresa de forma cálida y DESCUBRIR qué le interesa.
Sé breve, amigable y haz una pregunta clara.`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n👋 *¡Bienvenido/a!*\n\n`;
  }
  
  // 🎯 ESTRATEGIA 3: CLIENTE RECURRENTE (SALUDO CÁLIDO)
  else if (isGreetingOnly && conversationContext.hasIntroduced) {
    console.log(`👋 [AGENT-STRATEGY] Cliente recurrente - Saludo cálido`);
    finalPrompt = baseSystemPrompt + `\n\n🚨 CONTEXTO: El cliente ya conoce TecnoVariedades.
Tu objetivo es REACTIVAR su interés de forma cálida.
Sé breve, personalizado y pregunta cómo puedes ayudar.`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n👋 *¡Qué gusto verte de nuevo!*\n\n`;
  }
  
  // 🎯 ESTRATEGIA 4: CONVERSACIÓN GENERAL (RAZONAMIENTO LIBRE)
  else {
    console.log(`💬 [AGENT-STRATEGY] Conversación general - Razonamiento libre`);
    finalPrompt = baseSystemPrompt + `\n\n🚨 CONTEXTO: El cliente está explorando o preguntando algo específico.
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
    { role: "system", content: finalPrompt + "\n\n🚨 REGLAS CRÍTICAS FINALES:\n(1) Prohibido 'Hola, muy buenas'\n(2) JAMÁS escribas detalles técnicos — la [CARD: ID] ya los contiene\n(3) Ignora datos técnicos del historial\n(4) ⚠️ NUNCA escribas texto DESPUÉS de [CARD: ID] — la tarjeta es el FINAL de tu mensaje\n(5) Si necesitas explicar algo, hazlo ANTES de [CARD: ID], no después\n(6) Formato correcto: 'Texto breve + [CARD: ID]' — FIN. Nada más.\n(7) 🚨 CRÍTICO: NO INVENTES INFORMACIÓN. Usa SOLO los datos del catálogo. Si el precio es COP 20,000, NO digas COP 50,000. Si dice '20 secciones', NO digas '283 clases'. Datos EXACTOS del catálogo." },
    // Prefill: el mensaje del asistente ya empieza con el formato correcto, la IA solo continúa
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
      
      // Obtener configuraciones de todas las fuentes
      const nvidiaEnv = getProviderConfig("nvidia");
      const githubEnv = getProviderConfig("github");
      const dbConfig = appSettings ? getProviderConfigFromSettings(appSettings) : null;
      const ollamaConfig = appSettings ? getProviderConfigFromSettings({ ...appSettings, aiProvider: 'ollama_local' }) : getProviderConfig("ollama_local");

      // 1. Prioridad: NVIDIA 70b (Si hay API Key)
      if (nvidiaEnv) rotationQueue.push({ config: nvidiaEnv, source: "nvidia_70b" });
      
      // 2. Prioridad: GitHub / Copilot (Configurado en Dashboard o Env)
      if (dbConfig && (dbConfig.baseUrl.includes("github") || dbConfig.baseUrl.includes("azure"))) {
        rotationQueue.push({ config: dbConfig, source: "github_dashboard" });
      } else if (githubEnv) {
        rotationQueue.push({ config: githubEnv, source: "github_env" });
      }

      // 3. Prioridad: NVIDIA Fast (8b)
      const nvidiaFast = getProviderConfig("nvidia_fast");
      if (nvidiaFast) rotationQueue.push({ config: nvidiaFast, source: "nvidia_8b" });

      // 4. Prioridad: Ollama Local (Respaldo final si falla el internet)
      if (ollamaConfig) {
        rotationQueue.push({ config: ollamaConfig, source: "ollama_local" });
      }

      console.log(`🔄 [AGENT-AI] Cola de rotación preparada con ${rotationQueue.length} proveedores: ${rotationQueue.map(q => q.source).join(" -> ")}`);

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
        raw = `━━━━━━━━━━━━━━━━━━━━━━━━
👋 ¡Hola! Bienvenido/a a *TecnoVariedades D&S* 😊

Aquí encontrarás MegaPacks digitales con cursos y contenido premium en diferentes categorías 🎓✨

📚 Diseño
🎹 Música
📈 Trading
🌎 Idiomas
💻 Programación
y mucho más 🙌

Todo se entrega de forma digital por Google Drive y con acceso de por vida 🔥

Cuéntame 😊
¿Qué te gustaría aprender o en qué tema estás interesado/a hoy?
━━━━━━━━━━━━━━━━━━━━━━━━`;
      } else if (isGreetingOnly && conversationContext.hasIntroduced) {
        console.log(`⚡ [AGENT-FAST-TRACK] Enviando saludo recurrente hardcodeado instantáneo - ${new Date().toISOString()}`);
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
