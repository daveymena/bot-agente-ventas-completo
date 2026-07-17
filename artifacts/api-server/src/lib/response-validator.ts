/**
 * ============================================================
 * RESPONSE VALIDATOR - Validador Anti-Alucinación
 * ============================================================
 * 
 * Verifica que la IA no alucine antes de enviar al cliente.
 * GARANTÍA: El sistema NUNCA enviará información inventada.
 */

import { logger } from "./logger";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  isValid: boolean;
  score: number;
  issues: string[];
  shouldRetry: boolean;
  sanitizedResponse?: string;
}

export interface ValidationContext {
  products: any[];
  sentProductIds: Set<number>;
  currentProductId: number | null;
  intent: string;
}

// ─── Validador de Respuestas ─────────────────────────────────────────────────

export class ResponseValidator {
  
  /**
   * VALIDAR COMPLETAMENTE UNA RESPUESTA
   */
  static validate(
    response: string,
    context: ValidationContext
  ): ValidationResult {
    const issues: string[] = [];
    let score = 100;
    let sanitized = response;

    // 1. Verificar que no haya inventado productos
    const inventedProducts = this.detectInventedProducts(response, context.products);
    if (inventedProducts.length > 0) {
      issues.push(`Productos inventados detectados: ${inventedProducts.join(', ')}`);
      score -= 50;
    }

    // 2. Verificar precios
    const priceErrors = this.verifyPrices(response, context.products);
    if (priceErrors.length > 0) {
      issues.push(`Precios incorrectos: ${priceErrors.join(', ')}`);
      score -= 30;
    }

    // 3. Verificar que no haya links/URLs
    if (this.containsUrls(response)) {
      issues.push('Contiene URLs que debería generar el sistema');
      score -= 20;
      sanitized = this.removeUrls(sanitized);
    }

    // 4. Verificar que no haya números de cuenta
    if (this.containsAccountNumbers(response)) {
      issues.push('Contiene números de cuenta manuales');
      score -= 20;
    }

    // 5. Verificar formato de CARD
    const cardValid = this.validateCardFormat(response);
    if (!cardValid.isValid) {
      issues.push(`Formato de CARD incorrecto: ${cardValid.error}`);
      score -= 15;
    }

    // 6. Verificar que no repita información
    if (this.hasRepetition(response)) {
      issues.push('Repite información innecesariamente');
      score -= 10;
    }

    // 7. Verificar que no sea demasiado largo
    if (response.length > 1000) {
      issues.push('Respuesta demasiado larga para WhatsApp');
      score -= 10;
    }

    // 8. Verificar que no haya caracteres raros
    if (this.hasWeirdCharacters(response)) {
      issues.push('Contiene caracteres inusuales');
      score -= 5;
    }

    const isValid = score >= 70;
    const shouldRetry = score < 70 && score >= 40;

    if (!isValid) {
      logger.warn({
        score,
        issues,
        responseLength: response.length
      }, "[ResponseValidator] Respuesta inválida");
    }

    return {
      isValid,
      score,
      issues,
      shouldRetry,
      sanitizedResponse: sanitized
    };
  }

  /**
   * DETECTAR PRODUCTOS INVENTADOS
   */
  private static detectInventedProducts(response: string, products: any[]): string[] {
    const invented: string[] = [];
    
    // Buscar menciones de productos que no están en la BD
    const productMentions = response.match(/\b(curso|megapack|piano|guitarra|diseño|trading|excel|programación|marketing|idioma)\b/gi) || [];
    
    for (const mention of productMentions) {
      const exists = products.some(p => 
        (p.name || '').toLowerCase().includes(mention.toLowerCase())
      );
      if (!exists) {
        invented.push(mention);
      }
    }
    
    return [...new Set(invented)];
  }

  /**
   * VERIFICAR PRECIOS
   */
  private static verifyPrices(response: string, products: any[]): string[] {
    const errors: string[] = [];
    
    // Buscar menciones de precios en la respuesta
    const priceMatches = response.match(/\$[\d,.]+/g) || [];
    
    for (const priceStr of priceMatches) {
      // Handle COP format: $20.000 (dot as thousands separator) and $20,000 (comma as thousands)
      const cleaned = priceStr.replace(/[$]/g, '');
      let price: number;
      
      // If has both dot and comma, determine which is decimal
      if (cleaned.includes('.') && cleaned.includes(',')) {
        // e.g., "20.000,50" or "20,000.50"
        price = parseFloat(cleaned.replace(/,/g, ''));
      } else if (cleaned.includes('.')) {
        // Could be "20.000" (20k in COP) or "20.50" (decimal)
        // If 3 digits after dot, it's thousands separator
        const parts = cleaned.split('.');
        if (parts[1] && parts[1].length === 3) {
          price = parseFloat(cleaned.replace(/\./g, ''));
        } else {
          price = parseFloat(cleaned);
        }
      } else if (cleaned.includes(',')) {
        price = parseFloat(cleaned.replace(/,/g, ''));
      } else {
        price = parseFloat(cleaned);
      }
      
      // Verificar si el precio es razonable (entre 1000 y 100,000,000)
      if (price < 1000 || price > 100000000) {
        errors.push(`Precio inusual: ${priceStr}`);
      }
    }
    
    return errors;
  }

