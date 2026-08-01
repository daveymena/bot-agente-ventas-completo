import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// Planes disponibles y sus límites.
//
// Se mantienen TODAS las claves existentes (basic, free, starter, premium,
// professional, enterprise) aunque ya no se muestren todas en la página de
// precios -- tenants ya existentes tienen guardado tenant.plan = una de estas
// claves (ej. tenant 1 = "premium"), y borrar una clave rompería
// getPlanInfo()/validateSaasPlan() para ellos. `visible: false` es lo que la
// controla la grilla pública de /pricing (ver GET /api/pricing en
// routes/pricing.ts) -- las que quedan visibles son los 3 planes reales que
// se venden ($15/$45/$65) más el gratuito.
export const SAAS_PLANS: Record<string, { name: string; price: number; monthlyMessages: number; maxConversations: number; maxProducts: number; maxAgents: number; features: string[]; trialDays: number; visible?: boolean; }> = {
  basic: {
    // Prueba de 7 días, no gratis para siempre -- si el plan gratuito no
    // vence nadie tiene motivo real para pagar. 30 mensajes alcanza para que
    // el negocio pruebe el bot, no para operar de verdad.
    name: "Prueba gratis",
    price: 0,
    monthlyMessages: 30,
    maxConversations: 20,
    maxProducts: 10,
    maxAgents: 1,
    features: ["IA básica", "Integración con WhatsApp", "1 agente", "30 mensajes de prueba", "7 días de duración"],
    trialDays: 7,
    visible: true,
  },
  starter: {
    name: "Starter",
    price: 15,
    monthlyMessages: 1500,
    maxConversations: 150,
    maxProducts: 75,
    maxAgents: 2,
    features: ["IA avanzada", "Integración con WhatsApp", "Analítica básica", "Soporte por email"],
    trialDays: 30,
    visible: true,
  },
  premium: {
    name: "Growth",
    price: 45,
    monthlyMessages: 6000,
    maxConversations: 600,
    maxProducts: 300,
    maxAgents: 5,
    features: ["IA avanzada", "Integración con WhatsApp", "Analítica completa", "Soporte prioritario", "Marca personalizada"],
    trialDays: 30,
    visible: true,
  },
  professional: {
    name: "Pro",
    price: 65,
    monthlyMessages: 15000,
    maxConversations: 1500,
    maxProducts: 750,
    maxAgents: 8,
    features: [
      "IA avanzada",
      "Integración con WhatsApp",
      "Analítica completa",
      "Soporte prioritario",
      "Marca personalizada",
      "Acceso a la API",
    ],
    trialDays: 30,
    visible: true,
  },
  // Legados: no se muestran en /pricing, pero siguen siendo válidos para
  // cuentas que ya los tengan asignados.
  free: {
    name: "Free",
    price: 0,
    monthlyMessages: 100,
    maxConversations: 10,
    maxProducts: 5,
    maxAgents: 1,
    features: ["Basic AI", "WhatsApp Integration"],
    trialDays: 7,
    visible: false,
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
    visible: false,
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
      
      // EXCEPCIÓN VIP: administrador de la plataforma, acceso gratuito de por
      // vida. Antes comparaba tenant.email contra un valor hardcodeado (el
      // mismo patrón roto que ya se corrigió en tenants.ts/whatsapp.ts) --
      // ahora usa el flag real is_admin de la BD.
      const isVIP = !!tenant.isAdmin;

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
