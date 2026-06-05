import { integer, json, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  theme: json("theme").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Store = typeof stores.$inferSelect;
export type InsertStore = typeof stores.$inferInsert;