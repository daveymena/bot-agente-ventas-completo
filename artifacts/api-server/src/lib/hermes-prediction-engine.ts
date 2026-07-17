/**
 * ============================================================
 * HERMES PREDICTION ENGINE - Motor de Predicción de Compra
 * ============================================================
 * 
 * Anticipa qué hará el cliente ANTES de que lo haga.
 * Usa análisis de comportamiento para maximizar conversiones.
 */

import { logger } from "./logger";
import type { ConversationMemory } from "./conversation-engine";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PurchasePrediction {
  probability: number;
  timeToPurchase: number;
  triggerAction: string;
  barriers: string[];
  recommendations: string[];
  confidence: number;
}

// ─── Motor de Predicción ─────────────────────────────────────────────────────

export class HermesPredictionEngine {
  
  /**
   * PREDECIR COMPRA - Análisis completo
   */
  static predictPurchase(
    memory: ConversationMemory,
    products: any[]
  ): PurchasePrediction {
    const startTime = Date.now();
    
    // 1. Analizar señales de compra
    const buyingSignals = this.analyzeBuyingSignals(memory);
    
    // 2. Analizar comportamiento
    const behavior = this.analyzeBehavior(memory);
    
    // 3. Calcular probabilidad
    const probability = this.calculateProbability(buyingSignals, behavior);
    
    // 4. Estimar tiempo
    const timeToPurchase = this.estimateTime(probability, behavior);
    
    // 5. Identificar trigger
    const triggerAction = this.identifyTrigger(memory, behavior);
    
    // 6. Identificar barreras
    const barriers = this.identifyBarriers(memory);
    
    // 7. Generar recomendaciones
    const recommendations = this.generateRecommendations(probability, barriers, behavior);
    
    // 8. Calcular confianza
    const confidence = this.calculateConfidence(memory);
    
    const elapsed = Date.now() - startTime;
    logger.info({
      elapsed,
      probability,
      timeToPurchase,
      barriers: barriers.length
    }, "[HermesPrediction] Predicción completada");
    
    return {
      probability,
      timeToPurchase,
      triggerAction,
      barriers,
      recommendations,
      confidence
    };
  }

  /**
   * ANALIZAR SEÑALES DE COMPRA
   */
  private static analyzeBuyingSignals(memory: ConversationMemory): Record<string, number> {
    const signals: Record<string, number> = {
      priceInquiry: 0,
      paymentMethodMention: 0,
      productSpecificQuestion: 0,
      urgencyExpression: 0,
      positiveFeedback: 0,
      objectionRaised: 0
    };
    
    const customerMessages = memory.history
      .filter(m => m.role === 'customer')
      .map(m => m.content.toLowerCase());
    
    for (const msg of customerMessages) {
      if (/(cuánto|precio|costo|vale)/i.test(msg)) signals.priceInquiry += 30;
      if (/(nequi|paypal|tarjeta|transferencia)/i.test(msg)) signals.paymentMethodMention += 40;
      if (/(incluye|contiene|tiene|características)/i.test(msg)) signals.productSpecificQuestion += 25;
      if (/(urgente|rápido|ya|ahora)/i.test(msg)) signals.urgencyExpression += 35;
      if (/(genial|perfecto|excelente|me gusta)/i.test(msg)) signals.positiveFeedback += 20;
      if (/(caro|pensarlo|dudas)/i.test(msg)) signals.objectionRaised += 15;
    }
    
    return signals;
  }

  /**
   * ANALIZAR COMPORTAMIENTO
   */
  private static analyzeBehavior(memory: ConversationMemory): {
    engagement: number;
    patience: number;
    decisiveness: number;
    priceSensitivity: number;
  } {
    const messages = memory.history.filter(m => m.role === 'customer');
    const totalMessages = messages.length;
    
    if (totalMessages === 0) {
      return { engagement: 50, patience: 50, decisiveness: 50, priceSensitivity: 50 };
    }
    
    // Engagement: mensajes por minuto
    const timeSpan = totalMessages > 1
      ? (new Date(messages[messages.length - 1].createdAt).getTime() - 
         new Date(messages[0].createdAt).getTime()) / 60000
      : 1;
    
    const engagement = Math.min(100, (totalMessages / Math.max(1, timeSpan)) * 10);
    
    // Paciencia
    const patience = totalMessages > 3 ? 70 : 50;
    
    // Decisividad: mensajes cortos y directos
    const avgLength = messages.reduce((sum, m) => sum + m.content.length, 0) / totalMessages;
    const decisiveness = avgLength < 30 ? 80 : avgLength < 60 ? 60 : 40;
    
    // Sensibilidad al precio
    const priceRelated = messages.filter(m => 
      /(caro|barato|descuento|oferta)/i.test(m.content)
    ).length;
    const priceSensitivity = Math.min(100, (priceRelated / totalMessages) * 100);
    
    return { engagement, patience, decisiveness, priceSensitivity };
  }

