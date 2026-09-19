/**
 * ============================================================
 * EL RITMO DE LA AGENCIA — el equipo trabaja sin que le pregunten
 * ============================================================
 *
 * Los catorce especialistas de `marketing-team/` ya existen y ya funcionan:
 * investigan, arman audiencias, escriben copy, analizan performance,
 * diagnostican el embudo. El problema es CUÁNDO trabajan.
 *
 * Hasta ahora, solo cuando el admin abría el chat y preguntaba. `planGrowth` y
 * `runDiagnosticCycle` se llaman desde `app-operator.ts` y desde ningún otro
 * lado: catorce especialistas contratados que esperan a que les toquen el
 * hombro. Una agencia de verdad no funciona así. Tiene un calendario: alguien
 * mira los números el lunes por la mañana aunque el cliente no haya escrito.
 *
 * Este archivo es ese calendario. No agrega inteligencia: le pone reloj a la
 * que ya está construida.
 *
 * ── Qué se hace solo y qué espera el sí ─────────────────────────────────
 *
 * Se hereda la regla del agente de anuncios y del programador, sin relajarla:
 * **lo que ahorra plata se hace solo y se avisa; lo que gasta plata espera el
 * "sí"**.
 *
 *   · Diagnosticar y analizar    → es LEER. Se hace solo.
 *   · Investigar y planear       → produce un plan escrito, no mueve un peso.
 *                                  Se hace solo y queda para aprobar.
 *   · Publicar, pautar, escalar  → gasta. NO se toca desde acá.
 *
 * Por eso este módulo nunca llama a `meta-ads-manager` ni a `scaling-agent`.
 * Deja el trabajo hecho sobre la mesa; encender lo sigue decidiendo una
 * persona, igual que hoy.
 *
 * ── Por qué avisa poco ──────────────────────────────────────────────────
 *
 * Un aviso diario que casi siempre dice "todo bien" se vuelve ruido, y el
 * ruido se ignora justo el día que importa. Solo se avisa cuando el
 * diagnóstico trae acciones concretas. Si no hay nada que hacer, el trabajo
 * corre, queda registrado y nadie recibe nada.
 */

import { logger } from "./logger";
import { programar, registrarManejador, type ContextoDeTrabajo } from "./programador";
import { getWhatsAppForTenant } from "./whatsapp-factory";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";

export const TIPO_DIAGNOSTICO = "agencia:diagnostico";
export const TIPO_PLAN_SEMANAL = "agencia:plan-semanal";

/** Cada cuánto vuelve cada trabajo. */
const UN_DIA_MIN = 24 * 60;
const UNA_SEMANA_MIN = 7 * UN_DIA_MIN;

/**
 * A quién avisarle. Mismo criterio que el agente de anuncios: primero el
 * teléfono del NEGOCIO, y la variable de entorno solo como respaldo para
 * instalaciones de un solo cliente.
 */
