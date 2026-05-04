import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { products } from "./products";

export const paymentLinks = pgTable("payment_links", {
  id: serial("id").primaryKey(),
  shortCode: text("short_code").notNull().unique(),
  originalUrl: text("original_url").notNull(),
  method: text("method").notNull(), // 'mercadopago', 'paypal', etc.
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  clientPhone: text("client_phone"),
  clicks: integer("clicks").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  lastClickAt: timestamp("last_click_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PaymentLink = typeof paymentLinks.$inferSelect;
export type InsertPaymentLink = typeof paymentLinks.$inferInsert;