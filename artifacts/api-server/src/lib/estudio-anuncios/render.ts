/**
 * Dibuja un Diseño con sharp (sin navegador ni fuentes del sistema).
 *
 * Fondo (color, degradado, patrón o foto difuminada) + capas en orden:
 * imágenes (contener/cubrir, esquinas redondeadas, sombra), formas, iconos y
 * emojis (elementos.ts) y textos (contornos de 20 familias, ver
 * tipografia.ts). Es el motor de la generación automática, de las miniaturas
 * y de los fotogramas del vídeo; `renderizarCapas` pinta un grupo de capas
 * sobre fondo transparente para animarlas una a una en video.ts.
 */
import sharp from "sharp";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getImageStoreDir } from "../image-store";
import { parrafo } from "./tipografia";
import { svgDeElemento } from "./elementos";
import { sombraDeSilueta } from "./recorte";
import { FACTOR_LINEA_FABRIC, svgDePatron, type Capa, type CapaFondo, type CapaIcono, type CapaImagen, type CapaTexto, type Diseno } from "./esquema";

export type Cargador = (src: string) => Promise<Buffer | null>;

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** Convierte "rgba(255,255,255,0.18)" o "#rrggbb" a {fill, opacity} que librsvg entiende sin problemas. */
function color(c: string): { fill: string; opacity: number } {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(String(c || "").trim());
  if (m) return { fill: `rgb(${m[1]},${m[2]},${m[3]})`, opacity: m[4] != null ? Number(m[4]) : 1 };
  const s = String(c || "#000").trim();
  if (s === "transparent" || s === "none") return { fill: "#000", opacity: 0 };
  return { fill: s, opacity: 1 };
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
  if (capa.radio && capa.radio > 0 && !capa.recortada) {
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

/** Gira un PNG alrededor de su centro (fondo transparente) y devuelve la nueva esquina. */
async function rotarPng(png: Buffer, x: number, y: number, grados: number): Promise<{ png: Buffer; x: number; y: number }> {
  const antes = await sharp(png).metadata();
  const girado = await sharp(png).rotate(grados, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
  const cx = x + (antes.width || 0) / 2, cy = y + (antes.height || 0) / 2;
  return { png: girado.data, x: Math.round(cx - girado.info.width / 2), y: Math.round(cy - girado.info.height / 2) };
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
    texto: capa.texto, x, y: capa.y, maxWidth: Math.max(10, capa.w), size: capa.tam, min: Math.max(10, Math.round(capa.tam * 0.6)), peso: capa.peso, familia: capa.fuente,
    maxLines: capa.maxLineas ?? 6, lineHeight: (capa.interlineado ?? 1) * FACTOR_LINEA_FABRIC, anchor, fill: c.fill,
    resaltado: capa.resaltado ? { fill: color(capa.resaltado).fill } : undefined,
    contorno: capa.contorno && capa.contorno.grosor > 0 ? { color: capa.contorno.color, grosor: capa.contorno.grosor } : undefined,
    opacity: capa.opacidad != null ? capa.opacidad * c.opacity : c.opacity,
  });
  if (!p.lineas.length) return null;
  const rot = capa.rot ? ` transform="rotate(${capa.rot} ${capa.x + capa.w / 2} ${capa.y + capa.h / 2})"` : "";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><g${rot}>${p.svg}</g></svg>`);
}

/** Icono/emoji/logo/forma escalado dentro de su caja, centrado y con rotación. */
async function pngIcono(capa: CapaIcono): Promise<{ png: Buffer; x: number; y: number } | null> {
  const el = svgDeElemento(capa.icono, capa.color);
  if (!el) return null;
  const w = Math.max(2, Math.round(capa.w)), h = Math.max(2, Math.round(capa.h));
  const escala = Math.min(w / el.ancho, h / el.alto);
  const dw = Math.max(1, Math.round(el.ancho * escala)), dh = Math.max(1, Math.round(el.alto * escala));
  // Se pinta el SVG al tamaño destino (librsvg lo escala sin perder nitidez). Se sustituyen width/height si ya venían.
  const svg = el.svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, "")} width="${dw}" height="${dh}">`);
  let png = await sharp(Buffer.from(svg), { density: 72 }).resize(dw, dh, { fit: "fill" }).png().toBuffer();
  const op = capa.opacidad != null ? Math.max(0, Math.min(1, capa.opacidad)) : 1;
  if (op < 1) png = await sharp(png).ensureAlpha().linear([1, 1, 1, op], [0, 0, 0, 0]).png().toBuffer();
  let x = Math.round(capa.x + (w - dw) / 2), y = Math.round(capa.y + (h - dh) / 2);
  if (capa.rot) ({ png, x, y } = await rotarPng(png, x, y, capa.rot));
  return { png, x, y };
}

