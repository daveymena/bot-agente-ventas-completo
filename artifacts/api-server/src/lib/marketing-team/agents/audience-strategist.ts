/**
 * MARKETING TEAM — AudienceStrategist (MASTER PLAN §8)
 * 
 * Define públicos y segmentaciones: prospecting, remarketing, audiencias de
 * prueba, exclusiones e hipótesis de audiencia. Regla: NUNCA asumir que una
 * audiencia es ganadora sin datos — cada segmento sale con una hipótesis
 * testeable, y la calidad del lead se mide contra la conversión real.
 */

import type { AgentHandoff } from "../types";
import { callMarketingAI } from "../ai";
import type { ResearchResult } from "./market-researcher";

export interface AudienceSegment {
  name: string;
  type: "prospecting" | "remarketing" | "lookalike" | "exclusion";
  description: string;
  hypothesis: string;
  suggestedInterests?: string[];
}

export interface AudienceResult {
  segments: AudienceSegment[];
  recomendaciones: string[];
}

export async function audienceStrategy(
  input: {
    product: { name: string; category?: string; price?: number; currency?: string };
    research?: ResearchResult;
    tenantId?: number;
  },
): Promise<AgentHandoff<AudienceResult>> {
  const { product, research } = input;
  const fallback: AudienceResult = {
    segments: [
      {
        name: "Prospecting — interesados en la categoría",
        type: "prospecting",
        description: `Personas interesadas en ${product.category || "productos similares"} que aún no conocen la marca. Audiencia amplia de prueba con presupuesto bajo.`,
        hypothesis: "El mensaje basado en el beneficio principal genera clics de calidad (no curiosos).",
      },
      {
        name: "Remarketing — visitantes y conversaciones abiertas",
        type: "remarketing",
        description: "Quienes ya interactuaron con el bot o la tienda y no compraron. Mensaje de seguimiento con prueba social.",
        hypothesis: "El remarketing recupera leads tibios con un costo por venta menor al prospecting.",
      },
      {
        name: "Exclusión — compradores recientes",
        type: "exclusion",
        description: "Clientes que compraron el producto en los últimos 60 días: no gastar presupuesto en ellos.",
        hypothesis: "Evitar mostrar el mismo producto a quien ya lo compró reduce gasto desperdiciado.",
      },
    ],
    recomendaciones: [
      "Empezar con 1-2 audiencias de prospecting + 1 remarketing, con presupuesto de prueba.",
      "No escalar ninguna audiencia antes de tener muestra suficiente (impresiones y conversiones).",
      "Medir calidad del lead por conversión a venta, no por clics.",
    ],
  };

  const aiResult = await callMarketingAI<Partial<AudienceResult>>({
    tenantId: input.tenantId,
    json: true,
    systemPrompt: `Eres el AudienceStrategist de un equipo de marketing. Definís públicos y segmentaciones para Meta Ads.
Respondés SOLO JSON con:
{"segments": [{"name": string, "type": "prospecting|remarketing|lookalike|exclusion", "description": string, "hypothesis": string, "suggestedInterests"?: string[]}], "recomendaciones": string[]}
Sin inventar intereses falsos de Facebook: si sugerís intereses, que sean razonables para la categoría. Máximo 5 segmentos.`,
    userPrompt: `Producto: ${product.name}
Categoría: ${product.category || "general"}
Precio: ${product.price ? `${product.currency || "COP"} ${product.price}` : "no definido"}
Investigación disponible: ${research ? JSON.stringify({ problema: research.problemaPrincipal, angulos: research.angulos, objeciones: research.objeciones }) : "ninguna"}

Generá la estrategia de audiencias.`,
  });

  const data: AudienceResult = {
    segments: aiResult?.segments?.length ? aiResult.segments.slice(0, 5) : fallback.segments,
    recomendaciones: aiResult?.recomendaciones?.length ? aiResult.recomendaciones.slice(0, 5) : fallback.recomendaciones,
  };

  return {
    agent: "AudienceStrategist",
    domain: "marketing",
    kind: "AudienceStrategy",
    data,
    summary: `Estrategia de audiencias para "${product.name}": ${data.segments.length} segmentos.`,
    createdAt: new Date().toISOString(),
  };
}
