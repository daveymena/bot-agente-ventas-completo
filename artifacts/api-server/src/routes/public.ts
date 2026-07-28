import { Router } from "express";
import { db, tenants, products } from "@workspace/db";
import { eq, and, desc, like } from "drizzle-orm";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { getG4FImage, getAvailableG4FImageProviders, initializeG4F } from "../lib/providers/g4f-provider";
import { G4F_ENABLED } from "../config/g4f.config";
import { logger } from "../lib/logger";
import { whatsapp } from "../lib/whatsapp";
import { tenantManager } from "../lib/tenantManager";

/**
 * Resuelve el número de WhatsApp asociado a la app (vía QR conectado).
 * Orden: whatsapp.getStatus().phone (conectado) > tenant.contactPhone > ADMIN_PHONE .env
 */
/**
 * Píxel de Meta del tenant. Sale de su metadata (cada tienda mide en SU píxel);
 * el .env queda como respaldo para la instalación propia.
 */
function resolvePixelId(tenant?: { metadata?: unknown }): string | null {
  try {
    const raw = tenant?.metadata;
    const meta: any = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
    return meta?.facebook?.pixelId || process.env.FB_PIXEL_ID || null;
  } catch {
    return process.env.FB_PIXEL_ID || null;
  }
}

function resolveWhatsAppPhone(tenant?: { contactPhone?: string | null }): string | null {
  const wa = whatsapp.getStatus();
  if (wa?.phone && /^\d+$/.test(wa.phone)) return wa.phone;
  if (tenant?.contactPhone) return tenant.contactPhone.replace(/\D/g, "");
  const admin = process.env.ADMIN_PHONE;
  if (admin) return admin.replace(/\D/g, "");
  return null;
}

/**
 * MercadoPago descarta picture_url si no es absoluta, y las imágenes del
 * catálogo se guardan como rutas relativas (/images/products/41.jpg). Sin
 * esto el checkout se queda sin foto del producto.
 * Devuelve undefined en localhost: MP no puede alcanzar esa URL.
 */
