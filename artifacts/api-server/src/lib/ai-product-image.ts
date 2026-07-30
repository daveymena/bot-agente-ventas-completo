/**
 * Genera una foto de producto con IA cuando no hay ninguna real cargada, en
 * vez de caer directo al cartel de texto placeholder. El prompt se arma con
 * el nombre y la descripción REALES del producto (no un estilo genérico por
 * categoría) para que la imagen corresponda al producto anunciado -- ese
 * fue justo el reclamo: fotos que no corresponden al curso.
 *
 * Reusa el mismo pipeline (OpenAI/DALL-E con fallback a G4F) que ya expone
 * POST /api/public/generate-image para el editor de productos, y el mismo
 * almacenamiento en disco (image-store.ts) que ya usa el resto de la app --
 * así la imagen generada queda como archivo real, servible con URL http(s),
 * no como un data: URI roto.
 */
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { getG4FImage } from "./providers/g4f-provider";
import { G4F_ENABLED } from "../config/g4f.config";
import { saveProductImage } from "./image-store";
import { logger } from "./logger";

function buildPrompt(product: { name: string | null; description: string | null }): string {
  const name = (product.name || "").trim();
  const description = (product.description || "").trim().slice(0, 200);
  return (
    `Professional marketing product photo for a digital course/product called "${name}". ` +
    (description ? `What it's about: ${description}. ` : "") +
    "Realistic photography style, clean composition, no text overlays, no watermarks, no logos, suitable for a Facebook/Instagram ad."
  );
}

/**
 * Genera y guarda una foto para el producto. Devuelve la ruta pública
 * (`/uploads/products/{id}.jpg`) o null si ningún proveedor pudo generarla
 * (el llamador debe caer al placeholder gris como hacía antes).
 */
export async function generateProductImage(product: { id: number; name: string | null; description: string | null }): Promise<string | null> {
  const prompt = buildPrompt(product);
  let dataUriOrUrl: string | null = null;

  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    try {
      const buffer = await generateImageBuffer(prompt, "1024x1024");
      dataUriOrUrl = `data:image/png;base64,${buffer.toString("base64")}`;
    } catch (err) {
      logger.warn({ err, productId: product.id }, "[AiProductImage] OpenAI falló, se intenta G4F");
    }
  }

  if (!dataUriOrUrl && G4F_ENABLED) {
    try {
      const g4fResult = await getG4FImage(prompt);
      if (g4fResult) {
        dataUriOrUrl = g4fResult.image.startsWith("data:") || g4fResult.image.startsWith("http")
          ? g4fResult.image
          : `data:image/png;base64,${g4fResult.image}`;
      }
    } catch (err) {
      logger.warn({ err, productId: product.id }, "[AiProductImage] G4F también falló");
    }
  }

  if (!dataUriOrUrl) {
    logger.warn({ productId: product.id }, "[AiProductImage] Ningún proveedor de imagen disponible");
    return null;
  }

  // saveProductImage ya sabe manejar tanto data: URI como URL http(s).
  const savedPath = await saveProductImage(dataUriOrUrl, product.id);
  if (!savedPath) {
    logger.warn({ productId: product.id }, "[AiProductImage] La imagen se generó pero no se pudo guardar en disco");
  }
  return savedPath;
}