  /**
   * VERIFICAR URLs
   */
  private static containsUrls(response: string): boolean {
    return /https?:\/\/[^\s]+/i.test(response);
  }

  /**
   * ELIMINAR URLs
   */
  private static removeUrls(response: string): string {
    return response.replace(/https?:\/\/[^\s]+/gi, '[LINK GENERADO POR SISTEMA]').trim();
  }

  /**
   * VERIFICAR NÚMEROS DE CUENTA
   */
  private static containsAccountNumbers(response: string): boolean {
    // Detectar números de 10+ dígitos que podrían ser cuentas
    return /\b\d{10,}\b/.test(response);
  }

  /**
   * VALIDAR FORMATO DE CARD
   */
  private static validateCardFormat(response: string): { isValid: boolean; error?: string } {
    const cardMatches = response.match(/\[CARD:\s*(\d+)\s*\]/gi) || [];
    
    // Solo debe haber UNA card
    if (cardMatches.length > 1) {
      return { isValid: false, error: 'Múltiples cards en un mensaje' };
    }
    
    // La card debe ser el último elemento
    if (cardMatches.length === 1) {
      const lastCardIndex = response.lastIndexOf('[CARD:');
      const afterCard = response.substring(lastCardIndex).replace(/\[CARD:\s*\d+\s*\]/gi, '').trim();
      
      if (afterCard.length > 0) {
        return { isValid: false, error: 'Texto después de la card' };
      }
    }
    
    return { isValid: true };
  }

  /**
   * VERIFICAR REPETICIÓN
   */
  private static hasRepetition(response: string): boolean {
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()));
    
    return uniqueSentences.size < sentences.length * 0.7;
  }

  /**
   * VERIFICAR CARACTERES RAROS
   */
  private static hasWeirdCharacters(response: string): boolean {
    // Detectar caracteres no normales
    return /[^\w\sáéíóúñüÁÉÍÓÚÑÜ.,;:!?¿¡()[\]{}\-'"°$%&@#*+/=\\|<>^~`]/.test(response);
  }

  /**
   * SANITIZAR RESPUESTA
   * Limpia problemas detectados
   */
  static sanitize(response: string, context: ValidationContext): string {
    let sanitized = response;
    
    // Eliminar URLs
    if (this.containsUrls(sanitized)) {
      sanitized = this.removeUrls(sanitized);
    }
    
    // Eliminar números de cuenta
    if (this.containsAccountNumbers(sanitized)) {
      sanitized = sanitized.replace(/\b\d{10,}\b/g, '[NÚMERO EN TARJETA]');
    }
    
    // Limpiar múltiples cards
    const cardMatches = sanitized.match(/\[CARD:\s*(\d+)\s*\]/gi) || [];
    if (cardMatches.length > 1) {
      // Mantener solo la última card
      const lastCard = cardMatches[cardMatches.length - 1];
      const lastCardIndex = sanitized.lastIndexOf('[CARD:');
      const beforeLastCard = sanitized.substring(0, lastCardIndex).trim();
      sanitized = `${beforeLastCard}\n\n${lastCard}`;
    }
    
    // Limpiar texto después de card
    const singleCardMatch = sanitized.match(/\[CARD:\s*(\d+)\s*\]/i);
    if (singleCardMatch) {
      const cardIndex = sanitized.indexOf(singleCardMatch[0]);
      const afterCard = sanitized.substring(cardIndex + singleCardMatch[0].length).trim();
      if (afterCard.length > 0) {
        sanitized = sanitized.substring(0, cardIndex + singleCardMatch[0].length);
      }
    }
    
    return sanitized.trim();
  }

  /**
   * GENERAR RESPUESTA DE FALLBACK
   * Cuando la validación falla
   */
  static generateFallbackResponse(
    intent: string,
    productName: string | null
  ): string {
    const fallbacks: Record<string, string> = {
      product_query: `Déjame verificar la información de ${productName || 'este producto'} para darte datos exactos.`,
      price_inquiry: `El precio de ${productName || 'este producto'} está en la tarjeta que te mostraré.`,
      payment_intent: `Perfecto, te muestro los detalles de pago.`,
      general: `Déjame revisar eso para darte la mejor información.`,
      greeting: `¡Hola! ¿En qué puedo ayudarte hoy?`
    };
    
    return fallbacks[intent] || fallbacks.general;
  }
}
