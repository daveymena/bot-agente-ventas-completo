/**
 * Estudio de anuncios — el DISEÑO es el formato de proyecto.
 *
 * Un diseño es un JSON de capas (fondo, imagen, rectángulo, círculo, texto)
 * sobre un lienzo de un formato de Meta. El mismo JSON lo dibujan dos
 * motores: sharp en el servidor (render.ts: generación automática, miniaturas,
 * fotogramas del vídeo cuando no hay navegador) y Fabric.js en el panel (el
 * editor, con el que el dueño mueve, cambia y exporta). Por eso las plantillas
 * de acá no producen imágenes: producen diseños editables.
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

// ─── Capas ───────────────────────────────────────────────────────────────────

interface CapaBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Grados. Solo lo aplica el editor; las plantillas no rotan. */
  rot?: number;
  opacidad?: number;
  nombre?: string;
  bloqueada?: boolean;
}

export interface CapaFondo extends CapaBase {
  tipo: "fondo";
  relleno: string | { degradado: [string, string]; angulo?: number };
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
  color: string;
  alinear: "izq" | "centro" | "der";
  /** Interlineado estilo Fabric (1 = normal). */
  interlineado?: number;
  /** Color del resaltado detrás de cada línea (subtítulo de anuncio) o null. */
  resaltado?: string | null;
  maxLineas?: number;
}

export type Capa = CapaFondo | CapaImagen | CapaRect | CapaCirculo | CapaTexto;

export interface Diseno {
  version: 1;
  formato: Formato;
  ancho: number;
  alto: number;
  plantilla: string;
  /** Qué gancho y qué foto usó (para que el paquete no repita). */
  gancho?: string;
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

/** Contraste: texto oscuro sobre colores claros. */
export function textoSobre(hex: string): "#111827" | "#ffffff" {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? "#111827" : "#ffffff";
}

function oscurecerHex(hex: string, factor: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "#312E81";
  const n = parseInt(m[1]!, 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * factor))).toString(16).padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

export const AMARILLO = "#FFD60A";
export const VERDE_WA = "#25D366";

// ─── Ayudas de maquetación ───────────────────────────────────────────────────

let contador = 0;
const id = (p: string) => `${p}-${(++contador).toString(36)}`;

/** Zona segura: Historias/Reels tapan arriba y abajo con la interfaz de la app. */
function zonaSegura(f: Formato) {
  const { ancho: W, alto: H } = FORMATOS[f];
  if (f === "historia") return { W, H, top: 260, bottom: H - 320, m: 64 };
  if (f === "vertical") return { W, H, top: 64, bottom: H - 64, m: 60 };
  return { W, H, top: 56, bottom: H - 56, m: 56 };
}

interface OpcionesTexto {
  x: number; y: number; w: number; texto: string; tam: number; min?: number; peso?: Peso; color: string;
  alinear?: "izq" | "centro" | "der"; maxLineas?: number; resaltado?: string | null; interlineado?: number; nombre?: string;
}

/** Capa de texto ya ajustada: calcula el tamaño que entra y el alto real. */
function texto(o: OpcionesTexto): { capa: CapaTexto; alto: number } {
  const peso = o.peso ?? 700;
  const interlineado = o.interlineado ?? 1;
  const limpio = limpiarTexto(o.texto);
  const p = parrafo({
    texto: limpio, x: o.x, y: o.y, maxWidth: o.w, size: o.tam, min: o.min, peso, maxLines: o.maxLineas ?? 3,
    lineHeight: interlineado * FACTOR_LINEA_FABRIC, anchor: "start",
  });
  const capa: CapaTexto = {
    id: id("t"), tipo: "texto", nombre: o.nombre, x: o.x, y: o.y, w: o.w, h: Math.ceil(p.height),
    texto: limpio, tam: p.size, peso, color: o.color, alinear: o.alinear ?? "izq", interlineado,
    resaltado: o.resaltado ?? null, maxLineas: o.maxLineas ?? 3,
  };
  return { capa, alto: p.height };
}

