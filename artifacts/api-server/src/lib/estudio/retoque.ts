/**
 * El "tema" de una landing: color de acento, tipografías y redondeo.
 *
 * Hubo un panel de "Diseño (tú decides)" que se quitó el 23-09-2026 porque
 * pintaba solo la VISTA PREVIA con un <style> inyectado en el navegador y la
 * landing publicada nunca lo leía. Este vuelve, pero del lado correcto: se
 * guarda en `design.retoque` y lo hornea el SERVIDOR en las dos rutas que
 * sirven HTML (la vista previa del editor y la URL pública /l/<slug>), así
 * que lo que el dueño ve es lo que ve el cliente.
 *
 * Funciona sobre los dos motores que arman la página desde secciones porque
 * ambos ya leen variables CSS: renderer-v3 usa `--accent` / `--on-accent` /
 * `--radius`, y renderer-estilo usa `--a` / `--a-d`. No se toca ninguno de
 * los dos: el retoque solo redefine esas variables y las familias.
 *
 * Las copias HTML de otro sitio (`source.tipo === "html"`) NO se retocan:
 * sus variables son las del sitio original y pisarlas a ciegas rompe más de
 * lo que arregla.
 *
 * Módulo PURO: lo usa también la pantalla para validar antes de guardar.
 */
import { enlaceDeFuentes, esFuenteValida, pilaDe } from "./fuentes";

export interface Retoque {
  estilo?: "academia" | "nocturno" | "boutique" | null;
  /** Color de botones, precios y detalles. #RRGGBB. */
  acento?: string | null;
  /** Fuente de titulares (id de FUENTES). */
  titulos?: string | null;
  /** Fuente del texto corrido (id de FUENTES). */
  texto?: string | null;
  /** Redondeo de botones y tarjetas, en px (0 = recto). */
  radio?: number | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Acepta #abc, #aabbcc y sin numeral; devuelve #aabbcc o null. */
export function normalizarHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let s = v.trim().toLowerCase();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX.test(s) ? s : null;
}

/**
 * Deja solo lo que se puede aplicar. Lo que no es válido se descarta en vez
 * de guardarse: un color "rojito" escrito por el modelo no puede terminar
 * como `--accent:rojito` y dejar los botones sin fondo.
 */
export function normalizarRetoque(entrada: unknown): Retoque | null {
  if (!entrada || typeof entrada !== "object") return null;
  const e = entrada as Record<string, unknown>;
  const out: Retoque = {};
  if (["academia", "nocturno", "boutique"].includes(String(e.estilo))) out.estilo = e.estilo as Retoque["estilo"];
  const acento = normalizarHex(e.acento);
  if (acento) out.acento = acento;
  if (esFuenteValida(e.titulos)) out.titulos = e.titulos;
  if (esFuenteValida(e.texto)) out.texto = e.texto;
  const radio = Number(e.radio);
  if (e.radio !== null && e.radio !== undefined && e.radio !== "" && Number.isFinite(radio)) out.radio = Math.max(0, Math.min(40, Math.round(radio)));
  return Object.keys(out).length ? out : null;
}

function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** Blanco o casi negro, el que se lea sobre el color. */
export function tintaSobre(hex: string): string {
  return luminancia(hex) > 0.42 ? "#111827" : "#ffffff";
}

/** El CSS que aplica el retoque. Vacío si no hay nada que aplicar. */
export function cssDeRetoque(r: Retoque | null | undefined): string {
  const t = normalizarRetoque(r);
  if (!t) return "";
  const reglas: string[] = [];
  const vars: string[] = [];
  if (t.acento) {
    const sobre = tintaSobre(t.acento);
    vars.push(`--accent:${t.acento}`, `--primary:${t.acento}`, `--on-accent:${sobre}`, `--a:${t.acento}`, `--a-d:${t.acento}dd`);
  }
  if (t.radio !== undefined && t.radio !== null) {
    vars.push(`--radius:${t.radio}px`);
    reglas.push(`.btn,.cta,button,.offer-main,.offer-side,.checkout,.bento-card,.strip article,.faq details,.card{border-radius:${t.radio}px!important}`);
  }
  if (vars.length) reglas.unshift(`:root{${vars.join(";")}}`);
  if (t.texto) reglas.push(`body,input,select,textarea,button{font-family:${pilaDe(t.texto)}!important}`);
  if (t.titulos) reglas.push(`h1,h2,h3,.brand,.hero-price,.offer-price{font-family:${pilaDe(t.titulos)}!important}`);
  return cssEstilo(t.estilo) + reglas.join("");
}

/**
 * Inserta el retoque al FINAL del <head> (después del CSS del renderer, para
 * que gane por orden y no por especificidad). Si no hay <head>, va al
 * principio del documento.
 */
