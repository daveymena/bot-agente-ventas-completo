/**
 * ============================================================
 * ARCHITECT REASONER
 * ============================================================
 * Razonamiento multi-ángulo (CEO, ventas, UX, data) sobre una decisión de
 * negocio real -- vía LLM de verdad, no plantillas fijas.
 *
 * Antes esto era una máquina de "mad libs": los 4 perspectives eran texto
 * canned indexado por goals[0] (con fallback a "growth"), la situación
 * real que describía el admin nunca se leía para nada, y devolvía el mismo
 * "próximos pasos" ("1. Revisar UX/design friction points"...) sin importar
 * qué se le preguntara. La confianza era la única parte real (escalaba con
 * cuántos campos de datos reales traía el contexto). Ahora arma un prompt
 * con la situación real + datos reales + lecciones previas y llama al mejor
 * proveedor de IA disponible del tenant -- mismo criterio de prioridad que
 * el Operador (ver routes/code-agent.ts): catálogo guardado por el admin
 * primero, luego una rotación corta de proveedores gratis como respaldo.
 */

import { createAIClient, getProviderConfig, getOpenCodeRotation, type AIProviderConfig } from "@workspace/integrations-openai-ai-server";
import { db, settings } from "@workspace/db";
import { leerBusinessConfig } from "./ai-keys";
import { logger } from "./logger";

export interface ReasoningContext {
  situation: string;
  data: Record<string, any>;
  constraints: string[];
  goals: string[];
  tenantId?: number;
}

export interface ReasoningResult {
  ceo_perspective: {
    strategy: string;
    rationale: string;
    risks: string[];
    timeline: string;
  };
  sales_perspective: {
    approach: string;
    pitfalls: string[];
    closingStrategy: string;
    objectionHandlers: Record<string, string>;
  };
  design_perspective: {
    userExperience: string;
    friction_points: string[];
    improvements: string[];
  };
  data_perspective: {
    insights: string[];
    metrics: Record<string, any>;
    predictions: string[];
  };
  synthesis: {
    recommendation: string;
    confidence: number;
    nextSteps: string[];
  };
}

// Candidatos cortos (no la lista completa de 20+ del Operador): esto corre
// DENTRO de un paso del Operador, que ya tiene su propio presupuesto de
// tiempo -- una cadena larga acá haría lento el turno entero.
async function buildCandidates(tenantId?: number): Promise<{ name: string; config: AIProviderConfig }[]> {
  const candidates: { name: string; config: AIProviderConfig }[] = [];
  const seen = new Set<string>();
  const push = (name: string, cfg: AIProviderConfig | null) => {
    if (!cfg) return;
    const key = cfg.baseUrl + "|" + cfg.model;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ name, config: cfg });
  };

  if (tenantId) {
    try {
      const [dbSettings] = await db.select().from(settings).limit(1);
      const catalogo = leerBusinessConfig((dbSettings as any)?.businessConfig).aiProviders || {};
      for (const proveedor of Object.keys(catalogo)) push(proveedor, getProviderConfig(proveedor));
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[ArchitectReasoner] no se pudo leer el catálogo del admin, sigo con fallbacks");
    }
  }

  push("github_copilot_internal", getProviderConfig("github_copilot_internal"));
  const zenRotation = getOpenCodeRotation();
  if (zenRotation[0]) push(`opencode:${zenRotation[0].model}`, zenRotation[0]);
  push("groq", getProviderConfig("groq"));

  return candidates;
}

function formatRealData(data: Record<string, any>): string {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "(el admin no pasó datos reales del negocio para esta decisión -- decilo explícitamente, no inventes cifras)";
  return entries.map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : JSON.stringify(v)}`).join("\n");
}

const REASONER_SYSTEM_PROMPT = `Sos un consultor senior que analiza UNA decisión de negocio real desde 4 ángulos: CEO/estrategia, ventas, UX/diseño y datos. La situación que te dan es específica -- tu análisis tiene que hablar DE ESA situación puntual, no dar consejos genéricos que servirían para cualquier pregunta.

