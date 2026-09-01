/**
 * Sistema de Inteligencia Avanzada para el Bot de Ventas
 * 
 * Este módulo proporciona análisis profundo de intención, contexto y comportamiento
 * para que el bot NUNCA se quede en blanco y siempre responda de forma inteligente.
 */

import { logger } from "./logger";

// ============================================================================
// TIPOS Y INTERFACES
// ============================================================================

export interface IntentionAnalysis {
  primaryIntent: string;
  secondaryIntents: string[];
  confidence: number;
  category: 'question' | 'objection' | 'interest' | 'purchase' | 'complaint' | 'greeting' | 'farewell' | 'clarification';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  sentiment: 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
  keywords: string[];
  missingInfo: string[];
  suggestedResponse: string;
}

export interface ContextualUnderstanding {
  whatClientWants: string;
  whyTheyWant: string;
  whenTheyNeed: string;
  howMuchTheyKnow: 'nothing' | 'little' | 'some' | 'expert';
  painPoints: string[];
  motivations: string[];
  barriers: string[];
}

export interface IntelligentResponse {
  shouldAskClarification: boolean;
  clarificationQuestion?: string;
  shouldProvideAlternatives: boolean;
  alternatives?: string[];
  shouldEscalate: boolean;
  escalationReason?: string;
  confidence: number;
  responseStrategy: 'direct' | 'educational' | 'consultative' | 'empathetic' | 'persuasive';
}

// ============================================================================
// ANÁLISIS DE INTENCIÓN PROFUNDO
// ============================================================================

/**
 * Analiza la intención del cliente con IA avanzada
 */
