/**
 * ============================================================
 * LAS FRANJAS QUE SÍ VENDEN Y LAS QUE SOLO GASTAN
 * ============================================================
 *
 * El admin lo pidió así: apagar "en las noches o en los tiempos muertos que no
 * van a generar visitas" y reactivar "en los momentos del día más abundante".
 * En el oficio eso se llama *dayparting*, y es de las pocas optimizaciones que
 * devuelven plata de forma medible: un anuncio que corre 24 horas gasta las 24,
 * pero rara vez vende en las 24.
 *
 * ── La trampa, y por qué este archivo existe ─────────────────────────────
 *
 * Lo natural sería escribir "de 1 a 7 de la mañana está muerto" y listo. Sería
 * un error caro y silencioso. Hay negocios donde la madrugada es la mejor hora:
 * el que le vende a gente que trabaja de noche, el que exporta a otro huso, el
 * de entretenimiento. Apagarles la madrugada les corta la mejor franja y nadie
 * se entera nunca, porque el gasto baja y el panel se ve "más eficiente".
 *
 * Así que acá NO hay ninguna hora escrita a mano. Todo sale del historial real
 * de la cuenta (`breakdowns=hourly_stats_aggregated_by_advertiser_time_zone`).
 * Y cuando no hay historial suficiente, la respuesta es "no sé todavía" y no se
 * toca nada. Es el mismo criterio que ya gobierna al agente de anuncios: una
 * decisión sin muestra es una corazonada, y las corazonadas acá gastan plata
 * ajena.
 */

export interface HoraDelDia {
  /** 0..23, en la zona horaria de la CUENTA de anuncios. */
  hora: number;
  gasto: number;
  impresiones: number;
  clics: number;
  /** Compras, mensajes iniciados o leads: lo que la campaña busca. */
  resultados: number;
}

export interface Veredicto {
  /** false = no hay con qué decidir. Nadie toca nada. */
  suficiente: boolean;
  /** En castellano llano, con el número que lo justifica. */
  porQue: string;
  /** Horas donde se gasta sin resultado. Candidatas a apagar. */
  muertas: number[];
  /** Horas donde el dinero rinde mejor. */
  pico: number[];
  /** Costo por resultado de cada hora con muestra, para poder auditarlo. */
  cpaPorHora: Array<{ hora: number; gasto: number; resultados: number; cpa: number | null }>;
}

/**
 * Cuánto hay que haber gastado en una hora para poder juzgarla.
 *
 * No es un monto fijo --serviría para pesos colombianos y no para dólares--
 * sino una proporción del gasto total del día promedio. Una hora que se llevó
 * menos del 2% del gasto no tiene muestra para afirmar nada sobre ella.
 */
const PARTE_MINIMA_DEL_GASTO = 0.02;

/**
 * Resultados totales mínimos en toda la ventana para que el análisis valga.
 *
 * Con menos de 10 conversiones repartidas en 24 horas, la "mejor hora" es
 * ruido: basta una compra de casualidad a las 4am para que la madrugada parezca
 * el momento de oro. Diez es poco para presumir y suficiente para no hacer
 * papelones.
 */
export const RESULTADOS_MINIMOS = 10;

/**
 * Tope de horas que se pueden apagar.
 *
 * Si el análisis dice que 20 de 24 horas están muertas, el problema no es el
 * horario: es la campaña entera, y de eso se ocupa la protección de gasto
 * (`ad-growth-agent.ts`). Un dayparting que apaga casi todo el día es una
 * campaña pausada disfrazada de optimización, y nadie la revisa porque "está
 * optimizada".
 */
export const MAX_HORAS_APAGADAS = 10;

/**
 * Qué franjas conviene apagar y cuáles conviene aprovechar.
 *
 * `horas` es el historial ya agregado por hora del día, sumando todos los días
 * de la ventana. Cuanto más larga la ventana, más confiable -- 14 días es un
 * buen punto de partida porque cubre dos veces cada día de la semana.
 */
