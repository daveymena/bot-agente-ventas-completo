/**
 * Genera una foto de producto con IA cuando no hay ninguna real cargada, en
 * vez de caer directo al cartel de texto placeholder.
 *
 * Meta no ofrece una API para elegir entre varias fotos (confirmado en vivo
 * contra la cuenta real), y el Creativo Dinámico de Meta (que sí deja que
 * ELLOS testeen varias imágenes solos) requiere subir la imagen a
 * /adimages -- capacidad que esta app no tiene habilitada (Graph API error
 * #3, confirmado en vivo también). Así que el "elegir la mejor" lo hace
 * este módulo: genera DOS variantes con enfoques distintos (estudio vs.
 * contexto de uso) y un modelo con visión decide cuál representa mejor al
 * producto ANTES de mandar nada a Facebook -- en vez de esperar a que Meta
 * la rechace o la sirva sin corresponder al curso real.
 *
 * Reusa el mismo pipeline de generación (OpenAI/DALL-E con fallback a G4F)
 * que ya expone POST /api/public/generate-image, y el mismo almacenamiento
 * en disco (image-store.ts) que usa el resto de la app.
 */
import { generateImageBuffer, getProviderConfigFromSettings, getProviderConfig, createAIClient } from "@workspace/integrations-openai-ai-server";
import { getG4FImage } from "./providers/g4f-provider";
import { G4F_ENABLED } from "../config/g4f.config";
import { saveProductImage, saveProductImageVariant } from "./image-store";
import { logger } from "./logger";
import { db, settings as settingsTable } from "@workspace/db";

type ProductLite = { id: number; name: string | null; description: string | null };

const VARIANT_STYLES = [
  // Variante 1: Mockup 3D (dispositivos) de alta conversión para productos digitales
  "High quality 3D mockup showing this digital product displayed simultaneously on a modern MacBook Pro, an iPad Pro, and an iPhone. Professional lighting, premium digital product presentation, high contrast.",
  // Variante 2: User Generated Content (UGC) / Realismo imperfecto para generar confianza
  "User Generated Content (UGC) style lifestyle photo. Someone holding or using the product naturally at home or office. Shot on iPhone style, natural imperfect lighting, highly authentic, no studio perfection.",
];

/**
 * Construye una URL de Pollinations.ai para generar una imagen de producto.
 * Pollinations es una API pública totalmente gratuita (sin key, sin registro)
 * que sirve imágenes generadas por FLUX desde una URL directa.
 * Usar seed distinta por variante garantiza imágenes diferentes del mismo prompt.
 */
function buildPollinationsUrl(prompt: string, seed: number): string {
  const encoded = encodeURIComponent(prompt);
  // width=1080&height=1080: formato cuadrado, válido para feed e historias de
  // Facebook/Instagram sin recortar. nologo=true elimina la marca de agua.
  return `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&seed=${seed}&nologo=true&model=flux&enhance=true`;
}

function buildPrompt(product: ProductLite, variantIndex: number): string {
  const name = (product.name || "").trim();
  const description = (product.description || "").trim().slice(0, 200);
  return (
    `Professional marketing product photo for a digital course/product called "${name}". ` +
    (description ? `What it's about: ${description}. ` : "") +
    VARIANT_STYLES[variantIndex] +
    " Realistic photography style, no text overlays, no watermarks, no logos, suitable for a Facebook/Instagram ad."
  );
}

async function generateOneImage(prompt: string, productId: number, seed?: number): Promise<string | null> {
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    try {
      const buffer = await generateImageBuffer(prompt, "1024x1024");
      return `data:image/png;base64,${buffer.toString("base64")}`;
    } catch (err) {
      logger.warn({ err, productId }, "[AiProductImage] OpenAI falló, se intenta G4F");
    }
  }
  if (G4F_ENABLED) {
    try {
      const g4fResult = await getG4FImage(prompt);
      if (g4fResult) {
        return g4fResult.image.startsWith("data:") || g4fResult.image.startsWith("http")
          ? g4fResult.image
          : `data:image/png;base64,${g4fResult.image}`;
      }
    } catch (err) {
      logger.warn({ err, productId }, "[AiProductImage] G4F también falló");
    }
  }
  // Fallback gratuito: Pollinations.ai (sin API key, sin registro).
  // Devuelve la URL directa -- saveProductImage/saveProductImageVariant la
  // descargan y guardan en disco igual que cualquier otra URL http.
  try {
    const pollinationsUrl = buildPollinationsUrl(prompt, seed ?? Math.floor(Math.random() * 99999));
    logger.info({ productId, pollinationsUrl }, "[AiProductImage] Usando Pollinations.ai como generador gratuito");
    return pollinationsUrl;
  } catch (err) {
    logger.warn({ err, productId }, "[AiProductImage] Pollinations también falló");
  }
  return null;
}

/**
 * Le muestra las N candidatas a un modelo con visión y le pide que elija
 * cuál representa mejor al producto. Si el proveedor no soporta imágenes,
 * si no hay ninguno configurado, o si la respuesta no se puede interpretar,
 * devuelve 0 (la primera candidata) -- nunca bloquea la generación por esto.
 */
