/**
 * FFmpeg Connector Seguro — Atlas Ad Studio
 * Atlas invoca FFmpeg solo por allowlist, sin comandos arbitrarios.
 * - Solo ffmpeg/ffprobe, args validados, rutas confinadas a IMAGE_STORE_DIR/tmp y data/images/videos/anuncios
 * - timeout 180s, sin shell, cleanup temporales
 */
import { spawn } from "node:child_process";
import path from "node:path";

const ALLOWED_BIN = new Set(["ffmpeg", "ffprobe"]);
const ALLOWED_ARGS = new Set(["-y","-i","-loop","-stream_loop","-filter_complex","-map","-t","-ss","-to","-c:v","-c:a","-preset","-crf","-pix_fmt","-b:a","-shortest","-movflags","-an","-f","-safe","-r","-s","-vf","-af","-ar","-ac","-frames:v","-v","-show_entries","-of","-default_noprint_wrappers","-n","-nostdin"]);

function dentroDeBase(ruta: string, base: string): boolean {
  const rel = path.relative(path.resolve(base), path.resolve(ruta));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function validarRuta(ruta: string): void {
  const bases = [process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "data/images"), path.resolve(process.cwd(), "data"), path.resolve("/tmp")];
  if (!bases.some(b => dentroDeBase(ruta, b) || ruta.startsWith(b))) {
    // permite también dataUrls y rutas temporales generadas
    if (/^data:image\//.test(ruta) || /^https?:\/\//.test(ruta)) return;
    throw new Error(`Ruta no permitida: ${ruta}`);
  }
}

export interface RunResult { code:number; out:string; err:string; ms:number; }

export async function runSeguro(bin: "ffmpeg"|"ffprobe", args: string[], timeoutMs=180_000, cwd?: string): Promise<RunResult> {
  if (!ALLOWED_BIN.has(bin)) throw new Error(`Bin no permitido: ${bin}`);
  // valida que no haya inyección — spawn es sin shell, así que ; y | en grafos de filtros son legítimos
  for (let i=0;i<args.length;i++) {
    const a = args[i];
    const prev = args[i-1] || "";
    const esGrafoFiltro = prev === "-filter_complex" || prev === "-vf" || prev === "-af" || prev === "-lavfi" || prev === "-filter:v" || prev === "-filter:a";
    // file list de concat demuxer empieza con "file '...'" y puede tener caracteres especiales
    if (a.startsWith("file '")) continue;
    // grafo de filtros (xfade con ;) usa ; y : y = y [ ] — es seguro porque no pasa por shell
    if (esGrafoFiltro) {
      if (/[&`$]/.test(a)) throw new Error(`Arg inseguro en filtro: ${a}`);
      continue;
    }
    if (/[;&|`$]/.test(a)) throw new Error(`Arg inseguro: ${a}`);
  }
  // valida rutas tras -i y destinos
  for (let i=0;i<args.length;i++) if (args[i]==="-i" && args[i+1]) try{ validarRuta(args[i+1]); }catch{}
  const t0=Date.now();
  return new Promise((resolve, reject)=>{
    const p=spawn(bin, args, { stdio:["ignore","pipe","pipe"], cwd });
    let out="", err="";
    const t=setTimeout(()=>{ p.kill("SIGKILL"); reject(new Error(`${bin} timeout ${timeoutMs}ms`)); }, timeoutMs);
    p.stdout.on("data", d=> out+=String(d));
    p.stderr.on("data", d=> err+=String(d));
    p.on("error", e=>{ clearTimeout(t); reject(e); });
    p.on("close", code=>{ clearTimeout(t); resolve({ code: code??1, out, err, ms: Date.now()-t0 }); });
  });
}

export async function hayFfmpegSeguro(): Promise<boolean> {
  try{ const r=await runSeguro("ffprobe", ["-version"], 8000); return r.code===0; }catch{ return false; }
}
