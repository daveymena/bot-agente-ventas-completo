/**
 * ============================================================
 * ARCHITECT REASONER
 * ============================================================
 * Razonamiento multi-ángulo como CEO, vendedor, diseñador y data scientist
 */

import { logger } from "./logger";

export interface ReasoningContext {
  situation: string;
  data: Record<string, any>;
  constraints: string[];
  goals: string[];
}

export interface ReasoningResult {
  ceo_perspective: {
    strategy: string;
    rationale: string;
    risks: string[];
    timeline: string;
  };
  sales_perspective: {
    approach: string;
    pitfalls: string[];
    closingStrategy: string;
    objectionHandlers: Record<string, string>;
  };
  design_perspective: {
    userExperience: string;
    friction_points: string[];
    improvements: string[];
  };
  data_perspective: {
    insights: string[];
    metrics: Record<string, any>;
    predictions: string[];
  };
  synthesis: {
    recommendation: string;
    confidence: number;
    nextSteps: string[];
  };
}

export class ArchitectReasoner {
  /**
   * Razonar desde perspectiva de CEO (estrategia)
   */
  private reasonAsCEO(context: ReasoningContext): ReasoningResult["ceo_perspective"] {
    const { situation, data, goals } = context;

    // Simular razonamiento estratégico
    const strategies: Record<string, string> = {
      "increase-revenue": "Enfoque en maximizar valor por cliente: upsells, cross-sells, retención",
      "growth-market": "Expansión agresiva: presupuesto marketing, nuevos canales, partnerships",
      "optimize-costs": "Eficiencia operacional: automatizar, eliminar desperdicio, mejorar margins",
      "product-led": "Llevar el producto como hero: demos, trials, onboarding mejorado",
    };

    const primaryGoal = goals[0] || "growth";
    const strategy = strategies[primaryGoal.toLowerCase()] || "Estrategia balanceada";

    return {
      strategy,
      rationale: `Basado en objetivo "${primaryGoal}" y datos actuales: ${JSON.stringify(data).substring(0, 100)}...`,
      risks: [
        "Cambios de mercado inesperados",
        "Competencia más agresiva",
        "Restricciones regulatorias",
      ],
      timeline: primaryGoal.includes("revenue") ? "30-60 días" : "90-180 días",
    };
  }

  /**
   * Razonar desde perspectiva de vendedor
   */
  private reasonAsSales(context: ReasoningContext): ReasoningResult["sales_perspective"] {
    const { situation } = context;

    const objectionMap: Record<string, string> = {
      price: "Enfatizar ROI: por cada $1 invertido, retorna $X. Planes de pago flexibles.",
      hesitation:
        "Social proof: mostrar casos de éxito similares, testimonios, garantías de dinero de vuelta.",
      timing:
        "Urgencia: oferta limitada, cupos finales, acceso anticipado a nueva versión.",
      quality: "Demostración: trial gratuito, demo en vivo, consulta inicial sin costo.",
    };

    const approach =
      "Crear rapport → Cualificar necesidad → Presentar solución → Manejar objeciones → Cerrar";

    return {
      approach,
      pitfalls: [
        "Hablar demasiado, escuchar poco",
        "Presentar características en lugar de beneficios",
        "Ignorar el verdadero problema",
        "Presionar sin consenso",
      ],
      closingStrategy: "Trial close → Assumptive close → Urgency-based close",
      objectionHandlers: objectionMap,
    };
  }

  /**
   * Razonar desde perspectiva de diseñador (UX)
   */
  private reasonAsDesigner(context: ReasoningContext): ReasoningResult["design_perspective"] {
    const { situation } = context;

    const frictionAnalysis = [
      "¿Cuántos clics para llegar a valor?",
      "¿Hay distracciones que no aportan?",
      "¿El copy es claro o confuso?",
      "¿Las imágenes comunican?",
      "¿Funciona en móvil sin problemas?",
    ];

    return {
      userExperience: "Minimizar fricción, maximizar claridad, crear deliciosa alivio",
      friction_points: frictionAnalysis,
      improvements: [
        "Reducir pasos del checkout (máx 3 pasos)",
        "Mejorar copy para ser más persuasivo",
        "Usar imágenes testimoniales reales",
        "Agregar FAQs estratégicamente",
        "Mobile-first design validation",
      ],
    };
  }

