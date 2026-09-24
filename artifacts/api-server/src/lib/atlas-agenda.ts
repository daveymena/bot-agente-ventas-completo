/**
 * ============================================================
 * LA AGENDA DE ATLAS — DEJAR ACCIONES PROGRAMADAS
 * ============================================================
 *
 * Pedido del admin (24-09-2026): que Atlas pueda dejar una actividad
 * programada para un horario -- publicar en la página de Facebook, activar o
 * pausar un anuncio, cambiar un presupuesto -- y reprogramarla o cancelarla.
 *
 * No hay un reloj nuevo: se usa el programador que ya existe
 * (`lib/programador.ts`), que guarda los trabajos en la base, sobrevive a los
 * reinicios y no duplica. Acá solo se agrega UN tipo de trabajo,
 * `atlas_accion`, que a la hora pactada ejecuta la herramienta de Atlas con
 * los argumentos que el admin ya aprobó.
 *
 * ── El permiso ───────────────────────────────────────────────────────────
 *
 * Mismo criterio que la guardia horaria: el admin aprueba UNA VEZ, al
 * programar (programar_accion pasa por la confirmación como cualquier cambio).
 * A la hora pactada no se vuelve a preguntar -- ejecutar es cumplir lo que ya
 * decidió. Por eso lo irreversible (borrar) y el código NO se pueden
 * programar: una confirmación de hace tres días no alcanza para eso.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, trabajosProgramados } from "@workspace/db";
import { programar, registrarManejador } from "./programador";
import { instanteEnZona, zonaValida, horaLocal } from "./zona-horaria";
import { tenantManager } from "./tenantManager";
import { toDbDate } from "./date-utils";
import { logger } from "./logger";

export const TIPO_ACCION_DE_ATLAS = "atlas_accion";

/** Las herramientas de la agenda misma: programarlas sería una recursión. */
export const HERRAMIENTAS_DE_AGENDA = new Set(["programar_accion", "agenda_ver", "agenda_cambiar"]);

const MAX_DIAS = 90;
const MIN_REPETICION = 15;

/** ¿Se puede dejar esta herramienta para después? Devuelve el motivo si no. */
export function porQueNoSePuedeProgramar(
  herramienta: string,
  o: { existe: boolean; esLectura: boolean; esCodigo: boolean },
): string | null {
  if (!o.existe) return `La herramienta "${herramienta}" no existe.`;
  if (HERRAMIENTAS_DE_AGENDA.has(herramienta)) return "No se puede programar una acción de la agenda misma.";
  if (o.esCodigo) return "Los cambios de código no se programan: se hacen en el momento, con el admin mirando.";
  if (/delete|borrar|eliminar/i.test(herramienta)) {
    return "Lo irreversible (borrar) no se programa: una confirmación de días antes no alcanza. Pedilo en el momento.";
  }
  if (o.esLectura) return "Esa herramienta solo consulta: programarla no cambia nada. Programá la acción que querés que ocurra.";
  return null;
}

/**
 * La hora pedida → un instante. Acepta:
 *   · ISO con zona ("2026-09-25T08:00:00-05:00") -- se respeta tal cual.
 *   · "YYYY-MM-DD HH:mm" sin zona -- se lee en la hora del NEGOCIO, que es la
 *     que el admin tiene en la cabeza cuando dice "a las 8".
 *   · `enMinutos` -- para "dentro de 2 horas".
 */
