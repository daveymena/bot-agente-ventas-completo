/**
 * ============================================================
 * EJECUTOR DE TAREAS APROBADAS (cierra el loop de aprobaciones)
 * ============================================================
 *
 * El equipo de marketing sabía CLASIFICAR el riesgo de una acción y dejarla
 * en `WAITING_APPROVAL`, pero no había quién la ejecutara al aprobarla: la
 * tarea quedaba viva en la tabla y Meta nunca se enteraba. El audit decía
 * `PENDING` para siempre.
 *
 * Este módulo es ese ejecutor. Reglas, heredadas del programador:
 *
 *   1. Solo se ejecuta lo que tiene `approvalStatus = approved`. La aprobación
 *      es la que habilita; el riesgo ya se evaluó al crear la tarea.
 *   2. La acción se aplica CONTRA META y se lee la respuesta real: el audit
 *      queda `SUCCESS` solo si Meta aceptó, `FAILED` si rechazó. Nunca se
 *      finge éxito.
 *   3. La tarea se reclama de forma atómica (PENDING/WAITING_APPROVAL →
 *      RUNNING): si dos instancias la toman, solo una gana.
 *   4. Idempotente: una tarea `COMPLETED` no se vuelve a aplicar.
 *
 * Se encola con `programar` (reloj persistente) para no bloquear la request
 * del admin, y además corre una pasada periódica que levanta lo que haya
 * quedado aprobado sin ejecutar (p. ej. aprobado justo antes de un deploy).
 */

import { db, marketingTasks, type MarketingTask } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "../logger";
import { registrarManejador, programar, type ContextoDeTrabajo } from "../programador";
import { writeAuditLog } from "./audit";

const TIPO_EJECUTAR = "marketing:ejecutar_aprobada";
const TIPO_BARRIDO = "marketing:barrido_aprobadas";
/** Cada cuánto se levanta lo aprobado que quedó sin ejecutar. */
const CADA_MIN = 15;

/**
 * Acciones que este ejecutor sabe aplicar contra Meta. Lo demás (research,
 * copy, planes) no toca la API y no necesita ejecución diferida: se marca
 * completada con una nota.
 */
const ACCIONES_META = new Set([
  "pause_campaign",
  "resume_campaign",
  "change_budget",
  "scale_budget",
  "create_campaign_draft",
  "create_ad",
]);

export interface ResultadoEjecucion {
  ok: boolean;
  action: string;
  applied?: boolean;
  reason?: string;
  detalle?: Record<string, unknown>;
}

/** Deja registrado quién atiende cada trabajo (se llama en el arranque). */
export function registrarEjecutorDeTareas(): void {
  registrarManejador(TIPO_EJECUTAR, ((ctx: ContextoDeTrabajo) =>
    ejecutarTareaAprobada(ctx.tenantId, Number(ctx.datos?.taskId))) as any);
  registrarManejador(TIPO_BARRIDO, (() => barrerAprobadasPendientes()) as any);
}

/**
 * Pone en marcha el reloj del ejecutor: un barrido periódico. Llamarlo dos
 * veces no duplica (la clave es estable).
 */
export async function iniciarEjecutorDeTareas(): Promise<void> {
  registrarEjecutorDeTareas();
  try {
    await programar({
      tenantId: 0,
      tipo: TIPO_BARRIDO,
      clave: "marketing:barrido_aprobadas",
      correAt: new Date(Date.now() + 3 * 60 * 1000),
      repiteCadaMin: CADA_MIN,
    });
    logger.info({ cadaMin: CADA_MIN }, "[MarketingExecutor] loop de aprobaciones en marcha");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[MarketingExecutor] no se pudo agendar el barrido");
  }
}

/** Encola la ejecución de una tarea aprobada (no bloquea la request). */
export async function encolarEjecucionAprobada(tenantId: number, taskId: number): Promise<void> {
  await programar({
    tenantId,
    tipo: TIPO_EJECUTAR,
    clave: `marketing:aprobada:${taskId}`,
    correAt: new Date(),
    datos: { taskId },
  });
}

