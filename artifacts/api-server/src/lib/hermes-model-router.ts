/**
 * ============================================================
 * HERMES MODEL ROUTER - Enrutador de Modelos por Capacidad
 * ============================================================
 * 
 * Cada modelo de IA tiene fortalezas diferentes.
 * Este router selecciona el MEJOR modelo para cada tarea.
 */

import { logger } from "./logger";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ReasoningLevel = 
  | 'supreme'    // Razonamiento supremo (DeepSeek Ultra)
  | 'balanced'   // Balance ideal (DeepSeek Flash)
  | 'fast'       // Respuesta rápida (GPT-5.5)
  | 'creative'   // Creatividad (Claude)
  | 'fallback';  // Último recurso (MiMo)

export interface ModelCapability {
  provider: string;
  model: string;
  strengths: string[];
  bestFor: string[];
  latency: 'low' | 'medium' | 'high';
  quality: 'supreme' | 'high' | 'medium';
}

// ─── Enrutador de Modelos ────────────────────────────────────────────────────

export class HermesModelRouter {
  
  /**
   * MAPA DE CAPACIDADES - Los MEJORES modelos por tarea
   */
  private static readonly MODEL_MAP: Record<ReasoningLevel, ModelCapability> = {
    supreme: {
      provider: 'freemodel',
      model: 'deepseek-v3-ultra-free',
      strengths: ['deep_reasoning', 'analysis', 'strategy', 'empathy'],
      bestFor: ['objections', 'frustration', 'complex_negotiation', 'strategic_planning'],
      latency: 'medium',
      quality: 'supreme'
    },
    balanced: {
      provider: 'freemodel',
      model: 'deepseek-v4-flash-free',
      strengths: ['balanced', 'accurate', 'versatile'],
      bestFor: ['product_discovery', 'general_queries', 'qualification'],
      latency: 'low',
      quality: 'high'
    },
    fast: {
      provider: 'freemodel',
      model: 'gpt-5.5',
      strengths: ['speed', 'precision', 'closeness'],
      bestFor: ['payment_close', 'farewell', 'quick_responses'],
      latency: 'low',
      quality: 'high'
    },
    creative: {
      provider: 'github',
      model: 'Claude-3.5-Sonnet',
      strengths: ['creativity', 'natural_language', 'empathy'],
      bestFor: ['creative_writing', 'personalization', 'storytelling'],
      latency: 'medium',
      quality: 'supreme'
    },
    fallback: {
      provider: 'freemodel',
      model: 'mimo/mimo-v2.5-pro',
      strengths: ['reliability', 'backup'],
      bestFor: ['fallback'],
      latency: 'low',
      quality: 'medium'
    }
  };

  /**
   * SELECCIONAR EL MEJOR MODELO según la situación
   */
  static selectModel(
    intent: string,
    emotionalState: string,
    complexity: 'low' | 'medium' | 'high'
  ): { provider: string; model: string; reason: string } {
    
    // CASO 1: Situación crítica (frustración, objeciones serias)
    if (emotionalState === 'frustrated' || emotionalState === 'skeptical') {
      return {
        ...this.MODEL_MAP.supreme,
        reason: 'Situación crítica requiere razonamiento supremo'
      };
    }
    
    // CASO 2: Cierre de pago (velocidad es clave)
    if (intent === 'payment_intent' || intent === 'closing') {
      return {
        ...this.MODEL_MAP.fast,
        reason: 'Cierre requiere respuesta rápida y precisa'
      };
    }
    
    // CASO 3: Complejidad alta (negociación, comparaciones)
    if (complexity === 'high') {
      return {
        ...this.MODEL_MAP.supreme,
        reason: 'Tarea compleja requiere análisis profundo'
      };
    }
    
    // CASO 4: Consulta general (balance)
    if (complexity === 'medium' || intent === 'product_query') {
      return {
        ...this.MODEL_MAP.balanced,
        reason: 'Consulta general - balance calidad/velocidad'
      };
    }
    
    // CASO 5: Respuesta rápida
    return {
      ...this.MODEL_MAP.fast,
      reason: 'Respuesta rápida para interacción ágil'
    };
  }

  /**
   * OBTENER CADENA DE FALLBACK
   * Si el principal falla, probar el siguiente
   */
  static getFallbackChain(
    primaryLevel: ReasoningLevel
  ): Array<{ provider: string; model: string }> {
    const chain: ReasoningLevel[] = ['supreme', 'balanced', 'fast', 'fallback'];
    
    const startIndex = chain.indexOf(primaryLevel);
    return chain.slice(startIndex).map(level => ({
      provider: this.MODEL_MAP[level].provider,
      model: this.MODEL_MAP[level].model
    }));
  }

  /**
   * OBTENER MODELO POR NIVEL
   */
  static getModelByLevel(level: ReasoningLevel): ModelCapability {
    return this.MODEL_MAP[level];
  }

  /**
   * DETERMINAR NIVEL DE COMPLEJIDAD
   */
  static determineComplexity(
    message: string,
    memoryHistory: any[]
  ): 'low' | 'medium' | 'high' {
    const lower = message.toLowerCase();
    
    // Complejidad alta: objeciones, frustración, negociación compleja
    if (/(caro|muy|no sé|duda|estafa|problema|no funciona)/i.test(lower)) {
      return 'high';
    }
    
    // Complejidad media: preguntas de producto, comparaciones
    if (/(precio|cuánto|incluye|diferencia|mejor|comparar)/i.test(lower)) {
      return 'medium';
    }
    
    // Complejidad baja: saludos, agradecimientos
    if (/(hola|gracias|adiós|buenas)/i.test(lower)) {
      return 'low';
    }
    
    // Por defecto: media
    return 'medium';
  }

  /**
   * LOG DE SELECCIÓN DE MODELO
   */
  static logSelection(
    selectedModel: { provider: string; model: string; reason: string },
    conversationId: number
  ): void {
    logger.info({
      conversationId,
      provider: selectedModel.provider,
      model: selectedModel.model,
      reason: selectedModel.reason
    }, "[HermesModelRouter] Modelo seleccionado");
  }
}
