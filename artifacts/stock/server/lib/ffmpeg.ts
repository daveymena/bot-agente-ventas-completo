/**
 * ffmpeg opcional. En producción el contenedor lo trae (ver Dockerfile); en
 * desarrollo puede no estar y todo degrada: el póster del vídeo lo manda el
 * navegador, la forma de onda del audio se calcula para WAV y el resto queda
 * sin previsualización hasta que exista ffmpeg.
 */
import { spawn } from "node:child_process";
import { config } from "../config";

let cached: boolean | null = null;

export async function ffmpegAvailable(): Promise<boolean> {
  if (cached != null) return cached;
  try {
    const r = await runFfmpeg(["-version"], 8_000);
    cached = r.code === 0;
  } catch { cached = false; }
  return cached;
}

export function resetFfmpegCache() { cached = null; }

export function runFfmpeg(args: string[], timeoutMs = 120_000, opts: { captureStdout?: boolean } = {}): Promise<{ code: number; stdout: Buffer | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    let p;
    try { p = spawn(config.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return reject(e); }
    const chunks: Buffer[] = []; let stderr = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`ffmpeg superó ${timeoutMs / 1000}s`)); }, timeoutMs);
    p.stdout.on("data", (d: Buffer) => { if (opts.captureStdout) chunks.push(d); });
    p.stderr.on("data", (d) => { stderr += String(d); if (stderr.length > 20000) stderr = stderr.slice(-10000); });
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? 1, stdout: opts.captureStdout ? Buffer.concat(chunks) : null, stderr }); });
  });
}
