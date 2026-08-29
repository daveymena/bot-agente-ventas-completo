/**
 * MARKETING TEAM — MarketingStrategist (MASTER PLAN §6)
 * 
 * Convierte un objetivo empresarial en un plan de marketing: objetivo,
 * producto, público, propuesta, ángulos, canales, experimentos, presupuesto,
 * KPIs y plan de optimización. NO ejecuta cambios peligrosos directamente:
 * produce un plan que el orquestador reparte entre los agentes.
 */

import type { AgentHandoff } from "../types";
import { callMarketingAI } from "../ai";
import type { ProductInfo, ResearchResult } from "./market-researcher";
import type { AudienceResult } from "./audience-strategist";
import type { OfferAnalysis } from "./offer-strategist";
import type { CreativeBrief } from "./creative-director";
import {
  EVENTOS_PARA_SALIR_DE_APRENDIZAJE,
  VENTANA_APRENDIZAJE_DIAS,
  MAX_ESCALADA_PORCENTAJE,
  HORAS_ENTRE_CAMBIOS,
  MULTIPLO_DE_GASTO_SIN_VENTAS,
  DIAS_DE_CPA_ALTO_PARA_CORTAR,
  SUBIDA_CPA_QUE_PREOCUPA,
} from "../../reglas-de-pauta";

export interface MarketingPlan {
  objetivo: string;
  producto: string;
  publico: string;
  propuestaDeValor: string;
  angulos: string[];
  canales: string[];
  experimentos: string[];
  presupuestoSugerido: { diario?: number; total?: number; moneda: string };
  kpis: string[];
  planDeOptimizacion: string[];
  riesgos: string[];
}

