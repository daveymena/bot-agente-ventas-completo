/**
 * ============================================================
 * MARKETING TEAM — API ROUTES (MASTER PLAN §28-§29)
 * ============================================================
 * Router de dominio para el equipo de marketing:
 *   GET    /marketing/summary      → resumen del equipo (dashboard)
 *   GET    /marketing/attribution  → CAC/ROAS reales por anuncio (Fase 5)
 *   GET    /marketing/funnel       → embudo completo (DiagnosticAgent)
 *   GET    /marketing/leads/ads    → leads con contexto de anuncio
 *   GET    /marketing/budget       → guardrails + estado de gasto
 *   PUT    /marketing/budget       → actualizar guardrails
 *   GET    /marketing/tasks        → motor de tareas
 *   POST   /marketing/tasks
 *   PATCH  /marketing/tasks/:id
 *   GET    /marketing/experiments  → experimentos
 *   POST   /marketing/experiments
 *   PATCH  /marketing/experiments/:id
 *   GET    /marketing/audit        → audit log
 *
 * Toda ruta está acotada al tenant autenticado (req.tenant.id), igual que
 * el resto de la API — nunca se accede a datos de otra organización.
 */

import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, marketingTasks, marketingExperiments, marketingBudgets } from "@workspace/db";
import { getAttributionSummary, getFunnelSnapshot, listLeadsWithAdContext } from "../lib/marketing-team/attribution";
import { classifyAction } from "../lib/marketing-team/risk-engine";
import { getOrCreateBudget, getBudgetStatus, canChangeBudget } from "../lib/marketing-team/budget-guard";
import { writeAuditLog, listAuditLogs } from "../lib/marketing-team/audit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function tenantIdOf(req: any): number | null {
  const id = req?.tenant?.id;
  return typeof id === "number" ? id : null;
}

function requireTenant(req: any, res: any): number | null {
  const tenantId = tenantIdOf(req);
  if (!tenantId) {
    res.status(401).json({ error: "No autorizado" });
    return null;
  }
  return tenantId;
}

function daysOf(q: any): number {
  const d = Number(q?.days);
  if (Number.isFinite(d) && d >= 1 && d <= 365) return d;
  return 30;
}

// ─── GET /marketing/summary — resumen del equipo ─────────────────────────────
router.get("/summary", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const [funnel, attribution, budget] = await Promise.all([
      getFunnelSnapshot(tenantId, 30),
      getAttributionSummary(tenantId, 30),
      getBudgetStatus(tenantId),
    ]);
    return res.json({
      funnel,
      attribution: {
        rows: attribution.rows,
        totalLeads: attribution.totalLeads,
        totalPaid: attribution.totalPaid,
        totalRevenue: attribution.totalRevenue,
      },
      budget,
      team: {
        agents: [
          "MarketingStrategist", "MarketResearcher", "AudienceStrategist",
          "OfferStrategist", "CreativeDirector", "Copywriter", "MetaAdsManager",
          "ExperimentManager", "PerformanceAnalyst", "DiagnosticAgent",
          "OptimizationAgent", "BudgetManager", "ScalingAgent", "MarketingMemoryAgent",
        ],
      },
    });
  } catch (e) {
    return next(e);
  }
});

// ─── GET /marketing/attribution — CAC/ROAS reales por anuncio (Fase 5) ──────
router.get("/attribution", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const days = daysOf(req.query);
    const result = await getAttributionSummary(tenantId, days);
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

// ─── GET /marketing/funnel — embudo completo ─────────────────────────────────
router.get("/funnel", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const days = daysOf(req.query);
    return res.json(await getFunnelSnapshot(tenantId, days));
  } catch (e) {
    return next(e);
  }
});

// ─── GET /marketing/leads/ads — leads con contexto de anuncio ───────────────
router.get("/leads/ads", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    return res.json({ rows: await listLeadsWithAdContext(tenantId, 50) });
  } catch (e) {
    return next(e);
  }
});

// ─── GET /marketing/budget — guardrails + estado ────────────────────────────
router.get("/budget", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    return res.json(await getBudgetStatus(tenantId));
  } catch (e) {
    return next(e);
  }
});

