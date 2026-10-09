/**
 * POS — punto de venta para TIENDAS FÍSICAS.
 *
 * El cliente compra en el local, se descuenta del inventario y sale con
 * factura (la del sistema que el negocio ya conectó en Facturación) o
 * recibo. Nada de vender humo: sin stock registrado no hay venta.
 *
 * Piezas (estándar de cualquier POS profesional):
 *   - Inventario: entradas, ajustes y valorizado (`products.stock` acumula,
 *     `inventory_movements` audita con saldo resultante).
 *   - Caja: apertura con fondo, cierre con arqueo (esperado vs. contado).
 *   - Venta: N ítems con descuento e impuesto por línea, N medios de pago
 *     (el efectivo cae a la caja abierta), un pago confirmado por venta.
 *   - Devoluciones: contra la venta original, sin devolver más de lo
 *     vendido; el stock se reintegra.
 *   - Reportes y exportación (JSON/CSV) para el contador o un sistema
 *     externo (Alegra, Siigo vía webhook, Excel).
 *
 * Solo para negocios con `businessProfile.formato === "tienda_fisica"`.
 * Los productos de la tienda siguen siendo productos del catálogo: la
 * ficha, los anuncios y el vendedor los pueden promocionar igual que los
 * de dropshipping o digitales.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, tenants, products, payments, inventoryMovements, cajaSesiones, posDevoluciones } from "@workspace/db";
import { logger } from "./logger";
import { dbNow } from "./date-utils";

export const CANAL_TIENDA = "tienda_fisica";
export const STOCK_BAJO = 5;

export interface PosItemEntrada {
  productId: number;
  cantidad: number;
  descuentoPct?: number;
  impuestoPct?: number;
}

export interface PosCliente {
  nombre?: string | null;
  documento?: string | null;
  correo?: string | null;
  telefono?: string | null;
}

export interface PosLinea {
  productId: number | null;
  nombre: string;
  cantidad: number;
  precio: number;
  descuentoPct: number;
  impuestoPct: number;
  subtotal: number;
  descuento: number;
  impuesto: number;
  total: number;
}

function metaDe(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as any;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

function perfilDe(tenant: any): Record<string, any> {
  return metaDe(tenant?.metadata).businessProfile || {};
}

/** ¿Este negocio atiende como tienda física con inventario? */
export async function esTiendaFisica(tenantId: number): Promise<boolean> {
  const [t] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return perfilDe(t).formato === CANAL_TIENDA;
}

/** Marca el negocio como tienda física (lo que habilita el POS). */
export async function activarTiendaFisica(tenantId: number): Promise<void> {
  const [t] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw new Error(`No existe el negocio #${tenantId}.`);
  const meta = metaDe(t.metadata);
  await db.update(tenants)
    .set({ metadata: { ...meta, businessProfile: { ...perfilDe(t), formato: CANAL_TIENDA } } } as any)
    .where(eq(tenants.id, tenantId));
}

async function exigirTienda(tenantId: number): Promise<void> {
  if (!(await esTiendaFisica(tenantId))) {
    throw new Error("Este negocio no está marcado como tienda física. Actívalo primero (tienda_activar).");
  }
}

async function productoDe(tenantId: number, productId: number): Promise<any> {
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
  if (!p) throw new Error(`El producto #${productId} no es de este negocio.`);
  if ((p as any).isActive === false) throw new Error(`"${(p as any).name}" está desactivado.`);
  return p;
}

async function moverStock(
  tenantId: number, productId: number, cantidad: number, tipo: string, motivo: string | null, refTipo: string | null, refId: number | null, creadoPor?: string | null,
): Promise<number> {
  const p = await productoDe(tenantId, productId);
  const antes = (p as any).stock == null ? null : Number((p as any).stock);
  const despues = (antes ?? 0) + cantidad;
  await db.update(products).set({ stock: despues } as any).where(eq(products.id, productId));
  await db.insert(inventoryMovements).values({
    tenantId, productId, tipo, cantidad, saldo: despues, motivo,
    refTipo, refId, creadoPor: creadoPor ?? null,
  } as any);
  return despues;
}

