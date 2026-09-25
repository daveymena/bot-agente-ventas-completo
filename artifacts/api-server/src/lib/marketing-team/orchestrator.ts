/**
 * ============================================================
 * MARKETING TEAM — ORCHESTRATOR (MASTER PLAN §4, §23, §26)
 * ============================================================
 * El usuario NO necesita saber qué agente usar: dice "quiero vender
 * más este producto" y el orquestador decide el flujo. Esta es la
 * versión inicial que ya encadena los agentes de análisis y registra
 * tareas en marketing_tasks. Los agentes de ejecución (MetaAdsManager,
 * ExperimentManager, OptimizationAgent, BudgetManager, ScalingAgent) se
 * integran en las fases 4-7.
 *
 * detectIntent → selectAgents → createTasks → resolveDependencies
 * → execute → collectResults → synthesize → report
 */

import { db, marketingTasks, products, marketingExperiments } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import type { AgentHandoff } from "./types";
import { marketResearch, type ProductInfo } from "./agents/market-researcher";
import { audienceStrategy } from "./agents/audience-strategist";
import { offerStrategy } from "./agents/offer-strategist";
import { creativeDirection } from "./agents/creative-director";
import { copywriting } from "./agents/copywriter";
import { marketingStrategy } from "./agents/marketing-strategist";
import { performanceAnalysis } from "./agents/performance-analyst";
import { diagnostic } from "./agents/diagnostic-agent";
import { getLearningsForProduct, saveLearning } from "./agents/marketing-memory";
import { getOrCreateBudget } from "./budget-guard";
import { classifyAction } from "./risk-engine";
import { logger } from "../logger";

export type MarketingIntent =
  | "growth_plan"        // "quiero vender más X"
  | "diagnostic"         // "¿qué está fallando? / ¿por qué bajaron las ventas?"
  | "performance"        // "¿cómo vamos? / ¿qué está funcionando?"
  | "create_campaign"    // "crea una campaña" (necesita Meta Ads — fase 4)
  | "help"               // saludo o "¿qué podés hacer?"
  | "unknown";

const INTENT_KEYWORDS: Array<{ intent: MarketingIntent; words: string[] }> = [
  { intent: "diagnostic", words: ["qué está fallando", "por qué bajaron", "no crece", "no está funcionando", "diagnóstico", "problema"] },
  { intent: "performance", words: ["cómo vamos", "qué está funcionando", "resultados", "cómo va", "rendimiento", "métricas"] },
  { intent: "create_campaign", words: ["crea una campaña", "crear campaña", "prepara anuncios", "nuevos anuncios", "campaña nueva"] },
  { intent: "growth_plan", words: ["vender más", "hacer crecer", "crecer la venta", "más ventas", "crecer", "estrategia", "plan de marketing", "campañas"] },
  // Saludo o pedido de ayuda: antes caían en 400 "no identifiqué intención".
  { intent: "help", words: ["hola", "buenas", "qué puedes hacer", "que puedes hacer", "ayuda", "ayudame", "ayúdame", "cómo funciona", "como funciona", "qué sabés hacer", "opciones"] },
];

export function detectIntent(message: string): MarketingIntent {
  const text = message.toLowerCase().trim();
  for (const { intent, words } of INTENT_KEYWORDS) {
    if (words.some((w) => text.includes(w))) return intent;
  }
  return "unknown";
}

/** Texto de ayuda con ejemplos reales: es lo que recibe el admin en vez de un 400. */
export const AYUDA_MARKETING =
  "Decime qué necesitás y lo resuelvo. Por ejemplo:\n" +
  "• «quiero vender más <producto>» → armo plan, audiencias, oferta, creativos y copies\n" +
  "• «¿qué está fallando?» → diagnostico el embudo\n" +
  "• «¿cómo vamos?» → te muestro el rendimiento\n" +
  "• «crea una campaña» → preparo el borrador (queda para aprobar)";

function toProductInfo(row: any): ProductInfo {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    price: row.price != null ? Number(row.price) : undefined,
    currency: row.currency || "COP",
    // Antes: `row.category || row.categoryId ? undefined : "general"` se leía
    // como (a||b)?undefined:"general" y devolvía undefined SIEMPRE que hubiera
    // categoría. El market-researcher caía a "general" en todos los productos.
    category: row.category || (row.categoryId ? `categoría ${row.categoryId}` : "general"),
    features: Array.isArray(row.features) ? row.features : row.features ? [String(row.features)] : [],
    imageUrl: row.imageUrl,
  };
}

