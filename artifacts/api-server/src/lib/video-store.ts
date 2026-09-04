/**
 * ============================================================
 * EL VIDEO, ALOJADO EN LA APP
 * ============================================================
 *
 * Pedido del admin (2026-09-02): "descárgalo y alójalo en la app, es el único
 * que está en Terabox".
 *
 * ── Por qué no alcanza con el enlace de Terabox ──────────────────────────
 *
 * Se probó y funciona, pero al cliente le pide instalar la app o registrarse.
 * Poner una barrera de registro justo cuando alguien está decidiendo comprar
 * es perder la venta, y es lo peor de las tres opciones (Drive abre el
 * reproductor; YouTube da miniatura y play).
 *
 * Alojarlo acá lo convierte en una URL `.mp4` propia: el cliente toca y se
 * abre el video, sin apps, sin cuentas y sin salir del dominio del negocio.
 *
 * ⚠️ Lo que esto NO hace: reproducir DENTRO del chat de WhatsApp. Para eso el
 * video tiene que viajar como archivo adjunto y pesar menos de 16 MB -- éste
 * pesa 124. Un enlace, por directo que sea, siempre abre el navegador. Ver
 * `video-de-producto.ts`.
 *
 * ── El enlace de Terabox caduca ──────────────────────────────────────────
 *
 * `getFileMeta` devuelve un `dlink` con `expires=1h` (a veces 8h). O sea que
 * NO se puede guardar como el video del producto: mañana no sirve. Por eso hay
 * que bajar el archivo una vez y quedárselo.
 */

import { writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger";

/** La misma carpeta que las imágenes: en producción es el volumen persistente. */
function baseDir(): string {
  return process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "data/images");
}

export const VIDEOS_SUBDIR = "videos";

/** Extensiones que se aceptan como video de producto. */
const EXT_VALIDA = /\.(mp4|webm|mov|m4v)$/i;

/** Un video de verdad pesa más que esto. Menos, es un error disfrazado. */
const MINIMO_BYTES = 200 * 1024;

export interface VideoGuardado {
  /** La URL pública, para guardar en el producto. */
  url: string;
  /** Dónde quedó en disco. */
  ruta: string;
  bytes: number;
}

/**
 * Baja un video y lo deja servido por la app.
 *
 * `origen` puede ser cualquier URL descargable -- incluido el `dlink` temporal
 * de Terabox, que es justo el caso para el que se escribió esto.
 *
 * Devuelve null si falla: quien llama decide si deja el enlace externo o no
 * pone ninguno. Nunca revienta el turno de un cliente por esto.
 */
export async function guardarVideoDeProducto(
  origen: string,
  productId: number,
  opciones: { extension?: string; timeoutMs?: number } = {},
): Promise<VideoGuardado | null> {
  const url = String(origen || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    logger.warn({ productId }, "[VideoStore] El origen no es una URL descargable");
    return null;
  }

  const ext = (opciones.extension || ".mp4").toLowerCase();
  if (!EXT_VALIDA.test(ext)) {
    logger.warn({ productId, ext }, "[VideoStore] Extensión no admitida");
    return null;
  }

  const dir = path.resolve(baseDir(), VIDEOS_SUBDIR);
  const archivo = `${productId}${ext}`;
  const ruta = path.resolve(dir, archivo);

  try {
    // Un video de curso pesa cientos de MB: el timeout va largo a propósito, y
    // esto NO corre en el camino que le contesta a un cliente.
    const res = await fetch(url, {
      headers: {
        // Terabox rechaza las descargas sin user-agent de navegador.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(opciones.timeoutMs ?? 10 * 60 * 1000),
    });
    if (!res.ok) {
      logger.warn({ productId, status: res.status }, "[VideoStore] La descarga falló");
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < MINIMO_BYTES) {
      // Un HTML de error de la CDN pesa unos KB y tiene extensión de video.
      // Es el mismo defecto que ya costó caro con las imágenes rotas.
      logger.warn({ productId, bytes: buffer.length }, "[VideoStore] Lo descargado es demasiado chico: no es un video");
      return null;
    }

    await mkdir(dir, { recursive: true });
    await writeFile(ruta, buffer);
    const info = await stat(ruta);

    logger.info(
      { productId, mb: Math.round(info.size / 1048576) },
      "[VideoStore] Video guardado en la app",
    );
    return { url: `/videos/products/${archivo}`, ruta, bytes: info.size };
  } catch (e: any) {
    logger.warn({ productId, err: e?.message }, "[VideoStore] No se pudo guardar el video");
    return null;
  }
}

/** El nombre de archivo que le corresponde a un producto, si existe. */
export function nombreDeArchivo(productId: number, ext = ".mp4"): string {
  return `${productId}${ext}`;
}

/** La carpeta donde viven, para que app.ts los sirva. */
export function carpetaDeVideos(): string {
  return path.resolve(baseDir(), VIDEOS_SUBDIR);
}
