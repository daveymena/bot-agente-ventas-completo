/**
 * ¿DROPI PUEDE DESPACHAR ESTE PRODUCTO HOY?
 *
 * El pedido #323 (18-09-2026) llegó a Dropi y Dropi lo rechazó: "el
 * proveedor clasifica el producto como archivado". El bot lo vendió, tomó
 * los datos del cliente, creó la orden en Woo y recién ahí se enteró. Peor:
 * Dropify trae apagado su cron de stock, así que Woo nunca se entera de que
 * el proveedor archivó o agotó algo.
 *
 * Este módulo pregunta ANTES: a Dropi mismo, por la API de integraciones
 * (dropi-integracion.ts), con el token que Dropify dejó en el producto de
 * Woo. Lo usan:
 *   · despacharPedido(), antes de crear la orden en Woo;
 *   · la revisión periódica del catálogo (sincronizarDisponibilidadDropi);
 *   · Atlas (dropi_verificar_producto / dropi_revisar_catalogo).
 *
 * El formato de la respuesta de Dropi no está documentado: se leen varios
 * nombres de campo y, si ninguno aparece, se responde "desconocido" y NO se
 * bloquea la venta. Bloquear por una suposición sería otro #323 al revés.
 */
import { and, eq } from "drizzle-orm";
import { db, products } from "@workspace/db";
import { logger } from "./logger";
import { credencialesDropiDesdeWoo, consultarProductoEnDropi } from "./dropi-integracion";
import type { WooCommerceService } from "./woocommerce";

export type EstadoDisponibilidad = "disponible" | "archivado" | "sin_stock" | "desconocido" | "sin_dropi" | "error";

export interface Disponibilidad {
  estado: EstadoDisponibilidad;
  /** Para decírselo al admin (y, resumido, al cliente). */
  detalle: string;
  dropiProductId: number | null;
  stock: number | null;
  /** La respuesta de Dropi tal cual, para mirarla cuando el formato sorprenda. */
  crudo?: any;
}

const ARCHIVADO = /archiv|inactiv|desactiv|elimin|deleted|disabled|pausad/i;

/** Interpreta lo que devuelve Dropi para un producto. Exportada para probarla sin red. */
export function interpretarProductoDeDropi(data: any, dropiProductId: number | null): Disponibilidad {
  const p = Array.isArray(data) ? data[0] : (data?.product ?? data?.objects ?? data);
  if (!p || typeof p !== "object") {
    return { estado: "desconocido", detalle: "Dropi respondió sin datos del producto.", dropiProductId, stock: null, crudo: data };
  }
  const textoEstado = [p.status, p.state, p.estado, p.product_status, p.availability].filter((v) => v != null).map(String).join(" ");
  const banderaArchivado = p.archived === true || p.is_archived === true || p.active === false || p.is_active === false || p.deleted === true;
  if (banderaArchivado || (textoEstado && ARCHIVADO.test(textoEstado))) {
    return { estado: "archivado", detalle: `El proveedor tiene el producto como "${textoEstado || "archivado"}" en Dropi: no se puede despachar.`, dropiProductId, stock: null, crudo: p };
  }
  const stockCrudo = [p.stock, p.stock_quantity, p.quantity, p.available_stock, p.inventory, p.warehouse_stock]
    .map((v) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null))
    .find((v) => v != null);
  const stock = stockCrudo ?? null;
  if (stock != null && stock <= 0) {
    return { estado: "sin_stock", detalle: "Dropi reporta 0 unidades: el proveedor no tiene stock ahora.", dropiProductId, stock, crudo: p };
  }
  if (stock == null && !textoEstado) {
    return { estado: "desconocido", detalle: "Dropi respondió, pero sin un campo de estado ni de stock reconocible.", dropiProductId, stock: null, crudo: p };
  }
  return { estado: "disponible", detalle: stock != null ? `Disponible en Dropi (${stock} unidades).` : `Disponible en Dropi (estado "${textoEstado}").`, dropiProductId, stock, crudo: p };
}

/** Consulta Dropi por un producto de Woo (el que tiene el token de integración). */
export async function disponibilidadEnDropi(woo: WooCommerceService, wooProductId: number): Promise<Disponibilidad> {
  let cred;
  try {
    cred = await credencialesDropiDesdeWoo(woo, wooProductId);
  } catch (e: any) {
    return { estado: "error", detalle: `No se pudo leer el producto ${wooProductId} en WooCommerce: ${e?.message || e}`, dropiProductId: null, stock: null };
  }
  if (!cred.dropiProductId || !cred.token) {
    return { estado: "sin_dropi", detalle: "Este producto de Woo no viene de Dropi (sin id o sin token de integración).", dropiProductId: cred.dropiProductId, stock: null };
  }
  const r = await consultarProductoEnDropi(cred.dropiProductId, cred.token);
  if (!r.ok) {
    // Dropi también contesta "archivado" con un 4xx y el mensaje adentro.
    if (r.error && ARCHIVADO.test(r.error)) {
      return { estado: "archivado", detalle: `Dropi: ${r.error}`, dropiProductId: cred.dropiProductId, stock: null, crudo: r.data };
    }
    return { estado: "error", detalle: `Dropi no respondió bien (${r.status ?? "sin código"}): ${r.error}`, dropiProductId: cred.dropiProductId, stock: null, crudo: r.data };
  }
  return interpretarProductoDeDropi(r.data, cred.dropiProductId);
}

