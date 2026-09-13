/**
 * LANDING RENDERER V3 — experiencia comercial, no plantilla.
 *
 * Mantiene el contrato del renderer actual, pero cambia la composición:
 * - producto primero cuando es físico/dropshipping
 * - hero editorial / ecommerce según familia
 * - tarjetas bento, gallery, feature rows, FAQ y oferta visual
 * - sticky buy bar especialmente en móvil
 * - checkout integrado al cierre existente
 * - cero dependencias externas
 * - estado de render por request; nada mutable a nivel de módulo
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

function cleanItems(body: unknown): string[] {
  return String(body ?? "")
    .split(/\n+|\s+·\s+/)
    .map((x) => x.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function waUrl(p: ProductoParaRenderizar | null | undefined, n: NegocioParaRenderizar | null | undefined): string {
  const wa = String(n?.whatsapp || p?.whatsapp || "").replace(/\D/g, "");
  return wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hola, me interesa ${p?.name || "este producto"}`)}` : "";
}

function precio(p?: ProductoParaRenderizar | null): string {
  const n = Number(p?.price ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toLocaleString("es-CO")} ${String(p?.currency || "COP").trim()}`.trim();
}

function imageUrl(value: unknown): string {
  return urlSegura(value);
}

function figura(src: string, alt: string, className = "media-frame", loading = "lazy"): string {
  if (!src) return "";
  return `<figure class="${className}"><img src="${esc(src)}" alt="${esc(alt)}" loading="${loading}" decoding="async"></figure>`;
}

function button(text: unknown, href: string, variant = "primary"): string {
  const t = String(text ?? "").trim();
  const u = urlSegura(href);
  return t && u ? `<a class="btn btn--${variant}" href="${esc(u)}">${esc(t)}</a>` : "";
}

function tokensCss(familia: string): string {
  const t = tokensDe(familia);
  return `
:root{--bg:${t.color.fondo};--surface:${t.color.superficie};--text:${t.color.texto};--muted:${t.color.textoSuave};--accent:${t.color.acento};--on-accent:${t.color.sobreAcento};--line:${t.color.linea};--radius:${t.ritmo.radio}px;--shadow:${t.ritmo.sombra};--content:${t.ritmo.anchoContenido}px;--pad:clamp(18px,4vw,42px);--section:clamp(56px,9vw,112px);--display:clamp(2.6rem,7vw,6.6rem);--headline:clamp(2rem,4vw,3.5rem);--body:clamp(1rem,1.2vw,1.16rem)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:${t.typography.bodyFamily};font-size:var(--body);line-height:1.65}body:before{content:"";display:block;height:3px;background:linear-gradient(90deg,var(--accent),transparent)}a{text-decoration:none;color:inherit}.shell{max-width:var(--content);margin:auto;padding:0 var(--pad)}.narrow{max-width:860px}.muted{color:var(--muted)}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:800;color:var(--accent);margin:0 0 12px}.serif{font-family:${t.typography.displayFamily}}h1,h2,h3,p{margin-top:0}h1{font-family:${t.typography.displayFamily};font-size:var(--display);line-height:.98;letter-spacing:-.045em;font-weight:${t.typography.pesos.titulos}}h2{font-size:var(--headline);line-height:1.03;letter-spacing:-.035em;font-weight:800}.lead{font-size:clamp(1.08rem,1.7vw,1.35rem);color:var(--muted);max-width:62ch}.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent)}.top__in{max-width:var(--content);margin:auto;padding:12px var(--pad);display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{font-weight:800;letter-spacing:-.02em}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:13px 20px;border-radius:999px;font-weight:800;transition:transform .22s ease,box-shadow .22s ease,background .22s ease}.btn:hover{transform:translateY(-2px)}.btn--primary{background:var(--accent);color:var(--on-accent);box-shadow:0 12px 28px color-mix(in srgb,var(--accent) 26%,transparent)}.btn--soft{background:var(--surface);border:1px solid var(--line)}.hero{padding:clamp(58px,8vw,110px) 0 42px;min-height:70vh;display:grid;align-items:center;gap:48px}.hero--split{grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr)}.hero--center{text-align:center;max-width:1040px;margin:auto}.hero--center .lead{margin-left:auto;margin-right:auto}.hero-copy{position:relative;z-index:2}.hero-copy .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.hero-price{font-size:clamp(1.3rem,2vw,1.75rem);font-weight:900;margin:18px 0 0}.hero-media{position:relative}.hero-media:after{content:"";position:absolute;inset:8% -8% -8% 8%;border-radius:36px;background:color-mix(in srgb,var(--accent) 14%,transparent);z-index:-1;filter:blur(2px)}.hero-media img{width:100%;max-height:680px;object-fit:cover;border-radius:28px;box-shadow:0 30px 80px rgba(0,0,0,.18)}.trust{display:flex;flex-wrap:wrap;gap:10px;padding:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.trust span{padding:8px 12px;border-radius:999px;background:var(--surface);border:1px solid var(--line);font-size:.84rem;font-weight:700}.sec{padding:var(--section) 0}.head{max-width:780px;margin-bottom:34px}.bento{display:grid;grid-template-columns:repeat(12,1fr);gap:16px}.bento-card{grid-column:span 4;background:var(--surface);border:1px solid var(--line);border-radius:calc(var(--radius) + 8px);padding:28px;min-height:210px;box-shadow:var(--shadow);position:relative;overflow:hidden}.bento-card:nth-child(4n){grid-column:span 6}.bento-card strong{display:block;font-size:1.1rem;margin-bottom:10px}.feature-row{display:grid;grid-template-columns:1fr 1fr;gap:34px;align-items:center}.feature-row:nth-child(even) .feature-media{order:-1}.feature-media img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:24px}.feature-copy{padding:10px 0}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.step{padding:26px;border-top:3px solid var(--accent);background:var(--surface);border-radius:20px}.step-n{font-size:.75rem;font-weight:900;color:var(--accent);letter-spacing:.12em}.gallery{display:grid;grid-template-columns:2fr 1fr 1fr;grid-auto-rows:220px;gap:12px}.gallery img{width:100%;height:100%;object-fit:cover;border-radius:22px}.gallery img:first-child{grid-row:span 2}.quote{font-family:${t.typography.displayFamily};font-size:clamp(1.5rem,3vw,2.5rem);line-height:1.18;max-width:820px}.faq{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.faq details{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:20px}.faq summary{font-weight:800;cursor:pointer}.offer{display:grid;grid-template-columns:1fr .8fr;gap:24px;align-items:stretch}.offer-main,.offer-side{border-radius:28px;border:1px solid var(--line);background:var(--surface);padding:clamp(26px,4vw,44px)}.offer-main{background:linear-gradient(135deg,var(--surface),color-mix(in srgb,var(--accent) 8%,var(--surface)))}.offer-price{font-size:clamp(2.3rem,5vw,4.6rem);line-height:1;font-weight:950;letter-spacing:-.055em;margin:10px 0 24px}.checkout{padding:clamp(28px,5vw,52px);border:1px solid var(--line);border-radius:32px;background:var(--surface);box-shadow:var(--shadow)}.checkout-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:flex;flex-direction:column;gap:7px}.field--full{grid-column:1/-1}.field label{font-size:.86rem;font-weight:800}.field input,.field select,.field textarea{width:100%;padding:14px 15px;border:1px solid var(--line);background:var(--bg);color:var(--text);border-radius:14px;font:inherit}.summary{padding:16px;border-radius:16px;background:color-mix(in srgb,var(--accent) 7%,var(--surface));border:1px solid color-mix(in srgb,var(--accent) 25%,var(--line));margin:16px 0}.footer{padding:52px 0 110px;border-top:1px solid var(--line);color:var(--muted)}.sticky-buy{display:none}.reveal{opacity:1;transform:none}.media-frame{margin:0}.tiny{font-size:.82rem;color:var(--muted)}@media(max-width:820px){.hero{min-height:auto;padding-top:42px}.hero--split,.feature-row,.offer{grid-template-columns:1fr}.hero-media{order:-1}.feature-row:nth-child(even) .feature-media{order:0}.bento-card,.bento-card:nth-child(4n){grid-column:span 6}.steps,.faq{grid-template-columns:1fr}.gallery{grid-template-columns:1fr 1fr;grid-auto-rows:180px}.gallery img:first-child{grid-column:span 2;grid-row:auto}.checkout-grid{grid-template-columns:1fr}.field--full{grid-column:auto}.top__in{padding-right:14px}.top .btn{display:none}.sticky-buy{display:flex;position:fixed;left:12px;right:12px;bottom:12px;z-index:40;padding:9px;border-radius:18px;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(15px);box-shadow:0 18px 60px rgba(0,0,0,.18);border:1px solid var(--line)}.sticky-buy .btn{flex:1}.footer{padding-bottom:118px}}@media(max-width:520px){.bento-card,.bento-card:nth-child(4n){grid-column:1/-1}.gallery{grid-template-columns:1fr}.gallery img:first-child{grid-column:auto}.hero-copy .actions{display:grid}.hero-copy .actions .btn{width:100%}.sec{padding:56px 0}}
@media(prefers-reduced-motion:no-preference){.reveal{animation:rise .7s cubic-bezier(.2,.8,.2,1) both}.hero-media img{animation:float 7s ease-in-out infinite}@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.btn{transition:none}.hero-media img{animation:none}}
`.trim();
}

function renderListSection(s: SeccionParaRenderizar): string {
  const items = cleanItems(s.body);
  return `<div class="head"><p class="eyebrow">${esc(s.type)}</p>${s.title ? `<h2>${esc(s.title)}</h2>` : ""}${s.subtitle ? `<p class="lead">${esc(s.subtitle)}</p>` : ""}</div><div class="bento">${items.map((x, i) => `<article class="bento-card reveal"><span class="step-n">${String(i + 1).padStart(2,"0")}</span><strong>${esc(x.split(" — ")[0])}</strong>${x.includes(" — ") ? `<p class="muted">${esc(x.split(" — ").slice(1).join(" — "))}</p>` : ""}</article>`).join("")}</div>`;
}

function renderFaq(s: SeccionParaRenderizar): string {
  const rows = cleanItems(s.body).map((x) => {
    const [q, ...a] = x.split(/\s*\|\s*/);
    return { q: q.trim(), a: a.join(" | ").trim() };
  });
  return `<div class="head"><p class="eyebrow">Preguntas frecuentes</p><h2>${esc(s.title || "Antes de comprar")}</h2>${s.subtitle ? `<p class="lead">${esc(s.subtitle)}</p>` : ""}</div><div class="faq">${rows.map((r) => `<details><summary>${esc(r.q)}</summary><p class="muted">${esc(r.a || "Estamos para ayudarte por WhatsApp.")}</p></details>`).join("")}</div>`;
}

