/**
 * Pipeline de medios.
 *
 *   original (privado) ──► thumb 480px · card 960px · preview 1600px con marca de agua
 *                      ──► paleta de colores, matiz dominante, hash perceptual (dHash), placeholder borroso
 *
 * Imágenes y vectores (SVG rasterizado) pasan por sharp. Para vídeo la
 * previsualización sale de un fotograma (capturado en el navegador al subir,
 * o extraído con ffmpeg si está instalado). Para audio se calculan picos de
 * onda (ffmpeg → PCM, o el WAV se lee directo).
 */
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { config } from "../config";
import type { AssetColor, Orientation } from "../../shared/types";
import { ffmpegAvailable, runFfmpeg } from "./ffmpeg";

sharp.cache(false);
sharp.concurrency(2);

export interface ImageAnalysis {
  width: number; height: number; format: string;
  orientation: Orientation;
  colors: AssetColor[]; hue: number; saturation: number; lightness: number;
  dhash: string; blurData: string;
}

export interface Derivatives { thumbPath: string; cardPath: string; previewPath: string }

export const IMAGE_FORMATS = new Set(["jpeg", "jpg", "png", "webp", "tiff", "tif", "avif", "heif", "gif", "svg"]);
export const VIDEO_FORMATS = new Set(["mp4", "mov", "webm", "m4v"]);
export const AUDIO_FORMATS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);
export const TEMPLATE_FORMATS = new Set(["psd", "ai", "indd", "pptx", "docx", "zip", "aep", "prproj", "fig"]);
export const MODEL3D_FORMATS = new Set(["glb", "gltf", "obj", "fbx", "usdz", "blend"]);

export function extOf(filename: string): string {
  return (path.extname(filename).slice(1) || "").toLowerCase();
}

export function orientationOf(w: number, h: number): Orientation {
  if (!w || !h) return "horizontal";
  const r = w / h;
  if (r >= 2.2) return "panoramic";
  if (Math.abs(r - 1) < 0.06) return "square";
  return r > 1 ? "horizontal" : "vertical";
}

export function resolutionLabel(w: number, h: number): string | null {
  const long = Math.max(w, h);
  if (long >= 3800) return "4K";
  if (long >= 1280) return "HD";
  return long ? "SD" : null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/** Paleta: cuantiza a 4 bits por canal, agrupa, devuelve los 6 colores más presentes. */
async function palette(img: sharp.Sharp): Promise<{ colors: AssetColor[]; hue: number; saturation: number; lightness: number }> {
  const { data, info } = await img.clone().removeAlpha().resize(48, 48, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
  const total = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; bins.set(key, e);
  }
  const sorted = [...bins.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  const colors = sorted.map((e) => ({ hex: toHex(Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)), ratio: Number((e.n / total).toFixed(3)) }));
  // Matiz dominante: el bin saturado más grande; si todo es gris, el más grande.
  let pick = sorted[0];
  for (const e of sorted) {
    const [, s] = rgbToHsl(e.r / e.n, e.g / e.n, e.b / e.n);
    if (s >= 25) { pick = e; break; }
  }
  const [hue, saturation, lightness] = pick ? rgbToHsl(pick.r / pick.n, pick.g / pick.n, pick.b / pick.n) : [0, 0, 50];
  return { colors, hue, saturation, lightness };
}

/** dHash 64 bits: gradiente horizontal sobre 9×8 en gris. */
async function dhash(img: sharp.Sharp): Promise<string> {
  const { data } = await img.clone().removeAlpha().grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x]! < data[y * 9 + x + 1]! ? "1" : "0";
  return BigInt("0b" + bits).toString(16).padStart(16, "0");
}

