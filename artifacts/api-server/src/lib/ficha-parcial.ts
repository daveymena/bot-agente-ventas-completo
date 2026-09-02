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
  /** El enlace del producto en la tienda, para verlo con calma. */
  | "tienda"
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
  /**
   * El cierre anterior ofreció decirle el precio ("¿Te paso el precio? 💰").
   *
   * Sin esto, un "Si" a esa pregunta caía en `intent: confirmation` y salía el
   * checkout completo. Al que pregunta cuánto vale se le dice cuánto vale.
   */
  ofrecimosPrecio?: boolean;
  /**
   * Si a este cliente ya se le mostraron las caracteristicas del producto.
   *
   * Distinto de `fichaYaEnviada`: se puede haber mandado la seccion de precio
   * sin que haya visto nunca lo que trae.
   */
  yaVioContenido?: boolean;
  /** Si ESTE producto tiene video cargado. Solo 9 de 84 lo tienen. */
  tieneVideo?: boolean;
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
  // La "k" por "c" y la "b" por "v" no son casos raros: "kuanto bale el kurso
  // d piano" es un mensaje REAL de produccion (2026-09-01 15:20) que no
  // matcheaba, y el cliente recibio una respuesta que no hablaba del precio.
  // Asi escribe una parte grande de la gente desde el celular.
  /\b[ck]uanto\s+([bv]ale|[ck]uesta|sale|es|seria|me\s+sale)\b|\bque\s+(precio|[bv]alor)\b|\b(el\s+)?precio\b|\b[ck]uanto\s+(esta|estan)\b|\ba\s+como\s+(lo|la|esta)\b|\b[ck]osto\b|\b[bv]ale\b|\b[ck]uesta\b/;

/** Preguntó CÓMO pagar (no cuánto). */
// El "lo/la" del medio se hace opcional a propósito: "como lo puedo adquirir"
// es un mensaje real de producción y no matcheaba, así que el cliente que
// preguntaba cómo comprar recibía la ficha entera otra vez.
const PIDE_PAGO =
  /\bcomo\s+(lo\s+|la\s+)?(puedo\s+)?(pagar|pago|comprar|compro|adquirir|adquiero)\b|\bcomo\s+se\s+paga\b|\bhago\s+para\s+(pagar|comprar)\b|\b(formas?|metodos?|medios?|maneras?)\s+de\s+pago\b|\bdonde\s+(pago|consigno|deposito)\b/;

/** Nombró un medio concreto de transferencia. */
const PIDE_TRANSFERENCIA = /\b(nequi|daviplata|transferencia|consignacion|bancolombia)\b/;

/** Nombró tarjeta / pasarela. */
const PIDE_LINK =
  // "link para pagar" no entraba: solo estaba "link de pago". Quien pide por
  // donde pagar ya decidio comprar -- es el peor momento para no entenderle.
  /\b(tarjeta|credito|debito|pse|paypal|mercadopago)\b|\b(link|enlace)\s+(de\s+(pago|compra)|para\s+(pagar|comprar)|pa\s+pagar)\b/;

/** Preguntó qué es o qué trae. */
const PIDE_INFO =
  /\b(que (?:mas |otra cosa |mas cosas )?(trae|incluye|contiene|tiene|es|viene)|de que (trata|es)|informacion|info|contenido|temario|modulos|como funciona|para que sirve|me cuentas|cuentame|detalles|cuenta?me mas|algo mas|mas info|que mas hay)\b/;

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

/**
 * ⚠ Aca vivia `ACEPTA`, un patron de PREFIJO: bastaba que el mensaje
 * EMPEZARA con "si" para contar como aceptacion. Y en el mismo archivo,
 * `AFIRMACION_SUELTA` --que decide si el "si" bloquea el checkout-- exige que
 * el mensaje sea SOLO la afirmacion.
 *
 * O sea que "si, cuanto vale?" era un si pelado para una funcion y no lo era
 * para la otra: se devolvia el video ignorando la pregunta de precio que el
 * cliente acababa de escribir en el mismo renglon.
 *
 * El razonamiento correcto ya estaba escrito mas abajo, para el caso del
 * contenido: "«si, como pago?» es un si que ya dice que quiere y manda el".
 * Faltaba aplicarlo tambien al video. Ahora hay UNA sola regla.
 */