export function analyzeDeepIntention(message: string, conversationHistory: any[]): IntentionAnalysis {
  const messageLower = message.toLowerCase();
  const words = messageLower.split(/\s+/);
  
  // Patrones de intención
  const intentPatterns = {
    // Preguntas sobre productos
    product_info: [
      /qué (incluye|trae|contiene|tiene)/i,
      /cuál(es)? (son|es) (el|la|los|las)/i,
      /información (sobre|de|del)/i,
      /detalles (de|del|sobre)/i,
      /características/i,
      /especificaciones/i,
    ],
    
    // Preguntas sobre precio
    price_inquiry: [
      /cuánto (cuesta|vale|es|sale)/i,
      /precio/i,
      /costo/i,
      /valor/i,
      /cuánto (me|te) (cuesta|sale)/i,
    ],
    
    // Preguntas sobre entrega
    delivery_inquiry: [
      /cómo (me )?(lo )?(entregan|envían|mandan)/i,
      /cuándo (llega|recibo)/i,
      /tiempo de entrega/i,
      /envío/i,
      /delivery/i,
    ],
    
    // Preguntas sobre garantía
    warranty_inquiry: [
      /garantía/i,
      /devolución/i,
      /reembolso/i,
      /si no (me gusta|funciona)/i,
    ],
    
    // Intención de compra
    purchase_intent: [
      /quiero (comprar|adquirir)/i,
      /me interesa/i,
      /lo (quiero|necesito)/i,
      /cómo (compro|pago)/i,
      /dónde (pago|compro)/i,
    ],
    
    // Objeciones
    objection: [
      /muy caro/i,
      /no tengo (dinero|plata)/i,
      /no puedo (pagar|comprar)/i,
      /es mucho/i,
      /no estoy seguro/i,
      /déjame pensarlo/i,
    ],
    
    // Comparaciones
    comparison: [
      /diferencia (entre|con)/i,
      /mejor que/i,
      /comparado con/i,
      /cuál es mejor/i,
      /qué me recomiendas/i,
    ],
    
    // Soporte técnico
    technical_support: [
      /no funciona/i,
      /problema con/i,
      /error/i,
      /ayuda con/i,
      /cómo (uso|funciona)/i,
    ],
    
    // Quejas
    complaint: [
      /no me llegó/i,
      /no recibí/i,
      /estafa/i,
      /fraude/i,
      /mal servicio/i,
    ],
  };
  
  // Detectar intención primaria
  let primaryIntent = 'general_inquiry';
  let maxMatches = 0;
  
  for (const [intent, patterns] of Object.entries(intentPatterns)) {
    const matches = patterns.filter(pattern => pattern.test(messageLower)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      primaryIntent = intent;
    }
  }
  
  // Detectar intenciones secundarias
  const secondaryIntents: string[] = [];
  for (const [intent, patterns] of Object.entries(intentPatterns)) {
    if (intent !== primaryIntent && patterns.some(pattern => pattern.test(messageLower))) {
      secondaryIntents.push(intent);
    }
  }
  
  // Categorizar
  let category: IntentionAnalysis['category'] = 'question';
  if (primaryIntent.includes('purchase') || messageLower.includes('comprar')) {
    category = 'purchase';
  } else if (primaryIntent === 'objection') {
    category = 'objection';
  } else if (primaryIntent === 'complaint') {
    category = 'complaint';
  } else if (messageLower.match(/hola|buenos|buenas|saludos/)) {
    category = 'greeting';
  } else if (messageLower.match(/gracias|adiós|chao|hasta luego/)) {
    category = 'farewell';
  } else if (messageLower.match(/no entiendo|explica|aclara/)) {
    category = 'clarification';
  } else if (primaryIntent.includes('inquiry') || messageLower.includes('?')) {
    category = 'question';
  } else if (messageLower.match(/me interesa|quiero saber|información/)) {
    category = 'interest';
  }
  
  // Detectar urgencia
  let urgency: IntentionAnalysis['urgency'] = 'low';
  if (messageLower.match(/urgente|rápido|ya|ahora|inmediato/)) {
    urgency = 'critical';
  } else if (messageLower.match(/pronto|hoy|mañana/)) {
    urgency = 'high';
  } else if (messageLower.match(/esta semana|próximo/)) {
    urgency = 'medium';
  }
  
  // Detectar sentimiento
  let sentiment: IntentionAnalysis['sentiment'] = 'neutral';
  const positiveWords = ['excelente', 'genial', 'perfecto', 'me gusta', 'fantástico', 'bueno'];
  const negativeWords = ['malo', 'terrible', 'horrible', 'pésimo', 'no me gusta', 'decepcionante'];
  
  const positiveCount = positiveWords.filter(w => messageLower.includes(w)).length;
  const negativeCount = negativeWords.filter(w => messageLower.includes(w)).length;
  
  if (positiveCount > negativeCount) {
    sentiment = positiveCount > 2 ? 'very_positive' : 'positive';
  } else if (negativeCount > positiveCount) {
    sentiment = negativeCount > 2 ? 'very_negative' : 'negative';
  }
  
  // Extraer keywords
  const stopWords = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'o', 'que', 'es', 'por', 'para', 'con', 'me', 'te', 'se'];
  const keywords = words
    .filter(w => w.length > 3 && !stopWords.includes(w))
    .slice(0, 5);
  
  // Detectar información faltante
  const missingInfo: string[] = [];
  if (primaryIntent === 'purchase_intent' && !messageLower.match(/producto|pack|curso/)) {
    missingInfo.push('producto_especifico');
  }
  if (category === 'question' && words.length < 3) {
    missingInfo.push('contexto_adicional');
  }
  
  // Calcular confianza
  const confidence = Math.min(100, (maxMatches * 30) + (keywords.length * 10) + 20);
  
  // Sugerir respuesta
  let suggestedResponse = '';
  if (category === 'question' && missingInfo.length > 0) {
    suggestedResponse = 'ask_clarification';
  } else if (category === 'purchase') {
    suggestedResponse = 'facilitate_purchase';
  } else if (category === 'objection') {
    suggestedResponse = 'handle_objection';
  } else if (category === 'complaint') {
    suggestedResponse = 'empathize_and_solve';
  } else {
    suggestedResponse = 'provide_information';
  }
  
  logger.info({
    primaryIntent,
    category,
    urgency,
    sentiment,
    confidence
  }, '[AdvancedIntelligence] Intention analyzed');
  
  return {
    primaryIntent,
    secondaryIntents,
    confidence,
    category,
    urgency,
    sentiment,
    keywords,
    missingInfo,
    suggestedResponse,
  };
}

