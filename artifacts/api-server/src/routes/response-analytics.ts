import { Router, type IRouter } from "express";
import { responseAnalyticsEngine } from "../lib/response-analytics";
import { autoTuneEngine } from "../lib/auto-tune";
import { db, agents as agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/track", async (req, res, next) => {
  try {
    const record = await responseAnalyticsEngine.trackResponse({
      tenantId: req.body.tenantId || (req as any).tenant?.id || null,
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
    await responseAnalyticsEngine.updateOutcome(Number(req.params.id), req.body.outcome, req.body.metadata);
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
});

router.get("/stats", async (req, res, next) => {
  try {
    const agentId = req.query.agentId ? Number(req.query.agentId) : undefined;
    const days = Number(req.query.days) || 30;
    const stats = await responseAnalyticsEngine.getStats(agentId, days);
    const conversion = await responseAnalyticsEngine.getConversionRate(agentId, days);
    return res.json({ ok: true, stats, conversion });
  } catch (e) {
    return next(e);
  }
});

router.get("/ranking", async (req, res, next) => {
  try {
    const days = Number(req.query.days) || 30;
    const ranking = await responseAnalyticsEngine.getAgentRanking(days);
    return res.json({ ok: true, ranking });
  } catch (e) {
    return next(e);
  }
});

router.get("/weekly-report", async (req, res, next) => {
  try {
    const report = await responseAnalyticsEngine.getWeeklyReport();
    return res.json({ ok: true, report });
  } catch (e) {
    return next(e);
  }
});

router.post("/auto-tune/:agentId", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenant?.id || req.body.tenantId;
    const result = await autoTuneEngine.applyAutoTune(Number(req.params.agentId), tenantId);
    if (!result) return res.status(400).json({ error: "Not enough data or agent not found" });
    return res.json({ ok: true, result });
  } catch (e) {
    return next(e);
  }
});

router.get("/versions", async (req, res, next) => {
  try {
    const agentId = req.query.agentId ? Number(req.query.agentId) : undefined;
    const versions = await autoTuneEngine.getVersionHistory(agentId);
    return res.json({ ok: true, versions });
  } catch (e) {
    return next(e);
  }
});

router.post("/versions/:id/rollback", async (req, res, next) => {
  try {
    const result = await autoTuneEngine.rollbackToVersion(Number(req.params.id));
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

export default router;
