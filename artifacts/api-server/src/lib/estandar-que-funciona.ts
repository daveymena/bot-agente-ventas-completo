/**
 * ============================================================
 * EL ESTÁNDAR QUE DE VERDAD FUNCIONA
 * ============================================================
 *
 * Los números y las reglas que separan una cuenta que gana plata de una que
 * la quema. Investigado el 2026-08-30 contra benchmarks públicos de
 * click-to-WhatsApp y prácticas de venta conversacional.
 *
 * El admin lo pidió así: "necesitamos saber lo que realmente funciona en
 * WhatsApp, en anuncios, en copy y en todo, para tener el estándar que da
 * dinero y que los que usen la app tengan rendimientos verdaderos".
 *
 * ── Por qué esto es código y no un PDF ───────────────────────────────────
 *
 * Un documento con buenas prácticas no cambia nada: nadie lo abre cuando el
 * sistema está por mandar un mensaje. Acá los números son constantes que el
 * resto del código consulta, y las reglas son funciones que devuelven un
 * veredicto. Lo mismo que ya se hizo con `reglas-de-pauta.ts`.
 *
 * ── La advertencia que corresponde ───────────────────────────────────────
 *
 * Son medianas de mercado, no promesas. Sirven para saber si una cuenta está
 * bien o mal, no para prometerle a nadie un resultado. Cuando la cuenta tenga
 * datos propios suficientes, mandan los suyos: un negocio con 200
 * conversaciones sabe más de sí mismo que cualquier benchmark.
 */

// ─── Click-to-WhatsApp: los números que definen si va bien ────────────────
//
// Fuente: benchmarks públicos de CTWA 2026. Se guardan los tres cuartiles
// porque lo útil no es "el promedio" sino saber de qué lado está la cuenta.

/** Costo por conversación iniciada, en dólares. LATAM es más barato que Europa. */
export const COSTO_POR_CONVERSACION_USD = {
  /** Por debajo de esto, la cuenta está entre las mejores. */
  excelente: 0.7,
  /** La franja normal. Ni bien ni mal. */
  medianaAlta: 1.6,
  /** Por encima de esto hay un problema real: creativo, público o destino. */
  malo: 2.5,
} as const;

/** Lo mismo, para LATAM, que es donde opera este SaaS. */
export const COSTO_POR_CONVERSACION_LATAM_USD = {
  excelente: 0.25,
  medianaAlta: 0.7,
  malo: 1.2,
} as const;

/** Clics sobre impresiones. Mide si el creativo detiene el scroll. */
export const CTR_PORCENTAJE = {
  malo: 1.0,
  mediana: 2.0,
  excelente: 3.5,
} as const;

/**
 * De los que hacen clic, cuántos ESCRIBEN de verdad.
 *
 * Es el número más ignorado y el que más rápido detecta un problema: si el
 * clic es caro pero la gente no escribe, el problema no es el anuncio, es lo
 * que ve al abrir WhatsApp.
 */
export const CLIC_A_CONVERSACION_PORCENTAJE = {
  malo: 45,
  mediana: 68,
  excelente: 82,
} as const;

/** De los que escriben, cuántos compran en 30 días. */
export const CONVERSACION_A_VENTA_PORCENTAJE = {
  malo: 4,
  mediana: 8,
  excelente: 14,
} as const;

/**
 * Cuánto puede tardar el bot en contestar, en segundos.
 *
 * La regla que más repiten los que venden por WhatsApp: la velocidad decide.
 * Un lead que escribe y espera cinco minutos ya está mirando otra cosa. Este
 * proyecto midió su propio caso: un modelo de razonamiento tardaba 26-30 s y
 * había que sacarlo de la cadena por eso.
 */
export const SEGUNDOS_PARA_CONTESTAR = {
  excelente: 5,
  aceptable: 15,
  malo: 60,
} as const;

/**
 * Meta no cobra la conversación durante 3 días cuando entró por un anuncio.
 *
 * Es plata sobre la mesa que casi nadie usa: el seguimiento dentro de esa
 * ventana es gratis. Fuera de ella, cada reapertura se cobra.
 */
