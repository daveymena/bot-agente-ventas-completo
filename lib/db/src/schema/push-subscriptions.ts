import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Suscripciones Web Push (VAPID) de los dispositivos del dueño.
 *
 * Cada fila = un navegador/celular donde el dueño activó "App en tu celular".
 * Se usa para avisarle al instante: mensajes de clientes, pedidos,
 * comprobantes y alertas del supervisor (vía `avisarAlDueno`).
 * Sin Firebase: estándar Web Push con las claves VAPID_* del entorno.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  dispositivo: text("dispositivo"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;
