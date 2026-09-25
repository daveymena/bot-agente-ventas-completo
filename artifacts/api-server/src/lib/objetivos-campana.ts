/**
 * Los tipos de campaña que Meta ofrece y que este sistema sabe armar.
 *
 * Hasta ahora TODA campaña se creaba igual: `objective: "OUTCOME_SALES"` con
 * el anuncio apuntando a la página web del producto. Pedirle "una campaña de
 * tráfico" daba exactamente lo mismo que pedirle una de ventas, y una de
 * mensajes también -- el admin lo reportó: "todo lo lanza a la web y eso está
 * mal".
 *
 * No es un detalle de nombre: el objetivo le dice a Meta A QUIÉN mostrar el
 * anuncio. Con OUTCOME_SALES busca gente que compra; con OUTCOME_TRAFFIC,
 * gente que hace clic; con OUTCOME_LEADS, gente que escribe. Elegir mal el
 * objetivo es pagarle a Meta para que busque al público equivocado.
 */
import { objetivoDelCatalogo, nombraObjetivoCreable } from "./catalogo-objetivos-meta";

export type ObjetivoCampana = "ventas" | "trafico" | "mensajes" | "reconocimiento";

export const OBJETIVOS: Record<ObjetivoCampana, {
  metaObjective: string;
  optimizationGoal: string;
  /** A dónde manda el anuncio. */
  destino: "web" | "whatsapp";
  descripcion: string;
}> = {
  // Vender: Meta busca compradores. Necesita píxel para optimizar de verdad;
  // sin píxel cae a clics (lo maneja quien arma el conjunto).
  ventas: {
    metaObjective: "OUTCOME_SALES",
    optimizationGoal: "OFFSITE_CONVERSIONS",
    destino: "web",
    descripcion: "Vender el producto. Manda a la página del producto y Meta busca gente que compra.",
  },
  // Tráfico: Meta busca gente que hace clic, no que compra. Mucho más barato
  // por clic y sirve para dar a conocer o llenar el remarketing, pero NO
  // esperar ventas de acá: el público es otro.
  trafico: {
    metaObjective: "OUTCOME_TRAFFIC",
    optimizationGoal: "LANDING_PAGE_VIEWS",
    destino: "web",
    descripcion: "Llevar visitas a la web. Más barato por clic, pero Meta busca gente que hace clic, no que compra.",
  },
  // Mensajes: el anuncio abre WhatsApp con el mensaje escrito. Es el que más
  // sirve cuando la venta se cierra conversando -- que es como vende este
  // sistema.
  mensajes: {
    metaObjective: "OUTCOME_ENGAGEMENT",
    optimizationGoal: "CONVERSATIONS",
    destino: "whatsapp",
    descripcion: "Que le escriban por WhatsApp. El anuncio abre el chat con el mensaje ya escrito.",
  },
  // Reconocimiento: que lo vea la mayor cantidad de gente posible. Casi nunca
  // es lo que quiere un negocio chico, pero existe y hay que poder pedirlo.
  reconocimiento: {
    metaObjective: "OUTCOME_AWARENESS",
    optimizationGoal: "REACH",
    destino: "web",
    descripcion: "Que lo vea la mayor cantidad de gente. No busca ni clics ni ventas.",
  },
};

/**
 * ¿Nombró la landing? Con las formas en que se escribe de verdad desde el
 * celular: el dueño escribe "landipage" (24-09-2026, varias veces) y el
 * patrón viejo solo aceptaba "landing" exacto -- la landing nunca se leía.
 */
export const MENCIONA_LANDING = /landing|land\w{0,3}\s?pa[gj]|lan?d[ií]n\w?\s?pa[gj]|p[aá]gina de (venta|aterrizaje|destino)|\/l\//;

/** Quita "no a WhatsApp", "sin whatsapp", "ni por WhatsApp": nombrarlo para negarlo no es pedirlo. */
function sinWhatsappNegado(t: string): string {
  return t.replace(/\b(no|sin|ni|nada de)\b[^.,;!?\n]{0,25}?(whats?app|wpp|wsp)/g, " ");
}

/**
 * Acepta como lo diga el admin y devuelve el objetivo, o null si no lo dijo.
 *
 * WhatsApp se miraba PRIMERO y ganaba siempre. "¿Una a whatsapp y otra a la
 * landipage?", "que no vaya a WhatsApp, a la landing": las dos salían como
 * campaña de mensajes. Ahora la landing se lee antes, un WhatsApp negado no
 * cuenta, y si nombra los dos no se decide por el admin (null): se usa lo que
 * pase el modelo o el valor por defecto, que va a la web.
 */
export function interpretarObjetivo(texto: string): ObjetivoCampana | null {
  const t = String(texto || "").toLowerCase();
  const u = sinWhatsappNegado(t);
  const landing = MENCIONA_LANDING.test(t);
  const whatsapp = /whats?app|wpp|wsp|mensaje|escrib|convers|chat|\bdm\b|direct/.test(u);
  if (landing && whatsapp) return null;
  if (landing) return /venta|vender|compra|conversion|sales/.test(t) ? "ventas" : "trafico";
  if (whatsapp) return "mensajes";
  if (/tr[aá]fico|visita|clic|traffic|web/.test(t)) return "trafico";
  if (/reconocimiento|alcance|awareness|que me conozcan|marca/.test(t)) return "reconocimiento";
  if (/venta|vender|compra|conversion|sales/.test(t)) return "ventas";
  return null;
}

/**
 * Lo que el admin pidió para el anuncio, en una sola cadena que entienden
 * `interpretarObjetivo` y `leerPreferenciaWeb` ("trafico landing",
 * "mensajes"...). Viaja como `objetivoDelAdmin` sin tocar la plomería.
 */
export function pedidoDelAdmin(texto: string): string | null {
  const t = String(texto || "").toLowerCase();
  // Un objetivo que el sistema todavía NO arma (formulario, llamadas,
  // Messenger…) no se convierte en otro: viaja marcado y las herramientas lo
  // rechazan explicando qué falta (ver catalogo-objetivos-meta.ts).
  // Solo si NO nombra además uno que sí se arma: "revisá los comentarios y
  // creá un anuncio a la landing" es un anuncio a la landing.
  const delCatalogo = objetivoDelCatalogo(t);
  if (delCatalogo && !delCatalogo.creable && !nombraObjetivoCreable(t)) return `no-creable:${delCatalogo.clave}`;
  const objetivo = interpretarObjetivo(t);
  const landing = MENCIONA_LANDING.test(t) && objetivo !== null;
  const partes = [objetivo, landing ? "landing" : null].filter(Boolean);
  return partes.length ? partes.join(" ") : null;
}

/** Si el admin pidió un objetivo que todavía no se arma, la explicación; si no, null. */
export async function rechazoPorObjetivoNoCreable(objetivoDelAdmin: string | null | undefined): Promise<string | null> {
  const m = String(objetivoDelAdmin || "").match(/^no-creable:(\w+)/);
  if (!m) return null;
  const { CATALOGO_DE_OBJETIVOS } = await import("./catalogo-objetivos-meta");
  const o = CATALOGO_DE_OBJETIVOS.find((x) => x.clave === m[1]);
  if (!o) return null;
  return (
    `El admin pidió una campaña de "${o.nombre}" (${o.paraQue}). Este sistema todavía NO la puede crear: ${o.falta} ` +
    `No crees otra campaña distinta en su lugar. Explicale esto y, si le sirve, ofrecé la alternativa que sí se crea.`
  );
}