/**
 * Pedir la tienda, o el producto EN la tienda.
 *
 * "página" y "catálogo" entran porque es como lo dice la gente. "link" suelto
 * NO: ese casi siempre es el de pago, y ya tiene su propia sección.
 */
const PIDE_TIENDA =
  /\btiendas?\b|\bcat[aá]logo\b|\bp[aá]gina web\b|\bsitio web\b|\bweb\b|link (de|del|en la) (tienda|producto|p[aá]gina)|d[oó]nde (lo )?(veo|puedo ver)\b|verlo en la (tienda|web)|enlace (de|del) producto/i;

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
/**
 * El cliente pidio EXPLICITAMENTE algo que el servidor sabe entregar.
 *
 * Existe para una decision de mas arriba (agent.ts): cuando a alguien ya se le
 * mando la ficha de un producto, la ficha no se repite. Correcto. Pero eso
 * estaba tirando abajo TODAS las secciones, no solo la repetida -- y el video,
 * la tienda, el precio y los medios de pago no son repeticiones: son cosas que
 * el cliente todavia no vio.
 *
 * Medido en produccion el 2026-09-01, con la ficha ya enviada:
 *
 *   "muestrame el video"   -> "por aqui no puedo enviarte el video de muestra"
 *                             (el producto TIENE video cargado en su metadata)
 *   "¿tienes pagina web?"  -> "si, tenemos" y nunca mando el enlace
 *   "¿cuanto vale?"        -> "tiene un valor de , pago unico"
 *
 * Ninguna de esas tres las contesto el servidor: las improviso el modelo,
 * porque el dato verificado no llego a salir.
 */
export function pideAlgoEntregable(mensaje: string): boolean {
  const m = N(mensaje);
  return (
    PIDE_VIDEO.test(m) || PIDE_TIENDA.test(m) || PIDE_TRANSFERENCIA.test(m)
    || PIDE_LINK.test(m) || PIDE_PRECIO.test(m) || PIDE_PAGO.test(m)
    || PIDE_ENTREGA.test(m)
  );
}

