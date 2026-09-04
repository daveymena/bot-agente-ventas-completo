import { integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { products } from "./products";

/**
 * Vista del Marketing Team sobre las campañas (MASTER PLAN §12, §18).
 *
 * No es una segunda integración con Meta: los ids reales de campaña/ad set/anuncio
 * viven en facebook_drafts y en Meta. Esta tabla agrega la capa de planificación
 * del equipo: objetivo, presupuesto planeado, KPIs objetivo y estado de escala.
 */
export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  objective: text("objective").notNull(),                   // ventas | leads | engagement | tráfico
  status: text("status").notNull().default("PLANNED"),      // PLANNED | ACTIVE | PAUSED | COMPLETED | CANCELLED
  strategy: jsonb("strategy").$type<Record<string, any> | null>().default(null),
  budgetPlanned: numeric("budget_planned", { precision: 12, scale: 2 }),
  budgetSpent: numeric("budget_spent", { precision: 12, scale: 2 }).default("0"),
  targetKpis: jsonb("target_kpis").$type<Record<string, any> | null>().default(null),
  scalingState: jsonb("scaling_state").$type<{
    stage: "SEED" | "SCALING" | "HOLD" | "PAUSED";
    scaleHistory?: Array<{ at: string; from: number; to: number; reason: string }>;
  } | null>().default(null),
  metaIds: jsonb("meta_ids").$type<{
    campaignId?: string;
    adSetId?: string;
    adIds?: string[];
  } | null>().default(null),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = typeof marketingCampaigns.$inferInsert;
