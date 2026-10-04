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

const ESCENAS = [
  {
    id: "sofia", w: 1200, h: 1400, size: "1024x1536",
    prompt: "A large modern smartphone mockup centered showing a warm friendly chat conversation between an AI sales assistant and a customer buying an online piano course, with a piano course image card and green checkmark icons, soft emerald green gradient background with subtle dot grid. IMPORTANT: absolutely no text, no words, no letters, no numbers, no readable characters anywhere — chat bubbles and UI placeholders must be blank. Clean premium SaaS style, soft shadows, no logos, no watermarks.",
  },
  {
    id: "atlas-web", w: 1600, h: 1000, size: "1536x1024",
    prompt: "A laptop browser window mockup showing a marketing campaign dashboard with a social media ad preview, audience panel and performance chart, violet and indigo gradient background with subtle dot grid. IMPORTANT: absolutely no text, no words, no letters, no numbers, no readable characters anywhere — all labels and UI text must be blank placeholders or plain bars. Clean premium SaaS style, soft shadows, no logos, no watermarks.",
  },
];

for (const e of ESCENAS) {
  process.stdout.write(`Generando ${e.id}... `);
  try {
    const buf = await generar(e.size, e.prompt);
    const out = await sharp(buf).resize(e.w, e.h, { fit: "cover", position: "attention" }).webp({ quality: 88 }).toBuffer();
    writeFileSync(resolve(outDir, `${e.id}.webp`), out);
    console.log(`OK ${e.w}x${e.h} (${out.length} bytes)`);
  } catch (err) {
    console.log(`FALLO: ${err.message}`);
  }
}
console.log("Listo.");
