/**
 * ============================================================
 * COST TRACKER - Rastrear Costos de API
 * ============================================================
 * Monitorea gasto por provider/modelo en tiempo real
 */

import { logger } from "./logger";

export interface TokenUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: Date;
  tenantId?: number;
}

export interface CostReport {
  period: string; // "today", "week", "month"
  totalCost: number;
  byProvider: Record<string, { cost: number; tokens: number; requests: number }>;
  byModel: Record<string, { cost: number; tokens: number }>;
  estimatedMonthly: number;
  topModel: { model: string; cost: number };
  trending: "up" | "down" | "stable";
}

export class CostTracker {
  private usage: TokenUsage[] = [];

  /**
   * Registrar uso de tokens
   */
  recordUsage(data: Omit<TokenUsage, "timestamp">): void {
    this.usage.push({
      ...data,
      timestamp: new Date(),
    });

    logger.info(
      { provider: data.provider, model: data.model, inputTokens: data.inputTokens, outputTokens: data.outputTokens },
      "📊 Token usage recorded"
    );
  }

  /**
   * Calcular costo de tokens
   */
  private calculateCost(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const costs: Record<string, Record<string, { input: number; output: number }>> = {
      openai: {
        "gpt-6-astra": { input: 10, output: 50 },
        "gpt-5.6-sol": { input: 4, output: 20 },
        "gpt-5.6-terra": { input: 2, output: 12 },
        "gpt-5.6-luna": { input: 0.2, output: 1.2 },
      },
      claude: {
        "claude-3-opus-20240229": { input: 15, output: 75 },
        "claude-3-sonnet-20240229": { input: 3, output: 15 },
        "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
      },
      azure: {
        "gpt-4": { input: 30, output: 60 },
        "gpt-4-turbo": { input: 10, output: 30 },
        "gpt-35-turbo": { input: 0.5, output: 1.5 },
      },
      g4f: {
        "gpt-3.5-turbo": { input: 0, output: 0 },
        "gpt-4": { input: 0, output: 0 },
        "claude": { input: 0, output: 0 },
      },
    };

    const pricing =
      costs[provider.toLowerCase()]?.[model] || { input: 0, output: 0 };

    // Convertir de precio por millón de tokens a precio por token
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Obtener reporte de costos por período
   */
  getReport(period: "today" | "week" | "month" = "month", tenantId?: number): CostReport {
    const now = new Date();
    const startDate = this.getPeriodStart(period, now);

    let filtered = this.usage.filter((u) => u.timestamp >= startDate);
    if (tenantId) {
      filtered = filtered.filter((u) => u.tenantId === tenantId);
    }

    if (filtered.length === 0) {
      return {
        period,
        totalCost: 0,
        byProvider: {},
        byModel: {},
        estimatedMonthly: 0,
        topModel: { model: "N/A", cost: 0 },
        trending: "stable",
      };
    }

    // Agrupar por provider
    const byProvider: Record<string, { cost: number; tokens: number; requests: number }> = {};
    const byModel: Record<string, { cost: number; tokens: number }> = {};
    let totalCost = 0;

    for (const u of filtered) {
      const cost = this.calculateCost(u.provider, u.model, u.inputTokens, u.outputTokens);
      totalCost += cost;

      // Por provider
      if (!byProvider[u.provider]) {
        byProvider[u.provider] = { cost: 0, tokens: 0, requests: 0 };
      }
      byProvider[u.provider].cost += cost;
      byProvider[u.provider].tokens += u.inputTokens + u.outputTokens;
      byProvider[u.provider].requests += 1;

      // Por modelo
      if (!byModel[u.model]) {
        byModel[u.model] = { cost: 0, tokens: 0 };
      }
      byModel[u.model].cost += cost;
      byModel[u.model].tokens += u.inputTokens + u.outputTokens;
    }

    // Modelo más caro
    const topModel = Object.entries(byModel).reduce((prev, curr) =>
      prev[1].cost > curr[1].cost ? prev : curr
    ) || ["N/A", { cost: 0 }];

    // Estimar monthly (si es menos de un mes, proyectar)
    const daysInPeriod = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const estimatedMonthly = daysInPeriod < 30 ? (totalCost / daysInPeriod) * 30 : totalCost;

    // Trending (simple: comparar con período anterior)
    const prevStartDate = this.getPeriodStart(period, new Date(startDate.getTime() - daysInPeriod * 24 * 60 * 60 * 1000));
    const prevFiltered = this.usage.filter(
      (u) => u.timestamp >= prevStartDate && u.timestamp < startDate
    );
    let prevCost = 0;
    for (const u of prevFiltered) {
      prevCost += this.calculateCost(u.provider, u.model, u.inputTokens, u.outputTokens);
    }

    let trending: "up" | "down" | "stable" = "stable";
    if (prevCost > 0) {
      const change = (totalCost - prevCost) / prevCost;
      if (change > 0.1) trending = "up";
      if (change < -0.1) trending = "down";
    }

    return {
      period,
      totalCost: Math.round(totalCost * 100) / 100,
      byProvider,
      byModel,
      estimatedMonthly: Math.round(estimatedMonthly * 100) / 100,
      topModel: { model: topModel[0], cost: Math.round(topModel[1].cost * 100) / 100 },
      trending,
    };
  }

  /**
   * Obtener fecha de inicio del período
   */
  private getPeriodStart(period: string, referenceDate: Date): Date {
    const start = new Date(referenceDate);

    switch (period) {
      case "today":
        start.setHours(0, 0, 0, 0);
        break;
      case "week":
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case "month":
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
    }

    return start;
  }

  /**
   * Limpiar datos antiguos (retener últimos 90 días)
   */
  cleanup(): void {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const before = this.usage.length;
    this.usage = this.usage.filter((u) => u.timestamp > ninetyDaysAgo);
    const after = this.usage.length;

    if (before - after > 0) {
      logger.info({ removed: before - after }, "🧹 Old usage records cleaned");
    }
  }

  /**
   * Obtener alerta si excede presupuesto
   */
  checkBudgetAlert(monthlyBudget: number, tenantId?: number): { exceeded: boolean; cost: number; remaining: number } {
    const report = this.getReport("month", tenantId);

    return {
      exceeded: report.estimatedMonthly > monthlyBudget,
      cost: report.estimatedMonthly,
      remaining: Math.max(0, monthlyBudget - report.estimatedMonthly),
    };
  }
}

export const costTracker = new CostTracker();

// Limpiar datos antiguos cada 24 horas
setInterval(() => {
  costTracker.cleanup();
}, 24 * 60 * 60 * 1000);