export async function marketingStrategy(
  input: {
    businessObjective: string;
    product: ProductInfo;
    research?: ResearchResult;
    audience?: AudienceResult;
    offer?: OfferAnalysis;
    creative?: CreativeBrief;
    budget?: { daily?: number; total?: number; currency?: string };
    historical?: string[];
    tenantId?: number;
  },
): Promise<AgentHandoff<MarketingPlan>> {
  const { product, research, audience, offer, creative, budget, businessObjective } = input;
  const currency = budget?.currency || product.currency || "COP";

  const fallback: MarketingPlan = {
    objetivo: businessObjective || `Hacer crecer la venta de ${product.name}`,
    producto: product.name,
    publico: audience?.segments?.[0]?.name || "Público interesado en la categoría (validar con prueba)",
    propuestaDeValor: offer?.fortalezas?.[0] || `Obtener ${product.name} de forma rápida y segura`,
    angulos: research?.angulos?.slice(0, 3) || creative?.concepts?.map((c) => c.angulo).slice(0, 3) || ["Beneficio principal", "Confianza", "Oferta clara"],
    canales: ["Meta Ads (Instagram + Facebook)", "WhatsApp (bot de ventas existente)"],
    experimentos: [
      "Test A/B de 3 ángulos con presupuesto de prueba",
      "Test de oferta: con vs sin garantía/bono",
    ],
    presupuestoSugerido: {
      diario: budget?.daily,
      total: budget?.total,
      moneda: currency,
    },
    kpis: ["CTR", "CPC", "Leads", "Conversaciones", "Ventas", "CPA real", "ROAS real"],
    // El plan sigue las reglas reales de compra de medios, no una intuición.
    // Decía "máx. 30% por paso", y un 30% RESETEA la fase de aprendizaje de
    // Meta: ese consejo, aplicado, tiraba abajo lo aprendido en cada escalada.
    // Los números salen de `reglas-de-pauta.ts`, que los tiene en un solo
    // lugar y probados.
    planDeOptimizacion: [
      `Semana 1-2: probar ángulos con presupuesto bajo. NO tocar nada hasta las `
        + `${EVENTOS_PARA_SALIR_DE_APRENDIZAJE} conversiones en ${VENTANA_APRENDIZAJE_DIAS} días: antes de eso `
        + `lo que se ve es el algoritmo tanteando, no rendimiento real.`,
      `Semana 3: escalar el ganador ${MAX_ESCALADA_PORCENTAJE}% por paso, con ${HORAS_ENTRE_CAMBIOS} h entre pasos. `
        + `Más que eso reinicia el aprendizaje y hay que volver a empezar.`,
      "Semana 4: renovar creativos antes de fatiga; revisar calidad de leads con ventas.",
      `Cortar sin esperar si gasta ${MULTIPLO_DE_GASTO_SIN_VENTAS}x el presupuesto diario sin una sola conversión, `
        + `o si el costo por resultado lleva ${DIAS_DE_CPA_ALTO_PARA_CORTAR} días seguidos más de `
        + `${SUBIDA_CPA_QUE_PREOCUPA}% por encima del objetivo.`,
    ],
    riesgos: ["Gasto sin atribución real", "Fatiga creativa", "Oferta poco diferenciada"],
  };

  const aiResult = await callMarketingAI<Partial<MarketingPlan>>({
    tenantId: input.tenantId,
    json: true,
    systemPrompt: `Eres el MarketingStrategist de un equipo de marketing. Convertís un objetivo empresarial en un plan de marketing profesional.
Respondés SOLO JSON con:
{"objetivo": string, "producto": string, "publico": string, "propuestaDeValor": string, "angulos": string[], "canales": string[], "experimentos": string[], "presupuestoSugerido": {"diario"?: number, "total"?: number, "moneda": string}, "kpis": string[], "planDeOptimizacion": string[], "riesgos": string[]}
El plan debe ser accionable y honesto: sin prometer resultados garantizados.`,
    userPrompt: `Objetivo del negocio: ${businessObjective}
Producto: ${product.name} — ${product.description?.slice(0, 200) || ""} — precio ${product.price ? `${currency} ${product.price}` : "no definido"}
Investigación: ${research ? JSON.stringify({ problema: research.problemaPrincipal, angulos: research.angulos, objeciones: research.objeciones }) : "ninguna"}
Audiencias: ${audience ? JSON.stringify(audience.segments.map((s) => s.name)) : "ninguna"}
Oferta: ${offer ? JSON.stringify({ fortalezas: offer.fortalezas, debilidades: offer.debilidades }) : "ninguna"}
Creativos: ${creative ? JSON.stringify(creative.concepts.map((c) => c.angulo)) : "ninguna"}
Presupuesto disponible: ${budget ? `${currency} ${budget.daily ?? "?"}/día` : "no definido"}
Histórico: ${input.historical?.join(" | ") || "ninguno"}

Generá el plan de marketing.`,
  });

  const data: MarketingPlan = {
    objetivo: aiResult?.objetivo || fallback.objetivo,
    producto: aiResult?.producto || fallback.producto,
    publico: aiResult?.publico || fallback.publico,
    propuestaDeValor: aiResult?.propuestaDeValor || fallback.propuestaDeValor,
    angulos: aiResult?.angulos?.length ? aiResult.angulos.slice(0, 4) : fallback.angulos,
    canales: aiResult?.canales?.length ? aiResult.canales.slice(0, 4) : fallback.canales,
    experimentos: aiResult?.experimentos?.length ? aiResult.experimentos.slice(0, 4) : fallback.experimentos,
    presupuestoSugerido: {
      diario: aiResult?.presupuestoSugerido?.diario ?? budget?.daily,
      total: aiResult?.presupuestoSugerido?.total ?? budget?.total,
      moneda: aiResult?.presupuestoSugerido?.moneda || currency,
    },
    kpis: aiResult?.kpis?.length ? aiResult.kpis.slice(0, 8) : fallback.kpis,
    planDeOptimizacion: aiResult?.planDeOptimizacion?.length ? aiResult.planDeOptimizacion.slice(0, 5) : fallback.planDeOptimizacion,
    riesgos: aiResult?.riesgos?.length ? aiResult.riesgos.slice(0, 5) : fallback.riesgos,
  };

  return {
    agent: "MarketingStrategist",
    domain: "marketing",
    kind: "StrategyResult",
    data,
    summary: `Plan de marketing para "${product.name}": ${data.angulos.length} ángulos, ${data.experimentos.length} experimentos, ${data.kpis.length} KPIs.`,
    createdAt: new Date().toISOString(),
  };
}
