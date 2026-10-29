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
import { hablarColombiano } from "./hablar-colombiano";
import { db, products } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { runSeguro as runSeguroConnector, hayFfmpegSeguro } from "./ffmpeg-connector";

export interface EscenaDeVideo {
  /** Texto grande en pantalla (≤ 8 palabras). */
  texto: string;
  /** Lo que dice la voz (1–2 frases). */
  locucion: string;
  /** Qué mostrar: "producto" (foto), "broll" (clip de Pexels con esta búsqueda en inglés) */
  visual: "producto" | "broll";
  busqueda?: string;
  /** Para broll: la toma descrita en inglés, una frase, SIN el producto (la usa Sora). */
  toma?: string;
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
  try {
    // Usa conector seguro (allowlist) si está disponible, cae a spawn directo
    const r = await hayFfmpegSeguro().catch(()=> null);
    if (r !== null) return !!r;
    return (await runSeguroConnector("ffmpeg", ["-version"], 10_000)).code === 0;
  } catch { return false; }
}

async function duracionDe(archivo: string): Promise<number> {
  try {
    const r = await runSeguroConnector("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", archivo], 20_000);
    const n = Number(String(r.out).trim());
    if (Number.isFinite(n) && n>0) return n;
  } catch {}
  const r = await runSeguroConnector("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", archivo], 20_000);
  const n = Number(String(r.out).trim());
  return Number.isFinite(n) ? n : 0;
}

// ─── Guion ──────────────────────────────────────────────────────────────────

const SYSTEM_GUION = `Sos director creativo de anuncios de video verticales (TikTok/Reels/Meta) para productos de dropshipping en Colombia.
Escribís guiones de 5 o 6 escenas, 18 a 28 segundos en total, en español colombiano cercano (vos/tú neutro, sin "vosotros").
Reglas: nada inventado (solo lo que dicen los datos), sin garantías ni cifras que no estén, sin marcas ajenas, sin promesas médicas.
Estructura: 1) gancho con el problema (broll), 2) el producto como solución (producto), 3) el resultado que vive la persona (broll), 4) beneficio concreto (producto), 5) precio y pago contraentrega (producto), 6) llamado a la acción (producto).
En las escenas broll NO aparece el producto: solo la persona y la situación (el producto se muestra con sus fotos reales en las otras).
Devolvés SOLO JSON:
{"escenas":[{"texto":"≤8 palabras en pantalla","locucion":"1-2 frases habladas","visual":"producto|broll","busqueda":"inglés, 2-4 palabras, solo si visual=broll","toma":"inglés, una frase que describe la toma real (quién, dónde, qué hace), solo si visual=broll","duracion":3}],"precio":"$59.999","cta":"Escríbenos por WhatsApp"}`;

function guionDeRespaldo(p: any, ficha: any, modelo: string): GuionDeVideo {
  const precio = `$${Number(p.price || 0).toLocaleString("es-CO")}`;
  const beneficio = String(ficha?.beneficioPrincipal || "").trim();
  const car = (Array.isArray(ficha?.caracteristicas) ? ficha.caracteristicas : (p.features || [])).map((c: string) => String(c).replace(/^[^\p{L}\p{N}]+/u, "").trim()).filter(Boolean);
  const cta = modelo === "fisico" ? "Pídelo por WhatsApp y pagas al recibir" : "Escríbenos por WhatsApp";
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
        texto: hablarColombiano(String(e.texto || "").trim()).slice(0, 70),
        locucion: hablarColombiano(String(e.locucion || "").trim()).slice(0, 220),
        visual: e.visual === "broll" ? "broll" : "producto",
        busqueda: e.busqueda ? String(e.busqueda).trim().slice(0, 60) : undefined,
        toma: e.toma ? String(e.toma).trim().slice(0, 300) : undefined,
        duracion: Math.min(6, Math.max(2.5, Number(e.duracion) || 3.5)),
      })).filter((e: EscenaDeVideo) => e.texto && e.locucion);
      if (escenas.length >= 4) return { escenas, precio: String(j.precio || `$${Number(p.price || 0).toLocaleString("es-CO")}`), cta: hablarColombiano(String(j.cta || "Escríbenos por WhatsApp")), autor: r.proveedor ? `${r.proveedor}/${r.modelo}` : undefined };
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