/** Lo que se le dice al cliente cuando el producto ya no se puede despachar. Sin culpar a nadie, sin inventar fechas. */
export function mensajeAlClienteSinDisponibilidad(nombreProducto: string, d: Disponibilidad): string {
  if (d.estado === "sin_stock") return `Justo ahora el proveedor no tiene unidades de *${nombreProducto}* 😕 No te voy a tomar el pedido para no dejarte esperando. ¿Te aviso apenas vuelva a haber, o te muestro algo parecido?`;
  return `Acabo de verificar y *${nombreProducto}* ya no está disponible para despacho 😕 Prefiero decírtelo antes que tomarte el pedido y fallarte. ¿Te muestro una alternativa parecida?`;
}

export interface ResultadoSincronizacion {
  revisados: number;
  desactivados: Array<{ productId: number; nombre: string; motivo: string }>;
  reactivados: Array<{ productId: number; nombre: string }>;
  errores: Array<{ productId: number; nombre: string; detalle: string }>;
  desconocidos: number;
}

/**
 * Revisa TODOS los productos del catálogo que vienen de Dropi y desactiva los
 * que el proveedor archivó o agotó. Reactiva los que vuelven a estar
 * disponibles solo si fue esta rutina la que los apagó (metadata.dropi.desactivadoPorSync).
 */
export async function sincronizarDisponibilidadDropi(tenantId: number): Promise<ResultadoSincronizacion> {
  const res: ResultadoSincronizacion = { revisados: 0, desactivados: [], reactivados: [], errores: [], desconocidos: 0 };
  const { getWooCommerceService } = await import("./woocommerce");
  const woo = await getWooCommerceService(tenantId).catch(() => null);
  if (!woo) return res;

  const filas = await db.select().from(products).where(eq(products.tenantId, tenantId));
  for (const p of filas as any[]) {
    const meta = typeof p.metadata === "string" ? safeJson(p.metadata) : (p.metadata || {});
    const wooId = Number(meta?.woocommerce?.id);
    if (!wooId) continue;
    const d = await disponibilidadEnDropi(woo, wooId);
    if (d.estado === "sin_dropi") continue;
    res.revisados += 1;
    if (d.estado === "error") { res.errores.push({ productId: p.id, nombre: p.name, detalle: d.detalle }); continue; }
    if (d.estado === "desconocido") { res.desconocidos += 1; continue; }
    const apagadoPorSync = meta?.dropi?.desactivadoPorSync === true;
    if ((d.estado === "archivado" || d.estado === "sin_stock") && p.isActive) {
      await db.update(products).set({
        isActive: false,
        metadata: { ...meta, dropi: { ...(meta?.dropi || {}), desactivadoPorSync: true, motivo: d.detalle, estado: d.estado, revisadoEn: new Date().toISOString() } },
      } as any).where(and(eq(products.id, p.id), eq(products.tenantId, tenantId)));
      res.desactivados.push({ productId: p.id, nombre: p.name, motivo: d.detalle });
      logger.warn({ productId: p.id, motivo: d.detalle }, "[Dropi] Producto desactivado por la revisión de disponibilidad");
    } else if (d.estado === "disponible" && !p.isActive && apagadoPorSync) {
      await db.update(products).set({
        isActive: true,
        metadata: { ...meta, dropi: { ...(meta?.dropi || {}), desactivadoPorSync: false, estado: "disponible", revisadoEn: new Date().toISOString() } },
      } as any).where(and(eq(products.id, p.id), eq(products.tenantId, tenantId)));
      res.reactivados.push({ productId: p.id, nombre: p.name });
      logger.info({ productId: p.id }, "[Dropi] Producto reactivado: volvió a estar disponible");
    }
  }
  return res;
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}

/** Revisión periódica. Se arranca una vez al levantar el servidor. */
export function programarRevisionDeDropi(tenantIds: () => Promise<number[]>): void {
  const horas = Number(process.env.DROPI_REVISION_HORAS || 6);
  if (!Number.isFinite(horas) || horas <= 0) return;
  const correr = async () => {
    try {
      for (const t of await tenantIds()) {
        const r = await sincronizarDisponibilidadDropi(t);
        if (r.revisados) logger.info({ tenantId: t, ...r, desactivados: r.desactivados.length, reactivados: r.reactivados.length }, "[Dropi] Revisión de disponibilidad");
      }
    } catch (e: any) {
      logger.error({ err: e?.message }, "[Dropi] La revisión periódica falló");
    }
  };
  // La primera a los 3 minutos (que el servidor termine de levantar), después cada N horas.
  setTimeout(correr, 3 * 60_000).unref?.();
  setInterval(correr, horas * 3_600_000).unref?.();
}