export function hammingHex(a: string | null, b: string | null): number {
  if (!a || !b) return 64;
  let x = BigInt("0x" + a) ^ BigInt("0x" + b), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

function watermarkSvg(w: number, h: number, text: string): Buffer {
  const size = Math.max(14, Math.round(Math.min(w, h) / 22));
  const step = size * 9;
  const items: string[] = [];
  for (let y = -h; y < h * 2; y += step) {
    for (let x = -w; x < w * 2; x += step * 1.6) {
      items.push(`<text x="${x}" y="${y}" font-size="${size}" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="600" fill="white" fill-opacity="0.28" transform="rotate(-30 ${x} ${y})">${text}</text>`);
    }
  }
  const center = Math.max(22, Math.round(Math.min(w, h) / 9));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <g>${items.join("")}</g>
    <text x="50%" y="52%" text-anchor="middle" font-size="${center}" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="800" fill="white" fill-opacity="0.35" stroke="black" stroke-opacity="0.12" stroke-width="1">${text}</text>
  </svg>`);
}

function escapeXml(s: string) { return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!)); }

export function loadImage(input: Buffer | string): sharp.Sharp {
  return sharp(input, { limitInputPixels: 120_000_000, failOn: "none", animated: false, density: 150 });
}

export async function analyzeImage(input: Buffer | string): Promise<ImageAnalysis> {
  const img = loadImage(input);
  const meta = await img.metadata();
  const width = meta.width || 0, height = meta.height || 0;
  const small = img.clone().resize(256, 256, { fit: "inside" });
  const [pal, hash, blur] = await Promise.all([
    palette(small),
    dhash(small),
    img.clone().resize(20, 20, { fit: "inside" }).webp({ quality: 40 }).toBuffer().then((b) => `data:image/webp;base64,${b.toString("base64")}`),
  ]);
  return { width, height, format: meta.format || "unknown", orientation: orientationOf(width, height), ...pal, dhash: hash, blurData: blur };
}

/** Genera los derivados públicos de una imagen (o póster). Devuelve rutas relativas a publicDir. */
export async function makeDerivatives(input: Buffer | string, uuid: string, opts: { watermark?: boolean } = {}): Promise<Derivatives> {
  const dir = path.join(config.publicDir, uuid.slice(0, 2));
  await fs.mkdir(dir, { recursive: true });
  const img = loadImage(input).rotate();
  const meta = await img.metadata();
  const w = meta.width || 1, hgt = meta.height || 1;

  const thumbRel = `${uuid.slice(0, 2)}/${uuid}-t.webp`;
  const cardRel = `${uuid.slice(0, 2)}/${uuid}-c.webp`;
  const previewRel = `${uuid.slice(0, 2)}/${uuid}-p.webp`;

  await img.clone().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(config.publicDir, thumbRel));
  await img.clone().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(config.publicDir, cardRel));

  const scale = Math.min(1, 1600 / Math.max(w, hgt));
  const pw = Math.max(1, Math.round(w * scale)), ph = Math.max(1, Math.round(hgt * scale));
  let preview = img.clone().resize({ width: pw, height: ph, fit: "inside", withoutEnlargement: true });
  if (opts.watermark !== false) {
    preview = preview.composite([{ input: watermarkSvg(pw, ph, escapeXml(config.brand.watermark)), top: 0, left: 0 }]);
  }
  await preview.webp({ quality: 80 }).toFile(path.join(config.publicDir, previewRel));
  return { thumbPath: thumbRel, cardPath: cardRel, previewPath: previewRel };
}

export async function saveOriginal(buffer: Buffer, uuid: string, ext: string): Promise<{ rel: string; bytes: number }> {
  const dir = path.join(config.originalsDir, uuid.slice(0, 2));
  await fs.mkdir(dir, { recursive: true });
  const rel = `${uuid.slice(0, 2)}/${uuid}.${ext}`;
  await fs.writeFile(path.join(config.originalsDir, rel), buffer);
  return { rel, bytes: buffer.length };
}

export function originalAbs(rel: string) { return path.join(config.originalsDir, rel); }
export function publicAbs(rel: string) { return path.join(config.publicDir, rel); }
export const newUuid = () => crypto.randomUUID().replace(/-/g, "");

// ── Vídeo ───────────────────────────────────────────────────────────────────

export interface VideoInfo { durationSec: number | null; width: number; height: number; fps: number | null }

/** Lee duración/tamaño/fps de un MP4 sin ffmpeg (átomos mvhd/tkhd/stts). Devuelve nulls si no puede. */
export function probeMp4(buf: Buffer): VideoInfo {
  const out: VideoInfo = { durationSec: null, width: 0, height: 0, fps: null };
  const walk = (start: number, end: number, depth: number) => {
    let p = start;
    while (p + 8 <= end) {
      let size = buf.readUInt32BE(p); const type = buf.toString("latin1", p + 4, p + 8); let hdr = 8;
      if (size === 1) { size = Number(buf.readBigUInt64BE(p + 8)); hdr = 16; }
      if (size === 0) size = end - p;
      if (size < hdr) return;
      const bodyStart = p + hdr, bodyEnd = Math.min(end, p + size);
      if (type === "moov" || type === "trak" || type === "mdia" || type === "minf" || type === "stbl") {
        if (depth < 6) walk(bodyStart, bodyEnd, depth + 1);
      } else if (type === "mvhd") {
        const v = buf[bodyStart];
        if (v === 1) { const ts = buf.readUInt32BE(bodyStart + 20); const d = Number(buf.readBigUInt64BE(bodyStart + 24)); if (ts) out.durationSec = d / ts; }
        else { const ts = buf.readUInt32BE(bodyStart + 12); const d = buf.readUInt32BE(bodyStart + 16); if (ts) out.durationSec = d / ts; }
      } else if (type === "tkhd") {
        const v = buf[bodyStart];
        // version/flags, creation, modification, track_ID, reserved, duration, reserved(8), layer, alt_group, volume, reserved, matrix(36)
        const off = v === 1 ? bodyStart + 4 + 8 + 8 + 4 + 4 + 8 + 8 + 2 + 2 + 2 + 2 + 36 : bodyStart + 4 + 4 + 4 + 4 + 4 + 4 + 8 + 2 + 2 + 2 + 2 + 36;
        if (off + 8 <= bodyEnd) {
          const w = buf.readUInt32BE(off) / 65536, h = buf.readUInt32BE(off + 4) / 65536;
          if (w > out.width && h > 0) { out.width = Math.round(w); out.height = Math.round(h); }
        }
      } else if (type === "stts" && out.fps == null) {
        const entries = buf.readUInt32BE(bodyStart + 4);
        if (entries > 0) {
          const count = buf.readUInt32BE(bodyStart + 8), delta = buf.readUInt32BE(bodyStart + 12);
          (out as any)._stts = { count, delta };
        }
      } else if (type === "mdhd" && out.fps == null) {
        const v = buf[bodyStart];
        const ts = v === 1 ? buf.readUInt32BE(bodyStart + 20) : buf.readUInt32BE(bodyStart + 12);
        (out as any)._mdhd = ts;
      }
      p += size;
    }
  };
  try { walk(0, buf.length, 0); } catch { /* archivo raro: devolvemos lo que haya */ }
  const stts = (out as any)._stts, mdhd = (out as any)._mdhd;
  if (stts && mdhd && stts.delta) out.fps = Math.round((mdhd / stts.delta) * 100) / 100;
  delete (out as any)._stts; delete (out as any)._mdhd;
  if (out.fps && (out.fps > 240 || out.fps < 1)) out.fps = null;
  return out;
}

export async function videoFrame(absPath: string, atSec = 1): Promise<Buffer | null> {
  if (!(await ffmpegAvailable())) return null;
  const tmp = path.join(config.tmpDir, `${crypto.randomUUID()}.jpg`);
  await fs.mkdir(config.tmpDir, { recursive: true });
  const r = await runFfmpeg(["-y", "-ss", String(atSec), "-i", absPath, "-frames:v", "1", "-q:v", "3", tmp], 60_000);
  if (r.code !== 0) return null;
  try { const b = await fs.readFile(tmp); await fs.rm(tmp, { force: true }); return b; } catch { return null; }
}

/** Comp de vídeo: 540p, sin audio original a tope, con marca de agua. Solo si hay ffmpeg. */
export async function videoComp(absPath: string, uuid: string): Promise<string | null> {
  if (!(await ffmpegAvailable())) return null;
  const rel = `${uuid.slice(0, 2)}/${uuid}-comp.mp4`;
  const out = publicAbs(rel);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const wm = path.join(config.tmpDir, `${uuid}-wm.png`);
  await fs.mkdir(config.tmpDir, { recursive: true });
  await sharp(watermarkSvg(960, 540, escapeXml(config.brand.watermark))).png().toFile(wm);
  const r = await runFfmpeg([
    "-y", "-i", absPath, "-i", wm,
    "-filter_complex", "[0:v]scale=-2:540:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v];[1:v][v]scale2ref[wm][base];[base][wm]overlay=0:0:format=auto",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "96k", "-t", "60", out,
  ], 600_000);
  await fs.rm(wm, { force: true });
  return r.code === 0 ? rel : null;
}

// ── Audio ───────────────────────────────────────────────────────────────────

export interface AudioInfo { durationSec: number | null; waveform: number[] | null }

/** Picos de onda normalizados (0..1) de un PCM s16le mono. */
export function peaksFromPcm(pcm: Buffer, bins = 120): number[] {
  const samples = Math.floor(pcm.length / 2);
  if (samples === 0) return [];
  const per = Math.max(1, Math.floor(samples / bins));
  const out: number[] = [];
  for (let b = 0; b < bins; b++) {
    let max = 0;
    const start = b * per, end = Math.min(samples, start + per);
    for (let i = start; i < end; i++) { const v = Math.abs(pcm.readInt16LE(i * 2)); if (v > max) max = v; }
    out.push(Number((max / 32768).toFixed(3)));
  }
  const peak = Math.max(...out, 0.001);
  return out.map((v) => Number((v / peak).toFixed(3)));
}

export function probeWav(buf: Buffer): AudioInfo {
  try {
    if (buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WAVE") return { durationSec: null, waveform: null };
    let p = 12, channels = 1, rate = 44100, bits = 16;
    while (p + 8 <= buf.length) {
      const id = buf.toString("latin1", p, p + 4), size = buf.readUInt32LE(p + 4);
      if (id === "fmt ") { channels = buf.readUInt16LE(p + 10); rate = buf.readUInt32LE(p + 12); bits = buf.readUInt16LE(p + 22); }
      if (id === "data") {
        const bytesPerSample = bits / 8;
        const frames = size / (bytesPerSample * channels);
        const durationSec = frames / rate;
        let waveform: number[] | null = null;
        if (bits === 16) {
          // mezclamos a mono tomando el primer canal (suficiente para la forma de onda)
          const mono = Buffer.alloc(Math.floor(frames) * 2);
          for (let i = 0; i < frames; i++) mono.writeInt16LE(buf.readInt16LE(p + 8 + i * bytesPerSample * channels), i * 2);
          waveform = peaksFromPcm(mono);
        }
        return { durationSec: Number(durationSec.toFixed(2)), waveform };
      }
      p += 8 + size + (size % 2);
    }
  } catch { /* no es WAV válido */ }
  return { durationSec: null, waveform: null };
}

export async function analyzeAudio(absPath: string, buffer: Buffer): Promise<AudioInfo> {
  const wav = probeWav(buffer);
  if (wav.durationSec && wav.waveform) return wav;
  if (await ffmpegAvailable()) {
    const r = await runFfmpeg(["-i", absPath, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], 120_000, { captureStdout: true });
    if (r.code === 0 && r.stdout && r.stdout.length > 0) {
      return { durationSec: Number((r.stdout.length / 2 / 8000).toFixed(2)), waveform: peaksFromPcm(r.stdout) };
    }
  }
  return { durationSec: null, waveform: null };
}
