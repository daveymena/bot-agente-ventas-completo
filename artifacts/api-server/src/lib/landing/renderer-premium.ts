/**
 * Diseño PREMIUM de VentasPro (23-10-2026).
 *
 * El prototipo aprobado (design/landing-cod-premium.html) convertido en
 * renderer real, con tres versiones según cómo se cierra la venta:
 *
 *   físico   → product page contraentrega: galería con todas las fotos,
 *              variantes como botones, paquetes con precio por unidad, total
 *              con envío junto al botón y la hoja de pedido de siempre
 *              (`/pedido`, la misma de la verificación por WhatsApp).
 *   digital  → página de venta del curso o producto descargable: qué incluye,
 *              precio y pago en línea (o WhatsApp si no hay enlaces).
 *   servicio → qué incluye, cómo trabajas y agendar por WhatsApp.
 *
 * Por qué así (Baymard 2026, ver WHATSAPP_SALES_PLAYBOOK / traspaso del
 * 23-10): variantes como botones y no lista desplegable, precio por unidad,
 * costo total junto al botón, devoluciones visibles solo si existen, foto
 * en uso para ver el tamaño, preguntas abiertas sin pestañas.
 *
 * Reglas que NO se negocian (CLAUDE.md): nada se afirma si no viene en los
 * datos. Sin precio anterior no hay tachado; sin envío configurado no hay
 * "gratis" ni plazo; sin garantía ni testimonios del dueño, esas secciones
 * no existen; sin reseñas, no hay estrellas.
 *
 * Módulo PURO: recibe los datos ya resueltos (los arma `htmlPremium` en
 * html-por-secciones.ts) y devuelve el HTML. Así se prueba sin base.
 */
import { SCRIPT_GEO, opcionesDeDepartamento } from "../geo-colombia";
import { SCRIPT_TRANSPORTADORA } from "./renderer-v3";

export type ModeloPremium = "fisico" | "digital" | "servicio";

export interface SeccionPremium {
  id?: string;
  type?: string;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  cta?: string | null;
  image?: string | null;
  images?: string[] | null;
  hidden?: boolean | null;
}

export interface DatosPremium {
  modelo: ModeloPremium;
  producto: {
    name: string;
    description?: string | null;
    price: number;
    features?: string[] | null;
    opciones?: Array<{ nombre: string; valores: string[]; obligatoria?: boolean }> | null;
  };
  /** Todas las fotos del producto, la principal primero, sin repetidas. */
  fotos: string[];
  video?: string | null;
  /** Precio anterior REAL. Si no es mayor que el precio, no se muestra. */
  precioAntes?: number | null;
  negocio: { nombre?: string | null; whatsapp?: string | null };
  /** Solo lo que el negocio configuró: "" o null si no lo dijo. */
  envio: { pago: "contraentrega" | "anticipado" | "ambos"; costo?: string | null; plazo?: string | null; cobertura?: string | null };
  /** Paquetes que definió el dueño ("2 unidades por $159.900"). */
  ofertas?: Array<{ nombre: string; cantidad: number; precio: number }> | null;
  garantia?: string | null;
  testimonios?: Array<{ nombre: string; ciudad?: string; texto: string }> | null;
  secciones?: SeccionPremium[] | null;
  /** físico: acción del pedido. digital: enlaces de pago y acción del cupón. */
  cierre: { accion?: string; mercadopago?: string; paypal?: string; cupon?: string };
  /** Color de la marca (el tema del editor lo pisa con --accent). */
  acento: string;
  /** Para el formulario: departamento (Colombia) o estado/provincia. */
  esColombia?: boolean;
}

// ─── utilidades ──────────────────────────────────────────────────────────────

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const lineas = (body: unknown, max = 8) =>
  String(body ?? "").split(/\n+/).map((x) => x.replace(/^\s*(?:[-*•✓✔]|\d+[.)])\s*/, "").trim()).filter(Boolean).slice(0, max);
/** "Título: texto" o "Título | texto" → [título, texto]. */
const tituloYTexto = (l: string): [string, string] => {
  const m = l.match(/^(.{3,60}?)\s*(?:[:|—]|\s-\s)\s*(.+)$/);
  return m ? [m[1]!.trim(), m[2]!.trim()] : [l, ""];
};
const sinEmoji = (t: string) => String(t || "").replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u, "").trim();
const corto = (t: unknown, max: number) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cortado = s.slice(0, max);
  const punto = cortado.lastIndexOf(". ");
  return (punto > max * 0.5 ? cortado.slice(0, punto + 1) : cortado.replace(/\s+\S*$/, "") + "…");
};

