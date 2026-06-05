/**
 * Gestor de Flujo de Conversación
 * Mantiene coherencia y contexto a través de todas las etapas
 */

import { analyzeQuestionIntent, determineNextStage, validateConversationCoherence, ConversationContext } from './semantic-analyzer';

export interface ConversationState {
  sessionId: string;
  context: ConversationContext;
  messageHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    intent?: any;
  }>;
  productContext: {
    currentProduct?: string;
    viewedProducts: string[];
    selectedProduct?: string;
  };
}

/**
 * Inicializa una nueva conversación
 */
export function initializeConversation(sessionId: string): ConversationState {
  return {
    sessionId,
    context: {
      stage: 'greeting',
      customerNeeds: [],
      previousQuestions: []
    },
    messageHistory: [],
    productContext: {
      viewedProducts: []
    }
  };
}

/**
 * Procesa un mensaje del cliente y actualiza el estado
 */
export function processUserMessage(
  state: ConversationState,
  userMessage: string,
  productData?: any
): {
  state: ConversationState;
  shouldRespond: boolean;
  responseGuidance: string;
} {
  // Analizar intención
  const intent = analyzeQuestionIntent(userMessage);

  // Validar coherencia
  const coherenceCheck = validateConversationCoherence(state.context, userMessage, intent);

  // Actualizar historial
  state.messageHistory.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
    intent
  });

  // Actualizar preguntas previas
  state.context.previousQuestions.push(userMessage);
  if (state.context.previousQuestions.length > 10) {
    state.context.previousQuestions.shift(); // Mantener últimas 10
  }

  // Determinar siguiente etapa
  const nextStage = determineNextStage(
    state.context.stage,
    intent,
    !!state.productContext.selectedProduct
  );

  state.context.stage = nextStage;

  // Generar guía de respuesta
  const responseGuidance = generateResponseGuidance(state, intent, coherenceCheck);

  return {
    state,
    shouldRespond: true,
    responseGuidance
  };
}

/**
 * Genera guía para la respuesta del bot
 */
function generateResponseGuidance(
  state: ConversationState,
  intent: any,
  coherenceCheck: any
): string {
  let guidance = '';

  // Etapa actual
  guidance += `[ETAPA: ${state.context.stage}]\n`;

  // Intención detectada
  guidance += `[INTENCIÓN: ${intent.category} (confianza: ${(intent.confidence * 100).toFixed(0)}%)]\n`;

  // Contexto de producto
  if (state.productContext.selectedProduct) {
    guidance += `[PRODUCTO ACTUAL: ${state.productContext.selectedProduct}]\n`;
  }

  // Advertencias de coherencia
  if (coherenceCheck.warning) {
    guidance += `[⚠️ ADVERTENCIA: ${coherenceCheck.warning}]\n`;
  }

  // Instrucciones específicas por etapa
  switch (state.context.stage) {
    case 'greeting':
      guidance += `\nSaluda al cliente de manera amigable y presenta la empresa.\n`;
      guidance += `Pregunta qué producto o servicio busca.`;
      break;

    case 'discovery':
      guidance += `\nEscucha las necesidades del cliente.\n`;
      guidance += `Haz preguntas para entender mejor qué busca.\n`;
      guidance += `Prepárate para recomendar productos.`;
      break;

    case 'recommendation':
      guidance += `\nRecomienda productos basado en las necesidades del cliente.\n`;
      guidance += `Proporciona información clave: precio, características, disponibilidad.\n`;
      guidance += `Usa tarjetas de producto [CARD: ID] para mostrar opciones.`;
      break;

    case 'details':
      guidance += `\nResponde preguntas detalladas sobre:\n`;
      guidance += `- Características y especificaciones\n`;
      guidance += `- Precio y formas de pago\n`;
      guidance += `- Entrega y garantía\n`;
      guidance += `- Disponibilidad\n`;
      guidance += `Mantén coherencia con lo que ya dijiste.`;
      break;

    case 'confirmation':
      guidance += `\nVerifica que el cliente está satisfecho.\n`;
      guidance += `Pregunta si tiene más dudas.\n`;
      guidance += `Prepárate para cerrar la venta.`;
      break;

    case 'closing':
      guidance += `\nFacilita la compra o contacto.\n`;
      guidance += `Proporciona opciones de pago y entrega.\n`;
      guidance += `Despídete profesionalmente.`;
      break;
  }

  // Instrucciones por intención
  switch (intent.category) {
    case 'product':
      guidance += `\n\n[RESPONDER SOBRE]: Características, especificaciones, modelos disponibles`;
      break;
    case 'price':
      guidance += `\n\n[RESPONDER SOBRE]: Precio, descuentos, formas de pago`;
      break;
    case 'delivery':
      guidance += `\n\n[RESPONDER SOBRE]: Tiempo de entrega, costo, ciudades, opciones de recogida`;
      break;
    case 'warranty':
      guidance += `\n\n[RESPONDER SOBRE]: Cobertura, duración, proceso de reclamo`;
      break;
    case 'payment':
      guidance += `\n\n[RESPONDER SOBRE]: Formas de pago aceptadas, cuotas, financiamiento`;
      break;
    case 'availability':
      guidance += `\n\n[RESPONDER SOBRE]: Stock disponible, próximas entregas`;
      break;
  }

  return guidance;
}

