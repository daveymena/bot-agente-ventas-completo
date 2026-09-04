import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import type { TenantRequest } from "../lib/tenantManager";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";

const router = Router();

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "landing";
}

async function productBelongsToTenant(productId: unknown, tenantId: number) {
  if (productId === null || productId === undefined || productId === "") return true;
  const numericId = Number(productId);
  if (!Number.isInteger(numericId) || numericId <= 0) return false;
  const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, numericId), eq(products.tenantId, tenantId))).limit(1);
  return !!product;
}

router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const rows = await db.select().from(landingPages).where(eq(landingPages.tenantId, tenantId)).orderBy(desc(landingPages.updatedAt));
    return res.json(rows);
  } catch (e) { return next(e); }
});

router.get("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const [row] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Landing no encontrada" });
    return res.json(row);
  } catch (e) { return next(e); }
});

router.post("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const { name = "Nueva landing", productId = null, strategy = {}, sections = [], design = {}, source = {} } = req.body || {};
    if (!(await productBelongsToTenant(productId, tenantId))) return res.status(400).json({ error: "El producto no pertenece al tenant actual o no es válido" });
    const normalizedProductId = productId === null || productId === undefined || productId === "" ? null : Number(productId);
    const [created] = await db.insert(landingPages).values({ tenantId, productId: normalizedProductId, name: String(name).slice(0, 200), slug: slugify(String(name)) + "-" + Date.now().toString(36), strategy, sections, design, source }).returning();
    return res.status(201).json(created);
  } catch (e) { return next(e); }
});

router.patch("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const allowed = ["name", "status", "strategy", "sections", "design", "source", "publishedUrl", "productId"] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    if (Object.prototype.hasOwnProperty.call(patch, "productId")) {
      if (!(await productBelongsToTenant(patch.productId, tenantId))) return res.status(400).json({ error: "El producto no pertenece al tenant actual o no es válido" });
      patch.productId = patch.productId === null || patch.productId === "" ? null : Number(patch.productId);
    }
    patch.updatedAt = new Date();
    const [updated] = await db.update(landingPages).set(patch as any).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).returning();
    if (!updated) return res.status(404).json({ error: "Landing no encontrada" });
    return res.json(updated);
  } catch (e) { return next(e); }
});

router.delete("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const [deleted] = await db.delete(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).returning({ id: landingPages.id });
    if (!deleted) return res.status(404).json({ error: "Landing no encontrada" });
    return res.status(204).send();
  } catch (e) { return next(e); }
});

export default router;