function luminancia(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return 0;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const tintaSobre = (hex: string) => (luminancia(hex) > 0.42 ? "#14171C" : "#FFFFFF");

/** Recortes de detalle de UNA foto: donde suele estar lo interesante de un producto centrado. */
const RECORTES = ["38% 40%", "64% 48%", "46% 70%", "30% 62%"];

const ICON = {
  cash: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="7" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
};

// ─── estilos ─────────────────────────────────────────────────────────────────
// Neutros fríos + el acento del producto. Una sola familia (Archivo) jugando
// con su eje de ancho: titulares expandidos y pesados, texto normal. Lo
// memorable es la galería y la banda oscura; todo lo demás queda sobrio.

const CSS = `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:"Archivo",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--tinta);background:var(--papel);font-size:16px;line-height:1.55;padding-bottom:84px}
img,video{display:block;max-width:100%}button,input,select{font:inherit;color:inherit}a{color:inherit}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:6px}
.w{max-width:1120px;margin:0 auto;padding:0 18px}
.tt{font-stretch:118%;font-weight:850;letter-spacing:-.02em;line-height:1.04;color:var(--tinta);margin:0}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
svg{width:18px;height:18px;flex:none}
.franja{background:var(--tinta);color:#fff;font-size:13.5px}
.franja .w{display:flex;justify-content:center;gap:8px 22px;flex-wrap:wrap;padding-top:9px;padding-bottom:9px;text-align:center}
.franja span{display:inline-flex;align-items:center;gap:7px}.franja svg{width:16px;height:16px;color:var(--accent-claro)}
.cab{border-bottom:1px solid var(--linea);background:var(--papel)}
.cab .w{height:58px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{font-stretch:125%;font-weight:900;font-size:18px;letter-spacing:-.01em;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ayuda{font-size:14px;font-weight:600;text-decoration:none;display:inline-flex;gap:6px;align-items:center;white-space:nowrap}.ayuda svg{color:#1F9D55}
.prod{display:grid;gap:22px;padding-top:16px}
.gal{position:relative;min-width:0}
.gal-t{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;border-radius:var(--radio-g);background:var(--suave)}
.gal-t::-webkit-scrollbar{display:none}
.gal-s{flex:0 0 100%;scroll-snap-align:center;aspect-ratio:4/5;overflow:hidden;background:var(--suave)}
.gal-s img,.gal-s video{width:100%;height:100%;object-fit:cover}
.gal-n{position:absolute;right:12px;top:12px;background:rgba(20,23,28,.72);color:#fff;font-size:12.5px;font-weight:600;border-radius:999px;padding:4px 10px;font-variant-numeric:tabular-nums}
.minis{display:flex;gap:10px;margin-top:10px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.minis button{flex:0 0 64px;height:78px;border-radius:12px;border:2px solid transparent;padding:0;overflow:hidden;background:var(--suave);cursor:pointer}
.minis button[aria-current="true"]{border-color:var(--tinta)}
.minis img{width:100%;height:100%;object-fit:cover}
.compra h1{font-size:clamp(28px,6.4vw,40px);margin:2px 0 10px}
.precio{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 6px}
.precio b{font-size:30px;font-weight:850;font-stretch:110%;font-variant-numeric:tabular-nums}
.precio s{color:var(--gris);font-size:16px}
.precio .ah{background:var(--accent);color:var(--on-accent);font-weight:700;font-size:12.5px;border-radius:999px;padding:3px 10px}
.resumen{color:var(--gris);margin:0 0 18px;max-width:58ch}
.grupo{border:0;padding:0;margin:0 0 18px;min-width:0}
.grupo legend{font-weight:700;font-size:15px;margin-bottom:8px;padding:0}
.grupo legend small{font-weight:500;color:var(--gris)}
.chips{display:flex;gap:10px;flex-wrap:wrap}
.chip{position:relative}.chip input{position:absolute;opacity:0;inset:0;cursor:pointer;margin:0}
.chip label{display:flex;align-items:center;border:2px solid var(--linea);border-radius:999px;padding:9px 16px;font-weight:600;cursor:pointer;min-height:44px}
.chip input:checked+label{border-color:var(--tinta);box-shadow:inset 0 0 0 1px var(--tinta)}
.chip input:focus-visible+label{outline:3px solid var(--accent);outline-offset:2px}
.packs{display:grid;gap:10px}
.pack{position:relative}.pack input{position:absolute;opacity:0;inset:0;cursor:pointer;margin:0}
.pack label{display:grid;grid-template-columns:auto 1fr auto;gap:2px 12px;align-items:center;border:2px solid var(--linea);border-radius:var(--radio);padding:13px 14px;cursor:pointer}
.pack .rd{width:22px;height:22px;border-radius:50%;border:2px solid var(--linea);grid-row:span 2}
.pack input:checked+label{border-color:var(--tinta);background:var(--suave2)}
.pack input:checked+label .rd{border:7px solid var(--tinta)}
.pack input:focus-visible+label{outline:3px solid var(--accent);outline-offset:2px}
.pack strong{font-size:16px}.pack .m{font-weight:800;text-align:right;font-variant-numeric:tabular-nums}
.pack small{color:var(--gris);font-size:13.5px}.pack .ah{grid-column:2/4;color:#17803D;font-weight:700;font-size:13.5px}
.total{background:var(--suave);border-radius:var(--radio);padding:14px 16px;margin:0 0 14px;display:grid;gap:6px;font-size:15px}
.total div{display:flex;justify-content:space-between;gap:10px}.total .ok{color:#17803D;font-weight:700}
.total .suma{border-top:1px solid var(--linea);padding-top:8px;font-weight:850;font-size:18px}.total .suma span:last-child{font-variant-numeric:tabular-nums}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;border:0;border-radius:var(--radio);background:var(--accent);color:var(--on-accent);font-weight:850;font-stretch:108%;font-size:18px;padding:18px;cursor:pointer;text-decoration:none;box-shadow:inset 0 -3px 0 rgba(0,0,0,.16)}
.btn:active{transform:translateY(1px)}.btn svg{width:22px;height:22px}
.btn.sec{background:var(--papel);color:var(--tinta);border:2px solid var(--tinta);box-shadow:none;font-size:16px;padding:15px}
.nota{font-size:14px;color:var(--gris);margin:10px 0 0;display:flex;gap:8px;align-items:flex-start}.nota svg{color:#17803D;margin-top:2px}
.garant{list-style:none;margin:18px 0 0;padding:16px 0 0;border-top:1px solid var(--linea);display:grid;gap:10px;font-size:14.5px}
.garant li{display:flex;gap:10px;align-items:flex-start}
.banda{background:var(--tinta);color:#fff;margin-top:48px;padding:52px 0}
.banda h2{color:#fff;font-size:clamp(30px,7.5vw,54px);margin:0 0 10px;max-width:18ch}
.banda .intro{color:#B9C2CC;max-width:52ch;margin:0 0 28px}
.rasgos{display:grid;gap:14px}
.rasgo{display:grid;grid-template-columns:96px 1fr;gap:14px;align-items:center;background:rgba(255,255,255,.06);border-radius:16px;padding:12px}
.rasgo .m{width:96px;height:96px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.08)}
.rasgo .m img{width:100%;height:100%;object-fit:cover}
.rasgo h3{margin:0 0 3px;font-size:17px;font-stretch:110%;color:#fff}.rasgo p{margin:0;color:#B9C2CC;font-size:14.5px}
.sec{padding:52px 0 8px}
.sec h2{font-size:clamp(26px,6vw,42px);margin:0 0 10px}
.sec .sub{color:var(--gris);margin:0 0 20px;max-width:60ch}
.lista{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.lista li{display:flex;gap:12px;align-items:flex-start}
.lista .ck{width:26px;height:26px;border-radius:50%;background:var(--accent-suave);color:var(--accent-tinta);display:grid;place-items:center;flex:none}
.lista .ck svg{width:15px;height:15px}.lista b{display:block}.lista span{color:var(--gris)}
.fotos{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fotos figure{margin:0;border-radius:14px;overflow:hidden;background:var(--suave);aspect-ratio:1/1}
.fotos figure:first-child{grid-column:1/-1;aspect-ratio:16/10}
.fotos img{width:100%;height:100%;object-fit:cover}
.pasos ol{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:12px;counter-reset:p}
.pasos li{counter-increment:p;display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:start;padding:16px;border:1px solid var(--linea);border-radius:16px}
.pasos li::before{content:counter(p);width:44px;height:44px;border-radius:50%;background:var(--suave);display:grid;place-items:center;font-weight:850;font-stretch:118%;font-size:18px}
.pasos b{display:block;font-size:17px}.pasos span{color:var(--gris);font-size:15px}
.testis{display:grid;gap:12px}
.testi{border:1px solid var(--linea);border-radius:16px;padding:16px}.testi p{margin:0 0 10px}.testi b{font-size:14.5px}.testi small{color:var(--gris)}
.faq details{border-bottom:1px solid var(--linea)}
.faq summary{list-style:none;cursor:pointer;padding:18px 0;font-weight:700;font-size:17px;display:flex;justify-content:space-between;gap:16px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"";width:11px;height:11px;flex:none;margin-top:6px;border-right:2.5px solid currentColor;border-bottom:2.5px solid currentColor;transform:rotate(45deg);transition:transform .2s}
.faq details[open] summary::after{transform:rotate(225deg)}
.faq details p{margin:0 0 18px;color:var(--gris);max-width:62ch}
.cierre{margin:52px 0 0;background:var(--suave);border-radius:var(--radio-g);padding:28px 20px;text-align:center}
.cierre h2{font-size:clamp(24px,5.6vw,36px);margin:0 0 8px}.cierre p{color:var(--gris);margin:0 auto 18px;max-width:52ch}
.cierre .btn{max-width:420px;margin:0 auto}
.compra-dig{display:grid;gap:12px;max-width:520px}
.cupon{display:flex;gap:8px;margin-top:6px}.cupon input{flex:1;min-width:0;border:1.5px solid var(--linea);border-radius:12px;padding:12px 14px;font-size:16px}
.cupon button{border:0;border-radius:12px;background:var(--tinta);color:#fff;font-weight:700;padding:0 16px;cursor:pointer}
.cupon-estado{font-size:14px;color:var(--gris);min-height:1.2em;margin:0}
.pie{background:var(--suave);padding:26px 0;font-size:14px;color:var(--gris);margin-top:56px}
.pie .w{display:flex;flex-wrap:wrap;gap:8px 20px;justify-content:space-between}
.barra{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--papel);border-top:1px solid var(--linea);padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));display:flex;gap:12px;align-items:center;transform:translateY(110%);transition:transform .25s ease}
.barra.ver{transform:none}.barra div{line-height:1.15}.barra small{display:block;color:var(--gris);font-size:12.5px}
.barra b{font-size:18px;font-variant-numeric:tabular-nums}.barra .btn{padding:14px;font-size:16px;flex:1}
.hoja{position:fixed;inset:0;z-index:60;display:none;background:rgba(20,23,28,.55);align-items:flex-end;justify-content:center}
.hoja:target,.hoja.abierta{display:flex}
.hoja-in{background:var(--papel);width:100%;max-width:560px;max-height:94vh;overflow:auto;border-radius:22px 22px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom,0px));animation:sube .24s ease}
@keyframes sube{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}
.hoja-cab{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.hoja-cab h2{font-size:22px}
.cerrar{width:38px;height:38px;border-radius:50%;background:var(--suave);display:grid;place-items:center;text-decoration:none;font-size:22px;line-height:1}
.form{display:grid;gap:12px}
.elegido{display:flex;gap:12px;align-items:center;background:var(--suave);border-radius:var(--radio);padding:10px}
.elegido img{width:56px;height:56px;border-radius:10px;object-fit:cover}.elegido div{flex:1;font-size:14.5px;line-height:1.3}
.campo label{display:block;font-size:14px;font-weight:600;margin-bottom:5px}
.campo input,.campo select,.envio-transportadora select{width:100%;height:52px;border:1.5px solid var(--linea);border-radius:12px;padding:0 14px;font-size:16px;background:#FAFBFC}
.campo input:focus,.campo select:focus{outline:none;border-color:var(--accent);background:#fff}
.dos{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.envio-transportadora{display:grid;gap:6px}.envio-transportadora .tiny{font-size:13px;color:var(--gris);margin:0}
.aviso{display:flex;gap:10px;align-items:flex-start;border:1px solid #BFE3CB;background:#F0FAF3;border-radius:12px;padding:12px;font-size:14px}.aviso svg{color:#17803D;width:20px;height:20px}
.hero-dig{display:grid;gap:22px;padding-top:22px}
.hero-dig .img{border-radius:var(--radio-g);overflow:hidden;background:var(--suave);aspect-ratio:4/3}
.hero-dig .img img{width:100%;height:100%;object-fit:cover}
.hero-dig h1{font-size:clamp(30px,7vw,52px);margin:0 0 12px}
.hero-dig .sello{display:inline-flex;gap:8px;align-items:center;font-size:14px;font-weight:600;color:var(--gris);margin-top:12px}
@media (min-width:960px){
  body{padding-bottom:0}
  .prod{grid-template-columns:1.1fr .9fr;gap:56px;padding-top:28px;align-items:start}
  .gal{position:sticky;top:20px}
  .rasgos{grid-template-columns:repeat(3,1fr)}.rasgos[data-n="4"]{grid-template-columns:repeat(4,1fr)}.rasgos[data-n="2"]{grid-template-columns:repeat(2,1fr)}
  .rasgo{grid-template-columns:1fr;padding:14px;align-content:start;align-items:start}
  .rasgo .m{width:100%;height:auto;aspect-ratio:4/3}
  .fotos{grid-template-columns:repeat(3,1fr)}.fotos figure:first-child{grid-column:span 2;grid-row:span 2;aspect-ratio:auto}
  .pasos ol{grid-template-columns:repeat(3,1fr)}
  .testis{grid-template-columns:repeat(3,1fr)}
  .hero-dig{grid-template-columns:1fr 1fr;gap:56px;align-items:center;padding-top:44px}
  .barra{display:none}
  .hoja{align-items:center}.hoja-in{border-radius:22px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;

function variables(acento: string): string {
  const a = /^#[0-9a-f]{6}$/i.test(acento) ? acento : "#1F7A5A";
  const sobre = tintaSobre(a);
  // Versión clara del acento para fondos de íconos y su tinta legible.
  return `:root{--tinta:#14171C;--gris:#4B5563;--linea:#E3E6EA;--suave:#F2F4F6;--suave2:#F8F9FA;--papel:#FFFFFF;--accent:${a};--on-accent:${sobre};--accent-suave:color-mix(in srgb,var(--accent) 14%,white);--accent-tinta:color-mix(in srgb,var(--accent) 70%,black);--accent-claro:color-mix(in srgb,var(--accent) 55%,white);--radius:14px;--radio:var(--radius);--radio-g:calc(var(--radius) + 6px)}`;
}

// ─── piezas comunes ─────────────────────────────────────────────────────────

interface Contexto {
  d: DatosPremium;
  secciones: SeccionPremium[];
  usadas: Set<string>;
  fotos: string[];
}

function seccion(cx: Contexto, ...tipos: string[]): SeccionPremium | undefined {
  const s = cx.secciones.find((x) => !x.hidden && tipos.includes(String(x.type || "").toLowerCase()) && !cx.usadas.has(String(x.id || x.type)));
  if (s) cx.usadas.add(String(s.id || s.type));
  return s;
}

/** Beneficios: los del dueño (sección), si no las características del producto. */
function beneficios(cx: Contexto, s?: SeccionPremium): Array<[string, string]> {
  const deSeccion = s ? lineas(s.body, 6) : [];
  const base = deSeccion.length ? deSeccion : (cx.d.producto.features || []).map(String).filter(Boolean).slice(0, 6);
  return base.map((l) => tituloYTexto(sinEmoji(l)));
}

/** La foto i para un bloque: otra foto si hay, si no un recorte de la principal. */
function fotoParaBloque(cx: Contexto, i: number): { src: string; pos: string; zoom: boolean } | null {
  if (!cx.fotos.length) return null;
  const otras = cx.fotos.slice(1);
  if (otras[i]) return { src: otras[i]!, pos: "50% 50%", zoom: false };
  return { src: cx.fotos[(i + 1) % cx.fotos.length]!, pos: RECORTES[i % RECORTES.length]!, zoom: true };
}

function imgBloque(f: { src: string; pos: string; zoom: boolean } | null, alt = ""): string {
  if (!f) return "";
  const estilo = f.zoom ? ` style="object-position:${f.pos};transform:scale(1.8);transform-origin:${f.pos}"` : "";
  return `<img src="${esc(f.src)}" alt="${esc(alt)}" loading="lazy" decoding="async"${estilo}>`;
}

function franja(d: DatosPremium): string {
  const items: string[] = [];
  if (d.modelo === "fisico") {
    if (d.envio.pago !== "anticipado") items.push(`<span>${ICON.cash}Pagas cuando te llega</span>`);
    if (d.envio.costo === "incluido") items.push(`<span>${ICON.truck}Envío incluido</span>`);
    else if (d.envio.plazo) items.push(`<span>${ICON.truck}Llega en ${esc(d.envio.plazo)}</span>`);
  } else if (d.modelo === "digital") {
    items.push(`<span>${ICON.bolt}Acceso apenas se confirma el pago</span>`);
  } else {
    items.push(`<span>${ICON.cal}Se agenda por WhatsApp</span>`);
  }
  return items.length ? `<div class="franja"><div class="w">${items.join("")}</div></div>` : "";
}

function cabecera(d: DatosPremium): string {
  const marca = d.negocio.nombre || d.producto.name;
  const wa = String(d.negocio.whatsapp || "").replace(/\D/g, "");
  return `<header class="cab"><div class="w"><span class="brand">${esc(marca)}</span>${wa ? `<a class="ayuda" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ICON.wa}¿Dudas?</a>` : ""}</div></header>`;
}

