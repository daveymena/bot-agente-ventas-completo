import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, architectMemory } from "@workspace/db";
import { eq, and, desc, like } from "drizzle-orm";
import type { ArchitectMemory } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";

const router: IRouter = Router();

// Aceptaba un tenantId arbitrario por query string — cualquier tenant podía
// leer la memoria de otro. Restringido al superadmin de la plataforma.
router.use(requireSuperAdmin);

router.get("/", async (req, res, next) => {
  try {
    const sessionId = (req.query.sessionId as string) || "default";
    const memoryType = req.query.memoryType as string | undefined;
    const tenantId = req.query.tenantId
      ? Number(req.query.tenantId)
      : undefined;

    let query = db
      .select()
      .from(architectMemory)
      .where(eq(architectMemory.sessionId, sessionId))
      .orderBy(desc(architectMemory.createdAt));

    const results = await query;
    let filtered = results;

    if (memoryType) {
      filtered = filtered.filter((m: ArchitectMemory) => m.memoryType === memoryType);
    }
    if (tenantId) {
      filtered = filtered.filter((m: ArchitectMemory) => m.tenantId === tenantId);
    }

    return res.json({ ok: true, memories: filtered, total: filtered.length });
  } catch (e) {
    return next(e);
  }
});

router.get("/search", async (req, res, next) => {
  try {
    const q = (req.query.q as string) || "";
    const sessionId = (req.query.sessionId as string) || "default";

    if (!q) {
      return res.status(400).json({ error: "query param q is required" });
    }

    const results = await db
      .select()
      .from(architectMemory)
      .where(
        and(
          eq(architectMemory.sessionId, sessionId),
          like(architectMemory.content, `%${q}%`)
        )
      )
      .orderBy(desc(architectMemory.createdAt));

    return res.json({ ok: true, memories: results, total: results.length });
  } catch (e) {
    return next(e);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const sessionId = (req.query.sessionId as string) || "default";
    const all = await db
      .select()
      .from(architectMemory)
      .where(eq(architectMemory.sessionId, sessionId))
      .orderBy(desc(architectMemory.createdAt));

    const byType: Record<string, number> = {};
    for (const m of all) {
      byType[m.memoryType] = (byType[m.memoryType] || 0) + 1;
    }

    const recent = all.slice(0, 10).map((m: ArchitectMemory) => ({
      id: m.id,
      type: m.memoryType,
      title: m.title,
      createdAt: m.createdAt,
    }));

    return res.json({
      ok: true,
      summary: {
        total: all.length,
        byType,
        recent,
        sessionId,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { memoryType, title, content, tags, metadata, sessionId, tenantId } =
      req.body;

    if (!memoryType || !title || !content) {
      return res
        .status(400)
        .json({ error: "memoryType, title, and content are required" });
    }

    const [memory] = await db
      .insert(architectMemory)
      .values({
        sessionId: sessionId || "default",
        memoryType,
        title,
        content,
        tags: tags || [],
        metadata: metadata || null,
        tenantId: tenantId || null,
      })
      .returning();

    logger.info(
      { memoryId: memory.id, type: memoryType, title },
      "[ArchitectMemory] New memory stored"
    );

    return res.status(201).json({ ok: true, memory });
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const [updated] = await db
      .update(architectMemory)
      .set({
        ...req.body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(architectMemory.id, Number(req.params.id)))
      .returning();

    if (!updated)
      return res.status(404).json({ error: "Memory not found" });
    return res.json({ ok: true, memory: updated });
  } catch (e) {
    return next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(architectMemory)
      .where(eq(architectMemory.id, Number(req.params.id)))
      .returning();
    if (!deleted)
      return res.status(404).json({ error: "Memory not found" });
    return res.json({ ok: true, message: "Memory deleted" });
  } catch (e) {
    return next(e);
  }
});

router.delete("/", async (req, res, next) => {
  try {
    const sessionId = (req.query.sessionId as string) || "default";
    await db
      .delete(architectMemory)
      .where(eq(architectMemory.sessionId, sessionId));
    return res.json({ ok: true, message: `All memories for session ${sessionId} cleared` });
  } catch (e) {
    return next(e);
  }
});

export default router;
