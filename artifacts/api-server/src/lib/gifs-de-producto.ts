/**
 * GIF / WebP ANIMADO DEL PRODUCTO
 * ===============================
 *
 * Paso 3 del plan (`LANDING_Y_ACTIVOS_AUTOMATIZACION.md`): "ffmpeg corta 2-4
 * tramos de 3 s del video (o de las fotos con zoom) → GIF/WebP cuadrado".
 *
 * Por qué existe: en las landings que convierten, el primer pantallazo es una
 * imagen EN MOVIMIENTO que muestra UN beneficio, no una foto quieta. El curso
 * lo hace recortando el video del fabricante; antes esto había que hacerlo a
 * mano en Canva.
 *
 * Decisiones:
 *   · WebP animado, no GIF: mismo movimiento, una fracción del peso, y con
 *     transparencia real. "GIF" en el plan es el nombre coloquial del formato.
 *   · Cuadrado 600 px: entra en cualquier sección sin recortes raros.
 *   · Se reusa el `run()` de `video-anuncio.ts`: el mismo ffmpeg, el mismo
 *     timeout y la misma forma de matar un proceso colgado.
 *   · Los args de ffmpeg se construyen en funciones PURAS: así se prueban sin
 *     el binario y sin archivos (el CI no tiene ffmpeg).
 */

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { hayFfmpeg, run } from "./video-anuncio";

/** Lado del cuadrado. 600 entra cómodo en móvil sin pesar de más. */
export const LADO_POR_DEFECTO = 600;
/** Cuántos tramos se recortan: 2-4 (más que eso satura la página). */
export const CUANTOS_POR_DEFECTO = 3;
/** Duración de cada tramo, en segundos. */
export const DURACION_CLIP = 3;
const FPS = 15;
const CALIDAD = 80;
/** Tope del zoom al animar una foto quieta. Más que esto marea. */
const ZOOM_MAX = 1.15;

export interface OpcionesDeClip {
  /** Segundo donde arranca el tramo (solo para video). */
  inicio: number;
  /** Cuánto dura el clip. */
  duracion: number;
  /** Lado del cuadrado de salida. */
  lado: number;
  fps: number;
  /** Calidad de libwebp (0-100). */
  calidad: number;
}

/** Escala y recorta al cuadrado sin deformar: primero cubre, después corta. */
export function filtroCuadrado(lado: number): string {
  return `scale=${lado}:${lado}:force_original_aspect_ratio=increase,crop=${lado}:${lado}`;
}

/**
 * Dónde arranca cada tramo dentro de un video.
 *
 * Se reparten dentro de lo útil: ni el primer medio segundo (suele estar
 * negro) ni el final (suele tener el logo). Un video más corto que un tramo
 * devuelve un solo arranque en 0, que es lo único honesto que se puede hacer.
 */
export function tramosDe(duracionTotal: number, cuantos: number, duracionClip = DURACION_CLIP): number[] {
  if (!(duracionTotal > duracionClip)) return [0];
  const margen = duracionClip * 0.5;
  const util = duracionTotal - duracionClip - margen * 2;
  if (util <= 0) return [Number(margen.toFixed(2))];
  const n = Math.max(1, Math.floor(cuantos));
  const paso = n > 1 ? util / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => Number((margen + paso * i).toFixed(2)));
}

/** Argumentos de ffmpeg para recortar un tramo de video a WebP animado cuadrado. */
export function argsWebpDesdeVideo(entrada: string, salida: string, o: OpcionesDeClip): string[] {
  return [
    "-y",
    // -ss ANTES de -i: seek rápido, sin decodificar todo lo anterior.
    "-ss", String(o.inicio),
    "-t", String(o.duracion),
    "-i", entrada,
    "-an",
    "-vf", `${filtroCuadrado(o.lado)},fps=${o.fps}`,
    "-c:v", "libwebp",
    "-loop", "0",
    "-quality", String(o.calidad),
    "-compression_level", "6",
    salida,
  ];
}

/**
 * Argumentos de ffmpeg para animar una FOTO quieta con un zoom lento.
 *
 * Es el respaldo cuando no hay video del fabricante: sin movimiento no hay
 * "primer pantallazo" que detenga el scroll, y la foto sola no alcanza.
 */