export function seccionQueCorresponde(e: EntradaSeccion): SeccionFicha {
  const m = N(e.mensaje);
  const intent = String(e.intent || "");

  // ── El video ──────────────────────────────────────────────────────────────
  // Va primero porque "muéstrame cómo son las clases" también huele a info, y
  // lo que el cliente quiere es el video.
  //
  // Si ya se lo mandamos, NO se repite: pedirlo de nuevo suele significar que
  // no lo abrió, y remandarlo no ayuda. Se sigue por el camino normal.
  if (!e.videoYaEnviado && (PIDE_VIDEO.test(m) || (e.ofrecimosVideo && esAfirmacionSuelta(e.mensaje)))) {
    return "video";
  }

  // ── La tienda ────────────────────────────────────────────────────────────
  // El admin preguntó "¿tienes tienda?" y el bot contestó "¿de cuál producto
  // querés que te cuente?" -- no respondió nada, teniendo la tienda publicada.
  // Va arriba porque "el link de la tienda" también matchea PIDE_LINK, que es
  // el link de PAGO: mandarle a pagar a quien pidió ver la tienda es cobrarle
  // antes de tiempo.
  if (PIDE_TIENDA.test(m)) return "tienda";

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
  // -- "Mas informacion" no puede ser lo mismo otra vez -----------------
  //
  // Pedido del admin: "cuando pregunte por mas informacion le mandas el
  // video... si ya preguntaron y el cliente tiene la informacion, por que le
  // da informacion que ya tiene".
  //
  // La conversacion avanza: primero se presenta, despues se muestra el video
  // --que es lo que mas convence y todavia no vio-- y solo entonces el
  // precio. Repetirle el mismo bloque es tratarlo como si no lo hubiera
  // leido, y encima gasta el turno sin avanzar hacia el cierre.
  //
  // Si el producto no tiene video, `info` igual no repite: whatsapp.ts manda
  // los puntos que NO entraron la primera vez (ver construirSeccion).
  if (PIDE_INFO.test(m)) {
    if (e.yaVioContenido && e.tieneVideo && !e.videoYaEnviado) return "video";
    return "info";
  }

  // Un "sí" contesta lo ÚLTIMO que se preguntó. Si el cierre anterior ofreció
  // contar qué incluye, eso es lo que quiere -- no pagar.
  //
  // Va DESPUÉS de los pedidos explícitos y antes de la intención: "si, ¿cómo
  // pago?" es un sí que ya dice qué quiere y manda él; un "sí" pelado no dice
  // nada por sí mismo, y ahí el servidor SABE qué ofreció, en vez de dejar
  // que el modelo lo adivine como `confirmation` (= "sí, quiero comprar").
  if (e.ofrecimosContenido && esAfirmacionSuelta(e.mensaje)) return "info";
  if (e.ofrecimosPrecio && esAfirmacionSuelta(e.mensaje)) return "precio";

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
/**
 * QUÉ ofrece el cierre de esta sección: el video, el contenido, u otra cosa.
 *
 * Existe porque el turno siguiente necesita saberlo y no puede deducirlo del
 * historial. El cierre lo arma `construirSeccion` al ENVIAR (whatsapp.ts), y
 * lo que se guarda en la base son solo las partes de texto -- la ficha no. Así
 * que el '¿Te muestro el video? 🎬' desaparecía, y el 'Sí' del cliente se leía
 * como intención de compra.
 *
 * Medido el 2026-08-31, con el mecanismo anti-checkout ya escrito y sin poder
 * actuar porque no encontraba la oferta:
 *
 *   bot:     '💰 $60.000 COP — ¿Te muestro el video? 🎬'
 *   cliente: 'Si'
 *   bot:     [los tres medios de pago]
 *
 * ⚠️ Clasifica sobre el RESULTADO de `invitacionesDe`, no sobre una copia de
 * sus reglas. Duplicarlas era la forma segura de que las dos se separaran
 * en el próximo cambio de redacción y el bug volviera sin que nadie lo note.
 */
export function elCierreOfrece(
  s: SeccionFicha,
  esFisico: boolean,
  tieneVideo = true,
  yaVioContenido = false,
): "video" | "contenido" | "precio" | "otro" {
  const t = invitacionesDe(s, esFisico, tieneVideo, yaVioContenido).join(" ").toLowerCase();
  if (/video|c[oó]mo es por dentro|c[oó]mo se ve en uso|pedacito/.test(t)) return "video";
  if (/qu[eé] trae|qu[eé] incluye|qu[eé] viene|todo lo que trae/.test(t)) return "contenido";
  // El cierre de una ficha SIN video ofrece el precio ("¿Te paso el precio?").
  // Sin esta rama devolvia "otro", y un "Si" a esa pregunta caia en
  // `intent: confirmation` -> checkout completo. Medido en produccion el
  // 2026-09-01: el cierre pregunto el precio y salieron los tres medios de
  // pago. Al que pregunta cuanto vale se le dice cuanto vale.
  if (/precio|cu[aá]nto est[aá]|cu[aá]nto sale/.test(t)) return "precio";
  return "otro";
}

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
  /**
   * Si al cliente YA se le mostraron las características del producto.
   *
   * Sin esto, el cierre de la sección de precio le ofrecía contarle lo que
   * acababa de leer. Ver el comentario en `invitacionesDe`.
   */
  yaVioContenido = false,
): string {
  const opciones = invitacionesDe(s, esFisico, tieneVideo, yaVioContenido);
  if (opciones.length === 0) return "";
  // Varía por cliente: dos personas distintas no reciben el mismo guion, y la
  // misma persona siempre recibe el mismo (así no parece que el bot cambia de
  // personalidad a mitad de conversación).
  let h = 0;
  for (let i = 0; i < String(semilla).length; i++) h = (h * 31 + String(semilla).charCodeAt(i)) >>> 0;
  return opciones[h % opciones.length]!;
}

