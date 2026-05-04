import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  CreateLeadBody,
  DeleteLeadParams,
  DeleteLeadResponse,
  ListLeadsQueryParams,
  ListLeadsResponse,
  UpdateLeadBody,
  UpdateLeadParams,
  UpdateLeadResponse,
} from "@workspace/api-zod";
import { db, leads, activityEvents } from "@workspace/db";

const router: IRouter = Router();

router.get("/", async (req, res, next) => {
  try {
    const q = ListLeadsQueryParams.parse(req.query);
    const rows = q.stage
      ? await db.select().from(leads).where(eq(leads.stage, q.stage)).orderBy(desc(leads.createdAt))
      : await db.select().from(leads).orderBy(desc(leads.createdAt));
    return res.json(ListLeadsResponse.parse(rows.map(serialize)));
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = CreateLeadBody.parse(req.body);
    const [created] = await db
      .insert(leads)
      .values({ ...body, value: String(body.value ?? 0) })
      .returning();
    await db.insert(activityEvents).values({
      type: "lead_created",
      title: `Nuevo lead: ${created!.name}`,
      subtitle: created!.phone,
    });
    return res.json(serialize(created!));
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = UpdateLeadParams.parse(req.params);
    const body = UpdateLeadBody.parse(req.body);
    const update: Record<string, unknown> = { ...body };
    if (body.value !== undefined) update.value = String(body.value);
    const [updated] = await db.update(leads).set(update).where(eq(leads.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Lead no encontrado" });
    if (body.stage === "won") {
      await db.insert(activityEvents).values({
        type: "deal_won",
        title: `Venta cerrada: ${updated.name}`,
        subtitle: `$${updated.value}`,
      });
    } else if (body.stage === "lost") {
      await db.insert(activityEvents).values({
        type: "deal_lost",
        title: `Lead perdido: ${updated.name}`,
        subtitle: updated.phone,
      });
    }
    return res.json(UpdateLeadResponse.parse(serialize(updated)));
  } catch (e) {
    return next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = DeleteLeadParams.parse(req.params);
    await db.delete(leads).where(eq(leads.id, id));
    return res.json(DeleteLeadResponse.parse({ ok: true }));
  } catch (e) {
    return next(e);
  }
});

function serialize(row: typeof leads.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? null,
    stage: row.stage,
    value: Number(row.value),
    notes: row.notes ?? null,
    source: row.source ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export default router;
