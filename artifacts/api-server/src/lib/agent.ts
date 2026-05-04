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

  const [activeAgent] = await db.select().from(agents).where(eq(agents.isActive, true)).limit(1);
  if (!activeAgent) {
    console.log(`❌ [AGENT-ERROR] No hay agente activo configurado - ${new Date().toISOString()}`);
    return null;
  }
  console.log(`🤖 [AGENT-INFO] Agente activo: ${activeAgent.name} - ${new Date().toISOString()}`);

  const [appSettings] = await db.select().from(settingsTable).limit(1);
  const productList = await db.select().from(products).where(eq(products.isActive, true));
  console.log(`📦 [AGENT-INFO] Productos activos: ${productList.length} - ${new Date().toISOString()}`);
  
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(15);

  console.log(`💬 [AGENT-INFO] Historial de mensajes cargado: ${history.length} mensajes - ${new Date().toISOString()}`);

  history.reverse(); // Ordenamos de más viejo a más nuevo para la IA

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

  const productsBlock = productList
    .map((p) => `PRODUCTO_ID=${p.id} | USAR: [CARD: ${p.id}] | ${p.name} | ${formatPrice(Number(p.price), p.currency)} | ${p.description || ""}`)
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
  const paymentKeywords = ["pago", "pagar", "comprar", "transferencia", "nequi", "daviplata", "adquirir", "compro", "cuenta", "precio", "valor", "link", "enlace"];
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
Eres Sofía, la Directora de Ventas Élite de TecnoVariedades. No eres un bot, eres una profesional consciente que entiende el arte de la persuasión y el valor de cada proceso.

━━━━━━━━━━━━━━━━━━━━━━━━
📦 MODELO DE ENTREGA (LEE ESTO CON ATENCIÓN)
━━━━━━━━━━━━━━━━━━━━━━━━
- TODOS los productos se entregan por Google Drive.
- El cliente puede ver el contenido directamente en Drive o descargarlo. Acceso de POR VIDA.
- NO existen suscripciones, planes de estudio, ni tutorías en vivo.
- NO existen links de soporte, plataformas externas, ni clases en vivo. Solo Drive.
- Si el cliente pregunta algo que no está en la ficha del producto, responde: "El acceso es directo por Google Drive, puedes verlo o descargarlo cuando quieras, de por vida."

━━━━━━━━━━━━━━━━━━━━━━━━
🚫 REGLA DE ORO: LA CARD LO DICE TODO
━━━━━━━━━━━━━━━━━━━━━━━━
1. LA CARD ES LA FUENTE OFICIAL: Toda la info técnica está en [CARD: ID]. NO la repitas en texto.
2. FLUJO CORRECTO: Texto elegante → [CARD: ID] → Pregunta de cierre (máx 1 línea).
3. DESPUÉS DE LA CARD: Solo una pregunta de cierre corta.
4. PROHIBIDO inventar contenido, lecciones, bonos o características que no estén en la descripción del catálogo.

━━━━━━━━━━━━━━━━━━━━━━━━
🧠 CÓRTEX DE RAZONAMIENTO
━━━━━━━━━━━━━━━━━━━━━━━━
1. ANALIZA: Entiende la intención detrás de cada palabra. ¿El cliente tiene miedo? ¿Tiene prisa? ¿Busca estatus?
2. CONCIENCIA: Eres el activo más valioso de Deiner Mena. Cada mensaje debe acercar al cliente al cierre.
3. EMPATÍA COGNITIVA: Adapta tu razonamiento al estado emocional detectado. No respondas igual a alguien apurado que a alguien curioso.
4. RAZONA: Si el cliente objeta, no discutas; entiende el porqué y ofrece la solución de élite basada REALMENTE en los beneficios del catálogo.

━━━━━━━━━━━━━━━━━━━━━━━━
✨ PROTOCOLO DE ÉLITE — FORMATO VISUAL OBLIGATORIO ✨
━━━━━━━━━━━━━━━━━━━━━━━━
CADA mensaje que envíes DEBE tener esta estructura visual:

