/**
 * ============================================================
 * ARCHITECT OPTIMIZER
 * ============================================================
 * Optimización basada en datos reales del producto y su desempeño.
 * - Precios dinámicos (delega en architectPredictor.optimizePrice, que usa
 *   pagos e interés real por producto)
 * - Copy basado en atributos reales del producto (nunca inventa garantías,
 *   soporte o beneficios que el producto no declara)
 * - A/B testing elegido por señal real disponible, no al azar
 * - Checkout/timing: recomendaciones de buenas prácticas de la industria,
 *   marcadas explícitamente como estimaciones generales, no medición propia
 */

import { db, products, payments, messages, conversations } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { logger } from "./logger";
import { architectPredictor } from "./architect-predictor";

export interface OptimizationResult {
  optimizationType: string;
  currentValue: any;
  optimizedValue: any;
  expectedImprovement: string;
  confidence: number;
  implementation: string;
}

export class ArchitectOptimizer {
  /**
   * Optimizar precios: delega en architectPredictor.optimizePrice, que basa
   * la decisión en pagos confirmados reales vs. interés real (mensajes) del
   * producto -- no en un indicador de demanda aleatorio.
   */
  async optimizePricing(productId: number): Promise<OptimizationResult> {
    try {
      const [product] = await db.select().from(products).where(eq(products.id, productId));
      if (!product) throw new Error("Producto no encontrado");

      const currentPrice = Number(product.price);
      const result = await architectPredictor.optimizePrice(productId, currentPrice);

      return {
        optimizationType: "dynamic_pricing",
        currentValue: `$${currentPrice}`,
        optimizedValue: `$${result.suggestedPrice}`,
        expectedImprovement: result.expectedImpact === "insufficient_data" ? "Sin cambio -- datos insuficientes" : result.reasoning,
        confidence: result.expectedImpact === "insufficient_data" ? 30 : 65,
        implementation: `UPDATE products SET price = ${result.suggestedPrice} WHERE id = ${productId}`,
      };
    } catch (error) {
      logger.error({ error, productId }, "Pricing optimization failed");
      throw error;
    }
  }

  /**
   * Optimizar copy del producto usando solo atributos reales (features,
   * highlight, description) -- nunca afirma garantías o beneficios que el
   * producto no tiene declarados en su ficha.
   */
  async optimizeCopy(productId: number): Promise<OptimizationResult> {
    try {
      const [product] = await db.select().from(products).where(eq(products.id, productId));
      if (!product) throw new Error("Producto no encontrado");

      const currentDescription = product.description || "";
      const realFeatures = (product.features || []).filter(Boolean);

      if (realFeatures.length === 0 && !product.highlight) {
        return {
          optimizationType: "copy_optimization",
          currentValue: currentDescription.substring(0, 50) + "...",
          optimizedValue: currentDescription,
          expectedImprovement: "Sin cambio -- el producto no tiene features ni highlight cargados para construir copy verídico. Completa esos campos primero.",
          confidence: 20,
          implementation: "Agregar 'features' y/o 'highlight' reales al producto antes de generar copy optimizado.",
        };
      }

      const lines = [`🎯 **${product.name}**`, ``, currentDescription];
      if (product.highlight) {
        lines.push(``, `✨ ${product.highlight}`);
      }
      if (realFeatures.length > 0) {
        lines.push(``, `**Incluye:**`);
        realFeatures.forEach((f: any) => lines.push(`✅ ${f}`));
      }
      const optimizedCopy = lines.join("\n");

      return {
        optimizationType: "copy_optimization",
        currentValue: currentDescription.substring(0, 50) + "...",
        optimizedValue: optimizedCopy.substring(0, 200) + (optimizedCopy.length > 200 ? "..." : ""),
        expectedImprovement: "Copy reestructurado con jerarquía visual, usando solo atributos reales del producto (sin afirmaciones no verificadas)",
        confidence: 60,
        implementation: "Reemplazar descripción actual con la versión reestructurada arriba.",
      };
    } catch (error) {
      logger.error({ error, productId }, "Copy optimization failed");
      throw error;
    }
  }

