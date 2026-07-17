/**
 * ============================================================
 * HERMES REASONING ENGINE - Motor de Razonamiento Profundo
 * ============================================================
 * 
 * Capa cognitiva que PIENSA antes de responder.
 * No es un chatbot - es un vendedor humano de élite.
 * 
 * CADENA DE RAZONAMIENTO:
 * 1. ANALIZA → Entiende la situación completa
 * 2. PREDICE → Anticipa la siguiente pregunta
 * 3. PLANEA → Diseña la mejor respuesta
 * 4. VALIDA → Verifica que no alucine
 * 5. EJECUTA → Genera respuesta superior
 */

import { logger } from "./logger";
import type { ConversationMemory } from "./conversation-engine";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ReasoningChain {
  analysis: {
    customerIntent: string;
    emotionalState: string;
    urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
    buyingStage: 'awareness' | 'consideration' | 'decision' | 'purchase';
    painPoints: string[];
    motivations: string[];
  };
  prediction: {
    nextQuestion: string;
    objections: string[];
    decisionFactors: string[];
    timeToClose: number;
  };
  strategy: {
    approach: 'consultative' | 'direct' | 'empathetic' | 'urgency';
    keyMessages: string[];
    proofPoints: string[];
    closingTechnique: string;
  };
  validation: {
    hasAllData: boolean;
    priceAccurate: boolean;
    productExists: boolean;
    noHallucination: boolean;
  };
}

// ─── Motor de Razonamiento ───────────────────────────────────────────────────

export class HermesReasoningEngine {
  
  /**
   * CADENA COMPLETA DE RAZONAMIENTO
   * La IA PIENSA antes de hablar
   */
  static reason(
    message: string,
    memory: ConversationMemory,
    products: any[]
  ): ReasoningChain {
    const startTime = Date.now();
    
    // PASO 1: ANÁLISIS PROFUNDO
    const analysis = this.analyzeSituation(message, memory);
    
    // PASO 2: PREDICCIÓN INTELIGENTE
    const prediction = this.predictNext(analysis, memory);
    
    // PASO 3: ESTRATEGIA PERSONALIZADA
    const strategy = this.designStrategy(analysis, prediction, products);
    
    // PASO 4: VALIDACIÓN ESTRICTA
    const validation = this.validateResponse(analysis, strategy, products);
    
    const elapsed = Date.now() - startTime;
    logger.info({
      elapsed,
      intent: analysis.customerIntent,
      emotion: analysis.emotionalState,
      strategy: strategy.approach
    }, "[HermesReasoning] Cadena completada");
    
    return {
      analysis,
      prediction,
      strategy,
      validation
    };
  }

  /**
   * ANÁLISIS DE SITUACIÓN - Entiende TODO
   */
  private static analyzeSituation(
    message: string,
    memory: ConversationMemory
  ): ReasoningChain['analysis'] {
    const lower = message.toLowerCase();
    
    // Detectar intención real
    const intent = this.detectRealIntent(lower, memory);
    
    // Detectar estado emocional profundo
    const emotional = this.detectDeepEmotion(lower, memory);
    
    // Detectar urgencia real
    const urgency = this.detectUrgency(lower);
    
    // Detectar etapa de compra
    const buyingStage = this.detectBuyingStage(lower, memory);
    
    // Extraer puntos de dolor
    const painPoints = this.extractPainPoints(lower);
    
    // Extraer motivaciones
    const motivations = this.extractMotivations(lower);
    
    return {
      customerIntent: intent,
      emotionalState: emotional,
      urgencyLevel: urgency,
      buyingStage,
      painPoints,
      motivations
    };
  }

