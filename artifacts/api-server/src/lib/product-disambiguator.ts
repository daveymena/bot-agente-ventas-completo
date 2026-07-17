/**
 * ============================================================
 * PRODUCT DISAMBIGUATOR - Desambiguador de Productos Similares
 * ============================================================
 * 
 * Maneja productos con el mismo nombre pero diferentes.
 * Ej: "Curso de Diseño Gráfico" puede tener 3 versiones diferentes.
 * 
 * CARACTERÍSTICAS:
 * 1. Detecta productos similares automáticamente
 * 2. Analiza contexto del cliente para elegir el mejor
 * 3. Genera preguntas de clarificación inteligentes
 * 4. Sugiere alternativas relevantes
 */

import { db, products, productCategories } from "@workspace/db";
import { eq, and, like } from "drizzle-orm";
import { logger } from "./logger";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ProductVariant {
  id: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  features: string[];
  level: 'beginner' | 'intermediate' | 'advanced';
  duration: string;
  targetAudience: string;
  category: string;
}

export interface DisambiguationResult {
  shouldAskClarification: boolean;
  clarificationQuestion?: string;
  bestMatch?: ProductVariant;
  alternatives: ProductVariant[];
  confidence: number;
}

export interface CustomerContext {
  level?: 'beginner' | 'intermediate' | 'advanced';
  goal?: 'career' | 'business' | 'personal' | 'hobby';
  budget?: 'low' | 'medium' | 'high';
  timeframe?: 'immediate' | 'short' | 'long';
}

// ─── Desambiguador de Productos ──────────────────────────────────────────────

export class ProductDisambiguator {
  
  /**
   * ENCONTRAR PRODUCTOS SIMILARES
   * Busca productos con el mismo nombre o similar
   */
  static async findSimilarProducts(
    searchTerm: string,
    categoryMap: Map<number, string>
  ): Promise<ProductVariant[]> {
    try {
      // Normalizar término de búsqueda
      const normalized = this.normalizeText(searchTerm);
      const searchWords = normalized.split(/\s+/).filter(w => w.length > 3);
      
      if (searchWords.length === 0) return [];
      
      // Obtener todos los productos activos
      const allProducts = await db
        .select()
        .from(products)
        .where(eq(products.isActive, true))
        .limit(200);
      
      // Filtrar productos similares
      const similar = allProducts.filter((p: any) => {
        const pNormalized = this.normalizeText(p.name || '');
        const pDesc = this.normalizeText(p.description || '');
        const combined = `${pNormalized} ${pDesc}`;
        
        // Coincidencia por palabras clave
        const matchCount = searchWords.filter(word => 
          combined.includes(word)
        ).length;
        
        // Requiere al menos 1 palabra clave coincidente
        return matchCount >= 1;
      });
      
      // Convertir a variantes y ordenar por relevancia
      const variants = similar.map((p: any) => this.mapToVariant(p, categoryMap));
      
      // Ordenar por relevancia
      variants.sort((a: any, b: any) => {
        const aName = this.normalizeText(a.name);
        const bName = this.normalizeText(b.name);
        const aMatches = searchWords.filter(w => aName.includes(w)).length;
        const bMatches = searchWords.filter(w => bName.includes(w)).length;
        return bMatches - aMatches;
      });
      
      logger.info({ 
        searchTerm, 
        resultsCount: variants.length 
      }, "[Disambiguator] Productos similares encontrados");
      
      return variants.slice(0, 6);
    } catch (error) {
      logger.error({ error, searchTerm }, "[Disambiguator] Error buscando productos similares");
      return [];
    }
  }

  /**
   * DESAMBIGUAR CUANDO HAY MÚLTIPLES OPCIONES
   */
  static async disambiguate(
    customerMessage: string,
    searchResults: ProductVariant[]
  ): Promise<DisambiguationResult> {
    
    // Si solo hay un resultado, ese es el bueno
    if (searchResults.length === 1) {
      return {
        shouldAskClarification: false,
        bestMatch: searchResults[0],
        alternatives: [],
        confidence: 0.9
      };
    }
    
    // Si no hay resultados
    if (searchResults.length === 0) {
      return {
        shouldAskClarification: false,
        alternatives: [],
        confidence: 0
      };
    }
    
    // Analizar contexto del cliente
    const contextAnalysis = this.analyzeCustomerContext(customerMessage);
    
    // Intentar encontrar el mejor match
    const bestMatch = this.findBestMatch(contextAnalysis, searchResults);
    
    if (bestMatch) {
      const alternatives = searchResults.filter(p => p.id !== bestMatch.id);
      return {
        shouldAskClarification: false,
        bestMatch,
        alternatives,
        confidence: 0.7
      };
    }
    
    // Si no se puede determinar, preguntar al cliente
    return {
      shouldAskClarification: true,
      clarificationQuestion: this.generateClarificationQuestion(searchResults),
      alternatives: searchResults,
      confidence: 0.4
    };
  }

