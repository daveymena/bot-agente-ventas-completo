import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, subscriptions, tenants } from "@workspace/db";
import type { TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";
import { PaymentGateway } from "../lib/payments";
import crypto from "crypto";

const router = Router();

const PLANS: Record<string, { name: string; price: number; currency: string; features: string[]; maxAgents: number; maxProducts: number; monthlyMessages: number; maxConversations: number; trialDays: number }> = {
  starter: {
    name: "Starter",
    price: 29,
    currency: "USD",
    features: ["1 Agente IA", "50 productos", "1.000 mensajes/mes", "100 conversaciones", "Soporte email", "WhatsApp integrado"],
    maxAgents: 1,
    maxProducts: 50,
    monthlyMessages: 1000,
    maxConversations: 100,
    trialDays: 7,
  },
  pro: {
    name: "Pro",
    price: 59,
    currency: "USD",
    features: ["5 Agentes IA", "500 productos", "10.000 mensajes/mes", "1.000 conversaciones", "Soporte prioritario", "Analytics avanzado", "Agentes universales"],
    maxAgents: 5,
    maxProducts: 500,
    monthlyMessages: 10000,
    maxConversations: 1000,
    trialDays: 14,
  },
  enterprise: {
    name: "Enterprise",
    price: 99,
    currency: "USD",
    features: ["Agentes ilimitados", "Productos ilimitados", "Mensajes ilimitados", "Conversaciones ilimitadas", "Soporte 24/7", "API personalizada", "White-label"],
    maxAgents: 999,
    maxProducts: 99999,
    monthlyMessages: 999999,
    maxConversations: 99999,
    trialDays: 30,
  },
};

router.get("/plans", (_req, res) => {
  return res.json(Object.entries(PLANS).map(([key, plan]) => ({ id: key, ...plan })));
});

router.get("/", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) return res.status(401).json({ error: "No autorizado" });
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, req.tenant.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(5);
    const active = rows.find(r => r.status === "active") || rows[0] || null;
    const planDetails = active ? PLANS[active.plan] || null : null;
    return res.json({ current: active, planDetails, history: rows });
  } catch (e) {
    logger.error({ e }, "[Subscriptions] GET error");
    return res.status(500).json({ error: "Error al cargar suscripción" });
  }
});

const createSchema = z.object({
  plan: z.enum(["starter", "pro", "enterprise"]),
  paymentMethod: z.enum(["mercadopago", "paypal", "transfer"]),
  billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
});

router.post("/create", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) return res.status(401).json({ error: "No autorizado" });
    const { plan, paymentMethod, billingCycle } = createSchema.parse(req.body);
    const planInfo = PLANS[plan];
    let amount = planInfo.price;
    if (billingCycle === "annual") amount = Math.round(amount * 12 * 0.8 * 100) / 100;

    const pg = new PaymentGateway();
    let paymentUrl: string | null = null;
    let paymentId: string | null = null;

    const activationToken = crypto.randomBytes(16).toString("hex").toUpperCase();

    if (paymentMethod === "mercadopago") {
      try {
        const pref = await (pg as any).createMercadoPagoPreference({
          title: `VentasPro ${planInfo.name} — ${billingCycle === "annual" ? "Anual" : "Mensual"}`,
          price: amount,
          currency: "COP",
          quantity: 1,
          externalRef: `sub_${req.tenant.id}_${plan}_${activationToken}`,
        });
        paymentUrl = pref?.init_point || null;
        paymentId = pref?.id || null;
      } catch (err) {
        logger.warn({ err }, "[Subscriptions] MP preference failed, using fallback");
        paymentUrl = `https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=fallback`;
      }
    } else if (paymentMethod === "paypal") {
      try {
        const order = await (pg as any).createPayPalOrder({
          amount,
          currency: "USD",
          description: `VentasPro ${planInfo.name}`,
          returnUrl: `${process.env.APP_URL || "https://ventaspro.app"}/billing?status=success&token=${activationToken}`,
          cancelUrl: `${process.env.APP_URL || "https://ventaspro.app"}/billing?status=cancel`,
        });
        paymentUrl = order?.links?.find((l: any) => l.rel === "approve")?.href || null;
        paymentId = order?.id || null;
      } catch (err) {
        logger.warn({ err }, "[Subscriptions] PayPal order failed");
        paymentUrl = `https://www.paypal.com/checkoutnow?token=fallback`;
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (billingCycle === "annual" ? 365 : 30));

    const [sub] = await db.insert(subscriptions).values({
      tenantId: req.tenant.id,
      plan,
      status: "pending",
      billingCycle,
      paymentMethod,
      paymentId,
      amount: String(amount),
      currency: planInfo.currency,
      expiresAt,
      autoRenew: true,
      activationToken,
      metadata: { planDetails: planInfo, createdBy: "subscription-payment-service" },
    }).returning();

    return res.json({
      subscription: sub,
      paymentUrl,
      activationToken,
      message: paymentMethod === "transfer"
        ? `Realiza la transferencia por $${amount} USD a Nequi ${process.env.TRANSFER_NUMBER || "3136174267"} (${process.env.TRANSFER_NAME || "Deiner Mena"}) y envía el comprobante.`
        : `Serás redirigido al pago. Una vez completado, tu plan se activa automáticamente.`,
    });
  } catch (e) {
    logger.error({ e }, "[Subscriptions] CREATE error");
    if (e instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", issues: e.issues });
    return res.status(500).json({ error: "Error al crear suscripción" });
  }
});

