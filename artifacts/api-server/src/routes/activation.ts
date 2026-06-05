import { Router } from "express";
import { logger } from "../lib/logger";
import { db, subscriptions, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SAAS_PLANS, SaasPlan } from "../middleware/saasValidation";

const router = Router();

/**
 * POST /api/activation/activate
 * Activa una cuenta usando el token de activación
 */
router.post("/activate", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: "Token requerido",
        message: "Por favor proporciona el token de activación",
      });
    }

    logger.info({ token }, "[Activation] Intentando activar cuenta con token");

    // Buscar suscripción por token
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.activationToken, token))
      .limit(1);

    if (!subscription) {
      logger.warn({ token }, "[Activation] Token inválido o no encontrado");
      return res.status(404).json({
        error: "Token inválido",
        message: "El token de activación no es válido o ya fue utilizado",
      });
    }

    // Verificar si ya fue activado
    if (subscription.activatedAt) {
      logger.warn({ token, subscriptionId: subscription.id }, "[Activation] Token ya fue utilizado");
      return res.status(400).json({
        error: "Token ya utilizado",
        message: "Este token ya fue utilizado para activar una cuenta",
      });
    }

    // Verificar que el pago esté aprobado
    if (subscription.status !== "active" || subscription.paymentStatus !== "approved") {
      logger.warn(
        { token, subscriptionId: subscription.id, status: subscription.status },
        "[Activation] Suscripción no está activa"
      );
      return res.status(400).json({
        error: "Pago pendiente",
        message: "El pago aún no ha sido confirmado. Por favor espera unos minutos e intenta nuevamente.",
      });
    }

    // Obtener tenant
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, subscription.tenantId))
      .limit(1);

    if (!tenant) {
      logger.error({ subscriptionId: subscription.id, tenantId: subscription.tenantId }, "[Activation] Tenant no encontrado");
      return res.status(500).json({
        error: "Error interno",
        message: "No se pudo encontrar la cuenta asociada",
      });
    }

    // Activar la cuenta
    const now = new Date();

    // Actualizar suscripción
    await db
      .update(subscriptions)
      .set({
        activatedAt: now,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, subscription.id));

    // Actualizar tenant
    await db
      .update(tenants)
      .set({
        plan: subscription.plan,
        status: "active",
        emailVerified: true, // Marcar email como verificado
        subscriptionId: subscription.id.toString(),
        subscriptionStatus: "active",
        subscriptionEndsAt: subscription.expiresAt,
        updatedAt: now,
      })
      .where(eq(tenants.id, tenant.id));

    logger.info(
      { subscriptionId: subscription.id, tenantId: tenant.id, plan: subscription.plan },
      "[Activation] ✅ Cuenta activada exitosamente"
    );

    const planInfo = SAAS_PLANS[subscription.plan as SaasPlan];

    res.json({
      success: true,
      message: "¡Cuenta activada exitosamente!",
      tenant: {
        id: tenant.id,
        email: tenant.email,
        name: tenant.name,
        plan: subscription.plan,
        planName: planInfo?.name || subscription.plan,
      },
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        billingCycle: subscription.billingCycle,
        expiresAt: subscription.expiresAt,
        amount: subscription.amount,
        currency: subscription.currency,
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "[Activation] Error activando cuenta");
    res.status(500).json({
      error: "Error interno",
      message: "Ocurrió un error al activar la cuenta. Por favor contacta al soporte.",
    });
  }
});

/**
 * GET /api/activation/verify/:token
 * Verifica si un token es válido sin activarlo
 */
router.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.activationToken, token))
      .limit(1);

    if (!subscription) {
      return res.json({
        valid: false,
        message: "Token inválido",
      });
    }

    if (subscription.activatedAt) {
      return res.json({
        valid: false,
        message: "Token ya utilizado",
      });
    }

    if (subscription.status !== "active" || subscription.paymentStatus !== "approved") {
      return res.json({
        valid: false,
        message: "Pago pendiente de confirmación",
      });
    }

    const planInfo = SAAS_PLANS[subscription.plan as SaasPlan];

    res.json({
      valid: true,
      plan: subscription.plan,
      planName: planInfo?.name || subscription.plan,
      billingCycle: subscription.billingCycle,
      amount: subscription.amount,
      currency: subscription.currency,
    });
  } catch (error) {
    logger.error({ error }, "[Activation] Error verificando token");
    res.status(500).json({
      valid: false,
      message: "Error verificando token",
    });
  }
});

export default router;
