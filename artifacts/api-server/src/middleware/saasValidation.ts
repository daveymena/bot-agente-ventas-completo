import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// Planes disponibles y sus límites
export const SAAS_PLANS = {
  free: {
    name: "Free",
    price: 0,
    monthlyMessages: 100,
    maxConversations: 10,
    maxProducts: 5,
    maxAgents: 1,
    features: ["Basic AI", "WhatsApp Integration"],
    trialDays: 7,
  },
  starter: {
    name: "Starter",
    price: 29,
    monthlyMessages: 1000,
    maxConversations: 100,
    maxProducts: 50,
    maxAgents: 1,
    features: ["Advanced AI", "WhatsApp Integration", "Analytics", "Email Support"],
    trialDays: 30, // Aumentado a 30 días para evitar bloqueos prematuros
  },
  professional: {
    name: "Professional",
    price: 99,
    monthlyMessages: 10000,
    maxConversations: 1000,
    maxProducts: 500,
    maxAgents: 3,
    features: [
      "Advanced AI",
      "WhatsApp Integration",
      "Analytics",
      "Priority Support",
      "Custom Branding",
      "API Access",
    ],
    trialDays: 30,
  },
  enterprise: {
    name: "Enterprise",
    price: 299,
    monthlyMessages: 100000,
    maxConversations: 10000,
    maxProducts: 5000,
    maxAgents: 10,
    features: [
      "Advanced AI",
      "WhatsApp Integration",
      "Analytics",
      "24/7 Support",
      "Custom Branding",
      "API Access",
      "Dedicated Account Manager",
      "Custom Integrations",
    ],
    trialDays: 365,
  },
};

export type SaasPlan = keyof typeof SAAS_PLANS;

// Middleware para validar que el tenant tiene un plan activo
export function validateSaasPlan() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = (req as any).tenant;

      if (!tenant) {
        return res.status(401).json({ error: "No tenant found" });
      }

      // Normalizar el plan a minúsculas para evitar errores de mayúsculas
      const rawPlan = (tenant.plan || "free").toString().toLowerCase();
      const plan = rawPlan as SaasPlan;
      
      // EXCEPCIÓN VIP: Usuario administrador con acceso gratuito de por vida
      const isVIP = tenant.email === "daveymena16@gmail.com";
      
      if (isVIP) {
        // Forzamos estado activo y saltamos validaciones de expiración
        (req as any).saas = {
          plan: "enterprise", // Le damos el nivel más alto internamente
          planDetails: SAAS_PLANS.enterprise,
          isTrialExpired: false,
        };
        return next();
      }

      if (!SAAS_PLANS[plan]) {
        logger.warn(
          { tenantId: tenant.id, plan: rawPlan },
          "Invalid SaaS plan detected"
        );
        return res.status(403).json({
          error: "Invalid subscription plan",
          message: `El plan '${rawPlan}' no es reconocido por el sistema.`,
          action: "upgrade_plan",
        });
      }

      // Verificar que el plan está activo (no expirado)
      if (tenant.status === "inactive" || tenant.status === "suspended") {
        logger.warn(
          { tenantId: tenant.id, status: tenant.status },
          "Tenant account is not active"
        );
        return res.status(403).json({
          error: "Account suspended",
          message: "Tu cuenta ha sido suspendida. Por favor contacta a soporte.",
          action: "contact_support",
        });
      }

      // Verificar si es trial y si ha expirado
      if (tenant.status === "trial") {
        const trialDays = SAAS_PLANS[plan].trialDays || 30;
        const createdAt = new Date(tenant.createdAt);
        const trialExpiry = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);

        if (new Date() > trialExpiry) {
          logger.warn(
            { tenantId: tenant.id, trialExpiry },
            "Trial period expired"
          );
          return res.status(403).json({
            error: "Trial expired",
            message: "Tu periodo de prueba ha expirado. Por favor actualiza tu plan.",
            action: "upgrade_plan",
            trialExpiry: trialExpiry.toISOString(),
          });
        }
      }

      // Adjuntar información del plan al request
      (req as any).saas = {
        plan,
        planDetails: SAAS_PLANS[plan],
        isTrialExpired: false,
      };

      next();
    } catch (error) {
      logger.error({ error }, "Error validating SaaS plan");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// Middleware para validar límites de uso
export function validateUsageLimits() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = (req as any).tenant;
      const saas = (req as any).saas;

      if (!tenant || !saas) {
        return next();
      }

      const planDetails = saas.planDetails;

      // Aquí se pueden agregar validaciones de límites
      // Por ejemplo: verificar que no se exceda el límite de mensajes mensuales

      (req as any).limits = {
        monthlyMessages: planDetails.monthlyMessages,
        maxConversations: planDetails.maxConversations,
        maxProducts: planDetails.maxProducts,
        maxAgents: planDetails.maxAgents,
      };

      next();
    } catch (error) {
      logger.error({ error }, "Error validating usage limits");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// Función para obtener información del plan
export function getPlanInfo(plan: SaasPlan) {
  return SAAS_PLANS[plan] || SAAS_PLANS.free;
}

// Función para verificar si un tenant puede acceder a una característica
export function canAccessFeature(plan: SaasPlan, feature: string): boolean {
  const planDetails = SAAS_PLANS[plan];
  return planDetails.features.includes(feature);
}

// Función para obtener el precio mensual
export function getMonthlyPrice(plan: SaasPlan): number {
  return SAAS_PLANS[plan].price;
}
