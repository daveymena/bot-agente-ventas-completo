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
 * No bloquea. Solo cuenta y responde cuánto va. Quién corta la respuesta sigue
 * siendo `checkMessageLimit`, que ya estaba y ya funcionaba.
 */
import { db, consumoMensual } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

/** "2026-09". El mes calendario, en UTC. */
export function periodoDe(fecha: Date = new Date()): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
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
  try {
    await db
      .insert(consumoMensual)
      .values({ tenantId, periodo, mensajes: cuantos })
      .onConflictDoUpdate({
        target: [consumoMensual.tenantId, consumoMensual.periodo],
        set: {
          mensajes: sql`${consumoMensual.mensajes} + ${cuantos}`,
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
 * ⚠️ Ante un fallo devuelve 0, o sea "no se pasó". Es deliberado: dejar mudo
 * al bot de un cliente que sí pagó, porque la consulta del contador falló, es
 * peor que dejar pasar unos mensajes de más. Es el mismo criterio que ya usa
 * `agent.ts` en su try/catch.
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
    logger.warn({ err: err?.message, tenantId }, "[Consumo] no se pudo leer el consumo del mes");
    return 0;
  }
}
