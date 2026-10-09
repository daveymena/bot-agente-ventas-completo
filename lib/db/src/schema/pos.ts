import { boolean, integer, jsonb, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { products } from "./products";
import { payments } from "./payments";

/**
 * POS tienda física — movimientos de inventario.
 *
 * Cada entrada, venta, devolución y ajuste deja una fila con el saldo
 * resultante: el stock (`products.stock`) es el acumulado y esta tabla es
 * la auditoría. `cantidad` con signo (entrada +, venta −) y `saldo` el
 * stock del producto DESPUÉS del movimiento.
 */
export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  tipo: text("tipo").notNull().default("ajuste"),
  cantidad: integer("cantidad").notNull().default(0),
  saldo: integer("saldo"),
  motivo: text("motivo"),
  refTipo: text("ref_tipo"),
  refId: integer("ref_id"),
  creadoPor: text("creado_por"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type InventoryMovement = typeof inventoryMovements.$inferSelect;

/**
 * POS tienda física — sesiones de caja (apertura y cierre / arqueo).
 *
 * `ventasEfectivo`/`ventasOtros` se calculan al cerrar desde los pagos del
 * turno; `esperado = fondoInicial + ventasEfectivo`, `diferencia =
 * contado − esperado`. Compatible con el arqueo de cualquier sistema
 * profesional.
 */
export const cajaSesiones = pgTable("caja_sesiones", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  abiertaEn: timestamp("abierta_en", { withTimezone: true }).defaultNow().notNull(),
  cerradaEn: timestamp("cerrada_en", { withTimezone: true }),
  abiertaPor: text("abierta_por"),
  cerradaPor: text("cerrada_por"),
  fondoInicial: real("fondo_inicial").notNull().default(0),
  estado: text("estado").notNull().default("abierta"),
  ventasEfectivo: real("ventas_efectivo").notNull().default(0),
  ventasOtros: real("ventas_otros").notNull().default(0),
  esperado: real("esperado"),
  contado: real("contado"),
  diferencia: real("diferencia"),
  notas: text("notas"),
});

export type CajaSesion = typeof cajaSesiones.$inferSelect;

/**
 * POS tienda física — devoluciones contra una venta (`payments`).
 *
 * `items` = [{ productId, cantidad, precio }] devuelto. El stock se
 * reintegra y cada devolución valida no devolver más de lo vendido
 * (descontando devoluciones previas). La nota crédito fiscal, si aplica,
 * la emite el sistema de facturación conectado.
 */
export const posDevoluciones = pgTable("pos_devoluciones", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  pagoId: integer("pago_id").references(() => payments.id, { onDelete: "set null" }),
  items: jsonb("items").$type<Array<{ productId: number | null; cantidad: number; precio: number }>>().notNull().default([]),
  motivo: text("motivo"),
  total: real("total").notNull().default(0),
  creadoPor: text("creado_por"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PosDevolucion = typeof posDevoluciones.$inferSelect;
