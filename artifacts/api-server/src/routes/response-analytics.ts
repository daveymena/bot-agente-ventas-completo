import { Router, type IRouter } from "express";
import { responseAnalyticsEngine } from "../lib/response-analytics";
import { autoTuneEngine } from "../lib/auto-tune";
import { db, agents as agentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Estas analíticas no filtraban por negocio: cualquier cliente logueado podía
 * ver estadísticas, ranking y reporte semanal de los agentes de OTROS
 * negocios, y `/track` dejaba atribuir registros a un tenant arbitrario
 * porque el body ganaba sobre la sesión.
 */
const tenantDe = (req: any): number | null => req?.tenant?.id ?? null;

/** El agente pedido tiene que ser de este negocio. */
async function agenteEsDelTenant(agentId: number, tenantId: number): Promise<boolean> {
  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.tenantId, tenantId)))
    .limit(1);
  return !!agent;
}

router.post("/track", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const record = await responseAnalyticsEngine.trackResponse({
      // La sesión manda; antes `req.body.tenantId` iba primero y permitía
      // atribuirle registros a cualquier otro negocio.
      tenantId,
      agentId: req.body.agentId || null,
      profileId: req.body.profileId || null,
      conversationId: req.body.conversationId || null,
      messageId: req.body.messageId || null,
      responseText: req.body.responseText || "",
      responseLength: (req.body.responseText || "").length,
      hadCard: req.body.hadCard || false,
      cardProductId: req.body.cardProductId || null,
      outcome: req.body.outcome || null,
      customerMessage: req.body.customerMessage || "",
      sentimentScore: req.body.sentimentScore || null,
      responseTimeMs: req.body.responseTimeMs || 0,
      metadata: req.body.metadata || null,
    });
    return res.status(201).json({ ok: true, record });
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id/outcome", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    await responseAnalyticsEngine.updateOutcome(Number(req.params.id), req.body.outcome, req.body.metadata, tenantId);
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
});

router.get("/stats", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const agentId = req.query.agentId ? Number(req.query.agentId) : undefined;
    if (agentId && !(await agenteEsDelTenant(agentId, tenantId))) {
      return res.status(404).json({ error: "Agente no encontrado" });
    }
    const days = Number(req.query.days) || 30;
    const stats = await responseAnalyticsEngine.getStats(tenantId, agentId, days);
    const conversion = await responseAnalyticsEngine.getConversionRate(tenantId, agentId, days);
    return res.json({ ok: true, stats, conversion });
  } catch (e) {
    return next(e);
  }
});

router.get("/ranking", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const days = Number(req.query.days) || 30;
    const ranking = await responseAnalyticsEngine.getAgentRanking(tenantId, days);
    return res.json({ ok: true, ranking });
  } catch (e) {
    return next(e);
  }
});

router.get("/weekly-report", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const report = await responseAnalyticsEngine.getWeeklyReport(tenantId);
    return res.json({ ok: true, report });
  } catch (e) {
    return next(e);
  }
});

router.post("/auto-tune/:agentId", async (req, res, next) => {
  try {
    // El tenant sale SOLO de la sesión; antes caía a `req.body.tenantId`.
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const agentId = Number(req.params.agentId);
    if (!(await agenteEsDelTenant(agentId, tenantId))) {
      return res.status(404).json({ error: "Agente no encontrado" });
    }
    const result = await autoTuneEngine.applyAutoTune(agentId, tenantId);
    if (!result) return res.status(400).json({ error: "Not enough data or agent not found" });
    return res.json({ ok: true, result });
  } catch (e) {
    return next(e);
  }
});

router.get("/versions", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const agentId = req.query.agentId ? Number(req.query.agentId) : undefined;
    // Sin agentId no se puede acotar el historial a este negocio, así que se
    // exige: devolver todas las versiones sería filtrar prompts de otros.
    if (!agentId) return res.status(400).json({ error: "agentId es requerido" });
    if (!(await agenteEsDelTenant(agentId, tenantId))) {
      return res.status(404).json({ error: "Agente no encontrado" });
    }
    const versions = await autoTuneEngine.getVersionHistory(agentId);
    return res.json({ ok: true, versions });
  } catch (e) {
    return next(e);
  }
});

router.post("/versions/:id/rollback", async (req, res, next) => {
  try {
    // Un rollback REESCRIBE el prompt de sistema del agente -- sin este
    // chequeo, cualquiera podía revertir el prompt de un agente de otro
    // negocio con solo probar ids de versión.
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const version = await autoTuneEngine.getVersion(Number(req.params.id));
    if (!version?.agentId || !(await agenteEsDelTenant(Number(version.agentId), tenantId))) {
      return res.status(404).json({ error: "Versión no encontrada" });
    }
    const result = await autoTuneEngine.rollbackToVersion(Number(req.params.id));
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

export default router;
