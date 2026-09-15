import { boolean, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { products } from "./products";

/**
 * Cupones / promociones reales del negocio.
 *
 * Un cupón es un descuento CON datos reales (código, tipo, valor, vigencia y
 * límites), no un descuento inventado por el modelo: por eso no choca con la
 * regla del repo de no fabricar promociones. `productId` nulo = aplica a todo
 * el catálogo; con producto, solo a ese producto.
 */
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  /** "porcentaje" | "fijo" */
  tipo: text("tipo").notNull().default("porcentaje"),
  /** % de descuento (tipo porcentaje) o monto a restar (tipo fijo). */
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  minimoCompra: numeric("minimo_compra", { precision: 12, scale: 2 }),
  usosMax: integer("usos_max"),
  usos: integer("usos").notNull().default(0),
  activo: boolean("activo").notNull().default(true),
  vigenciaInicio: timestamp("vigencia_inicio", { withTimezone: true }),
  vigenciaFin: timestamp("vigencia_fin", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = typeof coupons.$inferInsert;