/** Píldora con texto centrado (sello, CTA). Devuelve rect + texto. */
function pildora(x: number, y: number, textoP: string, opts: { alto: number; tam: number; fondo: string; color: string; peso?: Peso; anchoMin?: number; anchoMax?: number; centrarEn?: number }): { capas: Capa[]; w: number } {
  const t = limpiarTexto(textoP);
  const peso = opts.peso ?? 700;
  let tam = opts.tam;
  let ancho = medir(t, tam, peso) + opts.alto * 1.1;
  const max = opts.anchoMax ?? 10_000;
  while (ancho > max && tam > 18) { tam -= 2; ancho = medir(t, tam, peso) + opts.alto * 1.1; }
  const w = Math.max(opts.anchoMin ?? 0, Math.round(ancho));
  const x0 = opts.centrarEn != null ? Math.round(opts.centrarEn - w / 2) : x;
  const rect: CapaRect = { id: id("r"), tipo: "rect", x: x0, y, w, h: opts.alto, relleno: opts.fondo, radio: Math.round(opts.alto / 2), nombre: "Botón" };
  const tx = texto({ x: x0, y: y + Math.round((opts.alto - tam * FACTOR_LINEA_FABRIC) / 2), w, texto: t, tam, min: tam, peso, color: opts.color, alinear: "centro", maxLineas: 1, nombre: "Texto del botón" });
  return { capas: [rect, tx.capa], w };
}

/** Sello circular de precio. */
function selloPrecio(cx: number, cy: number, r: number, precio: string, sub: string | null, fondo = AMARILLO, color = "#111827"): Capa[] {
  const capas: Capa[] = [{ id: id("c"), tipo: "circulo", x: cx - r, y: cy - r, w: r * 2, h: r * 2, relleno: fondo, nombre: "Sello de precio" }];
  const tamPrecio = Math.round(r * (precio.length > 8 ? 0.42 : 0.52));
  const altoPrecio = tamPrecio * FACTOR_LINEA_FABRIC;
  const altoSub = sub ? Math.round(r * 0.2) * FACTOR_LINEA_FABRIC + 6 : 0;
  const y0 = cy - (altoPrecio + altoSub) / 2;
  capas.push(texto({ x: cx - r, y: y0, w: r * 2, texto: precio, tam: tamPrecio, min: Math.round(tamPrecio * 0.7), peso: 900, color, alinear: "centro", maxLineas: 1, nombre: "Precio" }).capa);
  if (sub) capas.push(texto({ x: cx - r + 10, y: y0 + altoPrecio + 4, w: r * 2 - 20, texto: sub, tam: Math.round(r * 0.2), min: 16, peso: 700, color, alinear: "centro", maxLineas: 1, nombre: "Detalle del precio" }).capa);
  return capas;
}

function marcaChip(z: ReturnType<typeof zonaSegura>, marca: string, color: string, y?: number): Capa[] {
  if (!marca) return [];
  const t = texto({ x: z.m, y: y ?? z.top, w: z.W - z.m * 2, texto: marca.toUpperCase(), tam: 28, min: 20, peso: 700, color, alinear: "izq", maxLineas: 1, nombre: "Marca" });
  return [t.capa];
}

const ICONO_CHECK = "✓";

// ─── Plantillas ──────────────────────────────────────────────────────────────

export type Plantilla = "destacado" | "oferta" | "beneficios" | "minimal";

export const PLANTILLAS: Record<Plantilla, { nombre: string; descripcion: string }> = {
  destacado: { nombre: "Producto protagonista", descripcion: "La foto real a pantalla completa, gancho resaltado, precio y botón." },
  oferta: { nombre: "Oferta", descripcion: "Tarjeta blanca con la foto, precio grande y sellos reales del negocio." },
  beneficios: { nombre: "Beneficios", descripcion: "Tres razones de compra sacadas de la ficha, con la foto al lado." },
  minimal: { nombre: "Minimal", descripcion: "Fondo limpio, producto grande y precio. Estilo premium." },
};

export const PLANTILLAS_LISTA = Object.keys(PLANTILLAS) as Plantilla[];

export interface OpcionesPlantilla {
  /** Índice del gancho a usar (rota entre las variantes). */
  gancho?: number;
  /** Índice de la foto a usar. */
  foto?: number;
}

export function disenoDePlantilla(plantilla: Plantilla, formato: Formato, c: Contenido, o: OpcionesPlantilla = {}): Diseno {
  const gancho = c.ganchos[(o.gancho ?? 0) % Math.max(1, c.ganchos.length)] || c.titular || c.nombre;
  const foto = c.fotos.length ? c.fotos[(o.foto ?? 0) % c.fotos.length]! : null;
  const base = { version: 1 as const, formato, ancho: FORMATOS[formato].ancho, alto: FORMATOS[formato].alto, plantilla, gancho };
  switch (plantilla) {
    case "oferta": return { ...base, capas: capasOferta(formato, c, gancho, foto) };
    case "beneficios": return { ...base, capas: capasBeneficios(formato, c, gancho, foto) };
    case "minimal": return { ...base, capas: capasMinimal(formato, c, gancho, foto) };
    default: return { ...base, capas: capasDestacado(formato, c, gancho, foto) };
  }
}

