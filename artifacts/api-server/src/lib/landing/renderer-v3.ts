/**
 * LANDING RENDERER V3 — composición comercial profesional.
 *
 * Un único renderer para preview, editor y publicación.
 * El diseño cambia composición y jerarquía, no solo colores.
 */
import { tokensDe, type FamiliaVisual } from "./design-system";

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
  familia: FamiliaVisual | string | null;
  producto?: ProductoParaRenderizar | null;
  negocio?: NegocioParaRenderizar | null;
  cierre?: CierreDeLanding | null;
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

function cssBase(familia: string): string {
  const t = tokensDe(familia);
  const color = t.color;
  const tipo = t.tipografia;
  const ritmo = t.ritmo;
  const forma = t.forma;
  const sectionY = ritmo.padSeccionY;
  const sectionX = ritmo.padSeccionX;
  return `
:root{--bg:${color.fondo};--surface:${color.superficie};--text:${color.texto};--muted:${color.textoSuave};--accent:${color.acento};--on-accent:${color.sobreAcento};--line:${color.borde};--content:${ritmo.anchoContenido};--section:${sectionY};--pad:${sectionX};--gap:${ritmo.separacion};--radius:${forma.radio};--shadow:${forma.sombra}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:${tipo.texto};font-size:clamp(16px,1.05vw,18px);line-height:${tipo.interlineado};-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.shell{width:min(100%,calc(var(--content) + 2 * var(--pad)));margin:0 auto;padding-inline:var(--pad)}.narrow{max-width:860px}.top{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid color-mix(in srgb,var(--line) 65%,transparent)}.top__in{width:min(100%,calc(var(--content) + 2 * var(--pad)));margin:auto;padding:12px var(--pad);display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{font-weight:800;letter-spacing:-.02em}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:13px 21px;border-radius:${forma.radio};font-weight:800;transition:transform .2s ease,box-shadow .2s ease,background .2s ease}.btn:hover{transform:translateY(-2px)}.btn--primary{background:var(--accent);color:var(--on-accent);box-shadow:0 12px 28px color-mix(in srgb,var(--accent) 24%,transparent)}.btn--soft{background:var(--surface);border:${forma.borde}}.hero{padding:${sectionY} 0 44px;display:grid;grid-template-columns:minmax(0,1.04fr) minmax(320px,.96fr);gap:clamp(28px,5vw,72px);align-items:center;min-height:72vh}.hero--center{display:block;max-width:1040px;margin:auto;text-align:center}.hero--center .hero-copy .actions{justify-content:center}.hero--center .hero-media{margin-top:40px}.hero--center .hero-media:before{inset:10% 4% -4% 4%}.hero-copy{text-align:${t.alineacion === "centrado" ? "center" : "left"}}.hero--center .hero-copy{text-align:center}.eyebrow{margin:0 0 12px;color:var(--accent);font-size:.7rem;font-weight:900;text-transform:uppercase;letter-spacing:.15em}.hero h1{font-family:${tipo.display};font-size:clamp(2.4rem,5.6vw,4.8rem);font-weight:${tipo.pesoDisplay};line-height:1.01;letter-spacing:${tipo.espaciadoTitulo};margin:0 0 20px}.lead{font-size:clamp(1.05rem,1.55vw,1.28rem);color:var(--muted);max-width:62ch}.hero-copy .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.hero-price,.offer-price{font-weight:900;letter-spacing:-.04em}.hero-price{font-size:clamp(1.35rem,2.2vw,1.8rem);margin-top:18px}.hero-media{position:relative}.hero-media:before{content:"";position:absolute;inset:8% -7% -7% 9%;border-radius:36px;background:color-mix(in srgb,var(--accent) 11%,transparent);z-index:-1}.hero-media figure{margin:0}.hero-media img{display:block;width:100%;max-height:690px;object-fit:cover;border-radius:${forma.radio};box-shadow:${forma.sombra}}.trust{display:flex;flex-wrap:wrap;gap:10px;padding:18px 0;border-top:${forma.borde};border-bottom:${forma.borde}}.trust span{padding:8px 12px;border-radius:999px;background:var(--surface);border:${forma.borde};font-size:.82rem;font-weight:750}.sec{padding:${sectionY} 0}.head{max-width:780px;margin-bottom:32px}${t.alineacion === "centrado" ? ".head{margin-inline:auto;text-align:center}.head .lead{margin-inline:auto}" : ""}.lines{list-style:none;margin:0;padding:0;display:grid;gap:10px}.lines li{position:relative;padding-left:26px}.lines li:before{content:"✓";position:absolute;left:0;top:0;color:var(--accent);font-weight:900}.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:14px}.strip article{padding:20px 22px;background:var(--surface);border:${forma.borde};border-radius:${forma.radio};font-weight:650;line-height:1.45}.strip article:before{content:"✓";display:block;color:var(--accent);font-weight:900;margin-bottom:8px}.cierre{text-align:center;max-width:760px;margin:auto;padding:clamp(28px,5vw,52px);background:linear-gradient(135deg,var(--surface),color-mix(in srgb,var(--accent) 10%,var(--surface)));border:${forma.borde};border-radius:calc(${forma.radio} + 8px);box-shadow:${forma.sombra}}.cierre .lead{margin-inline:auto}.cierre .btn{margin-top:22px}.offer--solo,.feature-row--solo{grid-template-columns:1fr}.offer--solo .offer-main{max-width:760px;margin:auto}.feature-row--solo .feature-copy{max-width:760px;margin:auto}.head h2{font-family:${tipo.display};font-size:clamp(2rem,4vw,3.65rem);line-height:1.04;letter-spacing:${tipo.espaciadoTitulo};margin:0 0 16px}.bento{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:16px}.bento-card{min-height:170px;padding:26px;background:var(--surface);border:${forma.borde};border-radius:${forma.radio};box-shadow:${forma.sombra}}.bento-card strong{display:block;margin:8px 0;font-size:1.08rem}.num{font-size:.72rem;color:var(--accent);font-weight:900;letter-spacing:.12em}.feature-row{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center}.feature-row:nth-child(even) .feature-media{order:2}.feature-media figure{margin:0}.feature-media img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:${forma.radio};display:block}.feature-copy ul{padding-left:20px}.gallery{display:grid;grid-template-columns:2fr 1fr 1fr;grid-auto-rows:230px;gap:12px}.gallery img{width:100%;height:100%;object-fit:cover;border-radius:${forma.radio};display:block}.gallery img:first-child{grid-row:span 2}.faq{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.faq details{background:var(--surface);border:${forma.borde};border-radius:${forma.radio};padding:20px}.faq summary{cursor:pointer;font-weight:800}.offer{display:grid;grid-template-columns:1.1fr .9fr;gap:22px}.offer-main,.offer-side,.checkout{background:var(--surface);border:${forma.borde};border-radius:calc(${forma.radio} + 8px);box-shadow:${forma.sombra}}.offer-main{padding:clamp(28px,5vw,48px);background:linear-gradient(135deg,var(--surface),color-mix(in srgb,var(--accent) 8%,var(--surface)))}.offer-side{padding:18px}.offer-side figure{margin:0;height:100%}.offer-side img{width:100%;height:100%;min-height:300px;object-fit:cover;border-radius:${forma.radio}}.offer-price{font-size:clamp(2.3rem,5vw,4.7rem);line-height:1;margin:14px 0 26px}.checkout{padding:clamp(26px,5vw,52px)}.checkout-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:flex;flex-direction:column;gap:7px}.field--full{grid-column:1/-1}.field label{font-size:.84rem;font-weight:800}.field input,.field select{width:100%;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--bg);color:var(--text);font:inherit}.summary{padding:16px;border-radius:16px;background:color-mix(in srgb,var(--accent) 8%,var(--surface));border:1px solid color-mix(in srgb,var(--accent) 25%,var(--line));margin:18px 0}.footer{padding:54px 0 112px;border-top:1px solid var(--line);color:var(--muted)}.sticky{display:none}.coupon{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;align-items:center}.coupon input{flex:1;min-width:180px;padding:13px 14px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);color:var(--text);font:inherit}.coupon .tiny{flex-basis:100%;margin:0}
@media(max-width:820px){.hero{grid-template-columns:1fr;min-height:auto;padding-top:44px}.hero-media{order:-1}.hero-media img{max-height:520px}.feature-row,.offer{grid-template-columns:1fr}.feature-row:nth-child(even) .feature-media{order:0}.faq,.checkout-grid{grid-template-columns:1fr}.field--full{grid-column:auto}.gallery{grid-template-columns:1fr 1fr;grid-auto-rows:190px}.gallery img:first-child{grid-column:span 2;grid-row:auto}.top .btn{display:none}.sticky{display:flex;position:fixed;z-index:50;left:12px;right:12px;bottom:12px;padding:8px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(16px);border:1px solid var(--line);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.18)}.sticky .btn{width:100%}.footer{padding-bottom:124px}}
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
  if (familia === "oscura" || familia === "electronica") return CSS_OSCURA;
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
  const rows = items(section.body);
  if (!rows.length && !section.subtitle) return "";
  return `<div class="head"><p class="eyebrow">${rotulo(section.type)}</p><h2>${esc(section.title || "Lo que cambia para ti")}</h2>${section.subtitle ? `<p class="lead">${esc(acotar(section.subtitle, 240))}</p>` : ""}</div><div class="bento">${rows.map((row, i) => `<article class="bento-card"><span class="num">${String(i + 1).padStart(2, "0")}</span><strong>${esc(row)}</strong></article>`).join("")}</div>`;
}

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
  const price = precio(producto);
  const src = foto;
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

function renderGallery(section: SeccionParaRenderizar, producto: ProductoParaRenderizar | null | undefined): string {
  const urls = (Array.isArray(section.images) ? section.images : []).map(safeImage).filter(Boolean).slice(0, 5);
  if (!urls.length && section.image) urls.push(safeImage(section.image));
  if (!urls.length && producto?.images?.length) urls.push(...producto.images.map(safeImage).filter(Boolean).slice(0, 5));
  if (!urls.length && producto?.imageUrl) urls.push(safeImage(producto.imageUrl));
  if (!urls.length) return "";
  return `<div class="head"><p class="eyebrow">Galería</p><h2>${esc(section.title || "Míralo de cerca")}</h2>${section.subtitle ? `<p class="lead">${esc(section.subtitle)}</p>` : ""}</div><div class="gallery">${urls.map((url, i) => `<img src="${esc(url)}" alt="${esc(producto?.name || "Producto")} · vista ${i + 1}" loading="lazy" decoding="async">`).join("")}</div>`;
}

function renderCheckout(cierre: CierreDeLanding, producto: ProductoParaRenderizar | null | undefined, negocio: NegocioParaRenderizar | null | undefined): string {
  const wa = whatsapp(producto, negocio);
  const price = precio(producto);
  if (cierre.tipo === "contraentrega" && cierre.accion) {
    const opciones = (producto?.opciones || []).filter((o) => o?.nombre && Array.isArray(o.valores) && o.valores.length);
    const optionFields = opciones.map((o) => `<div class="field"><label>${esc(o.nombre)}${o.obligatoria ? " *" : ""}</label><select name="opcion_${esc(o.nombre)}" ${o.obligatoria ? "required" : ""}><option value="">Seleccionar…</option>${o.valores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></div>`).join("");
    return `<div class="checkout" id="pedido"><div class="head"><p class="eyebrow">Compra directa</p><h2>Pedilo desde aquí</h2><p class="lead">Completá los datos de entrega. El precio y las opciones se validan con los datos reales del producto.</p></div><div class="summary"><strong>${esc(producto?.name || "Producto")}</strong>${price ? `<div class="offer-price">${esc(price)}</div>` : ""}<div class="tiny">Pago según las condiciones de entrega del negocio.</div></div><form class="checkout-form" method="post" action="${esc(cierre.accion)}"><div class="checkout-grid">${optionFields}<div class="field"><label>Cantidad *</label><input name="cantidad" type="number" min="1" max="10" value="1" required></div><div class="field"><label>Nombre y apellido *</label><input name="nombre" autocomplete="name" required></div><div class="field"><label>Celular *</label><input name="telefono" inputmode="tel" autocomplete="tel" required></div><div class="field"><label>Cédula *</label><input name="documento" inputmode="numeric" autocomplete="off" required></div><div class="field field--full"><label>Dirección completa *</label><input name="direccion" autocomplete="street-address" required></div><div class="field"><label>Barrio</label><input name="barrio"></div><div class="field"><label>Ciudad *</label><input name="ciudad" autocomplete="address-level2" required></div><div class="field"><label>Departamento *</label><input name="departamento" autocomplete="address-level1" required></div><div class="field field--full"><label>Referencia</label><input name="referencia"></div><div class="field field--full"><label>Cupón de descuento</label><input name="cupon" autocomplete="off" placeholder="Opcional"></div></div><button class="btn btn--primary" type="submit" style="width:100%;margin-top:18px">Pedir ahora y pagar al recibir</button><p class="tiny checkout-status" aria-live="polite"></p></form>${wa ? `<p class="tiny">¿Preferís escribir? <a href="${esc(wa)}" style="color:var(--accent);font-weight:800">WhatsApp</a></p>` : ""}</div><script>(function(){var f=document.querySelector('.checkout-form');if(!f)return;f.addEventListener('submit',async function(e){e.preventDefault();var b=f.querySelector('button'),s=f.querySelector('.checkout-status');b.disabled=true;s.textContent='Registrando tu pedido…';var d={};new FormData(f).forEach(function(v,k){d[k]=v});try{var r=await fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});var j=await r.json();if(j.ok){f.innerHTML='<div class="summary"><strong>✅ Pedido recibido</strong><p>Registramos tus datos. Te contactaremos para confirmar el despacho.</p></div>';}else{throw new Error(j.error||'No se pudo registrar');}}catch(x){s.textContent=x.message||'No se pudo registrar';b.disabled=false;}})})();</script>`;
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

export function renderizarLanding(opts: OpcionesDeRender): string {
  const familia = String(opts.familia || "ecommerce");
  const tokens = tokensDe(familia);
  const producto = opts.producto || null;
  const negocio = opts.negocio || null;
  const modelo = String(negocio?.modelo || "").toLowerCase();
  const fisico = /fisic|physical|dropshipping/.test(modelo);
  // `hidden` lo pone el editor de bloques del Landing Studio: la seccion
  // sigue guardada (se puede volver a mostrar) pero no se renderiza.
  const secciones = (Array.isArray(opts.secciones) ? opts.secciones : []).filter((s) => s && !(s as any).hidden);
  const hero = secciones.find((s) => s.type === "hero") || secciones[0] || { id: "hero", type: "hero", title: producto?.name || "Tu próximo paso", subtitle: producto?.description || "", cta: fisico ? "Pedir ahora" : "Empezar ahora" };
  const heroImage = safeImage(hero.image) || safeImage(producto?.imageUrl);
  const wa = whatsapp(producto, negocio);
  const destino = opts.cierre ? "#pedido" : (urlSegura(producto?.paymentLink) || wa || "#pedido");
  const heroTitle = tituloLegible(String(hero.title || producto?.name || ""));
  // Un hero es una promesa, no la ficha entera: se acota como el resto.
  const heroSubtitle = acotar(String(hero.subtitle || producto?.description || "").replace(/\s+/g, " "), 260);
  const heroCta = String(hero.cta || (fisico ? "Pedir ahora" : "Comprar ahora"));
  const trust = (negocio?.confianza || []).filter(Boolean).slice(0, 5);
  let featureIndex = 0;

  const header = `<header class="top"><div class="top__in"><span class="brand">${esc(negocio?.nombre || opts.nombre || producto?.name || "")}</span>${btn(heroCta, destino)}</div></header>`;
  const heroHtml = `<section class="shell hero ${tokens.alineacion === "centrado" ? "hero--center" : ""}"><div class="hero-copy"><p class="eyebrow">${fisico ? "Compra directa" : "Acceso digital"}</p><h1>${esc(heroTitle)}</h1>${heroSubtitle ? `<p class="lead">${esc(heroSubtitle)}</p>` : ""}${precio(producto) ? `<div class="hero-price">${esc(precio(producto))}</div>` : ""}<div class="actions">${btn(heroCta, destino)}${wa ? btn("Resolver dudas", wa, "soft") : ""}</div></div><div class="hero-media">${figure(heroImage, producto?.name || heroTitle, "media-frame", "eager")}</div></section>`;
  const trustHtml = trust.length ? `<section class="shell"><div class="trust">${trust.map((x) => `<span>✓ ${esc(x)}</span>`).join("")}</div></section>` : "";

  // ── Presupuesto de fotos ─────────────────────────────────────────────
  // Cada foto lateral se usa UNA vez y nunca la del hero: antes "rotaban"
  // en círculo, así que con 1-2 fotos la misma imagen salía en el hero, la
  // oferta, el envío y el cierre (visto el 14-09-2026). Sin foto libre, el
  // bloque se dibuja sin foto; repetirla no le suma nada al que compra.
  const fotosLibres = [...new Set((producto?.images || []).map(safeImage).filter(Boolean))].filter((f) => f !== heroImage);
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

  const sectionHtml = secciones.filter((s) => s.type !== "hero").map((section) => {
    const type = String(section.type || "").toLowerCase();
    const vacia = !section.title && !section.subtitle && !section.body && !(Array.isArray(section.images) && section.images.length);
    if (vacia && !type.includes("gallery")) return "";
    if (type.includes("faq")) return `<section class="sec"><div class="shell narrow">${renderFaq(section)}</div></section>`;
    if (type.includes("gallery") || type.includes("visual")) return `<section class="sec"><div class="shell">${renderGallery(section, producto)}</div></section>`;
    if (type.includes("benefit") || type.includes("feature")) return `<section class="sec"><div class="shell">${renderBenefits(section)}</div></section>`;
    if (["how-it-works", "how_it_works", "steps", "como-funciona", "comparison", "before-after"].some((k) => type.includes(k))) return `<section class="sec"><div class="shell">${renderFeature(section, producto, featureIndex++, fotoPara(section))}</div></section>`;
    if (type.includes("logistic")) return `<section class="sec"><div class="shell">${renderLogistica(section)}</div></section>`;
    if (type === "cta" || type.endsWith("-cta") || type.includes("cierre")) return `<section class="sec"><div class="shell">${renderCierre(section, destino)}</div></section>`;
    if (["offer", "authority", "bundle", "guarantee"].some((k) => type.includes(k))) return `<section class="sec">${renderOferta(section, producto, destino, fotoPara(section), heroTitle)}</section>`;
    return `<section class="sec"><div class="shell narrow"><div class="head"><p class="eyebrow">${rotulo(type)}</p><h2>${esc(section.title || "Más información")}</h2>${section.subtitle ? `<p class="lead">${esc(acotar(section.subtitle, 240))}</p>` : ""}${cuerpo(section.body)}</div></div></section>`;
  }).join("");

  const checkoutHtml = opts.cierre ? `<section class="sec"><div class="shell narrow">${renderCheckout(opts.cierre, producto, negocio)}</div></section>` : "";
  const footer = `<footer class="footer"><div class="shell"><strong>${esc(negocio?.nombre || opts.nombre || "")}</strong>${wa ? `<p><a href="${esc(wa)}" style="color:var(--accent);font-weight:800">WhatsApp</a></p>` : ""}<p class="tiny">${fisico ? "Pedido sujeto a las condiciones de entrega del negocio." : "Compra y acceso según las condiciones del negocio."}</p></div></footer>`;
  const sticky = destino ? `<div class="sticky">${btn(heroCta + (precio(producto) ? ` · ${precio(producto)}` : ""), destino)}</div>` : "";
  const description = esc(String(producto?.description || heroSubtitle || heroTitle).replace(/\s+/g, " ").slice(0, 155));

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.nombre || heroTitle || "Landing")}</title><meta name="description" content="${description}"><meta property="og:title" content="${esc(opts.nombre || heroTitle || "Landing")}"><meta property="og:description" content="${description}">${heroImage ? `<meta property="og:image" content="${esc(heroImage)}">` : ""}<meta name="color-scheme" content="${tokens.fondos === "oscuro" ? "dark" : "light"}"><style>${cssBase(familia)}</style></head><body>${header}<main>${heroHtml}${trustHtml}${sectionHtml}${checkoutHtml}</main>${footer}${sticky}</body></html>`;
}
