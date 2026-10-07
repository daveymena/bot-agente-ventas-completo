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
    if (existente.estado !== "pendiente") return { creado: false, id: existente.id };
    await db
      .update(trabajosProgramados)
      .set({
        correAt: toDbDate(t.correAt) as any,
        datos: t.datos ?? {},
        repiteCadaMin: t.repiteCadaMin ?? null,
        actualizadoAt: toDbDate(new Date()) as any,
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
        ? new Date(ahora.getTime() + t.repiteCadaMin * 60_000)
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
      await db
        .update(trabajosProgramados)
        .set({
          estado: seRindio ? "fallado" : "pendiente",
          ...(seRindio ? {} : { correAt: toDbDate(new Date(ahora.getTime() + espera * 60_000)) as any }),
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