async function getProduct(tenantId: number, productId?: number | string | null, name?: string): Promise<ProductInfo | null> {
  if (productId) {
    const row = (await db.select().from(products).where(and(eq(products.id, Number(productId)), eq(products.tenantId, tenantId))).limit(1))[0];
    if (row) return toProductInfo(row);
  }
  if (name) {
    const rows = await db.select().from(products).where(eq(products.tenantId, tenantId)).limit(50);
    const found = rows.find((r: any) => String(r.name).toLowerCase().includes(name.toLowerCase()));
    if (found) return toProductInfo(found);
  }
  const first = (await db.select().from(products).where(eq(products.tenantId, tenantId)).limit(1))[0];
  return first ? toProductInfo(first) : null;
}

async function createTask(tenantId: number, assignedAgent: string, action: string, input: Record<string, unknown>, dependencies: number[] = []): Promise<number | null> {
  try {
    // El riesgo sale del RiskEngine, no hardcodeado: antes TODA tarea del
    // orquestador nacía LOW/sin aprobación y el motor de riesgo quedaba de
    // adorno (auditoría y WAITING_APPROVAL nunca se ejercían desde acá).
    const risk = classifyAction(action);
    const [task] = await db
      .insert(marketingTasks)
      .values({
        tenantId, assignedAgent, action, input, dependencies,
        status: risk.approvalRequired ? "WAITING_APPROVAL" : "PENDING",
        priority: "medium",
        risk: risk.risk,
        approvalRequired: risk.approvalRequired,
      })
      .returning({ id: marketingTasks.id });
    return task?.id ?? null;
  } catch (err) {
    logger.error({ err }, "[MarketingOrchestrator] No se pudo registrar tarea");
    return null;
  }
}

async function finishTask(taskId: number | null, output: unknown, status = "COMPLETED") {
  if (!taskId) return;
  try {
    await db.update(marketingTasks).set({ status, output: output as any, updatedAt: new Date() }).where(eq(marketingTasks.id, taskId));
  } catch { /* noop */ }
}

/**
 * Flujo completo "hacer crecer la venta de X" (MASTER PLAN §23):
 * producto → investigación → audiencias → oferta → creativos → copies
 * → estrategia (plan) → memoria.
 */
