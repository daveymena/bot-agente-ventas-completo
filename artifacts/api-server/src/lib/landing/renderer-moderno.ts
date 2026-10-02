/**
 * Landing MODERNA — el estándar único (30-09-2026).
 *
 * Pedido del dueño: "no quiero más familias ni plantillas feas; un flujo de
 * landing moderno, un estándar, y que si se le pide cambiar el formato tenga
 * toda la capacidad". Esto es el estándar; los cambios pedidos después van por
 * el agente de edición sobre este mismo HTML (sin límites de formato).
 *
 * Dirección visual (marcas de venta directa 2025-26): tipografía grande y
 * apretada (Geist) con la palabra clave en serif cursiva (Instrument Serif),
 * blanco hueso + negro tinta + UN acento, beneficios en grilla "bento",
 * franja de confianza en movimiento, botones negros en píldora, aparición
 * suave al bajar y barra de compra fija en el celular.
 *
 * Por debajo es la misma maquinaria que ya funciona: textos del modelo
 * (contenido-pro.ts), formulario conectado a /pedido con departamento y ciudad
 * de Dropi, talla/color, transportadora, ofertas, garantía y testimonios
 * REALES, y cierre según el tipo (contraentrega / pago / WhatsApp). Nada
 * inventado: sin precio tachado, % OFF, estrellas ni "quedan N".
 */
import { SCRIPT_TRANSPORTADORA } from "./renderer-v3";
import { SCRIPT_GEO, opcionesDeDepartamento } from "../geo-colombia";
import { ICONOS, type OpcionesPro } from "./renderer-pro";

/** Un acento por rubro; el resto es neutro. */
const ACENTOS: Array<[RegExp, string]> = [
  [/salud|bienestar|belleza|cuidado|beb[eé]|maternidad/i, "#1F7A5A"],
  [/tecnolog|electr[oó]n|celular|computa|gamer|audio/i, "#2357D9"],
  [/mascota|cocina|comida|deporte|fitness/i, "#C4532B"],
  [/hogar|jard[ií]n|herramienta|organiza/i, "#5B7A1F"],
  [/moda|accesorio|ropa|bolso|joyer|reloj/i, "#8A5A2B"],
  [/curso|digital|educa|m[uú]sica/i, "#5B3FD1"],
];
export function acentoDe(categoria?: string | null): string {
  const c = String(categoria || "");
  return ACENTOS.find(([re]) => re.test(c))?.[1] || "#1F7A5A";
}