/** 1) Producto protagonista: foto a pantalla completa sobre su versión difuminada. */
function capasDestacado(f: Formato, c: Contenido, gancho: string, foto: string | null): Capa[] {
  const z = zonaSegura(f);
  const capas: Capa[] = [{ id: id("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: "#0B0B14", imagen: foto, desenfoque: 40, oscurecer: 0.55, nombre: "Fondo" }];
  const alto = z.bottom - z.top;
  // Gancho arriba
  const g = texto({ x: z.m, y: z.top + 8, w: z.W - z.m * 2, texto: gancho, tam: f === "historia" ? 92 : 76, min: 44, peso: 900, color: "#111827", alinear: "centro", maxLineas: f === "historia" ? 3 : 2, resaltado: AMARILLO, nombre: "Gancho" });
  capas.push(...marcaChip(z, c.marca, "#ffffff", f === "historia" ? z.top - 60 : undefined));
  if (f !== "historia") g.capa.y = z.top + 44;
  capas.push(g.capa);
  // Foto
  const botonAlto = f === "cuadrado" ? 92 : 104;
  const yFoto = g.capa.y + g.alto + 28;
  const yBoton = z.bottom - botonAlto;
  const hFoto = Math.max(300, yBoton - 40 - yFoto);
  if (foto) capas.push({ id: id("i"), tipo: "imagen", src: foto, ajuste: "contener", x: z.m, y: yFoto, w: z.W - z.m * 2, h: hFoto, sombra: true, radio: 24, nombre: "Foto del producto" });
  // Precio
  if (c.precio) {
    const r = f === "cuadrado" ? 120 : 150;
    capas.push(...selloPrecio(z.W - z.m - r, yBoton - r - 24, r, c.precio, c.sellos.find((s) => /recibir/i.test(s)) ? "pagas al recibir" : null));
  }
  // Botón
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 38 : 44, fondo: /whatsapp/i.test(c.cta) ? VERDE_WA : AMARILLO, color: /whatsapp/i.test(c.cta) ? "#ffffff" : "#111827", peso: 900, anchoMin: Math.round(z.W * 0.6), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2 }).capas);
  void alto;
  return capas;
}

/** 2) Oferta: tarjeta blanca con la foto, precio grande y sellos reales. */
function capasOferta(f: Formato, c: Contenido, gancho: string, foto: string | null): Capa[] {
  const z = zonaSegura(f);
  const oscuro = oscurecerHex(c.color, 0.55);
  const capas: Capa[] = [{ id: id("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: { degradado: [c.color, oscuro], angulo: 160 }, nombre: "Fondo" }];
  const colorSobreMarca = textoSobre(c.color);
  capas.push(...marcaChip(z, c.marca, colorSobreMarca));
  const yCard = z.top + 56;
  const hDisponible = z.bottom - yCard;
  const hCard = Math.round(hDisponible * (f === "historia" ? 0.52 : 0.56));
  capas.push({ id: id("r"), tipo: "rect", x: z.m, y: yCard, w: z.W - z.m * 2, h: hCard, relleno: "#ffffff", radio: 36, nombre: "Tarjeta" });
  if (foto) capas.push({ id: id("i"), tipo: "imagen", src: foto, ajuste: "contener", x: z.m + 28, y: yCard + 28, w: z.W - z.m * 2 - 56, h: hCard - 56, radio: 20, nombre: "Foto del producto" });
  let y = yCard + hCard + 36;
  const g = texto({ x: z.m, y, w: z.W - z.m * 2, texto: gancho, tam: f === "historia" ? 72 : 60, min: 38, peso: 900, color: colorSobreMarca, alinear: "izq", maxLineas: 2, nombre: "Gancho" });
  capas.push(g.capa); y += g.alto + 18;
  if (c.precio) {
    const antes = texto({ x: z.m, y, w: z.W - z.m * 2, texto: "Llévalo por", tam: 30, min: 24, peso: 700, color: colorSobreMarca, alinear: "izq", maxLineas: 1, nombre: "Etiqueta de precio" });
    antes.capa.opacidad = 0.85;
    capas.push(antes.capa); y += antes.alto + 2;
    const p = texto({ x: z.m, y, w: z.W - z.m * 2, texto: c.precio, tam: f === "cuadrado" ? 88 : 104, min: 60, peso: 900, color: AMARILLO, alinear: "izq", maxLineas: 1, nombre: "Precio" });
    capas.push(p.capa); y += p.alto + 16;
  }
  // Sellos reales (máximo 3)
  let x = z.m;
  for (const s of c.sellos.slice(0, 3)) {
    const pil = pildora(x, y, s, { alto: 56, tam: 26, fondo: "rgba(255,255,255,0.18)", color: colorSobreMarca, peso: 700 });
    if (x + pil.w > z.W - z.m) break;
    capas.push(...pil.capas); x += pil.w + 14;
  }
  if (c.sellos.length) y += 56 + 24;
  const botonAlto = f === "cuadrado" ? 88 : 100;
  const yBoton = Math.max(y, z.bottom - botonAlto);
  if (yBoton + botonAlto <= z.H) capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 36 : 42, fondo: /whatsapp/i.test(c.cta) ? VERDE_WA : "#ffffff", color: /whatsapp/i.test(c.cta) ? "#ffffff" : c.color, peso: 900, anchoMin: Math.round(z.W * 0.6), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2 }).capas);
  return capas;
}

