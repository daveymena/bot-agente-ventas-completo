/**
 * LANDING RENDERER V3 — composición comercial profesional.
 *
 * Un único renderer para preview, editor y publicación.
 * El diseño cambia composición y jerarquía, no solo colores.
 */
import { tokensDe, type FamiliaVisual } from "./design-system";
import { elegirComposicion, tipoDeNegocio, varianteDeSeccion, type BloqueId, type Composicion } from "./composicion";
import { renderizarLandingImagenes } from "./renderer-imagenes";

import { DEPARTAMENTOS_CO, SCRIPT_GEO } from "../geo-colombia";

export interface SeccionParaRenderizar {
  id: string;
  type: string;
  layout?: string | null;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  cta?: string | null;
  image?: string | null;
  images?: string[] | null;
  /** Oculta por el editor de bloques; se conserva para poder mostrarla de nuevo. */
  hidden?: boolean | null;
}

export interface OpcionRender {
  nombre: string;
  valores: string[];
  obligatoria?: boolean;
}

export interface ProductoParaRenderizar {
  name?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  /** Galería completa (principal primero). Ver lib/fotos-de-producto. */
  images?: string[] | null;
  price?: number | string | null;
  currency?: string | null;
  paymentLink?: string | null;
  whatsapp?: string | null;
  opciones?: OpcionRender[] | null;
  /**
   * Precio ANTERIOR real (metadata.precioAntes).
   * Es la ÚNICA condición para el precio tachado y el "Ahorras": sin un precio
   * anterior que exista de verdad no se inventa ninguno (era precio × 1,45
   * fabricado -- la regla que ya corrigieron para el anuncio).
   */
  precioAntes?: number | string | null;
}

export interface NegocioParaRenderizar {
  nombre?: string | null;
  whatsapp?: string | null;
  modelo?: string | null;
  confianza?: string[] | null;
}

export interface CierreDeLanding {
  tipo: "contraentrega" | "pago" | "whatsapp";
  accion?: string;
  pais?: string;
  pago?: string;
  mercadopago?: string;
  paypal?: string;
}

export interface OpcionesDeRender {
  nombre: string;
  secciones: SeccionParaRenderizar[];
  /** "imagenes" = landing de paneles verticales (ver renderer-imagenes.ts). */
  modo?: string | null;
  /** Ofertas del dueño (solo modo imágenes): el pedido cobra estas. */
  ofertas?: Array<{ nombre: string; cantidad: number; precio: number }> | null;
  /** Sellos de las condiciones reales del negocio (solo modo imágenes). */
  sellos?: string[] | null;
  familia: FamiliaVisual | string | null;
  producto?: ProductoParaRenderizar | null;
  negocio?: NegocioParaRenderizar | null;
  cierre?: CierreDeLanding | null;
  /** Modelo de página (composicion.ts). Sin modelo ni semilla sale "clasica". */
  modelo?: string | null;
  /** Semilla de la composición: misma semilla, misma página; otra semilla, otra página. */
  semilla?: string | null;
}

export function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function urlSegura(valor: unknown): string {
  const v = String(valor ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v) || v.startsWith("/") || v.startsWith("#")) return v;
  return "";
}

const MAX_ITEM = 160;
const MAX_ITEMS = 6;

/**
 * Los ítems de una sección. El modelo debería mandar una línea por ítem, pero
 * a veces manda un párrafo corrido de 600 letras: eso salía como UNA tarjeta
 * gigante. Si no hay saltos de línea y el texto es largo, se parte por
 * oraciones. Cada ítem se acota: en una tarjeta caben ~2 líneas, no un
 * ensayo. Y se limita la cantidad: seis beneficios se leen, diez no.
 */
function items(body: unknown): string[] {
  const texto = String(body ?? "").trim();
  let partes = texto.split(/\n+|\s+·\s+/).map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  if (partes.length <= 1 && texto.length > 200) {
    partes = texto.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).map((x) => x.trim()).filter(Boolean);
  }
  return partes.map((x) => acotar(x)).slice(0, MAX_ITEMS);
}

/** Corta al final de la última frase que entra; si no hay, en palabra + "…". */
function cortarFrase(texto: string, max: number): string {
  const s = String(texto || "").trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const trozo = s.slice(0, max);
  const fin = Math.max(trozo.lastIndexOf(". "), trozo.lastIndexOf("? "), trozo.lastIndexOf("! "), trozo.lastIndexOf("… "));
  if (fin > max * 0.35) return trozo.slice(0, fin + 1).trim();
  return acotar(s, max);
}

/** Corta en la última palabra que entra y avisa con "…". */
function acotar(texto: string, max = MAX_ITEM): string {
  const t = String(texto || "").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max).replace(/\s+\S*$/, "");
  return `${corte}…`;
}

/**
 * Un cuerpo con varias líneas es una lista, no un párrafo: antes se metía todo
 * en un <p> y las líneas quedaban pegadas ("Precio: 45.999 COP Pago contra
 * entrega: no pagas nada..."). Se saltan las líneas de precio cuando el
 * precio real ya se muestra aparte, para no repetirlo tres veces.
 */
function cuerpo(body: unknown, opts: { sinPrecio?: boolean; max?: number } = {}): string {
  let lineas = items(body);
  if (opts.sinPrecio) lineas = lineas.filter((l) => !/^precio\b|^\$?\s*[\d.,]+\s*(cop|usd|mxn|pen|clp|ars)?\s*$/i.test(l));
  if (!lineas.length) return "";
  if (lineas.length === 1) return `<p>${esc(acotar(lineas[0], opts.max ?? 420))}</p>`;
  return `<ul class="lines">${lineas.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

/** Un subtítulo que es solo un precio ("45999 COP") no dice nada: el precio va aparte y formateado. */
function esSoloPrecio(texto: unknown): boolean {
  return /^\$?\s*[\d.,]+\s*(cop|usd|mxn|pen|clp|ars|€)?\s*$/i.test(String(texto || "").trim());
}

function precio(producto?: ProductoParaRenderizar | null): string {
  const n = Number(producto?.price ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toLocaleString("es-CO")} ${String(producto?.currency || "COP").trim()}`.trim();
}

function whatsapp(producto: ProductoParaRenderizar | null | undefined, negocio: NegocioParaRenderizar | null | undefined): string {
  const numero = String(negocio?.whatsapp || producto?.whatsapp || "").replace(/\D/g, "");
  if (!numero) return "";
  return `https://wa.me/${numero}?text=${encodeURIComponent(`Hola, me interesa ${producto?.name || "este producto"}`)}`;
}

function safeImage(src: unknown): string {
  return urlSegura(src);
}

function figure(src: unknown, alt: string, cls = "media-frame", loading = "lazy"): string {
  const safe = safeImage(src);
  return safe
    ? `<figure class="${cls}"><img src="${esc(safe)}" alt="${esc(alt)}" loading="${loading}" decoding="async"></figure>`
    : "";
}

function btn(texto: unknown, href: unknown, variant = "primary"): string {
  const text = String(texto ?? "").trim();
  const url = urlSegura(href);
  return text && url ? `<a class="btn btn--${variant}" href="${esc(url)}">${esc(text)}</a>` : "";
}

export function cssBase(familia: string): string {
  const t = tokensDe(familia);
  const color = t.color;
  const tipo = t.tipografia;
  const ritmo = t.ritmo;
  const forma = t.forma;
  const sectionY = ritmo.padSeccionY;
  const sectionX = ritmo.padSeccionX;
  return `
:root{--bg:${color.fondo};--surface:${color.superficie};--text:${color.texto};--muted:${color.textoSuave};--accent:${color.acento};--on-accent:${color.sobreAcento};--line:${color.borde};--content:${ritmo.anchoContenido};--section:${sectionY};--pad:${sectionX};--gap:${ritmo.separacion};--radius:${forma.radio};--shadow:${forma.sombra}}
*{box-sizing:border-box}html{scroll-behavior:smooth}html,body{overflow-x:clip;max-width:100%}body{margin:0;background:var(--bg);color:var(--text);font-family:${tipo.texto};font-size:clamp(16px,1.05vw,18px);line-height:${tipo.interlineado};-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.shell{width:min(100%,calc(var(--content) + 2 * var(--pad)));margin:0 auto;padding-inline:var(--pad)}.narrow{max-width:860px}.top{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid color-mix(in srgb,var(--line) 65%,transparent)}.top__in{width:min(100%,calc(var(--content) + 2 * var(--pad)));margin:auto;padding:12px var(--pad);display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{font-weight:800;letter-spacing:-.02em}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:13px 21px;border-radius:${forma.radio};font-weight:800;transition:transform .2s ease,box-shadow .2s ease,background .2s ease}.btn:hover{transform:translateY(-2px)}.btn--primary{background:var(--accent);color:var(--on-accent);box-shadow:0 12px 28px color-mix(in srgb,var(--accent) 24%,transparent)}.btn--soft{background:var(--surface);border:${forma.borde}}.hero{padding:${sectionY} 0 44px;display:grid;grid-template-columns:minmax(0,1.04fr) minmax(320px,.96fr);gap:clamp(28px,5vw,72px);align-items:center;min-height:72vh}.hero--center{display:block;max-width:1040px;margin:auto;text-align:center}.hero--center .hero-copy .actions{justify-content:center}.hero--center .hero-media{margin-top:40px}.hero--center .hero-media:before{inset:10% 4% -4% 4%}.hero-copy{text-align:${t.alineacion === "centrado" ? "center" : "left"}}.hero--center .hero-copy{text-align:center}.eyebrow{margin:0 0 12px;color:var(--accent);font-size:.7rem;font-weight:900;text-transform:uppercase;letter-spacing:.15em}.hero h1{font-family:${tipo.display};font-size:clamp(2.4rem,5.6vw,4.8rem);font-weight:${tipo.pesoDisplay};line-height:1.01;letter-spacing:${tipo.espaciadoTitulo};margin:0 0 20px}.lead{font-size:clamp(1.05rem,1.55vw,1.28rem);color:var(--muted);max-width:62ch}.hero-copy .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.hero-price,.offer-price{font-weight:900;letter-spacing:-.04em}.hero-price{font-size:clamp(1.35rem,2.2vw,1.8rem);margin-top:18px}.hero-media{position:relative}.hero-media:before{content:"";position:absolute;inset:8% -7% -7% 9%;border-radius:36px;background:color-mix(in srgb,var(--accent) 11%,transparent);z-index:-1}.hero-media figure{margin:0}.hero-media img{display:block;width:100%;max-height:690px;object-fit:cover;border-radius:${forma.radio};box-shadow:${forma.sombra}}.trust{display:flex;flex-wrap:wrap;gap:10px;padding:18px 0;border-top:${forma.borde};border-bottom:${forma.borde}}.trust span svg{width:15px;height:15px;flex:none}.trust span{display:inline-flex;align-items:center;gap:7px}.buybox-meta li svg{width:15px;height:15px;flex:none;position:absolute;left:0;top:2px}.buybox-meta li{padding-left:24px}.trust span{padding:8px 12px;border-radius:999px;background:var(--surface);border:${forma.borde};font-size:.82rem;font-weight:750}.sec{padding:${sectionY} 0}.head{max-width:780px;margin-bottom:32px}${t.alineacion === "centrado" ? ".head{margin-inline:auto;text-align:center}.head .lead{margin-inline:auto}" : ""}.lines{list-style:none;margin:0;padding:0;display:grid;gap:10px}.lines li{position:relative;padding-left:26px}.lines li:before{content:"✓";position:absolute;left:0;top:0;color:var(--accent);font-weight:900}.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:14px}.strip article{padding:20px 22px;background:var(--surface);border:${forma.borde};border-radius:${forma.radio};font-weight:650;line-height:1.45}.strip article:before{content:"✓";display:block;color:var(--accent);font-weight:900;margin-bottom:8px}.cierre{text-align:center;max-width:760px;margin:auto;padding:clamp(28px,5vw,52px);background:linear-gradient(135deg,var(--surface),color-mix(in srgb,var(--accent) 10%,var(--surface)));border:${forma.borde};border-radius:calc(${forma.radio} + 8px);box-shadow:${forma.sombra}}.cierre .lead{margin-inline:auto}.cierre .btn{margin-top:22px}.offer--solo,.feature-row--solo{grid-template-columns:1fr}.offer--solo .offer-main{max-width:760px;margin:auto}.feature-row--solo .feature-copy{max-width:760px;margin:auto}.head h2{font-family:${tipo.display};font-size:clamp(2rem,4vw,3.65rem);line-height:1.04;letter-spacing:${tipo.espaciadoTitulo};margin:0 0 16px}.bento{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:16px}.bento-card{min-height:170px;padding:26px;background:var(--surface);border:${forma.borde};border-radius:${forma.radio};box-shadow:${forma.sombra}}.bento-card strong{display:block;margin:8px 0;font-size:1.08rem}.num{font-size:.72rem;color:var(--accent);font-weight:900;letter-spacing:.12em}.feature-row{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center}.feature-row:nth-child(even) .feature-media{order:2}.feature-media figure{margin:0}.feature-media img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:${forma.radio};display:block}.feature-copy ul{padding-left:20px}.gallery{display:grid;grid-template-columns:2fr 1fr 1fr;grid-auto-rows:230px;gap:12px}.gallery img{width:100%;height:100%;object-fit:cover;border-radius:${forma.radio};display:block}.gallery img:first-child{grid-row:span 2}.faq{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.faq details{background:var(--surface);border:${forma.borde};border-radius:${forma.radio};padding:20px}.faq summary{cursor:pointer;font-weight:800}.offer{display:grid;grid-template-columns:1.1fr .9fr;gap:22px}.offer-main,.offer-side,.checkout{background:var(--surface);border:${forma.borde};border-radius:calc(${forma.radio} + 8px);box-shadow:${forma.sombra}}.offer-main{padding:clamp(28px,5vw,48px);background:linear-gradient(135deg,var(--surface),color-mix(in srgb,var(--accent) 8%,var(--surface)))}.offer-side{padding:18px}.offer-side figure{margin:0;height:100%}.offer-side img{width:100%;height:100%;min-height:300px;object-fit:cover;border-radius:${forma.radio}}.offer-price{font-size:clamp(2.3rem,5vw,4.7rem);line-height:1;margin:14px 0 26px}.checkout{padding:clamp(26px,5vw,52px)}.checkout-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:flex;flex-direction:column;gap:7px}.field--full{grid-column:1/-1}.field label{font-size:.84rem;font-weight:800}.field input,.field select{width:100%;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--bg);color:var(--text);font:inherit}.summary{padding:16px;border-radius:16px;background:color-mix(in srgb,var(--accent) 8%,var(--surface));border:1px solid color-mix(in srgb,var(--accent) 25%,var(--line));margin:18px 0}.topbar{background:var(--text);color:var(--bg);font-size:.8rem;font-weight:700;overflow:hidden}.topbar-in{width:min(100%,calc(var(--content) + 2 * var(--pad)));margin:auto;padding:9px var(--pad);display:flex;justify-content:center;align-items:center;gap:8px 26px;flex-wrap:wrap;text-align:center;max-width:100%}.topbar-in span{display:inline-flex;align-items:center;gap:7px;min-width:0}.topbar-in svg{width:15px;height:15px;flex:none}
.hg-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:var(--radius);scrollbar-width:none}.hg-track::-webkit-scrollbar{display:none}.hg-slide{flex:0 0 100%;scroll-snap-align:center;scroll-snap-stop:always}.hg-slide img{display:block;width:100%;max-height:690px;object-fit:cover;border-radius:var(--radius);box-shadow:var(--shadow)}.hg{position:relative}.hg-dots{display:flex;gap:6px;position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.35);padding:6px 9px;border-radius:999px}.hg-dots i{width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.55)}.hg-dots i.on{width:18px;background:#fff}
.photoband{margin-inline:calc(50% - 50vw);width:100vw}.photoband figure{margin:0;position:relative}.photoband img{display:block;width:100%;max-height:72vh;object-fit:cover}.photoband figcaption{position:absolute;left:0;right:0;bottom:0;padding:40px 20px 18px;background:linear-gradient(transparent,rgba(0,0,0,.62));color:#fff;font-weight:700}
.footer{padding:54px 0 112px;border-top:1px solid var(--line);color:var(--muted)}.sticky{display:none}.coupon{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;align-items:center}.coupon input{flex:1;min-width:180px;padding:13px 14px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);color:var(--text);font:inherit}.coupon .tiny{flex-basis:100%;margin:0}
.hero--stack{display:block;text-align:center;max-width:1000px;margin:auto;min-height:auto}.hero--stack .hero-copy .actions{justify-content:center}.hero--stack .hero-media{max-width:900px;margin:36px auto 0}.hero--stack .lead{margin-inline:auto}
.hero--bleed{position:relative;isolation:isolate;overflow:clip;min-height:88vh;align-items:end;padding-bottom:56px}.hero--bleed .hero-bg{position:absolute;inset:0;z-index:-1}.hero--bleed .hero-bg img{width:100%;height:100%;object-fit:cover}.hero--bleed .hero-card{max-width:640px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(18px);border:1px solid var(--line);border-radius:24px;padding:clamp(24px,4vw,44px);box-shadow:0 30px 80px rgba(0,0,0,.25)}
.hero--buybox{grid-template-columns:1.05fr .95fr}.buybox{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:clamp(22px,3.4vw,36px);box-shadow:var(--shadow);align-self:start;position:sticky;top:76px}.buybox .eyebrow{margin-bottom:8px}.buybox h1{font-size:clamp(1.7rem,3vw,2.5rem);margin:0 0 10px}.buybox-price{font-size:clamp(2rem,4.4vw,3.2rem);font-weight:900;letter-spacing:-.03em;margin:12px 0 18px}.buybox .btn{width:100%}.buybox-meta{list-style:none;margin:18px 0 0;padding:16px 0 0;border-top:1px solid var(--line);display:grid;gap:8px;font-size:.9rem;color:var(--muted)}.buybox-meta li{padding-left:24px;position:relative}.buybox-meta li:before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:900}
.hero--offerfirst .hero-price{font-size:clamp(2rem,5vw,3.4rem);margin:6px 0 16px}.hero--offerfirst .actions{margin-top:18px}.hero--offerfirst h1{margin-top:20px}
.hero--edito{grid-template-columns:1fr 1fr;align-items:start}.hero--edito .hero-copy{border-top:3px solid var(--text);padding-top:20px}.hero--edito .hero-media img{aspect-ratio:3/4;max-height:680px}
.offer--split{grid-template-columns:1fr 1fr}.offer-sidecol{display:grid;gap:16px;align-content:start}.offer-sidecol .offer-price{margin:0}.offer--minimal{display:block;max-width:760px;margin:auto;text-align:center}.offer--minimal .offer-main{padding:clamp(28px,5vw,48px)}.offer--minimal .actions{justify-content:center;display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}
.bento--numbered{display:grid;gap:0;border-top:2px solid var(--text)}.bento--numbered article{display:grid;grid-template-columns:72px 1fr;gap:18px;align-items:baseline;padding:22px 4px;border-bottom:1px solid var(--line)}.bento--numbered .num{font-size:clamp(1.8rem,3.4vw,2.6rem);font-weight:900}.bento--numbered strong{font-size:1.1rem}
.bento--checklist{display:grid;gap:10px;max-width:720px}.bento--checklist article{display:flex;gap:14px;align-items:flex-start;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 20px}.bento--checklist .num{display:none}.bento--checklist strong{font-weight:650}.bento--checklist article:before{content:"✓";color:var(--accent);font-weight:900;font-size:1.2rem}
@media(max-width:820px){.hero{grid-template-columns:1fr;min-height:auto;padding-top:44px}.hero--bleed{min-height:auto}.hero--buybox{grid-template-columns:1fr}.buybox{position:static}.hero--edito{grid-template-columns:1fr}.offer--split{grid-template-columns:1fr}.bento--numbered article{grid-template-columns:52px 1fr}.hero-media{order:-1}.hero-media img{max-height:520px}.feature-row,.offer{grid-template-columns:1fr}.feature-row:nth-child(even) .feature-media{order:0}.faq,.checkout-grid{grid-template-columns:1fr}.field--full{grid-column:auto}.gallery{grid-template-columns:1fr 1fr;grid-auto-rows:190px}.gallery img:first-child{grid-column:span 2;grid-row:auto}.top .btn{display:none}.topbar{font-size:.72rem}.topbar-in{gap:6px 14px;padding:8px 12px}.sticky{display:flex;position:fixed;z-index:50;left:12px;right:12px;bottom:12px;padding:8px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(16px);border:1px solid var(--line);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.18)}.sticky .btn{width:100%}.footer{padding-bottom:124px}}
@media(max-width:520px){.gallery{grid-template-columns:1fr}.gallery img:first-child{grid-column:auto}.hero-copy .actions{display:grid}.hero-copy .actions .btn{width:100%}.hero h1{font-size:clamp(2.5rem,12vw,4.1rem)}.sec{padding:56px 0}}
@media(prefers-reduced-motion:no-preference){.hero-media img{animation:landingFloat 7s ease-in-out infinite}@keyframes landingFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.btn{transition:none}.hero-media img{animation:none}}
${cssFamilia(familia)}
`.trim();
}

