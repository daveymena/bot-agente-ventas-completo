/**
 * ACTIVOS DEL FABRICANTE: fotos y videos del mismo producto en AliExpress.
 *
 * Pedido del dueño (01-10-2026): "conectémonos a páginas que ofrecen el mismo
 * producto y extraer los videos como lo hace el del tutorial", "y también las
 * imágenes", "que Atlas lo automatice en segundo plano". El tutorial (Iván
 * Caicedo, cap. 15-21) saca los GIF de 3-5 s del video del FABRICANTE en
 * AliExpress, uno por beneficio.
 *
 * Medido en local el mismo día:
 *   - La búsqueda ordenada por ventas se lee sin navegador visible.
 *   - Algunas fichas traen video del fabricante (mp4 en video.aliexpress-media.com).
 *   - La búsqueda por TEXTO trae modelos parecidos, no iguales: el primer video
 *     que salió para "mochila burbuja" era otra mochila (azul, tipo astronauta).
 *     Por eso NADA entra sin que la visión confirme que es el mismo producto
 *     que la foto del proveedor, y sin logos ni marcas de agua de otra tienda.
 *
 * Qué NO hace: no toma anuncios ni videos grabados por otros vendedores
 * (TikTok, biblioteca de anuncios); solo la ficha del fabricante en AliExpress.
 * Nada se usa en la landing hasta que el dueño lo aprueba (activosFabricante.aprobado).
 */
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db, products } from "@workspace/db";
import { logger } from "./logger";
import { getImageStoreDir } from "./image-store";

export interface Candidato { id: string; vendidos: number; vendidosTexto: string; titulo: string }
export interface ActivosFabricante {
  en: string;
  consulta: string;
  revisados: number;
  fuentes: Array<{ itemId: string; url: string; vendidos: string; fotos: number; video: boolean }>;
  fotos: string[];
  clips: string[];
  videoOriginal?: string;
  aprobado?: boolean;
  descartados: Array<{ itemId: string; motivo: string }>;
}

// ─── Lectura de AliExpress (funciones puras, con prueba) ────────────────────

