import type { EtapaTrato, MensajeHist } from "./estado-cognitivo";
import { ESTILO_POR_DEFECTO, type EstiloDeVenta } from "./estilo-de-venta";

/**
 * ============================================================
 * EL EMBUDO — QUÉ CORRESPONDE HACER AHORA, Y NADA MÁS
 * ============================================================
 *
 * El admin lo dijo dos veces y con razón: *"no está manejando las etapas, está
 * respondiendo de una y no se siente humano"* y *"no analiza si lo que está
 * enviando está bien"*.
 *
 * Las etapas existían (`estado-cognitivo.ts`) pero no funcionaban como embudo.
 * `calcularEtapa` pasa a "interesado" en cuanto el servidor resuelve UN
 * producto -- o sea con el primer mensaje que nombra algo del catálogo-- y la
 * acción de esa etapa decía "avanzá hacia el cierre". Resultado: el cliente
 * escribe "hola, me interesa el de piano" y recibe ficha, precio y medios de
 * pago de una. Eso no es un embudo, es una máquina expendedora.
 *
 * ── Lo que hace un vendedor de verdad, y lo que no ───────────────────────
 *
 * Antes de recitar el producto pregunta UNA cosa: para qué lo querés. No para
 * dilatar la venta -- para poder decir lo que a esa persona le importa en vez
 * de todo lo que el producto trae.
 *
 * Pero acá hay una trampa fácil, y este proyecto ya cayó en la contraria: si el
 * cliente PREGUNTÓ EL PRECIO, se le contesta el precio. Punto. Un bot que
 * responde "¿y vos para qué lo querés?" a un "¿cuánto vale?" es más molesto que
 * uno que dispara la ficha, y ya hubo un arreglo específico para que el precio
 * salga cuando lo piden. Ese arreglo no se toca.
 *
 * ── Y se pregunta UNA vez ────────────────────────────────────────────────
 *
 * Un bot que califica en cada turno es un interrogatorio. La calificación se
 * habilita solo mientras el agente NO haya preguntado nada todavía en toda la
 * conversación. Después de eso, se presenta y se avanza. Es deliberadamente
 * conservador: el defecto que se está corrigiendo es "vende demasiado rápido",
 * y la sobrecorrección --"pregunta y nunca vende"-- costaría más caro.
 */

export type Movimiento =
  /** Quedó algo sin contestar. Va primero que todo. */
  | "responder_pregunta"
  /** Averiguar para qué lo quiere, con UNA pregunta. */
  | "calificar"
  /** Mostrar el producto: qué es, qué trae, cuánto vale. */
  | "presentar"
  /** Ya vio la ficha y no avanza: hay algo que lo frena. */
  | "destrabar"
  /** Dijo que lo quiere: facilitar el pago. */
  | "cerrar"
  /** Dice que pagó: pedir comprobante y esperar la confirmación humana. */
  | "esperar_pago"
  /** Pago verificado: entregar. */
  | "entregar"
  /** Ya se entregó. */
  | "acompanar";

export interface EntradaEmbudo {
  etapa: EtapaTrato;
  historial: MensajeHist[];
  /** La pregunta del cliente que quedó sin responder, si hay. */
  preguntaPendiente?: string | null;
  /** ¿Ya se le mandó la ficha del producto en juego? */
  fichaEnviada?: boolean;
  /** Lo que el cliente dijo que necesita, si ya se sabe. */
  necesidad?: string | null;
  /**
   * La opción obligatoria que el cliente todavía no eligió: talla, color,
   * para cuántas personas. Ya viene con su pregunta armada.
   *
   * Vacío en todo catálogo que no usa opciones --los 84 cursos, por ejemplo--
   * y ahí nada de esto cambia una coma.
   */
  faltaElegir?: { nombre: string; pregunta: string } | null;
  /**
   * Cómo eligió vender ESTE negocio. Ver `estilo-de-venta.ts`.
   *
   * Opcional a propósito: todo lo que llame al embudo sin pasarlo --las
   * pruebas viejas, cualquier camino que todavía no lo tenga a mano-- sigue
   * comportándose igual que antes, porque el defecto ES el comportamiento
   * anterior. Una perilla no puede cambiarle la venta a quien no la tocó.
   */
  estilo?: EstiloDeVenta;
}

export interface Paso {
  movimiento: Movimiento;
  /** Por qué, en castellano llano. Va al log y se puede discutir. */
  porQue: string;
  /** La instrucción concreta para el modelo. */
  instruccion: string;
}

