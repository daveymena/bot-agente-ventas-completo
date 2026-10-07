import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db, trabajosProgramados } from "@workspace/db";
import { toDbDate } from "./date-utils";
import { logger } from "./logger";
import { cuandoLaBaseEsteLista } from "./esperar-base";

/**
 * ============================================================
 * EL PROGRAMADOR — QUÉ SE HACE Y A QUÉ HORA
 * ============================================================
 *
 * El sistema ya sabía hacer cosas: publicar en la página, armar el plan de
 * contenido de la semana, pausar una campaña. Lo que no tenía era un reloj
 * capaz de decir "esto, el martes a las 19:00". Este archivo es ese reloj.
 *
 * ── Por qué no alcanzaba con setInterval ─────────────────────────────────
 *
 * `ad-growth-agent.ts` usa `setInterval` y para "cada 30 minutos" está bien.
 * Pero tiene un defecto que este proyecto YA pagó y que está documentado en
 * ese mismo archivo: cada despliegue reinicia el reloj. Entre despliegues
 * seguidos, el guardián de gasto no llegaba a correr nunca y su historial
 * marcaba "0 revisiones" -- el único mecanismo que frenaba dinero saliendo era
 * el que nunca se despertaba.
 *
 * Con la hora guardada en la base eso no puede pasar: el trabajo sigue
 * pendiente con su fecha, y el primer arranque que llegue lo ejecuta.
 *
 * ── La regla que gobierna qué puede hacer solo ───────────────────────────
 *
 * Se hereda tal cual del agente de anuncios, y no se relaja: **lo que AHORRA
 * plata se hace solo y se avisa; lo que GASTA plata espera el "sí"**. Un
 * programador que puede encender campañas de madrugada sin permiso es una
 * forma muy eficiente de vaciarle la cuenta a un cliente.
 *
 * La única excepción, deliberada, es el horario de pauta: cuando el admin
 * aprueba UNA VEZ la franja "de 8 a 23", encender a las 8 no es una decisión
 * nueva, es cumplir la que ya tomó. Pedir permiso cada mañana a las 8 haría
 * inútil la automatización. Ver `agente-horario.ts`.
 */

export interface ContextoDeTrabajo {
  tenantId: number;
  datos: Record<string, any>;
  /** La fila, por si el manejador necesita saber si es un reintento. */
  intentos: number;
}

export type Manejador = (ctx: ContextoDeTrabajo) => Promise<Record<string, any> | void>;

const MANEJADORES = new Map<string, Manejador>();

/**
 * Un tipo de trabajo y quién lo atiende.
 *
 * Si llega la hora de un trabajo cuyo tipo nadie registró, NO se marca como
 * hecho: se deja pendiente y se avisa. Marcarlo hecho escondería el problema
 * --el post nunca se publicó y el panel diría que sí-- y este proyecto ya
 * tuvo esa clase de silencio con el agente que "vigilaba sin poder avisar".
 */
export function registrarManejador(tipo: string, fn: Manejador): void {
  MANEJADORES.set(tipo, fn);
}

export function tiposRegistrados(): string[] {
  return [...MANEJADORES.keys()].sort();
}

export interface NuevoTrabajo {
  tenantId: number;
  tipo: string;
  /** Identificador estable. Ver la nota sobre duplicados en el esquema. */
  clave: string;
  correAt: Date;
  datos?: Record<string, any>;
  repiteCadaMin?: number | null;
}

/**
 * Deja un trabajo agendado.
 *
 * Si la clave ya existe, NO se duplica. Se reprograma solo si el trabajo sigue
 * pendiente: uno ya ejecutado se queda como está, porque volver a ponerlo en
 * "pendiente" lo publicaría dos veces.
 */