function renderGallery(s: SeccionParaRenderizar): string {
  const imgs = (Array.isArray(s.images) ? s.images : []).map(imageUrl).filter(Boolean).slice(0,5);
  if (!imgs.length && s.image) imgs.push(imageUrl(s.image));
  if (!imgs.length) return "";
  return `<div class="head"><p class="eyebrow">Galería</p>${s.title ? `<h2>${esc(s.title)}</h2>` : ""}${s.subtitle ? `<p class="lead">${esc(s.subtitle)}</p>` : ""}</div><div class="gallery">${imgs.map((u,i)=>`<img src="${esc(u)}" alt="Producto, vista ${i+1}" loading="lazy" decoding="async">`).join("")}</div>`;
}

function renderFeature(s: SeccionParaRenderizar, p: ProductoParaRenderizar | null | undefined, index: number): string {
  const src = imageUrl(s.image) || imageUrl(p?.imageUrl);
  const items = cleanItems(s.body);
  return `<div class="feature-row"><div class="feature-media">${figura(src, p?.name || s.title || "Producto", "feature-media").replace(/^<figure class="feature-media">|<\/figure>$/g, "")}</div><div class="feature-copy"><p class="eyebrow">${String(s.type) === "how-it-works" ? `Paso ${index + 1}` : "Detalle"}</p><h2>${esc(s.title || "Lo importante")}</h2>${s.subtitle ? `<p class="lead">${esc(s.subtitle)}</p>` : ""}<ul>${items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div>`;
}

