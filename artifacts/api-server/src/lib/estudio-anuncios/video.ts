/**
 * Arma el vídeo vertical (1080×1920) a partir de escenas del Estudio.
 *
 * Cada escena es un Diseño 9:16 + duración + locución + transición +
 * movimiento. Si las capas traen `anim`, cada grupo de capas entra por su
 * cuenta (aparece, desliza, zoom, rebote) sobre el fondo con movimiento de
 * cámara, como en CapCut; si no (o si el fotograma viene ya pintado por el
 * editor del panel), se anima el fotograma completo con Ken Burns. Voz con
 * edge-tts (voz-de-atlas), transiciones xfade, música opcional de
 * `data/musica`. Mismo ffmpeg que lib/video-anuncio.ts, sin Chromium.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderizarDiseno, renderizarCapas, cargadorConCache, type Cargador } from "./render";
import { svgDeElemento } from "./elementos";
import { getImageStoreDir } from "../image-store";
import { TRANSICIONES, type Ambiente, type Capa, type Escena, type Movimiento, type MovimientoCamara, type Transicion } from "./esquema";

export const ANCHO_VIDEO = 1080, ALTO_VIDEO = 1920, FPS = 30;
const CRUCE = 0.4;
/** Máximo de grupos animados por escena (cada uno es una entrada de ffmpeg). */
const MAX_GRUPOS = 14;

export interface EscenaParaVideo extends Escena {
  /** PNG ya pintado (ruta local o Buffer). Si falta, se pinta en el servidor. */
  fotograma?: string | Buffer | null;
}

export interface OpcionesVideo {
  /** Carpeta final (se crea). */
  carpeta: string;
  /** Nombre del archivo (sin carpeta), p. ej. video-1699999999.mp4 */
  nombre: string;
  voz?: string | null;
  /** false = sin locución aunque las escenas tengan texto. */
  conVoz?: boolean;
  conMusica?: boolean;
  /** false = ignora `anim` de las capas y anima el fotograma completo. */
  conAnimaciones?: boolean;
  cargar?: Cargador;
  avance?: (progreso: number, detalle: string) => void;
}

export interface VideoArmado {
  ruta: string;
  nombre: string;
  duracion: number;
  escenas: number;
  conVoz: boolean;
  conMusica: boolean;
  tamano: number;
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

let ffmpegOk: boolean | null = null;
export async function hayFfmpegDisponible(): Promise<boolean> {
  if (ffmpegOk != null) return ffmpegOk;
  try { ffmpegOk = (await run("ffmpeg", ["-version"], 10_000)).code === 0; } catch { ffmpegOk = false; }
  return ffmpegOk;
}

/** Duración en segundos: ffprobe si existe; si no, se lee del encabezado que imprime ffmpeg. */
export async function duracionDe(archivo: string): Promise<number> {
  try {
    const r = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", archivo], 20_000);
    const n = Number(String(r.out).trim());
    if (r.code === 0 && Number.isFinite(n) && n > 0) return n;
  } catch { /* sin ffprobe */ }
  try {
    const r = await run("ffmpeg", ["-i", archivo, "-f", "null", "-"], 60_000);
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.err);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  } catch { /* nada */ }
  return 0;
}

/** Nombres de xfade que trae ffmpeg ≥ 5 (los del catálogo y algunos más por si el JSON viene de fuera). */
const XFADE = new Set<string>([...Object.keys(TRANSICIONES), "fadefast", "fadeslow", "wiperight", "wipedown", "slideright", "smoothright", "smoothdown", "circlecrop", "rectcrop", "horzclose", "horzopen", "vertclose", "diagbl", "diagbr", "diagtr", "hlslice", "hrslice", "vuslice", "vdslice", "distance", "wipetl", "wipetr", "wipebl", "wipebr", "squeezev", "hlwind", "hrwind", "vuwind", "vdwind", "coverleft", "coverright", "coverup", "coverdown", "revealleft", "revealright", "revealup", "revealdown"]);
export function transicionDe(t: Transicion | undefined): Transicion { return t && XFADE.has(t) ? t : "fade"; }
function cruceDe(_t: Transicion | undefined): number { return CRUCE; }

