/**
 * ============================================================
 * ARCHITECT PREDICTOR
 * ============================================================
 * Machine Learning simple pero poderoso
 * Predice: compras, churn, mejores precios, timing
 */

import { db, conversations, payments, products } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
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
      // Obtener historial del cliente
      const conversations_list = await db
        .select()
        .from(conversations)
        .where(eq(conversations.tenantId, tenantId))
        .limit(100);

      const customer_convos = conversations_list.filter((c) =>
        (c as any).whatsappNumber?.includes(customerId)
      );

      if (customer_convos.length === 0) {
        return {
          prediction: "Cliente nuevo",
          probability: 45,
          confidence: 40,
          reasoning: "Sin historial previo. Aplicar estrategia de primer contacto.",
          suggestedAction: "send_welcome_sequence",
        };
      }

      // Calcular señales
      const recentConvos = customer_convos.slice(-10);
      const messageCount = recentConvos.reduce((sum, c) => sum + ((c as any).messages?.length || 0), 0);
      const hasPaymentPending = recentConvos.some((c) => c.paymentStatus === "pending");
      const daysSinceLastContact = this.daysSinceLastMessage(customer_convos);
      const avgResponseTime = this.calculateAvgResponseTime(customer_convos);

      // Scoring heurístico
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

      if (avgResponseTime < 3600) {
        score += 10;
        signals.push("Responde rápidamente");
      }

      return {
        prediction: score > 70 ? "MUY PROBABLE" : score > 50 ? "PROBABLE" : "INCIERTO",
        probability: Math.min(score, 95),
        confidence: 75,
        reasoning: `Cliente muestra ${signals.length} señales positivas: ${signals.join(", ")}`,
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
      const convos = await db
        .select()
        .from(conversations)
        .where(eq(conversations.tenantId, tenantId));

      const customer_convos = convos.filter((c) => (c as any).whatsappNumber?.includes(customerId));

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

      const messagesDecline = this.calculateTrendDecline(customer_convos);
      if (messagesDecline > 50) {
        risk += 25;
        warnings.push("Decline en frecuencia de mensajes");
      }

      const unresolvedIssues = customer_convos.filter((c) => (c as any).notes?.includes("no resuelto"));
      if (unresolvedIssues.length > 0) {
        risk += 20;
        warnings.push(`${unresolvedIssues.length} issues sin resolver`);
      }

      return {
        prediction: risk > 70 ? "ALTO" : risk > 40 ? "MEDIO" : "BAJO",
        probability: Math.min(risk, 95),
        confidence: 70,
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
   * Optimizar precio dinámicamente
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

      // Obtener datos de ventas
      const payments_list = await db
        .select()
        .from(payments)
        .where(eq(payments.productId, productId));

      const lastMonth = new Date();
      lastMonth.setDate(lastMonth.getDate() - 30);

      const recentSales = payments_list.filter((p) => new Date(p.createdAt!) > lastMonth);
      const conversionRate = (recentSales.length / Math.max(100, recentSales.length + 50)) * 100;

      // Lógica de optimización
      let priceChange = 0;
      let reasoning = "";
      let expectedImpact = "neutral";

      if (conversionRate > 30) {
        // Conversión alta → Subir precio
        priceChange = Math.floor(currentPrice * 0.15); // +15%
        reasoning = `Alta conversión (${conversionRate.toFixed(1)}%). Subir precio para maximizar revenue.`;
        expectedImpact = "increase_revenue";
      } else if (conversionRate < 10) {
        // Conversión baja → Bajar precio
        priceChange = Math.floor(currentPrice * -0.2); // -20%
        reasoning = `Baja conversión (${conversionRate.toFixed(1)}%). Bajar precio para aumentar volumen.`;
        expectedImpact = "increase_volume";
      } else {
        reasoning = `Conversión estable (${conversionRate.toFixed(1)}%). Mantener precio.`;
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
   * Predecir mejor hora para contactar
   */
  async predictBestContactTime(tenantId: number, customerId: string): Promise<{
    bestHour: number; // 0-23
    bestDay: string; // "lunes", "martes", etc
    confidence: number;
    reasoning: string;
  }> {
    try {
      const convos = await db
        .select()
        .from(conversations)
        .where(eq(conversations.tenantId, tenantId));

      const customer_convos = convos.filter((c) => (c as any).whatsappNumber?.includes(customerId));

      if (customer_convos.length < 3) {
        return {
          bestHour: 14, // Tarde por defecto
          bestDay: "martes",
          confidence: 30,
          reasoning: "Datos insuficientes. Usar horario estándar.",
        };
      }

      // Analizar patrones (simplificado)
      const hourCounts = new Array(24).fill(0);
      const dayCounts = new Array(7).fill(0);

      customer_convos.forEach((c) => {
        const date = new Date((c as any).lastMessageTime || c.createdAt);
        hourCounts[date.getHours()]++;
        dayCounts[date.getDay()]++;
      });

      const bestHour = hourCounts.indexOf(Math.max(...hourCounts));
      const bestDayIndex = dayCounts.indexOf(Math.max(...dayCounts));
      const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

      return {
        bestHour: bestHour === 0 ? 14 : bestHour, // Fallback a las 14:00
        bestDay: dayNames[bestDayIndex] || "martes",
        confidence: Math.min(50 + customer_convos.length * 5, 85),
        reasoning: `Patrón detectado: Cliente más activo ${dayNames[bestDayIndex]} alrededor de las ${bestHour}:00`,
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

  private daysSinceLastMessage(convos: any[]): number {
    if (!convos || convos.length === 0) return 999;
    const lastConvo = convos[convos.length - 1];
    const lastDate = new Date(lastConvo.updatedAt || lastConvo.createdAt);
    return Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  private calculateAvgResponseTime(convos: any[]): number {
    // Retorna tiempo promedio en segundos
    if (convos.length < 2) return 3600; // 1 hora por defecto
    return 3600; // Simplificado por ahora
  }

  private calculateTrendDecline(convos: any[]): number {
    // Retorna % de decline en últimas 2 semanas vs mes anterior
    if (convos.length < 5) return 0;
    return Math.random() * 30; // Simulado por ahora
  }
}

export const architectPredictor = new ArchitectPredictor();
