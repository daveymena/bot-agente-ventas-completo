import { boolean, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { conversations } from "./conversations";

export const woocommerceStores = pgTable("woocommerce_stores", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  consumerKey: text("consumer_key").notNull(),
  consumerSecret: text("consumer_secret").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isCentral: boolean("is_central").notNull().default(false),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  syncedProductCount: integer("synced_product_count").notNull().default(0),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const wooOrders = pgTable("woo_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  storeId: integer("store_id").references(() => woocommerceStores.id, { onDelete: "set null" }),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  wooOrderId: integer("woo_order_id"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  items: text("items").notNull().default("[]"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("COP"),
  status: text("status").notNull().default("pending"),
  paymentMethod: text("payment_method"),
  paymentId: text("payment_id"),
  deliveryAddress: text("delivery_address"),
  notes: text("notes"),
  adminEscalated: boolean("admin_escalated").notNull().default(false),
  escalationReason: text("escalation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const nicheSearches = pgTable("niche_searches", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  query: text("query").notNull(),
  category: text("category"),
  region: text("region").notNull().default("CO"),
  results: text("results").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WoocommerceStore = typeof woocommerceStores.$inferSelect;
export type InsertWoocommerceStore = typeof woocommerceStores.$inferInsert;
export type WooOrder = typeof wooOrders.$inferSelect;
export type InsertWooOrder = typeof wooOrders.$inferInsert;
export type NicheSearch = typeof nicheSearches.$inferSelect;
export type InsertNicheSearch = typeof nicheSearches.$inferInsert;