function galeria(cx: Contexto, nombre: string): string {
  const fotos = cx.fotos;
  if (!fotos.length) return "";
  const slides = fotos.map((s, i) => `<div class="gal-s"><img src="${esc(s)}" alt="${esc(nombre)}, foto ${i + 1} de ${fotos.length}"${i ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async"></div>`);
  const video = cx.d.video ? `<div class="gal-s"><video src="${esc(cx.d.video)}" muted loop playsinline controls preload="metadata"></video></div>` : "";
  const total = fotos.length + (video ? 1 : 0);
  const minis = total > 1
    ? `<div class="minis" role="group" aria-label="Fotos del producto">${fotos.map((s, i) => `<button type="button" data-i="${i}" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}"><img src="${esc(s)}" alt="" loading="lazy"></button>`).join("")}${video ? `<button type="button" data-i="${fotos.length}" aria-label="Ver video" aria-current="false" style="display:grid;place-items:center;color:var(--tinta)">${ICON.play}</button>` : ""}</div>`
    : "";
  return `<div class="gal"><div class="gal-t" id="galT">${slides.join("")}${video}</div>${total > 1 ? `<span class="gal-n" id="galN" aria-hidden="true">1/${total}</span>` : ""}${minis}</div>`;
}

function precioHtml(d: DatosPremium): string {
  const precio = Number(d.producto.price) || 0;
  if (precio <= 0) return "";
  const antes = Number(d.precioAntes) || 0;
  const hay = antes > precio;
  const pct = hay ? Math.round(((antes - precio) / antes) * 100) : 0;
  return `<div class="precio"><b>${pesos(precio)}</b>${hay ? `<s>${pesos(antes)}</s><span class="ah">${pct}% menos</span>` : ""}</div>`;
}

