/**
 * SalesAI — Analizador inteligente de conversaciones de ventas
 * Adaptado de MarketAI para analizar intenciones, objeciones y oportunidades de cierre
 * 
 * NO usa APIs externas. Razona como un vendedor experto:
 * - Analiza el contexto completo de la conversación
 * - Detecta intenciones de compra y objeciones
 * - Pondera evidencias con probabilidades
 * - Genera respuestas contextuales sin LLMs externos
 */

export interface Evidence {
  name: string;
  weight: number;        // 0-1 importancia relativa
  favor: boolean;        // True = a favor de la venta, False = objeción
  value: number;         // 0-1 intensidad de la evidencia
  description: string;
}

export interface SalesVerdict {
  intent: string;              // "buy", "interested", "browsing", "objection", "leaving"
  confidence: number;          // 0-1
  score: number;               // 0-100
  narrative: string;           // Razonamiento en lenguaje natural
  evidence_for: string[];      // Argumentos a favor de la venta
  evidence_against: string[];  // Objeciones detectadas
  stage_label: string;         // "HOT_LEAD", "WARM", "COLD", "LOST"
  should_push: boolean;        // Si debe hacer push de cierre
  reasoning_chain: string[];   // Cadena de razonamiento
  suggested_response: string;  // Respuesta sugerida
  suggested_action: string;    // "show_product", "handle_objection", "close", "follow_up"
}

export interface ConversationContext {
  messages: Array<{ role: string; content: string; timestamp: Date }>;
  leadBehavior?: {
    interestLevel?: string;
    priceInquiries?: number;
    urgencyIndicators?: string[];
    objectionPatterns?: string[];
  };
  currentStage?: string;
  productsShown?: string[];
  lastInteractionTime?: Date;
}

export class SalesAI {
  private buyingKeywords = [
    'comprar', 'adquirir', 'pagar', 'precio', 'cuánto', 'costo', 'vale',
    'cuenta', 'nequi', 'transferencia', 'link', 'enlace', 'quiero',
    'necesito', 'me interesa', 'lo llevo', 'dame', 'envía', 'manda'
  ];

  private objectionKeywords = [
    'caro', 'costoso', 'mucho', 'pensarlo', 'después', 'luego',
    'no sé', 'duda', 'inseguro', 'desconfío', 'estafa', 'funciona',
    'garantía', 'devolución', 'reembolso', 'no tengo', 'sin dinero'
  ];

  private urgencyKeywords = [
    'rápido', 'urgente', 'ya', 'ahora', 'hoy', 'inmediato',
    'cuanto antes', 'pronto', 'necesito ya'
  ];

  private leavingKeywords = [
    'adiós', 'chao', 'gracias', 'luego', 'después', 'no gracias',
    'no me interesa', 'no quiero', 'déjame', 'molestando'
  ];

  /**
   * Analiza una conversación completa y determina la mejor estrategia
   */
  analyze(context: ConversationContext): SalesVerdict {
    const reasoning: string[] = [];
    const allEvidence: Evidence[] = [];

    reasoning.push("🧠 Iniciando análisis de conversación...");

    // PASO 1: Analizar el último mensaje del cliente
    const lastMessage = this.getLastCustomerMessage(context);
    reasoning.push(`1. Analizando último mensaje: "${lastMessage.substring(0, 50)}..."`);
    
    const intentEvidence = this.analyzeIntent(lastMessage, context);
    allEvidence.push(...intentEvidence.evidence);
    reasoning.push(...intentEvidence.reasoning);

    // PASO 2: Analizar el historial de la conversación
    reasoning.push("2. Analizando historial de conversación...");
    const historyEvidence = this.analyzeHistory(context);
    allEvidence.push(...historyEvidence.evidence);
    reasoning.push(...historyEvidence.reasoning);

    // PASO 3: Detectar objeciones
    reasoning.push("3. Detectando objeciones...");
    const objectionEvidence = this.detectObjections(lastMessage, context);
    allEvidence.push(...objectionEvidence.evidence);
    reasoning.push(...objectionEvidence.reasoning);

    // PASO 4: Evaluar urgencia
    reasoning.push("4. Evaluando nivel de urgencia...");
    const urgencyEvidence = this.evaluateUrgency(lastMessage, context);
    allEvidence.push(...urgencyEvidence.evidence);
    reasoning.push(...urgencyEvidence.reasoning);

    // PASO 5: Analizar comportamiento del lead
    reasoning.push("5. Analizando comportamiento del lead...");
    const behaviorEvidence = this.analyzeBehavior(context);
    allEvidence.push(...behaviorEvidence.evidence);
    reasoning.push(...behaviorEvidence.reasoning);

    // PASO 6: Sintetizar veredicto
    reasoning.push("6. Sintetizando veredicto final...");
    const verdict = this.synthesize(allEvidence, lastMessage, context, reasoning);

    // PASO 7: Generar respuesta sugerida
    verdict.suggested_response = this.generateResponse(verdict, context, lastMessage);
    verdict.reasoning_chain = reasoning;

    return verdict;
  }

