import { pgTable, serial, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { products } from "./products";

export const facebookDrafts = pgTable("facebook_drafts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  campaignId: text("campaign_id"),
  adSetId: text("ad_set_id"),
  adId: text("ad_id"),
  status: text("status").notNull().default("draft"),
  strategy: jsonb("strategy"),
  primaryText: text("primary_text"),
  headline: text("headline"),
  description: text("description"),
  imageUrl: text("image_url"),
  // Imágenes adicionales para anuncios carrusel (2+ fotos). imageUrl sigue
  // siendo la principal/primera para compatibilidad con lo que ya lee este
  // campo; images incluye TODAS (incluida la primera) cuando hay más de una.
  images: jsonb("images").$type<string[]>().default([]),
  niche: text("niche"),
  budget: integer("budget"),
  fbStatus: text("fb_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FacebookDraft = typeof facebookDrafts.$inferSelect;
export type InsertFacebookDraft = typeof facebookDrafts.$inferInsert;
