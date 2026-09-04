import { logger } from "./logger";

/**
 * URL pública de la aplicación — un solo punto de verdad.
 *
 * Antes esto estaba repetido en 14 lugares con la forma:
 *
 *     process.env.APP_URL || "https://tecnovariedades.easypanel.host"
 *
 * Ese fallback es un dominio que ya NO nos pertenece: hoy sirve una página
 * de dominio aparcado de Namecheap. Con APP_URL sin definir, la app seguía
 * andando "normal" pero generaba enlaces de pago, correos de activación,
 * webhooks y anuncios de Facebook apuntando a esa página. El cliente hacía
 * clic en "pagar" y aterrizaba en un parking — sin ningún error visible en
 * los logs, porque para el código eso era una URL válida.
 *
 * Un fallback a un dominio que no controlamos es peor que no tener fallback:
 * convierte una mala configuración en una fuga silenciosa de clientes. Acá
 * se prefiere avisar fuerte y devolver cadena vacía, así los enlaces salen
 * relativos (que en el navegador resuelven contra el host correcto) en vez
 * de absolutos hacia un sitio ajeno.
 */
let advertido = false;

export function getAppUrl(): string {
  const raw = (process.env.APP_URL || "").trim();
  if (raw) return raw.replace(/\/+$/, "");

  // Una sola advertencia por proceso: esto se llama en cada checkout, cada
  // correo y cada publicación: logearlo siempre ahogaría el resto del log.
  if (!advertido) {
    advertido = true;
    logger.error(
      "[AppUrl] APP_URL NO está definida. Los enlaces absolutos (pagos, correos de activación, " +
      "webhooks, anuncios) van a salir vacíos o relativos. Configurá APP_URL con el dominio " +
      "público real antes de cobrar o publicar.",
    );
  }
  return "";
}

/**
 * Une la URL pública con una ruta. Si no hay APP_URL configurada devuelve la
 * ruta relativa, que es lo correcto para enlaces que se abren dentro de la
 * propia app; para los que viajan afuera (WhatsApp, email, Meta) el llamador
 * debe chequear que no esté vacía — ver requireAppUrl().
 */
export function appUrl(path = ""): string {
  const base = getAppUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/**
 * Igual que appUrl() pero para enlaces que SALEN de la aplicación (pasarelas
 * de pago, correos, catálogos de Meta). Ahí una ruta relativa no sirve de
 * nada, así que es mejor fallar explícito que mandar un enlace roto a un
 * cliente que está por pagar.
 */
export function requireAppUrl(path = ""): string {
  const base = getAppUrl();
  if (!base) {
    throw new Error(
      "APP_URL no está configurada y se necesita una URL absoluta para este enlace " +
      "(pago, correo o publicación externa). Configurá APP_URL con el dominio público.",
    );
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