function bandaRasgos(cx: Contexto, titulo: string, intro: string, items: Array<[string, string]>, nombre: string): string {
  if (!items.length) return "";
  const tarjetas = items.slice(0, 4).map(([t, x], i) => `<article class="rasgo"><div class="m">${imgBloque(fotoParaBloque(cx, i), `${nombre}: ${t}`)}</div><div><h3>${esc(t)}</h3>${x ? `<p>${esc(x)}</p>` : ""}</div></article>`).join("");
  return `<section class="banda"><div class="w"><h2 class="tt">${esc(titulo)}</h2>${intro ? `<p class="intro">${esc(intro)}</p>` : ""}<div class="rasgos" data-n="${Math.min(4, items.length)}">${tarjetas}</div></div></section>`;
}

function listaSeccion(titulo: string, sub: string, items: Array<[string, string]>, extra = ""): string {
  if (!items.length) return "";
  return `<section class="w sec"><h2 class="tt">${esc(titulo)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}<ul class="lista">${items.map(([t, x]) => `<li><span class="ck">${ICON.check}</span><span><b>${esc(t)}</b>${x ? `<span>${esc(x)}</span>` : ""}</span></li>`).join("")}</ul>${extra}</section>`;
}

/** "Así se ve": todas las fotos que no salieron en la galería de arriba ni en la banda. */
function fotosSeccion(cx: Contexto, nombre: string, s?: SeccionPremium): string {
  const propias = [s?.image, ...(s?.images || [])].filter(Boolean).map(String);
  // Con pocas fotos, la galería de arriba ya las muestra todas: repetirlas en
  // grande no suma. Sale si el dueño armó la sección o si hay 4 fotos o más.
  if (!s && cx.fotos.length < 4) return "";
  const lista = [...new Set([...propias, ...cx.fotos])].slice(0, 5);
  if (lista.length < 2) return "";
  return `<section class="w sec"><h2 class="tt">${esc(s?.title || "Así se ve")}</h2>${s?.subtitle ? `<p class="sub">${esc(s.subtitle)}</p>` : ""}<div class="fotos">${lista.map((f, i) => `<figure><img src="${esc(f)}" alt="${esc(nombre)}, foto ${i + 1}" loading="lazy" decoding="async"></figure>`).join("")}</div></section>`;
}

function pasosSeccion(titulo: string, pasos: Array<[string, string]>): string {
  return `<section class="w sec pasos"><h2 class="tt">${esc(titulo)}</h2><ol>${pasos.map(([b, t]) => `<li><div><b>${esc(b)}</b><span>${esc(t)}</span></div></li>`).join("")}</ol></section>`;
}

