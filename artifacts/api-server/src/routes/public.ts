import { Router } from "express";
import { db, tenants, products } from "@workspace/db";
import { eq, and, desc, like } from "drizzle-orm";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";

const router = Router();

/**
 * GET /api/public/products/:slug
 * Devuelve los productos activos de un tenant (por slug).
 * Sin autenticación — público.
 */
router.get("/products/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ message: "Tienda no encontrada" });
    }

    const rows = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenant.id),
          eq(products.isActive, true),
        ),
      )
      .orderBy(desc(products.createdAt));

    const serialized = rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      image: p.imageUrl,
      category: p.category ?? "General",
      kind: p.kind,
      currency: p.currency,
      sku: p.sku,
    }));

    return res.json({
      store: {
        name: tenant.brandName || tenant.name,
        slug: tenant.slug,
        logo: tenant.brandLogo,
        colors: tenant.brandColors,
      },
      products: serialized,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/public/generate-image
 * Genera una imagen por IA (DALL-E) a partir de un prompt.
 */
router.post("/generate-image", async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ message: "El prompt es requerido" });
    }

    const buffer = await generateImageBuffer(prompt, "1024x1024");
    const base64 = buffer.toString("base64");
    const dataUri = `data:image/png;base64,${base64}`;

    return res.json({ image: dataUri });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/public/create-product/:slug
 * Crea un producto en la BD real para el tenant (requiere API key simple o es público para admin local)
 */
router.post("/create-product/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { name, description, price, category } = req.body;

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ message: "Tenant no encontrado" });
    }

    const [product] = await db
      .insert(products)
      .values({
        tenantId: tenant.id,
        name,
        description,
        price: String(price ?? 0),
        category: category ?? "General",
        imageUrl: req.body.imageUrl ?? null,
        isActive: true,
      })
      .returning();

    return res.json(product);
  } catch (err) {
    next(err);
  }
});

export default router;
