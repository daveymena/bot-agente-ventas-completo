/**
 * ============================================================
 * MARKETING TEAM — RISK ENGINE (MASTER PLAN §30-§31)
 * ============================================================
 * Clasifica cada acción del equipo en LOW / MEDIUM / HIGH / CRITICAL
 * y deriva si requiere aprobación humana. En modo autónomo con
 * guardrails (configuración del proyecto), las acciones LOW/MEDIUM
 * pueden ejecutarse solas dentro de límites; HIGH requiere
 * aprobación; CRITICAL NUNCA es automática.
 */

import type { ClassifiedAction, RiskLevel } from "./types";

/** Tabla de clasificación por tipo de acción (MASTER PLAN §30). */
const ACTION_RISK: Record<string, { risk: RiskLevel; approvalRequired: boolean; maxChangePercent?: number }> = {
  // Lectura y análisis → LOW (nunca requiere aprobación)
  "read_insights": { risk: "LOW", approvalRequired: false },
  "read_campaigns": { risk: "LOW", approvalRequired: false },
  "read_sales": { risk: "LOW", approvalRequired: false },
  "read_crm": { risk: "LOW", approvalRequired: false },
  "research_market": { risk: "LOW", approvalRequired: false },
  "generate_copy": { risk: "LOW", approvalRequired: false },
  "create_draft": { risk: "LOW", approvalRequired: false },
  "save_learning": { risk: "LOW", approvalRequired: false },

  // Cambios reversibles sobre contenido → MEDIUM
  "create_ad": { risk: "MEDIUM", approvalRequired: false },
  "create_campaign_draft": { risk: "MEDIUM", approvalRequired: false },
  "pause_campaign": { risk: "MEDIUM", approvalRequired: true },
  "resume_campaign": { risk: "MEDIUM", approvalRequired: true },
  "update_ad_copy": { risk: "MEDIUM", approvalRequired: false },

  // Presupuesto → HIGH (siempre con guardrails; aprobación según config)
  "change_budget": { risk: "HIGH", approvalRequired: true, maxChangePercent: 25 },
  "scale_budget": { risk: "HIGH", approvalRequired: true, maxChangePercent: 30 },

  // Cuenta y facturación → CRITICAL (nunca automático)
  "manage_billing": { risk: "CRITICAL", approvalRequired: true },
  "change_admin_permissions": { risk: "CRITICAL", approvalRequired: true },
  "delete_campaign": { risk: "CRITICAL", approvalRequired: true },
};

const RISK_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

/**
 * Clasifica una acción. Si la acción no está en la tabla se asume
 * conservador: MEDIUM con aprobación opcional (nunca HIGH automática).
 */
export function classifyAction(
  action: string,
  opts?: { approvalRequired?: boolean },
): ClassifiedAction {
  const known = ACTION_RISK[action];
  const risk: RiskLevel = known?.risk ?? "MEDIUM";
  const approvalRequired = opts?.approvalRequired ?? known?.approvalRequired ?? false;
  const reason = known
    ? `Acción conocida "${action}": riesgo ${risk}${approvalRequired ? " (requiere aprobación)" : ""}.`
    : `Acción desconocida "${action}": tratada con riesgo MEDIUM por defecto.`;

  return {
    action,
    risk,
    approvalRequired,
    maxChangePercent: known?.maxChangePercent,
    reason,
  };
}

/** Una acción solo puede ejecutarse automáticamente si el riesgo lo permite y
 *  la política de autonomía lo habilita (MASTER PLAN §24, §31). */
export function canExecuteAutonomously(
  action: string,
  opts?: { approvalRequired?: boolean; autonomous?: boolean },
): { allowed: boolean; reason: string } {
  const classified = classifyAction(action, opts);
  const autonomous = opts?.autonomous ?? false;

  if (classified.risk === "CRITICAL") {
    return { allowed: false, reason: `CRITICAL (${action}): nunca automático.` };
  }
  if (classified.approvalRequired) {
    return { allowed: false, reason: `${action}: requiere aprobación humana.` };
  }
  if (!autonomous) {
    return { allowed: false, reason: "Modo autónomo desactivado." };
  }
  return { allowed: true, reason: `${action}: riesgo ${classified.risk}, dentro de política autónoma.` };
}

/** Orden numérico para comparar riesgos. */
export function riskLevel(r: RiskLevel): number {
  return RISK_ORDER[r];
}
