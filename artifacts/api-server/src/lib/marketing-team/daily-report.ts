/**
 * Reporte diario del equipo de marketing — la pieza que faltaba para que el
 * equipo funcione SOLO.
 *
 * Hasta hoy los 13 agentes del Marketing Team existían pero no corría ninguno
 * por su cuenta: solo reaccionaban cuando alguien entraba a la página o
 * escribía en el chat. Un equipo de marketing que hay que ir a despertar no
 * está haciendo seguimiento, y "seguimiento" era justo lo que el admin pidió.
 *
 * Qué hace: una vez al día corre el diagnóstico real del embudo (los mismos
 * agentes que responden en el chat, con los mismos datos), y manda un resumen
 * corto por WhatsApp al teléfono del negocio.
 *
 * Dos decisiones a propósito:
 *
 * 1. NO ejecuta nada. Solo mira y cuenta. Cambiar campañas ya tiene su camino
 *    con confirmación (ad-growth-agent), y meter otro que actúe sin permiso
 *    sería justo lo que el admin no pidió.
 * 2. Si no hay nada que decir, NO escribe. Un reporte diario que llega
 *    siempre, diga lo que diga, se vuelve ruido y se deja de leer en una
 *    semana -- y entonces tampoco se lee el día que sí importaba.
 */
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { getWhatsAppForTenant } from "../whatsapp-factory";
import { tenantManager } from "../tenantManager";

/** Cada cuánto se corre. Una vez al día alcanza: el embudo no cambia por hora. */
const CADA_MS = 24 * 60 * 60 * 1000;
/** Al arrancar se espera un rato: el servidor recién levantado tiene otras cosas que hacer. */
const PRIMER_ARRANQUE_MS = 10 * 60 * 1000;

let arrancado = false;

async function telefonoDe(tenantId: number): Promise<string | null> {
  try {
    const [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const t = String((fila as any)?.contactPhone || "").replace(/[^0-9]/g, "");
    return t.length >= 8 ? t : null;
  } catch {
    return null;
  }
}

/**
 * El resumen de UN negocio. Devuelve null si no hay nada que valga un mensaje.
 */
async function ultimoEnvio(tenantId: number): Promise<string | null> {
  try {
    const [fila] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const meta: any = typeof (fila as any)?.metadata === "string" ? JSON.parse((fila as any).metadata) : ((fila as any)?.metadata || {});
    return meta?.marketingDiario?.ultimoEnvio ?? null;
  } catch { return null; }
}

async function marcarEnvio(tenantId: number, dia: string): Promise<void> {
  try {
    const [fila] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const meta: any = typeof (fila as any)?.metadata === "string" ? JSON.parse((fila as any).metadata) : ((fila as any)?.metadata || {});
    await db.update(tenants).set({ metadata: { ...meta, marketingDiario: { ...(meta.marketingDiario || {}), ultimoEnvio: dia } } } as any).where(eq(tenants.id, tenantId));
  } catch (err) {
    logger.warn({ err, tenantId }, "[MarketingDiario] no se pudo registrar el envío");
  }
}

async function resumenDelDia(tenantId: number): Promise<string | null> {
  const { runDiagnosticCycle } = await import("./orchestrator");
  const { performance, diagnostic } = await runDiagnosticCycle({ tenantId, days: 7 });

  const insights: any[] = performance?.data?.insights || [];
  const embudo: any[] = diagnostic?.data?.embudo || [];

  // Solo lo que está mal o en alerta. Lo que anda bien no necesita un
  // WhatsApp: el admin ya tiene el panel para mirarlo cuando quiera.
  const problemas = insights.filter((i) => i.severity === "critical" || i.severity === "warning");
  // El diagnostic-agent marca los eslabones con 🟢/🟡/🔴; antes solo se
  // miraban 🔴 y ⚠️, así que los amarillos (🟡) se perdían del reporte.
  const eslabonesRotos = embudo.filter((e) => e.estado === "🔴" || e.estado === "🟡" || e.estado === "⚠️");

  if (problemas.length === 0 && eslabonesRotos.length === 0) return null;

  const lineas: string[] = ["📊 *Tu marketing, hoy*", ""];

  for (const p of problemas.slice(0, 3)) {
    lineas.push(`${p.severity === "critical" ? "🔴" : "⚠️"} *${p.metric}*: ${p.interpretation}`);
  }
  for (const e of eslabonesRotos.slice(0, 3)) {
    lineas.push(`${e.estado} *${e.eslabon}*: ${e.observacion}`);
  }

  const accion = performance?.data?.accionPrincipal || diagnostic?.data?.conclusion;
  if (accion) {
    lineas.push("", `🚀 *Lo que haría primero:* ${accion}`);
  }
  lineas.push("", "_Esto es solo un aviso: no cambié nada. Escribime si querés que haga algo._");
  return lineas.join("\n");
}

async function correrParaTodos(): Promise<void> {
  let negocios: number[] = [];
  try {
    const filas = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, "active"));
    negocios = filas.map((f: any) => f.id);
  } catch (err) {
    logger.warn({ err }, "[MarketingDiario] no se pudieron listar los negocios");
    return;
  }

  for (const tenantId of negocios) {
    try {
      const telefono = await telefonoDe(tenantId);
      if (!telefono) continue; // sin teléfono no hay a quién avisarle

      // UNO POR DÍA. El temporizador vive en memoria y arranca 10 min después
      // de CADA reinicio: con diez despliegues en un día, el dueño recibió
      // "Tu marketing, hoy" repetido en su WhatsApp (12-09-2026). La fecha
      // del último envío se guarda en el negocio, que sobrevive al reinicio.
      const hoy = new Date().toISOString().slice(0, 10);
      if ((await ultimoEnvio(tenantId)) === hoy) {
        logger.info({ tenantId }, "[MarketingDiario] ya se mandó hoy: no se repite");
        continue;
      }

      const texto = await resumenDelDia(tenantId);
      if (!texto) {
        logger.info({ tenantId }, "[MarketingDiario] sin novedades: no se manda nada");
        continue;
      }

      const wa = getWhatsAppForTenant(tenantId);
      if (!wa.isConnected()) {
        logger.warn({ tenantId }, "[MarketingDiario] WhatsApp desconectado, el resumen no se pudo mandar");
        continue;
      }
      await wa.sendText(telefono, texto);
      await marcarEnvio(tenantId, hoy);
      logger.info({ tenantId }, "[MarketingDiario] resumen enviado");
    } catch (err) {
      // El fallo de un negocio no puede dejar sin reporte a los demás.
      logger.error({ err, tenantId }, "[MarketingDiario] error armando el resumen de un negocio");
    }
  }
}

export function startMarketingDailyReport(): void {
  if (arrancado) return;
  arrancado = true;
  setTimeout(() => {
    correrParaTodos().catch((err) => logger.error({ err }, "[MarketingDiario] error en la primera corrida"));
    setInterval(() => {
      correrParaTodos().catch((err) => logger.error({ err }, "[MarketingDiario] error en la corrida diaria"));
    }, CADA_MS);
  }, PRIMER_ARRANQUE_MS);
  logger.info("[MarketingDiario] reporte diario del equipo de marketing programado");
}

/** Para dispararlo a mano desde una ruta y no esperar 24h para probarlo. */
export async function runMarketingDailyReportNow(): Promise<{ negocios: number }> {
  await correrParaTodos();
  return { negocios: 1 };
}