/** ¿La acción se resuelve contra Meta o es solo de contenido? */
export function tocaMeta(action: string): boolean {
  return ACCIONES_META.has(action);
}

/**
 * Reclama la tarea de forma atómica. Devuelve la fila si esta instancia ganó
 * la carrera; `null` si otro la tomó o ya no está aprobada/pendiente.
 */
async function reclamar(tenantId: number, taskId: number): Promise<MarketingTask | null> {
  const filas = await db
    .update(marketingTasks)
    .set({ status: "RUNNING", updatedAt: new Date() })
    .where(
      and(
        eq(marketingTasks.id, taskId),
        eq(marketingTasks.tenantId, tenantId),
        eq(marketingTasks.approvalStatus, "approved"),
        inArray(marketingTasks.status, ["PENDING", "WAITING_APPROVAL"]),
      ),
    )
    .returning();
  return filas[0] ?? null;
}

/** Busca y ejecuta todo lo aprobado que quedó sin correr. */
export async function barrerAprobadasPendientes(tope = 20): Promise<{ ejecutadas: number }> {
  const pendientes = await db
    .select({ id: marketingTasks.id, tenantId: marketingTasks.tenantId })
    .from(marketingTasks)
    .where(
      and(
        eq(marketingTasks.approvalStatus, "approved"),
        inArray(marketingTasks.status, ["PENDING", "WAITING_APPROVAL"]),
      ),
    )
    .limit(tope);

  let ejecutadas = 0;
  for (const t of pendientes) {
    const r = await ejecutarTareaAprobada(t.tenantId, t.id);
    if (r.ok) ejecutadas++;
  }
  return { ejecutadas };
}

/**
 * Ejecuta una tarea aprobada. Aplica la acción contra Meta y deja la task en
 * COMPLETED/FAILED con el output real y su fila de auditoría.
 */
export async function ejecutarTareaAprobada(tenantId: number, taskId: number): Promise<ResultadoEjecucion> {
  if (!Number.isFinite(taskId) || taskId <= 0) return { ok: false, action: "?", reason: "taskId inválido" };

  const task = await reclamar(tenantId, taskId);
  if (!task) {
    // O no existe, o ya se ejecutó, o no está aprobada. Se reporta sin romper.
    const [actual] = await db.select().from(marketingTasks).where(eq(marketingTasks.id, taskId)).limit(1);
    if (!actual) return { ok: false, action: "?", reason: "Tarea no encontrada" };
    if (actual.status === "COMPLETED") return { ok: true, action: actual.action, reason: "Ya estaba ejecutada" };
    return { ok: false, action: actual.action, reason: `No ejecutable (status=${actual.status}, approval=${actual.approvalStatus ?? "null"})` };
  }

  const input = (task.input || {}) as Record<string, any>;
  let r: ResultadoEjecucion;
  try {
    r = await aplicarAccion(tenantId, task.action, input);
  } catch (e: any) {
    r = { ok: false, action: task.action, reason: e?.message || String(e) };
  }

  // La auditoría refleja lo que pasó, no lo que se esperaba.
  await writeAuditLog({
    tenantId,
    agent: task.assignedAgent || "MetaExecutor",
    taskId: task.id,
    action: task.action,
    resource: r.detalle?.resource ? String(r.detalle.resource) : null,
    before: (input && Object.keys(input).length ? input : null) as any,
    after: r.detalle ?? null,
    approval: "admin",
    reason: r.reason ?? null,
    result: r.ok ? "SUCCESS" : "FAILED",
    error: r.ok ? null : r.reason ?? null,
  });

  await db
    .update(marketingTasks)
    .set({
      status: r.ok ? "COMPLETED" : "FAILED",
      output: { ...(r.detalle ?? {}), applied: r.applied ?? false, reason: r.reason ?? null } as any,
      error: r.ok ? null : r.reason ?? "Error",
      updatedAt: new Date(),
    })
    .where(eq(marketingTasks.id, task.id));

  logger.info(
    { tenantId, taskId: task.id, action: task.action, ok: r.ok, applied: r.applied, reason: r.reason },
    "[MarketingExecutor] tarea procesada",
  );
  return r;
}

