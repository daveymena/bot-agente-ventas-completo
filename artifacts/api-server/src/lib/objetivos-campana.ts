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

/** Acepta como lo diga el admin y devuelve el objetivo, o null si no lo dijo. */
export function interpretarObjetivo(texto: string): ObjetivoCampana | null {
  const t = String(texto || "").toLowerCase();
  if (/whatsapp|mensaje|escrib|convers|chat|dm|direct/.test(t)) return "mensajes";
  if (/tr[aá]fico|visita|clic|traffic|web/.test(t)) return "trafico";
  if (/reconocimiento|alcance|awareness|que me conozcan|marca/.test(t)) return "reconocimiento";
  if (/venta|vender|compra|conversion|sales/.test(t)) return "ventas";
  return null;
}