export async function programar(t: NuevoTrabajo): Promise<{ creado: boolean; id?: number }> {
  const [existente] = await db
    .select()
    .from(trabajosProgramados)
    .where(eq(trabajosProgramados.clave, t.clave))
    .limit(1);

  if (existente) {
    // Un trabajo REPETITIVO que se rindió (o quedó colgado) se revive al
    // volver a programarlo: son rondas (revisión diaria, barrido), no
    // publicaciones únicas, así que repetirlas no duplica nada. Sin esto,
    // `activarAgenteOrganico` sobre un negocio cuya ronda diaria había
    // fallado tres veces no la encendía nunca más.
    const rondaCaida = !!existente.repiteCadaMin && ["fallado", "corriendo"].includes(String(existente.estado))
      && (existente.estado === "fallado" || esHuerfano(existente, new Date()));
    if (existente.estado !== "pendiente" && !rondaCaida) return { creado: false, id: existente.id };
    await db
      .update(trabajosProgramados)
      .set({
        correAt: toDbDate(t.correAt) as any,
        datos: t.datos ?? {},
        repiteCadaMin: t.repiteCadaMin ?? null,
        actualizadoAt: toDbDate(new Date()) as any,
        ...(rondaCaida ? { estado: "pendiente", intentos: 0 } : {}),
      })
      .where(eq(trabajosProgramados.id, existente.id));
    return { creado: false, id: existente.id };
  }

  try {
    const [fila] = await db
      .insert(trabajosProgramados)
      .values({
        tenantId: t.tenantId,
        tipo: t.tipo,
        clave: t.clave,
        correAt: toDbDate(t.correAt) as any,
        datos: t.datos ?? {},
        repiteCadaMin: t.repiteCadaMin ?? null,
      })
      .returning();
    return { creado: true, id: fila?.id };
  } catch (err) {
    // Carrera con otra instancia: el índice único hizo su trabajo. No es un
    // error que valga la pena reportar -- es exactamente lo que se le pidió.
    logger.debug({ clave: t.clave }, "[Programador] La clave ya existía, no se duplica");
    return { creado: false };
  }
}

export async function cancelar(clave: string): Promise<boolean> {
  const filas = await db
    .update(trabajosProgramados)
    .set({ estado: "cancelado", actualizadoAt: toDbDate(new Date()) as any })
    .where(and(eq(trabajosProgramados.clave, clave), eq(trabajosProgramados.estado, "pendiente")))
    .returning();
  return filas.length > 0;
}

const MAX_INTENTOS = 3;

/**
 * Cuánto puede estar un trabajo en "corriendo" antes de darlo por huérfano.
 *
 * `tomar()` lo pasa a "corriendo" y solo el final de `correrVencidos` lo saca
 * de ahí. Si el proceso muere en el medio --y cada deploy lo mata-- la fila se
 * queda en "corriendo" PARA SIEMPRE: nadie la vuelve a mirar (solo se buscan
 * "pendiente") y `programar()` con la misma clave tampoco la toca. Una ronda
 * repetitiva (la revisión diaria del orgánico, el barrido de aprobadas) moría
 * así en silencio con el primer deploy que la agarrara a mitad.
 */
const HUERFANO_MIN = 30;

function esHuerfano(t: { estado: string; actualizadoAt?: any }, ahora: Date): boolean {
  if (t.estado !== "corriendo") return false;
  const desde = t.actualizadoAt ? new Date(t.actualizadoAt as any).getTime() : 0;
  return !Number.isFinite(desde) || ahora.getTime() - desde >= HUERFANO_MIN * 60_000;
}

/**
 * La próxima vuelta de una ronda, anclada a SU hora y no a cuándo terminó.
 *
 * Antes era `ahora + repite`: la revisión de las 6:00 que corría a las 6:01
 * quedaba para las 6:01 de mañana, después 6:02... y cada caída del servidor
 * la corría horas. Ahora se suma el período a la hora pactada hasta caer en
 * el futuro.
 */
export function proximaVuelta(correAt: Date, repiteCadaMin: number, ahora: Date): Date {
  const paso = repiteCadaMin * 60_000;
  const base = correAt.getTime();
  if (!Number.isFinite(base) || paso <= 0) return new Date(ahora.getTime() + Math.max(paso, 60_000));
  const saltos = Math.max(1, Math.floor((ahora.getTime() - base) / paso) + 1);
  return new Date(base + saltos * paso);
}