// ============================================================================
// COMPRENSIÓN CONTEXTUAL
// ============================================================================

/**
 * Entiende profundamente qué quiere el cliente y por qué
 */
export function understandContext(
  message: string,
  conversationHistory: any[],
  intentionAnalysis: IntentionAnalysis
): ContextualUnderstanding {
  const messageLower = message.toLowerCase();
  
  // ¿Qué quiere el cliente?
  let whatClientWants = 'información general';
  if (intentionAnalysis.primaryIntent === 'product_info') {
    whatClientWants = 'conocer detalles del producto';
  } else if (intentionAnalysis.primaryIntent === 'price_inquiry') {
    whatClientWants = 'saber el precio';
  } else if (intentionAnalysis.primaryIntent === 'purchase_intent') {
    whatClientWants = 'comprar el producto';
  } else if (intentionAnalysis.primaryIntent === 'delivery_inquiry') {
    whatClientWants = 'saber cómo se entrega';
  } else if (intentionAnalysis.primaryIntent === 'warranty_inquiry') {
    whatClientWants = 'conocer la garantía';
  } else if (intentionAnalysis.primaryIntent === 'comparison') {
    whatClientWants = 'comparar opciones';
  }
  
  // ¿Por qué lo quiere?
  let whyTheyWant = 'curiosidad general';
  if (intentionAnalysis.urgency === 'critical') {
    whyTheyWant = 'necesidad urgente';
  } else if (messageLower.match(/necesito|requiero/)) {
    whyTheyWant = 'necesidad específica';
  } else if (messageLower.match(/me interesa|quiero aprender/)) {
    whyTheyWant = 'desarrollo personal';
  } else if (messageLower.match(/trabajo|negocio|empresa/)) {
    whyTheyWant = 'uso profesional';
  }
  
  // ¿Cuándo lo necesita?
  let whenTheyNeed = 'sin prisa';
  if (intentionAnalysis.urgency === 'critical') {
    whenTheyNeed = 'inmediatamente';
  } else if (intentionAnalysis.urgency === 'high') {
    whenTheyNeed = 'pronto';
  } else if (intentionAnalysis.urgency === 'medium') {
    whenTheyNeed = 'esta semana';
  }
  
  // ¿Cuánto sabe?
  let howMuchTheyKnow: ContextualUnderstanding['howMuchTheyKnow'] = 'little';
  const technicalTerms = ['api', 'framework', 'algoritmo', 'backend', 'frontend', 'database'];
  const hasTechnicalTerms = technicalTerms.some(term => messageLower.includes(term));
  
  if (hasTechnicalTerms) {
    howMuchTheyKnow = 'expert';
  } else if (message.length > 100 && intentionAnalysis.keywords.length > 3) {
    howMuchTheyKnow = 'some';
  } else if (messageLower.match(/no sé|no entiendo|explica/)) {
    howMuchTheyKnow = 'nothing';
  }
  
  // Pain points (problemas que tiene)
  const painPoints: string[] = [];
  if (messageLower.match(/no tengo tiempo/)) painPoints.push('falta de tiempo');
  if (messageLower.match(/no sé (cómo|como)/)) painPoints.push('falta de conocimiento');
  if (messageLower.match(/caro|costoso|mucho dinero/)) painPoints.push('presupuesto limitado');
  if (messageLower.match(/no funciona|problema/)) painPoints.push('problema técnico');
  
  // Motivaciones
  const motivations: string[] = [];
  if (messageLower.match(/aprender|estudiar/)) motivations.push('aprendizaje');
  if (messageLower.match(/trabajo|empleo|carrera/)) motivations.push('desarrollo profesional');
  if (messageLower.match(/negocio|empresa|vender/)) motivations.push('emprendimiento');
  if (messageLower.match(/hobby|pasatiempo/)) motivations.push('entretenimiento');
  
  // Barreras
  const barriers: string[] = [];
  if (intentionAnalysis.category === 'objection') barriers.push('objeción de precio');
  if (messageLower.match(/no estoy seguro|dudas/)) barriers.push('incertidumbre');
  if (messageLower.match(/no confío|estafa/)) barriers.push('falta de confianza');
  if (intentionAnalysis.missingInfo.length > 0) barriers.push('falta de información');
  
  return {
    whatClientWants,
    whyTheyWant,
    whenTheyNeed,
    howMuchTheyKnow,
    painPoints,
    motivations,
    barriers,
  };
}