/** Movimiento de cámara del fondo/fotograma: devuelve el filtro que deja `[etiqueta]` en WxH a FPS (rgba si hay capas encima). */
export function filtroMovimiento(mov: MovimientoCamara | undefined, frames: number, i: number, etiqueta: string, formato: "yuv420p" | "rgba"): string {
  const base = `[0:v]scale=${ANCHO_VIDEO * 2}:${ALTO_VIDEO * 2}`;
  const salida = `s=${ANCHO_VIDEO}x${ALTO_VIDEO}:fps=${FPS},format=${formato}[${etiqueta}]`;
  const centro = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  switch (mov || (i % 2 === 0 ? "acercar" : "alejar")) {
    case "fijo": return `[0:v]scale=${ANCHO_VIDEO}:${ALTO_VIDEO},fps=${FPS},format=${formato}[${etiqueta}]`;
    case "alejar": return `${base},zoompan=z='if(eq(on,1),1.12,max(zoom-0.0012,1.0))':d=${frames}:${centro}:${salida}`;
    case "balanceo": return `${base},zoompan=z=1.1:x='(iw-iw/zoom)/2*(1+0.7*sin(2*PI*on/${FPS * 6}))':y='ih/2-(ih/zoom/2)':d=${frames}:${salida}`;
    case "respirar": return `${base},zoompan=z='1.07+0.035*sin(2*PI*on/${FPS * 3})':d=${frames}:${centro}:${salida}`;
    case "giro3d": {
      // Balanceo 3D sutil: las esquinas se mueven en contrafase (como una tarjeta que gira unos grados).
      // Se pinta con un 6 % de sobrante y se recorta después para que el giro nunca deje ver el borde.
      const k = `sin(2*PI*in/${FPS * 5})`;
      const SW = Math.round(ANCHO_VIDEO * 1.06 / 2) * 2, SH = Math.round(ALTO_VIDEO * 1.06 / 2) * 2;
      return `[0:v]scale=${SW}:${SH},fps=${FPS},perspective=x0='18*${k}':y0='9*${k}':x1='W-18*${k}':y1='-9*${k}':x2='-18*${k}':y2='H+9*${k}':x3='W+18*${k}':y3='H-9*${k}':eval=frame:sense=source,crop=${ANCHO_VIDEO}:${ALTO_VIDEO},format=${formato}[${etiqueta}]`;
    }
    case "acercar":
    default: return `${base},zoompan=z='min(zoom+0.0012,1.12)':d=${frames}:${centro}:${salida}`;
  }
}

/** Fondo tomado de un clip de vídeo (foto animada con IA): se ajusta a 9:16 y se repite si es más corto. */
function filtroClip(etiqueta: string, formato: "yuv420p" | "rgba"): string {
  return `[0:v]scale=${ANCHO_VIDEO}:${ALTO_VIDEO}:force_original_aspect_ratio=increase,crop=${ANCHO_VIDEO}:${ALTO_VIDEO},fps=${FPS},setpts=PTS-STARTPTS,format=${formato}[${etiqueta}]`;
}

