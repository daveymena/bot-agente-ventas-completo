/**
 * ============================================================
 * CARD MEMORY MANAGER - Gestor de Memoria de Tarjetas
 * ============================================================
 * 
 * Evita reenviar CARDS ya mostradas.
 * Explica la información cuando el cliente pregunta de nuevo.
 * Desambigua productos similares.
 * 
 * REGLAS CRÍTICAS:
 * 1. NUNCA reenviar una CARD ya enviada
 * 2. SIEMPRE explicar la información cuando pregunten de nuevo
 * 3. Manejar productos similares con inteligencia
 */

import { db, products, messages } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CardHistory {
  productId: number;
  productName: string;
  sentAt: Date;
  wasExplained: boolean;
  explanationCount: number;
}

export type CardAction = 
  | 'send_card'             // Primera vez: enviar CARD
  | 'explain_info'          // Ya se envió: explicar información
  | 'show_alternatives'     // Cliente quiere otra opción
  | 'no_action'             // No hay historial o no aplica
  | 'explain_instead_of_resend' // Ya se envió la CARD, explicar sin reenviar
  | 'brief_info_and_ask';   // Ya se explicó antes, dar info breve y preguntar

export type QuestionType = 
  | 'price'            // Pregunta por precio
  | 'content'          // Pregunta por contenido
  | 'delivery'         // Pregunta por entrega
  | 'general';         // Pregunta general

// ─── Gestor de Memoria de CARDS ──────────────────────────────────────────────

export class CardMemoryManager {

  /**
   * VERIFICAR MEMORIA DE CARDS - MÉTODO PRINCIPAL
   * 
   * Cuando el cliente pregunta por un producto, verifica si ya se enviö la CARD.
   * Si ya se enviö, NO re-enviö la card sino que da la información en texto.
   */
  static async checkCardMemory(
    conversationId: number,
    customerMessage: string,
    memory: any
  ): Promise<{ action: CardAction; questionType: QuestionType; duplicateCards: any[]; explanation?: string }> {
    
    try {
      const history = await this.getCardHistory(conversationId);
      
      if (history.length === 0) {
        return { action: 'no_action', questionType: 'general', duplicateCards: [] };
      }
      
      const lowerMessage = customerMessage.toLowerCase();
      
      // Buscar si el cliente estÄ hablando de un producto que ya vio
      for (const card of history) {
        const productName = (card.productName || '').toLowerCase();
        const productWords = productName.split(' ').filter(w => w.length > 3);
        
        // Verificar si menciona el producto
        const mentionsProduct = productWords.some(word => lowerMessage.includes(word)) ||
                                lowerMessage.includes(productName);
        
        if (mentionsProduct) {
          const questionType = this.analyzeQuestionType(lowerMessage);
          
          // Si es la primera vez que pregunta por este producto despuÄs de ver la card
          if (!card.wasExplained || card.explanationCount === 0) {
            const explanation = this.generateCardExplanation(
              { name: card.productName, price: 0, currency: 'COP', features: [], description: '' },
              questionType
            );
            
            return {
              action: 'explain_instead_of_resend',
              questionType,
              duplicateCards: [card],
              explanation
            };
          }
          
          // Si ya explicÄ antes, dar info breve y preguntar si necesita algo especÌfico
          return {
            action: 'brief_info_and_ask',
            questionType,
            duplicateCards: [card],
            explanation: `Sobre *${card.productName}*: ${this.getBriefInfo(questionType)}`
          };
        }
      }
      
      return { action: 'no_action', questionType: 'general', duplicateCards: [] };
      
    } catch (error) {
      logger.error({ error, conversationId }, "[CardMemory] Error verificando memoria");
      return { action: 'no_action', questionType: 'general', duplicateCards: [] };
    }
  }

  /**
   * ANALIZAR TIPO DE PREGUNTA
   */
  private static analyzeQuestionType(message: string): QuestionType {
    const lower = message.toLowerCase();
    
    if (lower.match(/precio|costo|cuánto|cuanto|vale|pagar|comprar/)) {
      return 'price';
    }
    if (lower.match(/incluye|contiene|qué tiene|que tiene|contenido|módulos|clases/)) {
      return 'content';
    }
    if (lower.match(/entrega|envío|envio|recibir|google drive|cuándo|cuando/)) {
      return 'delivery';
    }
    return 'general';
  }

  /**
   * OBTENER INFO BREVE SEGUN TIPO DE PREGUNTA
   */
  private static getBriefInfo(questionType: QuestionType): string {
    switch (questionType) {
      case 'price':
        return 'El precio ya lo tienes en la información que te mostré. ¿Te gustaría proceder con la compra?';
      case 'content':
        return 'Ya te compartí los detalles del contenido. ¿Hay algo específico que quieras saber?';
      case 'delivery':
        return 'La entrega es por Google Drive, inmediata después del pago. ¿Quieres que te ayude con el proceso?';
      default:
        return '¿Qué necesitas saber específicamente? Estoy aquí para ayudarte.';
    }
  }
  
