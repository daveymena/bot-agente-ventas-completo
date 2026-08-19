/**
 * MARKETING TEAM — MarketResearcher (MASTER PLAN §7)
 * 
 * Investiga mercado y cliente: problema principal, deseo, objeciones,
 * oportunidad y ángulos accionables. Produce información accionable
 * (ResearchResult), no un informe genérico. Usa IA cuando hay proveedor
 * configurado; si no, genera una investigación estructurada a partir del
 * producto real (descripción, características, precio) sin inventar datos.
 */

import type { AgentHandoff } from "../types";
import { callMarketingAI } from "../ai";

export interface ProductInfo {
  id?: number;
  name: string;
  description: string;
  price?: number;
  currency?: string;
  category?: string;
  features?: string[];
  imageUrl?: string | null;
}

export interface ResearchResult {
  problemaPrincipal: string;
  deseo: string;
  objeciones: string[];
  oportunidad: string;
  angulos: string[];
  lenguajeDelMercado: string[];
  hipotesis: string[];
}

const FALLBACK_ANGLE_BY_CATEGORY: Record<string, string[]> = {
  courses: ["Aprende desde cero", "Cumple el sueño de ...", "Aprende a tu ritmo", "Empieza sin experiencia"],
  digital_products: ["Acceso inmediato", "Todo en un solo lugar", "Ahorra tiempo y dinero", "Listo para usar hoy"],
  dropshipping: ["Envío rápido y seguro", "El regalo perfecto", "Calidad que se nota", "Oferta por tiempo limitado"],
  services: ["Resultados profesionales", "Acompañamiento de expertos", "Plan a tu medida", "Empieza esta semana"],
  telecom: ["Velocidad real", "Cobertura donde estás", "Sin letra pequeña", "Plan simple y claro"],
  general: ["Resultados visibles", "Sin complicaciones", "Hecho para ti", "Empieza hoy"],
};

export function buildResearchFallback(product: ProductInfo): ResearchResult {
  const cat = (product.category || "general").toLowerCase();
  const desc = (product.description || "").trim();
  const name = product.name || "";
  const precio = product.price ? `$${product.price.toLocaleString("es-CO")}` : "precio accesible";
  const problema = desc
    ? `Sin ${name.toLowerCase()}, el cliente sigue perdiendo tiempo y dinero con soluciones genéricas que no resuelven su problema real.`
    : `El cliente no encuentra una solución clara y confiable para su necesidad.`;
  const deseo = `Conseguir ${name.toLowerCase()} de forma rápida, segura y al mejor precio, sin complicaciones ni sorpresas.`;

  const bases = FALLBACK_ANGLE_BY_CATEGORY[cat] ?? FALLBACK_ANGLE_BY_CATEGORY.general!;
  const angulos = bases.map((b) => b.replace("...", name.split(" ")[0] || "tu objetivo"));

  return {
    problemaPrincipal: problema,
    deseo,
    objeciones: [
      "No sé si es confiable",
      "Quiero saber más antes de pagar",
      `¿Vale la pena ${precio}?`,
      "Necesito comparar opciones",
    ],
    oportunidad: `El mercado busca ${name.toLowerCase()} pero encuentra ofertas genéricas; hay espacio para un mensaje claro y honesto sobre este producto específico.`,
    angulos,
    lenguajeDelMercado: ["rápido", "seguro", "fácil", "garantizado", "ahora"],
    hipotesis: [
      `Un mensaje centrado en el beneficio principal de ${name} convierte mejor que uno genérico.`,
      "Los clientes responden mejor a prueba social y garantía que a urgencia artificial.",
    ],
  };
}

export async function marketResearch(
  product: ProductInfo,
  opts?: { tenantId?: number; previousLearnings?: string[] },
): Promise<AgentHandoff<ResearchResult>> {
  const fallback = buildResearchFallback(product);

  const aiResult = await callMarketingAI<Partial<ResearchResult>>({
    tenantId: opts?.tenantId,
    json: true,
    systemPrompt: `Eres el MarketResearcher de un equipo de marketing. Investigás mercado y cliente para un producto concreto.
Reglas: solo usás la información del producto que te dan (nunca inventás datos, precios, ni marcas). Respondés SOLO JSON con:
{"problemaPrincipal": string, "deseo": string, "objeciones": string[], "oportunidad": string, "angulos": string[], "lenguajeDelMercado": string[], "hipotesis": string[]}
Usás lenguaje del mercado hispano (país del negocio). Ángulos cortos y concretos.`,
    userPrompt: `Producto: ${product.name}
Descripción: ${product.description || "(sin descripción)"}
Precio: ${product.price ? `${product.currency || "COP"} ${product.price}` : "no definido"}
Categoría: ${product.category || "general"}
Características: ${(product.features || []).join(", ") || "sin listar"}
Aprendizajes previos: ${opts?.previousLearnings?.join(" | ") || "ninguno"}

Generá la investigación accionable.`,
  });

  const data: ResearchResult = {
    problemaPrincipal: aiResult?.problemaPrincipal || fallback.problemaPrincipal,
    deseo: aiResult?.deseo || fallback.deseo,
    objeciones: aiResult?.objeciones?.length ? aiResult.objeciones.slice(0, 6) : fallback.objeciones,
    oportunidad: aiResult?.oportunidad || fallback.oportunidad,
    angulos: aiResult?.angulos?.length ? aiResult.angulos.slice(0, 6) : fallback.angulos,
    lenguajeDelMercado: aiResult?.lenguajeDelMercado?.length ? aiResult.lenguajeDelMercado.slice(0, 8) : fallback.lenguajeDelMercado,
    hipotesis: aiResult?.hipotesis?.length ? aiResult.hipotesis.slice(0, 5) : fallback.hipotesis,
  };

  return {
    agent: "MarketResearcher",
    domain: "marketing",
    kind: "ResearchResult",
    data,
    summary: `Investigación de mercado para "${product.name}": ${data.angulos.length} ángulos, ${data.objeciones.length} objeciones, ${data.hipotesis.length} hipótesis.`,
    createdAt: new Date().toISOString(),
  };
}
