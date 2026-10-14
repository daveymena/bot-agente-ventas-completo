/**
 * IA opcional (cualquier API compatible con OpenAI: OpenAI, Groq, DeepSeek,
 * OpenRouter, Ollama…). Sin clave, todo responde `null` y la interfaz lo
 * explica; nada de la plataforma depende de esto para funcionar.
 *
 *  - Etiquetado automático al subir (título, descripción, palabras clave es+en,
 *    categoría, personas) — el equivalente al auto-keywording de Adobe Stock.
 *  - Generación de imágenes a partir de texto ("Generar" del buscador).
 *  - Descripción de una imagen para la búsqueda visual.
 */
import { config } from "../config";

export const aiEnabled = () => !!config.ai.apiKey;

interface ChatOpts { model?: string; json?: boolean; maxTokens?: number; timeoutMs?: number }

async function chat(messages: any[], opts: ChatOpts = {}): Promise<string | null> {
  if (!aiEnabled()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
  try {
    const r = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.ai.apiKey}` },
      body: JSON.stringify({
        model: opts.model || config.ai.textModel, messages, temperature: 0.4, max_tokens: opts.maxTokens ?? 700,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!r.ok) { console.warn(`[stock/ai] ${r.status}: ${(await r.text()).slice(0, 200)}`); return null; }
    const j: any = await r.json();
    return j.choices?.[0]?.message?.content ?? null;
  } catch (e: any) {
    console.warn(`[stock/ai] fallo: ${e?.message || e}`);
    return null;
  } finally { clearTimeout(t); }
}

function parseJsonLoose<T>(s: string | null): T | null {
  if (!s) return null;
  const m = s.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : s) as T; } catch { return null; }
}

export interface AutoTags {
  title: string; description: string; keywords: string[]; category: string | null;
  hasPeople: boolean; peopleCount: number; editorialHint: boolean; matureHint: boolean;
}

const TAG_PROMPT = `Sos el sistema de etiquetado de un banco de imágenes (como Adobe Stock). Describís la imagen para que un comprador la encuentre.
Devolvé SOLO JSON con esta forma:
{"title":"título descriptivo de 6 a 14 palabras en español, sin punto final",
 "description":"una frase de 15 a 30 palabras en español",
 "keywords":["25 a 40 palabras clave: primero las 10 más importantes; mitad en español y mitad en inglés; minúsculas; sin duplicados; sin marcas registradas"],
 "category":"una de: animales, arquitectura, negocios, bebidas, medio-ambiente, estados-de-animo, comida, diseno-grafico, aficiones-y-ocio, industria, paisajes, estilo-de-vida, personas, plantas-y-flores, cultura-y-religion, ciencia, social, deportes, tecnologia, transporte, viajes, fondos",
 "hasPeople":true/false,"peopleCount":0,"editorialHint":false,"matureHint":false}
editorialHint=true si hay logos, marcas, famosos o eventos noticiosos. matureHint=true si hay desnudez o violencia.`;

export async function autoTagImage(imageDataUrl: string, hint?: string): Promise<AutoTags | null> {
  const content: any[] = [{ type: "text", text: hint ? `Contexto del colaborador: ${hint}` : "Etiquetá esta imagen." }, { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } }];
  const out = await chat([{ role: "system", content: TAG_PROMPT }, { role: "user", content }], { model: config.ai.visionModel, json: true, maxTokens: 900 });
  const j = parseJsonLoose<AutoTags>(out);
  if (!j || !Array.isArray(j.keywords)) return null;
  return {
    title: String(j.title || "").slice(0, 140), description: String(j.description || "").slice(0, 500),
    keywords: j.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 49),
    category: j.category ? String(j.category) : null, hasPeople: !!j.hasPeople, peopleCount: Number(j.peopleCount) || 0,
    editorialHint: !!j.editorialHint, matureHint: !!j.matureHint,
  };
}

export async function autoTagFromText(text: string): Promise<AutoTags | null> {
  const out = await chat([{ role: "system", content: TAG_PROMPT.replace("Describís la imagen", "Describís el archivo a partir de su nombre y descripción") }, { role: "user", content: `Archivo: ${text}` }], { json: true, maxTokens: 700 });
  const j = parseJsonLoose<AutoTags>(out);
  if (!j || !Array.isArray(j.keywords)) return null;
  return { ...j, keywords: j.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 49), peopleCount: Number(j.peopleCount) || 0 };
}

export async function describeForSearch(imageDataUrl: string): Promise<string[] | null> {
  const out = await chat([
    { role: "system", content: `Devolvé SOLO JSON {"keywords":[...]} con 12 palabras clave (español e inglés mezclados, minúsculas) que describan el contenido principal, el estilo y los colores de la imagen para buscar imágenes parecidas en un banco de imágenes.` },
    { role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl, detail: "low" } }] },
  ], { model: config.ai.visionModel, json: true, maxTokens: 300 });
  const j = parseJsonLoose<{ keywords: string[] }>(out);
  return j?.keywords?.map((k) => String(k).toLowerCase()) ?? null;
}

export interface GeneratedImage { buffer: Buffer; model: string; revisedPrompt?: string }

export async function generateImage(prompt: string, size: "1024x1024" | "1536x1024" | "1024x1536" = "1024x1024"): Promise<GeneratedImage | null> {
  if (!aiEnabled()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const model = config.ai.imageModel;
    const body: any = { model, prompt, n: 1, size };
    if (/dall-e/i.test(model)) body.response_format = "b64_json"; else body.quality = "medium";
    const r = await fetch(`${config.ai.baseUrl}/images/generations`, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.ai.apiKey}` }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j: any = await r.json();
    const d = j.data?.[0];
    if (!d) return null;
    let buffer: Buffer;
    if (d.b64_json) buffer = Buffer.from(d.b64_json, "base64");
    else if (d.url) { const ir = await fetch(d.url); buffer = Buffer.from(await ir.arrayBuffer()); }
    else return null;
    return { buffer, model, revisedPrompt: d.revised_prompt };
  } finally { clearTimeout(t); }
}
