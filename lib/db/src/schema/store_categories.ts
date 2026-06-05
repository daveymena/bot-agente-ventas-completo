import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { stores } from "./stores";

export const store_categories = pgTable("store_categories", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id")
    .references(() => stores.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StoreCategory = typeof store_categories.$inferSelect;
export type InsertStoreCategory = typeof store_categories.$inferInsert;