  /**
   * VERIFICAR SI YA SE ENVIÓ LA CARD
   */
  static async wasCardSent(
    conversationId: number,
    productId: number
  ): Promise<boolean> {
    const history = await this.getCardHistory(conversationId);
    return history.some(h => h.productId === productId);
  }

  /**
   * OBTENER HISTORIAL DE CARDS ENVIADAS
   */
  static async getCardHistory(conversationId: number): Promise<CardHistory[]> {
    try {
      const historyMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(50);
    
      const cardHistory: CardHistory[] = [];
    
      for (const msg of historyMessages) {
        if (msg.role === 'assistant' || msg.role === 'agent') {
          const cardMatch = msg.content.match(/\[CARD:\s*(\d+)\s*\]/i);
          if (cardMatch) {
            const productId = parseInt(cardMatch[1]);
            const existing = cardHistory.find(h => h.productId === productId);
          
            if (!existing) {
              cardHistory.push({
                productId,
                productName: await this.getProductName(productId),
                sentAt: new Date(msg.createdAt),
                wasExplained: this.wasExplanationProvided(msg.content),
                explanationCount: 0
              });
            }
          }
        }
      }
    
      return cardHistory;
    } catch (error) {
      logger.error({ error, conversationId }, "[CardMemory] Error obteniendo historial");
      return [];
    }
  }

  /**
   * DETERMINAR QUÉ HACER CUANDO EL CLIENTE PREGUNTA POR UN PRODUCTO
   * 
   * Lógica:
   * - Si NO se envió la CARD → enviar CARD
   * - Si YA se envió → explicar información (NO reenviar CARD)
   * - Si pide otra opción → mostrar alternativas
   */
  static async determineAction(
    conversationId: number,
    productId: number,
    customerMessage: string
  ): Promise<CardAction> {
    
    const wasSent = await this.wasCardSent(conversationId, productId);
    
    if (!wasSent) {
      // Primera vez: enviar CARD
      logger.info({ conversationId, productId }, "[CardMemory] Primera vez - enviar CARD");
      return 'send_card';
    }
    
    // Ya se fue: analizar qué quiere el cliente
    const lowerMessage = customerMessage.toLowerCase();
    
    // Detectar tipo de pregunta
    if (/(precio|cuánto|vale|cuesta|costo)/i.test(lowerMessage)) {
      logger.info({ conversationId, productId }, "[CardMemory] Pregunta por precio - explicar");
      return 'explain_info';
    }
    
    if (/(incluye|contiene|tiene|qué tiene|qué incluye)/i.test(lowerMessage)) {
      logger.info({ conversationId, productId }, "[CardMemory] Pregunta por contenido - explicar");
      return 'explain_info';
    }
    
    if (/(entrega|cómo lo|cuándo|garantía|acceso|drive)/i.test(lowerMessage)) {
      logger.info({ conversationId, productId }, "[CardMemory] Pregunta por entrega - explicar");
      return 'explain_info';
    }
    
    if (/(otro|diferente|alternativa|no ese|otra opción| algo más)/i.test(lowerMessage)) {
      logger.info({ conversationId, productId }, "[CardMemory] Pide alternativa - mostrar opciones");
      return 'show_alternatives';
    }
    
    // Por defecto: explicar información
    logger.info({ conversationId, productId }, "[CardMemory] Pregunta general - explicar");
    return 'explain_info';
  }

  /**
   * GENERAR EXPLICACIÓN DE LA CARD
   * Cuando el cliente pregunta de nuevo, explicar cada parte
   */
  static generateCardExplanation(
    product: any,
    questionType: QuestionType
  ): string {
    
    const productName = product.name || 'Producto';
    const price = product.price || 0;
    const currency = product.currency || 'COP';
    const features = product.features || [];
    const description = product.description || '';
    
    const explanations: Record<QuestionType, string> = {
      price: `Claro, te doy los datos del *${productName}*:

💰 Precio: *$${price} ${currency}*
💳 Pago único, sin mensualidades
📱 Métodos: Nequi, Daviplata, Tarjeta, PayPal

¿Te gustaría avanzar con la compra?`,

      content: `El *${productName}* incluye:

📚 ${features.length > 0 ? features.join(' • ') : 'Videos HD + PDFs descargables'}
🎧 Formato: Digital (Google Drive)
⏰ Acceso: De por vida
💬 Soporte directo por WhatsApp

¿Qué te gustaría saber más?`,

      delivery: `La entrega del *${productName}* es así:

📦 Se envía por Google Drive (100% digital)
⚡ Inmediato después del pago
📱 Lo ves desde cualquier celular o computadora
🔄 Disponible 24/7

Cuando pagues, recibes el link aquí mismo 🚀`,

      general: `Aquí tienes la info del *${productName}*:

💰 Precio: *$${price} ${currency}*
📦 Entrega: Google Drive (inmediato)
⏰ Acceso: De por vida
🛡️ Garantía: 7 días

¿Qué necesitas saber específicamente?`
    };
    
    return explanations[questionType];
  }

