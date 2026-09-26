/**
 * Motor propio de videos de anuncio (vertical 1080×1920, 15–30 s).
 *
 * Pedido del dueño (19-09-2026): "si no genera video no me sirve" — Canva
 * Connect no genera video con Pro (Autofill es Enterprise) y ninguna API de
 * video generativo es gratis. Esto lo hace todo con lo que ya hay en el
 * servidor, a costo cero:
 *
 *   guion por escenas (modelos gratuitos primero) →
 *   escenas compuestas en Chromium (tipografía real, color de marca, foto del
 *   producto, precio, CTA) → capturas 1080×1920 →
 *   B-roll real de Pexels (gratis, uso comercial) si hay clave →
 *   voz en off es-CO (Edge TTS, ya integrado) →
 *   ffmpeg: movimiento (Ken Burns), transiciones, mezcla de audio → MP4 H.264.
 *
 * Sale en `IMAGE_STORE_DIR/videos/anuncios/<productId>-<ts>.mp4`, servido por
 * `/videos/anuncios/:archivo`, y se anota en `products.metadata.videoAnuncio`.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { db, products } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { selectVideoAIProviders } from "./video-providers";
import { buildMotionPrompt, shouldAnimateMotionScene } from "./video-motion-prompt";

export interface EscenaDeVideo {
  /** Texto grande en pantalla (≤ 8 palabras). */
  texto: string;
  /** Lo que dice la voz (1–2 frases). */
  locucion: string;
  /** Qué mostrar: "producto" (foto), "broll" (clip de Pexels con esta búsqueda en inglés) */
  visual: "producto" | "broll";
  busqueda?: string;
  /** Segundos mínimos. */
  duracion: number;
}

export interface GuionDeVideo {
  escenas: EscenaDeVideo[];
  precio: string;
  cta: string;
  autor?: string;
}

export interface VideoGenerado {
  archivo: string;
  url: string;
  duracion: number;
  escenas: number;
  conBroll: boolean;
  i2vScenes?: number;
  i2vProviders?: string[];
  guion: GuionDeVideo;
  en: string;
}

const ANCHO = 1080, ALTO = 1920, FPS = 30, CRUCE = 0.4;

function dirVideos(): string {
  const base = process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "data/images");
  return path.join(base, "videos", "anuncios");
}

