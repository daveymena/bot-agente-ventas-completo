import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const remarketingCampaigns = pgTable("remarketing_campaigns", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(), // "email" | "whatsapp"
  segment: text("segment"), // descripción legible de a quién se le mandó (ej: "stage=cierre")
  subject: text("subject"), // solo email
  message: text("message").notNull(),
  totalTargeted: integer("total_targeted").notNull().default(0),
  totalSent: integer("total_sent").notNull().default(0),
  totalFailed: integer("total_failed").notNull().default(0),
  totalOptedOut: integer("total_opted_out").notNull().default(0),
  results: jsonb("results").default([]), // [{ leadId, ok, error? }]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type RemarketingCampaign = typeof remarketingCampaigns.$inferSelect;
export type InsertRemarketingCampaign = typeof remarketingCampaigns.$inferInsert;
