/**
 * LANDING DE IMÁGENES — render (ver plan-imagenes.ts).
 *
 * Una columna de paneles verticales, pensada para el celular (máx 520px,
 * centrada en escritorio), como las landings de imágenes de dropshipping:
 *   - panel con imagen SUBIDA → la imagen a todo el ancho (el texto ya viene
 *     adentro), con el titular como alt;
 *   - panel sin imagen → COMPUESTO con la foto real del producto y el texto
 *     encima: titular grande, tarjetas redondeadas con chulitos, sellos.
 * Al final va el mismo formulario de pedido que el resto de las landings
 * (renderCheckout), con un selector de las ofertas que definió el dueño.
 */
import { cssBase, renderCheckout, type OpcionesDeRender } from "./renderer-v3";
import type { OfertaLanding, PanelImagen } from "./plan-imagenes";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f$ = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;

/** Solo rutas propias o https: nada de javascript: ni data: en el HTML público. */
function urlSegura(u: unknown): string {
  const s = String(u || "").trim();
  if (/^\/(uploads|images|api)\//i.test(s)) return s;
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return "";
}

function whatsappDe(opts: OpcionesDeRender): string {
  const n = String(opts.negocio?.whatsapp || opts.producto?.whatsapp || "").replace(/\D/g, "");
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(`Hola, me interesa ${opts.producto?.name || "este producto"}`)}` : "";
}

const CSS = `
.li-wrap{max-width:520px;margin:0 auto;background:var(--bg,#fff)}
.li-panel{position:relative;overflow:hidden}
.li-img{display:block;width:100%;height:auto}
.li-comp{padding:28px 20px 30px;background:var(--li-fondo,#f6f7f4);text-align:center}
.li-comp:nth-child(even){background:var(--li-fondo2,#fff)}
.li-comp h2{font-size:clamp(24px,7vw,32px);line-height:1.12;margin:0 0 10px;letter-spacing:-.02em}
.li-comp .li-sub{font-size:17px;line-height:1.45;margin:0 auto 16px;max-width:30em;opacity:.85}
.li-foto{display:block;width:100%;max-height:440px;object-fit:cover;border-radius:22px;margin:14px 0;box-shadow:0 14px 34px rgba(0,0,0,.12)}
.li-cards{display:grid;gap:10px;margin:16px 0 0;padding:0;list-style:none;text-align:left}
.li-cards li{display:flex;gap:10px;align-items:flex-start;background:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 4px 14px rgba(0,0,0,.07);font-weight:600;line-height:1.35}
.li-cards li:before{content:"✓";flex:0 0 24px;height:24px;border-radius:50%;background:#1f9d55;color:#fff;display:grid;place-items:center;font-size:14px}
.li-vs{display:grid;gap:8px;margin-top:16px;text-align:left}
.li-vs div{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.li-vs span{border-radius:14px;padding:10px 12px;font-size:15px;line-height:1.3}
.li-vs .si{background:#e8f7ee;font-weight:700}.li-vs .si:before{content:"✓ ";color:#1f9d55}
.li-vs .no{background:#fbeaea;opacity:.9}.li-vs .no:before{content:"✗ ";color:#c0392b}
.li-pasos{display:grid;gap:12px;margin-top:16px;counter-reset:p;text-align:left;padding:0;list-style:none}
.li-pasos li{counter-increment:p;display:flex;gap:12px;align-items:center;background:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 4px 14px rgba(0,0,0,.07);font-weight:600}
.li-pasos li:before{content:counter(p);flex:0 0 34px;height:34px;border-radius:50%;background:var(--accent,#111);color:#fff;display:grid;place-items:center;font-weight:800}
.li-faq{margin-top:14px;text-align:left}
.li-faq details{background:#fff;border-radius:14px;padding:12px 14px;margin-bottom:8px;box-shadow:0 3px 10px rgba(0,0,0,.06)}
.li-faq summary{font-weight:700;cursor:pointer}
.li-sellos{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px}
.li-sellos span{background:#fff;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:700;box-shadow:0 3px 10px rgba(0,0,0,.08)}
.li-precio{font-size:28px;font-weight:900;margin-top:12px}
.li-ofertas{display:grid;gap:12px;margin-top:16px}
.li-oferta{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;border:2px solid transparent;border-radius:18px;padding:14px 16px;box-shadow:0 6px 18px rgba(0,0,0,.08);text-align:left;cursor:pointer;font:inherit;color:inherit;width:100%}
.li-oferta strong{font-size:17px}.li-oferta b{font-size:22px}
.li-oferta[aria-pressed="true"]{border-color:var(--accent,#111)}
.li-cta{display:inline-block;margin-top:18px;padding:15px 26px;border-radius:999px;background:var(--accent,#111);color:#fff;font-weight:800;text-decoration:none}
`;

function listaDeCartas(items: string[] | undefined): string {
  const xs = (items || []).filter(Boolean);
  return xs.length ? `<ul class="li-cards">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
}

function panelCompuesto(p: PanelImagen, foto: string, ctx: { ofertas: OfertaLanding[]; sellos: string[]; precio: string; nombre: string }): string {
  const titulo = p.clave === "portada" ? `<h1 style="font-size:clamp(28px,8vw,38px);line-height:1.08;margin:0 0 10px">${esc(p.titulo)}</h1>` : `<h2>${esc(p.titulo)}</h2>`;
  const sub = p.subtitulo ? `<p class="li-sub">${esc(p.subtitulo)}</p>` : "";
  const img = foto ? `<img class="li-foto" src="${esc(foto)}" alt="${esc(ctx.nombre)}" loading="${p.clave === "portada" ? "eager" : "lazy"}" decoding="async">` : "";
  let cuerpo = "";
  switch (p.clave) {
    case "comparativa":
      cuerpo = (p.pares || []).length
        ? `<div class="li-vs">${(p.pares || []).map((x) => `<div><span class="si">${esc(x.a)}</span><span class="no">${esc(x.b)}</span></div>`).join("")}</div>`
        : listaDeCartas(p.bullets);
      break;
    case "modo-de-uso":
      cuerpo = (p.bullets || []).length ? `<ol class="li-pasos">${(p.bullets || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : "";
      break;
    case "preguntas":
      cuerpo = (p.pares || []).length ? `<div class="li-faq">${(p.pares || []).map((x) => `<details><summary>${esc(x.a)}</summary><p>${esc(x.b)}</p></details>`).join("")}</div>` : "";
      break;
    case "ofertas":
      cuerpo = ofertasHtml(ctx.ofertas);
      break;
    default:
      cuerpo = listaDeCartas(p.bullets);
  }
  const sellos = (p.clave === "portada" || p.clave === "confianza") && ctx.sellos.length
    ? `<div class="li-sellos">${ctx.sellos.map((s) => `<span>${esc(s)}</span>`).join("")}</div>` : "";
  const precio = p.clave === "portada" && ctx.precio ? `<div class="li-precio">${esc(ctx.precio)}</div>` : "";
  const cta = p.clave === "portada" || p.clave === "cierre" ? `<a class="li-cta" href="#pedido">Pedir ahora</a>` : "";
  // En la portada, la foto va antes del subtítulo (así lo piden los hero de este estilo).
  const orden = p.clave === "portada" ? `${titulo}${img}${sub}${precio}${sellos}${cta}` : `${titulo}${sub}${img}${cuerpo}${sellos}${cta}`;
  return `<section class="li-panel li-comp" data-panel="${esc(p.clave)}">${orden}</section>`;
}

function ofertasHtml(ofertas: OfertaLanding[]): string {
  const xs = (ofertas || []).filter((o) => o && o.nombre && Number(o.precio) > 0);
  if (!xs.length) return "";
  return `<div class="li-ofertas">${xs.map((o, i) => `<button type="button" class="li-oferta" data-oferta="${i}" aria-pressed="${i === 0 ? "true" : "false"}"><strong>${esc(o.nombre)}</strong><b>${esc(f$(o.precio))}</b></button>`).join("")}</div>`;
}

export function renderizarLandingImagenes(opts: OpcionesDeRender & { ofertas?: OfertaLanding[] | null; sellos?: string[] | null }): string {
  const producto = opts.producto || null;
  const nombre = String(producto?.name || opts.nombre || "");
  const paneles = (Array.isArray(opts.secciones) ? (opts.secciones as any[]) : []).filter((p) => p && p.type === "panel" && !p.oculto) as PanelImagen[];
  const ofertas = (opts.ofertas || []).filter((o) => o && o.nombre && Number(o.precio) > 0 && Number(o.cantidad) > 0);
  const sellos = (opts.sellos || []).filter(Boolean);
  const n = Number(producto?.price ?? 0);
  const precio = ofertas[0] ? f$(ofertas[0].precio) : (n > 0 ? f$(n) : "");

  // Fotos reales del producto: cada panel compuesto usa una distinta mientras
  // alcancen; la que eligió el dueño para el panel manda.
  // Sin repetir: si el producto ya tiene sus fotos filtradas por contenido
  // (metadata.fotosUnicas, huella visual) se usan esas; cada una sale UNA vez
  // y, cuando se acaban, el panel va sin foto (antes volvía a empezar con
  // `% fotos.length` y la misma foto salía dos o tres veces).
  let meta: any = (producto as any)?.metadata;
  try { if (typeof meta === "string") meta = JSON.parse(meta); } catch { meta = null; }
  const filtradas: string[] = Array.isArray(meta?.fotosUnicas?.urls) ? meta.fotosUnicas.urls : [];
  const equivalentes: Record<string, string> = meta?.fotosUnicas?.equivalentes || {};
  const canonica = (u: string) => equivalentes[u] || u;
  const fotos = [...new Set((filtradas.length ? filtradas : [producto?.imageUrl, ...(producto?.images || [])]).map((u) => urlSegura(canonica(String(u || "")))).filter(Boolean))];
  const usadas = new Set(paneles.map((p) => urlSegura(canonica(String(p.foto || "")))).filter(Boolean));
  const libres = fotos.filter((f) => !usadas.has(f));
  const fotoPara = (p: PanelImagen) => urlSegura(p.foto) || (["portada", "solucion", "beneficios", "para-quien", "cierre"].includes(p.clave) ? libres.shift() || "" : "");

  const cuerpo = paneles.map((p) => {
    const subida = urlSegura(p.imagen);
    if (subida) {
      // La imagen ya trae el texto; las ofertas y el formulario siguen siendo HTML
      // (el precio que se cobra no puede vivir solo dentro de una foto).
      const extra = p.clave === "ofertas" ? `<div class="li-comp" style="padding-top:0">${ofertasHtml(ofertas)}</div>` : "";
      return `<section class="li-panel" data-panel="${esc(p.clave)}"><img class="li-img" src="${esc(subida)}" alt="${esc(p.titulo)}" loading="${p.clave === "portada" ? "eager" : "lazy"}" decoding="async">${extra}</section>`;
    }
    return panelCompuesto(p, fotoPara(p), { ofertas, sellos, precio, nombre });
  }).join("");

  // Formulario de siempre + la oferta elegida viaja en un campo oculto.
  let checkout = opts.cierre ? renderCheckout(opts.cierre, producto, opts.negocio) : "";
  if (checkout && ofertas.length) {
    checkout = checkout.replace('<div class="checkout-grid">', `<input type="hidden" name="oferta" value="0"><div class="field field--full"><label>Oferta</label>${ofertasHtml(ofertas)}</div><div class="checkout-grid">`);
    // La cantidad la fija la oferta: el campo libre confundiría el total.
    checkout = checkout.replace(/<div class="field"><label>Cantidad \*<\/label><input name="cantidad"[^>]*><\/div>/, "");
  }
  const wa = whatsappDe(opts);
  const script = ofertas.length
    ? `<script>(function(){var h=document.querySelector('input[name=oferta]');document.querySelectorAll('.li-oferta').forEach(function(b){b.addEventListener('click',function(){var i=b.getAttribute('data-oferta');document.querySelectorAll('.li-oferta').forEach(function(x){x.setAttribute('aria-pressed',x.getAttribute('data-oferta')===i?'true':'false')});if(h)h.value=i;var f=document.getElementById('pedido');if(f&&!f.contains(b))f.scrollIntoView({behavior:'smooth'});});});})();</script>`
    : "";
  const sticky = `<div class="sticky"><a class="btn btn--primary" href="#pedido">Pedir ahora${precio ? ` · ${esc(precio)}` : ""}</a></div>`;
  const pie = `<footer class="footer"><div class="shell"><strong>${esc(opts.negocio?.nombre || "")}</strong>${wa ? `<p><a href="${esc(wa)}" style="color:var(--accent);font-weight:800">WhatsApp</a></p>` : ""}</div></footer>`;
  const og = urlSegura(paneles.find((p) => p.clave === "portada")?.imagen) || fotos[0] || "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.nombre || nombre)}</title><meta property="og:title" content="${esc(opts.nombre || nombre)}">${og ? `<meta property="og:image" content="${esc(og)}">` : ""}<style>${cssBase("ecommerce")}${CSS}</style></head><body><main class="li-wrap">${cuerpo}${checkout ? `<section class="sec"><div class="shell narrow">${checkout}</div></section>` : ""}</main>${pie}${sticky}${script}</body></html>`;
}
