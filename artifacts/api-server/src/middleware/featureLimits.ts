import { Request, Response, NextFunction } from "express";
import { eq, sql } from "drizzle-orm";
import { db, products, agents, conversations } from "@workspace/db";
import { logger } from "../lib/logger";
import { getUsageAnalytics } from "./rateLimiting";
import { SAAS_PLANS, SaasPlan } from "./saasValidation";

const FEATURE_TABLES = { products, agents, conversations } as const;

/**
 * Middleware para validar límites de características según el plan SaaS.
 *
 * Antes esto era un no-op: "current: 0, // Se debería obtener de la base de
 * datos" -- nunca contaba nada real ni bloqueaba nada, así que cualquier
 * tenant podía crear productos/agentes/conversaciones sin límite sin importar
 * su plan (Gratis, Starter, Growth, Pro daban exactamente el mismo acceso en
 * la práctica). Ahora cuenta lo que el tenant realmente tiene en la BD y
 * bloquea la creación de uno nuevo si ya alcanzó el límite de su plan.
 *
 * Solo bloquea POST (crear uno nuevo) -- GET/PATCH/DELETE de recursos ya
 * existentes nunca deben verse afectados por este límite.
 */
export function validateFeatureLimits(feature: "products" | "agents" | "conversations") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = (req as any).tenant;
      const saas = (req as any).saas;

      if (!tenant || !saas) {
        return next();
      }

      // Solo la creación de un recurso nuevo consume el límite.
      if (req.method !== "POST") {
        return next();
      }

      const plan = saas.plan as SaasPlan;
      const planDetails = SAAS_PLANS[plan];

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
      const table = FEATURE_TABLES[feature];

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(table as any)
        .where(eq((table as any).tenantId, tenant.id));

      const current = Number(count);

      (req as any).featureLimit = { feature, limit, current };

      if (current >= limit) {
        logger.warn({ tenantId: tenant.id, feature, current, limit, plan }, "[FeatureLimits] Limit reached");
        return res.status(403).json({
          error: "Feature limit reached",
          message: `Alcanzaste el límite de ${limit} ${feature === "products" ? "productos" : feature === "agents" ? "agentes" : "conversaciones"} de tu plan ${planDetails.name}. Actualiza tu plan para seguir creando.`,
          action: "upgrade_plan",
          feature,
          limit,
          current,
        });
      }

      next();
    } catch (error) {
      logger.error({ error }, "Error validating feature limits");
      // No bloquear tráfico legítimo si el chequeo mismo falla.
      next();
    }
  };
}

/**
 * Chequeo real de límite de mensajes mensuales, como función plana (no
 * middleware) para poder usarse tanto en rutas Express como en el flujo de
 * WhatsApp (agent-orchestrator.ts), que no tiene req/res -- ahí es donde
 * pasa la mayoría del tráfico real, no solo en el dashboard.
 */
export async function checkMessageLimit(tenantId: number, plan: string): Promise<{ allowed: boolean; current: number; limit: number; planName: string }> {
  const planDetails = SAAS_PLANS[plan as SaasPlan] || SAAS_PLANS.basic;
  const monthlyLimit = planDetails.monthlyMessages;

  // ── El consumo sale de la BASE, no de la memoria ────────────────────────
  //
  // Antes salia de `getUsageAnalytics`, que lee un Map del proceso. Cada
  // reinicio lo pone en cero y un despliegue es un reinicio: este limite
  // estaba bien escrito y NUNCA se alcanzaba. Ver `consumo-del-plan.ts`.
  //
  // Se toma el MAYOR de los dos: si por lo que sea la fila del mes todavia no
  // refleja los envios recientes, el contador en memoria de esta instancia si.
  // Quedarse con el mas alto es lo prudente cuando lo que se protege es plata.
  const { mensajesDelMes } = await import("../lib/consumo-del-plan");
  const enBase = await mensajesDelMes(tenantId);
  const enMemoria = (getUsageAnalytics(String(tenantId)) as { whatsappMessages: number } | null)?.whatsappMessages ?? 0;
  const current = Math.max(enBase, enMemoria);

  return { allowed: current < monthlyLimit, current, limit: monthlyLimit, planName: planDetails.name };
}

/**
 * Middleware para validar el límite de mensajes mensuales del plan.
 *
 * Antes era un no-op (current siempre 0, nunca comparaba ni bloqueaba) Y
 * ADEMÁS estaba montado en app.ts sobre "/api/messages", una ruta que no
 * existe -- los mensajes reales se mandan por
 * POST /api/conversations/:id/messages, así que este middleware nunca se
 * ejecutaba en absoluto. Ahora se usa directamente en esa ruta real.
 */
export function validateMessageLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = (req as any).tenant;
      const saas = (req as any).saas;

      if (!tenant || !saas) {
        return next();
      }

      const result = await checkMessageLimit(tenant.id, saas.plan);
      (req as any).messageLimit = { limit: result.limit, current: result.current, remaining: Math.max(0, result.limit - result.current) };

      if (!result.allowed) {
        logger.warn({ tenantId: tenant.id, current: result.current, limit: result.limit, plan: saas.plan }, "[MessageLimit] Monthly message limit reached");
        return res.status(403).json({
          error: "Message limit reached",
          message: `Alcanzaste el límite de ${result.limit.toLocaleString()} mensajes mensuales de tu plan ${result.planName}. Actualiza tu plan para seguir enviando mensajes.`,
          action: "upgrade_plan",
          limit: result.limit,
          current: result.current,
        });
      }

      next();
    } catch (error) {
      logger.error({ error }, "Error validating message limit");
      next();
    }
  };
}
