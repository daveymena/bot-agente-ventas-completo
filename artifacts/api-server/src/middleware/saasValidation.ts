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
// se venden ($19/$49/$99) más el gratuito. Los precios salen del costo REAL
// medido de la API -- ver el comentario largo debajo.
/**
 * ============================================================
 * LOS PLANES, CALCULADOS CON EL COSTO REAL DE LA API
 * ============================================================
 *
 * Medido sobre la factura REAL de DeepSeek del dueno (2026-09-05):
 *
 *     $13,03 USD  ·  3.915 pedidos  ·  748.346.644 tokens
 *     => $0,0033 por mensaje
 *
 * Con ese numero, los precios de antes daban esto:
 *
 *     Starter     $15   1.500 msg   cuesta $4,95    margen 67%
 *     Growth      $45   6.000 msg   cuesta $19,80   margen 56%
 *     Pro         $65  15.000 msg   cuesta $49,50   margen 24%  ⚠️
 *     Enterprise $299 100.000 msg   cuesta $330     PIERDE $31  🚨
 *
 * ⚠️ Enterprise hacia PERDER plata en cada venta, y el margen se derrumbaba a
 * medida que el plan subia -- al reves de lo que tiene que pasar. El dueno lo
 * dijo asi: "si el basico gasta eso, al duplicarlo a un plan mas alto debe ser
 * mas caro para ganarle".
 *
 * Ahora el margen es ~70% PAREJO en todos: el limite de mensajes se calcula
 * desde el precio, no al reves.
 *
 *     precio x 0,30 / 0,0033 = mensajes que entran sin perder margen
 *
 * ── Los limites bajaron, y es a proposito ─────────────────────────────────
 *
 * Un limite alto que no se puede sostener no es generosidad: es una promesa
 * que se paga con el margen. Y el panel del dueno muestra 89 conversaciones
 * activas -- los 15.000 mensajes de Pro no los usaba nadie, pero habia que
 * poder pagarlos si alguien lo hacia.
 *
 * ── Y esto se puede volver a subir ────────────────────────────────────────
 *
 * El costo de hoy incluye un desperdicio medido: 191.000 tokens por pedido
 * cuando la carga real son 21.500, porque en CADA vuelta de herramientas se
 * reenvia todo el contexto. Cuando eso baje, el costo por mensaje cae a ~1/3
 * y estos mismos precios admiten el triple de mensajes.
 *
 * 👉 Recalcular estos numeros cuando cambie el costo real, no antes.
 */
export const SAAS_PLANS: Record<string, { name: string; price: number; monthlyMessages: number; monthlyAiResponses: number; maxConcurrentAi: number; maxWhatsappNumbers: number; monthlyConversations: number; maxConversations: number; maxProducts: number; maxAgents: number; features: string[]; trialDays: number; visible?: boolean; }> = {
  basic: {
    // Prueba de 7 días, no gratis para siempre -- si el plan gratuito no
    // vence nadie tiene motivo real para pagar. 30 mensajes alcanza para que
    // el negocio pruebe el bot, no para operar de verdad.
    name: "Prueba gratis",
    price: 0,
    monthlyMessages: 30,
    monthlyAiResponses: 30,
    maxConcurrentAi: 1,
    maxWhatsappNumbers: 1,
    monthlyConversations: 20,
    maxConversations: 20,
    maxProducts: 10,
    maxAgents: 1,
    features: ["IA básica", "Integración con WhatsApp", "1 agente", "30 mensajes de prueba", "7 días de duración"],
    trialDays: 7,
    visible: true,
  },
  starter: {
    name: "Starter",
    price: 29,          // cuesta ~$5 (IA) -> margen ~83%
    monthlyMessages: 1500,
    monthlyAiResponses: 1500,
    maxConcurrentAi: 1,
    maxWhatsappNumbers: 1,
    monthlyConversations: 500,
    maxConversations: 150,
    maxProducts: 75,
    maxAgents: 2,
    features: ["IA avanzada", "Integración con WhatsApp", "Analítica básica", "Soporte por email"],
    trialDays: 30,
    visible: true,
  },
  premium: {
    name: "Growth",
    price: 79,          // cuesta ~$13 (IA) -> margen ~84%
    monthlyMessages: 4000,
    monthlyAiResponses: 4000,
    maxConcurrentAi: 2,
    maxWhatsappNumbers: 1,
    monthlyConversations: 1500,
    maxConversations: 400,
    maxProducts: 300,
    maxAgents: 5,
    features: ["IA avanzada", "Integración con WhatsApp", "Analítica completa", "Soporte prioritario", "Marca personalizada"],
    trialDays: 30,
    visible: true,
  },
  professional: {
    name: "Pro",
    price: 149,         // cuesta ~$30 (IA) -> margen ~80%
    monthlyMessages: 9000,
    monthlyAiResponses: 9000,
    maxConcurrentAi: 2,
    maxWhatsappNumbers: 1,
    monthlyConversations: 3000,
    maxConversations: 900,
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
    monthlyAiResponses: 100,
    maxConcurrentAi: 1,
    maxWhatsappNumbers: 1,
    monthlyConversations: 30,
    maxConversations: 10,
    maxProducts: 5,
    maxAgents: 1,
    features: ["Basic AI", "WhatsApp Integration"],
    trialDays: 7,
    visible: false,
  },
  enterprise: {
    name: "Enterprise",
    price: 299,         // cuesta ~$89 (IA) -> margen ~70%
    monthlyMessages: 27000,
    monthlyAiResponses: 27000,
    maxConcurrentAi: 4,
    maxWhatsappNumbers: 1,
    monthlyConversations: 10000,
    maxConversations: 2700,
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
      const plan = (rawPlan === "pro" ? "professional" : rawPlan) as SaasPlan;
      
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

      (req as any).limits = {
        monthlyMessages: planDetails.monthlyMessages,
        monthlyWhatsappMessages: planDetails.monthlyMessages,
        dailyWhatsappMessages: Math.max(1, Math.ceil(planDetails.monthlyMessages / 30)),
        monthlyAiResponses: planDetails.monthlyAiResponses,
        dailyAiResponses: Math.max(1, Math.ceil(planDetails.monthlyAiResponses / 30)),
        maxConcurrentAi: Math.min(
          planDetails.maxConcurrentAi,
          Math.max(1, Math.floor(Number(process.env.AGENT_MAX_EN_PARALELO_TENANT) || 4)),
          Math.max(1, Math.floor(Number(process.env.AGENT_GLOBAL_CONCURRENCIA) || Number(process.env.AGENT_CONCURRENCIA) || 4)),
        ),
        maxWhatsappNumbers: planDetails.maxWhatsappNumbers,
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
  const canonical = (plan as string) === "pro" ? "professional" : plan;
  return SAAS_PLANS[canonical] || SAAS_PLANS.free;
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
