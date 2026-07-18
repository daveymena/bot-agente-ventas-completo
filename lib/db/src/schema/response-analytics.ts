import {
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { agents } from "./agents";

export type ResponseOutcome =
  | "sale_completed"
  | "lead_progressed"
  | "customer_satisfied"
  | "customer_confused"
  | "customer_left"
  | "objection_raised"
  | "info_requested"
  | "no_action";

export interface ResponseAnalytics {
  id: number;
  tenantId: number | null;
  agentId: number | null;
  profileId: number | null;
  conversationId: number | null;
  messageId: number | null;
  responseText: string;
  responseLength: number;
  hadCard: boolean;
  cardProductId: number | null;
  outcome: ResponseOutcome | null;
  customerMessage: string;
  sentimentScore: number | null;
  responseTimeMs: number;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

export interface InsertResponseAnalytics {
  tenantId?: number | null;
  agentId?: number | null;
  profileId?: number | null;
  conversationId?: number | null;
  messageId?: number | null;
  responseText: string;
  responseLength: number;
  hadCard: boolean;
  cardProductId?: number | null;
  outcome?: ResponseOutcome | null;
  customerMessage: string;
  sentimentScore?: number | null;
  responseTimeMs: number;
  metadata?: Record<string, any> | null;
}

export const responseAnalytics = pgTable("response_analytics", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, {
    onDelete: "cascade",
  }),
  agentId: integer("agent_id").references(() => agents.id, {
    onDelete: "set null",
  }),
  profileId: integer("profile_id"),
  conversationId: integer("conversation_id"),
  messageId: integer("message_id"),
  responseText: text("response_text").notNull(),
  responseLength: integer("response_length").notNull(),
  hadCard: boolean("had_card").notNull().default(false),
  cardProductId: integer("card_product_id"),
  outcome: text("outcome").$type<ResponseOutcome>(),
  customerMessage: text("customer_message").notNull(),
  sentimentScore: integer("sentiment_score"),
  responseTimeMs: integer("response_time_ms").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any> | null>().default(null),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
