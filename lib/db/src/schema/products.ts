import { boolean, integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { productCategories } from "./categories";
import { tenants } from "./tenants";

/**
 * Una opción que el cliente tiene que elegir antes de comprar.
 *
 * Talla, color, sabor, cantidad de personas, modelo de auto. Sin esto el bot
 * cierra el pedido SIN saber cuál quiere -- y eso no falla en silencio: llega
 * la prenda equivocada y hay devolución. Es peor que no vender.
 *
 * Va como lista de opciones y no como texto libre a propósito: el bot tiene
 * que poder preguntar "¿S, M o L?" y validar la respuesta contra algo. Con
 * texto libre volvería a adivinar, que es de donde salen los errores caros de
 * este proyecto.
 */
export interface OpcionDeProducto {
  /** Cómo se llama la decisión: "Talla", "Color", "Para cuántas personas". */
  nombre: string;
  /** Lo que el cliente puede elegir. */
  valores: string[];
  /** Si no elegir bloquea la compra. Una talla sí; un mensaje de regalo no. */
  obligatoria?: boolean;
}

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  sku: text("sku"),
  categoryId: integer("category_id").references(() => productCategories.id, { onDelete: "set null" }),
  category: text("category"),
  /**
   * "digital" | "physical" | "servicio".
   *
   * "servicio" se agregó el 2026-09-01: hasta entonces solo había dos valores,
   * y una peluquería, un taller o un consultorio no encajaban en ninguno. Un
   * servicio no se envía ni se descarga -- se AGENDA, y esa es una fase del
   * trato que ni existía.
   */
  kind: text("kind").notNull().default("digital"),

  /**
   * Cuántas unidades quedan. `null` = el negocio no lleva control.
   *
   * Nullable a propósito, y no `0` por defecto: un catálogo digital no tiene
   * stock, y arrancar todo en cero haría que el bot dijera "agotado" sobre 84
   * cursos que están perfectamente disponibles. `null` significa "no
   * preguntes", que es distinto de "no hay".
   */
  stock: integer("stock"),

  /** Lo que el cliente tiene que elegir antes de comprar. Ver OpcionDeProducto. */
  opciones: jsonb("opciones").$type<OpcionDeProducto[] | null>().default(null),

  imageUrl: text("image_url"),
  highlight: text("highlight"),
  features: text("features").array(),
  paymentLink: text("payment_link"),
  deliveryLink: text("delivery_link"),
  isActive: boolean("is_active").notNull().default(true),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
