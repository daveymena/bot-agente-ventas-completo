/**
 * Landing "PRODUCT PAGE CONTRAENTREGA" (01-10-2026).
 *
 * Modelo tomado de lo que VENDE en etapa de prueba, no de lo que se ve bonito:
 * la product page de Momo Today (Iván Caicedo, cap. 15 de su curso: "+3.000
 * unidades al mes, 1,8 M USD al año, todo con product page"; él mismo dice que
 * el embudo largo tipo GemPage no vale la pena antes de 100 pedidos al día).
 *
 * Orden, igual que la referencia, en el celular:
 *   franja "Compra segura · Pagas en casa" → galería → nombre → precio →
 *   3 checks → botón grande CONTRAENTREGA → titular en mayúsculas → bloques
 *   foto/video + beneficio numerado → características → "así es tu compra"
 *   (te confirmamos por WhatsApp, transportadoras) → preguntas → barra fija
 *   con el botón siempre a mano.
 *
 * Mejoras sobre la referencia:
 *   - El formulario se abre como hoja desde abajo (estilo Releasit) y funciona
 *     sin JavaScript (:target); el píxel lo sigue viendo (action termina en /pedido).
 *   - Nada inventado: el precio tachado y "Oferta" SOLO con un precio anterior
 *     real; los videos (los "GIF" de la referencia) SOLO si el producto los tiene;
 *     las transportadoras SOLO si vienen de Dropi. Sin estrellas ni reseñas falsas.
 *   - Cada foto una sola vez (galería arriba, el resto en los bloques).
 */
import { SCRIPT_TRANSPORTADORA } from "./renderer-v3";
import { SCRIPT_GEO, opcionesDeDepartamento } from "../geo-colombia";
import { acentoDe } from "./renderer-moderno";
import type { OpcionesPro } from "./renderer-pro";

export interface OpcionesCod extends OpcionesPro {
  /** Videos cortos del producto (mp4) que se ven como GIF. Solo reales. */
  videos?: string[];
  /** Precio anterior REAL (precio de lista). Si no es mayor que el precio, no se muestra. */
  precioAnterior?: number | null;
  /** Transportadoras reales (de Dropi) para "Enviamos con …". */
  transportadoras?: string[];
  /** Características tal cual vienen del producto. */
  caracteristicas?: string[];
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
/** Quita el emoji del inicio ("🧊 Burbuja 360°…" → "Burbuja 360°…"); el diseño pone su propio ícono. */
const sinEmoji = (t: string) => String(t || "").replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u, "").trim();

