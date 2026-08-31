/**
 * ============================================================
 * LA HORA DEL NEGOCIO, NO LA DEL SERVIDOR
 * ============================================================
 *
 * Todo lo que se automatiza acá se piensa en hora LOCAL: "publicar el martes a
 * las 19", "apagar los anuncios a la 1 de la mañana". Y el servidor corre en
 * UTC, en un VPS que puede estar en cualquier lado.
 *
 * La diferencia no es un detalle de presentación. Un negocio en Colombia
 * (UTC-5) que pide apagar a la 1am, con la cuenta mal hecha apaga a las 8pm --
 * o sea justo en la hora de más venta. Es la clase de error que no rompe nada,
 * no aparece en ningún log, y simplemente hace perder plata todas las noches.
 *
 * ── Por qué a mano y no con una librería ─────────────────────────────────
 *
 * `Intl.DateTimeFormat` con `timeZone` ya viene en Node y conoce el horario de
 * verano de todas las zonas, así que agregar una dependencia solo para esto
 * sería sumar superficie sin ganar corrección. Lo único que falta es el camino
 * inverso --de hora local a instante UTC-- que es lo que hace `instanteEnZona`.
 */

/**
 * Cuántos minutos está adelantada la zona respecto de UTC en ESE instante.
 *
 * Se pide un instante concreto y no solo la zona porque el desfase cambia con
 * el horario de verano: la misma zona es -3 en enero y -4 en julio.
 */
export function desfaseEnMinutos(zona: string, cuando: Date): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const parte of f.formatToParts(cuando)) p[parte.type] = parte.value;

  // `hour` puede venir "24" para la medianoche en algunas versiones de ICU.
  const hora = Number(p.hour) % 24;
  const comoSiFueraUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    hora, Number(p.minute), Number(p.second),
  );
  // Se descartan los milisegundos del instante original porque el formateador
  // no los devuelve: sin esto el desfase sale con un resto de hasta 999ms.
  const sinMilis = Math.floor(cuando.getTime() / 1000) * 1000;
  return (comoSiFueraUtc - sinMilis) / 60_000;
}

/**
 * El instante UTC que corresponde a una hora de pared en esa zona.
 *
 * Las DOS pasadas no son por las dudas: son necesarias. La primera calcula el
 * desfase suponiendo que la hora pedida es UTC, lo que puede caer del lado
 * equivocado de un cambio de horario de verano; la segunda lo recalcula ya
 * parado en el instante correcto. Con una sola pasada, dos veces al año las
 * publicaciones saldrían con una hora de corrimiento.
 */
export function instanteEnZona(
  zona: string,
  anio: number,
  mes: number,
  dia: number,
  hora: number,
  minuto = 0,
): Date {
  const pared = Date.UTC(anio, mes - 1, dia, hora, minuto);
  let t = pared;
  for (let i = 0; i < 2; i++) {
    t = pared - desfaseEnMinutos(zona, new Date(t)) * 60_000;
  }
  return new Date(t);
}

/** Los componentes de la hora local del negocio en un instante dado. */
export function horaLocal(zona: string, cuando = new Date()): {
  anio: number; mes: number; dia: number; hora: number; minuto: number;
  /** 1 = lunes … 7 = domingo, igual que el calendario de contenido. */
  diaSemana: number;
} {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: zona, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const parte of f.formatToParts(cuando)) p[parte.type] = parte.value;

  const DIAS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    anio: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    diaSemana: DIAS[p.weekday] ?? 1,
  };
}

/**
 * La zona horaria del negocio, con un respaldo que no miente.
 *
 * Si el negocio no la configuró se usa la del servidor, no una fija: un
 * default escrito a mano --por ejemplo "America/Bogota"-- le acertaría al
 * negocio que vio nacer este código y le erraría a todos los demás, que es
 * exactamente el problema que este proyecto viene corrigiendo en otras partes.
 */
export function zonaValida(zona?: string | null): string {
  const z = String(zona || "").trim();
  if (!z) return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return z;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
}

/**
 * La próxima vez que sean las `hora:minuto` del `diaSemana` pedido.
 *
 * Si esa hora ya pasó esta semana, devuelve la de la semana que viene: sirve
 * para agendar sin tener que preguntarse en qué día se está parado.
 */
export function proximoDiaYHora(
  zona: string,
  diaSemana: number,
  hora: number,
  minuto = 0,
  desde = new Date(),
): Date {
  const hoy = horaLocal(zona, desde);
  let faltan = (diaSemana - hoy.diaSemana + 7) % 7;

  if (faltan === 0) {
    const yaPaso = hoy.hora > hora || (hoy.hora === hora && hoy.minuto >= minuto);
    if (yaPaso) faltan = 7;
  }

  // Se avanza sobre el CALENDARIO, no sumando 86.400.000 milisegundos: un día
  // con cambio de horario dura 23 o 25 horas, y sumar milisegundos correría la
  // publicación una hora esas dos veces al año.
  const destino = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + faltan));
  return instanteEnZona(
    zona,
    destino.getUTCFullYear(),
    destino.getUTCMonth() + 1,
    destino.getUTCDate(),
    hora,
    minuto,
  );
}
