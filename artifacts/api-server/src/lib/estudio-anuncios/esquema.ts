/**
 * Estudio de anuncios — el DISEÑO es el formato de proyecto.
 *
 * Un diseño es un JSON de capas (fondo, imagen, rectángulo, círculo, texto,
 * icono) sobre un lienzo de un formato de Meta. El mismo JSON lo dibujan dos
 * motores: sharp en el servidor (render.ts: generación automática, miniaturas,
 * fotogramas del vídeo) y Fabric.js en el panel (el editor). Por eso las
 * plantillas de acá no producen imágenes: producen diseños editables.
 *
 * Este archivo es el esquema y las ayudas de maquetación compartidas; las
 * maquetas viven en maquetas.ts, los estilos/temas en estilos.ts y temas.ts,
 * las escenas de vídeo en escenas.ts. diseno.ts lo reexporta todo.
 *
 * Reglas del proyecto (CLAUDE.md): nada que el producto o el negocio no
 * respalden. Los sellos ("Paga al recibir", "Envío gratis") salen de las
 * condiciones reales del negocio, nunca del tipo de producto.
 */
import { medir, parrafo, limpiarTexto, type Peso } from "./tipografia";

// ─── Formatos ────────────────────────────────────────────────────────────────

export type Formato = "cuadrado" | "vertical" | "historia";

export const FORMATOS: Record<Formato, { ancho: number; alto: number; etiqueta: string; uso: string }> = {
  cuadrado: { ancho: 1080, alto: 1080, etiqueta: "1:1", uso: "Feed y carrusel" },
  vertical: { ancho: 1080, alto: 1350, etiqueta: "4:5", uso: "Feed de Instagram y Facebook" },
  historia: { ancho: 1080, alto: 1920, etiqueta: "9:16", uso: "Historias, Reels y TikTok" },
};

export const FORMATOS_LISTA = Object.keys(FORMATOS) as Formato[];

// ─── Animación (vídeo) ───────────────────────────────────────────────────────

export type Entrada = "aparecer" | "deslizar-izq" | "deslizar-der" | "deslizar-arriba" | "deslizar-abajo" | "zoom" | "rebote";

export const ANIMACIONES: Record<Entrada, string> = {
  aparecer: "Aparecer", "deslizar-izq": "Entrar desde la izquierda", "deslizar-der": "Entrar desde la derecha",
  "deslizar-arriba": "Entrar desde arriba", "deslizar-abajo": "Entrar desde abajo", zoom: "Zoom", rebote: "Rebote",
};

export interface Animacion {
  entrada?: Entrada | null;
  /** Segundos desde el inicio de la escena. */
  retraso?: number;
  /** Duración de la entrada en segundos (0.2–1.5). */
  duracion?: number;
  salida?: "desvanecer" | null;
}

// ─── Capas ───────────────────────────────────────────────────────────────────

interface CapaBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Grados. Solo lo aplica el editor; las maquetas casi no rotan. */
  rot?: number;
  opacidad?: number;
  nombre?: string;
  bloqueada?: boolean;
  /** Cómo entra en el vídeo (se ignora en imágenes). */
  anim?: Animacion | null;
}

export interface RellenoPatron { patron: string; color: string; fondo: string; escala?: number }
export type RellenoFondo = string | { degradado: [string, string]; angulo?: number } | RellenoPatron;

export interface CapaFondo extends CapaBase {
  tipo: "fondo";
  relleno: RellenoFondo;
  /** Foto de fondo (se dibuja cubriendo, desenfocada y oscurecida). */
  imagen?: string | null;
  desenfoque?: number;
  /** 0–1: cuánto se oscurece la foto de fondo. */
  oscurecer?: number;
}

export interface CapaImagen extends CapaBase {
  tipo: "imagen";
  src: string;
  ajuste: "contener" | "cubrir";
  radio?: number;
  sombra?: boolean;
}

export interface CapaRect extends CapaBase {
  tipo: "rect";
  relleno: string;
  radio?: number;
  borde?: { color: string; grosor: number };
}

export interface CapaCirculo extends CapaBase {
  tipo: "circulo";
  relleno: string;
}