/**
 * ⚠️ Y a algo que EXISTE para ESTE producto.
 *
 * Los cierres decían "¿te muestro cómo son las clases?" para todo. Este
 * negocio vende además Cojín Moto Viajero y LIQUID FIBRA: a quien pregunta
 * por un cojín se le ofrecía ver sus clases. Y es un SaaS -- una ferretería
 * o una veterinaria reciben lo mismo.
 *
 * `esFisico` ya venía en la función y no se usaba para esto. Un texto que
 * contradice lo que el cliente está mirando le dice que del otro lado hay un
 * guion, no alguien que sepa qué vende.
 *

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
function invitacionesDe(s: SeccionFicha, esFisico: boolean, tieneVideo = true, yaVioContenido = false): string[] {
  // Sin video cargado, el cierre apunta a otra cosa real. Nunca se ofrece lo
  // que no se puede entregar.
  if (!tieneVideo && (s === "info" || s === "completa")) {
    // ⚠️ Acá "completa" ofrecía "¿Te cuento qué incluye? 👀" -- en la MISMA
    // ficha que acaba de listar las características. El admin lo marcó dos
    // veces: "sigue diciendo qué incluye cuando en la información principal ya
    // lo dijo".
    //
    // Y este atajo corre ANTES que la lógica de `yaVioContenido` de más abajo,
    // así que el arreglo del 2026-09-01 no lo alcanzaba: se seguía viendo en
    // todo producto sin video cargado.
    //
    // Las dos secciones muestran el contenido, así que las dos cierran igual:
    // ofreciendo el precio, que es lo único que todavía no se dijo.
    // Las dos variantes llevan al MISMO paso siguiente, con distinta
    // redacción. Antes una de las de "completa" era "¿Hay algo puntual que
    // quieras saber?", que no avanza a ningún lado: deja al cliente eligiendo
    // en el vacío justo después de la presentación. Ahora que la ficha ya no
    // trae el precio, el paso siguiente es ése -- y las dos personas que
    // reciban una u otra terminan en el mismo lugar.
    return s === "info"
      ? ["¿Te paso el precio? 💰", "¿Quieres saber cuánto está?"]
      : ["¿Te paso el precio? 💰", "¿Te digo cuánto está? 💰"];
  }

  switch (s) {
    case "precio":
      // Ya sabe cuánto cuesta. Lo que falta es qué se lleva por eso.
      //
      // Salvo que YA se lo hayan contado. Conversación real (2026-08-30): la
      // ficha completa listó las características y el mensaje siguiente
      // preguntó "¿Te cuento qué incluye? 👀" -- ofreciéndole algo que acababa
      // de recibir. Eso le dice al cliente que del otro lado no hay nadie
      // leyendo, y es justo lo que el admin señaló: "no está manejando las
      // etapas, responde de una y no se siente humano".
      //
      // Si ya vio el contenido, el paso siguiente es el video -- que es lo
      // único que todavía no tiene.
      return yaVioContenido
        ? (tieneVideo
            ? (esFisico
                ? ["¿Te muestro cómo se ve en uso? 🎬", "¿Querés verlo en video antes de decidir? 🎬"]
                : ["¿Te muestro cómo es por dentro? 🎬", "¿Querés ver un pedacito antes de decidir? 🎬"])
            : ["¿Te resuelvo alguna duda antes de decidir?", "¿Hay algo puntual que quieras saber?"])
        : [
            "¿Te muestro todo lo que trae? 👀",
            "¿Quieres ver qué incluye?",
            "¿Te cuento qué viene adentro? 👀",
          ];

    case "info":
      // Quiso detalle: acá es donde el video amplía mejor que cualquier texto.
      // Ofrecerlo justo en este punto es lo que engancha; mandarlo antes lo
      // gasta, y mandarlo después llega tarde.
      return [
        "Si quieres ampliar, te muestro el video 🎬",
        esFisico
          ? "¿Te muestro el video para que lo veas en uso? 🎬"
          : "¿Te muestro el video para que veas cómo es por dentro? 🎬",
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
        "¿Te muestro el video? 🎬",
        esFisico
          ? "¿Quieres verlo en video antes de decidir? 🎬"
          : "¿Quieres ver cómo es por dentro? 🎬",
      ];
  }

  // Una sección nueva que nadie contempló acá NO puede hacer que el mensaje
  // salga sin cierre ni que el turno se caiga: sale sin invitación, que es
  // silencioso y correcto. `invitacionDe` ya trata la lista vacía como "sin
  // cierre".
  return [];
}

/**
 * ¿Ese "sí" contesta lo que el bot acaba de ofrecer?
 *
 * Conversación real (2026-08-30):
 *
 *   bot:     "💰 $60.000 COP — ¿Te cuento qué incluye? 👀"
 *   cliente: "Sí"
 *   bot:     [los tres medios de pago, con el número de Nequi]
 *
 * Le prometió el contenido y le mandó el checkout. `detectIntent` lee un "sí"
 * suelto como confirmación de compra, y esa bandera pisaba la sección que este
 * archivo ya había elegido bien ("info").
 *
 * Pedirle plata a quien todavía está averiguando es de las pocas formas de
 * perder una venta que venía encaminada: el cliente lee que no lo escucharon y
 * que solo le quieren cobrar.
 *
 * La regla: si el mensaje anterior del bot OFRECIÓ algo y el cliente contestó
 * con una afirmación suelta, ese "sí" es para la oferta. Un "sí, lo compro" o
 * un "dale, mándame el link de pago" traen más palabras y no entran acá.
 */
