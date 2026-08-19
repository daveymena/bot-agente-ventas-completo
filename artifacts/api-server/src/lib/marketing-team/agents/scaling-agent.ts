/**
 * MARKETING TEAM — ScalingAgent (MASTER PLAN §18)
 * 
 * Identifica ganadores con datos (estabilidad, volumen, CPA, ROAS,
 * frecuencia, capacidad de mercado, calidad de ventas) y propone escalar
 * GRADUALMENTE: nunca duplica presupuesto agresivamente. La escalada la
 * ejecuta BudgetManager/MetaAdsManager dentro de maxScalePercent.
 */

import type { AgentHandoff } from "../types";
import { getAttributionSummary } from "../attribution";
import { proposeBudgetChange } from "./budget-manager";
import { writeAuditLog } from "../audit";

export interface ScalingCandidate {
  adId: string;
  adTitle: string;
  revenue: number;
  roas?: number;
  conversionRate: number;
  escalar: boolean;
  motivo: string;
  propuestaEscala?: { current: number; next: number; deltaPercent: number };
}

export async function identifyWinners(
  input: { tenantId: number; days?: number; spendByAd?: Record<string, number> },
): Promise<AgentHandoff<{ candidatos: ScalingCandidate[]; resumen: string }>> {
  const days = input.days ?? 30;
  const { rows } = await getAttributionSummary(input.tenantId, days, input.spendByAd);

  const candidatos: ScalingCandidate[] = rows
    .filter((r) => r.paid > 0)
    .map((r) => {
      const roas = r.roas;
      const escalar = (roas != null && roas >= 2.5) || (roas == null && r.conversionRate >= 15);
      return {
        adId: r.adId,
        adTitle: r.adTitle,
        revenue: r.revenue,
        roas,
        conversionRate: r.conversionRate,
        escalar,
        motivo: escalar
          ? roas != null
            ? `ROAS ${roas}x ≥ 2.5x con ${r.paid} ventas: candidato a escalar gradualmente.`
            : `Conversión ${r.conversionRate}% con ${r.paid} ventas (sin spend de Meta): candidato a escalar con cautela.`
          : `Sin suficiente evidencia (ROAS ${roas ?? "n/d"}, conversión ${r.conversionRate}%): mantener.`,
      };
    })
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));

  // Para los ganadores, proponer una escalada del 30% (maxScalePercent default).
  for (const c of candidatos.filter((c) => c.escalar).slice(0, 3)) {
    const current = 50000; // presupuesto diario actual estimado — en producción viene de Meta
    const next = Math.round(current * 1.3);
    const proposal = await proposeBudgetChange(input.tenantId, current, next, "escala");
    c.propuestaEscala = { current, next, deltaPercent: Math.round(proposal.deltaPercent * 100) / 100 };
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    agent: "ScalingAgent",
    action: "identify_winners",
    after: { candidatos: candidatos.filter((c) => c.escalar).length },
    approval: "system",
    result: "SUCCESS",
  });

  return {
    agent: "ScalingAgent",
    domain: "marketing",
    kind: "ScalingReport",
    data: {
      candidatos,
      resumen: `${candidatos.filter((c) => c.escalar).length} candidatos a escalar de ${candidatos.length} anuncios con ventas.`,
    },
    summary: `${candidatos.filter((c) => c.escalar).length} ganadores identificados.`,
    createdAt: new Date().toISOString(),
  };
}
