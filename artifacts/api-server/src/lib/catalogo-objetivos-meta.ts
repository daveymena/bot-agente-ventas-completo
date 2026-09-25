/**
 * CATÁLOGO COMPLETO DE OBJETIVOS DE CAMPAÑA DE META
 *
 * Pedido del dueño (25-09-2026): "existen muchos objetivos de campaña; Atlas y
 * el sistema deben saber a cuál acudir, para qué es cada uno y con qué frases
 * se pide -- no solo WhatsApp o la web".
 *
 * Meta tiene 6 objetivos (ODAX): Reconocimiento, Tráfico, Interacción,
 * Clientes potenciales, Promoción de apps y Ventas. Cada uno admite ciertos
 * DESTINOS (web, WhatsApp, Messenger, Instagram Direct, llamada, formulario en
 * el anuncio, la publicación, la página) y ciertas OPTIMIZACIONES. Mezclarlos
 * da #1815159 "el contenido y el objetivo no coinciden" (ver
 * optimizacionCompatible en facebook.ts).
 *
 * `creable: true`  = este sistema ya lo arma de punta a punta (objetivos-campana.ts).
 * `creable: false` = Atlas lo reconoce y lo explica, pero NO lo crea todavía:
 *                    dice qué falta en vez de desviarlo en silencio a la web o
 *                    a WhatsApp.
 */
import type { ObjetivoCampana } from "./objetivos-campana";

export interface ObjetivoDelCatalogo {
  clave: string;
  nombre: string;
  metaObjective: "OUTCOME_AWARENESS" | "OUTCOME_TRAFFIC" | "OUTCOME_ENGAGEMENT" | "OUTCOME_LEADS" | "OUTCOME_APP_PROMOTION" | "OUTCOME_SALES";
  optimizationGoal: string;
  destinationType: string | null;
  paraQue: string;
  cuandoUsar: string;
  /** Frases con que lo pide el admin (sobre el texto en minúsculas). */
  patron: RegExp;
  creable: boolean;
  /** Si no es creable: qué falta para poder armarlo. */
  falta?: string;
  /** Si es creable: la clave de OBJETIVOS que lo arma. */
  arma?: ObjetivoCampana;
}