export interface CapaTexto extends CapaBase {
  tipo: "texto";
  texto: string;
  /** Tamaño de letra en px (ya ajustado para que entre en la caja). */
  tam: number;
  peso: Peso;
  /** Id de familia tipográfica (tipografia.ts FUENTES); sin valor = Inter. */
  fuente?: string;
  color: string;
  alinear: "izq" | "centro" | "der";
  /** Interlineado estilo Fabric (1 = normal). */
  interlineado?: number;
  /** Color del resaltado detrás de cada línea (subtítulo de anuncio) o null. */
  resaltado?: string | null;
  /** Contorno alrededor de las letras (texto sobre foto). */
  contorno?: { color: string; grosor: number } | null;
  maxLineas?: number;
}

/** Emoji, icono, logo o forma (elementos.ts). `icono` es `coleccion:nombre` o `svg:<markup>`. */
export interface CapaIcono extends CapaBase {
  tipo: "icono";
  icono: string;
  color?: string | null;
}

export type Capa = CapaFondo | CapaImagen | CapaRect | CapaCirculo | CapaTexto | CapaIcono;

export interface Diseno {
  version: 1;
  formato: Formato;
  ancho: number;
  alto: number;
  plantilla: string;
  /** Qué gancho usó (para que el paquete no repita). */
  gancho?: string;
  estilo?: string;
  tema?: string;
  capas: Capa[];
}

// ─── Contenido del anuncio ───────────────────────────────────────────────────

export interface Contenido {
  nombre: string;
  /** Nombre corto para titulares (≤ 40). */
  titular: string;
  /** Frases de apertura, cortas, en orden de preferencia. */
  ganchos: string[];
  /** Beneficios reales (≤ 3). */
  puntos: string[];
  /** "$59.900" o null si no hay precio. */
  precio: string | null;
  /** Sellos del negocio: "Paga al recibir", "Envío gratis"… */
  sellos: string[];
  cta: string;
  marca: string;
  /** Color primario de la marca. */
  color: string;
  /** Fotos reales del producto (URLs o rutas). La primera es la principal. */
  fotos: string[];
  logo?: string | null;
}

/** Fabric multiplica el alto de línea por 1.13; el servidor usa el mismo factor para que coincidan. */
export const FACTOR_LINEA_FABRIC = 1.13;

// ─── Color ───────────────────────────────────────────────────────────────────

function rgbDe(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) {
    const c = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(String(hex || "").trim());
    if (!c) return null;
    return [parseInt(c[1]! + c[1]!, 16), parseInt(c[2]! + c[2]!, 16), parseInt(c[3]! + c[3]!, 16)];
  }
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminancia relativa 0–1 (WCAG). */
export function luminancia(hex: string): number {
  const rgb = rgbDe(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Contraste: texto oscuro sobre colores claros. */
export function textoSobre(hex: string): "#111827" | "#ffffff" {
  const rgb = rgbDe(hex);
  if (!rgb) return "#ffffff";
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum > 0.6 ? "#111827" : "#ffffff";
}

export function oscurecerHex(hex: string, factor: number): string {
  const rgb = rgbDe(hex);
  if (!rgb) return "#312E81";
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * factor))).toString(16).padStart(2, "0");
  return `#${f(rgb[0])}${f(rgb[1])}${f(rgb[2])}`;
}

export function aclararHex(hex: string, cantidad: number): string {
  const rgb = rgbDe(hex);
  if (!rgb) return "#EEF2FF";
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (255 - c) * cantidad))).toString(16).padStart(2, "0");
  return `#${f(rgb[0])}${f(rgb[1])}${f(rgb[2])}`;
}

export const AMARILLO = "#FFD60A";
export const VERDE_WA = "#25D366";

// ─── Patrones de fondo ───────────────────────────────────────────────────────

