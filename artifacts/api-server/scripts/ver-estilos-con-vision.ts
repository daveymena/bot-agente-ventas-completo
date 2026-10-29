/**
 * VER la captura con el modelo de VISIÓN que el sistema ya usa
 * (openrouter → gemma-4-31b-it:free, gratis, el patrón de ai-product-image.ts:
 * createAIClient + chat.completions con image_url).
 *
 * El objetivo: describir LOS ESTILOS que el dueño quiere añadir al motor de
 * composición, en lenguaje de ESTRUCTURA (orden de secciones, tipo de hero,
 * paleta, CTA, franjas de confianza) — para poder levantarlos como modelos
 * de página nuevos en composicion.ts.
 */
import { readFileSync } from "node:fs";
import { createAIClient, getProviderConfig } from "@workspace/integrations-openai-ai-server";

// El .env lo carga el dotenv de la capa de DB; este script no la importa, así
// que lo leo a mano desde la raíz del repo (sin imprimir Secretos).
const envTxt = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
for (const line of envTxt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const FICHEROS = [
  "C:\\Users\\ADMIN\\Downloads\\Galería de Landing Pages Colombianas.png",
  "C:\\Users\\ADMIN\\Downloads\\Tríptico de landing pages de productos en español.png",
];

const config = (() => {
  const base = getProviderConfig("openrouter");
  if (!base) return null;
  return { ...base, model: "google/gemma-4-31b-it:free" }; // la VISIÓN gratis de OpenRouter
})();

if (!config) { console.log("sin proveedor de visión configurado (falta OPENROUTER_API_KEY)"); process.exit(1); }

const PROMPT =
  "Mirá esta(s) captura(s) de landing pages y describe cada UNA por separado, para poder construir una landing PARECIDA. " +
  "Por cada landing que veas, en una línea por punto:\n" +
  "1. ORDEN de secciones (arriba a abajo).\n" +
  "2. TIPO de hero: ¿la oferta y el precio arriba, el producto-foto, texto editorial, pantalla completa?\n" +
  "3. PALETA: fondo claro/oscuro, color de acento, tipo de botón (pill/cuadrado).\n" +
  "4. FRANJAS de confianza: dónde aparecen y qué dicen (pago contra entrega, envío, garantía...).\n" +
  "5. TIPOGRAFÍA: sans fina/display redonda/serif.\n" +
  "6. DENSIDAD: texto largo o corto, más foto o más bullet.\n" +
  "7. LO MÁS DISTINTIVO de esa landing frente a una landing clásica de e-commerce.\n" +
  "Sé concreto y directo: quiero reconocer el estilo sin ver la imagen. Máx 12 renglones por landing.";

const client = createAIClient(config);
for (const f of FICHEROS) {
  let dataUri: string;
  try {
    dataUri = `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  } catch (e: any) {
    console.log(`no pude abrir ${f}: ${e?.message}`);
    continue;
  }
  process.stdout.write(`— ${f.split("\\").pop()}: leyendo con visión… `);
  try {
    const completion = await (client.chat.completions as any).create({
      model: config.model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      }] as any,
      temperature: 0.2,
      max_tokens: 1400,
    });
    const r = String(completion.choices[0]?.message?.content ?? "").trim();
    console.log(r || "(respuesta vacía)");
  } catch (e: any) {
    console.log(`fallo: ${String(e?.message || e).slice(0, 220)}`);
  }
}
process.exit(0);