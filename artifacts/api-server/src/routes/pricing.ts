import { Router } from "express";
import { SAAS_PLANS, SaasPlan, getPlanInfo, getMonthlyPrice } from "../middleware/saasValidation";
import { logger } from "../lib/logger";

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

// POST /api/pricing/upgrade - Cambiar de plan (requiere autenticación)
router.post("/upgrade", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { newPlan } = req.body;

    if (!SAAS_PLANS[newPlan as SaasPlan]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    // Aquí se integraría con Stripe o el procesador de pagos
    logger.info(
      { tenantId: tenant.id, currentPlan: tenant.plan, newPlan },
      "Plan upgrade requested"
    );

    res.json({
      message: "Plan upgrade initiated",
      currentPlan: tenant.plan,
      newPlan,
      action: "redirect_to_payment",
      paymentUrl: `https://checkout.stripe.com/pay/cs_test_${newPlan}`,
    });
  } catch (error) {
    logger.error({ error }, "Error upgrading plan");
    res.status(500).json({ error: "Internal server error" });
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

    res.json({
      currentPlan: plan,
      planDetails,
      status: tenant.status,
      trialDaysRemaining,
      monthlyPrice: getMonthlyPrice(plan),
      nextBillingDate: tenant.nextBillingDate || null,
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

export default router;
