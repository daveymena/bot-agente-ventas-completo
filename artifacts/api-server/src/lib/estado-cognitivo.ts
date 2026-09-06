/**
 * ============================================================
 * ESTADO COGNITIVO — lo que el agente SABE antes de hablar
 * ============================================================
 *
 * El agente respondía sin saber en qué punto iba la conversación. No es una
 * metáfora: no existía ningún objeto que dijera si hubo pago, qué se pidió, o
 * qué había prometido antes. Cada turno lo improvisaba leyendo texto suelto.
 *
 * Lo que eso produjo, medido el 2026-08-25 en una sola conversación:
 *
 *   19:18  "ya confirmé tu pago del PACK IDIOMAS"
 *   19:23  "Hoy no compraste nada todavía, así que no hay nada que resumir"
 *
 * Cinco minutos. Los dos mensajes son coherentes con SU turno y se contradicen
 * entre sí, porque no había un estado: había dos improvisaciones.
 *
 * Este módulo lo calcula del lado del servidor, leyendo el historial con
 * reglas fijas, y se lo afirma al modelo. La diferencia de fondo:
 *
 *   antes → el modelo RECUERDA (y por lo tanto inventa)
 *   ahora → el modelo LEE un estado que otro calculó
 *
 * Tres cosas que el agente necesita saber, y que antes deducía:
 *   1. QUÉ SÉ         — hechos duros: producto, ficha enviada, pedido abierto
 *   2. QUÉ NO SÉ      — lo que el negocio declara no tener; se dice, no se rellena
 *   3. QUÉ RESOLVER   — la pregunta que quedó sin contestar, y la acción siguiente
 */

export type EtapaTrato =
  | "explorando"        // mira, pregunta, todavía no eligió
  | "interesado"        // hay un producto concreto en juego
  | "decidido"          // dijo que lo quiere
  | "pago_reportado"    // dice que pagó; NADIE lo verificó todavía
  | "pago_verificado"   // lo confirmó la pasarela o una persona
  | "entregado";        // ya se le entregó

export interface MensajeHist {
  role: string;
  content: string;
  createdAt?: Date | string | null;
  metadata?: any;
}

export interface EntradaEstado {
  historial: MensajeHist[];
  /** Producto que el servidor resolvió para este mensaje. */
  producto?: { id: number; name: string; price?: number | string | null; kind?: string | null } | null;
  /** Fichas ya enviadas en esta conversación. */
  fichasEnviadas?: Set<number> | number[];
  /** Datos que el negocio declara NO tener (plazo de entrega, etc.). */
  loQueNoSabe?: string[];
  /** true si el pago de esta conversación fue verificado de verdad. */
  pagoVerificado?: boolean;
  /**
   * true si pasaron horas desde el último mensaje: el cliente vuelve nuevo.
   *
   * Sin esto, "dice que pagó" no caducaba nunca. Ver `calcularEtapa`.
   */
  sesionNueva?: boolean;
}

export interface EstadoCognitivo {
  etapa: EtapaTrato;
  /** Por qué esa etapa: para el log y para poder discutirlo. */
  porQue: string;
  /** La pregunta del cliente que quedó sin responder, si hay una. */
  preguntaPendiente: string | null;
  loQueNoSe: string[];
  /** Contradicciones que el agente NO puede cometer, dadas por el estado. */
  prohibido: string[];
  /** La única cosa que corresponde hacer ahora. */
  accionSiguiente: string;
}

// ─── Señales en el texto del cliente ─────────────────────────────────────────

const DICE_QUE_PAGO =
  /\bya\s+(te\s+)?(pagu[eé]|pag[uo]|hice\s+(el\s+pago|la\s+transferencia|la\s+consignaci[oó]n)|transfer[ií]|realic[eé]\s+el\s+pago)|\b(hice|mand[eé])\s+la\s+transferencia|\bpago\s+(hecho|realizado|listo)|\bte\s+(mand[eé]|env[ií]o|paso)\s+el\s+comprobante/i;