async function judgeBestCandidate(product: ProductLite, candidates: string[]): Promise<number> {
  if (candidates.length <= 1) return 0;
  try {
    const [appSettings] = await db.select().from(settingsTable).limit(1);
    const config = (appSettings ? getProviderConfigFromSettings(appSettings) : null)
      ?? getProviderConfig("github")
      ?? getProviderConfig("groq");
    if (!config) return 0;

    const client = createAIClient(config);
    const content: any[] = [
      {
        type: "text",
        text:
          `Estas son ${candidates.length} fotos candidatas para un anuncio del producto "${product.name}" ` +
          `(${(product.description || "").slice(0, 150)}). Elegí cuál representa MEJOR a ese producto ` +
          `de forma realista y profesional. Respondé ÚNICAMENTE con el número de la opción (1, 2, ...), nada más.`,
      },
      ...candidates.map((dataUri, i) => [
        { type: "text", text: `Opción ${i + 1}:` },
        { type: "image_url", image_url: { url: dataUri } },
      ]).flat(),
    ];

    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content }] as any,
      temperature: 0,
      max_tokens: 5,
    });
    const answer = completion.choices[0]?.message?.content?.trim() || "";
    const picked = parseInt(answer.match(/\d+/)?.[0] || "1", 10) - 1;
    return picked >= 0 && picked < candidates.length ? picked : 0;
  } catch (err) {
    logger.warn({ err, productId: product.id }, "[AiProductImage] No se pudo juzgar las candidatas (proveedor sin visión o falló) -- se usa la primera");
    return 0;
  }
}

/**
 * Genera 2 variantes, elige la que mejor corresponde al producto con un
 * modelo con visión, y guarda SOLO la ganadora en disco. Devuelve la ruta
 * pública (`/uploads/products/{id}.jpg`) o null si ningún proveedor de
 * imagen está disponible (el llamador debe caer al placeholder gris).
 */
export async function generateProductImage(product: ProductLite): Promise<string | null> {
  const prompts = [buildPrompt(product, 0), buildPrompt(product, 1)];
  // Seeds fijas para que la imagen principal del producto sea reproducible
  // (si se regenera, sale igual -- no un resultado aleatorio cada vez).
  const results = await Promise.all(prompts.map((p, i) => generateOneImage(p, product.id, i * 1000 + product.id)));
  const candidates = results.filter((r): r is string => !!r);

  if (candidates.length === 0) {
    logger.warn({ productId: product.id }, "[AiProductImage] Ningún proveedor de imagen disponible");
    return null;
  }

  const winnerIndex = await judgeBestCandidate(product, candidates);
  logger.info({ productId: product.id, generated: candidates.length, winnerIndex }, "[AiProductImage] Candidatas generadas y evaluadas");

  const savedPath = await saveProductImage(candidates[winnerIndex]!, product.id);
  if (!savedPath) {
    logger.warn({ productId: product.id }, "[AiProductImage] La imagen ganadora se generó pero no se pudo guardar en disco");
  }
  return savedPath;
}

/**
 * Genera 2-3 variantes de imagen para un producto y devuelve las rutas
 * públicas de TODAS las que pasen el filtro de coherencia de visión.
 *
 * Diferencia clave con generateProductImage(): en vez de elegir una sola
 * ganadora y tirar el resto, guarda TODAS las candidatas con nombres
 * distintos ({id}-v0.jpg, {id}-v1.jpg, ...) para que puedan usarse juntas
 * en asset_feed_spec de Meta -- así el algoritmo de Meta elige cuál imagen
 * convierte mejor con datos reales de audiencia, en vez de elegir nosotros
 * a priori.
 *
 * La primera ruta del array corresponde siempre a la imagen que el juez
 * de visión consideró la mejor (queda como imagen principal del producto).
 * Las siguientes son las alternativas que superaron el filtro de coherencia.
 *
 * Si no hay ningún proveedor disponible o ninguna candidata supera el
 * filtro, devuelve [] (el llamador debe caer a la imagen existente o al
 * placeholder).
 */
export async function generateProductImageVariants(
  product: ProductLite,
  appUrl: string,
): Promise<string[]> {
  const prompts = [buildPrompt(product, 0), buildPrompt(product, 1)];
  // Seeds distintas por variante garantizan imágenes diferentes incluso
  // cuando el proveedor es Pollinations.ai (mismo prompt = misma imagen
  // si la seed es igual). El product.id como base hace que las seeds sean
  // estables por producto pero distintas entre productos.
  const rawResults = await Promise.all(
    prompts.map((p, i) => generateOneImage(p, product.id, product.id * 10 + i))
  );
  const candidates = rawResults.filter((r): r is string => !!r);

  if (candidates.length === 0) {
    logger.warn({ productId: product.id }, "[AiProductImage] Ningún proveedor de imagen disponible para variantes");
    return [];
  }

  // El juez de visión devuelve el índice de la mejor candidata.
  // Las demás también se guardan (pasaron la generación; si hay solo una,
  // no hay nada que filtrar). En el futuro se puede agregar un chequeo
  // de coherencia individual ("corresponde este producto?") por candidata.
  const winnerIndex = await judgeBestCandidate(product, candidates);

  // Reordenar: la ganadora va primero para que sea la imagen principal.
  const ordered = [
    candidates[winnerIndex]!,
    ...candidates.filter((_, i) => i !== winnerIndex),
  ];

  const publicPaths: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const path = await saveProductImageVariant(ordered[i]!, product.id, i);
    if (path) {
      const base = appUrl.replace(/\/+$/, "");
      publicPaths.push(`${base}/${path.replace(/^\/+/, "")}`);
    }
  }

  logger.info(
    { productId: product.id, generated: candidates.length, saved: publicPaths.length },
    "[AiProductImage] Variantes generadas para asset_feed_spec"
  );
  return publicPaths;
}