/** 3) Beneficios: título + tres puntos reales con viñeta, foto al lado o arriba. */
function capasBeneficios(f: Formato, c: Contenido, gancho: string, foto: string | null): Capa[] {
  const z = zonaSegura(f);
  const capas: Capa[] = [{ id: id("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: "#F8FAFC", nombre: "Fondo" }];
  capas.push({ id: id("r"), tipo: "rect", x: 0, y: 0, w: z.W, h: f === "historia" ? 200 : 18, relleno: c.color, nombre: "Franja de marca" });
  capas.push(...marcaChip(z, c.marca, f === "historia" ? textoSobre(c.color) : c.color, f === "historia" ? 110 : z.top));
  const puntos = c.puntos.length ? c.puntos : [c.titular];
  const apilado = f !== "cuadrado";
  let y = z.top + 60;
  if (apilado) {
    const hFoto = Math.round((z.bottom - z.top) * (f === "historia" ? 0.4 : 0.44));
    if (foto) capas.push({ id: id("i"), tipo: "imagen", src: foto, ajuste: "cubrir", x: z.m, y, w: z.W - z.m * 2, h: hFoto, radio: 32, sombra: true, nombre: "Foto del producto" });
    y += hFoto + 40;
  }
  const colTexto = apilado ? { x: z.m, w: z.W - z.m * 2 } : { x: z.m, w: Math.round(z.W * 0.52) };
  if (!apilado && foto) capas.push({ id: id("i"), tipo: "imagen", src: foto, ajuste: "cubrir", x: z.m + colTexto.w + 32, y: z.top + 60, w: z.W - z.m * 2 - colTexto.w - 32, h: z.bottom - z.top - 60 - 120, radio: 28, sombra: true, nombre: "Foto del producto" });
  const g = texto({ x: colTexto.x, y, w: colTexto.w, texto: gancho, tam: f === "historia" ? 68 : 54, min: 34, peso: 900, color: "#0F172A", alinear: "izq", maxLineas: 2, nombre: "Gancho" });
  capas.push(g.capa); y += g.alto + 26;
  for (const p of puntos.slice(0, 3)) {
    const r = 22;
    capas.push({ id: id("c"), tipo: "circulo", x: colTexto.x, y: y + 4, w: r * 2, h: r * 2, relleno: c.color, nombre: "Viñeta" });
    capas.push(texto({ x: colTexto.x, y: y + 4 + (r * 2 - 26 * FACTOR_LINEA_FABRIC) / 2, w: r * 2, texto: ICONO_CHECK, tam: 26, min: 26, peso: 900, color: textoSobre(c.color), alinear: "centro", maxLineas: 1, nombre: "Check" }).capa);
    const t = texto({ x: colTexto.x + r * 2 + 18, y, w: colTexto.w - r * 2 - 18, texto: p, tam: f === "historia" ? 38 : 32, min: 24, peso: 700, color: "#1E293B", alinear: "izq", maxLineas: 2, nombre: "Beneficio" });
    capas.push(t.capa); y += Math.max(t.alto, r * 2 + 8) + 18;
  }
  const botonAlto = f === "cuadrado" ? 84 : 96;
  const yBoton = z.bottom - botonAlto;
  if (c.precio) {
    const p = texto({ x: z.m, y: yBoton - 100, w: colTexto.w, texto: c.precio, tam: 72, min: 48, peso: 900, color: c.color, alinear: "izq", maxLineas: 1, nombre: "Precio" });
    if (p.capa.y > y) capas.push(p.capa);
  }
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 34 : 40, fondo: /whatsapp/i.test(c.cta) ? VERDE_WA : c.color, color: /whatsapp/i.test(c.cta) ? "#ffffff" : textoSobre(c.color), peso: 900, anchoMin: apilado ? Math.round(z.W * 0.6) : colTexto.w, anchoMax: apilado ? z.W - z.m * 2 : colTexto.w, centrarEn: apilado ? z.W / 2 : undefined }).capas);
  return capas;
}