/** Inventario con valorizado y alerta de stock bajo. */
export async function inventarioDelNegocio(tenantId: number): Promise<{ items: Array<{ id: number; nombre: string; sku: string | null; precio: number; stock: number | null; conControl: boolean; stockBajo: boolean; valorizado: number | null }>; totalUnidades: number; valorizado: number; sinControl: number }> {
  await exigirTienda(tenantId);
  const filas = await db
    .select({ id: products.id, name: products.name, sku: products.sku, price: products.price, stock: products.stock })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq((products as any).isActive, true)))
    .orderBy(desc(products.id))
    .limit(500);
  const items = (filas as any[]).map((f) => {
    const stock = f.stock == null ? null : Number(f.stock);
    const precio = Number(f.price) || 0;
    return {
      id: f.id, nombre: f.name, sku: f.sku ?? null, precio, stock,
      conControl: stock != null, stockBajo: stock != null && stock <= STOCK_BAJO,
      valorizado: stock == null ? null : stock * precio,
    };
  });
  return {
    items,
    totalUnidades: items.reduce((a, i) => a + (i.stock ?? 0), 0),
    valorizado: items.reduce((a, i) => a + (i.valorizado ?? 0), 0),
    sinControl: items.filter((i) => !i.conControl).length,
  };
}

/** Suma mercadería al stock (compra a proveedor, inventario inicial...). */
export async function registrarEntrada(
  tenantId: number, productId: number, cantidad: number, motivo?: string | null, creadoPor?: string | null,
): Promise<{ stock: number }> {
  await exigirTienda(tenantId);
  const cant = Math.trunc(Number(cantidad));
  if (!Number.isFinite(cant) || cant <= 0) throw new Error("La cantidad de entrada debe ser un entero mayor que cero.");
  const stock = await moverStock(tenantId, productId, cant, "entrada", motivo || "Entrada de mercadería", "entrada", null, creadoPor);
  logger.info({ tenantId, productId, cant, stock }, "[POS] entrada de inventario");
  return { stock };
}

/** Fija el saldo exacto (conteo físico): la diferencia queda auditada. */
export async function ajustarStock(
  tenantId: number, productId: number, nuevoSaldo: number, motivo?: string | null, creadoPor?: string | null,
): Promise<{ stock: number }> {
  await exigirTienda(tenantId);
  const saldo = Math.trunc(Number(nuevoSaldo));
  if (!Number.isFinite(saldo) || saldo < 0) throw new Error("El saldo debe ser un entero mayor o igual a cero.");
  const p = await productoDe(tenantId, productId);
  const antes = (p as any).stock == null ? 0 : Number((p as any).stock);
  const stock = await moverStock(tenantId, productId, saldo - antes, "ajuste", motivo || `Ajuste: ${antes} → ${saldo}`, "ajuste", null, creadoPor);
  return { stock };
}

function lineaDe(p: any, it: PosItemEntrada): PosLinea {
  const cantidad = Math.trunc(Number(it.cantidad));
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error(`Cantidad inválida para "${p.name}".`);
  const precio = Number(p.price) || 0;
  const descuentoPct = Math.min(100, Math.max(0, Number(it.descuentoPct) || 0));
  const impuestoPct = Math.max(0, Number(it.impuestoPct) || 0);
  const subtotal = cantidad * precio;
  const descuento = (subtotal * descuentoPct) / 100;
  const base = subtotal - descuento;
  const impuesto = (base * impuestoPct) / 100;
  return {
    productId: p.id, nombre: p.name, cantidad, precio, descuentoPct, impuestoPct,
    subtotal, descuento, impuesto, total: base + impuesto,
  };
}

export interface VentaPos {
  items: PosItemEntrada[];
  metodoPago: string;
  cliente?: PosCliente;
  cajaId?: number | null;
  creadoPor?: string | null;
}

