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
  opts?: { autonomous?: boolean; tipo?: "cambio" | "escala"; adSetId?: string },
): Promise<{ executed: boolean; proposal?: BudgetProposal; reason?: string; applied?: boolean }> {
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

  // Aplicación REAL en Meta (antes era una "simulación" que escribía SUCCESS
  // sin cambiar nada: el loop quedaba abierto y el anuncio seguía con el
  // presupuesto viejo mientras la auditoría decía que se había aplicado).
  let applied = false;
  let reason = proposal.reason;
  if (opts?.adSetId) {
    try {
      const { tenantManager } = await import("../../tenantManager");
      const { FacebookService } = await import("../../facebook");
      const tenant = await tenantManager.getTenantById(tenantId);
      const r = await new FacebookService(tenant || undefined).setAdSetBudget(opts.adSetId, next);
      applied = r.ok;
      if (!r.ok) reason = `Meta no aceptó el cambio: ${r.message || "sin detalle"}`;
    } catch (e: any) {
      reason = `No se pudo aplicar en Meta: ${e?.message || e}`;
    }
  }

  await writeAuditLog({
    tenantId,
    agent: "BudgetManager",
    action,
    resource: opts?.adSetId ? `adset:${opts.adSetId}` : undefined,
    before: { budget: current },
    after: { budget: next, deltaPercent: proposal.deltaPercent, applied },
    approval: auto.allowed ? "auto_within_limits" : "pending",
    reason,
    result: !opts?.adSetId ? "SUCCESS" : applied ? "SUCCESS" : "FAILED",
  });
  if (applied) await recordSpend(tenantId, next).catch(() => undefined);
  return { executed: applied || !opts?.adSetId, proposal, reason, applied };
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
