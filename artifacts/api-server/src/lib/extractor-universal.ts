/**
 * EXTRACTOR UNIVERSAL — Imágenes y videos de cualquier ficha para transformar
 * ==========================================================================
 * Pedido DIOS: "que sepa extraer contenido de imágenes y video de otros lugares
 * para transformarlo" — no solo AliExpress, sino cualquier URL del proveedor,
 * del competidor o de tu propio catálogo para enriquecer la biblioteca.
 *
 * Usa fetch + parsing de HTML sin navegador (rápido, sin puppeteer) y valida
 * magic bytes para no guardar HTML como .jpg (bug ya pagado en activos-fabricante).
 * Todo con time-outs y límites para no tumbar el contenedor.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getImageStoreDir } from "./image-store";
import { fotoGrande, tipoDeArchivo } from "./activos-fabricante";
import { logger } from "./logger";

export interface Extraccion {
  urlOrigen: string;
  imagenes: string[]; // URLs absolutas encontradas
  videos: string[];   // URLs absolutas encontradas
  titulo: string | null;
  descripcion: string | null;
}

export interface Transformacion {
  origen: string;
  destino: string;
  tipo: "imagen" | "video";
  ok: boolean;
  error?: string;
}

/**
 * Extrae imágenes y videos de una URL pública (ficha de producto, landing, Instagram, etc.)
 * Sin navegador: lee HTML y saca og:image, img[src], video[src], source[src], meta property.
 */
export async function extraerDeUrl(url: string): Promise<Extraccion> {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) throw new Error("URL debe empezar por https://");
  const html = await fetch(u, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  }).then(r => r.text()).catch(e => { throw new Error(`No se pudo leer la URL: ${e?.message || e}`); });

  const titulo = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() || html.match(/property="og:title"[^>]*content="([^"]{1,200})"/i)?.[1]?.trim() || null;
  const descripcion = html.match(/property="og:description"[^>]*content="([^"]{1,500})"/i)?.[1]?.trim() || html.match(/name="description"[^>]*content="([^"]{1,500})"/i)?.[1]?.trim() || null;

  const encontradas = new Set<string>();
  const videos = new Set<string>();

  // og:image, twitter:image, itemprop image
  for (const m of html.matchAll(/content="(https?:\/\/[^"]+\.(?:jpe?g|png|webp|avif|gif)[^"]*)"/gi)) encontradas.add(fotoGrande(m[1]!));
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const src = m[1]!.trim();
    const abs = src.startsWith("//") ? "https:" + src : src.startsWith("/") ? new URL(src, u).toString() : src;
    if (/^https?:\/\//i.test(abs)) encontradas.add(fotoGrande(abs));
  }
  // videos
  for (const m of html.matchAll(/<video[^>]+src=["']([^"']+)["']/gi)) videos.add(m[1]!.trim());
  for (const m of html.matchAll(/<source[^>]+src=["']([^"']+)["']/gi)) {
    const s = m[1]!.trim();
    if (/\.(mp4|mov|webm|m3u8)(\?|$)/i.test(s)) videos.add(s.startsWith("//") ? "https:" + s : s.startsWith("/") ? new URL(s, u).toString() : s);
  }
  for (const m of html.matchAll(/"(https?:\/\/[^"]+\.mp4[^"]*)"/gi)) videos.add(m[1]!);
  // aliexpress video CDN
  for (const m of html.matchAll(/(https?:\/\/video\.aliexpress[^"'\s]+\.mp4[^"'\s]*)/gi)) videos.add(m[1]!);

  return {
    urlOrigen: u,
    imagenes: [...encontradas].slice(0, 20).filter(Boolean),
    videos: [...videos].slice(0, 10).filter(v => /^https?:\/\//i.test(v)),
    titulo,
    descripcion,
  };
}

/**
 * Descarga y guarda una imagen/video en el store persistente, validando magic bytes.
 * Si es imagen, no transforma aún; si es video, queda listo para que Atlas lo corte con FFmpeg.
 */
export async function guardarActivos(
  urls: string[],
  tenantId: number,
  prefijo = "extraido",
): Promise<Transformacion[]> {
  const dir = path.join(getImageStoreDir(), String(tenantId), prefijo);
  await mkdir(dir, { recursive: true });
  const out: Transformacion[] = [];
  for (const raw of urls.slice(0, 10)) {
    const url = String(raw || "").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error("archivo muy pequeño");
      const tipo = tipoDeArchivo(buf);
      if (tipo !== "imagen" && tipo !== "video") throw new Error(`no es imagen/video válido (tipo ${tipo})`);
      const ext = tipo === "video" ? ".mp4" : (buf[0] === 0xff && buf[1] === 0xd8 ? ".jpg" : ".png");
      const nombre = `${crypto.createHash("md5").update(url).digest("hex").slice(0, 12)}${ext}`;
      const destino = path.join(dir, nombre);
      await writeFile(destino, buf);
      out.push({ origen: url, destino, tipo, ok: true });
    } catch (e: any) {
      out.push({ origen: url, destino: "", tipo: "imagen", ok: false, error: e?.message || String(e) });
      logger.warn({ url, err: e?.message }, "[Extractor] fallo descarga");
    }
  }
  return out;
}

/**
 * Atlas tool handler: extrae y guarda en un paso.
 */
export async function extraerYGuardar(
  url: string,
  tenantId: number,
): Promise<{ extraccion: Extraccion; guardados: Transformacion[] }> {
  const extraccion = await extraerDeUrl(url);
  const todos = [...extraccion.imagenes, ...extraccion.videos];
  const guardados = await guardarActivos(todos, tenantId, "universal");
  return { extraccion, guardados };
}