function run(cmd: string, args: string[], timeoutMs = 180_000): Promise<{ code: number; out: string; err: string }> {
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

export async function hayFfmpeg(): Promise<boolean> {
  try { return (await run("ffmpeg", ["-version"], 10_000)).code === 0; } catch { return false; }
}

async function duracionDe(archivo: string): Promise<number> {
  const r = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", archivo], 20_000);
  const n = Number(String(r.out).trim());
  return Number.isFinite(n) ? n : 0;
}

// ─── Guion ──────────────────────────────────────────────────────────────────

const SYSTEM_GUION = `Sos director creativo de anuncios de video verticales (TikTok/Reels/Meta) para productos de dropshipping en Colombia.
Escribís guiones de 5 o 6 escenas, 18 a 28 segundos en total, en español colombiano cercano (vos/tú neutro, sin "vosotros").
Reglas: nada inventado (solo lo que dicen los datos), sin garantías ni cifras que no estén, sin marcas ajenas, sin promesas médicas.
Estructura: 1) gancho con el problema (broll), 2) el producto como solución (producto), 3-4) beneficios concretos (producto), 5) precio y pago contraentrega (producto), 6) llamado a la acción (producto).
Devolvés SOLO JSON:
{"escenas":[{"texto":"≤8 palabras en pantalla","locucion":"1-2 frases habladas","visual":"producto|broll","busqueda":"inglés, 2-4 palabras, solo si visual=broll","duracion":3}],"precio":"$59.999","cta":"Escríbenos por WhatsApp"}`;

function guionDeRespaldo(p: any, ficha: any, modelo: string): GuionDeVideo {
  const precio = `$${Number(p.price || 0).toLocaleString("es-CO")}`;
  const beneficio = String(ficha?.beneficioPrincipal || "").trim();
  const car = (Array.isArray(ficha?.caracteristicas) ? ficha.caracteristicas : (p.features || [])).map((c: string) => String(c).replace(/^[^\p{L}\p{N}]+/u, "").trim()).filter(Boolean);
  const cta = modelo === "fisico" ? "Pedilo por WhatsApp, pagás al recibir" : "Escribinos por WhatsApp";
  return {
    precio, cta,
    escenas: [
      { texto: beneficio ? beneficio.split(/[.,]/)[0]!.slice(0, 60) : `¿Buscás ${p.name}?`, locucion: beneficio || `Esto es ${p.name}.`, visual: "broll", busqueda: "person problem lifestyle", duracion: 3.5 },
      { texto: String(p.name).slice(0, 50), locucion: `${p.name}: la solución práctica que llega a tu casa.`, visual: "producto", duracion: 3.5 },
      ...car.slice(0, 2).map((c: string) => ({ texto: c.slice(0, 50), locucion: c, visual: "producto" as const, duracion: 3.5 })),
      { texto: `${precio} · Pago contraentrega`, locucion: `Solo ${precio}, y lo pagás cuando lo recibís.`, visual: "producto", duracion: 3.5 },
      { texto: cta, locucion: `${cta}. Envío a todo el país.`, visual: "producto", duracion: 3.5 },
    ],
    autor: "respaldo",
  };
}

export async function escribirGuion(tenantId: number, p: any, ficha: any, modelo: string, copies?: any): Promise<GuionDeVideo> {
  try {
    const { redactarConProveedores, ORDEN_GRATUITOS_PRIMERO } = await import("./landing/agente-landing");
    const datos = [
      `Producto: ${p.name}`, `Precio: $${Number(p.price || 0).toLocaleString("es-CO")} COP`,
      `Modelo: ${modelo === "fisico" ? "físico, pago contraentrega, envío a todo Colombia" : modelo}`,
      ficha?.beneficioPrincipal ? `Beneficio principal: ${ficha.beneficioPrincipal}` : "",
      `Características: ${(ficha?.caracteristicas || p.features || []).slice(0, 6).join(" | ")}`,
      ficha?.descripcion ? `Descripción: ${String(ficha.descripcion).slice(0, 500)}` : "",
      copies?.ganchos?.length ? `Ganchos ya aprobados: ${copies.ganchos.join(" | ")}` : "",
      copies?.guionVideo ? `Guion previo (orientativo): ${copies.guionVideo}` : "",
    ].filter(Boolean).join("\n");
    const r = await redactarConProveedores({
      tenantId, system: SYSTEM_GUION, user: datos, timeoutMs: 40_000, maxTokens: 1200, orden: ORDEN_GRATUITOS_PRIMERO, tarea: "guion-video",
      validar: (t) => { try { const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); return Array.isArray(j.escenas) && j.escenas.length >= 4; } catch { return false; } },
    });
    if (r.text) {
      const j = JSON.parse(r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1));
      const escenas: EscenaDeVideo[] = j.escenas.slice(0, 6).map((e: any) => ({
        texto: String(e.texto || "").trim().slice(0, 70),
        locucion: String(e.locucion || "").trim().slice(0, 220),
        visual: e.visual === "broll" ? "broll" : "producto",
        busqueda: e.busqueda ? String(e.busqueda).trim().slice(0, 60) : undefined,
        duracion: Math.min(6, Math.max(2.5, Number(e.duracion) || 3.5)),
      })).filter((e: EscenaDeVideo) => e.texto && e.locucion);
      if (escenas.length >= 4) return { escenas, precio: String(j.precio || `$${Number(p.price || 0).toLocaleString("es-CO")}`), cta: String(j.cta || "Escribinos por WhatsApp"), autor: r.proveedor ? `${r.proveedor}/${r.modelo}` : undefined };
    }
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[VideoAnuncio] el guion por IA falló; se usa el de respaldo");
  }
  return guionDeRespaldo(p, ficha, modelo);
}