export type RolDeEscena = "gancho" | "producto" | "precio" | "cierre";

/** Qué papel cumple cada escena: abre, muestra, cobra o cierra. */
export function rolDeEscena(e: EscenaDeVideo, i: number, total: number): RolDeEscena {
  if (i === total - 1) return "cierre";
  if (i === 0) return "gancho";
  if (/\$\s?\d/.test(e.texto) || i === total - 2) return "precio";
  return "producto";
}

/**
 * 08-10-2026, el dueño vio el video del corrector: "necesitamos convertir esto
 * en un verdadero video de anuncios". Era una diapositiva repetida 6 veces
 * (foto chica en tarjeta + texto + medio cuadro vacío). Ahora cada escena
 * llena la pantalla (la foto encima de su propia versión difuminada), el texto
 * va como subtítulo resaltado de anuncio, y el diseño cambia por rol.
 */
export function htmlDeEscena(e: EscenaDeVideo, i: number, total: number, ctx: { foto: string | null; detalle?: boolean; color: string; marca: string; precio: string; cta: string; modelo: string; destino: "web" | "whatsapp" }): string {
  // DIOS=1 → render premium real (producto flotante con halo, sello, progress), no diapositiva simple
  if (process.env.DIOS === "1") {
    try {
      const { htmlDeEscenaDios } = require("./agencia/dios/video-render-dios");
      return htmlDeEscenaDios(e as any, i, total, { foto: ctx.foto, fondoLifestyle: ctx.foto, color: ctx.color, marca: ctx.marca, precio: ctx.precio, cta: ctx.cta, modelo: ctx.modelo, destino: ctx.destino });
    } catch {}
  }
  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const broll = e.visual === "broll";
  const rol = rolDeEscena(e, i, total);
  const largo = e.texto.length;
  const tam = rol === "gancho" ? (largo > 30 ? 92 : 112) : (largo > 34 ? 76 : 92);
  const fisico = ctx.modelo === "fisico";
  const botonCierre = ctx.destino === "web"
    ? `<div class="boton web">${esc(ctx.cta)} ›</div>`
    : `<div class="boton wa">💬 ${esc(ctx.cta)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${ANCHO}px;height:${ALTO}px;overflow:hidden;font-family:"Liberation Sans",Arial,Helvetica,sans-serif;color:#fff;background:${broll ? "transparent" : "#0B0B14"}}
  .fondo{position:absolute;inset:-80px;background-size:cover;background-position:center;filter:blur(46px) brightness(.5) saturate(1.2)}
  .foto{position:absolute;left:0;right:0;top:${rol === "gancho" ? 470 : 250}px;height:1180px;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .foto img{width:100%;height:100%;object-fit:${ctx.detalle ? "cover" : "contain"};${ctx.detalle ? "transform:scale(1.25);" : ""}filter:drop-shadow(0 30px 60px rgba(0,0,0,.45))}
  .velo{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 58%,rgba(0,0,0,.85) 100%)}
  .marca{position:absolute;top:64px;left:64px;font-weight:700;font-size:30px;letter-spacing:2px;text-transform:uppercase;opacity:.85}
  .texto{position:absolute;left:56px;right:56px;${rol === "gancho" ? "top:150px" : "bottom:330px"};text-align:center;font-size:${tam}px;line-height:1.18;font-weight:900;text-wrap:balance}
  .texto span{background:${rol === "gancho" ? "#FFD60A" : ctx.color};color:${rol === "gancho" ? "#111" : "#fff"};padding:6px 22px;border-radius:14px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
  .sello{position:absolute;right:70px;top:${rol === "precio" ? 1080 : 1180}px;width:330px;height:330px;border-radius:50%;background:#FFD60A;color:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(-8deg);box-shadow:0 24px 60px rgba(0,0,0,.45);font-weight:900}
  .sello b{font-size:74px;line-height:1}.sello small{font-size:30px;margin-top:6px}
  .cinta{position:absolute;left:0;right:0;bottom:130px;text-align:center}
  .cinta span{display:inline-block;background:#fff;color:#111;font-size:36px;font-weight:800;padding:16px 36px;border-radius:999px;white-space:nowrap}
  .boton{position:absolute;left:80px;right:80px;bottom:150px;border-radius:999px;padding:38px 24px;text-align:center;font-size:56px;font-weight:900;box-shadow:0 20px 60px rgba(0,0,0,.45)}
  .boton.wa{background:#25D366;color:#fff}.boton.web{background:#FFD60A;color:#111}
  .extra{position:absolute;left:0;right:0;bottom:80px;text-align:center;font-size:34px;opacity:.9;font-weight:700}
  </style></head><body>
  ${!broll && ctx.foto ? `<div class="fondo" style="background-image:url('${ctx.foto}')"></div><div class="foto"><img src="${ctx.foto}"></div>` : ""}
  <div class="velo"></div>
  ${ctx.marca ? `<div class="marca">${esc(ctx.marca)}</div>` : ""}
  <div class="texto"><span>${esc(e.texto)}</span></div>
  ${rol === "precio" && !/\$\s?\d/.test(e.texto) ? `<div class="sello"><b>${esc(ctx.precio)}</b>${fisico ? "<small>pagas al recibir</small>" : ""}</div>` : ""}
  ${rol === "precio" && fisico ? `<div class="cinta"><span>📦 Pago contraentrega · Envío a toda Colombia</span></div>` : ""}
  ${rol === "cierre" ? botonCierre : ""}
  ${rol === "cierre" && fisico ? `<div class="extra">📦 Pagas cuando lo recibes</div>` : ""}
  </body></html>`;
}

