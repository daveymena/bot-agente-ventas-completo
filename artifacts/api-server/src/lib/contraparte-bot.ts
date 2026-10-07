/**
 * ¿Del otro lado hay un CHATBOT y no una persona?
 *
 * Caso real (producción, conversación 3, 07-10 22:35): el "cliente"
 * 573112000000 era el bot de menú de otra empresa. Mandaba cargas crudas
 * (`{block":"ca37f42d-…","i":0}"`), "No entendí lo que escribiste, puedes
 * seleccionar la opción… tocando el botón Menú principal" y "Voy a
 * comunicarte con uno de nuestros asesores". Nuestro vendedor le contestó
 * cuatro veces. Bot contra bot gasta IA, puede quedar en bucle y es el patrón
 * de mensajería automática que WhatsApp castiga.
 *
 * No decide sobre la VENTA (eso es del motor): clasifica el TRÁFICO. Pide dos
 * señales para no confundir a un cliente que pega un texto raro una vez.
 */

/** Carga técnica de un bot de menú (Botmaker, ManyChat, flujos de WhatsApp). */
const CARGA_CRUDA = /^\s*\{?\s*"?(block|payload|button_?id|node|flow_?id|list_reply)"?\s*:\s*"?[\w-]+|"\w+"\s*:\s*("[\w-]{6,}"|\d+)\s*[,}]/i;

/** Frases de menú automático, no de una persona. */
const FRASE_DE_MENU = new RegExp(
  [
    "no (te )?entend[ií]\\w* (lo que escribiste|tu (mensaje|respuesta)|tu solicitud)",
    "selecciona(r)? (la|una) opci[oó]n",
    "men[uú] principal",
    "opci[oó]n (no )?v[aá]lida",
    "(responde|escribe|digita|marca) (con )?el n[uú]mero",
    "este es un mensaje autom[aá]tico",
    "mensaje generado autom[aá]ticamente",
    "voy a comunicarte con (uno de )?nuestros asesores",
    "en breve un asesor (te|se) (atender[aá]|comunicar[aá])",
    "gracias por comunicarte con",
    "nuestro horario de atenci[oó]n es",
  ].join("|"),
  "i",
);

export interface Veredicto {
  bot: boolean;
  senales: number;
  motivo: string;
}

/** `textos`: los últimos mensajes del CLIENTE en la conversación (viejo → nuevo). */
export function pareceUnBot(textos: string[]): Veredicto {
  let cargas = 0;
  let frases = 0;
  for (const t of textos.slice(-10)) {
    const s = String(t || "");
    if (CARGA_CRUDA.test(s)) cargas++;
    else if (FRASE_DE_MENU.test(s)) frases++;
  }
  const senales = cargas + frases;
  // Dos señales cualquiera, o una carga cruda + algo más.
  const bot = senales >= 2;
  return {
    bot,
    senales,
    motivo: bot ? `${cargas} carga(s) técnica(s) de menú y ${frases} frase(s) de respuesta automática` : "",
  };
}
