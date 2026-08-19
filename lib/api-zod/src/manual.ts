/**
 * Esquemas Zod manuales (no generados por orval) para el dominio de
 * Marketing & Growth. Se exportan desde index.ts junto a los generados.
 */
import * as zod from "zod";

export const MarketingTaskInput = zod.object({
  assignedAgent: zod.string().min(1),
  action: zod.string().min(1),
  requestedBy: zod.string().optional(),
  priority: zod.enum(["low", "medium", "high"]).optional(),
  input: zod.record(zod.string(), zod.unknown()).optional(),
  dependencies: zod.array(zod.number()).optional(),
  parentTaskId: zod.number().optional(),
});

export const MarketingTaskPatch = zod.object({
  status: zod
    .enum(["PENDING", "PLANNING", "RUNNING", "WAITING_APPROVAL", "BLOCKED", "COMPLETED", "FAILED", "CANCELLED"])
    .optional(),
  output: zod.record(zod.string(), zod.unknown()).nullable().optional(),
  error: zod.string().nullable().optional(),
  approvalStatus: zod.enum(["approved", "rejected"]).optional(),
});

export const MarketingExperimentInput = zod.object({
  hypothesis: zod.string().min(1),
  variable: zod.string().min(1),
  productId: zod.number().optional(),
  campaignId: zod.string().optional(),
  controlDraftId: zod.number().optional(),
  variantDraftId: zod.number().optional(),
  controlLabel: zod.string().optional(),
  variantLabel: zod.string().optional(),
  budget: zod.number().optional(),
  durationDays: zod.number().optional(),
  minImpressions: zod.number().optional(),
});

export const MarketingExperimentPatch = zod.object({
  status: zod.enum(["EN_PRUEBA", "GANADOR", "PERDEDOR", "INCONCLUSO", "CANCELADO"]).optional(),
  result: zod.record(zod.string(), zod.unknown()).nullable().optional(),
  conclusion: zod.string().nullable().optional(),
  learning: zod.string().nullable().optional(),
  endedAt: zod.string().optional(),
});

export const MarketingBudgetUpdate = zod.object({
  maxDailySpend: zod.number().positive().optional(),
  maxBudgetChangePercent: zod.number().positive().optional(),
  maxScalePercent: zod.number().positive().optional(),
  approvalRequired: zod.boolean().optional(),
  currency: zod.string().min(1).optional(),
});