  /**
   * DETECCIÓN DE INTENCIÓN REAL
   */
  private static detectRealIntent(text: string, memory: ConversationMemory): string {
    const deepPatterns: Record<string, RegExp> = {
      problem_seeking: /(no sé|necesito|ayuda|problema|difícil|complicado)/i,
      improvement_seeking: /(mejorar|aprender|crecer|desarrollar|avanzar)/i,
      value_seeking: /(barato|economico|ahorrar|descuento|oferta)/i,
      quick_purchase: /(comprar|pagar|ya|ahora|inmediato)/i,
      serious_doubt: /(no sé si|dudo|preocupa|miedo|estafa)/i,
      comparing: /(mejor|diferencia|versus|vs|comparado)/i,
      seeking_advice: /(qué me recomiendas|cuál me sirve|cuál es mejor)/i
    };
    
    for (const [intent, pattern] of Object.entries(deepPatterns)) {
      if (pattern.test(text)) return intent;
    }
    
    if (memory.history.length > 0) {
      return this.detectIntentFromHistory(memory);
    }
    
    return 'general_inquiry';
  }

  /**
   * DETECCIÓN DE EMOCIÓN PROFUNDA
   */
  private static detectDeepEmotion(
    text: string,
    memory: ConversationMemory
  ): string {
    const recentMessages = memory.history.slice(-5).map(m => m.content).join(' ');
    const combined = `${text} ${recentMessages}`;
    
    const emotions: Record<string, RegExp> = {
      frustrated: /(no funciona|molesto|harto|cansado|terrible|horrible)/i,
      excited: /(genial|perfecto|excelente|increíble|me encanta)/i,
      hesitant: /(no sé|tal vez|quizás|pensarlo|después)/i,
      eager: /(quiero|necesito|comprar|ya|ahora)/i,
      confused: /(no entiendo|explícame|no comprendo|confuso)/i,
      skeptical: /(no confío|estafa|dudo|no creo)/i,
      satisfied: /(gracias|buen servicio|recomiendo|excelente)/i
    };
    
    for (const [emotion, pattern] of Object.entries(emotions)) {
      if (pattern.test(combined)) return emotion;
    }
    
    return 'neutral';
  }

  /**
   * DETECTAR URGENCIA
   */
  private static detectUrgency(text: string): 'low' | 'medium' | 'high' | 'critical' {
    if (/(urgente|rápido|ya|ahora|inmediato|empuja)/i.test(text)) return 'critical';
    if (/(pronto|hoy|mañana|esta semana)/i.test(text)) return 'high';
    if (/(esta semana|próximamente|cuando pueda)/i.test(text)) return 'medium';
    return 'low';
  }

  /**
   * DETECTAR ETAPA DE COMPRA
   */
  private static detectBuyingStage(
    text: string,
    memory: ConversationMemory
  ): 'awareness' | 'consideration' | 'decision' | 'purchase' {
    if (/(comprar|pagar|nequi|paypal|tarjeta)/i.test(text)) return 'purchase';
    if (/(cuánto|precio|costo|vale|cuesta)/i.test(text)) return 'decision';
    if (/(incluye|contiene|tiene|características|detalles)/i.test(text)) return 'consideration';
    
    if (memory.sentProductIds.size > 0) return 'consideration';
    if (memory.messageCount > 2) return 'consideration';
    
    return 'awareness';
  }

  /**
   * EXTRAER PUNTOS DE DOLOR
   */
  private static extractPainPoints(text: string): string[] {
    const painPoints: string[] = [];
    
    if (/(no tengo tiempo|ocupado|ocupada)/i.test(text)) painPoints.push('time');
    if (/(caro|dinero|presupuesto|costoso)/i.test(text)) painPoints.push('budget');
    if (/(no sé|dudas|inseguro|preocupa)/i.test(text)) painPoints.push('uncertainty');
    if (/(no funciona|problema|error|difícil)/i.test(text)) painPoints.push('frustration');
    if (/(estafa|fraude|no confío)/i.test(text)) painPoints.push('trust');
    
    return painPoints;
  }

  /**
   * EXTRAER MOTIVACIONES
   */
  private static extractMotivations(text: string): string[] {
    const motivations: string[] = [];
    
    if (/(aprender|estudiar|formación|educación)/i.test(text)) motivations.push('learning');
    if (/(trabajo|empleo|carrera|profesional)/i.test(text)) motivations.push('career');
    if (/(negocio|emprender|vender|empresa)/i.test(text)) motivations.push('business');
    if (/(ahorrar|económico|barato)/i.test(text)) motivations.push('saving');
    if (/(mejorar|crecer|avanzar)/i.test(text)) motivations.push('growth');
    
    return motivations;
  }

