import { logger } from "./logger";
import { tenantManager, type TenantContext } from "./tenantManager";

// Objection Types and Analysis
export interface ObjectionAnalysis {
  type: ObjectionType;
  confidence: number;
  sentiment: 'negative' | 'neutral' | 'positive';
  urgency: 'low' | 'medium' | 'high';
  keywords: string[];
  suggestedResponse: string;
  strategy: ObjectionStrategy;
}

export type ObjectionType = 
  | 'price_too_high'
  | 'need_time_to_think'
  | 'comparing_options'
  | 'budget_constraints'
  | 'trust_concerns'
  | 'feature_missing'
  | 'timing_not_right'
  | 'decision_maker_absent'
  | 'competitor_preference'
  | 'no_immediate_need'
  | 'technical_concerns'
  | 'none';

export type ObjectionStrategy = 
  | 'validate_and_reframe'
  | 'provide_social_proof'
  | 'create_urgency'
  | 'offer_alternatives'
  | 'address_concerns'
  | 'build_value'
  | 'schedule_follow_up'
  | 'involve_decision_maker';

export interface EmotionalContext {
  sentiment: 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
  emotions: string[];
  engagement: 'low' | 'medium' | 'high';
  frustration: number; // 0-100
  excitement: number; // 0-100
  confusion: number; // 0-100
}

export interface PersonalizationData {
  communicationStyle: 'direct' | 'detailed' | 'casual' | 'formal';
  preferredTopics: string[];
  responseTime: 'immediate' | 'quick' | 'delayed';
  pricesensitivity: 'low' | 'medium' | 'high';
  decisionSpeed: 'fast' | 'moderate' | 'slow';
  informationNeeds: 'minimal' | 'moderate' | 'extensive';
}

// Objection Detection Patterns
const OBJECTION_PATTERNS = {
  price_too_high: {
    keywords: [
      'caro', 'costoso', 'precio alto', 'muy caro', 'demasiado caro',
      'no puedo pagar', 'fuera de presupuesto', 'no me alcanza',
      'mucho dinero', 'precio elevado', 'no vale tanto'
    ],
    phrases: [
      'está muy caro', 'no tengo tanto dinero', 'es mucho para mí',
      'no puedo costear', 'está fuera de mi presupuesto'
    ]
  },
  need_time_to_think: {
    keywords: [
      'pensarlo', 'tiempo', 'decidir', 'consultar', 'evaluar',
      'considerar', 'reflexionar', 'analizar', 'revisar'
    ],
    phrases: [
      'déjame pensarlo', 'necesito tiempo', 'lo voy a pensar',
      'tengo que consultarlo', 'déjame evaluarlo'
    ]
  },
  comparing_options: {
    keywords: [
      'comparar', 'opciones', 'alternativas', 'otros cursos',
      'competencia', 'similar', 'parecido', 'diferente'
    ],
    phrases: [
      'estoy comparando', 'viendo otras opciones', 'hay otros similares',
      'quiero ver alternativas', 'comparando precios'
    ]
  },
  budget_constraints: {
    keywords: [
      'presupuesto', 'dinero', 'económico', 'barato', 'descuento',
      'promoción', 'oferta', 'financiamiento', 'cuotas'
    ],
    phrases: [
      'no tengo presupuesto', 'está fuera de presupuesto',
      'necesito algo más económico', 'hay descuento'
    ]
  },
  trust_concerns: {
    keywords: [
      'confianza', 'seguro', 'garantía', 'dudas', 'estafa',
      'real', 'verdadero', 'legítimo', 'funciona'
    ],
    phrases: [
      'no estoy seguro', 'tengo dudas', 'es confiable',
      'funciona realmente', 'hay garantía'
    ]
  },
  timing_not_right: {
    keywords: [
      'momento', 'tiempo', 'ahora no', 'más tarde', 'después',
      'ocupado', 'no puedo ahora', 'próximo mes'
    ],
    phrases: [
      'no es buen momento', 'ahora no puedo', 'más adelante',
      'estoy muy ocupado', 'tal vez después'
    ]
  }
};

