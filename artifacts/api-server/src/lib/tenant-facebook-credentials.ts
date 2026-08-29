import { logger } from "./logger";
import type { TenantContext } from "./tenantManager";
import { FB_GRAPH_BASE } from "./meta-api-version";

/**
 * Credenciales de Facebook POR NEGOCIO.
 *
 * Igual que pasó con los cobros (ver tenant-payment-credentials.ts), el flujo
 * de anuncios leía `process.env.FB_*` directamente: todos los negocios de la
 * plataforma publicaban, anunciaban y hacían sync del catálogo con la cuenta
 * del dueño del servidor. Con un solo negocio funciona por casualidad; con
 * dos, el segundo negocio estaría gastando plata en la cuenta del primero.
 *
 * La diferencia con pagos es que acá el origen de la configuración ya era
 * `metadata.facebook` del tenant (se conectaba desde la página de Facebook
 * con OAuth o manualmente). El problema era que el resto del código seguía
 * leyendo `process.env.FB_*` con prioridad. Acá centralizamos la resolución:
 * las credenciales del negocio SIEMPRE ganan y el .env es solo el fallback
 * para cuando el negocio todavía no conectó nada.
 *
 * Los secretos (accessToken, appSecret, messengerPageToken) vienen descifrados
 * de TenantContext (parseFacebookMeta usa decryptSecret). El GET nunca los
 * devuelve, solo si están configurados y los últimos caracteres.
 */

export interface CredencialesFacebook {
  accessToken: string;
  pageId: string;
  adAccountId: string;
  pixelId: string;
  catalogId: string;
  appId: string;
  appSecret: string;
  messengerPageToken: string;
  messengerVerifyToken: string;
  pageName?: string;
  tasks?: string[];
  /** true si salieron de la config del negocio; false si son las del .env */
  propias: boolean;
}

/** Últimos caracteres para reconocer el secreto sin exponerlo. */
export function enmascarar(valor: string): string {
  if (!valor) return "";
  return valor.length <= 4 ? "••••" : "••••" + valor.slice(-4);
}

/**
 * Credenciales efectivas de Facebook de un negocio.
 *
 * `metadata.facebook` (ya descifrado en TenantContext.facebook) gana siempre.
 * El .env es el fallback para instalaciones que todavía no conectaron la
 * página desde el panel.
 */
export function credencialesFacebookDe(tenant: TenantContext | null | undefined): CredencialesFacebook {
  const fb: any = tenant?.facebook || {};

  const accessToken = fb.accessToken || process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN || "";
  const appSecret = fb.appSecret || process.env.FB_APP_SECRET || "";
  const messengerPageToken = fb.messengerPageToken || process.env.FB_MESSENGER_PAGE_TOKEN || "";
  const messengerVerifyToken = fb.messengerVerifyToken || process.env.FB_MESSENGER_VERIFY_TOKEN || "";

  const tienePropias = !!(
    fb.accessToken || fb.pageId || fb.adAccountId || fb.catalogId || fb.pixelId || fb.appId || fb.appSecret
  );

  return {
    accessToken,
    pageId: fb.pageId || process.env.FB_PAGE_ID || "",
    adAccountId: fb.adAccountId || process.env.FB_AD_ACCOUNT_ID || "",
    pixelId: fb.pixelId || process.env.FB_PIXEL_ID || "",
    catalogId: fb.catalogId || process.env.FB_CATALOG_ID || "",
    appId: fb.appId || process.env.FB_APP_ID || "",
    appSecret,
    messengerPageToken,
    messengerVerifyToken,
    pageName: fb.pageName,
    tasks: fb.tasks,
    propias: tienePropias,
  };
}

/**
 * Verifica el access token contra Graph API y, si hay pageId, valida que el
 * token tenga acceso a esa página. Devuelve la página conectada cuando existe.
 */
export async function probarFacebook(
  accessToken: string,
  pageId?: string,
): Promise<{ ok: boolean; detalle: string; page?: { id: string; name: string; tasks?: string[] } }> {
  if (!accessToken) return { ok: false, detalle: "Falta el access token" };
  try {
    // Primero valida el token contra /me (solo lectura).
    const me = await fetch(`${FB_GRAPH_BASE}/me?fields=id,name&access_token=${accessToken}`, {
      signal: AbortSignal.timeout(12000),
    });
    const meData: any = await me.json();
    if (meData.error) {
      return { ok: false, detalle: meData.error?.message || "Token inválido" };
    }

    // Si se indicó una página, verificar que el token la administre.
    if (pageId) {
      // `tasks` was removed/permission-gated in newer Graph API versions and
      // made a valid token look broken. Identity and page access are enough to
      // validate the publishing configuration here.
      const page = await fetch(
        `${FB_GRAPH_BASE}/${pageId}?fields=id,name&access_token=${accessToken}`,
        { signal: AbortSignal.timeout(12000) },
      );
      const pageData: any = await page.json();
      if (pageData.error) {
        return {
          ok: false,
          detalle: `Token válido (${meData.name}) pero la página ${pageId} devolvió: ${pageData.error?.message || "error"}`,
        };
      }
      return {
        ok: true,
        detalle: `Conectado como ${meData.name} · Página ${pageData.name || pageId}`,
        page: { id: pageData.id, name: pageData.name },
      };
    }

    return { ok: true, detalle: `Conectado como ${meData.name || meData.id}` };
  } catch (err: any) {
    return { ok: false, detalle: err?.message || "No se pudo contactar a Facebook" };
  }
}
