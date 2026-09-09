import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export type AgentStage = {
  key: string;
  name: string;
  prompt: string;
};

export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  tone: text("tone").notNull(),
  language: text("language").notNull().default("es"),
  model: text("model").notNull().default("gpt-5.6-luna"),
  especialidad: text("especialidad"),
  systemPrompt: text("system_prompt").notNull(),
  stages: jsonb("stages").$type<AgentStage[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;