function testimoniosSeccion(cx: Contexto): string {
  const s = seccion(cx, "testimonials", "social_proof");
  // Solo los del dueño: los de la ficha (metadata.testimonios) o los que
  // escribió en la sección ("texto | nombre"). Sin estrellas: no hay nota.
  const deSeccion = s ? lineas(s.body, 3).map((l) => { const [texto, nombre = ""] = l.split(/\s*\|\s*/, 2); return { texto: texto!, nombre, ciudad: "" }; }).filter((t) => t.nombre) : [];
  const lista = deSeccion.length ? deSeccion : (cx.d.testimonios || []).slice(0, 3);
  if (!lista.length) return "";
  return `<section class="w sec"><h2 class="tt">${esc(s?.title || "Lo que dicen quienes ya lo tienen")}</h2><div class="testis">${lista.map((t) => `<figure class="testi" style="margin:0"><p>“${esc(t.texto)}”</p><figcaption><b>${esc(t.nombre)}</b>${t.ciudad ? ` <small>· ${esc(t.ciudad)}</small>` : ""}</figcaption></figure>`).join("")}</div></section>`;
}

function faqSeccion(cx: Contexto, extra: Array<[string, string]> = []): string {
  const s = seccion(cx, "faq");
  const deSeccion = s ? lineas(s.body, 8).map((l) => { const [q, ...r] = l.split(/\s*\|\s*/); return [q!, r.join(" | ")] as [string, string]; }).filter(([q, r]) => q && r) : [];
  const lista = [...deSeccion, ...extra].slice(0, 8);
  if (!lista.length) return "";
  return `<section class="w sec faq"><h2 class="tt">${esc(s?.title || "Antes de decidir")}</h2>${lista.map(([q, r], i) => `<details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join("")}</section>`;
}

/** Las secciones del dueño que no tienen lugar fijo, en su orden, con un formato sobrio. */
function restoSecciones(cx: Contexto, cta: string): string {
  return cx.secciones.filter((s) => !s.hidden && !cx.usadas.has(String(s.id || s.type))).map((s) => {
    cx.usadas.add(String(s.id || s.type));
    const tipo = String(s.type || "").toLowerCase();
    if (tipo === "hero" || tipo === "footer" || tipo === "checkout") return "";
    if (tipo === "cta") return `<section class="w"><div class="cierre"><h2 class="tt">${esc(s.title || "¿Te lo llevas?")}</h2>${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ""}${cta}</div></section>`;
    const ls = lineas(s.body, 8);
    if (ls.length > 1) return listaSeccion(String(s.title || ""), String(s.subtitle || ""), ls.map((l) => tituloYTexto(sinEmoji(l))));
    if (!s.title && !s.body) return "";
    return `<section class="w sec">${s.title ? `<h2 class="tt">${esc(s.title)}</h2>` : ""}${s.subtitle ? `<p class="sub">${esc(s.subtitle)}</p>` : ""}${s.body ? `<p class="sub">${esc(s.body)}</p>` : ""}</section>`;
  }).join("");
}

function pie(d: DatosPremium, linea: string): string {
  return `<footer class="pie"><div class="w"><span>© ${new Date().getFullYear()} ${esc(d.negocio.nombre || d.producto.name)}</span>${linea ? `<span>${esc(linea)}</span>` : ""}</div></footer>`;
}

function documento(d: DatosPremium, cuerpo: string, scripts: string): string {
  const titulo = `${d.producto.name}${d.negocio.nombre ? ` · ${d.negocio.nombre}` : ""}`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(corto(d.producto.description || d.producto.name, 155))}">
${d.fotos[0] ? `<meta property="og:image" content="${esc(d.fotos[0])}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet">
<style>${variables(d.acento)}${CSS}</style></head>
<body data-diseno="premium" data-modelo="${d.modelo}">
${cuerpo}
<script>${SCRIPT_COMUN}</script>${scripts}
</body></html>`;
}

/** Galería deslizable + miniaturas + contador; barra fija cuando el botón principal sale de la pantalla. */
const SCRIPT_COMUN = `(function(){
var t=document.getElementById('galT'),n=document.getElementById('galN');
if(t){var mi=[].slice.call(document.querySelectorAll('.minis button')),tot=t.children.length;
t.addEventListener('scroll',function(){var i=Math.round(t.scrollLeft/t.clientWidth);mi.forEach(function(b,k){b.setAttribute('aria-current',k===i)});if(n)n.textContent=(i+1)+'/'+tot},{passive:true});
mi.forEach(function(b){b.onclick=function(){t.scrollTo({left:t.clientWidth*+b.dataset.i,behavior:'smooth'})}})}
var barra=document.getElementById('barra'),principal=document.getElementById('principal');
if(barra&&principal&&'IntersectionObserver' in window){new IntersectionObserver(function(es){var fuera=!es[0].isIntersecting&&es[0].boundingClientRect.top<0;barra.classList.toggle('ver',fuera)}).observe(principal)}
})();`;

// ─── FÍSICO ─────────────────────────────────────────────────────────────────

function renderFisico(cx: Contexto): string {
  const { d } = cx;
  const p = d.producto;
  const hero = seccion(cx, "hero");
  const nombre = p.name;
  const titulo = String(hero?.title || "").trim() || nombre;
  const resumen = String(hero?.subtitle || "").trim() || corto(p.description, 160);
  const cta = String(hero?.cta || "").trim() || (d.envio.pago === "anticipado" ? "Pedir ahora" : "Pedir y pagar al recibir");
  const precio = Number(p.price) || 0;
  const ofertas = (d.ofertas || []).filter((o) => o && o.nombre && Number(o.precio) > 0 && Number(o.cantidad) > 0);
  const opciones = (p.opciones || []).filter((o) => o?.nombre && Array.isArray(o.valores) && o.valores.length);
  const accion = d.cierre.accion || "";
  const wa = String(d.negocio.whatsapp || "").replace(/\D/g, "");

  // Variantes como botones (Baymard: 57 % las esconde en una lista). Viven
  // FUERA del formulario y se copian a sus <select> (que funcionan sin JS).
  const chips = opciones.map((o, k) => `<fieldset class="grupo"><legend>${esc(o.nombre)} <small data-valor-de="${k}"></small></legend><div class="chips">${o.valores.map((v, i) => `<div class="chip"><input type="radio" name="vp_op_${k}" id="op${k}_${i}" value="${esc(v)}" data-espejo="opcion_${esc(o.nombre)}"><label for="op${k}_${i}">${esc(v)}</label></div>`).join("")}</div></fieldset>`).join("");

  // Paquetes del dueño con precio por unidad y ahorro REAL frente a comprar sueltas.
  const packs = ofertas.length > 1
    ? `<fieldset class="grupo"><legend>Cantidad</legend><div class="packs">${ofertas.map((o, i) => {
        const porUnidad = o.precio / o.cantidad;
        const ahorro = precio > 0 ? precio * o.cantidad - o.precio : 0;
        return `<div class="pack"><input type="radio" name="vp_pack" id="pk${i}" value="${i}" data-total="${o.precio}" data-nombre="${esc(o.nombre)}"${i === 0 ? " checked" : ""}><label for="pk${i}"><span class="rd"></span><strong>${esc(o.nombre)}</strong><span class="m">${pesos(o.precio)}</span><small>${pesos(porUnidad)} cada una</small>${ahorro > 0 ? `<span class="ah">Ahorras ${pesos(ahorro)} frente a comprar ${o.cantidad} por separado</span>` : ""}</label></div>`;
      }).join("")}</div></fieldset>`
    : "";
  const total = ofertas[0]?.precio ?? precio;

  const envioFila = d.envio.costo === "incluido"
    ? `<div><span>Envío</span><span class="ok">Incluido</span></div>`
    : d.envio.costo
      ? `<div><span>Envío</span><span>${esc(d.envio.costo)}</span></div>`
      : `<div><span>Envío</span><span>Se confirma por WhatsApp</span></div>`;
  const totalBox = total > 0
    ? `<div class="total" aria-live="polite"><div><span>Producto</span><span data-total>${pesos(total)}</span></div>${envioFila}<div class="suma"><span>${d.envio.pago === "anticipado" ? "Total" : "Pagas al recibir"}</span><span data-total>${pesos(total)}</span></div></div>`
    : "";

  const garantias = [
    d.garantia ? `<li>${ICON.shield}<span><b>Garantía.</b> ${esc(d.garantia)}</span></li>` : "",
    `<li>${ICON.lock}<span>Tus datos solo se usan para el envío. No te pedimos tarjeta.</span></li>`,
  ].join("");

  const nota = [
    d.envio.pago === "anticipado" ? "Te confirmamos el pedido por WhatsApp antes de cobrarlo." : "No pagas nada ahora. Te confirmamos el pedido por WhatsApp.",
    d.envio.plazo ? `Llega en ${d.envio.plazo}.` : "",
  ].filter(Boolean).join(" ");

  const compra = `<div class="compra"><h1 class="tt">${esc(titulo)}</h1>${precioHtml(d)}${resumen ? `<p class="resumen">${esc(resumen)}</p>` : ""}${chips}${packs}${totalBox}