function svgFondo(fondo: CapaFondo | undefined, W: number, H: number): Buffer {
  const relleno = fondo ? fondo.relleno : "#ffffff";
  if (typeof relleno === "string") {
    const c = color(relleno);
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${c.fill}" fill-opacity="${c.opacity}"/></svg>`);
  }
  if ("patron" in relleno) return Buffer.from(svgDePatron(relleno, W, H));
  const ang = ((relleno.angulo ?? 180) % 360) * Math.PI / 180;
  const x2 = 50 + Math.sin(ang) * 50, y2 = 50 - Math.cos(ang) * 50, x1 = 100 - x2, y1 = 100 - y2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%"><stop offset="0" stop-color="${esc(relleno.degradado[0])}"/><stop offset="1" stop-color="${esc(relleno.degradado[1])}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`);
}

/** Capas superpuestas (sin el fondo) listas para `composite`. */
async function overlaysDe(capas: Capa[], W: number, H: number, cargar: Cargador): Promise<sharp.OverlayOptions[]> {
  const out: sharp.OverlayOptions[] = [];
  for (const capa of capas) {
    if (capa.tipo === "fondo") continue;
    const op = capa.opacidad != null ? Math.max(0, Math.min(1, capa.opacidad)) : 1;
    if (op <= 0) continue;
    if (capa.tipo === "imagen") {
      const buf = await cargar(capa.src);
      if (!buf) continue;
      try {
        const prep = await prepararImagen(capa, buf);
        if (!prep) continue;
        if (capa.sombra && capa.recortada) {
          // Recorte sin fondo: la sombra sigue la silueta del producto, no la caja.
          const sb = await sombraDeSilueta(prep.png, { opacidad: 0.42 });
          const s = await colocar(sb.png, prep.x - sb.margen, prep.y - sb.margen, W, H);
          if (s) out.push(s);
        } else if (capa.sombra) {
          const s = await colocar(await sombraPara(prep.w, prep.h, capa.radio ?? 0), prep.x - 60, prep.y - 60 + 26, W, H);
          if (s) out.push(s);
        }
        let png = prep.png, x = prep.x, y = prep.y;
        if (op < 1) png = await sharp(png).ensureAlpha().linear([1, 1, 1, op], [0, 0, 0, 0]).png().toBuffer();
        if (capa.rot) ({ png, x, y } = await rotarPng(png, x, y, capa.rot));
        const col = await colocar(png, x, y, W, H);
        if (col) out.push(col);
      } catch { /* imagen corrupta: se omite, el anuncio sale igual */ }
      continue;
    }
    if (capa.tipo === "rect") {
      const c = color(capa.relleno);
      const borde = capa.borde ? ` stroke="${esc(capa.borde.color)}" stroke-width="${capa.borde.grosor}"` : "";
      const rot = capa.rot ? ` transform="rotate(${capa.rot} ${capa.x + capa.w / 2} ${capa.y + capa.h / 2})"` : "";
      out.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${capa.x}" y="${capa.y}" width="${capa.w}" height="${capa.h}" rx="${capa.radio ?? 0}" fill="${c.fill}" fill-opacity="${c.opacity * op}"${borde}${rot}/></svg>`), left: 0, top: 0 });
      continue;
    }
    if (capa.tipo === "circulo") {
      const c = color(capa.relleno);
      out.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><ellipse cx="${capa.x + capa.w / 2}" cy="${capa.y + capa.h / 2}" rx="${capa.w / 2}" ry="${capa.h / 2}" fill="${c.fill}" fill-opacity="${c.opacity * op}"/></svg>`), left: 0, top: 0 });
      continue;
    }
    if (capa.tipo === "icono") {
      try {
        const ic = await pngIcono(capa);
        if (!ic) continue;
        const col = await colocar(ic.png, ic.x, ic.y, W, H);
        if (col) out.push(col);
      } catch { /* SVG raro: se omite */ }
      continue;
    }
    if (capa.tipo === "texto") {
      const svg = svgTexto(capa, W, H);
      if (svg) out.push({ input: svg, left: 0, top: 0 });
    }
  }
  return out;
}

async function componer(base: sharp.Sharp, overlays: sharp.OverlayOptions[]): Promise<sharp.Sharp> {
  // sharp limita las entradas por composite en algunas versiones: se aplica por tandas.
  let out = base;
  for (let i = 0; i < overlays.length; i += 20) {
    out = sharp(await out.composite(overlays.slice(i, i + 20)).png().toBuffer());
  }
  return out;
}

/** Solo el fondo del diseño (color/degradado/patrón + foto difuminada) como PNG opaco. */
export async function renderizarFondo(d: Diseno, opts: { cargar?: Cargador } = {}): Promise<Buffer> {
  const cargar = opts.cargar || cargadorConCache();
  const W = Math.round(d.ancho), H = Math.round(d.alto);
  const fondo = d.capas.find((c): c is CapaFondo => c.tipo === "fondo");
  const base = sharp(svgFondo(fondo, W, H));
  const overlays: sharp.OverlayOptions[] = [];
  if (fondo?.imagen) {
    const buf = await cargar(fondo.imagen);
    if (buf) {
      try {
        const oscuro = Math.min(0.95, Math.max(0, fondo.oscurecer ?? 0.5));
        const foto = await sharp(buf, { failOn: "none" }).rotate().resize(W, H, { fit: "cover" }).blur(Math.max(0.3, fondo.desenfoque ?? 36)).modulate({ brightness: 1 - oscuro, saturation: 1.15 }).png().toBuffer();
        overlays.push({ input: foto, left: 0, top: 0 });
      } catch { /* la foto de fondo no se pudo leer: queda el color */ }
    }
  }
  return (await componer(sharp(await base.png().toBuffer()), overlays)).flatten({ background: "#ffffff" }).png().toBuffer();
}

/** Render completo del diseño. `formato` de salida: png (por defecto) o jpg. */
export async function renderizarDiseno(d: Diseno, opts: { cargar?: Cargador; salida?: "png" | "jpg"; calidad?: number; escala?: number } = {}): Promise<Buffer> {
  const cargar = opts.cargar || cargadorConCache();
  const W = Math.round(d.ancho), H = Math.round(d.alto);
  const fondo = await renderizarFondo(d, { cargar });
  const overlays = await overlaysDe(d.capas, W, H, cargar);
  let out = await componer(sharp(fondo), overlays);
  if (opts.escala && opts.escala !== 1) out = out.resize(Math.round(W * opts.escala), Math.round(H * opts.escala));
  if (opts.salida === "jpg") return out.flatten({ background: "#ffffff" }).jpeg({ quality: opts.calidad ?? 90, mozjpeg: true }).toBuffer();
  return out.png().toBuffer();
}

export interface CapaPintada { png: Buffer; x: number; y: number; w: number; h: number }

/**
 * Pinta un grupo de capas (sin fondo) sobre transparente y devuelve solo el
 * recuadro ocupado: es lo que el vídeo anima (entra deslizando, con zoom…).
 * Devuelve null si el grupo no dejó ningún píxel visible.
 */
export async function renderizarCapas(d: Diseno, capas: Capa[], opts: { cargar?: Cargador } = {}): Promise<CapaPintada | null> {
  const cargar = opts.cargar || cargadorConCache();
  const W = Math.round(d.ancho), H = Math.round(d.alto);
  const overlays = await overlaysDe(capas.filter((c) => c.tipo !== "fondo"), W, H, cargar);
  if (!overlays.length) return null;
  const vacio = sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  const lleno = await componer(sharp(await vacio.png().toBuffer()), overlays);
  try {
    const rec = await lleno.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).png().toBuffer({ resolveWithObject: true });
    const x = Math.max(0, -(rec.info.trimOffsetLeft ?? 0)), y = Math.max(0, -(rec.info.trimOffsetTop ?? 0));
    if (!rec.info.width || !rec.info.height) return null;
    // Múltiplos de 2 para que ffmpeg no se queje con yuv420p.
    const w = rec.info.width + (rec.info.width % 2), h = rec.info.height + (rec.info.height % 2);
    const png = w !== rec.info.width || h !== rec.info.height ? await sharp(rec.data).extend({ right: w - rec.info.width, bottom: h - rec.info.height, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() : rec.data;
    return { png, x, y, w, h };
  } catch {
    // trim falla si la imagen es toda transparente.
    return null;
  }
}
