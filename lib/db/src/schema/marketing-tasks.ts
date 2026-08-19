import { boolean, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Motor de tareas del Marketing Team (MASTER PLAN §20).
 *
 * Permite que los agentes del equipo colaboren SIN acoplarse directamente:
 * cada agente recibe su tarea, la resuelve y entrega un resultado estructurado
 * (output) que otros agentes consumen como input. Mismo patrón de aislamiento
 * multi-tenant que el resto de las tablas (tenant_id con cascade).
 */
export const marketingTasks = pgTable("marketing_tasks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  parentTaskId: integer("parent_task_id"),
  requestedBy: text("requested_by"),                       // quién pidió la tarea (admin, orquestador, agente)
  assignedAgent: text("assigned_agent").notNull(),          // ej: MarketingStrategist, CreativeDirector, MetaAdsManager
  domain: text("domain").notNull().default("marketing"),
  action: text("action").notNull(),                         // ej: "research_market", "generate_copy_variants", "create_campaign_draft"
  priority: text("priority").notNull().default("medium"),   // low | medium | high
  // PENDING | PLANNING | RUNNING | WAITING_APPROVAL | BLOCKED | COMPLETED | FAILED | CANCELLED
  status: text("status").notNull().default("PENDING"),
  input: jsonb("input").$type<Record<string, any>>().notNull().default({}),
  output: jsonb("output").$type<Record<string, any> | null>().default(null),
  dependencies: jsonb("dependencies").$type<number[]>().notNull().default([]),
  risk: text("risk").notNull().default("LOW"),              // LOW | MEDIUM | HIGH | CRITICAL
  approvalRequired: boolean("approval_required").notNull().default(false),
  approvalStatus: text("approval_status"),                  // null | approved | rejected
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MarketingTask = typeof marketingTasks.$inferSelect;
export type InsertMarketingTask = typeof marketingTasks.$inferInsert;