const AFIRMACION_SUELTA =
  // Sin `\b` al final: es ASCII, y después de una vocal acentuada ("sí",
  // "cuéntame") NO hay borde de palabra, así que el patrón no casaba
  // justamente con la forma más común de decir que sí en español. Es la
  // tercera vez que este proyecto tropieza con lo mismo.
  /^\s*(s[ií]|sip|sii+|dale|listo|ok|okey|okay|claro|obvio|de una|por supuesto|bueno|va|hazlo|hacelo|mu[eé]strame|mostrame|cu[eé]ntame|contame|perfecto|genial|por favor|porfa|porfis)(?![a-zA-ZáéíóúñÁÉÍÓÚÑ])[\s.!¡👍😊🙌]*$/i;

/** Es SOLO una afirmacion, sin nada mas pegado? */
export function esAfirmacionSuelta(mensaje: string): boolean {
  return AFIRMACION_SUELTA.test(String(mensaje || ""));
}

export function elSiContestaLaOferta(e: {
  /** Lo que escribió el cliente. */
  mensaje: string;
  /** El bot ofreció contarle el contenido en su mensaje anterior. */
  ofrecimosContenido?: boolean;
  /** El bot ofreció mostrarle el video en su mensaje anterior. */
  ofrecimosVideo?: boolean;
}): boolean {
  if (!e.ofrecimosContenido && !e.ofrecimosVideo) return false;
  return esAfirmacionSuelta(e.mensaje);
}

/**
 * El producto que se creyo nombrado sale de las palabras de la PREGUNTA, no
 * de una eleccion del cliente.
 *
 * Medido en produccion el 2026-09-01, hablando del curso de piano:
 *
 *   cliente: "¿tienes pagina web?"
 *   bot:     "Si, tenemos pagina web" + [ficha de DESARROLLO WEB]
 *
 * El catalogo tiene un curso llamado "DESARROLLO WEB", y el resolvedor caso
 * la palabra "web" --que es parte de COMO se pregunta por la tienda-- con su
 * nombre. El cliente nunca lo nombro.
 *
 * La regla: si lo unico que comparten el mensaje y el nombre del producto son
 * palabras que pertenecen a la pregunta ("web", "pagina", "tienda",
 * "catalogo", "link", "precio", "pago"), no es una eleccion del cliente.
 * "¿Tienes la pagina del curso de INGLES?" si comparte "ingles", que no es
 * una de esas palabras, y por eso si cuenta.
 */
const PALABRAS_DE_LA_PREGUNTA = new Set([
  "web", "pagina", "paginas", "sitio", "tienda", "tiendas", "catalogo",
  "link", "enlace", "precio", "valor", "costo", "pago", "pagos", "envio",
  "entrega", "video", "videos", "curso", "cursos", "producto", "productos",
]);

export function elProductoSaleDeLaPreguntaMisma(nombreProducto: string, mensaje: string): boolean {
  const enMensaje = new Set(N(mensaje).match(/[a-zñ0-9]{3,}/g) ?? []);
  const delNombre = (N(nombreProducto).match(/[a-zñ0-9]{3,}/g) ?? []);
  const compartidas = delNombre.filter((w) => enMensaje.has(w));
  if (compartidas.length === 0) return false;
  // Si TODO lo que comparten son palabras de la pregunta, el cliente no lo nombro.
  return compartidas.every((w) => PALABRAS_DE_LA_PREGUNTA.has(w));
}

/**
 * ============================================================
 * QUE OFRECIO EL BOT EN SU MENSAJE ANTERIOR, LO ESCRIBA COMO LO ESCRIBA
 * ============================================================
 *
 * Habia dos expresiones regulares con las frases EXACTAS que arma el
 * servidor ("¿te cuento que incluye?", "¿te muestro el video?"). Pero el
 * modelo redacta libre, e inventa las suyas. Medido en produccion el
 * 2026-09-01 a las 17:11:
 *
 *   bot:     "¿Te gustaria que te pase toda la informacion con el precio
 *              y los modulos? 😊"
 *   cliente: "Si"
 *   bot:     [los tres medios de pago]
 *
 * Ninguna de las dos expresiones casaba esa frase, asi que el "Si" cayo en
 * `intent: confirmation` y salio el checkout. Le ofrecio los modulos y le
 * cobro.
 *
 * Enumerar frases no funciona: son infinitas. Lo que se puede reconocer es
 * la FORMA -- el bot ofrecio ENTREGAR algo y pregunto-- y de ahi sacar QUE
 * ofrecio. Si ofrecio pagar, el "si" es para pagar; si ofrecio cualquier
 * otra cosa, el "si" es para esa cosa y NUNCA para el checkout.
 */
