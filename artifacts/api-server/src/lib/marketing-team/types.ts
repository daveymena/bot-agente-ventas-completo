/**
 * ============================================================
 * MARKETING TEAM — CONTRATOS DE DOMINIO (MASTER PLAN §20-§24)
 * ============================================================
 * Tipos compartidos entre los agentes del equipo de marketing.
 * No duplican contratos existentes: el resto del sistema (Task en
 * marketing_tasks, memoria en architect_memory, aprobaciones en
 * architect-store.ts) ya tiene su representación persistente; acá
 * viven los contratos de HANDOFF entre agentes y de dominio.
 */

/** Clasificación de riesgo de una acción (MASTER PLAN §30). */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Decisión de aprobación de una acción con riesgo (MASTER PLAN §31). */
export type ApprovalDecision = "approved" | "rejected" | "pending";

/** Estados del motor de tareas (MASTER PLAN §20). */
export type TaskStatus =
  | "PENDING"
  | "PLANNING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/** Estados de un experimento (MASTER PLAN §13). */
export type ExperimentStatus =
  | "EN_PRUEBA"
  | "GANADOR"
  | "PERDEDOR"
  | "INCONCLUSO"
  | "CANCELADO";

/**
 * Resultado estructurado que un agente entrega a otro (MASTER PLAN §28).
 * Reemplaza el paso de texto libre: cada agente produce un handoff que el
 * siguiente consume como input tipado.
 */
export interface AgentHandoff<T = Record<string, unknown>> {
  agent: string;
  taskId?: number;
  domain: "marketing";
  kind: string; // ej: "ResearchResult" | "StrategyResult" | "CreativeBrief" | "CopyVariants" | "CampaignPlan"
  data: T;
  summary: string;
  createdAt: string;
}

/** Insight accionable del PerformanceAnalyst (MASTER PLAN §14). */
export interface Insight {
  metric: string;
  value: number;
  trend: "up" | "down" | "flat";
  deltaPercent?: number;
  interpretation: string;
  evidence: string[];
  recommendation: string;
  severity: "info" | "warning" | "critical";
}

/** Aprendizaje persistido por MarketingMemoryAgent (MASTER PLAN §19). */
export interface Learning {
  product?: string;
  productId?: number;
  winner?: string;
  loser?: string;
  format?: string;
  audience?: string;
  metric?: string;
  value?: string;
  tags: string[];
  content: string;
}

/**
 * Guardrails de presupuesto (MASTER PLAN §17, §31). Nunca permitir
 * gasto ilimitado: toda escalada se valida contra estos límites.
 */
export interface BudgetGuardrails {
  maxDailySpend: number;
  maxBudgetChangePercent: number;
  maxScalePercent: number;
  approvalRequired: boolean;
  currency: string;
}

/** Embudo completo del DiagnosticAgent (MASTER PLAN §15). */
export interface FunnelSnapshot {
  impressions?: number;
  clicks?: number;
  leads: number;
  conversations: number;
  paid: number;
  revenue: number;
  ctr?: number;
  cpc?: number;
  leadToConversationRate: number;
  conversationToPaidRate: number;
  cpl?: number; // costo por lead (requiere spend de Meta)
  cpa?: number; // costo por adquisición (requiere spend de Meta)
  roas?: number; // revenue / spend (requiere spend de Meta)
}

/** Resultado agregado por anuncio/campaña de la atribución (Fase 5). */
export interface AdAttribution {
  adId: string;
  adTitle: string;
  leads: number;
  conversations: number;
  paid: number;
  revenue: number;
  conversionRate: number; // paid / leads
  avgOrderValue: number;
  spend?: number;
  cpa?: number;
  roas?: number;
}

/** Acción clasificada por el RiskEngine (MASTER PLAN §30-§31). */
export interface ClassifiedAction {
  action: string;
  risk: RiskLevel;
  approvalRequired: boolean;
  maxChangePercent?: number;
  reason: string;
}

export const TASK_STATUSES: TaskStatus[] = [
  "PENDING", "PLANNING", "RUNNING", "WAITING_APPROVAL",
  "BLOCKED", "COMPLETED", "FAILED", "CANCELLED",
];

export const EXPERIMENT_STATUSES: ExperimentStatus[] = [
  "EN_PRUEBA", "GANADOR", "PERDEDOR", "INCONCLUSO", "CANCELADO",
];