/** Ruta local de un archivo servido bajo /uploads (o URL absoluta del propio servidor). null si no es nuestro. */
export function rutaLocalDeUpload(src: string | null | undefined): string | null {
  const s = String(src || "").trim();
  if (!s) return null;
  let ruta = s;
  try { if (/^https?:\/\//i.test(s)) ruta = new URL(s).pathname; } catch { return null; }
  const m = /^\/uploads\/(.+)$/.exec(ruta);
  if (!m) return path.isAbsolute(s) && existsSync(s) ? s : null;
  const base = path.resolve(getImageStoreDir());
  const local = path.resolve(base, m[1]!.split("?")[0]!);
  return local.startsWith(base) && existsSync(local) ? local : null;
}

// ─── Animación por capas ─────────────────────────────────────────────────────

export interface GrupoAnimado { capas: Capa[]; entrada: string | null; retraso: number; duracion: number; salida: "desvanecer" | null; movimiento?: Movimiento | null; intensidad?: 1 | 2 | 3 }

const tieneAnim = (c: Capa) => !!(c.anim?.entrada || c.anim?.movimiento);
const claveAnim = (c: Capa) => tieneAnim(c) ? `${c.anim?.entrada || ""}|${c.anim?.retraso ?? 0}|${c.anim?.duracion ?? 0.5}|${c.anim?.salida ?? ""}|${c.anim?.movimiento || ""}|${c.anim?.intensidad ?? 2}` : "";
const intensidadDe = (c: Capa): 1 | 2 | 3 => (c.anim?.intensidad === 1 || c.anim?.intensidad === 3 ? c.anim.intensidad : 2);

/**
 * Separa las capas en: base (fondo + capas sin animación que van debajo de la
 * primera animada: se mueven con la cámara) y grupos consecutivos con la
 * misma animación (una píldora y su texto entran juntos). Con `todoArriba`
 * (fondo de clip) ninguna capa va en la base: las estáticas forman grupos
 * quietos.
 */
export function agruparCapas(capas: Capa[], opts: { todoArriba?: boolean } = {}): { base: Capa[]; grupos: GrupoAnimado[] } {
  const base: Capa[] = [];
  const grupos: GrupoAnimado[] = [];
  let vistaAnimada = !!opts.todoArriba;
  for (const c of capas) {
    if (c.tipo === "fondo") { base.push(c); continue; }
    const k = claveAnim(c);
    if (!k && !vistaAnimada) { base.push(c); continue; }
    vistaAnimada = true;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && claveAnim(ultimo.capas[0]!) === k) { ultimo.capas.push(c); continue; }
    grupos.push({ capas: [c], entrada: c.anim?.entrada || null, retraso: Math.max(0, Number(c.anim?.retraso) || 0), duracion: Math.min(1.5, Math.max(0.2, Number(c.anim?.duracion) || 0.5)), salida: c.anim?.salida || null, movimiento: c.anim?.movimiento || null, intensidad: intensidadDe(c) });
  }
  // Si hay demasiados grupos se funden los últimos (ffmpeg con 14 overlays va sobrado; 40 no).
  while (grupos.length > MAX_GRUPOS) {
    const b = grupos.pop()!;
    grupos[grupos.length - 1]!.capas.push(...b.capas);
  }
  return { base, grupos };
}

const n2 = (n: number) => (Math.round(n * 1000) / 1000).toString();

/**
 * Filtros de ffmpeg para una capa (grupo) de la escena: entrada (aparece,
 * desliza, zoom, rebote) + movimiento continuo (flota, late, se balancea…).
 * `idx` es la entrada (-i) del PNG recortado. Todo se posiciona por el centro
 * de la caja para que escalar o girar no la desplace.
 */
export function filtroDeEntrada(idx: number, g: GrupoAnimado, caja: { x: number; y: number; w: number; h: number }, dur: number, desde: string, hacia: string): string {
  const st = Math.min(Math.max(0, dur - 0.3), g.retraso), du = Math.min(g.duracion, Math.max(0.2, dur - st));
  const P = `min(1,max(0,(t-${n2(st)})/${n2(du)}))`;
  const E = `(1-pow(1-${P},3))`;
  const { x: X, y: Y, w: LW, h: LH } = caja;
  const CX = X + LW / 2, CY = Y + LH / 2;
  const fade = g.entrada ? `,fade=t=in:st=${n2(st)}:d=${n2(Math.min(du, 0.35))}:alpha=1` : "";
  const salida = g.salida === "desvanecer" && dur > 1 ? `,fade=t=out:st=${n2(Math.max(0, dur - 0.4))}:d=0.4:alpha=1` : "";
  const k = g.intensidad ?? 2, fase = n2((idx % 7) * 0.9);
  // Movimiento continuo: desplazamiento (dx, dy), escala (S) y giro (R) en función de t.
  let dx = "0", dy = "0";
  const escalas: string[] = [];
  let giro: string | null = null;
  switch (g.movimiento) {
    case "flotar": dy = `${12 * k}*sin(2*PI*t/2.4+${fase})`; break;
    case "latido": escalas.push(`(1+${n2(0.03 * k)}*sin(2*PI*t/1.5+${fase}))`); break;
    case "balancear": giro = `${n2(0.035 * k)}*sin(2*PI*t/2.8+${fase})`; break;
    case "orbita": dx = `${8 * k}*cos(2*PI*t/3.4+${fase})`; dy = `${8 * k}*sin(2*PI*t/3.4+${fase})`; break;
    case "girar": giro = `2*PI*t/${n2(8 / k)}`; break;
    case "deriva": dx = `${-16 * k}+${32 * k}*t/${n2(dur)}`; break;
    case "acercar": escalas.push(`(1+${n2(0.06 * k)}*t/${n2(dur)})`); break;
    default: break;
  }
  // Entrada: desplazamiento extra que se anula cuando E llega a 1.
  let ex = "0", ey = "0";
  switch (g.entrada) {
    case "deslizar-izq": ex = `-(${n2(X + LW)})*(1-${E})`; break;
    case "deslizar-der": ex = `(${n2(ANCHO_VIDEO - X)})*(1-${E})`; break;
    case "deslizar-arriba": ey = `-(${n2(Y + LH)})*(1-${E})`; break;
    case "deslizar-abajo": ey = `(${n2(ALTO_VIDEO - Y)})*(1-${E})`; break;
    case "rebote": { const B = `(1+2.70158*pow(${P}-1,3)+1.70158*pow(${P}-1,2))`; ey = `-(${n2(Y + LH)})*(1-${B})`; break; }
    case "zoom": escalas.push(`(0.5+0.5*${E})`); break;
    default: break;
  }
  let cadena = `[${idx}:v]format=rgba${fade}${salida}`;
  if (giro) cadena += `,rotate=a='${giro}':ow='hypot(iw,ih)':oh='ow':c=none`;
  if (escalas.length) cadena += `,scale=w='max(2,iw*${escalas.join("*")})':h=-1:eval=frame`;
  cadena += `[l${idx}];`;
  const x = `${n2(CX)}-w/2+${dx}+${ex}`, y = `${n2(CY)}-h/2+${dy}+${ey}`;
  return `${cadena}[${desde}][l${idx}]overlay=x='${x}':y='${y}':format=auto:eval=frame[${hacia}];`;
}

// ─── Ambiente (partículas) ───────────────────────────────────────────────────

const SPRITES: Record<Ambiente, { ref: string | null; svg?: string; lado: number; sube: boolean; gira: boolean; n: number }> = {
  nieve: { ref: "emoji:snowflake", lado: 54, sube: false, gira: false, n: 14 },
  confeti: { ref: null, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="4" y="6" width="14" height="8" rx="2" fill="#F43F5E"/><rect x="22" y="4" width="8" height="14" rx="2" fill="#FACC15"/><rect x="8" y="24" width="10" height="10" rx="2" fill="#22C55E"/><circle cx="29" cy="29" r="5" fill="#3B82F6"/></svg>`, lado: 40, sube: false, gira: true, n: 16 },
  chispas: { ref: "emoji:sparkles", lado: 46, sube: true, gira: false, n: 12 },
  burbujas: { ref: null, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#ffffff" fill-opacity="0.16" stroke="#ffffff" stroke-opacity="0.75" stroke-width="2.5"/><circle cx="17" cy="16" r="5" fill="#ffffff" fill-opacity="0.7"/></svg>`, lado: 44, sube: true, gira: false, n: 12 },
  corazones: { ref: "emoji:red-heart", lado: 44, sube: true, gira: false, n: 12 },
  hojas: { ref: "emoji:fallen-leaf", lado: 50, sube: false, gira: true, n: 12 },
};

/** PNG del sprite de un ambiente (null si la colección de emojis no está). */
export async function spriteDeAmbiente(a: Ambiente): Promise<Buffer | null> {
  const def = SPRITES[a];
  if (!def) return null;
  let svg = def.svg || null;
  if (!svg && def.ref) svg = svgDeElemento(def.ref)?.svg || null;
  if (!svg) return null;
  const sharp = (await import("sharp")).default;
  const conTamano = svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, "")} width="${def.lado}" height="${def.lado}">`);
  try { return await sharp(Buffer.from(conTamano), { density: 72 }).resize(def.lado, def.lado, { fit: "fill" }).png().toBuffer(); } catch { return null; }
}

/** Generador determinista (misma escena → mismas partículas en cada render). */
function azar(semilla: number): () => number {
  let s = (semilla * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** Filtros para N copias del sprite (entrada `idx`) cayendo o subiendo con vaivén. Deja `[hacia]`. */
export function filtroAmbiente(idx: number, a: Ambiente, semilla: number, desde: string, hacia: string): string {
  const def = SPRITES[a];
  const r = azar(semilla + 7);
  const n = def.n, L = def.lado;
  const etiquetas = Array.from({ length: n }, (_, i) => `[a${idx}_${i}]`).join("");
  let f = `[${idx}:v]format=rgba,split=${n}${etiquetas};`;
  let prev = desde;
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(r() * (ANCHO_VIDEO - L));
    const v = Math.round(90 + r() * 150);
    const fase = Math.round(r() * (ALTO_VIDEO + L));
    const vaiven = Math.round(14 + r() * 26), per = n2(1.8 + r() * 2.2), ph = n2(r());
    const y = def.sube ? `${ALTO_VIDEO}-mod(${fase}+${v}*t,${ALTO_VIDEO + L})` : `mod(${fase}+${v}*t,${ALTO_VIDEO + L})-${L}`;
    const x = `${x0}+${vaiven}*sin(2*PI*(t/${per}+${ph}))`;
    let capa = `[a${idx}_${i}]`;
    if (def.gira) { f += `[a${idx}_${i}]rotate=a='2*PI*t/${n2(2 + r() * 3)}':c=none[g${idx}_${i}];`; capa = `[g${idx}_${i}]`; }
    const salida = i === n - 1 ? `[${hacia}]` : `[p${idx}_${i}]`;
    f += `[${prev.replace(/^\[|\]$/g, "")}]${capa}overlay=x='${x}':y='${y}':format=auto:eval=frame${salida};`;
    prev = salida;
  }
  return f;
}

async function pistaDeMusica(): Promise<string | null> {
  try {
    const dir = process.env.MUSICA_DIR || path.resolve(process.cwd(), "data/musica");
    if (!existsSync(dir)) return null;
    const pistas = (await readdir(dir)).filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f));
    if (!pistas.length) return null;
    return path.join(dir, pistas[Math.floor(Math.random() * pistas.length)]!);
  } catch { return null; }
}

async function vozDe(texto: string, voz: string | null | undefined, destino: string): Promise<string | null> {
  try {
    const { hablar } = await import("../voz-de-atlas");
    const buf = voz ? await hablar(texto, voz) : await hablar(texto);
    if (!buf || buf.length < 500) return null;
    await writeFile(destino, buf);
    return destino;
  } catch { return null; }
}

/** Escribe el fotograma completo de la escena (PNG 1080×1920) en `destino`. */
async function fotogramaDe(e: EscenaParaVideo, destino: string, cargar: Cargador): Promise<void> {
  if (e.fotograma) {
    const buf = Buffer.isBuffer(e.fotograma) ? e.fotograma : await readFile(e.fotograma);
    const sharp = (await import("sharp")).default;
    // Se normaliza al tamaño exacto del vídeo (el editor puede exportar a otra escala).
    await sharp(buf, { failOn: "none" }).resize(ANCHO_VIDEO, ALTO_VIDEO, { fit: "cover" }).png().toFile(destino);
    return;
  }
  const d = { ...e.diseno, ancho: ANCHO_VIDEO, alto: ALTO_VIDEO };
  await writeFile(destino, await renderizarDiseno(d, { cargar }));
}

interface Preparada {
  /** Fotograma completo (modo clásico) o fondo+base (modo por capas). */
  base: string;
  grupos: Array<{ png: string; caja: { x: number; y: number; w: number; h: number }; g: GrupoAnimado }>;
  /** Sprite del ambiente (partículas) ya pintado. */
  ambiente?: { png: string; tipo: Ambiente; semilla: number } | null;
  /** Clip de vídeo que hace de fondo (ruta local). */
  clip?: string | null;
}

/** Pinta lo necesario para la escena: un PNG completo, o fondo + un PNG recortado por grupo animado. */
async function prepararEscena(e: EscenaParaVideo, i: number, tmp: string, cargar: Cargador, conAnimaciones: boolean): Promise<Preparada> {
  const base = path.join(tmp, `escena-${i}.png`);
  const d = { ...e.diseno, ancho: ANCHO_VIDEO, alto: ALTO_VIDEO };
  const clip = !e.fotograma ? rutaLocalDeUpload(e.clip) : null;
  let ambiente: Preparada["ambiente"] = null;
  if (e.ambiente && SPRITES[e.ambiente]) {
    const png = await spriteDeAmbiente(e.ambiente);
    if (png) { const ruta = path.join(tmp, `ambiente-${i}.png`); await writeFile(ruta, png); ambiente = { png: ruta, tipo: e.ambiente, semilla: i + 1 }; }
  }
  const porCapas = (conAnimaciones && !e.fotograma && d.capas.some((c) => c.tipo !== "fondo" && tieneAnim(c))) || !!clip;
  if (!porCapas) {
    await fotogramaDe(e, base, cargar);
    return { base, grupos: [], ambiente };
  }
  const { base: capasBase, grupos } = agruparCapas(d.capas, { todoArriba: !!clip });
  // Fondo + capas estáticas de abajo, pintadas como un solo PNG opaco (con clip, el fondo lo pone el vídeo).
  if (!clip) await writeFile(base, await renderizarDiseno({ ...d, capas: capasBase }, { cargar }));
  const salida: Preparada["grupos"] = [];
  for (let k = 0; k < grupos.length; k++) {
    const g = grupos[k]!;
    const pintada = await renderizarCapas(d, g.capas, { cargar });
    if (!pintada) continue;
    const png = path.join(tmp, `escena-${i}-grupo-${k}.png`);
    await writeFile(png, pintada.png);
    salida.push({ png, caja: { x: pintada.x, y: pintada.y, w: pintada.w, h: pintada.h }, g });
  }
  return { base, grupos: salida, ambiente, clip };
}

/** Argumentos de ffmpeg para el clip de una escena ya preparada. */
export function argumentosDeClip(p: Preparada, mov: MovimientoCamara | undefined, dur: number, i: number, salida: string): string[] {
  const frames = Math.round(dur * FPS);
  const codec = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"];
  if (!p.grupos.length && !p.ambiente && !p.clip) {
    return ["-y", "-loop", "1", "-i", p.base, "-filter_complex", filtroMovimiento(mov, frames, i, "v", "yuv420p"), "-map", "[v]", "-t", String(dur), "-an", ...codec, salida];
  }
  const entradas = p.clip ? ["-stream_loop", "-1", "-t", String(dur), "-i", p.clip] : ["-loop", "1", "-t", String(dur), "-i", p.base];
  let filtro = (p.clip ? filtroClip("b0", "rgba") : filtroMovimiento(mov, frames, i, "b0", "rgba")) + ";";
  let n = 1, etiqueta = "b0";
  if (p.ambiente) {
    entradas.push("-loop", "1", "-framerate", String(FPS), "-t", String(dur), "-i", p.ambiente.png);
    filtro += filtroAmbiente(n, p.ambiente.tipo, p.ambiente.semilla, etiqueta, "amb");
    etiqueta = "amb"; n++;
  }
  p.grupos.forEach((gr, k) => {
    entradas.push("-loop", "1", "-framerate", String(FPS), "-t", String(dur), "-i", gr.png);
    filtro += filtroDeEntrada(n, gr.g, gr.caja, dur, etiqueta, `c${k}`);
    etiqueta = `c${k}`; n++;
  });
  filtro += `[${etiqueta}]format=yuv420p[v]`;
  return ["-y", ...entradas, "-filter_complex", filtro, "-map", "[v]", "-t", String(dur), "-r", String(FPS), "-an", ...codec, salida];
}

export async function armarVideoDesdeEscenas(escenas: EscenaParaVideo[], opts: OpcionesVideo): Promise<VideoArmado> {
  if (!escenas.length) throw new Error("El vídeo necesita al menos una escena.");
  if (!(await hayFfmpegDisponible())) throw new Error("ffmpeg no está instalado en el servidor.");
  const cargar = opts.cargar || cargadorConCache();
  const avisar = opts.avance || (() => {});
  const tmp = path.join(os.tmpdir(), `estudio-video-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  await mkdir(tmp, { recursive: true });
  try {
    // 1) Fotogramas (completos o por capas).
    const preparadas: Preparada[] = [];
    for (let i = 0; i < escenas.length; i++) {
      avisar(5 + Math.round((i / escenas.length) * 25), `Pintando escena ${i + 1} de ${escenas.length}`);
      preparadas.push(await prepararEscena(escenas[i]!, i, tmp, cargar, opts.conAnimaciones !== false));
    }

    // 2) Voz por escena y duración real.
    const conVoz = opts.conVoz !== false;
    const duraciones: number[] = [];
    const audios: Array<string | null> = [];
    let huboVoz = false;
    for (let i = 0; i < escenas.length; i++) {
      const e = escenas[i]!;
      avisar(30 + Math.round((i / escenas.length) * 20), `Grabando locución ${i + 1} de ${escenas.length}`);
      const voz = conVoz && e.locucion?.trim() ? await vozDe(e.locucion.trim(), opts.voz, path.join(tmp, `voz-${i}.mp3`)) : null;
      const dVoz = voz ? await duracionDe(voz) : 0;
      if (voz) huboVoz = true;
      const planeada = Math.max(1.2, Math.min(20, Number(e.duracion) || 3));
      duraciones.push(Math.max(planeada, dVoz + 0.8));
      audios.push(voz);
    }

    // 3) Clips con movimiento.
    const clips: string[] = [];
    for (let i = 0; i < escenas.length; i++) {
      avisar(50 + Math.round((i / escenas.length) * 30), `Animando escena ${i + 1} de ${escenas.length}`);
      const d = duraciones[i]!;
      const salida = path.join(tmp, `clip-${i}.mp4`);
      let r = await run("ffmpeg", argumentosDeClip(preparadas[i]!, escenas[i]!.movimiento, d, i, salida), 300_000);
      if (r.code !== 0 && (preparadas[i]!.grupos.length || preparadas[i]!.ambiente || preparadas[i]!.clip)) {
        // Si la animación por capas (o el clip/ambiente) falla por lo que sea, la escena sale con el fotograma completo.
        avisar(50 + Math.round((i / escenas.length) * 30), `Escena ${i + 1}: reintentando sin capas`);
        const plano = path.join(tmp, `escena-${i}-plano.png`);
        await fotogramaDe({ ...escenas[i]!, fotograma: null }, plano, cargar);
        r = await run("ffmpeg", argumentosDeClip({ base: plano, grupos: [] }, escenas[i]!.movimiento, d, i, salida), 240_000);
      }
      if (r.code !== 0) throw new Error(`ffmpeg escena ${i + 1}: ${r.err.slice(-400)}`);
      clips.push(salida);
    }

    // 4) Pista de voz alineada con las transiciones.
    avisar(82, "Mezclando audio");
    const tramos: string[] = [];
    for (let i = 0; i < escenas.length; i++) {
      const ultima = i === escenas.length - 1;
      const largo = Math.max(0.2, ultima ? duraciones[i]! : duraciones[i]! - cruceDe(escenas[i]!.transicion));
      const salida = path.join(tmp, `tramo-${i}.wav`);
      const args = audios[i]
        ? ["-y", "-i", audios[i]!, "-af", "apad", "-t", String(largo), "-ar", "44100", "-ac", "2", salida]
        : ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(largo), salida];
      const r = await run("ffmpeg", args, 60_000);
      if (r.code !== 0) throw new Error(`ffmpeg audio ${i + 1}: ${r.err.slice(-300)}`);
      tramos.push(salida);
    }
    const listaAudio = path.join(tmp, "audio.txt");
    await writeFile(listaAudio, tramos.map((t) => `file '${t.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
    const pistaVoz = path.join(tmp, "voz.wav");
    let r = await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listaAudio, "-c", "copy", pistaVoz], 60_000);
    if (r.code !== 0) throw new Error(`ffmpeg concat audio: ${r.err.slice(-300)}`);

    // 5) Transiciones y mezcla final.
    avisar(88, "Uniendo escenas");
    const entradas = clips.flatMap((c) => ["-i", c]);
    let filtro = "", ultimo = "[0:v]", offset = 0;
    for (let i = 1; i < clips.length; i++) {
      const t = transicionDe(escenas[i - 1]!.transicion);
      const cruce = cruceDe(t);
      offset += duraciones[i - 1]! - cruce;
      const salida = i === clips.length - 1 ? "[v]" : `[x${i}]`;
      filtro += `${ultimo}[${i}:v]xfade=transition=${t}:duration=${cruce}:offset=${offset.toFixed(3)}${salida};`;
      ultimo = salida;
    }
    if (clips.length === 1) filtro = "[0:v]copy[v];";
    const musica = opts.conMusica !== false ? await pistaDeMusica() : null;
    const audioArgs = musica
      ? ["-i", pistaVoz, "-stream_loop", "-1", "-i", musica, "-filter_complex", `${filtro}[${clips.length + 1}:a]volume=${huboVoz ? 0.12 : 0.35}[m];[${clips.length}:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]`, "-map", "[v]", "-map", "[a]"]
      : ["-i", pistaVoz, "-filter_complex", filtro.replace(/;$/, ""), "-map", "[v]", "-map", `${clips.length}:a`];
    await mkdir(opts.carpeta, { recursive: true });
    const final = path.join(opts.carpeta, opts.nombre);
    r = await run("ffmpeg", ["-y", ...entradas, ...audioArgs, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", final], 300_000);
    if (r.code !== 0) throw new Error(`ffmpeg final: ${r.err.slice(-500)}`);
    avisar(97, "Guardando");
    const duracion = (await duracionDe(final)) || duraciones.reduce((a, b) => a + b, 0);
    const tamano = (await stat(final)).size;
    return { ruta: final, nombre: opts.nombre, duracion: Math.round(duracion * 10) / 10, escenas: escenas.length, conVoz: huboVoz, conMusica: !!musica, tamano };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