/**
 * Fotos que NO sirven de escena: tablas de tallas, afiches del proveedor con
 * mucho texto, capturas. En el video del corrector (08-10) la tabla de tallas
 * en inglés salió dos veces, una de ellas con "Alinea tu postura". Se le
 * pregunta al modelo de visión; sin visión, se usan todas (no saber no es
 * motivo para quedarse sin fotos).
 */
export function fotoEsDeTextoSegunVision(descripcion: string | null): boolean {
  const d = String(descripcion || "").toLowerCase().trim();
  if (!d) return false;
  if (/^[^\p{L}]*s[ií]\b/u.test(d)) return true;
  if (/^[^\p{L}]*no\b/u.test(d)) return false;
  return /tabla de tallas|size chart|gu[ií]a de tallas|infograf|mucho texto|afiche/.test(d);
}

async function fotosAptasParaEscena(tenantId: number, locales: string[]): Promise<string[]> {
  try {
    const { describirImagen } = await import("./media-entrante");
    // 08-10: "¿mucho texto?" dejaba pasar una infografía en inglés ("Open
    // Straight Back Training Habit"). Se pregunta por CUALQUIER título o frase
    // escrita sobre la foto, en cualquier idioma.
    const pregunta = "¿La imagen tiene títulos, frases o tablas escritas encima (en cualquier idioma), como una tabla de tallas, una infografía o un afiche publicitario? Un logo pequeño en el producto no cuenta. Responde empezando con SI o NO y luego qué es.";
    const veredictos = await Promise.all(locales.map(async (f) => {
      try {
        const buf = await readFile(f);
        const mime = /\.png$/i.test(f) ? "image/png" : /\.webp$/i.test(f) ? "image/webp" : "image/jpeg";
        const r = await Promise.race([describirImagen(buf, mime, pregunta, tenantId), new Promise<null>((ok) => setTimeout(() => ok(null), 15_000))]);
        return !fotoEsDeTextoSegunVision(r);
      } catch { return true; }
    }));
    const aptas = locales.filter((_, i) => veredictos[i]);
    if (aptas.length < locales.length) logger.info({ descartadas: locales.length - aptas.length }, "[VideoAnuncio] fotos con texto/tablas fuera de las escenas");
    return aptas.length ? aptas : locales;
  } catch {
    return locales;
  }
}

