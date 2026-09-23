/**
 * ============================================================
 * COBRO POR CONVERSACIÓN (WhatsApp Cloud API)
 * ============================================================
 *
 * WhatsApp Cloud API cobra POR CONVERSACIÓN (ventana de 24h por cliente).
 * Este módulo mide cuántas conversaciones tiene cada negocio y calcula el
 * excedente sobre lo que su plan incluye, para que ese costo de Meta se le
 * pase al negocio en vez de pagarlo el dueño del SaaS.
 *
 * ── Qué hace ──────────────────────────────────────────────────────────────
 *   • contarConversacion()   suma una conversación (dedup por 24h por cliente)
 *   • conversacionesDelMes() cuántas lleva este mes (sobrevive reinicios)
 *   • excedenteDelMes()      cuántas se pasó de lo incluido en el plan
 *   • costoExcedenteUSD()    cuánto cuesta ese excedente (USD)
 *
 * ── Qué NO hace (aún) ─────────────────────────────────────────────────────
 *   No debita la tarjeta del cliente automáticamente: el billing actual es por
 *   suscripción (precio fijo mensual) y no hay tarjeta-en-archivo. El excedente
 *   queda medido y listo para cobrarse a fin de mes (ver facturarExcedentes).
 */
import { db, consumoConversaciones } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { SAAS_PLANS, type SaasPlan } from "../middleware/saasValidation";

/** "2026-09". El mes calendario, en UTC. */
export function periodoDe(fecha: Date = new Date()): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Suma una conversación al mes en curso. Va SIN await desde quien envía:
 * contar no puede demorar una respuesta al cliente. `ON CONFLICT` crea la fila
 * del mes la primera vez y suma después, en una sola ida a la base.
 */
export async function sumarConversacion(tenantId: number, cuantos = 1): Promise<void> {
  if (!tenantId || cuantos <= 0) return;
  const periodo = periodoDe();
  try {
    await db
      .insert(consumoConversaciones)
      .values({ tenantId, periodo, conversaciones: cuantos })
      .onConflictDoUpdate({
        target: [consumoConversaciones.tenantId, consumoConversaciones.periodo],
        set: {
          conversaciones: sql`${consumoConversaciones.conversaciones} + ${cuantos}`,
          actualizadoAt: new Date(),
        },
      });
  } catch (err: any) {
    logger.warn({ err: err?.message, tenantId, periodo }, "[CobroConv] no se pudo sumar la conversación");
  }
}

/** Cuántas conversaciones lleva el negocio este mes (0 ante fallo, a propósito). */
export async function conversacionesDelMes(tenantId: number, fecha: Date = new Date()): Promise<number> {
  if (!tenantId) return 0;
  try {
    const [fila] = await db
      .select({ conversaciones: consumoConversaciones.conversaciones })
      .from(consumoConversaciones)
      .where(and(eq(consumoConversaciones.tenantId, tenantId), eq(consumoConversaciones.periodo, periodoDe(fecha))))
      .limit(1);
    return fila?.conversaciones ?? 0;
  } catch (err: any) {
    logger.warn({ err: err?.message, tenantId }, "[CobroConv] no se pudo leer el consumo del mes");
    return 0;
  }
}

/** Conversaciones incluidas en el plan del negocio. */
export function conversacionesIncluidas(plan: string): number {
  const p = SAAS_PLANS[(plan || "").toLowerCase() as SaasPlan] || SAAS_PLANS.free;
  return Number(p.monthlyConversations) || 0;
}

/** Costo por conversación en USD (lo que Meta te cobra), configurable. */
export function costoPorConversacionUSD(): number {
  return Number(process.env.WHATSAPP_CONVERSATION_COST_USD) || 0.01;
}

/** Precio de venta por conversación en USD (lo que le cobrás al negocio), configurable. */
export function precioVentaPorConversacionUSD(): number {
  return Number(process.env.WHATSAPP_CONVERSATION_PRICE_USD) || 0.04;
}

/** Cuántas conversaciones se pasó de lo incluido (0 si no hay excedente). */
export async function excedenteDelMes(tenantId: number, plan: string): Promise<number> {
  const actual = await conversacionesDelMes(tenantId);
  return Math.max(0, actual - conversacionesIncluidas(plan));
}

/** Costo en USD del excedente (lo que pagás vos a Meta). */
export async function costoExcedenteUSD(tenantId: number, plan: string): Promise<number> {
  const excedente = await excedenteDelMes(tenantId, plan);
  return Math.round(excedente * costoPorConversacionUSD() * 100) / 100;
}

/** Monto en USD a cobrarle al negocio por el excedente (precio de venta, no costo). */
export async function excedenteACobrarUSD(tenantId: number, plan: string): Promise<number> {
  const excedente = await excedenteDelMes(tenantId, plan);
  return Math.round(excedente * precioVentaPorConversacionUSD() * 100) / 100;
}

// ─── Dedup por 24h por cliente ──────────────────────────────────────────────
//
// WhatsApp cuenta UNA conversación por cada ventana de 24h por cliente. Si el
// mismo número manda 5 mensajes en una hora, es UNA conversación. Este Map
// recuerda el último arranque de ventana por (negocio, teléfono); si no pasaron
// 24h, no se vuelve a contar. Es heurística en memoria (un reinicio puede
// recontar una ventana en curso), pero la fuente de verdad del cobro es el
// contador mensual persistido, no este dedup.

const ULTIMA_VENTANA = 24 * 60 * 60 * 1000;
const ventanas = new Map<string, number>();

/** Registra una conversación entrante; suma solo si abrió una ventana nueva. */
export function contarConversacion(tenantId: number, phone: string): { nueva: boolean } {
  const clave = `${tenantId}:${phone}`;
  const ahora = Date.now();
  const anterior = ventanas.get(clave);
  if (anterior && ahora - anterior < ULTIMA_VENTANA) return { nueva: false };
  ventanas.set(clave, ahora);
  if (ventanas.size > 50_000) {
    // No dejar crecer sin límite: se descartan las más viejas.
    const viejas = Array.from(ventanas.entries()).filter(([, t]) => ahora - t >= ULTIMA_VENTANA);
    for (const [k] of viejas) ventanas.delete(k);
  }
  void sumarConversacion(tenantId, 1);
  return { nueva: true };
}

/** Resumen completo del cobro por conversación de un negocio. */
export async function resumenDeCobro(tenantId: number, plan: string) {
  const [actual, incluidas, excedente, costo, aCobrar] = await Promise.all([
    conversacionesDelMes(tenantId),
    Promise.resolve(conversacionesIncluidas(plan)),
    excedenteDelMes(tenantId, plan),
    costoExcedenteUSD(tenantId, plan),
    excedenteACobrarUSD(tenantId, plan),
  ]);
  return {
    periodo: periodoDe(),
    conversaciones: actual,
    incluidas,
    excedente,
    costoPorConversacionUSD: costoPorConversacionUSD(),
    precioVentaPorConversacionUSD: precioVentaPorConversacionUSD(),
    costoExcedenteUSD: costo,
    excedenteACobrarUSD: aCobrar,
  };
}