// ─── PUT /marketing/budget — actualizar guardrails ──────────────────────────
router.put("/budget", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const { maxDailySpend, maxBudgetChangePercent, maxScalePercent, approvalRequired, currency } = req.body ?? {};

    const current = await getOrCreateBudget(tenantId);
    const row = (await db.select().from(marketingBudgets).where(eq(marketingBudgets.tenantId, tenantId)).limit(1))[0];
    if (!row) return res.status(404).json({ error: "Presupuesto no encontrado" });

    const next = {
      maxDailySpend: maxDailySpend != null ? String(maxDailySpend) : row.maxDailySpend,
      maxBudgetChangePercent: maxBudgetChangePercent != null ? String(maxBudgetChangePercent) : row.maxBudgetChangePercent,
      maxScalePercent: maxScalePercent != null ? String(maxScalePercent) : row.maxScalePercent,
      approvalRequired: approvalRequired != null ? !!approvalRequired : row.approvalRequired,
      currency: currency != null ? String(currency) : row.currency,
      updatedAt: new Date(),
    };

    // Validación: nunca permitir límites negativos o en cero.
    for (const [k, v] of Object.entries(next)) {
      if (k === "approvalRequired" || k === "updatedAt" || k === "currency") continue;
      if (Number(v) <= 0) {
        return res.status(400).json({ error: `${k} debe ser mayor a 0` });
      }
    }

    const [updated] = await db.update(marketingBudgets).set(next).where(eq(marketingBudgets.id, row.id)).returning();
    await writeAuditLog({
      tenantId,
      agent: "BudgetManager",
      action: "UPDATE_BUDGET_GUARDRAILS",
      resource: "marketing_budgets",
      before: { maxDailySpend: current.maxDailySpend, maxBudgetChangePercent: current.maxBudgetChangePercent, maxScalePercent: current.maxScalePercent },
      after: { maxDailySpend: next.maxDailySpend, maxBudgetChangePercent: next.maxBudgetChangePercent, maxScalePercent: next.maxScalePercent },
      approval: "admin",
      reason: "El admin actualizó los guardrails de presupuesto",
      result: "SUCCESS",
    });
    return res.json({ ok: true, guardrails: { ...(await getBudgetStatus(tenantId)) } });
  } catch (e) {
    return next(e);
  }
});

// ─── GET /marketing/tasks — motor de tareas ─────────────────────────────────
router.get("/tasks", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const rows = await db
      .select()
      .from(marketingTasks)
      .where(eq(marketingTasks.tenantId, tenantId))
      .orderBy(desc(marketingTasks.createdAt))
      .limit(200);
    return res.json({ rows });
  } catch (e) {
    return next(e);
  }
});

// ─── POST /marketing/tasks — crear tarea ────────────────────────────────────
router.post("/tasks", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const { assignedAgent, action, input, priority, parentTaskId, dependencies } = req.body ?? {};
    if (!assignedAgent || !action) {
      return res.status(400).json({ error: "assignedAgent y action son obligatorios" });
    }

    // El risk engine clasifica la acción: aprobación según riesgo (MASTER PLAN §30).
    const classified = classifyAction(action);
    const [task] = await db
      .insert(marketingTasks)
      .values({
        tenantId,
        parentTaskId: parentTaskId ?? null,
        requestedBy: req.body?.requestedBy ?? "admin",
        assignedAgent,
        action,
        priority: priority ?? "medium",
        status: classified.approvalRequired ? "WAITING_APPROVAL" : "PENDING",
        input: input ?? {},
        dependencies: dependencies ?? [],
        risk: classified.risk,
        approvalRequired: classified.approvalRequired,
      })
      .returning();

    return res.status(201).json({ task, classified });
  } catch (e) {
    return next(e);
  }
});

// ─── PATCH /marketing/tasks/:id — actualizar estado/resultado ───────────────
router.patch("/tasks/:id", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });

    const existing = (await db
      .select()
      .from(marketingTasks)
      .where(and(eq(marketingTasks.id, id), eq(marketingTasks.tenantId, tenantId)))
      .limit(1))[0];
    if (!existing) return res.status(404).json({ error: "Tarea no encontrada" });

    const patch: Record<string, any> = {};
    const { status, output, error, approvalStatus } = req.body ?? {};
    if (status) patch.status = status;
    if (output !== undefined) patch.output = output;
    if (error !== undefined) patch.error = error;
    if (approvalStatus) patch.approvalStatus = approvalStatus;
    patch.updatedAt = new Date();

    const [updated] = await db.update(marketingTasks).set(patch).where(eq(marketingTasks.id, id)).returning();
    return res.json({ task: updated });
  } catch (e) {
    return next(e);
  }
});