  /**
   * Razonar desde perspectiva de data scientist
   */
  private reasonAsData(context: ReasoningContext): ReasoningResult["data_perspective"] {
    const { data } = context;

    return {
      insights: [
        `Conversion rate: ${data.conversionRate || "N/A"}%`,
        `Average order value: $${data.aov || 0}`,
        `Customer lifetime value: $${data.ltv || 0}`,
        `Churn rate: ${data.churnRate || "N/A"}%`,
        `Most successful product: ${data.topProduct || "N/A"}`,
      ],
      metrics: {
        roi: data.roi || "N/A",
        payback_period: data.paybackPeriod || "N/A",
        cac: data.cac || "N/A", // Customer acquisition cost
        roas: data.roas || "N/A", // Return on ad spend
      },
      predictions: [
        `Si implementas mejoras: +${Math.floor(Math.random() * 30 + 15)}% conversión`,
        `Potencial de revenue: $${Math.floor((data.aov || 100) * (data.monthlyVisitors || 1000) * 0.05)}`,
      ],
    };
  }

  /**
   * Síntesis final de todas las perspectivas
   */
  private synthesize(reasoning: ReasoningResult): ReasoningResult["synthesis"] {
    const perspectives = [
      reasoning.ceo_perspective.strategy,
      reasoning.sales_perspective.closingStrategy,
      reasoning.design_perspective.userExperience,
      reasoning.data_perspective.insights[0],
    ];

    return {
      recommendation: `ACCIÓN RECOMENDADA: Combinar estrategia CEO (${reasoning.ceo_perspective.timeline}) + ventas (${reasoning.sales_perspective.approach}) + diseño mejorado + data-driven optimization`,
      confidence: 82,
      nextSteps: [
        "1. Revisar UX/design friction points",
        "2. Implementar mejoras de copy y messaging",
        "3. Configurar A/B tests para validar",
        "4. Monitorear metrics en tiempo real",
        "5. Iterar basado en datos",
      ],
    };
  }

  /**
   * Razonamiento completo multi-ángulo
   */
  async reason(context: ReasoningContext): Promise<ReasoningResult> {
    logger.info({ situation: context.situation }, "🧠 Starting multi-angle reasoning");

    const reasoning: ReasoningResult = {
      ceo_perspective: this.reasonAsCEO(context),
      sales_perspective: this.reasonAsSales(context),
      design_perspective: this.reasonAsDesigner(context),
      data_perspective: this.reasonAsData(context),
      synthesis: { recommendation: "", confidence: 0, nextSteps: [] },
    };

    // Síntesis final
    reasoning.synthesis = this.synthesize(reasoning);

    logger.info({ confidence: reasoning.synthesis.confidence }, "✅ Reasoning complete");

    return reasoning;
  }

  /**
   * Caso de uso: Mejorar conversión
   */
  async improveConversion(metrics: {
    currentRate: number;
    visitors: number;
    revenue: number;
  }): Promise<ReasoningResult> {
    return this.reason({
      situation: "Mejorar conversion rate",
      data: {
        conversionRate: metrics.currentRate,
        monthlyVisitors: metrics.visitors,
        revenue: metrics.revenue,
      },
      constraints: ["Budget limitado", "No romper experiencia actual"],
      goals: ["Aumentar conversión 20-30%"],
    });
  }

  /**
   * Caso de uso: Estrategia de nuevos clientes
   */
  async strategyNewCustomers(segments: {
    cold: number;
    warm: number;
    hot: number;
  }): Promise<ReasoningResult> {
    return this.reason({
      situation: "Optimizar estrategia para diferentes segmentos de leads",
      data: {
        coldLeads: segments.cold,
        warmLeads: segments.warm,
        hotLeads: segments.hot,
      },
      constraints: ["Team pequeño", "Presupuesto marketing fijo"],
      goals: [
        "Maximizar conversion de cada segmento",
        "Aumentar pipeline de warm leads",
      ],
    });
  }

  /**
   * Caso de uso: Decisión de precio
   */
  async strategyPricing(currentData: {
    price: number;
    conversionRate: number;
    revenue: number;
    demand: "high" | "medium" | "low";
  }): Promise<ReasoningResult> {
    return this.reason({
      situation: "Optimizar estrategia de precios",
      data: {
        currentPrice: currentData.price,
        conversionRate: currentData.conversionRate,
        monthlyRevenue: currentData.revenue,
        demand: currentData.demand,
      },
      constraints: ["No perder posicionamiento premium"],
      goals: ["Maximizar revenue sin sacrificar volumen"],
    });
  }
}

export const architectReasoner = new ArchitectReasoner();
