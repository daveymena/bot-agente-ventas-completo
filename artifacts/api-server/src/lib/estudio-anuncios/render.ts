/**
 * Dibuja un Diseño con sharp (sin navegador ni fuentes del sistema).
 *
 * Fondo (color, degradado o foto difuminada) + capas en orden: imágenes
 * (contener/cubrir, esquinas redondeadas, sombra), formas y textos (contornos
 * de Inter, ver tipografia.ts). Es el motor de la generación automática, de
 * las miniaturas y de los fotogramas del vídeo cuando no hay Chromium.
 */
import sharp from "sharp";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getImageStoreDir } from "../image-store";
import { parrafo } from "./tipografia";
import { FACTOR_LINEA_FABRIC, type CapaImagen, type CapaTexto, type Diseno } from "./diseno";

export type Cargador = (src: string) => Promise<Buffer | null>;

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** Convierte "rgba(255,255,255,0.18)" o "#rrggbb" a {fill, opacity} que librsvg entiende sin problemas. */
function color(c: string): { fill: string; opacity: number } {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(String(c || "").trim());
  if (m) return { fill: `rgb(${m[1]},${m[2]},${m[3]})`, opacity: m[4] != null ? Number(m[4]) : 1 };
  return { fill: String(c || "#000"), opacity: 1 };
}

/**
 * Carga una imagen por URL/ruta. Las fotos del propio servidor
 * (/images/products/…, /uploads/…) se leen del disco aunque vengan con el
 * dominio público delante: sin red de por medio, sin depender de que el
 * dominio responda.
 */