/** Transiciones que se alternan (antes, la misma en todas). */
const TRANSICIONES = ["smoothleft", "circleopen", "slideup", "fadeblack", "smoothright", "zoomin"];

async function capturarEscenas(items: Array<{ e: EscenaDeVideo; i: number; foto: string | null; detalle?: boolean }>, total: number, ctx: { color: string; marca: string; precio: string; cta: string; modelo: string; destino: "web" | "whatsapp" }, dir: string): Promise<string[]> {
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
      await pagina.setContent(htmlDeEscena(it.e, it.i, total, { ...ctx, foto: it.foto, detalle: it.detalle }), { waitUntil: "load", timeout: 30_000 });
      await pagina.screenshot({ path: archivo, type: "png", omitBackground: it.e.visual === "broll" });
      salidas.push(archivo);
    }
    return salidas;
  } finally {
    await navegador.close().catch(() => {});
  }
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
export async function generarVideoDeAnuncio(tenantId: number, productId: number, opts: { guion?: GuionDeVideo; modelo?: string; destino?: "web" | "whatsapp" } = {}): Promise<{ ok: boolean; error?: string; video?: VideoGenerado }> {
  const destino = opts.destino === "web" ? "web" : "whatsapp";
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
  // El cierre dice lo que hace el anuncio (antes: "Escríbenos por WhatsApp" también en la campaña a la landing).
  if (destino === "web") guion.cta = modelo === "fisico" ? "Pídelo en el enlace" : "Entra al enlace";
  const tmp = await mkdirTmp(productId);
  try {
    // Fotos únicas por contenido, sin tablas de tallas ni afiches con texto.
    const { fotosUnicasDelProducto } = await import("./fotos-de-producto");
    const fotos = await fotosUnicasDelProducto(p, { max: 8, timeoutMs: 8000 }).catch(() => [] as string[]);
    const bajadas: string[] = [];
    for (let i = 0; i < Math.min(fotos.length, 8); i++) {
      const local = await bajar(fotos[i]!, path.join(tmp, `foto-${i}`));
      if (local) bajadas.push(local);
    }
    if (!bajadas.length) return { ok: false, error: "El producto no tiene fotos utilizables." };
    const fotosLocales = await fotosAptasParaEscena(tenantId, bajadas);

    // Escenas: capturas + B-roll + voz.
    const escenas = guion.escenas;
    let conBroll = false;
    // 09-10-2026: se probó Sora para estas tomas y OpenAI apagó su API de video
    // el 24-09-2026 (/v1/videos da 404). Las tomas de ambiente salen de Pexels;
    // `toma` queda en el guion para el próximo generador que se conecte.
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
    // Cuando hay menos fotos que escenas, la vuelta siguiente usa plano de
    // detalle (recorte ampliado) para que no se vea la misma toma dos veces.
    let k = 0;
    const items = escenas.map((e, i) => {
      if (e.visual !== "producto") return { e, i, foto: null, detalle: false };
      const n = k++;
      return { e, i, foto: fotosData[n % fotosData.length]!, detalle: Math.floor(n / fotosData.length) % 2 === 1 };
    });
    const capturas = await capturarEscenas(items, escenas.length, { color, marca, precio: guion.precio, cta: guion.cta, modelo, destino }, tmp);

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
    for (let i = 0; i < escenas.length; i++) {
      const d = duraciones[i]!;
      const salida = path.join(tmp, `clip-${i}.mp4`);
      const frames = Math.round(d * FPS);
      const zoom = i % 2 === 0 ? `min(zoom+0.0012,1.12)` : `if(eq(on,1),1.12,max(zoom-0.0012,1.0))`;
      if (brolls[i]) {
        // B-roll de fondo + captura (con transparencia) encima.
        const r = await runSeguroConnector("ffmpeg", ["-y", "-stream_loop", "-1", "-i", brolls[i]!, "-loop", "1", "-i", capturas[i]!, "-filter_complex",
          `[0:v]scale=${ANCHO}:${ALTO}:force_original_aspect_ratio=increase,crop=${ANCHO}:${ALTO},setsar=1,fps=${FPS}[bg];[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]`,
          "-map", "[v]", "-t", String(d), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", salida], 240_000);
        if (r.code !== 0) throw new Error(`ffmpeg broll ${i}: ${r.err.slice(-400)}`);
      } else {
        const r = await runSeguroConnector("ffmpeg", ["-y", "-loop", "1", "-i", capturas[i]!, "-filter_complex",
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
      const r = await runSeguroConnector("ffmpeg", args, 60_000);
      if (r.code !== 0) throw new Error(`ffmpeg audio ${i}: ${r.err.slice(-300)}`);
      tramos.push(salida);
    }
    const listaAudio = path.join(tmp, "audio.txt");
    await writeFile(listaAudio, tramos.map((t) => `file '${t.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
    const pistaVoz = path.join(tmp, "voz.wav");
    let r = await runSeguroConnector("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listaAudio, "-c", "copy", pistaVoz], 60_000);
    if (r.code !== 0) throw new Error(`ffmpeg concat audio: ${r.err.slice(-300)}`);

    // Video: transiciones cruzadas entre clips.
    const entradas = clips.flatMap((c) => ["-i", c]);
    let filtro = "", ultimo = "[0:v]", offset = 0;
    for (let i = 1; i < clips.length; i++) {
      offset += duraciones[i - 1]! - CRUCE;
      const salida = i === clips.length - 1 ? "[v]" : `[x${i}]`;
      filtro += `${ultimo}[${i}:v]xfade=transition=${TRANSICIONES[(i - 1) % TRANSICIONES.length]}:duration=${CRUCE}:offset=${offset.toFixed(3)}${salida};`;
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
    r = await runSeguroConnector("ffmpeg", ["-y", ...entradas, ...audioArgs, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", final], 300_000);
    if (r.code !== 0) throw new Error(`ffmpeg final: ${r.err.slice(-500)}`);

    // Verificación calidad auto: 1080x1920, duración 15-30s, ffprobe (control calidad FASE 6)
    try {
      const probe = await runSeguroConnector("ffprobe", ["-v","error","-select_streams","v:0","-show_entries","stream=width,height,duration","-of","json", final], 20_000);
      if (probe.code===0) {
        const j = JSON.parse(probe.out||"{}");
        const st = j?.streams?.[0]||{};
        const w = Number(st.width), h = Number(st.height);
        if (w !== 1080 || h !== 1920) logger.warn({ w, h, final }, "[VideoAnuncio] resolución no es 1080x1920");
        const dProbe = Number(st.duration);
        if (Number.isFinite(dProbe) && (dProbe < 14 || dProbe > 32)) logger.warn({ dProbe }, "[VideoAnuncio] duración fuera de 15-30s");
      }
    } catch {}

    const duracion = await duracionDe(final);
    const appUrl = (process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "");
    const video: VideoGenerado = { archivo: nombre, url: `${appUrl}/videos/anuncios/${nombre}`, duracion: Math.round(duracion * 10) / 10, escenas: escenas.length, conBroll, guion, en: new Date().toISOString() };
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
export function generarVideoEnSegundoPlano(tenantId: number, productId: number, alTerminar?: (r: { ok: boolean; error?: string; video?: VideoGenerado }) => void, opts: { destino?: "web" | "whatsapp" } = {}): "iniciado" | "ya_en_curso" {
  if (enCurso.has(productId)) return "ya_en_curso";
  const p = generarVideoDeAnuncio(tenantId, productId, opts).finally(() => enCurso.delete(productId));
  enCurso.set(productId, p);
  void p.then((r) => alTerminar?.(r)).catch(() => {});
  return "iniciado";
}
export function videoEnCurso(productId: number): boolean { return enCurso.has(productId); }
