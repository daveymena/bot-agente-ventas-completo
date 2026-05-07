import { eq, and, desc } from "drizzle-orm";
import { db, woocommerceStores, wooOrders, notifications, tenants } from "@workspace/db";
import { logger } from "./logger";
import {
  sendEscalationAlert,
  sendNewOrderNotification,
} from "./emailService";

export interface OrderItem {
  productId: number;
  name: string;
  qty: number;
  price: number;
  wc_product_id?: number;
}

export interface CreateOrderParams {
  tenantId: number;
  conversationId?: number;
  contactName?: string;
  contactPhone?: string;
  items: OrderItem[];
  total: number;
  currency?: string;
  paymentMethod?: string;
  paymentId?: string;
  deliveryAddress?: string;
  notes?: string;
}

async function getTenantEmail(tenantId: number): Promise<string | null> {
  const [tenant] = await db.select({ email: tenants.email }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return tenant?.email ?? null;
}

async function createNotification(tenantId: number, type: string, title: string, message: string, metadata: Record<string, unknown> = {}) {
  try {
    await db.insert(notifications).values({
      tenantId,
      type,
      title,
      message,
      metadata: JSON.stringify(metadata),
    });
  } catch (err) {
    logger.warn({ err, tenantId, type }, "[Notification] Failed to create notification");
  }
}

export async function createLocalOrder(params: CreateOrderParams) {
  const [store] = await db
    .select()
    .from(woocommerceStores)
    .where(and(eq(woocommerceStores.tenantId, params.tenantId), eq(woocommerceStores.isActive, true)))
    .orderBy(desc(woocommerceStores.isCentral), desc(woocommerceStores.id))
    .limit(1);

  const [order] = await db
    .insert(wooOrders)
    .values({
      tenantId: params.tenantId,
      storeId: store?.id ?? null,
      conversationId: params.conversationId ?? null,
      contactName: params.contactName ?? null,
      contactPhone: params.contactPhone ?? null,
      items: JSON.stringify(params.items),
      total: params.total.toString(),
      currency: params.currency ?? "COP",
      status: "pending",
      paymentMethod: params.paymentMethod ?? null,
      paymentId: params.paymentId ?? null,
      deliveryAddress: params.deliveryAddress ?? null,
      notes: params.notes ?? null,
    })
    .returning();

  logger.info({ orderId: order.id, tenantId: params.tenantId, storeId: store?.id }, "[OrderManager] Local order created");

  // Notifications and email (non-blocking)
  Promise.allSettled([
    createNotification(params.tenantId, "order", `Nuevo pedido #${order.id}`,
      `${params.contactName || "Cliente"} realizó un pedido por ${params.currency ?? "COP"} ${Number(params.total).toLocaleString("es-CO")}`,
      { orderId: order.id, contactPhone: params.contactPhone }),
    getTenantEmail(params.tenantId).then(adminEmail => {
      if (!adminEmail) return;
      return sendNewOrderNotification({
        adminEmail,
        tenantName: `Tenant #${params.tenantId}`,
        contactName: params.contactName,
        contactPhone: params.contactPhone,
        items: params.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
        total: params.total.toString(),
        currency: params.currency ?? "COP",
        paymentMethod: params.paymentMethod,
        orderId: order.id,
      });
    }),
  ]).catch(() => {});

  return { order, store: store ?? null };
}

export async function escalateToAdmin(conversationId: number, tenantId: number, reason: string, contactName?: string, contactPhone?: string) {
  await db.insert(wooOrders).values({
    tenantId,
    conversationId,
    items: "[]",
    total: "0",
    status: "escalated",
    adminEscalated: true,
    escalationReason: reason,
  });
  logger.info({ conversationId, tenantId, reason }, "[OrderManager] Conversation escalated to admin");

  // Notifications and email (non-blocking)
  Promise.allSettled([
    createNotification(tenantId, "escalation", `Escalación urgente — ${contactName || "Cliente"}`,
      `Motivo: ${reason}. El cliente ${contactName || "desconocido"} requiere atención humana.`,
      { conversationId, contactPhone, reason }),
    getTenantEmail(tenantId).then(adminEmail => {
      if (!adminEmail) return;
      return sendEscalationAlert({
        adminEmail,
        tenantName: `Tenant #${tenantId}`,
        contactName,
        contactPhone,
        reason,
        conversationId,
      });
    }),
  ]).catch(() => {});
}

export async function pushOrderToWooCommerce(orderId: number, tenantId: number): Promise<{ wooOrderId?: number; error?: string }> {
  const [order] = await db
    .select()
    .from(wooOrders)
    .where(and(eq(wooOrders.id, orderId), eq(wooOrders.tenantId, tenantId)));

  if (!order || !order.storeId) return { error: "Pedido sin tienda WooCommerce asignada" };

  const [store] = await db.select().from(woocommerceStores).where(eq(woocommerceStores.id, order.storeId));
  if (!store) return { error: "Tienda no encontrada" };

  const items = JSON.parse(order.items) as OrderItem[];
  const [firstName, ...lastParts] = (order.contactName ?? "").split(" ");
  const credentials = Buffer.from(`${store.consumerKey}:${store.consumerSecret}`).toString("base64");

  try {
    const response = await fetch(`${store.url.replace(/\/$/, "")}/wp-json/wc/v3/orders`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_method: order.paymentMethod ?? "bacs",
        payment_method_title:
          order.paymentMethod === "mercadopago" ? "MercadoPago" : order.paymentMethod === "paypal" ? "PayPal" : "Transferencia",
        set_paid: order.status === "paid",
        billing: {
          first_name: firstName || "Cliente",
          last_name: lastParts.join(" ") || "WhatsApp",
          phone: order.contactPhone ?? "",
          address_1: order.deliveryAddress ?? "",
        },
        shipping: { address_1: order.deliveryAddress ?? "" },
        line_items: items.map((item) => ({
          ...(item.wc_product_id ? { product_id: item.wc_product_id } : {}),
          quantity: item.qty,
          name: item.name,
        })),
        customer_note: `Pedido WhatsApp - ${order.contactPhone}`,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return { error: `WooCommerce API error ${response.status}: ${errText.slice(0, 200)}` };
    }

    const wcOrder = (await response.json()) as { id: number };
    await db.update(wooOrders).set({ wooOrderId: wcOrder.id, status: "processing", updatedAt: new Date() }).where(eq(wooOrders.id, orderId));
    logger.info({ orderId, wooOrderId: wcOrder.id }, "[OrderManager] Order pushed to WooCommerce");
    return { wooOrderId: wcOrder.id };
  } catch (err) {
    logger.error({ err, orderId }, "[OrderManager] Failed to push order to WooCommerce");
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