function renderCheckout(c: CierreDeLanding, p: ProductoParaRenderizar | null | undefined, n: NegocioParaRenderizar | null | undefined): string {
  if (!c) return "";
  const wa = waUrl(p, n);
  const price = precio(p);
  if (c.tipo === "contraentrega" && c.accion) {
    const opts = (p?.opciones || []).filter((o) => o?.nombre && Array.isArray(o.valores) && o.valores.length);
    const optionFields = opts.map((o) => `<div class="field"><label>${esc(o.nombre)}${o.obligatoria ? " *" : ""}</label><select name="opcion_${esc(o.nombre)}" ${o.obligatoria ? "required" : ""}><option value="">Seleccionar…</option>${o.valores.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></div>`).join("");
    return `<div class="checkout" id="pedido"><div class="head"><p class="eyebrow">Compra segura</p><h2>Recibilo en tu casa</h2><p class="lead">Completá los datos una sola vez. El pedido se registra con el negocio y se confirma por WhatsApp.</p></div><div class="summary"><strong>${esc(p?.name || "Producto")}</strong>${price ? `<div class="offer-price">${esc(price)}</div>` : ""}<div class="tiny">Pago según las condiciones del negocio · cantidad máxima 10 unidades.</div></div><form class="checkout-form" method="post" action="${esc(c.accion)}"><div class="checkout-grid">${optionFields}<div class="field"><label>Cantidad *</label><input name="cantidad" type="number" min="1" max="10" value="1" required></div><div class="field"><label>Nombre y apellido *</label><input name="nombre" autocomplete="name" required></div><div class="field"><label>Celular *</label><input name="telefono" inputmode="tel" autocomplete="tel" required></div><div class="field"><label>Documento *</label><input name="documento" inputmode="numeric" autocomplete="off" required></div><div class="field field--full"><label>Dirección completa *</label><input name="direccion" autocomplete="street-address" required></div><div class="field"><label>Barrio</label><input name="barrio"></div><div class="field"><label>Ciudad *</label><input name="ciudad" autocomplete="address-level2" required></div><div class="field"><label>Departamento / Estado *</label><input name="departamento" autocomplete="address-level1" required></div><div class="field field--full"><label>Referencia</label><input name="referencia" placeholder="Parque, tienda, edificio, etc."></div></div><button class="btn btn--primary" type="submit" style="width:100%;margin-top:18px">${esc(c.pago === "anticipado" ? "Continuar con mi pedido" : "Pedir ahora y pagar al recibir")}</button><p class="tiny checkout-status" aria-live="polite"></p></form>${wa ? `<p class="tiny" style="margin-top:18px">¿Preferís hacerlo por chat? <a href="${esc(wa)}" style="font-weight:800;color:var(--accent)">Escribinos por WhatsApp</a></p>` : ""}</div><script>(function(){var f=document.querySelector('.checkout-form');if(!f)return;f.addEventListener('submit',async function(e){e.preventDefault();var b=f.querySelector('button'),s=f.querySelector('.checkout-status');b.disabled=true;s.textContent='Registrando tu pedido…';var d={};new FormData(f).forEach(function(v,k){d[k]=v});var r=await fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(function(){return null});var j=r?await r.json().catch(function(){return null}):null;if(j&&j.ok){f.innerHTML='<div class="summary"><strong>✅ Pedido recibido</strong><p>Ya registramos tu solicitud y te contactamos para confirmar el despacho.</p></div>'}else{s.textContent=(j&&j.error)||'No pudimos registrar el pedido. Probá de nuevo o escribinos por WhatsApp.';b.disabled=false}})})();</script>`;
  }
  if (c.tipo === "pago") {
    const buttons = [c.mercadopago ? button("Pagar con MercadoPago", c.mercadopago) : "", c.paypal ? button("Pagar con PayPal", c.paypal, "soft") : "", wa ? button("Comprar por WhatsApp", wa, "soft") : ""].filter(Boolean).join("");
    if (!buttons) return "";
    return `<div class="checkout" id="pedido"><p class="eyebrow">Compra</p><h2>Tu acceso empieza aquí</h2>${price ? `<div class="offer-price">${esc(price)}</div>` : ""}<div style="display:grid;gap:12px">${buttons}</div></div>`;
  }
  return wa ? `<div class="checkout" id="pedido"><p class="eyebrow">Contacto</p><h2>Hablemos por WhatsApp</h2><a class="btn btn--primary" href="${esc(wa)}">Escribinos por WhatsApp</a></div>` : "";
}

