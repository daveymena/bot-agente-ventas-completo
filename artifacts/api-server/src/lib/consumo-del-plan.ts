/**
 * ============================================================
 * EL CONSUMO DEL MES, QUE AHORA SOBREVIVE A LOS REINICIOS
 * ============================================================
 *
 * ── Qué estaba roto, exactamente ──────────────────────────────────────────
 *
 * No era lo que parecía. El límite del plan SÍ estaba implementado y SÍ se
 * aplicaba:
 *
 *   · `agent.ts:811` y `agent-orchestrator.ts:214` llaman a
 *     `checkMessageLimit` y cortan la respuesta cuando se pasa
 *   · `whatsapp.ts` incrementaba el contador con cada envío
 *
 * Lo que faltaba era que el contador SOBREVIVIERA. Vivía en
 * `private costStorage: Map<string, UsageMetrics>` -- memoria del proceso.
 * Cada reinicio lo pone en cero, y un despliegue es un reinicio: el 2026-09-07
 * hubo doce.
 *
 * O sea: un candado bien puesto sobre una puerta que se reconstruye sola cada
 * pocas horas. Nadie llegaba nunca al límite.
 *
 * Un cliente de Starter (USD 19, 1.500 mensajes) podía mandar 20.000 y costar
 * USD 66. La pérdida no se ve al vender: aparece en la factura del mes
 * siguiente.
 *
 * ── Por qué una fila por mes y no un contador que se resetea ──────────────
 *
 * Un contador exige que alguien lo ponga en cero el día 1, y ese alguien es un
 * trabajo programado que puede no correr. Con una fila por (negocio, período),
 * el mes nuevo simplemente no existe todavía y cuenta cero solo.
 *
 * ── Qué NO hace ───────────────────────────────────────────────────────────
 *
 * El contador de WhatsApp y la reserva de respuestas IA comparten una fila
 * mensual durable por tenant. Las reservas IA se hacen atómicamente para que
 * los workers no puedan rebasar el cupo en paralelo.
 */
import { db, consumoMensual } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

/** "2026-09". El mes calendario, en UTC. */
export function periodoDe(fecha: Date = new Date()): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function diaDe(fecha: Date = new Date(), zonaHoraria = "America/Bogota"): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zonaHoraria,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(fecha);
    const part = (type: string) => parts.find((p) => p.type === type)?.value || "00";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return diaDe(fecha, "America/Bogota");
  }
}

export function limiteDiarioDelPlan(limiteMensual: number): number {
  return Math.max(1, Math.ceil(limiteMensual / 30));
}

async function zonaHorariaTenant(tenantId: number): Promise<string> {
  try {
    const { tenantManager } = await import("./tenantManager");
    const tenant = await tenantManager.getTenantById(tenantId);
    return tenant?.settings?.timezone || "America/Bogota";
  } catch {
    return "America/Bogota";
  }
}

/**
 * Suma un mensaje enviado al mes en curso.
 *
 * ⚠️ Va sin `await` desde quien envía: contar no puede demorar un mensaje al
 * cliente. Y si la escritura falla, se pierde UN mensaje del conteo -- que es
 * infinitamente mejor que perder el mensaje del cliente.
 *
 * El `ON CONFLICT` hace el trabajo pesado: crea la fila del mes la primera vez
 * y suma en las siguientes, en una sola ida a la base y sin condición de
 * carrera entre dos envíos simultáneos.
 */
