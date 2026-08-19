/**
 * MARKETING TEAM — BudgetManager (MASTER PLAN §17)
 * 
 * Controla presupuesto diario, total, límites de escalado, distribución,
 * pruebas y remarketing, con protección contra gasto accidental. Nunca
 * permite gasto ilimitado: toda propuesta pasa por BudgetGuard
 * (max_daily_spend, max_budget_change_percent, max_scale_percent,
 * approval_required).
 */

import type { BudgetGuardrails } from "../types";
import {
  getOrCreateBudget,
  getBudgetStatus,
  canChangeBudget,
  canScale,
  canSpendToday,
  recordSpend,
} from "../budget-guard";
import { writeAuditLog } from "../audit";
import { classifyAction, canExecuteAutonomously } from "../risk-engine";

export interface BudgetProposal {
  tipo: "cambio" | "escala";
  current: number;
  next: number;
  deltaPercent: number;
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
}

/** Valida una propuesta de cambio de presupuesto contra los guardrails. */
export async function proposeBudgetChange(
  tenantId: number,
  current: number,
  next: number,
  tipo: "cambio" | "escala" = "cambio",
): Promise<BudgetProposal> {
  const guardrails = await getOrCreateBudget(tenantId);
  const check = tipo === "escala"
    ? canScale(guardrails, current, next)
    : canChangeBudget(guardrails, current, next);

  const requiresApproval = guardrails.approvalRequired || check.deltaPercent > 0;
  return {
    tipo,
    current,
    next,
    deltaPercent: check.deltaPercent,
    allowed: check.allowed,
    reason: check.reason,
    requiresApproval,
  };
}

/** Ejecuta un cambio de presupuesto (si los guardrails y la política lo permiten). */
export async function executeBudgetChange(
  tenantId: number,
  current: number,
  next: number,
  opts?: { autonomous?: boolean; tipo?: "cambio" | "escala" },
): Promise<{ executed: boolean; proposal?: BudgetProposal; reason?: string }> {
  const proposal = await proposeBudgetChange(tenantId, current, next, opts?.tipo);
  if (!proposal.allowed) {
    return { executed: false, proposal, reason: proposal.reason };
  }

  // La aprobación depende de la configuración (approval_required) y del modo.
  const action = opts?.tipo === "escala" ? "scale_budget" : "change_budget";
  const auto = canExecuteAutonomously(action, { autonomous: opts?.autonomous });
  if (proposal.requiresApproval && !auto.allowed) {
    return { executed: false, proposal, reason: `Requiere aprobación: ${proposal.reason}` };
  }

  // Simulación de ejecución contra el guard: en producción el cambio real lo
  // aplica MetaAdsManager vía FacebookService.setAdSetBudget.
  await writeAuditLog({
    tenantId,
    agent: "BudgetManager",
    action,
    before: { budget: current },
    after: { budget: next, deltaPercent: proposal.deltaPercent },
    approval: auto.allowed ? "auto_within_limits" : "pending",
    reason: proposal.reason,
    result: "SUCCESS",
  });
  return { executed: true, proposal };
}

/** Estado actual del presupuesto (dashboard). */
export async function status(tenantId: number) {
  return getBudgetStatus(tenantId);
}

/** Registrar gasto real confirmado por Meta (insights). */
export async function registerSpend(tenantId: number, amount: number) {
  await recordSpend(tenantId, amount);
}

export type { BudgetGuardrails };
