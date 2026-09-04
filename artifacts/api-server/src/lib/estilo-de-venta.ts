/**
 * ============================================================
 * CÓMO VENDE ESTE NEGOCIO
 * ============================================================
 *
 * El dueño pidió poder cambiar la forma de vender del agente, no solo los
 * datos del negocio. La tentación obvia era dejarlo editar el prompt: es lo
 * que ofrece cualquier herramienta parecida, y es un error por dos motivos.
 *
 *   1. Le pide redactar instrucciones para un modelo a alguien que vende
 *      empanadas. Es el mismo formulario vacío que este proyecto ya
 *      identificó como abandono disfrazado de flexibilidad.
 *   2. Un prompt puede CONTRADECIR las reglas del servidor. Alguien escribe
 *      "sé insistente, cerrá siempre" y choca con el candado que impide
 *      mandar el checkout a quien está averiguando. Gana el candado --
 *      correctamente-- y el dueño ve que su instrucción "no sirve para nada".
 *
 * Así que esto no son instrucciones: son PERILLAS que el servidor obedece. Lo
 * que se elige acá cambia el comportamiento de verdad, no la sugerencia que
 * lee el modelo.
 *
 * ⚠️ REGLA DE ESTE ARCHIVO: no se agrega una perilla que no esté conectada.
 * Una opción que el dueño elige y no cambia nada es peor que no ofrecerla --
 * le enseña que configurar no sirve. Es el error que este proyecto ya cometió
 * con cuatro agentes de marketing que existían y no llamaba nadie.
 */

export type Calificacion =
  /** Antes de presentar, siempre se averigua para qué lo quiere. */
  | "siempre"
  /** Se averigua salvo que haya pedido un dato concreto (precio, formas de pago). */
  | "salvo_si_pidio_dato"
  /** Nunca: se presenta de una. */
  | "nunca";

export type AnteLaDuda =
  /** "Pensalo con calma", sin insistir. */
  | "dar_espacio"
  /** Se le deja algo concreto para pensar: una característica, el video. */
  | "algo_concreto"
  /** Se pregunta qué lo frena, para poder resolverlo. */
  | "preguntar_que_frena";

export interface EstiloDeVenta {
  calificacion: Calificacion;
  /** Si el cierre de la presentación ofrece el video como gancho. */
  ganchoVideo: boolean;
  anteLaDuda: AnteLaDuda;
}

/**
 * Lo que se usa cuando el negocio no eligió nada.
 *
 * No es un "modo neutro": es el que mejor funciona por WhatsApp según lo que
 * este proyecto ya midió. Averiguar antes de presentar --salvo que el cliente
 * haya pedido el precio, donde interrogarlo es lo que lo hace irse-- y el
 * video como gancho, que es la carnada más fuerte del catálogo.
 */
export const ESTILO_POR_DEFECTO: EstiloDeVenta = {
  calificacion: "salvo_si_pidio_dato",
  ganchoVideo: true,
  anteLaDuda: "algo_concreto",
};

export interface PerfilDeVenta {
  id: string;
  etiqueta: string;
  /** En una línea, para que se entienda sin leer las perillas. */
  comoSeSiente: string;
  cuandoConviene: string;
  estilo: EstiloDeVenta;
  recomendado?: boolean;
}

/**
 * Tres perfiles armados, para que el dueño elija uno y siga.
 *
 * Las perillas sueltas quedan disponibles para quien quiera afinar, pero
 * arrancar por ahí es pedirle tres decisiones técnicas a alguien que solo
 * quiere vender. Un perfil es una decisión.
 */
export const PERFILES: PerfilDeVenta[] = [
  {
    id: "consultivo",
    etiqueta: "Consultivo",
    comoSeSiente: "Pregunta primero, recomienda después. Se siente como un asesor.",
    cuandoConviene:
      "Cuando tenés varios productos parecidos y el cliente puede elegir mal, o cuando el ticket es alto y la decisión se piensa.",
    estilo: { calificacion: "siempre", ganchoVideo: true, anteLaDuda: "preguntar_que_frena" },
  },
  {
    id: "equilibrado",
    etiqueta: "Equilibrado",
    comoSeSiente: "Averigua una cosa antes de presentar, pero si le piden el precio lo da sin rodeos.",
    cuandoConviene: "Para casi cualquier negocio. Es lo que mejor funciona por WhatsApp.",
    estilo: ESTILO_POR_DEFECTO,
    recomendado: true,
  },
  {
    id: "directo",
    etiqueta: "Directo",
    comoSeSiente: "Presenta de una, con precio y todo. No pregunta nada antes.",
    cuandoConviene:
      "Cuando vendés UN producto o el cliente ya llega decidido desde un anuncio. Con catálogo grande hace que elija mal.",
    estilo: { calificacion: "nunca", ganchoVideo: true, anteLaDuda: "dar_espacio" },
  },
];