/**
 * CSS propio de una familia, encima del base. Solo lo tienen las familias
 * cuya identidad no se explica con tokens (colores, aire, radios): acá van
 * halos, cristal, degradados y animaciones. Devuelve "" para el resto.
 */
function cssFamilia(familia: string): string {
  if (familia === "launch") return CSS_LAUNCH;
  if (familia === "premium") return CSS_PREMIUM;
  if (familia === "respuesta-directa") return CSS_RESPUESTA_DIRECTA;
  if (familia === "ecommerce") return CSS_ECOMMERCE;
  if (familia === "oscura") return CSS_OSCURA;
  if (familia === "electronica") return CSS_ELECTRONICA;
  if (familia === "minimal") return CSS_MINIMAL;
  if (familia === "editorial") return CSS_EDITORIAL;
  if (familia === "belleza") return CSS_BELLEZA;
  if (familia === "fitness") return CSS_FITNESS;
  if (familia === "educacion") return CSS_EDUCACION;
  if (familia === "tecnologia") return CSS_TECNOLOGIA;
  if (familia === "familiar") return CSS_FAMILIAR;
  if (familia === "creativa") return CSS_CREATIVA;
  if (familia === "suplemento") return CSS_SUPLEMENTO;
  if (familia === "gourmet") return CSS_GOURMET;
  if (familia === "dropshipping") return CSS_DROPSHIPPING;
  if (familia === "clinica") return CSS_CLINICA;
  return "";
}

/**
 * Familia "launch": port del lenguaje visual de Launch UI (MIT).
 *
 * Trabaja SOLO sobre las clases que ya emite el renderer, así el editor, el
 * preview y la publicación no cambian de HTML. Lo que aporta:
 *   · halo radial del color de marca detrás del hero (Glow)
 *   · h1/h2 con degradado de texto y rótulo tipo badge
 *   · foto del hero con marco tipo "mockup" y fundido inferior
 *   · tarjetas, FAQ, oferta y checkout en cristal (glass)
 *   · botón principal con degradado vertical y anillo de marca
 *   · entradas animadas (appear / appear-zoom) respetando reduced-motion
 */
const CSS_LAUNCH = `
/*f:launch*/
.top{background:color-mix(in srgb,var(--bg) 35%,transparent);backdrop-filter:blur(18px);border-bottom:1px solid color-mix(in srgb,#fff 6%,transparent)}
.btn{border-radius:10px;font-weight:600;min-height:44px}
.btn--primary{background:linear-gradient(180deg,var(--accent),color-mix(in srgb,var(--accent) 72%,#000));color:var(--on-accent);box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 25%,transparent),0 0 0 1px color-mix(in srgb,var(--accent) 55%,transparent),0 12px 28px color-mix(in srgb,var(--accent) 28%,transparent)}
.btn--primary:hover{filter:brightness(1.08)}
.btn--soft,.trust span,.bento-card,.faq details,.offer-main,.offer-side,.checkout,.summary{background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 75%,transparent),color-mix(in srgb,var(--surface) 35%,transparent));border:1px solid color-mix(in srgb,#fff 9%,transparent);border-top-color:color-mix(in srgb,#fff 16%,transparent);box-shadow:0 20px 40px -20px rgba(0,0,0,.6)}
.trust{border:0;justify-content:center}
.trust span{font-weight:600}
.eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent);font-size:.72rem;font-weight:600;letter-spacing:.02em;text-transform:none}
.hero{position:relative;isolation:isolate;padding-top:calc(var(--section) * .75)}
html,body{overflow-x:clip}
.hero:before{content:"";position:absolute;left:50%;top:-8%;width:72%;height:70%;transform:translateX(-50%);background:radial-gradient(closest-side,color-mix(in srgb,var(--accent) 42%,transparent),transparent 72%);filter:blur(48px);z-index:-1;pointer-events:none}
.hero-media:before{display:none}
.hero h1,.head h2{background:linear-gradient(90deg,var(--text) 0%,color-mix(in srgb,var(--text) 55%,var(--muted)) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-wrap:balance}
.hero h1{font-size:clamp(2.6rem,6.4vw,5.4rem);line-height:1.05}
.lead{margin-inline:auto;text-wrap:balance}
.hero-price{color:var(--text)}
.hero--center .hero-media{margin-top:56px;-webkit-mask-image:linear-gradient(to top,transparent 0%,#000 32%);mask-image:linear-gradient(to top,transparent 0%,#000 32%)}
.hero-media figure{padding:8px;border-radius:20px;background:color-mix(in srgb,var(--line) 45%,transparent);border:1px solid color-mix(in srgb,#fff 8%,transparent);border-top-color:color-mix(in srgb,#fff 14%,transparent);max-width:1040px;margin-inline:auto}
.hero-media img{border-radius:12px;border:1px solid color-mix(in srgb,#fff 8%,transparent);box-shadow:0 25px 50px -12px rgba(0,0,0,.65)}
.sec{border-top:1px solid color-mix(in srgb,#fff 6%,transparent)}
.head{margin-inline:auto;text-align:center}
.bento-card{border-radius:16px}
.num{color:var(--accent)}
.bento-card strong{font-weight:600}
.faq details{border-radius:14px}
.faq summary{font-weight:600}
.offer-main{position:relative;overflow:hidden;border-radius:20px}
.offer-main:before{content:"";position:absolute;left:50%;top:-140px;width:100%;max-width:960px;height:140px;transform:translateX(-50%);border-radius:50%;background:color-mix(in srgb,var(--accent) 55%,transparent);filter:blur(72px);pointer-events:none}
.offer-main:after{content:"";position:absolute;top:0;left:10%;width:80%;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent)}
.offer-main>*{position:relative}
.offer-price{background:linear-gradient(90deg,var(--text),color-mix(in srgb,var(--text) 60%,var(--accent)));-webkit-background-clip:text;background-clip:text;color:transparent}
.field input,.field select{background:color-mix(in srgb,var(--surface) 60%,transparent);border-color:color-mix(in srgb,#fff 10%,transparent)}
.footer{border-top-color:color-mix(in srgb,#fff 6%,transparent)}
.sticky{background:color-mix(in srgb,var(--bg) 70%,transparent)}
@media(prefers-reduced-motion:no-preference){
.hero-copy>*{opacity:0;animation:launchAppear .6s ease-out forwards}
.hero-copy>*:nth-child(2){animation-delay:.1s}.hero-copy>*:nth-child(3){animation-delay:.2s}.hero-copy>*:nth-child(4){animation-delay:.3s}.hero-copy>*:nth-child(5){animation-delay:.4s}
.hero-media{opacity:0;animation:launchAppear .7s ease-out .5s forwards}
.hero:before{opacity:0;animation:launchZoom .8s ease-out .7s forwards}
.hero-media img{animation:none}
@keyframes launchAppear{0%{opacity:0;transform:translateY(1rem);filter:blur(.5rem)}50%{filter:blur(0)}100%{opacity:1;transform:none;filter:blur(0)}}
@keyframes launchZoom{from{opacity:0;transform:translateX(-50%) scale(.5)}to{opacity:1;transform:translateX(-50%) scale(1)}}
}
@media(max-width:820px){.hero:before{width:100%;top:0}.hero--center .hero-media{margin-top:32px}}
`.trim();

/**
 * Familia "premium": mucho aire, tipografía serif de display, fotos enmarcadas
 * y CTA sobrio. El lujo se comunica con calma, no con ruido. Aporte: marco de
 * galería en la foto, tarjetas sin fondo con borde fino, precio en serif,
 * botón pastilla con transición lenta.
 */
