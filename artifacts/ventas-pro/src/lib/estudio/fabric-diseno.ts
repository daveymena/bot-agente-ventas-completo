/**
 * Puente Diseño ⇄ Fabric.js.
 *
 * El Diseño (JSON) es lo que se guarda y lo que el servidor pinta con sharp;
 * Fabric es solo la superficie de edición. Cada objeto del lienzo lleva su
 * `capa` original en `obj.capa`, y al exportar se vuelve a leer posición,
 * tamaño y propiedades editadas.
 */
import { Canvas, StaticCanvas, FabricImage, Textbox, Rect, Ellipse, Gradient, Shadow, filters, classRegistry, type FabricObject } from "fabric";
import { proxyDeImagen, nuevoId, type Capa, type CapaFondo, type CapaImagen, type CapaTexto, type Diseno } from "./diseno";

export type Lienzo = Canvas | StaticCanvas;
type ObjetoConCapa = FabricObject & { capa?: Capa; esFondo?: boolean };

/** Texto con resaltado tipo "subtítulo de anuncio" (caja redondeada con aire), igual que el servidor. */
export class TextoAnuncio extends Textbox {
  static type = "TextoAnuncio";
  declare resaltado: string | null;

  constructor(texto: string, opciones: Record<string, unknown> = {}) {
    super(texto, opciones as any);
    this.resaltado = (opciones.resaltado as string | null) ?? null;
  }

  _renderTextLinesBackground(ctx: CanvasRenderingContext2D): void {
    if (!this.resaltado) return super._renderTextLinesBackground(ctx);
    const size = this.fontSize, px = size * 0.28, py = size * 0.08, r = size * 0.18;
    const left = this._getLeftOffset();
    let top = this._getTopOffset();
    ctx.save();
    ctx.fillStyle = this.resaltado;
    for (let i = 0; i < this._textLines.length; i++) {
      const h = this.getHeightOfLine(i), w = this.getLineWidth(i);
      if (w > 0) {
        const x = left + this._getLineLeftOffset(i) - px, y = top - py, ww = w + px * 2, hh = h + py * 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.lineTo(x + ww - r, y); ctx.quadraticCurveTo(x + ww, y, x + ww, y + r);
        ctx.lineTo(x + ww, y + hh - r); ctx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
        ctx.lineTo(x + r, y + hh); ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath(); ctx.fill();
      }
      top += h;
    }
    ctx.restore();
  }

  toObject(propiedades: any[] = []): any {
    return super.toObject([...propiedades, "resaltado"] as any);
  }
}
classRegistry.setClass(TextoAnuncio);

let fuentesListas: Promise<void> | null = null;
/** Fabric mide el texto con la fuente que haya en ese momento: se espera a Inter antes de dibujar. */
export function esperarFuentes(): Promise<void> {
  if (!fuentesListas) {
    fuentesListas = (async () => {
      try {
        if (typeof document === "undefined" || !document.fonts) return;
        await Promise.all([400, 700, 900].map((p) => document.fonts.load(`${p} 40px Inter`)));
        await document.fonts.ready;
      } catch { /* sin Font Loading API: se dibuja con lo que haya */ }
    })();
  }
  return fuentesListas;
}

const PESO_FABRIC: Record<number, string> = { 400: "normal", 700: "bold", 900: "900" };
const ALINEAR: Record<CapaTexto["alinear"], string> = { izq: "left", centro: "center", der: "right" };
const ALINEAR_INV: Record<string, CapaTexto["alinear"]> = { left: "izq", center: "centro", right: "der", justify: "izq" };

function fondoDeCanvas(c: Lienzo, f: CapaFondo | undefined, W: number, H: number): void {
  if (!f) { c.backgroundColor = "#ffffff"; return; }
  if (typeof f.relleno === "string") { c.backgroundColor = f.relleno; return; }
  const ang = ((f.relleno.angulo ?? 180) % 360) * Math.PI / 180;
  const x2 = 0.5 + Math.sin(ang) * 0.5, y2 = 0.5 - Math.cos(ang) * 0.5, x1 = 1 - x2, y1 = 1 - y2;
  c.backgroundColor = new Gradient({
    type: "linear", gradientUnits: "pixels",
    coords: { x1: x1 * W, y1: y1 * H, x2: x2 * W, y2: y2 * H },
    colorStops: [{ offset: 0, color: f.relleno.degradado[0] }, { offset: 1, color: f.relleno.degradado[1] }],
  }) as any;
}