export function renderizarLanding(opts: OpcionesDeRender): string {
  const familia = String(opts.familia || "ecommerce");
  const t = tokensDe(familia);
  const p = opts.producto || null;
  const n = opts.negocio || null;
  const sections = (Array.isArray(opts.secciones) ? opts.secciones : []).filter((s) => s && (s.title || s.subtitle || s.body || s.image || (s.images || []).length));
  const isPhysical = /fisic|physical|dropshipping/i.test(String(n?.modelo || ""));
  const src = imageUrl(p?.imageUrl) || imageUrl(sections.find(s => s.type === "hero")?.image);
  const href = opts.cierre?.tipo === "contraentrega" || opts.cierre?.tipo === "pago" || opts.cierre?.tipo === "whatsapp" ? "#pedido" : (urlSegura(p?.paymentLink) || waUrl(p,n));
  const hero = sections.find(s => s.type === "hero") || sections[0] || { id:"hero", type:"hero", title:p?.name || "Una mejor forma de empezar", subtitle:p?.description || "", cta:"Quiero comprar" };
  const title = String(hero.title || p?.name || "Landing");
  const lead = String(hero.subtitle || p?.description || "").trim();
  const heroCta = String(hero.cta || (isPhysical ? "Pedir ahora" : "Empezar ahora"));
  const header = `<header class="top"><div class="top__in"><span class="brand">${esc(n?.nombre || opts.nombre || p?.name || "")}</span>${href ? button(heroCta, href, "primary") : ""}</div></header>`;
  const trust = (n?.confianza || []).filter(Boolean).slice(0,5);
  let featureIndex = 0;
  const body = `<main><section class="shell hero ${t.alineacion === "centro" ? "hero--center" : "hero--split"}"><div class="hero-copy reveal"><p class="eyebrow">${isPhysical ? "Compra directa" : "Acceso digital"}</p><h1>${esc(title)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ""}${priceBlock(p)}<div class="actions">${button(heroCta, href || "#pedido", "primary")}${waUrl(p,n) ? button("Resolver dudas", waUrl(p,n), "soft") : ""}</div></div><div class="hero-media reveal">${figura(src, p?.name || title, "hero-media", "eager")}</div></section>${trust.length ? `<section class="shell"><div class="trust">${trust.map(x=>`<span>✓ ${esc(x)}</span>`).join("")}</div></section>` : ""}${sections.filter(s=>s.type!=="hero").map((s, idx) => { const type=String(s.type||"").toLowerCase(); if (type.includes("faq")) return `<section class="sec"><div class="shell narrow">${renderFaq(s)}</div></section>`; if (type.includes("gallery") || type.includes("visual")) return `<section class="sec"><div class="shell">${renderGallery(s)}</div></section>`; if (["benefits","features","beneficios"].some(k=>type.includes(k))) return `<section class="sec"><div class="shell">${renderListSection(s)}</div></section>`; if (["how-it-works","how_it_works","steps","como-funciona","before-after","comparison"].some(k=>type.includes(k))) return `<section class="sec"><div class="shell">${renderFeature(s,p,featureIndex++)}</div></section>`; if (["offer","cta","logistics","authority"].some(k=>type.includes(k))) return `<section class="sec"><div class="shell offer"><div class="offer-main"><p class="eyebrow">${esc(type)}</p><h2>${esc(s.title || "Listo para dar el paso")}</h2>${s.subtitle ? `<p class="lead">${esc(s.subtitle)}</p>` : ""}${s.body ? `<p>${esc(String(s.body))}</p>` : ""}${s.cta && href ? button(s.cta, href) : ""}</div><div class="offer-side">${src ? figura(src,p?.name || title) : ""}</div></div></section>`; return `<section class="sec"><div class="shell narrow"><div class="head"><p class="eyebrow">${esc(type)}</p><h2>${esc(s.title || "Más información")}</h2>${s.subtitle ? `<p class="lead">${esc(s.subtitle)}</p>` : ""}${s.body ? `<p>${esc(String(s.body))}</p>` : ""}</div></div></section>`; }).join("")}${opts.cierre ? `<section class="sec"><div class="shell narrow">${renderCheckout(opts.cierre,p,n)}</div></section>` : ""}</main>`;
  const wa = waUrl(p,n);
  const footer = `<footer class="footer"><div class="shell"><strong>${esc(n?.nombre || opts.nombre || "")}</strong>${wa ? `<p><a href="${esc(wa)}" style="color:var(--accent);font-weight:800">WhatsApp</a></p>` : ""}<p class="tiny">${isPhysical ? "Pedido sujeto a las condiciones de entrega del negocio." : "Compra y acceso según las condiciones del negocio."}</p></div></footer>`;
  const sticky = href ? `<div class="sticky-buy">${button(heroCta + (precio(p) ? ` · ${precio(p)}` : ""), href)}</div>` : "";
  const desc = esc((p?.description || lead || title).replace(/\s+/g," ").slice(0,155));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.nombre || title)}</title><meta name="description" content="${desc}"><meta property="og:title" content="${esc(opts.nombre || title)}"><meta property="og:description" content="${desc}">${src ? `<meta property="og:image" content="${esc(src)}">` : ""}<meta name="color-scheme" content="${t.fondos === "oscuro" ? "dark" : "light"}"><style>${tokensCss(familia)}</style></head><body>${header}${body}${footer}${sticky}</body></html>`;
}

function priceBlock(p: ProductoParaRenderizar | null): string {
  const price = precio(p);
  return price ? `<div class="hero-price">${esc(price)}</div>` : "";
}