/** 4) Minimal: fondo claro, producto enorme, nombre y precio. */
function capasMinimal(f: Formato, c: Contenido, gancho: string, foto: string | null): Capa[] {
  const z = zonaSegura(f);
  const capas: Capa[] = [{ id: id("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: { degradado: ["#FFFFFF", "#EEF2FF"], angulo: 180 }, nombre: "Fondo" }];
  capas.push(...marcaChip(z, c.marca, "#64748B"));
  const g = texto({ x: z.m, y: z.top + 48, w: z.W - z.m * 2, texto: gancho, tam: f === "historia" ? 80 : 64, min: 40, peso: 900, color: "#0F172A", alinear: "centro", maxLineas: 2, nombre: "Gancho" });
  capas.push(g.capa);
  const yPie = z.bottom - (f === "cuadrado" ? 150 : 190);
  const yFoto = g.capa.y + g.alto + 30;
  if (foto) capas.push({ id: id("i"), tipo: "imagen", src: foto, ajuste: "contener", x: z.m + 20, y: yFoto, w: z.W - z.m * 2 - 40, h: Math.max(260, yPie - 24 - yFoto), sombra: true, radio: 16, nombre: "Foto del producto" });
  const n = texto({ x: z.m, y: yPie, w: c.precio ? Math.round(z.W * 0.58) : z.W - z.m * 2, texto: c.titular, tam: 40, min: 26, peso: 700, color: "#334155", alinear: "izq", maxLineas: 2, nombre: "Nombre del producto" });
  capas.push(n.capa);
  if (c.precio) capas.push(texto({ x: z.W - z.m - Math.round(z.W * 0.38), y: yPie - 6, w: Math.round(z.W * 0.38), texto: c.precio, tam: 64, min: 40, peso: 900, color: c.color, alinear: "der", maxLineas: 1, nombre: "Precio" }).capa);
  const botonAlto = f === "cuadrado" ? 72 : 84;
  capas.push(...pildora(z.m, z.bottom - botonAlto, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 30 : 34, fondo: "#0F172A", color: "#ffffff", peso: 700, anchoMin: Math.round(z.W * 0.5), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2 }).capas);
  return capas;
}

// ─── Escenas de vídeo ────────────────────────────────────────────────────────

export type Transicion = "fade" | "smoothleft" | "circleopen" | "slideup" | "zoomin" | "fadeblack";

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
}

export type RolDeEscena = "gancho" | "producto" | "beneficio" | "precio" | "cierre";

/** Escenas automáticas: gancho → producto → beneficios → precio → cierre, con fotos distintas. */
export function escenasAutomaticas(c: Contenido, opts: { maxBeneficios?: number } = {}): Escena[] {
  const roles: Array<{ rol: RolDeEscena; texto: string; locucion: string; dur: number }> = [];
  const gancho = c.ganchos[0] || c.titular;
  roles.push({ rol: "gancho", texto: gancho, locucion: gancho, dur: 3.2 });
  roles.push({ rol: "producto", texto: c.titular, locucion: `${c.titular}: ${c.puntos[0] ? c.puntos[0] : "míralo con tus propios ojos"}.`, dur: 3.5 });
  for (const p of c.puntos.slice(0, opts.maxBeneficios ?? 2)) roles.push({ rol: "beneficio", texto: p, locucion: p, dur: 3.5 });
  if (c.precio) roles.push({ rol: "precio", texto: `Solo ${c.precio}`, locucion: `Solo ${c.precio}${c.sellos.some((s) => /recibir/i.test(s)) ? ", y lo pagas cuando lo recibes" : ""}.`, dur: 3.5 });
  roles.push({ rol: "cierre", texto: c.cta, locucion: `${c.cta}.`, dur: 3.5 });
  return roles.map((r, i) => ({
    id: id("e"),
    diseno: disenoDeEscena(r.rol, r.texto, c, i),
    duracion: r.dur,
    locucion: r.locucion,
    transicion: (["smoothleft", "circleopen", "slideup", "fadeblack", "zoomin", "fade"] as Transicion[])[i % 6],
    movimiento: i % 2 === 0 ? "acercar" : "alejar",
  }));
}

/** Fotograma 9:16 de una escena según su papel. Rota las fotos para no repetir la misma toma. */
export function disenoDeEscena(rol: RolDeEscena, textoEscena: string, c: Contenido, indice: number): Diseno {
  const f: Formato = "historia";
  const z = zonaSegura(f);
  const foto = c.fotos.length ? c.fotos[indice % c.fotos.length]! : null;
  const capas: Capa[] = [{ id: id("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: "#0B0B14", imagen: foto, desenfoque: 46, oscurecer: 0.5, nombre: "Fondo" }];
  if (c.marca) capas.push(...marcaChip(z, c.marca, "#ffffff", 120));
  const esGancho = rol === "gancho";
  if (foto) capas.push({ id: id("i"), tipo: "imagen", src: foto, ajuste: rol === "beneficio" ? "cubrir" : "contener", x: 40, y: esGancho ? 560 : 330, w: z.W - 80, h: esGancho ? 1000 : 1080, radio: 28, sombra: true, nombre: "Foto del producto" });
  const t = texto({ x: z.m, y: esGancho ? 230 : 1470, w: z.W - z.m * 2, texto: textoEscena, tam: esGancho ? (textoEscena.length > 30 ? 84 : 104) : (textoEscena.length > 34 ? 68 : 84), min: 46, peso: 900, color: esGancho ? "#111827" : "#ffffff", alinear: "centro", maxLineas: 3, resaltado: esGancho ? AMARILLO : c.color, nombre: "Texto de la escena" });
  capas.push(t.capa);
  if (rol === "precio" && c.precio) capas.push(...selloPrecio(z.W - 64 - 165, 1300, 165, c.precio, c.sellos.some((s) => /recibir/i.test(s)) ? "pagas al recibir" : null));
  if (rol === "cierre") {
    const wa = /whatsapp/i.test(c.cta);
    capas.push(...pildora(80, 1700, c.cta, { alto: 110, tam: 48, fondo: wa ? VERDE_WA : AMARILLO, color: wa ? "#ffffff" : "#111827", peso: 900, anchoMin: 760, anchoMax: z.W - 160, centrarEn: z.W / 2 }).capas);
    const sello = c.sellos.find((s) => /recibir|env[ií]o/i.test(s));
    if (sello) capas.push(texto({ x: z.m, y: 1830, w: z.W - z.m * 2, texto: sello, tam: 34, min: 26, peso: 700, color: "#ffffff", alinear: "centro", maxLineas: 1, nombre: "Sello" }).capa);
  }
  return { version: 1, formato: f, ancho: z.W, alto: z.H, plantilla: `escena-${rol}`, gancho: textoEscena, capas };
}

// ─── Paquete ─────────────────────────────────────────────────────────────────

export interface PiezaDelPaquete { plantilla: Plantilla; formato: Formato; diseno: Diseno }

/** Diseños del paquete: plantillas × formatos, rotando ganchos y fotos. */
export function paqueteDeDisenos(c: Contenido, opts: { plantillas?: Plantilla[]; formatos?: Formato[] } = {}): PiezaDelPaquete[] {
  const plantillas = opts.plantillas?.length ? opts.plantillas : PLANTILLAS_LISTA;
  const formatos = opts.formatos?.length ? opts.formatos : FORMATOS_LISTA;
  const out: PiezaDelPaquete[] = [];
  plantillas.forEach((plantilla, i) => {
    for (const formato of formatos) out.push({ plantilla, formato, diseno: disenoDePlantilla(plantilla, formato, c, { gancho: i, foto: i }) });
  });
  return out;
}

/** Validación mínima de un diseño que llega del editor (no confiamos en el cliente). */
export function validarDiseno(d: any): d is Diseno {
  if (!d || typeof d !== "object" || !Array.isArray(d.capas)) return false;
  if (!FORMATOS[d.formato as Formato]) return false;
  if (d.capas.length > 200) return false;
  return d.capas.every((c: any) => c && typeof c.tipo === "string" && Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.w) && Number.isFinite(c.h));
}
