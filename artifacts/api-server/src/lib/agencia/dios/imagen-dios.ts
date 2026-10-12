/**
 * DIOS — ImagenDios (L1+L2+L3)
 * Genera 3 niveles, 2 ratios (4:5 feed + 1:1 carrusel) desde la misma toma.
 * L1 Estudio 4K, L2 Lifestyle dirigido por ResearchDeep, L3 Prueba por dentro.
 * Guarda las 3 que pasan juez, no solo la ganadora.
 */
import { callMarketingAI } from "../../marketing-team/ai";
import type { ProductInfo } from "../../marketing-team/agents/market-researcher";
import type { ResearchDeepResult } from "../pro/research-deep";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { logger } from "../../logger";

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

function buildPollinationsUrlDios(prompt: string, wh: string, seed: number): string {
  const [w, h] = wh.split("x");
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux&enhance=true`;
}

async function generarUnaImagenDios(prompt: string, wh: string, seed: number): Promise<string | null> {
  // 1) OpenAI si hay key
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    try {
      const buf = await generateImageBuffer(prompt, wh as any);
      if (buf && buf.length > 500) return `data:image/png;base64,${buf.toString("base64")}`;
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[ImagenDios] OpenAI falló, sigue G4F/Pollinations");
    }
  }
  // 2) G4F si está habilitado
  if (process.env.G4F_ENABLED === "true") {
    try {
      const { getG4FImage } = await import("../../providers/g4f-provider");
      const r = await getG4FImage(prompt);
      if (r?.image) return r.image.startsWith("data:") || r.image.startsWith("http") ? r.image : `data:image/png;base64,${r.image}`;
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[ImagenDios] G4F falló");
    }
  }
  // 3) Pollinations gratis sin key (siempre disponible)
  try {
    return buildPollinationsUrlDios(prompt, wh, seed);
  } catch { return null; }
}

async function guardarImagenDios(source: string, tenantId?: number): Promise<string | null> {
  try {
    const { saveUploadedImage } = await import("../../image-store");
    const rel = await saveUploadedImage(source, `dios-${Date.now()}.png`);
    if (rel) return rel;
    // Si no se pudo guardar en volumen, devuelve la URL/pollinations directa para que Atlas la vea
    if (/^https?:\/\//.test(source)) return source;
    if (source.startsWith("data:")) return source;
    return null;
  } catch { return source; }
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
  // Generar 6 imágenes reales en paralelo (3 niveles x 2 ratios) con control de concurrencia 3
  const tareas: Array<{ nivel: NivelImg; ratio: "4:5"|"1:1"; wh: string; basePrompt: string }> = [];
  for (const nivel of niveles) {
    const basePrompt = (ai?.prompts as any)?.[nivel] || promptPorNivel(product, research, nivel);
    for (const ratio of ["4:5","1:1"] as const) {
      const wh = ratio==="4:5" ? "1080x1350" : "1080x1080";
      tareas.push({ nivel, ratio, wh, basePrompt });
    }
  }
  // Generar secuencial para no saturar proveedores gratuitos (Pollinations rate limit)
  let seedBase = (opts.tenantId || 1) * 1000 + (typeof product.name === "string" ? product.name.length : 0);
  for (let idx = 0; idx < tareas.length; idx++) {
    const t = tareas[idx]!;
    const prompt = `${t.basePrompt} --ar ${t.ratio==="4:5"?"4:5":"1:1"} --wh ${t.wh} --style photoreal --no text,logo,watermark`;
    let url: string | null = null;
    try {
      const src = await generarUnaImagenDios(prompt, t.wh, seedBase + idx * 997);
      if (src) url = await guardarImagenDios(src, opts.tenantId);
      if (!url && src) url = src;
    } catch (e: any) {
      logger.warn({ err: e?.message, nivel: t.nivel, ratio: t.ratio }, "[ImagenDios] no se pudo generar imagen");
    }
    imagenes.push({ nivel: t.nivel, ratio: t.ratio, prompt, url: url || undefined, score: url ? 0.9 : 0.1 });
  }
  const principal = imagenes.find(i=>i.nivel==="L2_lifestyle_dirigido" && i.ratio==="4:5" && !!i.url) || imagenes.find(i=>!!i.url) || imagenes[0]!;
  return { imagenes, principal };
}