/** "3.000+ vendidos" → 3000; "311 vendidos" → 311. */
export function vendidosDe(texto: string): number {
  const m = String(texto || "").replace(/\./g, "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Candidatos de la página de búsqueda (el JSON va embebido en el HTML), ordenados por ventas. */
export function candidatosDeBusqueda(html: string): Candidato[] {
  const vistos = new Map<string, Candidato>();
  for (const m of html.matchAll(/"productId":"(\d+)"/g)) {
    const id = m[1]!;
    if (vistos.has(id)) continue;
    const tramo = html.slice(m.index!, m.index! + 6000);
    const tr = tramo.match(/"tradeDesc":"([^"]+)"/)?.[1] || "";
    const ti = tramo.match(/"displayTitle":"([^"]{0,160})"/)?.[1] || tramo.match(/"title":"([^"]{0,160})"/)?.[1] || "";
    vistos.set(id, { id, vendidos: vendidosDe(tr), vendidosTexto: tr, titulo: ti });
  }
  return [...vistos.values()].sort((a, b) => b.vendidos - a.vendidos);
}

/**
 * Foto de la galería en tamaño completo.
 *
 * AliExpress sirve la MISMA foto en tres formas de miniatura, y las tres hay
 * que saber desarmarlas o se baja el cuadradito borroso:
 *   1. por sufijo:  "foto.jpg_220x220q75.jpg_.avif" → "foto.jpg"
 *   2. por ruta:    ".../Sabc123/96x96.png"         → ".../Sabc123.png"
 *   3. con basura:  "...96x96.png)"  ← así viene en el HTML/JS embebido
 *
 * El `.avif` faltaba en la lista: AliExpress ya sirve fotos en ese formato, y
 * al no reconocerlo se bajaba la miniatura tal cual (medido 2026-10-02).
 */
export function fotoGrande(url: string): string {
  const EXT = "jpe?g|png|webp|avif|gif";
  let u = String(url || "")
    .trim()
    .replace(/^["'`(\[]+/, "") // delimitadores de apertura (vienen del HTML/JS)
    .replace(/[)"',;\\\]]+$/, ""); // y de cierre
  u = u.split("?")[0]!;
  if (u.startsWith("//")) u = "https:" + u;
  u = u.replace(new RegExp(`(\\.(?:${EXT}))_[^/]*$`, "i"), "$1");
  u = u.replace(new RegExp(`/\\d{2,4}x\\d{2,4}(\\.(?:${EXT}))$`, "i"), "$1");
  return u;
}

/** Qué es de verdad el archivo, por su firma (magic bytes). */
export type TipoDeArchivo = "imagen" | "video" | "html" | "otro";

/**
 * Mira los PRIMEROS bytes, no la extensión de la URL.
 *
 * Por qué existe: `bajar()` solo miraba el tamaño, así que una respuesta de
 * AliExpress con **HTTP 200 y `content-type: text/html`** (muro de login,
 * captcha o redirección) pasaba el filtro y se guardaba COMO `.mp4` o `.jpg`.
 * Eso es exactamente lo que llegaba a la landing como "video dañado" o "imagen
 * mala". Medido el 2026-10-02: una ficha de AliExpress devuelve 200 + 73 KB de
 * HTML y el filtro viejo la aceptaba.
 */
export function tipoDeArchivo(buf: Buffer): TipoDeArchivo {
  if (!buf || buf.length < 12) return "otro";
  const h = buf.subarray(0, 24);
  const hex = h.toString("hex");
  const ascii = (a: number, b: number) => h.toString("ascii", a, b);

  // Imágenes
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "imagen"; // JPEG
  if (hex.startsWith("89504e47")) return "imagen"; // PNG
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "imagen"; // WEBP
  if (ascii(0, 3) === "GIF") return "imagen"; // GIF
  // AVIF/HEIC comparten el contenedor `ftyp` con MP4: los separa la MARCA.
  if (ascii(4, 8) === "ftyp") {
    const marca = ascii(8, 12);
    if (marca === "avif" || marca === "avis" || marca === "heic" || marca === "heix" || marca === "mif1") return "imagen";
    return "video"; // isom, mp42, avc1, M4V …, etc.
  }
  // Videos
  if (hex.startsWith("1a45dfa3")) return "video"; // WebM / MKV
  if (ascii(0, 4) === "OggS") return "video";

  // HTML: lo que llega cuando AliExpress bloquea, pide login o redirige.
  const inicio = buf.subarray(0, 300).toString("utf8").trimStart().toLowerCase();
  if (/^<(!doctype|html|head|\?xml)/.test(inicio)) return "html";

  return "otro";
}


/** Solo fotos de producto del CDN de AliExpress (kf/), sin íconos ni banners. */
export function esFotoDeGaleria(url: string): boolean {
  return /aliexpress-media\.com\/kf\/|alicdn\.com\/kf\//i.test(url) && !/\.(gif|svg)/i.test(url);
}

/** Tramos de `seg` segundos repartidos en el video, saltando el primer segundo y el final. */
export function tramosParaClips(duracion: number, cantidad: number, seg = 3): number[] {
  if (!(duracion > seg + 2) || cantidad < 1) return [];
  const util = duracion - seg - 1.5;
  const n = Math.min(cantidad, Math.max(1, Math.floor(util / seg)));
  return Array.from({ length: n }, (_, i) => Math.round((1 + (util - 1) * (n === 1 ? 0.3 : i / (n - 1))) * 10) / 10);
}

/**
 * Consultas de búsqueda: la original en español + su traducción al inglés
 * (idea del dueño 01-10-2026). AliExpress indexa en inglés y con la consulta
 * traducida aparecen fichas que en español no salen. Sin duplicar cuando la
 * traducción es igual o vacía. Pura (testeable).
 */
export function consultasDeBusqueda(consultaEs: string, consultaEn?: string | null): string[] {
  const es = String(consultaEs || "").trim();
  const en = String(consultaEn || "").trim();
  const out = [es];
  if (en && en.toLowerCase() !== es.toLowerCase()) out.push(en);
  return out.filter(Boolean);
}

/**
 * Traduce la consulta a inglés con el proveedor de redacción del negocio.
 * Best-effort y rápido (15 s): si no hay proveedor o falla, null y la
 * búsqueda sigue solo en español. Nunca inventa: solo traduce.
 */
export async function traducirConsultaAingles(tenantId: number, consulta: string): Promise<string | null> {
  const es = String(consulta || "").trim();
  if (!es || /^[a-z0-9\s\-',.()&]+$/i.test(es) && !/[áéíóúñü]/i.test(es)) {
    // Sin tildes ni eñes puede ya estar en inglés o ser marca: igual se
    // intenta, pero si falla no pasa nada (la búsqueda en ES sigue).
  }
  if (!es) return null;
  try {
    const { redactarConProveedores } = await import("./landing/agente-landing");
    const r = await redactarConProveedores({
      tenantId,
      system: "Traducí al inglés lo que te pasan para buscarlo en AliExpress. Respondé SOLO con la traducción, sin comillas ni explicaciones.",
      user: es.slice(0, 120),
      timeoutMs: 15_000,
      maxTokens: 40,
      tarea: "traducir-consulta",
    });
    const en = String(r?.text || "").replace(/^["'«»“”]+|["'«»“”.,;]+$/g, "").trim().split("\n")[0]!.trim();
    if (!en || en.length > 120) return null;
    return en.toLowerCase() === es.toLowerCase() ? null : en;
  } catch {
    return null;
  }
}

// ─── Utilidades de proceso ──────────────────────────────────────────────────

function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`${cmd} superó ${timeoutMs / 1000}s`)); }, timeoutMs);
    p.stdout.on("data", (d) => { out += String(d); });
    p.stderr.on("data", (d) => { err += String(d); });
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? 1, out, err }); });
  });
}

