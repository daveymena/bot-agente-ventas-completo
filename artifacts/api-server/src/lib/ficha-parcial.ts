/**
 * ============================================================
 * QUÉ PEDAZO DE LA FICHA CORRESPONDE MANDAR
 * ============================================================
 *
 * La ficha salía SIEMPRE entera: título, resumen, ocho viñetas de contenido,
 * cuatro de modalidad, precio, y los tres medios de pago. Preguntaras lo que
 * preguntaras.
 *
 * El admin lo dijo con estas palabras el 2026-08-26, después de perder 12
 * clientes: "es muy harto que responda siempre con la vendida tarjeta". Y
 * tiene razón comercialmente, no solo estéticamente:
 *
 *   · Volcarlo todo mata la conversación. Al cliente no le queda nada que
 *     preguntar, y una conversación que se termina no se cierra.
 *   · Contestar con un muro cuando alguien preguntó "¿cuánto vale?" se lee
 *     como folleto automático, no como alguien atendiendo.
 *   · El precio dentro de un muro de veinte renglones se lee DESPUÉS de la
 *     lista de todo lo que tiene que leer. El precio solo, se lee de una.
 *
 * Es el mismo principio que usa cualquier vendedor bueno y que las empresas
 * grandes llaman "divulgación progresiva": se responde LA pregunta, y se deja
 * una puerta abierta. La curiosidad la sostiene lo que todavía no dijiste.
 *
 * Este módulo decide QUÉ pedazo corresponde. No redacta: eso lo hace whatsapp.ts.
 */

export type SeccionFicha =
  /** Solo el precio. Nada más. */
  | "precio"
  /** Precio + los medios de pago. */
  | "pago"
  /** Solo Nequi/Daviplata, porque preguntó por eso. */
  | "pago_transferencia"
  /** Solo el link de tarjeta/PSE. */
  | "pago_link"
  /** Qué es y qué trae. SIN precio: el precio es la siguiente pregunta. */
  | "info"
  /** Cómo se entrega / cuándo llega. */
  | "entrega"
  /** La ficha entera. Solo cuando de verdad corresponde. */
  | "completa";

export interface EntradaSeccion {
  /** Lo último que escribió el cliente. */
  mensaje: string;
  /** La intención que ya resolvió el motor. */
  intent?: string | null;
  /** true si a este cliente ya se le mandó la ficha de este producto. */
  fichaYaEnviada?: boolean;
}

const N = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Preguntó por el precio, y por nada más. */
const PIDE_PRECIO =
  /\b(cuanto (vale|cuesta|sale|es)|que (precio|valor)|precio|valor|costo|cuanto|a como)\b/;

/** Preguntó CÓMO pagar (no cuánto). */
// El "lo/la" del medio se hace opcional a propósito: "como lo puedo adquirir"
// es un mensaje real de producción y no matcheaba, así que el cliente que
// preguntaba cómo comprar recibía la ficha entera otra vez.
const PIDE_PAGO =
  /\bcomo\s+(lo\s+|la\s+)?(puedo\s+)?(pagar|pago|comprar|compro|adquirir|adquiero)\b|\bcomo\s+se\s+paga\b|\bhago\s+para\s+(pagar|comprar)\b|\b(formas?|metodos?|medios?|maneras?)\s+de\s+pago\b|\bdonde\s+(pago|consigno|deposito)\b/;

/** Nombró un medio concreto de transferencia. */
const PIDE_TRANSFERENCIA = /\b(nequi|daviplata|transferencia|consignacion|bancolombia)\b/;

/** Nombró tarjeta / pasarela. */
const PIDE_LINK = /\b(tarjeta|credito|debito|pse|paypal|link de pago|enlace de pago|mercadopago)\b/;

/** Preguntó qué es o qué trae. */
const PIDE_INFO =
  /\b(que (trae|incluye|contiene|tiene|es|viene)|de que (trata|es)|informacion|info|contenido|temario|modulos|como funciona|para que sirve|me cuentas|cuentame|detalles)\b/;

/** Preguntó por la entrega. */
// Igual que arriba: las formas reales en que la gente pregunta esto son más
// variadas que la lista corta que había. "como lo voy a recibir", "me lo
// mandan a mi casa", "cuantos dias tarda en llegarme" son todos de producción.
const PIDE_ENTREGA =
  // Los verbos van en infinitivo TAMBIÉN: "como lo voy a recibir" es un
  // mensaje real y solo tenía la forma conjugada ("recibo"), así que no
  // matcheaba y el cliente recibía la ficha entera en vez de la entrega.
  /\bcomo\s+(?:(?:me|lo|la|voy|a|se)\s+)*(llega|llegara|llegarme|recib\w+|manda\w+|envia\w+|entrega\w+)\b|\bme\s+(lo|la)\s+(mandan|envian|entregan|traen)\b|\bcuando\s+(llega|me\s+llega|lo\s+recibo)\b|\bcuanto(s)?\s+(dias?\s+)?(tarda|demora|se\s+demora|se\s+tarda)\b|\b(envio|domicilio|entrega|despacho|mensajeria)\b/;

