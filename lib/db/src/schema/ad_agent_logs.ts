import { integer, json, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const adAgentLogs = pgTable("ad_agent_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull(),
  adSetId: text("ad_set_id"),
  productName: text("product_name"),
  // 'spend_protection' (chequeo rapido, ventana corta) | 'trend_review' (chequeo de tendencia, ventana larga)
  checkType: text("check_type").notNull(),
  // 'suggested' (esperando aprobacion por WhatsApp) | 'approved' | 'rejected' | 'auto_applied' | 'no_action'
  status: text("status").notNull().default("suggested"),
  // 'pause' | 'resume' | 'increase_budget' | 'decrease_budget' | null (solo informe)
  suggestedAction: text("suggested_action"),
  reason: text("reason").notNull(),
  metricsSnapshot: json("metrics_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
});

export type AdAgentLog = typeof adAgentLogs.$inferSelect;
export type InsertAdAgentLog = typeof adAgentLogs.$inferInsert;
