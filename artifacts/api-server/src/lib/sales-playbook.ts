/**
 * ============================================================
 * MANUAL DE VENTA — qué hacer EN ESTE TURNO
 * ============================================================
 *
 * El problema que resuelve, medido el 2026-08-22 con una conversación real
 * de seis mensajes (interés → precio → duda → largas → competencia → cierre):
 *
 *   · "hola, vi el curso de piano"  →  "¡Mira esto 🎹"   (tres palabras)
 *   · "lo voy a pensar y te aviso"  →  "sin presión, acá estoy"  (se rinde)
 *   · "¿sirve si nunca toqué?"      →  contesta y EMPUJA los enlaces de pago
 *
 * Y la mejor respuesta de las seis fue la única que ROMPIÓ la regla del
 * prompt que dice "NUNCA termines con una pregunta": al cliente que comparaba
 * precios le preguntó qué le atraía de la otra opción. Eso es vender.
 *
 * El sistema ya tenía casi todo esto construido y desconectado:
 *   · `objectionHandler.ts` — 11 tipos de objeción, 8 estrategias.
 *   · `analyzeConversationContext()` (agent.ts:229) — nivel de interés,
 *     capacidad de decisión, señales de urgencia, estado emocional.
 *   · `generatePersonalizedContext()` (agent.ts:464) — el que las volcaba al
 *     prompt.
 * Ninguna de las tres se llamaba desde ningún lado. El modelo nunca vio nada
 * de eso: lo que vendía era su propio criterio con instrucciones genéricas.
 *
 * Este módulo es el director de ventas del turno. No reemplaza al modelo:
 * le dice qué está pasando y qué corresponde hacer AHORA.
 *
 * ── Regla que atraviesa todo ──────────────────────────────────────────────
 * Nada de lo que sugiere puede inventarse. La prueba social, la urgencia y
 * los descuentos SOLO existen si salen del catálogo o del perfil del negocio
 * (`business-context.ts`). Un vendedor que inventa cierra una venta y pierde
 * al cliente cuando se entera -- y acá encima lo cobra el dueño del negocio.
 */
import { analyzeCustomerObjection, type ObjectionType } from "./objectionHandler";
import type { BusinessContext } from "./business-context";

export interface EntradaPlaybook {
  /** El último mensaje del cliente, tal cual. */
  mensaje: string;
  /** Mensajes anteriores, del más viejo al más nuevo (solo contenido). */
  historial: Array<{ role: string; content: string }>;
  /** Cuántos mensajes lleva escritos el cliente en esta conversación. */
  mensajesDelCliente: number;
  /** El producto del que se viene hablando, si hay. */
  productoEnFoco: string | null;
  /** ¿Ya se le mandó la ficha de algún producto? */
  fichaEnviada: boolean;
  /** Intención calculada por el motor (orientativa, no definitiva). */
  intencion: string;
  /** ¿Llegó de un anuncio? El titular dice a qué le hizo clic. */
  anuncio?: { titulo: string; cuerpo: string } | null;
  /** Perfil del negocio: lo único que se puede afirmar. */
  negocio?: BusinessContext | null;
  /** ¿El pago ya está confirmado? Entonces no se vende, se atiende. */
  pagoConfirmado?: boolean;
}

// ─── Señales ──────────────────────────────────────────────────────────────────

/**
 * Evasivas: "lo voy a pensar", "después te aviso", "ahí te escribo".
 *
 * Es el momento más importante de la conversación y donde el bot se rendía.
 * No significan "no": significan que quedó una duda sin decir. Un vendedor
 * profesional la saca a la luz; uno malo dice "dale, acá estoy" y pierde.
 */
const EVASIVAS = [
  "lo voy a pensar", "lo pienso", "déjame pensarlo", "dejame pensarlo",
  "te aviso", "te escribo", "después", "despues", "más adelante", "mas adelante",
  "lo consulto", "tengo que ver", "voy a ver", "ahí te digo", "ahi te digo",
  "cuando pueda", "la otra semana", "el otro mes", "ya te confirmo",
];

/** El cliente pregunta algo concreto: hay que contestarlo antes de cerrar. */
function tienePreguntaAbierta(mensaje: string): boolean {
  const t = mensaje.toLowerCase();
  if (t.includes("?") || t.includes("¿")) return true;
  return ["sirve", "funciona", "incluye", "cuanto", "cuánto", "como", "cómo",
    "tienen", "hay", "puedo", "se puede", "viene con"].some((p) => t.includes(p));
}

