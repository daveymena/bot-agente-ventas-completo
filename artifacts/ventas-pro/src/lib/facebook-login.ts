/**
 * Enlace del login de Facebook (OAuth, response_type=code).
 *
 * Lo usan la página Facebook y la de Integraciones. Va en un solo lugar para
 * que los permisos no se desfasen entre las dos.
 *
 * `redirectUri` tiene que ser una de las "Valid OAuth Redirect URIs" de la app
 * en developers.facebook.com: hoy es `${origin}/facebook`, y esa página es la
 * que canjea el `?code=` en /api/public/fb-connect. Por eso Integraciones
 * vuelve a /facebook y no a sí misma.
 */
export interface ConfigAppFacebook {
  appId: string | null;
  enabled: boolean;
  loginConfigId?: string | null;
}

export const PERMISOS_FACEBOOK = [
  "pages_show_list", "pages_read_engagement", "pages_manage_posts",
  "pages_manage_metadata", "pages_messaging", "ads_management", "catalog_management",
  // Sin esto /me/businesses falla y las cuentas del Business Manager no
  // se pueden listar (caso real 30-09-2026: la cuenta COP no aparecía).
  "business_management",
  // Campañas de formulario (25-09-2026): crear el formulario y leer los
  // leads. Con config_id estos permisos van en la configuración de "Inicio
  // de sesión para empresas" de la app en Meta, no acá.
  "leads_retrieval", "pages_manage_ads",
  // Lo que el backend revisa y usa: lectura de métricas de anuncios e Instagram
  // (app-operator.ts, verificación de permisos). Sin estos, el panel marca
  // "faltan permisos" aunque el negocio haya aceptado todo lo demás.
  "ads_read", "instagram_basic", "instagram_content_publish",
];

/** URL del diálogo de login; null si la app no está configurada. */
export function urlLoginFacebook(cfg: ConfigAppFacebook, redirectUri: string): string | null {
  if (!cfg.appId) return null;
  // Misma versión que el backend (META_API_VERSION, por defecto v23.0).
  const base = `https://www.facebook.com/v23.0/dialog/oauth?client_id=${encodeURIComponent(cfg.appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
  // "Inicio de sesión con Facebook para empresas" ignora `scope` y exige
  // `config_id` (confirmado en producción, ago-2026).
  if (cfg.loginConfigId) return `${base}&config_id=${encodeURIComponent(cfg.loginConfigId)}`;
  return `${base}&scope=${encodeURIComponent(PERMISOS_FACEBOOK.join(","))}`;
}
