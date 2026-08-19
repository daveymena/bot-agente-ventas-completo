/**
 * MARKETING TEAM — OptimizationAgent (MASTER PLAN §16, §34)
 * 
 * Motor de mejora continua: OBSERVAR → DETECTAR → DIAGNOSTICAR → HIPÓTESIS →
 * PRIORIZAR → PROPONER → APROBAR → EJECUTAR → MEDIR → APRENDER.
 * Regla de oro: cada acción responde a problema, evidencia, causa, cambio,
 * resultado esperado y cómo se sabrá que funcionó. No hace cambios aleatorios
 * ni apaga anuncios por un CPA alto sin analizar el contexto.
 */

import type { AgentHandoff } from "../types";
import { performanceAnalysis } from "./performance-analyst";
import { diagnostic } from "./diagnostic-agent";

export interface OptimizationProposal {
  problema: string;
  evidencia: string[];
  causaProbable: string;
  accion: string;
  riesgo: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  resultadoEsperado: string;
  comoSabremosQueFunciono: string;
  requiereAprobacion: boolean;
}

export interface OptimizationReport {
  propuestas: OptimizationProposal[];
  resumen: string;
}

/**
 * Genera propuestas de optimización a partir del análisis de performance y
 * del diagnóstico del embudo. NO ejecuta: produce propuestas priorizadas que
 * el orquestador deriva a aprobación o a los agentes de ejecución.
 */
export async function optimize(
  input: { tenantId: number; days?: number },
): Promise<AgentHandoff<OptimizationReport>> {
  const days = input.days ?? 30;
  const [performance, diag] = await Promise.all([
    performanceAnalysis({ tenantId: input.tenantId, days }),
    diagnostic({ tenantId: input.tenantId, days }),
  ]);

  const insights = performance.data.insights;
  const propuestas: OptimizationProposal[] = [];

  const critical = insights.filter((i) => i.severity === "critical");
  for (const insight of critical.slice(0, 3)) {
    propuestas.push({
      problema: insight.interpretation,
      evidencia: insight.evidence,
      causaProbable: diag.data.conclusion,
      accion: insight.recommendation,
      riesgo: "MEDIUM",
      resultadoEsperado: "Recuperar la métrica afectada en la próxima ventana de medición.",
      comoSabremosQueFunciono: `Comparando ${insight.metric} en la ventana actual vs la anterior.`,
      requiereAprobacion: true,
    });
  }

  // Fatiga creativa: señales clásicas (CTR/frecuencia) → propuesta de renovación.
  if (insights.some((i) => i.metric === "leads" && i.trend === "down")) {
    propuestas.push({
      problema: "Posible fatiga creativa: los mismos conceptos pierden respuesta.",
      evidencia: ["Leads a la baja con adquisición activa (revisar CTR y frecuencia en Meta)."],
      causaProbable: "El público está recibiendo demasiada exposición a los mismos conceptos (MASTER PLAN §24).",
      accion: "Crear 3 conceptos nuevos y probarlos manteniendo un ganador como control.",
      riesgo: "LOW",
      resultadoEsperado: "Recuperar el CTR y bajar el CPA.",
      comoSabremosQueFunciono: "CTR estable/creciente y frecuencia ≤ 2.5 en los nuevos creativos.",
      requiereAprobacion: false,
    });
  }

  const resumen =
    propuestas.length > 0
      ? `${propuestas.length} propuestas de optimización priorizadas a partir de ${insights.length} insights y el diagnóstico del embudo.`
      : "Sin señales críticas: mantener el curso y escalar ganadores con cautela.";

  return {
    agent: "OptimizationAgent",
    domain: "marketing",
    kind: "OptimizationProposals",
    data: { propuestas, resumen },
    summary: resumen,
    createdAt: new Date().toISOString(),
  };
}
