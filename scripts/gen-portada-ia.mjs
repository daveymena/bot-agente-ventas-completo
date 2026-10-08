/**
 * OBSOLETO (07-10-2026): estas escenas salían genéricas (teléfonos idénticos,
 * burbujas vacías, precios en dólares, texto en inglés). La portada usa ahora
 * scripts/portada-fotos.mjs (fotos reales + capturas reales).
 *
 * Genera las 7 escenas de la portada (/) con gpt-image-1 (OpenAI) y las
 * convierte a WebP con las dimensiones exactas de public/screens/gen/.
 *
 *   node scripts/gen-portada-ia.mjs
 *
 * La key se pasa por env OPENAI_API_KEY. Cada imagen sale en la relación más
 * cercana que acepta gpt-image-1 (1536x1024 apaisada / 1024x1536 vertical) y
 * luego se recorta/escala con sharp a las dimensiones exactas del asset.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("Falta OPENAI_API_KEY");
  process.exit(1);
}

const aqui = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(aqui, "../artifacts/ventas-pro/public/screens/gen");
mkdirSync(outDir, { recursive: true });

// id: nombre del archivo; w/h finales; ratio (apaisada/vertical); prompt.
const ESCENAS = [
  {
    id: "hero", w: 1600, h: 1100, ratio: "apaisada",
    prompt: "Premium marketing hero for a WhatsApp sales-automation SaaS platform. Three floating modern smartphone mockups at slight angles showing a customer chat conversation with a product photo and price bubble, glowing indigo and violet gradient background with a subtle dot grid pattern fading downward. Clean, minimal, high-end SaaS aesthetic, soft diffused shadows, glassy depth, no readable text, no logos, no watermarks.",
  },
  {
    id: "hero-m", w: 1000, h: 1250, ratio: "vertical",
    prompt: "Premium vertical marketing hero for a WhatsApp sales-automation SaaS platform. A single large modern smartphone mockup centered showing a friendly customer chat conversation closing a sale with a product photo and price, glowing indigo and violet gradient background with a subtle dot grid. Clean, minimal, high-end SaaS aesthetic, soft shadows, no readable text, no logos.",
  },
  {
    id: "sofia", w: 1200, h: 1400, ratio: "vertical",
    prompt: "A large modern smartphone mockup showing a warm WhatsApp conversation between an AI sales assistant and a customer buying an online piano course, with a course image card and checkmarks, soft emerald green gradient background with subtle dot grid. Premium clean SaaS marketing style, friendly and trustworthy, soft shadows, no readable text, no logos.",
  },
  {
    id: "tienda", w: 1200, h: 1400, ratio: "vertical",
    prompt: "A large modern smartphone mockup showing an online storefront with a clean product catalog grid, product photos and a checkout button, soft cyan and teal gradient background with subtle dot grid. Premium clean SaaS marketing style, soft shadows, no readable text, no logos.",
  },
  {
    id: "inbox-web", w: 1600, h: 1000, ratio: "apaisada",
    prompt: "A laptop browser window mockup showing a modern customer conversation inbox dashboard for a WhatsApp sales platform, with a message list and chat preview, soft slate and light gray gradient background with subtle dot grid. Premium clean SaaS marketing style, soft shadows, no readable text, no logos.",
  },
  {
    id: "atlas-duo", w: 1600, h: 1150, ratio: "apaisada",
    prompt: "Split marketing scene: on the left a modern smartphone showing an AI assistant chat that plans a marketing campaign, on the right a laptop showing a generated sales landing page with product photos and a buy button. Violet and indigo gradient background with subtle dot grid, premium clean SaaS style, soft shadows, no readable text, no logos.",
  },
  {
    id: "atlas-web", w: 1600, h: 1000, ratio: "apaisada",
    prompt: "A laptop browser window mockup showing a marketing campaign dashboard with a social media ad preview, audience panel and performance metrics, violet and indigo gradient background with subtle dot grid. Premium clean SaaS marketing style, soft shadows, no readable text, no logos.",
  },
];

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
  if (!b64) throw new Error("Sin b64_json en la respuesta");
  return Buffer.from(b64, "base64");
}

for (const e of ESCENAS) {
  const size = e.ratio === "vertical" ? "1024x1536" : "1536x1024";
  process.stdout.write(`Generando ${e.id} (${size})... `);
  try {
    const buf = await generar(size, e.prompt);
    // Escala a las dimensiones exactas (cover) y convierte a WebP.
    const out = await sharp(buf)
      .resize(e.w, e.h, { fit: "cover", position: "attention" })
      .webp({ quality: 88 })
      .toBuffer();
    const destino = resolve(outDir, `${e.id}.webp`);
    writeFileSync(destino, out);
    console.log(`OK ${e.w}x${e.h} (${out.length} bytes)`);
  } catch (err) {
    console.log(`FALLO: ${err.message}`);
  }
}

console.log("Listo.");