<a class="btn" id="principal" href="#pedido">${ICON.cash}<span>${esc(cta)}</span></a>
<p class="nota">${ICON.check}<span>${esc(nota)}</span></p><ul class="garant">${garantias}</ul></div>`;

  // Banda oscura: los beneficios con sus fotos (o recortes de la principal).
  const sBen = seccion(cx, "benefits", "features", "feature");
  const bens = beneficios(cx, sBen);
  // La banda muestra hasta 4; lo que sobra va en lista solo si son 2 o más
  // (un punto suelto bajo "Y además" se ve como un olvido): con 5, 3 + 2.
  const enBanda = bens.length === 5 ? 3 : 4;
  const banda = bandaRasgos(cx, String(sBen?.title || "").trim() || "Por qué te va a gustar", String(sBen?.subtitle || "").trim(), bens.slice(0, enBanda), nombre);
  const resto = bens.length > enBanda ? listaSeccion("Y además", "", bens.slice(enBanda)) : "";

  const sFotos = seccion(cx, "gallery", "visual", "photo-band");
  const carac = (p.features || []).map(String).filter(Boolean);
  // Características aparte solo si dicen algo que la banda no dijo ya.
  const enLaBanda = bens.map(([t]) => t.toLowerCase());
  const caracNuevas = carac.map((x) => sinEmoji(x)).filter((x) => !enLaBanda.some((t) => t.includes(x.toLowerCase()) || x.toLowerCase().includes(t)));
  const caracHtml = sBen && caracNuevas.length ? listaSeccion("Características", "", caracNuevas.slice(0, 8).map((x) => tituloYTexto(x))) : "";

  const pasos = pasosSeccion("Así llega a tu casa", [
    ["Haces el pedido aquí", "Nombre, celular y dirección. Un minuto."],
    ["Lo confirmas por WhatsApp", "Revisamos contigo los datos antes de despachar."],
    [d.envio.pago === "anticipado" ? "Pagas y lo despachamos" : "Pagas cuando te llega", d.envio.plazo ? `Llega en ${d.envio.plazo}.` : "Te compartimos la guía apenas sale."],
  ]);

  const btnCierre = `<a class="btn" href="#pedido">${ICON.cash}<span>${esc(cta)}</span></a>`;
  // FAQ y testimonios ANTES que el resto: si no, restoSecciones se queda
  // con esas secciones y salen como lista suelta en vez de acordeón/tarjetas.
  const faq = faqSeccion(cx);
  const testis = testimoniosSeccion(cx);
  const otras = restoSecciones(cx, btnCierre);

  const etiquetaDepto = d.esColombia === false ? "Estado o provincia" : "Departamento";
  const camposOpciones = opciones.map((o) => `<div class="campo"><label for="f_${esc(o.nombre)}">${esc(o.nombre)}</label><select id="f_${esc(o.nombre)}" name="opcion_${esc(o.nombre)}"${o.obligatoria ? " required" : ""}><option value="">Elige ${esc(o.nombre.toLowerCase())}</option>${o.valores.map((v) => `<option>${esc(v)}</option>`).join("")}</select></div>`).join("");
  const campoOferta = ofertas.length ? `<input type="hidden" name="oferta" value="0">` : `<input type="hidden" name="cantidad" value="1">`;
  const hoja = `<div class="hoja" id="pedido" role="dialog" aria-modal="true" aria-labelledby="hojaT"><div class="hoja-in">
<div class="hoja-cab"><h2 class="tt" id="hojaT">Tu pedido</h2><a class="cerrar" href="#" aria-label="Cerrar">×</a></div>
<form class="form checkout-form" method="post" action="${esc(accion)}">
<div class="elegido">${d.fotos[0] ? `<img src="${esc(d.fotos[0])}" alt="">` : ""}<div><span data-elegido>${esc(ofertas[0]?.nombre || nombre)}</span><br><b data-total>${total > 0 ? pesos(total) : ""}</b>${d.envio.pago === "anticipado" ? "" : " al recibir"}</div></div>
${campoOferta}${camposOpciones}
<div class="campo"><label for="f1">Nombre y apellido</label><input id="f1" name="nombre" autocomplete="name" required></div>
<div class="campo"><label for="f2">Celular con WhatsApp</label><input id="f2" name="telefono" inputmode="tel" autocomplete="tel" required></div>
<div class="dos"><div class="campo"><label for="f3">${etiquetaDepto}</label>${d.esColombia === false ? `<input id="f3" name="departamento" autocomplete="address-level1" required>` : `<select id="f3" name="departamento" autocomplete="address-level1" required>${opcionesDeDepartamento(esc)}</select>`}</div>
<div class="campo"><label for="f4">Ciudad</label><input id="f4" name="ciudad" list="ciudades-datalist" autocomplete="address-level2" required></div></div>
<datalist id="ciudades-datalist"></datalist>
<div class="campo"><label for="f5">Dirección</label><input id="f5" name="direccion" autocomplete="street-address" placeholder="Calle, carrera y número" required></div>
<div class="dos"><div class="campo"><label for="f6">Barrio</label><input id="f6" name="barrio"></div><div class="campo"><label for="f7">Referencia</label><input id="f7" name="referencia" placeholder="Opcional"></div></div>
<div class="envio-transportadora" hidden></div>
${wa ? `<div class="aviso">${ICON.wa}<span>Antes de despacharlo te escribimos por WhatsApp para confirmar tus datos.</span></div>` : ""}
<button class="btn" type="submit">Confirmar pedido</button>
</form></div></div>`;

  const barra = `<div class="barra" id="barra"><div><small>${d.envio.pago === "anticipado" ? "Total" : "Pagas al recibir"}</small><b data-total>${total > 0 ? pesos(total) : ""}</b></div><a class="btn" href="#pedido">Pedir ahora</a></div>`;

  const cuerpo = `${franja(d)}${cabecera(d)}<main>