export async function sumarMensaje(tenantId: number, cuantos = 1): Promise<void> {
  if (!tenantId || cuantos <= 0) return;
  const periodo = periodoDe();
  const dia = diaDe(new Date(), await zonaHorariaTenant(tenantId));
  try {
    await db
      .insert(consumoMensual)
      .values({ tenantId, periodo, mensajes: cuantos, respuestasIa: 0, dia, mensajesDia: cuantos, respuestasIaDia: 0 })
      .onConflictDoUpdate({
        target: [consumoMensual.tenantId, consumoMensual.periodo],
        set: {
          mensajes: sql`${consumoMensual.mensajes} + ${cuantos}`,
          dia,
          mensajesDia: sql`CASE WHEN ${consumoMensual.dia} = ${dia} THEN ${consumoMensual.mensajesDia} + ${cuantos} ELSE ${cuantos} END`,
          respuestasIaDia: sql`CASE WHEN ${consumoMensual.dia} = ${dia} THEN ${consumoMensual.respuestasIaDia} ELSE 0 END`,
          actualizadoAt: new Date(),
        },
      });
  } catch (err: any) {
    logger.warn({ err: err?.message, tenantId, periodo }, "[Consumo] no se pudo sumar el mensaje");
  }
}

/**
 * Cuántos mensajes lleva el negocio este mes.
 *
 * Ante un fallo se propaga el error: no debemos tratar una cuota desconocida
 * como consumo cero y dejar pasar tráfico sin límite.
 */
export async function mensajesDelMes(tenantId: number, fecha: Date = new Date()): Promise<number> {
  if (!tenantId) return 0;
  try {
    const [fila] = await db
      .select({ mensajes: consumoMensual.mensajes })
      .from(consumoMensual)
      .where(and(eq(consumoMensual.tenantId, tenantId), eq(consumoMensual.periodo, periodoDe(fecha))))
      .limit(1);
    return fila?.mensajes ?? 0;
  } catch (err: any) {
    logger.error({ err: err?.message, tenantId }, "[Consumo] no se pudo leer el consumo del mes");
    throw new Error("No se pudo consultar el uso mensual de WhatsApp", { cause: err });
  }
}

export async function usoWhatsappDelPeriodo(tenantId: number, fecha: Date = new Date(), zonaHoraria?: string): Promise<{ mensual: number; diario: number }> {
  if (!tenantId) return { mensual: 0, diario: 0 };
  const dia = diaDe(fecha, zonaHoraria || await zonaHorariaTenant(tenantId));
  try {
    const [fila] = await db.select({ mensajes: consumoMensual.mensajes, dia: consumoMensual.dia, mensajesDia: consumoMensual.mensajesDia })
      .from(consumoMensual)
      .where(and(eq(consumoMensual.tenantId, tenantId), eq(consumoMensual.periodo, periodoDe(fecha))))
      .limit(1);
    return { mensual: Number(fila?.mensajes || 0), diario: fila?.dia === dia ? Number(fila?.mensajesDia || 0) : 0 };
  } catch (err: any) {
    logger.error({ err: err?.message, tenantId }, "[Consumo] no se pudo leer el uso diario de WhatsApp");
    throw new Error("No se pudo consultar el uso de WhatsApp", { cause: err });
  }
}

/**
 * Reserva atómicamente una respuesta de IA para que dos workers concurrentes
 * no puedan superar el límite mensual del mismo negocio.
 */
