import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { products } from "./products";

/**
 * Proyectos creados por Landing AI Studio.
 * El contenido es estructurado para que el editor, el motor IA y el publicador
 * puedan evolucionar independientemente sin almacenar HTML como única fuente.
 */
export const landingPages = pgTable("landing_pages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("draft"),
  strategy: jsonb("strategy").$type<Record<string, any>>().notNull().default({}),
  sections: jsonb("sections").$type<Array<Record<string, any>>>().notNull().default([]),
  design: jsonb("design").$type<Record<string, any>>().notNull().default({}),
  source: jsonb("source").$type<Record<string, any>>().notNull().default({}),
  publishedUrl: text("published_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LandingPage = typeof landingPages.$inferSelect;
export type InsertLandingPage = typeof landingPages.$inferInsert;
