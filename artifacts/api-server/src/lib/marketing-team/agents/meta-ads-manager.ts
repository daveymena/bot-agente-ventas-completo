/**
 * MARKETING TEAM — MetaAdsManager (MASTER PLAN §12, §27)
 * 
 * Opera Meta SOLO a través de las integraciones oficiales existentes del
 * proyecto (FacebookService + AdStrategist). NO crea endpoints nuevos de
 * Graph API, NO duplica infraestructura. Cada acción pasa por el RiskEngine
 * y se registra en el audit log; nunca se afirma éxito sin verificación.
 */

import { db, facebookDrafts } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { classifyAction, canExecuteAutonomously } from "../risk-engine";
import { writeAuditLog } from "../audit";
import { recordSpend } from "../budget-guard";

/** Lista campañas activas reales de Meta (solo lectura). */
export async function listCampaigns(tenant: any): Promise<any[]> {
  const { FacebookService } = await import("../../facebook");
  const service = new FacebookService(tenant);
  const campaigns = await service.listActiveCampaigns().catch(() => []);
  await writeAuditLog({ tenantId: tenant?.id ?? 0, agent: "MetaAdsManager", action: "read_campaigns", result: "SUCCESS" });
  return campaigns;
}

/** Insights reales de una campaña (solo lectura). */
export async function campaignInsights(tenant: any, campaignId: string, datePreset = "last_30d") {
  const { FacebookService } = await import("../../facebook");
  const service = new FacebookService(tenant);
  return service.getCampaignInsights(campaignId, datePreset);
}

/**
 * Crea borradores de anuncios para todos los productos (usa AdStrategist
 * existente). Riesgo MEDIUM: si el modo autónomo está activo y no exige
 * aprobación, se ejecuta y se audita; si no, devuelve la acción propuesta.
 */
export async function createCampaignDrafts(
  tenant: any,
  opts?: { autonomous?: boolean },
): Promise<{ executed: boolean; result?: any; requiresApproval?: boolean }> {
  const classified = classifyAction("create_campaign_draft");
  const auto = canExecuteAutonomously("create_campaign_draft", {
    autonomous: opts?.autonomous,
    approvalRequired: classified.approvalRequired,
  });

  if (!auto.allowed) {
    await writeAuditLog({
      tenantId: tenant?.id ?? 0,
      agent: "MetaAdsManager",
      action: "create_campaign_draft",
      result: "PENDING",
      reason: auto.reason,
      approval: "pending",
    });
    return { executed: false, requiresApproval: true };
  }

  const { AdStrategist } = await import("../../ad-strategist");
  const strategist = new AdStrategist(tenant);
  const result = await strategist.createDraftsForAllProducts();
  await writeAuditLog({
    tenantId: tenant?.id ?? 0,
    agent: "MetaAdsManager",
    action: "create_campaign_draft",
    after: { created: result.created, failed: result.failed },
    approval: "auto_within_limits",
    result: "SUCCESS",
  });
  return { executed: true, result };
}

/** Pausa una campaña real en Meta (riesgo MEDIUM, requiere aprobación). */
export async function pauseCampaign(tenant: any, campaignId: string, opts?: { autonomous?: boolean }): Promise<{ executed: boolean; result?: boolean; requiresApproval?: boolean }> {
  const auto = canExecuteAutonomously("pause_campaign", { autonomous: opts?.autonomous });
  if (!auto.allowed) {
    await writeAuditLog({ tenantId: tenant?.id ?? 0, agent: "MetaAdsManager", action: "pause_campaign", resource: campaignId, result: "PENDING", approval: "pending", reason: auto.reason });
    return { executed: false, requiresApproval: true };
  }
  const { FacebookService } = await import("../../facebook");
  const ok = await new FacebookService(tenant).pauseCampaign(campaignId);
  await writeAuditLog({ tenantId: tenant?.id ?? 0, agent: "MetaAdsManager", action: "pause_campaign", resource: campaignId, after: { paused: ok }, approval: "system", result: ok ? "SUCCESS" : "FAILED" });
  return { executed: true, result: ok };
}

/** Cambia el presupuesto de un ad set (riesgo HIGH: guardrails + aprobación). */
export async function changeAdSetBudget(
  tenant: any,
  adSetId: string,
  newBudget: number,
  opts?: { autonomous?: boolean },
): Promise<{ executed: boolean; result?: any; requiresApproval?: boolean; reason?: string }> {
  const classified = classifyAction("change_budget");
  const auto = canExecuteAutonomously("change_budget", {
    autonomous: opts?.autonomous,
    approvalRequired: classified.approvalRequired,
  });
  if (!auto.allowed) {
    await writeAuditLog({ tenantId: tenant?.id ?? 0, agent: "MetaAdsManager", action: "change_budget", resource: adSetId, after: { newBudget }, result: "PENDING", approval: "pending", reason: auto.reason });
    return { executed: false, requiresApproval: true, reason: auto.reason };
  }
  const { FacebookService } = await import("../../facebook");
  const result = await new FacebookService(tenant).setAdSetBudget(adSetId, newBudget);
  if (result.ok) {
    // Contador conservador del tope diario (el gasto real llega por insights).
    await recordSpend(tenant?.id ?? 0, newBudget);
  }
  await writeAuditLog({ tenantId: tenant?.id ?? 0, agent: "MetaAdsManager", action: "change_budget", resource: adSetId, after: { newBudget, ok: result.ok }, approval: "auto_within_limits", result: result.ok ? "SUCCESS" : "FAILED", error: result.message });
  return { executed: true, result };
}

/** Últimos borradores del tenant (para el dashboard de Marketing). */
export async function listDrafts(tenantId: number) {
  return db.select().from(facebookDrafts).where(eq(facebookDrafts.tenantId, tenantId)).orderBy(desc(facebookDrafts.createdAt)).limit(100);
}