export function argsWebpDesdeFoto(entrada: string, salida: string, o: OpcionesDeClip): string[] {
  // Se trabaja al doble del lado final: el zoom recorta, así que si se
  // ampliara desde 600 se vería pixelado al acercarse.
  const ladoDeTrabajo = o.lado * 2;
  const fotogramas = Math.max(2, Math.round(o.duracion * o.fps));
  const porFotograma = ((ZOOM_MAX - 1) / fotogramas).toFixed(5);
  return [
    "-y",
    "-loop", "1",
    "-i", entrada,
    "-t", String(o.duracion),
    "-vf",
      `${filtroCuadrado(ladoDeTrabajo)},` +
        `zoompan=z='min(zoom+${porFotograma},${ZOOM_MAX})'` +
        `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
        `:d=${fotogramas}:s=${o.lado}x${o.lado}:fps=${o.fps}`,
    "-c:v", "libwebp",
    "-loop", "0",
    "-quality", String(o.calidad),
    "-compression_level", "6",
    salida,
  ];
}

/** Dónde se guardan los recortes. Mismo volumen que las fotos y los videos. */
export function dirGifs(): string {
  const base = process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "data/images");
  return path.join(base, "videos", "gifs");
}

export interface ClipGenerado {
  archivo: string;
  origen: "video" | "foto";
  /** De dónde salió (segundo del video, o índice de la foto). */
  desde: number;
}

export interface ResultadoGifs {
  ok: boolean;
  error?: string;
  clips: ClipGenerado[];
}

/**
 * Genera los recortes del producto.
 *
 * Prioriza el VIDEO real del fabricante (es movimiento de verdad). Si no hay
 * video, anima las FOTOS. Si no hay ninguna de las dos, devuelve el motivo:
 * nunca inventa un activo que no existe.
 */
export async function generarGifsDeProducto(opts: {
  productId: number;
  /** Ruta local del video del producto, si hay. */
  video?: string | null;
  /** Rutas locales de las fotos, si las hay. */
  fotos?: string[];
  cuantos?: number;
  lado?: number;
}): Promise<ResultadoGifs> {
  const cuantos = Math.min(4, Math.max(2, Math.floor(opts.cuantos ?? CUANTOS_POR_DEFECTO)));
  const lado = Math.floor(opts.lado ?? LADO_POR_DEFECTO);

  const video = String(opts.video || "").trim();
  const fotos = (opts.fotos || []).map((f) => String(f || "").trim()).filter(Boolean);

  if (!video && !fotos.length) {
    return {
      ok: false,
      error: "No hay video ni fotos del producto: no hay de dónde recortar. Subí fotos o el video del fabricante primero.",
      clips: [],
    };
  }

  if (!(await hayFfmpeg())) {
    return { ok: false, error: "ffmpeg no está instalado en el servidor (falta en el Dockerfile).", clips: [] };
  }

  const dir = dirGifs();
  try {
    await mkdir(dir, { recursive: true });
  } catch (e: any) {
    return { ok: false, error: `No se pudo crear la carpeta de recortes: ${e?.message || "error"}`, clips: [] };
  }

  const clips: ClipGenerado[] = [];
  const base = (i: number) => path.join(dir, `p${opts.productId}-${Date.now()}-${i}.webp`);

  // ── 1. Con video: 2-4 tramos repartidos ──────────────────────────────────
  if (video) {
    const total = await duracionDe(video);
    const arranques = tramosDe(total, cuantos, DURACION_CLIP);
    for (const [i, inicio] of arranques.entries()) {
      const salida = base(i);
      const r = await run(
        "ffmpeg",
        argsWebpDesdeVideo(video, salida, { inicio, duracion: DURACION_CLIP, lado, fps: FPS, calidad: CALIDAD }),
        120_000,
      ).catch((e: any) => ({ code: 1, out: "", err: String(e?.message || e) }));
      if (r.code === 0) clips.push({ archivo: salida, origen: "video", desde: inicio });
    }
    if (clips.length) return { ok: true, clips };
    // Si el video falló entero, se intenta con las fotos antes de rendirse.
    if (!fotos.length) {
      return { ok: false, error: "No se pudo recortar ningún tramo del video (¿está corrupto o sin pista de video?).", clips: [] };
    }
  }

  // ── 2. Con fotos: zoom lento, una por foto ───────────────────────────────
  for (const [i, foto] of fotos.slice(0, cuantos).entries()) {
    const salida = base(100 + i);
    const r = await run(
      "ffmpeg",
      argsWebpDesdeFoto(foto, salida, { inicio: 0, duracion: DURACION_CLIP, lado, fps: FPS, calidad: CALIDAD }),
      120_000,
    ).catch((e: any) => ({ code: 1, out: "", err: String(e?.message || e) }));
    if (r.code === 0) clips.push({ archivo: salida, origen: "foto", desde: i });
  }

  if (!clips.length) return { ok: false, error: "ffmpeg no pudo generar ningún recorte de las fotos.", clips: [] };
  return { ok: true, clips };
}

/** Duración de un archivo, con ffprobe. 0 si no se puede leer. */
async function duracionDe(archivo: string): Promise<number> {
  try {
    const r = await run(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", archivo],
      20_000,
    );
    const n = Number(String(r.out).trim());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CABLEADO: de la fila del producto a los recortes guardados
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Lee `metadata` sin tirar: puede venir como objeto (jsonb) o como texto (SQLite). */
export function leerMetadata(crudo: unknown): Record<string, any> {
  if (!crudo) return {};
  if (typeof crudo === "string") {
    try {
      const p = JSON.parse(crudo);
      return p && typeof p === "object" ? p : {};
    } catch {
      return {};
    }
  }
  return typeof crudo === "object" ? { ...(crudo as Record<string, any>) } : {};
}

/**
 * De dónde se recortan los GIFs.
 *
 * El video del anuncio ya generado es un ARCHIVO LOCAL y tiene movimiento real:
 * es la mejor fuente y va primero. Si no hay, se animan las fotos (ffmpeg las
 * baja por URL). Si no hay ninguna de las dos, se devuelve vacío y quien llame
 * decide qué decir: nunca se inventa un activo.
 */
export function elegirFuentes(meta: Record<string, any>, fotos: string[]): { video: string | null; fotos: string[] } {
  const video = String(meta?.videoAnuncio?.archivo || "").trim() || null;
  // Con video no se animan fotos: mezclar dos orígenes da una página incoherente.
  if (video) return { video, fotos: [] };
  return { video: null, fotos: (fotos || []).map((f) => String(f || "").trim()).filter(Boolean).slice(0, 4) };
}

export interface ResultadoGifsDeProducto extends ResultadoGifs {
  /** Si los recortes quedaron guardados en el producto. */
  guardado: boolean;
}

/**
 * Genera los recortes de UN producto y los deja guardados en su metadata.
 *
 * Guardarlos en el producto (y no en la pantalla que los pidió) es lo que hace
 * que la landing, el anuncio y el vendedor lean el MISMO activo.
 */
export async function generarGifsDelProducto(
  tenantId: number,
  productId: number,
  opts: { cuantos?: number; lado?: number } = {},
): Promise<ResultadoGifsDeProducto> {
  const { db, products } = await import("@workspace/db");
  const { and, eq } = await import("drizzle-orm");

  const [p] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);
  if (!p) return { ok: false, error: "Ese producto no existe en este negocio.", clips: [], guardado: false };

  const meta = leerMetadata((p as any).metadata);
  const { fotosDelProducto } = await import("./fotos-de-producto");
  const fotos = fotosDelProducto(p, process.env.APP_URL || "https://ventasproia.com", 4);
  const fuentes = elegirFuentes(meta, fotos);

  const r = await generarGifsDeProducto({ productId, video: fuentes.video, fotos: fuentes.fotos, ...opts });
  if (!r.ok) return { ...r, guardado: false };

  meta.gifs = r.clips.map((c) => ({ ...c, en: new Date().toISOString() }));
  try {
    await db
      .update(products)
      .set({ metadata: JSON.stringify(meta) })
      .where(eq(products.id, productId));
  } catch (e: any) {
    // Los recortes existen; lo que falló fue guardarlos. Se dice tal cual: el
    // llamador no puede quedarse creyendo que quedaron en el producto.
    return { ok: false, error: `Se generaron los recortes pero no se pudieron guardar: ${e?.message || "error"}`, clips: r.clips, guardado: false };
  }

  return { ...r, guardado: true };
}