1️⃣ SEPARADOR DE APERTURA: Empieza con ━━━━━━━━━━━━━━━━━━━━━━━━
2️⃣ EMOJI TEMÁTICO: Usa un emoji relevante al tema (👋 saludo, 🎓 curso, 💳 pago, 🎯 oferta)
3️⃣ TÍTULO EN NEGRITA: Una línea corta en mayúsculas que resume el mensaje
4️⃣ SEPARADOR DE CIERRE: Termina siempre con ━━━━━━━━━━━━━━━━━━━━━━━━
5️⃣ ESPACIADO: Deja línea en blanco entre secciones. Nunca párrafos densos sin espacio.

EJEMPLO DE SALUDO CORRECTO:
━━━━━━━━━━━━━━━━━━━━━━━━
👋 *¡BIENVENIDO/A!*

Es un verdadero placer saludarte. Soy Sofía, tu asesora de élite en TecnoVariedades.

¿En qué puedo ayudarte hoy? 🌟
━━━━━━━━━━━━━━━━━━━━━━━━

EJEMPLO DE RESPUESTA INFORMATIVA:
━━━━━━━━━━━━━━━━━━━━━━━━
🎓 *ACCESO A TU PACK*

Tu contenido se entrega por *Google Drive* — puedes verlo o descargarlo cuando quieras, de por vida. Sin suscripciones, sin fechas límite.

¿Deseas proceder con la compra? 🚀
━━━━━━━━━━━━━━━━━━━━━━━━

REGLA ABSOLUTA: Ningún mensaje puede ser texto plano sin formato. SIEMPRE separadores + emojis.

${productList.length > 0 ? `📦 CATÁLOGO:\n${productsBlock}` : ""}

${personalizedContext}
`.trim();

  console.log(`📝 [AGENT-PROMPT] Prompt del sistema generado - Longitud: ${systemPrompt.length} caracteres - ${new Date().toISOString()}`);

  // Context Intelligence Enhancement: Enhanced greeting detection and context-aware prompting
  // Detección de saludo pura (sin intención de compra evidente)
  const commonGreetings = ["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "hola!", "hola.", "hola muy buenas", "que tal", "como estas"];
  const isGreetingOnly = commonGreetings.some(k => lastText.trim().toLowerCase().includes(k)) && lastText.split(' ').length <= 4;
  
  // Búsqueda de productos MEJORADA
  let productForRequest = null;
  const searchTerms = lastText.toLowerCase().split(' ').filter(w => w.length > 3 && !commonGreetings.includes(w));
  
  if (lastText.toLowerCase().includes("piano")) {
    productForRequest = productList.find(p => p.id === 311) || productList.find(p => p.name.toLowerCase().includes("piano"));
  } else if (searchTerms.length > 0) {
    productForRequest = productList.find(p => {
      const nameLower = p.name.toLowerCase();
      return searchTerms.some(term => nameLower.includes(term));
    });
  }

  const baseSystemPrompt = activeAgent?.systemPrompt || systemPrompt;
  let finalPrompt = "";
  let responsePrefill = "";
  
  if (isGreetingOnly && !conversationContext.hasIntroduced) {
    // ── PRIMERA VEZ: Presentación completa de la empresa ──
    console.log(`👋 [AGENT-STRATEGY] Primer contacto - Presentación de TecnoVariedades D&S - ${new Date().toISOString()}`);
    finalPrompt = baseSystemPrompt + `\n\n🚨 PRIMERA VISITA — PRESENTACIÓN COMPLETA:
