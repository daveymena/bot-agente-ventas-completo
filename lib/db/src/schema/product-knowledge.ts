import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { products } from "./products";

/**
 * Lo que el agente sabe de UN producto, cargado por el dueño del negocio.
 *
 * Antes esto vivía en `conocimiento-producto.ts`, escrito a mano, con tres
 * productos adentro. Funcionaba para esos tres y para nadie más: un cliente
 * nuevo que cargaba su curso no tenía respuestas a "¿qué incluye?" ni "¿cuánto
 * dura?", y el bot le contestaba "déjame confirmarte ese dato exacto" a algo
 * que el dueño sabía perfectamente. Para agregarlo había que editar un `.ts` y
 * desplegar, o sea: el SaaS solo servía si el cliente sabía programar.
 *
 * ── Por qué disparadores y no expresiones regulares ─────────────────────
 *
 * La tabla vieja usa regex, y para un dueño de negocio eso es intocable. Acá
 * se guardan PALABRAS Y FRASES sueltas ("qué incluye", "temario", "módulos") y
 * el cotejo lo hace el código normalizando y buscando. Nadie puede romper el
 * sistema con un paréntesis mal cerrado, y el dueño escribe como habla.
 *
 * ── `respuesta` puede ser NULL, y es a propósito ────────────────────────
 *
 * NULL significa "esto me lo preguntan y NO lo tengo confirmado": el agente
 * dice que lo confirma en vez de inventarlo. Es la misma idea que ya existía
 * en la tabla escrita a mano, y es la que evita el certificado inventado y el
 * "Portuñol" como idioma.
 */
export const productKnowledge = pgTable("product_knowledge", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  /**
   * NULL = vale para TODO el catálogo de ese negocio.
   *
   * Sirve para lo que el dueño responde igual sin importar el producto
   * ("¿emiten factura?"), sin obligarlo a repetirlo producto por producto.
   */
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  /** Para qué es esta entrada, en palabras del dueño: "qué incluye". */
  pregunta: text("pregunta").notNull(),
  /** Palabras o frases que la disparan, separadas por coma. Nunca regex. */
  disparadores: text("disparadores").notNull(),
  /** NULL = se sabe que lo preguntan y NO hay dato: el agente dice que confirma. */
  respuesta: text("respuesta"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type ProductKnowledge = typeof productKnowledge.$inferSelect;
export type InsertProductKnowledge = typeof productKnowledge.$inferInsert;
