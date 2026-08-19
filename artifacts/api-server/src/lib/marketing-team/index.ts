/**
 * MARKETING TEAM — dominio de Marketing & Growth
 * (MASTER_PLAN_MARKETING_TEAM_INTEGRACION.md)
 *
 * Punto de entrada del equipo. Los agentes individuales viven en ./agents/.
 * Estado por fase (ver MARKETING_INTEGRATION_AUDIT.md §6):
 *   ✅ Fase 1 (contratos) + Fase 5 (atribución) + Fase 8 (memoria)
 *   🟡 Fase 2 (9/14 agentes) + Fase 3 (orquestador) + Fase 7 (autonomía parcial)
 *   ⏳ Fase 4 (Meta), Fase 6 (optimización), frontend, tests restantes
 */
export * from "./types";
export * from "./risk-engine";
export * from "./budget-guard";
export * from "./audit";
export * from "./attribution";
export * from "./ai";
export * from "./orchestrator";
export * from "./agents/market-researcher";
export * from "./agents/audience-strategist";
export * from "./agents/offer-strategist";
export * from "./agents/creative-director";
export * from "./agents/copywriter";
export * from "./agents/marketing-strategist";
export * from "./agents/marketing-memory";
export * from "./agents/performance-analyst";
export * from "./agents/diagnostic-agent";
