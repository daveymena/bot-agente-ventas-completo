import { Router } from "express";
import { getAppUrl } from "../lib/app-url";
import { SAAS_PLANS, SaasPlan, getPlanInfo, getMonthlyPrice } from "../middleware/saasValidation";
import { logger } from "../lib/logger";
import { SubscriptionPaymentService } from "../lib/subscription-payments";
import { paymentRateLimit } from "../middleware/rateLimiting";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// CSRF validation middleware for payment routes
function validateCsrfToken(req: any, res: any, next: any) {
  const token = req.headers['x-csrf-token'] || req.body?.csrfToken;
  const sessionToken = req.session?.csrfToken;

  if (!token || token !== sessionToken) {
    logger.warn({ userId: req.user?.id }, "[CSRF] Invalid or missing CSRF token");
    return res.status(403).json({ error: "CSRF validation failed", message: "Token inválido o expirado" });
  }
  next();
}

// GET /api/pricing - Obtener los planes que se ofrecen públicamente
// (visible !== false) -- los planes legado (free/enterprise) siguen
// existiendo para cuentas que ya los tengan asignados, pero no se listan acá.
router.get("/", (req, res) => {
  try {
    const plans = Object.entries(SAAS_PLANS)
      .filter(([, plan]) => plan.visible !== false)
      .map(([key, plan]) => ({
        id: key,
        ...plan,
        monthlyPrice: plan.price,
        quarterlyPrice: plan.price * 3 * 0.9, // 10% descuento trimestral
        annualPrice: plan.price * 12 * 0.8, // 20% descuento anual
      }));

    res.json({
      plans,
      currency: "USD",
      billingCycles: ["monthly", "quarterly", "annual"],
    });
  } catch (error) {
    logger.error({ error }, "Error fetching pricing");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/pricing/:plan - Obtener detalles de un plan específico
router.get("/:plan", (req, res) => {
  try {
    const plan = req.params.plan as SaasPlan;
    const planDetails = getPlanInfo(plan);

    if (!planDetails) {
      return res.status(404).json({ error: "Plan not found" });
    }

    res.json({
      id: plan,
      ...planDetails,
      monthlyPrice: getMonthlyPrice(plan),
      annualPrice: getMonthlyPrice(plan) * 12 * 0.8,
    });
  } catch (error) {
    logger.error({ error }, "Error fetching plan details");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/pricing/upgrade - Cambiar de plan del tenant YA LOGUEADO.
//
// Antes ignoraba por completo la sesión: pedía un email en un diálogo y
// buscaba/CREABA un tenant nuevo con ese email, sin relación con la cuenta
// realmente logueada. Como esta ruta ya exige sesión real (no está en
// publicRoutes -- ver isPublicRoute() en app.ts, que excluye explícitamente
// cualquier path con "/upgrade"), terminaba siendo un flujo roto: el admin
// logueado hacía clic en "Actualizar" y o bien creaba una cuenta fantasma
// nueva, o subía el plan de OTRO tenant si el email tecleado coincidía con
// el de otra cuenta. Ahora usa directamente req.tenant.
router.post("/upgrade", paymentRateLimit, validateCsrfToken, async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "Unauthorized", message: "Iniciá sesión para cambiar de plan" });
    }

    const { newPlan, billingCycle = "monthly", paymentMethod = "mercadopago" } = req.body;

    logger.info({ tenantId: tenant.id, newPlan, billingCycle, paymentMethod }, "[Pricing] Upgrade request received");

    // Validar plan
    if (!SAAS_PLANS[newPlan as SaasPlan] || SAAS_PLANS[newPlan as SaasPlan].visible === false) {
      logger.error({ newPlan }, "[Pricing] Invalid plan");
      return res.status(400).json({
        error: "Invalid plan",
        message: `El plan "${newPlan}" no existe`
      });
    }

    if (!["monthly", "quarterly", "annual"].includes(billingCycle)) {
      logger.error({ billingCycle }, "[Pricing] Invalid billing cycle");
      return res.status(400).json({
        error: "Invalid billing cycle",
        message: "El ciclo debe ser 'monthly', 'quarterly' o 'annual'"
      });
    }

    if (!["mercadopago", "paypal"].includes(paymentMethod)) {
      logger.error({ paymentMethod }, "[Pricing] Invalid payment method");
      return res.status(400).json({
        error: "Invalid payment method",
        message: "El método debe ser 'mercadopago' o 'paypal'"
      });
    }

    // Si es plan gratuito, se aplica directo sin pago. status: "trial" (no
    // "active") -- es una prueba de 7 días, no un tier gratuito permanente;
    // con "active" nunca se aplicaría la validación de vencimiento.
    if (SAAS_PLANS[newPlan as SaasPlan].price === 0) {
      await db.update(tenants).set({ plan: newPlan, status: "trial" }).where(eq(tenants.id, tenant.id));
      logger.info({ tenantId: tenant.id, newPlan }, "[Pricing] Free plan applied directly");
      return res.json({
        message: "Plan gratuito activado",
        newPlan,
        requiresPayment: false,
      });
    }

    logger.info({ tenantId: tenant.id, newPlan, billingCycle, paymentMethod }, "[Pricing] Creating payment link...");

    try {
      const paymentLink = await SubscriptionPaymentService.createPaymentLink({
        tenantId: tenant.id,
        plan: newPlan as SaasPlan,
        billingCycle: billingCycle as "monthly" | "quarterly" | "annual",
        paymentMethod: paymentMethod as "mercadopago" | "paypal",
        returnUrl: `${getAppUrl()}/subscription-success?email=${encodeURIComponent(tenant.email)}`,
        cancelUrl: `${getAppUrl()}/subscription-failure`,
      });

      logger.info({ paymentLink, tenantId: tenant.id }, "[Pricing] Payment link created successfully");

      res.json({
        message: "Plan upgrade initiated",
        newPlan,
        billingCycle,
        paymentMethod,
        action: "redirect_to_payment",
        paymentUrl: paymentLink.paymentUrl,
        paymentId: paymentLink.paymentId,
        subscriptionId: paymentLink.subscriptionId,
        amount: paymentLink.amount,
        currency: paymentLink.currency,
      });
    } catch (paymentError: any) {
      logger.error({ error: paymentError.message, stack: paymentError.stack }, "[Pricing] Error creating payment link");

      return res.status(500).json({
        error: "Payment service error",
        message: paymentError.message || "No se pudo crear el enlace de pago. Por favor intenta nuevamente."
      });
    }
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "[Pricing] Unexpected error in upgrade endpoint");
    res.status(500).json({
      error: "Internal server error",
      message: "Error inesperado. Por favor contacta al soporte."
    });
  }
});