const CSS_PREMIUM = `
/*f:premium*/
.top{background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.brand{font-family:'Playfair Display',Georgia,serif;font-weight:600;letter-spacing:.01em;font-size:1.05rem}
.btn{border-radius:999px;min-height:48px;padding:14px 28px;font-weight:600;letter-spacing:.02em;transition:all .3s ease}
.btn--primary{background:var(--accent);color:var(--on-accent);border:1px solid var(--accent);box-shadow:0 6px 20px -6px color-mix(in srgb,var(--accent) 42%,transparent)}
.btn--primary:hover{background:color-mix(in srgb,var(--accent) 86%,#1A1815);transform:translateY(-2px)}
.btn--soft{background:transparent;border:1px solid var(--line);color:var(--text)}
.eyebrow{letter-spacing:.22em;font-size:.66rem;font-weight:700;text-transform:uppercase;color:color-mix(in srgb,var(--accent) 80%,var(--text))}
.hero{padding-top:clamp(72px,9vw,110px);padding-bottom:64px;min-height:auto}
.hero h1{font-weight:500;line-height:1.12;text-wrap:balance}
.lead{line-height:1.8;max-width:640px}
.hero-price{font-family:'Playfair Display',Georgia,serif;font-size:1.5rem;font-weight:600;color:var(--text)}
.hero-media:before{display:none}
.hero-media figure{padding:14px;background:#fff;border:1px solid var(--line);border-radius:6px;box-shadow:0 24px 48px -28px rgba(26,24,21,.35)}
.hero-media img{border-radius:2px;box-shadow:none}
.trust{justify-content:center;gap:32px;border-top:0;border-bottom:0}
.trust span{background:transparent;border:0;font-weight:600;color:var(--muted);font-size:.9rem}
.sec{padding:clamp(64px,8vw,120px) 0}
.head{max-width:720px;margin-inline:auto;text-align:center}
.head h2{font-weight:500;letter-spacing:-.01em}
.bento{grid-template-columns:repeat(3,1fr);gap:24px}
.bento-card{background:transparent;border:1px solid var(--line);border-radius:6px;padding:32px 28px;text-align:left;box-shadow:none;min-height:0;transition:box-shadow .3s ease,transform .3s ease}
.bento-card:hover{box-shadow:0 20px 40px -22px rgba(26,24,21,.18);transform:translateY(-3px)}
.num{display:block;font-family:'Playfair Display',Georgia,serif;font-size:.95rem;margin-bottom:14px;letter-spacing:.05em}
.bento-card strong{font-weight:600;font-size:1.02rem;line-height:1.5}
.feature-row{gap:48px}
.feature-copy h2{font-weight:500}
.feature-media:before,.feature-media:after{display:none}
.feature-media figure{padding:10px;background:#fff;border:1px solid var(--line);border-radius:4px}
.offer{grid-template-columns:1fr;max-width:760px;margin-inline:auto}
.offer-main{background:#fff;border:1px solid var(--line);border-radius:6px;padding:clamp(36px,6vw,56px);box-shadow:0 30px 60px -32px rgba(26,24,21,.25)}
.offer-main h2,.cierre h2{font-weight:500}
.offer-price{font-family:'Playfair Display',Georgia,serif;font-size:2.2rem;font-weight:600;letter-spacing:-.01em;color:var(--text)}
.faq details{border:0;border-bottom:1px solid var(--line);border-radius:0;padding:20px 0;background:transparent}
.faq summary{font-weight:600;font-size:1.02rem}
.checkout,.summary{background:#fff;border:1px solid var(--line);border-radius:6px;box-shadow:0 24px 48px -32px rgba(26,24,21,.2)}
.field input,.field select{border:1px solid var(--line);border-radius:6px;background:#fff;padding:14px}
.footer{border-top:1px solid var(--line);text-align:center}
.sticky .btn{max-width:720px;margin-inline:auto}
@media(max-width:820px){.bento{grid-template-columns:1fr}.offer-main{padding:36px 22px}.trust{gap:16px}}
`.trim();

/**
 * Familia "respuesta-directa": la landing de tráfico pago que convierte.
 * Urgencia honesta, precio a la vista, CTA en bloque y prueba social arriba.
 * Aporte: botones con sombra dura tipo "sticker", tipografía condensada en
 * mayúsculas, tarjetas con borde grueso y la oferta en color de marca.
 */
const CSS_RESPUESTA_DIRECTA = `
/*f:respuesta-directa*/
.top{background:var(--bg);border-bottom:2px solid var(--text)}
.brand{font-family:'Archivo',Impact,sans-serif;font-weight:800;letter-spacing:-.02em;text-transform:uppercase}
.btn{border-radius:8px;min-height:56px;padding:16px 24px;font-weight:800;text-transform:uppercase;letter-spacing:.02em;border:2px solid var(--text);box-shadow:4px 4px 0 var(--text)}
.btn:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--text)}
.btn--primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent);box-shadow:4px 4px 0 color-mix(in srgb,var(--accent) 55%,#000)}
.btn--soft{background:var(--bg);color:var(--text);border-color:var(--text)}
.eyebrow{display:inline-block;background:var(--accent);color:var(--on-accent);padding:5px 12px;border-radius:4px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.hero{padding-top:44px;padding-bottom:40px;min-height:auto}
.hero h1{font-family:'Archivo',Impact,sans-serif;font-size:clamp(2.3rem,6vw,4.4rem);line-height:1.05;text-transform:uppercase}
.hero-price{font-family:'Archivo',Impact,sans-serif;font-size:clamp(2rem,5vw,3rem);color:var(--accent);font-weight:800}
.lead{color:var(--muted)}
.hero-copy .actions{display:grid;gap:12px;max-width:420px}
.hero--center .hero-copy .actions{margin-inline:auto}
.hero-media:before{display:none}
.hero-media figure{background:var(--surface);border:2px solid var(--text);border-radius:12px;padding:0;overflow:hidden;box-shadow:8px 8px 0 color-mix(in srgb,var(--text) 10%,transparent)}
.hero-media img{border-radius:0;box-shadow:none}
.trust{justify-content:center;gap:10px;border-top:0;border-bottom:0;padding:8px 0}
.trust span{background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:8px 16px;font-weight:700;font-size:.85rem}
.sec{padding:40px 0}
.head{text-align:center;margin-inline:auto}
.head h2{font-family:'Archivo',Impact,sans-serif;font-size:clamp(1.9rem,4.5vw,3rem);text-transform:uppercase;line-height:1.1}
.bento{grid-template-columns:repeat(3,1fr);gap:16px}
.bento-card{background:var(--bg);border:2px solid var(--text);border-radius:12px;padding:20px;box-shadow:4px 4px 0 var(--line);text-align:left;min-height:0}
.num{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:var(--accent);color:var(--on-accent);border-radius:8px;font-weight:800;font-size:.85rem;margin-bottom:10px}
.bento-card strong{font-weight:800;font-size:.98rem;line-height:1.4}
.offer-main{background:var(--accent);color:var(--on-accent);border-radius:16px;padding:clamp(32px,5vw,44px);text-align:center;border:2px solid var(--text);box-shadow:8px 8px 0 var(--text)}
.offer-main .eyebrow{background:var(--on-accent);color:var(--accent)}
.offer-main h2{font-family:'Archivo',Impact,sans-serif;text-transform:uppercase}
.offer-main .lead{color:color-mix(in srgb,var(--on-accent) 88%,transparent)}
.offer-price{font-family:'Archivo',Impact,sans-serif;font-size:2.4rem;font-weight:800;color:var(--on-accent);letter-spacing:-.01em}
.offer-main .btn--primary{background:var(--on-accent);color:var(--accent);border-color:var(--on-accent);box-shadow:4px 4px 0 color-mix(in srgb,var(--text) 45%,transparent)}
.faq details{border:2px solid var(--text);border-radius:12px;margin-bottom:12px;background:var(--bg);box-shadow:4px 4px 0 var(--line)}
.faq summary{font-weight:800;padding:16px 20px}
.checkout,.summary{background:var(--bg);border:2px solid var(--text);border-radius:16px;box-shadow:8px 8px 0 var(--line)}
.sticky .btn{box-shadow:4px 4px 0 var(--text)}
@media(max-width:820px){.bento{grid-template-columns:1fr}.hero h1{font-size:clamp(2.2rem,10vw,3.4rem)}}
`.trim();

/**
 * Familia "ecommerce": tipo Shopify Dawn. Galería protagonista, tarjeta de
 * compra pegajosa y beneficios en tres columnas. La foto decide. Aporte:
 * grilla de galería asimétrica, beneficios con icono numérico, oferta en dos
 * columnas con la foto al costado y botón con sombra de marca.
 */
const CSS_ECOMMERCE = `
/*f:ecommerce*/
.top{background:var(--bg);border-bottom:1px solid var(--line)}
.brand{font-weight:800;letter-spacing:-.02em}
.btn{border-radius:10px;min-height:48px;font-weight:700;padding:13px 24px}
.btn--primary{background:var(--accent);color:var(--on-accent);box-shadow:0 10px 24px -8px color-mix(in srgb,var(--accent) 45%,transparent)}
.btn--primary:hover{background:color-mix(in srgb,var(--accent) 88%,#000)}
.btn--soft{background:var(--surface);border:1px solid var(--line);color:var(--text)}
.hero{gap:48px;min-height:auto;padding:clamp(56px,7vw,88px) 0 48px}
.eyebrow{color:var(--accent);font-weight:700;letter-spacing:.08em;font-size:.72rem}
.hero h1{line-height:1.08;text-wrap:balance}
.lead{color:var(--muted)}
.hero-price{font-size:1.6rem;font-weight:800;color:var(--accent);letter-spacing:-.02em}
.hero-media:before{display:none}
.hero-media figure{border-radius:16px;overflow:hidden;background:var(--surface);border:1px solid var(--line);box-shadow:0 30px 60px -26px rgba(20,24,31,.3)}
.hero-media img{border-radius:0;box-shadow:none;max-height:560px}
.trust{justify-content:flex-start;gap:10px;border-top:0;border-bottom:0}
.trust span{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-size:.85rem;font-weight:600;color:var(--muted)}
.sec{padding:56px 0}
.head{text-align:left;margin-inline:0}
.head h2{line-height:1.15}
.bento{grid-template-columns:repeat(3,1fr);gap:20px}
.bento-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:24px;text-align:left;min-height:0}
.num{display:inline-flex;width:36px;height:36px;align-items:center;justify-content:center;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);border-radius:10px;font-weight:800;font-size:.85rem;margin-bottom:12px}
.bento-card strong{font-weight:700;font-size:1rem;line-height:1.45}
.feature-row{gap:40px}
.feature-media figure{border-radius:14px;overflow:hidden;border:1px solid var(--line)}
.gallery{grid-template-columns:repeat(4,1fr);grid-auto-rows:220px;gap:12px}
.gallery img{border-radius:12px}
.gallery img:first-child{grid-column:span 2;grid-row:span 2}
.offer{grid-template-columns:1.2fr .8fr;gap:24px;align-items:stretch}
.offer-main{border-radius:16px;padding:32px}
.offer-side figure{border-radius:16px;overflow:hidden;border:1px solid var(--line)}
.offer-price{font-size:1.9rem;font-weight:800;color:var(--accent)}
.checkout,.summary{background:var(--surface);border:1px solid var(--line);border-radius:16px}
.field input,.field select{border:1px solid var(--line);border-radius:10px;background:var(--bg);padding:13px}
.footer{background:var(--surface);border-top:1px solid var(--line)}
.sticky{background:var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 32px -12px rgba(20,24,31,.28)}
@media(max-width:820px){.bento{grid-template-columns:1fr}.gallery{grid-template-columns:1fr 1fr}.gallery img:first-child{grid-column:span 2;grid-row:auto}.offer{grid-template-columns:1fr}}
`.trim();

/**
 * Familia "oscura": tipo Linear / Vercel. Fondo oscuro, acento luminoso,
 * degradados sutiles y bordes de 1px. El producto se ilumina sobre el fondo.
 * Aporte: halo radial de marca detrás del hero, tarjetas de cristal oscuro y
 * borde que se enciende al pasar el mouse.
 */
const CSS_OSCURA = `
/*f:oscura*/
.top{background:color-mix(in srgb,var(--bg) 70%,transparent);backdrop-filter:blur(18px);border-bottom:1px solid var(--line)}
.brand{font-weight:700;letter-spacing:-.02em}
.btn{border-radius:10px;min-height:46px;font-weight:600}
.btn--primary{background:linear-gradient(180deg,var(--accent),color-mix(in srgb,var(--accent) 72%,#000));color:var(--on-accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 45%,transparent),0 12px 32px -8px color-mix(in srgb,var(--accent) 45%,transparent)}
.btn--primary:hover{filter:brightness(1.1)}
.btn--soft{background:color-mix(in srgb,var(--surface) 80%,transparent);border:1px solid var(--line)}
.hero{position:relative;isolation:isolate}
.hero:before{content:"";position:absolute;left:50%;top:-10%;width:80%;height:80%;transform:translateX(-50%);background:radial-gradient(closest-side,color-mix(in srgb,var(--accent) 26%,transparent),transparent 70%);filter:blur(60px);z-index:-1;pointer-events:none}
.hero-media:before{display:none}
.eyebrow{color:var(--accent);letter-spacing:.14em;font-size:.7rem;font-weight:600}
.hero h1{line-height:1.08;text-wrap:balance}
.lead{color:var(--muted)}
.hero-price{color:var(--accent);font-weight:700;font-size:1.5rem}
.hero-media figure{border:1px solid var(--line);border-radius:16px;padding:0;overflow:hidden;background:color-mix(in srgb,var(--surface) 60%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,#fff 4%,transparent),0 40px 80px -34px rgba(0,0,0,.8)}
.hero-media img{border-radius:0;box-shadow:none;filter:saturate(1.05)}
.trust{justify-content:center;border-top:0;border-bottom:0}
.trust span{background:color-mix(in srgb,var(--surface) 70%,transparent);border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-size:.85rem;font-weight:500;color:var(--muted)}
.sec{border-top:1px solid color-mix(in srgb,var(--line) 55%,transparent)}
.head{text-align:center;margin-inline:auto}
.bento{grid-template-columns:repeat(3,1fr);gap:16px}
.bento-card{background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 70%,transparent),color-mix(in srgb,var(--surface) 30%,transparent));border:1px solid var(--line);border-radius:14px;padding:24px;text-align:left;min-height:0;transition:border-color .25s ease}
.bento-card:hover{border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}
.num{color:var(--accent);font-weight:700;font-size:.85rem}
.bento-card strong{font-weight:600}
.offer-main{background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 70%,transparent),color-mix(in srgb,var(--surface) 30%,transparent));border:1px solid var(--line);border-radius:16px;padding:36px}
.offer-price{font-size:2rem;font-weight:700;color:var(--accent)}
.faq details{border:1px solid var(--line);border-radius:12px;margin-bottom:10px;background:color-mix(in srgb,var(--surface) 60%,transparent)}
.checkout,.summary{background:color-mix(in srgb,var(--surface) 60%,transparent);border:1px solid var(--line);border-radius:16px}
.field input,.field select{background:color-mix(in srgb,var(--surface) 70%,transparent);border:1px solid var(--line);border-radius:10px}
.footer{border-top:1px solid var(--line)}
.sticky{background:color-mix(in srgb,var(--bg) 80%,transparent);border:1px solid var(--line);border-radius:14px}
@media(max-width:820px){.bento{grid-template-columns:1fr}}
`.trim();

