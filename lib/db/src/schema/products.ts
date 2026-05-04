import { boolean, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { productCategories } from "./categories";
import { tenants } from "./tenants";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  sku: text("sku"),
  categoryId: integer("category_id").references(() => productCategories.id, { onDelete: "set null" }),
  category: text("category"),
  kind: text("kind").notNull().default("digital"),
  imageUrl: text("image_url"),
  highlight: text("highlight"),
  features: text("features").array(),
  paymentLink: text("payment_link"),
  deliveryLink: text("delivery_link"),
  isActive: boolean("is_active").notNull().default(true),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