  /**
   * DETECTAR INTENCIÓN DEL HISTORIAL
   */
  private static detectIntentFromHistory(memory: ConversationMemory): string {
    const recentCustomerMessages = memory.history
      .filter(m => m.role === 'customer')
      .slice(-3)
      .map(m => m.content.toLowerCase())
      .join(' ');
    
    if (/(comprar|pagar|nequi|paypal)/i.test(recentCustomerMessages)) return 'purchase_intent';
    if (/(precio|cuánto|vale)/i.test(recentCustomerMessages)) return 'price_inquiry';
    if (/(producto|curso|megapack)/i.test(recentCustomerMessages)) return 'product_inquiry';
    
    return 'general_inquiry';
  }

  /**
   * PREDICCIÓN INTELIGENTE
   */
  private static predictNext(
    analysis: ReasoningChain['analysis'],
    memory: ConversationMemory
  ): ReasoningChain['prediction'] {
    const nextQuestions: Record<string, string> = {
      awareness: '¿Qué incluye exactamente?',
      consideration: '¿Cuánto cuesta? / ¿Cómo pago?',
      decision: '¿Cómo accedo al producto?',
      purchase: '¿Qué método de pago prefieres?'
    };
    
    const objections = this.predictObjections(analysis);
    const decisionFactors = this.predictDecisionFactors(analysis);
    const timeToClose = this.estimateTimeToClose(analysis, memory);
    
    return {
      nextQuestion: nextQuestions[analysis.buyingStage] || '¿Qué necesitas?',
      objections,
      decisionFactors,
      timeToClose
    };
  }

  /**
   * PREDECIR OBJECIONES
   */
  private static predictObjections(analysis: ReasoningChain['analysis']): string[] {
    const objections: string[] = [];
    
    if (analysis.painPoints.includes('budget')) objections.push('Es caro / No tengo dinero');
    if (analysis.painPoints.includes('time')) objections.push('No tengo tiempo');
    if (analysis.painPoints.includes('trust')) objections.push('No confío / Es estafa');
    if (analysis.urgencyLevel === 'low') objections.push('Lo voy a pensar');
    if (analysis.painPoints.includes('uncertainty')) objections.push('No sé si me sirva');
    
    return objections;
  }

  /**
   * PREDECIR FACTORES DE DECISIÓN
   */
  private static predictDecisionFactors(analysis: ReasoningChain['analysis']): string[] {
    const factors: string[] = [];
    
    if (analysis.motivations.includes('career')) factors.push('Oportunidad laboral');
    if (analysis.motivations.includes('business')) factors.push('Generar ingresos');
    if (analysis.motivations.includes('learning')) factors.push('Aprender nueva habilidad');
    if (analysis.motivations.includes('saving')) factors.push('Precio accesible');
    if (analysis.motivations.includes('growth')) factors.push('Crecimiento personal');
    
    factors.push('Garantía sin riesgo');
    factors.push('Soporte incluido');
    
    return factors;
  }

  /**
   * ESTIMAR TIEMPO HASTA CIERRE
   */
  private static estimateTimeToClose(
    analysis: ReasoningChain['analysis'],
    memory: ConversationMemory
  ): number {
    let minutes = 5;
    
    if (analysis.urgencyLevel === 'critical') minutes -= 3;
    if (analysis.urgencyLevel === 'high') minutes -= 2;
    if (analysis.buyingStage === 'purchase') minutes = 1;
    if (analysis.buyingStage === 'decision') minutes = 2;
    if (memory.sentProductIds.size > 0) minutes -= 1;
    
    return Math.max(1, minutes);
  }