/** Rótulo pequeño sobre el título: en español, nunca el tipo interno. */
const ROTULOS: Record<string, string> = {
  benefits: "Beneficios", features: "Lo que incluye", logistics: "Envío y pago", offer: "La oferta", cta: "Siguiente paso",
  authority: "Por qué confiar", bundle: "Incluye", guarantee: "Garantía", testimonials: "Opiniones", "social-proof": "Opiniones",
  "how-it-works": "Cómo funciona", steps: "Paso a paso", comparison: "Comparación", "before-after": "Antes y después", problem: "El problema", solution: "La solución",
};
function rotulo(type: string | null | undefined): string {
  const t = String(type || "").toLowerCase();
  if (ROTULOS[t]) return ROTULOS[t];
  for (const k of Object.keys(ROTULOS)) if (t.includes(k)) return ROTULOS[k];
  return "Detalle";
}

function renderBenefits(section: SeccionParaRenderizar): string {
  return renderBenefitsVariante("cards", section);
}
const ICONOS_CONFIANZA: Array<[RegExp, string]> = [
  [/env[ií]o|domicilio|despacho|transportadora/i, "M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 18a2 2 0 1 0 0 .01M17.5 18a2 2 0 1 0 0 .01"],
  [/pago|contra ?entrega|efectivo|nequi|tarjeta/i, "M2.5 6h19v12h-19zM12 12a2.6 2.6 0 1 0 0 .01M6 9v.01M18 15v.01"],
  [/garant|devoluci|segur|proteg|confi/i, "M12 3l8 3v6c0 4.6-3.4 8.3-8 9-4.6-.7-8-4.4-8-9V6zM8.5 12l2.5 2.5 4.5-5"],
  [/soporte|ayuda|whatsapp|acompa/i, "M4 5h16v11H9l-5 4zM8 9h8M8 12.5h5"],
  [/calidad|original|premium|f[aá]brica/i, "M12 2l2.6 6.2 6.7.5-5.1 4.4 1.6 6.5L12 16.4 6.2 19.6l1.6-6.5L2.7 8.7l6.7-.5z"],
  [/llega|tiempo|plazo|d[ií]as|horas|tarda|env[ií]o/i, "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"],
];
function iconoPara(texto: string): string {
  const d = ICONOS_CONFIANZA.find(([re]) => re.test(texto))?.[1];
  if (!d) return "✓";
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

/** Galería del hero: carrusel sin JS (scroll-snap + anclas). Sin fotos extra, una sola figura. */
let hgId = 0;
function heroGallery(fotos: string[], alt: string): string {
  const unicas = [...new Set(fotos.filter(Boolean))].slice(0, 5);
  if (unicas.length < 2) return figure(unicas[0] || "", alt, "media-frame", "eager");
  const id = `hg${++hgId}`;
  return `<div class="hg"><div class="hg-track" id="${id}">${unicas.map((f, i) => `<div class="hg-slide"><img src="${esc(f)}" alt="${esc(alt)} · foto ${i + 1}" ${i === 0 ? 'loading="eager"' : 'loading="lazy"'} decoding="async"></div>`).join("")}</div><div class="hg-dots" aria-hidden="true">${unicas.map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</div></div><script>(function(){var t=document.getElementById("${id}");if(!t)return;var d=t.parentElement.querySelectorAll(".hg-dots i");t.addEventListener("scroll",function(){var i=Math.round(t.scrollLeft/t.clientWidth);d.forEach(function(x,k){x.classList.toggle("on",k===i)})},{passive:true})})();</script>`;
}

/** Banda de foto a sangre con pie: usa UNA foto del presupuesto (distribución). */
function renderPhotoBand(foto: string, caption: string): string {
  if (!foto) return "";
  return `<div class="photoband"><figure><img src="${esc(foto)}" alt="${esc(caption || "Detalle del producto")}" loading="lazy" decoding="async">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}</figure></div>`;
}

function renderBenefitsVariante(v: BeneficiosV, section: SeccionParaRenderizar): string {
  const rows = items(section.body);
  if (!rows.length && !section.subtitle) return "";
  const head = `<div class="head"><p class="eyebrow">${rotulo(section.type)}</p><h2>${esc(section.title || "Lo que cambia para ti")}</h2>${section.subtitle ? `<p class="lead">${esc(acotar(section.subtitle, 240))}</p>` : ""}</div>`;
  if (v === "numbered") return `${head}<div class="bento--numbered">${rows.map((row, i) => `<article><span class="num">${String(i + 1).padStart(2, "0")}</span><strong>${esc(row)}</strong></article>`).join("")}</div>`;
  if (v === "checklist") return `${head}<div class="bento--checklist">${rows.map((row) => `<article><span class="num">✓</span><strong>${esc(row)}</strong></article>`).join("")}</div>`;
  return `${head}<div class="bento">${rows.map((row, i) => `<article class="bento-card"><span class="num">${String(i + 1).padStart(2, "0")}</span><strong>${esc(row)}</strong></article>`).join("")}</div>`;
}


/**
 * Familia "minimal": la página que no estorba. Una columna, líneas finas,
 * cero sombras, CTA subrayado que no compite con el producto. Conversión por
 * ausencia de fricción: un solo camino visual hacia el botón.
 */
const CSS_MINIMAL = `
/*f:minimal*/
.top{background:var(--bg);backdrop-filter:none;border-bottom:1px solid var(--line)}
.btn{border-radius:0;min-height:44px;font-weight:600}
.btn--primary{background:var(--text);color:var(--bg);box-shadow:none}
.btn--soft{background:transparent;border:0;text-decoration:underline;text-underline-offset:6px;padding-inline:4px}
.hero{display:block;max-width:720px;margin:auto;min-height:auto}
.hero-media{order:-1;margin-bottom:28px}.hero-media:before{display:none}
.hero-media img{border-radius:0;box-shadow:none;max-height:560px}
.hero h1{font-size:clamp(2rem,4.6vw,3.2rem);font-weight:600}
.eyebrow{text-transform:none;letter-spacing:0;color:var(--muted)}
.trust{border:0;gap:18px;padding:14px 0}.trust span{background:transparent;border:0;border-radius:0;padding:0;font-weight:600}
.sec{border-top:1px solid var(--line)}
.strip,.bento{grid-template-columns:1fr;gap:0}
.strip article,.bento-card{background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;box-shadow:none;padding:22px 0}
.feature-row{grid-template-columns:1fr;gap:20px}
.offer{grid-template-columns:1fr}.offer-main{background:var(--bg);border:1px solid var(--text);border-radius:0;box-shadow:none}
.faq{grid-template-columns:1fr}.faq details{background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;padding:18px 0}
.cierre{background:transparent;border:1px solid var(--text);border-radius:0;box-shadow:none}
.sticky{border-radius:0;left:0;right:0;bottom:0;border:0;border-top:1px solid var(--line)}
`;

/**
 * Familia "editorial": se lee como revista. Reglas finas, números de
 * sección, citas grandes, fotos verticales con pie. La prueba social va en
 * grande (cita editorial) justo donde el lector duda: antes de la oferta.
 */
const CSS_EDITORIAL = `
/*f:editorial*/
.head{border-top:2px solid var(--text);padding-top:18px}
.head h2{font-size:clamp(1.9rem,3.6vw,3rem)}
.hero{grid-template-columns:1fr 1fr;align-items:start}
.hero-media img{aspect-ratio:3/4;max-height:640px;border-radius:2px}
.hero h1{font-size:clamp(2.4rem,5vw,4.2rem);text-wrap:balance}
.eyebrow{font-family:var(--font-texto,var(--text));letter-spacing:.22em}
.lead{font-size:clamp(1.1rem,1.6vw,1.35rem)}
.bento{grid-template-columns:1fr 1fr}.bento-card{background:transparent;border:0;border-top:2px solid var(--text);border-radius:0;box-shadow:none;padding:22px 4px}
.num{font-size:1rem}
.strip article{background:transparent;box-shadow:none}
.feature-row{gap:clamp(28px,5vw,72px)}
.gallery{grid-template-columns:1fr 1fr 1fr;grid-auto-rows:260px}
.offer{grid-template-columns:1fr 1fr}.offer-main{background:var(--surface);box-shadow:none}
.faq details{background:transparent;box-shadow:none}
.cierre{background:var(--text);color:var(--bg);border-radius:2px}
.cierre .lead{color:var(--bg)}
.btn--primary{background:var(--accent)}
@media(max-width:820px){.hero{grid-template-columns:1fr}.gallery{grid-template-columns:1fr 1fr}}
`;

/**
 * Familia "belleza": aspiracional y suave. Baño de color rubor, pastillas,
 * tarjetas flotantes sin bordes, tipografía ligera. El CTA respira rodeado
 * de aire: se toca sin pensar.
 */
const CSS_BELLEZA = `
/*f:belleza*/
.hero{position:relative;isolation:isolate}
.hero:before{content:"";position:absolute;inset:-40px -8% auto -8%;height:78%;background:radial-gradient(60% 60% at 50% 30%,color-mix(in srgb,var(--accent) 16%,transparent),transparent 70%);z-index:-1;pointer-events:none}
.hero-media:before{display:none}
.hero-media img{border-radius:28px;box-shadow:0 30px 70px color-mix(in srgb,var(--accent) 22%,transparent)}
.hero h1{font-weight:400;letter-spacing:.01em;text-wrap:balance}
.btn{border-radius:999px;min-height:52px;padding:15px 34px;font-weight:700}
.btn--primary{box-shadow:0 16px 36px color-mix(in srgb,var(--accent) 38%,transparent)}
.trust{border:0;justify-content:center}.trust span{border:0;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--surface));font-weight:600}
.bento-card,.strip article,.faq details{border:0;border-radius:22px;box-shadow:0 14px 40px color-mix(in srgb,var(--accent) 12%,transparent)}
.offer-main{border:0;border-radius:28px;background:linear-gradient(160deg,var(--surface),color-mix(in srgb,var(--accent) 12%,var(--surface)));box-shadow:0 24px 60px color-mix(in srgb,var(--accent) 18%,transparent)}
.offer-price{color:var(--accent)}
.cierre{border:0;border-radius:32px;background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 14%,var(--surface)),var(--surface))}
.gallery img{border-radius:22px}
`;

/**
 * Familia "fitness": grito, no susurro. Mayúsculas condensadas, reglas
 * gruesas, fotos a sangre, CTA en bloque rojo. Conversión por energía:
 * precio y botón siempre a la vista, prueba en tarjetas oscuras.
 */
const CSS_FITNESS = `
/*f:fitness*/
.hero{grid-template-columns:1fr 1.1fr;min-height:80vh}
.hero-media{order:-1}.hero-media:before{display:none}
.hero-media img{border-radius:4px;max-height:640px}
.hero h1{text-transform:uppercase;line-height:.95;letter-spacing:-.035em}
.eyebrow{background:var(--text);color:var(--bg);padding:6px 12px;border-radius:4px;letter-spacing:.12em}
.btn{border-radius:4px;min-height:56px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
.btn--primary{box-shadow:0 10px 0 color-mix(in srgb,var(--accent) 45%,#000)}
.btn--primary:active{transform:translateY(6px);box-shadow:none}
.trust{border-top:3px solid var(--text);border-bottom:3px solid var(--text)}
.trust span{border-radius:4px;font-weight:900;text-transform:uppercase;font-size:.75rem}
.bento-card,.strip article{border-radius:4px;border:2px solid var(--text);box-shadow:5px 5px 0 var(--text)}
.offer-main{border:3px solid var(--text);border-radius:6px;background:var(--text);color:var(--bg)}
.offer-main .lead{color:var(--bg)}
.offer-price{color:var(--accent)}
.checkout{border:2px solid var(--text);border-radius:6px}
.sticky .btn{border-radius:6px}
@media(max-width:820px){.hero{grid-template-columns:1fr;min-height:auto}}
`;


/**
 * Familia "educacion": confianza de academia. Contenido estructurado como
 * programa: módulos numerados, tarjetas con filo de acento, oferta clara con
 * lo que incluye. El CTA sólido aparece después de cada prueba.
 */
const CSS_EDUCACION = `
/*f:educacion*/
.hero{grid-template-columns:1.05fr .95fr}
.hero-media img{border-radius:12px}
.head{max-width:860px}
.bento{grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))}
.bento-card{border-left:5px solid var(--accent);border-radius:12px}
.num{font-size:1.4rem;font-weight:900}
.strip{grid-template-columns:1fr 1fr}.strip article{border-radius:12px}
.feature-row{gap:28px}.feature-media img{aspect-ratio:16/10}
.offer{grid-template-columns:1.05fr .95fr}.offer-main{border-radius:16px}
.summary{border-radius:12px}
.faq details{border-radius:12px}.faq details[open]{border-color:var(--accent)}
.checkout{border-radius:16px}
.btn{min-height:50px;font-weight:800}
.trust span{font-weight:700}
@media(max-width:820px){.strip{grid-template-columns:1fr}}
`;

/**
 * Familia "tecnologia": precisión de instrumento. Grilla visible, tarjetas de
 * vidrio sobrio, números protagonistas, hero centrado con el producto como
 * pieza de museo. Nada grita: todo mide.
 */
const CSS_TECNOLOGIA = `
/*f:tecnologia*/
.hero{display:block;text-align:center;min-height:auto;max-width:960px;margin:auto}
.hero-copy .actions{justify-content:center}
.hero-media{margin-top:44px;max-width:880px;margin-inline:auto}
.hero-media:before{inset:6% -4% -6% 4%;border-radius:24px}
.hero-media img{border:1px solid var(--line)}
.top{border-bottom:1px solid var(--line)}
.bento{grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}
.bento-card{background:linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 60%,var(--bg)));border-radius:16px;font-variant-numeric:tabular-nums}
.num{font-variant-numeric:tabular-nums;letter-spacing:.1em}
.strip article{border-radius:16px;font-variant-numeric:tabular-nums}
.offer{grid-template-columns:1fr 1fr;align-items:stretch}
.offer-main,.offer-side,.checkout{border-radius:18px}
.gallery{grid-auto-rows:200px}
.faq{grid-template-columns:1fr 1fr}
@media(max-width:820px){.faq{grid-template-columns:1fr}}
`;

/**
 * Familia "familiar": calidez de sobremesa. Formas redondas, sin bordes
 * duros, sombra tibia, CTA pastilla que invita. La oferta se lee como una
 * recomendación, no como un contrato.
 */
const CSS_FAMILIAR = `
/*f:familiar*/
.hero{grid-template-columns:1fr 1fr;align-items:center}
.hero-media:before{border-radius:48px;background:color-mix(in srgb,var(--accent) 14%,transparent)}
.hero-media img{border-radius:36px}
.hero h1{text-wrap:balance}
.btn{border-radius:999px;min-height:52px;padding:15px 32px}
.btn--primary{box-shadow:0 14px 30px color-mix(in srgb,var(--accent) 32%,transparent)}
.trust{border:0}.trust span{border:0;border-radius:999px;background:var(--surface);box-shadow:0 6px 18px color-mix(in srgb,var(--accent) 10%,transparent)}
.bento-card,.strip article,.faq details{border:0;border-radius:24px;background:var(--surface);box-shadow:0 10px 30px color-mix(in srgb,var(--text) 6%,transparent)}
.offer-main{border:0;border-radius:28px}
.offer-side img{border-radius:24px}
.cierre{border:0;border-radius:32px;background:linear-gradient(160deg,var(--surface),color-mix(in srgb,var(--accent) 10%,var(--surface)))}
.gallery img{border-radius:24px}
@media(max-width:820px){.hero{grid-template-columns:1fr}}
`;

/**
 * Familia "creativa": neobrutalismo que vende. Bordes gruesos, sombras duras,
 * tipografía enorme, composición alterna. Cada sección es un cartel: imposible
 * scrollear sin mirar el precio y el botón.
 */
const CSS_CREATIVA = `
/*f:creativa*/
.top{border-bottom:3px solid var(--text)}
.hero{align-items:start}
.hero h1{font-size:clamp(2.8rem,7vw,5.6rem);line-height:.95}
.hero-media img{border:3px solid var(--text);border-radius:18px;box-shadow:8px 8px 0 var(--text)}
.hero-media:before{display:none}
.eyebrow{background:var(--surface);border:2px solid var(--text);border-radius:999px;padding:6px 14px;color:var(--text);box-shadow:3px 3px 0 var(--text)}
.btn{border:2px solid var(--text);border-radius:14px;box-shadow:4px 4px 0 var(--text);font-weight:900}
.btn:active{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--text)}
.btn--primary{background:var(--accent)}
.bento-card,.strip article,.faq details,.offer-main,.checkout{border:2px solid var(--text);border-radius:18px;box-shadow:6px 6px 0 var(--text)}
.offer-side img{border:3px solid var(--text);border-radius:18px}
.trust{border-top:3px solid var(--text);border-bottom:3px solid var(--text)}
.trust span{border:2px solid var(--text);border-radius:999px;font-weight:800}
.cierre{border:3px solid var(--text);border-radius:24px;box-shadow:8px 8px 0 var(--text)}
`;


/**
 * Familia "suplemento": laboratorio + naturaleza. Blanco clínico, verde de
 * confianza, tarjetas de ingredientes con check, franja de sellos. El precio
 * y la garantía se leen antes que cualquier párrafo.
 */
const CSS_SUPLEMENTO = `
/*f:suplemento*/
.hero{grid-template-columns:1fr 1fr}
.hero-media:before{background:color-mix(in srgb,var(--accent) 14%,transparent);border-radius:40px}
.hero-media img{border-radius:28px}
.eyebrow{background:color-mix(in srgb,var(--accent) 12%,transparent);border-radius:999px;padding:6px 14px;color:var(--accent);text-transform:none;letter-spacing:.02em;font-weight:800}
.btn{border-radius:999px;min-height:52px}
.btn--primary{box-shadow:0 14px 32px color-mix(in srgb,var(--accent) 36%,transparent)}
.trust{border:0}.trust span{border-radius:999px;font-weight:700}
.strip{grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}
.strip article{border-radius:20px;background:var(--surface)}
.strip article:before{font-size:1.3rem}
.bento-card{border-radius:20px}
.offer-main{border-radius:24px;border:2px solid color-mix(in srgb,var(--accent) 35%,var(--line))}
.offer-price{color:var(--accent)}
.faq details{border-radius:16px}
.cierre{border-radius:28px}
@media(max-width:820px){.hero{grid-template-columns:1fr}}
`;

/**
 * Familia "gourmet": que dé hambre. Foto a sangre que manda, serif cálida,
 * aire generoso, oferta como carta de restaurante. El CTA pastilla color
 * cacao sobre crema: se ve a tres metros.
 */
const CSS_GOURMET = `
/*f:gourmet*/
.hero{grid-template-columns:1fr 1.15fr;min-height:78vh}
.hero-media{order:2}.hero-media:before{display:none}
.hero-media img{border-radius:4px 28px 28px 28px;max-height:720px}
.hero h1{font-weight:700;text-wrap:balance}
.lead{font-size:clamp(1.1rem,1.6vw,1.35rem)}
.btn{border-radius:999px;min-height:54px;padding:16px 38px;font-weight:800}
.trust{border:0;justify-content:center}.trust span{background:transparent;border:1px solid var(--line);border-radius:999px}
.gallery{grid-template-columns:1fr 1fr;grid-auto-rows:280px}
.gallery img{border-radius:20px}
.gallery img:first-child{grid-column:auto;grid-row:span 2}
.bento-card,.strip article{border-radius:22px}
.offer-main{border-radius:26px;background:linear-gradient(165deg,var(--surface),color-mix(in srgb,var(--accent) 9%,var(--surface)))}
.offer-price{font-size:clamp(2.6rem,5.4vw,5rem)}
.cierre{border-radius:30px}
@media(max-width:820px){.hero{grid-template-columns:1fr;min-height:auto}.hero-media{order:-1}.gallery{grid-template-columns:1fr}.gallery img:first-child{grid-row:auto}}
`;

/**
 * Familia "electronica": ficha técnica con neón. Azul noche, cyan luminoso,
 * bento de especificaciones, producto flotando con halo eléctrico. La oferta
 * oscura hace que el precio en cyan sea lo más brillante de la página
 * después del CTA.
 */
const CSS_ELECTRONICA = `
/*f:electronica*/
.hero{position:relative;isolation:isolate}
.hero:before{content:"";position:absolute;left:50%;top:-6%;width:70%;height:64%;transform:translateX(-50%);background:radial-gradient(closest-side,color-mix(in srgb,var(--accent) 26%,transparent),transparent 72%);filter:blur(52px);z-index:-1;pointer-events:none}
.hero-media img{border:1px solid color-mix(in srgb,var(--accent) 40%,var(--line));box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 25%,transparent),0 24px 70px color-mix(in srgb,var(--accent) 20%,transparent)}
.hero h1{text-wrap:balance}
.eyebrow{color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:6px;padding:6px 12px;background:color-mix(in srgb,var(--accent) 8%,transparent)}
.btn{border-radius:10px;min-height:50px;font-weight:800}
.btn--primary{box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 60%,transparent),0 12px 34px color-mix(in srgb,var(--accent) 35%,transparent)}
.bento-card{background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 85%,transparent),color-mix(in srgb,var(--surface) 55%,transparent));border:1px solid color-mix(in srgb,var(--accent) 18%,var(--line));border-radius:14px;font-variant-numeric:tabular-nums}
.num{letter-spacing:.14em}
.strip article{border-radius:14px;border:1px solid color-mix(in srgb,var(--accent) 18%,var(--line))}
.offer-main{border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));border-radius:18px;background:linear-gradient(160deg,var(--surface),color-mix(in srgb,var(--accent) 8%,var(--surface)))}
.offer-price{color:var(--accent);text-shadow:0 0 32px color-mix(in srgb,var(--accent) 45%,transparent)}
.trust{border-color:color-mix(in srgb,var(--accent) 20%,var(--line))}
.faq details{border-radius:12px}
.cierre{border:1px solid color-mix(in srgb,var(--accent) 30%,var(--line));border-radius:20px}
`;

/**
 * Familia "dropshipping": emoción contraentrega. Degradado vivo en el hero,
 * producto flotando con halo, CTA pastilla con degradado imposible de no
 * ver, oferta compacta con precio gigante. Ritmo rápido: vender en el primer
 * scroll, probar abajo.
 */
const CSS_DROPSHIPPING = `
/*f:dropshipping*/
.hero{position:relative;isolation:isolate;overflow:clip;border-radius:0 0 32px 32px;background:linear-gradient(165deg,color-mix(in srgb,var(--accent) 22%,var(--bg)),var(--bg) 62%)}
.hero-media img{border-radius:24px;border:3px solid color-mix(in srgb,#fff 55%,transparent);box-shadow:0 30px 70px color-mix(in srgb,var(--accent) 35%,transparent)}
.hero-media:before{background:color-mix(in srgb,var(--accent) 30%,transparent);filter:blur(30px)}
.hero h1{font-size:clamp(2.2rem,5.4vw,4.2rem);text-wrap:balance}
.hero-price{font-size:clamp(1.6rem,3vw,2.2rem)}
.eyebrow{background:var(--text);color:var(--bg);border-radius:999px;padding:7px 16px;letter-spacing:.06em}
.btn{border-radius:999px;min-height:56px;padding:16px 36px;font-weight:900;font-size:1.05rem}
.btn--primary{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 85%,#fff),var(--accent));box-shadow:0 16px 40px color-mix(in srgb,var(--accent) 45%,transparent)}
.trust{border:0;justify-content:center}.trust span{border-radius:999px;font-weight:800;background:var(--surface)}
.bento-card,.strip article{border-radius:20px}
.offer-main{border:0;border-radius:26px;background:linear-gradient(160deg,var(--text),color-mix(in srgb,var(--text) 78%,var(--accent)));color:var(--bg)}
.offer-main .lead{color:var(--bg)}
.offer-price{color:var(--bg)}
.checkout{border-radius:24px}
.sticky .btn{border-radius:16px}
`;

const CSS_CLINICA = `
/*f:clinica - PostureFit/dav mobile-first Meta Ads*/
.topbar{background:#10233D;color:#fff;font-size:.68rem;font-weight:700;overflow:hidden}
.topbar-in{max-width:760px}
.topbar-in span{font-size:.68rem}
.hero{background:linear-gradient(180deg,#F3F8FF 0%,#fff 100%);padding-top:28px;min-height:auto}
.hero h1{font-size:clamp(2rem,8vw,2.6rem);line-height:1.04;letter-spacing:-.045em;color:#10233D}
.hero .lead{font-size:.95rem;color:#56687B}
.hero-price{font-size:2.4rem;font-weight:900;color:#10233D;letter-spacing:-.05em}
.hero-price small{display:block;font-size:.65rem;color:#6C7B8D;font-weight:700;letter-spacing:.02em}
.btn{min-height:56px;border-radius:14px;font-weight:900;font-size:.95rem;width:100%}
.btn--primary{background:#13B86A;color:#fff;box-shadow:0 10px 24px rgba(19,184,106,.28)}
.eyebrow{display:inline-block;color:#1769D3;font-size:.68rem;font-weight:900;letter-spacing:.09em;background:#EDF5FF;border-radius:999px;padding:7px 12px;text-transform:uppercase}
.trust{border-top:1px solid var(--line);border-bottom:1px solid var(--line);border-left:0;border-right:0;border-radius:0;background:#fff}
.trust span{background:#FBFDFF;font-size:.75rem}
.bento-card,.strip article{border-radius:16px;background:#FBFDFF}
.offer-main{background:linear-gradient(135deg,#0F2848,#174F7E)!important;color:#fff;border:0;border-radius:22px}
.offer-main h2,.offer-main .lead{color:#fff}
.offer-price{color:#fff;font-size:2.6rem;font-weight:900;letter-spacing:-.05em}
.checkout{background:#F6F8FB;border:1px solid #E2E9F1;border-radius:20px}
.field input,.field select{border-radius:12px;padding:13px 12px;font-size:.95rem;border:1px solid #D9E2EA}
.field input:focus,.field select:focus{border-color:#1769D3;box-shadow:0 0 0 3px rgba(23,105,211,.1);outline:none}
.faq details{border-radius:14px}
.sticky{background:#fff;border-top:1px solid #E2E9F1}
.sticky .btn{background:#13B86A}
@media(max-width:820px){.hero{padding-top:16px}.sec{padding:40px 0}.head h2{font-size:1.8rem}}
`;

function renderFeature(section: SeccionParaRenderizar, producto: ProductoParaRenderizar | null | undefined, idx: number, foto: string): string {
  const src = foto;
  const media = src ? `<div class="feature-media">${figure(src, producto?.name || section.title || "Producto", "media-frame")}</div>` : "";
  return `<div class="feature-row${src ? "" : " feature-row--solo"}">${media}<div class="feature-copy"><p class="eyebrow">${section.type === "how-it-works" ? `Paso ${idx + 1}` : "Detalle"}</p><h2>${esc(section.title || "Lo importante")}</h2>${section.subtitle ? `<p class="lead">${esc(acotar(section.subtitle, 240))}</p>` : ""}${cuerpo(section.body)}</div></div>`;
}

/** Envío y pago: una tarjeta corta por condición, sin foto. Antes era el mismo bloque de dos columnas que la oferta y el cierre. */
function renderLogistica(section: SeccionParaRenderizar): string {
  const rows = items(section.body);
  if (!rows.length && !section.subtitle) return "";
  return `<div class="head"><p class="eyebrow">${rotulo(section.type)}</p><h2>${esc(section.title || "Envío y pago")}</h2>${section.subtitle ? `<p class="lead">${esc(acotar(section.subtitle, 240))}</p>` : ""}</div>${rows.length ? `<div class="strip">${rows.map((r) => `<article>${esc(r)}</article>`).join("")}</div>` : ""}`;
}

/** El cierre: repite la promesa y pide UNA cosa. Centrado, sin foto -- el formulario/checkout viene justo después. */
function renderCierre(section: SeccionParaRenderizar, destino: string): string {
  return `<div class="cierre"><p class="eyebrow">${rotulo(section.type)}</p><h2>${esc(section.title || "Listo para avanzar")}</h2>${section.subtitle ? `<p class="lead">${esc(acotar(section.subtitle, 240))}</p>` : ""}${cuerpo(section.body, { max: 300 })}${section.cta ? btn(section.cta, destino) : ""}</div>`;
}

/**
 * La oferta: el precio REAL, una vez y formateado. El modelo suele repetirlo
 * ("45999 COP" de subtítulo + "Precio: 45.999 COP" en el cuerpo); acá se
 * quita de su texto y se muestra desde la ficha. La foto lateral sale del
 * presupuesto de fotos; sin foto libre, la tarjeta va sola y centrada.
 */
function renderOferta(section: SeccionParaRenderizar, producto: ProductoParaRenderizar | null | undefined, destino: string, foto: string, heroTitle: string): string {
  return renderOfertaVariante("card", section, producto, destino, foto, heroTitle);
}
function renderOfertaVariante(v: OfertaV, section: SeccionParaRenderizar, producto: ProductoParaRenderizar | null | undefined, destino: string, foto: string, heroTitle: string): string {
  const price = precio(producto);
  const src = foto;
  if (v === "minimal") {
    const subtitle = section.subtitle && !esSoloPrecio(section.subtitle) ? `<p class="lead">${esc(acotar(section.subtitle, 240))}</p>` : "";
    return `<div class="shell offer--minimal"><div class="offer-main"><p class="eyebrow">${rotulo(section.type)}</p><h2>${esc(section.title || "La oferta")}</h2>${subtitle}${price ? `<div class="offer-price">${esc(price)}</div>` : ""}${cuerpo(section.body, { sinPrecio: !!price })}<div class="actions">${section.cta ? btn(section.cta, destino) : ""}</div></div></div>`;
  }
  if (v === "split") {
    const subtitle = section.subtitle && !esSoloPrecio(section.subtitle) ? `<p class="lead">${esc(acotar(section.subtitle, 240))}</p>` : "";
    const side = `<div class="offer-sidecol">${price ? `<div class="offer-price">${esc(price)}</div>` : ""}${section.cta ? btn(section.cta, destino) : ""}${src ? figure(src, producto?.name || heroTitle) : ""}</div>`;
    return `<div class="shell offer offer--split"><div class="offer-main"><p class="eyebrow">${rotulo(section.type)}</p><h2>${esc(section.title || "La oferta")}</h2>${subtitle}${cuerpo(section.body, { sinPrecio: !!price })}</div>${side}</div>`;
  }
  const subtitle = section.subtitle && !esSoloPrecio(section.subtitle) ? `<p class="lead">${esc(acotar(section.subtitle, 240))}</p>` : "";
  const main = `<div class="offer-main"><p class="eyebrow">${rotulo(section.type)}</p><h2>${esc(section.title || "La oferta")}</h2>${subtitle}${price ? `<div class="offer-price">${esc(price)}</div>` : ""}${cuerpo(section.body, { sinPrecio: !!price })}${section.cta ? btn(section.cta, destino) : ""}</div>`;
  const side = src ? `<div class="offer-side">${figure(src, producto?.name || heroTitle)}</div>` : "";
  return `<div class="shell offer${src ? "" : " offer--solo"}">${main}${side}</div>`;
}

function renderFaq(section: SeccionParaRenderizar): string {
  const rows = items(section.body).map((row) => {
    const [q, ...a] = row.split(/\s*\|\s*/);
    return { q: q.trim(), a: a.join(" | ").trim() };
  }).filter((r) => r.q);
  if (!rows.length) return "";
  return `<div class="head"><p class="eyebrow">Preguntas frecuentes</p><h2>${esc(section.title || "Antes de comprar")}</h2>${section.subtitle ? `<p class="lead">${esc(section.subtitle)}</p>` : ""}</div><div class="faq">${rows.map((row) => `<details><summary>${esc(row.q)}</summary><p class="muted">${esc(row.a || "Escribinos y te ayudamos.")}</p></details>`).join("")}</div>`;
}

/**
 * La galería solo muestra fotos que NO salieron en ninguna otra sección.
 *
 * Antes tomaba `section.images` o todas las del producto tal cual, así que
 * con 3 fotos la landing repetía la del hero y la de la oferta otra vez en
 * "Míralo de cerca" (reportado el 19-09-2026: "repite las imágenes y no es
 * nada bonito"). `disponibles` es lo que quedó del presupuesto global de la
 * página; si no quedó nada, la galería no se dibuja.
 */
function renderGallery(section: SeccionParaRenderizar, producto: ProductoParaRenderizar | null | undefined, disponibles: string[]): string {
  const urls = [...new Set(disponibles)].slice(0, 5);
  if (!urls.length) return "";
  return `<div class="head"><p class="eyebrow">Galería</p><h2>${esc(section.title || "Míralo de cerca")}</h2>${section.subtitle ? `<p class="lead">${esc(section.subtitle)}</p>` : ""}</div><div class="gallery">${urls.map((url, i) => `<img src="${esc(url)}" alt="${esc(producto?.name || "Producto")} · vista ${i + 1}" loading="lazy" decoding="async">`).join("")}</div>`;
}

/**
 * Selector de transportadora del formulario (30-09-2026): con ciudad y
 * departamento escritos, pregunta a /envio qué transportadoras de Dropi pueden
 * llevar ESTE producto allá y deja elegir. Sin precios de envío (regla del
 * dueño); si el cliente no elige, el despacho usa la más económica. Si no hay
 * cotización posible el campo no aparece y el pedido sigue igual.
 */
export const SCRIPT_TRANSPORTADORA = "(function(){var f=document.querySelector('.checkout-form');if(!f||!/\\/pedido$/.test(f.getAttribute('action')||''))return;var box=f.querySelector('.envio-transportadora');if(!box)return;var c=f.querySelector('[name=ciudad]'),d=f.querySelector('[name=departamento]'),ult='';function q(){var ci=(c.value||'').trim(),de=(d.value||'').trim();if(ci.length<3||de.length<3)return;var k=ci+'|'+de;if(k===ult)return;ult=k;fetch(f.getAttribute('action').replace(/\\/pedido$/,'/envio')+'?ciudad='+encodeURIComponent(ci)+'&departamento='+encodeURIComponent(de)).then(function(r){return r.json()}).then(function(j){if(k!==ult)return;if(!j||!j.ok){box.hidden=true;box.innerHTML='';return;}var t=j.transportadoras||[];var h='';if(t.length){h='<label>Transportadora</label><select name=\"transportadora\"><option value=\"\">La más económica (recomendada)</option>'+t.map(function(n){var e=String(n).replace(/[&<>\"]/g,'');return '<option value=\"'+e+'\">'+e+'</option>'}).join('')+'</select>';}if(j.aceptaContraentrega===false)h+='<p class=\"tiny\">A esta ciudad no hay pago contraentrega: te contactamos para el pago.</p>';if(!t.length&&j.mensaje)h+='<p class=\"tiny\">'+String(j.mensaje).replace(/[&<>]/g,'')+'</p>';box.innerHTML=h;box.hidden=!h;}).catch(function(){});}c.addEventListener('change',q);d.addEventListener('change',q);})();";

/** Departamento + ciudad (lista completa de Dropi si el negocio la tiene). Ver geo-colombia.ts. */
export const SCRIPT_CIUDADES = SCRIPT_GEO;

export function renderCheckout(cierre: CierreDeLanding, producto: ProductoParaRenderizar | null | undefined, negocio: NegocioParaRenderizar | null | undefined): string {
  const wa = whatsapp(producto, negocio);
  const price = precio(producto);
  if (cierre.tipo === "contraentrega" && cierre.accion) {
    const opciones = (producto?.opciones || []).filter((o) => o?.nombre && Array.isArray(o.valores) && o.valores.length);
    const optionFields = opciones.map((o) => `<div class="field"><label>${esc(o.nombre)}${o.obligatoria ? " *" : ""}</label><select name="opcion_${esc(o.nombre)}" ${o.obligatoria ? "required" : ""}><option value="">Seleccionar…</option>${o.valores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></div>`).join("");
    return `<div class="checkout" id="pedido"><div class="head"><p class="eyebrow">Compra directa</p><h2>Pídelo desde aquí</h2><p class="lead">Completa los datos de entrega. El precio y las opciones se validan con los datos reales del producto.</p></div><div class="summary"><strong>${esc(producto?.name || "Producto")}</strong>${price ? `<div class="offer-price">${esc(price)}</div>` : ""}<div class="tiny">Pago según las condiciones de entrega del negocio.</div></div><form class="checkout-form" method="post" action="${esc(cierre.accion)}"><div class="checkout-grid">${optionFields}<div class="field"><label>Cantidad *</label><input name="cantidad" type="number" min="1" max="10" value="1" required></div><div class="field"><label>Nombre y apellido *</label><input name="nombre" autocomplete="name" required></div><div class="field"><label>Celular *</label><input name="telefono" inputmode="tel" autocomplete="tel" required></div>${/^(co|col|colombia)?$/i.test(String((cierre as any).pais || "")) ? "" : `<div class="field"><label>Documento *</label><input name="documento" inputmode="numeric" autocomplete="off" required></div>`}<div class="field field--full"><label>Dirección completa *</label><input name="direccion" autocomplete="street-address" required></div><div class="field"><label>Barrio</label><input name="barrio"></div><div class="field"><label>Departamento *</label><select name="departamento" autocomplete="address-level1" required><option value="">Selecciona…</option>${DEPARTAMENTOS_CO.map((d) => `<option>${esc(d)}</option>`).join("")}</select></div><div class="field"><label>Ciudad *</label><input name="ciudad" list="ciudades-datalist" autocomplete="address-level2" required placeholder="Elige departamento primero"><datalist id="ciudades-datalist"></datalist></div><div class="field field--full envio-transportadora" hidden></div><div class="field field--full"><label>Referencia</label><input name="referencia"></div><div class="field field--full"><label>Cupón de descuento</label><input name="cupon" autocomplete="off" placeholder="Opcional"></div></div><button class="btn btn--primary" type="submit" style="width:100%;margin-top:18px">Pedir ahora y pagar al recibir</button><p class="tiny checkout-status" aria-live="polite"></p></form>${wa ? `<p class="tiny">¿Prefieres escribir? <a href="${esc(wa)}" style="color:var(--accent);font-weight:800">WhatsApp</a></p>` : ""}</div><script>${SCRIPT_TRANSPORTADORA}</script><script>${SCRIPT_CIUDADES}</script><script>(function(){var f=document.querySelector('.checkout-form');if(!f)return;f.addEventListener('submit',async function(e){e.preventDefault();var b=f.querySelector('button'),s=f.querySelector('.checkout-status');b.disabled=true;s.textContent='Registrando tu pedido…';var d={};new FormData(f).forEach(function(v,k){d[k]=v});try{var r=await fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});var j=await r.json();if(j.ok){if(j.gracias){window.location.href=j.gracias;return;}f.innerHTML='<div class="summary"><strong>✅ ¡Felicidades! Tu pedido quedó registrado</strong><p>Pronto estaremos en contacto para confirmar la entrega.</p></div>';}else{throw new Error(j.error||'No se pudo registrar');}}catch(x){s.textContent=x.message||'No se pudo registrar';b.disabled=false;}})})();</script>`;
  }
  if (cierre.tipo === "pago") {
    const actions = [cierre.mercadopago ? btn("Pagar con MercadoPago", cierre.mercadopago) : "", cierre.paypal ? btn("Pagar con PayPal", cierre.paypal, "soft") : "", wa ? btn("Comprar por WhatsApp", wa, "soft") : ""].filter(Boolean).join("");
    if (!actions) return "";
    const cuponEndpoint = urlSegura(cierre.accion) || "";
    const precioElemento = price ? `<div class="offer-price" id="pedido-precio">${esc(price)}</div>` : "";
    const cuponForm = cuponEndpoint
      ? `<form class="coupon" aria-label="Cupón de descuento"><input name="cupon" placeholder="¿Tenés un cupón?" autocomplete="off"><button type="submit" class="btn btn--soft">Aplicar</button><p class="tiny coupon-status" aria-live="polite"></p></form>`
      : "";
    const script = cuponEndpoint
      ? `<script>(function(){var f=document.querySelector('.coupon');if(!f)return;var b=f.querySelector('button'),i=f.querySelector('input'),s=f.querySelector('.coupon-status'),box=document.querySelector('#pago-links');f.addEventListener('submit',function(e){e.preventDefault();var code=(i.value||'').trim();if(!code)return;b.disabled=true;s.textContent='Validando...';fetch(${JSON.stringify(cuponEndpoint)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code})}).then(function(r){return r.json()}).then(function(j){if(j.ok){var p=document.querySelector('#pedido-precio');if(p&&j.precioFinal!=null)p.textContent='$'+Number(j.precioFinal).toLocaleString('es-CO')+' COP';if(box&&j.links){var h='';if(j.links.mercadopago)h+='<a class="btn btn--primary" href="'+j.links.mercadopago+'">Pagar con MercadoPago</a>';if(j.links.paypal)h+='<a class="btn btn--soft" href="'+j.links.paypal+'">Pagar con PayPal</a>';if(h)box.innerHTML=h;}s.textContent=j.mensaje||('Descuento: $'+Number(j.descuento||0).toLocaleString('es-CO'));}else{s.textContent=j.motivo||j.error||'No se pudo aplicar';}b.disabled=false;}).catch(function(){s.textContent='No se pudo aplicar';b.disabled=false;});});})();</script>`
      : "";
    return `<div class="checkout" id="pedido"><p class="eyebrow">Compra</p><h2>Tu acceso empieza aquí</h2>${precioElemento}<div style="display:grid;gap:12px" id="pago-links">${actions}</div>${cuponForm}${script}</div>`;
  }
  return wa ? `<div class="checkout" id="pedido"><p class="eyebrow">Contacto</p><h2>Hablemos</h2>${btn("Escribinos por WhatsApp", wa)}</div>` : "";
}

/** "BOLSO VIAJERO TIPO MORRAL" (así llegan de Dropi/Woo) → "Bolso viajero tipo morral". */
export function tituloLegible(t: string): string {
  const s = String(t || "").trim();
  const letras = s.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
  if (letras.length < 8 || letras !== letras.toUpperCase()) return s;
  const bajo = s.toLowerCase();
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}

/**
 * Variantes estructurales por familia (2026-09-28): el molde (orden de
 * secciones y hechos del producto) no cambia; lo que cambia es el ESQUELETO
 * de hero/oferta/beneficios. `section.layout` manda; si no viene, manda la
 * familia. Así dos landings de familias distintas son dos diseños distintos,
 * no la misma plantilla repintada.
 */
type HeroV = "split" | "stack" | "bleed" | "buybox" | "offer-first" | "editorial";
type OfertaV = "card" | "split" | "minimal";
type BeneficiosV = "cards" | "numbered" | "checklist";

const HERO_POR_FAMILIA: Record<string, HeroV> = {
  premium: "stack", launch: "stack", tecnologia: "stack", gourmet: "stack", oscura: "stack",
  "respuesta-directa": "offer-first",
  dropshipping: "buybox", ecommerce: "buybox", electronica: "buybox", suplemento: "buybox",
  belleza: "bleed", fitness: "bleed", creativa: "bleed", familiar: "bleed",
  editorial: "editorial", minimal: "split", educacion: "split",
};
const HERO_ALIAS: Record<string, HeroV> = {
  hero_offer: "offer-first", hero_product_focus: "buybox", hero_gradient_product: "buybox",
  hero_center: "stack", hero_left: "split", hero_split: "split", hero_full_visual: "bleed",
  hero_editorial: "editorial", hero_dark: "stack",
  split: "split", stack: "stack", bleed: "bleed", buybox: "buybox", "offer-first": "offer-first", editorial: "editorial",
};
const OFERTA_POR_FAMILIA: Record<string, OfertaV> = {
  editorial: "split", educacion: "split", tecnologia: "split", minimal: "minimal",
};
const OFERTA_ALIAS: Record<string, OfertaV> = {
  offer_minimal: "minimal", offer_split: "split", offer_product: "split",
  offer_urgency: "card", offer_card: "card", offer_dark: "card",
  card: "card", split: "split", minimal: "minimal",
};
const BENEFICIOS_POR_FAMILIA: Record<string, BeneficiosV> = {
  fitness: "numbered", educacion: "numbered", editorial: "numbered",
  minimal: "checklist", suplemento: "checklist",
};
const BENEFICIOS_ALIAS: Record<string, BeneficiosV> = {
  benefits_numbered: "numbered", benefits_icon_grid: "cards", benefits_cards: "cards",
  benefits_editorial: "numbered", benefits_split: "checklist", benefits_visual: "cards",
  cards: "cards", numbered: "numbered", checklist: "checklist",
};

function heroDe(familia: string, layout?: string | null): HeroV {
  const l = HERO_ALIAS[String(layout || "").toLowerCase()];
  if (l) return l;
  return HERO_POR_FAMILIA[familia] || "split";
}
function ofertaDe(familia: string, layout?: string | null): OfertaV {
  const l = OFERTA_ALIAS[String(layout || "").toLowerCase()];
  if (l) return l;
  return OFERTA_POR_FAMILIA[familia] || "card";
}
function beneficiosDe(familia: string, layout?: string | null): BeneficiosV {
  const l = BENEFICIOS_ALIAS[String(layout || "").toLowerCase()];
  if (l) return l;
  return BENEFICIOS_POR_FAMILIA[familia] || "cards";
}

/* ── Composición → vocabulario que este renderer sabe dibujar ────────────
 * Los nombres de variantes de `composicion.ts` mapeados 1 a 1 a las variantes
 * que YA están implementadas (HeroV/OfertaV/BeneficiosV). Las variantes que
 * todavía no tienen dibujo propio caen a la más cercana y QUEDAN MARCADAS en
 * data-variante: así la página es coherente y el siguiente paso (los dibujos
 * nuevos) enchufa sin tocar el camino del render.
 */
const COMP_ALIAS: Record<string, Record<string, string>> = {
  hero: { split: "split", centrado: "stack", "a-sangre": "bleed", producto: "buybox", editorial: "editorial", oferta: "offer-first" },
  benefits: { bento: "cards", numerada: "numbered", checklist: "checklist", iconos: "cards", zigzag: "cards", "split-foto": "checklist" },
  offer: { "tarjeta-foto": "card", ticket: "card", banda: "card", minimal: "minimal" },
  feature: { fila: "cards", pasos: "numbered", "tarjeta-ancha": "cards" },
  logistics: { tarjetas: "cards", "iconos-fila": "cards", lista: "checklist" },
  faq: { "dos-columnas": "cards", acordeon: "cards", split: "split" },
  cta: { tarjeta: "card", banda: "card", minimal: "minimal" },
  gallery: { mosaico: "cards", carrusel: "cards", grilla: "cards" },
};

function renderHeroVariante(hv: HeroV, c: { heroTitle: string; heroSubtitle: string; heroCta: string; destino: string; wa: string; heroImage: string; heroGaleria: string[]; producto: ProductoParaRenderizar | null; fisico: boolean; tokens: any; trust: string[] }): string {
  const ojo = c.fisico ? "Compra directa" : "Acceso digital";
  const copy = `<p class="eyebrow">${ojo}</p><h1>${esc(c.heroTitle)}</h1>${c.heroSubtitle ? `<p class="lead">${esc(c.heroSubtitle)}</p>` : ""}`;
  const price = precio(c.producto) ? `<div class="hero-price">${esc(precio(c.producto))}</div>` : "";
  const actions = `<div class="actions">${btn(c.heroCta, c.destino)}${c.wa ? btn("Resolver dudas", c.wa, "soft") : ""}</div>`;
  const media = `<div class="hero-media">${heroGallery(c.heroGaleria && c.heroGaleria.length ? c.heroGaleria : (c.heroImage ? [c.heroImage] : []), c.producto?.name || c.heroTitle)}</div>`;
  if (hv === "stack") return `<section class="shell hero hero--stack"><div class="hero-copy">${copy}${price}${actions}</div>${media}</section>`;
  if (hv === "bleed" && c.heroImage) return `<section class="shell hero hero--bleed"><div class="hero-bg"><img src="${esc(c.heroImage)}" alt="${esc(c.producto?.name || c.heroTitle)}" loading="eager" decoding="async"></div><div class="hero-card">${copy}${price}${actions}</div></section>`;
  if (hv === "buybox") {
    const meta = c.trust.slice(0, 3).map((x) => `<li>${esc(String(x || "").replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\uFE0F\s]+/u, "").trim())}</li>`).join("");
    // El PRICEBOX del concepto (el de la tienda directa): precio real +, si
    // existe un precio ANTERIOR real, el tachado y el ahorro exacto. Sin
    // precioAntes cargado NADA se tacha (no se inventa el precio lista).
    const antesNum = Number((c.producto as any)?.precioAntes ?? 0);
    const precioNum = Number(c.producto?.price ?? 0);
    const ancla = antesNum > 0 && precioNum > 0 && antesNum > precioNum
      ? `<div class="price-anchor price-anchor--compact"><span class="price-old">$${esc(antesNum.toLocaleString("es-CO"))}</span><span class="price-real">${esc(precio(c.producto))}</span><span class="price-save">Ahorras $${esc(Math.round(antesNum - precioNum).toLocaleString("es-CO"))}</span></div>`
      : "";
    const buyboxPrice = precio(c.producto) ? `<div class="buybox-price">${esc(precio(c.producto))}</div>` : "";
    const panel = `<div class="buybox"><p class="eyebrow">${ojo}</p><h2>${esc(c.heroTitle)}</h2>${c.heroSubtitle ? `<p class="lead">${esc(c.heroSubtitle)}</p>` : ""}${buyboxPrice}${ancla}${btn(c.heroCta, c.destino)}${c.wa ? `<p class="tiny" style="margin:12px 0 0"><a href="${esc(c.wa)}" style="color:var(--accent);font-weight:800">Resolver dudas por WhatsApp</a></p>` : ""}${meta ? `<ul class="buybox-meta">${meta}</ul>` : ""}</div>`;
    return `<section class="shell hero hero--buybox"><div class="hero-media">${heroGallery(c.heroGaleria && c.heroGaleria.length ? c.heroGaleria : (c.heroImage ? [c.heroImage] : []), c.producto?.name || c.heroTitle)}</div>${panel}</section>`;
  }
  if (hv === "offer-first") return `<section class="shell hero hero--offerfirst"><div class="hero-copy"><p class="eyebrow">${ojo}</p>${price}${actions}<h1>${esc(c.heroTitle)}</h1>${c.heroSubtitle ? `<p class="lead">${esc(c.heroSubtitle)}</p>` : ""}</div>${media}</section>`;
  if (hv === "editorial") return `<section class="shell hero hero--edito"><div class="hero-copy">${copy}${price}${actions}</div>${media}</section>`;
  const center = c.tokens.alineacion === "centrado" ? " hero--center" : "";
  return `<section class="shell hero${center}"><div class="hero-copy">${copy}${price}${actions}</div>${media}</section>`;
}

export function renderizarLanding(opts: OpcionesDeRender): string {
  if (opts.modo === "imagenes") return renderizarLandingImagenes(opts);
  const familia = String(opts.familia || "ecommerce");
  const tokens = tokensDe(familia);
  const producto = opts.producto || null;
  const negocio = opts.negocio || null;
  const modelo = String(negocio?.modelo || "").toLowerCase();
  const fisico = /fisic|physical|dropshipping/.test(modelo);
  // ── LA COMPOSACIÓN (landing/composicion.ts) ────────────────────────────
  // El MODELO de página (el esqueleto) + la semilla eligen la VARIANTE de
  // cada bloque. Sin modelo ni semilla sale "clasica": lo ya publicado no
  // cambia solo. El tipo de negocio (dropshipping/fisico/digital/servicio)
  // decide qué modelos tienen sentido.
  const comp = elegirComposicion({
    modelo: opts.modelo,
    semilla: opts.semilla,
    familia,
    fisico,
    tipo: tipoDeNegocio(modelo, fisico),
    precio: producto?.price,
  });
  // `hidden` lo pone el editor de bloques del Landing Studio: la seccion
  // sigue guardada (se puede volver a mostrar) pero no se renderiza.
  const secciones = (Array.isArray(opts.secciones) ? opts.secciones : []).filter((s) => s && !(s as any).hidden);
  const hero = secciones.find((s) => s.type === "hero") || secciones[0] || { id: "hero", type: "hero", title: producto?.name || "Tu próximo paso", subtitle: producto?.description || "", cta: fisico ? "Pedir ahora" : "Empezar ahora" };
  const heroImage = safeImage(hero.image) || safeImage(producto?.imageUrl);
  const wa = whatsapp(producto, negocio);
  const destino = opts.cierre ? "#pedido" : (urlSegura(producto?.paymentLink) || wa || "#pedido");
  const heroTitle = tituloLegible(String(hero.title || producto?.name || ""));
  // Un hero es una promesa, no la ficha entera: se acota como el resto.
  const heroSubtitle = cortarFrase(String(hero.subtitle || producto?.description || ""), 220);
  const heroCta = String(hero.cta || (fisico ? "Pedir ahora" : "Comprar ahora"));
  const trust = (negocio?.confianza || []).filter(Boolean).slice(0, 5);
  const todasFotos = [...new Set((producto?.images || []).map(safeImage).filter(Boolean))].filter(Boolean);
  const heroExtras = todasFotos.filter((f) => f !== heroImage);
  // El hero muestra la principal + 1 extra (2 si hay 5+): el resto sigue
  // abajo (oferta, banda, galería). Con 1 foto no hay galería.
  // El bleed muestra UNA foto de fondo: no reserva extras (se perderían).
  const hv0 = heroDe(familia, (hero as any).layout);
  const nExtra = hv0 === "bleed" ? 0 : (todasFotos.length >= 5 ? 2 : (todasFotos.length >= 2 ? 1 : 0));
  const heroGaleria = heroImage ? [heroImage, ...heroExtras.slice(0, nExtra)] : [];
  const enHero = new Set(heroGaleria);
  const fotosLibres = todasFotos.filter((f) => !enHero.has(f));
  // ── La variante de CADA bloque, según la COMPOSACÍON ───────────────────
  // La sección pide la variante con `layout` (el editor); si no dijo, la que
  // la semilla eligió para este modelo. Y donde la variante pedida no existe
  // en el vocabulario del bloque, la composición devuelve la de la semilla
  // (varianteDeSeccion). Se guarda en el atributo `data-variante` del bloque:
  // así dos modelos con variantes distintas se leen distinto en el marcado,
  // y el editor ve cuál se usó.
  const BLOQUE_DE_TIPO: Record<string, BloqueId> = {
    hero: "hero", benefits: "benefits", feature: "feature", "how-it-works": "feature",
    "how_it_works": "feature", logistics: "logistics", offer: "offer", faq: "faq",
    cta: "cta", gallery: "gallery", comparison: "feature", "before-after": "feature",
  };
  const repeticiones = new Map<string, number>();
  const varianteDe = (section: SeccionParaRenderizar): { v: string; bloque: BloqueId; rep: number } => {
    const type = String(section.type || "").toLowerCase();
    const bloque: BloqueId = BLOQUE_DE_TIPO[type] || "feature";
    const rep = repeticiones.get(bloque) || 0;
    repeticiones.set(bloque, rep + 1);
    const v = varianteDeSeccion(bloque, (section as any).layout, comp, rep);
    return { v, bloque, rep };
  };
  const marcoDe = (section: SeccionParaRenderizar): string => {
    const { v, bloque } = varianteDe(section);
    return `data-bloque="${bloque}" data-variante="${esc(v)}" data-v="${esc((COMP_ALIAS[bloque] || {})[v] || v)}"`;
  };

  let featureIndex = 0;

  const header = `<header class="top"><div class="top__in"><span class="brand">${esc(negocio?.nombre || opts.nombre || producto?.name || "")}</span>${btn(heroCta, destino)}</div></header>`;
  // La variante del HERO la decide la COMPOSICION y se mapea al vocabulario
  // que el renderer SABE dibujar (los 6 nombres de composición casan 1 a 1 con
  // las HeroV): así el modelo de página cambia el hero de verdad, no solo el
  // atributo. Sin variante conocida, el de la familia (como siempre).
  const ALIAS_HERO: Record<string, HeroV> = {
    split: "split", centrado: "stack", "a-sangre": "bleed", producto: "buybox", editorial: "editorial", oferta: "offer-first", ...COMP_ALIAS.hero,
  } as Record<string, HeroV>;
  const heroVarianteComp = varianteDeSeccion("hero", (hero as any).layout, comp);
  // ── La composición solo manda si ALGUIEN la pidió ───────────────────────
  // Sin modelo ni semilla, elegirComposicion devuelve "clasica" — y su
  // variante default (split) PISA la de la familia (ecommerce → buybox):
  // las landings que ya se publicaron cambiarían de forma sin que nadie lo
  // pidiera. Con el gate, sin pedido la familia manda como siempre.
  const hayComposicionPropia = !!(String(opts.modelo || "").trim() || String(opts.semilla || "").trim());
  const hv = ((hayComposicionPropia && (ALIAS_HERO as any)[heroVarianteComp]) || heroDe(familia, (hero as any).layout)) as HeroV;
  // La clase "lx-" del MODELO sobre el hero: es lo que un modelo (tienda-directa
  // → lx-prod, advertorial → lx-edit) deja marcado para su CSS propio.
  const CLASE_DE_HERO: Record<string, string> = { producto: "lx-prod", oferta: "lx-hoffer", editorial: "lx-edit", "a-sangre": "lx-bleed", split: "lx-split", centrado: "lx-center" };
  const claseLxHero = CLASE_DE_HERO[heroVarianteComp] || "";
  const brutoHero = renderHeroVariante(hv, { heroTitle, heroSubtitle, heroCta, destino, wa, heroImage, heroGaleria, producto, fisico, tokens, trust });
  const heroHtml =
    claseLxHero && brutoHero.startsWith("<section")
      ? brutoHero.replace(/class="/i, `class="${claseLxHero} `)
      : brutoHero;
  const sinEmoji = (x: string) => String(x || "").replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\uFE0F\s]+/u, "").trim();
  const trustHtml = trust.length ? `<section class="shell"><div class="trust">${trust.map((x) => `<span>${iconoPara(x)} ${esc(sinEmoji(x))}</span>`).join("")}</div></section>` : "";
  const topbarHtml = trust.length >= 2 ? `<div class="topbar"><div class="topbar-in">${trust.slice(0, 3).map((x) => `<span>${iconoPara(x)} ${esc(sinEmoji(x))}</span>`).join("")}</div></div>` : "";
  // ── La barra de la franja (ann-bar) ────────────────────────────────────
  // La primera condición REAL del negocio (sin emoji, sin promesa):
  // "Pago contra entrega", "Envío incluido"... Lo que NO está cargado no va.
  const primeraCondiciones = sinEmoji(trust[0] || "");
  const annBarHtml = primeraCondiciones ? `<div class="ann-bar">${esc(primeraCondiciones)}</div>` : "";
  // ── El anclado de precio ───────────────────────────────────────────────
  // Con un precio ANTERIOR real (metadata.precioAntes) se muestra tachado y el
  // ahorro exacto. Sin un precio anterior que exista de verdad, NADA: no se
  // inventa con el precio × 1,45 (la regla ya corregida para el anuncio).
  const antesNum = Number((producto as any)?.precioAntes ?? 0);
  const precioNum = Number(producto?.price ?? 0);
  const precioAnchorHtml =
    antesNum > 0 && precioNum > 0 && antesNum > precioNum
      ? `<div class="price-anchor"><span class="price-real">${esc(precio(producto))}</span><span class="price-old">$${esc(antesNum.toLocaleString("es-CO"))} ${esc(producto?.currency || "COP")}</span><span class="price-save">Ahorras $${esc(Math.round(antesNum - precioNum).toLocaleString("es-CO"))}</span></div>`
      : "";

  // ── Presupuesto de fotos ─────────────────────────────────────────────
  // Cada foto lateral se usa UNA vez y nunca la del hero: antes "rotaban"
  // en círculo, así que con 1-2 fotos la misma imagen salía en el hero, la
  // oferta, el envío y el cierre (visto el 14-09-2026). Sin foto libre, el
  // bloque se dibuja sin foto; repetirla no le suma nada al que compra.
  const usadas = new Set<string>();
  const tomarFoto = () => {
    const f = fotosLibres.shift() || "";
    if (f) usadas.add(f);
    return f;
  };
  // La foto que trae la sección vale si es nueva; si es la del hero o ya se
  // usó (normalizeSections asigna reales[0] a varias), se toma otra libre.
  const fotoPara = (section: SeccionParaRenderizar) => {
    const propia = safeImage(section.image);
    if (propia && propia !== heroImage && !usadas.has(propia)) {
      usadas.add(propia);
      const i = fotosLibres.indexOf(propia);
      if (i >= 0) fotosLibres.splice(i, 1);
      return propia;
    }
    return tomarFoto();
  };

  // Marco de composición por sección (data-bloque/data-variante/data-v):
  // así dos modelos con variantes distintas se leen distinto en el marcado,
  // y el editor ve cuál se usó. Definido ANTES del map que lo usa.
  const conMarco = (html: string, section: SeccionParaRenderizar): string => {
    if (!html || !html.startsWith("<section")) return html;
    return html.replace(
      '<section class="sec"',
      `<section class="sec" ${marcoDe(section)}`,
    );
  };

  // La galería se resuelve al FINAL, con lo que sobró del presupuesto: si se
  // dibujara en su orden, se comería fotos que las secciones de abajo
  // necesitan, o repetiría las que ya se usaron arriba.
  const galerias = new Map<string, SeccionParaRenderizar>();
  const partes = secciones.filter((s) => s.type !== "hero").map((section, idx) => {
    const type = String(section.type || "").toLowerCase();
    const vacia = !section.title && !section.subtitle && !section.body && !(Array.isArray(section.images) && section.images.length);
    if (vacia && !type.includes("gallery")) return conMarco("", section) || "";
    // La variante pedida con `layout` manda, si existe en el vocabulario; si
    // no, la de la composición (elegida por la semilla del modelo) — SOLO si
    // la composición la pidió alguien: sin eso, la familia manda como siempre.
    const mv = varianteDe(section);
    if (type.includes("faq")) return conMarco(`<section class="sec"><div class="shell narrow">${renderFaq(section)}</div></section>`, section);
    if (type.includes("gallery") || type.includes("visual")) { const marca = `@@GALERIA:${idx}@@`; galerias.set(marca, section); return marca; }
    if (type.includes("benefit") || type.includes("feature")) return conMarco(`<section class="sec"><div class="shell">${renderBenefitsVariante(((hayComposicionPropia && (COMP_ALIAS.benefits as any)?.[mv.v]) || beneficiosDe(familia, (section as any).layout)) as any, section)}</div></section>`, section);
    if (["how-it-works", "how_it_works", "steps", "como-funciona", "comparison", "before-after"].some((k) => type.includes(k))) return conMarco(`<section class="sec"><div class="shell">${renderFeature(section, producto, featureIndex++, fotoPara(section))}</div></section>`, section);
    if (type.includes("logistic")) return conMarco(`<section class="sec"><div class="shell">${renderLogistica(section)}</div></section>`, section);
    if (["photo-band", "photoband", "foto-banda", "fullbleed", "full-bleed"].some((k) => type.includes(k))) { const f = fotoPara(section); const h = renderPhotoBand(f, String(section.subtitle || section.title || "")); if (h) return h; return ""; }
    if (type === "cta" || type.endsWith("-cta") || type.includes("cierre")) return conMarco(`<section class="sec"><div class="shell">${renderCierre(section, destino)}</div></section>`, section);
    if (["offer", "authority", "bundle", "guarantee"].some((k) => type.includes(k))) {
      const ov = (((hayComposicionPropia && (COMP_ALIAS.offer as any)?.[mv.v]) || ofertaDe(familia, (section as any).layout))) as OfertaV;
      return `<section class="sec">${renderOfertaVariante(ov, section, producto, destino, ov === "minimal" ? "" : fotoPara(section), heroTitle)}</section>`;
    }
    return conMarco(`<section class="sec"><div class="shell narrow"><div class="head"><p class="eyebrow">${rotulo(type)}</p><h2>${esc(section.title || "Más información")}</h2>${section.subtitle ? `<p class="lead">${esc(acotar(section.subtitle, 240))}</p>` : ""}${cuerpo(section.body)}</div></div></section>`, section);
  });
  // Una sola galería por página, con lo que quedó libre; las demás marcas
  // se borran (dos galerías con las mismas fotos es justo lo que se evita).
  let galeriaDibujada = false;
  const sectionHtml = partes.map((parte) => {
    const gal = galerias.get(parte);
    if (!gal) return parte;
    if (galeriaDibujada) return "";
    const html = renderGallery(gal, producto, fotosLibres);
    if (!html) return "";
    galeriaDibujada = true;
    fotosLibres.length = 0;
    return conMarco(`<section class="sec"><div class="shell">${html}</div></section>`, gal);
  }).join("");

  const checkoutHtml = opts.cierre ? `<section class="sec"><div class="shell narrow">${renderCheckout(opts.cierre, producto, negocio)}</div></section>` : "";
  const footer = `<footer class="footer"><div class="shell"><strong>${esc(negocio?.nombre || opts.nombre || "")}</strong>${wa ? `<p><a href="${esc(wa)}" style="color:var(--accent);font-weight:800">WhatsApp</a></p>` : ""}<p class="tiny">${fisico ? "Pedido sujeto a las condiciones de entrega del negocio." : "Compra y acceso según las condiciones del negocio."}</p></div></footer>`;
  const sticky = destino ? `<div class="sticky">${btn(heroCta + (precio(producto) ? ` · ${precio(producto)}` : ""), destino)}</div>` : "";
  const description = esc(String(producto?.description || heroSubtitle || heroTitle).replace(/\s+/g, " ").slice(0, 155));

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.nombre || heroTitle || "Landing")}</title><meta name="description" content="${description}"><meta property="og:title" content="${esc(opts.nombre || heroTitle || "Landing")}"><meta property="og:description" content="${description}">${heroImage ? `<meta property="og:image" content="${esc(heroImage)}">` : ""}<meta name="color-scheme" content="${tokens.fondos === "oscuro" ? "dark" : "light"}"><style>${cssBase(familia)}${cssComposicion()}</style></head><body>${topbarHtml}${header}${annBarHtml}<main class="lx-${comp.modelo}${comp.angosto ? " lx-angosto" : ""}" data-modelo="${comp.modelo}">${heroHtml}${precioAnchorHtml}${trustHtml}${sectionHtml}${checkoutHtml}</main>${footer}${sticky}</body></html>`;
}

/** El CSS de las piezas que la COMPOSICIÓN agrega (y de las variantes nuevas). */
function cssComposicion(): string {
  return `
.ann-bar{background:var(--accent);color:#fff;text-align:center;padding:9px var(--pad);font-size:.83rem;font-weight:800;letter-spacing:.03em}
.price-anchor{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:14px var(--pad) 6px;text-align:center}
.price-anchor--compact{justify-content:flex-start;padding:6px 0;gap:10px}
.price-real{font-size:1.6rem;font-weight:900;color:var(--text)}
.price-anchor--compact .price-real{font-size:1.25rem}
.price-old{font-size:1rem;text-decoration:line-through;color:#9CA3AF}
.price-save{font-size:.85rem;font-weight:800;color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent);padding:4px 10px;border-radius:999px}
.lx-angosto .shell,.lx-angosto .narrow{max-width:760px}
@media(max-width:820px){.price-anchor{gap:8px;font-size:.95rem}}

/* ── Las VARIANTES que cambian POSICIÓN/imagen/repetición, por CSS ──────
 * El marcado trae data-bloque + data-variante en cada sección: con esto,
 * la misma estructura se ve distinta porque la POSICIÓN cambia, que es lo
 * que el dueño pidió (variar posiciones/imágenes/repeticiones, no el
 * concepto). */
/* GALERÍA: grilla / carrusel / mosaico */
[data-variante="grilla"] .gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
[data-variante="grilla"] .gallery img{aspect-ratio:1/1;object-fit:cover;border-radius:12px;width:100%;height:100%}
[data-variante="carrusel"] .gallery{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:10px}
[data-variante="carrusel"] .gallery img{scroll-snap-align:center;flex:0 0 min(84%,340px);aspect-ratio:4/3;object-fit:cover;border-radius:12px}
[data-variante="mosaico"] .gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
[data-variante="mosaico"] .gallery img{width:100%;height:100%;object-fit:cover;border-radius:10px}
[data-variante="mosaico"] .gallery img:first-child{grid-column:span 2;grid-row:span 2;aspect-ratio:auto}
/* FAQ: acordeon / dos-columnas */
[data-variante="dos-columnas"] .faq{columns:2;column-gap:26px}
[data-variante="dos-columnas"] .faq details{break-inside:avoid;margin-bottom:10px}
@media(max-width:760px){[data-variante="dos-columnas"] .faq{columns:1}}
/* LOGÍSTICA: tarjetas / iconos-fila */
[data-variante="iconos-fila"] .strip{display:flex;flex-wrap:wrap;gap:8px}
[data-variante="iconos-fila"] .strip .it,.strip span{display:inline-flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:7px 13px;background:var(--surface)}
/* FEATURE: pasos / fila / tarjeta-ancha */
[data-variante="pasos"] .feature-copy ol,.feature-copy ol{counter-reset:p;list-style:none;padding-left:0}
[data-variante="pasos"] .feature-copy ol li{counter-increment:p;display:flex;gap:12px;align-items:flex-start;margin-bottom:12px}
[data-variante="pasos"] .feature-copy ol li:before{content:counter(p);flex:0 0 30px;height:30px;border-radius:999px;background:var(--accent);color:#fff;font-weight:900;display:grid;place-items:center;font-size:.9rem}
[data-variante="tarjeta-ancha"] .feature-media+[class],.feature-media ~ *{max-width:100%}
`;
}