/**
 * Lo guardado por el negocio, tolerando lo que venga.
 *
 * Un valor viejo o inventado no puede romper la venta: se cae al de siempre.
 * Es la misma tolerancia que el resto del sistema, y por el mismo motivo --
 * este campo lo escribe una IA a pedido del dueño, y las IA escriben cosas
 * que no están en la lista.
 */
export function estiloDelNegocio(perfil: any): EstiloDeVenta {
  const g = perfil?.estiloDeVenta;
  if (!g || typeof g !== "object") return { ...ESTILO_POR_DEFECTO };

  const calificacion: Calificacion =
    g.calificacion === "siempre" || g.calificacion === "nunca" || g.calificacion === "salvo_si_pidio_dato"
      ? g.calificacion
      : ESTILO_POR_DEFECTO.calificacion;

  const anteLaDuda: AnteLaDuda =
    g.anteLaDuda === "dar_espacio" || g.anteLaDuda === "algo_concreto" || g.anteLaDuda === "preguntar_que_frena"
      ? g.anteLaDuda
      : ESTILO_POR_DEFECTO.anteLaDuda;

  return {
    calificacion,
    ganchoVideo: typeof g.ganchoVideo === "boolean" ? g.ganchoVideo : ESTILO_POR_DEFECTO.ganchoVideo,
    anteLaDuda,
  };
}

/**
 * Lo que el dueño eligió, venga como venga.
 *
 * Atlas le ofrece PERFILES y el dueño contesta "equilibrado", así que lo que
 * llega a guardarse es un id, no las tres perillas. Se acepta también el objeto
 * armado, para quien quiera afinar una sola perilla sin cambiar de perfil.
 *
 * Devuelve null si no se entiende: guardar un estilo inventado sería peor que
 * no guardar nada, porque el dueño creería que eligió algo.
 */
export function estiloElegido(valor: any): EstiloDeVenta | null {
  if (typeof valor === "string") {
    const p = PERFILES.find((x) => x.id === valor.trim().toLowerCase());
    return p ? { ...p.estilo } : null;
  }
  if (valor && typeof valor === "object") {
    // `estiloDelNegocio` tolera lo que sea cayendo al defecto. Acá eso no
    // alcanza: un objeto entero de basura devolvería el defecto y se guardaría
    // como si el dueño lo hubiera elegido. Tiene que traer algo reconocible.
    const g: any = valor;
    const reconocible =
      ["siempre", "salvo_si_pidio_dato", "nunca"].includes(g.calificacion) ||
      typeof g.ganchoVideo === "boolean" ||
      ["dar_espacio", "algo_concreto", "preguntar_que_frena"].includes(g.anteLaDuda);
    return reconocible ? estiloDelNegocio({ estiloDeVenta: g }) : null;
  }
  return null;
}

/** El perfil que corresponde a un estilo, si coincide con alguno. */
export function perfilDe(estilo: EstiloDeVenta): PerfilDeVenta | null {
  return (
    PERFILES.find(
      (p) =>
        p.estilo.calificacion === estilo.calificacion &&
        p.estilo.ganchoVideo === estilo.ganchoVideo &&
        p.estilo.anteLaDuda === estilo.anteLaDuda,
    ) || null
  );
}

/**
 * Cómo se lee el estilo actual, para poder mostrárselo al dueño.
 *
 * En términos de lo que va a pasar en la conversación, no de nombres de
 * campos: "va a preguntar para qué lo querés antes de mostrarte el producto"
 * se entiende; `calificacion: "siempre"` no.
 */
export function comoSeVe(estilo: EstiloDeVenta): string[] {
  const l: string[] = [];

  if (estilo.calificacion === "siempre") {
    l.push("Antes de mostrar el producto, siempre pregunta para qué lo querés.");
  } else if (estilo.calificacion === "salvo_si_pidio_dato") {
    l.push("Pregunta para qué lo querés antes de presentar — salvo que hayas pedido el precio, y ahí lo da directo.");
  } else {
    l.push("Presenta el producto de una, sin preguntar antes.");
  }

  l.push(
    estilo.ganchoVideo
      ? "Después de contar qué incluye, ofrece el video como gancho (si el producto tiene uno cargado)."
      : "No ofrece el video: cierra ofreciendo el precio.",
  );

  if (estilo.anteLaDuda === "dar_espacio") {
    l.push("Ante un “lo voy a pensar”, deja espacio y no insiste.");
  } else if (estilo.anteLaDuda === "algo_concreto") {
    l.push("Ante un “lo voy a pensar”, le deja algo concreto para pensar antes de despedirse.");
  } else {
    l.push("Ante un “lo voy a pensar”, pregunta qué lo frena para poder resolverlo.");
  }

  return l;
}
