/**
 * El motor de los creativos de anuncio.
 *
 * Un creativo es una ESCENA: un lienzo de medida fija (la de Meta) con capas
 * apiladas —foto, texto, forma, degradado—. La escena es JSON, así que la
 * puede editar a mano el dueño en el estudio, o Atlas con una herramienta,
 * sin que ninguno de los dos tenga que "dibujar".
 *
 * La misma función `capasAHtml` arma el marcado que:
 *   - el estudio muestra en pantalla (escalado para que entre), y
 *   - Chromium fotografía en el servidor para sacar el PNG final
 *     (ver creativos/render.ts, el mismo patrón que video-anuncio.ts).
 * Un solo dibujante: la vista previa no puede salir distinta del archivo.
 *
 * Coordenadas en PORCENTAJE del lienzo (0–100), no en píxeles: así una escena
 * de 1:1 pasada a 9:16 conserva la composición, y el tamaño de letra va en %
 * del ANCHO para que un titular no cambie de tamaño al cambiar de formato.
 *
 * Módulo PURO (sin node, sin DOM): lo importan servidor y pantalla.
 */
import { enlaceDeFuentes, pilaDe } from "./fuentes";

export type Formato = "1:1" | "4:5" | "9:16" | "1.91:1";

export const FORMATOS: Record<Formato, { ancho: number; alto: number; nombre: string; uso: string }> = {
  "4:5": { ancho: 1080, alto: 1350, nombre: "Vertical 4:5", uso: "Feed de Facebook e Instagram (el que más ocupa pantalla)" },
  "1:1": { ancho: 1080, alto: 1080, nombre: "Cuadrado 1:1", uso: "Feed y carrusel" },
  "9:16": { ancho: 1080, alto: 1920, nombre: "Historia 9:16", uso: "Stories y Reels" },
  "1.91:1": { ancho: 1200, alto: 628, nombre: "Horizontal 1.91:1", uso: "Enlace y columna derecha" },
};

/**
 * Zonas que la interfaz de Meta tapa (perfil arriba; texto, botón y
 * reacciones abajo). Porcentajes del alto/ancho.
 *
 * Fuente: guías de terceros consultadas el 2026-10-14 (adkit.so, billo.app,
 * adsuploader.com), que coinciden en 14 % arriba / 35 % abajo / 6 % a los
 * lados para Reels. VENDOR-REPORTED, no documentación de Meta: se usan como
 * guía visual en el editor, nunca para bloquear nada.
 */
export const ZONAS_SEGURAS: Partial<Record<Formato, { arriba: number; abajo: number; lados: number }>> = {
  "9:16": { arriba: 14, abajo: 35, lados: 6 },
  "4:5": { arriba: 4, abajo: 8, lados: 4 },
};

interface CapaBase {
  id: string;
  nombre?: string;
  x: number; y: number; w: number; h: number;
  /** Grados. */
  rot?: number;
  /** 0–1. */
  opacidad?: number;
  oculta?: boolean;
  bloqueada?: boolean;
}

export interface CapaTexto extends CapaBase {
  tipo: "texto";
  texto: string;
  fuente?: string;
  /** Tamaño de letra en % del ANCHO del lienzo (6 ≈ 65px en 1080). */
  tam: number;
  peso?: number;
  color?: string;
  alinear?: "left" | "center" | "right";
  /** Dónde se apoya el texto dentro de su caja. */
  vertical?: "top" | "center" | "bottom";
  interlineado?: number;
  /** em */
  espaciado?: number;
  mayus?: boolean;
  italica?: boolean;
  /** Fondo detrás del texto (cartel / pastilla). */
  fondo?: string | null;
  /** Relleno del cartel, en % del ancho. */
  relleno?: number;
  radio?: number;
  sombra?: boolean;
  /** Contorno de letra (texto "sticker"). */
  contorno?: string | null;
  tachado?: boolean;
}

export interface CapaImagen extends CapaBase {
  tipo: "imagen";
  src: string;
  ajuste?: "cover" | "contain";
  /** Dónde se centra el recorte (object-position), en %. */
  focoX?: number; focoY?: number;
  /** px sobre el lienzo real. 9999 = círculo. */
  radio?: number;
  sombra?: boolean;
  brillo?: number; contraste?: number; saturacion?: number; desenfoque?: number;
  /** Espejo horizontal. */
  espejo?: boolean;
  borde?: string | null;
}

