/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAS REGLAS CON LAS QUE TRABAJA UNA AGENCIA DE VERDAD
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Este archivo no inventa criterios: transcribe los que usa quien compra
 * medios para vivir, investigados el 2026-08-29. Son puros --entran números,
 * salen decisiones-- así que se pueden probar sin tocar Meta ni la base.
 *
 * Por qué existían las reglas equivocadas antes:
 *
 *   · `marketing-strategist.ts` decía "escalar el ganador gradualmente
 *     (máx. 30% por paso)". Un 30% RESETEA la fase de aprendizaje de Meta, así
 *     que ese consejo, aplicado, tiraba abajo lo aprendido en cada escalada.
 *   · `scaling-agent.ts` proponía escalar desde `const current = 50000;
 *     // presupuesto diario actual estimado`. Un presupuesto inventado.
 *   · No había noción de fase de aprendizaje, ni de espaciado entre cambios,
 *     ni de cuándo cortar.
 *
 * Fuentes (2026): guías de escalado y fase de aprendizaje de benly.ai,
 * adlibrary.com, admanage.ai y niblin.com; estrategia orgánica de Hootsuite y
 * contentstudio.io. Donde las fuentes daban un rango, se toma el extremo
 * CONSERVADOR: equivocarse por prudente cuesta unos días; equivocarse por
 * agresivo resetea el aprendizaje y quema presupuesto real.
 */

// ── Fase de aprendizaje ──────────────────────────────────────────────────
//
// Meta necesita ~50 eventos de optimización en 7 días para estabilizar la
// entrega de un conjunto. Hasta llegar ahí, el rendimiento que se ve NO es el
// rendimiento real: es el algoritmo tanteando. Decidir sobre esos números
// --escalar, cortar, cambiar público-- es decidir sobre ruido.
export const EVENTOS_PARA_SALIR_DE_APRENDIZAJE = 50;
export const VENTANA_APRENDIZAJE_DIAS = 7;

// ── Escalado ─────────────────────────────────────────────────────────────
//
// 20% por paso, y al menos 48 h entre pasos. El número no es una preferencia:
// un cambio de presupuesto MAYOR al 20% reinicia la fase de aprendizaje, así
// que escalar de golpe cuesta volver a empezar. Y sin las 48 h de espera, Meta
// no llega a estabilizar antes del siguiente empujón.
export const MAX_ESCALADA_PORCENTAJE = 20;
export const HORAS_ENTRE_CAMBIOS = 48;

// ── Criterios de corte ───────────────────────────────────────────────────
//
// Los dos que usan las agencias, y los dos son deliberadamente PACIENTES: el
// error caro no es dejar correr un anuncio malo un día de más, es matar uno
// bueno mientras todavía estaba aprendiendo.
export const SUBIDA_CPA_QUE_PREOCUPA = 25;   // % por encima del objetivo
export const DIAS_DE_CPA_ALTO_PARA_CORTAR = 3;
export const MULTIPLO_DE_GASTO_SIN_VENTAS = 2; // 2x el presupuesto de prueba

// ── Orgánico ─────────────────────────────────────────────────────────────
//
// 4-5 publicaciones por semana, con 1-2 Reels o video nativo. Y la regla que
// más se repite: la CONSISTENCIA gana a la frecuencia. Una página que publica
// cuatro veces todas las semanas rinde más que una que publica siete una
// semana y desaparece dos.
export const POSTS_POR_SEMANA_MIN = 4;
export const POSTS_POR_SEMANA_MAX = 5;
export const VIDEOS_POR_SEMANA_MIN = 1;

/** Alcance orgánico esperado por formato, de mayor a menor. */
export const FORMATOS_POR_ALCANCE = ["reel", "video", "carrusel", "imagen", "texto"] as const;
export type FormatoOrganico = (typeof FORMATOS_POR_ALCANCE)[number];

export interface EstadoConjunto {
  /** Eventos de optimización (compras, mensajes, leads) en los últimos 7 días. */
  conversiones7d: number;
  /** Presupuesto diario actual, en la moneda de la cuenta. */
  presupuestoDiario: number;
  /** Horas desde el último cambio de presupuesto. `null` = nunca se tocó. */
  horasDesdeUltimoCambio: number | null;
  /** Costo por resultado actual. `null` = todavía no hay datos. */
  cpaActual: number | null;
  /** Costo por resultado que el negocio puede pagar. `null` = no se definió. */
  cpaObjetivo: number | null;
  /** Días seguidos con el CPA por encima del objetivo. */
  diasConCpaAlto: number;
  /** Gastado en total por este conjunto. */
  gastoAcumulado: number;
}

export interface Decision {
  accion: "esperar" | "escalar" | "cortar" | "revisar";
  /** En castellano llano y con el número que la justifica. */
  motivo: string;
  /** Solo cuando la acción es "escalar". */
  presupuestoSugerido?: number;
}