  private getLastCustomerMessage(context: ConversationContext): string {
    const customerMessages = context.messages.filter(m => m.role === 'user');
    return customerMessages.length > 0 
      ? customerMessages[customerMessages.length - 1].content 
      : '';
  }

  private analyzeIntent(message: string, context: ConversationContext): { evidence: Evidence[], reasoning: string[] } {
    const evidence: Evidence[] = [];
    const reasoning: string[] = [];
    const lowerMsg = message.toLowerCase();

    // Detectar intención de compra
    const buyingMatches = this.buyingKeywords.filter(kw => lowerMsg.includes(kw));
    if (buyingMatches.length > 0) {
      const intensity = Math.min(buyingMatches.length / 3, 1.0);
      evidence.push({
        name: 'buying_intent',
        weight: 0.30,
        favor: true,
        value: intensity,
        description: `Palabras de compra detectadas: ${buyingMatches.join(', ')}`
      });
      reasoning.push(`  → INTENCIÓN DE COMPRA detectada: ${buyingMatches.length} señales (${buyingMatches.join(', ')})`);
    }

    // Detectar preguntas sobre precio
    if (lowerMsg.match(/cuánto|precio|costo|vale|cuánto cuesta/)) {
      evidence.push({
        name: 'price_inquiry',
        weight: 0.20,
        favor: true,
        value: 0.75,
        description: 'Pregunta sobre precio - señal de interés'
      });
      reasoning.push(`  → Pregunta sobre PRECIO - lead calificado`);
    }

    // Detectar intención de salida
    const leavingMatches = this.leavingKeywords.filter(kw => lowerMsg.includes(kw));
    if (leavingMatches.length > 0) {
      evidence.push({
        name: 'leaving_intent',
        weight: 0.25,
        favor: false,
        value: 0.85,
        description: `Cliente quiere terminar: ${leavingMatches.join(', ')}`
      });
      reasoning.push(`  → ALERTA: Cliente quiere salir (${leavingMatches.join(', ')})`);
    }

    // Detectar mensajes muy cortos (posible desinterés)
    if (message.length < 10 && !lowerMsg.match(/sí|si|ok|dale|bueno/)) {
      evidence.push({
        name: 'short_response',
        weight: 0.10,
        favor: false,
        value: 0.60,
        description: 'Respuesta muy corta - posible desinterés'
      });
      reasoning.push(`  → Respuesta corta (${message.length} chars) - engagement bajo`);
    }

    return { evidence, reasoning };
  }

