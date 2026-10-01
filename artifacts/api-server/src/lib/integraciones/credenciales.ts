/**
 * Credenciales de integraciones: `tenants.metadata.integraciones.<plataforma>`.
 *
 * Los secretos se guardan CIFRADOS (enc:v1: de lib/credentials-vault.ts).
 * Ojo: WooCommerce guarda las suyas en texto plano en
 * `tenants.woocommerceIntegration` — eso es legado, acá no se repite.
 */
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "../credentials-vault";
import { tenantManager } from "../tenantManager";
import { logger } from "../logger";
import type { CredencialesIntegracion, Plataforma } from "./tipos";

function leerMeta(tenant: any): any {
  const m = (tenant as any)?.metadata;
  if (!m) return {};
  if (typeof m === "string") {
    try { return JSON.parse(m); } catch { return {}; }
  }
  return m;
}

/** Lee las credenciales (con secretos descifrados). Null si no hay. */
export async function leerCredenciales(
  tenantId: number,
  plataforma: Plataforma,
): Promise<CredencialesIntegracion | null> {
  const tenant = await tenantManager.getTenantById(tenantId);
  if (!tenant) return null;
  const integ = leerMeta(tenant).integraciones?.[plataforma];
  if (!integ) return null;
  return {
    tienda: integ.tienda,
    token: integ.token ? decryptSecret(integ.token) : undefined,
    secreto: integ.secreto ? decryptSecret(integ.secreto) : undefined,
    refresh: integ.refresh ? decryptSecret(integ.refresh) : undefined,
    expiraEn: integ.expiraEn,
    moneda: integ.moneda,
    vendedorId: integ.vendedorId,
    activa: integ.activa !== false,
    actualizadaEn: integ.actualizadaEn,
  };
}

/** Guarda las credenciales (cifrando secretos). `parche` = solo lo que cambia. */
export async function guardarCredenciales(
  tenantId: number,
  plataforma: Plataforma,
  parche: Partial<{ tienda: string; token: string; secreto: string; refresh: string; expiraEn: string; moneda: string; vendedorId: string; activa: boolean }>,
): Promise<void> {
  const tenant = await tenantManager.getTenantById(tenantId);
  const meta = leerMeta(tenant);
  const prev = meta.integraciones?.[plataforma] || {};
  const next: any = { ...prev };
  if (parche.tienda !== undefined) next.tienda = String(parche.tienda).trim();
  if (parche.token !== undefined) next.token = encryptSecret(parche.token);
  if (parche.secreto !== undefined) next.secreto = encryptSecret(parche.secreto);
  if (parche.refresh !== undefined) next.refresh = encryptSecret(parche.refresh);
  if (parche.expiraEn !== undefined) next.expiraEn = parche.expiraEn;
  if (parche.moneda !== undefined) next.moneda = parche.moneda;
  if (parche.vendedorId !== undefined) next.vendedorId = parche.vendedorId;
  if (parche.activa !== undefined) next.activa = parche.activa;
  next.actualizadaEn = new Date().toISOString();
  await db.update(tenants)
    .set({ metadata: { ...meta, integraciones: { ...(meta.integraciones || {}), [plataforma]: next } } as any })
    .where(eq(tenants.id, tenantId));
  try { (tenantManager as any).invalidate?.(tenantId); } catch { /* noop */ }
  logger.info({ tenantId, plataforma }, "[Integraciones] credenciales guardadas");
}

/** Borra la integración (revoca del lado nuestro; en la plataforma se revoca allá). */
export async function borrarCredenciales(tenantId: number, plataforma: Plataforma): Promise<void> {
  const tenant = await tenantManager.getTenantById(tenantId);
  const meta = leerMeta(tenant);
  const integ = { ...(meta.integraciones || {}) };
  delete integ[plataforma];
  await db.update(tenants)
    .set({ metadata: { ...meta, integraciones: integ } as any })
    .where(eq(tenants.id, tenantId));
  try { (tenantManager as any).invalidate?.(tenantId); } catch { /* noop */ }
}

/** Estado resumido (sin secretos) para el panel y Atlas. */
export async function estadoIntegraciones(tenantId: number): Promise<Record<string, { conectada: boolean; tienda?: string; activa: boolean; actualizadaEn?: string }>> {
  const tenant = await tenantManager.getTenantById(tenantId);
  const integ = leerMeta(tenant).integraciones || {};
  const out: Record<string, { conectada: boolean; tienda?: string; activa: boolean; actualizadaEn?: string }> = {};
  for (const p of ["shopify", "aliexpress", "mercadolibre", "falabella"]) {
    const c = integ[p];
    out[p] = {
      conectada: !!(c && (c.token || c.tienda)),
      tienda: c?.tienda,
      activa: c?.activa !== false,
      actualizadaEn: c?.actualizadaEn,
    };
  }
  return out;
}