  /**
   * DISEÑAR ESTRATEGIA
   */
  private static designStrategy(
    analysis: ReasoningChain['analysis'],
    prediction: ReasoningChain['prediction'],
    products: any[]
  ): ReasoningChain['strategy'] {
    const approaches: Record<string, string> = {
      frustrated: 'empathetic',
      excited: 'direct',
      hesitant: 'consultative',
      eager: 'urgency',
      confused: 'consultative',
      skeptical: 'empathetic',
      neutral: 'consultative'
    };
    
    const approach = (approaches[analysis.emotionalState] || 'consultative') as any;
    
    const keyMessages = this.generateKeyMessages(analysis, approach);
    const proofPoints = this.selectProofPoints(analysis);
    const closingTechnique = this.selectClosingTechnique(analysis);
    
    return {
      approach,
      keyMessages,
      proofPoints,
      closingTechnique
    };
  }

  /**
   * GENERAR MENSAJES CLAVE
   */
  private static generateKeyMessages(
    analysis: ReasoningChain['analysis'],
    approach: string
  ): string[] {
    const messages: string[] = [];
    
    if (approach === 'empathetic') {
      messages.push('Entiendo perfectamente tu preocupación');
      messages.push('Déjame ayudarte a resolver esto');
    }
    
    if (approach === 'urgency') {
      messages.push('¡Excelente decisión!');
      messages.push('Tenemos todo listo para ti');
    }
    
    if (approach === 'consultative') {
      messages.push('Basado en lo que me cuentas...');
      messages.push('La mejor opción para ti sería...');
    }
    
    if (approach === 'direct') {
      messages.push('Perfecto, vamos directo al grano');
      messages.push('Aquí tienes lo que necesitas');
    }
    
    return messages;
  }

  /**
   * SELECCIONAR PRUEBAS SOCIALES
   */
  private static selectProofPoints(analysis: ReasoningChain['analysis']): string[] {
    const proofs: string[] = [];
    
    proofs.push('Acceso de por vida');
    proofs.push('7 días de garantía');
    proofs.push('Soporte directo por WhatsApp');
    
    if (analysis.emotionalState === 'skeptical') {
      proofs.push('Pago seguro verificado');
      proofs.push('Miles de clientes satisfechos');
    }
    
    if (analysis.painPoints.includes('budget')) {
      proofs.push('Mejor precio del mercado');
    }
    
    return proofs;
  }

  /**
   * SELECCIONAR TÉCNICA DE CIERRE
   */
  private static selectClosingTechnique(analysis: ReasoningChain['analysis']): string {
    const techniques: Record<string, string> = {
      eager: 'assumed_close',
      hesitant: 'alternative_close',
      frustrated: 'empathy_close',
      excited: 'urgency_close',
      neutral: 'value_close',
      skeptical: 'trust_close'
    };
    
    return techniques[analysis.emotionalState] || 'alternative_close';
  }

  /**
   * VALIDAR RESPUESTA
   */
  private static validateResponse(
    analysis: ReasoningChain['analysis'],
    strategy: ReasoningChain['strategy'],
    products: any[]
  ): ReasoningChain['validation'] {
    const hasAllData = analysis.painPoints.length > 0 || analysis.motivations.length > 0;
    const productExists = products.length > 0;

    // Check hallucination: verify keyMessages don't reference products not in catalog
    const productNames = products.map(p => (p.name || '').toLowerCase());
    const allStrategyText = [...strategy.keyMessages, ...strategy.proofPoints].join(' ').toLowerCase();
    const noHallucination = productNames.length === 0 || productNames.some(name => name.length > 2 && allStrategyText.includes(name));

    // Check price accuracy: extract any price-like numbers from keyMessages and verify against catalog
    const pricePattern = /\$?\s?[\d.,]+\s?(?:cop|usd|\$)/gi;
    const mentionedPrices = allStrategyText.match(pricePattern) || [];
    let priceAccurate = true;
    if (mentionedPrices.length > 0 && products.length > 0) {
      const catalogPrices = products.map(p => Number(p.price)).filter(p => p > 0);
      for (const mention of mentionedPrices) {
        const numericPrice = parseFloat(mention.replace(/[^0-9.,]/g, '').replace(',', ''));
        if (catalogPrices.length > 0 && !catalogPrices.some(cp => Math.abs(cp - numericPrice) < 1)) {
          priceAccurate = false;
        }
      }
    }

    return {
      hasAllData,
      priceAccurate,
      productExists,
      noHallucination
    };
  }
}
