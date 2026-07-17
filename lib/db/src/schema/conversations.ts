import { integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { leads } from "./leads";
import { tenants } from "./tenants";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  avatarColor: text("avatar_color").notNull().default("#10b981"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  unreadCount: integer("unread_count").notNull().default(0),
  status: text("status").notNull().default("ai"),
  currentStage: text("current_stage"),
  channel: text("channel").default("whatsapp"),
  agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),

  // ── Estado de pago ──────────────────────────────────────────────────────────
  paymentStatus: text("payment_status"),           // pending | confirmed | rejected | refunded
  paymentMethod: text("payment_method"),           // nequi | daviplata | transferencia | mercadopago | paypal
  paymentAmount: numeric("payment_amount", { precision: 12, scale: 2 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