export function analizarFranjas(horas: HoraDelDia[]): Veredicto {
  const vacio: Veredicto = { suficiente: false, porQue: "", muertas: [], pico: [], cpaPorHora: [] };

  if (!Array.isArray(horas) || horas.length === 0) {
    return { ...vacio, porQue: "todavía no hay historial por hora en esta cuenta" };
  }

  const gastoTotal = horas.reduce((s, h) => s + (h.gasto || 0), 0);
  const resultadosTotal = horas.reduce((s, h) => s + (h.resultados || 0), 0);

  if (gastoTotal <= 0) {
    return { ...vacio, porQue: "no hay gasto registrado en la ventana analizada" };
  }
  if (resultadosTotal < RESULTADOS_MINIMOS) {
    return {
      ...vacio,
      porQue:
        `hay ${resultadosTotal} resultado${resultadosTotal === 1 ? "" : "s"} en toda la ventana y hacen falta ` +
        `${RESULTADOS_MINIMOS} para distinguir una buena hora del azar`,
    };
  }

  const cpaGeneral = gastoTotal / resultadosTotal;
  const umbralDeMuestra = gastoTotal * PARTE_MINIMA_DEL_GASTO;

  const cpaPorHora = horas
    .map((h) => ({
      hora: h.hora,
      gasto: h.gasto || 0,
      resultados: h.resultados || 0,
      cpa: (h.resultados || 0) > 0 ? (h.gasto || 0) / h.resultados : null,
    }))
    .sort((a, b) => a.hora - b.hora);

  // ── Las muertas ────────────────────────────────────────────────────────
  //
  // Dos formas de estarlo, y las dos exigen muestra:
  //   · gastó lo suficiente para juzgarla y NO trajo un solo resultado;
  //   · trajo resultados, pero a más del DOBLE de lo que cuestan en promedio.
  //
  // El doble y no "peor que el promedio": por definición la mitad de las horas
  // está por debajo del promedio, y apagar la mitad del día porque es la mitad
  // peor es una forma segura de terminar sin ninguna hora encendida.
  const candidatas = cpaPorHora
    .filter((h) => h.gasto >= umbralDeMuestra)
    .filter((h) => h.cpa === null || h.cpa > cpaGeneral * 2)
    // Se apagan primero las peores: si el tope recorta, que recorte por abajo.
    .sort((a, b) => (b.cpa ?? Infinity) - (a.cpa ?? Infinity));

  const muertas = candidatas.slice(0, MAX_HORAS_APAGADAS).map((h) => h.hora).sort((a, b) => a - b);

  // ── Las buenas ─────────────────────────────────────────────────────────
  //
  // Con muestra y con un costo por resultado mejor que el promedio general.
  const pico = cpaPorHora
    .filter((h) => h.gasto >= umbralDeMuestra && h.cpa !== null && h.cpa <= cpaGeneral)
    .sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity))
    .slice(0, 6)
    .map((h) => h.hora)
    .sort((a, b) => a - b);

  if (pico.length === 0) {
    // Ninguna hora rinde por encima del promedio con muestra suficiente. Eso no
    // es un problema de horario y apagar franjas no lo arregla.
    return {
      ...vacio,
      cpaPorHora,
      porQue: "ninguna franja rinde mejor que el promedio: el problema no es el horario",
    };
  }

  const recortadas = candidatas.length - muertas.length;
  return {
    suficiente: true,
    muertas,
    pico,
    cpaPorHora,
    porQue:
      `sobre ${resultadosTotal} resultados y un costo promedio de ${cpaGeneral.toFixed(0)}, ` +
      `${muertas.length} franja${muertas.length === 1 ? "" : "s"} gasta${muertas.length === 1 ? "" : "n"} sin devolver` +
      (recortadas > 0 ? ` (había ${candidatas.length}, se limita a ${MAX_HORAS_APAGADAS} por seguridad)` : "") +
      `; las mejores son ${pico.map((h) => `${h}h`).join(", ")}`,
  };
}

/**
 * ¿Toca estar encendido a esta hora?
 *
 * Se pregunta con la hora local de la CUENTA. Devuelve el motivo además del
 * sí/no porque el aviso al admin tiene que poder decir por qué se apagó -- un
 * "se pausó tu campaña" sin explicación es lo que hace que la gente desconfíe
 * de la automatización y la apague entera.
 */
export function deberiaEstarEncendido(
  hora: number,
  veredicto: Veredicto,
): { encendido: boolean; porQue: string } {
  if (!veredicto.suficiente) {
    // Sin datos, se deja como está. La automatización nunca es la que empieza
    // a apagar cosas por las dudas.
    return { encendido: true, porQue: "no hay datos suficientes para apagar nada" };
  }
  if (veredicto.muertas.includes(hora)) {
    return { encendido: false, porQue: `las ${hora}h gastan sin traer resultados en esta cuenta` };
  }
  return { encendido: true, porQue: `las ${hora}h no están entre las franjas muertas` };
}

/**
 * Convierte la respuesta cruda de Meta en horas comparables.
 *
 * Meta devuelve la franja como texto `"13:00:00 - 13:59:59"` y una fila por
 * cada día y hora; acá se suman todos los días de la misma hora, que es lo
 * único que permite comparar "las 13" contra "las 3" sin que un día flojo
 * decida por todos.
 */
export function agruparPorHora(filas: any[]): HoraDelDia[] {
  const acc = new Map<number, HoraDelDia>();

  for (const f of filas || []) {
    const etiqueta = String(f?.hourly_stats_aggregated_by_advertiser_time_zone || "");
    const m = /^(\d{1,2}):/.exec(etiqueta);
    if (!m) continue;
    const hora = Number(m[1]);
    if (!Number.isInteger(hora) || hora < 0 || hora > 23) continue;

    if (!acc.has(hora)) acc.set(hora, { hora, gasto: 0, impresiones: 0, clics: 0, resultados: 0 });
    const h = acc.get(hora)!;

    h.gasto += Number(f.spend) || 0;
    h.impresiones += Number(f.impressions) || 0;
    h.clics += Number(f.clicks) || 0;

    // Mismos tipos de acción que usa getCampaignInsights, para que "resultado"
    // signifique lo mismo en las dos pantallas. Que dos partes del sistema
    // cuenten distinto el mismo número es peor que no contarlo.
    const acciones: Array<{ action_type: string; value: string }> = f.actions || [];
    const relevantes = [
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "lead",
      "onsite_conversion.messaging_conversation_started_7d",
    ];
    h.resultados += acciones
      .filter((a) => relevantes.includes(a.action_type))
      .reduce((s, a) => s + (Number(a.value) || 0), 0);
  }

  return [...acc.values()].sort((a, b) => a.hora - b.hora);
}
