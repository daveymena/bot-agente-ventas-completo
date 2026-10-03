/**
 * Visitas y pedidos de cada landing, y "lo que más vende" por modelo de página.
 *
 * Pedido del dueño (01-10-2026): que el sistema elija el estilo "según lo que
 * más vende". La investigación da el punto de partida (composicion.ts →
 * EVIDENCIA), pero lo que de verdad manda es lo que vende en ESTA tienda, y
 * hasta hoy no se medía: la landing pública no contaba visitas y los pedidos
 * solo quedaban como texto en las notas ("Pedido desde la landing X").
 *
 * Se guarda en `landing.strategy.metricas` ({ visitas, pedidos, desde }) para
 * no agregar tabla. Contar es "lo mejor posible": si una escritura choca con
 * otra se pierde una visita, no se rompe la página.
 *
 * Límite conocido: en digitales el cierre es un enlace de pago (MercadoPago,
 * PayPal) y el pago no vuelve atado a la landing; ahí solo hay visitas, y el
 * modelo se sigue eligiendo por la evidencia hasta que exista esa atribución.
 */
import { db, landingPages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import type { ModeloId, RendimientoPorModelo } from "./composicion";

/** Robots, vistas previas de enlaces y el propio monitoreo: no son visitas. */
const NO_ES_PERSONA = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|curl|wget|python|axios|node-fetch|headless|lighthouse|uptime/i;

export function esVisitaDePersona(userAgent: unknown): boolean {
  const ua = String(userAgent ?? "");
  return ua.length > 0 && !NO_ES_PERSONA.test(ua);
}

async function sumar(landingId: number, campo: "visitas" | "pedidos"): Promise<void> {
  try {
    const [fila] = await db.select({ strategy: landingPages.strategy }).from(landingPages).where(eq(landingPages.id, landingId)).limit(1);
    if (!fila) return;
    const strategy: any = (fila.strategy && typeof fila.strategy === "object") ? fila.strategy : {};
    const m = strategy.metricas || {};
    const metricas = { visitas: Number(m.visitas) || 0, pedidos: Number(m.pedidos) || 0, desde: m.desde || new Date().toISOString() };
    metricas[campo] += 1;
    await db.update(landingPages).set({ strategy: { ...strategy, metricas } } as any).where(eq(landingPages.id, landingId));
  } catch (e: any) {
    logger.debug({ landingId, campo, err: e?.message }, "[Landing] no se pudo contar");
  }
}

/** Se llama sin esperar: contar nunca demora ni rompe la página. */
export function contarVisita(landingId: number, userAgent: unknown): void {
  if (!esVisitaDePersona(userAgent)) return;
  void sumar(landingId, "visitas");
}

export function contarPedido(landingId: number): void {
  void sumar(landingId, "pedidos");
}

/**
 * Suma visitas y pedidos de las landings de la tienda por modelo de página.
 * Las landings sin modelo guardado cuentan como "clasica" (es lo que ven).
 */
export function agruparPorModelo(filas: Array<{ design: unknown; strategy: unknown }>): RendimientoPorModelo {
  const out: RendimientoPorModelo = {};
  for (const f of filas) {
    const m = ((f.strategy as any)?.metricas) || null;
    if (!m) continue;
    const modelo = (String((f.design as any)?.modelo || "") || "clasica") as ModeloId;
    const acc = out[modelo] || { visitas: 0, pedidos: 0 };
    acc.visitas += Number(m.visitas) || 0;
    acc.pedidos += Number(m.pedidos) || 0;
    out[modelo] = acc;
  }
  return out;
}

export async function rendimientoPorModelo(tenantId: number): Promise<RendimientoPorModelo> {
  try {
    const filas = await db.select({ design: landingPages.design, strategy: landingPages.strategy }).from(landingPages).where(eq(landingPages.tenantId, tenantId));
    return agruparPorModelo(filas as any);
  } catch {
    return {};
  }
}
