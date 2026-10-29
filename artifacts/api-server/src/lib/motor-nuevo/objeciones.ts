/**
 * ============================================================================
 * LAS OBJECIONES COMO HECHO, NO COMO CONSEJO
 * ============================================================================
 *
 * El guion del negocio (`nicho.ts`) ya sabía qué hacer con cada objeción:
 *
 *   "está caro"        → "volvé al valor concreto que ya vio; nunca rebajes"
 *   "lo voy a pensar"  → "no te despidas: pregunta QUÉ es lo que le frena"
 *   "¿es estafa?"      → "muestra lo verificable; nunca inventes testimonios"
 *
 * Pero eso vivía en un párrafo del prompt. El modelo lo leía y hacía lo que
 * quería — la misma lección que este proyecto ya pagó con la letra chica:
 *
 *   > "El prompt ya dice 'Garantía/devolución/tiempos: solo lo cargado por el
 *   > dueño'; el modelo lo escribió igual. Una instrucción no es un candado."
 *   >   — condiciones-sin-respaldo.ts
 *
 * Acá la objeción se REGISTRA con su tipo y con qué se intentó, y el turno
 * siguiente recibe un hecho, no un consejo:
 *
 *   Antes:  "Dudas que ya puso: lo voy a pensar."
 *   Ahora:  "El cliente dijo que lo va a pensar (turno 3). YA le preguntaste qué
 *            lo frena y NO contestó. No repitas la misma pregunta: nombra las
 *            dos causas probables y ofrece resolver una."
 *
 * ── Por qué clasificar y no solo guardar el texto ──────────────────────────
 *
 * Porque "está caro" y "lo voy a pensar" NO se responden igual, y tratarlos
 * igual es justo lo que hace que un vendedor suene genérico:
 *
 *   · "está caro"       → hay que DIAGNOSTICAR (¿precio o valor no visto?)
 *   · "lo voy a pensar" → hay que PREGUNTAR qué frena (no sabe nombrarlo)
 *   · "¿es estafa?"     → hay que ELIMINAR EL RIESGO con hechos, no defenderse
 *   · "¿me sirve?"      → hay que BUSCAR EL DATO del producto, no tranquilizar
 *
 * ── Lo que este módulo NO hace ─────────────────────────────────────────────
 *
 * No reescribe la respuesta del modelo. Detecta, registra y le dice al modelo
 * qué se intentó. La decisión final la sigue tomando el modelo — pero ahora con
 * un hecho en la mano en vez de una sugerencia.
 */

import type { EstadoConversacion, Objecion, TipoObjecion } from "./estado-conversacion";
/* ─────────────────────────── Detección ─────────────────────────── */

/**
 * Cada patrón es deliberadamente conservador: un falso positivo le cambia el
 * camino al vendedor y le hace diagnosticar una objeción que nadie puso.
 * Se prefiere `otra` (que se diagnostica igual) antes que clasificar mal.
 */
