/**
 * Arma el vídeo vertical (1080×1920) a partir de escenas del Estudio.
 *
 * Cada escena es un Diseño 9:16 + duración + locución + transición +
 * movimiento. El fotograma puede venir ya pintado por el editor del panel
 * (PNG exportado de Fabric) o lo pinta este servidor con sharp (render.ts),
 * así el vídeo sale igual con o sin navegador. Voz con edge-tts
 * (voz-de-atlas), movimiento Ken Burns, transiciones xfade, música opcional
 * de `data/musica`. Mismo ffmpeg que lib/video-anuncio.ts, sin Chromium.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderizarDiseno, cargadorConCache, type Cargador } from "./render";
import type { Escena, Transicion } from "./diseno";

export const ANCHO_VIDEO = 1080, ALTO_VIDEO = 1920, FPS = 30;
const CRUCE = 0.4;

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

const XFADE = new Set<Transicion>(["fade", "smoothleft", "circleopen", "slideup", "zoomin", "fadeblack"]);
function transicionDe(t: Transicion | undefined): Transicion { return t && XFADE.has(t) ? t : "fade"; }
function cruceDe(_t: Transicion | undefined): number { return CRUCE; }

function filtroMovimiento(mov: Escena["movimiento"], frames: number, i: number): string {
  const base = `[0:v]scale=${ANCHO_VIDEO * 2}:${ALTO_VIDEO * 2}`;
  const salida = `s=${ANCHO_VIDEO}x${ALTO_VIDEO}:fps=${FPS},format=yuv420p[v]`;
  const centro = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  switch (mov || (i % 2 === 0 ? "acercar" : "alejar")) {
    case "fijo": return `[0:v]scale=${ANCHO_VIDEO}:${ALTO_VIDEO},fps=${FPS},format=yuv420p[v]`;
    case "alejar": return `${base},zoompan=z='if(eq(on,1),1.12,max(zoom-0.0012,1.0))':d=${frames}:${centro}:${salida}`;
    case "acercar":
    default: return `${base},zoompan=z='min(zoom+0.0012,1.12)':d=${frames}:${centro}:${salida}`;
  }
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

/** Escribe el fotograma de la escena (PNG 1080×1920) en `destino`. */
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

export async function armarVideoDesdeEscenas(escenas: EscenaParaVideo[], opts: OpcionesVideo): Promise<VideoArmado> {
  if (!escenas.length) throw new Error("El vídeo necesita al menos una escena.");
  if (!(await hayFfmpegDisponible())) throw new Error("ffmpeg no está instalado en el servidor.");
  const cargar = opts.cargar || cargadorConCache();
  const avisar = opts.avance || (() => {});
  const tmp = path.join(os.tmpdir(), `estudio-video-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  await mkdir(tmp, { recursive: true });
  try {
    // 1) Fotogramas.
    const fotogramas: string[] = [];
    for (let i = 0; i < escenas.length; i++) {
      avisar(5 + Math.round((i / escenas.length) * 25), `Pintando escena ${i + 1} de ${escenas.length}`);
      const f = path.join(tmp, `escena-${i}.png`);
      await fotogramaDe(escenas[i]!, f, cargar);
      fotogramas.push(f);
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
      const r = await run("ffmpeg", ["-y", "-loop", "1", "-i", fotogramas[i]!, "-filter_complex", filtroMovimiento(escenas[i]!.movimiento, Math.round(d * FPS), i),
        "-map", "[v]", "-t", String(d), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", salida], 240_000);
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