  /**
   * CALCULAR PROBABILIDAD DE COMPRA
   */
  private static calculateProbability(
    signals: Record<string, number>,
    behavior: ReturnType<typeof this.analyzeBehavior>
  ): number {
    const signalScore = Object.values(signals).reduce((a, b) => a + b, 0);
    const behaviorScore = (
      behavior.engagement * 0.3 +
      behavior.decisiveness * 0.4 +
      (100 - behavior.priceSensitivity) * 0.3
    );
    
    const rawProbability = (signalScore * 0.6 + behaviorScore * 0.4) / 10;
    return Math.min(95, Math.max(5, Math.round(rawProbability)));
  }

  /**
   * ESTIMAR TIEMPO HASTA COMPRA
   */
  private static estimateTime(
    probability: number,
    behavior: ReturnType<typeof this.analyzeBehavior>
  ): number {
    if (probability > 80) return 1;
    if (probability > 60) return 3;
    if (probability > 40) return 5;
    if (probability > 20) return 10;
    return 15;
  }

  /**
   * IDENTIFICAR TRIGGER DE COMPRA
   */
  private static identifyTrigger(
    memory: ConversationMemory,
    behavior: ReturnType<typeof this.analyzeBehavior>
  ): string {
    const lastMessage = memory.history[memory.history.length - 1]?.content || '';
    
    if (/(nequi|paypal|pagar|comprar)/i.test(lastMessage)) return 'payment_inquiry';
    if (behavior.priceSensitivity > 70) return 'price_justification';
    if (behavior.engagement > 70) return 'product_demonstration';
    
    return 'value_reinforcement';
  }

  /**
   * IDENTIFICAR BARRERAS
   */
  private static identifyBarriers(memory: ConversationMemory): string[] {
    const barriers: string[] = [];
    const messages = memory.history.filter(m => m.role === 'customer');
    
    for (const msg of messages) {
      const content = msg.content.toLowerCase();
      
      if (/(caro|dinero|presupuesto)/i.test(content)) barriers.push('price');
      if (/(no sé|dudas|inseguro)/i.test(content)) barriers.push('uncertainty');
      if (/(estafa|fraude|no confío)/i.test(content)) barriers.push('trust');
      if (/(tiempo|ocupado|después)/i.test(content)) barriers.push('time');
    }
    
    return [...new Set(barriers)];
  }

  /**
   * GENERAR RECOMENDACIONES
   */
  private static generateRecommendations(
    probability: number,
    barriers: string[],
    behavior: ReturnType<typeof this.analyzeBehavior>
  ): string[] {
    const recommendations: string[] = [];
    
    if (probability > 70) {
      recommendations.push('FACILITAR_PAGO: Ofrecer métodos de pago inmediatos');
      recommendations.push('CREAR_URGENCIA: Mencionar disponibilidad limitada');
    }
    
    if (barriers.includes('price')) {
      recommendations.push('JUSTIFICAR_VALOR: Enfatizar garantía y acceso de por vida');
      recommendations.push('COMPARAR: Mostrar relación calidad-precio');
    }
    
    if (barriers.includes('trust')) {
      recommendations.push('PROBAR_CONFIANZA: Mencionar garantía y soporte');
    }
    
    if (barriers.includes('uncertainty')) {
      recommendations.push('EDUCAR: Explicar beneficios claramente');
    }
    
    if (behavior.engagement < 50) {
      recommendations.push('AUMENTAR_INTERES: Mostrar beneficios clave');
    }
    
    return recommendations;
  }

  /**
   * CALCULAR CONFIANZA
   */
  private static calculateConfidence(memory: ConversationMemory): number {
    const messages = memory.history.length;
    const hasProducts = memory.sentProductIds.size > 0;
    
    let confidence = 50;
    
    if (messages > 3) confidence += 20;
    if (messages > 5) confidence += 10;
    if (hasProducts) confidence += 20;
    
    return Math.min(95, confidence);
  }
}