const sinAcentos = (t: string) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * ¿El cliente pidió un dato concreto que hay que darle ya?
 *
 * Precio, formas de pago, duración, contenido. Si preguntó algo de esto, se
 * contesta: calificar en vez de responder es el defecto que ya se corrigió una
 * vez (el cliente preguntaba el precio y recibía otra cosa).
 *
 * ⚠️ Los patrones van SIN acentos y el texto se normaliza antes. En JavaScript
 * `\b` y `\w` son ASCII, así que "cuánto" no matchea `cuant\w+`. Es la quinta
 * vez que este proyecto tropieza con lo mismo; por eso ya no se escribe de otra
 * forma.
 */
const PIDE_UN_DATO =
  /(cuanto (vale|cuesta|sale)|que precio|el precio|precio\?|cuanto es|como pago|formas? de pago|medios? de pago|que incluye|que trae|cuanto dura|cuantas clases|como me lo entregan|como lo recibo)/;

export function pideUnDato(mensaje: string): boolean {
  return PIDE_UN_DATO.test(sinAcentos(mensaje));
}

/**
 * ¿Ya preguntó algo el agente en esta conversación?
 *
 * Se mira TODO el historial, no los últimos mensajes: la calificación es un
 * momento, no un hábito. Si en algún punto ya se preguntó, se deja de preguntar
 * y se pasa a vender.
 */
export function elAgenteYaPregunto(historial: MensajeHist[]): boolean {
  const delAgente = (historial || []).filter((m) => m.role !== "customer");

  // ⚠️ EL SALUDO NO CUENTA COMO PREGUNTA.
  //
  // El primer mensaje del bot SIEMPRE pregunta algo -- "¡Qué gusto verte! 🙌
  // ¿Qué necesitas?" -- así que con la regla anterior la calificación quedaba
  // desactivada en TODAS las conversaciones, sin excepción. Se vio en vivo el
  // 2026-08-31: "Tienes el curso de piano" recibió ficha, precio y medios de
  // pago de una, que es exactamente el defecto que el embudo venía a corregir.
  //
  // Un "¿Qué necesitas?" no averigua nada: el cliente contesta con el nombre
  // de un producto, no con para qué lo quiere. La pregunta que sí califica es
  // la que viene DESPUÉS, cuando ya se sabe de qué se está hablando.
  return delAgente.slice(1).some((m) => /[?¿]/.test(String(m.content || "")));
}

/**
 * Lo que el cliente contestó cuando se le preguntó para qué lo quiere.
 *
 * Se DEDUCE del historial en vez de guardarse en una columna, y es a propósito:
 * el historial ya es la fuente de verdad, sobrevive a los reinicios solo, y no
 * puede quedar desincronizado con lo que realmente se dijo. Una copia guardada
 * de "lo que el cliente necesita" es una cosa más que puede mentir.
 *
 * Se busca el primer mensaje del cliente que venga DESPUÉS de una pregunta del
 * agente. Y se descartan las respuestas vacías --"sí", "ok", "dale"-- porque
 * tomarlas como necesidad haría que el bot crea que ya sabe algo cuando no sabe
 * nada, que es peor que no haber preguntado.
 */
const RESPUESTA_VACIA = /^(si|sii+|sip|claro|ok|oka?y?|dale|listo|bueno|perfecto|dime|cuentame|a ver|dale si|dale ok)[\s.!]*$/;

export function necesidadDeclarada(historial: MensajeHist[]): string | null {
  const h = historial || [];
  for (let i = 0; i < h.length - 1; i++) {
    const m = h[i];
    if (m.role === "customer") continue;
    if (!/[?¿]/.test(String(m.content || ""))) continue;

    // El siguiente mensaje del cliente es la respuesta a esa pregunta.
    const siguiente = h.slice(i + 1).find((x) => x.role === "customer");
    if (!siguiente) return null;

    const texto = String(siguiente.content || "").trim();
    if (!texto) return null;
    if (RESPUESTA_VACIA.test(sinAcentos(texto))) return null;
    // Menos de tres palabras rara vez dice para qué lo quiere. "de cero" sí
    // cuenta --son dos y es informativo-- así que el corte va por caracteres.
    if (texto.length < 4) return null;
    return texto.slice(0, 200);
  }
  return null;
}

/** El último mensaje del cliente, que es sobre el que se decide. */
function ultimoDelCliente(historial: MensajeHist[]): string {
  const suyos = (historial || []).filter((m) => m.role === "customer");
  return String(suyos[suyos.length - 1]?.content || "");
}

