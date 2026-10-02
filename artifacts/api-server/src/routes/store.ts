import { Router } from "express";
import { ZodError } from "zod";
import { db, stores, store_categories, store_products, store_layouts, products, productCategories } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { Request, Response, NextFunction } from "express";
import { imageUrlFixer } from "../lib/image-url-fixer";

const router = Router();

function publicStore(store: any) {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description,
    logo: store.logo || store.logoUrl,
    primaryColor: store.primaryColor,
  };
}

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
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        category: p.category,
        kind: p.kind,
        sku: p.sku,
        features: p.features,
        paymentLink: p.paymentLink,
        imageUrl: p.imageUrl || imageUrlFixer.getImagePath(p.id),
      }));
      return res.json({ store: publicStore(store), categories, products: productsWithImages });
    }

    const [realProducts, realCategories] = await Promise.all([
      db.select().from(products).where(eq(products.tenantId, store.tenantId)),
      db.select().from(productCategories).where(eq(productCategories.tenantId, store.tenantId)),
    ]);

    // Arreglar URLs de imágenes antes de retornar
    const activeProducts = realProducts.filter((p: any) => p.isActive !== false).map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency,
      category: p.category,
      kind: p.kind,
      sku: p.sku,
      features: p.features,
      paymentLink: p.paymentLink,
      imageUrl: p.imageUrl || imageUrlFixer.getImagePath(p.id),
    }));

    return res.json({
      store: publicStore(store),
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
    // Siempre de ESTA tienda y de SU negocio (29-09-2026): antes se buscaba
    // solo por id, y /store/<tienda-A>/product/<id-de-B> mostraba (y dejaba
    // comprar) el producto de otro negocio.
    let product = await db.select().from(store_products)
      .where(and(eq(store_products.id, Number(productId)), eq(store_products.storeId, store.id))).then((r: any) => r[0]);
    if (!product) {
      product = await db.select().from(products)
        .where(and(eq(products.id, Number(productId)), eq(products.tenantId, store.tenantId))).then((r: any) => r[0]);
    }
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.tenantId !== store.tenantId && product.storeId !== store.id) return res.status(404).json({ message: "Product not found" });
    return res.json({
      store: publicStore(store),
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: product.currency,
        category: product.category,
        kind: product.kind,
        sku: product.sku,
        features: product.features,
        paymentLink: product.paymentLink,
        imageUrl: product.imageUrl || imageUrlFixer.getImagePath(product.id),
      },
    });
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

// POST /store/admin/fix-physical-images -- Re-descargar imágenes de productos físicos
// Las imágenes de productos físicos se perdían porque IMAGE_STORE_DIR no estaba
// configurado. Este endpoint re-descarga desde las URLs originales (Dropi/WooCommerce)
// y las guarda en el volumen persistente.
router.post("/admin/fix-physical-images", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(401).json({ message: "No session found. Please login." });

    // Traer todos los productos físicos del tenant
    const allProducts = await db
      .select()
      .from(products)
      .where(eq(products.tenantId, tenant.id));

    const physicalProducts = allProducts.filter((p: any) => p.kind === "physical");
    const { saveProductImage } = await import("../lib/image-store");
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");

    let fixed = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const product of physicalProducts) {
      // Verificar si ya tiene imagen válida en disco
      const imgPath = path.resolve(process.env.IMAGE_STORE_DIR || "data/images", "products", `${product.id}.jpg`);
      if (existsSync(imgPath)) {
        skipped++;
        continue;
      }

      // Intentar obtener URL original del metadata (Dropi/WooCommerce)
      let originalUrl: string | null = null;
      try {
        const meta = JSON.parse(product.metadata || "{}");
        if (meta.imageUrls && Array.isArray(meta.imageUrls) && meta.imageUrls.length > 0) {
          originalUrl = meta.imageUrls[0];
        } else if (meta.source === "dropi" && meta.dropiProductId) {
          // Si no tiene imageUrls en metadata, se trae de Dropi con el token
          // DEL NEGOCIO (antes: la sesión global del dueño del servidor).
          const { tokenDropiDelTenant, detalleProductoDropi, fotosDe } = await import("../lib/dropi-directo");
          const tokenDropi = await tokenDropiDelTenant(tenant.id);
          const dropiResult = tokenDropi ? await detalleProductoDropi(tokenDropi, Number(meta.dropiProductId)) : null;
          if (dropiResult?.ok && dropiResult.data) {
            const urls = fotosDe(dropiResult.data);
            if (urls.length > 0) originalUrl = urls[0];
          }
        }
      } catch (e) {
        // Metadata inválido, ignorar
      }

      if (!originalUrl) {
        failed++;
        errors.push(`ID ${product.id}: sin URL original en metadata`);
        continue;
      }

      // Descargar y guardar
      const saved = await saveProductImage(originalUrl, product.id);
      if (saved) {
        await db.update(products).set({ imageUrl: saved }).where(eq(products.id, product.id));
        fixed++;
        console.log(`✅ ID ${product.id}: imagen re-descargada`);
      } else {
        failed++;
        errors.push(`ID ${product.id}: no se pudo descargar desde ${originalUrl.substring(0, 50)}`);
      }
    }

    return res.json({
      ok: true,
      message: `📦 Imágenes físicas: ${fixed} corregidas, ${skipped} ya ok, ${failed} fallidas`,
      fixed,
      skipped,
      failed,
      errors: errors.slice(0, 10),
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
    // Mismo motivo que en el PUT de abajo: el slug es publico, asi que sin
    // esto se podia leer la configuracion de administracion de otra tienda.
    const tenantLector = (req as any).tenant;
    const tiendaLeida = (req as any).store;
    if (!tenantLector?.id) return res.status(401).json({ message: "No autorizado" });
    if (tiendaLeida?.tenantId && tiendaLeida.tenantId !== tenantLector.id) {
      return res.status(403).json({ message: "Esa tienda no es tuya." });
    }

    const store = (req as any).store;
    return res.json({ store });
  } catch (err) {
    return next(err);
  }
});

// Get store layout
router.get("/admin/:slug/layout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Mismo motivo que en el PUT de abajo: el slug es publico, asi que sin
    // esto se podia leer la configuracion de administracion de otra tienda.
    const tenantLector = (req as any).tenant;
    const tiendaLeida = (req as any).store;
    if (!tenantLector?.id) return res.status(401).json({ message: "No autorizado" });
    if (tiendaLeida?.tenantId && tiendaLeida.tenantId !== tenantLector.id) {
      return res.status(403).json({ message: "Esa tienda no es tuya." });
    }

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

    // ── La tienda tiene que ser DE QUIEN la edita ─────────────────────────
    // El middleware de arriba resuelve la tienda por SLUG y nada mas, y los
    // slugs son publicos: estan en la URL de cada tienda
    // (/tienda/sofia-premium). Sin esta comprobacion, cualquier usuario con
    // sesion podia reescribir el diseno de la tienda de OTRO negocio con solo
    // poner su slug en la URL. Encontrado en la auditoria previa al
    // lanzamiento (2026-08-22).
    //
    // Las rutas publicas de /:slug (ver la tienda, un producto, el layout) NO
    // llevan esta comprobacion a proposito: esas son la tienda de cara al
    // cliente y tienen que ser visibles para cualquiera.
    const tenant = (req as any).tenant;
    if (!tenant?.id) return res.status(401).json({ message: "No autorizado" });
    if (store?.tenantId && store.tenantId !== tenant.id) {
      return res.status(403).json({ message: "Esa tienda no es tuya." });
    }

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
