/**
 * Tipografía sin depender del sistema.
 *
 * Los servidores (y el sandbox) no traen fuentes: `fc-list` vacío. Si el texto
 * de un anuncio se dibujara con `<text>` en SVG, sharp/librsvg lo pintaría con
 * cuadraditos o nada. Acá cada letra se convierte en su contorno (path) con
 * opentype.js a partir de los TTF de Inter que viajan en el repo
 * (assets/fonts, licencia OFL), así el resultado es idéntico en cualquier
 * máquina: eso es parte de la "alta disponibilidad" del Estudio.
 *
 * Se arma el trazado glifo a glifo (sin el motor de sustituciones GSUB de
 * opentype.js, que no soporta algunas tablas de Inter) con interletraje por
 * pares. Los caracteres que la fuente no tiene (emojis, ✔) se omiten: los
 * iconos se dibujan aparte como formas SVG.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

export type Peso = 400 | 700 | 900;

const ARCHIVOS: Record<Peso, string> = { 400: "Inter-Regular.ttf", 700: "Inter-Bold.ttf", 900: "Inter-Black.ttf" };

type Fuente = ReturnType<typeof opentype.parse>;
const cache = new Map<Peso, Fuente>();
let dirResuelto: string | null | undefined;

function aqui(): string {
  try { return path.dirname(fileURLToPath(import.meta.url)); } catch { return process.cwd(); }
}

/** Carpeta con los TTF: src/lib/estudio-anuncios → assets/fonts, o dist → assets/fonts, o desde la raíz del monorepo. */
export function dirDeFuentes(): string | null {
  if (dirResuelto !== undefined) return dirResuelto;
  const base = aqui();
  const candidatos = [
    process.env.FUENTES_DIR,
    path.resolve(base, "../../../assets/fonts"),
    path.resolve(base, "../assets/fonts"),
    path.resolve(base, "../../assets/fonts"),
    path.resolve(process.cwd(), "artifacts/api-server/assets/fonts"),
    path.resolve(process.cwd(), "assets/fonts"),
    "/app/artifacts/api-server/assets/fonts",
  ].filter(Boolean) as string[];
  dirResuelto = candidatos.find((d) => fs.existsSync(path.join(d, ARCHIVOS[700]))) || null;
  return dirResuelto;
}

function fuente(peso: Peso): Fuente {
  const hit = cache.get(peso);
  if (hit) return hit;
  const dir = dirDeFuentes();
  if (!dir) throw new Error("No se encontraron las fuentes del Estudio de anuncios (assets/fonts/Inter-*.ttf).");
  const buf = fs.readFileSync(path.join(dir, ARCHIVOS[peso]));
  const f = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  cache.set(peso, f);
  return f;
}

export function fuentesDisponibles(): boolean {
  try { fuente(700); return true; } catch { return false; }
}