const svg = (n: string, cls = "ic") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] || ICONOS.check}</svg>`;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const CSS = `
:root{--ink:#0B0B0C;--ink2:#55555C;--mute:#8A8A90;--line:#E8E6E1;--bg:#FAFAF7;--card:#FFFFFF;--soft:#F2F1EC;
--r-xl:32px;--r-lg:24px;--r-md:18px;--r-sm:12px;--maxw:1200px;--g:clamp(18px,4vw,40px);
--sans:"Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--serif:"Instrument Serif",Georgia,serif}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;font-family:var(--sans);color:var(--ink);background:var(--bg);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased;letter-spacing:-.01em}
img{max-width:100%;display:block}button,input,select{font:inherit;color:inherit}a{color:inherit;text-decoration:none}
.wrap{max-width:var(--maxw);margin:0 auto;padding-inline:var(--g)}
.ic{width:20px;height:20px;flex:none}
h1,h2,h3{margin:0;font-weight:600;letter-spacing:-.045em;line-height:1.02;text-wrap:balance}
.serif{font-family:var(--serif);font-style:italic;font-weight:400;letter-spacing:-.02em;color:var(--acc)}
.kick{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:var(--ink2)}
.kick i{width:7px;height:7px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 4px color-mix(in srgb,var(--acc) 18%,transparent)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:0;cursor:pointer;border-radius:999px;font-weight:600;transition:transform .2s ease,background .2s,box-shadow .2s}
.btn-ink{background:var(--ink);color:#fff;padding:18px 28px;font-size:16px;box-shadow:0 10px 30px -12px rgba(11,11,12,.55)}.btn-ink:hover{transform:translateY(-2px)}
.btn-ink .ic{transition:transform .2s}.btn-ink:hover .ic{transform:translateX(3px)}
.btn-line{background:var(--card);color:var(--ink);border:1px solid var(--line);padding:16px 24px}
.btn-block{width:100%}
/* franja en movimiento */
.ticker{background:var(--ink);color:#fff;font-size:13px;overflow:hidden;white-space:nowrap}
.ticker-in{display:inline-flex;gap:40px;padding:10px 0;animation:tick 28s linear infinite}
.ticker span{display:inline-flex;align-items:center;gap:8px;opacity:.92}.ticker .ic{width:16px;height:16px;color:color-mix(in srgb,var(--acc) 55%,white)}
@keyframes tick{from{transform:translateX(0)}to{transform:translateX(-50%)}}
/* cabecera */
.hdr{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.8) blur(14px);-webkit-backdrop-filter:saturate(1.8) blur(14px);border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent)}
.hdr-in{display:flex;align-items:center;justify-content:space-between;height:62px;gap:12px}
.brand{font-weight:600;font-size:17px;letter-spacing:-.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hdr .btn-ink{padding:10px 18px;font-size:14px;box-shadow:none}
/* hero */
.hero{padding-block:clamp(20px,4vw,56px) clamp(48px,7vw,96px)}
.hero-g{display:grid;grid-template-columns:1.08fr 1fr;gap:clamp(28px,5vw,72px);align-items:start}
.gal{position:sticky;top:84px;display:grid;gap:12px;min-width:0}
.gal-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:var(--r-xl);background:#fff;aspect-ratio:1/1;scrollbar-width:none;border:1px solid var(--line)}
.gal-track::-webkit-scrollbar{display:none}.gal-slide{flex:0 0 100%;scroll-snap-align:center}.gal-slide img{width:100%;height:100%;object-fit:contain}
.gal-thumbs{display:flex;gap:10px}.gal-thumbs button{width:68px;height:68px;border-radius:14px;border:1.5px solid transparent;background:var(--soft) center/cover;cursor:pointer;opacity:.55;padding:0}
.gal-thumbs button[aria-current="true"]{opacity:1;border-color:var(--ink)}
.gal-dots{display:none}
.info{display:grid;gap:22px;align-content:start;padding-top:8px;min-width:0}
.hero h1{font-size:clamp(42px,6.2vw,78px)}
.lead{margin:0;font-size:18px;color:var(--ink2);max-width:46ch}.lead strong{color:var(--ink);font-weight:600}
.ticks{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.ticks li{display:flex;gap:12px;align-items:flex-start;font-size:16px}
.ticks .ic{width:22px;height:22px;padding:4px;border-radius:50%;background:color-mix(in srgb,var(--acc) 14%,white);color:var(--acc);stroke-width:2.6}
.buy{display:grid;gap:14px;padding-top:6px}
.price{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.price b{font-size:40px;font-weight:600;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.price span{font-size:14px;color:var(--ink2)}
.mini{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13.5px;color:var(--ink2)}.mini span{display:inline-flex;align-items:center;gap:7px}.mini .ic{width:17px;height:17px;color:var(--ink)}
/* secciones */
.sec{padding-block:clamp(64px,9vw,128px)}
.head{display:grid;gap:14px;max-width:760px;margin-bottom:clamp(32px,5vw,56px)}
.head h2{font-size:clamp(34px,5vw,60px)}.head p{margin:0;color:var(--ink2);font-size:18px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,5vw,72px);align-items:center}
.split.solo{grid-template-columns:1fr}
.ph{border-radius:var(--r-xl);overflow:hidden;aspect-ratio:4/5;background:var(--soft)}.ph img{width:100%;height:100%;object-fit:cover}
.split .head{margin:0}
/* bento */
.bento{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:26px;display:grid;gap:12px;align-content:space-between;min-height:220px;grid-column:span 2}
.tile .ib{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:color-mix(in srgb,var(--acc) 12%,white);color:var(--acc)}
.tile .ib .ic{width:22px;height:22px}
.tile h3{font-size:24px;letter-spacing:-.035em}.tile p{margin:0;color:var(--ink2);font-size:15px}
.tile.big{grid-column:span 4;background:var(--ink);color:#fff;border-color:var(--ink)}
.tile.big h3{font-size:clamp(30px,3.6vw,44px)}.tile.big p{color:#BDBDC2;font-size:17px;max-width:40ch}
.tile.big .ib{background:rgba(255,255,255,.1);color:#fff}
.tile.acc{background:color-mix(in srgb,var(--acc) 9%,white);border-color:color-mix(in srgb,var(--acc) 20%,white)}
.tile.w3{grid-column:span 3}
/* pasos */
.steps-sec{background:var(--soft)}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;list-style:none;margin:0;padding:0}
.step{background:var(--card);border-radius:var(--r-lg);padding:28px;display:grid;gap:10px;border:1px solid var(--line)}
.step .n{font-family:var(--serif);font-style:italic;font-size:56px;line-height:1;color:var(--acc)}
.step h3{font-size:22px;letter-spacing:-.03em}.step p{margin:0;color:var(--ink2)}
/* testimonios */
.quotes{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.quote{margin:0;background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:28px;display:grid;gap:18px;align-content:space-between}
.quote q{font-family:var(--serif);font-size:24px;line-height:1.25;letter-spacing:-.01em;quotes:"\\201C" "\\201D"}
.quote figcaption{font-size:14px;color:var(--ink2)}.quote b{color:var(--ink);font-weight:600}
/* pedido */
.order-sec{background:linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--acc) 7%,var(--bg)))}
.order-g{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(28px,5vw,72px);align-items:start}
.order-g .head{position:sticky;top:96px}
.card{background:var(--card);border-radius:var(--r-xl);border:1px solid var(--line);box-shadow:0 40px 80px -48px rgba(11,11,12,.35);padding:clamp(22px,3.4vw,40px);display:grid;gap:16px}
.form{display:grid;gap:12px}
.step-f{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;margin-top:8px}
.step-f i{font-style:normal;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--ink);color:#fff;font-size:12.5px}
.field input,.field select,.envio-transportadora select{width:100%;border:1px solid var(--line);border-radius:14px;padding:15px 16px;background:var(--bg);font-size:16px;transition:border-color .15s,box-shadow .15s,background .15s;appearance:none}
.field select,.envio-transportadora select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%2355555C' stroke-width='1.6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 16px center;padding-right:40px}
.field input:focus,.field select:focus{outline:none;border-color:var(--ink);background:#fff;box-shadow:0 0 0 4px rgba(11,11,12,.07)}
.field label,.envio-transportadora label{display:block;font-size:13px;font-weight:500;color:var(--ink2);margin-bottom:6px}
.envio-transportadora{display:grid;gap:6px}.envio-transportadora .tiny{font-size:13px;color:var(--ink2);margin:0}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pay-fixed{display:flex;align-items:center;gap:10px;border:1px solid var(--ink);border-radius:14px;padding:15px 16px;font-weight:500;background:#fff}
.packs{display:grid;gap:10px}
.pack{position:relative;display:flex;align-items:center;gap:14px;border:1px solid var(--line);border-radius:var(--r-md);padding:16px 18px;cursor:pointer;background:var(--bg);transition:border-color .15s,background .15s}
.pack input{position:absolute;opacity:0;pointer-events:none}
.pack .rd{width:20px;height:20px;border-radius:50%;border:1.5px solid #C9C7C0;display:grid;place-items:center;flex:none}
.pack .rd::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--ink);transform:scale(0);transition:.15s}
.pack:has(input:checked){border-color:var(--ink);background:#fff}.pack:has(input:checked) .rd{border-color:var(--ink)}.pack:has(input:checked) .rd::after{transform:scale(1)}
.pack-i{flex:1;min-width:0}.pack-i b{display:block;font-weight:600}.pack-i span{font-size:13px;color:var(--ink2)}.pack-p b{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}
.sum{border-top:1px solid var(--line);padding-top:14px;display:grid;gap:8px;font-size:14px;color:var(--ink2)}
.sum-r{display:flex;justify-content:space-between;gap:12px}.sum-r.t{font-size:18px;color:var(--ink);font-weight:600}
.fine{text-align:center;font-size:13px;color:var(--mute);margin:0}
.pays{display:grid;gap:10px}
/* faq */
.faq{display:grid;border-top:1px solid var(--line)}
.faq details{border-bottom:1px solid var(--line)}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:24px 0;font-size:19px;font-weight:500;letter-spacing:-.02em}
.faq summary::-webkit-details-marker{display:none}
.faq summary .pm{width:32px;height:32px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;flex:none;transition:transform .25s,background .2s}
.faq details[open] .pm{transform:rotate(45deg);background:var(--ink);color:#fff;border-color:var(--ink)}
.faq details p{margin:0;padding:0 0 24px;color:var(--ink2);max-width:62ch}
.guar{display:flex;gap:18px;align-items:center;border-radius:var(--r-lg);padding:22px 24px;background:var(--card);border:1px solid var(--line)}
.guar .ib{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--ink);color:#fff;flex:none}
.guar b{display:block;font-weight:600;font-size:17px}.guar span{color:var(--ink2)}
.foot{padding-block:36px 40px;color:var(--mute);font-size:13px;text-align:center}
/* barra fija + whatsapp */
.sticky{position:fixed;left:12px;right:12px;bottom:12px;z-index:50;display:none;padding:10px 10px 10px 18px;background:rgba(255,255,255,.88);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid var(--line);border-radius:999px;box-shadow:0 20px 40px -20px rgba(11,11,12,.4);transform:translateY(140%);transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.sticky.show{transform:none}.sticky-in{display:flex;align-items:center;gap:12px}.sticky b{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.sticky .btn-ink{flex:1;padding:14px 18px;font-size:15px;box-shadow:none}
.wa{position:fixed;right:22px;bottom:22px;z-index:45;width:56px;height:56px;border-radius:50%;background:#25D366;color:#fff;display:grid;place-items:center;box-shadow:0 14px 30px -10px rgba(37,211,102,.7)}.wa .ic{width:28px;height:28px}
/* aparición suave */
/* solo se oculta si el script corre (html.js): sin JS, vista previa de Facebook o un bloqueador, la página se ve entera */
.js .rv{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.8,.2,1)}.js .rv.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rv{opacity:1;transform:none}html{scroll-behavior:auto}}
/* móvil: no es el escritorio achicado */
@media (max-width:820px){
body{font-size:15.5px;padding-bottom:88px}
.hero{padding-top:0}.hero .wrap{padding-inline:0}
.hero-g{grid-template-columns:1fr;gap:0}
.gal{position:relative;top:0;padding:10px 10px 0}
.gal-track{aspect-ratio:1/1;border-radius:26px}
.gal-thumbs{display:none}
.gal-dots{display:flex;gap:6px;position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(11,11,12,.35);backdrop-filter:blur(8px);padding:6px 8px;border-radius:999px}
.gal-dots i{width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.5);transition:width .25s}.gal-dots i.on{width:18px;background:#fff}
.info{padding:22px var(--g) 0;gap:18px}
.hero h1{font-size:clamp(38px,10.5vw,48px)}.lead{font-size:16.5px}
.price b{font-size:34px}
.hero .btn-ink{width:100%}
.split,.order-g{grid-template-columns:1fr}.order-g .head{position:static}
.ph{aspect-ratio:5/4}
.bento{grid-template-columns:1fr 1fr;gap:10px}
.tile{grid-column:span 1;min-height:0;padding:20px}.tile h3{font-size:19px}
.tile.w3{grid-column:span 1}
.tile.big,.tile.solo-m{grid-column:span 2}
.steps,.quotes{grid-template-columns:1fr}
.row2{grid-template-columns:1fr}
.faq summary{font-size:17px;padding:20px 0}
.sticky{display:block}.wa{display:none}
.card{border-radius:26px}
}
`;

const SCRIPT = `(function(){
var t=document.getElementById('gtrack');if(t){var d=[].slice.call(document.querySelectorAll('#gdots i')),th=[].slice.call(document.querySelectorAll('.gal-thumbs button'));
var s=function(i){d.forEach(function(x,k){x.classList.toggle('on',k===i)});th.forEach(function(x,k){x.setAttribute('aria-current',k===i)})};
t.addEventListener('scroll',function(){s(Math.round(t.scrollLeft/t.clientWidth))},{passive:true});th.forEach(function(b){b.onclick=function(){t.scrollTo({left:t.clientWidth*+b.dataset.i,behavior:'smooth'})}});}
var tot=document.getElementById('total');[].slice.call(document.querySelectorAll('input[name="oferta"]')).forEach(function(r){r.onchange=function(){if(tot)tot.textContent=r.dataset.total;var sp=document.getElementById('stickyPrice');if(sp)sp.textContent=r.dataset.total}});
if('IntersectionObserver' in window){document.documentElement.classList.add('js');var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});[].slice.call(document.querySelectorAll('.rv')).forEach(function(el){io.observe(el)});
var st=document.getElementById('sticky'),hc=document.getElementById('heroCta'),ob=document.getElementById('pedido');if(st&&hc&&ob){var past=false,on=false,u=function(){st.classList.toggle('show',past&&!on)};
new IntersectionObserver(function(e){past=!e[0].isIntersecting&&e[0].boundingClientRect.top<0;u()}).observe(hc);new IntersectionObserver(function(e){on=e[0].isIntersecting;u()},{threshold:.12}).observe(ob);}}
else{[].slice.call(document.querySelectorAll('.rv')).forEach(function(el){el.classList.add('in')})}
})();`;

export function renderizarLandingModerna(o: OpcionesPro): string {
  const c = o.contenido;
  const acc = acentoDe(o.producto.categoria);
  const tipo = o.tipo || "fisico";
  const modo = o.modo || (o.pagoAlRecibir ? "contraentrega" : "whatsapp");
  const alRecibir = modo === "contraentrega";
  const enlaces = o.enlaces || {};
  const precio = Number(o.producto.price) || 0;
  const fotos = [...new Set(o.fotos.filter(Boolean))];
  // Cada foto una vez: con 3 o más, la última va al bloque del problema.
  const fotoProblema = fotos.length >= 3 ? fotos[fotos.length - 1] : "";
  const galeria = fotoProblema ? fotos.slice(0, -1) : fotos;
  const wa = String(o.negocio.whatsapp || "").replace(/\D/g, "");
  const ofertas = (o.ofertas || []).filter((x) => x && x.nombre && Number(x.precio) > 0 && Number(x.cantidad) > 0);
  const total = ofertas[0]?.precio ?? precio;
  const marca = o.negocio.nombre || o.producto.name;
  const img = (src: string, alt: string, eager = false) => `<img src="${esc(src)}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
  const lead = esc(c.lead).replace(esc(o.producto.name), `<strong>${esc(o.producto.name)}</strong>`);
  const testimonios = (o.testimonios || []).filter((t) => t?.nombre && t?.texto).slice(0, 3);

  // Lo que se puede afirmar, según el tipo (la franja y la línea bajo el botón).
  type Dato = [string, string];
  const datos: Dato[] = (tipo === "fisico"
    ? [
        ...(alRecibir ? [["cash", "Pagas al recibir"] as Dato] : []),
        ["truck", o.plazoEntrega ? `Envío en ${o.plazoEntrega}` : "Envío a domicilio"] as Dato,
        ...(o.garantia ? [["shield", o.garantia] as Dato] : []),
        ["lock", "Compra segura"] as Dato,
      ]
    : tipo === "digital"
      ? [["bolt", o.plazoEntrega || "Acceso después del pago"] as Dato, ["lock", "Pago seguro"] as Dato, ...(wa ? [["chat", "Soporte por WhatsApp"] as Dato] : []), ...(o.garantia ? [["shield", o.garantia] as Dato] : [])]
      : [...(wa ? [["chat", "Atención directa por WhatsApp"] as Dato] : []), ["clock", "Horario a tu medida"] as Dato, ...(o.garantia ? [["shield", o.garantia] as Dato] : [])]);
  const tick = datos.map(([i, t]) => `<span>${svg(i)}${esc(t)}</span>`).join("");

  // Beneficios en bento: el primero grande y oscuro, uno con acento.
  // Sin huecos: fila 1 = grande (4/6) + una (2/6); el resto se reparte la
  // fila 2 entera (2 → mitad y mitad, 3 → tercios). En el celular, si sobra
  // una suelta, ocupa el ancho.
  const bens = c.beneficios.slice(0, 5);
  const resto = Math.max(0, bens.length - 2);
  const bento = bens.map((b, i) => {
    const clases = ["tile", "rv"];
    if (i === 0) clases.push("big");
    if (i >= 2 && resto === 2) clases.push("w3");
    if (i === bens.length - 1 && i >= 2) clases.push("acc");
    if (i === bens.length - 1 && (bens.length - 1) % 2 === 1) clases.push("solo-m");
    return `<div class="${clases.join(" ")}"><span class="ib">${svg(b.icono)}</span><div><h3>${esc(b.titulo)}</h3><p>${esc(b.texto)}</p></div></div>`;
  }).join("");

  // ── Cierre según el modo ────────────────────────────────────────────────
  const opciones = (o.producto.opciones || []).filter((x) => x?.nombre && Array.isArray(x.valores) && x.valores.length);
  const camposOpciones = opciones.map((x) => `<div class="field"><label>${esc(x.nombre)}${x.obligatoria ? "" : " (opcional)"}</label><select name="opcion_${esc(x.nombre)}" ${x.obligatoria ? "required" : ""}><option value="">Elige ${esc(x.nombre.toLowerCase())}…</option>${x.valores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></div>`).join("");
  const packs = ofertas.length > 1
    ? `<div class="packs" role="radiogroup" aria-label="Ofertas">${ofertas.map((x, i) => `<label class="pack"><input type="radio" name="oferta" value="${i}" data-total="${cop(x.precio)}" ${i === 0 ? "checked" : ""}><span class="rd"></span><span class="pack-i"><b>${esc(x.nombre)}</b><span>${cop(x.precio / x.cantidad)} c/u</span></span><span class="pack-p"><b>${cop(x.precio)}</b></span></label>`).join("")}</div>`
    : ofertas.length === 1 ? `<input type="hidden" name="oferta" value="0">` : `<input type="hidden" name="cantidad" value="1">`;
  const resumen = total > 0
    ? `<div class="sum"><div class="sum-r"><span>${esc(o.producto.name)}${ofertas[0] ? ` · ${esc(ofertas[0].nombre)}` : ""}</span><span>${cop(total)}</span></div>${tipo === "fisico" ? `<div class="sum-r"><span>Envío</span><span>${o.plazoEntrega ? esc(o.plazoEntrega) : "Se confirma por WhatsApp"}</span></div>` : ""}<div class="sum-r t"><span>Total${alRecibir ? " al recibir" : ""}</span><span id="total">${cop(total)}</span></div></div>`
    : "";
  const waLink = (t: string) => (wa ? `https://wa.me/${wa}?text=${encodeURIComponent(t)}` : "");
  let cierre: string;
  let tituloCierre: string;
  if (modo === "contraentrega") {
    tituloCierre = ofertas.length > 1 ? "Elige tu oferta y haz tu pedido" : "Haz tu pedido";
    cierre = `<form class="form checkout-form" method="post" action="${esc(o.accion)}">
      ${packs}${camposOpciones}
      <div class="step-f"><i>1</i>Tus datos</div>
      <div class="field"><input name="nombre" placeholder="Nombre completo" autocomplete="name" required></div>
      <div class="field"><input name="telefono" placeholder="Celular / WhatsApp" inputmode="tel" autocomplete="tel" required></div>
      <div class="step-f"><i>2</i>¿A dónde lo enviamos?</div>
      <div class="row2"><div class="field"><select name="departamento" autocomplete="address-level1" required aria-label="Departamento">${opcionesDeDepartamento(esc)}</select></div><div class="field"><input name="ciudad" list="ciudades-datalist" placeholder="Ciudad o municipio" autocomplete="address-level2" required><datalist id="ciudades-datalist"></datalist></div></div>
      <div class="field"><input name="direccion" placeholder="Dirección (calle, carrera, número)" autocomplete="street-address" required></div>
      <div class="row2"><div class="field"><input name="barrio" placeholder="Barrio"></div><div class="field"><input name="referencia" placeholder="Referencia (opcional)"></div></div>
      <div class="envio-transportadora" hidden></div>
      <div class="step-f"><i>3</i>Pago</div>
      <div class="pay-fixed">${svg("cash")} Contra entrega: pagas en efectivo al recibir</div>
      ${resumen}
      <button class="btn btn-ink btn-block" type="submit">Confirmar pedido ${svg("arrow")}</button>
      <p class="fine">Sin pagos anticipados · Tus datos están protegidos</p>
    </form>`;
  } else if (modo === "pago") {
    tituloCierre = tipo === "digital" ? "Obtén tu acceso" : "Haz tu pedido";
    const botones = [
      enlaces.mercadopago ? `<a class="btn btn-ink btn-block" href="${esc(enlaces.mercadopago)}" target="_blank" rel="noopener">Pagar con MercadoPago ${svg("arrow")}</a>` : "",
      enlaces.paypal ? `<a class="btn btn-line btn-block" href="${esc(enlaces.paypal)}" target="_blank" rel="noopener">Pagar con PayPal</a>` : "",
      wa ? `<a class="btn btn-line btn-block" href="${esc(waLink(`Hola, quiero pagar ${o.producto.name} por transferencia`))}" target="_blank" rel="noopener">${svg("wa")} Pagar por transferencia</a>` : "",
    ].filter(Boolean).join("");
    cierre = `${resumen}<div class="pays">${botones || `<p class="fine">Escríbenos para coordinar el pago.</p>`}</div><p class="fine">${tipo === "digital" ? "Después del pago te enviamos el acceso" : "Te confirmamos el envío por WhatsApp"}</p>`;
  } else {
    tituloCierre = tipo === "servicio" ? "Agenda tu cita" : "Hablemos";
    cierre = `${precio > 0 ? resumen : ""}${wa ? `<a class="btn btn-ink btn-block" href="${esc(waLink(`Hola, me interesa ${o.producto.name}`))}" target="_blank" rel="noopener">${svg("wa")} ${tipo === "servicio" ? "Agendar por WhatsApp" : "Escribir por WhatsApp"}</a>` : `<p class="fine">Pronto habilitaremos el contacto.</p>`}<p class="fine">Te respondemos personalmente.</p>`;
  }
  const textoBoton = alRecibir ? "Pedir · pago al recibir" : modo === "pago" ? (tipo === "digital" ? "Comprar" : "Pedir") : tipo === "servicio" ? "Agendar" : "Escribir";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.producto.name)} · ${esc(marca)}</title>
<meta name="description" content="${esc(c.lead)}">
${galeria[0] || fotoProblema ? `<meta property="og:image" content="${esc(galeria[0] || fotoProblema)}">` : ""}
<meta property="og:title" content="${esc(c.titulo)} ${esc(c.tituloResaltado)}">
<meta name="theme-color" content="#FAFAF7">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Instrument+Serif:ital@1&display=swap">
<style>:root{--acc:${acc}}${CSS}</style></head>
<body>
<div class="ticker" aria-hidden="true"><div class="ticker-in">${tick}${tick}${tick}${tick}</div></div>
<header class="hdr"><div class="wrap hdr-in"><span class="brand">${esc(marca)}</span><a class="btn btn-ink" href="#pedido">${esc(textoBoton.split(" ·")[0])}</a></div></header>
<main>
<section class="hero"><div class="wrap"><div class="hero-g">
  ${galeria.length ? `<div class="gal"><div class="gal-track" id="gtrack" aria-label="Fotos del producto">${galeria.map((s, i) => `<div class="gal-slide">${img(s, `${o.producto.name} — foto ${i + 1}`, i === 0)}</div>`).join("")}</div>
  ${galeria.length > 1 ? `<div class="gal-dots" id="gdots">${galeria.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div><div class="gal-thumbs">${galeria.map((s, i) => `<button type="button" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}" data-i="${i}" style="background-image:url('${esc(s)}')"></button>`).join("")}</div>` : ""}</div>` : ""}
  <div class="info">
    <span class="kick"><i></i>${esc(c.chip)}</span>
    <h1>${esc(c.titulo)} <span class="serif">${esc(c.tituloResaltado)}</span></h1>
    <p class="lead">${lead}</p>
    <ul class="ticks">${c.bullets.map((b) => `<li>${svg("check")}<span>${esc(b)}</span></li>`).join("")}</ul>
    <div class="buy">
      ${total > 0 ? `<div class="price"><b>${cop(total)}</b><span>${alRecibir ? "Pagas cuando lo recibes" : tipo === "digital" ? "Pago único" : ""}</span></div>` : ""}
      <a class="btn btn-ink" href="#pedido" id="heroCta">${esc(c.cta)} ${svg("arrow")}</a>
      <div class="mini">${datos.slice(0, 3).map(([i, t]) => `<span>${svg(i)}${esc(t)}</span>`).join("")}</div>
    </div>
  </div>
</div></div></section>

<section class="sec" style="padding-top:0"><div class="wrap split${fotoProblema ? "" : " solo"}">
  <div class="head rv"><span class="kick"><i></i>${esc(c.problema.eyebrow)}</span><h2>${esc(c.problema.titulo)}</h2><p>${esc(c.problema.texto)}</p></div>
  ${fotoProblema ? `<div class="ph rv">${img(fotoProblema, c.problema.titulo)}</div>` : ""}
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="bento">${bento}</div>
</div></section>

<section class="sec steps-sec"><div class="wrap">
  <div class="head rv"><span class="kick"><i></i>Así de simple</span><h2>${c.pasos.length} pasos y <span class="serif">listo</span></h2></div>
  <ol class="steps">${c.pasos.map((s, i) => `<li class="step rv"><span class="n">0${i + 1}</span><h3>${esc(s.titulo)}</h3><p>${esc(s.texto)}</p></li>`).join("")}</ol>
</div></section>

${testimonios.length ? `<section class="sec"><div class="wrap"><div class="head rv"><span class="kick"><i></i>Clientes reales</span><h2>Lo que <span class="serif">dicen</span></h2></div>
<div class="quotes">${testimonios.map((t) => `<figure class="quote rv"><q>${esc(t.texto)}</q><figcaption><b>${esc(t.nombre)}</b>${t.ciudad ? ` · ${esc(t.ciudad)}` : ""}</figcaption></figure>`).join("")}</div></div></section>` : ""}

<section class="sec order-sec" id="pedido"><div class="wrap order-g">
  <div class="head rv"><span class="kick"><i></i>${alRecibir ? "Pago contra entrega" : tipo === "digital" ? "Acceso digital" : "Contacto directo"}</span><h2>${esc(tituloCierre)}</h2>${o.garantia ? `<div class="guar"><span class="ib">${svg("shield")}</span><div><b>Compra con garantía</b><span>${esc(o.garantia)}</span></div></div>` : ""}</div>
  <div class="card" id="orderBox">${cierre}</div>
</div></section>

${c.faq.length ? `<section class="sec"><div class="wrap split" style="align-items:start">
  <div class="head rv"><span class="kick"><i></i>Preguntas frecuentes</span><h2>Lo que <span class="serif">preguntan</span></h2></div>
  <div class="faq">${c.faq.map((f, i) => `<details ${i ? "" : "open"}><summary>${esc(f.p)}<span class="pm">+</span></summary><p>${esc(f.r)}</p></details>`).join("")}</div>
</div></section>` : ""}
</main>
<footer class="foot"><div class="wrap">© ${new Date().getFullYear()} ${esc(marca)}</div></footer>
<div class="sticky" id="sticky"><div class="sticky-in">${total > 0 ? `<b id="stickyPrice">${cop(total)}</b>` : ""}<a class="btn btn-ink" href="#pedido">${esc(textoBoton)}</a></div></div>
${wa ? `<a class="wa" href="https://wa.me/${wa}?text=${encodeURIComponent(`Hola, quiero información de ${o.producto.name}`)}" target="_blank" rel="noopener" aria-label="Escribir por WhatsApp">${svg("wa")}</a>` : ""}
<script>${SCRIPT}</script><script>${SCRIPT_GEO}</script><script>${SCRIPT_TRANSPORTADORA}</script>
</body></html>`;
}
