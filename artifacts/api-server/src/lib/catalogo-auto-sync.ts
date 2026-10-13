/**
 * CATALOGO AUTO-SYNC — Mantiene el catálogo vivo sin intervención manual
 * ======================================================================
 * Dos tareas DIOS que corren diario:
 * 1. Catalogo: asegura que cada tenant con Facebook conectado tenga catalogId + feed diario (/catalogo-meta/:id.json)
 *    y hace syncCatalog() inmediato para que las imágenes estén disponibles HOY.
 * 2. Orgánico: programa la semana de posts (agente-organico) si la página puede publicar.
 *
 * Se ejecuta al arrancar (si pasó >20h desde la última) y cada 24h. Usa programador.ts
 * idempotente así que no duplica.
 */

import { logger } from "./logger";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantManager } from "./tenantManager";

let ultimoRun = 0;
const INTERVALO_MS = 24 * 60 * 60 * 1000;
const DELAY_ARRANQUE_MS = 30_000;

async function syncUnTenant(tenantId: number): Promise<{ catalogo?: string; organico?: string }> {
  const out: any = {};
  // 1. Catálogo
  try {
    const tenant = await tenantManager.getTenantById(tenantId);
    const cred: any = (tenant as any)?.facebook || {};
    if (cred?.adAccountId && (cred?.accessToken || cred?.userAccessToken)) {
      const { FacebookService } = await import("./facebook");
      const { urlFeedDelCatalogo } = await import("../routes/catalogo-meta");
      const feedUrl = urlFeedDelCatalogo(tenantId);
      let catalogId = cred.catalogId || null;
      // Auto-crear si falta (igual que fb_sync_catalog)
      if (!catalogId) {
        try {
          const fb = new FacebookService(tenant || undefined);
          const token = cred.userAccessToken || cred.accessToken;
          const acc: any = await fb.fbGet(`act_${cred.adAccountId}`, { fields: "business" }, token).catch(() => null);
          const delToken: any = (!acc?.business?.id) ? await fb.fbGet("me/businesses", { fields: "id,name" }, token).catch(() => null) : null;
          const businessId = acc?.business?.id || delToken?.data?.[0]?.id || null;
          if (businessId) {
            const c: any = await fb.fbPost(`${businessId}/owned_product_catalogs`, { name: `${(tenant as any)?.brandName || "Catálogo"} (VentasPro)`, vertical: "commerce" }, "catálogo auto-sync", token).catch(() => null);
            if (c?.id) {
              catalogId = String(c.id);
              const [fila] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
              const meta = fila?.metadata ? (typeof fila.metadata === "string" ? JSON.parse(fila.metadata) : fila.metadata) : {};
              const metaNuevo = { ...meta, facebook: { ...(meta.facebook || {}), catalogId } };
              await db.update(tenants).set({ metadata: metaNuevo as any }).where(eq(tenants.id, tenantId));
              tenantManager.clearCache();
            }
          }
        } catch {}
      }
      // Feed diario + sync inmediato
      if (catalogId) {
        try {
          const t2 = await tenantManager.getTenantById(tenantId);
          const fbFresh = new FacebookService(t2 || tenant || undefined);
          const token2 = (t2 as any)?.facebook?.userAccessToken || (t2 as any)?.facebook?.accessToken || cred.userAccessToken || cred.accessToken;
          const feeds: any = await fbFresh.fbGet(`product_catalogs/${catalogId}/product_feeds`, { fields: "id,schedule" }, token2).catch(() => null);
          const tiene = (feeds?.data || []).some((f: any) => String(f?.schedule?.url || "").includes(String(tenantId)));
          if (!tiene) await fbFresh.fbPost(`product_catalogs/${catalogId}/product_feeds`, { name: "Feed VentasPro (diario)", schedule: { interval: "DAILY", url: feedUrl } }, "feed", token2).catch(() => null);
          const r = await new FacebookService(t2 || tenant || undefined).syncCatalog();
          out.catalogo = `${r.synced} ok, ${r.failed} fallidos`;
        } catch (e: any) { out.catalogo = `error: ${e?.message || e}`; }
      }
    }
  } catch (e: any) { out.catalogo = `skip: ${e?.message || e}`; }

  // 2. Orgánico
  try {
    const { checkPostingPermission } = await import("./facebook-page-posts");
    const t = await tenantManager.getTenantById(tenantId);
    const puede = await checkPostingPermission(t || undefined);
    if (puede === null) {
      const { programarLaSemana } = await import("./agente-organico");
      const r = await programarLaSemana(tenantId, new Date());
      out.organico = `${r.agendadas} agendadas, ${r.omitidas.length} omitidas${r.bloqueo ? ` bloqueo: ${r.bloqueo}` : ""}`;
    } else {
      out.organico = `no publica: ${puede}`;
    }
  } catch (e: any) { out.organico = `skip: ${e?.message || e}`; }

  return out;
}

export async function runCatalogoAutoSync(): Promise<void> {
  const ahora = Date.now();
  if (ahora - ultimoRun < 20 * 60 * 60 * 1000) return; // al menos 20h entre corridas
  ultimoRun = ahora;
  try {
    const filas = await db.select({ id: tenants.id }).from(tenants);
    for (const { id } of filas) {
      try {
        const r = await syncUnTenant(Number(id));
        logger.info({ tenantId: id, ...r }, "[CatalogoAutoSync] tenant procesado");
      } catch (e: any) { logger.warn({ tenantId: id, err: e?.message }, "[CatalogoAutoSync] fallo tenant"); }
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[CatalogoAutoSync] fallo general"); }
}

export function iniciarCatalogoAutoSync(): void {
  setTimeout(() => { runCatalogoAutoSync().catch(() => {}); }, DELAY_ARRANQUE_MS);
  setInterval(() => { runCatalogoAutoSync().catch(() => {}); }, INTERVALO_MS);
  logger.info("[CatalogoAutoSync] programado cada 24h (primer run en 30s)");
}