/**
 * Traduce la acción de la tarea a una llamada real. Devuelve `applied=false`
 * cuando la acción no toca Meta (se completa igual, sin fingir una llamada).
 */
async function aplicarAccion(tenantId: number, action: string, input: Record<string, any>): Promise<ResultadoEjecucion> {
  if (!tocaMeta(action)) {
    return { ok: true, applied: false, action, reason: "Acción de contenido: no requiere llamada a Meta." };
  }

  const { tenantManager } = await import("../tenantManager");
  const tenant = await tenantManager.getTenantById(tenantId);
  if (!tenant) return { ok: false, action, reason: "Negocio no encontrado" };
  const { FacebookService } = await import("../facebook");
  const fb = new FacebookService(tenant);

  switch (action) {
    case "pause_campaign": {
      const campaignId = String(input.campaignId || input.campaign_id || "");
      if (!campaignId) return { ok: false, action, reason: "Falta 'campaignId' en el input de la tarea." };
      const ok = await fb.pauseCampaign(campaignId);
      return { ok, applied: ok, action, resource: campaignId, reason: ok ? "Campaña pausada." : fb.lastCampaignError || "Meta no aceptó pausar.", detalle: { resource: campaignId, pausada: ok } };
    }
    case "resume_campaign": {
      const campaignId = String(input.campaignId || input.campaign_id || "");
      if (!campaignId) return { ok: false, action, reason: "Falta 'campaignId' en el input de la tarea." };
      const ok = await fb.resumeCampaign(campaignId);
      return { ok, applied: ok, action, resource: campaignId, reason: ok ? "Campaña reactivada." : fb.lastCampaignError || "Meta no aceptó reactivar.", detalle: { resource: campaignId, activa: ok } };
    }
    case "change_budget":
    case "scale_budget": {
      const adSetId = String(input.adSetId || input.ad_set_id || "");
      const budget = Number(input.budget ?? input.dailyBudget ?? input.monto);
      if (!adSetId) return { ok: false, action, reason: "Falta 'adSetId' en el input de la tarea." };
      if (!Number.isFinite(budget) || budget <= 0) return { ok: false, action, reason: "Falta un 'budget' válido en el input de la tarea." };
      const r = await fb.setAdSetBudget(adSetId, budget);
      return { ok: r.ok, applied: r.ok, action, resource: adSetId, reason: r.ok ? `Presupuesto diario actualizado a ${budget}.` : r.message || "Meta no aceptó el nuevo presupuesto.", detalle: { resource: adSetId, budget, ok: r.ok } };
    }
    case "create_campaign_draft":
    case "create_ad": {
      // Crea el borrador (no gasta: subir/activar es otro paso). Si la tarea
      // trae producto, se crea el suyo; si no, para todos.
      const { AdStrategist } = await import("../ad-strategist");
      const strategist = new AdStrategist(tenant);
      const productId = Number(input.productId || 0);
      if (productId > 0) {
        const adAccountId = tenant.facebook?.adAccountId || "";
        const accessToken = tenant.facebook?.userAccessToken || tenant.facebook?.accessToken || "";
        // El A/B necesita la campaña EN META (pausada) para poder medirla:
        // un borrador local no tiene gasto ni impresiones que comparar.
        const draft = await strategist.createDraftAd(adAccountId, accessToken, productId, undefined, undefined, undefined, undefined, { subirAhora: true });
        const ok = !!draft?.id;
        return { ok, applied: ok, action, reason: ok ? `Borrador #${draft.id} creado (queda pausado/a revisar).` : "No se pudo crear el borrador.", detalle: { draftId: draft?.id ?? null, productId } };
      }
      const result = await strategist.createDraftsForAllProducts();
      const ok = (result?.failed ?? 1) === 0;
      return { ok, applied: true, action, reason: `Borradores: ${result?.created ?? 0} creados, ${result?.failed ?? 0} fallidos.`, detalle: { ...result } };
    }
    default:
      return { ok: false, action, reason: `Sin manejador para "${action}".` };
  }
}