// Response Templates by Strategy
const RESPONSE_TEMPLATES = {
  validate_and_reframe: {
    price_too_high: [
      "Entiendo tu preocupación por la inversión. Muchos de nuestros estudiantes pensaron lo mismo inicialmente. Considera que este curso te dará habilidades que pueden generar ingresos adicionales de ${potential_income} al mes. ¿Te gustaría que te muestre cómo otros han recuperado su inversión?",
      "Comprendo que el precio es una consideración importante. Lo que estás adquiriendo no es solo un curso, sino una habilidad que te acompañará toda la vida. Piénsalo como una inversión en tu futuro profesional. ¿Qué valor le das a desarrollar esta competencia?"
    ],
    need_time_to_think: [
      "Por supuesto, es una decisión importante y es normal que quieras pensarlo bien. ¿Hay alguna información específica que te ayudaría a tomar la decisión? Estoy aquí para resolver cualquier duda que tengas.",
      "Entiendo perfectamente. Tomar decisiones importantes requiere reflexión. ¿Te gustaría que te comparta algunos testimonios de estudiantes que estuvieron en tu misma situación?"
    ]
  },
  provide_social_proof: {
    price_too_high: [
      "Te entiendo completamente. María, una de nuestras estudiantes, pensó exactamente lo mismo. Después de 3 meses aplicando lo aprendido, ya había recuperado su inversión y ahora gana ${success_amount} extra al mes. ¿Te gustaría conocer su historia completa?",
      "Muchos de nuestros +${student_count} estudiantes tuvieron la misma preocupación. El 89% dice que fue la mejor inversión que hicieron para su desarrollo profesional. ¿Qué te parece si te muestro algunos resultados reales?"
    ],
    trust_concerns: [
      "Es completamente normal tener esas dudas. Tenemos más de ${student_count} estudiantes satisfechos y una garantía de 30 días. Si no estás completamente satisfecho, te devolvemos tu dinero. ¿Te gustaría ver algunos testimonios verificados?",
      "Entiendo tus dudas. Llevamos ${years_experience} años en el mercado y tenemos certificaciones oficiales. Además, ofrecemos soporte completo durante todo el proceso. ¿Qué específicamente te genera más confianza en una compra online?"
    ]
  },
  create_urgency: {
    timing_not_right: [
      "Entiendo que el timing es importante. Sin embargo, esta promoción especial termina en ${days_left} días y el precio subirá ${price_increase}. Además, mientras más pronto empieces, más pronto verás resultados. ¿Te gustaría asegurar el precio actual?",
      "Comprendo tu situación. Muchos estudiantes exitosos empezaron en momentos similares. El curso está diseñado para que puedas avanzar a tu ritmo, dedicando solo ${min_time} minutos al día. ¿Qué te parece si comenzamos gradualmente?"
    ]
  },
  offer_alternatives: {
    budget_constraints: [
      "Entiendo tu situación presupuestaria. Tenemos opciones de pago que pueden ayudarte: puedes pagar en ${installments} cuotas sin interés, o tenemos una versión básica por ${basic_price}. ¿Cuál de estas opciones se ajusta mejor a tu presupuesto?",
      "Comprendo la importancia del presupuesto. ¿Qué te parece si te ofrezco un descuento especial del ${discount}% por ser un cliente potencial tan interesado? Esto lo dejaría en ${final_price}."
    ]
  },
  build_value: {
    price_too_high: [
      "Entiendo tu perspectiva sobre el precio. Déjame mostrarte el valor completo: recibes ${hours} horas de contenido HD, ${resources} recursos descargables, acceso de por vida, soporte personalizado y certificación. Si lo divides por el tiempo de acceso, son solo ${daily_cost} pesos por día. ¿No te parece una inversión razonable para tu futuro?",
      "Comprendo tu preocupación. Este curso incluye todo lo que necesitas: ${feature_list}. Comparado con clases presenciales que costarían ${comparison_price}, estás ahorrando ${savings} y tienes acceso permanente. ¿Qué opinas de esta comparación?"
    ]
  }
};

// Emotional Intelligence Patterns
const EMOTIONAL_PATTERNS = {
  frustration: [
    'no funciona', 'no sirve', 'estoy cansado', 'harto', 'molesto',
    'no entiendo', 'complicado', 'difícil', 'problema'
  ],
  excitement: [
    'genial', 'perfecto', 'excelente', 'increíble', 'fantástico',
    'me encanta', 'súper', 'maravilloso', 'emocionado'
  ],
  confusion: [
    'no entiendo', 'confuso', 'no sé', 'cómo funciona', 'explícame',
    'no comprendo', 'dudas', 'unclear', 'no está claro'
  ],
  urgency: [
    'urgente', 'rápido', 'ya', 'ahora', 'inmediato', 'pronto',
    'necesito ya', 'cuanto antes', 'hoy mismo'
  ]
};

