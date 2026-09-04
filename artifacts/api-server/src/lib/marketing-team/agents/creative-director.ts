/**
 * MARKETING TEAM — CreativeDirector (MASTER PLAN §10)
 * 
 * Desarrolla conceptos, hooks, formatos, ideas visuales y guiones; produce
 * VARIAS variantes (no un creativo único) para poder testear. También
 * identifica fatiga creativa cuando se le pasa el historial de uso.
 */

import type { AgentHandoff } from "../types";
import { callMarketingAI } from "../ai";
import type { ProductInfo } from "./market-researcher";
import type { ResearchResult } from "./market-researcher";

export interface CreativeConcept {
  nombre: string;
  angulo: string;
  hook: string;
  formato: "video" | "imagen" | "carrusel";
  ideaVisual: string;
  guionCorto?: string;
  porQuePuedeFuncionar: string;
}

export interface CreativeBrief {
  concepts: CreativeConcept[];
  recomendaciones: string[];
  senalesDeFatiga: string[];
}

export async function creativeDirection(
  input: {
    product: ProductInfo;
    research?: ResearchResult;
    tenantId?: number;
    existingAngles?: string[];
    exposureSignals?: { ctrDown?: boolean; frequencyUp?: boolean };
  },
): Promise<AgentHandoff<CreativeBrief>> {
  const { product, research } = input;
  const fallbackAngles = research?.angulos?.length
    ? research.angulos.slice(0, 4)
    : ["Resultados reales", "Sin complicaciones", "Empieza hoy", "Para todos los niveles"];

  const fallback: CreativeBrief = {
    concepts: fallbackAngles.map((angulo, i) => ({
      nombre: `Concepto ${i + 1} — ${angulo.split(" ").slice(0, 3).join(" ")}`,
      angulo,
      hook: angulo,
      formato: (["video", "imagen", "carrusel"] as const)[i % 3]!,
      ideaVisual: `Visual limpio centrado en ${product.name}, con el beneficio "${angulo}" como texto principal.`,
      guionCorto: `Abre con "${angulo}". 3 beneficios puntuales. CTA claro al final.`,
      porQuePuedeFuncionar: `Ataca directamente el ángulo ${i + 1} de la investigación: ${angulo.toLowerCase()}.`,
    })),
    recomendaciones: [
      "Probar 3 conceptos distintos en paralelo (no 3 variaciones del mismo).",
      "Cada concepto debe diferenciarse en el HOOK (primera línea), que es lo que decide el clic.",
      "Renovar creativos antes de que la frecuencia supere ~2.5 para evitar fatiga.",
    ],
    senalesDeFatiga: input.exposureSignals?.ctrDown || input.exposureSignals?.frequencyUp
      ? ["CTR en caída o frecuencia alta: compatible con fatiga creativa — preparar conceptos nuevos."]
      : [],
  };

  const aiResult = await callMarketingAI<Partial<CreativeBrief>>({
    tenantId: input.tenantId,
    json: true,
    systemPrompt: `Eres el CreativeDirector de un equipo de marketing. Creás conceptos publicitarios (hooks, formatos, ideas visuales, guiones) para testear.
Respondés SOLO JSON con:
{"concepts": [{"nombre": string, "angulo": string, "hook": string, "formato": "video|imagen|carrusel", "ideaVisual": string, "guionCorto"?: string, "porQuePuedeFuncionar": string}], "recomendaciones": string[], "senalesDeFatiga": string[]}
Cada concepto debe tener un hook DISTINTO. Sin datos de exposición, no afirmar fatiga creativa.`,
    userPrompt: `Producto: ${product.name}
Descripción: ${product.description || "(sin descripción)"}
Investigación: ${research ? JSON.stringify({ angulos: research.angulos, problema: research.problemaPrincipal }) : "ninguna"}
Ángulos ya usados: ${input.existingAngles?.join(", ") || "ninguno"}
Señales de exposición: ${JSON.stringify(input.exposureSignals ?? {})}

Generá el brief creativo.`,
  });

  const data: CreativeBrief = {
    concepts: aiResult?.concepts?.length ? aiResult.concepts.slice(0, 5) : fallback.concepts,
    recomendaciones: aiResult?.recomendaciones?.length ? aiResult.recomendaciones.slice(0, 4) : fallback.recomendaciones,
    senalesDeFatiga: aiResult?.senalesDeFatiga?.length ? aiResult.senalesDeFatiga.slice(0, 3) : fallback.senalesDeFatiga,
  };

  return {
    agent: "CreativeDirector",
    domain: "marketing",
    kind: "CreativeBrief",
    data,
    summary: `Brief creativo para "${product.name}": ${data.concepts.length} conceptos para testear.`,
    createdAt: new Date().toISOString(),
  };
}
