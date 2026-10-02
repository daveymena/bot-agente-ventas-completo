import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "dummy-key";

export const openai = new OpenAI({
  apiKey,
  baseURL,
});

/**
 * Imagen con Ollama (modelos x/imagegen: z-image-turbo, flux2-klein).
 *
 * POST nativo /api/generate devuelve el PNG en base64 (campo `image`).
 * Funciona contra un daemon local (OLLAMA_LOCAL_URL) y se intenta también
 * contra la nube; si el endpoint no existe o el modelo no está, devuelve
 * null rapidito y el llamador cae a su siguiente proveedor. Nunca lanza.
 */
export async function ollamaImageBase64(
  prompt: string,
  opts: { base?: string; model?: string; apiKey?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  try {
    const base = String(opts.base || process.env.OLLAMA_LOCAL_URL || "").replace(/\/+$/, "").replace(/\/v1$/, "");
    if (!base) return null;
    const model = String(opts.model || process.env.OLLAMA_IMAGE_MODEL || "x/z-image-turbo").trim();
    if (!model) return null;
    const r = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}) },
      body: JSON.stringify({ model, prompt: String(prompt).slice(0, 2000), stream: false }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60000),
    });
    if (!r.ok) return null;
    const j: any = await r.json().catch(() => null);
    const b64 = String(j?.image || j?.images?.[0] || "");
    return /^[A-Za-z0-9+/=]+$/.test(b64) && b64.length > 1000 ? b64 : null;
  } catch {
    return null;
  }
}

export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  // Ollama PRIMERO (gratis/local/nube Pro): fotos de producto y creativos
  // para landings sin gastar DALL-E.
  const b64 = await ollamaImageBase64(prompt);
  if (b64) return Buffer.from(b64, "base64");
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
  });
  const base64 = response?.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response?.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
