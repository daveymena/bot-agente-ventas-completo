import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { leads } from "./leads";

export const followUps = pgTable("follow_ups", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  followUpType: text("follow_up_type").notNull().default("check_in"),
  message: text("message").notNull(),
  priority: text("priority").notNull().default("medium"),
  stage: text("stage").notNull(),
  lastScore: integer("last_score").default(0),
  attempts: integer("attempts").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FollowUp = typeof followUps.$inferSelect;
export type InsertFollowUp = typeof followUps.$inferInsert;
