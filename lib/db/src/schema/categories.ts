import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  color: text("color").notNull().default("#6b7280"),
  // Mismo enum que products.kind (digital/physical/service) -- separa qué
  // categorías son válidas para productos digitales vs físicos, para que no
  // se puedan mezclar (ver product_categories.kind en autoMigrate.ts).
  kind: text("kind").notNull().default("digital"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProductCategory = typeof productCategories.$inferSelect;
export type InsertProductCategory = typeof productCategories.$inferInsert;