export function leerCuando(
  entrada: { cuando?: string; enMinutos?: number },
  zona: string,
  ahora = new Date(),
): { ok: true; fecha: Date } | { ok: false; error: string } {
  let fecha: Date | null = null;
  const min = Number(entrada.enMinutos);
  if (Number.isFinite(min) && min > 0) {
    fecha = new Date(ahora.getTime() + min * 60_000);
  } else {
    const t = String(entrada.cuando || "").trim();
    if (!t) return { ok: false, error: "Falta cuándo: pasá `cuando` (\"2026-09-25 08:00\", hora del negocio) o `enMinutos`." };
    const local = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/);
    // "mañana 08:00", "hoy 18:30", "lunes 9:00": el prompt de Atlas no trae
    // la fecha de hoy, así que el día relativo lo resuelve el servidor en vez
    // de dejar que el modelo adivine qué fecha es "mañana".
    const relativo = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .match(/^(hoy|manana|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(?:a las\s+)?(\d{1,2}):(\d{2})$/);
    if (relativo) {
      const hoy = horaLocal(zona, ahora);
      const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
      const palabra = relativo[1]!;
      let suma = palabra === "hoy" ? 0 : palabra === "manana" ? 1 : palabra === "pasado manana" ? 2
        : ((DIAS.indexOf(palabra) + 1 - hoy.diaSemana + 7) % 7);
      const h = Number(relativo[2]), mi = Number(relativo[3]);
      // "lunes 9:00" dicho un lunes a las 10 es el lunes que viene, no hoy.
      if (DIAS.includes(palabra) && suma === 0 && (h * 60 + mi) <= (hoy.hora * 60 + hoy.minuto)) suma = 7;
      const base = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + suma));
      fecha = instanteEnZona(zona, base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, mi);
    } else if (local) {
      const [, a, m, d, h, mi] = local.map(Number) as number[];
      fecha = instanteEnZona(zona, a!, m!, d!, h!, mi!);
    } else if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) {
      const f = new Date(t);
      if (!Number.isNaN(f.getTime())) fecha = f;
    }
    if (!fecha) return { ok: false, error: `No entendí la hora "${t}". Usá "AAAA-MM-DD HH:mm" (hora del negocio).` };
  }
  if (fecha.getTime() < ahora.getTime() + 60_000) {
    return { ok: false, error: "Esa hora ya pasó (o es en menos de un minuto). Si es para ahora, hacelo directamente." };
  }
  if (fecha.getTime() > ahora.getTime() + MAX_DIAS * 86_400_000) {
    return { ok: false, error: `Solo se programa hasta ${MAX_DIAS} días adelante.` };
  }
  return { ok: true, fecha };
}

async function zonaDelNegocio(tenantId: number): Promise<string> {
  try {
    const t = await tenantManager.getTenantById(tenantId);
    return zonaValida((t?.settings as any)?.timezone);
  } catch {
    return zonaValida(null);
  }
}

