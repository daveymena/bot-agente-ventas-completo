/**
 * Agent Lab Dashboard API
 * Métricas en tiempo real de A/B tests y simulaciones
 */

import { Router, type Request, type Response } from "express";
import { ensureDbReady, architectMemory, promptVersions } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";

const router = Router();

/**
 * GET /api/agent-lab-dashboard/metrics
 * Retorna métricas agregadas de simulaciones + A/B tests
 */
router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const { db } = await ensureDbReady();
    const { tenantId, agentId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: "tenantId required" });
    }

    const tid = parseInt(String(tenantId));
    const aid = agentId ? parseInt(String(agentId)) : null;

    // Simulaciones últimas 7 días
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const simulations = await db
      .select()
      .from(architectMemory)
      .where(and(eq(architectMemory.type, "nightly_simulation") as any, gte(architectMemory.createdAt, sevenDaysAgo)));

    // A/B tests activos
    const abTests = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.tenantId, tid));

    const metrics = {
      simulations: {
        totalRun: simulations.length,
        avgSuccessRate:
          simulations.length > 0
            ? (
                simulations.reduce((sum, s) => sum + ((s.data as any)?.tasaExito || 0), 0) / simulations.length
              ).toFixed(2)
            : 0,
        trend: calculateTrend(simulations),
      },
      abTests: {
        active: abTests.filter((v) => {
          const config = (v.performanceBefore as any) || {};
          return config.abTestActive && config.status === "running";
        }).length,
        completed: abTests.filter((v) => v.isActive).length,
        pending: abTests.filter((v) => !v.isActive && !((v.performanceBefore as any)?.abTestActive)).length,
      },
      lastSimulation: simulations[simulations.length - 1]?.createdAt || null,
      recentFindings: extractTopFindings(simulations, 5),
    };

    res.json({ ok: true, data: metrics });
  } catch (e) {
    res.status(500).json({ error: (e as any).message });
  }
});

/**
 * GET /api/agent-lab-dashboard/ab-test/:versionId
 * Métricas específicas de un A/B test
 */
router.get("/ab-test/:versionId", async (req: Request, res: Response) => {
  try {
    const { db } = await ensureDbReady();
    const { versionId } = req.params;

    const vid = parseInt(versionId);

    const [version] = await db.select().from(promptVersions).where(eq(promptVersions.id, vid));

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    const config = version.performanceBefore ? (JSON.parse(String(version.performanceBefore)) as any) : null;

    res.json({
      ok: true,
      data: {
        versionId: version.id,
        status: version.isActive ? "applied" : config?.status || "pending",
        trafficPercent: config?.trafficPercent || null,
        startedAt: config?.startedAt || null,
        endAt: config?.endAt || null,
        diffSummary: version.diffSummary,
        improvementEstimate: config?.estimatedImprovement || null,
        timeRemaining:
          config?.endAt && config.status === "running"
            ? Math.max(0, (new Date(config.endAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
            : null,
      },
    });
  } catch (e) {
    res.status(500).json({ error: (e as any).message });
  }
});

/**
 * GET /api/agent-lab-dashboard/timeline
 * Histórico de cambios (cuando se aplicaron versiones, degradaciones detectadas)
 */
router.get("/timeline", async (req: Request, res: Response) => {
  try {
    const { db } = await ensureDbReady();
    const { tenantId, limit = "20" } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: "tenantId required" });
    }

    const tid = parseInt(String(tenantId));
    const lim = parseInt(String(limit));

    const events = await db
      .select()
      .from(architectMemory)
      .where(
        and(
          (m: any) =>
            m.type === "nightly_simulation" || m.type === "ab_test_assignment" || m.type === "version_applied"
        ) as any
      )
      .orderBy(architectMemory.createdAt)
      .limit(lim);

    const timeline = events.map((e) => ({
      timestamp: e.createdAt,
      type: e.type,
      tags: e.tags,
      data: e.data,
    }));

    res.json({ ok: true, data: timeline });
  } catch (e) {
    res.status(500).json({ error: (e as any).message });
  }
});

function calculateTrend(simulations: any[]): string {
  if (simulations.length < 2) return "stable";

  const recent = simulations.slice(-3).map((s) => (s.data as any)?.tasaExito || 0);
  const avg = recent.reduce((a, b) => a + b) / recent.length;
  const older = simulations.slice(-6, -3).map((s) => (s.data as any)?.tasaExito || 0);
  const avgOlder = older.length ? older.reduce((a, b) => a + b) / older.length : avg;

  if (avg > avgOlder * 1.05) return "improving";
  if (avg < avgOlder * 0.95) return "degrading";
  return "stable";
}

function extractTopFindings(simulations: any[], limit: number): any[] {
  const findings: { [key: string]: number } = {};

  for (const sim of simulations) {
    const hallazgos = ((sim.data as any)?.hallazgos || []) as any[];
    for (const h of hallazgos) {
      const key = h.descripcion;
      findings[key] = (findings[key] || 0) + 1;
    }
  }

  return Object.entries(findings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([desc, freq]) => ({ descripcion: desc, frecuencia: freq }));
}

export default router;