  private analyzeHistory(context: ConversationContext): { evidence: Evidence[], reasoning: string[] } {
    const evidence: Evidence[] = [];
    const reasoning: string[] = [];

    const messageCount = context.messages.length;
    const customerMessages = context.messages.filter(m => m.role === 'user');

    // Analizar frecuencia de interacción
    if (messageCount > 10) {
      evidence.push({
        name: 'high_engagement',
        weight: 0.15,
        favor: true,
        value: Math.min(messageCount / 20, 1.0),
        description: `${messageCount} mensajes - alta interacción`
      });
      reasoning.push(`  → Alta interacción: ${messageCount} mensajes totales`);
    } else if (messageCount < 3) {
      reasoning.push(`  → Conversación nueva: ${messageCount} mensajes`);
    }

    // Analizar productos mostrados
    if (context.productsShown && context.productsShown.length > 0) {
      evidence.push({
        name: 'products_shown',
        weight: 0.12,
        favor: true,
        value: 0.70,
        description: `${context.productsShown.length} productos mostrados`
      });
      reasoning.push(`  → ${context.productsShown.length} productos ya presentados`);
    }

    // Analizar tiempo desde última interacción
    if (context.lastInteractionTime) {
      const minutesSince = (Date.now() - context.lastInteractionTime.getTime()) / 60000;
      if (minutesSince > 30) {
        evidence.push({
          name: 'long_gap',
          weight: 0.08,
          favor: false,
          value: Math.min(minutesSince / 120, 0.90),
          description: `${Math.round(minutesSince)} minutos sin respuesta`
        });
        reasoning.push(`  → ALERTA: ${Math.round(minutesSince)} minutos sin interacción - lead enfriándose`);
      }
    }

    return { evidence, reasoning };
  }

  private detectObjections(message: string, context: ConversationContext): { evidence: Evidence[], reasoning: string[] } {
    const evidence: Evidence[] = [];
    const reasoning: string[] = [];
    const lowerMsg = message.toLowerCase();

    const objectionMatches = this.objectionKeywords.filter(kw => lowerMsg.includes(kw));
    
    if (objectionMatches.length > 0) {
      const intensity = Math.min(objectionMatches.length / 2, 1.0);
      evidence.push({
        name: 'objection_detected',
        weight: 0.22,
        favor: false,
        value: intensity,
        description: `Objeciones: ${objectionMatches.join(', ')}`
      });
      reasoning.push(`  → OBJECIÓN detectada: ${objectionMatches.join(', ')}`);

      // Clasificar tipo de objeción
      if (lowerMsg.match(/caro|costoso|mucho|precio/)) {
        reasoning.push(`  → Tipo: OBJECIÓN DE PRECIO - ofrecer descuento o plan de pago`);
      } else if (lowerMsg.match(/pensarlo|después|luego/)) {
        reasoning.push(`  → Tipo: OBJECIÓN DE TIEMPO - crear urgencia`);
      } else if (lowerMsg.match(/funciona|garantía|estafa|desconfío/)) {
        reasoning.push(`  → Tipo: OBJECIÓN DE CONFIANZA - mostrar pruebas sociales`);
      }
    } else {
      reasoning.push(`  → Sin objeciones evidentes`);
    }

    return { evidence, reasoning };
  }

  private evaluateUrgency(message: string, context: ConversationContext): { evidence: Evidence[], reasoning: string[] } {
    const evidence: Evidence[] = [];
    const reasoning: string[] = [];
    const lowerMsg = message.toLowerCase();

    const urgencyMatches = this.urgencyKeywords.filter(kw => lowerMsg.includes(kw));
    
    if (urgencyMatches.length > 0) {
      evidence.push({
        name: 'high_urgency',
        weight: 0.18,
        favor: true,
        value: 0.90,
        description: `Alta urgencia: ${urgencyMatches.join(', ')}`
      });
      reasoning.push(`  → URGENCIA ALTA: ${urgencyMatches.join(', ')} - CERRAR AHORA`);
    }

    // Detectar preguntas sobre disponibilidad
    if (lowerMsg.match(/disponible|stock|hay|tienen|queda/)) {
      evidence.push({
        name: 'availability_check',
        weight: 0.15,
        favor: true,
        value: 0.80,
        description: 'Pregunta sobre disponibilidad - listo para comprar'
      });
      reasoning.push(`  → Pregunta sobre DISPONIBILIDAD - lead caliente`);
    }

    return { evidence, reasoning };
  }

