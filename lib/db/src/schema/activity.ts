import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const activityEvents = pgTable("activity_events", {
  id: serial("id").primaryKey(),
  // De QUE negocio es esta actividad. Faltaba, y el feed del panel se
  // compartia entre todas las cuentas: el aviso de un negocio le aparecia a
  // los demas. Nullable porque las filas viejas no tienen dueno conocido.
  tenantId: integer("tenant_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertActivityEvent = typeof activityEvents.$inferInsert;
