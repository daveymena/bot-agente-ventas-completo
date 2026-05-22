import { Router } from "express";
import { ZodError } from "zod";
import { db, stores, store_categories, store_products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Request, Response, NextFunction } from "express";

const router = Router();

// Middleware to load store by slug
router.param("slug", async (req: Request, res: Response, next: NextFunction, slug: string) => {
  try {
    const store = await db.select().from(stores).where(eq(stores.slug, slug)).then(r => r[0]);
    if (!store) return res.status(404).json({ message: "Store not found" });
    // attach store to request
    (req as any).store = store;
    next();
  } catch (err) {
    next(err);
  }
});

// Public catalog (GET /store/:slug)
router.get("/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const store = (req as any).store;
    const categories = await db.select().from(store_categories).where(eq(store_categories.storeId, store.id));
    const products = await db.select().from(store_products).where(eq(store_products.storeId, store.id));
    return res.json({ store, categories, products });
  } catch (err) {
    next(err);
  }
});

// Get single product (GET /store/:slug/product/:productId)
router.get("/:slug/product/:productId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const store = (req as any).store;
    const product = await db.select().from(store_products).where(eq(store_products.id, Number(productId))).then(r => r[0]);
    if (!product) return res.status(404).json({ message: "Product not found" });
    return res.json({ store, product });
  } catch (err) {
    next(err);
  }
});

// Admin routes (protected – placeholder, auth middleware to be added later)
router.use("/admin/:slug", (req, _res, next) => {
  // TODO: add authentication & ownership check
  next();
});

router.get("/admin/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const store = (req as any).store;
    return res.json({ store });
  } catch (err) {
    next(err);
  }
});

// Error handling similar to main router
router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: "Invalid data", issues: err.issues });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return res.status(500).json({ message });
});

export default router;
