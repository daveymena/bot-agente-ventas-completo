import { integer, numeric, pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { leads } from "./leads";
import { products } from "./products";
import { tenants } from "./tenants";

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),

  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("COP"),

  method: text("method").notNull(),                 // nequi, daviplata, transferencia, mercadopago, paypal, efectivo, otro
  status: text("status").notNull().default("pending"), // pending, confirmed, rejected, partial, refunded
  paymentStatus: text("payment_status"),             // approved, pending, rejected  (de la pasarela)

  proofReceived: boolean("proof_received").default(false),
  proofUrl: text("proof_url"),
  bankReference: text("bank_reference"),
  payerAccount: text("payer_account"),
  payerName: text("payer_name"),
  payerEmail: text("payer_email"),
  payerPhone: text("payer_phone"),

  verificationSource: text("verification_source"),   // 'webhook', 'email_bank', 'manual', 'whatsapp_image', 'self_declared'
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by"),                   // user id o 'system'

  notes: text("notes"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;
