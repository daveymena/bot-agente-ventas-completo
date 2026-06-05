import { Router } from "express";
import { SAAS_PLANS, SaasPlan, getPlanInfo, getMonthlyPrice } from "../middleware/saasValidation";
import { logger } from "../lib/logger";
import { SubscriptionPaymentService } from "../lib/subscription-payments";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/pricing - Obtener todos los planes disponibles
router.get("/", (req, res) => {
  try {
    const plans = Object.entries(SAAS_PLANS).map(([key, plan]) => ({
      id: key,
      ...plan,
      monthlyPrice: plan.price,
      annualPrice: plan.price * 12 * 0.8, // 20% descuento anual
    }));

    res.json({
      plans,
      currency: "USD",
      billingCycles: ["monthly", "annual"],
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

// POST /api/pricing/upgrade - Cambiar de plan (SIN AUTENTICACIÓN REQUERIDA)
router.post("/upgrade", async (req, res, next) => {
  try {
    const { newPlan, billingCycle = "monthly", paymentMethod = "mercadopago", email } = req.body;
    
    logger.info({ newPlan, billingCycle, paymentMethod, email }, "[Pricing] Upgrade request received (public)");

    // Validar email
    if (!email || !email.includes('@')) {
      logger.error({ email }, "[Pricing] Invalid email");
      return res.status(400).json({ 
        error: "Invalid email", 
        message: "Por favor proporciona un email válido" 
      });
    }

    // Validar plan
    if (!SAAS_PLANS[newPlan as SaasPlan]) {
      logger.error({ newPlan }, "[Pricing] Invalid plan");
      return res.status(400).json({ 
        error: "Invalid plan", 
        message: `El plan "${newPlan}" no existe` 
      });
    }

    if (!["monthly", "annual"].includes(billingCycle)) {
      logger.error({ billingCycle }, "[Pricing] Invalid billing cycle");
      return res.status(400).json({ 
        error: "Invalid billing cycle", 
        message: "El ciclo debe ser 'monthly' o 'annual'" 
      });
    }

    if (!["mercadopago", "paypal"].includes(paymentMethod)) {
      logger.error({ paymentMethod }, "[Pricing] Invalid payment method");
      return res.status(400).json({ 
        error: "Invalid payment method", 
        message: "El método debe ser 'mercadopago' o 'paypal'" 
      });
    }

    // Si es plan free, no requiere pago
    if (newPlan === "free") {
      logger.info("[Pricing] Free plan selected");
      return res.json({
        message: "Plan gratuito seleccionado",
        newPlan: "free",
        requiresPayment: false,
      });
    }

    logger.info({ email, newPlan, billingCycle, paymentMethod }, "[Pricing] Creating payment link...");

    try {
      // Buscar o crear tenant temporal con el email
      let [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
      
      if (!tenant) {
        // Crear tenant temporal
        logger.info({ email }, "[Pricing] Creating temporary tenant");
        [tenant] = await db.insert(tenants).values({
          email,
          name: email.split('@')[0],
          slug: `temp-${Date.now()}`,
          brandName: "Nuevo Cliente",
          plan: "free",
          status: "trial",
          emailVerified: false,
        }).returning();
      }

      // Crear enlace de pago real
      const paymentLink = await SubscriptionPaymentService.createPaymentLink({
        tenantId: tenant.id,
        plan: newPlan as SaasPlan,
        billingCycle: billingCycle as "monthly" | "annual",
        paymentMethod: paymentMethod as "mercadopago" | "paypal",
        returnUrl: `${process.env.APP_URL || "https://tecnovariedades.easypanel.host"}/subscription-success?email=${encodeURIComponent(email)}`,
        cancelUrl: `${process.env.APP_URL || "https://tecnovariedades.easypanel.host"}/subscription-failure`,
      });

      logger.info({ paymentLink, email }, "[Pricing] Payment link created successfully");

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
        email,
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
    res.status(500).json({ error: "Internal server error" });
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

    res.json({
      message: "Subscription cancelled successfully",
      subscription: {
        id: activeSubscription.id,
        status: "cancelled",
        expiresAt: activeSubscription.expiresAt,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error cancelling subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