/**
 * ¿Este conjunto todavía está aprendiendo?
 *
 * Mientras lo esté, NO se toca. Es la regla que más plata ahorra y la que más
 * se rompe: el impulso natural es corregir lo que se ve mal a los dos días, y
 * a los dos días todavía no se ve nada.
 */
export function estaEnAprendizaje(conversiones7d: number): boolean {
  return conversiones7d < EVENTOS_PARA_SALIR_DE_APRENDIZAJE;
}

/**
 * Qué hacer con un conjunto de anuncios, hoy.
 *
 * El orden de las comprobaciones ES la regla. Primero lo que protege la plata
 * (cortar), después lo que protege el aprendizaje (esperar), y recién al final
 * lo que lo hace crecer (escalar). Invertir ese orden es escalar algo que
 * había que apagar.
 */
export function decidirSobreConjunto(e: EstadoConjunto): Decision {
  // 1. Gastó de más sin vender NADA. Es el único corte que no espera a que
  //    termine el aprendizaje: cero conversiones con el doble del presupuesto
  //    de prueba no es "todavía está aprendiendo", es que no funciona.
  const techoDeGasto = e.presupuestoDiario * MULTIPLO_DE_GASTO_SIN_VENTAS;
  if (e.conversiones7d === 0 && e.gastoAcumulado >= techoDeGasto && techoDeGasto > 0) {
    return {
      accion: "cortar",
      motivo:
        `Gastó ${Math.round(e.gastoAcumulado)} sin una sola conversión, que es ${MULTIPLO_DE_GASTO_SIN_VENTAS}x `
        + `el presupuesto diario (${Math.round(e.presupuestoDiario)}). Pausar y revisar el anuncio o el público.`,
    };
  }

  // 2. El CPA se fue arriba y SE SOSTUVO. Un día malo es ruido; tres días
  //    seguidos por encima del objetivo es una tendencia.
  if (
    e.cpaActual != null && e.cpaObjetivo != null && e.cpaObjetivo > 0
    && e.cpaActual > e.cpaObjetivo * (1 + SUBIDA_CPA_QUE_PREOCUPA / 100)
    && e.diasConCpaAlto >= DIAS_DE_CPA_ALTO_PARA_CORTAR
  ) {
    const exceso = Math.round(((e.cpaActual / e.cpaObjetivo) - 1) * 100);
    return {
      accion: "revisar",
      motivo:
        `El costo por resultado lleva ${e.diasConCpaAlto} días ${exceso}% por encima del objetivo `
        + `(${Math.round(e.cpaActual)} contra ${Math.round(e.cpaObjetivo)}). No subir presupuesto: revisar creativo y público.`,
    };
  }

  // 3. Todavía aprendiendo. Cualquier cambio acá reinicia el reloj.
  if (estaEnAprendizaje(e.conversiones7d)) {
    return {
      accion: "esperar",
      motivo:
        `Lleva ${e.conversiones7d} de ${EVENTOS_PARA_SALIR_DE_APRENDIZAJE} conversiones en ${VENTANA_APRENDIZAJE_DIAS} días: `
        + `sigue en fase de aprendizaje. Tocarlo ahora reinicia lo aprendido.`,
    };
  }

  // 4. Salió de aprendizaje, pero hace poco que se tocó.
  if (e.horasDesdeUltimoCambio != null && e.horasDesdeUltimoCambio < HORAS_ENTRE_CAMBIOS) {
    const faltan = Math.ceil(HORAS_ENTRE_CAMBIOS - e.horasDesdeUltimoCambio);
    return {
      accion: "esperar",
      motivo:
        `Se cambió hace ${Math.round(e.horasDesdeUltimoCambio)} h. Hay que dejar ${HORAS_ENTRE_CAMBIOS} h entre cambios `
        + `para que Meta estabilice: faltan ${faltan} h.`,
    };
  }

  // 5. Listo para crecer.
  return {
    accion: "escalar",
    motivo:
      `${e.conversiones7d} conversiones en ${VENTANA_APRENDIZAJE_DIAS} días y sin cambios recientes: `
      + `se puede subir ${MAX_ESCALADA_PORCENTAJE}%. Más que eso reiniciaría el aprendizaje.`,
    presupuestoSugerido: siguientePresupuesto(e.presupuestoDiario),
  };
}

/**
 * El próximo escalón de presupuesto.
 *
 * Se redondea hacia abajo a propósito: un +20% exacto sobre un número feo da
 * un número más feo, y el admin tiene que poder mirarlo y entenderlo. Redondear
 * hacia ABAJO además garantiza que nunca se pase del 20%, que es el límite que
 * dispara el reinicio.
 */
