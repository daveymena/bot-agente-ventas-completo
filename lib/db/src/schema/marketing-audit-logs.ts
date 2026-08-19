import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Audit log del Marketing Team (MASTER PLAN §32).
 *
 * Registra TODAS las acciones importantes de los agentes de marketing:
 * timestamp, tenant, agente, tarea, acción, recurso, before/after, aprobación,
 * resultado y error. Nunca se finge éxito: `result` solo es SUCCESS si la
 * acción fue verificada contra la API/Meta.
 */
export const marketingAuditLogs = pgTable("marketing_audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  agent: text("agent").notNull(),                           // ej: MetaAdsManager, BudgetManager
  taskId: integer("task_id"),
  action: text("action").notNull(),                         // ej: UPDATE_BUDGET, CREATE_CAMPAIGN, PAUSE_CAMPAIGN
  resource: text("resource"),                               // ej: campaign:123, ad_set:456
  before: jsonb("before").$type<Record<string, any> | null>().default(null),
  after: jsonb("after").$type<Record<string, any> | null>().default(null),
  approval: text("approval"),                               // null | admin | system | auto_within_limits
  reason: text("reason"),
  result: text("result").notNull().default("PENDING"),      // PENDING | SUCCESS | FAILED | MANUAL_ACTION_REQUIRED
  error: text("error"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MarketingAuditLog = typeof marketingAuditLogs.$inferSelect;
export type InsertMarketingAuditLog = typeof marketingAuditLogs.$inferInsert;
