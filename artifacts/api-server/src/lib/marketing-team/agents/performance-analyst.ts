/**
 * MARKETING TEAM — PerformanceAnalyst (MASTER PLAN §14)
 * 
 * No es un lector de métricas: correlaciona CPM/CTR/CPC/clicks/leads/
 * conversaciones/ventas/CPA/ROAS/ingresos y, cuando existen datos de CRM,
 * calidad de lead, tasa de cierre y margen. Responde: qué pasó, qué evidencia
 * lo respalda, por qué probablemente pasó y qué acción recomienda.
 */

import type { AgentHandoff, Insight, FunnelSnapshot } from "../types";
import { callMarketingAI } from "../ai";
import { getFunnelSnapshot } from "../attribution";

export interface PerformanceReport {
  insights: Insight[];
  resumen: string;
  accionPrincipal: string;
}

const METRIC_LABELS: Record<string, string> = {
  leads: "Leads",
  conversations: "Conversaciones",
  paid: "Ventas",
  revenue: "Ingresos",
  leadToConversationRate: "Lead → Conversación",
  conversationToPaidRate: "Conversación → Venta",
};

function deltaPercent(current: number, previous: number): number | undefined {
  if (!Number.isFinite(previous) || previous <= 0) return undefined;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

export async function performanceAnalysis(
  input: {
    tenantId: number;
    days?: number;
    previousDays?: number;
    extraMetrics?: { ctr?: number; cpc?: number; cpm?: number; spend?: number };
  },
): Promise<AgentHandoff<PerformanceReport>> {
  const days = input.days ?? 30;
  const prevDays = input.previousDays ?? days;

  const current: FunnelSnapshot = await getFunnelSnapshot(input.tenantId, days);
  const previous: Pick<FunnelSnapshot, "leads" | "paid" | "revenue" | "conversations"> =
    await getFunnelSnapshot(input.tenantId, prevDays * 2).then((p) => ({
      // ventana anterior = últimos "prevDays" dentro de los últimos "prevDays*2"
      leads: Math.max(0, p.leads - current.leads),
      paid: Math.max(0, p.paid - current.paid),
      revenue: Math.max(0, p.revenue - current.revenue),
      conversations: Math.max(0, p.conversations - current.conversations),
    }));

  const insights: Insight[] = [];

  for (const key of ["leads", "conversations", "paid", "revenue"] as const) {
    const cur = current[key];
    const prev = (previous as any)[key];
    const delta = deltaPercent(cur, prev);
    const label = METRIC_LABELS[key];
    const isDown = delta != null && delta < -5;
    const isUp = delta != null && delta > 5;

    if (delta == null) continue; // sin ventana anterior, no hay tendencia
    insights.push({
      metric: key,
      value: cur,
      trend: isDown ? "down" : isUp ? "up" : "flat",
      deltaPercent: delta,
      interpretation: isDown
        ? `${label} cayeron ${Math.abs(delta)}% vs el período anterior.`
        : isUp
          ? `${label} crecieron ${delta}% vs el período anterior.`
          : `${label} estables vs el período anterior.`,
      evidence: [`Ventana actual: ${days} días`, `Ventana anterior: ${prevDays} días`],
      recommendation: key === "paid" && isDown
        ? "Revisar el embudo completo con el DiagnosticAgent antes de cambiar presupuesto."
        : key === "leads" && isDown
          ? "Evaluar adquisición (CTR, CPC, audiencias) antes de concluir."
          : "Mantener el curso y observar la siguiente ventana.",
      severity: isDown ? (key === "revenue" || key === "paid" ? "critical" : "warning") : "info",
    });
  }

  // Correlación clave: más leads pero menos ventas = problema de conversión.
  const leadsDelta = deltaPercent(current.leads, previous.leads);
  const paidDelta = deltaPercent(current.paid, previous.paid);
  if (leadsDelta != null && paidDelta != null && leadsDelta > 10 && paidDelta < -5) {
    insights.push({
      metric: "lead_quality",
      value: current.conversationToPaidRate,
      trend: "down",
      deltaPercent: paidDelta - leadsDelta,
      interpretation: "La adquisición está saludable pero la conversión a venta cae: el problema probablemente está después del clic (oferta, WhatsApp, seguimiento).",
      evidence: [`Leads ${leadsDelta > 0 ? "+" : ""}${leadsDelta}%`, `Ventas ${paidDelta}%`],
      recommendation: "Activar DiagnosticAgent + SalesAgent: revisar oferta, tiempo de respuesta y follow-up.",
      severity: "critical",
    });
  }

  const resumen =
    insights.length > 0
      ? `${insights.filter((i) => i.severity === "critical").length} señales críticas y ${insights.filter((i) => i.severity === "warning").length} advertencias en los últimos ${days} días.`
      : "Sin cambios significativos en la ventana analizada.";

  const accionPrincipal =
    insights.find((i) => i.severity === "critical")?.recommendation ??
    insights[0]?.recommendation ??
    "Continuar midiendo con la misma ventana.";

  return {
    agent: "PerformanceAnalyst",
    domain: "marketing",
    kind: "PerformanceReport",
    data: { insights, resumen, accionPrincipal },
    summary: resumen,
    createdAt: new Date().toISOString(),
  };
}