  /**
   * Diseñar A/B test: elige el tipo de test según qué señal real hay
   * disponible, no al azar.
   */
  async designABTest(productId: number): Promise<{
    testName: string;
    variants: { name: string; change: string; expectedLift: string }[];
    duration: string;
    sampleSize: number;
    successCriteria: string;
  }> {
    try {
      const [product] = await db.select().from(products).where(eq(products.id, productId));
      if (!product) throw new Error("Producto no encontrado");

      const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentInquiries = await db
        .select({ id: messages.id })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(eq(conversations.tenantId, product.tenantId!), eq(messages.role, "customer"), gte(messages.createdAt, last30d.toISOString())));

      const price = Number(product.price);
      const pricingTest = {
        testName: "Pricing A/B",
        variants: [
          { name: "Control (actual)", change: `Precio actual: $${price}`, expectedLift: "Baseline" },
          { name: "Variant A", change: `Precio +15%: $${Math.ceil(price * 1.15)}`, expectedLift: "Estimación general de la industria, no medida en esta cuenta" },
          { name: "Variant B", change: `Precio -15%: $${Math.floor(price * 0.85)}`, expectedLift: "Estimación general de la industria, no medida en esta cuenta" },
        ],
        duration: "7 días",
        sampleSize: 300,
        successCriteria: "Variant con mayor revenue/conversión real medida",
      };

      const copyTest = {
        testName: "Copy A/B",
        variants: [
          { name: "Control", change: "Copy actual", expectedLift: "Baseline" },
          { name: "Benefits-focused", change: "Énfasis en features reales del producto", expectedLift: "Estimación general de la industria, no medida en esta cuenta" },
          { name: "Urgency-focused", change: "Urgencia/escasez sobre disponibilidad real", expectedLift: "Estimación general de la industria, no medida en esta cuenta" },
        ],
        duration: "7 días",
        sampleSize: 300,
        successCriteria: "Mayor conversión rate real medida",
      };

      // Con pocas consultas reales, un test de precio necesita más tráfico del que hay;
      // priorizar copy (más barato de validar con volumen bajo).
      const hasEnoughVolumeForPricingTest = recentInquiries.length >= 30;
      return hasEnoughVolumeForPricingTest ? pricingTest : copyTest;
    } catch (error) {
      logger.error({ error, productId }, "A/B test design failed");
      throw error;
    }
  }

  /**
   * Recomendaciones generales de checkout -- buenas prácticas de la industria,
   * no una medición de esta cuenta específica.
   */
  async optimizeCheckoutFlow(): Promise<OptimizationResult> {
    return {
      optimizationType: "checkout_flow",
      currentValue: "Depende del flujo actual configurado",
      optimizedValue: "1-2 pasos (info + pago automático)",
      expectedImprovement: "Buena práctica general de e-commerce (reducir pasos suele bajar abandono); no es una medición de esta cuenta",
      confidence: 40,
      implementation: `
        1. Reducir campos obligatorios (máx 5)
        2. Auto-llenar datos cuando sea posible
        3. Mostrar progreso visual
        4. Guardar datos para próximas compras
        5. Permitir guest checkout
        6. Mostrar garantía/seguridad prominentemente (solo si el producto realmente la ofrece)
      `,
    };
  }

  /**
   * Recomendación de timing: usa el predictor real de mejor horario por
   * cliente cuando hay un customerId; si no, da guía general.
   */
  async optimizeContactTiming(customerId?: string, tenantId?: number): Promise<OptimizationResult> {
    if (customerId && tenantId) {
      const prediction = await architectPredictor.predictBestContactTime(tenantId, customerId);
      return {
        optimizationType: "contact_timing",
        currentValue: "Contacto inmediato sin estrategia",
        optimizedValue: `Contactar ${prediction.bestDay} alrededor de las ${prediction.bestHour}:00`,
        expectedImprovement: prediction.reasoning,
        confidence: prediction.confidence,
        implementation: "Programar el próximo mensaje de seguimiento en el horario detectado arriba.",
      };
    }
    return {
      optimizationType: "contact_timing",
      currentValue: "Contacto inmediato sin estrategia",
      optimizedValue: "Contacto basado en patrones reales del cliente (requiere customerId)",
      expectedImprovement: "Sin customerId no se puede calcular un horario real -- llamar con customerId para una recomendación basada en datos",
      confidence: 20,
      implementation: "Pasar customerId + tenantId para obtener el horario real detectado por architectPredictor.predictBestContactTime.",
    };
  }

  /**
   * Optimización completa de producto
   */
  async fullProductOptimization(productId: number): Promise<{
    optimizations: OptimizationResult[];
    prioritizedActions: string[];
    expectedTotalImprovement: string;
  }> {
    try {
      const pricing = await this.optimizePricing(productId);
      const copy = await this.optimizeCopy(productId);
      const checkout = await this.optimizeCheckoutFlow();
      const timing = await this.optimizeContactTiming();

      const optimizations = [pricing, copy, checkout, timing];
      const prioritized = [...optimizations].sort((a, b) => b.confidence - a.confidence);

      return {
        optimizations,
        prioritizedActions: prioritized.map((o, i) => `${i + 1}. [confianza ${o.confidence}%] ${o.optimizationType}: ${o.expectedImprovement}`),
        expectedTotalImprovement: "No se combina en un único % -- cada optimización arriba tiene su propia confianza real; revisa cada una antes de aplicar.",
      };
    } catch (error) {
      logger.error({ error, productId }, "Full optimization failed");
      throw error;
    }
  }

  /**
   * Monitorear y auto-ajustar según métricas reales pasadas por el llamador.
   */
  async autoAdjustBasedOnMetrics(
    productId: number,
    metrics: {
      conversionRate: number;
      avgOrderValue: number;
      bounceRate: number;
      timeOnPage: number;
    }
  ): Promise<{
    adjustments: string[];
    confidence: number;
    estimatedImpact: string;
  }> {
    const adjustments: string[] = [];
    let confidence = 70;

    if (metrics.conversionRate < 2) {
      adjustments.push("🔴 CRÍTICO: Conversión < 2%. Rediseñar checkout y copy.");
      confidence = 85;
    } else if (metrics.conversionRate < 5) {
      adjustments.push("🟡 IMPORTANTE: Conversión 2-5%. A/B test de copy y pricing.");
    }

    if (metrics.bounceRate > 60) {
      adjustments.push("🔴 CRÍTICO: Bounce rate > 60%. Mejorar first impression y value prop.");
      confidence = 80;
    }

    if (metrics.timeOnPage < 30) {
      adjustments.push("🟡 Engagement bajo. Agregar más contenido convincente y social proof.");
    }

    return {
      adjustments: adjustments.length > 0 ? adjustments : ["✅ Métricas saludables"],
      confidence,
      estimatedImpact: "Impacto estimado según benchmarks generales de la industria, no una predicción medida para esta cuenta específica.",
    };
  }
}

export const architectOptimizer = new ArchitectOptimizer();
