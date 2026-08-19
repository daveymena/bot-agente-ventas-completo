import { boolean, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Guardrails de presupuesto del Marketing Team (MASTER PLAN §17, §31).
 *
 * Configuración por tenant con límites duros. El BudgetManager NUNCA permite
 * gasto ilimitado: toda escalada o cambio de presupuesto se valida contra estos
 * valores antes de proponer/ejecutar (modo autónomo con guardrails).
 */
export const marketingBudgets = pgTable("marketing_budgets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull().unique(),
  maxDailySpend: numeric("max_daily_spend", { precision: 12, scale: 2 }).notNull().default("50000"),
  maxBudgetChangePercent: numeric("max_budget_change_percent", { precision: 5, scale: 2 }).notNull().default("25"),
  maxScalePercent: numeric("max_scale_percent", { precision: 5, scale: 2 }).notNull().default("30"),
  approvalRequired: boolean("approval_required").notNull().default(true),
  currency: text("currency").notNull().default("COP"),
  // Gastos acumulados del día y del período (para freno de tope diario).
  todaySpend: numeric("today_spend", { precision: 12, scale: 2 }).notNull().default("0"),
  todayDate: varchar("today_date", { length: 10 }),
  periodSpend: numeric("period_spend", { precision: 12, scale: 2 }).notNull().default("0"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MarketingBudget = typeof marketingBudgets.$inferSelect;
export type InsertMarketingBudget = typeof marketingBudgets.$inferInsert;