/** Señales de compra: acá se cierra, no se pregunta más. */
function quiereComprar(mensaje: string, intencion: string): boolean {
  if (intencion === "payment_intent" || intencion === "confirmation") return true;
  const t = mensaje.toLowerCase();
  return ["lo quiero", "lo llevo", "dale", "cómo pago", "como pago", "cómo hago",
    "como hago", "dónde pago", "donde pago", "listo", "hagámosle", "vamos"].some((p) => t.includes(p));
}

function esEvasiva(mensaje: string): boolean {
  const t = mensaje.toLowerCase();
  return EVASIVAS.some((p) => t.includes(p));
}

/**
 * ¿Sabemos qué quiere lograr el cliente?
 *
 * No es lo mismo que saber qué producto mira. Un vendedor que sabe PARA QUÉ
 * lo quiere argumenta con eso; uno que no, recita características.
 */
function sabemosQueQuiereLograr(historial: Array<{ role: string; content: string }>): boolean {
  const delCliente = historial.filter((m) => m.role === "customer").map((m) => m.content.toLowerCase()).join(" ");
  return ["para", "porque", "quiero aprender", "necesito", "me gustaría", "me gustaria",
    "mi hijo", "mi hija", "regalo", "trabajo", "negocio", "empezar", "nivel"].some((p) => delCliente.includes(p));
}

// ─── Jugadas por tipo de objeción ─────────────────────────────────────────────
//
// Salen de `objectionHandler.ts`, que ya las clasifica. Lo que faltaba era
// decirle al modelo qué hacer con cada una.

const JUGADAS: Record<ObjectionType, string[]> = {
  price_too_high: [
    "Validá el precio sin pedir disculpas por él: es caro respecto de QUÉ.",
    "Reencuadrá: llevá el número a lo que recibe y a cuánto le dura. Nunca ofrezcas un descuento que no exista.",
    "Cerrá con el quita-riesgo REAL del negocio (la garantía, si la hay). Si no hay garantía, no la inventes.",
  ],
  budget_constraints: [
    "No insistas con el mismo precio: preguntá qué presupuesto maneja.",
    "Si el catálogo tiene una opción más económica que le sirva, ofrecela por nombre. Si no la hay, decilo.",
    "Mencioná los medios de pago disponibles: a veces el problema es el CÓMO, no el CUÁNTO.",
  ],
  need_time_to_think: [
    "🚨 NO te despidas todavía. 'Lo voy a pensar' casi nunca es un no: es una duda que no dijo.",
    "AISLÁ la duda con UNA pregunta concreta: '¿Qué es lo que te hace dudar: el precio, o no estás seguro de que sea para vos?'",
    "Resolvé ESA duda ahí mismo. Recién si insiste, dejá la puerta abierta con un próximo paso concreto.",
  ],
  comparing_options: [
    "Preguntá qué le atrae de la otra opción: sin eso estás argumentando a ciegas.",
    "Diferenciá con hechos verificables del catálogo (qué incluye, cuánto dura, cómo se entrega). Nunca hables mal de la competencia ni inventes lo que la otra no tiene.",
  ],
  competitor_preference: [
    "Preguntá qué le atrae de la otra opción antes de argumentar.",
    "Diferenciá solo con lo que podés probar del catálogo. Si la otra es mejor en algo, no lo niegues: mostrá dónde ganás vos.",
  ],
  trust_concerns: [
    "La desconfianza no se responde con entusiasmo: se responde con hechos concretos y verificables.",
    "Explicá cómo funciona el pago y la entrega paso a paso: lo desconocido es lo que asusta.",
    "Si el negocio tiene garantía, es acá donde se menciona. NUNCA inventes testimonios, cantidad de clientes ni reseñas.",
  ],
  feature_missing: [
    "No prometas lo que no está. Confirmá qué SÍ incluye y si eso le resuelve lo que necesita.",
    "Si de verdad no le sirve, decilo. Una venta forzada vuelve como devolución.",
  ],
  timing_not_right: [
    "Aceptá el momento, pero PACTÁ el próximo paso con fecha: '¿Te escribo el lunes?'",
    "Dejar 'cuando quieras avisame' es perder el hilo: nadie vuelve solo.",
  ],
  decision_maker_absent: [
    "Preguntá qué le va a preguntar la otra persona y dale ESA respuesta lista para mostrar.",
    "Ofrecé resolver dudas de los dos por acá mismo.",
  ],
  no_immediate_need: [
    "Dejá de listar características y conectá con el problema que resuelve para ÉL.",
    "Preguntá qué lo hizo escribirte: algo lo trajo hasta acá.",
  ],
  technical_concerns: [
    "Respondé lo técnico con precisión y sin vueltas: dudar acá se lee como que no sabés.",
    "Si no tenés el dato, decí que lo confirmás. No improvises especificaciones.",
  ],
  none: [],
};