// ─── B-roll gratis (Pexels) ─────────────────────────────────────────────────

async function clavePexels(tenantId: number): Promise<string | null> {
  try {
    const { clavesDelTenant } = await import("./ai-keys-tenant");
    const k = (await clavesDelTenant(tenantId))?.pexels?.apiKey;
    if (k) return k;
  } catch { /* sin clave del negocio */ }
  return process.env.PEXELS_API_KEY || null;
}

/** Baja un clip vertical corto de Pexels para la búsqueda; null si no hay clave o resultado. */
async function brollDePexels(tenantId: number, busqueda: string, destino: string): Promise<string | null> {
  const clave = await clavePexels(tenantId);
  if (!clave || !busqueda) return null;
  try {
    const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(busqueda)}&orientation=portrait&size=medium&per_page=5`, { headers: { Authorization: clave }, signal: AbortSignal.timeout(15_000) });
    const j: any = await r.json().catch(() => ({}));
    const videos: any[] = Array.isArray(j?.videos) ? j.videos : [];
    for (const v of videos) {
      const archivos: any[] = Array.isArray(v.video_files) ? v.video_files : [];
      const cand = archivos.filter((f) => /mp4/i.test(f.file_type || "") && Number(f.height) >= Number(f.width)).sort((a, b) => Math.abs(Number(a.height) - 1920) - Math.abs(Number(b.height) - 1920))[0];
      if (!cand?.link) continue;
      const f = await fetch(cand.link, { signal: AbortSignal.timeout(40_000) });
      if (!f.ok) continue;
      await writeFile(destino, Buffer.from(await f.arrayBuffer()));
      return destino;
    }
  } catch (e: any) {
    logger.warn({ busqueda, err: e?.message }, "[VideoAnuncio] Pexels no respondió");
  }
  return null;
}

// ─── Escenas en Chromium ────────────────────────────────────────────────────

function htmlDeEscena(e: EscenaDeVideo, i: number, total: number, ctx: { foto: string | null; color: string; marca: string; precio: string; cta: string; modelo: string; overlayOnly?: boolean }): string {
  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ultima = i === total - 1;
  const broll = e.visual === "broll";
  // Tarjeta de precio en la penúltima escena, salvo que el texto ya lo diga.
  const conTarjetaPrecio = !ultima && i === total - 2 && !/\$\s?\d/.test(e.texto);
  const tinta = "#FFFFFF";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${ANCHO}px;height:${ALTO}px;overflow:hidden;font-family:"Liberation Sans",Arial,Helvetica,sans-serif;color:${tinta}}
  body{background:${ctx.overlayOnly ? "transparent" : (broll ? "transparent" : `radial-gradient(120% 80% at 50% 0%, ${ctx.color} 0%, #0B0B14 75%)`)}}
  .velo{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,.05) 30%,rgba(0,0,0,.05) 55%,rgba(0,0,0,.82) 100%)}
  .marca{position:absolute;top:70px;left:0;right:0;text-align:center;font-weight:700;font-size:34px;letter-spacing:3px;text-transform:uppercase;opacity:.9;text-shadow:0 2px 12px rgba(0,0,0,.5)}
  .badge{position:absolute;top:130px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.4);border-radius:999px;padding:14px 34px;font-size:32px;font-weight:700;white-space:nowrap}
  .foto{position:absolute;top:330px;left:90px;width:900px;height:900px;border-radius:44px;background:#fff;box-shadow:0 40px 120px rgba(0,0,0,.55);overflow:hidden;display:flex;align-items:center;justify-content:center}
  .foto img{width:100%;height:100%;object-fit:contain}
  .texto{position:absolute;left:60px;right:60px;top:${broll ? 1150 : 1290}px;font-size:${e.texto.length > 36 ? 84 : 104}px;line-height:1.06;font-weight:800;text-align:center;text-shadow:0 8px 30px rgba(0,0,0,.65);text-wrap:balance}
  .precio{position:absolute;left:50%;transform:translateX(-50%);top:1585px;background:#FFFFFF;color:#111;border-radius:32px;padding:22px 60px;font-size:80px;font-weight:900;box-shadow:0 20px 60px rgba(0,0,0,.4);white-space:nowrap}
  .cta{position:absolute;left:90px;right:90px;top:1620px;background:#25D366;color:#fff;border-radius:999px;padding:34px 20px;text-align:center;font-size:54px;font-weight:800;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  .paso{position:absolute;bottom:56px;left:0;right:0;text-align:center;font-size:26px;opacity:.6;letter-spacing:2px}
  </style></head><body>
  ${broll ? '<div class="velo"></div>' : ""}
  <div class="marca">${esc(ctx.marca)}</div>
  ${ctx.modelo === "fisico" ? '<div class="badge">📦 Pago contraentrega</div>' : ""}
  ${ctx.foto && !broll && !ctx.overlayOnly ? `<div class="foto"><img src="${ctx.foto}"></div>` : ""}
  <div class="texto">${esc(e.texto)}</div>
  ${conTarjetaPrecio ? `<div class="precio">${esc(ctx.precio)}</div>` : ""}
  ${ultima ? `<div class="cta">💬 ${esc(ctx.cta)}</div>` : ""}
  <div class="paso">${i + 1} / ${total}</div>
  </body></html>`;
}

async function capturarEscenas(items: Array<{ e: EscenaDeVideo; i: number; foto: string | null }>, total: number, ctx: { color: string; marca: string; precio: string; cta: string; modelo: string; overlayOnly?: boolean }, dir: string): Promise<string[]> {
  const puppeteer: any = (await import("puppeteer")).default;
  const navegador = await puppeteer.launch({
    headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--lang=es-CO"], timeout: 30_000, protocolTimeout: 90_000,
  });
  try {
    const pagina = await navegador.newPage();
    await pagina.setViewport({ width: ANCHO, height: ALTO, deviceScaleFactor: 1 });
    const salidas: string[] = [];
    for (const it of items) {
      const archivo = path.join(dir, `escena-${it.i}.png`);
      await pagina.setContent(htmlDeEscena(it.e, it.i, total, { ...ctx, foto: it.foto }), { waitUntil: "load", timeout: 30_000 });
      await pagina.screenshot({ path: archivo, type: "png", omitBackground: it.e.visual === "broll" });
      salidas.push(archivo);
    }
    return salidas;
  } finally {
    await navegador.close().catch(() => {});
  }
}

// ─── Image-to-Video IA ───────────────────────────────────────────────────────
async function writeDataUrlToFile(dataUrl: string, destinoSinExt: string): Promise<string | null> {
  try {
    const m = String(dataUrl).match(/^data:(image\\/(?:png|jpeg|webp));base64,(.+)$/s);
    if (!m) return null;
    const ext = m[1] === "image/png" ? ".png" : m[1] === "image/webp" ? ".webp" : ".jpg";
    const destino = destinoSinExt + ext;
    await writeFile(destino, Buffer.from(m[2], "base64"));
    return destino;
  } catch { return null; }
}
async function generarClipI2V(productName: string, scene: EscenaDeVideo, sourceImage: string, outputPath: string) {
  if (process.env.VIDEO_AI_ENABLED !== "true" || !shouldAnimateMotionScene(scene)) return { ok: false as const, error: "I2V desactivado o escena no animable" };
  const { readFile } = await import("node:fs/promises");
  const image = await readFile(sourceImage);
  const mimeType = /\\.png$/i.test(sourceImage) ? "image/png" : /\\.webp$/i.test(sourceImage) ? "image/webp" : "image/jpeg";
  const providers = selectVideoAIProviders((process.env.VIDEO_AI_PROVIDER || "auto") as any);
  if (!providers.length) return { ok: false as const, error: "No hay proveedor I2V disponible" };
  const motion = buildMotionPrompt({ productName, scene });
  for (const provider of providers) {
    try {
      const r = await provider.generateFromImage({ image, mimeType, prompt: motion.prompt, durationSeconds: Math.min(Number(process.env.VIDEO_AI_MAX_DURATION || 8), Math.max(4, Number(scene.duracion || 6))), aspectRatio: "9:16", resolution: "720p", outputPath });
      if (r.ok && r.localPath) return { ok: true as const, provider: r.provider };
      logger.warn({ provider: provider.name, error: r.error }, "[VideoAI] proveedor I2V falló");
    } catch (e: any) { logger.warn({ provider: provider.name, err: e?.message }, "[VideoAI] error de proveedor I2V"); }
  }
  return { ok: false as const, error: "Todos los proveedores I2V fallaron" };
}
async function normalizarClipI2V(origen: string, destino: string, duracion: number) {
  const r = await run("ffmpeg", ["-y", "-i", origen, "-vf", "scale=" + ANCHO + ":" + ALTO + ":force_original_aspect_ratio=increase,crop=" + ANCHO + ":" + ALTO + ",fps=" + FPS + ",format=yuv420p", "-t", String(duracion), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", destino], 240000);
  if (r.code !== 0) throw new Error("ffmpeg normalizar I2V: " + r.err.slice(-500));
}
// ─── Voz ────────────────────────────────────────────────────────────────────

async function vozDe(texto: string, destino: string): Promise<string | null> {
  try {
    const { hablar } = await import("./voz-de-atlas");
    const buf = await hablar(texto);
    if (!buf || buf.length < 500) return null;
    await writeFile(destino, buf);
    return destino;
  } catch { return null; }
}

// ─── Armado con ffmpeg ──────────────────────────────────────────────────────

/**
 * Genera el video completo. `foto` = URL o ruta local de la foto principal.
 */
export async function generarVideoDeAnuncio(tenantId: number, productId: number, opts: { guion?: GuionDeVideo; modelo?: string } = {}): Promise<{ ok: boolean; error?: string; video?: VideoGenerado }> {
  if (!(await hayFfmpeg())) return { ok: false, error: "ffmpeg no está instalado en el servidor (falta en el Dockerfile)." };
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
  if (!p) return { ok: false, error: `No existe el producto ${productId}.` };
  let m: any = {}; try { m = typeof (p as any).metadata === "string" ? JSON.parse((p as any).metadata) : ((p as any).metadata || {}); } catch { /* sin metadata */ }
  const modelo = opts.modelo || ((p as any).kind === "physical" ? "fisico" : "digital");
  const ficha = m?.curado ? { ...m.curado, caracteristicas: (p as any).features, descripcion: (p as any).description, nombre: (p as any).name } : { caracteristicas: (p as any).features, descripcion: (p as any).description, nombre: (p as any).name };

  const { getBusinessContext } = await import("./business-context");
  const negocio: any = await getBusinessContext(tenantId).catch(() => null);
  const { tenants } = await import("@workspace/db");
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const color = String((t as any)?.brandColors?.primary || "#4F46E5");
  const marca = String((t as any)?.brandName || negocio?.businessName || "");

  const guion = opts.guion || await escribirGuion(tenantId, p, ficha, modelo, m?.lanzamiento?.copies);
  const tmp = await mkdirTmp(productId);
  try {
    // Fotos: la principal, única por contenido.
    const { fotosUnicasDelProducto } = await import("./fotos-de-producto");
    const fotos = await fotosUnicasDelProducto(p, { max: 6, timeoutMs: 8000 }).catch(() => [] as string[]);
    const fotosLocales: string[] = [];
    for (let i = 0; i < Math.min(fotos.length, 4); i++) {
      const local = await bajar(fotos[i]!, path.join(tmp, `foto-${i}`));
      if (local) fotosLocales.push(local);
    }
    if (!fotosLocales.length) return { ok: false, error: "El producto no tiene fotos utilizables." };

    // Escenas: capturas + B-roll + voz.
    const escenas = guion.escenas;
    let conBroll = false;
    const brolls: Array<string | null> = [];
    for (let i = 0; i < escenas.length; i++) {
      const e = escenas[i]!;
      const b = e.visual === "broll" ? await brollDePexels(tenantId, e.busqueda || "", path.join(tmp, `broll-${i}.mp4`)) : null;
      if (b) conBroll = true;
      brolls.push(b);
      if (e.visual === "broll" && !b) e.visual = "producto"; // sin clip, se muestra el producto
    }
    // La foto va embebida (data URL): desde about:blank Chrome bloquea file://.
    // Las escenas de producto rotan entre las fotos únicas.
    const dataUrl = async (f: string) => `data:image/${/\.png$/i.test(f) ? "png" : /\.webp$/i.test(f) ? "webp" : "jpeg"};base64,${(await readFile(f)).toString("base64")}`;
    const fotosData = await Promise.all(fotosLocales.map(dataUrl));
    let k = 0;
    const items = escenas.map((e, i) => ({ e, i, foto: e.visual === "producto" ? fotosData[(k++) % fotosData.length]! : null }));
    const capturas = await capturarEscenas(items, escenas.length, { color, marca, precio: guion.precio, cta: guion.cta, modelo }, tmp);
    const capturasOverlay = await capturarEscenas(items.map((it) => ({ e: it.e, i: it.i, foto: null })), escenas.length, { color, marca, precio: guion.precio, cta: guion.cta, modelo, overlayOnly: true }, tmp);

    // Voz por escena y duración real.
    const duraciones: number[] = [];
    const audios: Array<string | null> = [];
    for (let i = 0; i < escenas.length; i++) {
      const voz = await vozDe(escenas[i]!.locucion, path.join(tmp, `voz-${i}.mp3`));
      const dVoz = voz ? await duracionDe(voz) : 0;
      duraciones.push(Math.max(escenas[i]!.duracion, dVoz + 0.9));
      audios.push(voz);
    }

    // Clips de video por escena.
    const clips: string[] = [];
    const i2vProviders = new Set<string>();
    let i2vScenes = 0;
    for (let i = 0; i < escenas.length; i++) {
      const d = duraciones[i]!;
      const salida = path.join(tmp, `clip-${i}.mp4`);
      const frames = Math.round(d * FPS);
      if (i2vScenes < Number(process.env.VIDEO_AI_MAX_SCENES || 3) && items[i]?.foto && process.env.VIDEO_AI_ENABLED === "true" && shouldAnimateMotionScene(escenas[i]!)) {
        const source = await writeDataUrlToFile(items[i]!.foto!, path.join(tmp, "i2v-source-" + i));
        if (source) {
          const raw = path.join(tmp, "i2v-" + i + ".mp4");
          const generated = await generarClipI2V(String(p.name), escenas[i]!, source, raw);
          if (generated.ok) {
            const normalized = path.join(tmp, "i2v-normal-" + i + ".mp4");
            await normalizarClipI2V(raw, normalized, d);
            const overlay = await run("ffmpeg", ["-y", "-i", normalized, "-loop", "1", "-i", capturasOverlay[i]!, "-filter_complex", "[1:v]format=rgba[ov];[0:v][ov]overlay=0:0:format=auto,format=yuv420p[v]", "-map", "[v]", "-t", String(d), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", salida], 240000);
            if (overlay.code !== 0) throw new Error("ffmpeg overlay I2V " + i + ": " + overlay.err.slice(-400));
            clips.push(salida);
            i2vScenes++;
            if (generated.provider) i2vProviders.add(generated.provider);
            continue;
          }
        }
      }
      const zoom = i % 2 === 0 ? `min(zoom+0.0012,1.12)` : `if(eq(on,1),1.12,max(zoom-0.0012,1.0))`;
      if (brolls[i]) {
        // B-roll de fondo + captura (con transparencia) encima.
        const r = await run("ffmpeg", ["-y", "-stream_loop", "-1", "-i", brolls[i]!, "-loop", "1", "-i", capturas[i]!, "-filter_complex",
          `[0:v]scale=${ANCHO}:${ALTO}:force_original_aspect_ratio=increase,crop=${ANCHO}:${ALTO},setsar=1,fps=${FPS}[bg];[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]`,
          "-map", "[v]", "-t", String(d), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", salida], 240_000);
        if (r.code !== 0) throw new Error(`ffmpeg broll ${i}: ${r.err.slice(-400)}`);
      } else {
        const r = await run("ffmpeg", ["-y", "-loop", "1", "-i", capturas[i]!, "-filter_complex",
          `[0:v]scale=${ANCHO * 2}:${ALTO * 2},zoompan=z='${zoom}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${ANCHO}x${ALTO}:fps=${FPS},format=yuv420p[v]`,
          "-map", "[v]", "-t", String(d), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", salida], 240_000);
        if (r.code !== 0) throw new Error(`ffmpeg escena ${i}: ${r.err.slice(-400)}`);
      }
      clips.push(salida);
    }

    // Pista de voz: cada tramo dura (d − cruce) salvo el último, así calza con las transiciones.
    const tramos: string[] = [];
    for (let i = 0; i < escenas.length; i++) {
      const largo = i === escenas.length - 1 ? duraciones[i]! : duraciones[i]! - CRUCE;
      const salida = path.join(tmp, `tramo-${i}.wav`);
      const args = audios[i]
        ? ["-y", "-i", audios[i]!, "-af", `apad`, "-t", String(largo), "-ar", "44100", "-ac", "2", salida]
        : ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(largo), salida];
      const r = await run("ffmpeg", args, 60_000);
      if (r.code !== 0) throw new Error(`ffmpeg audio ${i}: ${r.err.slice(-300)}`);
      tramos.push(salida);
    }
    const listaAudio = path.join(tmp, "audio.txt");
    await writeFile(listaAudio, tramos.map((t) => `file '${t.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
    const pistaVoz = path.join(tmp, "voz.wav");
    let r = await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listaAudio, "-c", "copy", pistaVoz], 60_000);
    if (r.code !== 0) throw new Error(`ffmpeg concat audio: ${r.err.slice(-300)}`);

    // Video: transiciones cruzadas entre clips.
    const entradas = clips.flatMap((c) => ["-i", c]);
    let filtro = "", ultimo = "[0:v]", offset = 0;
    for (let i = 1; i < clips.length; i++) {
      offset += duraciones[i - 1]! - CRUCE;
      const salida = i === clips.length - 1 ? "[v]" : `[x${i}]`;
      filtro += `${ultimo}[${i}:v]xfade=transition=fade:duration=${CRUCE}:offset=${offset.toFixed(3)}${salida};`;
      ultimo = salida;
    }
    if (clips.length === 1) filtro = "[0:v]copy[v];";
    const musica = await pistaDeMusica();
    const audioArgs = musica
      ? ["-i", pistaVoz, "-stream_loop", "-1", "-i", musica, "-filter_complex", `${filtro}[${clips.length + 1}:a]volume=0.12[m];[${clips.length}:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]`, "-map", "[v]", "-map", "[a]"]
      : ["-i", pistaVoz, "-filter_complex", filtro.replace(/;$/, ""), "-map", "[v]", "-map", `${clips.length}:a`];
    await mkdir(dirVideos(), { recursive: true });
    const nombre = `${productId}-${Date.now()}.mp4`;
    const final = path.join(dirVideos(), nombre);
    r = await run("ffmpeg", ["-y", ...entradas, ...audioArgs, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", final], 300_000);
    if (r.code !== 0) throw new Error(`ffmpeg final: ${r.err.slice(-500)}`);

    const duracion = await duracionDe(final);
    const appUrl = (process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "");
    const video: VideoGenerado = { archivo: nombre, url: `${appUrl}/videos/anuncios/${nombre}`, duracion: Math.round(duracion * 10) / 10, escenas: escenas.length, conBroll, i2vScenes, i2vProviders: [...i2vProviders], guion, en: new Date().toISOString() };
    await db.update(products).set({ metadata: JSON.stringify({ ...m, videoAnuncio: video }) } as any).where(eq(products.id, productId));
    logger.info({ tenantId, productId, duracion: video.duracion, escenas: escenas.length, conBroll, guionPor: guion.autor }, "[VideoAnuncio] video generado");
    return { ok: true, video };
  } catch (e: any) {
    logger.error({ tenantId, productId, err: e?.message }, "[VideoAnuncio] falló");
    return { ok: false, error: String(e?.message || e) };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function mkdirTmp(productId: number): Promise<string> {
  const d = path.join(os.tmpdir(), `video-anuncio-${productId}-${Date.now()}`);
  await mkdir(d, { recursive: true });
  return d;
}

async function bajar(url: string, destinoSinExt: string): Promise<string | null> {
  try {
    if (/^\//.test(url) || /^[a-zA-Z]:\\/.test(url)) {
      // Ruta local (p. ej. /images/products/196.jpg → carpeta de imágenes)
      const base = process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "data/images");
      const local = url.startsWith("/images/products/") ? path.join(base, path.basename(url)) : url;
      if (existsSync(local)) return local;
    }
    const abs = /^https?:\/\//i.test(url) ? url : `${(process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
    const r = await fetch(abs, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const tipo = String(r.headers.get("content-type") || "");
    const ext = /png/i.test(tipo) ? ".png" : /webp/i.test(tipo) ? ".webp" : ".jpg";
    const destino = destinoSinExt + ext;
    await writeFile(destino, Buffer.from(await r.arrayBuffer()));
    return (await stat(destino)).size > 1000 ? destino : null;
  } catch { return null; }
}

/** Pista CC0 opcional en `data/musica/*.mp3` (la sube el dueño); si no hay, sin música. */
async function pistaDeMusica(): Promise<string | null> {
  try {
    const dir = process.env.MUSICA_DIR || path.resolve(process.cwd(), "data/musica");
    if (!existsSync(dir)) return null;
    const { readdir } = await import("node:fs/promises");
    const pistas = (await readdir(dir)).filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f));
    if (!pistas.length) return null;
    return path.join(dir, pistas[Math.floor(Math.random() * pistas.length)]!);
  } catch { return null; }
}

export async function leerVideoDeProducto(tenantId: number, productId: number): Promise<VideoGenerado | null> {
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
  if (!p) return null;
  try { const m = typeof (p as any).metadata === "string" ? JSON.parse((p as any).metadata) : ((p as any).metadata || {}); return m?.videoAnuncio || null; } catch { return null; }
}

// Un video por producto a la vez, en segundo plano.
const enCurso = new Map<number, Promise<{ ok: boolean; error?: string; video?: VideoGenerado }>>();
export function generarVideoEnSegundoPlano(tenantId: number, productId: number, alTerminar?: (r: { ok: boolean; error?: string; video?: VideoGenerado }) => void): "iniciado" | "ya_en_curso" {
  if (enCurso.has(productId)) return "ya_en_curso";
  const p = generarVideoDeAnuncio(tenantId, productId).finally(() => enCurso.delete(productId));
  enCurso.set(productId, p);
  void p.then((r) => alTerminar?.(r)).catch(() => {});
  return "iniciado";
}
export function videoEnCurso(productId: number): boolean { return enCurso.has(productId); }
