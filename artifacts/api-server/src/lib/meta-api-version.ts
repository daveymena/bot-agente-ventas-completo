/**
 * LA versión de la Graph API de Meta. Una sola, para todo el proyecto.
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────
 *
 * `https://graph.facebook.com/v21.0` estaba escrito a mano en DOCE lugares:
 * facebook.ts, ad-strategist.ts, facebook-marketplace.ts, facebook-comments.ts,
 * facebook-messenger.ts, facebook-page-posts.ts, meta-conversions-api.ts,
 * tenant-facebook-credentials.ts (dos veces), routes/facebook.ts (dos veces) y
 * routes/public.ts.
 *
 * Doce literales duplicados no es un problema de estilo: convierte cada subida
 * de versión en una cacería, y basta que uno quede atrás para tener la mitad
 * de la integración hablando una versión y la otra mitad otra -- sin ningún
 * error visible hasta que Meta apaga la vieja.
 *
 * ── Por qué v23.0 y no la última ─────────────────────────────────────────
 *
 * Auditado el 2026-08-29 contra el changelog oficial, cambio por cambio,
 * contrastado con lo que este código manda de verdad:
 *
 *   v22  instagram_actor_id deprecado          no lo usamos
 *        paquete STANDARD_ENHANCEMENTS quitado  usamos las mejoras sueltas
 *                                               (text_optimizations, enhance_cta)
 *        exclusions con públicos -> excluded_    no usamos exclusiones
 *   v23  conjuntos entran a Advantage+ por      YA lo dejamos explícito
 *        defecto                                (ver usarAdvantagePlus)
 *        smart_promotion_type quitado (v25)     no lo usamos
 *
 * Ninguno rompe nada nuestro. v23.0 expira el 8 de octubre de 2027: dieciocho
 * meses más de aire que v21.0, que se apaga el 21 de enero de 2027.
 *
 * ⚠️ Antes de subir a v24, v25 o v26 hay que resolver una cosa que v26 trae y
 * que nos toca de verdad: los creativos pasan a `destination_spec.
 * destination_type = WEBSITE_AND_SHOP` por defecto cuando la cuenta tiene
 * tienda. En una campaña de mensajes a WhatsApp eso desvía el destino sin
 * avisar, y habría que declarar `WEBSITE_AND_SHOP_OPT_OUT` explícitamente.
 * Subir a v26 hoy agregaría ese trabajo sin darnos nada que usemos.
 *
 * ── Por qué sale del entorno ─────────────────────────────────────────────
 *
 * Para poder cambiarla sin desplegar, y sobre todo para poder VOLVER ATRÁS en
 * segundos si la versión nueva se comporta distinto contra la cuenta real. El
 * changelog dice qué campos cambian; no dice cómo reacciona una cuenta
 * concreta.
 */
export const META_API_VERSION = process.env.META_API_VERSION || "v23.0";

/** Base de la Graph API. Usar SIEMPRE esto en vez de escribir la URL. */
export const FB_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

/** Base para subir video, que vive en otro host pero comparte versión. */
export const FB_GRAPH_VIDEO_BASE = `https://graph-video.facebook.com/${META_API_VERSION}`;
