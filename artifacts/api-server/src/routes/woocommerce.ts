import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, products, woocommerceStores, wooOrders } from "@workspace/db";
import type { TenantRequest } from "../lib/tenantManager";
import { pushOrderToWooCommerce } from "../lib/orderManager";

const router = Router();

async function callWooAPI(storeUrl: string, consumerKey: string, consumerSecret: string, method: string, endpoint: string, body?: object) {
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const url = `${storeUrl.replace(/\/$/, "")}/wp-json/wc/v3${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(`WooCommerce ${response.status}: ${errText.slice(0, 300)}`);
  }
  return response.json();
}

function maskStore(s: typeof woocommerceStores.$inferSelect) {
  return { ...s, consumerKey: s.consumerKey.slice(0, 8) + "***", consumerSecret: "***" };
}

router.get("/stores", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const stores = await db.select().from(woocommerceStores).where(eq(woocommerceStores.tenantId, tenantId)).orderBy(desc(woocommerceStores.createdAt));
    return res.json(stores.map(maskStore));
  } catch (e) { return next(e); }
});

const addStoreSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  consumerKey: z.string().min(10),
  consumerSecret: z.string().min(10),
  isCentral: z.boolean().optional().default(false),
});

router.post("/stores", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const data = addStoreSchema.parse(req.body);

    try {
      await callWooAPI(data.url, data.consumerKey, data.consumerSecret, "GET", "");
    } catch (err) {
      return res.status(400).json({ message: `No se pudo conectar con la tienda: ${err instanceof Error ? err.message : "Error desconocido"}` });
    }

    const [store] = await db.insert(woocommerceStores).values({ tenantId, ...data }).returning();
    return res.json(maskStore(store));
  } catch (e) { return next(e); }
});

router.put("/stores/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const storeId = parseInt(req.params.id);
    const { name, isActive, isCentral } = req.body;
    const [updated] = await db.update(woocommerceStores)
      .set({ ...(name ? { name } : {}), ...(isActive !== undefined ? { isActive } : {}), ...(isCentral !== undefined ? { isCentral } : {}) })
      .where(and(eq(woocommerceStores.id, storeId), eq(woocommerceStores.tenantId, tenantId)))
      .returning();
    return res.json(maskStore(updated));
  } catch (e) { return next(e); }
});

router.delete("/stores/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const storeId = parseInt(req.params.id);
    await db.delete(woocommerceStores).where(and(eq(woocommerceStores.id, storeId), eq(woocommerceStores.tenantId, tenantId)));
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

router.post("/stores/:id/sync", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const storeId = parseInt(req.params.id);
    const [store] = await db.select().from(woocommerceStores).where(and(eq(woocommerceStores.id, storeId), eq(woocommerceStores.tenantId, tenantId)));
    if (!store) return res.status(404).json({ message: "Tienda no encontrada" });

    let page = 1;
    let totalNew = 0;
    let totalUpdated = 0;
    const perPage = 100;

    while (page <= 5) {
      const wcProducts: any[] = await callWooAPI(store.url, store.consumerKey, store.consumerSecret, "GET", `/products?per_page=${perPage}&page=${page}&status=publish`);
      if (!wcProducts || wcProducts.length === 0) break;

      for (const wcp of wcProducts) {
        const price = parseFloat(wcp.price || wcp.regular_price || "0");
        const imageUrl = wcp.images?.[0]?.src ?? null;
        const sku = wcp.sku || `wc_${wcp.id}`;
        const description = (wcp.short_description || wcp.description || wcp.name).replace(/<[^>]*>/g, "").slice(0, 500);
        const metadata = JSON.stringify({ wc_product_id: wcp.id, wc_store_id: storeId, wc_store_url: store.url });

        const existing = await db.select({ id: products.id }).from(products)
          .where(and(eq(products.tenantId, tenantId), eq(products.sku, sku))).limit(1);

        if (existing.length > 0) {
          await db.update(products).set({ name: wcp.name, description, price: price.toString(), imageUrl, metadata, isActive: wcp.status === "publish" }).where(eq(products.id, existing[0].id));
          totalUpdated++;
        } else {
          await db.insert(products).values({ tenantId, name: wcp.name, description, price: price.toString(), currency: "COP", sku, imageUrl, kind: "physical", isActive: wcp.status === "publish", metadata });
          totalNew++;
        }
      }
      if (wcProducts.length < perPage) break;
      page++;
    }

    await db.update(woocommerceStores).set({ lastSyncAt: new Date(), syncedProductCount: totalNew + totalUpdated }).where(eq(woocommerceStores.id, storeId));
    return res.json({ ok: true, new: totalNew, updated: totalUpdated, total: totalNew + totalUpdated });
  } catch (e) { return next(e); }
});

router.get("/stores/:id/products", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const storeId = parseInt(req.params.id);
    const page = parseInt(req.query.page as string) || 1;
    const search = (req.query.search as string) || "";
    const [store] = await db.select().from(woocommerceStores).where(and(eq(woocommerceStores.id, storeId), eq(woocommerceStores.tenantId, tenantId)));
    if (!store) return res.status(404).json({ message: "Tienda no encontrada" });
    const endpoint = `/products?per_page=20&page=${page}&status=publish${search ? `&search=${encodeURIComponent(search)}` : ""}`;
    const wcProducts = await callWooAPI(store.url, store.consumerKey, store.consumerSecret, "GET", endpoint);
    return res.json(wcProducts);
  } catch (e) { return next(e); }
});

router.get("/orders", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const status = req.query.status as string | undefined;
    const where = status
      ? and(eq(wooOrders.tenantId, tenantId), eq(wooOrders.status, status))
      : eq(wooOrders.tenantId, tenantId);
    const orders = await db.select().from(wooOrders).where(where).orderBy(desc(wooOrders.createdAt)).limit(100);
    return res.json(orders.map((o) => ({ ...o, items: JSON.parse(o.items) })));
  } catch (e) { return next(e); }
});

router.put("/orders/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const orderId = parseInt(req.params.id);
    const { status, notes, deliveryAddress } = req.body;
    const [updated] = await db.update(wooOrders)
      .set({ ...(status ? { status } : {}), ...(notes !== undefined ? { notes } : {}), ...(deliveryAddress ? { deliveryAddress } : {}), updatedAt: new Date() })
      .where(and(eq(wooOrders.id, orderId), eq(wooOrders.tenantId, tenantId)))
      .returning();
    return res.json({ ...updated, items: JSON.parse(updated.items) });
  } catch (e) { return next(e); }
});

router.post("/orders/:id/push-to-woo", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const orderId = parseInt(req.params.id);
    const result = await pushOrderToWooCommerce(orderId, tenantId);
    if (result.error) return res.status(400).json({ message: result.error });
    return res.json({ ok: true, wooOrderId: result.wooOrderId });
  } catch (e) { return next(e); }
});

export default router;