function toAbsoluteImageUrl(imageUrl?: string | null): string | undefined {
  if (!imageUrl) return undefined;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;

  const appUrl = process.env.APP_URL || "";
  if (!/^https:\/\//i.test(appUrl)) return undefined;

  return `${appUrl.replace(/\/+$/, "")}/${imageUrl.replace(/^\/+/, "")}`;
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
        pixelId: resolvePixelId(tenant),
      },
      products: serialized,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/public/product/:slug/:productId
 * Ficha completa de UN producto para la página de detalle de la tienda.
 * Existe aparte de /products/:slug para no bajar el catálogo entero (~77KB)
 * cada vez que alguien abre un producto.
 */
router.get("/product/:slug/:productId", async (req, res, next) => {
  try {
    const { slug, productId } = req.params;

    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (!tenant) return res.status(404).json({ message: "Tienda no encontrada" });

    const [p] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenant.id),
          eq(products.id, Number(productId)),
          eq(products.isActive, true),
        ),
      )
      .limit(1);

    if (!p) return res.status(404).json({ message: "Producto no encontrado" });

    // Productos relacionados: misma categoría, para que el cliente siga viendo
    // opciones en vez de quedarse sin salida en la ficha.
    const related = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenant.id),
          eq(products.isActive, true),
          eq(products.category, p.category ?? "General"),
        ),
      )
      .limit(5);

    return res.json({
      store: {
        name: tenant.brandName || tenant.name,
        slug: tenant.slug,
        logo: tenant.brandLogo,
        whatsappPhone: resolveWhatsAppPhone(tenant),
        pixelId: resolvePixelId(tenant),
      },
      product: {
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        image: p.imageUrl,
        category: p.category ?? "General",
        kind: p.kind,
        sku: p.sku,
        features: p.features,
      },
      related: related
        .filter(r => r.id !== p.id)
        .slice(0, 4)
        .map(r => ({
          id: r.id,
          name: r.name,
          price: r.price,
          image: r.imageUrl,
          category: r.category ?? "General",
        })),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/public/fb-connect
 * Onboarding de Facebook: recibe un token de usuario recién autorizado, lo
 * canjea por uno de larga duración, saca el token de la página y lo guarda en
 * el tenant. Así cada administrador conecta SU página sin pegar tokens a mano.
 *
 * Cerrado por defecto: solo responde con FB_CONNECT_ENABLED=true. Es un paso
 * de configuración puntual, no un endpoint que deba quedar abierto — sin la
 * bandera, cualquiera podría reasignar la página del tenant.
 */
router.post("/fb-connect", async (req, res, next) => {
  try {
    if (process.env.FB_CONNECT_ENABLED !== "true") {
      return res.status(404).json({ message: "No disponible" });
    }

    const userToken = req.body?.userToken;
    const tenantId = Number(req.body?.tenantId) || 1;
    const wantedPageId = req.body?.pageId ? String(req.body.pageId) : null;

    if (!userToken || typeof userToken !== "string") {
      return res.status(400).json({ message: "userToken requerido" });
    }

    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;
    if (!appId || !appSecret) {
      return res.status(500).json({ message: "FB_APP_ID / FB_APP_SECRET no configurados" });
    }

    const graph = "https://graph.facebook.com/v21.0";

    // 1. Canjear por token de larga duración. Los tokens del Explorador duran
    //    ~1-2 horas; los de página derivados de uno de larga duración no caducan.
    const exRes = await fetch(
      `${graph}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(userToken)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const exData: any = await exRes.json();
    if (!exRes.ok || exData.error) {
      logger.error({ err: exData?.error }, "[FB-Connect] Falló el canje de token");
      return res.status(502).json({ message: exData?.error?.message || "Error canjeando el token" });
    }
    const longLivedUserToken = exData.access_token;

    // 2. Páginas que administra, con su token propio
    const pagesRes = await fetch(
      `${graph}/me/accounts?fields=id,name,access_token,tasks&access_token=${encodeURIComponent(longLivedUserToken)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const pagesData: any = await pagesRes.json();
    if (!pagesRes.ok || pagesData.error) {
      return res.status(502).json({ message: pagesData?.error?.message || "Error listando páginas" });
    }

    const pages: any[] = pagesData.data || [];
    if (pages.length === 0) {
      return res.status(404).json({ message: "El usuario no administra ninguna página" });
    }

    const page = wantedPageId ? pages.find(p => p.id === wantedPageId) : pages[0];
    if (!page) {
      return res.status(404).json({
        message: `La página ${wantedPageId} no está entre las que administra`,
        disponibles: pages.map(p => ({ id: p.id, name: p.name })),
      });
    }

    // 3. Guardar en el tenant (no en el .env): esto es multi-cuenta
    const [row] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const meta: any = row?.metadata
      ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata)
      : {};
    meta.facebook = {
      ...(meta.facebook || {}),
      pageId: page.id,
      pageName: page.name,
      messengerPageToken: page.access_token,
      accessToken: page.access_token,
      // Los tasks dicen qué puede hacer este token sobre la página.
      // CREATE_CONTENT = puede publicar. Se guardan porque un token DE PÁGINA
      // no expone /me/permissions (devuelve vacío), así que es la única forma
      // fiable de saber si se puede publicar sin intentarlo a ciegas.
      tasks: page.tasks || [],
      connectedAt: new Date().toISOString(),
    };
    await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tenantId));
    // Sin esto, el tenant queda cacheado en memoria (hasta 5 min, ver
    // tenantManager.CACHE_TTL) con el token VIEJO — el admin reconecta,
    // la BD queda bien, pero el server sigue publicando con el token
    // vencido hasta que el caché expira solo. Parecía que la reconexión
    // "no servía".
    tenantManager.clearCache();

    // 4. Confirmar qué permisos quedaron en el token de la página
    const permRes = await fetch(
      `${graph}/me/permissions?access_token=${encodeURIComponent(page.access_token)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const permData: any = await permRes.json();
    const granted = (permData.data || []).filter((p: any) => p.status === "granted").map((p: any) => p.permission);

    logger.info({ tenantId, pageId: page.id, pageName: page.name }, "[FB-Connect] Página conectada al tenant");

    // Nunca se devuelve el token en la respuesta
    return res.json({
      ok: true,
      page: { id: page.id, name: page.name, tasks: page.tasks },
      canPost: granted.includes("pages_manage_posts"),
      permissions: granted,
      otrasPaginas: pages.filter(p => p.id !== page.id).map(p => ({ id: p.id, name: p.name })),
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

      // PayPal no liquida en COP: hay que CONVERTIR, no solo reetiquetar la
      // moneda. Antes se mandaba el precio en pesos con currency_code USD, así
      // que un curso de $60.000 COP (~14 USD) se cobraba como 60.000 USD.
      // Misma tasa que usa el bot de WhatsApp en lib/payments.ts.
      const exchangeRate = Number(process.env.PAYPAL_EXCHANGE_RATE) || 4300;
      const isCop = (product.currency || "COP") === "COP";
      const paypalCurrency = isCop ? "USD" : product.currency!;
      const paypalValue = isCop
        ? (Number(product.price || 0) / exchangeRate).toFixed(2)
        : Number(product.price || 0).toFixed(2);

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
                currency_code: paypalCurrency,
                value: paypalValue,
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
            // description y picture_url hacen que MercadoPago muestre la ficha
            // del producto en su checkout; sin ellos solo aparece el monto.
            description: (product.description || product.name).replace(/\s+/g, " ").trim().substring(0, 250),
            picture_url: toAbsoluteImageUrl(product.imageUrl),
            category_id: "learnings",
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
 * POST /api/public/checkout-cart/:slug
 * Checkout del carrito con VARIOS productos. El endpoint por producto
 * (/checkout/:slug/:productId) solo sirve para compra directa de 1 ítem.
 *
 * Los precios SIEMPRE se leen de la base de datos, nunca del cliente: si se
 * confiara en el body, cualquiera podría pagar $1 por un curso alterando el
 * request desde el navegador.
 *
 * body: { method: "mercadopago"|"paypal", items: [{productId, quantity}], customer }
 */
router.post("/checkout-cart/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const method = (req.body?.method || "mercadopago") as string;
    const customer = req.body?.customer || {};
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

    if (rawItems.length === 0) {
      return res.status(400).json({ message: "El carrito está vacío" });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (!tenant) return res.status(404).json({ message: "Tienda no encontrada" });

    // Cargar cada producto desde la BD y quedarnos con SU precio real
    const lines: { product: typeof products.$inferSelect; quantity: number }[] = [];
    for (const raw of rawItems) {
      const productId = Number(raw?.productId);
      const quantity = Math.max(1, Math.min(99, Number(raw?.quantity) || 1));
      if (!Number.isFinite(productId)) continue;

      const [product] = await db
        .select()
        .from(products)
        .where(and(eq(products.tenantId, tenant.id), eq(products.id, productId)))
        .limit(1);

      if (product) lines.push({ product, quantity });
    }

    if (lines.length === 0) {
      return res.status(404).json({ message: "Ningún producto del carrito existe en esta tienda" });
    }

    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3002}`;
    const reference = `${customer.phone || "guest"}|cart|${lines.map(l => l.product.id).join(",")}`;

    if (method === "paypal") {
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.status(500).json({ message: "PayPal no configurado" });
      }

      const paypalApi =
        (process.env.PAYPAL_MODE || "live") === "sandbox"
          ? "https://api-m.sandbox.paypal.com"
          : "https://api-m.paypal.com";

      const tokenRes = await fetch(`${paypalApi}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenRes.ok) {
        logger.error({ status: tokenRes.status }, "[CheckoutCart] PayPal auth failed");
        return res.status(502).json({ message: "Error autenticando con PayPal" });
      }
      const tokenData = (await tokenRes.json()) as any;

      // Convertir COP → USD (PayPal no liquida en pesos). Se redondea CADA
      // línea antes de sumar para que item_total cuadre exacto con el total;
      // si se redondeara solo al final, PayPal rechaza la orden por descuadre.
      const exchangeRate = Number(process.env.PAYPAL_EXCHANGE_RATE) || 4300;
      const ppItems = lines.map(({ product, quantity }) => {
        const isCop = (product.currency || "COP") === "COP";
        const unit = isCop
          ? Number(product.price || 0) / exchangeRate
          : Number(product.price || 0);
        return {
          name: product.name.substring(0, 127),
          quantity: String(quantity),
          unit_amount: { currency_code: "USD", value: unit.toFixed(2) },
        };
      });

      const itemTotal = ppItems
        .reduce((acc, it) => acc + Number(it.unit_amount.value) * Number(it.quantity), 0)
        .toFixed(2);

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
              reference_id: reference.substring(0, 255),
              items: ppItems,
              amount: {
                currency_code: "USD",
                value: itemTotal,
                breakdown: { item_total: { currency_code: "USD", value: itemTotal } },
              },
            },
          ],
          application_context: {
            brand_name: tenant.brandName || tenant.name,
            return_url: `${appUrl}/paypal-success`,
            cancel_url: `${appUrl}/paypal-cancel`,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      const orderData = (await orderRes.json()) as any;
      if (!orderRes.ok) {
        logger.error({ orderData }, "[CheckoutCart] PayPal order creation failed");
        return res.status(502).json({ message: "Error creando orden de PayPal" });
      }

      return res.json({
        method: "paypal",
        checkoutUrl: orderData.links?.find((l: any) => l.rel === "approve")?.href,
        orderId: orderData.id,
        total: itemTotal,
        currency: "USD",
      });
    }

    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!mpToken) return res.status(500).json({ message: "MercadoPago no configurado" });

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: lines.map(({ product, quantity }) => ({
          id: String(product.id),
          title: product.name,
          description: (product.description || product.name).replace(/\s+/g, " ").trim().substring(0, 250),
          picture_url: toAbsoluteImageUrl(product.imageUrl),
          category_id: "learnings",
          quantity,
          currency_id: product.currency === "USD" ? "COP" : product.currency || "COP",
          unit_price: Number(product.price || 0),
        })),
        payer: {
          email: customer.email || "cliente@email.com",
          name: customer.name || "Cliente",
        },
        back_urls: {
          success: `${appUrl}/mp-success`,
          failure: `${appUrl}/mp-failure`,
          pending: `${appUrl}/mp-pending`,
        },
        ...(appUrl.startsWith("https") ? { auto_return: "approved" } : {}),
        external_reference: reference,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const mpData = (await mpRes.json()) as any;
    if (!mpRes.ok) {
      logger.error({ mpData }, "[CheckoutCart] MercadoPago preference failed");
      return res.status(502).json({ message: "Error creando preferencia de MercadoPago" });
    }

    return res.json({
      method: "mercadopago",
      checkoutUrl: mpData.init_point,
      preferenceId: mpData.id,
      total: lines.reduce((a, l) => a + Number(l.product.price || 0) * l.quantity, 0),
      currency: "COP",
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
