/**
 * Auditoría automática de los tokens de Dropify.
 *
 * 19-09-2026: 41 de 62 productos de Dropify en WooCommerce estaban sin
 * `_dropi_token`, y por eso los pedidos daban "Access denied" en Dropi. Se
 * descubrió porque un pedido real falló. Esto lo revisa solo: al arrancar
 * (a los 3 minutos, para no pisar el arranque) y después cada 24 h, para
 * cada negocio con WooCommerce. Si hay productos sin token y existe uno
 * válido en el catálogo, los repara; y le avisa al admin por WhatsApp
 * qué encontró y qué hizo. Si no puede reparar, avisa igual: un producto
 * sin token es un pedido que va a fallar.
 */
import { db, tenants } from "@workspace/db";
import { logger } from "./logger";

const CADA_MS = Number(process.env.DROPIFY_AUDITORIA_CADA_MS || 24 * 60 * 60 * 1000);
const PRIMERA_MS = Number(process.env.DROPIFY_AUDITORIA_PRIMERA_MS || 3 * 60 * 1000);
let timer: NodeJS.Timeout | null = null;

async function avisar(tenantId: number, texto: string): Promise<void> {
  try {
    const { avisarAlDueno } = await import("./avisos");
    await avisarAlDueno(tenantId, texto);
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[DropifyAuditoria] no se pudo avisar al admin");
  }
}

/** Audita y repara un negocio. Devuelve el resumen (o null si no aplica). */
export async function auditarYRepararTenant(tenantId: number): Promise<string | null> {
  const { getWooCommerceService } = await import("./woocommerce");
  const woo = await getWooCommerceService(tenantId);
  if (!woo) return null;
  const { repararTokensDropify } = await import("./dropify-tokens");
  const r = await repararTokensDropify(woo);
  const huboAlgo = r.auditoria.sinToken.length > 0 || r.errores.length > 0;
  if (huboAlgo) {
    await avisar(tenantId, `🔧 *Auditoría de Dropify*\n${r.resumen}`);
  }
  logger.info({ tenantId, revisados: r.auditoria.revisados, sinToken: r.auditoria.sinToken.length, reparados: r.reparados.length }, "[DropifyAuditoria] corrida");
  return r.resumen;
}

export async function correrAuditoriaDropify(): Promise<void> {
  try {
    const filas = await db.select({ id: tenants.id, woo: tenants.woocommerceIntegration }).from(tenants);
    for (const f of filas as any[]) {
      if (!f?.woo?.enabled) continue;
      try { await auditarYRepararTenant(Number(f.id)); }
      catch (e: any) { logger.warn({ tenantId: f.id, err: e?.message }, "[DropifyAuditoria] falló para el negocio"); }
    }
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[DropifyAuditoria] no se pudo listar los negocios");
  }
}

export function iniciarAuditoriaDropify(): void {
  if (timer || process.env.DROPIFY_AUDITORIA === "off") return;
  setTimeout(() => { void correrAuditoriaDropify(); }, PRIMERA_MS).unref?.();
  timer = setInterval(() => { void correrAuditoriaDropify(); }, CADA_MS);
  timer.unref?.();
  logger.info({ primeraEnMin: Math.round(PRIMERA_MS / 60000), cadaHoras: Math.round(CADA_MS / 3600000) }, "[DropifyAuditoria] programada");
}