const PATRONES: { tipo: TipoObjecion; re: RegExp }[] = [
  // CONFIANZA va primero: "¿es estafa?" puede venir con la palabra "precio"
  // ("¿por qué tan barato, es estafa?") y la confianza manda sobre el dinero.
  {
    tipo: "confianza",
    re: /\b(estafa|estafador|fraude|me van a robar|es confiable|son confiables|de fiar|tienen (?:p[aá]gina|local|empresa|tienda)|no los conozco|qui[eé]nes son|c[oó]mo s[eé] que|llegar[aá] de verdad|y si no llega|me quedo sin|pagina web|raz[oó]n social|nit)\b/i,
  },
  // DINERO. "caro" sin contexto, o comparación explícita.
  {
    tipo: "precio",
    re: /\b(caro|carito|costoso|muy caro|est[aá] caro|no tengo (?:plata|dinero|presupuesto)|se me sale|fuera de (?:mi )?presupuesto|m[aá]s barato|descuento|rebaja|me lo dejas en|por menos|econ[oó]mico|barato)\b/i,
  },
  // PAGO: medios y facilidades. Distinto de precio.
  {
    tipo: "pago",
    re: /\b(cuotas?|cr[eé]dito|financiaci[oó]n|tarjeta|nequi|daviplata|bancolombia|transferencia|efectivo|pago contra ?entrega|contraentrega|puedo pagar|formas? de pago|adelanto|abono)\b/i,
  },
  // ENTREGA: cuándo y hasta dónde.
  {
    tipo: "entrega",
    re: /\b(cu[aá]nto (?:demora|tarda|se demora)|demora|tarda|llega (?:a|hasta|en)|env[ií]an|env[ií]o|hacen env[ií]os|reparto|domicilio|mi ciudad|mi pueblo|cobertura|gu[ií]a|transportadora|cu[aá]ndo llega)\b/i,
  },
  // PRODUCTO: encaje con su necesidad. El miedo a equivocarse.
  {
    tipo: "producto",
    re: /\b(le (?:va|queda|sirve|servir[aá])|me (?:va|queda|sirve|servir[aá])|es (?:grande|peque[nñ]o|pesado|liviano)|talla|medida|peso|aguanta|resiste|de qu[eé] material|es de buena calidad|se rompe|durar[aá]|sirve para|es apto|mi (?:perro|gato|ni[nñ]o|hijo))\b/i,
  },
  // MOMENTO: timing, no producto. Va antes que duda_propia porque "ahorita no"
  // es una razón concreta y no una duda.
  {
    tipo: "momento",
    re: /\b(ahorita no|ahora no|en otro momento|otro d[ií]a|la (?:otra|pr[oó]xima) semana|el (?:otro )?mes|cuando (?:cobre|me paguen|tenga)|m[aá]s adelante|despu[eé]s|fin de mes|quincena)\b/i,
  },
  // DUDA PROPIA: no sabe nombrar qué le frena. Es la que MÁS necesita
  // diagnóstico, porque el cliente está pidiendo permiso para irse.
  {
    tipo: "duda_propia",
    re: /\b(lo voy a pensar|lo pienso|d[eé]jame pensar|lo consulto|consultarlo|lo hablo|hablarlo|lo veo|d[eé]jame ver|no s[eé]|no estoy seguro|me lo pienso|despu[eé]s te (?:digo|aviso)|cualquier cosa te (?:digo|aviso)|d[eé]jame consultar)\b/i,
  },
];

/** Clasifica lo que dijo el cliente. `otra` cuando no hay señal clara. */
export function clasificarObjecion(texto: string): TipoObjecion {
  const t = String(texto || "").trim();
  if (!t) return "otra";
  for (const { tipo, re } of PATRONES) {
    if (re.test(t)) return tipo;
  }
  return "otra";
}

/* ─────────────────────── Qué hacer con cada una ─────────────────────── */

export interface CaminoDeObjecion {
  /**
   * Qué tiene que hacer el vendedor AHORA. Es una instrucción operativa, no un
   * consejo de ventas: dice la acción y prohíbe lo que arruina la venta.
   */
  instruccion: string;
  /**
   * Si es true, el vendedor NO puede cerrar ni despedirse en este turno: tiene
   * que hacer la pregunta de diagnóstico primero. Se verifica en el motor.
   */
  exigeDiagnostico: boolean;
  /** La pregunta que busca la causa real. Una sola, la más probable. */
  preguntaDeDiagnostico: string;
}

/**
 * El camino para cada tipo de objeción.
 *
 * La diferencia con el guion del prompt es que acá hay CONSECUENCIAS: el motor
 * cambia el bloque de hechos del turno, y `exigeDiagnostico` se comprueba.
 */