const DICE_QUE_LO_QUIERE =
  /\b(lo\s+quiero|la\s+quiero|me\s+lo\s+llevo|dale\s+lo\s+compro|quiero\s+comprarlo|lo\s+compro|listo\s+lo\s+quiero|c[oó]mo\s+(lo\s+)?(compro|pago)|d[oó]nde\s+(lo\s+)?pago)/i;

function normalizar(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s?¿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INTERROGATIVAS = [
  "donde", "cuando", "como", "que", "cual", "cuanto", "cuanta", "quien",
  "por que", "tienes", "tiene", "tienen", "hay", "puedo", "sirve", "incluye",
];

/** ¿Este mensaje del cliente contiene una pregunta? */
export function contienePregunta(texto: string): boolean {
  if (/[?¿]/.test(texto)) return true;
  const n = normalizar(texto);
  return INTERROGATIVAS.some((w) => n === w || n.startsWith(w + " "));
}

/**
 * Palabras con contenido de una pregunta: sirven para ver si la respuesta
 * siquiera toca el tema. No mide si la respuesta es BUENA -- eso no se puede
 * medir sin criterio -- sino si habla de otra cosa por completo.
 */
const VACIAS_ES = new Set([
  "que", "cual", "como", "donde", "cuando", "cuanto", "cuanta", "quien", "por",
  "el", "la", "los", "las", "un", "una", "de", "del", "y", "o", "a", "en",
  "es", "son", "esta", "estan", "me", "te", "se", "lo", "le", "su", "tu", "mi",
  "para", "con", "sin", "hay", "tiene", "tienes", "tienen", "puedo", "gracias",
  "hola", "buenas", "porfa", "favor", "si", "no", "ya", "muy", "mas", "pero",
]);

function contenido(texto: string): string[] {
  return normalizar(texto).split(" ").filter((p) => p.length > 2 && !VACIAS_ES.has(p));
}

/**
 * Las preguntas SUELTAS que trae un mensaje.
 *
 * Un cliente no manda una pregunta por mensaje: manda tres de una.
 *
 *   "me lo dejas en 30 mil? y si no me gusta me devuelves la plata?
 *    y tienes algo físico con envío a Quibdó?"
 *
 * Medido en la ronda 3 de QA: de cinco preguntas así, el bot contestó UNA y
 * descartó el resto sin avisar. Y no se detectaba, porque el chequeo miraba
 * el mensaje entero como si fuera una sola pregunta: con que la respuesta
 * tocara una palabra de cualquiera de las tres, lo daba por contestado.
 *
 * Se corta por el signo de cierre, que es la marca real de dónde termina una
 * pregunta. Los pedazos muy cortos ("y?", "no?") se descartan: son coletillas,
 * no preguntas.
 */
/**
 * Los temas que un cliente pregunta, cuando NO usa signos de interrogación.
 *
 * Cortar por "?" cubre al que escribe tres preguntas seguidas, pero deja
 * afuera al que pregunta dos cosas en un renglón. Y ese es justo el caso que
 * costó un lead pago: Mauricio escribió "quiero saber la metodología y el
 * precio", lo repitió TRES veces y no recibió ninguna de las dos. Sin signo
 * de pregunta, el corte de arriba devolvía un solo pedazo y para todo el
 * sistema era una sola pregunta.
 *
 * Las etiquetas son cortas y con una palabra fuerte cada una a propósito: la
 * regla R11 del supervisor compara esas palabras contra la respuesta para
 * decidir qué quedó sin contestar, y una etiqueta larga mete palabras de
 * relleno que ensucian esa comparación.
 */
const TEMAS_QUE_SE_PREGUNTAN: Array<{ tema: string; patron: RegExp }> = [
  { tema: "el precio", patron: /\bprecio|\bvale\b|\bcuesta\b|cu[aá]nto (es|sale|cuesta|vale)|\bvalor\b/i },
  { tema: "el descuento", patron: /descuent|rebaj|m[aá]s barato|me lo dej[aá]s|promoci[oó]n/i },
  { tema: "la garantía", patron: /garant[ií]a|devoluci[oó]n|si no me gusta|reembols/i },
  { tema: "el envío", patron: /env[ií]o|env[ií]an|domicilio|despach|llega a|mandan a/i },
  { tema: "la entrega", patron: /c[oó]mo (lo |me )?(recibo|llega|entregan|accedo)|acceso|descarg/i },
  { tema: "el contenido", patron: /qu[eé] incluye|contenido|qu[eé] trae|temario|m[oó]dulos|lecciones/i },
  { tema: "la metodología", patron: /metodolog|c[oó]mo son las clases|en vivo|grabad|c[oó]mo se estudia/i },
  { tema: "la duración", patron: /cu[aá]nto dura|duraci[oó]n|\bhoras\b|cu[aá]nto tiempo/i },
  { tema: "las formas de pago", patron: /c[oó]mo (pago|puedo pagar)|formas? de pago|m[eé]todos? de pago|tarjeta|paypal/i },
  { tema: "el certificado", patron: /certificad|diploma/i },
];

export function preguntasSueltas(texto: string): string[] {
  const porSignos = String(texto)
    .split(/\?+/)
    .map((t) => t.replace(/^[\s¿,;.y]+/i, "").trim())
    .filter((t) => t.length >= 8 && contenido(t).length > 0);
  if (porSignos.length >= 2) return porSignos;

  // Un solo pedazo puede seguir trayendo dos preguntas adentro. Solo se
  // reemplaza si hay DOS temas o más: con uno, el corte de arriba ya
  // describe el mensaje mejor que una etiqueta.
  const temas = TEMAS_QUE_SE_PREGUNTAN.filter(({ patron }) => patron.test(texto)).map(({ tema }) => tema);
  if (temas.length >= 2) return temas;

  return porSignos;
}

/**
 * La última pregunta del cliente que la respuesta siguiente NO tocó.
 *
 * Es lo que produjo, el 2026-08-25:
 *   cliente: "cuánto vale al final y de cuántos idiomas es, porque la imagen
 *             dice 12 y tú dijiste 5"
 *   bot:     repitió textual un bloque anterior sobre el pago.
 *
 * No juzga la calidad de la respuesta: solo detecta que habla de otra cosa.
 */
export function preguntaSinResponder(
  historial: MensajeHist[],
  /**
   * Nombres de los productos en juego. Sus palabras NO cuentan como haber
   * tocado el tema: nombrar el producto es lo mínimo que hace cualquier
   * respuesta, incluso una que no contesta nada.
   *
   * Sin esto, "¿de cuántos IDIOMAS es?" respondido con "ya confirmé tu pago
   * del PACK IDIOMAS" contaba como respondido -- por la palabra del nombre.
   * Es exactamente el caso B4 del QA.
   */
  nombresProducto: string[] = [],
): string | null {
  const delNombre = new Set(nombresProducto.flatMap((n) => contenido(n)));

  for (let i = historial.length - 1; i >= 0; i--) {
    const m = historial[i]!;
    if (m.role !== "customer") continue;
    if (!contienePregunta(m.content)) return null;

    const respuesta = historial.slice(i + 1).find((x) => x.role !== "customer");
    if (!respuesta) return m.content; // todavía sin responder

    const enRespuesta = new Set(contenido(respuesta.content));
    // Cada pregunta se juzga por separado: si vinieron tres y la respuesta
    // tocó una, las otras dos siguen sin contestar. Antes se miraba el
    // mensaje entero y una sola palabra en común lo daba todo por respondido.
    const partes = preguntasSueltas(m.content);
    const aRevisar = partes.length > 1 ? partes : [m.content];
    for (const parte of aRevisar) {
      const claves = contenido(parte).filter((c) => !delNombre.has(c));
      if (claves.length === 0) continue;
      // Si no comparte NI UNA palabra con contenido, la respuesta fue sobre
      // otra cosa. Con una alcanza para no marcar falsos positivos.
      if (claves.every((c) => !enRespuesta.has(c))) return parte;
    }
    return null;
  }
  return null;
}

/**
 * En qué punto va el trato, calculado del historial. No lo decide el modelo.
 *
 * Regla dura: `pago_verificado` NO se puede alcanzar leyendo texto. Que el
 * cliente diga que pagó lo deja en `pago_reportado` y nada más; el salto a
 * verificado lo da la pasarela o una persona que vio el dinero. Es lo que
 * impide que el bot "confirme" pagos, que fue el defecto más caro del QA.
 */
export function calcularEtapa(e: EntradaEstado): { etapa: EtapaTrato; porQue: string } {
  if (e.pagoVerificado) {
    return { etapa: "pago_verificado", porQue: "el pago fue verificado fuera del chat" };
  }

  const delCliente = e.historial.filter((m) => m.role === "customer");
  const ultimos = delCliente.slice(-8);

  // ── "Dice que pagó" CADUCA ──────────────────────────────────────────────
  //
  // Esto miraba los últimos 8 mensajes del cliente sin importar cuándo se
  // escribieron. Un cliente que ayer llegó hasta el pago y hoy vuelve a
  // preguntar por OTRO producto seguía en "pago_reportado", así que lo primero
  // que recibía era "necesito el comprobante de la transferencia" -- caja
  // antes de información, a alguien que solo estaba preguntando.
  //
  // Visto el 2026-09-02: el mismo teléfono venía de una conversación de la
  // madrugada terminada en "mandame el comprobante"; horas después preguntó
  // "¿tienes el curso de piano?" y le pidieron el comprobante de entrada.
  //
  // Con una sesión nueva la etapa no se hereda. El pago de verdad no se pierde
  // por esto: `pagoVerificado` se consulta ANTES y viene de fuera del chat.
  // ⚠️ Y `sesionNueva` NO alcanzaba, porque se calcula entre los DOS ÚLTIMOS
  // mensajes: en cuanto el cliente escribe el segundo mensaje de la visita
  // nueva, vuelve a ser false y la etapa de pago resucita.
  //
  // Medido con una conversación real (4-09-2026):
  //
  //   03/09 20:03  cliente: "ya pagué"
  //   04/09 03:41  cliente: "Hola"                        -> saludo, bien
  //   04/09 03:41  cliente: "Tenés el curso de IA?"       -> "¿Ya pudiste hacer
  //                                                          la transferencia?"
  //   04/09 07:13  cliente: "¿tenés curso de diseño gráfico?" -> lo mismo
  //
  // El "ya pagué" tenía SIETE horas y media, y el bot dejó de vender: a cada
  // pregunta contestaba pidiendo el comprobante. El admin lo resumió así: "el
  // WhatsApp cada vez peor".
  //
  // La caducidad tiene que mirar CUÁNDO SE DIJO, no si este mensaje viene
  // después de una pausa. Un "ya pagué" de hace un rato sigue vigente; uno de
  // ayer no puede seguir tapando toda la conversación.
  const VIGENCIA_HORAS = 6;
  const ahora = Date.now();
  const diceQuePagoReciente = ultimos.some((m) => {
    if (!DICE_QUE_PAGO.test(m.content)) return false;
    const cuando = m.createdAt ? new Date(m.createdAt).getTime() : NaN;
    // Sin fecha se cuenta como vigente: es lo que hacía antes, y perder un
    // "ya pagué" de verdad es peor que arrastrarlo de más.
    if (!Number.isFinite(cuando)) return true;
    return (ahora - cuando) / 3_600_000 <= VIGENCIA_HORAS;
  });

  if (!e.sesionNueva && diceQuePagoReciente) {
    return {
      etapa: "pago_reportado",
      porQue: "el cliente dice que pagó, pero NADIE lo verificó todavía",
    };
  }
  if (ultimos.some((m) => DICE_QUE_LO_QUIERE.test(m.content))) {
    return { etapa: "decidido", porQue: "el cliente dijo que lo quiere" };
  }
  if (e.producto) {
    return { etapa: "interesado", porQue: `hay un producto concreto en juego: ${e.producto.name}` };
  }
  return { etapa: "explorando", porQue: "todavía no hay un producto definido" };
}

/** Lo que el estado PROHÍBE decir. Son contradicciones, no estilo. */
function prohibidoSegunEtapa(etapa: EtapaTrato, fichaEnviada: boolean): string[] {
  const p: string[] = [];

  if (etapa === "pago_reportado") {
    p.push("NO digas que el pago está confirmado, ni que lo confirmaste vos: todavía nadie lo verificó.");
    p.push("NO entregues el acceso ni prometas entregarlo sin condición. Pedí el comprobante.");
    p.push("NO digas que el sistema lo verifica solo: a Nequi/Daviplata los revisa una persona.");
  }
  if (etapa !== "entregado") {
    p.push("NO digas que ya mandaste el acceso, el link ni el material: no se mandó.");
  }
  if (etapa === "explorando" || etapa === "interesado") {
    p.push("NO hables de una compra hecha ni de un pago recibido: no hubo ninguno.");
  }
  if (fichaEnviada) {
    p.push("NO repitas la ficha completa: ya la tiene. Respondé solo lo puntual.");
  }
  return p;
}

function accionDe(etapa: EtapaTrato, pregunta: string | null): string {
  if (pregunta) return `Respondé PRIMERO lo que te preguntó y quedó sin contestar: "${pregunta.trim().slice(0, 90)}"`;
  switch (etapa) {
    case "explorando":
      return "Averiguá qué busca con UNA pregunta concreta, o mostrale lo más parecido a lo que nombró.";
    case "interesado":
      return "Resolvé la duda que lo frena y avanzá hacia el cierre. La ficha lleva el precio y los medios de pago.";
    case "decidido":
      return "Facilitá el pago: la ficha de abajo lleva los enlaces. No escribas vos los links ni las cuentas.";
    case "pago_reportado":
      return "Pedí el comprobante si no lo mandó, y decile que lo revisamos y le confirmamos. Nada más.";
    case "pago_verificado":
      return "El pago está verificado: corresponde entregar el acceso.";
    case "entregado":
      return "Ya se entregó: confirmá que le llegó y ofrecé ayuda para empezar.";
  }
}

export function calcularEstado(e: EntradaEstado): EstadoCognitivo {
  const { etapa, porQue } = calcularEtapa(e);
  const pregunta = preguntaSinResponder(e.historial, e.producto ? [e.producto.name] : []);
  const fichas = e.fichasEnviadas instanceof Set
    ? e.fichasEnviadas
    : new Set(e.fichasEnviadas || []);
  const fichaEnviada = !!(e.producto && fichas.has(e.producto.id));

  return {
    etapa,
    porQue,
    preguntaPendiente: pregunta,
    loQueNoSe: e.loQueNoSabe || [],
    prohibido: prohibidoSegunEtapa(etapa, fichaEnviada),
    accionSiguiente: accionDe(etapa, pregunta),
  };
}

/** El bloque que lee el modelo. Corto a propósito: es para actuar, no para leer. */
export function renderEstado(s: EstadoCognitivo): string {
  const l: string[] = [];
  l.push(`\n\n━━━━━━━━━━━━━━━━━━━━━━━`);
  l.push(`🧭 EN QUÉ PUNTO VA ESTA CONVERSACIÓN`);
  l.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
  l.push(`Esto NO lo estás recordando: lo calculó el sistema leyendo el historial. Es la verdad.`);
  l.push(`• Etapa: ${s.etapa.toUpperCase()} — ${s.porQue}`);

  if (s.preguntaPendiente) {
    l.push(`\n❓ QUEDÓ UNA PREGUNTA SIN RESPONDER:`);
    l.push(`   "${s.preguntaPendiente.trim().slice(0, 140)}"`);
    l.push(`   Contestala ANTES que cualquier otra cosa. Si no la sabés, decí que la confirmás.`);
  }

  if (s.loQueNoSe.length > 0) {
    l.push(`\n🤷 DATOS QUE NO TENÉS (no los rellenes, decí que los confirmás):`);
    for (const d of s.loQueNoSe) l.push(`   · ${d}`);
  }

  if (s.prohibido.length > 0) {
    l.push(`\n🚫 CONTRADICCIONES QUE NO PODÉS COMETER:`);
    for (const p of s.prohibido) l.push(`   ❌ ${p}`);
  }

  l.push(`\n👉 LO QUE CORRESPONDE HACER AHORA:`);
  l.push(`   ${s.accionSiguiente}`);
  return l.join("\n");
}

/**
 * ¿Corresponde mandarle los medios de pago AHORA?
 *
 * Es la regla que le faltaba a la máquina de etapas, y la que más caro sale.
 *
 * Conversación real (2026-08-30), con la etapa bien calculada en `interesado`:
 *
 *   bot:     [ficha del curso]
 *   bot:     "💰 $60.000 COP — ¿Te cuento qué incluye? 👀"
 *   cliente: "Sí"
 *   bot:     [los tres medios de pago, con el número de Nequi]
 *
 * `prohibidoSegunEtapa` ya decía "no hables de una compra hecha" para esa
 * etapa, pero NADA prohibía mandar el checkout. Y aunque lo hubiera prohibido,
 * era texto en el prompt: una sugerencia al modelo, no una regla del sistema.
 *
 * El admin lo dijo así, y tenía razón: "no está manejando las etapas, responde
 * de una". Pedirle plata a quien está averiguando le dice que no lo
 * escucharon, y es de las pocas formas de perder una venta encaminada.
 *
 * ── Cuándo SÍ ────────────────────────────────────────────────────────────
 *
 * 1. Cuando el cliente ya decidió (`decidido`) o ya dijo que pagó.
 * 2. Cuando lo PIDIÓ explícitamente, en cualquier etapa. Si pregunta "¿cómo
 *    pago?" hay que contestarle: negárselo por estar en la etapa 2 sería el
 *    error opuesto, y tan malo como el otro.
 *
 * En todo lo demás, no. La ficha ya lleva el precio; los medios de pago son
 * el último paso, no el primero.
 */
const PIDE_PAGAR =
  /\b(c[oó]mo (pago|puedo pagar|hago para pagar)|c[oó]mo (hago|realizo|hago el|genero) (el |mi )?pedido|c[oó]mo (lo )?(compro|adquiero|pido)|d[oó]nde (lo )?compro|d[oó]nde (pago|consigno|transfiero)|formas? de pago|m[eé]todos? de pago|medios? de pago|enlaces? de pago|datos? (de|para) (pago|transferencia)|m[aá]nd[aá]me? (el|los) (link|enlace|datos)|link de pago|quiero (pagar|comprarlo|llevarlo)|lo (compro|llevo)|d[oó]nde (le )?consigno|n[uú]mero de (nequi|cuenta))/i;

/**
 * ¿El cliente PIDIÓ los datos de pago, con todas las letras?
 *
 * Se exporta aparte porque hacen falta las dos direcciones:
 *
 *   · para NO cobrarle a quien está averiguando (ver `puedeMandarPago`)
 *   · y para SÍ dárselos a quien los pide, aunque el clasificador de
 *     intenciones no lo haya marcado como intención de pago.
 *
 * Lo segundo se descubrió probando en vivo (2026-08-30): el cliente escribió
 * "como pago?" y NO recibió los medios de pago, porque `detectIntent` no lo
 * clasificó como `payment_intent`. Es el error opuesto al que se acababa de
 * arreglar, y tan malo: negarle los datos a quien quiere pagar pierde la venta
 * en el último paso.
 */
export function pidePagar(mensaje: string): boolean {
  return PIDE_PAGAR.test(String(mensaje || ""));
}

export function puedeMandarPago(e: {
  etapa: EtapaTrato;
  /** Lo que escribió el cliente en este mensaje. */
  mensaje: string;
}): { puede: boolean; porQue: string } {
  if (PIDE_PAGAR.test(String(e.mensaje || ""))) {
    return { puede: true, porQue: "el cliente pidió los datos de pago" };
  }
  switch (e.etapa) {
    case "decidido":
      return { puede: true, porQue: "el cliente ya dijo que lo quiere" };
    case "pago_reportado":
    case "pago_verificado":
    case "entregado":
      return { puede: true, porQue: `la etapa es ${e.etapa}` };
    case "explorando":
    case "interesado":
      return {
        puede: false,
        porQue:
          `está ${e.etapa} y no pidió pagar: mandarle el checkout ahora es cobrarle a alguien ` +
          `que todavía está averiguando`,
      };
  }
}