async function telefonoDelNegocio(tenantId: number): Promise<string | null> {
  try {
    const [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const propio = String((fila as any)?.contactPhone || "").replace(/[^0-9]/g, "");
    if (propio.length >= 8) return propio;
  } catch (err) {
    logger.warn({ err, tenantId }, "[Agencia] no se pudo leer el teléfono del negocio");
  }
  return process.env.ADMIN_PHONE || null;
}

async function avisar(tenantId: number, texto: string): Promise<boolean> {
  // WhatsApp y Telegram, por el mismo lugar que el resto de los avisos.
  try {
    const { avisarAlDueno } = await import("./avisos");
    const r = await avisarAlDueno(tenantId, texto);
    if (!r.whatsapp && !r.telegram) logger.warn({ tenantId }, "[Agencia] sin canal: el informe quedó solo en el registro");
    return r.whatsapp || r.telegram;
  } catch (err: any) {
    logger.error({ err: err?.message, tenantId }, "[Agencia] no se pudo enviar el informe");
    return false;
  }
}

/**
 * Las acciones que el diagnóstico dejó sobre la mesa.
 *
 * Se leen por FORMA y no por una lista de nombres de campo: el equipo devuelve
 * `accionesInmediatas` hoy, pero este proyecto ya se quemó tres veces
 * enumerando campos de a uno. Cualquier arreglo de cosas dentro de `data`
 * cuenta como algo que reportar.
 */
export function accionesDelDiagnostico(resultado: any): string[] {
  const data = resultado?.diagnostic?.data ?? resultado?.data ?? {};
  const salida: string[] = [];
  for (const valor of Object.values(data)) {
    if (!Array.isArray(valor)) continue;
    for (const item of valor) {
      const t =
        typeof item === "string"
          ? item
          : String((item as any)?.accion || (item as any)?.title || (item as any)?.titulo || "");
      const limpio = t.trim();
      if (limpio) salida.push(limpio);
    }
  }
  return salida;
}

/**
 * Diagnóstico diario: leer los números y avisar solo si hay algo que hacer.
 *
 * Antes mandaba las `accionesInmediatas` del diagnostic-agent: frases
 * genéricas ("Revisar la oferta y garantía visibles") que nadie podía
 * ejecutar, y cerraba con "decime cuál querés que haga" — y la respuesta
 * del dueño caía en el agente de ventas. Ahora es `revision-diaria.ts`:
 * números reales, acciones numeradas que el servidor sabe hacer, y la
 * respuesta "1" / "todas" por WhatsApp se atiende (ver whatsapp.ts).
 */
async function diagnosticoDiario(ctx: ContextoDeTrabajo) {
  const { revisionDiaria } = await import("./revision-diaria");
  const { texto, revision } = await revisionDiaria(ctx.tenantId);
  const conclusion = revision.estado.join(" ");

  if (!texto) {
    logger.info({ tenantId: ctx.tenantId }, "[Agencia] revisión sin acciones: no se molesta a nadie");
    return { acciones: 0, aviso: false, conclusion };
  }

  const aviso = await avisar(ctx.tenantId, texto);
  return { acciones: revision.acciones.length, aviso, conclusion };
}

/**
 * Plan semanal: el equipo investiga y arma la propuesta del producto que hoy
 * se está vendiendo.
 *
 * No publica ni pauta: deja el plan escrito. Es exactamente lo que hace una
 * agencia el lunes a la mañana antes de que el cliente pregunte nada.
 */
async function planSemanal(ctx: ContextoDeTrabajo) {
  const { planGrowth } = await import("./marketing-team/orchestrator");
  try {
    const r = await planGrowth({
      tenantId: ctx.tenantId,
      productId: ctx.datos?.productId,
      productName: ctx.datos?.productName,
      businessObjective: ctx.datos?.objetivo,
    });
    logger.info(
      { tenantId: ctx.tenantId, pasos: r.steps?.length ?? 0 },
      "[Agencia] plan semanal listo, esperando aprobación",
    );
    return { pasos: r.steps?.length ?? 0, resumen: r.plan?.summary ?? null };
  } catch (err: any) {
    // Que no haya productos todavía no es una falla del trabajo: es un negocio
    // que aún no cargó nada. Se registra y vuelve la semana que viene, sin
    // gastar los tres reintentos del programador.
    logger.warn({ tenantId: ctx.tenantId, err: err?.message }, "[Agencia] no se pudo armar el plan semanal");
    return { pasos: 0, motivo: err?.message ?? "sin detalle" };
  }
}

/**
 * Deja registrado quién atiende cada trabajo.
 *
 * Se llama en el ARRANQUE y no al activar, por el mismo motivo que el agente
 * orgánico: los trabajos ya agendados viven en la base, y si el registro
 * dependiera de que alguien active algo, un reinicio los dejaría venciendo sin
 * nadie que los ejecute.
 */
export function registrarAgencia(): void {
  registrarManejador(TIPO_DIAGNOSTICO, diagnosticoDiario as any);
  registrarManejador(TIPO_PLAN_SEMANAL, planSemanal as any);
}

/**
 * Pone en marcha el ritmo para un negocio.
 *
 * Las claves son estables por tenant, así que llamarlo dos veces no duplica
 * nada: `programar` reprograma el pendiente en vez de crear otro.
 */
export async function activarAgencia(
  tenantId: number,
  opciones: { productId?: number; productName?: string; objetivo?: string } = {},
): Promise<{ diagnostico: boolean; plan: boolean }> {
  const ahora = Date.now();

  // El diagnóstico arranca en una hora, no ahora mismo: si el servidor se
  // reinicia varias veces seguidas (un despliegue detrás de otro), no se
  // dispara una ráfaga de análisis.
  const d = await programar({
    tenantId,
    tipo: TIPO_DIAGNOSTICO,
    clave: `agencia:diagnostico:${tenantId}`,
    correAt: new Date(ahora + 60 * 60 * 1000),
    repiteCadaMin: UN_DIA_MIN,
  });

  const p = await programar({
    tenantId,
    tipo: TIPO_PLAN_SEMANAL,
    clave: `agencia:plan:${tenantId}`,
    correAt: new Date(ahora + 2 * 60 * 60 * 1000),
    repiteCadaMin: UNA_SEMANA_MIN,
    datos: {
      productId: opciones.productId ?? null,
      productName: opciones.productName ?? null,
      objetivo: opciones.objetivo ?? null,
    },
  });

  logger.info({ tenantId }, "[Agencia] ritmo activado: diagnóstico diario y plan semanal");
  return { diagnostico: d.creado, plan: p.creado };
}
