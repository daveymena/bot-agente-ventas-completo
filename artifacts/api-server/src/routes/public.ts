import { Router } from "express";
import { db, tenants, products } from "@workspace/db";
import { eq, and, desc, like } from "drizzle-orm";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { getG4FImage, getAvailableG4FImageProviders, initializeG4F } from "../lib/providers/g4f-provider";
import { G4F_ENABLED } from "../config/g4f.config";
import { logger } from "../lib/logger";
import { whatsapp } from "../lib/whatsapp";

/**
 * Resuelve el número de WhatsApp asociado a la app (vía QR conectado).
 * Orden: whatsapp.getStatus().phone (conectado) > tenant.contactPhone > ADMIN_PHONE .env
 */
function resolveWhatsAppPhone(tenant?: { contactPhone?: string | null }): string | null {
  const wa = whatsapp.getStatus();
  if (wa?.phone && /^\d+$/.test(wa.phone)) return wa.phone;
  if (tenant?.contactPhone) return tenant.contactPhone.replace(/\D/g, "");
  const admin = process.env.ADMIN_PHONE;
  if (admin) return admin.replace(/\D/g, "");
  return null;
}

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

    const serialized = rows.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      image: p.imageUrl,
      category: p.category ?? "General",
      kind: p.kind,
      currency: p.currency,
      sku: p.sku,
      features: p.features,
      paymentLink: p.paymentLink,
      deliveryLink: p.deliveryLink,
    }));

    return res.json({
      store: {
        name: tenant.brandName || tenant.name,
        slug: tenant.slug,
        logo: tenant.brandLogo,
        colors: tenant.brandColors,
        whatsappPhone: resolveWhatsAppPhone(tenant),
      },
      products: serialized,
    });
  } catch (err) {
    return next(err);
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
    return next(err);
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
    return next(err);
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
    return next(err);
  }
});

/**
 * POST /api/public/checkout/:slug/:productId
 * Generates a payment checkout URL on-the-fly (MercadoPago preference or PayPal order).
 * Body: { method: "mercadopago" | "paypal", customer?: { name?, email?, phone? } }
 */
router.post("/checkout/:slug/:productId", async (req, res, next) => {
  try {
    const { slug, productId } = req.params;
    const method = (req.body?.method || "mercadopago") as string;
    const customer = req.body?.customer || {};

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ message: "Tienda no encontrada" });
    }

    const [product] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenant.id),
          eq(products.id, Number(productId)),
        ),
      )
      .limit(1);

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const appUrl =
      process.env.APP_URL ||
      `http://localhost:${process.env.PORT || 3002}`;

    if (method === "paypal") {
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      const paypalMode = process.env.PAYPAL_MODE || "live";
      const paypalApi =
        paypalMode === "sandbox"
          ? "https://api-m.sandbox.paypal.com"
          : "https://api-m.paypal.com";

      if (!clientId || !clientSecret) {
        return res.status(500).json({ message: "PayPal no configurado" });
      }

      const tokenRes = await fetch(`${paypalApi}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Language": "en_US",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenRes.ok) {
        logger.error({ status: tokenRes.status }, "[Checkout] PayPal auth failed");
        return res.status(502).json({ message: "Error autenticando con PayPal" });
      }

      const tokenData = (await tokenRes.json()) as any;

      const orderRes = await fetch(`${paypalApi}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenData.access_token}`,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: `${product.id}`,
              description: product.name,
              amount: {
                currency_code: product.currency === "COP" ? "USD" : product.currency || "USD",
                value: Number(product.price).toFixed(2),
              },
            },
          ],
          application_context: {
            brand_name: tenant.brandName || tenant.name,
            return_url: product.deliveryLink || `${appUrl}/paypal-success`,
            cancel_url: `${appUrl}/paypal-cancel`,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      const orderData = (await orderRes.json()) as any;
      if (!orderRes.ok) {
        logger.error({ orderData }, "[Checkout] PayPal order creation failed");
        return res.status(502).json({ message: "Error creando orden de PayPal" });
      }

      const approveLink = orderData.links?.find((l: any) => l.rel === "approve")?.href;

      return res.json({
        method: "paypal",
        checkoutUrl: approveLink,
        orderId: orderData.id,
      });
    }

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!mpToken) {
      return res.status(500).json({ message: "MercadoPago no configurado" });
    }

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            id: product.id?.toString() || "prod_" + Date.now(),
            title: product.name,
            quantity: 1,
            currency_id: product.currency === "USD" ? "COP" : product.currency || "COP",
            unit_price: Number(product.price || 0),
          },
        ],
        payer: {
          email: customer.email || "cliente@email.com",
          name: customer.name || "Cliente",
        },
        back_urls: {
          success: product.deliveryLink || `${appUrl}/mp-success`,
          failure: `${appUrl}/mp-failure`,
          pending: `${appUrl}/mp-pending`,
        },
        ...(appUrl.startsWith("https") ? { auto_return: "approved" } : {}),
        external_reference: `${customer.phone || "guest"}|${product.id}`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const mpData = (await mpRes.json()) as any;
    if (!mpRes.ok) {
      logger.error({ mpData }, "[Checkout] MercadoPago preference failed");
      return res.status(502).json({ message: "Error creando preferencia de MercadoPago", detail: mpData });
    }

    return res.json({
      method: "mercadopago",
      checkoutUrl: mpData.init_point,
      sandboxUrl: mpData.sandbox_init_point,
      preferenceId: mpData.id,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/public/whatsapp-info/:slug
 * Devuelve el número de WhatsApp conectado a la app (vía QR) o el fallback del tenant/ADMIN_PHONE.
 */
router.get("/whatsapp-info/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (!tenant) return res.status(404).json({ message: "Tienda no encontrada" });
    const waPhone = resolveWhatsAppPhone(tenant);
    return res.json({ phone: waPhone, connected: whatsapp.isConnected() });
  } catch (err) {
    return next(err);
  }
});

export default router;