<section class="w prod">${galeria(cx, nombre)}${compra}</section>
${banda}${resto}${caracHtml}${fotosSeccion(cx, nombre, sFotos)}${testis}${pasos}${otras}${faq}
</main>${pie(d, d.envio.pago === "anticipado" ? "" : "Pago contra entrega")}${barra}${hoja}`;

  const scriptFisico = `<script>(function(){
var pesos=function(n){return '$'+Math.round(n).toLocaleString('es-CO')};
var f=document.querySelector('.checkout-form');
function poner(t,nombre){[].forEach.call(document.querySelectorAll('[data-total]'),function(e){e.textContent=pesos(t)});var el=document.querySelector('[data-elegido]');if(el&&nombre)el.textContent=nombre}
[].forEach.call(document.querySelectorAll('input[name=vp_pack]'),function(r){r.addEventListener('change',function(){poner(+r.dataset.total,r.dataset.nombre);var o=f&&f.querySelector('[name=oferta]');if(o)o.value=r.value})});
[].forEach.call(document.querySelectorAll('input[data-espejo]'),function(r){r.addEventListener('change',function(){var s=f&&f.querySelector('[name="'+r.dataset.espejo+'"]');if(s)s.value=r.value;var g=r.closest('fieldset');var sm=g&&g.querySelector('legend small');if(sm)sm.textContent=r.value})});
var h=document.getElementById('pedido');if(h)h.addEventListener('click',function(e){if(e.target===h)location.hash=''});
})();</script><script>${SCRIPT_GEO}</script><script>${SCRIPT_TRANSPORTADORA}</script>`;

  return documento(d, cuerpo, scriptFisico);
}

// ─── DIGITAL ────────────────────────────────────────────────────────────────

function renderDigital(cx: Contexto): string {
  const { d } = cx;
  const p = d.producto;
  const hero = seccion(cx, "hero");
  const titulo = String(hero?.title || "").trim() || p.name;
  const resumen = String(hero?.subtitle || "").trim() || corto(p.description, 180);
  const cta = String(hero?.cta || "").trim() || "Quiero acceder";
  const wa = String(d.negocio.whatsapp || "").replace(/\D/g, "");
  const hayPago = !!(d.cierre.mercadopago || d.cierre.paypal);

  const sBen = seccion(cx, "benefits", "features", "feature");
  const bens = beneficios(cx, sBen);
  const incluye = listaSeccion(String(sBen?.title || "").trim() || "Qué incluye", String(sBen?.subtitle || "").trim(), bens);
  const sTemario = seccion(cx, "curriculum", "modules", "temario", "how-it-works", "steps");
  const temario = sTemario ? listaSeccion(String(sTemario.title || "Lo que vas a ver"), String(sTemario.subtitle || ""), lineas(sTemario.body, 10).map((l) => tituloYTexto(sinEmoji(l)))) : "";

  const botones = [
    d.cierre.mercadopago ? `<a class="btn" href="${esc(d.cierre.mercadopago)}" rel="noopener">${ICON.lock}<span>Pagar con Mercado Pago</span></a>` : "",
    d.cierre.paypal ? `<a class="btn sec" href="${esc(d.cierre.paypal)}" rel="noopener">Pagar con PayPal</a>` : "",
    !hayPago && wa ? `<a class="btn" href="https://wa.me/${wa}?text=${encodeURIComponent(`Hola, quiero ${p.name}`)}" target="_blank" rel="noopener">${ICON.wa}<span>Comprar por WhatsApp</span></a>` : "",
  ].join("");
  const cupon = hayPago && d.cierre.cupon
    ? `<form class="cupon" data-cupon="${esc(d.cierre.cupon)}"><input name="code" placeholder="¿Tienes un cupón?" aria-label="Cupón de descuento" autocomplete="off"><button type="submit">Aplicar</button></form><p class="cupon-estado" aria-live="polite"></p>`
    : "";
  // Sin enlaces de pago ni WhatsApp no hay cómo comprar: no se promete un
  // camino que no existe (el precio y el producto se siguen viendo).
  const comoSeCompra = hayPago
    ? "Pagas en línea de forma segura y recibes el acceso por WhatsApp apenas se confirma."
    : wa ? "Escríbenos y te enviamos los datos para pagar; el acceso te llega por el mismo chat." : "";
  const comprar = `<section class="w sec" id="comprar"><div class="cierre" style="text-align:left;margin:0"><h2 class="tt">${esc(p.name)}</h2>${precioHtml(d)}${comoSeCompra ? `<p style="margin:0 0 18px">${comoSeCompra}</p>` : ""}${botones || cupon ? `<div class="compra-dig">${botones}${cupon}</div>` : ""}${d.garantia ? `<p class="nota">${ICON.shield}<span>${esc(d.garantia)}</span></p>` : ""}</div></section>`;

  // Sin enlaces de pago ni WhatsApp no hay cómo comprar: ni botón ni pasos que lo prometan.
  const puedeComprar = hayPago || !!wa;
  const pasos = !puedeComprar ? "" : pasosSeccion("Cómo recibes el acceso", [
    [hayPago ? "Pagas en línea" : "Nos escribes por WhatsApp", hayPago ? "Con Mercado Pago o PayPal." : "Te enviamos los datos para pagar."],
    ["Confirmamos el pago", "Lo revisamos y te avisamos por el chat."],
    ["Recibes el acceso", "Por WhatsApp, para verlo desde el celular o el computador."],
  ]);

  const btnCierre = `<a class="btn" href="#comprar">${esc(cta)}</a>`;
  // FAQ y testimonios ANTES que el resto: si no, restoSecciones se queda
  // con esas secciones y salen como lista suelta en vez de acordeón/tarjetas.
  const faq = faqSeccion(cx);
  const testis = testimoniosSeccion(cx);
  const otras = restoSecciones(cx, btnCierre);
  const heroHtml = `<section class="w hero-dig"><div><h1 class="tt">${esc(titulo)}</h1>${resumen ? `<p class="resumen">${esc(resumen)}</p>` : ""}${precioHtml(d)}${puedeComprar ? `<a class="btn" id="principal" href="#comprar" style="max-width:420px;margin-top:14px">${esc(cta)}</a>` : ""}<span class="sello">${ICON.bolt}Acceso apenas se confirma el pago</span></div>${d.fotos[0] ? `<div class="img"><img src="${esc(d.fotos[0])}" alt="${esc(p.name)}" fetchpriority="high"></div>` : ""}</section>`;
  // La banda con fotos solo si hay fotos distintas para cada punto; con una
  // sola foto repetiría la lista de "Qué incluye" con tres recortes iguales.
  const banda = "";
  const barra = !puedeComprar ? "" : `<div class="barra" id="barra"><div><small>Acceso inmediato</small><b>${Number(p.price) > 0 ? pesos(Number(p.price)) : ""}</b></div><a class="btn" href="#comprar">${esc(cta)}</a></div>`;

  const cuerpo = `${franja(d)}${cabecera(d)}<main>${heroHtml}${incluye}${banda}${temario}${testis}${otras}${comprar}${pasos}${faq}</main>${pie(d, "")}${barra}`;
  const script = cupon ? `<script>(function(){var f=document.querySelector('form[data-cupon]');if(!f)return;var s=document.querySelector('.cupon-estado');f.addEventListener('submit',function(e){e.preventDefault();var c=(f.code.value||'').trim();if(!c)return;s.textContent='Validando…';fetch(f.dataset.cupon,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:c})}).then(function(r){return r.json()}).then(function(j){if(j.ok&&j.links){var mp=document.querySelector('a[href*="mercadopago"],a[href*="mpago"]');if(mp&&j.links.mercadopago)mp.href=j.links.mercadopago;var pp=document.querySelector('a[href*="paypal"]');if(pp&&j.links.paypal)pp.href=j.links.paypal;s.textContent=j.mensaje||'Cupón aplicado'}else{s.textContent=j.motivo||j.error||'No se pudo aplicar'}}).catch(function(){s.textContent='No se pudo aplicar'})})})();</script>` : "";
  return documento(d, cuerpo, script);
}

// ─── SERVICIO ───────────────────────────────────────────────────────────────

function renderServicio(cx: Contexto): string {
  const { d } = cx;
  const p = d.producto;
  const hero = seccion(cx, "hero");
  const titulo = String(hero?.title || "").trim() || p.name;
  const resumen = String(hero?.subtitle || "").trim() || corto(p.description, 180);
  const cta = String(hero?.cta || "").trim() || "Agendar por WhatsApp";
  const wa = String(d.negocio.whatsapp || "").replace(/\D/g, "");
  const enlace = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hola, quiero agendar: ${p.name}`)}` : "#";
  const boton = (id = "") => `<a class="btn"${id ? ` id="${id}"` : ""} href="${esc(enlace)}" target="_blank" rel="noopener">${ICON.wa}<span>${esc(cta)}</span></a>`;

  const sBen = seccion(cx, "benefits", "features", "feature");
  const bens = beneficios(cx, sBen);
  const incluye = listaSeccion(String(sBen?.title || "").trim() || "Qué incluye", String(sBen?.subtitle || "").trim(), bens);
  const sProceso = seccion(cx, "how-it-works", "steps", "process");
  const proceso = sProceso && lineas(sProceso.body).length
    ? pasosSeccion(String(sProceso.title || "Cómo trabajamos"), lineas(sProceso.body, 4).map((l) => tituloYTexto(sinEmoji(l))))
    : pasosSeccion("Cómo agendas", [["Nos escribes por WhatsApp", "Cuéntanos qué necesitas."], ["Acordamos día y hora", "Te confirmamos por el mismo chat."], ["Te atendemos", "En el horario que elegiste."]]);

  const heroHtml = `<section class="w hero-dig"><div><h1 class="tt">${esc(titulo)}</h1>${resumen ? `<p class="resumen">${esc(resumen)}</p>` : ""}${precioHtml(d)}<div style="max-width:420px;margin-top:14px">${boton("principal")}</div><span class="sello">${ICON.cal}Te confirmamos la hora por el chat</span></div>${d.fotos[0] ? `<div class="img"><img src="${esc(d.fotos[0])}" alt="${esc(p.name)}" fetchpriority="high"></div>` : ""}</section>`;
  // Igual que en digital: "Qué incluye" ya los dice; sin banda repetida.
  const banda = "";
  // FAQ y testimonios ANTES que el resto: si no, restoSecciones se queda
  // con esas secciones y salen como lista suelta en vez de acordeón/tarjetas.
  const faq = faqSeccion(cx);
  const testis = testimoniosSeccion(cx);
  const otras = restoSecciones(cx, boton());
  const cierre = `<section class="w"><div class="cierre"><h2 class="tt">¿Agendamos?</h2><p>Escríbenos y te confirmamos el día y la hora.</p>${boton()}</div></section>`;
  const barra = `<div class="barra" id="barra"><div><small>Se agenda por WhatsApp</small><b>${Number(p.price) > 0 ? pesos(Number(p.price)) : ""}</b></div>${boton()}</div>`;

  const cuerpo = `${franja(d)}${cabecera(d)}<main>${heroHtml}${incluye}${banda}${proceso}${testis}${otras}${faq}${cierre}</main>${pie(d, "")}${barra}`;
  return documento(d, cuerpo, "");
}

/**
 * Las secciones de arranque de una landing premium creada SIN IA: solo con lo
 * que dice la ficha (nombre, descripción, características). Así el diseño
 * sale completo aunque el negocio no tenga claves de IA, y el editor de
 * bloques tiene qué editar. Ninguna cifra ni promesa nueva.
 */
export function seccionesInicialesPremium(p: { name?: unknown; description?: unknown; features?: unknown }): SeccionPremium[] {
  const feats = (Array.isArray(p.features) ? p.features : typeof p.features === "string" ? (() => { try { const j = JSON.parse(String(p.features)); return Array.isArray(j) ? j : []; } catch { return []; } })() : [])
    .map((x: unknown) => sinEmoji(String(x ?? ""))).filter(Boolean).slice(0, 6);
  const nombre = String(p.name ?? "").trim();
  const out: SeccionPremium[] = [{ id: "hero", type: "hero", title: nombre, subtitle: corto(p.description, 160) || null }];
  if (feats.length) out.push({ id: "beneficios", type: "benefits", title: "Por qué te va a gustar", body: feats.join("\n") });
  return out;
}

// ─── entrada ────────────────────────────────────────────────────────────────

export function renderizarPremium(d: DatosPremium): string {
  const fotos = [...new Set((d.fotos || []).filter(Boolean).map(String))];
  const cx: Contexto = { d: { ...d, fotos }, secciones: (d.secciones || []).filter(Boolean), usadas: new Set(), fotos };
  if (d.modelo === "fisico") return renderFisico(cx);
  if (d.modelo === "servicio") return renderServicio(cx);
  return renderDigital(cx);
}
