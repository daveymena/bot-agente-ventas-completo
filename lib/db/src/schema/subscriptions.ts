import { pgTable, serial, integer, text, timestamp, decimal, boolean, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(), // free, starter, professional, enterprise
  status: text("status").notNull().default("pending"), // pending, active, cancelled, expired, failed
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly, annual
  
  // Información de pago
  paymentMethod: text("payment_method").notNull(), // mercadopago, paypal
  paymentId: text("payment_id"), // ID de la transacción en el proveedor
  paymentStatus: text("payment_status"), // approved, pending, rejected, refunded
  
  // Montos
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  
  // Fechas
  startedAt: timestamp("started_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  nextBillingDate: timestamp("next_billing_date", { withTimezone: true }),
  
  // Renovación automática
  autoRenew: boolean("auto_renew").default(true),
  
  // Token de activación
  activationToken: text("activation_token"),
  tokenSentAt: timestamp("token_sent_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  
  // Metadata adicional
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Información del pago
  paymentMethod: text("payment_method").notNull(), // mercadopago, paypal
  paymentId: text("payment_id").notNull(), // ID único del proveedor
  paymentStatus: text("payment_status").notNull(), // approved, pending, rejected, refunded
  
  // Montos
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  
  // Detalles del producto
  plan: text("plan").notNull(),
  billingCycle: text("billing_cycle").notNull(),
  
  // Información del pagador
  payerEmail: text("payer_email"),
  payerName: text("payer_name"),
  payerId: text("payer_id"),
  
  // Webhook data
  webhookData: jsonb("webhook_data"),
  
  // Fechas
  paidAt: timestamp("paid_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type InsertPaymentTransaction = typeof paymentTransactions.$inferInsert;
