/**
 * MARKETING TEAM — OfferStrategist (MASTER PLAN §9)
 * 
 * Analiza la oferta: precio, beneficios, garantías, bonos, urgencia,
 * diferenciación y objeciones. Si hay buen tráfico pero mala conversión,
 * plantea que el problema puede estar en la oferta, no en la campaña.
 */

import type { AgentHandoff } from "../types";
import { callMarketingAI } from "../ai";
import type { ProductInfo } from "./market-researcher";

export interface OfferAnalysis {
  fortalezas: string[];
  debilidades: string[];
  riesgoDeOferta: string | null;
  recomendaciones: string[];
  garantiaSugerida: string | null;
}

export function buildOfferFallback(product: ProductInfo): OfferAnalysis {
  const name = product.name || "";
  const price = product.price ? Number(product.price) : 0;
  const currency = (product.currency || "COP").toUpperCase();
  const features = product.features || [];

  return {
    fortalezas: [
      features.length >= 2
        ? `Beneficios claros: ${features.slice(0, 3).join(", ")}`
        : `Propuesta enfocada: ${name}`,
      price > 0 ? `Precio definido (${currency} ${price.toLocaleString("es-CO")}) — reduce fricción.` : "Precio a consultar (puede generar conversación, pero también fricción).",
      "Entrega inmediata para productos digitales.",
    ],
    debilidades: [
      "Sin garantía explícita visible en el mensaje.",
      "Sin diferenciación clara frente a alternativas genéricas.",
      "Urgencia ausente o artificial.",
    ],
    riesgoDeOferta: null,
    recomendaciones: [
      "Mostrar la garantía o política de cambio de forma explícita.",
      "Reforzar la diferenciación: por qué este y no otro.",
      "Probar 1-2 bonos o condiciones para mejorar conversión antes de tocar el precio.",
    ],
    garantiaSugerida: "Garantía de satisfacción: si no te sirve, te acompañamos o te devolvemos el dinero.",
  };
}

export async function offerStrategy(
  product: ProductInfo,
  opts?: { tenantId?: number; funnel?: { leads?: number; paid?: number } },
): Promise<AgentHandoff<OfferAnalysis>> {
  const fallback = buildOfferFallback(product);

  const aiResult = await callMarketingAI<Partial<OfferAnalysis>>({
    tenantId: opts?.tenantId,
    json: true,
    systemPrompt: `Eres el OfferStrategist de un equipo de marketing. Analizás la OFERTA de un producto (precio, beneficios, garantía, bonos, urgencia, diferenciación, objeciones).
Respondés SOLO JSON con:
{"fortalezas": string[], "debilidades": string[], "riesgoDeOferta": string|null, "recomendaciones": string[], "garantiaSugerida": string|null}
No inventás características que el producto no tenga. Si el tráfico es bueno pero la conversión mala, indicás que el problema puede estar en la oferta.`,
    userPrompt: `Producto: ${product.name}
Descripción: ${product.description || "(sin descripción)"}
Precio: ${product.price ? `${product.currency || "COP"} ${product.price}` : "no definido"}
Categoría: ${product.category || "general"}
Características: ${(product.features || []).join(", ") || "sin listar"}
Embudo actual: ${opts?.funnel ? `leads=${opts.funnel.leads}, ventas=${opts.funnel.paid}` : "sin datos"}

Generá el análisis de la oferta.`,
  });

  const data: OfferAnalysis = {
    fortalezas: aiResult?.fortalezas?.length ? aiResult.fortalezas.slice(0, 5) : fallback.fortalezas,
    debilidades: aiResult?.debilidades?.length ? aiResult.debilidades.slice(0, 5) : fallback.debilidades,
    riesgoDeOferta: aiResult?.riesgoDeOferta ?? fallback.riesgoDeOferta,
    recomendaciones: aiResult?.recomendaciones?.length ? aiResult.recomendaciones.slice(0, 5) : fallback.recomendaciones,
    garantiaSugerida: aiResult?.garantiaSugerida ?? fallback.garantiaSugerida,
  };

  return {
    agent: "OfferStrategist",
    domain: "marketing",
    kind: "OfferAnalysis",
    data,
    summary: `Análisis de oferta para "${product.name}": ${data.fortalezas.length} fortalezas, ${data.debilidades.length} debilidades.`,
    createdAt: new Date().toISOString(),
  };
}