export interface ResultadoVenta {
  pagoId: number;
  total: number;
  lineas: PosLinea[];
  factura?: { numero?: string | null; proveedor: string } | null;
  facturaError?: string | null;
}

/**
 * La venta del mostrador: valida stock → descuenta → pago confirmado →
 * factura con el sistema conectado (o recibo si no hay). Una venta, un
 * pago, una factura: como en un POS profesional.
 */
export async function venderEnTienda(tenantId: number, venta: VentaPos): Promise<ResultadoVenta> {
  await exigirTienda(tenantId);
  if (!venta.items?.length) throw new Error("La venta no tiene ítems.");
  if (venta.items.length > 50) throw new Error("Máximo 50 líneas por venta.");
  const metodo = String(venta.metodoPago || "").trim().toLowerCase() || "efectivo";

  const lineas: PosLinea[] = [];
  for (const it of venta.items) {
    const p = await productoDe(tenantId, Number(it.productId));
    const stock = (p as any).stock == null ? null : Number((p as any).stock);
    if (stock == null) throw new Error(`"${p.name}" no lleva control de inventario: registra una entrada primero.`);
    const cant = Math.trunc(Number(it.cantidad));
    if (stock < cant) throw new Error(`Sin stock suficiente de "${p.name}": hay ${stock}, piden ${cant}.`);
    lineas.push(lineaDe(p, it));
  }
  const total = lineas.reduce((a, l) => a + l.total, 0);
  if (total <= 0) throw new Error("El total de la venta debe ser mayor que cero.");

  const cliente = venta.cliente || {};
  const moneda = "COP";
  const [pago] = await db.insert(payments).values({
    tenantId,
    productId: lineas.length === 1 ? lineas[0].productId : null,
    amount: total, currency: moneda, method: metodo, status: "confirmed",
    paymentStatus: "paid", payerName: cliente.nombre || "Consumidor final",
    payerEmail: cliente.correo || null, payerPhone: cliente.telefono || null,
    verifiedAt: dbNow(), verifiedBy: "pos",
    notes: `Venta de mostrador (${lineas.length} línea(s))`,
    metadata: JSON.stringify({
      canal: CANAL_TIENDA, cajaId: venta.cajaId ?? null, creadoPor: venta.creadoPor ?? null,
      documento: cliente.documento || null,
      items: lineas.map((l) => ({ productId: l.productId, nombre: l.nombre, cantidad: l.cantidad, precio: l.precio, descuentoPct: l.descuentoPct, impuestoPct: l.impuestoPct, total: l.total })),
    }),
  } as any).returning({ id: payments.id });
  const pagoId = (pago as any).id as number;

  for (const l of lineas) {
    await moverStock(tenantId, l.productId!, -l.cantidad, "venta", `Venta #${pagoId}`, "venta", pagoId, venta.creadoPor);
  }

  let factura: ResultadoVenta["factura"] = null;
  let facturaError: string | null = null;
  try {
    const { facturarPago } = await import("./facturacion");
    const f = await facturarPago(pagoId);
    if (f.ok) factura = { numero: f.factura.numero ?? null, proveedor: f.factura.proveedor };
    else facturaError = f.error;
  } catch (e: any) {
    facturaError = String(e?.message || e).slice(0, 200);
  }
  logger.info({ tenantId, pagoId, total, metodo, factura: !!factura }, "[POS] venta de mostrador");
  return { pagoId, total, lineas, factura, facturaError };
}

/* ─── Caja ─────────────────────────────────────────────────────────────── */

export async function cajaAbierta(tenantId: number): Promise<any | null> {
  const [c] = await db.select().from(cajaSesiones)
    .where(and(eq(cajaSesiones.tenantId, tenantId), eq(cajaSesiones.estado, "abierta")))
    .orderBy(desc(cajaSesiones.id)).limit(1);
  return c ?? null;
}