async function cargarFoto(src: string): Promise<FabricImage | null> {
  try {
    return await FabricImage.fromURL(proxyDeImagen(src), { crossOrigin: "anonymous" });
  } catch {
    return null;
  }
}

function aplicarAjuste(img: FabricImage, capa: CapaImagen): void {
  const iw = img.width || 1, ih = img.height || 1;
  if (capa.ajuste === "cubrir") {
    const s = Math.max(capa.w / iw, capa.h / ih);
    const cw = capa.w / s, ch = capa.h / s;
    img.set({ cropX: (iw - cw) / 2, cropY: (ih - ch) / 2, width: cw, height: ch, scaleX: s, scaleY: s, left: capa.x, top: capa.y });
  } else {
    const s = Math.min(capa.w / iw, capa.h / ih);
    img.set({ cropX: 0, cropY: 0, width: iw, height: ih, scaleX: s, scaleY: s, left: capa.x + (capa.w - iw * s) / 2, top: capa.y + (capa.h - ih * s) / 2 });
  }
  aplicarEstiloImagen(img, capa);
}

export function aplicarEstiloImagen(img: FabricImage, capa: Pick<CapaImagen, "radio" | "sombra">): void {
  const s = img.scaleX || 1;
  if (capa.radio && capa.radio > 0) {
    const r = Math.min(capa.radio / s, (img.width || 1) / 2, (img.height || 1) / 2);
    img.clipPath = new Rect({ width: img.width, height: img.height, rx: r, ry: r, originX: "center", originY: "center" });
  } else {
    img.clipPath = undefined;
  }
  img.shadow = capa.sombra ? new Shadow({ color: "rgba(0,0,0,0.38)", blur: 44, offsetX: 0, offsetY: 22 }) : null;
}

function crearTexto(capa: CapaTexto): TextoAnuncio {
  return new TextoAnuncio(capa.texto, {
    left: capa.x, top: capa.y, width: Math.max(20, capa.w),
    fontFamily: "Inter, system-ui, sans-serif", fontSize: capa.tam, fontWeight: PESO_FABRIC[capa.peso] || "bold",
    fill: capa.color, textAlign: ALINEAR[capa.alinear] || "left", lineHeight: capa.interlineado ?? 1,
    resaltado: capa.resaltado || null, opacity: capa.opacidad ?? 1, angle: capa.rot ?? 0,
    splitByGrapheme: false, editable: true, lockScalingFlip: true,
  });
}

/** Crea el objeto Fabric de una capa (sin fondo). */
export async function objetoDeCapa(capa: Capa): Promise<ObjetoConCapa | null> {
  let obj: ObjetoConCapa | null = null;
  if (capa.tipo === "imagen") {
    const img = await cargarFoto(capa.src);
    if (!img) return null;
    aplicarAjuste(img, capa);
    img.set({ opacity: capa.opacidad ?? 1, angle: capa.rot ?? 0 });
    obj = img as ObjetoConCapa;
  } else if (capa.tipo === "rect") {
    obj = new Rect({ left: capa.x, top: capa.y, width: capa.w, height: capa.h, rx: capa.radio ?? 0, ry: capa.radio ?? 0, fill: capa.relleno, opacity: capa.opacidad ?? 1, angle: capa.rot ?? 0, stroke: capa.borde?.color, strokeWidth: capa.borde?.grosor ?? 0 }) as ObjetoConCapa;
  } else if (capa.tipo === "circulo") {
    obj = new Ellipse({ left: capa.x, top: capa.y, rx: capa.w / 2, ry: capa.h / 2, fill: capa.relleno, opacity: capa.opacidad ?? 1 }) as ObjetoConCapa;
  } else if (capa.tipo === "texto") {
    obj = crearTexto(capa) as ObjetoConCapa;
  }
  if (!obj) return null;
  obj.capa = capa;
  if (capa.bloqueada) obj.set({ selectable: false, evented: false });
  obj.set({ transparentCorners: false, cornerColor: "#4F46E5", cornerStrokeColor: "#ffffff", borderColor: "#4F46E5", cornerSize: 10, padding: 2 });
  return obj;
}

