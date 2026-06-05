import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { stores } from "./stores";

export const store_layouts = pgTable("store_layouts", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id")
    .references(() => stores.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  layoutData: jsonb("layout_data").notNull().default({}),
  version: text("version").notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StoreLayout = typeof store_layouts.$inferSelect;
export type InsertStoreLayout = typeof store_layouts.$inferInsert;