/**
 * Valida que la respuesta del bot sea coherente
 */
export function validateBotResponse(
  state: ConversationState,
  botResponse: string
): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Verificar que no contradice respuestas anteriores
  const previousResponses = state.messageHistory
    .filter(m => m.role === 'assistant')
    .map(m => m.content);

  // Verificar que mantiene contexto de producto
  if (state.productContext.selectedProduct) {
    if (!botResponse.includes(state.productContext.selectedProduct) && 
        state.context.stage !== 'closing') {
      issues.push('Respuesta no menciona el producto actual');
    }
  }

  // Verificar que no cambia de tema abruptamente
  if (previousResponses.length > 0) {
    const lastResponse = previousResponses[previousResponses.length - 1];
    const topicShift = detectTopicShift(lastResponse, botResponse);
    if (topicShift) {
      issues.push(`Cambio abrupto de tema: ${topicShift}`);
    }
  }

  // Verificar que responde la pregunta
  if (state.messageHistory.length > 0) {
    const lastUserMessage = state.messageHistory
      .filter(m => m.role === 'user')
      .pop()?.content;
    
    if (lastUserMessage && !answerAddressesQuestion(botResponse, lastUserMessage)) {
      issues.push('Respuesta no aborda la pregunta del cliente');
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Detecta cambios abruptos de tema
 */
function detectTopicShift(previousResponse: string, currentResponse: string): string | null {
  const topics = {
    price: ['precio', 'costo', 'valor', 'cuánto', 'dinero'],
    delivery: ['entrega', 'envío', 'llega', 'tiempo', 'demora'],
    product: ['producto', 'características', 'especificaciones', 'modelo'],
    warranty: ['garantía', 'cobertura', 'reclamo'],
    payment: ['pago', 'tarjeta', 'crédito', 'cuotas']
  };

  let prevTopic = '';
  let currTopic = '';

  for (const [topic, keywords] of Object.entries(topics)) {
    if (keywords.some(k => previousResponse.toLowerCase().includes(k))) {
      prevTopic = topic;
    }
    if (keywords.some(k => currentResponse.toLowerCase().includes(k))) {
      currTopic = topic;
    }
  }

  if (prevTopic && currTopic && prevTopic !== currTopic) {
    return `${prevTopic} → ${currTopic}`;
  }

  return null;
}

/**
 * Verifica que la respuesta aborda la pregunta
 */
function answerAddressesQuestion(response: string, question: string): boolean {
  // Palabras clave de la pregunta
  const questionWords = question.toLowerCase().split(/\s+/);
  
  // Verificar que al menos 30% de palabras clave están en la respuesta
  const responseWords = response.toLowerCase();
  const matchedWords = questionWords.filter(word => 
    word.length > 3 && responseWords.includes(word)
  );

  return matchedWords.length > 0;
}

/**
 * Obtiene resumen de la conversación
 */
export function getConversationSummary(state: ConversationState): {
  stage: string;
  productViewed: string[];
  customerNeeds: string[];
  questionsAsked: number;
  duration: number;
} {
  const startTime = state.messageHistory[0]?.timestamp || new Date();
  const endTime = state.messageHistory[state.messageHistory.length - 1]?.timestamp || new Date();

  return {
    stage: state.context.stage,
    productViewed: state.productContext.viewedProducts,
    customerNeeds: state.context.customerNeeds,
    questionsAsked: state.messageHistory.filter(m => m.role === 'user').length,
    duration: Math.round((endTime.getTime() - startTime.getTime()) / 1000)
  };
}