export const DIAS_DE_VENTANA_GRATIS_DESDE_ANUNCIO = 3;

export type Veredicto = "excelente" | "normal" | "malo";

/** De qué lado está un número, con su explicación en una línea. */
export function comoVa(
  valor: number,
  umbrales: { excelente: number; malo: number },
  masEsMejor: boolean,
): Veredicto {
  if (masEsMejor) {
    if (valor >= umbrales.excelente) return "excelente";
    if (valor <= umbrales.malo) return "malo";
    return "normal";
  }
  if (valor <= umbrales.excelente) return "excelente";
  if (valor >= umbrales.malo) return "malo";
  return "normal";
}

/**
 * El diagnóstico completo de un embudo de click-to-WhatsApp.
 *
 * Devuelve DÓNDE está el problema, no un puntaje. "Tu CPA es alto" no le
 * sirve a nadie; "el anuncio funciona pero la gente no escribe al abrir el
 * chat" dice qué tocar.
 */
export function dondeSePierde(e: {
  /** Clics en el anuncio. */
  clics: number;
  /** Conversaciones que de verdad empezaron. */
  conversaciones: number;
  /** Ventas cerradas. */
  ventas: number;
  /** Gasto total, en la misma moneda que se quiera leer. */
  gasto: number;
}): { etapa: string; diagnostico: string; veredicto: Veredicto } {
  const { clics, conversaciones, ventas, gasto } = e;

  if (clics === 0) {
    return {
      etapa: "el anuncio",
      diagnostico: "Nadie hizo clic. El problema es el creativo o el público, no el chat.",
      veredicto: "malo",
    };
  }

  const clicAConv = (conversaciones / clics) * 100;
  if (comoVa(clicAConv, CLIC_A_CONVERSACION_PORCENTAJE, true) === "malo") {
    return {
      etapa: "entre el clic y el chat",
      diagnostico:
        `De ${clics} clics solo ${conversaciones} escribieron (${clicAConv.toFixed(0)}%, la mediana es ` +
        `${CLIC_A_CONVERSACION_PORCENTAJE.mediana}%). El anuncio atrae pero algo corta al abrir WhatsApp: ` +
        `revisá el mensaje de entrada y que el número sea el correcto.`,
      veredicto: "malo",
    };
  }

  if (conversaciones === 0) {
    return {
      etapa: "entre el clic y el chat",
      diagnostico: "Hubo clics pero ninguna conversación. Nadie llegó a escribir.",
      veredicto: "malo",
    };
  }

  const costoPorConv = gasto / conversaciones;
  const convAVenta = (ventas / conversaciones) * 100;

  if (comoVa(convAVenta, CONVERSACION_A_VENTA_PORCENTAJE, true) === "malo") {
    return {
      etapa: "la conversación",
      diagnostico:
        `${conversaciones} conversaciones y ${ventas} ventas (${convAVenta.toFixed(1)}%, la mediana es ` +
        `${CONVERSACION_A_VENTA_PORCENTAJE.mediana}%). La gente llega y no compra: el problema está en ` +
        `cómo vende el agente, no en el anuncio. Costo por conversación: ${costoPorConv.toFixed(2)}.`,
      veredicto: "malo",
    };
  }

  return {
    etapa: "todo el embudo",
    diagnostico:
      `${clics} clics → ${conversaciones} conversaciones (${clicAConv.toFixed(0)}%) → ${ventas} ventas ` +
      `(${convAVenta.toFixed(1)}%). Costo por conversación: ${costoPorConv.toFixed(2)}.`,
    veredicto: convAVenta >= CONVERSACION_A_VENTA_PORCENTAJE.excelente ? "excelente" : "normal",
  };
}

// ─── Lo que funciona DENTRO de la conversación ────────────────────────────

/**
 * Las reglas de venta por WhatsApp que aparecen en todas las fuentes.
 *
 * Están en un solo lugar para que el prompt del agente las use y para que se
 * puedan revisar contra lo que el bot escribe de verdad. Todo lo que este
 * proyecto encontró rompiéndose en producción cae en una de éstas.
 */