// ─── El manual del turno ──────────────────────────────────────────────────────

export interface SalidaPlaybook {
  bloque: string;
  /** Para logs: qué jugada se eligió. */
  jugada: string;
}

/**
 * Qué corresponde hacer en este mensaje. Devuelve el bloque que se le inyecta
 * al modelo justo antes de que escriba.
 */
export function construirPlaybook(e: EntradaPlaybook): SalidaPlaybook {
  const l: string[] = [];
  let jugada = "conversacion";

  l.push(`\n\n━━━━━━━━━━━━━━━━━━━━━━━`);
  l.push(`🎯 CÓMO VENDER EN ESTE MENSAJE`);
  l.push(`━━━━━━━━━━━━━━━━━━━━━━━`);

  // Va PRIMERO, no al final. Medido el 2026-08-22: con las instrucciones de
  // venta puestas y esta prohibición al final del bloque, el modelo se volvió
  // mejor vendedor Y empezó a inventar para sostener el argumento — se sacó
  // de la manga "clases de piano que salen $30.000 mensuales" y "tenemos
  // alumnos de 50, 60 y hasta 70 años". Ninguna de las dos existe en ningún
  // dato del sistema. Persuadir sube la tentación de fabricar: el freno tiene
  // que leerse ANTES que las jugadas, no después.
  l.push(`🔒 ANTES QUE NADA — LO QUE NO PODÉS INVENTAR NUNCA, ni para ganar la venta:`);
  l.push(`   ❌ Precios, planes o defectos de la COMPETENCIA. No sabés cuánto cobran otros. Prohibido "comparado con X que sale $Y".`);
  l.push(`   ❌ Clientes, alumnos, casos de éxito, cantidades, reseñas o testimonios. Prohibido "tenemos alumnos que...", "muchos clientes...", "el 90% de...".`);
  l.push(`   ❌ Cupos, stock limitado, fechas límite, descuentos o promociones que no figuren en el catálogo.`);
  l.push(`   ❌ Características, duraciones, resultados o garantías que no estén en el catálogo ni en los datos del negocio.`);
  l.push(`   ✅ Argumentá SOLO con lo verificable: lo que el producto incluye, su precio, cómo se entrega, la garantía real.`);
  l.push(`   Un argumento honesto y corto vale más que uno brillante e inventado: el cliente que compra por una mentira`);
  l.push(`   pide la devolución, y el que la descubre antes no vuelve nunca.`);

  // ── Pago confirmado: se terminó de vender ────────────────────────────────
  if (e.pagoConfirmado) {
    l.push(`✅ El pago ya está confirmado. Acá NO se vende: se atiende.`);
    l.push(`   Confirmá el acceso, asegurate de que pueda usarlo y ofrecé ayuda concreta.`);
    l.push(`   Nada de ofrecer otro producto en este mensaje.`);
    return { bloque: l.join("\n"), jugada: "postventa" };
  }

  const preguntaAbierta = tienePreguntaAbierta(e.mensaje);
  const cerrando = quiereComprar(e.mensaje, e.intencion);
  const evasiva = esEvasiva(e.mensaje);

  // ── Señal de compra: cerrar limpio ───────────────────────────────────────
  if (cerrando && !preguntaAbierta) {
    jugada = "cierre";
    l.push(`🟢 EL CLIENTE ESTÁ CERRANDO. Es la señal que estabas esperando.`);
    l.push(`   · Confirmá con seguridad y sin euforia falsa. Una línea.`);
    l.push(`   · Decile EXACTAMENTE qué pasa ahora y qué recibe.`);
    l.push(`   · ❌ NO hagas más preguntas. NO agregues objeciones que él no puso.`);
    l.push(`   · ❌ NO ofrezcas otro producto: eso reabre la decisión que ya tomó.`);
    return { bloque: l.join("\n"), jugada };
  }

  // ── Evasiva: el momento donde se pierde la venta ─────────────────────────
  if (evasiva) {
    jugada = "aislar_objecion";
    l.push(`🚨 EL CLIENTE ESTÁ POSPONIENDO. Este es el momento decisivo.`);
    l.push(`   "Lo voy a pensar" casi nunca es un no: es una duda que todavía no dijo.`);
    l.push(`   ❌ PROHIBIDO responder "sin presión, acá estoy" y despedirte. Eso es perder la venta sin pelearla.`);
    l.push(`   ✅ AISLÁ la duda con UNA sola pregunta, cálida y concreta. Por ejemplo:`);
    l.push(`      "Claro que sí. Solo para ayudarte mejor: ¿qué es lo que te hace dudar — el precio, o no estás seguro de que sea para vos?"`);
    l.push(`   · Si ya intentaste aislar antes y volvió a evadir, ahí sí: cerrá cálido y PACTÁ un próximo paso con fecha.`);
  }

  // ── Objeción clasificada ─────────────────────────────────────────────────
  const analisis = analyzeCustomerObjection(
    e.mensaje,
    e.historial.filter((m) => m.role === "customer").map((m) => m.content),
  );

  if (analisis && analisis.type !== "none") {
    const jugadas = JUGADAS[analisis.type] || [];
    if (jugadas.length > 0) {
      jugada = jugada === "conversacion" ? `objecion:${analisis.type}` : jugada;
      l.push(`\n🧱 OBJECIÓN DETECTADA: ${analisis.type} (confianza ${analisis.confidence}%)`);
      if (analisis.sentiment) l.push(`   Cómo viene el cliente: ${analisis.sentiment}`);
      l.push(`   Cómo se maneja:`);
      jugadas.forEach((j) => l.push(`   · ${j}`));
    }
  }

  // ── Descubrimiento: antes de argumentar hay que saber para qué ───────────
  const sabeQueQuiere = sabemosQueQuiereLograr(e.historial);
  if (!sabeQueQuiere && !evasiva && e.mensajesDelCliente <= 3 && !cerrando) {
    l.push(`\n🔎 TODAVÍA NO SABÉS PARA QUÉ LO QUIERE.`);
    l.push(`   Sabés qué producto mira, no qué quiere lograr con él — y sin eso solo podés recitar características.`);
    l.push(`   Dale primero algo de valor (una razón concreta por la que le sirve) y DESPUÉS preguntá UNA sola cosa:`);
    l.push(`   para qué lo quiere, desde qué nivel arranca, o para quién es.`);
    l.push(`   Una pregunta. No un cuestionario.`);
  }

  // ── Pregunta abierta: no se cierra encima de una duda ────────────────────
  if (preguntaAbierta) {
    l.push(`\n❓ EL CLIENTE PREGUNTÓ ALGO CONCRETO.`);
    l.push(`   Contestá ESO primero, completo y sin rodeos.`);
    l.push(`   ❌ NO empujes el pago en el mismo mensaje si la duda no quedó resuelta:`);
    l.push(`      cerrar encima de una duda sin responder es lo que hace que el cliente desaparezca.`);
  }

  // ── El anuncio que se pagó ───────────────────────────────────────────────
  if (e.anuncio?.titulo) {
    l.push(`\n📣 Este cliente costó dinero: llegó del anuncio "${e.anuncio.titulo}".`);
    l.push(`   Ya te dijo qué le interesa al hacer clic. Andá directo a eso — no le preguntes qué busca.`);
  }

  // ── Cómo suena un vendedor de verdad ─────────────────────────────────────
  l.push(`\n💬 CÓMO TENÉS QUE SONAR:`);
  l.push(`   · Con convicción: vendés algo que sirve y lo sabés. Sin euforia de vendedor de feria.`);
  l.push(`   · Concreto antes que entusiasta: un dato real convence más que tres signos de exclamación.`);
  l.push(`   · Cada mensaje deja al cliente un paso más cerca de decidir. Nunca lo dejes en el aire.`);
  l.push(`   · Hablás con UNA persona, no a una lista: usá lo que TE dijo en esta conversación.`);

  l.push(`\n🚫 LO QUE NUNCA:`);
  l.push(`   · Inventar testimonios, cantidad de clientes, reseñas, cupos, descuentos o fechas límite.`);
  l.push(`     Si no está en el catálogo ni en los datos del negocio, NO EXISTE. Preferí decir menos.`);
  l.push(`   · Repetir textual lo que ya dijiste: si no funcionó, cambiá el ángulo, no el volumen.`);
  l.push(`   · Presionar. La urgencia inventada se huele y rompe la confianza que venías construyendo.`);

  return { bloque: l.join("\n"), jugada };
}