/** "jue 25-09 08:00 (America/Bogota)" -- lo que el admin lee para confirmar. */
export function horaLegible(fecha: Date, zona: string): string {
  const f = new Intl.DateTimeFormat("es-CO", {
    timeZone: zona, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(fecha);
  return `${f} (${zona})`;
}

export async function programarAccion(
  tenantId: number,
  args: { herramienta?: string; argumentos?: any; cuando?: string; enMinutos?: number; repetirCadaMin?: number; nota?: string },
  validar: (herramienta: string) => string | null,
): Promise<{ ok: boolean; summary: string; data?: any }> {
  const herramienta = String(args.herramienta || "").trim();
  const motivo = validar(herramienta);
  if (motivo) return { ok: false, summary: motivo };

  const zona = await zonaDelNegocio(tenantId);
  const cuando = leerCuando(args, zona);
  if (!cuando.ok) return { ok: false, summary: cuando.error };

  const repite = args.repetirCadaMin == null ? null : Math.round(Number(args.repetirCadaMin));
  if (repite != null && !(repite >= MIN_REPETICION)) {
    return { ok: false, summary: `La repetición mínima es cada ${MIN_REPETICION} minutos.` };
  }
  const argumentos = args.argumentos && typeof args.argumentos === "object" ? args.argumentos : {};
  const clave = `atlas:${tenantId}:${herramienta}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const r = await programar({
    tenantId, tipo: TIPO_ACCION_DE_ATLAS, clave, correAt: cuando.fecha,
    datos: { herramienta, argumentos, nota: String(args.nota || "").slice(0, 300) },
    repiteCadaMin: repite,
  });
  const hora = horaLegible(cuando.fecha, zona);
  return {
    ok: !!r.id,
    summary: r.id
      ? `🗓️ Programado (#${r.id}): ${herramienta} para ${hora}${repite ? `, y se repite cada ${repite} min` : ""}. Se puede ver con agenda_ver, moverla o cancelarla con agenda_cambiar.`
      : "No se pudo guardar la programación.",
    data: { id: r.id, correAt: cuando.fecha.toISOString(), hora },
  };
}

async function filaDelNegocio(tenantId: number, id: number) {
  const [fila] = await db.select().from(trabajosProgramados)
    .where(and(eq(trabajosProgramados.id, id), eq(trabajosProgramados.tenantId, tenantId), eq(trabajosProgramados.tipo, TIPO_ACCION_DE_ATLAS)))
    .limit(1);
  return fila;
}

export async function verAgenda(tenantId: number): Promise<{ ok: boolean; summary: string; data?: any }> {
  const zona = await zonaDelNegocio(tenantId);
  const filas = await db.select().from(trabajosProgramados)
    .where(and(eq(trabajosProgramados.tenantId, tenantId), eq(trabajosProgramados.tipo, TIPO_ACCION_DE_ATLAS)))
    .orderBy(desc(trabajosProgramados.correAt)).limit(30);
  if (!filas.length) return { ok: true, summary: `No hay acciones programadas. Ahora: ${horaLegible(new Date(), zona)}.`, data: [] };
  const lineas = filas.map((f: any) => {
    const d = f.datos || {};
    const res = f.estado === "hecho" ? ` → ${String(f.resultado?.summary || "ok").slice(0, 120)}` : f.error ? ` → ❌ ${String(f.error).slice(0, 120)}` : "";
    return `#${f.id} [${f.estado}] ${horaLegible(new Date(f.correAt), zona)} · ${d.herramienta} ${JSON.stringify(d.argumentos || {}).slice(0, 100)}${f.repiteCadaMin ? ` · cada ${f.repiteCadaMin} min` : ""}${d.nota ? ` · ${d.nota}` : ""}${res}`;
  });
  return { ok: true, summary: `Agenda (ahora: ${horaLegible(new Date(), zona)}):\n${lineas.join("\n")}`, data: filas };
}

export async function cancelarAccion(tenantId: number, id: number): Promise<{ ok: boolean; summary: string }> {
  const fila = await filaDelNegocio(tenantId, Number(id));
  if (!fila) return { ok: false, summary: `No encontré la acción programada #${id}.` };
  if (fila.estado !== "pendiente") return { ok: false, summary: `La #${id} ya está "${fila.estado}": no hay nada que cancelar.` };
  await db.update(trabajosProgramados).set({ estado: "cancelado", actualizadoAt: toDbDate(new Date()) as any })
    .where(eq(trabajosProgramados.id, fila.id));
  return { ok: true, summary: `❌ Cancelada la acción programada #${id} (${(fila.datos as any)?.herramienta}).` };
}

export async function reprogramarAccion(
  tenantId: number, id: number, entrada: { cuando?: string; enMinutos?: number },
): Promise<{ ok: boolean; summary: string }> {
  const fila = await filaDelNegocio(tenantId, Number(id));
  if (!fila) return { ok: false, summary: `No encontré la acción programada #${id}.` };
  if (fila.estado !== "pendiente") return { ok: false, summary: `La #${id} ya está "${fila.estado}": programala de nuevo en vez de moverla.` };
  const zona = await zonaDelNegocio(tenantId);
  const cuando = leerCuando(entrada, zona);
  if (!cuando.ok) return { ok: false, summary: cuando.error };
  await db.update(trabajosProgramados)
    .set({ correAt: toDbDate(cuando.fecha) as any, intentos: 0, error: null, actualizadoAt: toDbDate(new Date()) as any })
    .where(eq(trabajosProgramados.id, fila.id));
  return { ok: true, summary: `🔁 La #${id} (${(fila.datos as any)?.herramienta}) ahora corre ${horaLegible(cuando.fecha, zona)}.` };
}

/**
 * Lo que corre a la hora pactada. Si la herramienta falla se LANZA, para que
 * el programador reintente y deje el error a la vista -- nunca "hecho" en falso.
 * En los dos casos se le avisa al dueño: una acción programada que corre sin
 * que nadie se entere es igual de mala que una que no corre.
 */
export function registrarAgendaDeAtlas(): void {
  registrarManejador(TIPO_ACCION_DE_ATLAS, async ({ tenantId, datos, intentos }) => {
    const { executeAction } = await import("./app-operator");
    const { avisarAlDueno } = await import("./avisos");
    const herramienta = String(datos.herramienta || "");
    const r = await executeAction(herramienta, datos.argumentos || {}, { tenantId, sessionId: "agenda-atlas" } as any);
    if (!r.ok) {
      if (intentos >= 3) await avisarAlDueno(tenantId, `⚠️ Acción programada que NO se pudo hacer: ${herramienta}\n${r.summary}`).catch(() => undefined);
      throw new Error(r.summary || `${herramienta} falló`);
    }
    await avisarAlDueno(tenantId, `✅ Acción programada ejecutada: ${herramienta}\n${r.summary}`).catch(() => undefined);
    logger.info({ tenantId, herramienta }, "[AgendaAtlas] acción programada ejecutada");
    return { summary: r.summary };
  });
}
