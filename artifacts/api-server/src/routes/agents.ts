import { Router, type IRouter } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  CreateAgentBody,
  ListAgentsResponse,
  UpdateAgentBody,
  UpdateAgentParams,
  UpdateAgentResponse,
  DeleteAgentParams,
  DeleteAgentResponse,
  ActivateAgentParams,
  ActivateAgentResponse,
} from "@workspace/api-zod";
import { db, agents } from "@workspace/db";

const router: IRouter = Router();

router.get("/", async (_req, res, next) => {
  try {
    const rows = await db.select().from(agents).orderBy(desc(agents.createdAt));
    return res.json(ListAgentsResponse.parse(rows.map(serialize)));
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = CreateAgentBody.parse(req.body);
    const [created] = await db
      .insert(agents)
      .values({ ...body, isActive: body.isActive ?? false })
      .returning();
    if (created && body.isActive) {
      await db
        .update(agents)
        .set({ isActive: false })
        .where(and(eq(agents.isActive, true), ne(agents.id, created.id)));
    }
    return res.json(serialize(created!));
  } catch (e) {
    return next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (!row) return res.status(404).json({ message: "Agente no encontrado" });
    return res.json(serialize(row));
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = UpdateAgentParams.parse(req.params);
    const body = UpdateAgentBody.parse(req.body);
    const [updated] = await db
      .update(agents)
      .set(body)
      .where(eq(agents.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Agente no encontrado" });
    if (body.isActive) {
      await db
        .update(agents)
        .set({ isActive: false })
        .where(and(eq(agents.isActive, true), ne(agents.id, id)));
    }
    return res.json(UpdateAgentResponse.parse(serialize(updated)));
  } catch (e) {
    return next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = DeleteAgentParams.parse(req.params);
    await db.delete(agents).where(eq(agents.id, id));
    return res.json(DeleteAgentResponse.parse({ ok: true }));
  } catch (e) {
    return next(e);
  }
});

router.post("/:id/activate", async (req, res, next) => {
  try {
    const { id } = ActivateAgentParams.parse(req.params);
    await db.update(agents).set({ isActive: false }).where(eq(agents.isActive, true));
    const [updated] = await db
      .update(agents)
      .set({ isActive: true })
      .where(eq(agents.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Agente no encontrado" });
    return res.json(ActivateAgentResponse.parse(serialize(updated)));
  } catch (e) {
    return next(e);
  }
});

function serialize(row: typeof agents.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    tone: row.tone,
    language: row.language,
    model: row.model,
    systemPrompt: row.systemPrompt,
    stages: row.stages ?? [],
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export default router;