  /**
   * ANALIZAR CONTEXTO DEL CLIENTE
   */
  static analyzeCustomerContext(message: string): CustomerContext {
    const lower = message.toLowerCase();
    
    const context: CustomerContext = {};
    
    // Detectar nivel
    if (/(principiante|nuevo|empezar|cero|básico|básica)/i.test(lower)) {
      context.level = 'beginner';
    } else if (/(intermedio|algo|medio)/i.test(lower)) {
      context.level = 'intermediate';
    } else if (/(avanzado|profesional|experto|experta|master)/i.test(lower)) {
      context.level = 'advanced';
    }
    
    // Detectar objetivo
    if (/(trabajo|empleo|carrera|profesional|laboral)/i.test(lower)) {
      context.goal = 'career';
    } else if (/(negocio|emprender|vender|empresa|comercial)/i.test(lower)) {
      context.goal = 'business';
    } else if (/(hobby|pasatiempo|personal|gusto)/i.test(lower)) {
      context.goal = 'personal';
    }
    
    // Detectar presupuesto
    if (/(barato|economico|poco|bajo|accesible)/i.test(lower)) {
      context.budget = 'low';
    } else if (/(medio|regular|normal)/i.test(lower)) {
      context.budget = 'medium';
    } else if (/(premium|mejor|completo|avanzado|profesional)/i.test(lower)) {
      context.budget = 'high';
    }
    
    // Detectar tiempo
    if (/(urgente|rápido|ya|ahora|inmediato)/i.test(lower)) {
      context.timeframe = 'immediate';
    } else if (/(pronto|esta semana|próximamente)/i.test(lower)) {
      context.timeframe = 'short';
    } else if (/(después|luego|cuando pueda|sin prisa)/i.test(lower)) {
      context.timeframe = 'long';
    }
    
    return context;
  }

  /**
   * ENCONTRAR MEJOR MATCH
   */
  private static findBestMatch(
    context: CustomerContext,
    products: ProductVariant[]
  ): ProductVariant | undefined {
    
    // Puntuar cada producto
    const scored = products.map(p => ({
      product: p,
      score: this.calculateProductScore(p, context)
    }));
    
    // Ordenar por puntuación
    scored.sort((a, b) => b.score - a.score);
    
    // Si el mejor tiene al menos 30 puntos, es buen match
    if (scored[0] && scored[0].score >= 30) {
      logger.info({
        productId: scored[0].product.id,
        productName: scored[0].product.name,
        score: scored[0].score
      }, "[Disambiguator] Mejor match encontrado");
      
      return scored[0].product;
    }
    
    return undefined;
  }

  /**
   * CALCULAR PUNTUACIÓN DE PRODUCTO
   */
  private static calculateProductScore(
    product: ProductVariant,
    context: CustomerContext
  ): number {
    let score = 0;
    
    // Puntuar según nivel (30 puntos máximo)
    if (context.level) {
      if (product.level === context.level) {
        score += 30;
      } else if (
        (context.level === 'beginner' && product.level === 'intermediate') ||
        (context.level === 'intermediate' && product.level === 'advanced')
      ) {
        score += 15; // Nivel siguiente es aceptable
      }
    }
    
    // Puntuar según objetivo (25 puntos máximo)
    if (context.goal) {
      const goalMatches: Record<string, string[]> = {
        career: ['estudiantes', 'general', 'profesionales'],
        business: ['emprendedores', 'empresas', 'negocios'],
        personal: ['general', 'hobby', 'entretención']
      };
      
      const matches = goalMatches[context.goal] || [];
      if (matches.some(m => product.targetAudience.toLowerCase().includes(m))) {
        score += 25;
      }
    }
    
    // Puntuar según presupuesto (25 puntos máximo)
    if (context.budget) {
      const price = product.price;
      
      const budgetRanges: Record<string, [number, number]> = {
        low: [0, 30000],
        medium: [30000, 60000],
        high: [60000, Infinity]
      };
      
      const [min, max] = budgetRanges[context.budget] || [0, Infinity];
      if (price >= min && price <= max) {
        score += 25;
      }
    }
    
    // Puntuar según categoría (20 puntos máximo)
    if (context.goal) {
      const categoryKeywords: Record<string, string[]> = {
        career: ['desarrollo', 'programación', 'diseño', 'marketing'],
        business: ['negocios', 'emprendimiento', 'ventas', 'finanzas'],
        personal: ['hobby', 'música', 'idiomas', 'bienestar']
      };
      
      const keywords = categoryKeywords[context.goal] || [];
      if (keywords.some(k => product.category.toLowerCase().includes(k))) {
        score += 20;
      }
    }
    
    return score;
  }

  /**
   * GENERAR PREGUNTA DE CLARIFICACIÓN
   */
  private static generateClarificationQuestion(products: ProductVariant[]): string {
    const levels = [...new Set(products.map(p => p.level))];
    const categories = [...new Set(products.map(p => p.category))];
    
    let question = 'Encontré varias opciones disponibles:\n\n';
    
    products.slice(0, 4).forEach((p, i) => {
      question += `${i + 1}. *${p.name}* — $${p.price} ${p.currency}`;
      question += ` (${this.formatLevel(p.level)})\n`;
    });
    
    if (levels.length > 1) {
      question += '\n¿Qué nivel buscas? ';
      question += levels.map(l => this.formatLevel(l)).join(' o ');
      question += '?';
    }
    
    question += '\n\nO dime qué necesitas específicamente y te ayudo a elegir. 🎯';
    
    return question;
  }

