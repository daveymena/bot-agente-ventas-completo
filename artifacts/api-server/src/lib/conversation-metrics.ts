/**
 * ============================================================
 * CONVERSATION METRICS - Métricas de Conversación
 * ============================================================
 * 
 * Trackea interacciones para mejorar el sistema.
 * Analiza qué respuestas generan conversiones.
 */

import { logger } from "./logger";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface InteractionMetric {
  conversationId: number;
  timestamp: Date;
  intent: string;
  strategy: string;
  responseTime: number;
  convertedToSale: boolean;
  customerSatisfaction?: number;
}

export interface SalesInsights {
  topPerformingStrategies: string[];
  averageConversionRate: number;
  averageResponseTime: number;
  commonObjections: string[];
  recommendations: string[];
}

// ─── Métricas de Conversación ────────────────────────────────────────────────

export class ConversationMetrics {
  
  private static metrics: InteractionMetric[] = [];

  /**
   * TRACKEAR INTERACCIÓN
   */
  static trackInteraction(data: {
    conversationId: number;
    intent: string;
    strategy: string;
    responseTime: number;
    convertedToSale?: boolean;
  }): void {
    const metric: InteractionMetric = {
      conversationId: data.conversationId,
      timestamp: new Date(),
      intent: data.intent,
      strategy: data.strategy,
      responseTime: data.responseTime,
      convertedToSale: data.convertedToSale || false
    };

    this.metrics.push(metric);

    // Mantener solo los últimos 1000 métricas
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    logger.info({
      conversationId: data.conversationId,
      intent: data.intent,
      strategy: data.strategy,
      responseTime: data.responseTime
    }, "[Metrics] Interacción trackeada");
  }

  /**
   * ACTUALIZAR MÉTRICA DE CONVERSIÓN
   */
  static updateConversion(conversationId: number, converted: boolean): void {
    const metric = this.metrics.find(m => m.conversationId === conversationId);
    if (metric) {
      metric.convertedToSale = converted;
    }
  }

  /**
   * OBTENER INSIGHTS DE VENTAS
   */
  static getSalesInsights(): SalesInsights {
    if (this.metrics.length === 0) {
      return {
        topPerformingStrategies: [],
        averageConversionRate: 0,
        averageResponseTime: 0,
        commonObjections: [],
        recommendations: ['No hay suficientes datos para generar insights']
      };
    }

    // Calcular tasa de conversión
    const conversions = this.metrics.filter(m => m.convertedToSale).length;
    const averageConversionRate = (conversions / this.metrics.length) * 100;

    // Calcular tiempo promedio de respuesta
    const totalResponseTime = this.metrics.reduce((sum, m) => sum + m.responseTime, 0);
    const averageResponseTime = totalResponseTime / this.metrics.length;

    // Encontrar estrategias más efectivas
    const strategyConversions: Record<string, { total: number; conversions: number }> = {};
    for (const metric of this.metrics) {
      if (!strategyConversions[metric.strategy]) {
        strategyConversions[metric.strategy] = { total: 0, conversions: 0 };
      }
      strategyConversions[metric.strategy].total++;
      if (metric.convertedToSale) {
        strategyConversions[metric.strategy].conversions++;
      }
    }

    const topPerformingStrategies = Object.entries(strategyConversions)
      .map(([strategy, data]) => ({
        strategy,
        rate: (data.conversions / data.total) * 100
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3)
      .map(s => s.strategy);

    // Detectar objeciones comunes
    const commonObjections = this.detectCommonObjections();

    // Generar recomendaciones
    const recommendations = this.generateRecommendations(
      averageConversionRate,
      averageResponseTime,
      topPerformingStrategies
    );

    return {
      topPerformingStrategies,
      averageConversionRate,
      averageResponseTime,
      commonObjections,
      recommendations
    };
  }

  /**
   * DETECTAR OBJECIONES COMUNES
   */
  private static detectCommonObjections(): string[] {
    // En un sistema real, esto analizaría el historial de mensajes
    // Por ahora, retornamos objeciones comunes
    return [
      'Precio alto',
      'No tengo tiempo',
      'No estoy seguro',
      'Ya intenté algo similar'
    ];
  }

  /**
   * GENERAR RECOMENDACIONES
   */
  private static generateRecommendations(
    conversionRate: number,
    responseTime: number,
    topStrategies: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (conversionRate < 30) {
      recommendations.push('Mejorar técnicas de cierre de venta');
    }

    if (responseTime > 10000) {
      recommendations.push('Reducir tiempo de respuesta usando modelos más rápidos');
    }

    if (topStrategies.length > 0) {
      recommendations.push(`Enfocarse en estrategia "${topStrategies[0]}" que es la más efectiva`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Mantener el rendimiento actual');
    }

    return recommendations;
  }

  /**
   * OBTENER MÉTRICAS POR CONVERSACIÓN
   */
  static getConversationMetrics(conversationId: number): InteractionMetric[] {
    return this.metrics.filter(m => m.conversationId === conversationId);
  }

  /**
   * OBTENER RESUMEN DE RENDIMIENTO
   */
  static getPerformanceSummary(): {
    totalInteractions: number;
    conversionRate: number;
    averageResponseTime: number;
    topStrategy: string;
  } {
    const totalInteractions = this.metrics.length;
    const conversions = this.metrics.filter(m => m.convertedToSale).length;
    const conversionRate = totalInteractions > 0 ? (conversions / totalInteractions) * 100 : 0;
    
    const totalResponseTime = this.metrics.reduce((sum, m) => sum + m.responseTime, 0);
    const averageResponseTime = totalInteractions > 0 ? totalResponseTime / totalInteractions : 0;

    // Encontrar estrategia más usada
    const strategyCounts: Record<string, number> = {};
    for (const metric of this.metrics) {
      strategyCounts[metric.strategy] = (strategyCounts[metric.strategy] || 0) + 1;
    }
    const topStrategy = Object.entries(strategyCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'none';

    return {
      totalInteractions,
      conversionRate,
      averageResponseTime,
      topStrategy
    };
  }

  /**
   * LIMPIAR MÉTRICAS ANTIGUAS
   */
  static cleanOldMetrics(daysToKeep: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    this.metrics = this.metrics.filter(m => m.timestamp >= cutoffDate);
  }
}
