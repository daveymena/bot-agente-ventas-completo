/**
 * ¿Este negocio puede crear un recurso más según su plan?
 *
 * El límite ya existía como middleware (middleware/featureLimits.ts), pero un
 * middleware solo protege UNA puerta: la ruta HTTP donde está colgado. Y los
 * agentes se crean desde CINCO lugares distintos:
 *
 *   routes/agents.ts          ← la única cubierta por el middleware
 *   lib/app-operator.ts       ← Atlas, cuando el admin le pide crear un agente
 *   lib/personality-engine.ts
 *   routes/code-agent.ts
 *   app.ts (siembra inicial)
 *
 * Por eso la cuenta terminó con 11 agentes teniendo un tope de 10 -- reportado
 * y confirmado por la propia API, que responde `{"limit":10,"current":11}`.
 * Los que entraron de más no "rompieron" nada: entraron por una puerta que
 * nadie estaba mirando.
 *
 * Esto es la comprobación en el ORIGEN, para poder llamarla desde cualquiera
 * de esos caminos. Un límite que vive en una sola ruta no es un límite del
 * plan, es un límite de esa ruta.
 */
import { db, agents, products } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { SAAS_PLANS } from "../middleware/saasValidation";
import { logger } from "./logger";

export type RecursoLimitado = "agents" | "products";

export interface ResultadoLimite {
  permitido: boolean;
  /** Listo para mostrarle al admin. Vacío si está permitido. */
  motivo: string;
  actual: number;
  limite: number;
}

const TABLAS = { agents, products } as const;
const CAMPOS = { agents: "maxAgents", products: "maxProducts" } as const;
const NOMBRES = { agents: "agentes", products: "productos" } as const;

export async function puedeCrear(
  tenantId: number,
  recurso: RecursoLimitado,
  plan?: string | null,
): Promise<ResultadoLimite> {
  try {
    const detalles = SAAS_PLANS[String(plan || "basic")] || SAAS_PLANS.basic!;
    const limite = Number((detalles as any)[CAMPOS[recurso]] ?? 0);

    // -1 (o cualquier negativo) significa "sin tope" en esta tabla de planes.
    if (!Number.isFinite(limite) || limite < 0) {
      return { permitido: true, motivo: "", actual: 0, limite };
    }

    const tabla: any = TABLAS[recurso];
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tabla)
      .where(eq(tabla.tenantId, tenantId));
    const actual = Number(count) || 0;

    if (actual >= limite) {
      return {
        permitido: false,
        actual,
        limite,
        motivo:
          `Ya tenés ${actual} ${NOMBRES[recurso]} y tu plan permite ${limite}. ` +
          `Para crear otro, borrá alguno que no uses o pasá a un plan más grande.`,
      };
    }
    return { permitido: true, motivo: "", actual, limite };
  } catch (err: any) {
    // Si no se puede contar, NO se bloquea: dejar a un cliente sin poder
    // trabajar por un error nuestro de lectura es peor que un recurso de más.
    logger.warn({ err: err?.message, tenantId, recurso }, "[Limites] no se pudo verificar el límite del plan");
    return { permitido: true, motivo: "", actual: 0, limite: 0 };
  }
}