// ─── GET /marketing/experiments ─────────────────────────────────────────────
router.get("/experiments", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const rows = await db
      .select()
      .from(marketingExperiments)
      .where(eq(marketingExperiments.tenantId, tenantId))
      .orderBy(desc(marketingExperiments.createdAt))
      .limit(200);
    return res.json({ rows });
  } catch (e) {
    return next(e);
  }
});

// ─── POST /marketing/experiments — crear experimento (MASTER PLAN §13) ──────
router.post("/experiments", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const { hypothesis, variable, productId, campaignId, controlDraftId, variantDraftId, controlLabel, variantLabel, budget, durationDays, minImpressions } = req.body ?? {};
    if (!hypothesis || !variable) {
      return res.status(400).json({ error: "hypothesis y variable son obligatorios" });
    }
    const [experiment] = await db
      .insert(marketingExperiments)
      .values({
        tenantId,
        productId: productId ?? null,
        campaignId: campaignId ?? null,
        hypothesis,
        variable,
        controlDraftId: controlDraftId ?? null,
        variantDraftId: variantDraftId ?? null,
        controlLabel: controlLabel ?? null,
        variantLabel: variantLabel ?? null,
        budget: budget != null ? String(budget) : null,
        durationDays: durationDays ?? null,
        minImpressions: minImpressions ?? 1000,
        status: "EN_PRUEBA",
        startedAt: new Date(),
      })
      .returning();

    await writeAuditLog({
      tenantId,
      agent: "ExperimentManager",
      action: "CREATE_EXPERIMENT",
      resource: `experiment:${experiment?.id}`,
      after: { hypothesis, variable },
      approval: "admin",
      reason: "Nuevo experimento creado",
      result: "SUCCESS",
    });
    return res.status(201).json({ experiment });
  } catch (e) {
    return next(e);
  }
});

// ─── PATCH /marketing/experiments/:id — resultado del experimento ───────────
router.patch("/experiments/:id", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });

    const existing = (await db
      .select()
      .from(marketingExperiments)
      .where(and(eq(marketingExperiments.id, id), eq(marketingExperiments.tenantId, tenantId)))
      .limit(1))[0];
    if (!existing) return res.status(404).json({ error: "Experimento no encontrado" });

    const patch: Record<string, any> = {};
    const { status, result, conclusion, learning, endedAt } = req.body ?? {};
    if (status) patch.status = status;
    if (result !== undefined) patch.result = result;
    if (conclusion !== undefined) patch.conclusion = conclusion;
    if (learning !== undefined) patch.learning = learning;
    if (endedAt !== undefined) patch.endedAt = endedAt;
    if (status && ["GANADOR", "PERDEDOR", "INCONCLUSO", "CANCELADO"].includes(status)) {
      patch.endedAt = new Date();
    }

    const [updated] = await db.update(marketingExperiments).set(patch).where(eq(marketingExperiments.id, id)).returning();
    return res.json({ experiment: updated });
  } catch (e) {
    return next(e);
  }
});

