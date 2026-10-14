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
  return reglas.join("");
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
