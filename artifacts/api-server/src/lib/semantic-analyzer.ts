/**
 * Analizador Semántico para Preguntas de Clientes
 * Comprende la intención real detrás de las preguntas, no solo palabras clave
 */

import { PAYMENT_KEYWORDS } from "./agent";

export interface QuestionIntent {
  category: 'product' | 'price' | 'delivery' | 'warranty' | 'payment' | 'availability' | 'general';
  subcategory?: string;
  confidence: number;
  keywords: string[];
  relatedProducts?: string[];
}

export interface ConversationContext {
  currentProduct?: string;
  previousQuestions: string[];
  stage: 'greeting' | 'discovery' | 'recommendation' | 'details' | 'confirmation' | 'closing';
  customerNeeds: string[];
  lastResponse?: string;
}

/**
 * Analiza la intención semántica de una pregunta
 */
export function analyzeQuestionIntent(question: string): QuestionIntent {
  const lowerQuestion = question.toLowerCase().trim();
  
  // Mapeo de intenciones por categoría
  const intentPatterns = {
    product: {
      keywords: ['características', 'especificaciones', 'modelo', 'versión', 'color', 'tamaño', 'material', 'qué', 'cuál', 'diferencia', 'accesorios', 'incluye', 'viene con'],
      patterns: [
        /qué.*características|especificaciones|características.*qué/i,
        /cuál.*diferencia|diferencia.*cuál/i,
        /qué.*incluye|viene con|qué.*accesorios/i,
        /material|tamaño|color|versión/i,
      ]
    },
    price: {
      keywords: ['precio', 'costo', 'valor', 'cuánto', 'descuento', 'oferta', 'promoción', 'caro', 'barato'],
      patterns: [
        /cuánto.*cuesta|precio|costo|valor/i,
        /hay.*descuento|promoción|oferta/i,
        /descuento.*cantidad|cantidad.*descuento/i,
      ]
    },
    delivery: {
      keywords: ['entrega', 'envío', 'llega', 'cuándo', 'tiempo', 'demora', 'ciudad', 'recoger', 'tienda', 'costo envío'],
      patterns: [
        /cuánto.*tarda|tiempo.*entrega|entrega.*cuándo/i,
        /hacen.*envío|envío.*ciudad|ciudad.*envío/i,
        /costo.*envío|envío.*gratis|envío.*costo/i,
        /puedo.*recoger|recoger.*tienda|tienda.*recoger/i,
      ]
    },
    warranty: {
      keywords: ['garantía', 'cobertura', 'reclamo', 'defecto', 'problema', 'reparación', 'cambio', 'devolución'],
      patterns: [
        /qué.*cubre.*garantía|garantía.*qué.*cubre/i,
        /cuánto.*tiempo.*garantía|garantía.*cuánto.*tiempo/i,
        /cómo.*reclamo|reclamo.*cómo|defecto|problema/i,
      ]
    },
    payment: {
      keywords: PAYMENT_KEYWORDS, // ✅ Usando CONSTANTE UNIFICADA
      patterns: [
        /qué.*formas.*pago|pago.*formas|aceptan/i,
        /puedo.*pagar.*cuotas|cuotas|financiamiento/i,
        /tarjeta.*crédito|débito|transferencia|efectivo/i,
      ]
    },
    availability: {
      keywords: ['stock', 'disponible', 'hay', 'existe', 'agotado', 'nuevo', 'próximo'],
      patterns: [
        /tienen.*stock|stock.*tienen|disponible/i,
        /cuándo.*llega.*stock|stock.*nuevo/i,
        /está.*agotado|agotado/i,
      ]
    }
  };

  let bestMatch: QuestionIntent = {
    category: 'general',
    confidence: 0,
    keywords: []
  };

  // Evaluar cada categoría
  for (const [category, config] of Object.entries(intentPatterns)) {
    let categoryScore = 0;
    const matchedKeywords: string[] = [];

    // Buscar palabras clave
    for (const keyword of config.keywords) {
      if (lowerQuestion.includes(keyword)) {
        categoryScore += 0.3;
        matchedKeywords.push(keyword);
      }
    }

    // Buscar patrones regex
    for (const pattern of config.patterns) {
      if (pattern.test(question)) {
        categoryScore += 0.7;
      }
    }

    // Normalizar score
    const confidence = Math.min(categoryScore, 1);

    if (confidence > bestMatch.confidence) {
      bestMatch = {
        category: category as QuestionIntent['category'],
        confidence,
        keywords: matchedKeywords
      };
    }
  }

  return bestMatch;
}

/**
 * Determina la siguiente etapa de la conversación
 */
export function determineNextStage(
  currentStage: ConversationContext['stage'],
  intent: QuestionIntent,
  hasProductSelected: boolean
): ConversationContext['stage'] {
  switch (currentStage) {
    case 'greeting':
      return 'discovery';
    
    case 'discovery':
      if (intent.category === 'product' || hasProductSelected) {
        return 'recommendation';
      }
      return 'discovery';
    
    case 'recommendation':
      if (intent.category === 'product' || intent.category === 'price' || intent.category === 'delivery') {
        return 'details';
      }
      return 'recommendation';
    
    case 'details':
      if (intent.category === 'general' || intent.confidence < 0.5) {
        return 'confirmation';
      }
      return 'details';
    
    case 'confirmation':
      return 'closing';
    
    case 'closing':
      return 'closing';
    
    default:
      return 'greeting';
  }
}

/**
 * Valida coherencia de la conversación
 */
export function validateConversationCoherence(
  context: ConversationContext,
  newQuestion: string,
  intent: QuestionIntent
): { isCoherent: boolean; warning?: string } {
  // Si el cliente pregunta sobre un producto diferente sin transición
  if (context.currentProduct && intent.category === 'product') {
    return {
      isCoherent: true,
      warning: 'Cliente cambió de producto - verificar si es intencional'
    };
  }

  // Si el cliente hace preguntas muy diferentes consecutivas
  if (context.previousQuestions.length > 0) {
    const lastIntent = analyzeQuestionIntent(context.previousQuestions[context.previousQuestions.length - 1]);
    
    if (lastIntent.category !== intent.category && intent.confidence > 0.8) {
      // Cambio de categoría significativo
      if (context.stage === 'details' && intent.category === 'greeting') {
        return {
          isCoherent: false,
          warning: 'Cliente volvió a saludar - posible desconexión'
        };
      }
    }
  }

  return { isCoherent: true };
}

/**
 * Genera respuesta contextual basada en intención
 */
export function generateContextualResponse(
  intent: QuestionIntent,
  context: ConversationContext,
  productData?: any
): string {
  const responses: Record<QuestionIntent['category'], string> = {
    product: `Sobre las características del producto${context.currentProduct ? ` ${context.currentProduct}` : ''}, te puedo decir que...`,
    price: `Respecto al precio${context.currentProduct ? ` de ${context.currentProduct}` : ''}, el valor es...`,
    delivery: `Sobre la entrega${context.currentProduct ? ` de ${context.currentProduct}` : ''}, te informo que...`,
    warranty: `Sobre la garantía${context.currentProduct ? ` de ${context.currentProduct}` : ''}, cubrimos...`,
    payment: `Sobre las formas de pago, aceptamos...`,
    availability: `Sobre la disponibilidad${context.currentProduct ? ` de ${context.currentProduct}` : ''}, tenemos...`,
    general: `Entiendo tu pregunta. Déjame ayudarte con eso...`
  };

  return responses[intent.category] || responses.general;
}