export async function abrirCaja(tenantId: number, fondoInicial = 0, abiertaPor?: string | null): Promise<any> {
  await exigirTienda(tenantId);
  if (await cajaAbierta(tenantId)) throw new Error("Ya hay una caja abierta: ciérrala antes de abrir otra.");
  const fondo = Math.max(0, Number(fondoInicial) || 0);
  const [c] = await db.insert(cajaSesiones).values({ tenantId, fondoInicial: fondo, abiertaPor: abiertaPor ?? null } as any).returning();
  return c;
}

function fechaDe(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  const s = String(v || "").trim();
  if (!s) return 0;
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Ventas del canal tienda desde un momento, separando efectivo del resto.
 * Si se da `cajaId`, solo cuenta las ventas de esa caja (corte exacto). */
export async function ventasDelTurno(tenantId: number, desde: unknown, cajaId?: number | null): Promise<{ efectivo: number; otros: number; cantidad: number }> {
  const desdeMs = fechaDe(desde);
  const filas = await db
    .select({ amount: payments.amount, method: payments.method, metadata: payments.metadata, createdAt: payments.createdAt, status: payments.status })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.status, "confirmed")));
  let efectivo = 0, otros = 0, cantidad = 0;
  for (const f of filas as any[]) {
    const meta = metaDe(f.metadata);
    if (meta.canal !== CANAL_TIENDA) continue;
    if (cajaId != null && Number(meta.cajaId) !== Number(cajaId)) continue;
    if (fechaDe(f.createdAt) < desdeMs) continue;
    const m = Number(f.amount) || 0;
    if (String(f.method || "").toLowerCase() === "efectivo") efectivo += m;
    else otros += m;
    cantidad += 1;
  }
  return { efectivo, otros, cantidad };
}

/** Cierre con arqueo: lo esperado sale del sistema, el dueño cuenta el cajón. */
export async function cerrarCaja(tenantId: number, contado: number, cerradaPor?: string | null, notas?: string | null): Promise<any> {
  await exigirTienda(tenantId);
  const caja = await cajaAbierta(tenantId);
  if (!caja) throw new Error("No hay ninguna caja abierta.");
  const v = await ventasDelTurno(tenantId, (caja as any).abiertaEn, (caja as any).id);
  const fondo = Number((caja as any).fondoInicial) || 0;
  const esperado = fondo + v.efectivo;
  const cont = Number(contado);
  if (!Number.isFinite(cont) || cont < 0) throw new Error("El contado debe ser un número mayor o igual a cero.");
  const [cerrada] = await db.update(cajaSesiones).set({
    cerradaEn: dbNow(), cerradaPor: cerradaPor ?? null, estado: "cerrada",
    ventasEfectivo: v.efectivo, ventasOtros: v.otros, esperado,
    contado: cont, diferencia: cont - esperado, notas: notas ?? null,
  } as any).where(eq(cajaSesiones.id, (caja as any).id)).returning();
  logger.info({ tenantId, cajaId: (caja as any).id, esperado, cont }, "[POS] cierre de caja");
  return { ...cerrada, ventasCantidad: v.cantidad };
}

/* ─── Devoluciones ─────────────────────────────────────────────────────── */

async function yaDevuelto(tenantId: number, pagoId: number): Promise<Map<number, number>> {
  const filas = await db.select({ items: posDevoluciones.items }).from(posDevoluciones)
    .where(and(eq(posDevoluciones.tenantId, tenantId), eq(posDevoluciones.pagoId, pagoId)));
  const mapa = new Map<number, number>();
  for (const f of filas as any[]) {
    const items = Array.isArray(f.items) ? f.items : metaDe(f.items).items || [];
    for (const it of items as Array<{ productId: number | null; cantidad: number }>) {
      if (it.productId == null) continue;
      mapa.set(it.productId, (mapa.get(it.productId) || 0) + Number(it.cantidad));
    }
  }
  return mapa;
}