/**
 * Qué pedazo corresponde mandar.
 *
 * El orden importa: se evalúa de lo MÁS específico a lo más general, porque
 * "¿cómo pago por Nequi?" cumple tres patrones a la vez y lo que el cliente
 * quiere es el número de Nequi, no el catálogo de medios.
 */
export function seccionQueCorresponde(e: EntradaSeccion): SeccionFicha {
  const m = N(e.mensaje);
  const intent = String(e.intent || "");

  // ── Medio de pago concreto: lo más específico que puede pedir ─────────────
  if (PIDE_TRANSFERENCIA.test(m)) return "pago_transferencia";
  if (PIDE_LINK.test(m)) return "pago_link";

  // ── Precio a secas ────────────────────────────────────────────────────────
  // Va ANTES de "cómo pago": "cuánto vale" no es una pregunta de método.
  // Pero si preguntó las dos cosas ("cuánto vale y cómo pago"), gana el pago,
  // que ya incluye el precio.
  if (PIDE_PRECIO.test(m)) {
    return PIDE_PAGO.test(m) ? "pago" : "precio";
  }

  if (PIDE_PAGO.test(m)) return "pago";
  if (PIDE_ENTREGA.test(m)) return "entrega";
  if (PIDE_INFO.test(m)) return "info";

  // ── Por intención, cuando el texto no lo dice de forma literal ────────────
  if (intent === "payment_intent" || intent === "confirmation") return "pago";

  // ── Ya tiene la ficha: no se le vuelve a volcar entera ────────────────────
  // Si llegó hasta acá con la ficha ya enviada, preguntó algo que no encaja en
  // ningún patrón. Repetir el muro es lo que hace ver al bot como un folleto
  // en bucle; el texto que escribe la IA responde eso mejor.
  if (e.fichaYaEnviada) return "info";

  // Primer contacto con este producto: ahí sí va la presentación. Pero la
  // "completa" tampoco lo vuelca todo -- ver whatsapp.ts.
  return "completa";
}

/**
 * El cierre que deja la puerta abierta.
 *
 * Es la mitad que hace que esto funcione: si se responde solo el precio y se
 * corta ahí, la conversación muere igual. La pregunta corta invita a seguir
 * sin presionar, y le dice al cliente qué más hay para saber.
 */
export function invitacionDe(s: SeccionFicha, esFisico: boolean, semilla = ""): string {
  const opciones = invitacionesDe(s, esFisico);
  if (opciones.length === 0) return "";
  // Varía por cliente: dos personas distintas no reciben el mismo guion, y la
  // misma persona siempre recibe el mismo (así no parece que el bot cambia de
  // personalidad a mitad de conversación).
  let h = 0;
  for (let i = 0; i < String(semilla).length; i++) h = (h * 31 + String(semilla).charCodeAt(i)) >>> 0;
  return opciones[h % opciones.length]!;
}

/**
 * Cada cierre apunta a algo REAL que el cliente todavía no vio.
 *
 * Ahí está la curiosidad: no en adjetivos ni en urgencia inventada, sino en
 * que quede algo concreto por saber. "¿Te muestro cómo son las clases?" tira
 * de una clase que existe; "¡no te lo pierdas!" no tira de nada.
 *
 * Por eso ninguna de estas frases afirma nada sobre el producto: prometer
 * "te va a encantar" o "es el más vendido" son cosas que el bot no puede
 * saber, y ya hubo que sacar inventos de ese tipo (ver supervisor.ts).
 */
function invitacionesDe(s: SeccionFicha, esFisico: boolean): string[] {
  switch (s) {
    case "precio":
      // Ya sabe cuánto cuesta. Lo que falta es qué se lleva por eso.
      return [
        "¿Te muestro todo lo que trae? 👀",
        "¿Querés ver qué incluye?",
        "¿Te cuento qué viene adentro? 👀",
      ];

    case "info":
      // Vio de qué se trata. Falta el precio, que es la pregunta natural.
      return [
        "¿Te paso el precio? 💰",
        "¿Querés saber cuánto está?",
        "¿Te digo cuánto cuesta?",
      ];

    case "entrega":
      return esFisico
        ? ["¿Lo pedimos? 📦", "¿Te ayudo con el pedido?"]
        : ["¿Arrancamos? 🚀", "¿Te dejo listo el acceso?"];

    case "pago_transferencia":
    case "pago_link":
    case "pago":
      // Acá no se genera curiosidad: se cierra. Y se dice el paso exacto,
      // porque un pago sin comprobante queda en el limbo.
      return [
        "Apenas transfieras, mandame el comprobante por acá y te activo el acceso 🙌",
        "Cuando lo hagas, pasame el soporte por acá y te lo dejo listo 🙌",
      ];

    case "completa":
      // Recién lo conoce. Se le ofrece lo que más tira: ver el curso por dentro.
      return [
        "¿Te muestro cómo son las clases? 🎬",
        "¿Querés ver qué trae por dentro? 👀",
        "¿Te cuento más o preferís que te pase el precio?",
      ];
  }
}
