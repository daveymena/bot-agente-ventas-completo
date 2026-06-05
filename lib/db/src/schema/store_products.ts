import { integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { stores } from "./stores";
import { store_categories } from "./store_categories";

export const store_products = pgTable("store_products", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id")
    .references(() => stores.id, { onDelete: "cascade" })
    .notNull(),
  categoryId: integer("category_id")
    .references(() => store_categories.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  thumbUrl: text("thumb_url"),
  deliveryLink: text("delivery_link"), // optional Google Drive link for auto‑delivery
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StoreProduct = typeof store_products.$inferSelect;
export type InsertStoreProduct = typeof store_products.$inferInsert;