/**
 * Baja un archivo y VERIFICA qué bajó.
 *
 * El bug que esto corrige (2026-10-02): antes solo miraba el status y el
 * TAMAÑO. Una respuesta de AliExpress con HTTP 200 y `text/html` (muro de
 * login, captcha, redirección) pasaba el filtro y se guardaba como `.mp4` o
 * `.jpg` — eso es lo que llegaba a la landing como video dañado o imagen mala.
 * Ahora se exige que la FIRMA (magic bytes) coincida con lo que se fue a
 * buscar, y el HTML se rechaza siempre.
 */
async function bajar(
  url: string,
  destino: string,
  opts: { esperado?: "imagen" | "video"; maxBytes?: number } = {},
): Promise<boolean> {
  const maxBytes = opts.maxBytes ?? 60_000_000;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://es.aliexpress.com/" }, signal: AbortSignal.timeout(90_000) });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2000 || buf.length > maxBytes) return false;

    const tipo = tipoDeArchivo(buf);
    // HTML con 200 es la trampa: por status y tamaño parece un archivo válido.
    if (tipo === "html") {
      logger.warn({ url: url.slice(0, 120) }, "[Fabricante] la URL devolvió HTML en vez de un archivo; se descarta");
      return false;
    }
    if (opts.esperado && tipo !== opts.esperado) {
      logger.warn({ url: url.slice(0, 120), esperado: opts.esperado, llego: tipo }, "[Fabricante] el archivo no es del tipo pedido");
      return false;
    }
    await writeFile(destino, buf);
    return true;
  } catch { return false; }
}

async function duracionDe(archivo: string): Promise<number> {
  const r = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", archivo], 30_000).catch(() => null);
  return Number(r?.out?.trim()) || 0;
}

/**
 * ¿Lo que devolvió ffprobe es un video USABLE?
 *
 * Por qué hace falta, además de mirar la firma: un mp4 **truncado** (descarga
 * cortada a la mitad) o un contenedor con la cabecera bien y el resto roto
 * pasan el chequeo de magic bytes, y después ffmpeg no puede cortarlos: los
 * clips salen vacíos, congelados o con un solo cuadro. Eso era la otra mitad de
 * "videos dañados".
 *
 * Es puro a propósito: la DECISIÓN se prueba sin ffprobe (que no está en CI ni
 * en la máquina de desarrollo).
 */
export function veredictoDeVideo(salidaFfprobe: string): { ok: boolean; duracion: number; motivo?: string } {
  let j: any = null;
  try {
    j = JSON.parse(String(salidaFfprobe || "").trim() || "{}");
  } catch {
    return { ok: false, duracion: 0, motivo: "ffprobe devolvió algo ilegible" };
  }
  const hayVideo = Array.isArray(j?.streams) && j.streams.some((s: any) => s?.codec_type === "video");
  if (!hayVideo) return { ok: false, duracion: 0, motivo: "no tiene pista de video" };
  const d = Number(j?.format?.duration) || 0;
  // Con menos de un segundo no hay tramo de 3 s que cortar: sería un clip vacío.
  if (!(d > 1)) return { ok: false, duracion: d, motivo: `duración ilegible (${d || "sin dato"})` };
  return { ok: true, duracion: d };
}

/** Corre ffprobe y decide con `veredictoDeVideo`. */
export async function videoUtil(archivo: string): Promise<{ ok: boolean; duracion: number; motivo?: string }> {
  const r = await run(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type", "-show_entries", "format=duration", "-of", "json", archivo],
    30_000,
  ).catch(() => null);
  if (!r || r.code !== 0) {
    // ffprobe que falla = archivo que no puede abrir (truncado o roto).
    return { ok: false, duracion: 0, motivo: "ffprobe no pudo abrirlo" };
  }
  return veredictoDeVideo(r.out);
}

// ─── Visión: ¿es el mismo producto? ─────────────────────────────────────────

/**
 * Le muestra a la visión la foto del PROVEEDOR y la candidata. Solo un "SI"
 * explícito cuenta: ante la duda, se descarta (un video de otro modelo en la
 * landing es peor que no tener video).
 */
/**
 * Fotos del proveedor para comparar. `fotosUnicas` es un caché `{ urls: [...] }`,
 * no una lista (leerlo como lista daba "sin foto" en productos que sí tenían).
 */
export function fotosDeReferencia(m: any, imageUrl?: string | null): string[] {
  const listas = [m?.fotosUnicas?.urls, m?.imagenes, m?.imageUrls, [imageUrl]];
  const todas = listas.flatMap((l) => (Array.isArray(l) ? l : [])).filter((u) => typeof u === "string" && u.trim());
  return [...new Set(todas as string[])].slice(0, 3);
}

/**
 * Mayoría contra varias fotos nuestras. Medido 01-10-2026: contra la
 * infografía de Dropi (con rótulos) la visión rechazaba la misma mochila y,
 * en otro intento, aceptaba una distinta; contra la foto limpia acertó 3 de 3.
 * Con 3 referencias hacen falta 2 SÍ (con 1 o 2, todas).
 */