export interface CapaForma extends CapaBase {
  tipo: "forma";
  forma: "rect" | "circulo" | "pastilla" | "estallido";
  relleno: string;
  borde?: string | null;
  grosor?: number;
  radio?: number;
  sombra?: boolean;
}

export interface CapaDegradado extends CapaBase {
  tipo: "degradado";
  desde: string;
  hasta: string;
  angulo?: number;
}

export type Capa = CapaTexto | CapaImagen | CapaForma | CapaDegradado;

export interface Escena {
  version: 1;
  formato: Formato;
  fondo: string;
  capas: Capa[];
}

// ── Utilidades ──────────────────────────────────────────────────────────────

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Solo colores y degradados razonables: nada de `url(...)` ni `;` que escape del estilo. */
export function colorSeguro(v: unknown, respaldo = "transparent"): string {
  const s = String(v ?? "").trim();
  if (!s) return respaldo;
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (/^(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)$/i.test(s)) return s;
  if (/^(transparent|white|black|currentColor)$/i.test(s)) return s;
  return respaldo;
}

/** Las fuentes de imagen que se aceptan: http(s), rutas propias y data:image. */
export function srcSeguro(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^https?:\/\//i.test(s) || /^\/(uploads|api)\//.test(s) || /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(s)) return s;
  return "";
}

const n = (v: unknown, def: number, min = -Infinity, max = Infinity): number => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : def;
};

let contador = 0;
export function idNuevo(prefijo = "c"): string {
  contador = (contador + 1) % 1e6;
  return `${prefijo}${Date.now().toString(36)}${contador.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * Valida una escena que viene de afuera (la pantalla, Atlas, la base). Lo
 * que no se entiende se descarta; nunca se lanza: una capa rota no puede
 * tirar el creativo entero.
 */
export function normalizarEscena(entrada: unknown): Escena {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as any;
  const formato: Formato = (Object.keys(FORMATOS) as Formato[]).includes(e.formato) ? e.formato : "4:5";
  const capas: Capa[] = [];
  for (const c of Array.isArray(e.capas) ? e.capas.slice(0, 60) : []) {
    if (!c || typeof c !== "object") continue;
    const base = {
      id: typeof c.id === "string" && c.id ? c.id.slice(0, 40) : idNuevo(),
      nombre: c.nombre ? String(c.nombre).slice(0, 60) : undefined,
      x: n(c.x, 0, -200, 300), y: n(c.y, 0, -200, 300), w: n(c.w, 50, 0.5, 400), h: n(c.h, 20, 0.5, 400),
      rot: n(c.rot, 0, -360, 360), opacidad: n(c.opacidad, 1, 0, 1), oculta: !!c.oculta, bloqueada: !!c.bloqueada,
    };
    if (c.tipo === "texto") {
      capas.push({
        ...base, tipo: "texto", texto: String(c.texto ?? "").slice(0, 600), fuente: c.fuente ? String(c.fuente) : "inter",
        tam: n(c.tam, 6, 0.8, 40), peso: n(c.peso, 800, 100, 900), color: colorSeguro(c.color, "#ffffff"),
        alinear: ["left", "center", "right"].includes(c.alinear) ? c.alinear : "left",
        vertical: ["top", "center", "bottom"].includes(c.vertical) ? c.vertical : "top",
        interlineado: n(c.interlineado, 1.1, 0.7, 2.5), espaciado: n(c.espaciado, 0, -0.2, 1),
        mayus: !!c.mayus, italica: !!c.italica, fondo: c.fondo ? colorSeguro(c.fondo, "") || null : null,
        relleno: n(c.relleno, 2, 0, 15), radio: n(c.radio, 12, 0, 9999), sombra: !!c.sombra,
        contorno: c.contorno ? colorSeguro(c.contorno, "") || null : null, tachado: !!c.tachado,
      });
    } else if (c.tipo === "imagen") {
      const src = srcSeguro(c.src);
      if (!src) continue;
      capas.push({
        ...base, tipo: "imagen", src, ajuste: c.ajuste === "contain" ? "contain" : "cover",
        focoX: n(c.focoX, 50, 0, 100), focoY: n(c.focoY, 50, 0, 100), radio: n(c.radio, 0, 0, 9999), sombra: !!c.sombra,
        brillo: n(c.brillo, 1, 0, 3), contraste: n(c.contraste, 1, 0, 3), saturacion: n(c.saturacion, 1, 0, 3), desenfoque: n(c.desenfoque, 0, 0, 40),
        espejo: !!c.espejo, borde: c.borde ? colorSeguro(c.borde, "") || null : null,
      });
    } else if (c.tipo === "forma") {
      capas.push({
        ...base, tipo: "forma", forma: ["rect", "circulo", "pastilla", "estallido"].includes(c.forma) ? c.forma : "rect",
        relleno: colorSeguro(c.relleno, "#111827"), borde: c.borde ? colorSeguro(c.borde, "") || null : null,
        grosor: n(c.grosor, 0, 0, 40), radio: n(c.radio, 0, 0, 9999), sombra: !!c.sombra,
      });
    } else if (c.tipo === "degradado") {
      capas.push({ ...base, tipo: "degradado", desde: colorSeguro(c.desde, "rgba(0,0,0,0)"), hasta: colorSeguro(c.hasta, "rgba(0,0,0,.7)"), angulo: n(c.angulo, 180, -360, 360) });
    }
  }
  return { version: 1, formato, fondo: colorSeguro(e.fondo, "#ffffff"), capas };
}

// ── Dibujar ─────────────────────────────────────────────────────────────────

/** Puntas de la estrella "estallido" (sello de oferta). */
function poligonoEstallido(puntas = 14): string {
  const pts: string[] = [];
  for (let i = 0; i < puntas * 2; i++) {
    const r = i % 2 === 0 ? 50 : 41;
    const a = (Math.PI * i) / puntas - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)}% ${(50 + r * Math.sin(a)).toFixed(2)}%`);
  }
  return `polygon(${pts.join(",")})`;
}