// Advanced Agent Intelligence Class
export class ObjectionHandler {
  private tenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
  }

  /**
   * Analyzes customer message for objections
   */
  analyzeObjection(message: string, conversationHistory: string[] = []): ObjectionAnalysis {
    const messageLower = message.toLowerCase();
    const fullContext = [...conversationHistory, message].join(' ').toLowerCase();

    // Detect objection type
    const objectionType = this.detectObjectionType(messageLower);
    
    // Analyze sentiment and emotions
    const emotionalContext = this.analyzeEmotionalContext(messageLower);
    
    // Determine confidence level
    const confidence = this.calculateConfidence(messageLower, objectionType);
    
    // Extract relevant keywords
    const keywords = this.extractRelevantKeywords(messageLower, objectionType);
    
    // Determine strategy
    const strategy = this.determineStrategy(objectionType, emotionalContext, fullContext);
    
    // Generate suggested response
    const suggestedResponse = this.generateResponse(objectionType, strategy, emotionalContext);

    return {
      type: objectionType,
      confidence,
      sentiment: emotionalContext.sentiment === 'very_negative' || emotionalContext.sentiment === 'negative' ? 'negative' :
                emotionalContext.sentiment === 'very_positive' || emotionalContext.sentiment === 'positive' ? 'positive' : 'neutral',
      urgency: emotionalContext.emotions.some(e => EMOTIONAL_PATTERNS.urgency.includes(e)) ? 'high' :
               objectionType === 'timing_not_right' ? 'medium' : 'low',
      keywords,
      suggestedResponse,
      strategy
    };
  }

  /**
   * Analyzes emotional context of the message
   */
  analyzeEmotionalContext(message: string): EmotionalContext {
    const emotions: string[] = [];
    let frustration = 0;
    let excitement = 0;
    let confusion = 0;

    // Check for emotional indicators
    EMOTIONAL_PATTERNS.frustration.forEach(pattern => {
      if (message.includes(pattern)) {
        emotions.push('frustration');
        frustration += 20;
      }
    });

    EMOTIONAL_PATTERNS.excitement.forEach(pattern => {
      if (message.includes(pattern)) {
        emotions.push('excitement');
        excitement += 25;
      }
    });

    EMOTIONAL_PATTERNS.confusion.forEach(pattern => {
      if (message.includes(pattern)) {
        emotions.push('confusion');
        confusion += 15;
      }
    });

    // Determine overall sentiment
    let sentiment: EmotionalContext['sentiment'] = 'neutral';
    if (excitement > 50) sentiment = 'very_positive';
    else if (excitement > 25) sentiment = 'positive';
    else if (frustration > 50) sentiment = 'very_negative';
    else if (frustration > 25) sentiment = 'negative';

    // Determine engagement level
    const messageLength = message.length;
    const questionMarks = (message.match(/\?/g) || []).length;
    const exclamationMarks = (message.match(/!/g) || []).length;
    
    let engagement: EmotionalContext['engagement'] = 'low';
    if (messageLength > 100 || questionMarks > 1 || exclamationMarks > 1) {
      engagement = 'high';
    } else if (messageLength > 50 || questionMarks > 0 || exclamationMarks > 0) {
      engagement = 'medium';
    }

    return {
      sentiment,
      emotions: [...new Set(emotions)], // Remove duplicates
      engagement,
      frustration: Math.min(100, frustration),
      excitement: Math.min(100, excitement),
      confusion: Math.min(100, confusion)
    };
  }

  /**
   * Generates personalized response based on customer behavior
   */
  generatePersonalizedResponse(
    objectionAnalysis: ObjectionAnalysis,
    personalizationData: PersonalizationData,
    conversationHistory: string[]
  ): string {
    const baseResponse = objectionAnalysis.suggestedResponse;
    
    // Adapt communication style
    let adaptedResponse = this.adaptCommunicationStyle(baseResponse, personalizationData.communicationStyle);
    
    // Add personalization elements
    adaptedResponse = this.addPersonalizationElements(adaptedResponse, personalizationData);
    
    // Adjust for emotional context
    if (objectionAnalysis.sentiment === 'negative') {
      adaptedResponse = this.addEmpathyElements(adaptedResponse);
    }
    
    return adaptedResponse;
  }

  /**
   * Provides strategic sales methodology guidance
   */
  getStrategicGuidance(objectionType: ObjectionType, customerProfile: PersonalizationData): {
    methodology: string;
    nextSteps: string[];
    timing: string;
    followUpStrategy: string;
  } {
    const methodologies = {
      price_too_high: {
        methodology: "Value-Based Selling",
        nextSteps: [
          "Refocus conversation on ROI and long-term benefits",
          "Provide concrete examples of success stories",
          "Offer payment alternatives or limited-time discounts",
          "Schedule follow-up to address remaining concerns"
        ],
        timing: "Address immediately with value demonstration",
        followUpStrategy: "Send case studies and testimonials within 24 hours"
      },
      trust_concerns: {
        methodology: "Consultative Selling",
        nextSteps: [
          "Provide social proof and testimonials",
          "Offer guarantees and risk reversal",
          "Share credentials and certifications",
          "Arrange demo or trial period"
        ],
        timing: "Build trust gradually over multiple touchpoints",
        followUpStrategy: "Provide additional credibility materials and references"
      },
      need_time_to_think: {
        methodology: "Challenger Sale",
        nextSteps: [
          "Identify specific concerns behind the delay",
          "Provide new insights about their situation",
          "Create appropriate urgency without pressure",
          "Set specific follow-up timeline"
        ],
        timing: "Respect their process while maintaining engagement",
        followUpStrategy: "Scheduled check-in with additional value content"
      }
    };

    return methodologies[objectionType] || {
      methodology: "Relationship Selling",
      nextSteps: ["Listen actively", "Understand needs", "Provide solutions", "Follow up"],
      timing: "Adapt to customer's preferred pace",
      followUpStrategy: "Maintain regular, value-added communication"
    };
  }

  // Private helper methods

  private detectObjectionType(message: string): ObjectionType {
    let maxScore = 0;
    let detectedType: ObjectionType = 'none';

    Object.entries(OBJECTION_PATTERNS).forEach(([type, patterns]) => {
      let score = 0;
      
      // Check keywords
      patterns.keywords.forEach(keyword => {
        if (message.includes(keyword)) {
          score += 1;
        }
      });
      
      // Check phrases (higher weight)
      patterns.phrases?.forEach(phrase => {
        if (message.includes(phrase)) {
          score += 3;
        }
      });

      if (score > maxScore) {
        maxScore = score;
        detectedType = type as ObjectionType;
      }
    });

    return detectedType;
  }

  private calculateConfidence(message: string, objectionType: ObjectionType): number {
    if (objectionType === 'none') return 0;

    const patterns = OBJECTION_PATTERNS[objectionType as keyof typeof OBJECTION_PATTERNS];
    if (!patterns) return 0;

    let matches = 0;
    let totalPatterns = patterns.keywords.length + (patterns.phrases?.length || 0);

    patterns.keywords.forEach(keyword => {
      if (message.includes(keyword)) matches++;
    });

    patterns.phrases?.forEach(phrase => {
      if (message.includes(phrase)) matches += 2; // Phrases have higher weight
    });

    return Math.min(100, (matches / totalPatterns) * 100);
  }

  private extractRelevantKeywords(message: string, objectionType: ObjectionType): string[] {
    if (objectionType === 'none') return [];

    const patterns = OBJECTION_PATTERNS[objectionType as keyof typeof OBJECTION_PATTERNS];
    if (!patterns) return [];

    const foundKeywords: string[] = [];
    
    patterns.keywords.forEach(keyword => {
      if (message.includes(keyword)) {
        foundKeywords.push(keyword);
      }
    });

    return foundKeywords;
  }

  private determineStrategy(
    objectionType: ObjectionType, 
    emotionalContext: EmotionalContext,
    fullContext: string
  ): ObjectionStrategy {
    // Strategy mapping based on objection type and emotional context
    const strategyMap: Record<ObjectionType, ObjectionStrategy> = {
      price_too_high: emotionalContext.sentiment === 'negative' ? 'validate_and_reframe' : 'build_value',
      need_time_to_think: 'validate_and_reframe',
      comparing_options: 'provide_social_proof',
      budget_constraints: 'offer_alternatives',
      trust_concerns: 'provide_social_proof',
      feature_missing: 'address_concerns',
      timing_not_right: 'create_urgency',
      decision_maker_absent: 'involve_decision_maker',
      competitor_preference: 'provide_social_proof',
      no_immediate_need: 'build_value',
      technical_concerns: 'address_concerns',
      none: 'validate_and_reframe'
    };

    return strategyMap[objectionType];
  }

  private generateResponse(
    objectionType: ObjectionType,
    strategy: ObjectionStrategy,
    emotionalContext: EmotionalContext
  ): string {
    const templates = RESPONSE_TEMPLATES[strategy];
    if (!templates || !templates[objectionType as keyof typeof templates]) {
      return "Entiendo tu preocupación. ¿Podrías contarme más sobre lo que te inquieta para poder ayudarte mejor?";
    }

    const responses = templates[objectionType as keyof typeof templates] as string[];
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    // Replace placeholders with tenant-specific data
    return this.replacePlaceholders(randomResponse);
  }

  private replacePlaceholders(template: string): string {
    const placeholders = {
      '${potential_income}': '500,000',
      '${success_amount}': '800,000',
      '${student_count}': '2,500',
      '${years_experience}': '5',
      '${days_left}': '3',
      '${price_increase}': '30%',
      '${min_time}': '15',
      '${installments}': '3',
      '${basic_price}': '89,000',
      '${discount}': '20',
      '${final_price}': '120,000',
      '${hours}': '25',
      '${resources}': '50',
      '${daily_cost}': '400',
      '${feature_list}': 'videos HD, recursos descargables, certificación y soporte',
      '${comparison_price}': '300,000',
      '${savings}': '150,000'
    };

    let result = template;
    Object.entries(placeholders).forEach(([placeholder, value]) => {
      result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    });

    return result;
  }

  private adaptCommunicationStyle(response: string, style: PersonalizationData['communicationStyle']): string {
    switch (style) {
      case 'direct':
        return response.replace(/Entiendo que|Comprendo que|Me parece que/g, 'Veo que');
      case 'casual':
        return response.replace(/usted|Usted/g, 'tú').replace(/¿Le gustaría/g, '¿Te gustaría');
      case 'formal':
        return response.replace(/tú|tu/g, 'usted').replace(/¿Te gustaría/g, '¿Le gustaría');
      default:
        return response;
    }
  }

  private addPersonalizationElements(response: string, data: PersonalizationData): string {
    // Add elements based on personalization data
    if (data.pricesensitivity === 'high') {
      response += " Además, recuerda que ofrecemos garantía de satisfacción.";
    }
    
    if (data.informationNeeds === 'extensive') {
      response += " ¿Te gustaría que te envíe información detallada por escrito?";
    }

    return response;
  }

  private addEmpathyElements(response: string): string {
    const empathyPhrases = [
      "Entiendo completamente tu situación.",
      "Es normal tener esas preocupaciones.",
      "Muchas personas han pasado por lo mismo."
    ];
    
    const randomEmpathy = empathyPhrases[Math.floor(Math.random() * empathyPhrases.length)];
    return `${randomEmpathy} ${response}`;
  }
}

// Export singleton instance
export const objectionHandler = new ObjectionHandler();

// Utility functions
export function analyzeCustomerObjection(message: string, conversationHistory: string[] = []): ObjectionAnalysis {
  return objectionHandler.analyzeObjection(message, conversationHistory);
}

export function generateObjectionResponse(
  objectionAnalysis: ObjectionAnalysis,
  personalizationData?: PersonalizationData,
  conversationHistory: string[] = []
): string {
  if (personalizationData) {
    return objectionHandler.generatePersonalizedResponse(objectionAnalysis, personalizationData, conversationHistory);
  }
  return objectionAnalysis.suggestedResponse;
}

export function getStrategicSalesGuidance(objectionType: ObjectionType, customerProfile: PersonalizationData) {
  return objectionHandler.getStrategicGuidance(objectionType, customerProfile);
}