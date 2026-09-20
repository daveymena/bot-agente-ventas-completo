/**
 * Color del producto → acento de la landing.
 *
 * Medido el 20-09-2026: todas las landings de Dropi salían iguales. Tres
 * causas: (1) el lanzamiento fijaba la familia "ecommerce" para todo físico,
 * (2) con familia fija el prompt decía "la paleta del estilo manda" y el color
 * del producto quedaba de adorno, y (3) el extractor de color usaba `sharp`,
 * que no está instalado: devolvía null siempre.
 *
 * Acá el color sale de la foto con ffmpeg (ya está en el servidor por el motor
 * de video). Se prefiere el color SATURADO más presente (un corrector negro
 * con hebillas rojas → rojo, no negro). Si el producto es neutro (negro,
 * blanco, gris), el acento lo pone el rubro.
 */
import { spawn } from "node:child_process";
import { writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface ColorDelProducto {
  /** Acento para botones/destacados (hex). */
  acento: string;
  /** Texto encima del acento. */
  sobreAcento: string;
  /** Color dominante crudo de la foto (puede ser neutro). */
  dominante: string | null;
  /** De dónde salió: "foto" | "rubro" | "marca" */
  origen: "foto" | "rubro" | "marca";
  /** Tinte suave para fondos de sección (acento al 8 %). */
  tinte: string;
}

const ACENTO_POR_RUBRO: Array<[RegExp, string]> = [
  [/salud|bienestar|ortoped/i, "#0E9F8A"],
  [/deporte|fitness|gym/i, "#E53935"],
  [/hogar|organiz/i, "#D97706"],
  [/cocina/i, "#EA580C"],
  [/limpieza/i, "#1E88E5"],
  [/belleza|cuidado personal/i, "#D63384"],
  [/moda|accesorio|bisuter/i, "#B8860B"],
  [/tecnolog|electr/i, "#2563EB"],
  [/beb[eé]|matern/i, "#EC8FA3"],
  [/mascota/i, "#8D6E63"],
  [/herramienta|automotor|veh/i, "#F59E0B"],
  [/camping|aire libre/i, "#2E7D32"],
  [/juguete|entreten/i, "#FB8C00"],
  [/papeler|oficina/i, "#3949AB"],
  [/libro|espiritual/i, "#6D4C41"],
  [/alimento|suplemento/i, "#43A047"],
];

function hex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function rgbDe(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [79, 70, 229];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function saturacion(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  return max === 0 ? 0 : (max - min) / max;
}
function luminancia(r: number, g: number, b: number): number {
  const f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function textoSobre(color: string): string {
  const [r, g, b] = rgbDe(color);
  return luminancia(r, g, b) > 0.4 ? "#111111" : "#FFFFFF";
}

function run(cmd: string, args: string[], timeoutMs = 20_000): Promise<{ code: number; out: Buffer }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
    const partes: Buffer[] = [];
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("timeout")); }, timeoutMs);
    p.stdout.on("data", (d) => partes.push(Buffer.from(d)));
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? 1, out: Buffer.concat(partes) }); });
  });
}

/** Píxeles RGB de la foto reducida a 32×32, vía ffmpeg. */
async function pixelesDe(url: string): Promise<Buffer | null> {
  const dir = path.join(os.tmpdir(), `color-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const abs = /^https?:\/\//i.test(url) ? url : `${(process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
    const r = await fetch(abs, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    await mkdir(dir, { recursive: true });
    const foto = path.join(dir, "foto");
    await writeFile(foto, Buffer.from(await r.arrayBuffer()));
    const out = await run("ffmpeg", ["-v", "error", "-i", foto, "-vf", "scale=32:32", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    return out.code === 0 && out.out.length >= 32 * 32 * 3 ? out.out : null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Color dominante SATURADO de la foto; null si no se pudo leer. */
export async function colorDominanteDeFoto(url: string): Promise<{ dominante: string; saturado: string | null } | null> {
  const px = await pixelesDe(url);
  if (!px) return null;
  const cubos = new Map<string, { r: number; g: number; b: number; n: number; s: number }>();
  for (let i = 0; i + 2 < px.length; i += 3) {
    const r = px[i]!, g = px[i + 1]!, b = px[i + 2]!;
    if (r > 235 && g > 235 && b > 235) continue; // fondo blanco de catálogo
    const k = `${r >> 5},${g >> 5},${b >> 5}`;
    const e = cubos.get(k) || { r: 0, g: 0, b: 0, n: 0, s: 0 };
    e.r += r; e.g += g; e.b += b; e.n++; e.s += saturacion(r, g, b);
    cubos.set(k, e);
  }
  if (!cubos.size) return null;
  const lista = [...cubos.values()].map((e) => ({ color: hex(e.r / e.n, e.g / e.n, e.b / e.n), n: e.n, s: e.s / e.n }));
  const dominante = lista.sort((a, b) => b.n - a.n)[0]!;
  // Saturado: presencia × saturación, con al menos ~2 % de los píxeles y saturación real.
  // Saturación alta de verdad y ni casi negro ni casi blanco: un marrón de
  // sombra o piel (medido: #614c4d en el corrector 168) no es "el color del
  // producto".
  const saturado = lista.filter((c) => {
    const [r, g, b] = rgbDe(c.color); const l = luminancia(r, g, b);
    return c.n >= 20 && c.s >= 0.5 && l >= 0.06 && l <= 0.75;
  }).sort((a, b) => b.n * b.s - a.n * a.s)[0] || null;
  return { dominante: dominante.color, saturado: saturado?.color || null };
}

/** Acento por rubro cuando el producto es neutro. */
export function acentoPorRubro(categoria: string | null | undefined): string | null {
  const c = String(categoria || "");
  for (const [re, color] of ACENTO_POR_RUBRO) if (re.test(c)) return color;
  return null;
}

/** Aclara u oscurece un hex (factor −1..1). */
export function ajustar(color: string, factor: number): string {
  const [r, g, b] = rgbDe(color);
  const f = (v: number) => (factor >= 0 ? v + (255 - v) * factor : v * (1 + factor));
  return hex(f(r), f(g), f(b));
}

export async function colorDelProducto(p: { fotoUrl?: string | null; categoria?: string | null; marcaPrimaria?: string | null }): Promise<ColorDelProducto> {
  let dominante: string | null = null, saturado: string | null = null;
  if (p.fotoUrl) {
    const c = await colorDominanteDeFoto(p.fotoUrl).catch(() => null);
    dominante = c?.dominante || null; saturado = c?.saturado || null;
  }
  let acento: string, origen: ColorDelProducto["origen"];
  if (saturado) {
    // Que el acento sea usable en un botón: ni chillón ni apagado.
    const [r, g, b] = rgbDe(saturado);
    const lum = luminancia(r, g, b);
    acento = lum > 0.6 ? ajustar(saturado, -0.35) : lum < 0.05 ? ajustar(saturado, 0.25) : saturado;
    origen = "foto";
  } else if (acentoPorRubro(p.categoria)) {
    acento = acentoPorRubro(p.categoria)!; origen = "rubro";
  } else {
    acento = p.marcaPrimaria || "#4F46E5"; origen = "marca";
  }
  return { acento, sobreAcento: textoSobre(acento), dominante, origen, tinte: ajustar(acento, 0.92) };
}
