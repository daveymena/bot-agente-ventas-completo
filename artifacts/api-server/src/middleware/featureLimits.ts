import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { SAAS_PLANS, SaasPlan } from "./saasValidation";

/**
 * Middleware para validar límites de características según el plan SaaS
 * Verifica que el tenant no exceda los límites de su plan actual
 */
export function validateFeatureLimits(feature: "products" | "agents" | "conversations") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = (req as any).tenant;
      const saas = (req as any).saas;

      if (!tenant || !saas) {
        return next();
      }

      const plan = saas.plan as SaasPlan;
      const planDetails = SAAS_PLANS[plan];

      // Mapear características a límites del plan
      const featureLimits: Record<string, keyof typeof planDetails> = {
        products: "maxProducts",
        agents: "maxAgents",
        conversations: "maxConversations",
      };

      const limitKey = featureLimits[feature];
      if (!limitKey) {
        return next();
      }

      const limit = planDetails[limitKey] as number;

      // Aquí se podría agregar lógica para contar los recursos actuales
      // Por ahora, solo registramos el límite disponible
      (req as any).featureLimit = {
        feature,
        limit,
        current: 0, // Se debería obtener de la base de datos
      };

      next();
    } catch (error) {
      logger.error({ error }, "Error validating feature limits");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

/**
 * Middleware para validar límites de mensajes mensuales
 */
export function validateMessageLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = (req as any).tenant;
      const saas = (req as any).saas;

      if (!tenant || !saas) {
        return next();
      }

      const plan = saas.plan as SaasPlan;
      const planDetails = SAAS_PLANS[plan];
      const monthlyLimit = planDetails.monthlyMessages;

      // Aquí se podría agregar lógica para contar mensajes del mes actual
      // Por ahora, solo registramos el límite disponible
      (req as any).messageLimit = {
        limit: monthlyLimit,
        current: 0, // Se debería obtener de la base de datos
        remaining: monthlyLimit,
      };

      next();
    } catch (error) {
      logger.error({ error }, "Error validating message limit");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