  private analyzeBehavior(context: ConversationContext): { evidence: Evidence[], reasoning: string[] } {
    const evidence: Evidence[] = [];
    const reasoning: string[] = [];

    if (!context.leadBehavior) {
      reasoning.push(`  → Sin datos de comportamiento previo`);
      return { evidence, reasoning };
    }

    const behavior = context.leadBehavior;

    // Nivel de interés
    if (behavior.interestLevel === 'high') {
      evidence.push({
        name: 'high_interest',
        weight: 0.20,
        favor: true,
        value: 0.85,
        description: 'Lead con alto interés histórico'
      });
      reasoning.push(`  → Comportamiento histórico: ALTO INTERÉS`);
    } else if (behavior.interestLevel === 'low') {
      evidence.push({
        name: 'low_interest',
        weight: 0.15,
        favor: false,
        value: 0.70,
        description: 'Lead con bajo interés histórico'
      });
      reasoning.push(`  → Comportamiento histórico: BAJO INTERÉS`);
    }

    // Consultas de precio
    if (behavior.priceInquiries && behavior.priceInquiries > 2) {
      evidence.push({
        name: 'multiple_price_checks',
        weight: 0.12,
        favor: true,
        value: 0.75,
        description: `${behavior.priceInquiries} consultas de precio`
      });
      reasoning.push(`  → ${behavior.priceInquiries} consultas de precio - lead calificado`);
    }

    return { evidence, reasoning };
  }

  private synthesize(
    evidence: Evidence[], 
    lastMessage: string, 
    context: ConversationContext,
    reasoning: string[]
  ): SalesVerdict {
    if (evidence.length === 0) {
      return {
        intent: 'browsing',
        confidence: 0.3,
        score: 30,
        narrative: '',
        evidence_for: [],
        evidence_against: [],
        stage_label: 'COLD',
        should_push: false,
        reasoning_chain: reasoning,
        suggested_response: '',
        suggested_action: 'show_product'
      };
    }

    // Separar evidencias
    const evFor = evidence.filter(e => e.favor);
    const evAgainst = evidence.filter(e => !e.favor);

    // Score ponderado
    const totalWeight = evidence.reduce((sum, e) => sum + e.weight, 0);
    const scoreFor = evFor.reduce((sum, e) => sum + e.weight * e.value, 0);
    const scoreAgainst = evAgainst.reduce((sum, e) => sum + e.weight * e.value, 0);

    // Ratio favor/contra
    const netScore = Math.max(0, Math.min(1, (scoreFor - scoreAgainst * 0.7) / (totalWeight + 0.001)));
    
    // Confianza
    const convergenceBonus = Math.min(evFor.length / 6, 0.15);
    let confidence = Math.min(0.95, netScore * 0.70 + convergenceBonus + 0.15);

    // Penalizar si hay objeciones críticas
    const criticalObjections = evAgainst.filter(e => e.value >= 0.80 && e.weight >= 0.15);
    if (criticalObjections.length > 0) {
      confidence *= 0.70;
      reasoning.push(`  → Penalización por ${criticalObjections.length} objeciones críticas`);
    }

    const score100 = Math.round(netScore * 100);

    // Determinar intención
    let intent = 'browsing';
    let suggestedAction = 'show_product';

    if (evFor.some(e => e.name === 'buying_intent')) {
      intent = 'buy';
      suggestedAction = 'close';
    } else if (evAgainst.some(e => e.name === 'leaving_intent')) {
      intent = 'leaving';
      suggestedAction = 'follow_up';
    } else if (evAgainst.some(e => e.name === 'objection_detected')) {
      intent = 'objection';
      suggestedAction = 'handle_objection';
    } else if (score100 >= 60) {
      intent = 'interested';
      suggestedAction = 'close';
    }

    // Label de etapa
    let stageLabel = 'COLD';
    if (score100 >= 75) stageLabel = 'HOT_LEAD';
    else if (score100 >= 55) stageLabel = 'WARM';
    else if (score100 >= 35) stageLabel = 'COLD';
    else stageLabel = 'LOST';

    const shouldPush = score100 >= 60 && intent !== 'leaving';

    reasoning.push(`  → Score final: ${score100}/100 | Confianza: ${(confidence * 100).toFixed(0)}%`);
    reasoning.push(`  → Intención: ${intent} | Etapa: ${stageLabel}`);
    reasoning.push(`  → Acción sugerida: ${suggestedAction}`);

    return {
      intent,
      confidence: Math.round(confidence * 1000) / 1000,
      score: score100,
      narrative: this.buildNarrative(intent, stageLabel, evFor, evAgainst),
      evidence_for: evFor.map(e => e.description),
      evidence_against: evAgainst.map(e => e.description),
      stage_label: stageLabel,
      should_push: shouldPush,
      reasoning_chain: reasoning,
      suggested_response: '',
      suggested_action: suggestedAction
    };
  }

