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

/**
 * Memoria comercial del cliente, más allá de la conversación actual.
 *
 * Solo guarda lo que NO está ya en una columna: el nombre, el teléfono, la
 * etapa, el origen del anuncio y el estado de pago viven en `leads`; el
 * puntaje lo calcula `leadScoring`. Duplicarlos acá sería crear una segunda
 * verdad que se desincroniza.
 *
 * Todo lo de acá tiene que salir de algo que el cliente DIJO o hizo. Nada
 * inferido ni inventado: es la misma regla del resto del motor de ventas.
 */
export interface CommercialProfile {
  /** Fichas de producto que ya se le mandaron, en cualquier conversación. */
  productosVistos?: Array<{ id: number; nombre: string; fecha: string }>;
  /** Objeciones que ya puso, clasificadas por objectionHandler. */
  objeciones?: Array<{ tipo: string; fecha: string }>;
  /** Para envío. Sale de los datos de contraentrega, no de una suposición. */
  ciudad?: string | null;
  departamento?: string | null;
  /** ISO de la última vez que escribió. Permite decir "hace tres semanas". */
  ultimaInteraccion?: string | null;
  /** ISO de la última escritura de este perfil. */
  actualizado?: string;
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

  // ── Memoria comercial que SOBREVIVE a la conversación ─────────────────────
  // Lo que el vendedor tiene que recordar del cliente aunque vuelva en tres
  // semanas y en otro chat: qué fichas ya vio, qué objeciones puso, a dónde se
  // le envía. Vive acá y no en `conversations` porque el cliente es el lead,
  // no la conversación: `sentProductIds` de ConversationMemory se pierde al
  // abrirse un chat nuevo y el bot volvía a presentarle lo mismo.
  //
  // Es un jsonb y no columnas sueltas porque son datos cualitativos que van a
  // crecer (necesidades, preferencias, presupuesto) y no se consultan por SQL:
  // se leen enteros al armar el turno.
  commercialProfile: jsonb("commercial_profile").$type<CommercialProfile | null>().default(null),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;