export async function reservarRespuestaIA(
  tenantId: number,
  limite: number,
  fecha: Date = new Date(),
  zonaHoraria?: string,
): Promise<{ allowed: boolean; current: number; limit: number; currentDaily: number; dailyLimit: number; reason?: "daily" | "monthly" }> {
  if (!tenantId || limite <= 0) return { allowed: false, current: 0, limit: limite, currentDaily: 0, dailyLimit: 0, reason: "monthly" };
  const periodo = periodoDe(fecha);
  const dia = diaDe(fecha, zonaHoraria || await zonaHorariaTenant(tenantId));
  const dailyLimit = limiteDiarioDelPlan(limite);
  try {
    await db.insert(consumoMensual).values({ tenantId, periodo, mensajes: 0, respuestasIa: 0, dia, mensajesDia: 0, respuestasIaDia: 0 })
      .onConflictDoNothing({ target: [consumoMensual.tenantId, consumoMensual.periodo] });

    const reservada = await db.update(consumoMensual)
      .set({
        respuestasIa: sql`${consumoMensual.respuestasIa} + 1`,
        dia,
        respuestasIaDia: sql`CASE WHEN ${consumoMensual.dia} = ${dia} THEN ${consumoMensual.respuestasIaDia} + 1 ELSE 1 END`,
        mensajesDia: sql`CASE WHEN ${consumoMensual.dia} = ${dia} THEN ${consumoMensual.mensajesDia} ELSE 0 END`,
        actualizadoAt: new Date(),
      } as any)
      .where(and(
        eq(consumoMensual.tenantId, tenantId),
        eq(consumoMensual.periodo, periodo),
        sql`${consumoMensual.respuestasIa} < ${limite}`,
        sql`(${consumoMensual.dia} <> ${dia} OR ${consumoMensual.respuestasIaDia} < ${dailyLimit})`,
      ))
      .returning({ respuestasIa: consumoMensual.respuestasIa, respuestasIaDia: consumoMensual.respuestasIaDia });

    if (reservada[0]) {
      return { allowed: true, current: Number(reservada[0].respuestasIa), limit: limite, currentDaily: Number(reservada[0].respuestasIaDia), dailyLimit };
    }
    const [fila] = await db.select({ respuestasIa: consumoMensual.respuestasIa, dia: consumoMensual.dia, respuestasIaDia: consumoMensual.respuestasIaDia })
      .from(consumoMensual)
      .where(and(eq(consumoMensual.tenantId, tenantId), eq(consumoMensual.periodo, periodo)))
      .limit(1);
    const currentDaily = fila?.dia === dia ? Number(fila?.respuestasIaDia || 0) : 0;
    return {
      allowed: false,
      current: Number(fila?.respuestasIa || 0),
      limit: limite,
      currentDaily,
      dailyLimit,
      reason: currentDaily >= dailyLimit ? "daily" : "monthly",
    };
  } catch (err: any) {
    logger.error({ err: err?.message, tenantId, periodo }, "[Consumo] no se pudo reservar uso de IA");
    // El límite protege el costo compartido de proveedores. Si no podemos
    // leerlo/escribirlo, esta respuesta se detiene y se reintenta al recuperarse.
    throw new Error("No se pudo verificar el límite mensual de IA", { cause: err });
  }
}

export async function respuestasIADelMes(tenantId: number, fecha: Date = new Date()): Promise<number> {
  if (!tenantId) return 0;
  try {
    const [fila] = await db.select({ respuestasIa: consumoMensual.respuestasIa })
      .from(consumoMensual)
      .where(and(eq(consumoMensual.tenantId, tenantId), eq(consumoMensual.periodo, periodoDe(fecha))))
      .limit(1);
    return Number(fila?.respuestasIa || 0);
  } catch (err: any) {
    logger.warn({ err: err?.message, tenantId }, "[Consumo] no se pudo leer el consumo de IA del mes");
    throw new Error("No se pudo consultar el uso mensual de IA", { cause: err });
  }
}

export async function respuestasIADelDia(tenantId: number, fecha: Date = new Date(), zonaHoraria?: string): Promise<number> {
  if (!tenantId) return 0;
  const dia = diaDe(fecha, zonaHoraria || await zonaHorariaTenant(tenantId));
  try {
    const [fila] = await db.select({ dia: consumoMensual.dia, respuestasIaDia: consumoMensual.respuestasIaDia })
      .from(consumoMensual)
      .where(and(eq(consumoMensual.tenantId, tenantId), eq(consumoMensual.periodo, periodoDe(fecha))))
      .limit(1);
    return fila?.dia === dia ? Number(fila?.respuestasIaDia || 0) : 0;
  } catch (err: any) {
    logger.error({ err: err?.message, tenantId }, "[Consumo] no se pudo leer el uso diario de IA");
    throw new Error("No se pudo consultar el uso diario de IA", { cause: err });
  }
}
