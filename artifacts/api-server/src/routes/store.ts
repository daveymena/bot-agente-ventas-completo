import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, products, productCategories, tenants } from "@workspace/db";
import type { TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";

const router = Router();

router.get("/catalog", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;

    let rows = await db.select().from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))
      .orderBy(desc(products.createdAt));

    if (category) rows = rows.filter(p => p.category === category);
    if (search) rows = rows.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || "").toLowerCase().includes(search.toLowerCase()));

    const categories = [...new Set(rows.map(p => p.category).filter(Boolean))];
    return res.json({ products: rows, categories });
  } catch (e) { return next(e); }
});

const generateLinkSchema = z.object({
  productId: z.number(),
  method: z.enum(["mercadopago", "paypal", "transfer"]),
  quantity: z.number().min(1).default(1),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
});

router.post("/generate-link", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const { productId, method, quantity, customerName, customerPhone } = generateLinkSchema.parse(req.body);

    const [product] = await db.select().from(products)
      .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));
    if (!product) return res.status(404).json({ message: "Producto no encontrado" });

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    const paymentMethods = tenant?.paymentMethods as any;

    const total = parseFloat(product.price) * quantity;
    const productTitle = `${product.name}${quantity > 1 ? ` x${quantity}` : ""}`;

    if (method === "mercadopago") {
      const accessToken = paymentMethods?.mercadopago?.accessToken || process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!accessToken) return res.status(400).json({ message: "MercadoPago no configurado para este tenant" });

      const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ title: productTitle, quantity, unit_price: parseFloat(product.price), currency_id: product.currency || "COP" }],
          payer: customerName ? { name: customerName, phone: customerPhone ? { number: customerPhone } : undefined } : undefined,
          external_reference: `store_${tenantId}_product_${productId}`,
          statement_descriptor: tenant?.brandName || "VentasPro",
          back_urls: { success: `${process.env.APP_URL || ""}/api/p/success`, failure: `${process.env.APP_URL || ""}/api/p/failure` },
          auto_return: "approved",
        }),
      });
      if (!mpRes.ok) {
        const err = await mpRes.text();
        logger.error({ err, productId }, "[Store] MercadoPago link generation failed");
        return res.status(400).json({ message: "Error al generar link de MercadoPago", detail: err });
      }
      const mpData = await mpRes.json() as { init_point: string; id: string };
      return res.json({ url: mpData.init_point, preferenceId: mpData.id, method: "mercadopago", product: productTitle, total });
    }

    if (method === "paypal") {
      const clientId = paymentMethods?.paypal?.clientId || process.env.PAYPAL_CLIENT_ID;
      const clientSecret = paymentMethods?.paypal?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
      const mode = paymentMethods?.paypal?.mode || "live";
      if (!clientId || !clientSecret) return res.status(400).json({ message: "PayPal no configurado" });

      const base = mode === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
      const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const { access_token } = await tokenRes.json() as { access_token: string };

      const orderRes = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ description: productTitle, amount: { currency_code: "USD", value: (total / 4000).toFixed(2) } }],
          application_context: { return_url: `${process.env.APP_URL || ""}/api/p/success`, cancel_url: `${process.env.APP_URL || ""}/api/p/cancel` },
        }),
      });
      const ppOrder = await orderRes.json() as { links?: Array<{ rel: string; href: string }> };
      const approvalLink = ppOrder.links?.find(l => l.rel === "approve")?.href;
      if (!approvalLink) return res.status(400).json({ message: "Error al crear orden PayPal" });
      return res.json({ url: approvalLink, method: "paypal", product: productTitle, total });
    }

    if (method === "transfer") {
      const transferAccounts = paymentMethods?.transfer?.accounts || [{ type: "Nequi", number: process.env.TRANSFER_NUMBER || "", name: process.env.TRANSFER_NAME || "" }];
      const accountInfo = transferAccounts[0];
      const msg = `Hola 👋 Para completar tu pedido de *${productTitle}* por *${(product.currency || "COP")} ${total.toLocaleString("es-CO")}*, realiza la transferencia a:\n\n📱 *${accountInfo.type}:* ${accountInfo.number}\n👤 *A nombre de:* ${accountInfo.name}\n\nEnvía el comprobante a este mismo número y tu pedido será procesado.`;
      const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
      return res.json({ url: waUrl, message: msg, method: "transfer", product: productTitle, total });
    }

    return res.status(400).json({ message: "Método de pago no válido" });
  } catch (e) { return next(e); }
});

export default router;
