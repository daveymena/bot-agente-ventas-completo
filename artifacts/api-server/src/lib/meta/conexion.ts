/**
 * Puente entre el worker y la configuración de cada negocio. Las credenciales
 * salen de tenantManager (ya descifradas) vía credencialesFacebookDe.
 */
import { db, tenants } from "@workspace/db";
import { tenantManager } from "../tenantManager";
import { credencialesFacebookDe } from "../tenant-facebook-credentials";

/** Negocios con cuenta publicitaria y token de usuario listos para sincronizar. */
export async function cuentasConectadas(): Promise<{ tenantId: number; cuenta: string }[]> {
  const filas = await db.select({ id: tenants.id }).from(tenants);
  const salida: { tenantId: number; cuenta: string }[] = [];
  for (const f of filas) {
    const tenant = await tenantManager.getTenantById(Number(f.id));
    if (!tenant) continue;
    const c = credencialesFacebookDe(tenant);
    if (c.adAccountId && c.userAccessToken) {
      const cuenta = c.adAccountId.startsWith("act_") ? c.adAccountId : `act_${c.adAccountId}`;
      salida.push({ tenantId: Number(f.id), cuenta });
    }
  }
  return salida;
}

/** Token de usuario del negocio, o null si no tiene conexión. */
export async function tokenDeNegocio(tenantId: number): Promise<string | null> {
  const tenant = await tenantManager.getTenantById(tenantId);
  if (!tenant) return null;
  return credencialesFacebookDe(tenant).userAccessToken || null;
}