// GET /api/pricing/current - Obtener plan actual del tenant (requiere autenticación)
router.get("/current/info", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const plan = tenant.plan as SaasPlan;
    const planDetails = getPlanInfo(plan);

    // Calcular días restantes si es trial
    let trialDaysRemaining = null;
    if (tenant.status === "trial") {
      const trialDays = planDetails.trialDays;
      const createdAt = new Date(tenant.createdAt);
      const trialExpiry = new Date(
        createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000
      );
      const now = new Date();
      trialDaysRemaining = Math.max(
        0,
        Math.ceil((trialExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );
    }

    // Obtener suscripción activa
    const activeSubscription = await SubscriptionPaymentService.getActiveSubscription(tenant.id);

    res.json({
      currentPlan: plan,
      planDetails,
      status: tenant.status,
      trialDaysRemaining,
      monthlyPrice: getMonthlyPrice(plan),
      nextBillingDate: tenant.nextBillingDate || activeSubscription?.nextBillingDate || null,
      subscriptionEndsAt: tenant.subscriptionEndsAt || activeSubscription?.expiresAt || null,
      subscription: activeSubscription ? {
        id: activeSubscription.id,
        status: activeSubscription.status,
        billingCycle: activeSubscription.billingCycle,
        amount: activeSubscription.amount,
        currency: activeSubscription.currency,
        autoRenew: activeSubscription.autoRenew,
        startedAt: activeSubscription.startedAt,
        expiresAt: activeSubscription.expiresAt,
      } : null,
      usage: {
        conversations: tenant.usage?.conversations || 0,
        messages: tenant.usage?.messages || 0,
        products: tenant.usage?.products || 0,
        agents: tenant.usage?.agents || 0,
      },
      limits: planDetails,
    });
  } catch (error) {
    logger.error({ error }, "Error fetching current plan");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/pricing/subscription/history - Obtener historial de pagos
router.get("/subscription/history", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const history = await SubscriptionPaymentService.getPaymentHistory(tenant.id);

    res.json({
      transactions: history.map(tx => ({
        id: tx.id,
        paymentMethod: tx.paymentMethod,
        paymentId: tx.paymentId,
        status: tx.paymentStatus,
        amount: tx.amount,
        currency: tx.currency,
        plan: tx.plan,
        billingCycle: tx.billingCycle,
        paidAt: tx.paidAt,
        createdAt: tx.createdAt,
      })),
    });
  } catch (error) {
    logger.error({ error }, "Error fetching payment history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/pricing/subscription/cancel - Cancelar suscripción
router.post("/subscription/cancel", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const activeSubscription = await SubscriptionPaymentService.getActiveSubscription(tenant.id);
    if (!activeSubscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    await SubscriptionPaymentService.cancelSubscription(activeSubscription.id);

    logger.info({ tenantId: tenant.id, subscriptionId: activeSubscription.id }, "Subscription cancelled");

    return res.json({
      message: "Subscription cancelled successfully",
      subscription: {
        id: activeSubscription.id,
        status: "cancelled",
        expiresAt: activeSubscription.expiresAt,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error cancelling subscription");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