export const REGLAS_DE_CONVERSACION = [
  {
    id: "responder-rapido",
    regla: "Contestar en menos de 15 segundos.",
    porque: "La velocidad decide la venta. Quien espera cinco minutos ya está mirando otra cosa.",
  },
  {
    id: "mensajes-cortos",
    regla: "Mensajes cortos. Nada de muros de texto.",
    porque: "Se lee en un celular, entre otras cosas. Un párrafo largo no se lee: se saltea.",
  },
  {
    id: "usar-el-contexto",
    regla: "Nombrar de dónde viene: el anuncio que vio, el producto que preguntó, su nombre.",
    porque: "Es lo que separa un mensaje que parece escrito para él de uno que parece masivo.",
  },
  {
    id: "un-solo-siguiente-paso",
    regla: "Cerrar con UNA sola pregunta o acción, nunca dos.",
    porque: "Dos opciones compiten entre sí y la respuesta más común pasa a ser ninguna.",
  },
  {
    id: "dar-antes-de-pedir",
    regla: "Entregar lo que preguntó ANTES de pedir datos o pedir la compra.",
    porque:
      "Pedirle plata a quien está averiguando pierde la venta. Medido en esta app el 2026-08-30: " +
      "el cliente dijo 'Sí' a '¿te cuento qué incluye?' y recibió el checkout.",
  },
  {
    id: "no-repetir",
    regla: "No volver a ofrecer ni a mandar lo que ya se envió en esta conversación.",
    porque: "Le dice al cliente que del otro lado nadie está leyendo. Es lo que hace que no se sienta humano.",
  },
  {
    id: "no-afirmar-sin-dato",
    regla: "No afirmar nada que no esté en los datos del producto.",
    porque:
      "Es la única mentira que el cliente puede verificar solo, y la que produce devoluciones. " +
      "Vale para el precio, el contenido, la garantía y la entrega.",
  },
  {
    id: "aprovechar-la-ventana",
    regla: `Hacer el seguimiento dentro de los ${DIAS_DE_VENTANA_GRATIS_DESDE_ANUNCIO} días de la ventana gratis.`,
    porque: "Meta no cobra ese período cuando el contacto entró por un anuncio. Después, cada reapertura se paga.",
  },
] as const;

/**
 * Revisa un mensaje contra las reglas que se pueden verificar leyendo el texto.
 *
 * No juzga el tono ni la calidad: eso no se mide. Juzga lo que sí es
 * verificable — largo, cuántas preguntas, y si repite algo ya enviado.
 */
export function revisarMensaje(e: {
  texto: string;
  /** Lo que ya se le mandó a este cliente. */
  yaEnviado?: string[];
}): string[] {
  const problemas: string[] = [];
  const t = String(e.texto || "");

  // El largo. 600 caracteres es aproximadamente lo que entra en una pantalla
  // de celular sin tener que desplazarse.
  if (t.length > 600) {
    problemas.push(
      `El mensaje tiene ${t.length} caracteres y no entra en una pantalla de celular. ` +
      `Se lee salteado o no se lee.`,
    );
  }

  // Dos preguntas compiten entre sí. Se cuentan solo los signos de cierre,
  // que es como se cuenta una pregunta en español escrito informal.
  const preguntas = (t.match(/\?/g) || []).length;
  if (preguntas > 1) {
    problemas.push(
      `Hace ${preguntas} preguntas en un mensaje. Dos opciones compiten y la respuesta más común pasa a ser ninguna.`,
    );
  }

  // Repetir textual algo ya enviado. Se compara por bloques largos, no por
  // frases sueltas: un saludo repetido es normal, un párrafo repetido no.
  for (const previo of e.yaEnviado || []) {
    const p = String(previo || "").trim();
    if (p.length >= 120 && t.includes(p.slice(0, 120))) {
      problemas.push("Repite textual un bloque que ya se le había enviado a este cliente.");
      break;
    }
  }

  return problemas;
}
