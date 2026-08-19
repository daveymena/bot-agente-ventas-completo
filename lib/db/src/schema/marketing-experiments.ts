import { integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { products } from "./products";
import { facebookDrafts } from "./facebook-drafts";

/**
 * Motor de experimentos del Marketing Team (MASTER PLAN §13).
 *
 * Todo marketing profesional trabaja con hipótesis: cada experimento registra
 * hipótesis, variable, control y variante (facebook_drafts), presupuesto,
 * duración, resultado y aprendizaje. No se declara ganador con datos
 * insuficientes: el estado solo pasa a GANADOR/PERDEDOR con un criterio de
 * muestra configurable (ver OptimizationAgent / ad-growth-agent
 * sampleBasedConfidence).
 */
export const marketingExperiments = pgTable("marketing_experiments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  campaignId: text("campaign_id"),                          // id de campaña Meta cuando existe
  hypothesis: text("hypothesis").notNull(),
  variable: text("variable").notNull(),                     // qué se está probando (copy, ángulo, audiencia, oferta)
  controlDraftId: integer("control_draft_id").references(() => facebookDrafts.id, { onDelete: "set null" }),
  variantDraftId: integer("variant_draft_id").references(() => facebookDrafts.id, { onDelete: "set null" }),
  controlLabel: text("control_label"),
  variantLabel: text("variant_label"),
  budget: numeric("budget", { precision: 12, scale: 2 }),
  durationDays: integer("duration_days"),
  minImpressions: integer("min_impressions").default(1000),
  // EN_PRUEBA | GANADOR | PERDEDOR | INCONCLUSO | CANCELADO
  status: text("status").notNull().default("EN_PRUEBA"),
  result: jsonb("result").$type<{
    control?: Record<string, any>;
    variant?: Record<string, any>;
    winner?: "control" | "variant" | null;
  } | null>().default(null),
  conclusion: text("conclusion"),
  learning: text("learning"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MarketingExperiment = typeof marketingExperiments.$inferSelect;
export type InsertMarketingExperiment = typeof marketingExperiments.$inferInsert;