function estiloCaja(c: Capa): string {
  const partes = [
    "position:absolute", `left:${c.x}%`, `top:${c.y}%`, `width:${c.w}%`, `height:${c.h}%`,
    "box-sizing:border-box", "max-width:none", // el panel tiene `* { max-width: 100% }` global: achicaba el lienzo
  ];
  if (c.rot) partes.push(`transform:rotate(${c.rot}deg)`);
  if (c.opacidad !== undefined && c.opacidad < 1) partes.push(`opacity:${c.opacidad}`);
  return partes.join(";");
}

function capaAHtml(c: Capa, ancho: number): string {
  if (c.oculta) return "";
  const caja = estiloCaja(c);
  const dato = `data-capa="${esc(c.id)}"`;
  if (c.tipo === "degradado") {
    return `<div ${dato} style="${caja};background:linear-gradient(${c.angulo ?? 180}deg,${colorSeguro(c.desde)},${colorSeguro(c.hasta)})"></div>`;
  }
  if (c.tipo === "forma") {
    const radio = c.forma === "circulo" ? "50%" : c.forma === "pastilla" ? "9999px" : `${(c.radio ?? 0)}px`;
    const extra = c.forma === "estallido" ? `;clip-path:${poligonoEstallido()}` : `;border-radius:${radio}`;
    const borde = c.borde && c.grosor ? `;border:${c.grosor}px solid ${colorSeguro(c.borde)}` : "";
    const sombra = c.sombra ? ";box-shadow:0 18px 40px rgba(0,0,0,.28)" : "";
    return `<div ${dato} style="${caja};background:${colorSeguro(c.relleno)}${extra}${borde}${sombra}"></div>`;
  }
  if (c.tipo === "imagen") {
    const src = srcSeguro(c.src);
    if (!src) return "";
    const filtros: string[] = [];
    if (c.brillo !== undefined && c.brillo !== 1) filtros.push(`brightness(${c.brillo})`);
    if (c.contraste !== undefined && c.contraste !== 1) filtros.push(`contrast(${c.contraste})`);
    if (c.saturacion !== undefined && c.saturacion !== 1) filtros.push(`saturate(${c.saturacion})`);
    if (c.desenfoque) filtros.push(`blur(${c.desenfoque}px)`);
    const radio = c.radio ? (c.radio >= 9999 ? "50%" : `${c.radio}px`) : "0";
    const img = [
      "width:100%", "height:100%", "display:block", `object-fit:${c.ajuste === "contain" ? "contain" : "cover"}`,
      `object-position:${c.focoX ?? 50}% ${c.focoY ?? 50}%`, `border-radius:${radio}`,
      filtros.length ? `filter:${filtros.join(" ")}` : "", c.espejo ? "transform:scaleX(-1)" : "",
      c.borde ? `border:6px solid ${colorSeguro(c.borde)}` : "", "box-sizing:border-box", "max-width:none",
    ].filter(Boolean).join(";");
    const sombra = c.sombra ? `;filter:drop-shadow(0 22px 34px rgba(0,0,0,.32))` : "";
    return `<div ${dato} style="${caja}${sombra}"><img src="${esc(src)}" alt="" style="${img}"></div>`;
  }
  // texto
  const px = (c.tam / 100) * ancho;
  const rellenoPx = c.fondo ? ((c.relleno ?? 2) / 100) * ancho : 0;
  const justificar = c.vertical === "center" ? "center" : c.vertical === "bottom" ? "flex-end" : "flex-start";
  const alinearCaja = c.alinear === "center" ? "center" : c.alinear === "right" ? "flex-end" : "flex-start";
  const letra = [
    `font-family:${pilaDe(c.fuente)}`, `font-size:${px.toFixed(1)}px`, `font-weight:${c.peso ?? 800}`,
    `color:${colorSeguro(c.color, "#fff")}`, `line-height:${c.interlineado ?? 1.1}`, `letter-spacing:${c.espaciado ?? 0}em`,
    `text-align:${c.alinear ?? "left"}`, c.mayus ? "text-transform:uppercase" : "", c.italica ? "font-style:italic" : "",
    c.sombra ? "text-shadow:0 4px 18px rgba(0,0,0,.45)" : "",
    c.contorno ? `-webkit-text-stroke:${Math.max(2, px * 0.06).toFixed(1)}px ${colorSeguro(c.contorno)};paint-order:stroke fill` : "",
    c.tachado ? "text-decoration:line-through;text-decoration-thickness:.09em" : "",
    "white-space:pre-wrap", "overflow-wrap:break-word", "margin:0", "width:100%",
  ].filter(Boolean).join(";");
  // Con fondo, el fondo va en un <span> en línea: cada renglón lleva su
  // propio "marcador" (estilo Reels) en vez de un rectángulo que abarca todo.
  const contenido = c.fondo
    ? `<span style="background:${colorSeguro(c.fondo)};padding:${(rellenoPx * 0.45).toFixed(1)}px ${rellenoPx.toFixed(1)}px;border-radius:${c.radio ?? 12}px;box-decoration-break:clone;-webkit-box-decoration-break:clone">${esc(c.texto)}</span>`
    : esc(c.texto);
  return `<div ${dato} style="${caja};display:flex;flex-direction:column;justify-content:${justificar};align-items:${alinearCaja}"><p style="${letra}">${contenido}</p></div>`;
}