export type LoOfrecido = "video" | "contenido" | "precio" | "pago" | "tienda" | null;

export function queOfrecioElBot(mensajeDelBot: string): LoOfrecido {
  const t = String(mensajeDelBot || "");

  // ── Se ofrece afirmando tanto como preguntando ──────────────────────────
  //
  // Acá había `if (!/[?]/.test(t)) return null;` -- sin signo de interrogación,
  // no hubo oferta. Y en español eso no es cierto: "Te muestro el contenido
  // detallado" es un ofrecimiento igual de claro que "¿Te lo muestro?".
  //
  // Conversación real del 2026-09-02, 10:42:
  //
  //   bot:     "...Ideal si nunca has tocado. Te muestro el contenido detallado"
  //   cliente: "Si"
  //   bot:     [el contenido]  +  [💰 $60.000 + Tarjeta + PayPal + el Nequi]
  //
  // Como el cierre no llevaba "?", esta función devolvió null, el "Si" cayó en
  // `intent: confirmation` -- que es "sí, quiero comprar" -- y salió el
  // checkout completo. El cliente había aceptado VER EL CONTENIDO.
  //
  // El admin lo zanjó así: los medios de pago solo cuando pide pagar. Y esta
  // es la forma correcta de cumplirlo: no mutilando la regla de intención
  // --que acierta cuando de verdad no se ofreció nada-- sino leyendo bien lo
  // que el bot acababa de ofrecer.
  const OFRECE_AFIRMANDO =
    /\bte\s+(muestro|paso|cuento|dejo|envio|env[ií]o|comparto|mando|explico|detallo)\b|\bmira\s+lo\s+que\b|\bacá?\s+te\s+va\b/i;

  const hayPregunta = /[?？]/.test(t);
  let ultima: string;
  if (hayPregunta) {
    // Se mira SOLO la ultima pregunta: el mensaje puede hablar de varias
    // cosas y la que el cliente contesta es la que quedo al final.
    const partes = t.split(/(?<=[?？])/);
    ultima = partes.filter((p) => /[?？]/.test(p)).pop() || t;
  } else {
    // Sin pregunta, la oferta tiene que estar dicha con todas las letras. Se
    // mira el ÚLTIMO renglón con texto, que es lo que el cliente contesta.
    const renglones = t.split("\n").map((r) => r.trim()).filter(Boolean);
    const cola = renglones[renglones.length - 1] || t;
    if (!OFRECE_AFIRMANDO.test(cola)) return null;
    ultima = cola;
  }
  const m = N(ultima);

  // El orden importa: si ofrecio pagar, gana el pago aunque nombre otra cosa
  // ("¿te paso el precio y los datos de pago?").
  if (/\b(datos de pago|medios de pago|formas de pago|link de pago|enlace de pago|como pagar|lo pedimos|lo llevas|te lo dejo listo|arrancamos)\b/.test(m)) return "pago";
  if (/\bvideo|clase de muestra|como es por dentro|como se ve en uso|un pedacito\b/.test(m)) return "video";
  if (/\b(tienda|catalogo|pagina web|sitio web)\b/.test(m)) return "tienda";
  // Informacion, modulos, contenido, la ficha entera: todo eso es contenido.
  // Va DESPUES del precio a proposito? No: si ofrece las dos cosas gana el
  // contenido, porque el precio ya viaja dentro de la ficha y lo contrario
  // --mandar solo el precio a quien pidio los modulos-- es la falla que se
  // esta corrigiendo.
  if (/\b(informacion|info|modulos|temario|contenido|que incluye|que trae|que viene|detalles|la ficha|todo lo que)\b/.test(m)) return "contenido";
  if (/\b(precio|valor|cuanto (vale|cuesta|esta))\b/.test(m)) return "precio";
  return null;
}
