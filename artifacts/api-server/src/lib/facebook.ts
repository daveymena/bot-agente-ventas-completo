import { logger } from "./logger";
import { CAMPOS_WEBHOOK_PAGINA } from "./meta-campos-webhook";
import { getAppUrl } from "./app-url";
import { destinoWebDelProducto } from "./landing/destino-del-producto";
import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantManager, type TenantContext } from "./tenantManager";

import { FB_GRAPH_BASE } from "./meta-api-version";
const FB_GRAPH_URL = FB_GRAPH_BASE;

/**
 * ¿Vale la pena reintentar este error de Graph API?
 *
 * Solo los TRANSITORIOS. Un token inválido, un copy rechazado o una cuenta sin
 * método de pago no mejoran reintentando: repetirlos solo hace esperar al
 * admin para darle el mismo error.
 *
 * Los códigos son los que Meta documenta como temporales:
 *   1, 2     problema temporal o desconocido del lado de Meta
 *   4, 17    límite de llamadas de la app o del usuario
 *   32, 613  límite de la página / demasiadas llamadas
 *   341      límite temporal alcanzado
 *
 * Importa más de lo que parece: subir un anuncio a Meta son CUATRO llamadas
 * encadenadas --campaña, conjunto, creativo, anuncio-- y si falla cualquiera
 * después de la primera se borra la campaña y no queda nada. El admin lo
 * describió así: "a veces manda el anuncio pero no realiza el conjunto de
 * anuncios, y sin eso no hay nada". Un parpadeo de Meta en el paso 2 tiraba
 * abajo el trabajo de los cuatro.
 */
/**
 * ¿Este anuncio deja que Meta elija el público (Advantage+) o manda el admin?
 *
 * Gana el algoritmo por defecto, y el admin cuando pidió algo concreto. La
 * regla es esa y el resto es cómo se detecta "concreto": intereses, género, o
 * un rango de edad más angosto que el 18-65 que se usa cuando nadie dijo nada.
 *
 * Un rango de edad DEFAULT (18-65) no cuenta como pedido: es lo que pone el
 * sistema cuando el admin no habló de edad, y tomarlo por una decisión suya
 * apagaría Advantage+ en todas las campañas -- que es justo lo que pasaba.
 */
export function usarAdvantagePlus(targeting?: {
  interests?: unknown[];
  genders?: unknown[];
  ageMin?: number;
  ageMax?: number;
  geoLocations?: { cities?: unknown[] };
}): boolean {
  const pidioPublicoConcreto =
    (targeting?.geoLocations?.cities?.length ?? 0) > 0
    || (targeting?.interests?.length ?? 0) > 0
    || (targeting?.genders?.length ?? 0) > 0
    || (targeting?.ageMin != null && targeting.ageMin > 18)
    || (targeting?.ageMax != null && targeting.ageMax < 65);
  return !pidioPublicoConcreto;
}

/**
 * Qué le pasó de verdad a la conexión con Meta, dicho para el admin.
 *
 * Graph API contesta en inglés y en su propio vocabulario:
 *
 *   "Error validating access token: Session has expired on Monday,
 *    10-Aug-26 18:00:00 PDT" (código 190, subcódigo 463)
 *
 * Ese texto salía tal cual al panel y a Atlas. El admin no tiene forma de
 * saber que eso significa "entrá a Configuración y volvé a conectar", así que
 * el sistema queda roto sin que nadie sepa qué hacer.
 *
 * Y no es un caso raro: los tokens de Meta VENCEN. Le va a pasar a todos los
 * que usen la app, y les va a pasar callado -- los anuncios simplemente dejan
 * de publicarse. Medido en la cuenta de producción el 2026-08-29: el token
 * del entorno había vencido el 10 de agosto, diecinueve días antes, y nada
 * en el sistema lo decía.
 */
