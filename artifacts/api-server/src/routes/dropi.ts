import { Router } from "express";
import { z } from "zod";
import { db, settings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const DROPI_BASE = "https://api.dropi.co";

async function getOrCreateSettings() {
  const [row] = await db.select().from(settings).limit(1);
  if (row) return row;
  const [created] = await db.insert(settings).values({}).returning();
  return created!;
}

async function dropiRequest(
  path: string,
  method: string,
  token: string,
  body?: object
): Promise<{ ok: boolean; data?: any; error?: string; status?: number }> {
  try {
    const res = await fetch(`${DROPI_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json() as any;
    if (!res.ok || json.isSuccess === false) {
      return { ok: false, error: json.message || `HTTP ${res.status}`, status: res.status };
    }
    return { ok: true, data: json, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/** GET /api/dropi/status — connection status and store info */
router.get("/status", async (_req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    if (!s.dropiToken) {
      return res.json({ connected: false, message: "Token no configurado" });
    }
    const result = await dropiRequest("/api/shops/store", "GET", s.dropiToken);
    if (!result.ok) {
      return res.json({ connected: false, message: result.error, storeId: s.dropiStoreId });
    }
    return res.json({
      connected: true,
      store: result.data,
      storeId: s.dropiStoreId,
      tokenMasked: s.dropiToken.slice(0, 8) + "•••••••••••••••••",
    });
  } catch (e) { return next(e); }
});

/** POST /api/dropi/connect — save token and test connection */
router.post("/connect", async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    const s = await getOrCreateSettings();

    // Detect WooCommerce integration token (wrong type)
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64").toString());
      if (payload.aud === "WOOCOMMERCE" || payload.token_type === "INTEGRATIONS") {
        return res.status(400).json({
          ok: false,
          error: "WRONG_TOKEN_TYPE",
          message: "Este es un token de integración WooCommerce, no el token de acceso general de Dropi. Necesitas copiar tu token de sesión desde el navegador.",
        });
      }
    } catch {
      // Not a JWT or can't decode — proceed normally
    }

    // Test the token against Dropi
    const result = await dropiRequest("/api/shops/store", "GET", token);
    if (!result.ok) {
      const msg = result.error || "Token inválido";
      const hint = msg.includes("not issued to this api")
        ? "WRONG_TOKEN_TYPE"
        : undefined;
      return res.status(400).json({ ok: false, error: hint || msg, message: msg });
    }

    const storeId = result.data?.objects?.[0]?.id || result.data?.id || null;
    await db.update(settings).set({
      dropiToken: token,
      dropiStoreId: storeId ? String(storeId) : null,
    }).where(eq(settings.id, s.id));

    logger.info({ storeId }, "[Dropi] Token guardado y conexión verificada");
    return res.json({ ok: true, store: result.data, storeId });
  } catch (e) { return next(e); }
});

/** POST /api/dropi/disconnect — remove token */
router.post("/disconnect", async (_req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    await db.update(settings).set({ dropiToken: null, dropiStoreId: null }).where(eq(settings.id, s.id));
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

/** GET /api/dropi/products — list products from Dropi catalog */
router.get("/products", async (req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    if (!s.dropiToken) return res.status(401).json({ error: "Dropi no conectado" });

    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 20;
    const search = req.query.search as string | undefined;

    const body: Record<string, any> = { page, per_page: perPage };
    if (search) body.search = search;
    if (s.dropiStoreId) body.store_id = Number(s.dropiStoreId);

    const result = await dropiRequest("/api/products/v4/index", "POST", s.dropiToken, body);
    if (!result.ok) return res.status(400).json({ error: result.error });

    return res.json(result.data);
  } catch (e) { return next(e); }
});

/** GET /api/dropi/products/:id — get a single product */
router.get("/products/:id", async (req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    if (!s.dropiToken) return res.status(401).json({ error: "Dropi no conectado" });

    const result = await dropiRequest(
      `/api/products/${req.params.id}/resources`,
      "GET",
      s.dropiToken
    );
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json(result.data);
  } catch (e) { return next(e); }
});

/** POST /api/dropi/orders — create an order in Dropi */
router.post("/orders", async (req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    if (!s.dropiToken) return res.status(401).json({ error: "Dropi no conectado" });

    const orderSchema = z.object({
      productId: z.number(),
      quantity: z.number().min(1).default(1),
      customerName: z.string(),
      customerPhone: z.string(),
      customerAddress: z.string(),
      customerCity: z.string(),
      notes: z.string().optional(),
    });

    const order = orderSchema.parse(req.body);

    const dropiPayload = {
      product_id: order.productId,
      quantity: order.quantity,
      customer: {
        name: order.customerName,
        phone: order.customerPhone,
        address: order.customerAddress,
        city: order.customerCity,
      },
      notes: order.notes,
      store_id: s.dropiStoreId ? Number(s.dropiStoreId) : undefined,
    };

    const result = await dropiRequest("/api/casrequest/create", "POST", s.dropiToken, dropiPayload);
    if (!result.ok) return res.status(400).json({ error: result.error });

    logger.info({ productId: order.productId, customer: order.customerName }, "[Dropi] Pedido creado");
    return res.json({ ok: true, order: result.data });
  } catch (e) { return next(e); }
});

/** POST /api/dropi/import-product — import a Dropi product into the local catalog */
router.post("/import-product", async (req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    if (!s.dropiToken) return res.status(401).json({ error: "Dropi no conectado" });

    const { productId } = z.object({ productId: z.number() }).parse(req.body);

    const result = await dropiRequest(`/api/products/${productId}/resources`, "GET", s.dropiToken);
    if (!result.ok) return res.status(400).json({ error: result.error });

    const dropiProduct = result.data?.objects?.[0] || result.data;
    if (!dropiProduct) return res.status(404).json({ error: "Producto no encontrado en Dropi" });

    return res.json({
      ok: true,
      product: dropiProduct,
      message: "Producto importado. Usa esta info para crearlo en tu catálogo.",
    });
  } catch (e) { return next(e); }
});

export default router;
