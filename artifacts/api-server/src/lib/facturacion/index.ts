/**
 * Una sola puerta para facturar: rutas, el flujo de pago confirmado y Atlas.
 * Ver tipos.ts para las reglas.
 */
import { db, payments, products, conversations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { leerConfigFacturacion } from "./config";
import * as alegra from "./alegra";
import * as webhook from "./webhook";
import type { ConfigFacturacion, FacturaEmitida, Pedir, ResultadoFactura, VentaAFacturar } from "./tipos";

export { leerConfigFacturacion, guardarConfigFacturacion, borrarConfigFacturacion, resumenSinSecretos } from "./config";
export type { ConfigFacturacion, FacturaEmitida, ResultadoFactura, VentaAFacturar } from "./tipos";

function leerMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as any;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

/** La factura que ya se emitió para este pago, si hubo una. */
export function facturaGuardada(metadataDelPago: unknown): FacturaEmitida | null {
  const f = leerMetadata(metadataDelPago).factura;
  return f?.proveedor ? (f as FacturaEmitida) : null;
}

/** ¿Este negocio factura solo al confirmar un pago? */
export async function facturacionActiva(tenantId: number): Promise<boolean> {
  const c = await leerConfigFacturacion(tenantId).catch(() => null);
  return !!c && c.activa;
}

export async function emitirCon(c: ConfigFacturacion, venta: VentaAFacturar, pedir?: Pedir): Promise<FacturaEmitida> {
  if (c.proveedor === "alegra") return alegra.emitir(c.alegra as any, venta, pedir);
  if (c.proveedor === "webhook") return webhook.emitir(c.webhook as any, venta, pedir);
  throw new Error(`Proveedor de facturación desconocido: ${c.proveedor}`);
}

export async function probarConexion(c: ConfigFacturacion, pedir?: Pedir): Promise<string> {
  if (c.proveedor === "alegra") {
    const { contacto } = await alegra.probarConexion(c.alegra as any, pedir);
    return `Alegra respondió bien. Las ventas sin cédula se facturan a "${contacto}".`;
  }
  if (c.proveedor === "webhook") {
    await webhook.probarConexion(c.webhook as any, pedir);
    return "Tu sistema recibió el envío de prueba.";
  }
  throw new Error(`Proveedor de facturación desconocido: ${c.proveedor}`);
}

/** Arma la venta desde la fila del pago: lo que se COBRÓ, no el precio de lista. */
async function ventaDelPago(pago: any): Promise<VentaAFacturar> {
  const [prod] = pago.productId
    ? await db.select({ nombre: products.name, kind: products.kind }).from(products).where(eq(products.id, pago.productId)).limit(1)
    : [undefined as any];
  const [conv] = pago.conversationId
    ? await db.select({ nombre: conversations.contactName, telefono: conversations.contactPhone }).from(conversations).where(eq(conversations.id, pago.conversationId)).limit(1)
    : [undefined as any];
  const total = Number(pago.amount) || 0;
  const meta = leerMetadata(pago.metadata);
  return {
    pagoId: pago.id,
    tenantId: pago.tenantId,
    fecha: new Date(pago.verifiedAt || pago.createdAt || Date.now()).toISOString().slice(0, 10),
    moneda: pago.currency || "COP",
    total,
    metodoPago: pago.method || "transferencia",
    cliente: {
      nombre: pago.payerName || conv?.nombre || "Consumidor final",
      documento: meta.documento || meta.cedula || null,
      correo: pago.payerEmail || null,
      telefono: pago.payerPhone || conv?.telefono || null,
    },
    items: [{
      productId: pago.productId ?? null,
      nombre: prod?.nombre || "Venta",
      precio: total,
      cantidad: 1,
      digital: (prod?.kind || "digital") === "digital",
    }],
  };
}

/**
 * Factura un pago confirmado con el sistema que conectó su negocio.
 *
 * Idempotente: si el pago ya tiene factura, la devuelve sin volver a emitir
 * (el flujo de confirmación puede correr dos veces y una factura repetida en
 * la DIAN no se borra, se anula con nota crédito).
 */
export async function facturarPago(pagoId: number, opts: { pedir?: Pedir } = {}): Promise<ResultadoFactura> {
  const [pago] = await db.select().from(payments).where(eq(payments.id, pagoId)).limit(1);
  if (!pago) return { ok: false, error: `No existe el pago #${pagoId}.`, proveedor: null };
  const previa = facturaGuardada((pago as any).metadata);
  if (previa) return { ok: true, factura: previa, yaEstaba: true };
  if ((pago as any).status !== "confirmed") return { ok: false, error: `El pago #${pagoId} no está confirmado.`, proveedor: null };

  const tenantId = Number((pago as any).tenantId);
  const config = await leerConfigFacturacion(tenantId);
  if (!config) return { ok: false, error: "Este negocio no conectó ningún sistema de facturación.", proveedor: null };
  if (!config.activa) return { ok: false, error: "La facturación automática está apagada.", proveedor: config.proveedor };

  try {
    const factura = await emitirCon(config, await ventaDelPago(pago), opts.pedir);
    const meta = leerMetadata((pago as any).metadata);
    await db.update(payments)
      .set({ metadata: JSON.stringify({ ...meta, factura }), updatedAt: new Date() } as any)
      .where(eq(payments.id, pagoId));
    logger.info({ pagoId, tenantId, proveedor: factura.proveedor, numero: factura.numero }, "[Facturacion] factura emitida");
    return { ok: true, factura };
  } catch (e: any) {
    const error = String(e?.message || e).slice(0, 300);
    logger.warn({ pagoId, tenantId, proveedor: config.proveedor, error }, "[Facturacion] no se pudo facturar");
    return { ok: false, error, proveedor: config.proveedor };
  }
}

/** La línea que va al cliente cuando la factura salió. */
export function lineaDeFactura(f: FacturaEmitida, negocio: string | null): string {
  const tipo = f.electronica ? "Factura electrónica" : "Factura";
  const num = f.numero ? ` N° ${f.numero}` : "";
  return `🧾 *${tipo}${num}*${negocio ? ` — ${negocio}` : ""}\nQueda registrada a tu nombre. Si necesitas una copia, pídemela por acá.`;
}
