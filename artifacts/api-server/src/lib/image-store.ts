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

/**
 * Único punto de verdad para el directorio de imágenes: app.ts (servido
 * estático) y este módulo (donde se guardan) DEBEN devolver la misma ruta.
 * Antes tenían defaults distintos ("uploads" vs "data/images") cuando
 * IMAGE_STORE_DIR no estaba seteada, así que las imágenes se guardaban en
 * un lado y se servían desde otro → 404 / "imagen rota" intermitente.
 */
export function getImageStoreDir(): string {
  return process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "data/images");
}

/**
 * Convierte enlaces de Google Drive (archivo) a la URL de descarga directa,
 * para poder traer la imagen. Soporta /file/d/{id}/view, uc?id=, open?id=.
 * Requiere que el archivo sea público ("cualquiera con el enlace").
 */
export function resolveImageSource(url: string): string {
  if (!/drive\.google\.com/i.test(url)) return url;
  const id =
    url.match(/\/file\/d\/([\w-]+)/)?.[1] ||
    url.match(/[?&]id=([\w-]+)/)?.[1];
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return url;
}

/**
 * Descarga/decodifica una imagen (URL http(s) o data:base64) y la guarda en el
 * volumen. Devuelve la ruta pública servible, o null si falla.
 */
/**
 * Guarda una imagen subida manualmente (data URL base64 o URL) en el volumen,
 * con nombre único. Devuelve la ruta pública para pasarla al Architect.
 */
export async function saveUploadedImage(source: string, filename?: string): Promise<string | null> {
  try {
    source = resolveImageSource(source);
    let buffer: Buffer;
    let ext = "jpg";
    if (source.startsWith("data:")) {
      const mime = source.match(/^data:image\/(\w+)/)?.[1];
      if (mime) ext = mime === "jpeg" ? "jpg" : mime;
      buffer = Buffer.from(source.split(",")[1] || "", "base64");
    } else if (/^https?:\/\//i.test(source)) {
      // Sin timeout, una fuente lenta o colgada dejaba esta descarga (y con
      // ella todo el turno del Arquitecto) esperando para siempre.
      const res = await fetch(source, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
    } else return null;
    if (buffer.length < 100) return null;

    const dir = path.join(getImageStoreDir(), "manual");
    await mkdir(dir, { recursive: true });
    const safe = (filename || "img").replace(/[^\w.-]/g, "_").slice(0, 40);
    const name = `${Date.now()}-${safe}.${ext}`.replace(/\.\w+\.\w+$/, `.${ext}`);
    await writeFile(path.join(dir, name), buffer);
    logger.info({ name, bytes: buffer.length }, "[ImageStore] Imagen subida guardada");
    return `/uploads/manual/${name}`;
  } catch (e: any) {
    logger.error({ err: e?.message }, "[ImageStore] Error guardando subida");
    return null;
  }
}

export async function saveProductImage(source: string, productId: number): Promise<string | null> {
  try {
    source = resolveImageSource(source); // convierte links de Drive a descarga directa
    let buffer: Buffer;
    if (source.startsWith("data:")) {
      const b64 = source.split(",")[1] || "";
      buffer = Buffer.from(b64, "base64");
    } else if (/^https?:\/\//i.test(source)) {
      const res = await fetch(source, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
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

/**
 * Guarda una variante numerada de imagen de producto en disco.
 * Permite almacenar varias versiones generadas por IA con nombres distintos
 * ({productId}-v0.jpg, {productId}-v1.jpg, ...) para usarlas en asset_feed_spec
 * de Meta sin sobreescribir la imagen principal del producto.
 * Devuelve la ruta pública servible, o null si falla.
 */
export async function saveProductImageVariant(source: string, productId: number, variantIndex: number): Promise<string | null> {
  try {
    source = resolveImageSource(source);
    let buffer: Buffer;
    if (source.startsWith("data:")) {
      const b64 = source.split(",")[1] || "";
      buffer = Buffer.from(b64, "base64");
    } else if (/^https?:\/\//i.test(source)) {
      const res = await fetch(source, {
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      return null;
    }
    if (buffer.length < 100) return null;

    const dir = path.join(getImageStoreDir(), "products");
    await mkdir(dir, { recursive: true });
    const filename = `${productId}-v${variantIndex}.jpg`;
    await writeFile(path.join(dir, filename), buffer);
    logger.info({ productId, variantIndex, bytes: buffer.length }, "[ImageStore] Variante guardada en volumen");
    return `/uploads/products/${filename}?v=${Date.now()}`;
  } catch (e: any) {
    logger.error({ err: e?.message, productId, variantIndex }, "[ImageStore] Error guardando variante");
    return null;
  }
}
