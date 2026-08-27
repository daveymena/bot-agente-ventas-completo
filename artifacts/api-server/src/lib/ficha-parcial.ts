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
  /** El video de muestra, porque lo pidió o aceptó verlo. */
  | "video"
  /** La ficha entera. Solo cuando de verdad corresponde. */
  | "completa";

export interface EntradaSeccion {
  /** Lo último que escribió el cliente. */
  mensaje: string;
  /** La intención que ya resolvió el motor. */
  intent?: string | null;
  /** true si a este cliente ya se le mandó la ficha de este producto. */
  fichaYaEnviada?: boolean;
  /** true si en el turno anterior se le ofreció ver el video. */
  ofrecimosVideo?: boolean;
  /**
   * El mensaje anterior del bot terminó ofreciendo contar QUÉ INCLUYE.
   *
   * Sin esto, un "Si" pelado cae en `intent === "confirmation"` y se lee como
   * "sí, quiero comprar" -- así que devolvía los enlaces de pago a alguien que
   * solo dijo que sí a "¿Te cuento qué incluye?". Ver el caso real en
   * `respuesta-a-lo-ofrecido.test.ts`.
   */
  ofrecimosContenido?: boolean;
  /** true si el video de este producto ya se envió en esta conversación. */
  videoYaEnviado?: boolean;
}

const N = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Preguntó por el precio.
 *
 * OJO con las palabras sueltas: acá había `cuanto` y `valor` a secas, y eso
 * matchea media conversación -- "cuánto dura", "cuántos módulos", "el valor de
 * aprender". Medido el 2026-08-27: aparecio tres veces un "💰 $60.000 COP"
 * huérfano, pegado al final de respuestas que no hablaban de plata, y el
 * cliente preguntó "60 mil de qué? yo no te pregunté precio de nada".
 *
 * `cuanto` ahora exige el verbo de precio al lado, y `valor`/`precio` exigen
 * ser el tema, no una palabra suelta.
 */
const PIDE_PRECIO =
  /\bcuanto\s+(vale|cuesta|sale|es|seria|me\s+sale)\b|\bque\s+(precio|valor)\b|\b(el\s+)?precio\b|\bcuanto\s+(esta|estan)\b|\ba\s+como\s+(lo|la|esta)\b|\bcosto\b|\bvale\b/;

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

/**
 * Pidió ver el video, o aceptó la oferta de verlo.
 *
 * El video es la carnada mejor que tenemos: una promesa se discute, ver la
 * primera clase no. Pero mandarlo sin que lo pidan lo gasta -- por eso se
 * OFRECE en la presentación y se manda acá, cuando el cliente dice que sí.
 *
 * "dale", "sí", "bueno" entran porque casi siempre son la respuesta a la
 * oferta; el que decide si aplica es `ofrecimosVideo`, no este patrón.
 */
const PIDE_VIDEO =
  /\bvideo\b|\bvidio\b|\bmu[eé]stra\w*\b|\bme lo ense[ñn]as\b|\bver (una|la) clase\b|\bdemo\b|\bc[oó]mo (son|es) (las|la) clase/i;

const ACEPTA = /^(s[ií]|sii+|dale|bueno|ok|okay|okey|listo|claro|por favor|porfa|de una|obvio|hazlo|mu[eé]strame\w*)\b/i;

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

  // ── El video ──────────────────────────────────────────────────────────────
  // Va primero porque "muéstrame cómo son las clases" también huele a info, y
  // lo que el cliente quiere es el video.
  //
  // Si ya se lo mandamos, NO se repite: pedirlo de nuevo suele significar que
  // no lo abrió, y remandarlo no ayuda. Se sigue por el camino normal.
  if (!e.videoYaEnviado && (PIDE_VIDEO.test(m) || (e.ofrecimosVideo && ACEPTA.test(m)))) {
    return "video";
  }

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

  // Un "sí" contesta lo ÚLTIMO que se preguntó. Si el cierre anterior ofreció
  // contar qué incluye, eso es lo que quiere -- no pagar.
  //
  // Va DESPUÉS de los pedidos explícitos y antes de la intención: "si, ¿cómo
  // pago?" es un sí que ya dice qué quiere y manda él; un "sí" pelado no dice
  // nada por sí mismo, y ahí el servidor SABE qué ofreció, en vez de dejar
  // que el modelo lo adivine como `confirmation` (= "sí, quiero comprar").
  if (e.ofrecimosContenido && ACEPTA.test(m)) return "info";

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
export function invitacionDe(
  s: SeccionFicha,
  esFisico: boolean,
  semilla = "",
  /**
   * Si ESTE producto tiene video cargado.
   *
   * Solo 9 de los 84 cursos lo tienen (medido el 2026-08-26). Ofrecer "te
   * muestro el video" en los otros 75 es prometer algo que no existe -- el
   * mismo error que venimos sacando de todos lados, solo que en el cierre.
   */
  tieneVideo = true,
): string {
  const opciones = invitacionesDe(s, esFisico, tieneVideo);
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
function invitacionesDe(s: SeccionFicha, esFisico: boolean, tieneVideo = true): string[] {
  // Sin video cargado, el cierre apunta a otra cosa real. Nunca se ofrece lo
  // que no se puede entregar.
  if (!tieneVideo && (s === "info" || s === "completa")) {
    return s === "info"
      ? ["¿Te paso el precio? 💰", "¿Quieres saber cuánto está?"]
      : ["¿Te cuento qué incluye? 👀", "¿Qué te gustaría saber?"];
  }

  switch (s) {
    case "precio":
      // Ya sabe cuánto cuesta. Lo que falta es qué se lleva por eso.
      return [
        "¿Te muestro todo lo que trae? 👀",
        "¿Querés ver qué incluye?",
        "¿Te cuento qué viene adentro? 👀",
      ];

    case "info":
      // Quiso detalle: acá es donde el video amplía mejor que cualquier texto.
      // Ofrecerlo justo en este punto es lo que engancha; mandarlo antes lo
      // gasta, y mandarlo después llega tarde.
      return [
        "Si quieres ampliar, te muestro el video introductorio 🎬",
        "¿Te muestro el video para que veas cómo son las clases? 🎬",
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
        "Apenas transfieras, mándame el comprobante por aquí y te activo el acceso 🙌",
        "Cuando lo hagas, pásame el soporte por aquí y te lo dejo listo 🙌",
      ];

    case "video":
      // Ya vio la clase. Ahí es donde más cerca está de decidir.
      return ["¿Qué te pareció?"];

    case "completa":
      // Recién lo conoce. Se le ofrece lo que más tira: ver el curso por dentro.
      return [
        "¿Te muestro el video introductorio? 🎬",
        "¿Quieres ver cómo son las clases? 🎬",
      ];
  }
}
