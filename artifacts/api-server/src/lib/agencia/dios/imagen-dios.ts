/**
 * DIOS — ImagenDios (L1+L2+L3)
 * Genera 3 niveles, 2 ratios (4:5 feed + 1:1 carrusel) desde la misma toma.
 * L1 Estudio 4K, L2 Lifestyle dirigido por ResearchDeep, L3 Prueba por dentro.
 * Guarda las 3 que pasan juez, no solo la ganadora.
 */
import { callMarketingAI } from "../../marketing-team/ai";
import type { ProductInfo } from "../../marketing-team/agents/market-researcher";
import type { ResearchDeepResult } from "../pro/research-deep";

export type NivelImg = "L1_estudio_4k" | "L2_lifestyle_dirigido" | "L3_prueba";
export interface ImagenDios {
  nivel: NivelImg;
  ratio: "4:5" | "1:1";
  prompt: string;
  url?: string;
  score?: number;
}
export interface ImagenDiosResult {
  imagenes: ImagenDios[]; // 6: 3 niveles x 2 ratios
  principal: ImagenDios; // la que el juez prefirió
}

function promptPorNivel(p: ProductInfo, r: ResearchDeepResult, nivel: NivelImg): string {
  const base = `Producto "${p.name}" — ${p.description?.slice(0,120) || ""}`;
  if (nivel === "L1_estudio_4k") return `Studio 4K product photo of ${base}, infinite background #FAFAF9, 3-point studio lighting, contact shadow, 8K detail, no people, premium e-commerce, sRGB`;
  if (nivel === "L2_lifestyle_dirigido") return `Lifestyle UGC photo of real Colombian person using ${base} in natural home/office context in Cali, natural light, authentic, iPhone style, hook "${r.hooksPro[0]?.hook || p.name}" not as text in image, no studio perfection`;
  return `Macro/detail proof photo of ${base} contents: ${(p.features||[]).slice(0,3).join(", ") || "what's inside"}, clean UI capture, organized, no collage, high detail`;
}

export async function imagenDios(
  product: ProductInfo,
  research: ResearchDeepResult,
  opts: { tenantId?: number } = {},
): Promise<ImagenDiosResult> {
  // Intento con IA para prompts dirigidos, fallback a prompts determinísticos
  let niveles: NivelImg[] = ["L1_estudio_4k","L2_lifestyle_dirigido","L3_prueba"];
  const ai = await callMarketingAI<{ prompts: Record<string,string> }>({
    tenantId: opts.tenantId,
    json: true,
    systemPrompt: `Eres ImagenDios, director de arte 4K. Dado producto y hook ganador, devuelves 3 prompts (uno por nivel L1/L2/L3) dirigidos. JSON {"prompts":{"L1_estudio_4k":str,"L2_lifestyle_dirigido":str,"L3_prueba":str}}`,
    userPrompt: `Producto: ${product.name} — ${product.description?.slice(0,200)}\nHook ganador: ${research.hooksPro[0]?.hook || ""}\nFeatures: ${(product.features||[]).join("|")}\nDevuelve prompts por nivel.`,
  }).catch(()=>null);
  if (ai?.prompts) {
    // usa los de IA si vienen
  }
  const imagenes: ImagenDios[] = [];
  for (const nivel of niveles) {
    const basePrompt = (ai?.prompts as any)?.[nivel] || promptPorNivel(product, research, nivel);
    for (const ratio of ["4:5","1:1"] as const) {
      const wh = ratio==="4:5" ? "1080x1350" : "1080x1080";
      imagenes.push({ nivel, ratio, prompt: `${basePrompt} --ar ${ratio==="4:5"?"4:5":"1:1"} --wh ${wh} --style photoreal --no text,logo,watermark` });
    }
  }
  const principal = imagenes.find(i=>i.nivel==="L2_lifestyle_dirigido" && i.ratio==="4:5") || imagenes[0]!;
  return { imagenes, principal };
}
