import { numeric, pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  stage: text("stage").notNull().default("new"),
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;
