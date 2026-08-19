import { numeric, pgTable, serial, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/** Contexto del anuncio de Meta/Instagram del que llegó el lead (click-to-WhatsApp).
 *  Se copia de messages.metadata (que llena extraerContextoDeAnuncio) al crear
 *  el lead, y es lo que permite cerrar la atribución ad → lead → venta real. */
export interface AdContext {
  adId?: string;        // ctwaClid / sourceId de Meta
  adTitle?: string;
  adBody?: string;
  adUrl?: string;
  capturedAt?: string;  // ISO timestamp del primer mensaje
}

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  stage: text("stage").notNull().default("new"),
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  source: text("source"),

  // ── Atribución de anuncios (MASTER PLAN §5.1 del README de integración) ──
  // Meta adjunta el externalAdReply al primer mensaje de un click-to-WhatsApp;
  // este jsonb guarda de qué anuncio vino el lead para cruzar con payments.
  adContext: jsonb("ad_context").$type<AdContext | null>().default(null),

  // ── Estado de pago ─────────────────────────────────────────────────────────
  paymentStatus: text("payment_status"),         // pending | confirmed | rejected
  lifetimeValue: numeric("lifetime_value", { precision: 12, scale: 2 }).default("0"),

  // Remarketing: true si el lead pidió no recibir más campañas (email/WhatsApp).
  optOut: boolean("opt_out").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;