/**
 * Qué corresponde hacer ahora. Una sola cosa.
 *
 * El orden de las reglas ES el diseño: lo que va primero gana. Contestar lo que
 * preguntaron va antes que cualquier plan de venta, porque un cliente al que se
 * le ignora una pregunta no avanza aunque se le empuje.
 */
export function proximoPaso(e: EntradaEmbudo): Paso {
  const mensaje = ultimoDelCliente(e.historial);
  const estilo = e.estilo || ESTILO_POR_DEFECTO;

  // ── 1. Lo que quedó sin contestar ──────────────────────────────────────
  if (e.preguntaPendiente) {
    return {
      movimiento: "responder_pregunta",
      porQue: "quedó una pregunta del cliente sin responder",
      instruccion: `Contestá PRIMERO esto, que quedó colgado: "${e.preguntaPendiente.trim().slice(0, 90)}". Recién después seguí.`,
    };
  }

  // ── 2. Las etapas donde ya no se vende ─────────────────────────────────
  switch (e.etapa) {
    case "pago_reportado":
      return {
        movimiento: "esperar_pago",
        porQue: "dice que pagó y nadie lo verificó",
        instruccion: "Pedile el comprobante si no lo mandó y decile que lo revisamos y le confirmamos. Nada más: no confirmes vos el pago ni entregues.",
      };
    case "pago_verificado":
      return {
        movimiento: "entregar",
        porQue: "el pago está verificado",
        instruccion: "Corresponde entregar el acceso.",
      };
    case "entregado":
      return {
        movimiento: "acompanar",
        porQue: "ya se entregó",
        instruccion: "Confirmá que le llegó y ofrecé ayuda para empezar. No vuelvas a vender.",
      };
    case "decidido":
      // ── NO SE CIERRA SIN SABER CUÁL QUIERE ────────────────────────────
      //
      // Dijo que lo quiere, pero no dijo la talla. Cobrarle ahora es
      // despachar la prenda equivocada: llega mal, hay devolución, y el
      // negocio paga el envío dos veces. Es de los pocos errores que salen
      // más caros que no vender.
      //
      // Va DENTRO de "decidido" y no antes, a propósito: preguntarle la talla
      // a quien todavía está averiguando es un formulario, y a un formulario
      // por WhatsApp la gente no contesta.
      if (e.faltaElegir) {
        return {
          movimiento: "calificar",
          porQue: `quiere comprarlo pero falta elegir: ${e.faltaElegir.nombre}`,
          instruccion:
            `Antes de pasarle el pago, preguntá ESTO y nada más: "${e.faltaElegir.pregunta}". ` +
            `Sin ese dato el pedido sale mal, y eso cuesta más que una venta perdida.`,
        };
      }
      return {
        movimiento: "cerrar",
        porQue: "el cliente dijo que lo quiere",
        instruccion: "Facilitá el pago. La ficha lleva los enlaces y las cuentas: no los escribas vos.",
      };
  }

  // ── 3. Pidió un dato: se le da ─────────────────────────────────────────
  //
  // Antes que calificar. Un "¿cuánto vale?" contestado con "¿y para qué lo
  // querés?" es exactamente lo que hace que la gente deje de escribir.
  //
  // La perilla `calificacion` manda acá. Con "siempre" el negocio pidió
  // averiguar ANTES de presentar aunque le hayan preguntado el precio, así que
  // este atajo no corre y la calificación de más abajo se queda con el turno.
  // Es una decisión defendible --hay negocios donde el precio sin contexto
  // espanta-- pero NO es el defecto: el defecto sigue siendo contestar, porque
  // es lo que este proyecto midió que funciona por WhatsApp.
  if (pideUnDato(mensaje) && estilo.calificacion !== "siempre") {
    return {
      movimiento: "presentar",
      porQue: "preguntó un dato concreto del producto",
      instruccion: "Dale el dato que pidió, directo y completo. No lo cambies por una pregunta tuya.",
    };
  }

  // ── 4. Ya vio la ficha y sigue ahí: algo lo frena ──────────────────────
  //
  // Va ANTES de calificar, y el orden importa: si ya tiene la ficha, la
  // presentación ya ocurrió, y preguntarle recién ahora "¿para qué lo querés?"
  // se lee como que no se leyó nada de lo anterior. Calificar es un paso previo
  // a presentar, no un comodín. Lo encontró la prueba, que daba `calificar`.
  if (e.fichaEnviada) {
    // Qué hacer con el que no avanza lo eligió el negocio: hay quien prefiere
    // no incomodar a su cliente y quien quiere saber qué lo frena. Las tres
    // salidas son legítimas; la del medio es la que viene puesta.
    const comoDestrabar =
      estilo.anteLaDuda === "dar_espacio"
        ? "Ya tiene la ficha: NO la repitas. Dejale espacio: decile que lo piense con calma y que acá estás para lo que necesite. " +
          "No preguntes qué lo frena ni ofrezcas nada más: este negocio eligió no insistir."
        : estilo.anteLaDuda === "preguntar_que_frena"
          ? "Ya tiene la ficha: NO la repitas. Preguntale DERECHO qué lo está frenando --el precio, el tiempo, alguna duda concreta-- " +
            "para poder resolverlo. Una sola pregunta, sin rodeos."
          : "Ya tiene la ficha: NO la repitas. Dejale UNA cosa concreta para pensar --algo del producto que le sirva a ÉL, no la lista entera-- " +
            "y ofrecé el paso siguiente sin presionar.";
    return {
      movimiento: "destrabar",
      porQue: `ya vio la ficha y no avanzó: hay algo que lo frena (ante la duda: ${estilo.anteLaDuda})`,
      instruccion: comoDestrabar,
    };
  }

  // ── 5. La calificación: UNA vez, y solo antes de presentar ─────────────
  // Si falta elegir algo concreto, ESA es la pregunta: es mejor que la
  // genérica de calificación, porque el negocio ya dijo cuáles son las
  // opciones y el cliente solo tiene que apuntar a una.
  if (e.faltaElegir) {
    return {
      movimiento: "calificar",
      porQue: `falta que elija: ${e.faltaElegir.nombre}`,
      instruccion: `Preguntá esto, con las opciones a la vista: "${e.faltaElegir.pregunta}". Una sola pregunta.`,
    };
  }

  // Con `nunca` el negocio pidió presentar de una. No se llega ni a evaluar si
  // ya se preguntó: se cae directo a presentar.
  const yaSabemos = !!String(e.necesidad || "").trim();
  if (estilo.calificacion !== "nunca" && !yaSabemos && !elAgenteYaPregunto(e.historial)) {
    return {
      movimiento: "calificar",
      porQue: "todavía no se sabe para qué lo quiere, y no se le preguntó nada aún",
      instruccion:
        "Hacé UNA sola pregunta corta para entender para qué lo quiere o en qué punto está. " +
        "Una, no tres, y sin recitar el producto todavía: con esa respuesta vas a poder decirle lo que a ÉL le importa " +
        "en vez de todo lo que el producto trae.",
    };
  }

  // ── 6. Presentar ───────────────────────────────────────────────────────
  //
  // El gancho del video va acá y no en el prompt general, porque es parte de
  // CÓMO se presenta. "(si el producto tiene uno cargado)" no es una cortesía:
  // sin esa condición el bot promete un video que no existe, y prometer de más
  // es el defecto que este proyecto ya corrigió con el temario inventado.
  const gancho = estilo.ganchoVideo
    ? " Si el producto tiene video cargado, cerrá ofreciéndoselo: es el gancho que más engancha. Si no tiene, no lo menciones."
    : "";
  return {
    movimiento: "presentar",
    porQue: e.etapa === "explorando" ? "todavía no hay un producto definido" : "hay un producto en juego y ya se sabe algo del cliente",
    instruccion:
      e.etapa === "explorando"
        ? "Mostrale lo más parecido a lo que nombró. Si no nombró nada, ofrecé dos opciones concretas del catálogo, no una lista entera."
        : `Presentá el producto conectándolo con lo que te dijo que necesita. La ficha lleva el precio.${gancho}`,
  };
}

/**
 * El bloque que lee el modelo. Corto: es para actuar, no para leer.
 *
 * Se suma al de `renderEstado` en vez de reemplazarlo: aquel dice DÓNDE está la
 * conversación, éste dice QUÉ HACER. Separados porque el primero es un hecho
 * calculado y el segundo una decisión, y conviene poder discutir cada uno por
 * su lado.
 */
export function renderPaso(p: Paso): string {
  return [
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    `🎯 LO ÚNICO QUE CORRESPONDE HACER AHORA`,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    `${p.instruccion}`,
    ``,
    `(Por qué: ${p.porQue}. Hacé esto y nada más: sumar los otros pasos "por las dudas" es lo que hace que el mensaje se sienta de máquina.)`,
  ].join("\n");
}
