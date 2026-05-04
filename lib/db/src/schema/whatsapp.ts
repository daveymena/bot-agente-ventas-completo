import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const whatsappAuth = pgTable("whatsapp_auth", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WhatsappAuth = typeof whatsappAuth.$inferSelect;
export type InsertWhatsappAuth = typeof whatsappAuth.$inferInsert;
