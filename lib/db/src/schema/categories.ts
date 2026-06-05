import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProductCategory = typeof productCategories.$inferSelect;
export type InsertProductCategory = typeof productCategories.$inferInsert;