const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CASH = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const TRUCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="7" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const LOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const WA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>`;

const CSS = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;font-family:"Poppins",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#171717;background:#fff;font-size:15.5px;line-height:1.55;padding-bottom:86px}
img,video{max-width:100%;display:block}a{color:inherit}button,input,select{font:inherit;color:inherit}
.w{max-width:560px;margin:0 auto;padding:0 18px}
svg{width:20px;height:20px;flex:none}
.ann{background:var(--acc);color:#fff;text-align:center;font-size:12.5px;font-weight:600;letter-spacing:.02em;padding:8px 12px}
.hdr{background:#fff;border-bottom:1px solid #eee;position:sticky;top:0;z-index:30}
.hdr .w{height:56px;display:flex;align-items:center;justify-content:center}
.brand{font-weight:800;font-size:19px;letter-spacing:.06em;text-transform:uppercase}
.gal{margin-top:14px}
.gal-t{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:10px;scrollbar-width:none;border-radius:18px}
.gal-t::-webkit-scrollbar{display:none}
.gal-s{flex:0 0 100%;scroll-snap-align:center;aspect-ratio:1/1;border-radius:18px;overflow:hidden;background:#f4f4f5}
.gal-s img{width:100%;height:100%;object-fit:cover}
.thumbs{display:flex;gap:8px;margin-top:10px;overflow-x:auto;scrollbar-width:none}
.thumbs button{flex:0 0 64px;height:64px;border-radius:12px;border:2px solid transparent;padding:0;background:#f4f4f5 center/cover;cursor:pointer;opacity:.65}
.thumbs button[aria-current="true"]{border-color:var(--acc);opacity:1}
.name{font-size:25px;line-height:1.2;font-weight:700;margin:18px 0 8px;letter-spacing:-.01em}
.price{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:0 0 4px}
.price b{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}
.price s{color:#8a8a8a;font-size:16px}
.badge{background:var(--acc);color:#fff;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px}
.mini{display:flex;flex-wrap:wrap;gap:6px 14px;color:#525252;font-size:13px;margin:6px 0 14px}
.mini span{display:inline-flex;align-items:center;gap:6px}.mini svg{width:16px;height:16px;color:var(--acc)}
.checks{list-style:none;margin:0 0 18px;padding:0;display:grid;gap:9px}
.checks li{display:flex;gap:10px;align-items:flex-start;font-weight:500}
.checks .ck{width:22px;height:22px;border-radius:50%;background:color-mix(in srgb,var(--acc) 14%,white);color:var(--acc);display:grid;place-items:center;flex:none;margin-top:1px}
.checks .ck svg{width:14px;height:14px}
.cta{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;border:0;border-radius:14px;background:var(--acc);color:#fff;font-weight:800;font-size:17px;padding:17px 18px;text-decoration:none;cursor:pointer;box-shadow:0 12px 26px -12px color-mix(in srgb,var(--acc) 80%,transparent);animation:lat 2.6s ease-in-out infinite}
.cta small{display:block;font-weight:500;font-size:12px;opacity:.9}
.cta-wrap{text-align:center}
@keyframes lat{0%,100%{transform:scale(1)}50%{transform:scale(1.025)}}
.fine{text-align:center;color:#737373;font-size:12.5px;margin:8px 0 0}
.big{font-size:26px;line-height:1.15;font-weight:800;text-transform:uppercase;text-align:center;letter-spacing:-.01em;margin:44px 0 12px}
.big em{font-style:normal;color:var(--acc)}
.lead{text-align:center;color:#404040;margin:0 auto 22px;max-width:46ch}
.blk{margin:0 0 26px}
.blk .m{border-radius:18px;overflow:hidden;background:#f4f4f5;aspect-ratio:4/5}
.blk .m img,.blk .m video{width:100%;height:100%;object-fit:cover}
.blk h3{font-size:18px;margin:14px 0 4px;display:flex;gap:10px;align-items:baseline}
.blk h3 i{font-style:normal;color:var(--acc);font-weight:800}
.blk p{margin:0;color:#404040}
.sec-t{font-size:20px;font-weight:800;text-transform:uppercase;text-align:center;margin:40px 0 16px}
.card{background:#fafafa;border:1px solid #eee;border-radius:18px;padding:18px}
.feat{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.feat li{display:flex;gap:10px}.feat svg{color:var(--acc);width:18px;height:18px;margin-top:3px}
.buy{display:grid;gap:14px}
.buy-r{display:flex;gap:12px;align-items:flex-start}
.buy-n{width:30px;height:30px;border-radius:50%;background:var(--acc);color:#fff;font-weight:800;display:grid;place-items:center;flex:none}
.buy-r b{display:block}.buy-r div span{color:#525252;font-size:14px}
.conf{display:flex;gap:12px;align-items:center;background:#ecfdf3;border:1px solid #bbf7d0;border-radius:16px;padding:14px;margin-top:14px}
.conf svg{width:30px;height:30px;color:#16a34a}
.faq{display:grid;gap:10px}
.faq details{border:1px solid #eee;border-radius:14px;background:#fff}
.faq summary{cursor:pointer;list-style:none;padding:15px 16px;font-weight:600;display:flex;justify-content:space-between;gap:10px}
.faq summary::-webkit-details-marker{display:none}.faq summary:after{content:"+";color:var(--acc);font-weight:800}
.faq details[open] summary:after{content:"–"}.faq p{margin:0;padding:0 16px 15px;color:#525252}
.foot{margin-top:40px;padding:26px 18px;background:#171717;color:#a3a3a3;text-align:center;font-size:13px}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-top:1px solid #eee;padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px))}
.bar .w{display:flex;align-items:center;gap:12px;padding:0}
.bar b{font-size:18px;font-variant-numeric:tabular-nums;white-space:nowrap}
.bar .cta{padding:14px 16px;font-size:15.5px;animation:none}
/* Hoja del pedido (estilo Releasit): sin JS se abre con #pedido */
.sheet{position:fixed;inset:0;z-index:60;display:none;background:rgba(0,0,0,.45);align-items:flex-end;justify-content:center}
.sheet:target,.sheet.open{display:flex}
.sheet-in{background:#fff;width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:22px 22px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));animation:up .25s ease}
@keyframes up{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}
.sheet-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.sheet-h b{font-size:18px}.x{font-size:26px;line-height:1;text-decoration:none;color:#737373;padding:4px 8px}
.form{display:grid;gap:10px}
.lbl{font-weight:700;font-size:14px;margin-top:6px}
.field label{display:block;font-size:13px;font-weight:600;color:#525252;margin-bottom:4px}
.field input,.field select,.envio-transportadora select{width:100%;border:1.5px solid #e5e5e5;border-radius:12px;padding:14px;background:#fafafa;font-size:16px}
.field input:focus,.field select:focus{outline:none;border-color:var(--acc);background:#fff}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.envio-transportadora{display:grid;gap:6px}.envio-transportadora .tiny{font-size:13px;color:#525252;margin:0}
.pay{display:flex;gap:10px;align-items:center;border:2px solid var(--acc);border-radius:12px;padding:12px 14px;font-weight:600;background:color-mix(in srgb,var(--acc) 6%,white)}
.pay svg{color:var(--acc)}
.sum{background:#fafafa;border-radius:12px;padding:12px 14px;display:grid;gap:6px;font-size:14px}
.sum div{display:flex;justify-content:space-between;gap:10px}.sum .t{font-weight:800;font-size:17px;border-top:1px solid #e5e5e5;padding-top:8px}
.packs{display:grid;gap:8px}
.pack{display:flex;align-items:center;gap:12px;border:2px solid #e5e5e5;border-radius:12px;padding:12px;cursor:pointer}
.pack input{accent-color:var(--acc)}.pack:has(input:checked){border-color:var(--acc);background:color-mix(in srgb,var(--acc) 5%,white)}
.pack span{flex:1}.pack b{font-variant-numeric:tabular-nums}
@media (min-width:900px){body{padding-bottom:0}.bar{display:none}.top{display:grid;grid-template-columns:1fr 1fr;gap:40px;max-width:1080px;margin:0 auto;padding:0 24px}.top .w{max-width:none;padding:0}.name{margin-top:24px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important}}`;

