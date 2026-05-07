import { boolean, integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(),
  status: text("status").notNull().default("pending"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  paymentMethod: text("payment_method").notNull(),
  paymentId: text("payment_id"),
  paymentStatus: text("payment_status"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  nextBillingDate: timestamp("next_billing_date", { withTimezone: true }),
  autoRenew: boolean("auto_renew").default(true),
  metadata: jsonb("metadata"),
  activationToken: text("activation_token").unique(),
  tokenSentAt: timestamp("token_sent_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