router.post("/activate/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.activationToken, token)).limit(1);
    if (!sub) return res.status(404).json({ error: "Token inválido o expirado" });
    if (sub.status === "active") return res.json({ message: "Suscripción ya activa", subscription: sub });

    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (sub.billingCycle === "annual" ? 365 : 30));

    const [updated] = await db.update(subscriptions).set({
      status: "active",
      startedAt: now,
      expiresAt,
      activatedAt: now,
      paymentStatus: "completed",
      updatedAt: now,
    }).where(eq(subscriptions.id, sub.id)).returning();

    await db.update(tenants).set({
      plan: sub.plan,
      subscriptionStatus: "active",
      subscriptionEndsAt: expiresAt,
    } as any).where(eq(tenants.id, sub.tenantId));

    return res.json({ message: "¡Suscripción activada exitosamente!", subscription: updated });
  } catch (e) {
    logger.error({ e }, "[Subscriptions] ACTIVATE error");
    return res.status(500).json({ error: "Error al activar suscripción" });
  }
});

router.post("/cancel", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) return res.status(401).json({ error: "No autorizado" });
    const [active] = await db.select().from(subscriptions)
      .where(eq(subscriptions.tenantId, req.tenant.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!active) return res.status(404).json({ error: "No hay suscripción activa" });
    const [cancelled] = await db.update(subscriptions).set({
      status: "cancelled",
      cancelledAt: new Date(),
      autoRenew: false,
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, active.id)).returning();
    return res.json({ message: "Suscripción cancelada", subscription: cancelled });
  } catch (e) {
    logger.error({ e }, "[Subscriptions] CANCEL error");
    return res.status(500).json({ error: "Error al cancelar suscripción" });
  }
});

router.post("/webhook/mercadopago", async (req, res) => {
  try {
    const { data, type } = req.body;
    if (type === "payment" && data?.id) {
      const externalRef = data.external_reference as string;
      if (externalRef?.startsWith("sub_")) {
        const parts = externalRef.split("_");
        const token = parts[parts.length - 1];
        const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.activationToken, token)).limit(1);
        if (sub && sub.status === "pending") {
          const now = new Date();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + (sub.billingCycle === "annual" ? 365 : 30));
          await db.update(subscriptions).set({ status: "active", startedAt: now, expiresAt, activatedAt: now, paymentStatus: "completed", updatedAt: now }).where(eq(subscriptions.id, sub.id));
          await db.update(tenants).set({ plan: sub.plan, subscriptionStatus: "active", subscriptionEndsAt: expiresAt } as any).where(eq(tenants.id, sub.tenantId));
        }
      }
    }
    return res.sendStatus(200);
  } catch (e) {
    logger.error({ e }, "[Subscriptions] Webhook MP error");
    return res.sendStatus(500);
  }
});

export default router;