export function renderizarLandingCod(o: OpcionesCod): string {
  const c = o.contenido;
  const acc = acentoDe(o.producto.categoria);
  const precio = Number(o.producto.price) || 0;
  const anterior = Number(o.precioAnterior) || 0;
  const hayOferta = anterior > precio && precio > 0;
  const marca = o.negocio.nombre || o.producto.name;
  const wa = String(o.negocio.whatsapp || "").replace(/\D/g, "");
  const ofertas = (o.ofertas || []).filter((x) => x && x.nombre && Number(x.precio) > 0 && Number(x.cantidad) > 0);
  const total = ofertas[0]?.precio ?? precio;
  const fotos = [...new Set((o.fotos || []).filter(Boolean))];
  const videos = [...new Set((o.videos || []).filter(Boolean))];
  const bens = c.beneficios.slice(0, 5);

  // Cada foto una sola vez: la galería se queda con las primeras y los
  // bloques usan los videos y las fotos que sobran (nunca la misma dos veces).
  const enBloques = videos.length ? 0 : Math.min(bens.length, Math.floor(fotos.length / 2));
  const galeria = fotos.slice(0, Math.max(1, fotos.length - enBloques));
  const sobrantes = fotos.slice(galeria.length);
  const mediaDe = (i: number): string => {
    if (videos[i]) return `<div class="m"><video src="${esc(videos[i])}" autoplay muted loop playsinline preload="metadata"></video></div>`;
    const f = videos.length ? "" : sobrantes[i];
    return f ? `<div class="m"><img src="${esc(f)}" alt="${esc(o.producto.name)}" loading="lazy" decoding="async"></div>` : "";
  };

  const caracteristicas = (o.caracteristicas || []).map(sinEmoji).filter(Boolean).slice(0, 8);
  const transp = (o.transportadoras || []).filter(Boolean).slice(0, 4);
  const opciones = (o.producto.opciones || []).filter((x) => x?.nombre && Array.isArray(x.valores) && x.valores.length);
  const camposOpciones = opciones.map((x) => `<div class="field"><label>${esc(x.nombre)}</label><select name="opcion_${esc(x.nombre)}" ${x.obligatoria ? "required" : ""}><option value="">Elige ${esc(x.nombre.toLowerCase())}</option>${x.valores.map((v) => `<option>${esc(v)}</option>`).join("")}</select></div>`).join("");
  const packs = ofertas.length > 1
    ? `<div class="lbl">Elige tu oferta</div><div class="packs">${ofertas.map((x, i) => `<label class="pack"><input type="radio" name="oferta" value="${i}" data-total="${cop(x.precio)}" ${i === 0 ? "checked" : ""}><span>${esc(x.nombre)}</span><b>${cop(x.precio)}</b></label>`).join("")}</div>`
    : ofertas.length === 1 ? `<input type="hidden" name="oferta" value="0">` : `<input type="hidden" name="cantidad" value="1">`;

  const titular = `${esc(c.titulo)} <em>${esc(c.tituloResaltado)}</em>`;
  const precioHtml = precio > 0
    ? `<div class="price"><b>${cop(precio)}</b>${hayOferta ? `<s>${cop(anterior)}</s><span class="badge">Oferta</span>` : ""}</div>`
    : "";
  const boton = (extra = "") => `<a class="cta${extra}" href="#pedido">${CASH} <span>Pagar contra entrega<small>Pagas cuando lo recibes</small></span></a>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.producto.name)} · ${esc(marca)}</title>
<meta name="description" content="${esc(c.lead)}">
${fotos[0] ? `<meta property="og:image" content="${esc(fotos[0])}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap">
<style>:root{--acc:${acc}}${CSS}</style></head>
<body>
<div class="ann">Compra segura · Pagas en casa</div>
<header class="hdr"><div class="w"><span class="brand">${esc(marca)}</span></div></header>
<main>
<div class="top">
  <div class="w">
    ${galeria.length ? `<div class="gal"><div class="gal-t" id="gt">${galeria.map((s, i) => `<div class="gal-s"><img src="${esc(s)}" alt="${esc(o.producto.name)} foto ${i + 1}"${i ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async"></div>`).join("")}</div>
    ${galeria.length > 1 ? `<div class="thumbs">${galeria.map((s, i) => `<button type="button" data-i="${i}" aria-label="Foto ${i + 1}" aria-current="${i === 0}" style="background-image:url('${esc(s)}')"></button>`).join("")}</div>` : ""}</div>` : ""}
  </div>
  <div class="w">
    <h1 class="name">${esc(o.producto.name)}</h1>
    ${precioHtml}
    <div class="mini"><span>${TRUCK}${o.plazoEntrega ? `Envío en ${esc(o.plazoEntrega)}` : "Envío a domicilio"}</span><span>${CASH}Pagas al recibir</span><span>${LOCK}Compra segura</span></div>
    <ul class="checks">${c.bullets.slice(0, 3).map((b) => `<li><span class="ck">${CHECK}</span>${esc(b)}</li>`).join("")}</ul>
    <div class="cta-wrap">${boton()}<p class="fine">Sin pagos por adelantado · Te confirmamos por WhatsApp</p></div>
  </div>
</div>

<div class="w">
  <h2 class="big">${titular}</h2>
  <p class="lead">${esc(c.lead)}</p>

  ${c.problema?.texto ? `<div class="blk">${mediaDe(0)}<h3>${esc(c.problema.titulo)}</h3><p>${esc(c.problema.texto)}</p></div>` : ""}

  <h2 class="sec-t">¿Por qué elegir ${esc(o.producto.name)}?</h2>
  ${bens.map((b, i) => `<div class="blk">${mediaDe(i + (c.problema?.texto ? 1 : 0))}<h3><i>${i + 1}.</i>${esc(b.titulo)}</h3><p>${esc(b.texto)}</p></div>`).join("")}

  <div class="cta-wrap">${boton()}</div>

  ${caracteristicas.length ? `<h2 class="sec-t">Características</h2><div class="card"><ul class="feat">${caracteristicas.map((f) => `<li>${CHECK}<span>${esc(f)}</span></li>`).join("")}</ul></div>` : ""}

  <h2 class="sec-t">Así es tu compra</h2>
  <div class="card buy">${c.pasos.slice(0, 3).map((p, i) => `<div class="buy-r"><span class="buy-n">${i + 1}</span><div><b>${esc(p.titulo)}</b><span>${esc(p.texto)}</span></div></div>`).join("")}
    ${wa ? `<div class="conf">${WA}<div><b>Te confirmamos tu pedido por WhatsApp</b><br><span>Uno de nuestros asesores te escribe antes de enviarlo.</span></div></div>` : ""}
    ${transp.length ? `<p class="fine">Enviamos con ${esc(transp.join(", "))}</p>` : ""}
  </div>

  ${c.faq.length ? `<h2 class="sec-t">Preguntas frecuentes</h2><div class="faq">${c.faq.slice(0, 5).map((f, i) => `<details${i ? "" : " open"}><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join("")}</div>` : ""}
</div>
</main>
<footer class="foot">© ${new Date().getFullYear()} ${esc(marca)}</footer>

<div class="bar"><div class="w">${precio > 0 ? `<b>${cop(precio)}</b>` : ""}${boton()}</div></div>

<div class="sheet" id="pedido" role="dialog" aria-modal="true" aria-label="Haz tu pedido"><div class="sheet-in">
  <div class="sheet-h"><b>Haz tu pedido</b><a class="x" href="#" aria-label="Cerrar">×</a></div>
  <form class="form checkout-form" method="post" action="${esc(o.accion)}">
    ${packs}${camposOpciones}
    <div class="lbl">Tus datos</div>
    <div class="field"><input name="nombre" placeholder="Nombre completo" autocomplete="name" required></div>
    <div class="field"><input name="telefono" placeholder="Celular / WhatsApp" inputmode="tel" autocomplete="tel" required></div>
    <div class="lbl">¿A dónde lo enviamos?</div>
    <div class="row2"><div class="field"><select name="departamento" autocomplete="address-level1" required aria-label="Departamento">${opcionesDeDepartamento(esc)}</select></div><div class="field"><input name="ciudad" list="ciudades-datalist" placeholder="Ciudad o municipio" autocomplete="address-level2" required></div></div>
    <datalist id="ciudades-datalist"></datalist>
    <div class="field"><input name="direccion" placeholder="Dirección (calle, carrera, número)" autocomplete="street-address" required></div>
    <div class="row2"><div class="field"><input name="barrio" placeholder="Barrio"></div><div class="field"><input name="referencia" placeholder="Referencia (opcional)"></div></div>
    <div class="envio-transportadora" hidden></div>
    <div class="pay">${CASH} Pago contra entrega: pagas al recibir</div>
    ${total > 0 ? `<div class="sum"><div><span>${esc(o.producto.name)}</span><span id="totalResumen">${cop(total)}</span></div><div><span>Envío</span><span>Se confirma por WhatsApp</span></div><div class="t"><span>Total al recibir</span><span id="total">${cop(total)}</span></div></div>` : ""}
    <button class="cta" type="submit" style="animation:none">Confirmar pedido</button>
    <p class="fine">Sin pagos por adelantado · Tus datos están protegidos</p>
  </form>
</div></div>

<script>(function(){
var t=document.getElementById('gt');if(t){var th=[].slice.call(document.querySelectorAll('.thumbs button'));t.addEventListener('scroll',function(){var i=Math.round(t.scrollLeft/t.clientWidth);th.forEach(function(b,k){b.setAttribute('aria-current',k===i)})},{passive:true});th.forEach(function(b){b.onclick=function(){t.scrollTo({left:t.clientWidth*+b.dataset.i,behavior:'smooth'})}})}
var tot=document.getElementById('total'),tr=document.getElementById('totalResumen');[].slice.call(document.querySelectorAll('input[name="oferta"]')).forEach(function(r){r.onchange=function(){if(tot)tot.textContent=r.dataset.total;if(tr)tr.textContent=r.dataset.total}});
var s=document.getElementById('pedido');if(s){s.addEventListener('click',function(e){if(e.target===s){location.hash='';}})}
})();</script>
<script>${SCRIPT_GEO}</script><script>${SCRIPT_TRANSPORTADORA}</script>
</body></html>`;
}
