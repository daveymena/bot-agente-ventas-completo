import { and, desc, eq } from "drizzle-orm";
import { db, adAgentLogs, settings } from "@workspace/db";
import { facebookService } from "./facebook";
import { agruparPorHora, analizarFranjas, deberiaEstarEncendido, type Veredicto } from "./franjas-horarias";
import { programar, registrarManejador } from "./programador";
import { horaLocal, instanteEnZona, zonaValida } from "./zona-horaria";
import { dbNow } from "./date-utils";
import { logger } from "./logger";

/**
 * ============================================================
 * LA GUARDIA HORARIA — APAGA DE NOCHE, ENCIENDE EN LA BUENA
 * ============================================================
 *
 * El pedido del admin: "un agente para pausar en las noches o en los tiempos
 * muertos que no van a generar visitas, y reactivación en los momentos del día
 * más abundante".
 *
 * Qué franjas son ésas lo decide `franjas-horarias.ts` con el historial real de
 * la cuenta, nunca una hora escrita a mano. Este archivo es solo el brazo: mira
 * qué hora es en el huso de la cuenta, pregunta si toca estar encendido, y
 * actúa.
 *
 * ── El permiso, que es la parte delicada ─────────────────────────────────
 *
 * La regla de la casa dice: lo que ahorra plata se hace solo, lo que la gasta
 * espera el "sí". Apagar ahorra, así que apagar corre solo. Encender gasta.
 *
 * Pero pedir permiso para encender rompería la automatización entera: un "¿lo
 * enciendo?" a las 8 de la mañana que el admin contesta a las 11 significa tres
 * horas de la mejor franja perdidas todos los días, y el remedio termina siendo
 * peor que la enfermedad.
 *
 * La salida es mover el permiso un nivel arriba: el admin aprueba UNA VEZ que
 * esta campaña se administre por franjas. A partir de ahí, encender a las 8 no
 * es una decisión nueva -- es cumplir la que él ya tomó. Por eso la guardia
 * está APAGADA por omisión y hay que activarla campaña por campaña.
 *
 * ── Y nunca se reanuda lo que apagó una persona ──────────────────────────
 *
 * Solo se enciende lo que apagó ESTA guardia, y queda registrado en
 * `ad_agent_logs`. Si el admin pausó una campaña a mano --porque se le acabó el
 * stock, porque el creativo estaba mal-- que un robot se la vuelva a encender
 * de madrugada es la peor cosa que puede hacer un sistema como éste.
 */

export const TIPO_GUARDIA = "franjas:guardia";

/** Cada cuánto mira el reloj. Menos de una hora no sirve: la franja es de una hora. */
const CADA_MIN = 30;

/** Cuánto historial se mira. Dos semanas cubren dos veces cada día de la semana. */
const VENTANA = "last_14d";

export interface EstadoDeFranja {
  campaignId: string;
  aplicado: "pausada" | "reactivada" | "sin-cambios";
  porQue: string;
  hora: number;
}

/**
 * ¿Fue esta guardia la que la pausó?
 *
 * Se mira el último movimiento registrado para esa campaña. Si el último fue un
 * "pause" nuestro, la campaña está apagada por horario y se puede volver a
 * encender. Cualquier otra cosa --o ningún registro-- significa que la apagó
 * alguien más, y no se toca.
 */
async function laApagamosNosotros(tenantId: number, campaignId: string): Promise<boolean> {
  const [ultimo] = await db
    .select()
    .from(adAgentLogs)
    .where(and(eq(adAgentLogs.tenantId, tenantId), eq(adAgentLogs.campaignId, campaignId), eq(adAgentLogs.checkType, "franja_horaria")))
    .orderBy(desc(adAgentLogs.createdAt))
    .limit(1);
  return ultimo?.suggestedAction === "pause";
}

async function anotar(
  tenantId: number,
  campaignId: string,
  accion: "pause" | "resume",
  motivo: string,
  datos: Record<string, any>,
): Promise<void> {
  await db.insert(adAgentLogs).values({
    tenantId,
    campaignId,
    checkType: "franja_horaria",
    status: "auto_applied",
    suggestedAction: accion,
    reason: motivo,
    metricsSnapshot: datos as any,
    createdAt: dbNow() as any,
  });
}

async function zonaDeLaCuenta(): Promise<string> {
  try {
    const [s] = await db.select().from(settings).limit(1);
    return zonaValida((s as any)?.timezone);
  } catch {
    return zonaValida(null);
  }
}

/**
 * Revisa UNA campaña y actúa si corresponde.
 *
 * Se expone aparte de la ronda para que el panel pueda mostrar qué haría sin
 * que haga nada: con `simular: true` devuelve el veredicto sin tocar Meta. Un
 * admin que no puede ver qué va a hacer la automatización antes de encenderla,
 * no la enciende.
 */