export function aplicarRetoque(html: string, r: Retoque | null | undefined): string {
  if (!html) return html;
  // Re-aplicar no duplica: se quita el bloque anterior si ya estaba (y sin
  // retoque nuevo, queda quitado: "Quitar tema" tiene que quitarlo).
  const limpio = html.includes("vp-retoque")
    ? html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">(?=<style id="vp-retoque">)/, "").replace(/<style id="vp-retoque">[\s\S]*?<\/style>/, "")
    : html;
  const css = cssDeRetoque(r);
  if (!css) return limpio;
  const t = normalizarRetoque(r)!;
  const href = t.titulos || t.texto ? enlaceDeFuentes([t.titulos, t.texto]) : "";
  const bloque = `${href ? `<link rel="stylesheet" href="${href}">` : ""}<style id="vp-retoque">${css}</style>`;
  return /<\/head>/i.test(limpio) ? limpio.replace(/<\/head>/i, `${bloque}</head>`) : `${bloque}${limpio}`;
}

/** ¿A esta landing se le puede aplicar retoque? (las copias HTML, no). */
export function admiteRetoque(row: { source?: unknown; design?: unknown; html?: unknown }): boolean {
  const s = row.source as any;
  if (s && (s.tipo === "html" || s.type === "landingforge" || s.landingforgeUrl)) return false;
  const d = row.design as any;
  // renderer-estilo y renderer-v3 (familia o automático). Una landing con
  // `html` propio escrito por el modelo no tiene variables conocidas.
  if (d?.renderer === "estilo") return true;
  return !row.html;
}

/** Complete art directions; the owner can still edit each color/font afterward. */
export const TEMAS_ESTUDIO: { id: NonNullable<Retoque['estilo']>; nombre: string; descripcion: string; fondo: string; retoque: Retoque }[] = [
  { id: 'academia', nombre: 'Academia editorial', descripcion: 'Cursos y colecciones · papel, azul y tipografía editorial', fondo: '#f5f2eb', retoque: { estilo: 'academia', acento: '#244bd8', titulos: 'playfair', texto: 'inter', radio: 18 } },
  { id: 'nocturno', nombre: 'Digital nocturno', descripcion: 'Tecnología y herramientas · tinta oscura y azul eléctrico', fondo: '#0b1220', retoque: { estilo: 'nocturno', acento: '#60a5fa', titulos: 'inter', texto: 'inter', radio: 24 } },
  { id: 'boutique', nombre: 'Boutique esencial', descripcion: 'Productos y servicios · marfil, verde y espacios amplios', fondo: '#fafaf7', retoque: { estilo: 'boutique', acento: '#16634e', titulos: 'dm-serif', texto: 'inter', radio: 12 } },
];

function cssEstilo(estilo: Retoque['estilo']): string {
  if (!estilo) return '';
  const palettes = {
    academia: { bg: '#f5f2eb', surface: '#fffdf8', ink: '#17243d', muted: '#536079', line: '#deddd8' },
    nocturno: { bg: '#0b1220', surface: '#152137', ink: '#f1f5f9', muted: '#a6b6cc', line: '#30415b' },
    boutique: { bg: '#fafaf7', surface: '#ffffff', ink: '#19342c', muted: '#52675e', line: '#dce4dd' },
  };
  const p = palettes[estilo];
  return `:root{--bg:${p.bg};--surface:${p.surface};--card:${p.surface};--text:${p.ink};--ink:${p.ink};--muted:${p.muted};--mut:${p.muted};--line:${p.line}}
body{background:var(--bg);color:${p.ink}}h1,h2,h3{text-wrap:balance}p{overflow-wrap:anywhere}
.hero,.hero--stack,.hero--edito{background:var(--bg);color:${p.ink}}
.hero h1{letter-spacing:-.045em;line-height:1.04;color:${p.ink};background:none;-webkit-text-fill-color:currentColor}
.hero .lead,.hero .sub{max-width:48ch;line-height:1.7;color:${p.muted}}
.hero-media img{object-fit:contain;background:${p.surface};padding:clamp(12px,3vw,30px);box-shadow:0 24px 70px -35px #101b3650;animation:none}
.bento-card,.offer-main,.offer-side,.checkout,.faq details{background:${p.surface};color:${p.ink};border:1px solid ${p.line};box-shadow:none}
.btn,.cta{min-height:48px;letter-spacing:0;font-weight:700}
.sec{padding-block:clamp(48px,7vw,96px)}.head{max-width:760px}
@media(max-width:820px){.hero-media{order:0}.hero{padding-top:28px;gap:24px}.hero h1{font-size:clamp(2rem,9vw,3rem)}.hero-media img{max-height:380px}.sticky{bottom:calc(12px + env(safe-area-inset-bottom))}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}`;
}