/**
 * Devuelve a la vida lo que un reinicio dejó colgado en "corriendo".
 *
 * - Una ronda repetitiva vuelve a "pendiente" para ya: repetir una ronda no
 *   duplica nada.
 * - Un trabajo de una sola vez (una publicación, una acción de Atlas) queda
 *   "fallado" con el motivo a la vista. NO se reintenta solo: pudo haber
 *   salido antes de que el proceso muriera, y publicar dos veces en la página
 *   de un cliente es peor que avisar que hay que revisarlo.
 */
export async function rescatarHuerfanos(ahora = new Date()): Promise<number> {
  const corriendo = await db
    .select()
    .from(trabajosProgramados)
    .where(eq(trabajosProgramados.estado, "corriendo"));
  let rescatados = 0;
  for (const t of corriendo) {
    if (!esHuerfano(t as any, ahora)) continue;
    const ronda = !!t.repiteCadaMin;
    const filas = await db
      .update(trabajosProgramados)
      .set({
        estado: ronda ? "pendiente" : "fallado",
        ...(ronda ? { correAt: toDbDate(ahora) as any, intentos: 0 } : {}),
        error: ronda
          ? "Se interrumpió por un reinicio del servidor; se retomó."
          : "Se interrumpió por un reinicio del servidor a mitad de la ejecución. No se reintenta solo para no duplicar: revisá si llegó a hacerse y volvé a programarlo si no.",
        actualizadoAt: toDbDate(new Date()) as any,
      })
      .where(and(eq(trabajosProgramados.id, t.id), eq(trabajosProgramados.estado, "corriendo")))
      .returning();
    if (filas.length) {
      rescatados++;
      logger.warn({ tipo: t.tipo, clave: t.clave, ronda }, "[Programador] Trabajo huérfano (quedó 'corriendo' tras un reinicio)");
    }
  }
  return rescatados;
}

/**
 * Toma el trabajo para esta instancia, o devuelve false si otro se lo llevó.
 *
 * El `and(id, estado='pendiente')` es el candado, y es portable: Postgres
 * tiene `FOR UPDATE SKIP LOCKED` pero sqlite --donde corren las pruebas-- no,
 * y un candado que solo existe en producción es un candado que nunca se probó.
 * Acá gana el primero que logre cambiar el estado; el segundo recibe cero
 * filas y sigue de largo.
 */
async function tomar(id: number): Promise<boolean> {
  const filas = await db
    .update(trabajosProgramados)
    .set({
      estado: "corriendo",
      intentos: sql`${trabajosProgramados.intentos} + 1`,
      actualizadoAt: toDbDate(new Date()) as any,
    })
    .where(and(eq(trabajosProgramados.id, id), eq(trabajosProgramados.estado, "pendiente")))
    .returning();
  return filas.length > 0;
}

/**
 * Corre todo lo que ya venció. Devuelve cuántos se ejecutaron.
 *
 * `ahora` es parámetro y no `new Date()` adentro para que las pruebas puedan
 * adelantar el reloj sin esperar.
 */