/** Baldosa SVG (sin <svg>) de `tam` px de lado. El color es el del dibujo; el fondo va aparte. */
export const PATRONES: Record<string, { nombre: string; tam: number; tile: (color: string) => string }> = {
  puntos: { nombre: "Puntos", tam: 40, tile: (c) => `<circle cx="20" cy="20" r="4" fill="${c}"/>` },
  "puntos-finos": { nombre: "Puntos finos", tam: 24, tile: (c) => `<circle cx="12" cy="12" r="1.6" fill="${c}"/>` },
  diagonales: { nombre: "Líneas diagonales", tam: 40, tile: (c) => `<path d="M-10 10L10-10M0 40L40 0M30 50L50 30" stroke="${c}" stroke-width="4"/>` },
  cuadricula: { nombre: "Cuadrícula", tam: 60, tile: (c) => `<path d="M60 0H0V60" fill="none" stroke="${c}" stroke-width="2"/>` },
  ondas: { nombre: "Ondas", tam: 80, tile: (c) => `<path d="M0 20c10-10 30-10 40 0s30 10 40 0" fill="none" stroke="${c}" stroke-width="3"/><path d="M0 60c10-10 30-10 40 0s30 10 40 0" fill="none" stroke="${c}" stroke-width="3"/>` },
  circulos: { nombre: "Círculos", tam: 80, tile: (c) => `<circle cx="40" cy="40" r="26" fill="none" stroke="${c}" stroke-width="3"/>` },
  zigzag: { nombre: "Zigzag", tam: 60, tile: (c) => `<path d="M0 20l15-15 15 15 15-15 15 15M0 50l15-15 15 15 15-15 15 15" fill="none" stroke="${c}" stroke-width="3"/>` },
  cruces: { nombre: "Cruces", tam: 50, tile: (c) => `<path d="M25 15v20M15 25h20" stroke="${c}" stroke-width="3" stroke-linecap="round"/>` },
  triangulos: { nombre: "Triángulos", tam: 60, tile: (c) => `<path d="M30 8l18 32H12z" fill="${c}"/>` },
  confeti: { nombre: "Confeti", tam: 120, tile: (c) => `<rect x="10" y="20" width="14" height="6" rx="3" transform="rotate(30 17 23)" fill="${c}"/><circle cx="70" cy="30" r="5" fill="${c}"/><rect x="90" y="80" width="14" height="6" rx="3" transform="rotate(-40 97 83)" fill="${c}"/><circle cx="30" cy="90" r="4" fill="${c}"/><path d="M60 70l6 10h-12z" fill="${c}"/>` },
  rombos: { nombre: "Rombos", tam: 60, tile: (c) => `<path d="M30 6l24 24-24 24L6 30z" fill="none" stroke="${c}" stroke-width="2"/>` },
  estrellas: { nombre: "Estrellitas", tam: 90, tile: (c) => `<path d="M22 8l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill="${c}"/><path d="M66 50l2 5 6 1-4 4 1 6-5-3-5 3 1-6-4-4 6-1z" fill="${c}"/>` },
  corazones: { nombre: "Corazoncitos", tam: 80, tile: (c) => `<path d="M24 36s-14-9-14-19c0-5 4-9 8-9 3 0 5 2 6 4 1-2 3-4 6-4 4 0 8 4 8 9 0 10-14 19-14 19z" fill="${c}"/><path d="M60 70s-9-6-9-12c0-3 2-6 5-6 2 0 3 1 4 2 1-1 2-2 4-2 3 0 5 3 5 6 0 6-9 12-9 12z" fill="${c}"/>` },
};

export const PATRONES_LISTA = Object.keys(PATRONES);

