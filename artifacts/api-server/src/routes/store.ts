import { Router } from "express";
import { ZodError } from "zod";
import { db, stores, store_categories, store_products, store_layouts, products, productCategories } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { Request, Response, NextFunction } from "express";
import { imageUrlFixer } from "../lib/image-url-fixer";

const router = Router();

// Middleware to load store by slug
router.param("slug", async (req: Request, res: Response, next: NextFunction, slug: string) => {
  try {
    const store = await db.select().from(stores).where(eq(stores.slug, slug)).then((r: any) => r[0]);
    if (!store) return res.status(404).json({ message: "Store not found" });
    // attach store to request
    (req as any).store = store;
    next();
  } catch (err) {
    return next(err);
  }
});

// Public catalog (GET /store/:slug)
//
// La tienda salía SIEMPRE vacía: leía de store_products/store_categories, unas
// tablas puente que nadie llena nunca — el catálogo real vive en `products` y
// `product_categories` (los mismos 50 productos que usa el bot y el panel).
// Ahora se sirve el catálogo real del tenant dueño de la tienda, y solo se usa
// store_products si esa tabla puente tiene entradas (selección curada manual).
router.get("/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const store = (req as any).store;

    const curated = await db.select().from(store_products).where(eq(store_products.storeId, store.id));
    if (curated.length > 0) {
      const categories = await db.select().from(store_categories).where(eq(store_categories.storeId, store.id));
      // Arreglar URLs de imágenes antes de retornar
      const productsWithImages = curated.map((p: any) => ({
        ...p,
        imageUrl: p.imageUrl || imageUrlFixer.getImagePath(p.id),
      }));
      return res.json({ store, categories, products: productsWithImages });
    }

    const [realProducts, realCategories] = await Promise.all([
      db.select().from(products).where(eq(products.tenantId, store.tenantId)),
      db.select().from(productCategories).where(eq(productCategories.tenantId, store.tenantId)),
    ]);

    // Arreglar URLs de imágenes antes de retornar
    const activeProducts = realProducts.filter((p: any) => p.isActive !== false).map((p: any) => ({
      ...p,
      imageUrl: p.imageUrl || imageUrlFixer.getImagePath(p.id),
    }));

    return res.json({
      store,
      categories: realCategories,
      products: activeProducts,
    });
  } catch (err) {
    return next(err);
  }
});

// Get single product (GET /store/:slug/product/:productId)
router.get("/:slug/product/:productId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const store = (req as any).store;
    // Mismo criterio que el catálogo: primero la tabla curada, y si ahí no
    // está (que es lo normal) se busca en el catálogo real del tenant.
    let product = await db.select().from(store_products).where(eq(store_products.id, Number(productId))).then((r: any) => r[0]);
    if (!product) {
      product = await db.select().from(products).where(eq(products.id, Number(productId))).then((r: any) => r[0]);
    }
    if (!product) return res.status(404).json({ message: "Product not found" });
    return res.json({ store, product });
  } catch (err) {
    return next(err);
  }
});

// Public layout (GET /store/:slug/layout)
router.get("/:slug/layout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const store = (req as any).store;
    const layout = await db.select().from(store_layouts).where(eq(store_layouts.storeId, store.id)).then((r: any) => r[0]);
    return res.json({ layout: layout?.layoutData ?? null });
  } catch (err) {
    return next(err);
  }
});

// POST /store/admin/fix-images -- Corregir URLs de imágenes de todos los productos
router.post("/admin/fix-images", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(401).json({ message: "No session found. Please login." });

    const result = await imageUrlFixer.fixAllProductImages(tenant.id);
    return res.json({
      ok: true,
      message: "✅ URLs de imágenes corregidas",
      ...result,
    });
  } catch (err) {
    return next(err);
  }
});

// POST /store/admin/bootstrap -- crea la tienda del tenant logueado si
// todavía no tiene una. Los tenants nuevos ya la reciben automáticamente al
// registrarse (ver routes/auth.ts), pero los que existían ANTES de ese fix
// (como el tenant 1) se quedaron sin fila en `stores` -- por eso "la tienda
// no aparece": GET /api/store/:slug devolvía 404 siempre. Idempotente: si ya
// existe, devuelve la existente en vez de duplicar.
router.post("/admin/bootstrap", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(401).json({ message: "No session found. Please login." });

    const existing = await db.select().from(stores).where(eq(stores.tenantId, tenant.id)).limit(1).then((r: any) => r[0]);
    if (existing) return res.json({ store: existing, created: false });

    const [created] = await db.insert(stores).values({
      tenantId: tenant.id,
      name: tenant.brandName || tenant.name,
      slug: tenant.slug,
    }).returning();
    return res.status(201).json({ store: created, created: true });
  } catch (err) {
    return next(err);
  }
});

// Admin routes (protected) -- exigen sesión real y que el tenant logueado
// sea DUEÑO de esta tienda (o admin de la plataforma). Antes era un no-op
// ("TODO: add authentication & ownership check") y además la ruta estaba en
// publicRoutes de app.ts: cualquiera sin sesión podía editar el layout de la
// tienda de CUALQUIER tenant con solo saber su slug.
router.use("/admin/:slug", (req: Request, res: Response, next: NextFunction) => {
  const tenant = (req as any).tenant;
  const store = (req as any).store;
  if (!tenant) {
    return res.status(401).json({ message: "No session found. Please login." });
  }
  if (!tenant.isAdmin && tenant.id !== store?.tenantId) {
    return res.status(403).json({ message: "No sos el dueño de esta tienda" });
  }
  return next();
});

router.get("/admin/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const store = (req as any).store;
    return res.json({ store });
  } catch (err) {
    return next(err);
  }
});

// Get store layout
router.get("/admin/:slug/layout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const store = (req as any).store;
    const layout = await db.select().from(store_layouts).where(eq(store_layouts.storeId, store.id)).then((r: any) => r[0]);
    return res.json({ layout: layout?.layoutData ?? null });
  } catch (err) {
    return next(err);
  }
});

// Save/update store layout (upsert)
router.put("/admin/:slug/layout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const store = (req as any).store;
    const { layoutData } = req.body;
    if (!layoutData) return res.status(400).json({ message: "layoutData is required" });

    const existing = await db.select().from(store_layouts).where(eq(store_layouts.storeId, store.id)).then((r: any) => r[0]);

    if (existing) {
      await db.update(store_layouts)
        .set({ layoutData, updatedAt: sql`NOW()` })
        .where(eq(store_layouts.storeId, store.id));
    } else {
      await db.insert(store_layouts).values({ storeId: store.id, layoutData });
    }

    return res.json({ message: "Layout saved successfully" });
  } catch (err) {
    return next(err);
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
