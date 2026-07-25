/**
 * Almacenamiento de imágenes en el VOLUMEN persistente de Easypanel.
 *
 * Guarda imágenes (subidas por el admin o generadas por IA) en disco, en una
 * carpeta que debe estar montada como volumen en Easypanel para que sobreviva
 * a los redeploys. Las sirve tu propio servidor en /uploads/products/{id}.jpg.
 *
 * Config: IMAGE_STORE_DIR (en producción apúntalo al volumen, ej /app/uploads).
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger";

export function getImageStoreDir(): string {
  return process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "uploads");
}

/**
 * Descarga/decodifica una imagen (URL http(s) o data:base64) y la guarda en el
 * volumen. Devuelve la ruta pública servible, o null si falla.
 */
export async function saveProductImage(source: string, productId: number): Promise<string | null> {
  try {
    let buffer: Buffer;
    if (source.startsWith("data:")) {
      const b64 = source.split(",")[1] || "";
      buffer = Buffer.from(b64, "base64");
    } else if (/^https?:\/\//i.test(source)) {
      const res = await fetch(source);
      if (!res.ok) {
        logger.warn({ status: res.status, productId }, "[ImageStore] Descarga falló");
        return null;
      }
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      return null;
    }
    if (buffer.length < 100) return null; // no es una imagen válida

    const dir = path.join(getImageStoreDir(), "products");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${productId}.jpg`);
    await writeFile(file, buffer);
    // Cache-busting: cada vez que cambia, nueva versión en la URL
    logger.info({ productId, bytes: buffer.length }, "[ImageStore] Imagen guardada en volumen");
    return `/uploads/products/${productId}.jpg?v=${Date.now()}`;
  } catch (e: any) {
    logger.error({ err: e?.message, productId }, "[ImageStore] Error guardando imagen");
    return null;
  }
}
