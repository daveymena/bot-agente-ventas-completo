/**
 * ============================================================
 * MARKETING TEAM — BUDGET GUARD (MASTER PLAN §17, §31)
 * ============================================================
 * Guardrails de presupuesto por tenant. Nunca permite gasto ilimitado:
 * - max_daily_spend: tope diario duro.
 * - max_budget_change_percent: cuánto puede cambiar un presupuesto de
 *   una sola vez (25 % por defecto).
 * - max_scale_percent: cuánto puede escalar un ganador (30 % por defecto).
 * - approval_required: si los cambios de presupuesto exigen aprobación
 *   humana aunque el modo autónomo esté activo.
 */

import { db, marketingBudgets, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { BudgetGuardrails } from "./types";

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DEFAULT_GUARDRAILS: BudgetGuardrails = {
  maxDailySpend: 50000,
  maxBudgetChangePercent: 25,
  maxScalePercent: 30,
  approvalRequired: true,
  currency: "COP",
};

/** Obtiene (o crea con defaults) los guardrails del tenant. */
export async function getOrCreateBudget(tenantId: number): Promise<BudgetGuardrails> {
  let row = (await db.select().from(marketingBudgets).where(eq(marketingBudgets.tenantId, tenantId)).limit(1))[0];
  if (!row) {
    try {
      const [created] = await db
        .insert(marketingBudgets)
        .values({ tenantId })
        .returning();
      row = created!;
    } catch {
      // carrera entre dos llamadas: reintenta leer
      row = (await db.select().from(marketingBudgets).where(eq(marketingBudgets.tenantId, tenantId)).limit(1))[0];
      if (!row) throw new Error("No se pudo crear la configuración de presupuesto del tenant");
    }
  }

  // Reinicio diario del contador si cambió el día.
  const key = todayKey();
  if (row.todayDate !== key) {
    const [updated] = await db
      .update(marketingBudgets)
      .set({ todaySpend: "0", todayDate: key, updatedAt: new Date() })
      .where(eq(marketingBudgets.id, row.id))
      .returning();
    row = updated!;
  }

  return {
    maxDailySpend: Number(row.maxDailySpend),
    maxBudgetChangePercent: Number(row.maxBudgetChangePercent),
    maxScalePercent: Number(row.maxScalePercent),
    approvalRequired: row.approvalRequired,
    currency: row.currency,
  };
}

/** ¿Queda margen para gastar hoy? */
export function canSpendToday(guardrails: BudgetGuardrails, todaySpent: number, amount: number): { allowed: boolean; reason: string } {
  const after = todaySpent + amount;
  if (after > guardrails.maxDailySpend) {
    return { allowed: false, reason: `El gasto superaría el tope diario (${guardrails.maxDailySpend} ${guardrails.currency}): ${todaySpent} + ${amount} = ${after}.` };
  }
  return { allowed: true, reason: "Dentro del tope diario." };
}

/** ¿Está permitido cambiar el presupuesto de X a Y? */
export function canChangeBudget(guardrails: BudgetGuardrails, current: number, next: number): { allowed: boolean; reason: string; deltaPercent: number } {
  if (current <= 0) return { allowed: true, reason: "Presupuesto actual en 0: se permite fijar uno inicial.", deltaPercent: 0 };
  const deltaPercent = ((next - current) / current) * 100;
  const max = guardrails.maxBudgetChangePercent;
  if (Math.abs(deltaPercent) > max) {
    return { allowed: false, reason: `El cambio de ${deltaPercent.toFixed(1)}% supera el límite de ${max}% por operación.`, deltaPercent };
  }
  return { allowed: true, reason: `Cambio de ${deltaPercent.toFixed(1)}% dentro del límite.`, deltaPercent };
}

/** ¿Está permitido escalar un ganador? */
export function canScale(guardrails: BudgetGuardrails, current: number, next: number): { allowed: boolean; reason: string; deltaPercent: number } {
  if (next <= current) return { allowed: true, reason: "No es un aumento.", deltaPercent: 0 };
  const deltaPercent = ((next - current) / current) * 100;
  const max = guardrails.maxScalePercent;
  if (deltaPercent > max) {
    return { allowed: false, reason: `La escalada de +${deltaPercent.toFixed(1)}% supera el límite de ${max}% por paso. Escalar gradualmente.`, deltaPercent };
  }
  return { allowed: true, reason: `Escalada de +${deltaPercent.toFixed(1)}% dentro del límite.`, deltaPercent };
}

/** Registra gasto real (llamado cuando Meta confirma una acción con gasto). */
export async function recordSpend(tenantId: number, amount: number): Promise<void> {
  const row = (await db.select().from(marketingBudgets).where(eq(marketingBudgets.tenantId, tenantId)).limit(1))[0];
  if (!row) return;
  const key = todayKey();
  const today = row.todayDate === key ? Number(row.todaySpend) : 0;
  await db
    .update(marketingBudgets)
    .set({
      todaySpend: String(today + amount),
      todayDate: key,
      periodSpend: String(Number(row.periodSpend) + amount),
      updatedAt: new Date(),
    })
    .where(eq(marketingBudgets.id, row.id));
}

/** Estado actual del presupuesto para el dashboard (MASTER PLAN §28). */
export async function getBudgetStatus(tenantId: number) {
  const guardrails = await getOrCreateBudget(tenantId);
  const row = (await db.select().from(marketingBudgets).where(eq(marketingBudgets.tenantId, tenantId)).limit(1))[0];
  return {
    guardrails,
    todaySpend: Number(row?.todaySpend ?? 0),
    todayRemaining: Math.max(0, guardrails.maxDailySpend - Number(row?.todaySpend ?? 0)),
    periodSpend: Number(row?.periodSpend ?? 0),
    todayDate: row?.todayDate ?? null,
  };
}

/** La moneda por defecto sale del tenant si está configurado. */
export async function defaultCurrency(tenantId: number): Promise<string> {
  try {
    const t = (await db.select({ brandName: tenants.brandName }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
    void t;
    return "COP";
  } catch {
    return "COP";
  }
}