// ============================================================================
// ESTRATEGIA DE RESPUESTA INTELIGENTE
// ============================================================================

/**
 * Determina la mejor estrategia para responder
 */
export function determineResponseStrategy(
  intentionAnalysis: IntentionAnalysis,
  contextualUnderstanding: ContextualUnderstanding,
  conversationHistory: any[]
): IntelligentResponse {
  let shouldAskClarification = false;
  let clarificationQuestion: string | undefined;
  let shouldProvideAlternatives = false;
  let alternatives: string[] | undefined;
  let shouldEscalate = false;
  let escalationReason: string | undefined;
  let responseStrategy: IntelligentResponse['responseStrategy'] = 'direct';
  
  // Si falta información crítica, pedir aclaración
  if (intentionAnalysis.missingInfo.length > 0) {
    shouldAskClarification = true;
    
    if (intentionAnalysis.missingInfo.includes('producto_especifico')) {
      clarificationQuestion = 'No le hagas preguntas. Simplemente ofrécele nuestras categorías principales (piano, diseño, trading, idiomas, etc.) y deja que decida.';
    } else if (intentionAnalysis.missingInfo.includes('contexto_adicional')) {
      clarificationQuestion = 'No hagas preguntas para pedir más detalles. Proporciona información general y espera su reacción.';
    }
  }
  
  // Si el cliente no sabe mucho, usar estrategia educativa
  if (contextualUnderstanding.howMuchTheyKnow === 'nothing' || contextualUnderstanding.howMuchTheyKnow === 'little') {
    responseStrategy = 'educational';
  }
  
  // Si hay objeciones, usar estrategia empática
  if (intentionAnalysis.category === 'objection' || contextualUnderstanding.barriers.length > 0) {
    responseStrategy = 'empathetic';
  }
  
  // Si hay interés alto, usar estrategia persuasiva
  if (intentionAnalysis.category === 'purchase' || intentionAnalysis.urgency === 'critical') {
    responseStrategy = 'persuasive';
  }
  
  // Si hay comparación, ofrecer alternativas
  if (intentionAnalysis.primaryIntent === 'comparison') {
    shouldProvideAlternatives = true;
    alternatives = ['Opción básica', 'Opción intermedia', 'Opción premium'];
  }
  
  // Si hay queja seria, escalar
  if (intentionAnalysis.category === 'complaint' && intentionAnalysis.sentiment === 'very_negative') {
    shouldEscalate = true;
    escalationReason = 'Cliente muy insatisfecho, requiere atención humana';
  }
  
  // Calcular confianza en la estrategia
  const confidence = Math.min(100, intentionAnalysis.confidence + (contextualUnderstanding.painPoints.length * 10));
  
  return {
    shouldAskClarification,
    clarificationQuestion,
    shouldProvideAlternatives,
    alternatives,
    shouldEscalate,
    escalationReason,
    confidence,
    responseStrategy,
  };
}

// ============================================================================
// GENERADOR DE RESPUESTAS INTELIGENTES
// ============================================================================

/**
 * Genera el contexto perfecto para que la IA responda inteligentemente
 */