/** Quita lo que la fuente no puede dibujar (emojis, símbolos) y normaliza espacios. */
export function limpiarTexto(texto: string): string {
  return String(texto ?? "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B50}\u{2B06}\u{2194}-\u{21FF}\u{2300}-\u{23FF}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ancho en px de `texto` a `size` px con el `peso` dado. */
export function medir(texto: string, size: number, peso: Peso = 700): number {
  const f = fuente(peso);
  const escala = size / f.unitsPerEm;
  let x = 0; let prev: any = null;
  for (const ch of texto) {
    const g: any = f.charToGlyph(ch);
    if (!g || (g.index === 0 && ch !== " ")) continue;
    if (prev) x += f.getKerningValue(prev, g) * escala;
    x += (g.advanceWidth || 0) * escala;
    prev = g;
  }
  return x;
}

export interface Trazo { d: string; width: number }

/**
 * Trazado SVG de una línea. `y` es la línea base. `anchor` alinea como en SVG.
 */
export function trazar(texto: string, x: number, y: number, size: number, peso: Peso = 700, anchor: "start" | "middle" | "end" = "start"): Trazo {
  const f = fuente(peso);
  const escala = size / f.unitsPerEm;
  const ancho = medir(texto, size, peso);
  let cx = anchor === "middle" ? x - ancho / 2 : anchor === "end" ? x - ancho : x;
  let d = ""; let prev: any = null;
  for (const ch of texto) {
    const g: any = f.charToGlyph(ch);
    if (!g || (g.index === 0 && ch !== " ")) continue;
    if (prev) cx += f.getKerningValue(prev, g) * escala;
    if (ch !== " ") d += g.getPath(cx, y, size).toPathData(2);
    cx += (g.advanceWidth || 0) * escala;
    prev = g;
  }
  return { d, width: ancho };
}

/** Parte un texto en líneas que quepan en `maxWidth`; corta con "…" si supera `maxLines`. */
export function envolver(texto: string, size: number, peso: Peso, maxWidth: number, maxLines = 3): string[] {
  const palabras = limpiarTexto(texto).split(" ").filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  const cabe = (s: string) => medir(s, size, peso) <= maxWidth;
  for (const p of palabras) {
    const intento = actual ? `${actual} ${p}` : p;
    if (cabe(intento)) { actual = intento; continue; }
    if (actual) lineas.push(actual);
    if (cabe(p)) { actual = p; continue; }
    // Palabra más ancha que la caja: se parte por letras.
    let trozo = "";
    for (const ch of p) {
      if (cabe(trozo + ch)) trozo += ch;
      else { if (trozo) lineas.push(trozo); trozo = ch; }
    }
    actual = trozo;
  }
  if (actual) lineas.push(actual);
  if (lineas.length <= maxLines) return lineas;
  const corte = lineas.slice(0, maxLines);
  let ultima = corte[maxLines - 1]!;
  while (ultima && !cabe(`${ultima}…`)) ultima = ultima.replace(/\s*\S+$/, "");
  corte[maxLines - 1] = `${ultima || corte[maxLines - 1]!.slice(0, 3)}…`;
  return corte;
}

export interface Parrafo {
  /** Grupo SVG con los trazados ya posicionados. */
  svg: string;
  /** Alto total ocupado (px). */
  height: number;
  /** Tamaño final de letra (px). */
  size: number;
  lineas: string[];
  /** Ancho de la línea más larga. */
  width: number;
  /** Cajas [x, y, w, h] de cada línea (para dibujar resaltados detrás). */
  cajas: Array<[number, number, number, number]>;
}

export interface OpcionesParrafo {
  texto: string;
  x: number;
  /** Borde superior del bloque. */
  y: number;
  maxWidth: number;
  /** Tamaño ideal; baja hasta `min` para que entre en `maxLines`. */
  size: number;
  min?: number;
  peso?: Peso;
  maxLines?: number;
  lineHeight?: number;
  anchor?: "start" | "middle" | "end";
  fill?: string;
  /** Resaltado tipo subtítulo de anuncio detrás de cada línea. */
  resaltado?: { fill: string; padX?: number; padY?: number; radio?: number };
  opacity?: number;
}

/** Bloque de texto multilínea que se ajusta solo. */
export function parrafo(o: OpcionesParrafo): Parrafo {
  const peso = o.peso ?? 700;
  const maxLines = o.maxLines ?? 3;
  const min = o.min ?? Math.max(18, Math.round(o.size * 0.55));
  const lh = o.lineHeight ?? 1.12;
  const anchor = o.anchor ?? "start";
  let size = o.size;
  let lineas = envolver(o.texto, size, peso, o.maxWidth, 99);
  while (lineas.length > maxLines && size > min) {
    size = Math.max(min, Math.round(size * 0.92));
    lineas = envolver(o.texto, size, peso, o.maxWidth, 99);
  }
  if (lineas.length > maxLines) lineas = envolver(o.texto, size, peso, o.maxWidth, maxLines);
  const f = fuente(peso);
  const ascender = (f.ascender / f.unitsPerEm) * size;
  const alto = size * lh;
  const partes: string[] = [];
  const fondos: string[] = [];
  const cajas: Array<[number, number, number, number]> = [];
  let maxW = 0;
  lineas.forEach((l, i) => {
    const baseY = o.y + i * alto + ascender + (alto - size) / 2;
    const t = trazar(l, o.x, baseY, size, peso, anchor);
    maxW = Math.max(maxW, t.width);
    const x0 = anchor === "middle" ? o.x - t.width / 2 : anchor === "end" ? o.x - t.width : o.x;
    cajas.push([x0, o.y + i * alto, t.width, alto]);
    if (o.resaltado) {
      const px = o.resaltado.padX ?? Math.round(size * 0.28), py = o.resaltado.padY ?? Math.round(size * 0.08), r = o.resaltado.radio ?? Math.round(size * 0.18);
      fondos.push(`<rect x="${(x0 - px).toFixed(1)}" y="${(o.y + i * alto - py).toFixed(1)}" width="${(t.width + px * 2).toFixed(1)}" height="${(alto + py * 2).toFixed(1)}" rx="${r}" fill="${o.resaltado.fill}"/>`);
    }
    if (t.d) partes.push(`<path d="${t.d}"/>`);
  });
  const svg = `<g${o.opacity != null ? ` opacity="${o.opacity}"` : ""}>${fondos.join("")}<g fill="${o.fill ?? "#fff"}">${partes.join("")}</g></g>`;
  return { svg, height: lineas.length * alto, size, lineas, width: maxW, cajas };
}