/** Vacía el lienzo y carga el diseño completo (fondo + capas). */
export async function cargarDisenoEnCanvas(c: Lienzo, d: Diseno): Promise<void> {
  await esperarFuentes();
  c.clear();
  const W = d.ancho, H = d.alto;
  const fondo = d.capas.find((k): k is CapaFondo => k.tipo === "fondo");
  fondoDeCanvas(c, fondo, W, H);
  if (fondo?.imagen) {
    const img = await cargarFoto(fondo.imagen);
    if (img) {
      const iw = img.width || 1, ih = img.height || 1;
      const s = Math.max(W / iw, H / ih) * 1.06; // un poco más grande: el desenfoque come los bordes
      img.set({ left: (W - iw * s) / 2, top: (H - ih * s) / 2, scaleX: s, scaleY: s, selectable: false, evented: false });
      try {
        img.filters = [new filters.Blur({ blur: Math.min(1, (fondo.desenfoque ?? 36) / 60) })];
        img.applyFilters();
      } catch { /* sin WebGL ni filtros: la foto queda nítida */ }
      (img as ObjetoConCapa).esFondo = true;
      c.add(img);
      const velo = new Rect({ left: 0, top: 0, width: W, height: H, fill: `rgba(0,0,0,${Math.min(0.95, Math.max(0, fondo.oscurecer ?? 0.5))})`, selectable: false, evented: false }) as ObjetoConCapa;
      velo.esFondo = true;
      c.add(velo);
    }
  }
  for (const capa of d.capas) {
    if (capa.tipo === "fondo") continue;
    const obj = await objetoDeCapa(capa);
    if (obj) c.add(obj);
  }
  c.requestRenderAll();
}