export function siguientePresupuesto(actual: number): number {
  if (!(actual > 0)) return 0;
  const maximo = actual * (1 + MAX_ESCALADA_PORCENTAJE / 100);
  const paso = actual >= 100_000 ? 5_000 : actual >= 10_000 ? 1_000 : 100;
  return Math.floor(maximo / paso) * paso;
}

/**
 * El plan de escalada completo, de un presupuesto a otro.
 *
 * Sirve para responder "quiero pasar de 20.000 a 100.000/día": no es un cambio,
 * son varios pasos con sus esperas, y decirlo por adelantado evita el salto de
 * golpe que reinicia todo.
 */
export function planDeEscalada(actual: number, objetivo: number): Array<{ presupuesto: number; esperaHoras: number }> {
  const pasos: Array<{ presupuesto: number; esperaHoras: number }> = [];
  let p = actual;
  // Tope de seguridad: sin él, un objetivo absurdo generaría una lista infinita.
  for (let i = 0; i < 30 && p < objetivo; i++) {
    const siguiente = Math.min(siguientePresupuesto(p), objetivo);
    if (siguiente <= p) break; // no avanza: presupuestos muy chicos
    pasos.push({ presupuesto: siguiente, esperaHoras: HORAS_ENTRE_CAMBIOS });
    p = siguiente;
  }
  return pasos;
}

// ═══════════════════════════════════════════════════════════════════════
// ORGÁNICO
// ═══════════════════════════════════════════════════════════════════════

/**
 * ¿Conviene impulsar (boost) esta publicación o armar un anuncio?
 *
 * La regla de 2026, y es contraintuitiva: el algoritmo premia primero lo que
 * ya funciona orgánicamente. Impulsar un post que YA está rindiendo extiende
 * su alcance mucho más barato que arrancar un anuncio de cero. Pero impulsar
 * uno que no rinde es pagar por distribuir algo que nadie quiso.
 *
 * Y para VENDER --leads, conversiones, pruebas A/B-- el boost no alcanza: no
 * tiene los objetivos ni la segmentación de un anuncio real.
 */
export function convieneImpulsar(post: {
  /** Interacciones (reacciones + comentarios + compartidos). */
  interacciones: number;
  alcance: number;
  /** Qué se busca: dar a conocer o vender. */
  objetivo: "reconocimiento" | "conversion";
}): { impulsar: boolean; motivo: string } {
  if (post.objetivo === "conversion") {
    return {
      impulsar: false,
      motivo:
        "Para vender no alcanza con impulsar: un post impulsado no tiene objetivo de conversión ni "
        + "segmentación real. Armá un anuncio con `crear_anuncio`.",
    };
  }
  if (post.alcance < 100) {
    return { impulsar: false, motivo: `Solo ${post.alcance} personas lo vieron: muy poca muestra para saber si sirve.` };
  }
  // 2% de interacción sobre alcance es el piso de "esto le interesó a alguien".
  const tasa = (post.interacciones / post.alcance) * 100;
  if (tasa < 2) {
    return {
      impulsar: false,
      motivo:
        `Interacción del ${tasa.toFixed(1)}% (${post.interacciones} de ${post.alcance}): no funcionó solo, `
        + `y pagar por distribuirlo no lo va a mejorar. Probá otro contenido.`,
    };
  }
  return {
    impulsar: true,
    motivo:
      `Interacción del ${tasa.toFixed(1)}%: ya funciona solo. Impulsarlo extiende ese alcance más barato `
      + `que arrancar un anuncio de cero.`,
  };
}

/** ¿Está publicando lo suficiente, y con el formato que más alcance tiene? */
export function revisarCadenciaOrganica(ultimaSemana: { formato: FormatoOrganico }[]): {
  alDia: boolean;
  recomendacion: string;
} {
  const total = ultimaSemana.length;
  const videos = ultimaSemana.filter((p) => p.formato === "reel" || p.formato === "video").length;

  if (total < POSTS_POR_SEMANA_MIN) {
    return {
      alDia: false,
      recomendacion:
        `${total} publicaciones esta semana. La cadencia que sostiene el alcance es de `
        + `${POSTS_POR_SEMANA_MIN} a ${POSTS_POR_SEMANA_MAX}, y lo que más pesa no es el número sino la `
        + `constancia: publicar 4 todas las semanas rinde más que 7 una semana y ninguna la siguiente.`,
    };
  }
  if (videos < VIDEOS_POR_SEMANA_MIN) {
    return {
      alDia: false,
      recomendacion:
        `${total} publicaciones, pero ningún video. Los Reels y el video nativo son los formatos de más `
        + `alcance orgánico; el texto y los enlaces, los de menos. Sumá al menos ${VIDEOS_POR_SEMANA_MIN} por semana.`,
    };
  }
  return {
    alDia: true,
    recomendacion: `${total} publicaciones con ${videos} video(s): la cadencia está bien. Sostenerla es lo que importa.`,
  };
}
