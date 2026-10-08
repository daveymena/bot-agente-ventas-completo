import { logger } from "./logger";
import { tenantManager, type TenantContext } from "./tenantManager";
import { FB_GRAPH_BASE } from "./meta-api-version";
import { enmascararSecreto } from "./secretos";

/**
 * El respaldo del .env (FB_ACCESS_TOKEN, FB_AD_ACCOUNT_ID, FB_PAGE_ID…) es la
 * cuenta de Meta del DUEÑO del servidor: vale solo para ese negocio. Es la
 * regla que ya aplicaban facebook.ts, ad-strategist.ts y /facebook/config;
 * encontrado el 29-09-2026 que esta función central y ~10 lecturas sueltas
 * (comentarios, Marketplace, Messenger, publicaciones, píxel de la landing,
 * métricas) no la aplicaban: un negocio sin Facebook propio publicaba en la
 * página del dueño, medía en su píxel y leía su cuenta publicitaria.
 * Sin negocio (null) se trata como el dueño, igual que FacebookService.
 * Lo que es de la APP de Meta (appId, appSecret, verify tokens) no es de una
 * cuenta y sigue siendo global.
 */
export function respaldoEnvFacebook(tenantId: number | null | undefined): (valor: string | undefined) => string {
  const esDuenoDelServidor = tenantId == null || tenantId === tenantManager.getDefaultTenant().id;
  return (valor) => (esDuenoDelServidor ? valor || "" : "");
}

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
  userAccessToken?: string;
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
  return enmascararSecreto(valor);
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
  const env = respaldoEnvFacebook(tenant?.id);

  const accessToken = fb.accessToken || env(process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN);
  const appSecret = fb.appSecret || process.env.FB_APP_SECRET || "";
  const messengerPageToken = fb.messengerPageToken || env(process.env.FB_MESSENGER_PAGE_TOKEN);
  const messengerVerifyToken = fb.messengerVerifyToken || process.env.FB_MESSENGER_VERIFY_TOKEN || "";

  const tienePropias = !!(
    fb.accessToken || fb.pageId || fb.adAccountId || fb.catalogId || fb.pixelId || fb.appId || fb.appSecret
  );

  return {
    accessToken,
    userAccessToken: fb.userAccessToken || env(process.env.FB_USER_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN),
    pageId: fb.pageId || env(process.env.FB_PAGE_ID),
    adAccountId: fb.adAccountId || env(process.env.FB_AD_ACCOUNT_ID),
    pixelId: fb.pixelId || env(process.env.FB_PIXEL_ID),
    catalogId: fb.catalogId || env(process.env.FB_CATALOG_ID),
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
): Promise<{ ok: boolean; detalle: string; page?: { id: string; name: string; tasks?: string[] }; hayQueReconectar?: boolean; cuentaPuedeGastar?: boolean }> {
  if (!accessToken) return { ok: false, detalle: "Falta el access token" };
  try {
    // Primero valida el token contra /me (solo lectura).
    const me = await fetch(`${FB_GRAPH_BASE}/me?fields=id,name&access_token=${accessToken}`, {
      signal: AbortSignal.timeout(12000),
    });
    const meData: any = await me.json();
    if (meData.error) {
      // El texto de Graph es en inglés y no dice qué hacer. Si es uno de los
      // fallos que el admin puede resolver, se traduce al paso concreto.
      const { diagnosticoDeErrorDeMeta } = await import("./facebook");
      const diag = diagnosticoDeErrorDeMeta(meData.error);
      return { ok: false, detalle: diag?.motivo || meData.error?.message || "Token inválido", hayQueReconectar: diag?.hayQueReconectar };
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
