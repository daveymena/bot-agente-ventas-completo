import { safeISO } from "../lib/date-utils";
import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import {
  CreateCategoryBody,
  DeleteCategoryParams,
  DeleteCategoryResponse,
  ListCategoriesResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryResponse,
} from "@workspace/api-zod";
import { db, productCategories } from "@workspace/db";

const router: IRouter = Router();

router.get("/", async (_req, res, next) => {
  try {
    const rows = await db.select().from(productCategories).orderBy(asc(productCategories.name));
    return res.json(ListCategoriesResponse.parse(rows.map(serialize)));
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = CreateCategoryBody.parse(req.body);
    const [created] = await db.insert(productCategories).values(body).returning();
    return res.json(serialize(created!));
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = UpdateCategoryParams.parse(req.params);
    const body = UpdateCategoryBody.parse(req.body);
    const [updated] = await db
      .update(productCategories)
      .set(body)
      .where(eq(productCategories.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Categoría no encontrada" });
    return res.json(UpdateCategoryResponse.parse(serialize(updated)));
  } catch (e) {
    return next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = DeleteCategoryParams.parse(req.params);
    await db.delete(productCategories).where(eq(productCategories.id, id));
    return res.json(DeleteCategoryResponse.parse({ ok: true }));
  } catch (e) {
    return next(e);
  }
});

function serialize(row: typeof productCategories.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: (row as any).description ?? null,
    icon: (row as any).icon ?? null,
    color: (row as any).color ?? "#6b7280",
    createdAt: safeISO(row.createdAt),
  };
}

export default router;