  private buildNarrative(
    intent: string, 
    stage: string, 
    evFor: Evidence[], 
    evAgainst: Evidence[]
  ): string {
    const parts: string[] = [];

    // Contexto de intención
    if (intent === 'buy') {
      parts.push('El cliente muestra clara intención de compra');
    } else if (intent === 'interested') {
      parts.push('El cliente está interesado pero necesita un empujón');
    } else if (intent === 'objection') {
      parts.push('El cliente tiene objeciones que deben manejarse');
    } else if (intent === 'leaving') {
      parts.push('El cliente está perdiendo interés');
    } else {
      parts.push('El cliente está explorando opciones');
    }

    // Evidencias principales
    if (evFor.length > 0) {
      const topEvidence = evFor.sort((a, b) => b.value - a.value)[0];
      parts.push(`Señal positiva: ${topEvidence.description.toLowerCase()}`);
    }

    if (evAgainst.length > 0) {
      const topObjection = evAgainst.sort((a, b) => b.value - a.value)[0];
      parts.push(`Objeción principal: ${topObjection.description.toLowerCase()}`);
    }

    // Recomendación
    if (stage === 'HOT_LEAD') {
      parts.push('→ CERRAR AHORA con urgencia');
    } else if (stage === 'WARM') {
      parts.push('→ Mostrar beneficios y crear urgencia');
    } else if (stage === 'COLD') {
      parts.push('→ Calentar con valor y pruebas sociales');
    } else {
      parts.push('→ Intentar recuperar con oferta especial');
    }

    return parts.join('. ') + '.';
  }

  private generateResponse(verdict: SalesVerdict, context: ConversationContext, lastMessage: string): string {
    const responses: Record<string, string[]> = {
      buy: [
        '¡Perfecto! Te envío los datos de pago ahora mismo 💳',
        '¡Excelente decisión! ¿Prefieres pagar por Nequi, tarjeta o PayPal? 💰',
        '¡Genial! Te preparo el link de pago. ¿Qué método prefieres? 📱'
      ],
      interested: [
        '¿Te gustaría ver más detalles del producto? Te muestro todo 📦',
        'Tengo una oferta especial solo por hoy. ¿Te interesa? 🔥',
        '¿Tienes alguna duda específica que pueda resolver? 💬'
      ],
      objection: [
        'Entiendo tu preocupación. Déjame explicarte mejor... 🤝',
        'Muchos clientes tenían la misma duda. Te cuento cómo lo resolvimos... ✅',
        'Te entiendo perfectamente. Mira, tengo una solución para ti... 💡'
      ],
      leaving: [
        'Antes de irte, ¿puedo ofrecerte un descuento especial? 🎁',
        'Espera, tengo algo que puede interesarte... 👀',
        'Ok, te dejo mi contacto por si cambias de opinión. ¡Éxitos! 👋'
      ],
      browsing: [
        '¿Qué tipo de producto estás buscando? Te ayudo a encontrarlo 🔍',
        'Tenemos varias opciones. ¿Qué es lo más importante para ti? 🎯',
        'Cuéntame más sobre lo que necesitas y te recomiendo lo mejor 💬'
      ]
    };

    const options = responses[verdict.intent] || responses.browsing;
    return options[Math.floor(Math.random() * options.length)];
  }
}
