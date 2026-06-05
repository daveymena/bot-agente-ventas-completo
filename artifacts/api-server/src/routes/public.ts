import { Router } from "express";
import { db, tenants, products } from "@workspace/db";
import { eq, and, desc, like } from "drizzle-orm";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { getG4FImage, getAvailableG4FImageProviders, initializeG4F } from "../lib/providers/g4f-provider";
import { G4F_ENABLED } from "../config/g4f.config";
import { logger } from "../lib/logger";

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
 * Genera una imagen por IA a partir de un prompt.
 * Intenta OpenAI primero; si falla o no hay key, usa G4F.
 */
router.post("/generate-image", async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ message: "El prompt es requerido" });
    }

    // Intentar con OpenAI (DALL-E)
    if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      try {
        const buffer = await generateImageBuffer(prompt, "1024x1024");
        const base64 = buffer.toString("base64");
        return res.json({ image: `data:image/png;base64,${base64}`, provider: "openai" });
      } catch (openAIErr) {
        logger.warn({ err: openAIErr }, "[Image] OpenAI falló, intentando G4F");
      }
    }

    // Fallback: G4F image generation
    if (G4F_ENABLED) {
      const g4fResult = await getG4FImage(prompt);
      if (g4fResult) {
        const image = g4fResult.image.startsWith("data:")
          ? g4fResult.image
          : g4fResult.image.startsWith("http")
            ? g4fResult.image
            : `data:image/png;base64,${g4fResult.image}`;
        return res.json({ image, provider: `g4f/${g4fResult.provider}` });
      }
    }

    return res.status(500).json({ message: "No se pudo generar la imagen con ningún proveedor" });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/public/image-providers
 * Lista los proveedores de imagen disponibles
 */
router.get("/image-providers", async (_req, res, next) => {
  try {
    const providers: { name: string; provider: string }[] = [];

    if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      providers.push({ name: "OpenAI DALL-E", provider: "openai" });
    }

    if (G4F_ENABLED) {
      await initializeG4F();
      const g4fProviders = await getAvailableG4FImageProviders();
      for (const p of g4fProviders) {
        providers.push({ name: `G4F ${p.name}`, provider: `g4f/${p.name}`, ...p.working !== false ? {} : { working: false } });
      }
    }

    return res.json({ providers });
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