export function diagnosticoDeErrorDeMeta(error: any): { motivo: string; hayQueReconectar: boolean } | null {
  if (!error) return null;
  const e = error?.fbError ?? error;
  const codigo = Number(e?.code);
  const sub = Number(e?.error_subcode);
  const msg = String(e?.message || "");

  // Token vencido o revocado. Reintentar no sirve: hay que reconectar.
  if (codigo === 190 || codigo === 102 || /validating access token|session has expired/i.test(msg)) {
    const cuando = msg.match(/expired on ([^."]+)/i)?.[1]?.trim();
    if (sub === 458 || /app_not_installed|not authorized/i.test(msg)) {
      return { motivo: "La app de Facebook fue desautorizada desde la cuenta. Hay que volver a conectarla desde Configuración → Facebook.", hayQueReconectar: true };
    }
    if (sub === 460 || /password/i.test(msg)) {
      return { motivo: "La sesión de Facebook se cerró (suele ser por un cambio de contraseña). Hay que reconectar desde Configuración → Facebook.", hayQueReconectar: true };
    }
    return {
      motivo:
        `La conexión con Facebook VENCIÓ${cuando ? ` el ${cuando}` : ""} y hay que renovarla desde Configuración → Facebook. ` +
        `Hasta que se reconecte no se puede publicar ni medir ningún anuncio.`,
      hayQueReconectar: true,
    };
  }

  // Permisos: el token vive, pero no alcanza para anuncios.
  if (codigo === 200 || codigo === 10 || /permission|ads_management|ads_read/i.test(msg)) {
    return {
      motivo: "La conexión con Facebook está viva pero le faltan permisos de anuncios (ads_management). Hay que reconectar aceptando los permisos de publicidad.",
      hayQueReconectar: true,
    };
  }

  // La cuenta publicitaria no puede gastar.
  if (codigo === 2635 || /ad account.*(disabled|restricted|closed)|cuenta publicitaria.*(inhabilit|restring)/i.test(msg)) {
    return {
      motivo: "La cuenta publicitaria está restringida o inhabilitada en Meta. Se pueden crear campañas, pero NO van a entregar hasta resolverlo en el Administrador de Anuncios.",
      hayQueReconectar: false,
    };
  }

  return null;
}

/**
 * Qué significa cada `account_status` de una cuenta publicitaria.
 *
 * `fb_status` validaba el token y la página, y nunca la CUENTA. Así podía
 * contestar "Facebook conectado ✅" mientras ningún anuncio entregaba: la
 * cuenta de producción figura en las notas del admin como restringida por
 * saldo pendiente. Un estado que dice OK cuando no lo está es peor que no
 * tener estado.
 */
export const ESTADO_DE_CUENTA_META: Record<number, { texto: string; puedeGastar: boolean }> = {
  1: { texto: "activa", puedeGastar: true },
  2: { texto: "DESACTIVADA", puedeGastar: false },
  3: { texto: "SIN MÉTODO DE PAGO", puedeGastar: false },
  7: { texto: "en revisión de Meta", puedeGastar: false },
  8: { texto: "pendiente de cierre", puedeGastar: false },
  9: { texto: "EN PERIODO DE GRACIA (hay saldo pendiente de pago)", puedeGastar: false },
  100: { texto: "CERRADA POR FALTA DE PAGO", puedeGastar: false },
  101: { texto: "CERRADA", puedeGastar: false },
};

export function esErrorTransitorioDeMeta(err: any): boolean {
  const code = Number(err?.code ?? err?.fbError?.code);
  if ([1, 2, 4, 17, 32, 341, 613].includes(code)) return true;
  const msg = String(err?.message || "").toLowerCase();
  return /temporar|try again|rate limit|please retry|timeout|tiempo de espera/.test(msg);
}

/**
 * Convierte una ruta relativa del catálogo (/uploads/products/42.jpg) en URL
 * pública absoluta -- Facebook descarga la imagen desde sus servidores, una
 * ruta relativa no le sirve. Mismo helper que facebook-marketplace.ts.
 */
/**
 * link_data de un anuncio CARRUSEL: una tarjeta por foto, mismo destino y
 * mismo botón en todas. Sin `picture` en la raíz (eso lo haría imagen única).
 */
/**
 * La plantilla (estructura de la campaña más reciente) COMPLETA lo que el
 * pedido no trae; nunca pisa lo que sí trae.
 *
 * 08-10, revisión de punta a punta: la plantilla pisaba las edades pedidas con
 * las de la campaña vieja (18-65), imponía su Advantage+ aunque se pidieran
 * ciudades y, peor, le sumaba el PAÍS a las ciudades pedidas — en Meta ciudades
 * + país = todo el país. El arreglo de ciudades se deshacía acá mismo.
 */
export function aplicarPlantillaSinPisar(
  fbTargeting: Record<string, any>,
  primero: { paises?: string[] | null; tiposDeUbicacion?: string[] | null; edadMin?: number | null; edadMax?: number | null; advantagePlus?: boolean | null },
  pedido?: { ageMin?: number; ageMax?: number; genders?: unknown[]; interests?: unknown[]; geoLocations?: { countries?: unknown[]; cities?: unknown[] } } | null,
): void {
  const pidioCiudades = (pedido?.geoLocations?.cities?.length ?? 0) > 0;
  const pidioPaises = (pedido?.geoLocations?.countries?.length ?? 0) > 0;
  if (primero.paises?.length && !pidioPaises && !pidioCiudades) {
    fbTargeting.geo_locations = { ...(fbTargeting.geo_locations || {}), countries: primero.paises };
  }
  if (primero.tiposDeUbicacion?.length && !pidioCiudades) {
    fbTargeting.geo_locations = { ...(fbTargeting.geo_locations || {}), location_types: primero.tiposDeUbicacion };
  }
  if (primero.edadMin && pedido?.ageMin == null) fbTargeting.age_min = primero.edadMin;
  if (primero.edadMax && pedido?.ageMax == null) fbTargeting.age_max = primero.edadMax;
  const pidioPublicoConcreto = pidioCiudades || pedido?.ageMin != null || pedido?.ageMax != null
    || (pedido?.genders?.length ?? 0) > 0 || (pedido?.interests?.length ?? 0) > 0;
  if (primero.advantagePlus != null && !pidioPublicoConcreto) {
    fbTargeting.targeting_automation = { advantage_audience: primero.advantagePlus ? 1 : 0 };
  }
}

/**
 * ¿Qué píxel usar? 08-10: VentasPro tenía guardado 1193902929595904, que NO
 * es de la cuenta publicitaria; la cuenta tenía uno solo (1064770976005166).
 * Resultado: ninguna campaña de ventas podía medir compras. Si el guardado es
 * de la cuenta, ese; si no y la cuenta tiene exactamente uno, ese; con varios
 * no se adivina (null: que el dueño elija).
 */
export function elegirPixel(guardado: string, deLaCuenta: string[]): { pixelId: string | null; corregido: boolean } {
  if (guardado && deLaCuenta.includes(guardado)) return { pixelId: guardado, corregido: false };
  if (deLaCuenta.length === 1) return { pixelId: deLaCuenta[0]!, corregido: !!guardado };
  return { pixelId: null, corregido: false };
}

export function linkDataDeCarrusel(ld: Record<string, any>, fotos: string[], titulo: string): Record<string, any> {
  const { picture: _unaSola, ...resto } = ld;
  return {
    ...resto,
    child_attachments: fotos.slice(0, 10).map((picture) => ({
      link: ld.link,
      picture,
      name: titulo,
      call_to_action: ld.call_to_action,
    })),
    // Meta reordena las tarjetas según rendimiento; sin tarjeta final de perfil.
    multi_share_optimized: true,
    multi_share_end_card: false,
  };
}

function absoluteImageUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const appUrl = getAppUrl();
  if (!/^https:\/\//i.test(appUrl)) return null;
  return `${appUrl.replace(/\/+$/, "")}/${pathOrUrl.replace(/^\/+/, "")}`;
}

/** Busca cada nombre de interés en la taxonomía real de intereses de
 * Facebook (Graph API /search?type=adinterest) y devuelve solo los que
 * existen, con su ID verdadero. Un interés mandado sin ID (o con uno
 * inventado) no segmenta nada -- Graph API lo ignora en silencio y el
 * anuncio sale con audiencia amplia aunque el panel muestre nombres de
 * "intereses aplicados". Compartido entre FacebookService (Anuncios) y
 * AdStrategist (Borradores), que tenían el mismo bug cada uno por su lado. */
export async function resolveInterestIds(accessToken: string, names: string[]): Promise<Array<{ id: string; name: string }>> {
  const resolved: Array<{ id: string; name: string }> = [];
  for (const name of names) {
    try {
      // 08-10: "dolor de espalda", "postura" y "trabajo de oficina" volvían
      // vacíos (la búsqueda sin locale es en inglés). Primero en español.
      let match: any = null;
      for (const locale of ["es_LA", ""]) {
        const params = new URLSearchParams({ type: "adinterest", q: name, limit: "1", access_token: accessToken });
        if (locale) params.set("locale", locale);
        const res = await fetch(`${FB_GRAPH_URL}/search?${params}`, { signal: AbortSignal.timeout(10000) });
        const data: any = await res.json();
        match = data?.data?.[0];
        if (match?.id) break;
      }
      if (match?.id) resolved.push({ id: match.id, name: match.name || name });
    } catch (err: any) {
      logger.warn({ err, name }, "[Facebook] No se pudo resolver el interés en la taxonomía de Facebook");
    }
  }
  return resolved;
}

/**
 * Ciudades por NOMBRE → la clave numérica que exige Meta.
 *
 * Producción 07/08-10: el dueño pidió Bogotá, Medellín, Cali, Barranquilla,
 * Bucaramanga y Cartagena y el anuncio salió a TODO el país. Dos fallas:
 * se mandaba `{ key: "Bogotá" }` (Meta exige la clave de su taxonomía) y el
 * país iba junto con las ciudades (en geo_locations eso SUMA: país completo).
 */
export async function resolverCiudades(
  accessToken: string,
  nombres: string[],
  pais = "CO",
): Promise<{ resueltas: Array<{ key: string; name: string }>; faltan: string[] }> {
  const resueltas: Array<{ key: string; name: string }> = [];
  const faltan: string[] = [];
  for (const nombre of nombres.map((n) => String(n || "").trim()).filter(Boolean)) {
    // Ya viene una clave (numérica): se respeta.
    if (/^\d+$/.test(nombre)) { resueltas.push({ key: nombre, name: nombre }); continue; }
    try {
      const params = new URLSearchParams({
        type: "adgeolocation", location_types: JSON.stringify(["city"]), q: nombre,
        country_code: pais, limit: "1", access_token: accessToken,
      });
      const res = await fetch(`${FB_GRAPH_URL}/search?${params}`, { signal: AbortSignal.timeout(10000) });
      const data: any = await res.json();
      const m = data?.data?.[0];
      if (m?.key) resueltas.push({ key: String(m.key), name: String(m.name || nombre) });
      else faltan.push(nombre);
    } catch {
      faltan.push(nombre);
    }
  }
  return { resueltas, faltan };
}

/** geo_locations: con ciudades van SOLO las ciudades (con país sumaría todo el país). */
export function geoConCiudades(paises: string[], ciudades: Array<{ key: string }>): Record<string, any> {
  if (ciudades.length) {
    return { cities: ciudades.map((c) => ({ key: c.key, radius: 20, distance_unit: "kilometer" })), location_types: ["home", "recent"] };
  }
  return { countries: paises };
}

export interface FacebookConfig {
  accessToken: string;
  // Token de PÁGINA -- sirve para publicar en el muro (/feed, /photos) pero
  // Meta lo rechaza en endpoints de cuenta publicitaria y de catálogo, que
  // exigen un token de USUARIO con permisos ads_management/catalog_management
  // otorgados a nivel de Business Manager. Mismo motivo por el que
  // ad-strategist.ts necesitó separar los dos tokens (ver comentario ahí).
  userAccessToken: string;
  pixelId: string;
  catalogId: string;
  pageId: string;
  adAccountId: string;
}

export interface FbTargeting {
  geoLocations?: { countries?: string[]; cities?: string[]; radius?: number };
  ageMin?: number;
  ageMax?: number;
  genders?: number[];
  interests?: Array<{ id: string; name: string }>;
  customAudiences?: string[];
  /** Audiencias propias EXCLUIDAS (ids de Meta). */
  excludedCustomAudiences?: string[];
  /** Advantage+ Audience explícito; sin definir, lo decide usarAdvantagePlus. */
  advantagePlus?: boolean;
  placements?: {
    facebook?: string[];
    instagram?: string[];
    messenger?: string[];
  };
}

/**
 * Plantilla de campaña: la ESTRUCTURA que ya funciona en la cuenta, sacada de
 * una campaña real (`plantillaDesdeCampana`) o escrita a mano. Pedido del
 * dueño (13-09-2026): "que lo que publique sea como lo que está activo o en
 * pausa en Meta". Medido en su cuenta: una campaña OUTCOME_ENGAGEMENT con DOS
 * conjuntos (Colombia optimizado a CONVERSATIONS por WhatsApp; Internacional
 * US/MX/ES optimizado a LINK_CLICKS), Advantage+ audiencia, ubicaciones
 * automáticas, cuenta de Instagram vinculada y TODAS las mejoras automáticas
 * del creativo encendidas.
 */
/**
 * Paquetes de mejoras que Meta DIO DE BAJA: rechaza el creativo entero con
 * error 100 / subcódigo 3858504 ("La opción para incluir el campo de mejoras
 * estándar en el anuncio está obsoleta. Define funciones individuales en su
 * lugar"). Visto en vivo el 23-09-2026 subiendo el corrector: la rama de
 * "mejoras completas" (copiar la campaña más reciente) los volvía a meter,
 * aunque el comentario de al lado ya decía que estaban obsoletos.
 */
const PAQUETES_OBSOLETOS = new Set(["standard_enhancements", "advantage_plus_creative"]);

/**
 * Las mejoras de Advantage+ del creativo, UNA POR UNA (Meta ya no acepta
 * paquetes). Las que alteran la imagen solo con foto real del producto.
 */
export function mejorasDelCreativo(opts: { hayFotoReal: boolean; mejorasCompletas: boolean; conCarrusel?: boolean }): Record<string, { enroll_status: "OPT_IN" }> {
  const f: string[] = ["text_optimizations", "enhance_cta"];
  if (opts.hayFotoReal) f.push("image_touchups", "image_brightness_and_contrast", "image_uncrop");
  // Con CARRUSEL (2+ fotos reales): multi_photo_to_video deja que la IA de
  // Meta arme un VIDEO con las fotos del producto (la lista oficial de
  // AdCreativeFeaturesSpec v26; no es el touchup individual). Solo con foto
  // real, como las demás que alteran la imagen.
  if (opts.hayFotoReal && opts.conCarrusel) f.push("multi_photo_to_video");
  // Como en las campañas reales de la cuenta: todas las mejoras individuales.
  // media_type_automation entra acá (pedida por el dueño 04-10: "programá que
  // Meta automáticamente mejore... y todo lo demás"): Meta elige el TIPO de
  // medio (imagen, video o carrusel) por persona, junto con la entrega y el
  // público.
  if (opts.mejorasCompletas) {
    f.push("media_type_automation", "image_templates", "image_animation", "cv_transformation", "inline_comment", "pac_relaxation",
      "product_extensions", "show_destination_blurbs", "site_extensions", "product_browsing");
  }
  const spec: Record<string, { enroll_status: "OPT_IN" }> = {};
  for (const nombre of f) if (!PAQUETES_OBSOLETOS.has(nombre)) spec[nombre] = { enroll_status: "OPT_IN" };
  return spec;
}

export interface PlantillaDeCampana {
  /** De qué campaña se sacó (para el log y para el admin). */
  origen?: { id: string; nombre: string } | null;
  conjuntos: Array<{
    nombre: string;
    paises: string[];
    /** CONVERSATIONS (WhatsApp) o LINK_CLICKS. Si falta, el del objetivo. */
    optimizacion?: string | null;
    presupuestoDiario?: number | null;
    edadMin?: number | null;
    edadMax?: number | null;
    /** home/recent/frequently_in */
    tiposDeUbicacion?: string[] | null;
    advantagePlus?: boolean;
  }>;
  /** Encender todas las mejoras automáticas del creativo (como en la cuenta). */
  mejorasCompletas?: boolean;
  /** Publicar también con la cuenta de Instagram vinculada a la página. */
  instagram?: boolean;
}

export interface FbAudienceSuggestion {
  description: string;
  targeting: FbTargeting;
  rationale: string;
}

/**
 * ¿Esta optimización de conjunto la acepta Meta con este objetivo de campaña?
 * Mezclarlas (CONVERSATIONS en una campaña de tráfico) da #1815159.
 */
export function optimizacionCompatible(metaObjective: string, optimizacion: string): boolean {
  const o = String(optimizacion || "").toUpperCase();
  const PERMITIDAS: Record<string, string[]> = {
    OUTCOME_TRAFFIC: ["LANDING_PAGE_VIEWS", "LINK_CLICKS", "REACH", "IMPRESSIONS"],
    OUTCOME_ENGAGEMENT: ["CONVERSATIONS", "POST_ENGAGEMENT", "THRUPLAY", "LINK_CLICKS"],
    OUTCOME_AWARENESS: ["REACH", "IMPRESSIONS", "AD_RECALL_LIFT", "THRUPLAY"],
    OUTCOME_SALES: ["OFFSITE_CONVERSIONS", "VALUE", "LINK_CLICKS", "LANDING_PAGE_VIEWS", "CONVERSATIONS", "IMPRESSIONS", "REACH"],
    OUTCOME_LEADS: ["LEAD_GENERATION", "QUALITY_LEAD", "OFFSITE_CONVERSIONS", "CONVERSATIONS", "LINK_CLICKS"],
  };
  const lista = PERMITIDAS[String(metaObjective || "").toUpperCase()];
  return lista ? lista.includes(o) : false;
}

export interface FbCampaignResult {
  campaignId: string;
  adSetId: string;
  adId: string;
  imageUrl: string;
  adCopy: { primaryText: string; headline: string; description: string };
  status: string;
  previewUrl: string;
  /** A dónde lleva el anuncio: "whatsapp" o la URL web (landing o tienda). */
  destino?: string;
  objetivo?: string;
}

/**
 * Monedas SIN centavos (currency offset 1 en Meta): el monto va tal cual,
 * ni se multiplica ni se divide por 100. Vive a nivel de modulo porque la
 * usan la conversion de ida y la de vuelta -- tenerla duplicada fue lo que
 * dejo el x100 vivo del lado de la LECTURA despues de arreglarlo en la
 * escritura. Fuente: developers.facebook.com/docs/marketing-api/currencies
 */
const MONEDAS_SIN_DECIMALES = new Set(["COP", "CLP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

export class FacebookService {
  private config: FacebookConfig;
  /** El píxel del negocio (lo necesita la landing para medir compras). */
  get pixelId(): string { return this.config?.pixelId || ""; }
  private tenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
    const fb = this.tenant.facebook || {};

    // El respaldo del .env vale SOLO para el negocio dueño del servidor.
    //
    // Antes aplicaba a todos: un negocio nuevo que todavía no conectó su
    // Facebook heredaba silenciosamente el del dueño de la plataforma, así
    // que publicaba en SU página y creaba anuncios que gastaban de SU cuenta
    // publicitaria, midiendo en SU píxel. Es el mismo patrón que los cobros y
    // el Nequi, pero el más caro: acá se gasta dinero solo.
    //
    // Para cualquier otro negocio, vacío es vacío: isConfigured() da false y
    // la interfaz pide conectar Facebook, en vez de operar sobre la cuenta
    // equivocada sin que nadie se entere.
    const esDuenoDelServidor = this.tenant.id === tenantManager.getDefaultTenant().id;
    const env = (valor: string | undefined) => (esDuenoDelServidor ? valor || "" : "");

    const pageToken = fb.accessToken || env(process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN);
    this.config = {
      accessToken: pageToken,
      // Sin token de usuario propio (tenant que conectó antes de que
      // existiera userAccessToken, o dueño del servidor sin uno separado en
      // .env) caemos al de página -- sigue fallando en catálogo/anuncios
      // igual que antes, pero no rompe nada que hoy funcione con él.
      userAccessToken: fb.userAccessToken || pageToken,
      pixelId: fb.pixelId || env(process.env.FB_PIXEL_ID),
      catalogId: fb.catalogId || env(process.env.FB_CATALOG_ID),
      pageId: fb.pageId || env(process.env.FB_PAGE_ID),
      adAccountId: fb.adAccountId || env(process.env.FB_AD_ACCOUNT_ID),
    };
  }

  isConfigured(): boolean {
    return !!this.config.accessToken;
  }

  /**
   * Las cuentas publicitarias a las que llega este token, con cual esta en uso.
   *
   * ── Por que hacia falta ───────────────────────────────────────────────
   *
   * Al conectar Facebook, la cuenta se elige SOLA: `lista.find(c =>
   * c.account_status === 1) || lista[0]`, o sea la primera activa. Con una
   * sola cuenta no hay problema; con varias, reconectar puede cambiarte de
   * cuenta sin avisar -- y de golpe las campañas "desaparecen" porque se estan
   * pidiendo de otra cuenta.
   *
   * El panel dejaba ESCRIBIR el id a mano pero no habia forma de ver cuales
   * existen: habia que ir a Meta a buscarlo. El comentario del propio flujo de
   * conexion dice que eso "rompe la promesa del producto".
   */
  async listarCuentasPublicitarias(): Promise<{
    cuentas: Array<{ id: string; nombre: string; moneda: string; activa: boolean; enUso: boolean; estado: number | null; empresa: { id: string; nombre: string } | null; origen: string }>;
    avisos: string[];
    error: string | null;
  }> {
    // Antes: solo `me/adaccounts` con limit 25 y sin paginar. Las cuentas del
    // Business Manager no aparecian nunca (caso real 30-09-2026: el dueño veia
    // solo la USD y no su cuenta COP). Ver meta-cuentas-publicitarias.ts.
    const token = this.config.userAccessToken || this.config.accessToken;
    const { listarCuentasAccesibles } = await import("./meta-cuentas-publicitarias");
    const r = await listarCuentasAccesibles(token);
    const enUso = String(this.config.adAccountId || "");
    return {
      cuentas: r.cuentas.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        moneda: c.moneda,
        activa: c.activa,
        estado: c.estado,
        empresa: c.empresa || null,
        origen: c.origen,
        enUso: c.id === enUso,
      })),
      avisos: r.avisos,
      // Devolver [] a secas haria que "no tenes cuentas" y "no pude preguntar"
      // fueran lo mismo. Ese error ya costo caro dos veces en este archivo.
      error: r.error,
    };
  }

  /**
   * Cambia la cuenta publicitaria activa del negocio, SOLO a una que ve su
   * propio token. Si es COP pasa a ser tambien la autorizada (es una orden
   * explicita del dueño). No crea ni gasta nada en Meta.
   */
  async cambiarCuentaPublicitaria(idPedido: unknown, por: string): Promise<{ ok: boolean; message: string; cuenta?: { id: string; nombre: string; moneda: string } }> {
    const tenantId = Number((this.tenant as any)?.id) || 0;
    if (!tenantId) return { ok: false, message: "No se sabe de qué negocio es la cuenta." };
    const token = this.config.userAccessToken || this.config.accessToken;
    if (!token) return { ok: false, message: "Facebook no está conectado en este negocio." };
    const { listarCuentasAccesibles, validarCambioDeCuenta } = await import("./meta-cuentas-publicitarias");
    const listado = await listarCuentasAccesibles(token);
    if (listado.error) return { ok: false, message: `No se pudieron leer las cuentas de Meta: ${listado.error}` };
    const v = validarCambioDeCuenta(listado.cuentas, idPedido);
    if (!v.ok) return { ok: false, message: v.motivo };
    const { cambiarCuentaActiva } = await import("./meta-cuenta-autorizada");
    await cambiarCuentaActiva(tenantId, v.cuenta, por);
    this.config.adAccountId = v.cuenta.id;
    this.monedaCuenta = v.cuenta.moneda || null;
    return {
      ok: true,
      message: `Cuenta publicitaria activa: ${v.cuenta.nombre} (${v.cuenta.id}, ${v.cuenta.moneda || "?"}).${v.aviso ? " " + v.aviso : ""}`,
      cuenta: { id: v.cuenta.id, nombre: v.cuenta.nombre, moneda: v.cuenta.moneda },
    };
  }

  /**
   * Si hay cuenta publicitaria cargada.
   *
   * ⚠️ Es DISTINTO de `isConfigured()`, que solo mira el token. Sin este id,
   * `listActiveCampaigns()` devuelve [] en la primera linea y quien pregunta
   * recibe "no hay campañas" -- cuando lo que falta es la cuenta. Es el mismo
   * error que ya se corrigio para Atlas: una consulta que no se pudo hacer no
   * es un hecho sobre el mundo.
   */
  tieneCuentaPublicitaria(): boolean {
    return !!this.config.adAccountId;
  }

  /**
   * P0 §3.2 del doc de faltantes: la cuenta configurada tiene que ser la COP
   * autorizada del negocio y estar activa en Meta, ANTES de crear o activar
   * nada. Lo usan createAdForProduct (vía publishDraft y subirBorradorAMeta
   * también pasan por ahí) y publishDraft de AdStrategist.
   */
  async validarCuentaParaPublicar(origen: string): Promise<import("./meta-cuenta-autorizada").VeredictoCuenta> {
    const { validarCuentaPublicitaria } = await import("./meta-cuenta-autorizada");
    return validarCuentaPublicitaria({
      tenantId: Number((this.tenant as any)?.id) || 0,
      adAccountId: this.config.adAccountId,
      token: this.config.userAccessToken || this.config.accessToken,
      origen,
    });
  }

  /**
   * Moneda de la cuenta publicitaria ("COP", "USD", ...), cacheada por
   * instancia. Meta guarda los presupuestos en la MONEDA DE LA CUENTA, no en
   * la del negocio.
   */
  private monedaCuenta: string | null = null;
  async getAccountCurrency(): Promise<string | null> {
    if (this.monedaCuenta) return this.monedaCuenta;
    if (!this.config.adAccountId) return null;
    try {
      const r = await this.fbGet(`act_${this.config.adAccountId}`, { fields: "currency" }, this.config.userAccessToken);
      this.monedaCuenta = r?.currency || null;
      return this.monedaCuenta;
    } catch (err: any) {
      logger.warn({ err }, "[Facebook] No se pudo leer la moneda de la cuenta publicitaria");
      return null;
    }
  }

  /**
   * Convierte un presupuesto expresado en PESOS COLOMBIANOS a las unidades
   * mínimas de la moneda de la cuenta, que es lo que espera Graph API.
   *
   * INCIDENTE REAL (2026-08-10) que motiva esto: toda la app razona en COP
   * (las plantillas por nicho traen `budget: 15000/20000`, o sea ~15-20 mil
   * pesos), y el código hacía `daily_budget: monto * 100` asumiendo que la
   * cuenta también estaba en COP. La cuenta real estaba en USD, así que Meta
   * leyó 2.000.000 de centavos = **US$20.000 POR DÍA** (~80 millones de pesos
   * diarios) en una campaña que quedó ACTIVA. Lo único que evitó el desastre
   * fue que la cuenta no tenía método de pago todavía.
   *
   * Además de convertir, hay un TECHO DURO de seguridad: ningún camino
   * automático debería poder fijar un presupuesto diario disparatado por un
   * error de unidades. Si el monto convertido supera el equivalente a
   * ~2.000.000 COP/día, se corta con un error claro en vez de mandarlo.
   */
  /** Igual que presupuestoDiarioParaMeta, expuesto para que ad-strategist.ts
   * (que arma sus propias campañas) use exactamente la misma conversión y el
   * mismo techo de seguridad, en vez de duplicar la lógica. */
  async presupuestoDiarioParaMetaPublico(montoCop: number) {
    return this.presupuestoDiarioParaMeta(montoCop);
  }

  private async presupuestoDiarioParaMeta(montoCop: number): Promise<{ ok: true; valor: number } | { ok: false; message: string }> {
    if (!Number.isFinite(montoCop) || montoCop <= 0) {
      return { ok: false, message: "El presupuesto diario tiene que ser mayor a cero." };
    }
    const TECHO_COP = 2_000_000; // ~US$500/día: muy por encima de un uso normal acá
    if (montoCop > TECHO_COP) {
      return {
        ok: false,
        message: `El presupuesto diario (${montoCop.toLocaleString("es-CO")} COP) supera el máximo de seguridad de ${TECHO_COP.toLocaleString("es-CO")} COP por día. Si de verdad querés gastar eso, cambialo desde el Administrador de Anuncios de Meta.`,
      };
    }

    const moneda = (await this.getAccountCurrency()) || "COP";

    // ⚠️ BUG DE PLATA REAL corregido el 2026-08-12: acá se multiplicaba SIEMPRE
    // por 100, y para el peso colombiano eso multiplica el gasto por CIEN.
    //
    // Meta expresa los montos en la "unidad mínima" de la moneda de la cuenta,
    // pero el factor depende de la moneda (su `currency offset`), no es 100
    // para todas. El PESO COLOMBIANO tiene offset 1 -- no tiene centavos --
    // así que un presupuesto de $10.000 COP se manda como 10000, NO como
    // 1.000.000. Confirmado en la documentación oficial de Meta
    // (developers.facebook.com/docs/marketing-api/currencies): COP, CLP, CRC,
    // HUF, ISK, IDR, JPY, KRW, PYG, TWD y VND son todas offset 1.
    //
    // Esto explica exactamente lo que el admin venía reportando: la app decía
    // "$10.000/día" y el Administrador de Anuncios mostraba "$1.000.000/día".
    // No era un error de lectura suyo ni un problema de conversión de moneda:
    // era este x100. Por suerte ninguna campaña llegó a tener conjunto de
    // anuncios, así que el gasto real quedó en $0 -- pero si alguna hubiera
    // arrancado, habría gastado cien veces lo pedido.
    if (moneda === "COP") return { ok: true, valor: Math.round(montoCop) };

    // La cuenta está en otra moneda: se convierte de verdad, con la tasa en
    // vivo que ya usa el checkout (exchange-rate.ts, COP por 1 USD).
    try {
      const { getExchangeRate } = await import("./exchange-rate");
      const copPorUsd = await getExchangeRate();
      if (!copPorUsd || copPorUsd <= 0) throw new Error("tasa inválida");
      if (moneda === "USD") {
        const usd = montoCop / copPorUsd;
        return { ok: true, valor: Math.max(1, Math.round(usd * 100)) };
      }
      // Si la cuenta está en otra moneda SIN decimales (yen, won, guaraní...),
      // no se puede convertir sin su tasa real, pero al menos que no se
      // multiplique por 100 por descuido si algún día se agrega la conversión.
      if (MONEDAS_SIN_DECIMALES.has(moneda)) {
        return {
          ok: false,
          message: `Tu cuenta publicitaria está en ${moneda}. Definí el presupuesto directamente en el Administrador de Anuncios de Meta para no arriesgar un monto mal convertido.`,
        };
      }
      // Otra moneda distinta de COP y USD: no se adivina la conversión. Es
      // preferible no crear el anuncio que crearlo con un monto inventado.
      return {
        ok: false,
        message: `Tu cuenta publicitaria está en ${moneda}. Todavía no sabemos convertir pesos a esa moneda automáticamente: definí el presupuesto directamente en el Administrador de Anuncios de Meta.`,
      };
    } catch (err: any) {
      logger.error({ err }, "[Facebook] No se pudo convertir el presupuesto a la moneda de la cuenta");
      return { ok: false, message: "No se pudo convertir el presupuesto a la moneda de tu cuenta publicitaria. Intentá de nuevo en unos minutos." };
    }
  }

  async validate(): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured()) return { ok: false, message: "Token no configurado" };
    try {
      const res = await fetch(`${FB_GRAPH_URL}/me?access_token=${this.config.accessToken}`, { signal: AbortSignal.timeout(10000) });
      const d = await res.json();
      return d.id
        ? { ok: true, message: `Conectado como ${d.name || d.id}` }
        : { ok: false, message: d.error?.message || "Token inválido" };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  }

  /**
   * Sugiere una audiencia objetivo para un producto usando IA + categorías por defecto.
   */
  async suggestAudience(productId: number): Promise<FbAudienceSuggestion | null> {
    try {
      const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      if (!product) throw new Error("Producto no encontrado");

      const cat = (product.category || "").toLowerCase();
      const name = product.name || "";

      // Audiencias por defecto según categoría
      const defaults: Record<string, { ages: number[]; genders: number[]; description: string; interests: string[] }> = {
        "programación": {
          ages: [18, 45], genders: [1, 2],
          description: "Jóvenes y adultos interesados en tecnología, desarrollo web y programación.",
          interests: ["Programación informática", "Desarrollo web", "Tecnología", "Informática", "Ciberseguridad"]
        },
        "diseño": {
          ages: [18, 45], genders: [1, 2],
          description: "Creativos, diseñadores gráficos y profesionales del diseño digital.",
          interests: ["Adobe Photoshop", "Diseño gráfico", "Adobe Illustrator", "Canva", "Arte digital"]
        },
        "marketing": {
          ages: [20, 55], genders: [1, 2],
          description: "Emprendedores, dueños de negocio y profesionales del marketing digital.",
          interests: ["Marketing digital", "Facebook Ads", "Instagram", "Emprendimiento", "Redes sociales"]
        },
        "idiomas": {
          ages: [15, 60], genders: [1, 2],
          description: "Estudiantes y profesionales que quieren aprender nuevos idiomas.",
          interests: ["Aprender inglés", "Idiomas", "Viajes", "Intercambio cultural", "Educación"]
        },
        "fitness": {
          ages: [18, 50], genders: [1, 2],
          description: "Personas interesadas en salud, ejercicio y bienestar físico.",
          interests: ["Fitness", "Ejercicio", "Yoga", "Pérdida de peso", "Salud y bienestar"]
        },
        "música": {
          ages: [15, 45], genders: [1, 2],
          description: "Músicos, productores y aficionados a la producción musical.",
          interests: ["Guitarra", "Producción musical", "Música", "DJ", "Instrumentos musicales"]
        },
        "tecnología": {
          ages: [18, 50], genders: [1, 2],
          description: "Entusiastas de la tecnología, reparación y mantenimiento de dispositivos.",
          interests: ["Tecnología", "Reparación de celulares", "PlayStation", "PC", "Electrónica"]
        },
        "fotografía": {
          ages: [18, 50], genders: [1, 2],
          description: "Fotógrafos aficionados y profesionales buscando mejorar sus habilidades.",
          interests: ["Fotografía", "Edición de fotos", "Cámaras", "Instagram", "Arte visual"]
        },
      };

      const matched = Object.entries(defaults).find(([k]) => cat.includes(k));
      const fallback = { ages: [18, 55], genders: [1, 2], description: "Público general colombiano interesado en cursos digitales.", interests: [] as string[] };
      const profile = matched ? matched[1] : fallback;

      const targeting: FbTargeting = {
        ageMin: profile.ages[0],
        ageMax: profile.ages[1],
        genders: profile.genders,
        geoLocations: { countries: ["CO"] },
        placements: {
          facebook: ["feed", "story", "marketplace"],
          instagram: ["stream", "story", "reels"],
        },
      };

      if (profile.interests && profile.interests.length > 0) {
        targeting.interests = profile.interests.map(name => ({ id: "", name }));
      }

      // Intentar generar audiencia con IA
      const aiAudience = await this.generateAudienceWithAI(product, profile);
      const result = aiAudience || {
        description: profile.description,
        targeting,
        rationale: `Perfil por defecto para categoría "${product.category || "General"}": ${profile.description}`,
      };

      // Bug real: tanto los intereses por categoría como los que genera la
      // IA salían con id: "" -- Facebook exige el ID numérico de su propia
      // taxonomía de intereses para segmentar, un nombre suelto no sirve y
      // lo ignora en silencio. El anuncio se creaba igual pero SIN
      // segmentar por interés (audiencia amplia), aunque el panel mostrara
      // nombres de intereses "aplicados". Se resuelven acá contra la Graph
      // API de búsqueda de intereses antes de devolver la sugerencia.
      if (result.targeting.interests?.length) {
        result.targeting.interests = await resolveInterestIds(this.config.userAccessToken, result.targeting.interests.map(i => i.name));
      }

      return result;
    } catch (err: any) {
      logger.error({ err, productId }, "[Facebook] Error sugiriendo audiencia");
      return null;
    }
  }

  private async generateAudienceWithAI(product: any, profile: { ages: number[]; description: string }): Promise<FbAudienceSuggestion | null> {
    const price = Number(product.price) || 0;
    const priceFormatted = price > 0
      ? price.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : "Consulta";
    try {
      const prompt = `Eres un experto en Facebook Ads para Colombia.
Basado en el siguiente producto digital, sugiere la audiencia objetivo ideal para un anuncio.

Producto: ${product.name}
Precio: ${priceFormatted === "Consulta" ? priceFormatted : `$${priceFormatted} COP`}
Categoría: ${product.category || "General"}
Descripción: ${(product.description || "").substring(0, 200)}

Perfil base sugerido: ${profile.description}

Responde SOLO con este JSON exacto:
{
  "description": "Descripción del perfil de audiencia (máx 200 caracteres)",
  "targeting": {
    "ageMin": EDAD_MINIMA,
    "ageMax": EDAD_MAXIMA,
    "genders": [1, 2],
    "interests": ["INTERES_1", "INTERES_2", "INTERES_3"]
  },
  "rationale": "Por qué esta audiencia es ideal para este producto"
}`;

      const res = await fetch(`${process.env.OPENCODE_API_URL || "https://api.freemodel.dev/v1"}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENCODE_API_KEY || ""}`,
        },
        body: JSON.stringify({
          model: process.env.OPENCODE_MODEL || "gpt-5.5",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const data: any = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          description: parsed.description || profile.description,
          targeting: {
            ageMin: parsed.targeting?.ageMin || profile.ages[0],
            ageMax: parsed.targeting?.ageMax || profile.ages[1],
            genders: parsed.targeting?.genders || [1, 2],
            interests: (parsed.targeting?.interests || []).map((name: string) => ({ id: "", name })),
            geoLocations: { countries: ["CO"] },
            placements: {
              facebook: ["feed", "story", "marketplace"],
              instagram: ["stream", "story", "reels"],
            },
          },
          rationale: parsed.rationale || profile.description,
        };
      }
    } catch (_) {}
    return null;
  }

  /**
   * Crea un anuncio completo en Facebook para un producto:
   * genera copy con IA, sube imagen, crea campaña + conjunto + anuncio.
   * Acepta targeting personalizado (ciudad, edad, intereses, etc.).
   */
  /**
   * ¿Meta va a poder descargar esta imagen?
   *
   * Comprueba lo mismo que comprueba Meta: que la URL responda y que sea una
   * imagen de verdad (JPG/PNG/WEBP). Un SVG o un 404 hacen que rechace la
   * creación del anuncio completa.
   */
  /**
   * ¿Meta puede usar esta foto? `ok:false` con `motivo` cuando la foto existe
   * pero Meta la va a rechazar (chica, WebP); `motivo` null cuando ni siquiera
   * se pudo descargar.
   *
   * Antes solo se miraba el content-type y que pesara más de 2 KB: la foto de
   * 225×225 del corrector (7 KB) pasaba, y Meta rechazaba el anuncio entero.
   */
  private async imagenParaMeta(url: string): Promise<{ ok: boolean; motivo: string | null }> {
    try {
      const r = await fetch(url, { method: "GET", signal: AbortSignal.timeout(12_000) });
      if (!r.ok) return { ok: false, motivo: null };
      const tipo = (r.headers.get("content-type") || "").toLowerCase();
      if (!tipo.startsWith("image/")) return { ok: false, motivo: null };
      // SVG es "image/" pero Meta no lo acepta en un creativo, y además es lo
      // que devuelve nuestra propia ruta de respaldo cuando NO encuentra el
      // archivo ("Imagen no disponible").
      if (tipo.includes("svg")) return { ok: false, motivo: null };
      const buf = Buffer.from(await r.arrayBuffer());
      // Un archivo de pocos bytes no es una foto: es un cartel o un error.
      if (buf.length < 2000) return { ok: false, motivo: null };
      const { medirImagen, porQueMetaLaRechaza } = await import("./medidas-de-imagen");
      const motivo = porQueMetaLaRechaza(medirImagen(buf));
      return { ok: !motivo, motivo };
    } catch {
      return { ok: false, motivo: null };
    }
  }

  async createAdForProduct(
    productId: number,
    dailyBudget: number = 5000,
    startDate?: string,
    targeting?: FbTargeting,
    /**
     * Copy ya escrito y aprobado (el de un borrador). Si no viene, se genera
     * uno acá como siempre.
     *
     * Sin esto no había forma de llevar a Meta el texto que el admin aprobó:
     * el copy se escribía y revisaba en el borrador, y al publicar se
     * generaba OTRO distinto. Se aprobaba una cosa y se publicaba otra.
     */
    copyAprobado?: { primaryText: string; headline: string; description: string },
    /**
     * Que tipo de campana. Sin esto TODA campana se creaba como de VENTAS
     * apuntando a la web: pedir "una campana de trafico" o "de mensajes" daba
     * exactamente lo mismo. El objetivo le dice a Meta a QUIEN mostrar el
     * anuncio, asi que elegir mal es pagarle para que busque al publico
     * equivocado. Por defecto sigue siendo ventas, que es lo que hacia antes.
     */
    objetivo: import("./objetivos-campana").ObjetivoCampana = "ventas",
    /** Estructura a replicar (varios conjuntos, mejoras, Instagram). Ver PlantillaDeCampana. */
    plantilla?: PlantillaDeCampana | null,
    /** A dónde lleva el anuncio web: "landing" (y solo landing), "tienda", o sin preferencia. */
    preferenciaWeb?: import("./landing/destino-del-producto").PreferenciaWeb | null,
    /**
     * Fotos del CARRUSEL (2 a 10). 08-10: el borrador guardaba el carrusel
     * pero acá solo se usaba UNA foto (`picture`): child_attachments no se
     * armaba nunca, y el anuncio salía de imagen única aunque se pidiera
     * galería. Sin esto (o con menos de 2 fotos válidas), imagen única.
     */
    fotosCarrusel?: string[] | null,
  ): Promise<FbCampaignResult | null> {
    if (!this.config.adAccountId || !this.config.accessToken) return null;

    try {
      const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      if (!product) throw new Error("Producto no encontrado");

      // ── Intereses sin id → taxonomía real de Meta, ANTES de crear nada ──
      // Un interés con id vacío o inventado Meta lo ignora en silencio: el
      // anuncio sale con audiencia amplia mientras el panel muestra
      // "intereses aplicados". Se resuelven acá y, si alguno no existe en
      // Meta, se corta con los nombres exactos (sin campaña huérfana).
      if (targeting?.interests?.some((x) => !String(x?.id || "").trim())) {
        const sinId = targeting.interests.filter((x) => !String(x?.id || "").trim()).map((x) => String(x?.name || "").trim()).filter(Boolean);
        // Uno por uno: Meta puede devolver otro nombre ("Yoga" → "Yoga (fitness)"),
        // así que la única forma de saber CUÁL falló es preguntar por cada uno.
        const resueltos: Array<{ id: string; name: string }> = [];
        const faltan: string[] = [];
        for (const nombre of sinId) {
          const [r] = await resolveInterestIds(this.config.userAccessToken, [nombre]);
          if (r?.id) resueltos.push(r); else faltan.push(nombre);
        }
        if (faltan.length) {
          throw new Error(`Meta no reconoce estos intereses: ${faltan.join(", ")}. Cambialos por otros o quitalos; no se crea una audiencia amplia fingiendo que se aplicaron.`);
        }
        targeting = { ...targeting, interests: [...targeting.interests.filter((x) => String(x?.id || "").trim()), ...resueltos] };
      }
      const targetingResolved = targeting;

      // ── Candado de cuenta autorizada (P0 §3.2) ─────────────────────────
      // Sin esto se podía crear la campaña en una cuenta en otra moneda o
      // deshabilitada, o en una cuenta que no es la del negocio. Se valida
      // ANTES de tocar Meta: si bloquea, no queda nada a medias.
      {
        const vc = await this.validarCuentaParaPublicar("createAdForProduct");
        if (!vc.ok) {
          this.lastAdError = `Publicación bloqueada: ${vc.motivo}`;
          logger.warn({ productId, motivo: vc.motivo }, "[Facebook] Publicación bloqueada por cuenta no autorizada");
          return null;
        }
      }

      const { OBJETIVOS } = await import("./objetivos-campana");
      // El WhatsApp real del negocio, para las campanas de mensajes.
      // `tenant.whatsappNumber` NO existe en TenantContext: esto quedaba vacío
      // y el anuncio de mensajes mandaba a la web con botón de WhatsApp (visto
      // en Meta el 24-09-2026). El número es el de la sesión conectada.
      let conectado = "";
      try {
        const { getWhatsAppForTenant } = await import("./whatsapp-factory");
        conectado = String(getWhatsAppForTenant(Number((this.tenant as any)?.id)).getStatus().phoneNumber || "");
      } catch { conectado = ""; }
      // WHATSAPP_NUMBER del .env es el del dueño del servidor: el anuncio de
      // otro negocio con WhatsApp desconectado mandaba los clics a ese número.
      const esDelDueno = Number((this.tenant as any)?.id) === tenantManager.getDefaultTenant().id;
      const waDelNegocio = String(conectado || (esDelDueno ? process.env.WHATSAPP_NUMBER : "") || "").replace(/[^0-9]/g, "");
      const OBJ = OBJETIVOS[objetivo] || OBJETIVOS.ventas;
      // El destino web se resuelve ANTES de crear nada en Meta: si pidió la
      // landing y no está publicada, falla acá con el motivo, sin dejar una
      // campaña a medias.
      const vaAWhatsApp = OBJ.destino === "whatsapp" && !!waDelNegocio;
      // Formulario: permisos y formulario ANTES de crear la campaña, para no
      // dejar una campaña a medias si falta algo.
      let formularioId: string | null = null;
      if (OBJ.destino === "formulario") {
        const faltan = await this.permisosFaltantesParaFormularios();
        if (faltan.length) {
          throw new Error(`La conexión de Facebook de este negocio no tiene permiso para formularios (${faltan.join(", ")}). Hay que reconectar Facebook desde el panel aceptando esos permisos.`);
        }
        const fbCfg: any = (this.tenant as any)?.facebook || {};
        const privacidadUrl = String(fbCfg.privacyUrl || fbCfg.privacidadUrl || "").trim() || `${getAppUrl().replace(/\/$/, "")}/privacidad`;
        formularioId = await this.formularioDelProducto({ id: Number(product.id), name: String(product.name) }, { privacidadUrl });
      }
      const destinoWeb = vaAWhatsApp ? "" : (await destinoWebDelProducto(this.tenant.id, productId, preferenciaWeb)).url;

      const adAccount = `act_${this.config.adAccountId}`;
      const campaignName = `${product.name} - ${new Date().toLocaleDateString("es-CO")}`;

      let adCopy = copyAprobado?.primaryText?.trim()
        ? {
            primaryText: copyAprobado.primaryText,
            headline: copyAprobado.headline || "",
            description: copyAprobado.description || "",
          }
        : await this.generateAdCopy(product, vaAWhatsApp ? "whatsapp" : "web");
      // Última barrera antes de Meta, la cruzan TODOS los caminos: un texto
      // que promete algo que este producto no entrega no sale (físico con
      // "acceso de por vida", digital con "pagás al recibir").
      {
        const { copyDeOtroModelo, modeloDelProducto } = await import("./anuncio-por-modelo");
        const motivo = copyDeOtroModelo(`${adCopy.primaryText} ${adCopy.headline} ${adCopy.description}`, modeloDelProducto(product as any));
        if (motivo) {
          logger.warn({ productId, motivo }, "[Facebook] El copy no corresponde al producto: se usa el del plan por modelo");
          adCopy = await this.generateAdCopy(product, vaAWhatsApp ? "whatsapp" : "web");
        }
      }
      // ── Pulido final: registro y coherencia ────────────────────────────
      // Anuncios del corrector (24/25-09-2026) salieron con "¿Cuántas horas
      // pasás…?", "Pagás al recibir", "Completá tus datos" a un público de
      // Colombia, y con "Pago único" en un producto físico (frase de cursos).
      // Suena a plantilla extranjera y le resta confianza a quien lo lee.
      {
        const { pulirCopyDeAnuncio } = await import("./anuncio-por-modelo");
        adCopy = pulirCopyDeAnuncio(adCopy, {
          esFisico: String((product as any).kind || "") === "physical",
          pais: String((this.tenant as any)?.country || "CO"),
        });
      }
      // ── La acción del texto = el destino del botón (07-10-2026) ──────────
      // Un borrador escrito para WhatsApp subido como tráfico a la landing
      // salía diciendo "Escríbenos por WhatsApp" con el botón a la página.
      // Se corrige SOLO la línea 👉, y solo si contradice el destino.
      if (OBJ.destino !== "formulario") {
        const { accionCoherenteConDestino, modeloDelProducto: modeloDe } = await import("./anuncio-por-modelo");
        let pago: string | null = null;
        try {
          const { getBusinessContext } = await import("./business-context");
          pago = (await getBusinessContext(Number((this.tenant as any)?.id)))?.condiciones?.envio?.pago ?? null;
        } catch { pago = null; }
        const r = accionCoherenteConDestino(adCopy.primaryText, modeloDe(product as any), vaAWhatsApp ? "whatsapp" : "web", pago);
        if (r.corregido) {
          logger.warn({ productId, destino: vaAWhatsApp ? "whatsapp" : "web" }, "[Facebook] La acción del texto contradecía el destino: se cambió la línea 👉");
          adCopy = { ...adCopy, primaryText: r.texto };
        }
      }

      // Bug de capacidad: /{adAccount}/adimages requiere la capacidad
      // "adimages" que esta aplicación no tiene (Graph API error #3:
      // "Application does not have the capability to make this API call").
      // En vez de subir la imagen primero para obtener un hash, se pasa la
      // URL absoluta de la imagen directamente en el campo `picture` del
      // link_data de abajo. Facebook descarga, cachea y muestra la imagen
      // desde ahí sin necesidad del endpoint de adimages.
      //
      // La columna es imageUrl (camelCase, Drizzle) -- leerla como
      // product.image_url daba siempre undefined y el anuncio SIEMPRE salía
      // con imagen placeholder genérica, nunca la foto real del producto.
      // Además Facebook descarga la imagen desde SUS servidores, así que una
      // ruta relativa (/images/products/41.jpg) no le sirve -- hay que
      // convertirla a URL absoluta con APP_URL, igual que en Marketplace.
      let creativeImageUrl = absoluteImageUrl(product.imageUrl) || "";
      let hasRealProductImage = !!creativeImageUrl;

      // ── Que la imagen EXISTA de verdad, no que el campo no esté vacío ────
      // Meta descarga la imagen desde sus servidores. Si la URL no responde,
      // rechaza la creación entera con "No se ha podido descargar tu imagen"
      // (código 100, subcódigo 3858258) -- y hasta hoy eso llegaba al admin
      // como "Meta no aceptó crear la campaña", sin decir por qué.
      //
      // Reproducido en vivo el 2026-08-19 con el curso de piano: el producto
      // tenía `imageUrl = /uploads/products/123.jpg`, pero ese archivo no
      // está en el volumen y la ruta /uploads no tiene respaldo -> 404.
      //
      // Un SVG tampoco sirve: Meta solo acepta JPG/PNG en un creativo. Y la
      // ruta /images/products/ devuelve justamente un SVG de "Imagen no
      // disponible" cuando no encuentra el archivo, así que un campo lleno
      // puede ser igual un cartel gris.
      //
      // Si la imagen no sirve, se trata como si el producto NO tuviera:
      // abajo ya existe el camino de generarla con IA. Vale más un anuncio
      // con foto generada que una campaña que Meta rechaza entera.
      // Se prueban TODAS las fotos del producto (la principal primero) y se usa
      // la primera que Meta acepte. Si hay fotos reales pero todas son chicas,
      // se corta ACÁ con el motivo -- antes de crear la campaña, para no dejar
      // una huérfana en Ads Manager -- en vez de reemplazar la foto real de un
      // producto físico por una inventada con IA.
      if (creativeImageUrl) {
        const { fotosDelProducto } = await import("./fotos-de-producto");
        const candidatas = [...new Set([creativeImageUrl, ...fotosDelProducto(product)])];
        const rechazos: string[] = [];
        let elegida = "";
        for (const url of candidatas) {
          const r = await this.imagenParaMeta(url);
          if (r.ok) { elegida = url; break; }
          if (r.motivo) rechazos.push(r.motivo);
        }
        if (!elegida && rechazos.length) {
          throw new Error(
            `Ninguna foto de "${product.name}" sirve para un anuncio: ${[...new Set(rechazos)].join("; ")}. ` +
              `Subí una foto más grande del producto (idealmente 1080×1080) y volvé a intentarlo.`,
          );
        }
        if (!elegida) {
          logger.warn({ productId: product.id, url: creativeImageUrl }, "[Facebook] Ninguna foto del producto se puede descargar -- se genera una");
          hasRealProductImage = false;
        } else if (elegida !== creativeImageUrl) {
          logger.info({ productId: product.id, url: elegida }, "[Facebook] La foto principal no sirve para Meta: se usa otra del producto");
        }
        creativeImageUrl = elegida;
      }

      // Sin foto real: se intenta generar una con IA (nombre + descripción
      // reales del producto, no un estilo genérico) antes de caer al cartel
      // de texto placeholder -- mismo mecanismo que ad-strategist.ts, ver
      // lib/ai-product-image.ts. Se persiste en el producto para no
      // regenerarla en cada anuncio.
      if (!creativeImageUrl) {
        const { generateProductImage } = await import("./ai-product-image");
        const generatedPath = await generateProductImage({ id: product.id, name: product.name, description: product.description });
        if (generatedPath) {
          const absolute = absoluteImageUrl(generatedPath);
          if (absolute) {
            creativeImageUrl = absolute;
            hasRealProductImage = true;
            await db.update(products).set({ imageUrl: generatedPath }).where(eq(products.id, product.id));
            logger.info({ productId: product.id }, "[Facebook] Foto generada con IA para el anuncio (el producto no tenía ninguna)");
          }
        }
      }
      if (!creativeImageUrl) {
        creativeImageUrl = this.generatePlaceholderUrl(product.name);
      }
      // Igual que en ad-strategist.ts: las mejoras de Meta que ALTERAN la
      // imagen (recorte/expansión, brillo y contraste) solo tienen sentido
      // si hay una foto real del producto. Aplicarlas sobre el cartel de
      // texto placeholder no mejora nada -- puede terminar generando un
      // fondo que se parece todavía menos al curso real.

      // ── Ventas SIN píxel: se corta acá, ANTES de crear nada en Meta ──────
      // 08-10, campaña del corrector: el dueño pidió VENTAS, no había píxel
      // de esta cuenta y el conjunto salía en silencio optimizando CLICS
      // (LINK_CLICKS): 123 clics a $46, cero pedidos. Atlas decía "creé tu
      // campaña de ventas" y Meta buscaba a quien hace clic, no a quien compra.
      // Lo pedido o nada: la salida la elige el dueño, no el código.
      const pixelDeLaCuenta = await this.pixelUsable(adAccount);
      if (objetivo === "ventas" && !pixelDeLaCuenta) {
        throw new Error(
          "Pediste una campaña de VENTAS, pero esta cuenta publicitaria no tiene un píxel suyo conectado: sin píxel Meta no puede buscar compradores " +
          "y la campaña terminaría comprando clics baratos (así pasó con el corrector: 123 clics, 0 pedidos). No se creó nada. " +
          "Opciones: (1) conectar el píxel de esta cuenta y ponerlo en la landing, (2) hacerla de MENSAJES a WhatsApp (no necesita píxel), " +
          "o (3) hacerla de TRÁFICO sabiendo que optimiza clics.",
        );
      }
      // La landing de destino tiene que DISPARAR ese mismo píxel: sin él,
      // Meta no ve visitas ni compras aunque la cuenta lo tenga.
      const { esLandingDeForge } = await import("./landingforge-client");
      if (pixelDeLaCuenta && esLandingDeForge(destinoWeb)) {
        const { ponerPixelEnLanding } = await import("./landingforge-client");
        const r = await ponerPixelEnLanding(destinoWeb, pixelDeLaCuenta);
        logger.info({ destinoWeb, pixel: pixelDeLaCuenta, ...r }, "[Facebook] Píxel de la cuenta en la landing de destino");
        if (!r.ok && objetivo === "ventas") {
          throw new Error(`No pude poner el píxel ${pixelDeLaCuenta} en la landing (${r.motivo}): sin él la campaña de ventas no mide compras. No se creó nada.`);
        }
      }

      // Campaña.
      // special_ad_categories: [] daba error 100 / subcódigo 4834011 --
      // Meta viene exigiendo que TODA campaña declare explícitamente "NONE"
      // en vez de un array vacío quiere decir "no aplica ninguna categoría
      // especial" (vivienda, empleo, crédito, temas sociales/elecciones).
      const campaign = await this.fbPost(`${adAccount}/campaigns`, {
        name: campaignName,
        objective: OBJ.metaObjective,
        status: "PAUSED",
        special_ad_categories: ["NONE"],
        // El presupuesto se maneja a nivel de conjunto de anuncios (no CBO),
        // así que Facebook exige declarar explícitamente que los conjuntos
        // NO comparten presupuesto entre sí -- sin esto rechaza la campaña
        // entera con error 100/subcódigo 4834011.
        is_adset_budget_sharing_enabled: false,
      }, "campaña", this.config.userAccessToken);

      // Desde acá, cualquier paso que falle (conjunto/creativo/anuncio) deja
      // la CAMPAÑA ya creada huérfana en la cuenta real -- confirmado en vivo
      // que el paso final (/ads) es justo donde Meta recién avisa errores
      // tardíos (pixel no asociado, sin método de pago) después de haber
      // gastado ya las llamadas anteriores. Se envuelve todo lo que sigue
      // para poder borrar la campaña (cascada: se lleva conjunto y creativo)
      // si algo falla, en vez de dejar objetos sueltos acumulándose en Ads
      // Manager cada vez que se reintenta.
      try {

      // Construir targeting desde parámetros o usar defaults
      // El país por defecto es el del NEGOCIO (perfil), no Colombia fijo: un
      // cliente de México publica en México (pedido del dueño 13-09-2026).
      let paisDelNegocio = "CO";
      try {
        const { getBusinessContext } = await import("./business-context");
        const { codigoDePais } = await import("./modelo-de-negocio");
        const tid = Number((this.tenant as any)?.id);
        const ctxNeg = Number.isFinite(tid) ? await getBusinessContext(tid).catch(() => null) : null;
        paisDelNegocio = codigoDePais(ctxNeg?.condiciones?.pais || null);
      } catch { paisDelNegocio = "CO"; }
      const fbTargeting: Record<string, any> = {
        geo_locations: targetingResolved?.geoLocations?.countries
          ? { countries: targetingResolved.geoLocations.countries }
          : { countries: [paisDelNegocio] },
        age_min: targetingResolved?.ageMin || 18,
        age_max: targetingResolved?.ageMax || 65,
      };

      // Ciudades específicas: por su CLAVE de Meta y SIN el país (ver
      // resolverCiudades / geoConCiudades). Si alguna no existe, se corta
      // con el nombre exacto: nada de salir a todo el país en silencio.
      if (targetingResolved?.geoLocations?.cities && targetingResolved.geoLocations.cities.length > 0) {
        const { resueltas, faltan } = await resolverCiudades(
          this.config.userAccessToken || this.config.accessToken,
          targetingResolved.geoLocations.cities,
          paisDelNegocio,
        );
        if (faltan.length) {
          throw new Error(`Meta no reconoce estas ciudades: ${faltan.join(", ")}. Revisá el nombre o quitalas; no se publica a todo el país fingiendo que se aplicaron.`);
        }
        fbTargeting.geo_locations = geoConCiudades([paisDelNegocio], resueltas);
      }

      // Radio alrededor de ubicación
      if (targetingResolved?.geoLocations?.radius) {
        fbTargeting.geo_locations = {
          ...fbTargeting.geo_locations,
          location_types: ["home", "recent"],
          radius: targetingResolved.geoLocations.radius,
        };
      }

      // Géneros
      if (targetingResolved?.genders && targetingResolved.genders.length > 0) {
        fbTargeting.genders = targetingResolved.genders;
      }

      // Intereses
      if (targetingResolved?.interests && targetingResolved.interests.length > 0) {
        fbTargeting.flexible_spec = [{
          interests: targetingResolved.interests.map(i => ({ id: i.id, name: i.name })),
        }];
      }

      // Audiencias propias (ids de Meta) y las excluidas.
      if (targetingResolved?.customAudiences?.length) {
        fbTargeting.custom_audiences = targetingResolved.customAudiences.map((id) => ({ id: String(id).trim() }));
      }
      if (targetingResolved?.excludedCustomAudiences?.length) {
        fbTargeting.exclusions = {
          ...(fbTargeting.exclusions || {}),
          custom_audiences: targetingResolved.excludedCustomAudiences.map((id) => ({ id: String(id).trim() })),
        };
      }

      // ── Ubicaciones (placements) ───────────────────────────────────────
      //
      // Si el admin no pidió ubicaciones concretas, NO se manda ninguna. Ese
      // silencio es lo que activa Advantage+ Placements: Meta reparte entre
      // sus 25+ ubicaciones y busca la impresión más barata. Es su default y
      // lo que recomienda para la mayoría de los anunciantes.
      //
      // Antes, sin pedido del admin, se fijaban SEIS a mano:
      //
      //   publisher_platforms = ["facebook", "instagram"]
      //   facebook_positions  = ["feed", "story", "marketplace"]
      //   instagram_positions = ["stream", "story", "reels"]
      //
      // Eso dejaba afuera Reels de Facebook, Audience Network, Messenger,
      // resultados de búsqueda y todo lo que Meta agregue de acá en adelante.
      // Y sobre todo se contradecía con lo que se activó el mismo día: con
      // Advantage+ Audience se le dice al algoritmo "elegí vos a quién" y acto
      // seguido se le ataba a seis lugares. La lista de seis, además, era una
      // elección de alguien, no una medición.
      //
      // Dirección de la plataforma: Meta está RETIRANDO los controles de
      // exclusión de ubicaciones de los conjuntos. Fijarlas a mano es nadar
      // contra la corriente del producto.
      //
      // Si el admin SÍ pide ubicaciones, mandan las suyas: pidió algo concreto
      // y el sistema no se lo ensancha por su cuenta. Es la misma regla que
      // gobierna Advantage+ Audience (ver usarAdvantagePlus).
      const placements = targetingResolved?.placements;
      if (placements?.facebook || placements?.instagram || placements?.messenger) {
        fbTargeting.publisher_platforms = [];
        fbTargeting.facebook_positions = [];
        fbTargeting.instagram_positions = [];
        fbTargeting.messenger_positions = [];

        if (placements.facebook) {
          fbTargeting.publisher_platforms.push("facebook");
          fbTargeting.facebook_positions = placements.facebook;
        }
        if (placements.instagram) {
          fbTargeting.publisher_platforms.push("instagram");
          fbTargeting.instagram_positions = placements.instagram;
        }
        if (placements.messenger) {
          // `story` sale de messenger_positions: Meta retiró Messenger Stories
          // el 2026-08-27 y desde v26.0 lo borra en silencio, sin devolver
          // error. Mandarlo sería pedir algo que no existe y no enterarse.
          const posiciones = placements.messenger.filter((p) => p !== "story");
          if (posiciones.length > 0) {
            fbTargeting.publisher_platforms.push("messenger");
            fbTargeting.messenger_positions = posiciones;
          }
        }
      }
      // (sin `else`: la ausencia de estos campos ES la forma de pedir
      //  Advantage+ Placements. Ver el comentario de arriba.)

      // ── Advantage+ Audience ────────────────────────────────────────────
      //
      // Meta exige declarar esta bandera desde que introdujo Advantage+
      // Audience -- sin ella, /adsets rechaza la creación completa con error
      // #100/1870227 ("Se requiere la marca de audiencia de Advantage"),
      // probado en vivo contra la cuenta real.
      //
      // Estaba fija en 0 "para respetar el targeting explícito". La intención
      // era buena y el resultado, al revés de lo que hacen hoy las agencias:
      //
      //  · Meta trata el targeting por intereses como SUGERENCIA, no como
      //    filtro, en los 11 objetivos de rendimiento más comunes -- sin
      //    importar cómo se configure el conjunto. En junio de 2025 consolidó
      //    categorías enteras de intereses en grupos amplios.
      //  · Advantage+ Audience es el motor principal del 65% de los
      //    anunciantes de EE.UU.: se le da el creativo y el objetivo de
      //    conversión, y su modelo encuentra a quién le muestra.
      //  · La guía que repiten las agencias es "amplio + buena señal le gana
      //    a estrecho + señal débil", y la señal que importa es el píxel/CAPI
      //    y el creativo, no la pila de intereses.
      //
      // Y hay una razón práctica además de la estratégica: desde la API v23.0
      // este parámetro pasa a ser OBLIGATORIO al crear conjuntos. Esta cuenta
      // corre en v21.0, que expira el 21 de enero de 2027, así que la subida
      // de versión hay que hacerla igual -- mejor con esto ya resuelto.
      //
      // Cuándo se apaga: SOLO si el admin pidió un público concreto
      // (intereses, género, o un rango de edad más angosto que el 18-65 por
      // defecto). Ahí manda él: pidió algo específico y el sistema no se lo
      // va a ensanchar por su cuenta. Sin pedido explícito, gana el algoritmo.
      // Advantage+ explícito del admin manda; si no lo dijo, la regla de siempre.
      fbTargeting.targeting_automation = {
        advantage_audience:
          targetingResolved?.advantagePlus !== undefined
            ? targetingResolved.advantagePlus ? 1 : 0
            : usarAdvantagePlus(targetingResolved) ? 1 : 0,
      };

      // Conjunto de anuncios.
      // optimization_goal=CONVERSIONS SIN promoted_object es rechazado por
      // Graph API con error 100 "Invalid parameter" -- Facebook exige que el
      // conjunto apunte a un pixel/evento cuando optimiza por conversión. Si
      // hay pixelId configurado se lo mandamos (evento PURCHASE); si no hay
      // pixel, se cae a LINK_CLICKS, que no requiere promoted_object.
      //
      // El pixelId guardado puede pertenecer a OTRA cuenta publicitaria
      // (pasó justo eso: se corrigió el adAccountId pero el pixel se quedó
      // apuntando al de la cuenta vieja) -- Facebook rechaza el anuncio con
      // "Píxel no asociado" sin decirlo hasta el paso final, después de
      // crear campaña y conjunto. Para no desperdiciar esas llamadas, se
      // verifica ANTES que el pixel realmente esté en la lista de pixeles de
      // ESTA cuenta.
      // Ya resuelto arriba (pixelUsable corrige el guardado si no es de la cuenta).
      const hasUsablePixel = !!pixelDeLaCuenta;

      // El monto llega en COP (así razona toda la app); Meta lo quiere en la
      // moneda de la CUENTA. Ver presupuestoDiarioParaMeta().
      const presu = await this.presupuestoDiarioParaMeta(dailyBudget);
      if (!presu.ok) throw new Error(presu.message);

      const primero = plantilla?.conjuntos?.[0] || null;
      if (primero) aplicarPlantillaSinPisar(fbTargeting, primero, targetingResolved ?? targeting);
      const adSetBody: Record<string, any> = {
        name: `${campaignName} - ${nombreDeConjunto(primero?.nombre)}`,
        campaign_id: campaign.id,
        daily_budget: presu.valor,
        targeting: fbTargeting,
        status: "PAUSED",
        start_time: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
      };
      // Objetivos que NO son de venta traen su propia optimizacion: buscar
      // conversiones de pixel en una campana de trafico o de mensajes es
      // pedirle a Meta algo que ese objetivo no admite, y lo rechaza.
      if (objetivo !== "ventas") {
        adSetBody.billing_event = "IMPRESSIONS";
        adSetBody.optimization_goal = OBJ.optimizationGoal;
        adSetBody.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
        if (vaAWhatsApp) {
          // Una campana de mensajes entrega EN WhatsApp: hay que decirle a
          // Meta cual es el destino y de que pagina sale.
          adSetBody.destination_type = "WHATSAPP";
          if (this.config.pageId) adSetBody.promoted_object = { page_id: this.config.pageId };
        }
        if (OBJ.destino === "formulario") {
          // El formulario se abre DENTRO del anuncio.
          adSetBody.destination_type = "ON_AD";
          if (this.config.pageId) adSetBody.promoted_object = { page_id: this.config.pageId };
        }
        // De la plantilla solo se copia la optimización si es compatible con
        // ESTE objetivo. 25-09-2026: la plantilla es la campaña de mensajes a
        // WhatsApp (CONVERSATIONS) y se copiaba encima de LANDING_PAGE_VIEWS
        // en la campaña de tráfico a la landing: Meta la rechazaba con
        // #1815159 "El contenido y el objetivo no coinciden".
        if (primero?.optimizacion && optimizacionCompatible(OBJ.metaObjective, primero.optimizacion)) adSetBody.optimization_goal = primero.optimizacion;
      } else if (hasUsablePixel) {
        adSetBody.billing_event = "IMPRESSIONS";
        // "CONVERSIONS" no es un valor válido de optimization_goal en la API
        // actual (Graph API lo rechaza con error 100 listando los válidos) --
        // el equivalente moderno para optimizar por conversiones de pixel es
        // OFFSITE_CONVERSIONS.
        adSetBody.optimization_goal = "OFFSITE_CONVERSIONS";
        adSetBody.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
        // LEAD no es compatible con el objetivo OUTCOME_SALES (Graph API lo
        // rechaza: "Este evento de conversión no está disponible para el
        // objetivo que has seleccionado"). PURCHASE es el evento que
        // corresponde a una campaña de venta.
        adSetBody.promoted_object = { pixel_id: this.config.pixelId, custom_event_type: "PURCHASE" };
      } else {
        // billing_event=LINK_CLICKS lo rechaza Facebook en cuentas nuevas
        // ("cuando hayan cumplido nuestras políticas durante varias
        // semanas") -- IMPRESSIONS sí está disponible desde el día uno y es
        // compatible con optimization_goal=LINK_CLICKS (se paga por
        // impresión, se optimiza para maximizar clics).
        adSetBody.billing_event = "IMPRESSIONS";
        adSetBody.optimization_goal = "LINK_CLICKS";
        adSetBody.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
      }
      const adSet = await this.fbPost(`${adAccount}/adsets`, adSetBody, "conjunto de anuncios", this.config.userAccessToken);

      // Creativo — se usa `picture` (URL) en vez de `image_hash` porque el
      // endpoint /adimages no está disponible para esta aplicación (error #3);
      // pasando la URL directamente Facebook la descarga y cachea él mismo.
      //
      // Advantage+ Creative -- verificado en vivo (2026-08-08) contra la
      // cuenta real que el campo `creative_features_spec` EN LA RAÍZ del
      // payload es aceptado por la API (no da error) pero Meta lo IGNORA
      // por completo: el creativo quedaba creado con
      // degrees_of_freedom_spec.creative_features_spec en OPT_OUT para
      // TODO, pese a pedir OPT_IN -- confirmado leyendo el creativo recién
      // creado, nunca se activaba ninguna mejora real. El campo correcto
      // que Meta sí lee va ANIDADO dentro de `degrees_of_freedom_spec`.
      // Además, probado en vivo que:
      //  - `standard_enhancements` está OBSOLETO en este campo (error 100/
      //    subcódigo 3858504: "Define funciones individuales en su lugar")
      //    -- por eso NO va acá, solo las mejoras individuales de abajo.
      //  - `image_background_gen` requiere un catálogo asociado al anuncio
      //    (error 100/subcódigo 3858293: "solo está disponible si hay un
      //    catálogo seleccionado") -- esta cuenta no crea anuncios vía
      //    catálogo, así que NO se manda; agregarla de nuevo el día que se
      //    pase a Advantage+ catalog ads.
      // image_touchups/brightness/uncrop (los que alteran la imagen) solo
      // se activan con foto real del producto -- ver hasRealProductImage.
      const creativeFeaturesSpec = mejorasDelCreativo({
        hayFotoReal: hasRealProductImage,
        // ── El paquete COMPLETO es el default (decisión del dueño, 04-10):
        // "programá que Meta en automático mejore los copys, la forma como
        // entrega y todo lo demás". Solo una plantilla que diga
        // mejorasCompletas:false lo baja (nadie la pone hoy). Con foto real
        // entran los retoques; el resto (texto/CTA/medio/pacing/extensiones)
        // siempre.
        mejorasCompletas: plantilla?.mejorasCompletas !== false,
      });
      // Instagram: la cuenta vinculada a la página, para que el anuncio salga
      // también ahí con identidad propia (las reales la traen).
      let instagramUserId: string | null = null;
      if (plantilla?.instagram !== false && this.config.pageId) {
        try {
          const pg = await this.fbGet(String(this.config.pageId), { fields: "instagram_business_account" }, this.config.userAccessToken);
          instagramUserId = pg?.instagram_business_account?.id || null;
        } catch { instagramUserId = null; }
      }
      const creativePayload: Record<string, any> = {
        name: `${product.name} - Creativo`,
        object_story_spec: {
          page_id: this.config.pageId,
          link_data: {
            // Bug: /productos/:id no existe en ningún router (ni el SPA del
            // dashboard ni la tienda pública) -- todo anuncio creado desde
            // esta pestaña llevaba a un 404. /p/:id es el short-link real
            // (app.ts) que resuelve el tenant y redirige a
            // /tienda/:slug/producto/:id -- el mismo que ya usa
            // ad-strategist.ts para los borradores.
            // A donde manda el anuncio. En una campana de MENSAJES el destino
            // es el WhatsApp del negocio con el mensaje ya escrito, no la web:
            // mandar a la web una campana de mensajes es justo lo que el admin
            // reporto ("todo lo lanza a la web y eso esta mal").
            // Destino web: la landing PUBLICADA del producto si la hay, si no
            // la página de la tienda. Ver lib/landing/destino-del-producto.ts.
            link: OBJ.destino === "whatsapp" && waDelNegocio
              ? `https://wa.me/${waDelNegocio}?text=${encodeURIComponent(`Hola! Me interesa ${product.name}`)}`
              : destinoWeb,
            message: adCopy.primaryText,
            name: adCopy.headline,
            description: adCopy.description,
            call_to_action: OBJ.destino === "formulario" && formularioId
              ? { type: "SIGN_UP", value: { lead_gen_form_id: formularioId } }
              : { type: vaAWhatsApp ? "WHATSAPP_MESSAGE" : "SHOP_NOW" },
          },
        },
        degrees_of_freedom_spec: { creative_features_spec: creativeFeaturesSpec },
      };
      if (instagramUserId) creativePayload.object_story_spec.instagram_user_id = instagramUserId;

      // ── Carrusel: cada foto una tarjeta, todas validadas como la principal ──
      const tarjetas: string[] = [];
      if (Array.isArray(fotosCarrusel) && fotosCarrusel.length >= 2) {
        // En PARALELO: una por una eran hasta 10 × 12 s y se comían el turno
        // de Atlas (revisión 08-10). Se conserva el orden de las fotos.
        const absolutas = [...new Set(fotosCarrusel)].slice(0, 10).map((u) => absoluteImageUrl(u)).filter(Boolean) as string[];
        // Rechazada por medida o formato (Dropi: 573-598 px, o WebP) → se
        // convierte a 1080×1080 JPEG en vez de perder la foto.
        const { prepararFotoParaMeta } = await import("./image-store");
        const listas = await Promise.all(absolutas.map(async (abs) => {
          const r = await this.imagenParaMeta(abs).catch(() => ({ ok: false, motivo: null as string | null }));
          if (r.ok) return abs;
          if (!r.motivo) return null;
          const arreglada = absoluteImageUrl(await prepararFotoParaMeta(abs));
          return arreglada && (await this.imagenParaMeta(arreglada).catch(() => ({ ok: false }))).ok ? arreglada : null;
        }));
        for (const u of listas) if (u) tarjetas.push(u);
        if (tarjetas.length < 2) {
          logger.warn({ pedidas: fotosCarrusel.length, validas: tarjetas.length }, "[Facebook] Carrusel pedido pero hay menos de 2 fotos que Meta pueda descargar: sale con imagen única");
          this.avisoDelCreativo = `Pediste carrusel, pero solo ${tarjetas.length} foto(s) se pueden descargar desde Meta: salió con imagen única.`;
        }
      }
      if (tarjetas.length >= 2) {
        creativePayload.object_story_spec.link_data = linkDataDeCarrusel(creativePayload.object_story_spec.link_data, tarjetas, adCopy.headline);
        // Los retoques de imagen de Advantage+ son para una sola foto: en
        // carrusel se mandan solo las mejoras de texto/entrega.
        creativePayload.degrees_of_freedom_spec = {
          creative_features_spec: mejorasDelCreativo({ hayFotoReal: false, mejorasCompletas: plantilla?.mejorasCompletas !== false }),
        };
      } else if (creativeImageUrl) {
        creativePayload.object_story_spec.link_data.picture = creativeImageUrl;
      }
      const creative = await this.fbPost(`${adAccount}/adcreatives`, creativePayload, "creativo", this.config.userAccessToken);

      // Anuncio
      const ad = await this.fbPost(`${adAccount}/ads`, {
        name: campaignName,
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: "PAUSED",
      }, "anuncio final", this.config.userAccessToken);

      // ── Conjuntos extra de la plantilla (ej. "Internacional" US/MX/ES) ──
      //
      // El primer conjunto ya salió arriba con la segmentación pedida; acá
      // van los DEMÁS que trae la plantilla, cada uno con sus países, su
      // optimización y su presupuesto, y el MISMO creativo ya aprobado.
      const conjuntosExtra: Array<{ id: string; adId: string; nombre: string }> = [];
      const extras = (plantilla?.conjuntos || []).slice(1);
      for (const cj of extras) {
        try {
          const presuCj = cj.presupuestoDiario ? await this.presupuestoDiarioParaMeta(cj.presupuestoDiario) : presu;
          if (!presuCj.ok) { logger.warn({ conjunto: cj.nombre }, "[Facebook] presupuesto del conjunto extra inválido: se salta"); continue; }
          const targetingCj: Record<string, any> = {
            geo_locations: { countries: cj.paises?.length ? cj.paises : [paisDelNegocio], ...(cj.tiposDeUbicacion?.length ? { location_types: cj.tiposDeUbicacion } : {}) },
            age_min: cj.edadMin || fbTargeting.age_min || 18,
            age_max: cj.edadMax || fbTargeting.age_max || 65,
            targeting_automation: { advantage_audience: cj.advantagePlus === false ? 0 : 1 },
          };
          const bodyCj: Record<string, any> = {
            name: `${campaignName} - ${nombreDeConjunto(cj.nombre)}`,
            campaign_id: campaign.id,
            daily_budget: presuCj.valor,
            targeting: targetingCj,
            status: "PAUSED",
            start_time: adSetBody.start_time,
            billing_event: "IMPRESSIONS",
            bid_strategy: "LOWEST_COST_WITHOUT_CAP",
            optimization_goal: (cj.optimizacion && optimizacionCompatible(OBJ.metaObjective, cj.optimizacion) ? cj.optimizacion : null) || adSetBody.optimization_goal || "LINK_CLICKS",
          };
          if (adSetBody.destination_type) bodyCj.destination_type = adSetBody.destination_type;
          if (adSetBody.promoted_object) bodyCj.promoted_object = adSetBody.promoted_object;
          const setCj = await this.fbPost(`${adAccount}/adsets`, bodyCj, `conjunto ${cj.nombre}`, this.config.userAccessToken);
          const adCj = await this.fbPost(`${adAccount}/ads`, {
            name: `${campaignName} - ${nombreDeConjunto(cj.nombre)}`,
            adset_id: setCj.id,
            creative: { creative_id: creative.id },
            status: "PAUSED",
          }, `anuncio ${cj.nombre}`, this.config.userAccessToken);
          conjuntosExtra.push({ id: setCj.id, adId: adCj.id, nombre: cj.nombre });
        } catch (e: any) {
          logger.warn({ err: e?.message, conjunto: cj.nombre }, "[Facebook] no se pudo crear un conjunto extra de la plantilla");
        }
      }

      const previewUrl = `https://www.facebook.com/adsmanager/manage/ads?act=${this.config.adAccountId}&ad_id=${ad.id}`;
      logger.info({ campaignId: campaign.id, adId: ad.id, product: product.name, targeting: fbTargeting, conjuntosExtra: conjuntosExtra.length }, "[Facebook] Anuncio creado");

      return {
        campaignId: campaign.id,
        adSetId: adSet.id,
        adId: ad.id,
        imageUrl: creativeImageUrl,
        adCopy,
        status: "PAUSED",
        previewUrl,
        destino: vaAWhatsApp ? "whatsapp" : OBJ.destino === "formulario" ? "formulario" : destinoWeb,
        objetivo,
        ...(conjuntosExtra.length ? { conjuntosExtra } : {}),
      } as FbCampaignResult;
      } catch (innerErr: any) {
        // El conjunto/creativo/anuncio no llegaron a existir todos -- borrar
        // la campaña se lleva en cascada lo que sí se alcanzó a crear, no
        // deja restos sueltos en Ads Manager. Best-effort: si el borrado en
        // sí falla, no tapa el error original (innerErr sigue siendo lo que
        // se relanza).
        await this.fbDeleteBestEffort(campaign.id);
        throw innerErr;
      }
    } catch (err: any) {
      logger.error({ err, productId }, "[Facebook] Error creando anuncio");
      this.lastAdError = err?.message || "Error desconocido";
      // Meta 1815089: la PÁGINA no aceptó las condiciones de anuncios para
      // clientes potenciales. Es un paso legal del dueño de la página, una
      // sola vez; se le da el enlace directo en vez del código crudo.
      if (/1815089|condiciones del servicio sobre generaci[oó]n de clientes potenciales|lead ?gen(eration)? terms/i.test(String(this.lastAdError))) {
        this.lastAdError =
          `La página de Facebook todavía no aceptó las Condiciones de anuncios para clientes potenciales de Meta (requisito legal, una sola vez por página). ` +
          `El dueño de la página debe abrir https://www.facebook.com/ads/leadgen/tos?page_id=${this.config.pageId} y aceptarlas; después se vuelve a pedir la campaña. ` +
          `(Detalle de Meta: ${this.lastAdError})`;
      }
      return null;
    }
  }

  /** Motivo real del último createAdForProduct fallido -- fbPost/fbGet
   * tiran el mensaje de error de Graph API tal cual, pero createAdForProduct
   * devuelve null en error (no puede tirar sin romper a otros que la llaman
   * asumiendo `| null`), así que sin esto el llamador solo sabe "falló", no
   * por qué. */
  lastAdError: string | null = null;
  /** Aviso no fatal del creativo (ej. carrusel que salió de imagen única). */
  avisoDelCreativo: string | null = null;

  // ── Agente de crecimiento: lectura de métricas y control de campañas ───────

  /** Campañas activas (no borradas/archivadas) de la cuenta publicitaria,
   * con su conjunto de anuncios principal -- base para que el agente sepa
   * qué revisar. */
  async listActiveCampaigns(): Promise<Array<{ id: string; name: string; status: string; effectiveStatus: string }>> {
    if (!this.config.adAccountId || !this.config.accessToken) return [];
    const adAccount = `act_${this.config.adAccountId}`;
    try {
      const res = await this.fbGet(`${adAccount}/campaigns`, {
        fields: "id,name,status,effective_status",
        // ACTIVE y PAUSED: el agente tambien debe poder proponer reactivar
        // una pausada si en el pasado le fue bien.
        limit: "100",
      }, this.config.userAccessToken);
      this.lastCampaignListError = null;
      // Graph API devuelve `effective_status` (guion bajo) y acá se prometía
      // `effectiveStatus` (camello). El filtro de abajo usaba bien el nombre
      // real, pero NADIE más: todos los consumidores leían `effectiveStatus`,
      // que siempre era undefined. Consecuencias medidas hoy (16-08-2026):
      //   - El agente de protección de gasto filtra `effectiveStatus ===
      //     "ACTIVE"`, así que NUNCA encontraba una campaña activa y nunca
      //     frenó nada. Es justo el guardián que evita gastar de más.
      //   - El diagnóstico informó "8 campañas (0 activas)" con la campaña de
      //     piano en ACTIVE.
      // Se normaliza acá, en el único lugar por donde pasan todos.
      return (res.data || [])
        .filter((c: any) => c.effective_status !== "DELETED" && c.effective_status !== "ARCHIVED")
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          effectiveStatus: c.effective_status || c.status,
        }));
    } catch (err: any) {
      // Se deja constancia del motivo. Devolver [] a secas hacía que "falló la
      // consulta" y "no hay campañas" fueran EXACTAMENTE lo mismo para quien
      // llama. Visto en vivo (16-08-2026): el admin preguntó si su campaña de
      // piano seguía pausada y Atlas contestó que no existía ninguna campaña
      // en su cuenta -- cuando él mismo la había pausado. Una consulta que
      // falla no puede leerse como un hecho sobre el mundo.
      this.lastCampaignListError = err?.message || "error desconocido consultando campañas";
      logger.warn({ err }, "[Facebook] Error listando campañas");
      return [];
    }
  }

  /** Motivo del último listActiveCampaigns fallido; null si salió bien. */
  lastCampaignListError: string | null = null;

  /** Métricas de una campaña en una ventana de tiempo. datePreset acepta los
   * valores estándar de Graph API ("today", "yesterday", "last_3d",
   * "last_7d", "last_14d", etc.) -- se usan ventanas cortas para proteger
   * gasto y largas para decidir si escalar por tendencia. */
  /**
   * El rendimiento HORA POR HORA de una campaña.
   *
   * Es lo que permite apagar las franjas que solo gastan sin inventarse cuáles
   * son. Meta devuelve una fila por cada día y cada hora; el agrupado y la
   * decisión viven en `franjas-horarias.ts`, que es puro y se puede probar sin
   * red -- acá solo se trae el dato.
   *
   * El desglose es `..._by_advertiser_time_zone` y no el del usuario a
   * propósito: la campaña se pausa según el reloj de la CUENTA de anuncios, así
   * que las dos puntas tienen que hablar del mismo huso. Mezclarlos apagaría
   * con horas de corrimiento.
   */
  async getHourlyInsights(campaignId: string, datePreset = "last_14d"): Promise<any[] | null> {
    try {
      const res = await this.fbGet(`${campaignId}/insights`, {
        fields: "spend,impressions,clicks,actions",
        breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
        date_preset: datePreset,
        limit: "500",
      }, this.config.userAccessToken);
      return Array.isArray(res?.data) ? res.data : [];
    } catch (err: any) {
      logger.warn({ err, campaignId }, "[Facebook] Error leyendo el desglose por hora");
      return null;
    }
  }

  async getCampaignInsights(campaignId: string, datePreset: string): Promise<{
    spend: number; impressions: number; clicks: number; ctr: number;
    results: number; costPerResult: number; reach: number;
  } | null> {
    try {
      const res = await this.fbGet(`${campaignId}/insights`, {
        fields: "spend,impressions,clicks,ctr,reach,actions,cost_per_action_type",
        date_preset: datePreset,
      }, this.config.userAccessToken);
      const row = res.data?.[0];
      if (!row) {
        // Sin filas = sin gasto/actividad todavia en esa ventana, no es error.
        return { spend: 0, impressions: 0, clicks: 0, ctr: 0, results: 0, costPerResult: 0, reach: 0 };
      }
      // "Resultados" en Ads Manager es la acción principal segun el objetivo
      // de la campaña (compra, lead, mensaje). Se suman todas las acciones
      // de conversión relevantes como aproximación simple y auditable.
      const actions: Array<{ action_type: string; value: string }> = row.actions || [];
      const relevantTypes = ["purchase", "offsite_conversion.fb_pixel_purchase", "lead", "onsite_conversion.messaging_conversation_started_7d", "link_click"];
      const results = actions
        .filter(a => relevantTypes.includes(a.action_type))
        .reduce((sum, a) => sum + (Number(a.value) || 0), 0);
      const spend = Number(row.spend) || 0;
      return {
        spend,
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        ctr: Number(row.ctr) || 0,
        reach: Number(row.reach) || 0,
        results,
        costPerResult: results > 0 ? spend / results : 0,
      };
    } catch (err: any) {
      logger.warn({ err, campaignId }, "[Facebook] Error leyendo insights");
      return null;
    }
  }

  /** Métricas agregadas de varias campañas en una ventana, para que el
   * Arquitecto responda "cómo van mis anuncios" con datos en vivo. Si se
   * pasan campaignIds se filtran; si no, se revisan todas las activas.
   * datePreset mapea los días de la ventana a los valores de Graph API. */
  async getCampaignMetrics(opts?: {
    campaignIds?: string[];
    days?: number;
  }): Promise<{
    campaigns: Array<{ id: string; name: string; status: string; spend: number; impressions: number; clicks: number; ctr: number; reach: number; results: number; costPerResult: number }>;
    totals: { spend: number; impressions: number; clicks: number; results: number; costPerResult: number };
  } | null> {
    if (!this.config.accessToken) return null;
    let campaigns: Array<{ id: string; name: string; status: string }> = [];
    if (Array.isArray(opts?.campaignIds) && opts!.campaignIds!.length) {
      campaigns = opts!.campaignIds!.map((id) => ({ id, name: id, status: "ACTIVE" }));
    } else {
      campaigns = await this.listActiveCampaigns();
    }
    if (!campaigns.length) return { campaigns: [], totals: { spend: 0, impressions: 0, clicks: 0, results: 0, costPerResult: 0 } };
    const days = Math.min(Math.max(opts?.days || 7, 1), 30);
    const preset = days <= 1 ? "today" : days <= 3 ? "last_3d" : days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : "last_30d";
    // Una consulta por campaña, EN PARALELO: en serie, un panel con 10
    // campañas encadenaba 10 viajes a Meta y tardaba una eternidad en pintar.
    const medidas = await Promise.all(
      campaigns.map(async (c) => {
        const m = await this.getCampaignInsights(c.id, preset);
        return m ? { id: c.id, name: c.name, status: c.status, ...m } : null;
      }),
    );
    const rows = medidas.filter((r): r is NonNullable<typeof r> => r !== null);
    const totals = rows.reduce(
      (acc, r) => ({
        spend: acc.spend + r.spend,
        impressions: acc.impressions + r.impressions,
        clicks: acc.clicks + r.clicks,
        results: acc.results + r.results,
        costPerResult: acc.results + r.results > 0 ? (acc.spend + r.spend) / (acc.results + r.results) : 0,
      }),
      { spend: 0, impressions: 0, clicks: 0, results: 0, costPerResult: 0 },
    );
    return { campaigns: rows, totals };
  }

  /**
   * Inversa de `presupuestoDiarioParaMeta`: pasa un monto que viene de Graph
   * API (en unidades mínimas) al número que el admin entiende.
   *
   * Dividir por 100 SIEMPRE es incorrecto, por el mismo motivo que
   * multiplicar por 100 siempre lo era: el peso colombiano no tiene centavos
   * (offset 1). Visto en vivo (2026-08-15): un conjunto con $10.000 COP/día
   * bien guardados en Meta se le mostraba al admin como "$100/día".
   *
   * Al leer es tan peligroso como al escribir, pero al revés: si el admin ve
   * "$100" donde hay $10.000 y decide "esto no gasta nada, lo subo a 10.000",
   * termina poniendo cien veces lo que quería.
   */
  private async deMetaAMonedaDeCuenta(valorMeta: unknown): Promise<number> {
    const n = Number(valorMeta);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const moneda = (await this.getAccountCurrency()) || "COP";
    return MONEDAS_SIN_DECIMALES.has(moneda) ? n : n / 100;
  }

  /** Presupuesto diario configurado y gastado hoy -- necesario para
   * "protección de gasto" (¿ya se comió el presupuesto sin resultados?). */
  async getAdSetBudgetStatus(adSetId: string): Promise<{ dailyBudget: number; status: string } | null> {
    try {
      const res = await this.fbGet(`${adSetId}`, { fields: "daily_budget,effective_status" }, this.config.userAccessToken);
      return {
        dailyBudget: await this.deMetaAMonedaDeCuenta(res.daily_budget),
        status: res.effective_status,
      };
    } catch (err: any) {
      logger.warn({ err, adSetId }, "[Facebook] Error leyendo presupuesto del conjunto");
      return null;
    }
  }

  /**
   * Fija el presupuesto diario de un conjunto de anuncios a un valor exacto.
   *
   * Distinto de adjustAdSetBudget(), que mueve un PORCENTAJE: eso le sirve al
   * agente automático ("subile 20%"), pero un admin que entra al panel piensa
   * en pesos, no en porcentajes. Graph API espera centavos.
   *
   * Devuelve un mensaje real de Meta cuando falla, en vez de un booleano
   * mudo: si Meta rechaza el monto (mínimos por moneda, cuenta sin método de
   * pago), el admin tiene que poder enterarse de por qué.
   */
  /**
   * Corrige la segmentación de un CONJUNTO ya publicado (edades, ciudades,
   * géneros, Advantage+). Atlas no tenía cómo (08-10: "no tengo habilitada
   * la edición de a quién se le muestra el anuncio") y el anuncio siguió
   * saliendo 18-65 a todo el país. Se lee la segmentación actual y se cambia
   * solo lo pedido.
   */
  async editarSegmentacionDeConjunto(
    adSetId: string,
    cambios: { edadMin?: number; edadMax?: number; ciudades?: string[]; generos?: number[]; advantagePlus?: boolean },
    pais = "CO",
  ): Promise<{ ok: boolean; message?: string; aplicado?: Record<string, any> }> {
    const token = this.config.userAccessToken || this.config.accessToken;
    try {
      const actual = await this.fbGet(adSetId, { fields: "targeting" }, token);
      const t: Record<string, any> = { ...(actual?.targeting || {}) };
      if (cambios.edadMin) t.age_min = Math.max(18, Math.min(65, Math.round(cambios.edadMin)));
      if (cambios.edadMax) t.age_max = Math.max(18, Math.min(65, Math.round(cambios.edadMax)));
      if (t.age_min && t.age_max && t.age_min > t.age_max) return { ok: false, message: "La edad mínima no puede ser mayor que la máxima." };
      if (cambios.generos?.length) t.genders = cambios.generos;
      if (cambios.ciudades?.length) {
        const { resueltas, faltan } = await resolverCiudades(token, cambios.ciudades, pais);
        if (faltan.length) return { ok: false, message: `Meta no reconoce estas ciudades: ${faltan.join(", ")}.` };
        t.geo_locations = geoConCiudades([pais], resueltas);
      }
      const pidioConcreto = !!(cambios.ciudades?.length || cambios.generos?.length || (cambios.edadMin ?? 18) > 18 || (cambios.edadMax ?? 65) < 65);
      if (cambios.advantagePlus !== undefined || pidioConcreto) {
        t.targeting_automation = { advantage_audience: cambios.advantagePlus === true ? 1 : 0 };
      }
      await this.fbPost(adSetId, { targeting: JSON.stringify(t) }, "editar segmentación", token);
      return { ok: true, aplicado: t };
    } catch (err: any) {
      logger.warn({ err: err?.message, adSetId }, "[Facebook] Error editando la segmentación del conjunto");
      return { ok: false, message: err?.message || "Meta no aceptó el cambio de segmentación." };
    }
  }

  /**
   * Lee de Meta cómo quedó un conjunto (segmentación, estado y el creative de
   * sus anuncios) para la verificación posterior. Ver
   * lib/verificar-anuncio-en-meta.ts.
   */
  async leerConjuntoParaVerificar(adSetId: string): Promise<{ targeting?: any; optimization_goal?: string; status?: string; effective_status?: string; ads?: any[] }> {
    const token = this.config.userAccessToken || this.config.accessToken;
    const conjunto = await this.fbGet(adSetId, { fields: "targeting,status,effective_status,optimization_goal" }, token);
    const ads = await this.fbGet(`${adSetId}/ads`, { fields: "creative{object_story_spec,asset_feed_spec}", limit: "10" }, token).catch(() => null);
    return {
      targeting: conjunto?.targeting,
      optimization_goal: conjunto?.optimization_goal,
      status: conjunto?.status,
      effective_status: conjunto?.effective_status,
      ads: Array.isArray(ads?.data) ? ads.data : [],
    };
  }

  async setAdSetBudget(adSetId: string, dailyBudget: number): Promise<{ ok: boolean; message?: string }> {
    // El monto viene en COP y se convierte a la moneda real de la cuenta,
    // con techo de seguridad (ver presupuestoDiarioParaMeta).
    const presu = await this.presupuestoDiarioParaMeta(dailyBudget);
    if (!presu.ok) return { ok: false, message: presu.message };
    try {
      await this.fbPost(
        adSetId,
        { daily_budget: presu.valor },
        "fijar presupuesto",
        this.config.userAccessToken,
      );
      return { ok: true };
    } catch (err: any) {
      logger.warn({ err, adSetId, dailyBudget }, "[Facebook] Error fijando presupuesto");
      return { ok: false, message: err?.message || "Meta no aceptó el cambio de presupuesto." };
    }
  }

  /** Conjuntos de anuncios de una campaña, con su presupuesto y estado --
   * necesario para que el panel sepa a QUÉ conjunto cambiarle el presupuesto
   * (el presupuesto vive en el conjunto, no en la campaña). */
  /**
   * El texto que REALMENTE publican los anuncios de una campaña (cuerpo,
   * titular, descripción, también de carrusel y de variantes dinámicas).
   *
   * Para no encender a ciegas un anuncio viejo: el validador de promesas solo
   * corría al CREAR, así que una campaña escrita antes de las reglas (09-10:
   * "sin dolor", "al instante", "envío incluido") se podía volver a prender.
   * Null si Meta no deja leerlo.
   */
  async textosDeLosAnuncios(campaignId: string): Promise<string[] | null> {
    try {
      const ads = await this.fbGet(`${campaignId}/ads`, {
        fields: "id,creative{body,title,object_story_spec,asset_feed_spec}",
        limit: "100",
      }, this.config.userAccessToken);
      const textos: string[] = [];
      const sumar = (v: unknown) => { if (typeof v === "string" && v.trim()) textos.push(v.trim()); };
      for (const ad of ads?.data || []) {
        const c = ad?.creative || {};
        sumar(c.body); sumar(c.title);
        const ld = c.object_story_spec?.link_data || {};
        sumar(ld.message); sumar(ld.name); sumar(ld.description);
        for (const h of ld.child_attachments || []) { sumar(h?.name); sumar(h?.description); }
        const vd = c.object_story_spec?.video_data || {};
        sumar(vd.message); sumar(vd.title);
        const af = c.asset_feed_spec || {};
        for (const k of ["bodies", "titles", "descriptions"]) for (const x of af[k] || []) sumar(x?.text);
      }
      return textos;
    } catch (e: any) {
      logger.warn({ campaignId, err: e?.message }, "[FB] No pude leer el texto de los anuncios");
      return null;
    }
  }

  /**
   * Estructura completa de una campaña: conjuntos y, dentro, sus anuncios.
   *
   * Hace falta porque el estado que muestra Meta arriba engaña. Caso real
   * (16-08-2026): la campaña de piano figuraba ACTIVE y no entregaba nada --
   * el único anuncio de su conjunto activo estaba pausado, y el otro anuncio
   * colgaba de un conjunto pausado. Con solo mirar la campaña es imposible
   * saberlo, y el admin creía estar pagando por algo que no corría.
   */
  async estructuraDeCampana(campaignId: string): Promise<{
    conjuntos: Array<{
      id: string; nombre: string; estado: string; presupuestoDiario: number;
      anuncios: Array<{ id: string; nombre: string; estado: string; configurado: string }>;
    }>;
    entregando: boolean;
    /** Estado de la CAMPAÑA. Sin esto no se puede saber quién frena la entrega. */
    estadoCampana: string;
  } | null> {
    try {
      // La campaña PRIMERO. Faltaba, y era el nivel que decidía todo: con la
      // campaña en PAUSED, encender el conjunto no sirve de nada -- Meta lo
      // deja en CAMPAIGN_PAUSED y no se muestra a nadie.
      const camp = await this.fbGet(campaignId, { fields: "id,name,status,effective_status" }, this.config.userAccessToken);
      const estadoCampana = String(camp?.effective_status || camp?.status || "");

      const cs = await this.fbGet(`${campaignId}/adsets`,
        { fields: "id,name,effective_status,daily_budget", limit: "50" }, this.config.userAccessToken);
      const ads = await this.fbGet(`${campaignId}/ads`,
        { fields: "id,name,effective_status,configured_status,adset_id", limit: "100" }, this.config.userAccessToken);

      const conjuntos = (cs.data || []).map((c: any) => ({
        id: c.id,
        nombre: c.name,
        estado: c.effective_status || c.status,
        presupuestoDiario: Number(c.daily_budget || 0),
        anuncios: (ads.data || [])
          .filter((a: any) => a.adset_id === c.id)
          .map((a: any) => ({ id: a.id, nombre: a.name, estado: a.effective_status, configurado: a.configured_status })),
      }));
      // Entrega de verdad solo si hay al menos un anuncio encendido dentro de
      // un conjunto encendido. Cualquier otra combinación no muestra el
      // anuncio a nadie, por más que la campaña diga "activa".
      //
      // IN_PROCESS y PENDING_REVIEW cuentan como encendido: Meta pasa por esos
      // estados unos segundos después de recibir el cambio, antes de dejarlo
      // en ACTIVE. Sin contemplarlos, verificar justo después de encender daba
      // "todavía no entrega" sobre un cambio que SÍ se había aplicado -- y al
      // admin le llegaba un mensaje de fracaso por algo que había funcionado.
      const ENCENDIDO = new Set(["ACTIVE", "IN_PROCESS", "PENDING_REVIEW", "PENDING_BILLING_INFO"]);
      // La CAMPAÑA también tiene que estar encendida. Antes esta cuenta solo
      // miraba conjunto + anuncio, así que una campaña pausada con su conjunto
      // encendido figuraba como "entregando" sin mostrarse a nadie.
      const entregando = ENCENDIDO.has(estadoCampana) && conjuntos.some((c: any) =>
        ENCENDIDO.has(c.estado) && c.anuncios.some((a: any) => ENCENDIDO.has(a.estado)));
      return { conjuntos, entregando, estadoCampana };
    } catch (err: any) {
      logger.warn({ err, campaignId }, "[Facebook] No se pudo leer la estructura de la campaña");
      return null;
    }
  }

  /**
   * Radiografía COMPLETA de una campaña, tal como está configurada en Meta:
   * objetivo y estrategia de puja de la campaña; por conjunto: destino
   * (WhatsApp / web / Messenger), objetivo de optimización, evento de cobro,
   * presupuesto, segmentación (países, ciudades, edades, sexo, intereses,
   * Advantage+) y ubicaciones; por anuncio: formato, texto principal, título,
   * descripción, llamado a la acción, enlace/número de WhatsApp e imagen o
   * video. Es lo que Atlas necesita para replicar lo que ya funciona en la
   * cuenta en vez de inventar la configuración (pedido del dueño 13-09-2026).
   */
  async radiografiaDeCampana(campaignId: string): Promise<any | null> {
    try {
      const tok = this.config.userAccessToken;
      const camp = await this.fbGet(campaignId, {
        fields: "id,name,status,effective_status,objective,buying_type,bid_strategy,special_ad_categories,daily_budget,lifetime_budget,start_time,stop_time,created_time",
      }, tok);
      const cs = await this.fbGet(`${campaignId}/adsets`, {
        fields: "id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_amount,bid_strategy,destination_type,promoted_object,targeting,start_time,end_time,attribution_spec,is_dynamic_creative",
        limit: "50",
      }, tok);
      const ads = await this.fbGet(`${campaignId}/ads`, {
        fields: "id,name,status,effective_status,adset_id,creative{id,name,object_story_spec,asset_feed_spec,call_to_action_type,image_url,thumbnail_url,video_id,body,title,link_url,effective_object_story_id,url_tags,degrees_of_freedom_spec}",
        limit: "100",
      }, tok);

      const resumirTargeting = (t: any) => {
        if (!t || typeof t !== "object") return null;
        const geo = t.geo_locations || {};
        return {
          paises: geo.countries || [],
          ciudades: (geo.cities || []).map((c: any) => `${c.name || c.key}${c.radius ? ` +${c.radius}${c.distance_unit || "km"}` : ""}`),
          regiones: (geo.regions || []).map((r: any) => r.name || r.key),
          tiposDeUbicacion: geo.location_types || [],
          edad: [t.age_min ?? null, t.age_max ?? null],
          sexo: t.genders ? (t.genders.includes(1) && t.genders.includes(2) ? "todos" : t.genders.includes(1) ? "hombres" : "mujeres") : "todos",
          intereses: ((t.flexible_spec || []).flatMap((f: any) => f.interests || [])).concat(t.interests || []).map((i: any) => i.name || i.id),
          comportamientos: ((t.flexible_spec || []).flatMap((f: any) => f.behaviors || [])).map((b: any) => b.name || b.id),
          excluidos: (t.exclusions?.interests || []).map((i: any) => i.name || i.id),
          audienciasPersonalizadas: (t.custom_audiences || []).map((a: any) => a.name || a.id),
          idiomas: t.locales || [],
          ubicaciones: {
            automaticas: !t.publisher_platforms,
            plataformas: t.publisher_platforms || [],
            facebook: t.facebook_positions || [],
            instagram: t.instagram_positions || [],
            messenger: t.messenger_positions || [],
            audienceNetwork: t.audience_network_positions || [],
          },
          advantagePlus: t.targeting_automation?.advantage_audience === 1 || !!t.targeting_optimization,
          dispositivos: t.device_platforms || [],
        };
      };
      const resumirCreativo = (c: any) => {
        if (!c) return null;
        const oss = c.object_story_spec || {};
        const link = oss.link_data || {};
        const video = oss.video_data || {};
        const afs = c.asset_feed_spec || {};
        const cta = link.call_to_action || video.call_to_action || (afs.call_to_action_types?.[0] ? { type: afs.call_to_action_types[0] } : null);
        const formato = video.video_id || c.video_id ? "video" : (link.child_attachments?.length ? "carrusel" : (afs.images?.length || afs.videos?.length ? "dinamico" : "imagen"));
        return {
          id: c.id,
          formato,
          textoPrincipal: link.message || video.message || afs.bodies?.[0]?.text || c.body || null,
          titulo: link.name || video.title || afs.titles?.[0]?.text || c.title || null,
          descripcion: link.description || afs.descriptions?.[0]?.text || null,
          cta: cta?.type || c.call_to_action_type || null,
          destino: cta?.value?.link || link.link || cta?.value?.app_destination || c.link_url || null,
          whatsapp: cta?.value?.whatsapp_number || null,
          imagen: link.picture || c.image_url || c.thumbnail_url || null,
          videoId: video.video_id || c.video_id || null,
          paginaId: oss.page_id || null,
          instagramId: oss.instagram_actor_id || oss.instagram_user_id || null,
          variantes: { textos: afs.bodies?.length || 0, titulos: afs.titles?.length || 0, imagenes: afs.images?.length || 0, videos: afs.videos?.length || 0 },
          mejorasAutomaticas: c.degrees_of_freedom_spec?.creative_features_spec ? Object.keys(c.degrees_of_freedom_spec.creative_features_spec) : [],
        };
      };

      return {
        campana: {
          id: camp.id, nombre: camp.name, estado: camp.effective_status || camp.status, objetivo: camp.objective,
          tipoDeCompra: camp.buying_type, estrategiaDePuja: camp.bid_strategy || null, categoriasEspeciales: camp.special_ad_categories || [],
          presupuestoDiarioCampana: camp.daily_budget ? Number(camp.daily_budget) : null, inicio: camp.start_time || null, fin: camp.stop_time || null,
        },
        conjuntos: (cs.data || []).map((c: any) => ({
          id: c.id, nombre: c.name, estado: c.effective_status || c.status,
          presupuestoDiario: c.daily_budget ? Number(c.daily_budget) : null, presupuestoTotal: c.lifetime_budget ? Number(c.lifetime_budget) : null,
          optimizacion: c.optimization_goal, cobroPor: c.billing_event, puja: c.bid_amount ? Number(c.bid_amount) : null, estrategiaDePuja: c.bid_strategy || null,
          destino: c.destination_type || null, objetoPromocionado: c.promoted_object || null,
          creativoDinamico: !!c.is_dynamic_creative, inicio: c.start_time || null, fin: c.end_time || null,
          segmentacion: resumirTargeting(c.targeting),
          anuncios: (ads.data || []).filter((a: any) => a.adset_id === c.id).map((a: any) => ({
            id: a.id, nombre: a.name, estado: a.effective_status || a.status, creativo: resumirCreativo(a.creative),
          })),
        })),
      };
    } catch (err: any) {
      logger.warn({ err: err?.message, campaignId }, "[Facebook] No se pudo leer la radiografía de la campaña");
      return null;
    }
  }

  /** La plantilla reutilizable de una campaña real (ver PlantillaDeCampana). */
  async plantillaDesdeCampana(campaignId: string): Promise<PlantillaDeCampana | null> {
    const r = await this.radiografiaDeCampana(campaignId);
    if (!r?.conjuntos?.length) return null;
    const mejoras = r.conjuntos.some((c: any) => c.anuncios?.some((a: any) => (a.creativo?.mejorasAutomaticas || []).includes("advantage_plus_creative")));
    const instagram = r.conjuntos.some((c: any) => c.anuncios?.some((a: any) => !!a.creativo?.instagramId));
    return {
      origen: { id: r.campana.id, nombre: r.campana.nombre },
      conjuntos: r.conjuntos.map((c: any) => ({
        nombre: String(c.nombre || "").replace(/^.*?-\s*/, "").trim() || c.nombre,
        paises: c.segmentacion?.paises || ["CO"],
        optimizacion: c.optimizacion || null,
        presupuestoDiario: c.presupuestoDiario || null,
        edadMin: c.segmentacion?.edad?.[0] || null,
        edadMax: c.segmentacion?.edad?.[1] || null,
        tiposDeUbicacion: c.segmentacion?.tiposDeUbicacion || null,
        advantagePlus: c.segmentacion?.advantagePlus !== false,
      })),
      mejorasCompletas: mejoras,
      instagram,
    };
  }

  /** La campaña más reciente de la cuenta (activa o en pausa), para usarla de plantilla. */
  /**
   * La campaña a COPIAR como estructura: la mejor de la cuenta, no la última.
   *
   * Antes era la más reciente, y eso degrada solo: el 24-09-2026 la última era
   * una campaña mala (un conjunto, creada por el camino viejo) y la siguiente
   * salió igual de pobre, aunque la cuenta había tenido campañas buenas
   * (Colombia + Internacional). Orden: la que GASTÓ (Meta la entregó), después
   * la de más conjuntos, después la más nueva. Las "[BORRADOR]" nunca.
   */
  async campanaModelo(): Promise<{ id: string; name: string; status: string } | null> {
    try {
      const r = await this.fbGet(`act_${this.config.adAccountId}/campaigns`, {
        fields: "id,name,effective_status,created_time,adsets.limit(0).summary(true),insights.date_preset(maximum){spend}",
        limit: "25",
        filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED"] }]),
      }, this.config.userAccessToken);
      const lista = (r?.data || [])
        .filter((c: any) => !/^\s*\[BORRADOR\]/i.test(String(c.name || "")))
        .map((c: any) => ({
          c,
          gasto: Number(c?.insights?.data?.[0]?.spend || 0),
          conjuntos: Number(c?.adsets?.summary?.total_count || 0),
        }))
        .filter((x: any) => x.conjuntos > 0)
        .sort((a: any, b: any) =>
          (Number(b.gasto > 0) - Number(a.gasto > 0)) || (b.conjuntos - a.conjuntos) || String(b.c.created_time).localeCompare(String(a.c.created_time)));
      const c = lista[0]?.c;
      if (c) return { id: c.id, name: c.name, status: c.effective_status };
    } catch { /* si la consulta rica falla, la más reciente como antes */ }
    return this.campanaMasReciente();
  }

  async campanaMasReciente(): Promise<{ id: string; name: string; status: string } | null> {
    try {
      const r = await this.fbGet(`act_${this.config.adAccountId}/campaigns`, {
        fields: "id,name,effective_status,created_time", limit: "10",
        filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED"] }]),
      }, this.config.userAccessToken);
      const lista = (r?.data || []).sort((a: any, b: any) => String(b.created_time).localeCompare(String(a.created_time)));
      const c = lista[0];
      return c ? { id: c.id, name: c.name, status: c.effective_status } : null;
    } catch { return null; }
  }

  /** Enciende o apaga UN anuncio puntual, sin tocar su conjunto ni la campaña. */
  async setAdStatus(adId: string, activo: boolean): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.fbPost(adId, { status: activo ? "ACTIVE" : "PAUSED" },
        activo ? "activar anuncio" : "pausar anuncio", this.config.userAccessToken);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err?.message || "Meta rechazó el cambio de estado del anuncio" };
    }
  }

  /** Enciende o apaga un CONJUNTO de anuncios. Es lo que faltaba: el nivel
   * intermedio entre la campaña y el anuncio, y donde vive el presupuesto. */
  /**
   * Programa CUANDO deja de entregar una campana, usando la programacion
   * nativa de Meta (`end_time` del conjunto de anuncios).
   *
   * Por que asi y no con un temporizador nuestro: un `setTimeout` en el
   * servidor se pierde en cada despliegue --y hoy hubo diez--, y un reloj que
   * corre cada hora puede errarle por 59 minutos. Meta corta la entrega en el
   * minuto exacto y lo sigue haciendo aunque nuestro servidor este caido. La
   * fecha ademas queda VISIBLE en Ads Manager, asi que el admin puede
   * verificarla sin creerle a nadie.
   *
   * Se aplica a TODOS los conjuntos de la campana: si quedara uno sin fecha,
   * ese seguiria gastando y la programacion no habria servido de nada.
   */
  async programarFinDeEntrega(campaignId: string, fin: Date): Promise<{ ok: boolean; message: string; conjuntos: number }> {
    const conjuntos = await this.listAdSets(campaignId);
    if (conjuntos.length === 0) {
      return { ok: false, message: "Esa campana no tiene conjuntos de anuncios: no hay nada que programar.", conjuntos: 0 };
    }
    // Meta acepta ISO 8601. Se manda en UTC y Meta lo interpreta contra la
    // zona horaria de la cuenta publicitaria.
    const cuando = fin.toISOString();
    let aplicados = 0;
    const errores: string[] = [];
    for (const c of conjuntos) {
      try {
        await this.fbPost(c.id, { end_time: cuando }, "programar fin de entrega", this.config.userAccessToken);
        aplicados++;
      } catch (err: any) {
        errores.push(`${c.name}: ${err?.message || "rechazado por Meta"}`);
      }
    }
    if (aplicados === 0) {
      return { ok: false, message: `Meta no acepto la programacion. ${errores.join(" | ")}`, conjuntos: 0 };
    }
    return {
      ok: errores.length === 0,
      message: errores.length
        ? `Programados ${aplicados} de ${conjuntos.length} conjuntos. Fallaron: ${errores.join(" | ")}`
        : `Deja de entregar el ${fin.toLocaleString("es-CO", { timeZone: "America/Bogota" })} (hora Colombia). Lo corta Meta, no nuestro servidor.`,
      conjuntos: aplicados,
    };
  }

  /** Quita la fecha de fin programada de todos los conjuntos de la campana. */
  async quitarFinDeEntrega(campaignId: string): Promise<{ ok: boolean; message: string }> {
    const conjuntos = await this.listAdSets(campaignId);
    let ok = 0;
    for (const c of conjuntos) {
      try {
        await this.fbPost(c.id, { end_time: "" }, "quitar fin de entrega", this.config.userAccessToken);
        ok++;
      } catch { /* se informa abajo por conteo */ }
    }
    return ok > 0
      ? { ok: true, message: `Se quito la fecha de fin en ${ok} conjunto(s): vuelve a correr sin limite de tiempo.` }
      : { ok: false, message: "No se pudo quitar la fecha de fin." };
  }

  async setAdSetStatus(adSetId: string, activo: boolean): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.fbPost(adSetId, { status: activo ? "ACTIVE" : "PAUSED" },
        activo ? "activar conjunto" : "pausar conjunto", this.config.userAccessToken);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err?.message || "Meta rechazó el cambio de estado del conjunto" };
    }
  }

  /**
   * Hace que una campaña ENTREGUE de verdad, con el mínimo cambio posible.
   *
   * Nació de un caso que costó varios intentos fallidos: el admin pidió
   * "activá el anuncio del piano" y el flujo exigía encadenar a mano listar
   * campañas, diagnosticar, elegir el objeto correcto (¿campaña, conjunto o
   * anuncio?) y llamar la herramienta con el id exacto -- con una confirmación
   * en cada paso. El modelo se perdía, inventaba ids y terminaba llamando la
   * herramienta equivocada. Nada de eso es trabajo del modelo: es una decisión
   * mecánica que el servidor puede tomar solo mirando la estructura.
   *
   * Elige SIEMPRE la opción más barata que logra la entrega:
   *   1. Si hay un conjunto ACTIVO con un anuncio apagado -> enciende ese
   *      anuncio. No suma presupuesto: el conjunto ya estaba corriendo.
   *   2. Si no, enciende UN SOLO conjunto (el que ya tenga un anuncio activo
   *      adentro) -> suma el presupuesto de ese conjunto, nada más.
   * Nunca enciende varios conjuntos: cada uno suma su propio presupuesto
   * diario y multiplicaría el gasto sin que nadie lo pida.
   *
   * Verifica el resultado releyendo de Meta, no asumiendo que salió bien.
   */
  async hacerQueEntregue(campaignId: string, aplicar: boolean): Promise<{
    ok: boolean; yaEntregaba?: boolean; plan?: string; costoDiario?: number;
    aplicado?: boolean; message?: string;
  }> {
    const est = await this.estructuraDeCampana(campaignId);
    if (!est) return { ok: false, message: "No pude leer la estructura de esa campaña en Meta." };
    if (est.entregando) return { ok: true, yaEntregaba: true, plan: "Ya está entregando: no hace falta tocar nada." };

    // ── Paso 0: la CAMPAÑA ────────────────────────────────────────────────
    // Faltaba, y era el nivel que mandaba sobre todos los demás. Esta función
    // miraba solo conjunto y anuncio, así que con la campaña en PAUSED
    // encendía el conjunto, Meta lo dejaba en CAMPAIGN_PAUSED, y el anuncio no
    // se mostraba a nadie -- mientras el admin leía "✅ Hecho, Meta aceptó el
    // cambio". Reproducido en vivo el 2026-08-19: el admin confirmó la
    // activación, se le dijo que sí, y al revisar seguía PAUSED.
    //
    // Encender la campaña sola NO gasta: el gasto lo define el presupuesto del
    // conjunto, y sin un conjunto y un anuncio encendidos no hay entrega. Por
    // eso va primero y después sigue la lógica de siempre, que es la que
    // elige la opción más barata.
    const ENCENDIDO = new Set(["ACTIVE", "IN_PROCESS", "PENDING_REVIEW", "PENDING_BILLING_INFO"]);
    let campanaEncendida = "";
    if (!ENCENDIDO.has(est.estadoCampana)) {
      if (!aplicar) {
        campanaEncendida = "encender la campaña (está en pausa) y ";
      } else {
        const rc = await this.resumeCampaign(campaignId);
        if (!rc) return { ok: false, message: "No pude encender la campaña en Meta: sin eso, encender el conjunto no sirve de nada." };
        campanaEncendida = "encendí la campaña (estaba en pausa) y ";
      }
    }

    // Opción 1: anuncio apagado dentro de un conjunto que YA corre.
    const conjuntoVivo = est.conjuntos.find((c) => c.estado === "ACTIVE" && c.anuncios.length > 0);
    if (conjuntoVivo) {
      const anuncio = conjuntoVivo.anuncios.find((a) => a.estado !== "ACTIVE");
      if (anuncio) {
        const plan = `${campanaEncendida}encender el anuncio "${anuncio.nombre}" dentro del conjunto que ya está activo`;
        if (!aplicar) return { ok: true, plan, costoDiario: conjuntoVivo.presupuestoDiario };
        const r = await this.setAdStatus(anuncio.id, true);
        if (!r.ok) return { ok: false, message: r.message };
        // Un respiro antes de releer: Meta necesita un momento para propagar.
        await new Promise((res) => setTimeout(res, 2500));
        const verif = await this.estructuraDeCampana(campaignId);
        return { ok: true, aplicado: true, plan, costoDiario: conjuntoVivo.presupuestoDiario, yaEntregaba: !!verif?.entregando };
      }
    }

    // Opción 2: un conjunto apagado que ya tiene un anuncio listo adentro.
    const candidato = est.conjuntos.find((c) => c.estado !== "ACTIVE" && c.anuncios.some((a) => a.configurado === "ACTIVE"))
      || est.conjuntos.find((c) => c.estado !== "ACTIVE" && c.anuncios.length > 0);
    if (candidato) {
      const plan = `${campanaEncendida}encender el conjunto "${candidato.nombre}" (su anuncio ya está listo adentro)`;
      if (!aplicar) return { ok: true, plan, costoDiario: candidato.presupuestoDiario };
      const r = await this.setAdSetStatus(candidato.id, true);
      if (!r.ok) return { ok: false, message: r.message };
      // Con el conjunto encendido, el anuncio de adentro puede seguir pausado.
      const anuncioApagado = candidato.anuncios.find((a) => a.configurado !== "ACTIVE");
      if (anuncioApagado) await this.setAdStatus(anuncioApagado.id, true);
      await new Promise((res) => setTimeout(res, 2500));
      const verif = await this.estructuraDeCampana(campaignId);
      return { ok: true, aplicado: true, plan, costoDiario: candidato.presupuestoDiario, yaEntregaba: !!verif?.entregando };
    }

    // Conjunto y anuncio ya estaban encendidos: lo único que frenaba era la
    // campaña, y eso ya se resolvió arriba. Antes se caía acá con "no tiene
    // ningún anuncio adentro", que era falso y mandaba a crear un anuncio que
    // ya existía.
    if (campanaEncendida) {
      const conjunto = est.conjuntos.find((c) => c.anuncios.length > 0);
      await new Promise((res) => setTimeout(res, 2500));
      const verif = await this.estructuraDeCampana(campaignId);
      return {
        ok: true,
        aplicado: aplicar,
        plan: `${campanaEncendida}listo: el conjunto y el anuncio ya estaban encendidos`,
        costoDiario: conjunto?.presupuestoDiario,
        yaEntregaba: !!verif?.entregando,
      };
    }

    return { ok: false, message: "Esta campaña no tiene ningún anuncio adentro: hay que crear el anuncio antes de poder encenderla." };
  }

  async listAdSets(campaignId: string): Promise<Array<{ id: string; name: string; status: string; dailyBudget: number }>> {
    try {
      const res = await this.fbGet(
        `${campaignId}/adsets`,
        { fields: "id,name,effective_status,daily_budget", limit: "50" },
        this.config.userAccessToken,
      );
      // Promise.all y no un map suelto: la conversión consulta la moneda de
      // la cuenta (cacheada por instancia), así que es asíncrona.
      return await Promise.all((res.data || []).map(async (a: any) => ({
        id: a.id,
        name: a.name,
        status: a.effective_status,
        dailyBudget: await this.deMetaAMonedaDeCuenta(a.daily_budget),
      })));
    } catch (err: any) {
      logger.warn({ err, campaignId }, "[Facebook] Error listando conjuntos de anuncios");
      return [];
    }
  }

  /**
   * Motivo del ultimo fallo al pausar/reanudar. Igual que `lastAdError`:
   * estos metodos devuelven boolean --no pueden tirar sin romper a quien los
   * llama-- asi que sin esto el llamador solo sabe "fallo", no por que.
   *
   * Y esto no es teorico: el 2026-08-22 el admin intento pausar dos campanas
   * que estaban gastando, las dos respondieron "No se pudo pausar la campana"
   * y nadie pudo saber si era el token, un permiso o un id equivocado --
   * mientras el dinero seguia corriendo.
   */
  lastCampaignError: string | null = null;

  async pauseCampaign(campaignId: string): Promise<boolean> {
    try {
      // El token de PAGINA no sirve para operar anuncios: hace falta el de
      // usuario. Si no esta, se dice cual falta en vez de un "no se pudo".
      const token = this.config.userAccessToken;
      if (!token) {
        this.lastCampaignError =
          "Falta el token de usuario de Facebook (el de pagina no sirve para administrar anuncios). " +
          "Volve a conectar la cuenta de Facebook desde el panel.";
        logger.warn({ campaignId }, "[Facebook] pausar sin userAccessToken");
        return false;
      }
      await this.fbPost(campaignId, { status: "PAUSED" }, "pausar campaña", token);
      this.lastCampaignError = null;
      return true;
    } catch (err: any) {
      this.lastCampaignError = err?.message || "Meta rechazó el cambio";
      logger.warn({ err, campaignId }, "[Facebook] Error pausando campaña");
      return false;
    }
  }

  /**
   * Reactiva una campaña Y sus conjuntos de anuncios.
   *
   * Los dos niveles, y no solo la campaña, porque Meta NO entrega nada si el
   * conjunto está pausado, por más que la campaña figure activa. Encontrado
   * en la cuenta del admin (2026-08-15): la campaña del Curso de Piano estaba
   * ACTIVE desde hacía dos días con 0 impresiones y 0 de gasto -- su conjunto
   * seguía en PAUSED. Se sospechó de facturación y de aprobación de Meta
   * antes de dar con esto.
   *
   * Los anuncios se crean con el conjunto en PAUSED (ver createAdForProduct),
   * así que TODA campaña recién creada cae en este caso: activarla sola no
   * hace absolutamente nada. Es decir, hasta ahora ningún camino automático
   * podía llegar a mostrar un anuncio -- ni Atlas ni el panel.
   *
   * Devuelve false si algún nivel falla: "a medias" acá significa que el
   * admin cree que su anuncio corre y no corre.
   */
  async resumeCampaign(campaignId: string): Promise<boolean> {
    try {
      await this.fbPost(campaignId, { status: "ACTIVE" }, "reactivar campaña", this.config.userAccessToken);
    } catch (err: any) {
      logger.warn({ err, campaignId }, "[Facebook] Error reactivando campaña");
      return false;
    }
    try {
      const conjuntos = await this.listAdSets(campaignId);
      if (conjuntos.length === 0) {
        logger.warn({ campaignId }, "[Facebook] La campaña no tiene conjuntos: activarla no va a mostrar nada");
        return false;
      }
      for (const c of conjuntos) {
        if (c.status === "ACTIVE") continue;
        await this.fbPost(c.id, { status: "ACTIVE" }, "reactivar conjunto", this.config.userAccessToken);
        logger.info({ campaignId, adSetId: c.id }, "[Facebook] Conjunto reactivado");
      }
      return true;
    } catch (err: any) {
      logger.warn({ err, campaignId }, "[Facebook] La campaña quedó activa pero un conjunto no se pudo reactivar");
      return false;
    }
  }

  /** Ajusta el presupuesto diario de un conjunto de anuncios por un
   * porcentaje (ej. 0.2 = +20%, -0.2 = -20%). Graph API espera el
   * presupuesto en centavos. */
  async adjustAdSetBudget(adSetId: string, percentChange: number): Promise<{ ok: boolean; newBudget?: number }> {
    try {
      const current = await this.getAdSetBudgetStatus(adSetId);
      if (!current || !current.dailyBudget) return { ok: false };
      // Acá NO se convierte: current.dailyBudget ya viene de Meta en la moneda
      // de la cuenta, así que el porcentaje se aplica y se devuelve en esa
      // misma moneda. Lo que sí importa es el PISO: estaba fijo en 1000, que
      // en una cuenta en pesos son 1.000 COP (razonable) pero en una cuenta
      // en dólares serían US$1.000 POR DÍA -- un piso capaz de multiplicar el
      // gasto por mil al "bajar" un presupuesto.
      const moneda = (await this.getAccountCurrency()) || "COP";
      const piso = moneda === "COP" ? 1000 : 1;
      const newBudget = Math.max(piso, Math.round(current.dailyBudget * (1 + percentChange)));
      await this.fbPost(adSetId, { daily_budget: Math.round(newBudget * 100) }, "ajustar presupuesto", this.config.userAccessToken);
      return { ok: true, newBudget };
    } catch (err: any) {
      logger.warn({ err, adSetId }, "[Facebook] Error ajustando presupuesto");
      return { ok: false };
    }
  }

  // ── Estrategias de copy por categoría ──────────────────────────────────────

  private getCategoryStrategy(productName: string): { hook: string; angle: string; emoji: string } {
    const n = productName.toLowerCase();
    if (n.includes("photoshop") || n.includes("diseño") || n.includes("ilustrator") || n.includes("canva") || n.includes("lettering") || n.includes("logotipo") || n.includes("indesign") || n.includes("premiere") || n.includes("after effects") || n.includes("animacion") || n.includes("3d"))
      return { hook: "¿Sin tiempo para diseñar?", angle: "consigue trabajo como diseñador freelance", emoji: "🎨" };
    if (n.includes("programacion") || n.includes("desarrollo web") || n.includes("hacking") || n.includes("ciberseguridad") || n.includes("wordpress") || n.includes("linux"))
      return { hook: "¿Quieres trabajar en tecnología?", angle: "consigue empleo sin título universitario", emoji: "💻" };
    if (n.includes("excel") || n.includes("office"))
      return { hook: "Excel te abre puertas laborales", angle: "el 80% de los trabajos piden Excel", emoji: "📊" };
    if (n.includes("ingles") || n.includes("idioma") || n.includes("oxford") || n.includes("frances") || n.includes("aleman") || n.includes("portugues") || n.includes("japones"))
      return { hook: "¿Inglés = más oportunidades?", angle: "duplica tu salario aprendiendo inglés", emoji: "🌎" };
    if (n.includes("guitarra") || n.includes("dj") || n.includes("produccion musical") || n.includes("musica") || n.includes("piano"))
      return { hook: "¿Siempre has querido tocar?", angle: "aprende música desde casa, a tu ritmo", emoji: "🎵" };
    if (n.includes("fotografia") || n.includes("fotomontaje") || n.includes("camara") || n.includes("video"))
      return { hook: "Fotos de profesional con tu celu", angle: "vende tus fotos o mejora tu marca", emoji: "📸" };
    if (n.includes("marketing") || n.includes("seo") || n.includes("ecommerce") || n.includes("ventas"))
      return { hook: "¿Tu negocio necesita más clientes?", angle: "aprende marketing digital y escala", emoji: "📈" };
    if (n.includes("fitness") || n.includes("pilates") || n.includes("fuerza") || n.includes("guerrero") || n.includes("perro"))
      return { hook: "¿Sin tiempo para el gym?", angle: "transforma tu cuerpo en casa, 20 min al día", emoji: "💪" };
    if (n.includes("reparacion") || n.includes("celular") || n.includes("play station") || n.includes("consola") || n.includes("armado") || n.includes("ensamblaje") || n.includes("computador"))
      return { hook: "¿Ganas $20K en tu trabajo?", angle: "una reparación te paga todo el curso", emoji: "🔧" };
    if (n.includes("drywall") || n.includes("plano") || n.includes("revit") || n.includes("arquitectura") || n.includes("obra") || n.includes("construccion") || n.includes("carpinteria"))
      return { hook: "Especialízate en construcción", angle: "gana 3x más en cada proyecto", emoji: "🏗️" };
    if (n.includes("gastronomia"))
      return { hook: "Cocina como un chef profesional", angle: "aprende nuevas recetas y técnicas desde casa", emoji: "🍳" };
    if (n.includes("contabilidad") || n.includes("autismo") || n.includes("lenguaje") || n.includes("memoria") || n.includes("psicologia"))
      return { hook: "Desarrolla habilidades que transforman vidas", angle: "fórmate en un área con alta demanda", emoji: "📚" };
    return { hook: "Aprende algo nuevo hoy", angle: "invierte en ti mismo por solo $20,000", emoji: "🚀" };
  }

  // ── Generación de copy con IA + estrategia de categoría ────────────────────

  /**
   * El copy cuando nadie pasó uno aprobado. Es el MISMO plan por modelo que
   * usa ad-strategist (físico / digital / servicio, AIDA, solo datos reales).
   * Acá había un tercer generador: pedía el texto a un endpoint que ya no
   * responde y caía a "Aprende X desde casa. Acceso de por vida" para
   * CUALQUIER producto -- así salió el corrector a Meta el 24-09-2026.
   */
  private async generateAdCopy(product: any, destino: "whatsapp" | "web" = "whatsapp"): Promise<{ primaryText: string; headline: string; description: string }> {
    const { planDeAnuncio } = await import("./anuncio-por-modelo");
    let condiciones: any = null;
    try {
      const { getBusinessContext } = await import("./business-context");
      condiciones = (await getBusinessContext(Number((this.tenant as any)?.id)))?.condiciones ?? null;
    } catch { condiciones = null; }
    const plan = planDeAnuncio(product, condiciones, { destino });
    return { primaryText: plan.primaryText, headline: plan.headline, description: plan.description };
  }

  // ── Imagen del anuncio ─────────────────────────────────────────────────────
  // No se usa /adimages (la app no tiene esa capacidad). En vez de subir la
  // imagen para obtener un hash, se pasa la URL absoluta directamente en el
  // campo `picture` del link_data del creativo. Facebook descarga, cachea y
  // muestra la imagen desde la URL sin necesidad del endpoint de subida.

  lastImageError: string | null = null;

  /** Genera URL de placeholder para usar como fallback si el producto no tiene
   * imagen. Se devuelve la URL directamente (no se sube a Facebook). */
  private generatePlaceholderUrl(productName: string): string {
    const color = encodeURIComponent("1A365D");
    const text = encodeURIComponent(productName.substring(0, 30));
    return `https://placehold.co/1200x628/1A365D/FFFFFF?text=${text}`;
  }

  // ── Utilidad: llamada a Graph API ──────────────────────────────────────────

  private esErrorTransitorio(err: any): boolean {
    return esErrorTransitorioDeMeta(err);
  }

  /**
   * Un POST a Graph API, con reintento en los errores transitorios.
   *
   * Por qué el reintento: la subida a Meta son CUATRO llamadas encadenadas
   * --campaña, conjunto, creativo, anuncio-- y si falla cualquiera después de
   * la primera, se borra la campaña y no queda nada. El admin lo describió
   * así: "a veces manda el anuncio pero no realiza el conjunto de anuncios, y
   * sin eso no hay nada".
   *
   * Un parpadeo de Meta en el paso 2 tiraba abajo el trabajo de los cuatro. El
   * reintento cuesta un par de segundos y evita perder la subida entera por
   * algo que se resuelve solo. No se reintenta lo que no mejora reintentando
   * (token inválido, copy rechazado, sin método de pago).
   */
  // ── Formularios de clientes potenciales (objetivo "formulario") ─────────
  //
  // Cada negocio usa SU página: el formulario se crea en ella, con SU política
  // de privacidad, y los leads vuelven al webhook que los asigna por página
  // (lib/facebook-leads.ts). Pedido del dueño (25-09-2026): es un SaaS y cada
  // empresa elige su objetivo.

  /** Permisos que faltan en la conexión del negocio para crear y leer formularios. */
  async permisosFaltantesParaFormularios(): Promise<string[]> {
    const necesarios = ["leads_retrieval", "pages_manage_ads", "pages_show_list", "ads_management"];
    try {
      const r = await this.fbGet("me/permissions", {}, this.config.userAccessToken);
      const otorgados = new Set((r?.data || []).filter((x: any) => x.status === "granted").map((x: any) => String(x.permission)));
      return necesarios.filter((n) => !otorgados.has(n));
    } catch {
      return necesarios;
    }
  }

  /** Token de la PÁGINA (los formularios se crean con él, no con el de usuario). */
  private async tokenDePagina(): Promise<string> {
    try {
      const r = await this.fbGet(String(this.config.pageId), { fields: "access_token" }, this.config.userAccessToken);
      if (r?.access_token) return String(r.access_token);
    } catch { /* se usa el guardado */ }
    return this.config.accessToken;
  }

  /**
   * El formulario del producto en la página del negocio: reusa uno ACTIVO con
   * el mismo nombre o crea uno (nombre, teléfono, ciudad). Suscribe la página
   * al aviso de leads para que lleguen al webhook.
   */
  async formularioDelProducto(producto: { id: number; name: string }, opts: { privacidadUrl: string; gracias?: string }): Promise<string> {
    if (!this.config.pageId) throw new Error("El negocio no tiene página de Facebook conectada: sin página no hay formulario.");
    const token = await this.tokenDePagina();
    const nombre = `VentasPro · ${producto.name}`.slice(0, 95);
    try {
      const existentes = await this.fbGet(`${this.config.pageId}/leadgen_forms`, { fields: "id,name,status", limit: "100" }, token);
      const ya = (existentes?.data || []).find((f: any) => f.name === nombre && String(f.status || "").toUpperCase() === "ACTIVE");
      if (ya?.id) {
        await this.suscribirPaginaALeads(token);
        return String(ya.id);
      }
    } catch { /* si no se puede listar, se intenta crear */ }
    const creado = await this.fbPost(`${this.config.pageId}/leadgen_forms`, {
      name: nombre,
      locale: "es_LA",
      questions: [{ type: "FULL_NAME" }, { type: "PHONE" }, { type: "CITY" }],
      privacy_policy: { url: opts.privacidadUrl, link_text: "Política de privacidad" },
      thank_you_page: { title: "¡Gracias!", body: opts.gracias || "Te escribimos por WhatsApp en unos minutos.", button_type: "NONE" },
    }, "formulario de clientes potenciales", token);
    await this.suscribirPaginaALeads(token);
    return String(creado.id);
  }

  /** Sin esta suscripción Meta no avisa los leads al webhook. */
  private async suscribirPaginaALeads(tokenDePagina: string): Promise<void> {
    try {
      // La lista COMPLETA, no solo "leadgen": este POST reemplaza los campos
      // suscritos, y con ["leadgen"] crear un formulario apagaba los mensajes
      // y los comentarios de la página (ver meta-campos-webhook.ts).
      await this.fbPost(`${this.config.pageId}/subscribed_apps`, { subscribed_fields: [...CAMPOS_WEBHOOK_PAGINA] }, "suscripción a leads", tokenDePagina);
    } catch (e: any) {
      logger.warn({ err: e?.message, pageId: this.config.pageId }, "[Facebook] No se pudo suscribir la página a leadgen: los leads no llegarán solos al webhook");
    }
  }

  private async fbPost(endpoint: string, body: Record<string, any>, step?: string, token?: string): Promise<any> {
    const ESPERAS_MS = [1200, 3000];
    for (let intento = 0; ; intento++) {
      try {
        return await this.fbPostUnaVez(endpoint, body, step, token);
      } catch (err: any) {
        const quedan = intento < ESPERAS_MS.length;
        if (!quedan || !this.esErrorTransitorio(err?.fbError ?? err)) throw err;
        logger.warn(
          { endpoint, step, intento: intento + 1, motivo: err?.message },
          "[Facebook] Error transitorio de Graph API -- se reintenta",
        );
        await new Promise((r) => setTimeout(r, ESPERAS_MS[intento]));
      }
    }
  }

  private async fbPostUnaVez(endpoint: string, body: Record<string, any>, step?: string, token?: string): Promise<any> {
    const url = `${FB_GRAPH_URL}/${endpoint}`;
    const params = new URLSearchParams({ access_token: token || this.config.accessToken });
    const res = await fetch(`${url}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data: any = await res.json();
    if (data.error) {
      const prefix = step ? `[${step}] ` : "";
      // error_user_msg / blame_field_specs son el detalle real y accionable
      // que da Graph API ("Invalid parameter" código 100 es genérico y no
      // dice cuál). logger.error para verlo en logs aunque no quepa en el
      // mensaje corto que llega al cliente.
      logger.error({ fbError: data.error, endpoint }, "[Facebook] Graph API error detallado");
      const detail = data.error.error_user_msg
        ? ` -- ${data.error.error_user_msg}`
        : data.error.error_data?.blame_field_specs
        ? ` -- campo(s): ${JSON.stringify(data.error.error_data.blame_field_specs)}`
        : "";
      // Si es uno de los fallos que el admin PUEDE arreglar (conexión
      // vencida, permisos, cuenta restringida), se dice en castellano y con
      // el paso a seguir. El texto de Graph queda igual detrás, para el log.
      const diag = diagnosticoDeErrorDeMeta(data.error);
      const e: any = new Error(
        diag
          ? `${prefix}${diag.motivo} (Meta: ${data.error.message}, código ${data.error.code})`
          : `${prefix}${data.error.message}${detail} (código ${data.error.code}${data.error.error_subcode ? `, subcódigo ${data.error.error_subcode}` : ""})`,
      );
      // El error de Graph viaja pegado al Error para que `fbPost` pueda
      // decidir si reintenta. Sin esto habría que adivinar por el texto del
      // mensaje, que cambia de idioma y de redacción según el endpoint.
      e.fbError = data.error;
      throw e;
    }
    return data;
  }

  private async fbGet(endpoint: string, query: Record<string, string> = {}, token?: string): Promise<any> {
    const params = new URLSearchParams({ access_token: token || this.config.accessToken, ...query });
    const res = await fetch(`${FB_GRAPH_URL}/${endpoint}?${params}`, { signal: AbortSignal.timeout(15000) });
    const data: any = await res.json();
    if (data.error) throw new Error(`${data.error.message} (código ${data.error.code})`);
    return data;
  }

  /**
   * Borra una campaña de la cuenta real. Meta borra en CASCADA: se lleva sus
   * conjuntos y anuncios. Es irreversible.
   *
   * Nace de una limpieza que el admin tuvo que hacer a mano (2026-08-19):
   * quedaron dos campañas huérfanas sin conjunto y no había ninguna forma de
   * borrarlas desde la app -- había que ir a Ads Manager. El rollback
   * automático ya evita que se generen nuevas, pero esto permite limpiar las
   * que ya están y cualquier campaña que el admin quiera sacar.
   *
   * Devuelve los datos que leyó ANTES de borrar, para que el resumen le pueda
   * decir al admin QUÉ desapareció y no solo "ok".
   */
  async borrarCampana(campaignId: string, opts: { permitirConGasto?: boolean } = {}): Promise<{
    ok: boolean;
    message: string;
    nombre?: string;
    estado?: string;
    gasto?: number;
  }> {
    const token = this.config.userAccessToken || this.config.accessToken;
    let nombre: string | undefined;
    let estado: string | undefined;
    let gasto = 0;
    try {
      // Leer primero: si el id no existe, se avisa sin haber intentado nada.
      const info = await this.fbGet(campaignId, { fields: "name,status,effective_status" }, token);
      nombre = info?.name;
      estado = info?.effective_status || info?.status;
      try {
        const ins = await this.fbGet(`${campaignId}/insights`, { fields: "spend", date_preset: "maximum" }, token);
        gasto = Number(ins?.data?.[0]?.spend || 0) || 0;
      } catch {
        // Sin insights (campaña que nunca corrió) el gasto es 0 y no es un error.
      }
    } catch (e: any) {
      return { ok: false, message: `No encontré la campaña ${campaignId} en la cuenta: ${e?.message || e}` };
    }

    // El freno por gasto va ACÁ, entre leer y borrar -- no después, que sería
    // avisar de algo que ya no tiene arreglo. Una campaña que gastó lleva
    // pegado su historial de resultados, y ese historial es lo único que
    // permite comparar qué funcionó: se pierde con ella.
    if (gasto > 0 && !opts.permitirConGasto) {
      return {
        ok: false,
        message:
          `La campaña ${nombre ? `"${nombre}"` : campaignId} gastó $${gasto.toLocaleString("es-CO")} alguna vez. `
          + `Borrarla elimina también su historial de resultados, que es lo único con lo que se puede comparar qué funcionó. `
          + `Si el admin igual la quiere borrar sabiendo eso, volvé a proponerlo con "borrarAunqueTengaGasto": true. `
          + `Si solo quiere que deje de gastar, lo correcto es pausarla (fb_pause_campaign), no borrarla.`,
        nombre,
        estado,
        gasto,
      };
    }

    try {
      const params = new URLSearchParams({ access_token: token });
      const res = await fetch(`${FB_GRAPH_URL}/${campaignId}?${params}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(15000),
      });
      const data: any = await res.json().catch(() => ({}));
      if (data?.error) {
        return { ok: false, message: `Meta rechazó el borrado: ${data.error.message} (código ${data.error.code})`, nombre, estado, gasto };
      }
    } catch (e: any) {
      return { ok: false, message: `No hubo respuesta de Meta al borrar: ${e?.message || e}`, nombre, estado, gasto };
    }

    // Verificar contra Meta, no confiar en el 200. Mismo criterio que el
    // resto del archivo: el objetivo es que la campaña NO esté, no que la
    // llamada haya devuelto ok.
    try {
      const quedo = await this.fbGet(campaignId, { fields: "id,status" }, token);
      if (quedo?.id && quedo?.status !== "DELETED") {
        return { ok: false, message: `Meta aceptó el borrado pero la campaña sigue apareciendo (estado ${quedo.status}). Revisala en Ads Manager.`, nombre, estado, gasto };
      }
    } catch {
      // Que ya no se pueda leer es la confirmación esperada de que se borró.
    }

    return { ok: true, message: "Campaña borrada", nombre, estado, gasto };
  }

  /** Best-effort: no tira si falla (se usa para limpiar objetos huérfanos
   * después de un error, nunca debe tapar el error original que causó la
   * limpieza). */
  private async fbDeleteBestEffort(endpoint: string): Promise<void> {
    try {
      const params = new URLSearchParams({ access_token: this.config.accessToken });
      await fetch(`${FB_GRAPH_URL}/${endpoint}?${params}`, { method: "DELETE", signal: AbortSignal.timeout(15000) });
    } catch (e: any) {
      logger.warn({ endpoint, err: e?.message }, "[Facebook] No se pudo limpiar un objeto huérfano");
    }
  }

  /** Un pixelId guardado puede pertenecer a una cuenta publicitaria distinta
   * a la configurada (adAccountId) -- pasa cuando se cambia de cuenta sin
   * actualizar el pixel. Graph API recién avisa "Píxel no asociado" al
   * crear el anuncio final, después de gastar las llamadas de campaña y
   * conjunto. Se pregunta antes para evitar el error 100 tardío. */
  /**
   * Diagnóstico del píxel: qué píxeles tiene DE VERDAD la cuenta publicitaria
   * y si el configurado es uno de ellos.
   *
   * Nace de un caso real (2026-08-19): el tenant tenía configurado el píxel
   * `1193902929595904` y una cuenta `act_1041451215504206` a la que ese píxel
   * NO pertenece. Consecuencia silenciosa: al crear anuncios, el código cae a
   * `LINK_CLICKS` y las campañas optimizan por CLICS en vez de por COMPRAS.
   * Nadie se entera -- los anuncios corren, gastan, y traen tráfico que no
   * compra.
   *
   * Le pasa a cualquier tenant que cambie de cuenta publicitaria sin actualizar
   * el píxel, así que el sistema tiene que poder detectarlo solo.
   */
  async diagnosticarPixel(): Promise<{
    ok: boolean;
    configurado: string;
    pertenece: boolean;
    disponibles: Array<{ id: string; name?: string }>;
    mensaje: string;
  }> {
    const adAccount = `act_${String(this.config.adAccountId || "").replace(/^act_/, "")}`;
    const configurado = String(this.config.pixelId || "");
    try {
      const res = await this.fbGet(`${adAccount}/adspixels`, { fields: "id,name" }, this.config.userAccessToken);
      const disponibles: Array<{ id: string; name?: string }> = (res.data || []).map((p: any) => ({ id: String(p.id), name: p.name }));
      const pertenece = !!configurado && disponibles.some((p) => p.id === configurado);

      let mensaje: string;
      if (!configurado && disponibles.length === 0) {
        mensaje = `Esta cuenta publicitaria (${adAccount}) NO tiene ningún píxel, y tampoco hay uno configurado. Sin píxel las campañas solo pueden optimizar por clics, no por compras. Hay que crear uno.`;
      } else if (!configurado) {
        mensaje = `No hay píxel configurado en la app, pero la cuenta SÍ tiene ${disponibles.length}: ${disponibles.map((p) => `${p.id}${p.name ? ` (${p.name})` : ""}`).join(", ")}. Elegí uno y guardalo para optimizar por compras.`;
      } else if (pertenece) {
        mensaje = `El píxel ${configurado} pertenece a ${adAccount}: la optimización por compras puede funcionar.`;
      } else if (disponibles.length > 0) {
        mensaje = `⚠️ El píxel configurado (${configurado}) NO pertenece a ${adAccount}. Por eso las campañas optimizan por CLICS y no por COMPRAS. La cuenta sí tiene estos: ${disponibles.map((p) => `${p.id}${p.name ? ` (${p.name})` : ""}`).join(", ")}. Cambiá el píxel por uno de esos.`;
      } else {
        mensaje = `⚠️ El píxel configurado (${configurado}) NO pertenece a ${adAccount}, y esa cuenta no tiene NINGÚN píxel propio. Hay que crear uno en esta cuenta para poder optimizar por compras.`;
      }
      return { ok: true, configurado, pertenece, disponibles, mensaje };
    } catch (e: any) {
      return { ok: false, configurado, pertenece: false, disponibles: [], mensaje: `No se pudo consultar los píxeles de ${adAccount}: ${e?.message || e}` };
    }
  }

  /** Crea un píxel NUEVO en la cuenta publicitaria y devuelve su id. Es un
   * objeto real y permanente en la cuenta de Meta del negocio. */
  async crearPixel(nombre: string): Promise<{ ok: boolean; pixelId?: string; message: string }> {
    const adAccount = `act_${String(this.config.adAccountId || "").replace(/^act_/, "")}`;
    try {
      const r = await this.fbPost(`${adAccount}/adspixels`, { name: nombre }, "píxel", this.config.userAccessToken);
      if (!r?.id) return { ok: false, message: "Meta no devolvió el id del píxel creado." };
      // Verificar contra Meta que quedó en la cuenta, no confiar en el 200.
      const quedo = await this.pixelBelongsToAccount(adAccount, String(r.id));
      return {
        ok: true,
        pixelId: String(r.id),
        message: quedo
          ? `Píxel ${r.id} creado y verificado en ${adAccount}.`
          : `Píxel ${r.id} creado, pero todavía no aparece listado en ${adAccount} (Meta puede tardar unos segundos).`,
      };
    } catch (e: any) {
      return { ok: false, message: `No se pudo crear el píxel en ${adAccount}: ${e?.message || e}` };
    }
  }

  /**
   * El píxel que de verdad sirve en ESTA cuenta (o null). Si el guardado no
   * es de la cuenta pero la cuenta tiene uno solo, se usa ese (ver elegirPixel).
   */
  async pixelUsable(adAccount: string): Promise<string | null> {
    let deLaCuenta: string[] = [];
    try {
      const res = await this.fbGet(`${adAccount}/adspixels`, { fields: "id" }, this.config.userAccessToken);
      deLaCuenta = (res.data || []).map((p: any) => String(p.id));
    } catch (err: any) {
      logger.warn({ err: err?.message }, "[Facebook] No se pudo listar los píxeles de la cuenta");
      return null;
    }
    const r = elegirPixel(String(this.config.pixelId || ""), deLaCuenta);
    if (r.corregido && r.pixelId) {
      logger.warn({ guardado: this.config.pixelId, deLaCuenta: r.pixelId }, "[Facebook] El píxel guardado no es de esta cuenta: se usa el único que la cuenta tiene");
      this.config.pixelId = r.pixelId;
    }
    return r.pixelId;
  }

  private async pixelBelongsToAccount(adAccount: string, pixelId: string): Promise<boolean> {
    try {
      const res = await this.fbGet(`${adAccount}/adspixels`, { fields: "id" }, this.config.userAccessToken);
      const ids: string[] = (res.data || []).map((p: any) => p.id);
      return ids.includes(pixelId);
    } catch (err: any) {
      logger.warn({ err }, "[Facebook] No se pudo verificar el pixel de la cuenta, se asume que no aplica");
      return false;
    }
  }

  // ── Sincronizar catálogo ───────────────────────────────────────────────────

  async syncCatalog(): Promise<{ synced: number; failed: number; errors: string[] }> {
    const result = { synced: 0, failed: 0, errors: [] as string[] };
    if (!this.config.catalogId) return result;

    const activeProducts = await db.select().from(products).where(eq(products.isActive, true));

    for (const p of activeProducts) {
      try {
        const existing = await this.findInCatalog(p.id);
        // Mismos dos bugs que en createAdForProduct: p.image_url no existe
        // (la columna es imageUrl) y /productos/:id no es una ruta real --
        // ambos dejaban el catálogo con productos sin imagen y con un link
        // roto en cada anuncio dinámico/shopping generado desde él.
        const absoluteImage = absoluteImageUrl(p.imageUrl);
        const data = {
          title: p.name,
          description: (p.description || "").substring(0, 5000),
          price: `${Number(p.price).toFixed(0)}_COP`,
          currency: "COP",
          image_url: absoluteImage || "",
          product_type: p.category || "Digital",
          sku: `PROD-${p.id}`,
          url: `${process.env.APP_URL || ""}/p/${p.id}`,
        };
        if (existing) {
          await this.fbPost(existing.id, data, "catálogo: actualizar producto", this.config.userAccessToken);
        } else {
          await this.fbPost(`${this.config.catalogId}/products`, data, "catálogo: crear producto", this.config.userAccessToken);
        }
        result.synced++;
      } catch (err: any) {
        result.failed++;
        result.errors.push(`${p.name}: ${err.message}`);
      }
    }
    return result;
  }

  private async findInCatalog(productId: number): Promise<{ id: string } | null> {
    try {
      const data = await this.fbGet(`${this.config.catalogId}/products`, {
        fields: "id,sku",
        filtering: JSON.stringify([{ field: "sku", value: `PROD-${productId}` }]),
      }, this.config.userAccessToken);
      return data.data?.[0] || null;
    } catch (_) {
      return null;
    }
  }

  // ── Publicar post orgánico en el muro de la página ──────────────────────────

  async publishPost(message: string, imageUrl?: string, link?: string): Promise<{ postId: string; url: string } | null> {
    if (!this.config.accessToken || !this.config.pageId) {
      logger.warn("[Facebook] No hay token o pageId configurado para publicar post");
      return null;
    }

    try {
      // Con imagen: /feed + image_url NO adjunta la foto -- probado en vivo
      // contra la página real. Cuando el post lleva `link`, Facebook arma la
      // card de previsualización rascando los meta OG de esa URL e ignora
      // `image_url` por completo; sin `link`, /feed tampoco tiene forma de
      // mostrar una imagen salvo subiéndola. El endpoint correcto para que la
      // foto quede realmente asociada al texto es /{page-id}/photos con
      // `url` + `caption` (confirmado: el post resultante trae full_picture y
      // el attachment de tipo "photo"). Ese endpoint no tiene un campo de link
      // aparte, así que el link -- si hay uno -- se agrega como texto plano al
      // final del caption; Facebook lo detecta y lo muestra clickeable.
      let result: any;
      if (imageUrl) {
        const caption = link ? `${message}\n\n${link}` : message;
        result = await this.fbPost(`${this.config.pageId}/photos`, { url: imageUrl, caption });
      } else {
        const body: Record<string, any> = { message };
        if (link) body.link = link;
        result = await this.fbPost(`${this.config.pageId}/feed`, body);
      }

      // /photos devuelve {id, post_id}: el id de la publicación real en el
      // muro es post_id, no id (que es el id de la foto suelta).
      const postId = result?.post_id || result?.id;
      if (!postId) {
        logger.error({ result }, "[Facebook] Error publicando post: respuesta sin ID");
        return null;
      }

      const postUrl = `https://www.facebook.com/${postId.replace("_", "/posts/")}`;

      logger.info({ postId, postUrl }, "[Facebook] Post publicado exitosamente en el muro de la página");

      return { postId, url: postUrl };
    } catch (err: any) {
      logger.error({ err, message: message.substring(0, 100) }, "[Facebook] Error publicando post orgánico");
      return null;
    }
  }
}

export const facebookService = new FacebookService();

/**
 * El nombre del conjunto de la plantilla, sin lo que heredó de la campaña
 * vieja: fechas y restos del nombre anterior ("24/9/2026 - Conjunto" daba
 * "Corrector - 24/9/2026 - 24/9/2026 - Conjunto").
 */
export function nombreDeConjunto(nombre?: string | null): string {
  const limpio = String(nombre || "")
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, " ")
    .split(/\s+-(?:\s+-)*\s+|^\s*-\s*|\s*-\s*$/)
    .map((p) => p.trim())
    .filter(Boolean)
    .pop();
  return limpio || "Conjunto";
}
