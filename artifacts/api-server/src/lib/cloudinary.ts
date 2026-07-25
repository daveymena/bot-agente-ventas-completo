/**
 * Cloudinary — hospedaje PERMANENTE de imágenes + redimensionado automático.
 *
 * Resuelve el problema de las imágenes generadas/subidas: Cloudinary les da
 * una URL que NO se vence y que además puede entregar cualquier tamaño al vuelo
 * (feed, story, card…) cambiando la URL. Se usa la API REST directa con firma
 * SHA-1, sin SDK (para no tocar el lockfile).
 *
 * Config (en el entorno, NO en el repo):
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
import { createHash } from "node:crypto";
import { logger } from "./logger";

export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Sube una imagen (desde una URL — generada o provista) a Cloudinary y devuelve
 * la URL permanente. `publicId` permite sobrescribir la imagen de un producto
 * (ej: "products/82") para que siempre tenga la misma URL.
 */
export async function uploadImageToCloudinary(
  sourceUrl: string,
  publicId: string,
): Promise<string | null> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = process.env.CLOUDINARY_API_KEY!;
  const apiSecret = process.env.CLOUDINARY_API_SECRET!;
  if (!cloud || !apiKey || !apiSecret) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  // Firma: parámetros a firmar en orden alfabético, + api_secret, luego SHA-1
  const toSign = `overwrite=true&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(toSign + apiSecret).digest("hex");

  const form = new URLSearchParams();
  form.set("file", sourceUrl);
  form.set("public_id", publicId);
  form.set("overwrite", "true");
  form.set("timestamp", String(timestamp));
  form.set("api_key", apiKey);
  form.set("signature", signature);

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (data?.secure_url) {
      logger.info({ publicId }, "[Cloudinary] Imagen subida");
      return data.secure_url as string;
    }
    logger.warn({ err: data?.error?.message, publicId }, "[Cloudinary] Falló la subida");
    return null;
  } catch (e: any) {
    logger.error({ err: e?.message }, "[Cloudinary] Error de red");
    return null;
  }
}

/**
 * Devuelve una variante redimensionada de una URL de Cloudinary (para cada
 * formato/dispositivo). Si la URL no es de Cloudinary, la devuelve tal cual.
 */
export function cloudinaryResize(url: string, w: number, h: number): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/c_fill,g_auto,w_${w},h_${h}/`);
}

// Medidas recomendadas por uso (para que el Architect las sugiera).
export const IMAGE_SIZES: Record<string, { w: number; h: number; label: string }> = {
  card: { w: 1080, h: 1080, label: "Card del producto / feed cuadrado (1:1)" },
  ad_feed: { w: 1200, h: 628, label: "Anuncio feed horizontal (1.91:1)" },
  ad_square: { w: 1080, h: 1080, label: "Anuncio cuadrado (1:1)" },
  ad_story: { w: 1080, h: 1920, label: "Story / Reel vertical (9:16)" },
  marketplace: { w: 1200, h: 628, label: "Marketplace (1.91:1)" },
};