export function caminoDeObjecion(
  tipo: TipoObjecion,
  o: { intentos: number; yaPregunto: boolean } = { intentos: 0, yaPregunto: false },
): CaminoDeObjecion {
  switch (tipo) {
    case "precio":
      return {
        instruccion:
          "No bajes el precio ni ofrezcas descuento: el dueño no autorizó nada. " +
          "Volvé al valor concreto que ya vio (qué incluye, qué resuelve) y SEPARÁ las dos causas: " +
          "¿lo comparó con otro más barato, o el monto no le entra ahora? Son objeciones distintas.",
        exigeDiagnostico: !o.yaPregunto,
        preguntaDeDiagnostico: "¿Es porque viste otro más barato o porque el monto no te entra ahora?",
      };

    case "confianza":
      return {
        instruccion:
          "NO te defiendas con adjetivos ('somos serios', 'somos confiables'): eso confirma la duda. " +
          "Eliminá el riesgo con hechos verificables del negocio (pago contra entrega, guía de " +
          "transportadora, garantía cargada, datos reales). Si no hay contraentrega, decí con " +
          "franqueza cómo se protege el cliente. Nunca inventes testimonios ni cifras de clientes.",
        exigeDiagnostico: false,
        preguntaDeDiagnostico: "¿Qué te daría tranquilidad para hacerlo?",
      };

    case "duda_propia":
      return {
        instruccion:
          "NO te despidas ni digas 'cualquier cosa me avisas': eso cierra la venta. " +
          "Casi nunca es el precio. Preguntá QUÉ es lo que le frena, y si no lo sabe nombrar, " +
          "nombralo vos con las dos causas más probables de ESTE producto (encaje o confianza).",
        exigeDiagnostico: !o.yaPregunto,
        preguntaDeDiagnostico: "¿Qué es lo que te frena? Si es el precio te digo si hay algo que hacer, y si es que no estás seguro de que le sirva, lo resolvemos con el dato.",
      };

    case "producto":
      return {
        instruccion:
          "Es un miedo a equivocarse, no una duda de venta. Traé el dato REAL del producto " +
          "(peso que aguanta, medidas, material) de la ficha o del conocimiento cargado. " +
          "Si el dato no está cargado, decilo y pedí lo que haga falta medir. " +
          "NUNCA tranquilices con 'sí, sirve' sin el respaldo.",
        exigeDiagnostico: false,
        preguntaDeDiagnostico: "¿Me decís la medida/peso y te confirmo con el dato exacto?",
      };

    case "entrega":
      return {
        instruccion:
          "Respondé con el plazo y la cobertura REALES del negocio. Si no están cargados, " +
          "decí que lo confirmás — nunca prometas un plazo de memoria. Si el cliente tiene una " +
          "fecha límite, preguntala: es información de venta, no relleno.",
        exigeDiagnostico: false,
        preguntaDeDiagnostico: "¿Lo necesitás para una fecha exacta?",
      };

    case "pago":
      return {
        instruccion:
          "Decí los medios que el negocio TIENE configurados y nada más. Si no hay cuotas, " +
          "decí que no manejás cuotas (no lo insinúes). Si el problema es que no tiene el dinero " +
          "ahora, eso es una objeción de momento, no de medios.",
        exigeDiagnostico: false,
        preguntaDeDiagnostico: "¿Te sirve alguno de esos medios o buscabas otra forma?",
      };

    case "momento":
      return {
        instruccion:
          "Es timing, no producto: no insistas con beneficios, ya los conoce. " +
          "Preguntá CUÁNDO le quedaría cómodo y ofrecé dejarle el dato listo para ese momento. " +
          "No prometas reservar stock ni precios si el negocio no lo autorizó.",
        exigeDiagnostico: false,
        preguntaDeDiagnostico: "¿Para cuándo te quedaría cómodo?",
      };

    case "otra":
    default:
      return {
        instruccion:
          "No quedó claro qué le frena. Antes de seguir explicando, averigualo: " +
          "una sola pregunta abierta sobre qué necesita resolver.",
        exigeDiagnostico: !o.yaPregunto,
        preguntaDeDiagnostico: "¿Qué es lo que necesitás resolver antes de decidir?",
      };
  }
}

/* ─────────────────────── Registro en el estado ─────────────────────── */