export async function correrVencidos(ahora = new Date(), tope = 20): Promise<{
  corridos: number;
  fallados: number;
  sinManejador: string[];
}> {
  await rescatarHuerfanos(ahora).catch((err) =>
    logger.warn({ err }, "[Programador] No se pudieron revisar los trabajos huérfanos"));

  const pendientes = await db
    .select()
    .from(trabajosProgramados)
    .where(
      and(
        eq(trabajosProgramados.estado, "pendiente"),
        lte(trabajosProgramados.correAt, toDbDate(ahora) as any),
      ),
    )
    .orderBy(asc(trabajosProgramados.correAt))
    .limit(tope);

  let corridos = 0;
  let fallados = 0;
  const sinManejador: string[] = [];

  for (const t of pendientes) {
    const fn = MANEJADORES.get(t.tipo);
    if (!fn) {
      // Se deja PENDIENTE a propósito: si el tipo lo registra un módulo que
      // todavía no cargó, en la próxima vuelta corre. Marcarlo hecho sería
      // decir que se publicó algo que nunca salió.
      if (!sinManejador.includes(t.tipo)) sinManejador.push(t.tipo);
      continue;
    }

    if (!(await tomar(t.id))) continue;

    try {
      const resultado = await fn({ tenantId: t.tenantId, datos: t.datos || {}, intentos: t.intentos + 1 });

      const proxima = t.repiteCadaMin
        ? proximaVuelta(new Date(t.correAt as any), t.repiteCadaMin, ahora)
        : null;

      await db
        .update(trabajosProgramados)
        .set({
          // Un trabajo repetitivo vuelve a "pendiente" con su nueva hora; uno
          // de una sola vez queda "hecho" y no se toca más.
          estado: proxima ? "pendiente" : "hecho",
          ...(proxima ? { correAt: toDbDate(proxima) as any } : {}),
          resultado: (resultado as any) ?? null,
          error: null,
          actualizadoAt: toDbDate(new Date()) as any,
        })
        .where(eq(trabajosProgramados.id, t.id));
      corridos++;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      const intentos = t.intentos + 1;
      const seRindio = intentos >= MAX_INTENTOS;

      // Reintento con espera creciente: 5, 25 minutos. Un fallo suele ser la
      // API de Meta caída o un token vencido, y reintentar de inmediato no
      // arregla ninguna de las dos -- solo gasta cuota.
      const espera = 5 * Math.pow(5, intentos - 1);
      // Una RONDA que se rinde no se apaga para siempre: pierde esta vuelta y
      // queda para la siguiente, con el error a la vista. Antes quedaba
      // "fallada" y la revisión diaria del orgánico no volvía a correr nunca.
      const rondaSiguiente = seRindio && t.repiteCadaMin
        ? proximaVuelta(new Date(t.correAt as any), t.repiteCadaMin, ahora)
        : null;
      await db
        .update(trabajosProgramados)
        .set({
          estado: seRindio && !rondaSiguiente ? "fallado" : "pendiente",
          ...(rondaSiguiente
            ? { correAt: toDbDate(rondaSiguiente) as any, intentos: 0 }
            : seRindio ? {} : { correAt: toDbDate(new Date(ahora.getTime() + espera * 60_000)) as any }),
          error: mensaje.slice(0, 500),
          actualizadoAt: toDbDate(new Date()) as any,
        })
        .where(eq(trabajosProgramados.id, t.id));

      fallados++;
      logger.error(
        { err, tipo: t.tipo, clave: t.clave, intentos, seRindio },
        "[Programador] Falló un trabajo",
      );
    }
  }

  if (sinManejador.length) {
    logger.warn({ sinManejador }, "[Programador] Hay trabajos vencidos sin manejador registrado");
  }
  return { corridos, fallados, sinManejador };
}

// ── Arranque ──────────────────────────────────────────────────────────────
let andando = false;

/** Cada cuánto mira si hay algo vencido. */
const VUELTA_MS = 60 * 1000;

/**
 * Los 90 segundos de gracia son para no competir con el arranque --WhatsApp
 * reconectando, migraciones, carga de claves-- que es el mismo motivo por el
 * que el agente de anuncios espera 2 minutos.
 */
const GRACIA_MS = 90 * 1000;

export function iniciarProgramador(): void {
  if (andando) return;
  andando = true;

  const vuelta = () => {
    cuandoLaBaseEsteLista().then(() => correrVencidos()).then(
      (r) => {
        if (r.corridos || r.fallados) {
          logger.info({ ...r }, "[Programador] Vuelta completa");
        }
      },
      (err) => logger.error({ err }, "[Programador] Error en la vuelta"),
    );
  };

  setTimeout(() => {
    // Al arrancar corre una vez enseguida: si el servidor estuvo caído, hay
    // trabajos vencidos esperando y no tiene sentido hacerlos esperar otro
    // minuto más.
    vuelta();
    setInterval(vuelta, VUELTA_MS).unref?.();
  }, GRACIA_MS).unref?.();

  logger.info({ tipos: tiposRegistrados() }, "[Programador] Iniciado, revisa cada minuto");
}

/** Solo para las pruebas: deja el registro limpio entre casos. */
export function _limpiarManejadores(): void {
  MANEJADORES.clear();
  andando = false;
}