// ─── POST /marketing/chat — chat del orquestador (MASTER PLAN §36) ──────────
// El usuario no necesita saber qué agente usar: dice "quiero vender más X"
// y el orquestador decide el flujo. Soporta: growth_plan, diagnostic,
// performance, create_campaign (deriva a MetaAdsManager).
router.post("/chat", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const message = String(req.body?.message ?? "").trim();
    if (!message) return res.status(400).json({ error: "message es obligatorio" });

    const { detectIntent, planGrowth, runDiagnosticCycle, formatReport, AYUDA_MARKETING } = await import("../lib/marketing-team/orchestrator");
    const intent = detectIntent(message);

    // Saludo o "¿qué podés hacer?": antes caía en un 400 que dejaba el chat
    // inservible. Ahora responde la ayuda con ejemplos reales.
    if (intent === "help" || intent === "unknown") {
      return res.json({
        intent: "help",
        report: formatReport("QUÉ PUEDO HACER", [
          { emoji: "💬", label: "Decime qué necesitás", text: AYUDA_MARKETING },
        ]),
        ayuda: AYUDA_MARKETING,
      });
    }

    if (intent === "growth_plan") {
      const { plan, steps } = await planGrowth({
        tenantId,
        businessObjective: message,
        productId: req.body?.productId,
        productName: req.body?.productName,
      });
      return res.json({
        intent,
        steps: steps.map((s) => s.agent),
        report: formatReport("PLAN DE CRECIMIENTO", [
          { emoji: "🎯", label: "Objetivo", text: plan.data.objetivo },
          { emoji: "👥", label: "Público", text: plan.data.publico },
          { emoji: "🎨", label: "Ángulos", text: plan.data.angulos.join(" · ") },
          { emoji: "🧪", label: "Experimentos", text: plan.data.experimentos.join("\n") },
          { emoji: "💰", label: "Presupuesto", text: `Diario ${plan.data.presupuestoSugerido.diario ?? "por definir"} ${plan.data.presupuestoSugerido.moneda}` },
          { emoji: "📈", label: "KPIs", text: plan.data.kpis.join(" · ") },
        ]),
        plan: plan.data,
      });
    }

    if (intent === "diagnostic") {
      const { diagnostic: diag } = await runDiagnosticCycle({ tenantId });
      return res.json({
        intent,
        report: formatReport("DIAGNÓSTICO DEL EMBUDO", [
          ...diag.data.embudo.map((e: any) => ({ emoji: e.estado, label: e.eslabon, text: e.observacion })),
          { emoji: "🧠", label: "Conclusión", text: diag.data.conclusion },
          { emoji: "💬", label: "Derivaciones", text: diag.data.derivaciones.join("\n") || "Ninguna por ahora" },
        ]),
        diagnostic: diag.data,
      });
    }

    if (intent === "performance") {
      const { performance } = await runDiagnosticCycle({ tenantId });
      return res.json({
        intent,
        report: formatReport("RENDIMIENTO", [
          ...performance.data.insights.map((i: any) => ({
            emoji: i.severity === "critical" ? "🔴" : i.severity === "warning" ? "⚠️" : "🟢",
            label: i.metric,
            text: i.interpretation,
          })),
          { emoji: "🚀", label: "Acción principal", text: performance.data.accionPrincipal },
        ]),
        insights: performance.data.insights,
      });
    }

    if (intent === "create_campaign") {
      const { createCampaignDrafts } = await import("../lib/marketing-team/agents/meta-ads-manager");
      const result = await createCampaignDrafts((req as any).tenant, { autonomous: req.body?.autonomous === true });
      return res.json({
        intent,
        result,
        report: result.requiresApproval
          ? formatReport("CREAR CAMPAÑA", [
              { emoji: "🛡️", label: "Aprobación requerida", text: "Crear anuncios es una acción con riesgo. Revisá y aprobá el borrador en el panel de Facebook antes de publicar." },
            ])
          : formatReport("CREAR CAMPAÑA", [
              { emoji: "📢", label: "Borradores creados", text: `Creados: ${result.result?.created ?? 0}, fallidos: ${result.result?.failed ?? 0}` },
            ]),
      });
    }

    return res.status(400).json({
      intent: "unknown",
      error: "No pude identificar una intención de marketing. Probá con: 'quiero vender más X', '¿qué está fallando?', '¿cómo vamos?' o 'crea una campaña'.",
    });
  } catch (e) {
    return next(e);
  }
});

// ─── GET /marketing/learnings — memoria de marketing (MASTER PLAN §19) ──────
/**
 * POST /api/marketing/daily-report/run
 *
 * Dispara AHORA el resumen diario que normalmente corre solo una vez al día.
 * Existe para poder probarlo sin esperar 24 horas -- y para que el admin
 * pueda pedirlo cuando quiera. Solo lee y avisa: no cambia ninguna campaña.
 */
router.post("/daily-report/run", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const { runMarketingDailyReportNow } = await import("../lib/marketing-team/daily-report");
    await runMarketingDailyReportNow();
    return res.json({
      ok: true,
      mensaje:
        "Resumen ejecutado. Si había algo que reportar y el negocio tiene su teléfono cargado, " +
        "te llegó por WhatsApp. Si no llegó nada es porque no hubo novedades: el reporte no escribe por escribir.",
    });
  } catch (e) {
    return next(e);
  }
});

router.get("/learnings", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const { listLearnings } = await import("../lib/marketing-team/agents/marketing-memory");
    const rows = await listLearnings(tenantId, Math.min(Number(req.query?.limit) || 50, 200));
    return res.json({ rows });
  } catch (e) {
    return next(e);
  }
});

// ─── GET /marketing/audit ───────────────────────────────────────────────────
router.get("/audit", async (req, res, next) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const limit = Math.min(Number(req.query?.limit) || 100, 500);
    return res.json({ rows: await listAuditLogs(tenantId, limit) });
  } catch (e) {
    return next(e);
  }
});

export default router;