export const CATALOGO_DE_OBJETIVOS: ObjetivoDelCatalogo[] = [
  {
    clave: "reconocimiento", nombre: "Reconocimiento (alcance)", metaObjective: "OUTCOME_AWARENESS", optimizationGoal: "REACH", destinationType: null,
    paraQue: "Que la mayor cantidad de gente vea el anuncio. No busca clics ni ventas.",
    cuandoUsar: "Marca nueva, lanzamiento, 'que me conozcan'. Casi nunca es lo que conviene a un negocio chico que necesita vender ya.",
    patron: /reconocimiento|alcance|awareness|que me conozcan|dar(me)? a conocer|visibilidad/, creable: true, arma: "reconocimiento",
  },
  {
    clave: "trafico_web", nombre: "Tráfico a la web / landing", metaObjective: "OUTCOME_TRAFFIC", optimizationGoal: "LANDING_PAGE_VIEWS", destinationType: null,
    paraQue: "Llevar gente a la landing o a la tienda. Meta busca a quien hace clic y espera que cargue la página.",
    cuandoUsar: "'A la landing', 'que visiten la página', 'tráfico'. Llena la landing y el remarketing; no espera compradores.",
    patron: /landing|land\w{0,3}\s?pa[gj]|tr[aá]fico|visitas?\b|clics?\b|p[aá]gina web|a la web|a la tienda/, creable: true, arma: "trafico",
  },
  {
    clave: "ventas_web", nombre: "Ventas en la web", metaObjective: "OUTCOME_SALES", optimizationGoal: "OFFSITE_CONVERSIONS", destinationType: null,
    paraQue: "Que compren en la web. Meta busca compradores con el píxel (sin píxel optimiza clics).",
    cuandoUsar: "'Que compren', 'campaña de ventas', 'conversiones'. Necesita píxel instalado para optimizar de verdad.",
    patron: /venta|vender|conversi[oó]n|\bsales\b/, creable: true, arma: "ventas",
  },
  {
    clave: "mensajes_whatsapp", nombre: "Mensajes a WhatsApp", metaObjective: "OUTCOME_ENGAGEMENT", optimizationGoal: "CONVERSATIONS", destinationType: "WHATSAPP",
    paraQue: "Que escriban por WhatsApp; el anuncio abre el chat con el mensaje escrito.",
    cuandoUsar: "'Que me escriban', 'a WhatsApp', 'mensajes'. El que más sirve cuando la venta se cierra conversando.",
    patron: /whats?app|\bwpp\b|\bwsp\b|que me escriban|mensajes?\b/, creable: true, arma: "mensajes",
  },
  {
    clave: "mensajes_messenger", nombre: "Mensajes a Messenger", metaObjective: "OUTCOME_ENGAGEMENT", optimizationGoal: "CONVERSATIONS", destinationType: "MESSENGER",
    paraQue: "Que escriban por Messenger de la página de Facebook.",
    cuandoUsar: "'Por Messenger', 'al inbox de Facebook'.",
    patron: /messenger|inbox de facebook|chat de facebook/, creable: false,
    falta: "El creativo de clic-a-Messenger no está armado ni probado en la cuenta. Mientras tanto se puede usar mensajes a WhatsApp.",
  },
  {
    clave: "mensajes_instagram", nombre: "Mensajes a Instagram Direct", metaObjective: "OUTCOME_ENGAGEMENT", optimizationGoal: "CONVERSATIONS", destinationType: "INSTAGRAM_DIRECT",
    paraQue: "Que escriban por el DM de Instagram.",
    cuandoUsar: "'Al DM', 'Instagram Direct', 'que me escriban por Instagram'.",
    patron: /instagram direct|\bdm\b|directo de instagram|mensajes? (de|por|al) instagram|escriban por instagram/, creable: false,
    falta: "El creativo de clic-a-Instagram Direct no está armado ni probado. Mientras tanto se puede usar mensajes a WhatsApp.",
  },
  {
    clave: "interaccion_publicacion", nombre: "Interacción con una publicación", metaObjective: "OUTCOME_ENGAGEMENT", optimizationGoal: "POST_ENGAGEMENT", destinationType: "ON_POST",
    paraQue: "Más reacciones, comentarios y compartidos de una publicación existente.",
    cuandoUsar: "'Promocionar esta publicación', 'que comenten', 'más likes al post'.",
    patron: /interacci[oó]n|engagement|que comenten|comentarios|reacciones|(promocionar|impulsar|pautar) (la|esta|una) publicaci[oó]n/, creable: false,
    falta: "Hace falta el id de la publicación a promocionar; hoy los anuncios se arman desde un producto.",
  },
  {
    clave: "me_gusta_pagina", nombre: "Seguidores de la página", metaObjective: "OUTCOME_ENGAGEMENT", optimizationGoal: "PAGE_LIKES", destinationType: "ON_PAGE",
    paraQue: "Sumar seguidores a la página de Facebook.",
    cuandoUsar: "'Más seguidores', 'que den like a la página'.",
    patron: /seguidores|(me gusta|likes?) (de|a|en) la p[aá]gina|que (me )?sigan/, creable: false,
    falta: "El creativo de 'Me gusta la página' no está armado ni probado.",
  },
  {
    clave: "reproducciones_video", nombre: "Reproducciones de video", metaObjective: "OUTCOME_ENGAGEMENT", optimizationGoal: "THRUPLAY", destinationType: "ON_VIDEO",
    paraQue: "Que vean el video completo (ThruPlay).",
    cuandoUsar: "'Que vean el video', 'reproducciones', 'visualizaciones del reel'.",
    patron: /reproducci[oó]n|que vean el video|thruplay|visualizaciones?/, creable: false,
    falta: "Hace falta subir el video del anuncio a Meta; hoy los anuncios salen con imagen.",
  },
  {
    clave: "clientes_potenciales_formulario", nombre: "Clientes potenciales (formulario en Meta)", metaObjective: "OUTCOME_LEADS", optimizationGoal: "LEAD_GENERATION", destinationType: "ON_AD",
    paraQue: "Juntar datos (nombre, teléfono) con un formulario que se abre dentro de Facebook/Instagram, sin salir de la app.",
    cuandoUsar: "'Formulario', 'captar datos', 'leads', 'registros'. Útil para servicios y cotizaciones.",
    patron: /formulario|clientes potenciales|captar datos|\bleads?\b|registros? de (clientes|interesados)|base de datos de clientes/, creable: false,
    falta: "Hace falta crear el formulario instantáneo en la página y conectar la descarga de los leads al CRM.",
  },
  {
    clave: "llamadas", nombre: "Llamadas", metaObjective: "OUTCOME_LEADS", optimizationGoal: "QUALITY_CALL", destinationType: "PHONE_CALL",
    paraQue: "Que llamen por teléfono al negocio desde el anuncio.",
    cuandoUsar: "'Que me llamen', 'llamadas'.",
    patron: /\bllamadas\b|que me llamen|llamar al (negocio|n[uú]mero)|bot[oó]n de llamar/, creable: false,
    falta: "El creativo con botón 'Llamar' no está armado ni probado, y hace falta el número de atención.",
  },
  {
    clave: "promocion_app", nombre: "Promoción de app", metaObjective: "OUTCOME_APP_PROMOTION", optimizationGoal: "APP_INSTALLS", destinationType: null,
    paraQue: "Instalaciones de una app móvil.",
    cuandoUsar: "Solo si el negocio tiene una app publicada en las tiendas.",
    patron: /instal(ar|aciones) (la|mi) app|descargas? de (la|mi) app|promoci[oó]n de (la |mi )?app/, creable: false,
    falta: "El negocio no tiene una app registrada en Meta.",
  },
];

/**
 * El objetivo del catálogo que nombra el texto del admin, o null. Los que
 * todavía NO se crean se miran primero: si pidió un formulario, no se le
 * puede contestar con una campaña de ventas a la web.
 */
export function objetivoDelCatalogo(texto: string): ObjetivoDelCatalogo | null {
  const t = String(texto || "").toLowerCase();
  const orden = [...CATALOGO_DE_OBJETIVOS.filter((o) => !o.creable), ...CATALOGO_DE_OBJETIVOS.filter((o) => o.creable)];
  return orden.find((o) => o.patron.test(t)) ?? null;
}

/** Para Atlas: todos los objetivos, para qué es cada uno y si ya se crea. */
export function explicarObjetivos(): string {
  return CATALOGO_DE_OBJETIVOS.map(
    (o) =>
      `• ${o.nombre} (${o.metaObjective}${o.destinationType ? ` → ${o.destinationType}` : ""}): ${o.paraQue} Cuándo: ${o.cuandoUsar} ` +
      (o.creable ? "✅ Se crea." : `⏳ Todavía no se crea: ${o.falta}`),
  ).join("\n");
}

/** ¿El texto nombra algún objetivo que este sistema SÍ arma? */
export function nombraObjetivoCreable(texto: string): boolean {
  const t = String(texto || "").toLowerCase();
  return CATALOGO_DE_OBJETIVOS.some((o) => o.creable && o.patron.test(t));
}