/** SVG completo de un fondo con patrón (lo usa el servidor; el panel arma el mismo tile con Fabric.Pattern). */
export function svgDePatron(r: RellenoPatron, W: number, H: number): string {
  const p = PATRONES[r.patron] || PATRONES.puntos!;
  const esc = Math.max(0.3, Math.min(4, r.escala ?? 1));
  const tam = p.tam * esc;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><pattern id="p" width="${tam}" height="${tam}" patternUnits="userSpaceOnUse"><g transform="scale(${esc})">${p.tile(r.color)}</g></pattern></defs><rect width="${W}" height="${H}" fill="${r.fondo}"/><rect width="${W}" height="${H}" fill="url(#p)"/></svg>`;
}

// ─── Ayudas de maquetación ───────────────────────────────────────────────────

let contador = 0;
export const nuevoId = (p: string) => `${p}-${(++contador).toString(36)}`;

/** Zona segura: Historias/Reels tapan arriba y abajo con la interfaz de la app. */
export function zonaSegura(f: Formato) {
  const { ancho: W, alto: H } = FORMATOS[f];
  if (f === "historia") return { W, H, top: 260, bottom: H - 320, m: 64 };
  if (f === "vertical") return { W, H, top: 64, bottom: H - 64, m: 60 };
  return { W, H, top: 56, bottom: H - 56, m: 56 };
}
export type Zona = ReturnType<typeof zonaSegura>;

export interface OpcionesTexto {
  x: number; y: number; w: number; texto: string; tam: number; min?: number; peso?: Peso; fuente?: string; color: string;
  alinear?: "izq" | "centro" | "der"; maxLineas?: number; resaltado?: string | null; contorno?: { color: string; grosor: number } | null;
  interlineado?: number; nombre?: string; mayusculas?: boolean; anim?: Animacion | null;
}

/** Capa de texto ya ajustada: calcula el tamaño que entra y el alto real. */
export function texto(o: OpcionesTexto): { capa: CapaTexto; alto: number } {
  const peso = o.peso ?? 700;
  const interlineado = o.interlineado ?? 1;
  const limpio = o.mayusculas ? limpiarTexto(o.texto).toUpperCase() : limpiarTexto(o.texto);
  const p = parrafo({
    texto: limpio, x: o.x, y: o.y, maxWidth: o.w, size: o.tam, min: o.min, peso, familia: o.fuente, maxLines: o.maxLineas ?? 3,
    lineHeight: interlineado * FACTOR_LINEA_FABRIC, anchor: "start",
  });
  const capa: CapaTexto = {
    id: nuevoId("t"), tipo: "texto", nombre: o.nombre, x: o.x, y: o.y, w: o.w, h: Math.ceil(p.height),
    texto: limpio, tam: p.size, peso, fuente: o.fuente && o.fuente !== "inter" ? o.fuente : undefined, color: o.color, alinear: o.alinear ?? "izq", interlineado,
    resaltado: o.resaltado ?? null, contorno: o.contorno || undefined, maxLineas: o.maxLineas ?? 3, anim: o.anim || undefined,
  };
  return { capa, alto: p.height };
}

/** Píldora con texto centrado (sello, CTA). Devuelve rect + texto. */
export function pildora(x: number, y: number, textoP: string, opts: { alto: number; tam: number; fondo: string; color: string; peso?: Peso; fuente?: string; anchoMin?: number; anchoMax?: number; centrarEn?: number; radio?: number; nombre?: string; anim?: Animacion | null }): { capas: Capa[]; w: number } {
  const t = limpiarTexto(textoP);
  const peso = opts.peso ?? 700;
  let tam = opts.tam;
  let ancho = medir(t, tam, peso, opts.fuente) + opts.alto * 1.1;
  const max = opts.anchoMax ?? 10_000;
  while (ancho > max && tam > 18) { tam -= 2; ancho = medir(t, tam, peso, opts.fuente) + opts.alto * 1.1; }
  const w = Math.max(opts.anchoMin ?? 0, Math.round(ancho));
  const x0 = opts.centrarEn != null ? Math.round(opts.centrarEn - w / 2) : x;
  const rect: CapaRect = { id: nuevoId("r"), tipo: "rect", x: x0, y, w, h: opts.alto, relleno: opts.fondo, radio: opts.radio ?? Math.round(opts.alto / 2), nombre: opts.nombre ?? "Botón", anim: opts.anim || undefined };
  const tx = texto({ x: x0, y: y + Math.round((opts.alto - tam * FACTOR_LINEA_FABRIC) / 2), w, texto: t, tam, min: tam, peso, fuente: opts.fuente, color: opts.color, alinear: "centro", maxLineas: 1, nombre: opts.nombre ? `Texto de ${opts.nombre.toLowerCase()}` : "Texto del botón", anim: opts.anim });
  return { capas: [rect, tx.capa], w };
}

/** Sello circular (o con forma) de precio. */
export function selloPrecio(cx: number, cy: number, r: number, precio: string, sub: string | null, fondo = AMARILLO, color = "#111827", opts: { forma?: string | null; fuente?: string; anim?: Animacion | null } = {}): Capa[] {
  const capas: Capa[] = opts.forma
    ? [{ id: nuevoId("k"), tipo: "icono", icono: `formas:${opts.forma}`, color: fondo, x: cx - r * 1.12, y: cy - r * 1.12, w: r * 2.24, h: r * 2.24, nombre: "Sello de precio", anim: opts.anim || undefined }]
    : [{ id: nuevoId("c"), tipo: "circulo", x: cx - r, y: cy - r, w: r * 2, h: r * 2, relleno: fondo, nombre: "Sello de precio", anim: opts.anim || undefined }];
  const tamPrecio = Math.round(r * (precio.length > 8 ? 0.42 : 0.52));
  const altoPrecio = tamPrecio * FACTOR_LINEA_FABRIC;
  const altoSub = sub ? Math.round(r * 0.2) * FACTOR_LINEA_FABRIC + 6 : 0;
  const y0 = cy - (altoPrecio + altoSub) / 2;
  capas.push(texto({ x: cx - r, y: y0, w: r * 2, texto: precio, tam: tamPrecio, min: Math.round(tamPrecio * 0.7), peso: 900, fuente: opts.fuente, color, alinear: "centro", maxLineas: 1, nombre: "Precio", anim: opts.anim }).capa);
  if (sub) capas.push(texto({ x: cx - r + 10, y: y0 + altoPrecio + 4, w: r * 2 - 20, texto: sub, tam: Math.round(r * 0.2), min: 16, peso: 700, color, alinear: "centro", maxLineas: 1, nombre: "Detalle del precio", anim: opts.anim }).capa);
  return capas;
}

export function marcaChip(z: Zona, marca: string, color: string, y?: number, fuente?: string): Capa[] {
  if (!marca) return [];
  const t = texto({ x: z.m, y: y ?? z.top, w: z.W - z.m * 2, texto: marca.toUpperCase(), tam: 28, min: 20, peso: 700, fuente, color, alinear: "izq", maxLineas: 1, nombre: "Marca" });
  return [t.capa];
}

/** Capa de icono (elemento) ya posicionada. */
export function icono(ref: string, x: number, y: number, w: number, h: number, extra: Partial<CapaIcono> = {}): CapaIcono {
  return { id: nuevoId("k"), tipo: "icono", icono: ref, x, y, w, h, nombre: extra.nombre ?? "Elemento", ...extra };
}

// ─── Vídeo ───────────────────────────────────────────────────────────────────

/** Transiciones xfade de ffmpeg que se ofrecen (todas existen desde ffmpeg 5). */
export const TRANSICIONES: Record<string, string> = {
  fade: "Fundido", fadeblack: "A negro", fadewhite: "A blanco", dissolve: "Disolver", smoothleft: "Deslizar suave", smoothup: "Subir suave",
  slideleft: "Deslizar", slideup: "Subir", slidedown: "Bajar", wipeleft: "Barrido", wipeup: "Barrido arriba", circleopen: "Círculo abre", circleclose: "Círculo cierra",
  radial: "Radial", zoomin: "Zoom", pixelize: "Pixelar", hblur: "Desenfoque", diagtl: "Diagonal", squeezeh: "Aplastar", vertopen: "Cortina", fadegrays: "A gris",
};
export type Transicion = string;

export interface Escena {
  id: string;
  /** Diseño 9:16 de la escena (el fotograma base). */
  diseno: Diseno;
  /** Segundos en pantalla (la voz puede alargarla). */
  duracion: number;
  /** Lo que dice la voz en off; vacío = sin voz en esa escena. */
  locucion: string;
  transicion?: Transicion;
  /** Movimiento de cámara. */
  movimiento?: "acercar" | "alejar" | "fijo";
  editada?: boolean;
}

export type RolDeEscena = "gancho" | "producto" | "beneficio" | "precio" | "cierre" | "foto" | "pregunta" | "respuesta";

// ─── Validación ──────────────────────────────────────────────────────────────

const TIPOS = new Set(["fondo", "imagen", "rect", "circulo", "texto", "icono"]);

/** Validación mínima de un diseño que llega del editor (no confiamos en el cliente). */
export function validarDiseno(d: any): d is Diseno {
  if (!d || typeof d !== "object" || !Array.isArray(d.capas)) return false;
  if (!FORMATOS[d.formato as Formato]) return false;
  if (d.capas.length > 200) return false;
  return d.capas.every((c: any) => c && typeof c.tipo === "string" && TIPOS.has(c.tipo) && Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.w) && Number.isFinite(c.h)
    && (c.tipo !== "icono" || (typeof c.icono === "string" && c.icono.length < 60_000))
    && (c.tipo !== "texto" || typeof c.texto === "string"));
}