/** El lienzo (sin <html>): un div del tamaño real del formato. */
export function capasAHtml(escenaCruda: Escena | unknown): string {
  const e = normalizarEscena(escenaCruda);
  const { ancho, alto } = FORMATOS[e.formato];
  return `<div class="vp-lienzo" style="position:relative;width:${ancho}px;height:${alto}px;max-width:none;overflow:hidden;background:${colorSeguro(e.fondo, "#fff")}">${e.capas.map((c) => capaAHtml(c, ancho)).join("")}</div>`;
}

/** Las fuentes que usa la escena (para precargar). */
export function fuentesDeEscena(escenaCruda: Escena | unknown): string[] {
  const e = normalizarEscena(escenaCruda);
  return [...new Set(e.capas.filter((c): c is CapaTexto => c.tipo === "texto" && !c.oculta).map((c) => c.fuente || "inter"))];
}

/** Documento completo para que Chromium lo fotografíe a tamaño real. */
export function escenaADocumento(escenaCruda: Escena | unknown): string {
  const e = normalizarEscena(escenaCruda);
  const href = enlaceDeFuentes(fuentesDeEscena(e));
  return `<!doctype html><html><head><meta charset="utf-8">${href ? `<link rel="stylesheet" href="${href}">` : ""}<style>html,body{margin:0;padding:0;background:transparent}*{-webkit-font-smoothing:antialiased}</style></head><body>${capasAHtml(e)}</body></html>`;
}