export async function mismoProductoPorMayoria(refs: Buffer[], candidata: Buffer): Promise<{ si: boolean; ref: Buffer | null; motivo: string }> {
  const necesarios = refs.length >= 3 ? 2 : refs.length;
  let si = 0, ultimo = "";
  let primera: Buffer | null = null;
  for (const [i, r] of refs.entries()) {
    const v = await mismoProducto(r, candidata);
    ultimo = v.motivo;
    if (v.si) { si++; primera = primera || r; }
    if (si >= necesarios) return { si: true, ref: primera, motivo: v.motivo };
    if (si + (refs.length - i - 1) < necesarios) break;
  }
  return { si: false, ref: null, motivo: ultimo };
}

/** Solo "VEREDICTO: SI" explícito cuenta; sin veredicto, o con NO, se descarta. */
export function veredictoEsSi(texto: string): boolean {
  const m = String(texto || "").match(/VEREDICTO[\s:：*_]*(S[IÍ]|NO)(?![A-Za-zÁÉÍÓÚáéíóú])/i);
  return !!m && /^S/i.test(m[1]!);
}

export async function mismoProducto(nuestra: Buffer, candidata: Buffer): Promise<{ si: boolean; motivo: string }> {
  const { modelosDeVision, opcionesDeVision } = await import("./media-entrante");
  const { getProviderConfig } = await import("@workspace/integrations-openai-ai-server");
  // Estricta a propósito: con "el color puede variar" el modelo dio por igual una
  // mochila rígida tipo astronauta azul frente a la burbuja de tela negra (01-10-2026).
  const pregunta =
    "Imagen 1: el producto que vendemos. Imagen 2: una foto de otra ficha. Respondé en español.\n"
    + "Compará SOLO lo que se ve en las DOS fotos: ignorá textos, rótulos, flechas, fondo, ángulo y las partes que en una de las dos no se ven.\n"
    + "Paso 1: listá en una línea las diferencias de FORMA del cuerpo, MATERIAL (tela, plástico rígido, etc.), cantidad y posición de PARTES visibles en ambas (ventanas, rejillas, bolsillos, correas) y COLOR.\n"
    + "Paso 2: escribí VEREDICTO: SI solo si es el mismo producto (mismo cuerpo, material y partes; una variante de color del MISMO diseño cuenta como SI). "
    + "Si hay cualquier diferencia de forma, material o partes, o si la imagen 2 tiene logo, marca, marca de agua, TEXTO visible en cualquier idioma (instrucciones, rótulos, precios) o un ACCESORIO/pieza extra que la imagen 1 no tiene, escribí VEREDICTO: NO.\n"
    + "Formato: DIFERENCIAS: ... | VEREDICTO: SI o NO";
  for (const { proveedor, modelo } of modelosDeVision()) {
    const cfg = getProviderConfig(proveedor as any);
    if (!cfg?.apiKey) continue;
    try {
      const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: modelo, max_tokens: 300,
          // Sin esto DeepSeek gasta los tokens razonando y devuelve vacío (medido 01-10-2026).
          ...opcionesDeVision(proveedor),
          messages: [{ role: "user", content: [
            { type: "text", text: pregunta },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${nuestra.toString("base64")}` } },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${candidata.toString("base64")}` } },
          ] }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) { logger.warn({ proveedor, modelo, status: r.status }, "[Fabricante] visión rechazó el pedido"); continue; }
      const j: any = await r.json();
      const t = String(j?.choices?.[0]?.message?.content || "").trim();
      if (!t) { logger.warn({ proveedor, modelo }, "[Fabricante] visión contestó vacío"); continue; }
      return { si: veredictoEsSi(t), motivo: t.slice(0, 220) };
    } catch (e: any) {
      logger.warn({ proveedor, modelo, err: e?.message }, "[Fabricante] visión falló");
    }
  }
  return { si: false, motivo: "ningún modelo de visión respondió" };
}

/** Pasa cualquier imagen a JPEG chico para la visión (webp/png de AliExpress incluidos). */
async function aJpeg(entrada: string, salida: string): Promise<Buffer | null> {
  const r = await run("ffmpeg", ["-y", "-v", "error", "-i", entrada, "-vf", "scale='min(640,iw)':-2", "-frames:v", "1", salida], 30_000).catch(() => null);
  if (!r || r.code !== 0 || !existsSync(salida)) return null;
  return readFile(salida);
}

// ─── GIF / clip (también lo usa Atlas para "haz un gif") ───────────────────

/**
 * Corta clips cuadrados de `seg` segundos, sin audio. mp4 (liviano, se ve
 * como GIF con autoplay+loop) o gif de verdad (más pesado, para WhatsApp).
 */