export async function cargarImagen(src: string, timeoutMs = 15_000): Promise<Buffer | null> {
  try {
    const s = String(src || "").trim();
    if (!s) return null;
    if (s.startsWith("data:")) return Buffer.from(s.split(",")[1] || "", "base64");
    const base = getImageStoreDir();
    let ruta = s;
    try { if (/^https?:\/\//i.test(s)) ruta = new URL(s).pathname; } catch { /* no es URL */ }
    const local = /^\/images\/products\/([^/?#]+)$/.exec(ruta)?.[1]
      ? path.join(base, "products", /^\/images\/products\/([^/?#]+)$/.exec(ruta)![1]!)
      : /^\/uploads\/(.+)$/.exec(ruta)?.[1]
        ? path.join(base, /^\/uploads\/(.+)$/.exec(ruta)![1]!.split("?")[0]!)
        : path.isAbsolute(s) && !s.startsWith("/images/") ? s : null;
    if (local && path.resolve(local).startsWith(path.resolve(base)) && existsSync(local) && (await stat(local)).isFile()) return await readFile(local);
    if (!/^https?:\/\//i.test(s)) {
      // Rutas antiguas del repo (/images/products/N.jpg sin volumen) también pueden vivir en el frontend compilado.
      const alt = path.resolve(process.cwd(), "artifacts/ventas-pro/dist/public", ruta.replace(/^\//, ""));
      if (existsSync(alt)) return await readFile(alt);
      return null;
    }
    const r = await fetch(s, { headers: { "User-Agent": "Mozilla/5.0 VentasPro-Estudio" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 100 ? buf : null;
  } catch {
    return null;
  }
}

/** Cargador con caché por trabajo (la misma foto se usa en varias piezas). */
export function cargadorConCache(base: Cargador = cargarImagen): Cargador {
  const cache = new Map<string, Promise<Buffer | null>>();
  return (src) => {
    if (!cache.has(src)) cache.set(src, base(src));
    return cache.get(src)!;
  };
}

function svgRectRedondeado(w: number, h: number, r: number, fill = "#fff"): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/></svg>`);
}

/** Foto ajustada a la caja de la capa, con esquinas redondeadas; devuelve PNG + posición real. */
async function prepararImagen(capa: CapaImagen, buf: Buffer): Promise<{ png: Buffer; x: number; y: number; w: number; h: number } | null> {
  const w = Math.max(2, Math.round(capa.w)), h = Math.max(2, Math.round(capa.h));
  let img = sharp(buf, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return null;
  let outW = w, outH = h, x = Math.round(capa.x), y = Math.round(capa.y);
  if (capa.ajuste === "cubrir") {
    // Centrado (no "attention") para que coincida con el recorte que muestra el editor del panel.
    img = img.resize(w, h, { fit: "cover", position: "centre" });
  } else {
    const esc = Math.min(w / meta.width, h / meta.height);
    outW = Math.max(1, Math.round(meta.width * esc));
    outH = Math.max(1, Math.round(meta.height * esc));
    img = img.resize(outW, outH, { fit: "inside" });
    x += Math.round((w - outW) / 2);
    y += Math.round((h - outH) / 2);
  }
  // sharp puede redondear distinto al calcular "inside": se usan las medidas reales.
  const salida = await img.png().toBuffer({ resolveWithObject: true });
  let png = salida.data;
  outW = salida.info.width; outH = salida.info.height;
  if (capa.radio && capa.radio > 0) {
    png = await sharp(png).composite([{ input: svgRectRedondeado(outW, outH, Math.min(capa.radio, outW / 2, outH / 2)), blend: "dest-in" }]).png().toBuffer();
  }
  return { png, x, y, w: outW, h: outH };
}

async function sombraPara(w: number, h: number, radio: number): Promise<Buffer> {
  const margen = 60;
  const base = await sharp({ create: { width: w + margen * 2, height: h + margen * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: svgRectRedondeado(w, h, radio, "rgba(0,0,0,0.55)"), left: margen, top: margen }])
    .png().toBuffer();
  return sharp(base).blur(22).png().toBuffer();
}

/**
 * sharp exige que lo que se superpone quepa entero en el lienzo y no admite
 * posiciones negativas: una foto que el editor sacó medio afuera, o la sombra
 * (que se extiende 60 px alrededor), se recortan a la parte visible.
 */
async function colocar(png: Buffer, left: number, top: number, W: number, H: number): Promise<sharp.OverlayOptions | null> {
  const meta = await sharp(png).metadata();
  const w = meta.width || 0, h = meta.height || 0;
  if (!w || !h) return null;
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(W, left + w), y1 = Math.min(H, top + h);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 === left && y0 === top && x1 === left + w && y1 === top + h) return { input: png, left, top };
  const recorte = await sharp(png).extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
  return { input: recorte, left: x0, top: y0 };
}

function svgTexto(capa: CapaTexto, W: number, H: number): Buffer | null {
  const anchor = capa.alinear === "centro" ? "middle" : capa.alinear === "der" ? "end" : "start";
  const x = capa.alinear === "centro" ? capa.x + capa.w / 2 : capa.alinear === "der" ? capa.x + capa.w : capa.x;
  const c = color(capa.color);
  const p = parrafo({
    texto: capa.texto, x, y: capa.y, maxWidth: Math.max(10, capa.w), size: capa.tam, min: Math.max(10, Math.round(capa.tam * 0.6)), peso: capa.peso,
    maxLines: capa.maxLineas ?? 6, lineHeight: (capa.interlineado ?? 1) * FACTOR_LINEA_FABRIC, anchor, fill: c.fill,
    resaltado: capa.resaltado ? { fill: color(capa.resaltado).fill } : undefined, opacity: capa.opacidad != null ? capa.opacidad * c.opacity : c.opacity,
  });
  if (!p.lineas.length) return null;
  const rot = capa.rot ? ` transform="rotate(${capa.rot} ${capa.x + capa.w / 2} ${capa.y + capa.h / 2})"` : "";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><g${rot}>${p.svg}</g></svg>`);
}

/** Render completo del diseño. `formato` de salida: png (por defecto) o jpg. */
export async function renderizarDiseno(d: Diseno, opts: { cargar?: Cargador; salida?: "png" | "jpg"; calidad?: number; escala?: number } = {}): Promise<Buffer> {
  const cargar = opts.cargar || cargadorConCache();
  const W = Math.round(d.ancho), H = Math.round(d.alto);
  const fondo = d.capas.find((c) => c.tipo === "fondo");
  let lienzo: sharp.Sharp;
  const relleno = fondo && fondo.tipo === "fondo" ? fondo.relleno : "#ffffff";
  if (typeof relleno === "string") {
    const c = color(relleno);
    lienzo = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${c.fill}"/></svg>`));
  } else {
    const ang = ((relleno.angulo ?? 180) % 360) * Math.PI / 180;
    const x2 = 50 + Math.sin(ang) * 50, y2 = 50 - Math.cos(ang) * 50, x1 = 100 - x2, y1 = 100 - y2;
    lienzo = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%"><stop offset="0" stop-color="${esc(relleno.degradado[0])}"/><stop offset="1" stop-color="${esc(relleno.degradado[1])}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`));
  }
  let base = await lienzo.png().toBuffer();
  const capasComp: sharp.OverlayOptions[] = [];

  if (fondo && fondo.tipo === "fondo" && fondo.imagen) {
    const buf = await cargar(fondo.imagen);
    if (buf) {
      try {
        const oscuro = Math.min(0.95, Math.max(0, fondo.oscurecer ?? 0.5));
        const foto = await sharp(buf, { failOn: "none" }).rotate().resize(W, H, { fit: "cover" }).blur(Math.max(0.3, fondo.desenfoque ?? 36)).modulate({ brightness: 1 - oscuro, saturation: 1.15 }).png().toBuffer();
        capasComp.push({ input: foto, left: 0, top: 0 });
      } catch { /* la foto de fondo no se pudo leer: queda el color */ }
    }
  }

  for (const capa of d.capas) {
    if (capa.tipo === "fondo") continue;
    const op = capa.opacidad != null ? Math.max(0, Math.min(1, capa.opacidad)) : 1;
    if (capa.tipo === "imagen") {
      const buf = await cargar(capa.src);
      if (!buf) continue;
      try {
        const prep = await prepararImagen(capa, buf);
        if (!prep) continue;
        if (capa.sombra) {
          const s = await colocar(await sombraPara(prep.w, prep.h, capa.radio ?? 0), prep.x - 60, prep.y - 60 + 26, W, H);
          if (s) capasComp.push(s);
        }
        let png = prep.png;
        if (op < 1) png = await sharp(png).ensureAlpha().linear([1, 1, 1, op], [0, 0, 0, 0]).png().toBuffer();
        const col = await colocar(png, prep.x, prep.y, W, H);
        if (col) capasComp.push(col);
      } catch { /* imagen corrupta: se omite, el anuncio sale igual */ }
      continue;
    }
    if (capa.tipo === "rect") {
      const c = color(capa.relleno);
      const borde = capa.borde ? ` stroke="${esc(capa.borde.color)}" stroke-width="${capa.borde.grosor}"` : "";
      const rot = capa.rot ? ` transform="rotate(${capa.rot} ${capa.x + capa.w / 2} ${capa.y + capa.h / 2})"` : "";
      capasComp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${capa.x}" y="${capa.y}" width="${capa.w}" height="${capa.h}" rx="${capa.radio ?? 0}" fill="${c.fill}" fill-opacity="${c.opacity * op}"${borde}${rot}/></svg>`), left: 0, top: 0 });
      continue;
    }
    if (capa.tipo === "circulo") {
      const c = color(capa.relleno);
      capasComp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><ellipse cx="${capa.x + capa.w / 2}" cy="${capa.y + capa.h / 2}" rx="${capa.w / 2}" ry="${capa.h / 2}" fill="${c.fill}" fill-opacity="${c.opacity * op}"/></svg>`), left: 0, top: 0 });
      continue;
    }
    if (capa.tipo === "texto") {
      const svg = svgTexto(capa, W, H);
      if (svg) capasComp.push({ input: svg, left: 0, top: 0 });
    }
  }

  // sharp limita las entradas por composite en algunas versiones: se aplica por tandas.
  let out = sharp(base);
  for (let i = 0; i < capasComp.length; i += 20) {
    out = sharp(await out.composite(capasComp.slice(i, i + 20)).png().toBuffer());
  }
  if (opts.escala && opts.escala !== 1) out = out.resize(Math.round(W * opts.escala), Math.round(H * opts.escala));
  if (opts.salida === "jpg") return out.flatten({ background: "#ffffff" }).jpeg({ quality: opts.calidad ?? 90, mozjpeg: true }).toBuffer();
  return out.png().toBuffer();
}