export async function planGrowth(
  input: {
    tenantId: number;
    businessObjective?: string;
    productId?: number | string;
    productName?: string;
  },
): Promise<{ plan: AgentHandoff<any>; steps: Array<{ agent: string; taskId: number | null }> }> {
  const { tenantId } = input;
  const product = await getProduct(tenantId, input.productId, input.productName);
  if (!product) {
    throw new Error("No se encontró producto. Creá un producto primero o indicá su nombre.");
  }

  const steps: Array<{ agent: string; taskId: number | null }> = [];

  // 1. Product Agent (lectura real del producto) — implícito en getProduct.
  // 2. Memoria previa (el plan consulta la memoria ANTES de crear, §19).
  const learnings = await getLearningsForProduct(tenantId, product.name, 5);
  // La memoria se pasa COMPLETA (título + contenido), no solo el título: con
  // puros títulos el agente no puede usar lo aprendido (auditoría 24-09).
  const memoria = learnings.map((l) => `${l.title}: ${String(l.content || "").slice(0, 300)}`);

  // Contexto real (embudo + negocio) para que los agentes no hablen en vacío.
  const { getFunnelSnapshot } = await import("./attribution");
  const funnel = await getFunnelSnapshot(tenantId, 30).catch(() => null);
  const { getBusinessContext } = await import("../business-context");
  const negocio: any = await getBusinessContext(tenantId).catch(() => null);

  // 3. Investigación
  const researchHandoff = await marketResearch(product, { tenantId, previousLearnings: memoria });
  steps.push({ agent: "MarketResearcher", taskId: await createTask(tenantId, "MarketResearcher", "research_market", { productId: product.id, productName: product.name }) });
  if (steps[steps.length - 1]?.taskId) await finishTask(steps[steps.length - 1]!.taskId!, researchHandoff.data);

  // 4. Audiencias
  const audienceHandoff = await audienceStrategy({ product, research: researchHandoff.data, tenantId });
  steps.push({ agent: "AudienceStrategist", taskId: await createTask(tenantId, "AudienceStrategist", "define_audiences", { productId: product.id }) });
  if (steps[steps.length - 1]?.taskId) await finishTask(steps[steps.length - 1]!.taskId!, audienceHandoff.data);

  // 5. Oferta (con embudo real: sin esto la oferta se analizaba "sin datos")
  const offerHandoff = await offerStrategy(product, {
    tenantId,
    funnel: funnel ? { leads: funnel.leads, paid: funnel.paid } : undefined,
  });
  steps.push({ agent: "OfferStrategist", taskId: await createTask(tenantId, "OfferStrategist", "analyze_offer", { productId: product.id }) });
  if (steps[steps.length - 1]?.taskId) await finishTask(steps[steps.length - 1]!.taskId!, offerHandoff.data);

  // 6. Creativos
  const creativeHandoff = await creativeDirection({ product, research: researchHandoff.data, tenantId });
  steps.push({ agent: "CreativeDirector", taskId: await createTask(tenantId, "CreativeDirector", "create_concepts", { productId: product.id }) });
  if (steps[steps.length - 1]?.taskId) await finishTask(steps[steps.length - 1]!.taskId!, creativeHandoff.data);

  // 7. Copies
  const copyHandoff = await copywriting({ product, brief: creativeHandoff.data, research: researchHandoff.data, tenantId, channel: "meta", country: negocio?.cobertura || undefined });
  steps.push({ agent: "Copywriter", taskId: await createTask(tenantId, "Copywriter", "generate_copy", { productId: product.id }) });
  if (steps[steps.length - 1]?.taskId) await finishTask(steps[steps.length - 1]!.taskId!, copyHandoff.data);

  // 8. Estrategia (plan)
  const budget = await getOrCreateBudget(tenantId).catch(() => null);
  const planHandoff = await marketingStrategy({
    businessObjective: input.businessObjective || `Hacer crecer la venta de ${product.name}`,
    product,
    research: researchHandoff.data,
    audience: audienceHandoff.data,
    offer: offerHandoff.data,
    creative: creativeHandoff.data,
    budget: budget ? { daily: budget.maxDailySpend, currency: budget.currency } : undefined,
    historical: memoria,
    tenantId,
  });
  steps.push({ agent: "MarketingStrategist", taskId: await createTask(tenantId, "MarketingStrategist", "create_strategy", { productId: product.id, businessObjective: input.businessObjective }) });
  if (steps[steps.length - 1]?.taskId) await finishTask(steps[steps.length - 1]!.taskId!, planHandoff.data);

  // 9. Memoria: registrar el plan como aprendizaje inicial (solo el título).
  try {
    await saveLearning(tenantId, {
      product: product.name,
      productId: product.id,
      tags: ["plan"],
      content: `Plan generado: objetivo "${planHandoff.data.objetivo}", ${planHandoff.data.angulos.length} ángulos, ${planHandoff.data.experimentos.length} experimentos propuestos. Pendiente de resultados.`,
    });
  } catch { /* la memoria nunca bloquea el flujo */ }

  return { plan: planHandoff, steps };
}

/** Ciclo de diagnóstico: performance → embudo → recomendaciones (§15, §16). */
export async function runDiagnosticCycle(input: { tenantId: number; days?: number }): Promise<{
  performance: AgentHandoff<any>;
  diagnostic: AgentHandoff<any>;
}> {
  const performance = await performanceAnalysis({ tenantId: input.tenantId, days: input.days ?? 30 });
  const diag = await diagnostic({ tenantId: input.tenantId, days: input.days ?? 30 });
  return { performance, diagnostic: diag };
}

/** Reporte del chat en formato humano/visual (MASTER PLAN §37). */
export function formatReport(title: string, sections: Array<{ emoji: string; label: string; text: string }>): string {
  const sep = "━━━━━━━━━━━━━━";
  return [`🎯 ${title}`, sep, ...sections.map((s) => `${s.emoji} ${s.label}\n${s.text}`), sep, "🚀 Próximo paso: revisar las recomendaciones y aprobar las acciones de riesgo."].join("\n\n");
}

export async function listRecentTasks(tenantId: number, limit = 50) {
  return db
    .select()
    .from(marketingTasks)
    .where(eq(marketingTasks.tenantId, tenantId))
    .orderBy(desc(marketingTasks.createdAt))
    .limit(limit);
}

export async function listExperiments(tenantId: number) {
  return db
    .select()
    .from(marketingExperiments)
    .where(eq(marketingExperiments.tenantId, tenantId))
    .orderBy(desc(marketingExperiments.createdAt))
    .limit(100);
}
