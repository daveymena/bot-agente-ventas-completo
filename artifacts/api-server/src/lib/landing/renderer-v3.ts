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

function items(body: unknown): string[] {
  return String(body ?? "")
    .split(/\n+|\s+·\s+/)
    .map((x) => x.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
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
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:${tipo.texto};font-size:clamp(16px,1.05vw,18px);line-height:${tipo.interlineado};-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.shell{width:min(100%,calc(var(--content) + 2 * var(--pad)));margin:0 auto;padding-inline:var(--pad)}.narrow{max-width:860px}.top{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid color-mix(in srgb,var(--line) 65%,transparent)}.top__in{width:min(100%,calc(var(--content) + 2 * var(--pad)));margin:auto;padding:12px var(--pad);display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{font-weight:800;letter-spacing:-.02em}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:13px 21px;border-radius:${forma.radio};font-weight:800;transition:transform .2s ease,box-shadow .2s ease,background .2s ease}.btn:hover{transform:translateY(-2px)}.btn--primary{background:var(--accent);color:var(--on-accent);box-shadow:0 12px 28px color-mix(in srgb,var(--accent) 24%,transparent)}.btn--soft{background:var(--surface);border:${forma.borde}}.hero{padding:${sectionY} 0 44px;display:grid;grid-template-columns:minmax(0,1.04fr) minmax(320px,.96fr);gap:clamp(28px,5vw,72px);align-items:center;min-height:72vh}.hero--center{display:block;max-width:1040px;margin:auto;text-align:center}.hero--center .hero-copy .actions{justify-content:center}.hero--center .hero-media{margin-top:40px}.hero--center .hero-media:before{inset:10% 4% -4% 4%}.hero-copy{text-align:${t.alineacion === "centrado" ? "center" : "left"}}.hero--center .hero-copy{text-align:center}.eyebrow{margin:0 0 12px;color:var(--accent);font-size:.7rem;font-weight:900;text-transform:uppercase;letter-spacing:.15em}.hero h1{font-family:${tipo.display};font-size:clamp(2.4rem,5.6vw,4.8rem);font-weight:${tipo.pesoDisplay};line-height:1.01;letter-spacing:${tipo.espaciadoTitulo};margin:0 0 20px}.lead{font-size:clamp(1.05rem,1.55vw,1.28rem);color:var(--muted);max-width:62ch}.hero-copy .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.hero-price,.offer-price{font-weight:900;letter-spacing:-.04em}.hero-price{font-size:clamp(1.35rem,2.2vw,1.8rem);margin-top:18px}.hero-media{position:relative}.hero-media:before{content:"";position:absolute;inset:8% -7% -7% 9%;border-radius:36px;background:color-mix(in srgb,var(--accent) 11%,transparent);z-index:-1}.hero-media figure{margin:0}.hero-media img{display:block;width:100%;max-height:690px;object-fit:cover;border-radius:${forma.radio};box-shadow:${forma.sombra}}.trust{display:flex;flex-wrap:wrap;gap:10px;padding:18px 0;border-top:${forma.borde};border-bottom:${forma.borde}}.trust span{padding:8px 12px;border-radius:999px;background:var(--surface);border:${forma.borde};font-size:.82rem;font-weight:750}.sec{padding:${sectionY} 0}.head{max-width:780px;margin-bottom:32px}.head h2{font-family:${tipo.display};font-size:clamp(2rem,4vw,3.65rem);line-height:1.04;letter-spacing:${tipo.espaciadoTitulo};margin:0 0 16px}.bento{display:grid;grid-template-columns:repeat(12,1fr);gap:16px}.bento-card{grid-column:span 4;min-height:210px;padding:28px;background:var(--surface);border:${forma.borde};border-radius:${forma.radio};box-shadow:${forma.sombra}}.bento-card:nth-child(4n){grid-column:span 6}.bento-card strong{display:block;margin:8px 0;font-size:1.08rem}.num{font-size:.72rem;color:var(--accent);font-weight:900;letter-spacing:.12em}.feature-row{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center}.feature-row:nth-child(even) .feature-media{order:2}.feature-media figure{margin:0}.feature-media img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:${forma.radio};display:block}.feature-copy ul{padding-left:20px}.gallery{display:grid;grid-template-columns:2fr 1fr 1fr;grid-auto-rows:230px;gap:12px}.gallery img{width:100%;height:100%;object-fit:cover;border-radius:${forma.radio};display:block}.gallery img:first-child{grid-row:span 2}.faq{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.faq details{background:var(--surface);border:${forma.borde};border-radius:${forma.radio};padding:20px}.faq summary{cursor:pointer;font-weight:800}.offer{display:grid;grid-template-columns:1.1fr .9fr;gap:22px}.offer-main,.offer-side,.checkout{background:var(--surface);border:${forma.borde};border-radius:calc(${forma.radio} + 8px);box-shadow:${forma.sombra}}.offer-main{padding:clamp(28px,5vw,48px);background:linear-gradient(135deg,var(--surface),color-mix(in srgb,var(--accent) 8%,var(--surface)))}.offer-side{padding:18px}.offer-side figure{margin:0;height:100%}.offer-side img{width:100%;height:100%;min-height:300px;object-fit:cover;border-radius:${forma.radio}}.offer-price{font-size:clamp(2.3rem,5vw,4.7rem);line-height:1;margin:14px 0 26px}.checkout{padding:clamp(26px,5vw,52px)}.checkout-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:flex;flex-direction:column;gap:7px}.field--full{grid-column:1/-1}.field label{font-size:.84rem;font-weight:800}.field input,.field select{width:100%;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--bg);color:var(--text);font:inherit}.summary{padding:16px;border-radius:16px;background:color-mix(in srgb,var(--accent) 8%,var(--surface));border:1px solid color-mix(in srgb,var(--accent) 25%,var(--line));margin:18px 0}.footer{padding:54px 0 112px;border-top:1px solid var(--line);color:var(--muted)}.sticky{display:none}
@media(max-width:820px){.hero{grid-template-columns:1fr;min-height:auto;padding-top:44px}.hero-media{order:-1}.hero-media img{max-height:520px}.bento-card,.bento-card:nth-child(4n){grid-column:span 6}.feature-row,.offer{grid-template-columns:1fr}.feature-row:nth-child(even) .feature-media{order:0}.faq,.checkout-grid{grid-template-columns:1fr}.field--full{grid-column:auto}.gallery{grid-template-columns:1fr 1fr;grid-auto-rows:190px}.gallery img:first-child{grid-column:span 2;grid-row:auto}.top .btn{display:none}.sticky{display:flex;position:fixed;z-index:50;left:12px;right:12px;bottom:12px;padding:8px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(16px);border:1px solid var(--line);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.18)}.sticky .btn{width:100%}.footer{padding-bottom:124px}}
@media(max-width:520px){.bento-card,.bento-card:nth-child(4n){grid-column:1/-1}.gallery{grid-template-columns:1fr}.gallery img:first-child{grid-column:auto}.hero-copy .actions{display:grid}.hero-copy .actions .btn{width:100%}.hero h1{font-size:clamp(2.5rem,12vw,4.1rem)}.sec{padding:56px 0}}
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
  return `<div class="head"><p class="eyebrow">${rotulo(section.type)}</p><h2>${esc(section.title || "Lo que cambia para ti")}</h2>${section.subtitle ? `<p class="lead">${esc(section.subtitle)}</p>` : ""}</div><div class="bento">${rows.map((row, i) => `<article class="bento-card"><span class="num">${String(i + 1).padStart(2, "0")}</span><strong>${esc(row)}</strong></article>`).join("")}</div>`;
}