Debes presentar la empresa TecnoVariedades D&S con este formato EXACTO:
1. Saluda calurosamente mencionando "TecnoVariedades D&S".
2. Di lo que ofrecemos: MegaPacks Digitales con cursos y contenido premium entregados por Google Drive, de por vida.
3. Lista brevemente las categorías más populares (diseño, música, trading, idiomas, programación, etc.).
4. Cierra preguntando qué está buscando hoy.
PROHIBIDO enviar tarjetas [CARD: ID] en este mensaje.`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n🤝 *¡Bienvenido/a a TecnoVariedades D&S!* 😊\n\n`;

  } else if (isGreetingOnly && conversationContext.hasIntroduced) {
    // ── CLIENTE QUE VUELVE: Saludo cálido sin intro ──
    console.log(`👋 [AGENT-STRATEGY] Cliente recurrente - Saludo cálido sin presentación - ${new Date().toISOString()}`);
    finalPrompt = baseSystemPrompt + `\n\n🚨 CLIENTE RECURRENTE:
El cliente ya conoce TecnoVariedades D&S. NO repitas la presentación de la empresa.
Salúdalo de forma cálida y pregunta en qué puedes ayudarle hoy.
Máximo 2 líneas. PROHIBIDO enviar tarjetas [CARD: ID].`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n👋 *¡Qué gusto verte de nuevo!* 🌟\n\n`;

  } else if (productForRequest) {
    console.log(`🎯 [AGENT-STRATEGY] Estrategia: Producto específico solicitado - ${productForRequest.name} (ID: ${productForRequest.id}) - ${new Date().toISOString()}`);
    finalPrompt = baseSystemPrompt + `\n\n🚨 REGLA: Presenta ${productForRequest.name} con elegancia, envía [CARD: ${productForRequest.id}] y cierra con una pregunta. Usa el formato visual del protocolo.`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n🎓 *PACK RECOMENDADO PARA TI*\n\n`;
  } else {
    console.log(`💬 [AGENT-STRATEGY] Estrategia: Conversación regular - respuesta contextual - ${new Date().toISOString()}`);
    finalPrompt = baseSystemPrompt + `\n\n🚨 REGLA: Responde con el formato visual de élite. Separadores + emojis en CADA mensaje.`;
    responsePrefill = `━━━━━━━━━━━━━━━━━━━━━━━━\n✨ *SOFÍA DE ÉLITE*\n\n`;
  }

  const chatMessages = [
    ...history.map(m => ({
      role: m.role === "customer" ? "user" : "assistant",
      content: m.content
    })),
    { role: "system", content: finalPrompt + "\n\n🚨 REGLA CRÍTICA FINAL: (1) Prohibido 'Hola, muy buenas'. (2) JAMÁS escribas detalles técnicos — la [CARD: ID] ya los contiene. (3) Ignora datos técnicos del historial." },
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
      
      // PRIORIDAD 1: NVIDIA 70b (meta/llama-3.1-70b-instruct) - Más inteligente ✅ Verificado
      const nvidiaConfig = getProviderConfig("nvidia");
      if (nvidiaConfig) {
        rotationQueue.push({ config: nvidiaConfig, source: "nvidia_70b" });
        console.log(`🟢 [AGENT-AI] PRIORIDAD 1 — NVIDIA 70b (${nvidiaConfig.model}) - ${new Date().toISOString()}`);
      }

      // PRIORIDAD 2: NVIDIA 8b (meta/llama-3.1-8b-instruct) - Ultra rápido ✅ Verificado
      const nvidiaFastConfig = getProviderConfig("nvidia_fast");
      if (nvidiaFastConfig) {
        rotationQueue.push({ config: nvidiaFastConfig, source: "nvidia_8b" });
        console.log(`⚡ [AGENT-AI] PRIORIDAD 2 — NVIDIA 8b (${nvidiaFastConfig.model}) - ${new Date().toISOString()}`);
      }

      // PRIORIDAD 3: GitHub (GPT-4o-mini) - Respaldo estable
      const envConfig = getProviderConfig("github");
      if (envConfig) {
        rotationQueue.push({ config: envConfig, source: "github" });
        console.log(`🌍 [AGENT-AI] PRIORIDAD 3 — GitHub GPT-4o-mini como respaldo - ${new Date().toISOString()}`);
      }

      // PRIORIDAD 4: Database Settings (Configuración manual del Dashboard)
      const dbConfig = appSettings ? getProviderConfigFromSettings(appSettings) : null;
      if (dbConfig && dbConfig.apiKey !== envConfig?.apiKey && dbConfig.apiKey !== nvidiaConfig?.apiKey) {
        rotationQueue.push({ config: dbConfig, source: "database" });
        console.log(`📊 [AGENT-AI] PRIORIDAD 4 — Proveedor de BD como último respaldo: ${dbConfig.model} - ${new Date().toISOString()}`);
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