// ── Revisión antes de exportar ──────────────────────────────────────────────

export interface Aviso { nivel: "error" | "aviso" | "idea"; texto: string; capa?: string }

/**
 * Lo que conviene revisar antes de subir el creativo. Son AVISOS, no
 * bloqueos: el dueño decide.
 */
export function revisarEscena(escenaCruda: Escena | unknown): Aviso[] {
  const e = normalizarEscena(escenaCruda);
  const avisos: Aviso[] = [];
  const visibles = e.capas.filter((c) => !c.oculta);
  const textos = visibles.filter((c): c is CapaTexto => c.tipo === "texto");
  if (!visibles.some((c) => c.tipo === "imagen")) avisos.push({ nivel: "aviso", texto: "No tiene foto del producto: los anuncios con el producto visible suelen frenar más el scroll." });
  const palabras = textos.reduce((s, t) => s + t.texto.split(/\s+/).filter(Boolean).length, 0);
  if (palabras > 30) avisos.push({ nivel: "aviso", texto: `Tiene ${palabras} palabras sobre la imagen. Meta ya no castiga el texto, pero en el feed se lee en 1-2 segundos: menos texto, más impacto.` });
  for (const t of textos) {
    if (!t.texto.trim()) avisos.push({ nivel: "error", texto: "Hay un texto vacío.", capa: t.id });
    if (t.tam < 2.6) avisos.push({ nivel: "aviso", texto: `"${t.texto.slice(0, 24)}" es muy chico para leerse en un celular.`, capa: t.id });
    if (t.x < 0 || t.y < 0 || t.x + t.w > 100 || t.y + t.h > 100) avisos.push({ nivel: "aviso", texto: `"${t.texto.slice(0, 24)}" se sale del lienzo.`, capa: t.id });
  }
  // Contraste (WCAG) del texto contra la forma de color que tiene debajo.
  // Sobre fotos no se puede medir sin mirar la imagen: eso lo hace el juez visual.
  const lum = (h: string) => {
    const n = parseInt(h.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  const hex6 = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
  for (const t of textos) {
    if (t.fondo) { const f = hex6(t.fondo), c = hex6(t.color); if (f && c && ratio(f, c) < 3) avisos.push({ nivel: "aviso", texto: `"${t.texto.slice(0, 24)}" casi no se lee sobre su resaltado.`, capa: t.id }); continue; }
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    const idx = visibles.indexOf(t);
    let fondo: string | null = null, sobreFoto = false;
    for (let i = idx - 1; i >= 0; i--) {
      const f = visibles[i]!;
      if (cx < f.x || cx > f.x + f.w || cy < f.y || cy > f.y + f.h) continue;
      if (f.tipo === "forma") { fondo = hex6(f.relleno); break; }
      if (f.tipo === "imagen" || f.tipo === "degradado") { sobreFoto = true; break; }
    }
    if (!fondo && !sobreFoto) fondo = hex6(e.fondo);
    const color = hex6(t.color);
    const minimo = t.tam >= 5 ? 3 : 4.5;
    if (fondo && color && ratio(fondo, color) < minimo) avisos.push({ nivel: "aviso", texto: `"${t.texto.slice(0, 24)}" tiene poco contraste con su fondo (${ratio(fondo, color).toFixed(1)}:1).`, capa: t.id });
    if (sobreFoto && !t.sombra && !t.contorno) avisos.push({ nivel: "idea", texto: `"${t.texto.slice(0, 24)}" va sobre la foto sin sombra: puede perderse según la imagen.`, capa: t.id });
  }

  const zona = ZONAS_SEGURAS[e.formato];
  if (zona) {
    for (const t of textos) {
      if (t.y < zona.arriba || t.y + t.h > 100 - zona.abajo) {
        avisos.push({ nivel: "aviso", texto: `"${t.texto.slice(0, 24)}" cae donde Meta pone su interfaz (zona segura ${e.formato}).`, capa: t.id });
      }
    }
  }
  return avisos;
}
