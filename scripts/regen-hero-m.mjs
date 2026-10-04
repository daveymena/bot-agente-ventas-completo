import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error("Falta OPENAI_API_KEY"); process.exit(1); }

const aqui = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(aqui, "../artifacts/ventas-pro/public/screens/gen");

async function generar(size, prompt) {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size }),
    signal: AbortSignal.timeout(180000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify(j.error || j)}`);
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Sin b64_json");
  return Buffer.from(b64, "base64");
}

const prompt = "Premium vertical marketing hero for a WhatsApp sales-automation SaaS platform. A single large modern smartphone mockup centered showing a friendly customer chat conversation closing a sale with a clean product photo, glowing indigo and violet gradient background with a subtle dot grid. IMPORTANT: absolutely no text, no words, no letters, no numbers, no readable characters anywhere — blank chat bubbles and blank UI placeholders only. Clean, minimal, high-end SaaS aesthetic, soft shadows, no logos, no watermarks.";

const buf = await generar("1024x1536", prompt);
const out = await sharp(buf).resize(1000, 1250, { fit: "cover", position: "attention" }).webp({ quality: 88 }).toBuffer();
writeFileSync(resolve(outDir, "hero-m.webp"), out);
console.log("hero-m.webp regenerado:", out.length, "bytes");
