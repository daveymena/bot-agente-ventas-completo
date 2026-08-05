/**
 * ARCHITECT PREDICTOR
 * Heurísticas sobre datos reales de conversaciones, mensajes y pagos.
 * Predice: compras, churn, mejores precios, timing.
 */

import { db, conversations, messages, payments, products } from "@workspace/db";
import { eq, and, like, inArray, gte } from "drizzle-orm";
import { logger } from "./logger";

export interface PredictionResult {
  prediction: string;
  probability: number; // 0-100
  confidence: number; // 0-100
  reasoning: string;
  suggestedAction: string;
}

export class ArchitectPredictor {
  /**
   * Predecir probabilidad de compra en próximos 7 días
   */
  async predictNextPurchase(tenantId: number, customerId: string): Promise<PredictionResult> {
    try {
      const customer_convos = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.tenantId, tenantId), like(conversations.contactPhone, `%${customerId}%`)));

      if (customer_convos.length === 0) {
        return {
          prediction: "Cliente nuevo",
          probability: 45,
          confidence: 40,
          reasoning: "Sin historial previo. Aplicar estrategia de primer contacto.",
          suggestedAction: "send_welcome_sequence",
        };
      }

      const recentConvos = customer_convos.slice(-10);
      const convoIds = recentConvos.map((c) => c.id);
      const messageCount = await this.countMessages(convoIds);
      const hasPaymentPending = recentConvos.some((c) => c.paymentStatus === "pending");
      const daysSinceLastContact = this.daysSinceLastMessage(customer_convos);
      const avgResponseTime = await this.calculateAvgResponseTime(convoIds);

      let score = 50;
      const signals: string[] = [];

      if (messageCount > 5) {
        score += 15;
        signals.push("Alta frecuencia de mensajes");
      }

      if (hasPaymentPending) {
        score += 25;
        signals.push("Pago pendiente (casi listo)");
      }

      if (daysSinceLastContact < 2) {
        score += 20;
        signals.push("Contacto reciente");
      }

      if (avgResponseTime !== null && avgResponseTime < 3600) {
        score += 10;
        signals.push("Responde rápidamente");
      }

      return {
        prediction: score > 70 ? "MUY PROBABLE" : score > 50 ? "PROBABLE" : "INCIERTO",
        probability: Math.min(score, 95),
        confidence: 75,
        reasoning: signals.length > 0
          ? `Cliente muestra ${signals.length} señales positivas: ${signals.join(", ")}`
          : "Sin señales positivas claras en el historial reciente.",
        suggestedAction: score > 70 ? "push_close" : score > 50 ? "send_offer" : "nurture",
      };
    } catch (error) {
      logger.error({ error }, "Prediction failed");
      return {
        prediction: "Error",
        probability: 0,
        confidence: 0,
        reasoning: "No se pudo calcular",
        suggestedAction: "default",
      };
    }
  }

  /**
   * Predecir riesgo de churn (abandono)
   */
  async predictChurnRisk(tenantId: number, customerId: string): Promise<PredictionResult> {
    try {
      const customer_convos = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.tenantId, tenantId), like(conversations.contactPhone, `%${customerId}%`)));

      if (customer_convos.length === 0) {
        return {
          prediction: "BAJO",
          probability: 10,
          confidence: 50,
          reasoning: "Cliente nuevo, sin riesgo",
          suggestedAction: "onboard",
        };
      }

      let risk = 20;
      const warnings: string[] = [];

      const daysSilent = this.daysSinceLastMessage(customer_convos);
      if (daysSilent > 14) {
        risk += 35;
        warnings.push(`Silencio de ${daysSilent} días`);
      }

      const convoIds = customer_convos.map((c) => c.id);
      const messagesDecline = await this.calculateTrendDecline(convoIds);
      if (messagesDecline !== null && messagesDecline > 50) {
        risk += 25;
        warnings.push(`Decline de ${Math.round(messagesDecline)}% en frecuencia de mensajes`);
      }

      return {
        prediction: risk > 70 ? "ALTO" : risk > 40 ? "MEDIO" : "BAJO",
        probability: Math.min(risk, 95),
        confidence: messagesDecline !== null ? 70 : 55, // menos confianza si no hay suficiente historial para medir tendencia
        reasoning: warnings.length > 0 ? `Advertencias: ${warnings.join(", ")}` : "Cliente estable",
        suggestedAction: risk > 70 ? "urgent_reengagement" : risk > 40 ? "send_check_in" : "maintain",
      };
    } catch (error) {
      logger.error({ error }, "Churn prediction failed");
      return {
        prediction: "DESCONOCIDO",
        probability: 50,
        confidence: 0,
        reasoning: "Error en cálculo",
        suggestedAction: "default",
      };
    }
  }

  /**
   * Optimizar precio dinámicamente en base a ventas reales vs. interés real (mensajes) del producto
   */
  async optimizePrice(productId: number, currentPrice: number): Promise<{
    suggestedPrice: number;
    priceChange: number; // -50 a +50
    reasoning: string;
    expectedImpact: string;
  }> {
    try {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId));

      if (!product) {
        return {
          suggestedPrice: currentPrice,
          priceChange: 0,
          reasoning: "Producto no encontrado",
          expectedImpact: "none",
        };
      }

      const lastMonth = new Date();
      lastMonth.setDate(lastMonth.getDate() - 30);

      const recentSales = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.productId, productId),
            eq(payments.status, "confirmed"),
            gte(payments.createdAt, lastMonth.toISOString())
          )
        );

      // Interés real: mensajes de clientes que mencionan el producto en el mismo periodo.
      const productKeyword = product.name.toLowerCase();
      const recentMessages = await db
        .select({ content: messages.content })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.tenantId, product.tenantId!),
            eq(messages.role, "customer"),
            gte(messages.createdAt, lastMonth.toISOString())
          )
        );
      const interestedInquiries = recentMessages.filter((m) => m.content.toLowerCase().includes(productKeyword)).length;
      const conversionRate = interestedInquiries > 0 ? (recentSales.length / interestedInquiries) * 100 : 0;

      let priceChange = 0;
      let reasoning = "";
      let expectedImpact = "neutral";

      if (interestedInquiries < 5) {
        reasoning = `Solo ${interestedInquiries} consultas reales en 30 días. Datos insuficientes para ajustar precio con confianza.`;
        expectedImpact = "insufficient_data";
      } else if (conversionRate > 30) {
        priceChange = Math.floor(currentPrice * 0.15);
        reasoning = `Alta conversión real (${conversionRate.toFixed(1)}% de ${interestedInquiries} consultas). Subir precio para maximizar revenue.`;
        expectedImpact = "increase_revenue";
      } else if (conversionRate < 10) {
        priceChange = Math.floor(currentPrice * -0.2);
        reasoning = `Baja conversión real (${conversionRate.toFixed(1)}% de ${interestedInquiries} consultas). Bajar precio para aumentar volumen.`;
        expectedImpact = "increase_volume";
      } else {
        reasoning = `Conversión estable (${conversionRate.toFixed(1)}% de ${interestedInquiries} consultas). Mantener precio.`;
        expectedImpact = "stable";
      }

      return {
        suggestedPrice: Math.max(Math.floor(currentPrice + priceChange), 1),
        priceChange,
        reasoning,
        expectedImpact,
      };
    } catch (error) {
      logger.error({ error }, "Price optimization failed");
      return {
        suggestedPrice: currentPrice,
        priceChange: 0,
        reasoning: "Error en optimización",
        expectedImpact: "none",
      };
    }
  }

  /**
   * Predecir mejor hora para contactar, basado en los timestamps reales de los mensajes del cliente.
   */
  async predictBestContactTime(tenantId: number, customerId: string): Promise<{
    bestHour: number; // 0-23
    bestDay: string; // "lunes", "martes", etc
    confidence: number;
    reasoning: string;
  }> {
    try {
      const customer_convos = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.tenantId, tenantId), like(conversations.contactPhone, `%${customerId}%`)));

      if (customer_convos.length === 0) {
        return {
          bestHour: 14,
          bestDay: "martes",
          confidence: 30,
          reasoning: "Datos insuficientes. Usar horario estándar.",
        };
      }

      const convoIds = customer_convos.map((c) => c.id);
      const customerMessages = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(and(inArray(messages.conversationId, convoIds), eq(messages.role, "customer")));

      if (customerMessages.length < 3) {
        return {
          bestHour: 14,
          bestDay: "martes",
          confidence: 30,
          reasoning: "Datos insuficientes. Usar horario estándar.",
        };
      }

      const hourCounts = new Array(24).fill(0);
      const dayCounts = new Array(7).fill(0);

      customerMessages.forEach((m) => {
        hourCounts[m.createdAt.getHours()]++;
        dayCounts[m.createdAt.getDay()]++;
      });

      const bestHour = hourCounts.indexOf(Math.max(...hourCounts));
      const bestDayIndex = dayCounts.indexOf(Math.max(...dayCounts));
      const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

      return {
        bestHour,
        bestDay: dayNames[bestDayIndex] || "martes",
        confidence: Math.min(50 + customerMessages.length * 3, 85),
        reasoning: `Patrón detectado sobre ${customerMessages.length} mensajes reales: cliente más activo ${dayNames[bestDayIndex]} alrededor de las ${bestHour}:00`,
      };
    } catch (error) {
      logger.error({ error }, "Best contact time prediction failed");
      return {
        bestHour: 14,
        bestDay: "martes",
        confidence: 0,
        reasoning: "Error en predicción",
      };
    }
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  private daysSinceLastMessage(convos: Array<{ lastMessageAt: Date | null; createdAt: Date }>): number {
    if (!convos || convos.length === 0) return 999;
    const mostRecent = convos.reduce((latest, c) => {
      const t = (c.lastMessageAt || c.createdAt).getTime();
      return t > latest ? t : latest;
    }, 0);
    return Math.floor((Date.now() - mostRecent) / (1000 * 60 * 60 * 24));
  }

  private async countMessages(conversationIds: number[]): Promise<number> {
    if (conversationIds.length === 0) return 0;
    const rows = await db.select({ id: messages.id }).from(messages).where(inArray(messages.conversationId, conversationIds));
    return rows.length;
  }

  /**
   * Tiempo promedio real (segundos) entre un mensaje de cliente y la siguiente respuesta del asistente.
   * Retorna null si no hay suficientes pares para medir.
   */
  private async calculateAvgResponseTime(conversationIds: number[]): Promise<number | null> {
    if (conversationIds.length === 0) return null;
    const rows = await db
      .select({ conversationId: messages.conversationId, role: messages.role, createdAt: messages.createdAt })
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .orderBy(messages.conversationId, messages.createdAt);

    const diffsSeconds: number[] = [];
    let pendingAt: Date | null = null;
    let pendingConvo: number | null = null;
    for (const row of rows) {
      if (row.conversationId !== pendingConvo) {
        pendingAt = null;
        pendingConvo = row.conversationId;
      }
      if (row.role === "customer") {
        pendingAt = row.createdAt;
      } else if (row.role === "assistant" && pendingAt) {
        const diff = (row.createdAt.getTime() - pendingAt.getTime()) / 1000;
        if (diff > 0 && diff < 30 * 60) diffsSeconds.push(diff);
        pendingAt = null;
      }
    }
    if (diffsSeconds.length === 0) return null;
    return diffsSeconds.reduce((a, b) => a + b, 0) / diffsSeconds.length;
  }

  /**
   * % de decline real en volumen de mensajes: últimos 14 días vs. los 14-30 días anteriores.
   * Retorna null si no hay suficiente historial (menos de 30 días de datos) para comparar con confianza.
   */
  private async calculateTrendDecline(conversationIds: number[]): Promise<number | null> {
    if (conversationIds.length === 0) return null;
    const now = new Date();
    const day14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(and(inArray(messages.conversationId, conversationIds), gte(messages.createdAt, day30.toISOString())));

    if (rows.length < 5) return null; // no hay suficiente historial para una tendencia confiable

    const recentCount = rows.filter((r) => r.createdAt >= day14).length;
    const priorCount = rows.filter((r) => r.createdAt < day14).length;

    if (priorCount === 0) return null;
    const decline = ((priorCount - recentCount) / priorCount) * 100;
    return Math.max(0, decline);
  }
}

export const architectPredictor = new ArchitectPredictor();
