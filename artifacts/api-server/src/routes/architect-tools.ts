import { Router, type IRouter } from "express";
import { architectTools } from "../lib/architect-tools";
import { db, products, agents as agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/products", async (_req, res, next) => {
  try {
    const all = await db.select().from(products).limit(100);
    return res.json({ ok: true, total: all.length, products: all });
  } catch (e) {
    return next(e);
  }
});

router.get("/products/:id", async (req, res, next) => {
  try {
    const [product] = await db.select().from(products).where(eq(products.id, Number(req.params.id))).limit(1);
    if (!product) return res.status(404).json({ error: "Producto no encontrado" });
    return res.json({ ok: true, product });
  } catch (e) {
    return next(e);
  }
});

router.patch("/products/:id", async (req, res, next) => {
  try {
    const [product] = await db.select().from(products).where(eq(products.id, Number(req.params.id))).limit(1);
    if (!product) return res.status(404).json({ error: "Producto no encontrado" });

    const allowed = ["name", "description", "price", "currency", "category", "features", "imageUrl", "highlights", "isActive"];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });

    await db.update(products).set(updates).where(eq(products.id, Number(req.params.id)));

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      `Producto actualizado: ${product.name}`,
      `Campos modificados: ${Object.keys(updates).join(", ")}`,
      { productId: Number(req.params.id), updates }
    );

    return res.json({ ok: true, message: "Producto actualizado", updates });
  } catch (e) {
    return next(e);
  }
});

router.post("/improve-product/:id", async (req, res, next) => {
  try {
    const result = await architectTools.improveProduct(Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Producto no encontrado" });

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      `Producto mejorado: ${result.name}`,
      JSON.stringify(result.changes),
      { productId: Number(req.params.id), changes: result.changes }
    );

    return res.json({ ok: true, result });
  } catch (e) {
    return next(e);
  }
});

router.post("/improve-description/:id", async (req, res, next) => {
  try {
    const newDesc = await architectTools.improveProductDescription(Number(req.params.id));
    if (!newDesc) return res.status(404).json({ error: "Producto no encontrado" });
    return res.json({ ok: true, description: newDesc });
  } catch (e) {
    return next(e);
  }
});

router.post("/set-image/:id", async (req, res, next) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: "imageUrl es requerido" });

    const ok = await architectTools.setCustomImage(Number(req.params.id), imageUrl);
    if (!ok) return res.status(404).json({ error: "Producto no encontrado" });

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      `Imagen actualizada para producto #${req.params.id}`,
      `Nueva imagen: ${imageUrl.substring(0, 100)}`,
      { productId: Number(req.params.id), imageUrl }
    );

    return res.json({ ok: true, message: "Imagen actualizada" });
  } catch (e) {
    return next(e);
  }
});

router.post("/improve-all-products", async (req, res, next) => {
  try {
    const limit = Number(req.body.limit) || 100;
    const result = await architectTools.bulkImproveProducts(limit);

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      "Mejora masiva de productos",
      `${result.improved} de ${result.total} productos mejorados`,
      { result }
    );

    return res.json({ ok: true, result });
  } catch (e) {
    return next(e);
  }
});

router.post("/improve-card-layout", async (req, res, next) => {
  try {
    const result = await architectTools.improveCardLayout(req.body.storeId);
    return res.json({ ok: true, message: result });
  } catch (e) {
    return next(e);
  }
});

router.get("/analyze-system", async (req, res, next) => {
  try {
    const analysis = await architectTools.analyzeSystem();

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      "Análisis del sistema",
      JSON.stringify(analysis),
      { analysis }
    );

    return res.json({ ok: true, analysis });
  } catch (e) {
    return next(e);
  }
});

export default router;