  /**
   * NORMALIZAR TEXTO
   */
  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\sáéíóúñü]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * MAPEAR PRODUCTO A VARIANTE
   */
  private static mapToVariant(
    product: any,
    categoryMap: Map<number, string>
  ): ProductVariant {
    const categoryName = product.categoryId 
      ? (categoryMap.get(product.categoryId) || '')
      : (product.category || '');
    
    return {
      id: product.id,
      name: product.name || '',
      description: product.description || '',
      price: Number(product.price) || 0,
      currency: product.currency || 'COP',
      features: (product.features as string[]) || [],
      level: this.detectLevel(product),
      duration: this.detectDuration(product),
      targetAudience: this.detectTargetAudience(product),
      category: categoryName
    };
  }

  /**
   * DETECTAR NIVEL DEL PRODUCTO
   */
  private static detectLevel(product: any): ProductVariant['level'] {
    const name = (product.name || '').toLowerCase();
    const desc = (product.description || '').toLowerCase();
    const combined = `${name} ${desc}`;
    
    if (/(principiante|básico|intro|desde cero|beginner)/i.test(combined)) {
      return 'beginner';
    }
    if (/(avanzado|profesional|experto|master|advanced)/i.test(combined)) {
      return 'advanced';
    }
    return 'intermediate';
  }

  /**
   * DETECTAR DURACIÓN
   */
  private static detectDuration(product: any): string {
    const desc = (product.description || '').toLowerCase();
    
    const durationMatch = desc.match(/(\d+)\s*(horas?|lecciones?|módulos?|semanas?|meses?)/i);
    if (durationMatch) {
      return durationMatch[0];
    }
    
    return 'No especificado';
  }

  /**
   * DETECTAR PÚBLICO OBJETIVO
   */
  private static detectTargetAudience(product: any): string {
    const name = (product.name || '').toLowerCase();
    const desc = (product.description || '').toLowerCase();
    const combined = `${name} ${desc}`;
    
    if (/(empresa|negocio|b2b|corporativo)/i.test(combined)) return 'Empresas';
    if (/(emprendedor|negocio propio|emprendimiento)/i.test(combined)) return 'Emprendedores';
    if (/(estudiante|aprender|estudiar|formación)/i.test(combined)) return 'Estudiantes';
    if (/(profesional|carrera|laboral|trabajo)/i.test(combined)) return 'Profesionales';
    return 'General';
  }

  /**
   * FORMATEAR NIVEL
   */
  private static formatLevel(level: string): string {
    const levels: Record<string, string> = {
      beginner: 'principiante',
      intermediate: 'intermedio',
      advanced: 'avanzado'
    };
    return levels[level] || level;
  }

  /**
   * GENERAR MENSAJE CUANDO NO HAY RESULTADOS
   */
  static generateNoResultsMessage(searchTerm: string): string {
    return `
No encontré productos que coincidan con "*${searchTerm}*" en nuestro catálogo.

¿Te gustaría que te muestre:
1. Nuestros productos más populares
2. Productos por categoría
3. Buscar algo diferente

O descríbeme qué necesitas y te ayudo a encontrarlo. 🎯
    `;
  }

  /**
   * GENERAR MENSAJE DE ÉXITO
   */
  static generateSuccessMessage(product: ProductVariant): string {
    const featuresList = product.features.length > 0
      ? product.features.slice(0, 3).join(', ')
      : 'Incluye todo lo necesario';
    
    return `
¡Encontré lo que buscas! 🎯

*${product.name}*
💰 $${product.price} ${product.currency}
📚 Nivel: ${this.formatLevel(product.level)}
✨ ${featuresList}

¿Te gustaría ver más detalles o proceder con la compra?
    `;
  }

  /**
   * ANALIZAR Y RECOMENDAR PRODUCTOS
   * Función principal que combina búsqueda y desambiguación
   */
  static async analyzeAndRecommend(
    customerMessage: string,
    categoryMap: Map<number, string>
  ): Promise<{
    shouldShowProduct: boolean;
    product?: ProductVariant;
    message: string;
    alternatives: ProductVariant[];
  }> {
    
    // Buscar productos similares
    const searchResults = await this.findSimilarProducts(customerMessage, categoryMap);
    
    // Desambiguar
    const disambiguation = await this.disambiguate(customerMessage, searchResults);
    
    if (disambiguation.bestMatch) {
      return {
        shouldShowProduct: true,
        product: disambiguation.bestMatch,
        message: this.generateSuccessMessage(disambiguation.bestMatch),
        alternatives: disambiguation.alternatives
      };
    }
    
    if (disambiguation.shouldAskClarification) {
      return {
        shouldShowProduct: false,
        message: disambiguation.clarificationQuestion || '',
        alternatives: disambiguation.alternatives
      };
    }
    
    return {
      shouldShowProduct: false,
      message: this.generateNoResultsMessage(customerMessage),
      alternatives: []
    };
  }
}