export function generateIntelligentContext(
  message: string,
  conversationHistory: any[],
  currentProduct: any | null
): string {
  const intention = analyzeDeepIntention(message, conversationHistory);
  const understanding = understandContext(message, conversationHistory, intention);
  const strategy = determineResponseStrategy(intention, understanding, conversationHistory);
  
  let context = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 ANÁLISIS INTELIGENTE DE LA CONVERSACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 INTENCIÓN DEL CLIENTE:
- Intención principal: ${intention.primaryIntent}
- Categoría: ${intention.category}
- Urgencia: ${intention.urgency}
- Sentimiento: ${intention.sentiment}
- Confianza: ${intention.confidence}%

🎯 LO QUE EL CLIENTE REALMENTE QUIERE:
- Qué quiere: ${understanding.whatClientWants}
- Por qué lo quiere: ${understanding.whyTheyWant}
- Cuándo lo necesita: ${understanding.whenTheyNeed}
- Nivel de conocimiento: ${understanding.howMuchTheyKnow}

💡 PROBLEMAS Y MOTIVACIONES:
- Pain points: ${understanding.painPoints.join(', ') || 'ninguno detectado'}
- Motivaciones: ${understanding.motivations.join(', ') || 'exploración general'}
- Barreras: ${understanding.barriers.join(', ') || 'ninguna detectada'}

🎬 ESTRATEGIA DE RESPUESTA:
- Estrategia: ${strategy.responseStrategy}
- Confianza: ${strategy.confidence}%
`;

  if (strategy.shouldAskClarification) {
    context += `\n⚠️ ACCIÓN REQUERIDA: Faltan detalles.\n- Instrucción sugerida: "${strategy.clarificationQuestion}"\n`;
  }
  
  if (strategy.shouldProvideAlternatives) {
    context += `\n💎 ACCIÓN REQUERIDA: Ofrecer alternativas\n- Opciones: ${strategy.alternatives?.join(', ')}\n`;
  }
  
  if (strategy.shouldEscalate) {
    context += `\n🚨 ACCIÓN CRÍTICA: Escalar a humano\n- Razón: ${strategy.escalationReason}\n`;
  }
  
  context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 INSTRUCCIONES ESPECÍFICAS PARA ESTA RESPUESTA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  // Instrucciones según la estrategia
  switch (strategy.responseStrategy) {
    case 'educational':
      context += `
🎓 ESTRATEGIA EDUCATIVA:
1. Explica de forma simple y clara
2. Usa ejemplos concretos
3. Evita tecnicismos
4. Ofrece guía paso a paso
5. No hagas preguntas. Deja que el cliente inicie si tiene dudas`;
      break;
      
    case 'empathetic':
      context += `
❤️ ESTRATEGIA EMPÁTICA:
1. Reconoce su preocupación
2. Valida sus sentimientos
3. Ofrece soluciones concretas
4. Reduce el riesgo percibido
5. Muestra casos de éxito`;
      break;
      
    case 'persuasive':
      context += `
🎯 ESTRATEGIA PERSUASIVA:
1. Enfatiza beneficios inmediatos
2. Crea urgencia (sin presionar)
3. Facilita la compra
4. Elimina fricciones
5. Cierra con llamado a la acción`;
      break;
      
    case 'consultative':
      context += `
🤝 ESTRATEGIA CONSULTIVA:
1. Analiza su situación silenciosamente
2. Entiende su situación
3. Recomienda la mejor opción
4. Explica el por qué
5. Construye confianza`;
      break;
      
    default:
      context += `
💬 ESTRATEGIA DIRECTA:
1. Responde de forma clara y concisa
2. Proporciona información completa
3. Anticipa preguntas adicionales
4. Ofrece siguiente paso
5. Mantén la conversación fluida`;
  }
  
  context += `\n\n🚨 REGLA DE ORO: NUNCA te quedes en blanco. Si no sabes algo, di "Déjame verificar esa información" y ofrece alternativas.\n`;
  
  return context;
}

// ============================================================================
// EXPORTAR FUNCIONES PRINCIPALES
// ============================================================================

export const AdvancedIntelligence = {
  analyzeDeepIntention,
  understandContext,
  determineResponseStrategy,
  generateIntelligentContext,
};