export async function revisarCampana(
  tenantId: number,
  campaignId: string,
  opciones: { simular?: boolean; ahora?: Date } = {},
): Promise<EstadoDeFranja & { veredicto: Veredicto }> {
  const zona = await zonaDeLaCuenta();
  const { hora } = horaLocal(zona, opciones.ahora || new Date());

  const filas = await facebookService.getHourlyInsights(campaignId, VENTANA);
  if (filas === null) {
    // Meta no respondió. No se toca nada: apagar por un error de lectura es
    // apagar por nada.
    return {
      campaignId, hora, aplicado: "sin-cambios",
      porQue: "no se pudo leer el desglose por hora de Meta",
      veredicto: { suficiente: false, porQue: "sin lectura", muertas: [], pico: [], cpaPorHora: [] },
    };
  }

  const veredicto = analizarFranjas(agruparPorHora(filas));
  const { encendido, porQue } = deberiaEstarEncendido(hora, veredicto);

  if (opciones.simular) {
    return { campaignId, hora, aplicado: "sin-cambios", porQue, veredicto };
  }

  if (!encendido) {
    const yaApagada = await laApagamosNosotros(tenantId, campaignId);
    if (yaApagada) {
      return { campaignId, hora, aplicado: "sin-cambios", porQue: "ya estaba apagada por horario", veredicto };
    }
    const ok = await facebookService.pauseCampaign(campaignId);
    if (!ok) throw new Error(facebookService.lastCampaignError || "Meta rechazó la pausa");
    await anotar(tenantId, campaignId, "pause", porQue, { hora, muertas: veredicto.muertas, analisis: veredicto.porQue });
    logger.info({ tenantId, campaignId, hora }, "[Guardia] Campaña pausada por franja muerta");
    return { campaignId, hora, aplicado: "pausada", porQue, veredicto };
  }

  // Toca estar encendido. Solo se reanuda lo que apagó esta guardia.
  if (await laApagamosNosotros(tenantId, campaignId)) {
    const ok = await facebookService.resumeCampaign(campaignId);
    if (!ok) throw new Error(facebookService.lastCampaignError || "Meta rechazó la reactivación");
    await anotar(tenantId, campaignId, "resume", `vuelve la franja buena: ${porQue}`, { hora, pico: veredicto.pico });
    logger.info({ tenantId, campaignId, hora }, "[Guardia] Campaña reactivada");
    return { campaignId, hora, aplicado: "reactivada", porQue, veredicto };
  }

  return { campaignId, hora, aplicado: "sin-cambios", porQue, veredicto };
}

/** Una vuelta sobre todas las campañas que el admin puso bajo guardia. */
async function ronda(ctx: { tenantId: number; datos: Record<string, any> }) {
  const campanas: string[] = Array.isArray(ctx.datos?.campaignIds) ? ctx.datos.campaignIds : [];
  if (!campanas.length) return { revisadas: 0, nota: "no hay campañas bajo guardia" };

  const hechos: EstadoDeFranja[] = [];
  for (const id of campanas) {
    try {
      const r = await revisarCampana(ctx.tenantId, id);
      hechos.push({ campaignId: r.campaignId, aplicado: r.aplicado, porQue: r.porQue, hora: r.hora });
    } catch (err) {
      // Una campaña que falla no puede dejar sin revisar a las demás: si la
      // primera tiene el id vencido, las otras seguirían gastando de noche.
      logger.warn({ err, campaignId: id }, "[Guardia] Falló la revisión de una campaña");
      hechos.push({
        campaignId: id, aplicado: "sin-cambios", hora: -1,
        porQue: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { revisadas: hechos.length, hechos } as any;
}

/**
 * Igual que en el agente orgánico: el registro va en el arranque.
 *
 * La guardia horaria es un trabajo REPETITIVO que ya vive en la base. Sin
 * registrar su manejador al arrancar, un reinicio de madrugada dejaría los
 * anuncios encendidos toda la noche y nadie se enteraría hasta ver la factura.
 */
export function registrarGuardia(): void {
  registrarManejador(TIPO_GUARDIA, ronda as any);
  // Sin bandera de "ya registré": `registrarManejador` guarda en un Map, así
  // que llamarlo dos veces es inofensivo. La bandera SÍ hacía daño -- quedaba
  // en true aunque el registro se hubiera vaciado, y entonces esta función
  // volvía sin registrar nada y los trabajos agendados se quedaban sin quién
  // los atienda. Lo encontró `automatizacion-enganchada.test.ts`.
}


/**
 * Pone campañas bajo guardia horaria. Es el "sí" del admin, y es explícito.
 *
 * `campaignIds` reemplaza la lista completa: activar la guardia sobre una lista
 * vacía la apaga, que es la forma más simple de que el admin pueda cortarla
 * entera sin buscar un botón distinto.
 */
export async function activarGuardiaHoraria(tenantId: number, campaignIds: string[]): Promise<void> {
  registrarGuardia();

  const zona = await zonaDeLaCuenta();
  const h = horaLocal(zona);
  // Arranca en el próximo cambio de hora en punto: la franja es de una hora, y
  // empezar a mitad de una no adelanta nada.
  const proxima = instanteEnZona(zona, h.anio, h.mes, h.dia, h.hora + 1, 0);

  await programar({
    tenantId,
    tipo: TIPO_GUARDIA,
    clave: `franjas:guardia:${tenantId}`,
    correAt: proxima,
    datos: { campaignIds },
    repiteCadaMin: CADA_MIN,
  });

  logger.info({ tenantId, campanas: campaignIds.length }, "[Guardia] Activada");
}