export async function devolverVenta(
  tenantId: number, pagoId: number, items: Array<{ productId: number; cantidad: number }>, motivo?: string | null, creadoPor?: string | null,
): Promise<{ devolucionId: number; total: number }> {
  await exigirTienda(tenantId);
  const [pago] = await db.select().from(payments).where(and(eq(payments.id, pagoId), eq(payments.tenantId, tenantId))).limit(1);
  if (!pago) throw new Error(`No existe la venta #${pagoId} en este negocio.`);
  if ((pago as any).status !== "confirmed") throw new Error("Solo se devuelve una venta confirmada.");
  const vendidos = new Map<number, { cantidad: number; precio: number; nombre: string }>();
  for (const it of (metaDe((pago as any).metadata).items || []) as Array<{ productId: number | null; cantidad: number; precio: number; nombre: string }>) {
    if (it.productId == null) continue;
    vendidos.set(it.productId, { cantidad: Number(it.cantidad), precio: Number(it.precio) || 0, nombre: it.nombre || `#${it.productId}` });
  }
  if (!vendidos.size) throw new Error("Esa venta no tiene ítems registrados para devolver.");
  const previas = await yaDevuelto(tenantId, pagoId);
  const finales: Array<{ productId: number; cantidad: number; precio: number }> = [];
  for (const it of items) {
    const v = vendidos.get(Number(it.productId));
    if (!v) throw new Error(`El producto #${it.productId} no se vendió en la #${pagoId}.`);
    const cant = Math.trunc(Number(it.cantidad));
    if (!Number.isFinite(cant) || cant <= 0) throw new Error("Cantidades enteras mayores que cero.");
    const disponible = v.cantidad - (previas.get(Number(it.productId)) || 0);
    if (cant > disponible) throw new Error(`De "${v.nombre}" solo quedan ${disponible} por devolver.`);
    finales.push({ productId: Number(it.productId), cantidad: cant, precio: v.precio });
  }
  const total = finales.reduce((a, f) => a + f.cantidad * f.precio, 0);
  const [dev] = await db.insert(posDevoluciones).values({
    tenantId, pagoId, items: finales, motivo: motivo || "Devolución en tienda", total, creadoPor: creadoPor ?? null,
  } as any).returning({ id: posDevoluciones.id });
  for (const f of finales) {
    await moverStock(tenantId, f.productId, f.cantidad, "devolucion", `Devolución de la venta #${pagoId}${motivo ? `: ${motivo}` : ""}`, "devolucion", (dev as any).id, creadoPor);
  }
  logger.info({ tenantId, pagoId, total }, "[POS] devolución");
  return { devolucionId: (dev as any).id, total };
}

/* ─── Reportes y exportación (formato estándar, apto contador/SIIGO) ──── */

export interface FiltrosReporte { desde?: string; hasta?: string; }

function enRango(creadaEn: unknown, desdeMs: number, hastaMs: number): boolean {
  const t = fechaDe(creadaEn);
  return t >= desdeMs && t <= hastaMs;
}