REGLAS:
- Basate en los datos reales que te pasan. Si faltan datos para una perspectiva (ej: no hay conversionRate para hablar de data_perspective), decilo explícitamente en esa sección en vez de inventar un número.
- NUNCA inventes estadísticas, porcentajes ni "casos de éxito" que no te dieron.
- La confianza (0-100) tiene que reflejar cuánta información real tenías para razonar: con poca data real, confianza baja (30-50); con datos sólidos, puede ser alta (70-90). Nunca un número fijo.
- Si hay lecciones de decisiones pasadas similares, tenelas en cuenta en tu recomendación.
- Respondé SIEMPRE en JSON estricto con esta forma exacta:
{
  "ceo_perspective": { "strategy": string, "rationale": string, "risks": string[], "timeline": string },
  "sales_perspective": { "approach": string, "pitfalls": string[], "closingStrategy": string, "objectionHandlers": { [objecion: string]: string } },
  "design_perspective": { "userExperience": string, "friction_points": string[], "improvements": string[] },
  "data_perspective": { "insights": string[], "metrics": object, "predictions": string[] },
  "synthesis": { "recommendation": string, "confidence": number, "nextSteps": string[] }
}`;

export class ArchitectReasoner {
  /**
   * Razonamiento completo multi-ángulo, vía LLM real. Tira si ningún
   * proveedor de IA responde -- executeAction() en app-operator.ts ya
   * convierte esa excepción en un { ok:false } honesto para el admin, en
   * vez de que esta función finja un resultado con plantillas fijas.
   */
  async reason(context: ReasoningContext): Promise<ReasoningResult> {
    const { situation, data, goals, constraints, tenantId } = context;
    logger.info({ situation }, "🧠 Starting multi-angle reasoning (LLM)");

    const candidates = await buildCandidates(tenantId);
    if (candidates.length === 0) {
      throw new Error("No hay ningún proveedor de IA configurado para razonar");
    }

    const userPrompt = `SITUACIÓN A ANALIZAR: ${situation}

METAS: ${goals && goals.length ? goals.join(", ") : "(no especificadas)"}
RESTRICCIONES: ${constraints && constraints.length ? constraints.join(", ") : "(no especificadas)"}

DATOS REALES DEL NEGOCIO:
${formatRealData(data)}

Analizá esta situación específica desde los 4 ángulos y devolvé el JSON.`;

    const messages = [
      { role: "system", content: REASONER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    const deadline = Date.now() + 25_000;
    let lastError = "";
    for (const cand of candidates) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        const client = createAIClient(cand.config);
        const resp = await client.chat.completions.create(
          {
            model: cand.config.model,
            messages: messages as any,
            temperature: 0.4,
            response_format: { type: "json_object" },
          },
          { timeout: Math.min(12_000, remaining), maxRetries: 0 },
        );
        const content = resp.choices[0]?.message?.content;
        if (!content) continue;
        const parsed = JSON.parse(content) as ReasoningResult;
        if (!parsed?.synthesis?.recommendation) continue;
        logger.info({ provider: cand.name, confidence: parsed.synthesis.confidence }, "✅ Reasoning complete");
        return parsed;
      } catch (e: any) {
        lastError = e?.message || String(e);
        logger.warn({ provider: cand.name, err: lastError.slice(0, 150) }, "[ArchitectReasoner] proveedor falló, rotando");
      }
    }

    throw new Error(`Ningún proveedor de IA pudo razonar esta decisión (último error: ${lastError})`);
  }

  /** Caso de uso: mejorar conversión */
  async improveConversion(metrics: { currentRate: number; visitors: number; revenue: number }, tenantId?: number): Promise<ReasoningResult> {
    return this.reason({
      situation: "Mejorar conversion rate",
      data: { conversionRate: metrics.currentRate, monthlyVisitors: metrics.visitors, revenue: metrics.revenue },
      constraints: ["Budget limitado", "No romper experiencia actual"],
      goals: ["Aumentar conversión 20-30%"],
      tenantId,
    });
  }

  /** Caso de uso: estrategia de nuevos clientes */
  async strategyNewCustomers(segments: { cold: number; warm: number; hot: number }, tenantId?: number): Promise<ReasoningResult> {
    return this.reason({
      situation: "Optimizar estrategia para diferentes segmentos de leads",
      data: { coldLeads: segments.cold, warmLeads: segments.warm, hotLeads: segments.hot },
      constraints: ["Team pequeño", "Presupuesto marketing fijo"],
      goals: ["Maximizar conversion de cada segmento", "Aumentar pipeline de warm leads"],
      tenantId,
    });
  }

  /** Caso de uso: decisión de precio */
  async strategyPricing(currentData: { price: number; conversionRate: number; revenue: number; demand: "high" | "medium" | "low" }, tenantId?: number): Promise<ReasoningResult> {
    return this.reason({
      situation: "Optimizar estrategia de precios",
      data: { currentPrice: currentData.price, conversionRate: currentData.conversionRate, monthlyRevenue: currentData.revenue, demand: currentData.demand },
      constraints: ["No perder posicionamiento premium"],
      goals: ["Maximizar revenue sin sacrificar volumen"],
      tenantId,
    });
  }
}

export const architectReasoner = new ArchitectReasoner();
