/**
 * Revisa las 7 escenas generadas de la portada con visión (gpt-4o) y reporta
 * qué muestra cada una y si hay algún problema (texto ilegible, cortes, etc.).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error("Falta OPENAI_API_KEY"); process.exit(1); }

const aqui = dirname(fileURLToPath(import.meta.url));
const dir = resolve(aqui, "../artifacts/ventas-pro/public/screens/gen");

const ARCHIVOS = ["hero", "hero-m", "sofia", "tienda", "inbox-web", "atlas-duo", "atlas-web"];

async function ver(nombre) {
  const buf = readFileSync(resolve(dir, `${nombre}.webp`));
  const b64 = buf.toString("base64");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Describí en 2-3 frases qué se ve en esta imagen de marketing (mockups de teléfono/notebook, colores, qué sugiere). Si ves texto deformado, elementos rotos, cortes raros o algo que no tenga sentido, decilo explícito al final con 'PROBLEMA: ...'." },
          { type: "image_url", image_url: { url: `data:image/webp;base64,${b64}` } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || "(sin respuesta)";
}

for (const a of ARCHIVOS) {
  process.stdout.write(`\n=== ${a}.webp ===\n`);
  try {
    console.log(await ver(a));
  } catch (e) {
    console.log("ERROR:", e.message);
  }
}