export async function cortarClips(video: string, destinoBase: string, opts: { cantidad?: number; seg?: number; formato?: "mp4" | "gif"; lado?: number } = {}): Promise<string[]> {
  const seg = opts.seg ?? 3, lado = opts.lado ?? 600, formato = opts.formato ?? "mp4";
  const inicios = tramosParaClips(await duracionDe(video), opts.cantidad ?? 4, seg);
  const salidas: string[] = [];
  for (let i = 0; i < inicios.length; i++) {
    const out = `${destinoBase}-${i + 1}.${formato}`;
    const recorte = `crop='min(iw,ih)':'min(iw,ih)',scale=${lado}:${lado}`;
    const args = formato === "gif"
      ? ["-y", "-v", "error", "-ss", String(inicios[i]), "-t", String(seg), "-i", video, "-vf", `${recorte},fps=12,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer`, "-loop", "0", out]
      : ["-y", "-v", "error", "-ss", String(inicios[i]), "-t", String(seg), "-i", video, "-an", "-vf", recorte, "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out];
    const r = await run("ffmpeg", args, 90_000).catch(() => null);
    if (r?.code === 0 && existsSync(out) && (await stat(out)).size > 5_000) salidas.push(out);
  }
  return salidas;
}

/** Video corto a partir de FOTOS propias (zoom suave, 2.5 s por foto). Para productos sin video. */
export async function videoDeFotos(fotos: string[], salida: string, opts: { lado?: number; segPorFoto?: number; formato?: "mp4" | "gif" } = {}): Promise<boolean> {
  const lado = opts.lado ?? 720, d = opts.segPorFoto ?? 2.5, fps = 25, frames = Math.round(d * fps);
  const lista = fotos.slice(0, 6);
  if (!lista.length) return false;
  // UNA imagen de entrada por foto: zoompan genera `frames` cuadros a partir de ella.
  // Con `-loop 1` cada cuadro de entrada generaba su propia animación (200 MB, medido).
  const entradas = lista.flatMap((f) => ["-i", f]);
  const filtros = lista.map((_, i) => `[${i}:v]scale=${lado * 2}:${lado * 2}:force_original_aspect_ratio=increase,crop=${lado * 2}:${lado * 2},zoompan=z='min(zoom+0.0015,1.12)':d=${frames}:s=${lado}x${lado}:fps=${fps},setsar=1[v${i}]`).join(";");
  const concat = `${lista.map((_, i) => `[v${i}]`).join("")}concat=n=${lista.length}:v=1:a=0[v]`;
  const fin = opts.formato === "gif" ? `;[v]fps=10,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4[out]` : "";
  const args = ["-y", "-v", "error", ...entradas, "-filter_complex", `${filtros};${concat}${fin}`, "-map", opts.formato === "gif" ? "[out]" : "[v]",
    ...(opts.formato === "gif" ? ["-loop", "0"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]), salida];
  const r = await run("ffmpeg", args, 180_000).catch(() => null);
  return !!r && r.code === 0 && existsSync(salida);
}

// ─── Almacenamiento y URLs públicas ─────────────────────────────────────────

export function dirFabricante(): string { return path.join(getImageStoreDir(), "fabricante"); }
export function urlPublicaFabricante(archivo: string): string {
  const app = (process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "");
  return `${app}/media/fabricante/${path.basename(archivo)}`;
}
/** Nombre de archivo que acepta la ruta pública (evita servir cualquier cosa). */
export const ARCHIVO_FABRICANTE = /^\d+-[a-z0-9-]+\.(?:mp4|gif|jpg)$/i;

// ─── El proceso completo ────────────────────────────────────────────────────

async function lanzarNavegador(): Promise<any> {
  const puppeteer: any = (await import("puppeteer")).default;
  return puppeteer.launch({
    headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--lang=es-CO"], timeout: 30_000, protocolTimeout: 120_000,
  });
}

async function leerFicha(nav: any, id: string): Promise<{ fotos: string[]; videos: string[]; titulo: string }> {
  const pag = await nav.newPage();
  const videos = new Set<string>();
  try {
    await pag.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36");
    pag.on("response", (r: any) => { const u = String(r.url()); if (/\.mp4(\?|$)/i.test(u) && /aliexpress-media|alicdn/i.test(u)) videos.add(u.split("?")[0]!); });
    await pag.goto(`https://es.aliexpress.com/item/${id}.html`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
    const dom = await pag.evaluate(() => ({
      // SOLO la galería del producto (medido 01-10-2026): las miniaturas viven en
      // `slider--img`, la grande en `magnifier--image`. El resto de `kf/` son
      // íconos, fotos de COMPRADORES (list-customer-show, no se usan) y otros productos.
      imgs: Array.from(document.querySelectorAll('[class*="slider--img"] img, img[class*="magnifier--image"]')).map((i: any) => i.currentSrc || i.src).filter(Boolean),
      vids: Array.from(document.querySelectorAll("video, video source")).map((v: any) => v.currentSrc || v.src).filter(Boolean),
      titulo: document.title,
    }));
    dom.vids.forEach((v: string) => { if (/\.mp4/i.test(v)) videos.add(v.split("?")[0]!); });
    const fotos = [...new Set(dom.imgs.filter(esFotoDeGaleria).map(fotoGrande))].slice(0, 10);
    return { fotos, videos: [...videos], titulo: dom.titulo };
  } finally {
    await pag.close().catch(() => {});
  }
}

export async function buscarActivosDelFabricante(tenantId: number, productId: number, opts: { consulta?: string; maxFichas?: number } = {}): Promise<{ ok: boolean; error?: string; activos?: ActivosFabricante }> {
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
  if (!p) return { ok: false, error: `No encontré el producto ${productId}.` };
  let m: any = {};
  try { m = typeof p.metadata === "string" ? JSON.parse(p.metadata as any) : (p.metadata || {}); } catch { m = {}; }
  const nuestras = fotosDeReferencia(m, p.imageUrl);
  if (!nuestras.length) return { ok: false, error: "El producto no tiene foto del proveedor: sin ella no puedo comprobar que sea el mismo producto." };
  const r = await buscarActivos(productId, nuestras, String(opts.consulta || p.name || "").trim(), { ...opts, tenantId });
  if (r.ok && r.activos) {
    await db.update(products).set({ metadata: JSON.stringify({ ...m, activosFabricante: r.activos }) } as any).where(eq(products.id, productId));
    logger.info({ tenantId, productId, revisados: r.activos.revisados, fotos: r.activos.fotos.length, clips: r.activos.clips.length }, "[Fabricante] activos buscados");
  }
  return r;
}

/** El núcleo, sin base de datos: busca, compara con visión, baja y corta. */
export async function buscarActivos(productId: number, fotosNuestras: string[], consulta: string, opts: { maxFichas?: number; tenantId?: number } = {}): Promise<{ ok: boolean; error?: string; activos?: ActivosFabricante }> {
  const tmp = path.join(os.tmpdir(), `fabricante-${productId}-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  await mkdir(dirFabricante(), { recursive: true });
  const activos: ActivosFabricante = { en: new Date().toISOString(), consulta, revisados: 0, fuentes: [], fotos: [], clips: [], descartados: [] };
  const nav = await lanzarNavegador();
  try {
    // 1. Nuestra foto, en JPEG chico, como referencia para la visión.
    const app = (process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "");
    const refBruta = path.join(tmp, "ref-bruta");
    const refs: Buffer[] = [];
    for (const [i, u] of fotosNuestras.slice(0, 3).entries()) {
      if (!(await bajar(/^https?:/i.test(u) ? u : `${app}${u}`, `${refBruta}-${i}`, { esperado: "imagen" }))) continue;
      const j = await aJpeg(`${refBruta}-${i}`, path.join(tmp, `ref-${i}.jpg`));
      if (j) refs.push(j);
    }
    if (!refs.length) return { ok: false, error: "No pude bajar la foto del proveedor para comparar." };

    // 2. Búsqueda ordenada por ventas.
    const pag = await nav.newPage();
    await pag.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36");
    await pag.goto(`https://www.aliexpress.com/w/wholesale-${encodeURIComponent(consulta.replace(/\s+/g, "-"))}.html?SortType=total_tranpro_desc`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const candidatos = candidatosDeBusqueda(await pag.content());
    await pag.close().catch(() => {});

    // 2b. API oficial de afiliados (sin scraping, sin captcha) con la consulta
    // en español + traducida al inglés (01-10-2026). Sus fichas entran al
    // MISMO circuito de verificación por visión de abajo: la API también trae
    // modelos parecidos, no iguales. Solo si el negocio conectó AliExpress.
    interface FichaLista { id: string; url: string; vendidosTexto: string; fotos: string[]; videos: string[] }
    const fichasApi: FichaLista[] = [];
    let consultaEn: string | null = null;
    if (opts.tenantId) {
      try {
        const { leerCredenciales } = await import("./integraciones/credenciales");
        const cred: any = await leerCredenciales(opts.tenantId, "aliexpress");
        if (cred?.tienda && cred?.token) {
          consultaEn = await traducirConsultaAingles(opts.tenantId, consulta);
          const { buscarProductos, detalleProductos } = await import("./integraciones/aliexpress");
          const vistas = new Set<string>();
          for (const q of consultasDeBusqueda(consulta, consultaEn)) {
            let encontrados: any[] = [];
            try {
              encontrados = await buscarProductos(
                { appKey: cred.tienda, appSecret: cred.token, trackingId: cred.secreto },
                q, { porPagina: 8, moneda: cred.moneda || "COP" },
              );
            } catch (e: any) {
              logger.warn({ err: String(e?.message || e).slice(0, 150) }, "[Fabricante] la API de AliExpress no buscó");
              continue;
            }
            const ids = encontrados.map((p) => p.idExterno).filter((id) => id && !vistas.has(id)).slice(0, 6);
            ids.forEach((id) => vistas.add(id));
            if (!ids.length) continue;
            let detalles: any[] = [];
            try {
              detalles = await detalleProductos({ appKey: cred.tienda, appSecret: cred.token, trackingId: cred.secreto }, ids, cred.moneda || "COP");
            } catch { continue; }
            for (const d of detalles) {
              fichasApi.push({
                id: `api-${d.idExterno}`,
                url: d.urlOrigen || `https://es.aliexpress.com/item/${d.idExterno}.html`,
                vendidosTexto: String((d.extra as any)?.vendidos ?? ""),
                fotos: d.imagenes,
                videos: d.videoUrl ? [d.videoUrl] : [],
              });
            }
            if (fichasApi.length >= 8) break;
          }
          if (consultaEn) activos.consulta = `${consulta} / EN: ${consultaEn}`;
        }
      } catch { /* sin API: sigue el scraping */ }
    }
    if (!candidatos.length && !fichasApi.length) return { ok: false, error: "AliExpress no devolvió resultados (puede ser un captcha desde el servidor)." };

    // 3. Fichas, de la más vendida para abajo, hasta juntar video + fotos que pasen la visión.
    // Las de la API oficial ya traen fotos/videos (sin scraping): entran a la
    // MISMA verificación por visión que las scrapeadas.
    let n = 0;
    const huellas = new Set<string>();
    const fichas: Array<{ id: string; url: string; vendidosTexto: string; preficha?: { fotos: string[]; videos: string[] } }> = [
      ...candidatos.slice(0, opts.maxFichas ?? 12).map((c) => ({ id: c.id, url: `https://es.aliexpress.com/item/${c.id}.html`, vendidosTexto: c.vendidosTexto })),
      ...fichasApi.map((f) => ({ id: f.id, url: f.url, vendidosTexto: f.vendidosTexto, preficha: { fotos: f.fotos, videos: f.videos } })),
    ];
    for (const c of fichas) {
      if (activos.clips.length && activos.fotos.length >= 6) break;
      activos.revisados++;
      const f = c.preficha ?? await leerFicha(nav, c.id).catch(() => null);
      if (!f || (!f.fotos.length && !f.videos.length)) { activos.descartados.push({ itemId: c.id, motivo: "sin fotos ni video legibles" }); continue; }
      // ¿Es el mismo producto? Se mira la foto principal de la ficha.
      const principal = path.join(tmp, `${c.id}-principal`);
      const jpg = f.fotos[0] && (await bajar(f.fotos[0], principal, { esperado: "imagen" })) ? await aJpeg(principal, `${principal}.jpg`) : null;
      if (!jpg) { activos.descartados.push({ itemId: c.id, motivo: "no se pudo leer su foto principal" }); continue; }
      const igual = await mismoProductoPorMayoria(refs, jpg);
      const ref = igual.ref;
      if (!igual.si || !ref) { activos.descartados.push({ itemId: c.id, motivo: igual.motivo }); continue; }
      const fuente = { itemId: c.id, url: c.url, vendidos: c.vendidosTexto, fotos: 0, video: false };

      // Fotos de esa ficha: cada una se vuelve a comprobar (las fichas mezclan variantes y banners).
      for (const u of f.fotos) {
        if (activos.fotos.length >= 8) break;
        const bruta = path.join(tmp, `${c.id}-f${++n}`);
        if (!(await bajar(u, bruta, { esperado: "imagen" }))) continue;
        // Las fichas de distintos vendedores repiten las MISMAS fotos (medido: 4 de 4 iguales).
        const huella = createHash("sha1").update(await readFile(bruta)).digest("hex");
        if (huellas.has(huella)) continue;
        huellas.add(huella);
        const j = await aJpeg(bruta, `${bruta}.jpg`);
        if (!j || !(await mismoProducto(ref, j)).si) continue;
        const destino = path.join(dirFabricante(), `${productId}-foto-${activos.fotos.length + 1}.jpg`);
        const r = await run("ffmpeg", ["-y", "-v", "error", "-i", bruta, "-vf", "scale='min(1200,iw)':-2", "-q:v", "3", "-frames:v", "1", destino], 30_000).catch(() => null);
        if (r?.code === 0) { activos.fotos.push(urlPublicaFabricante(destino)); fuente.fotos++; }
      }

      // Video: se comprueba un fotograma antes de cortar.
      if (!activos.clips.length) {
        for (const v of f.videos.slice(0, 2)) {
          const vid = path.join(tmp, `${c.id}.mp4`);
          if (!(await bajar(v, vid, { esperado: "video" }))) continue;
          // Un mp4 truncado pasa la firma y no se puede cortar: se caza acá,
          // antes de gastar el corte, y con el motivo real (antes se reportaba
          // como "muestra otro producto", que era mentira).
          const util = await videoUtil(vid);
          if (!util.ok) { activos.descartados.push({ itemId: c.id, motivo: `video ilegible: ${util.motivo}` }); continue; }
          const cuadro = path.join(tmp, `${c.id}-cuadro.jpg`);
          const d = util.duracion;
          await run("ffmpeg", ["-y", "-v", "error", "-ss", String(Math.min(3, d / 3)), "-i", vid, "-frames:v", "1", "-vf", "scale=640:-2", cuadro], 30_000).catch(() => null);
          if (!existsSync(cuadro) || !(await mismoProducto(ref, await readFile(cuadro))).si) { activos.descartados.push({ itemId: c.id, motivo: "su video muestra otro producto" }); continue; }
          const clips = await cortarClips(vid, path.join(dirFabricante(), `${productId}-clip`), { cantidad: 4 });
          activos.clips = clips.map(urlPublicaFabricante);
          activos.videoOriginal = v;
          fuente.video = activos.clips.length > 0;
          break;
        }
      }
      if (fuente.fotos || fuente.video) activos.fuentes.push(fuente);
    }
    return { ok: true, activos };
  } catch (e: any) {
    logger.error({ productId, err: e?.message }, "[Fabricante] falló");
    return { ok: false, error: String(e?.message || e) };
  } finally {
    await nav.close().catch(() => {});
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

const enCurso = new Map<number, Promise<unknown>>();
export function buscarActivosEnSegundoPlano(tenantId: number, productId: number, alTerminar?: (r: { ok: boolean; error?: string; activos?: ActivosFabricante }) => void, opts?: { consulta?: string }): "iniciado" | "ya_en_curso" {
  if (enCurso.has(productId)) return "ya_en_curso";
  const p = buscarActivosDelFabricante(tenantId, productId, opts).then((r) => { try { alTerminar?.(r); } catch { /* aviso opcional */ } }).finally(() => enCurso.delete(productId));
  enCurso.set(productId, p);
  return "iniciado";
}
export function activosEnCurso(productId: number): boolean { return enCurso.has(productId); }

// ─── Para las herramientas de Atlas ─────────────────────────────────────────

/** Metadata del producto (del negocio) + `__imageUrl`; null si no es de ese negocio. */
export async function metadataDelProducto(tenantId: number, productId: number): Promise<any | null> {
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
  if (!p) return null;
  let m: any = {};
  try { m = typeof p.metadata === "string" ? JSON.parse(p.metadata as any) : (p.metadata || {}); } catch { m = {}; }
  return { ...m, __imageUrl: p.imageUrl || null };
}

export async function guardarMetadata(tenantId: number, productId: number, m: any): Promise<void> {
  const { __imageUrl, ...limpio } = m || {};
  void __imageUrl;
  await db.update(products).set({ metadata: JSON.stringify(limpio) } as any).where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));
}

/** GIF/mp4 de 3 s cortados de un video (URL). Devuelve las URLs públicas. */
export async function gifDeVideo(productId: number, videoUrl: string, opts: { formato?: "gif" | "mp4"; cantidad?: number } = {}): Promise<string[]> {
  const tmp = path.join(os.tmpdir(), `gif-${productId}-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  await mkdir(dirFabricante(), { recursive: true });
  try {
    const local = path.join(tmp, "v.mp4");
    if (!(await bajar(videoUrl, local, { esperado: "video", maxBytes: 200_000_000 }))) return [];
    const salidas = await cortarClips(local, path.join(dirFabricante(), `${productId}-gif-${Date.now()}`), { cantidad: opts.cantidad ?? 3, formato: opts.formato ?? "gif", lado: opts.formato === "mp4" ? 600 : 480 });
    return salidas.map(urlPublicaFabricante);
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** GIF/mp4 con zoom suave a partir de las fotos del producto (URLs absolutas o /images/...). */
export async function gifDeFotos(productId: number, fotos: string[], opts: { formato?: "gif" | "mp4" } = {}): Promise<string[]> {
  const app = (process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "");
  const tmp = path.join(os.tmpdir(), `gif-fotos-${productId}-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  await mkdir(dirFabricante(), { recursive: true });
  try {
    const locales: string[] = [];
    for (const [i, u] of fotos.slice(0, 6).entries()) {
      const d = path.join(tmp, `f${i}`);
      if (await bajar(/^https?:/i.test(u) ? u : `${app}${u}`, d, { esperado: "imagen" })) locales.push(d);
    }
    if (!locales.length) return [];
    const formato = opts.formato ?? "gif";
    const salida = path.join(dirFabricante(), `${productId}-gif-${Date.now()}-1.${formato}`);
    return (await videoDeFotos(locales, salida, { formato, lado: formato === "gif" ? 360 : 720, segPorFoto: 2 })) ? [urlPublicaFabricante(salida)] : [];
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** Lo que la landing puede usar: solo si el dueño lo aprobó. */
export function activosAprobados(metadata: unknown): { fotos: string[]; clips: string[] } {
  let m: any = metadata;
  try { if (typeof m === "string") m = JSON.parse(m); } catch { m = {}; }
  const a = m?.activosFabricante;
  if (!a?.aprobado) return { fotos: [], clips: [] };
  return { fotos: Array.isArray(a.fotos) ? a.fotos : [], clips: Array.isArray(a.clips) ? a.clips : [] };
}