/** Lee el lienzo y devuelve el diseño actualizado (posiciones, tamaños y textos editados). */
export function canvasADiseno(c: Lienzo, base: Diseno): Diseno {
  const fondo = base.capas.find((k): k is CapaFondo => k.tipo === "fondo");
  const capas: Capa[] = fondo ? [{ ...fondo }] : [{ id: nuevoId("f"), tipo: "fondo", x: 0, y: 0, w: base.ancho, h: base.alto, relleno: String(c.backgroundColor || "#ffffff") }];
  for (const o of c.getObjects() as ObjetoConCapa[]) {
    if (o.esFondo) continue;
    const capa = o.capa;
    if (!capa) continue;
    const comun = { x: r2(o.left || 0), y: r2(o.top || 0), rot: o.angle ? r2(o.angle) : undefined, opacidad: o.opacity != null && o.opacity < 1 ? r2(o.opacity) : undefined };
    if (capa.tipo === "texto") {
      const t = o as unknown as TextoAnuncio;
      const esc = t.scaleY || 1;
      capas.push({ ...capa, ...comun, texto: t.text, w: r2((t.width || capa.w) * (t.scaleX || 1)), h: r2((t.height || capa.h) * esc), tam: r2(t.fontSize * esc), peso: pesoDe(t.fontWeight), color: String(t.fill || capa.color), alinear: ALINEAR_INV[t.textAlign] || "izq", interlineado: t.lineHeight, resaltado: t.resaltado || null });
    } else if (capa.tipo === "imagen") {
      const img = o as unknown as FabricImage;
      capas.push({ ...capa, ...comun, w: r2(img.getScaledWidth()), h: r2(img.getScaledHeight()) });
    } else if (capa.tipo === "rect") {
      const rc = o as unknown as Rect;
      capas.push({ ...capa, ...comun, w: r2(rc.getScaledWidth()), h: r2(rc.getScaledHeight()), relleno: String(rc.fill || capa.relleno), radio: r2((rc.rx || 0) * (rc.scaleX || 1)), borde: rc.strokeWidth && rc.stroke ? { color: String(rc.stroke), grosor: rc.strokeWidth } : undefined });
    } else if (capa.tipo === "circulo") {
      const el = o as unknown as Ellipse;
      capas.push({ ...capa, ...comun, w: r2(el.getScaledWidth()), h: r2(el.getScaledHeight()), relleno: String(el.fill || capa.relleno) });
    }
  }
  return { ...base, capas };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
function pesoDe(p: string | number): 400 | 700 | 900 {
  const n = typeof p === "number" ? p : p === "bold" ? 700 : p === "normal" ? 400 : Number(p) || 700;
  return n >= 800 ? 900 : n >= 600 ? 700 : 400;
}

/** Fabric escala con scaleX/Y; para que el JSON guarde medidas reales, se hornean en width/height/fontSize. */
export function hornearEscala(o: ObjetoConCapa): void {
  const capa = o.capa;
  if (!capa) return;
  const sx = o.scaleX || 1, sy = o.scaleY || 1;
  if (capa.tipo === "texto") {
    const t = o as unknown as TextoAnuncio;
    if (sx !== 1 || sy !== 1) t.set({ fontSize: r2(t.fontSize * sy), width: Math.max(20, r2((t.width || 1) * sx)), scaleX: 1, scaleY: 1 });
    t.initDimensions();
  } else if (capa.tipo === "rect") {
    const rc = o as unknown as Rect;
    if (sx !== 1 || sy !== 1) rc.set({ width: r2((rc.width || 1) * sx), height: r2((rc.height || 1) * sy), scaleX: 1, scaleY: 1 });
  } else if (capa.tipo === "circulo") {
    const el = o as unknown as Ellipse;
    if (sx !== 1 || sy !== 1) el.set({ rx: r2((el.rx || 1) * sx), ry: r2((el.ry || 1) * sy), scaleX: 1, scaleY: 1 });
  } else if (capa.tipo === "imagen") {
    const img = o as unknown as FabricImage;
    // Las fotos sí se escalan (no se re-muestrean); solo se recalcula el radio del recorte.
    aplicarEstiloImagen(img, capa);
    if (capa.ajuste === "cubrir" && Math.abs(sx - sy) > 0.001) {
      // Estiraron la caja: se vuelve a "cubrir" el nuevo tamaño sin deformar la foto.
      const w = img.getScaledWidth(), h = img.getScaledHeight();
      const cap: CapaImagen = { ...capa, x: img.left || 0, y: img.top || 0, w, h };
      // El elemento original completo:
      const el = img.getElement() as HTMLImageElement | undefined;
      img.set({ cropX: 0, cropY: 0, width: el?.naturalWidth || img.width, height: el?.naturalHeight || img.height, scaleX: 1, scaleY: 1 });
      aplicarAjuste(img, cap);
    }
  }
  o.setCoords();
}

/** Pinta un diseño fuera de pantalla y devuelve un data URL (PNG a tamaño real o JPG reducido). */
export async function exportarDiseno(d: Diseno, opts: { formato?: "png" | "jpeg"; escala?: number; calidad?: number } = {}): Promise<string> {
  const el = document.createElement("canvas");
  const c = new StaticCanvas(el, { width: d.ancho, height: d.alto, enableRetinaScaling: false });
  try {
    await cargarDisenoEnCanvas(c, d);
    c.renderAll();
    return c.toDataURL({ format: opts.formato || "png", quality: opts.calidad ?? 0.92, multiplier: opts.escala ?? 1 });
  } finally {
    c.dispose();
  }
}

export function dataUrlABlob(dataUrl: string): Blob {
  const [cab, b64] = dataUrl.split(",");
  const tipo = /data:(.*?);/.exec(cab || "")?.[1] || "image/png";
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}