// ─── Freno de salida ──────────────────────────────────────────────────────────

/**
 * Busca invenciones en lo que el agente está por MANDAR.
 *
 * Pedírselo al prompt no alcanza: con las instrucciones de venta puestas, el
 * modelo inventó "clases de piano que salen $30.000 mensuales" y "tenemos
 * alumnos de 50, 60 y hasta 70 años" en la misma prueba. La lección de esta
 * casa es que la validación va en el punto por donde pasan todos los casos,
 * no en una instrucción que el modelo puede pisar cuando está entusiasmado.
 *
 * Detecta por FORMA, no por lista de frases:
 *   · prueba social — hablar de otros clientes/alumnos que nadie registró;
 *   · precios ajenos — un monto atribuido a la competencia;
 *   · escasez — cupos, stock o fechas límite que el catálogo no tiene.
 *
 * Devuelve las frases sospechosas. No decide qué hacer con ellas.
 */
export function detectarInventos(texto: string): Array<{ frase: string; motivo: string }> {
  const hallazgos: Array<{ frase: string; motivo: string }> = [];
  // Se corta por frase para poder sacar solo la mentira y no el mensaje entero.
  const frases = texto.split(/(?<=[.!?\n])\s+/).filter(Boolean);

  const PRUEBA_SOCIAL = /\b(tenemos|hay|conozco|muchos|varios|cientos|miles|el \d+ ?%|la mayor[ií]a)\b[^.!?\n]{0,60}\b(alumnos?|clientes?|estudiantes?|usuarios?|compradores?|personas?|gente)\b/i;
  const TESTIMONIO = /\b(nos escribi|nos cuentan|nos dicen|rese[ñn]as?|testimonios?|calificaci[oó]n de|estrellas)\b/i;
  const PRECIO_AJENO = /\b(otros?|la competencia|otro lado|otras? (academias?|tiendas?|p[aá]ginas?)|clases? (de|particulares?))\b[^.!?\n]{0,50}(\$|\bcuesta|\bsale|\bcobran|\bvale)/i;
  const ESCASEZ = /\b([uú]ltim[oa]s? (cupos?|unidades?|d[ií]as?)|quedan pocos?|solo (hoy|por hoy)|por tiempo limitado|antes de que (suba|termine)|oferta que vence)\b/i;

  for (const f of frases) {
    if (PRUEBA_SOCIAL.test(f) || TESTIMONIO.test(f)) {
      hallazgos.push({ frase: f.trim(), motivo: "prueba social inventada (no hay clientes ni reseñas registradas)" });
    } else if (PRECIO_AJENO.test(f)) {
      hallazgos.push({ frase: f.trim(), motivo: "precio de la competencia inventado (el sistema no sabe qué cobran otros)" });
    } else if (ESCASEZ.test(f)) {
      hallazgos.push({ frase: f.trim(), motivo: "escasez o urgencia inventada (no figura en el catálogo)" });
    }
  }
  return hallazgos;
}

/**
 * Saca del mensaje las frases inventadas y devuelve el resto.
 *
 * Sacar la frase y no bloquear el mensaje entero es a propósito: el resto del
 * argumento suele estar bien, y dejar al cliente sin respuesta por una frase
 * de más es peor que mandarle una respuesta más corta. Si al sacarlas no
 * queda nada útil, se devuelve el original -- una respuesta imperfecta le
 * gana a un silencio.
 */
export function quitarInventos(texto: string): { limpio: string; quitadas: Array<{ frase: string; motivo: string }> } {
  const quitadas = detectarInventos(texto);
  if (quitadas.length === 0) return { limpio: texto, quitadas };

  let limpio = texto;
  for (const { frase } of quitadas) limpio = limpio.replace(frase, "");
  limpio = limpio.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  if (limpio.length < 25) return { limpio: texto, quitadas: [] };
  return { limpio, quitadas };
}