  /**
   * GENERAR ALTERNATIVAS CUANDO EL CLIENTE QUIERE OTRO PRODUCTO
   */
  static generateAlternatives(
    currentProduct: any,
    similarProducts: any[],
    customerPreferences: string[]
  ): string {
    
    const currentName = currentProduct?.name || 'este producto';
    
    if (!similarProducts || similarProducts.length === 0) {
      return `
No encontré otras opciones similares a *${currentName}* en este momento.

¿Te gustaría ver nuestro catálogo completo o buscar algo específico?
      `;
    }

    const alternatives = similarProducts
      .slice(0, 4)
      .map((p: any) => {
        const features = p.features || [];
        const featureStr = features.length > 0 ? ` (${features[0]})` : '';
        return `• *${p.name}* — $${p.price} ${p.currency || 'COP'}${featureStr}`;
      })
      .join('\n');

    return `
También tenemos estas opciones que podrían interesarte:

${alternatives}

¿Alguna de estas te llama la atención?
    `;
  }

  /**
   * OBTENER PRODUCTOS SIMILARES
   */
  static async findSimilarProducts(
    productName: string,
    excludeId: number
  ): Promise<any[]> {
    try {
      // Normalizar nombre para búsqueda
      const searchTerms = productName
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w: string) => w.length > 3);
      
      if (searchTerms.length === 0) return [];
      
      // Buscar productos con nombres similares
      const allProducts = await db
        .select()
        .from(products)
        .where(eq(products.isActive, true))
        .limit(100);
      
      // Filtrar productos similares
      const similar = allProducts.filter((p: any) => {
        if (p.id === excludeId) return false;
        
        const pName = (p.name || '').toLowerCase();
        
        // Coincidencia por palabras clave
        const matchCount = searchTerms.filter(term => 
          pName.includes(term)
        ).length;
        
        return matchCount >= Math.ceil(searchTerms.length * 0.5);
      });
      
      // Ordenar por relevancia
      similar.sort((a: any, b: any) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        const aMatches = searchTerms.filter(t => aName.includes(t)).length;
        const bMatches = searchTerms.filter(t => bName.includes(t)).length;
        return bMatches - aMatches;
      });
      
      return similar.slice(0, 4);
    } catch (error) {
      logger.error({ error, productName }, "[CardMemory] Error buscando productos similares");
      return [];
    }
  }

  /**
   * VERIFICAR SI SE PROPORCIONÓ EXPLICACIÓN
   */
  private static wasExplanationProvided(content: string): boolean {
    const explanationIndicators = [
      /precio/i,
      /incluye/i,
      /entrega/i,
      /garantía/i,
      /acceso/i,
      /google drive/i
    ];
    
    return explanationIndicators.some(pattern => pattern.test(content));
  }

  /**
   * OBTENER NOMBRE DEL PRODUCTO
   */
  private static async getProductName(productId: number): Promise<string> {
    try {
      const [product] = await db
        .select({ name: products.name })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      
      return product?.name || 'Producto desconocido';
    } catch {
      return 'Producto desconocido';
    }
  }

  /**
   * FORMATEAR EXPLICACIÓN PARA WHATSAPP
   * Asegura que sea legible y profesional
   */
  static formatForWhatsApp(explanation: string): string {
    return explanation
      .replace(/\n{3,}/g, '\n\n') // Eliminar líneas vacías múltiples
      .trim();
  }

  /**
   * GENERAR MENSAJE CUANDO EL PRODUCTO NO EXISTE
   */
  static generateProductNotFound(searchTerm: string): string {
    return `
No encontré un producto llamado "*${searchTerm}*" en nuestro catálogo.

¿Te gustaría que te muestre lo que tenemos disponible?

O si buscas algo específico, descríbeme qué necesitas y te ayudo a encontrarlo. 🎯
    `;
  }

  /**
   * GENERAR MENSAJE DE SELECCIÓN DE PRODUCTO
   * Cuando hay múltiples opciones similares
   */
  static generateProductSelection(
    searchTerm: string,
    options: any[]
  ): string {
    if (options.length === 0) {
      return this.generateProductNotFound(searchTerm);
    }

    const optionsList = options
      .map((p: any, i: number) => {
        const features = p.features || [];
        const featureStr = features.length > 0 ? ` - ${features.slice(0, 2).join(', ')}` : '';
        return `${i + 1}. *${p.name}* — $${p.price} ${p.currency || 'COP'}${featureStr}`;
      })
      .join('\n');

    return `
Encontré varias opciones para "*${searchTerm}*":

${optionsList}

¿Cuál te interesa más? Solo dime el número o el nombre. 🎯
    `;
  }
}