function renderFeature(section: SeccionParaRenderizar, producto: ProductoParaRenderizar | null | undefined, idx: number): string {
  const src = safeImage(section.image) || safeImage(producto?.imageUrl);
  const rows = items(section.body);
  return `<div class="feature-row"><div class="feature-media">${figure(src, producto?.name || section.title || "Producto", "media-frame")}</div><div class="feature-copy"><p class="eyebrow">${section.type === "how-it-works" ? `Paso ${idx + 1}` : "Detalle"}</p><h2>${esc(section.title || "Lo importante")}</h2>${section.subtitle ? `<p class="lead">${esc(section.subtitle)}</p>` : ""}${rows.length ? `<ul>${rows.map((row) => `<li>${esc(row)}</li>`).join("")}</ul>` : section.body ? `<p>${esc(section.body)}</p>` : ""}</div></div>`;
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
    return `<div class="checkout" id="pedido"><div class="head"><p class="eyebrow">Compra directa</p><h2>Pedilo desde aquí</h2><p class="lead">Completá los datos de entrega. El precio y las opciones se validan con los datos reales del producto.</p></div><div class="summary"><strong>${esc(producto?.name || "Producto")}</strong>${price ? `<div class="offer-price">${esc(price)}</div>` : ""}<div class="tiny">Pago según las condiciones de entrega del negocio.</div></div><form class="checkout-form" method="post" action="${esc(cierre.accion)}"><div class="checkout-grid">${optionFields}<div class="field"><label>Cantidad *</label><input name="cantidad" type="number" min="1" max="10" value="1" required></div><div class="field"><label>Nombre y apellido *</label><input name="nombre" autocomplete="name" required></div><div class="field"><label>Celular *</label><input name="telefono" inputmode="tel" autocomplete="tel" required></div><div class="field"><label>Cédula *</label><input name="documento" inputmode="numeric" autocomplete="off" required></div><div class="field field--full"><label>Dirección completa *</label><input name="direccion" autocomplete="street-address" required></div><div class="field"><label>Barrio</label><input name="barrio"></div><div class="field"><label>Ciudad *</label><input name="ciudad" autocomplete="address-level2" required></div><div class="field"><label>Departamento *</label><input name="departamento" autocomplete="address-level1" required></div><div class="field field--full"><label>Referencia</label><input name="referencia"></div></div><button class="btn btn--primary" type="submit" style="width:100%;margin-top:18px">Pedir ahora y pagar al recibir</button><p class="tiny checkout-status" aria-live="polite"></p></form>${wa ? `<p class="tiny">¿Preferís escribir? <a href="${esc(wa)}" style="color:var(--accent);font-weight:800">WhatsApp</a></p>` : ""}</div><script>(function(){var f=document.querySelector('.checkout-form');if(!f)return;f.addEventListener('submit',async function(e){e.preventDefault();var b=f.querySelector('button'),s=f.querySelector('.checkout-status');b.disabled=true;s.textContent='Registrando tu pedido…';var d={};new FormData(f).forEach(function(v,k){d[k]=v});try{var r=await fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});var j=await r.json();if(j.ok){f.innerHTML='<div class="summary"><strong>✅ Pedido recibido</strong><p>Registramos tus datos. Te contactaremos para confirmar el despacho.</p></div>';}else{throw new Error(j.error||'No se pudo registrar');}}catch(x){s.textContent=x.message||'No se pudo registrar';b.disabled=false;}})})();</script>`;
  }
  if (cierre.tipo === "pago") {
    const actions = [cierre.mercadopago ? btn("Pagar con MercadoPago", cierre.mercadopago) : "", cierre.paypal ? btn("Pagar con PayPal", cierre.paypal, "soft") : "", wa ? btn("Comprar por WhatsApp", wa, "soft") : ""].filter(Boolean).join("");
    return actions ? `<div class="checkout" id="pedido"><p class="eyebrow">Compra</p><h2>Tu acceso empieza aquí</h2>${price ? `<div class="offer-price">${esc(price)}</div>` : ""}<div style="display:grid;gap:12px">${actions}</div></div>` : "";
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
  const secciones = (Array.isArray(opts.secciones) ? opts.secciones : []).filter(Boolean);
  const hero = secciones.find((s) => s.type === "hero") || secciones[0] || { id: "hero", type: "hero", title: producto?.name || "Tu próximo paso", subtitle: producto?.description || "", cta: fisico ? "Pedir ahora" : "Empezar ahora" };
  const heroImage = safeImage(hero.image) || safeImage(producto?.imageUrl);
  const wa = whatsapp(producto, negocio);
  const destino = opts.cierre ? "#pedido" : (urlSegura(producto?.paymentLink) || wa || "#pedido");
  const heroTitle = tituloLegible(String(hero.title || producto?.name || ""));
  const heroSubtitle = String(hero.subtitle || producto?.description || "");
  const heroCta = String(hero.cta || (fisico ? "Pedir ahora" : "Comprar ahora"));
  const trust = (negocio?.confianza || []).filter(Boolean).slice(0, 5);
  let featureIndex = 0;

  const header = `<header class="top"><div class="top__in"><span class="brand">${esc(negocio?.nombre || opts.nombre || producto?.name || "")}</span>${btn(heroCta, destino)}</div></header>`;
  const heroHtml = `<section class="shell hero ${tokens.alineacion === "centrado" ? "hero--center" : ""}"><div class="hero-copy"><p class="eyebrow">${fisico ? "Compra directa" : "Acceso digital"}</p><h1>${esc(heroTitle)}</h1>${heroSubtitle ? `<p class="lead">${esc(heroSubtitle)}</p>` : ""}${precio(producto) ? `<div class="hero-price">${esc(precio(producto))}</div>` : ""}<div class="actions">${btn(heroCta, destino)}${wa ? btn("Resolver dudas", wa, "soft") : ""}</div></div><div class="hero-media">${figure(heroImage, producto?.name || heroTitle, "media-frame", "eager")}</div></section>`;
  const trustHtml = trust.length ? `<section class="shell"><div class="trust">${trust.map((x) => `<span>✓ ${esc(x)}</span>`).join("")}</div></section>` : "";

  // Fotos del producto para no repetir la del hero en cada bloque lateral.
  const fotos = [...new Set([...(producto?.images || []), heroImage].map(safeImage).filter(Boolean))];
  let fotoIdx = 0;
  const fotoRotativa = () => fotos.length ? fotos[(++fotoIdx) % fotos.length] : "";

  const sectionHtml = secciones.filter((s) => s.type !== "hero").map((section) => {
    const type = String(section.type || "").toLowerCase();
    const vacia = !section.title && !section.subtitle && !section.body && !(Array.isArray(section.images) && section.images.length);
    if (vacia && !type.includes("gallery")) return "";
    if (type.includes("faq")) return `<section class="sec"><div class="shell narrow">${renderFaq(section)}</div></section>`;
    if (type.includes("gallery") || type.includes("visual")) return `<section class="sec"><div class="shell">${renderGallery(section, producto)}</div></section>`;
    if (type.includes("benefit") || type.includes("feature")) return `<section class="sec"><div class="shell">${renderBenefits(section)}</div></section>`;
    if (["how-it-works", "how_it_works", "steps", "como-funciona", "comparison", "before-after"].some((k) => type.includes(k))) return `<section class="sec"><div class="shell">${renderFeature(section, producto, featureIndex++)}</div></section>`;
    if (["offer", "cta", "logistics", "authority", "bundle", "guarantee"].some((k) => type.includes(k))) return `<section class="sec"><div class="shell offer"><div class="offer-main"><p class="eyebrow">${rotulo(type)}</p><h2>${esc(section.title || "Listo para avanzar")}</h2>${section.subtitle ? `<p class="lead">${esc(section.subtitle)}</p>` : ""}${section.body ? `<p>${esc(section.body)}</p>` : ""}${section.cta ? btn(section.cta, destino) : ""}</div><div class="offer-side">${figure(safeImage(section.image) || fotoRotativa(), producto?.name || heroTitle)}</div></div></section>`;
    return `<section class="sec"><div class="shell narrow"><div class="head"><p class="eyebrow">${rotulo(type)}</p><h2>${esc(section.title || "Más información")}</h2>${section.subtitle ? `<p class="lead">${esc(section.subtitle)}</p>` : ""}${section.body ? `<p>${esc(section.body)}</p>` : ""}</div></div></section>`;
  }).join("");

  const checkoutHtml = opts.cierre ? `<section class="sec"><div class="shell narrow">${renderCheckout(opts.cierre, producto, negocio)}</div></section>` : "";
  const footer = `<footer class="footer"><div class="shell"><strong>${esc(negocio?.nombre || opts.nombre || "")}</strong>${wa ? `<p><a href="${esc(wa)}" style="color:var(--accent);font-weight:800">WhatsApp</a></p>` : ""}<p class="tiny">${fisico ? "Pedido sujeto a las condiciones de entrega del negocio." : "Compra y acceso según las condiciones del negocio."}</p></div></footer>`;
  const sticky = destino ? `<div class="sticky">${btn(heroCta + (precio(producto) ? ` · ${precio(producto)}` : ""), destino)}</div>` : "";
  const description = esc(String(producto?.description || heroSubtitle || heroTitle).replace(/\s+/g, " ").slice(0, 155));

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.nombre || heroTitle || "Landing")}</title><meta name="description" content="${description}"><meta property="og:title" content="${esc(opts.nombre || heroTitle || "Landing")}"><meta property="og:description" content="${description}">${heroImage ? `<meta property="og:image" content="${esc(heroImage)}">` : ""}<meta name="color-scheme" content="${tokens.fondos === "oscuro" ? "dark" : "light"}"><style>${cssBase(familia)}</style></head><body>${header}<main>${heroHtml}${trustHtml}${sectionHtml}${checkoutHtml}</main>${footer}${sticky}</body></html>`;
}