/**
 * Registra la objeción del turno.
 *
 * Si es del MISMO tipo que la vigente, no la duplica: suma un intento. Eso es
 * lo que le permite al motor detectar el bucle de "el cliente repite la misma
 * objeción y el vendedor repite la misma respuesta".
 */
export function registrarObjecion(
  estado: EstadoConversacion,
  texto: string,
  tipoForzado?: TipoObjecion,
): Objecion {
  const tipo = tipoForzado ?? clasificarObjecion(texto);
  const vigente = estado.objecion;

  if (vigente && vigente.tipo === tipo) {
    // Misma objeción otra vez: el intento anterior no funcionó.
    const actualizada: Objecion = { ...vigente, intentos: vigente.intentos + 1, texto: texto.slice(0, 300) };
    estado.objecion = actualizada;
    return actualizada;
  }

  const nueva: Objecion = {
    tipo,
    texto: String(texto || "").slice(0, 300),
    turno: estado.turnos,
    at: new Date().toISOString(),
    diagnosticoPedido: false,
    causaReal: null,
    intentos: 1,
  };
  estado.objecion = nueva;
  // La vigente pasa al historial para no perder qué se trabajó antes.
  if (vigente) estado.objecionesTrabajadas = [vigente, ...estado.objecionesTrabajadas].slice(0, 10);
  return nueva;
}

/** Marca que el vendedor ya preguntó qué lo frena. Evita el bucle de preguntar dos veces. */
export function marcoDiagnosticoPedido(estado: EstadoConversacion): void {
  if (estado.objecion) estado.objecion = { ...estado.objecion, diagnosticoPedido: true };
}

/**
 * El cliente dijo qué le frenaba de verdad. Se guarda la causa y la objeción
 * deja de estar vigente: ya se sabe qué atacar.
 */
export function anotarCausaReal(estado: EstadoConversacion, causa: string): void {
  if (!estado.objecion) return;
  const cerrada: Objecion = { ...estado.objecion, causaReal: String(causa).slice(0, 300) };
  estado.objecion = null;
  estado.objecionesTrabajadas = [cerrada, ...estado.objecionesTrabajadas].slice(0, 10);
}

/** La objeción se resolvió (el cliente avanzó). Deja de estar vigente. */
export function resolverObjecion(estado: EstadoConversacion): void {
  if (!estado.objecion) return;
  const cerrada = estado.objecion;
  estado.objecion = null;
  estado.objecionesTrabajadas = [cerrada, ...estado.objecionesTrabajadas].slice(0, 10);
}

/* ─────────────────────── Lo que lee el modelo ─────────────────────── */

/**
 * El bloque de hechos de la objeción vigente. Es lo que reemplaza al consejo
 * del prompt: dice qué dijo el cliente, qué se intentó y qué NO repetir.
 */
export function describirObjecion(estado: EstadoConversacion): string | null {
  const o = estado.objecion;
  if (!o) return null;

  const camino = caminoDeObjecion(o.tipo, { intentos: o.intentos, yaPregunto: o.diagnosticoPedido });
  const partes: string[] = [];

  partes.push(`El cliente puso una objeción de ${o.tipo.replace("_", " ")}${o.texto ? `: "${o.texto.slice(0, 120)}"` : ""}.`);

  if (o.intentos > 1) {
    partes.push(`YA intentaste responderla ${o.intentos} veces y sigue ahí: lo que hiciste no funcionó, cambiá de ángulo.`);
  }
  if (o.diagnosticoPedido) {
    partes.push("Ya le preguntaste qué le frena y todavía no lo dijo.");
  }
  if (o.causaReal) {
    partes.push(`La causa real que él mismo dio: "${o.causaReal}". Atacá ESO, no la objeción de superficie.`);
  }

  partes.push(camino.instruccion);

  if (camino.exigeDiagnostico) {
    partes.push(`Este turno NO cierres ni te despidas: primero hacele esta pregunta — ${camino.preguntaDeDiagnostico}`);
  }

  return partes.join(" ");
}