export async function reporteVentas(tenantId: number, filtros: FiltrosReporte = {}): Promise<{
  ventas: number; total: number; porMetodo: Record<string, number>; devoluciones: number; totalDevuelto: number;
  porProducto: Array<{ productId: number | null; nombre: string; cantidad: number; total: number }>;
}> {
  await exigirTienda(tenantId);
  const desdeMs = filtros.desde ? fechaDe(filtros.desde) : 0;
  const hastaMs = filtros.hasta ? fechaDe(filtros.hasta) : Date.now() + 24 * 3600 * 1000;
  const filas = await db
    .select({ amount: payments.amount, method: payments.method, metadata: payments.metadata, createdAt: payments.createdAt, status: payments.status })
    .from(payments).where(eq(payments.tenantId, tenantId)).limit(2000);
  const porMetodo: Record<string, number> = {};
  const porProducto = new Map<number | null, { nombre: string; cantidad: number; total: number }>();
  let ventas = 0, total = 0;
  for (const f of filas as any[]) {
    if ((f as any).status !== "confirmed" || metaDe(f.metadata).canal !== CANAL_TIENDA) continue;
    if (!enRango(f.createdAt, desdeMs, hastaMs)) continue;
    ventas += 1;
    const m = Number(f.amount) || 0;
    total += m;
    const metodo = String(f.method || "otro").toLowerCase();
    porMetodo[metodo] = (porMetodo[metodo] || 0) + m;
    for (const it of (metaDe(f.metadata).items || []) as Array<{ productId: number | null; nombre: string; cantidad: number; total: number }>) {
      const e = porProducto.get(it.productId ?? null) || { nombre: it.nombre || "Venta", cantidad: 0, total: 0 };
      e.cantidad += Number(it.cantidad) || 0;
      e.total += Number(it.total) || 0;
      porProducto.set(it.productId ?? null, e);
    }
  }
  const devs = await db.select({ total: posDevoluciones.total, createdAt: posDevoluciones.createdAt })
    .from(posDevoluciones).where(eq(posDevoluciones.tenantId, tenantId)).limit(500);
  let devoluciones = 0, totalDevuelto = 0;
  for (const d of devs as any[]) {
    if (!enRango(d.createdAt, desdeMs, hastaMs)) continue;
    devoluciones += 1;
    totalDevuelto += Number(d.total) || 0;
  }
  return {
    ventas, total, porMetodo, devoluciones, totalDevuelto,
    porProducto: [...porProducto.entries()].map(([productId, v]) => ({ productId, ...v })).sort((a, b) => b.total - a.total),
  };
}

function csvCelda(v: unknown): string {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Ventas en JSON o CSV plano: fecha, venta, ítems, impuestos, método,
 * cliente y factura. Lo lee Excel o cualquier sistema contable.
 */
export async function exportarVentas(tenantId: number, filtros: FiltrosReporte & { formato?: "json" | "csv" } = {}): Promise<{ formato: string; contenido: string }> {
  await exigirTienda(tenantId);
  const desdeMs = filtros.desde ? fechaDe(filtros.desde) : 0;
  const hastaMs = filtros.hasta ? fechaDe(filtros.hasta) : Date.now() + 24 * 3600 * 1000;
  const filas = await db.select().from(payments).where(eq(payments.tenantId, tenantId)).limit(2000);
  const ventas: Array<Record<string, unknown>> = [];
  for (const f of filas as any[]) {
    if (f.status !== "confirmed" || metaDe(f.metadata).canal !== CANAL_TIENDA) continue;
    if (!enRango(f.createdAt, desdeMs, hastaMs)) continue;
    const meta = metaDe(f.metadata);
    const factura = meta.factura || {};
    const items = (meta.items || []) as Array<{ nombre: string; cantidad: number; precio: number; descuentoPct: number; impuestoPct: number; total: number }>;
    ventas.push({
      fecha: f.createdAt, venta: f.id,
      items: items.map((i) => `${i.cantidad}x ${i.nombre}`).join(" | "),
      subtotal: items.reduce((a, i) => a + i.cantidad * i.precio, 0),
      descuento: items.reduce((a, i) => a + (i.cantidad * i.precio * (i.descuentoPct || 0)) / 100, 0),
      impuesto: items.reduce((a, i) => a + ((i.cantidad * i.precio - (i.cantidad * i.precio * (i.descuentoPct || 0)) / 100) * (i.impuestoPct || 0)) / 100, 0),
      total: Number(f.amount) || 0, metodo: f.method, cliente: f.payerName || "",
      documento: meta.documento || "", factura: factura.numero || "", sistema: factura.proveedor || "",
    });
  }
  if ((filtros.formato || "json") === "csv") {
    const cols = ["fecha", "venta", "items", "subtotal", "descuento", "impuesto", "total", "metodo", "cliente", "documento", "factura", "sistema"];
    const lineas = [cols.join(";"), ...ventas.map((v) => cols.map((c) => csvCelda(v[c])).join(";"))];
    return { formato: "csv", contenido: lineas.join("\n") };
  }
  return { formato: "json", contenido: JSON.stringify(ventas, null, 2) };
}
