import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * ============================================================
 * CUÁNTAS CONVERSACIONES (ventanas de 24h) LLEVA CADA NEGOCIO
 * ============================================================
 *
 * WhatsApp Cloud API cobra POR CONVERSACIÓN (una ventana de 24h por cliente),
 * no por mensaje. Este es el medidor que permite pasarle ese costo a cada
 * negocio: una fila por (negocio, mes), igual que `consumo-mensual.ts` pero
 * contando conversaciones en vez de mensajes.
 *
 * Por qué aparte de `consumo_mensual`: son dos unidades de cobro distintas.
 * Un cliente puede mandar 5 mensajes en una sola ventana de 24h (5 mensajes,
 * 1 conversación); cobrar por mensaje y cobrar por conversación no son lo
 * mismo, y mezclarlos en una columna hace imposible saber cuál fue cuál.
 */
export const consumoConversaciones = pgTable(
  "consumo_conversaciones",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    /** "2026-09". Texto, para agrupar sin funciones de fecha. */
    periodo: text("periodo").notNull(),
    /** Conversaciones (ventanas de 24h) que el negocio tuvo este mes. */
    conversaciones: integer("conversaciones").notNull().default(0),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    porNegocioYPeriodo: uniqueIndex("consumo_conversaciones_tenant_periodo").on(t.tenantId, t.periodo),
  }),
);

export type ConsumoConversaciones = typeof consumoConversaciones.$inferSelect;
