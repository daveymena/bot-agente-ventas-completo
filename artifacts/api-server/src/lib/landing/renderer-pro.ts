/**
 * Landing "PRO" de producto físico (30-09-2026).
 *
 * Modelo que eligió el dueño (Downloads/landing-pro-sofia.html, basada en
 * PosturaPro): una PLANTILLA que se llena con datos, no un HTML que el modelo
 * inventa cada vez. El modelo solo escribe los textos (ver contenido-pro.ts);
 * el diseño sale siempre igual de bien, en móvil primero:
 *   galería a sangre deslizable → etiqueta, titular con resaltado, 3 checks,
 *   precio y botón → franja de confianza → problema + beneficios (carrusel en
 *   móvil) → sección oscura de pasos (línea de tiempo en móvil) → testimonios
 *   REALES → oferta + formulario → preguntas → garantía REAL → barra fija.
 *
 * Diferencias con la referencia, a propósito:
 *   - Sin precio tachado, "-40% HOY", estrellas, "quedan N" ni cuenta
 *     regresiva: no hay datos reales para eso. Si un día existen, se pasan.
 *   - Colores neutros para ambos sexos (pedido del dueño), no teal fijo.
 *   - El formulario es el de VentasPro: POST a /pedido con departamento,
 *     opciones (talla/color) y transportadora; lo atiende el script común.
 *   - Cada foto una sola vez: la del bloque "problema" no está en la galería.
 */
import { SCRIPT_TRANSPORTADORA } from "./renderer-v3";
import { SCRIPT_GEO, opcionesDeDepartamento } from "../geo-colombia";

export interface ContenidoPro {
  chip: string;
  titulo: string;
  tituloResaltado: string;
  lead: string;
  bullets: string[];
  cta: string;
  problema: { eyebrow: string; titulo: string; texto: string };
  beneficios: Array<{ icono: string; titulo: string; texto: string }>;
  pasos: Array<{ titulo: string; texto: string }>;
  faq: Array<{ p: string; r: string }>;
}

export interface OpcionesPro {
  contenido: ContenidoPro;
  producto: { id?: number; name: string; price: number; categoria?: string | null; opciones?: Array<{ nombre: string; valores: string[]; obligatoria?: boolean }> | null };
  /** Fotos YA sin repetidas por contenido (fotosUnicasDelProducto). */
  fotos: string[];
  negocio: { nombre: string; whatsapp?: string | null };
  /** action del formulario (o el marcador __FORM_ACTION__). */
  accion: string;
  /** Compatibilidad: se deriva de `modo`. */
  pagoAlRecibir?: boolean;
  /** Plazo de entrega configurado por el negocio; null = no se promete. */
  plazoEntrega?: string | null;
  garantia?: string | null;
  testimonios?: Array<{ nombre: string; ciudad?: string; texto: string }>;
  ofertas?: Array<{ nombre: string; cantidad: number; precio: number }>;
  /**
   * Cómo cierra la venta:
   *  - contraentrega: formulario de pedido (físico de Dropi).
   *  - pago: botones a los enlaces de pago reales (digital, físico pagado antes).
   *  - whatsapp: un botón a WhatsApp (servicios, o digital sin enlaces).
   */
  modo?: "contraentrega" | "pago" | "whatsapp";
  tipo?: "fisico" | "digital" | "servicio";
  enlaces?: { mercadopago?: string; paypal?: string };
  /** "pro" (neutro, del dueño) o "clinico" (azul/blanco, botón verde, checkout en pasos). */
  estilo?: "pro" | "clinico";
}

// ── Paletas neutras, para ambos sexos ─────────────────────────────────────
export const PALETAS = {
  salvia: { p: "#0F766E", p2: "#14B8A6", soft: "#F0FDFA" },
  petroleo: { p: "#155E75", p2: "#0891B2", soft: "#ECFEFF" },
  terracota: { p: "#C2410C", p2: "#EA580C", soft: "#FFF7ED" },
  oliva: { p: "#4D7C0F", p2: "#65A30D", soft: "#F7FEE7" },
  carbon: { p: "#1C1917", p2: "#57534E", soft: "#F5F5F4" },
} as const;

export function paletaPorCategoria(categoria?: string | null): keyof typeof PALETAS {
  const c = String(categoria || "").toLowerCase();
  if (/salud|bienestar|belleza|cuidado|beb[eé]|maternidad/.test(c)) return "salvia";
  if (/tecnolog|electr[oó]n|celular|computa|gamer|audio/.test(c)) return "petroleo";
  if (/mascota|cocina|comida|deporte|fitness/.test(c)) return "terracota";
  if (/hogar|jard[ií]n|herramienta|organiza/.test(c)) return "oliva";
  if (/moda|accesorio|ropa|bolso|joyer|reloj/.test(c)) return "carbon";
  return "salvia";
}

const ICONOS: Record<string, string> = {
  truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v.01M18 15v.01"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  shield: '<path d="M12 3l8 3v6c0 4.6-3.4 8.3-8 9-4.6-.7-8-4.4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  spine: '<path d="M12 2v20M8 5h8M7 9h10M8 13h8M7 17h10"/>',
  muscle: '<path d="M5 15c0-5 3-9 7-10l2 3-3 2c2 1 5 1 7 3 1 2 0 5-3 5H8c-2 0-3-1-3-3z"/>',
  leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19l7-7"/>',
  shirt: '<path d="M8 3l4 3 4-3 5 4-3 3v11H6V10L3 7z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19.3" r="1"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  star: '<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  paw: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 1.5-1.5 2-4 2s-4-.5-4-2z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  wa: '<path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.1.1.3 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.8-.1 1.3z"/>',
};
export const NOMBRES_DE_ICONOS = Object.keys(ICONOS).filter((k) => !["arrow", "wa", "star"].includes(k));

const svg = (n: string, cls = "ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] || ICONOS.check}</svg>`;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const CSS = `
:root{--ink:#1C1917;--ink-2:#57534E;--line:#E7E5E4;--bg:#fff;--bg-2:#FAFAF9;--danger:#B91C1C;
--radius-xl:32px;--radius-lg:20px;--radius-md:16px;--radius-sm:12px;
--shadow-card:0 1px 2px rgba(28,25,23,.04),0 8px 24px -12px rgba(28,25,23,.14);
--shadow-cta:0 12px 28px -10px color-mix(in srgb,var(--p) 70%,transparent);
--font:"Plus Jakarta Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--maxw:1180px;--gutter:clamp(16px,4vw,32px);color-scheme:light}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{animation:none!important;transition:none!important}}
body{margin:0;font-family:var(--font);color:var(--ink);background:var(--bg);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}button,input,select,textarea{font:inherit;color:inherit}a{color:inherit}
.wrap{max-width:var(--maxw);margin:0 auto;padding-inline:var(--gutter)}
.grad-text{background:linear-gradient(90deg,var(--p),var(--p2));-webkit-background-clip:text;background-clip:text;color:transparent}
.eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--p)}
h1,h2,h3{margin:0;line-height:1.08;letter-spacing:-.02em;text-wrap:balance}h2{font-size:clamp(28px,4.2vw,40px);font-weight:800}
.sec{padding-block:clamp(56px,8vw,96px)}.sec-head{display:grid;gap:10px;text-align:center;justify-items:center;margin-bottom:clamp(28px,4vw,48px)}
.ico{width:22px;height:22px;flex:none}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:0;cursor:pointer;text-decoration:none;font-weight:800;border-radius:999px;transition:transform .15s ease,box-shadow .2s ease}
.btn-cta{background:linear-gradient(90deg,var(--p),var(--p2));color:#fff;padding:18px 28px;font-size:17px;box-shadow:var(--shadow-cta)}.btn-cta:hover{transform:translateY(-2px)}
.btn-sm{background:var(--p);color:#fff;padding:10px 18px;font-size:14px}.btn-block{width:100%}
.topbar{background:var(--ink);color:#fff;font-size:13px;font-weight:600}.topbar-in{display:flex;justify-content:center;gap:28px;flex-wrap:wrap;padding:9px var(--gutter);text-align:center}
.hdr{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.9);backdrop-filter:saturate(1.6) blur(12px);-webkit-backdrop-filter:saturate(1.6) blur(12px);border-bottom:1px solid var(--line)}
.hdr-in{display:flex;align-items:center;justify-content:space-between;height:64px;gap:12px}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;text-decoration:none;min-width:0}.logo span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.logo-mark{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;color:#fff;font-size:13px;background:linear-gradient(135deg,var(--p2),var(--p));flex:none}
.hero{background:linear-gradient(180deg,var(--p-soft) 0%,#fff 55%);padding-block:clamp(24px,5vw,64px) clamp(40px,6vw,72px)}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(24px,5vw,64px);align-items:start}
.hero-info{display:grid;gap:18px;align-content:start;min-width:0}
.chip{display:inline-flex;align-items:center;gap:8px;justify-self:start;background:color-mix(in srgb,var(--p) 12%,white);color:var(--p);font-weight:800;font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:7px 12px;border-radius:999px}
.chip i{width:8px;height:8px;border-radius:50%;background:var(--p2)}
.hero h1{font-size:clamp(34px,5.4vw,56px);font-weight:800}.lead{margin:0;font-size:18px;color:var(--ink-2);max-width:52ch}.lead strong{color:var(--ink)}
.checks{list-style:none;margin:0;padding:0;display:grid;gap:10px}.checks li{display:flex;gap:10px;align-items:flex-start;font-weight:600}
.checks .ck{width:22px;height:22px;border-radius:50%;background:color-mix(in srgb,var(--p2) 18%,white);color:var(--p);display:grid;place-items:center;flex:none;margin-top:1px}.checks .ck .ico{width:14px;height:14px}
.price-card{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid var(--line);border-radius:var(--radius-md);padding:14px 18px;box-shadow:var(--shadow-card)}
.price-card small{display:block;font-size:12px;font-weight:700;color:var(--ink-2);text-transform:uppercase;letter-spacing:.08em}.price-now{font-size:30px;font-weight:800;font-variant-numeric:tabular-nums}
.price-note{font-size:13px;font-weight:700;color:var(--p);text-align:right}
.gallery{position:relative;display:grid;gap:12px;min-width:0}
.g-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:var(--radius-xl);background:var(--bg-2);scrollbar-width:none;aspect-ratio:1/1;box-shadow:0 30px 60px -30px color-mix(in srgb,var(--p) 45%,transparent)}
.g-track::-webkit-scrollbar{display:none}.g-slide{flex:0 0 100%;scroll-snap-align:center;overflow:hidden}.g-slide img{width:100%;height:100%;object-fit:cover}
.g-thumbs{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none}
.g-thumbs button{flex:0 0 72px;height:72px;padding:0;border-radius:14px;overflow:hidden;border:2px solid transparent;background:var(--bg-2);cursor:pointer;opacity:.6}
.g-thumbs button[aria-current="true"]{border-color:var(--p);opacity:1}.g-thumbs button{background-size:cover;background-position:center}
.g-dots,.g-count{display:none}
.trust{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:clamp(28px,4vw,48px)}
.trust-item{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:var(--radius-md);padding:14px 16px}
.trust-ico{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--p) 10%,white);color:var(--p);flex:none}
.trust-item b{display:block;font-size:14px}.trust-item span{font-size:12.5px;color:var(--ink-2)}
.prob-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:clamp(24px,5vw,64px);align-items:center}.prob-grid.solo{grid-template-columns:1fr;max-width:860px;margin:0 auto}
.prob-img{border-radius:var(--radius-xl);overflow:hidden;aspect-ratio:4/5;background:var(--bg-2);box-shadow:var(--shadow-card)}.prob-img img{width:100%;height:100%;object-fit:cover}
.prob-text{display:grid;gap:16px;min-width:0}.prob-text p{margin:0;color:var(--ink-2);font-size:17px}
.bens{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
.ben{background:#fff;border:1px solid var(--line);border-radius:var(--radius-md);padding:18px;display:grid;gap:6px;box-shadow:var(--shadow-card)}
.ben .trust-ico{width:40px;height:40px}.ben b{font-size:16px}.ben span{color:var(--ink-2);font-size:14px}
.dark{background:var(--ink);color:#fff;position:relative;overflow:hidden}
.dark::before{content:"";position:absolute;inset:-40% -10% auto auto;width:520px;height:520px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--p) 45%,transparent),transparent);pointer-events:none}
.dark .eyebrow{color:color-mix(in srgb,var(--p2) 70%,white)}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;position:relative;list-style:none;margin:0;padding:0}
.step{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-lg);padding:26px;display:grid;gap:10px}
.step-n{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;font-weight:800;font-size:20px;background:linear-gradient(135deg,var(--p2),var(--p));color:#fff}
.step h3{font-size:20px;font-weight:700}.step p{margin:0;color:#D6D3D1}
.testis{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.testi{margin:0;background:#fff;border:1px solid var(--line);border-radius:var(--radius-lg);padding:22px;display:grid;gap:14px;align-content:space-between;box-shadow:var(--shadow-card)}
.testi q{quotes:"\\201C" "\\201D";font-size:15.5px;line-height:1.6}.who{display:flex;align-items:center;gap:10px}
.avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--p),var(--p2));flex:none}
.who b{display:block;font-size:14px}.who span{font-size:12.5px;color:var(--ink-2)}
.order-sec{background:linear-gradient(180deg,#fff,var(--p-soft))}
.order{max-width:640px;margin:0 auto;background:#fff;border-radius:var(--radius-xl);border:1px solid var(--line);box-shadow:0 40px 80px -40px color-mix(in srgb,var(--p) 40%,transparent);padding:clamp(20px,4vw,36px);display:grid;gap:18px}
.order h2{font-size:26px;text-align:center}
.packs{display:grid;gap:10px}
.pack{position:relative;display:flex;align-items:center;gap:14px;border:2px solid var(--line);border-radius:var(--radius-md);padding:16px;cursor:pointer;background:#fff}
.pack input{position:absolute;opacity:0;pointer-events:none}
.pack .radio{width:22px;height:22px;border-radius:50%;border:2px solid #D6D3D1;flex:none;display:grid;place-items:center}
.pack .radio::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--p);transform:scale(0);transition:.15s}
.pack:has(input:checked){border-color:var(--p);background:color-mix(in srgb,var(--p) 5%,white)}.pack:has(input:checked) .radio{border-color:var(--p)}.pack:has(input:checked) .radio::after{transform:scale(1)}
.pack-info{flex:1;min-width:0}.pack-info b{display:block}.pack-info span{font-size:13px;color:var(--ink-2)}.pack-price b{display:block;font-size:18px;font-variant-numeric:tabular-nums}
.form{display:grid;gap:10px}.form-title{font-weight:800;font-size:15px}
.field{display:grid;gap:6px}.field label,.envio-transportadora label{font-size:13px;font-weight:700;color:var(--ink-2)}
.field input,.field select,.envio-transportadora select{width:100%;border:1.5px solid var(--line);border-radius:14px;padding:15px 16px;background:var(--bg-2);font-size:16px}
.field input:focus,.field select:focus{outline:none;border-color:var(--p);background:#fff;box-shadow:0 0 0 4px color-mix(in srgb,var(--p) 15%,transparent)}
.envio-transportadora{display:grid;gap:6px}.envio-transportadora .tiny{font-size:13px;color:var(--ink-2);margin:0}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.total{display:flex;justify-content:space-between;align-items:center;background:var(--bg-2);border-radius:14px;padding:14px 16px;font-size:14px;font-weight:600}.total b{font-size:22px;font-variant-numeric:tabular-nums}
.fine{text-align:center;font-size:13px;color:var(--ink-2);margin:0}
.faq{max-width:760px;margin:0 auto;display:grid;gap:10px}
.faq details{border:1px solid var(--line);border-radius:var(--radius-md);background:#fff;overflow:hidden}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 20px;font-weight:700}.faq summary::-webkit-details-marker{display:none}
.faq summary .pm{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--bg-2);color:var(--p);font-weight:800;flex:none;transition:transform .2s}
.faq details[open] .pm{transform:rotate(45deg);background:var(--p);color:#fff}.faq details p{margin:0;padding:0 20px 18px;color:var(--ink-2)}
.guarantee{display:flex;gap:20px;align-items:center;max-width:760px;margin:0 auto;border-radius:var(--radius-lg);padding:24px;background:color-mix(in srgb,var(--p) 8%,white);border:1px dashed color-mix(in srgb,var(--p) 40%,white)}
.seal{width:84px;height:84px;border-radius:50%;flex:none;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--p2),var(--p))}.seal .ico{width:38px;height:38px}
.guarantee h3{font-size:20px;margin-bottom:6px}.guarantee p{margin:0;color:var(--ink-2)}
.foot{background:var(--ink);color:#A8A29E;font-size:13px;text-align:center;padding-block:28px}
.sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;display:none;padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));background:rgba(255,255,255,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);transform:translateY(110%);transition:transform .3s ease}
.sticky.show{transform:none}.sticky-in{display:flex;align-items:center;gap:12px}.sticky-price b{font-size:19px;font-variant-numeric:tabular-nums}.sticky .btn-cta{flex:1;padding:15px 18px;font-size:16px}
.wa{position:fixed;right:20px;bottom:20px;z-index:45;width:58px;height:58px;border-radius:50%;background:#22c55e;color:#fff;display:grid;place-items:center;box-shadow:0 12px 24px -8px rgba(34,197,94,.7)}.wa .ico{width:30px;height:30px}
@media (max-width:760px){
body{font-size:15.5px;padding-bottom:84px}.hdr-in{height:56px}.logo{font-size:15px}.btn-sm{padding:9px 14px;font-size:13px}
.hero{padding-block:0 32px;background:linear-gradient(180deg,#fff 0%,var(--p-soft) 100%)}.hero .wrap{padding-inline:0}
.hero-grid{grid-template-columns:minmax(0,1fr);gap:0}.hero-info{padding:20px var(--gutter) 0;gap:14px}.gallery{gap:0}
.g-track{border-radius:0 0 28px 28px;box-shadow:none}.g-thumbs{display:none}
.g-dots{display:flex;gap:6px;position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(28,25,23,.35);backdrop-filter:blur(8px);padding:6px 8px;border-radius:999px}
.g-dots i{width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.55);transition:width .25s}.g-dots i.on{width:18px;background:#fff}
.g-count{display:block;position:absolute;top:14px;left:14px;background:rgba(28,25,23,.55);color:#fff;font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px}
.hero h1{font-size:clamp(30px,8.4vw,38px)}.lead{font-size:16px}.price-now{font-size:28px}.hero .btn-cta{width:100%}
.trust{grid-template-columns:1fr 1fr;gap:8px;margin-top:22px;padding-inline:var(--gutter)}.trust-item{flex-direction:column;align-items:flex-start;gap:8px;padding:14px}.trust-ico{width:36px;height:36px;border-radius:10px}
.sec{padding-block:52px}.sec-head{text-align:left;justify-items:start;margin-bottom:22px}h2{font-size:28px}
.prob-grid{grid-template-columns:1fr;gap:20px}.prob-img{aspect-ratio:16/11;border-radius:24px}.prob-text p{font-size:16px}
.bens{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:10px;margin-inline:calc(var(--gutter) * -1);padding:4px var(--gutter) 8px;scrollbar-width:none}.bens::-webkit-scrollbar{display:none}.ben{flex:0 0 72%;scroll-snap-align:start}
.steps{grid-template-columns:1fr;gap:0}.step{background:none;border:0;padding:0 0 26px 64px;position:relative}.step-n{position:absolute;left:0;top:0;width:44px;height:44px;font-size:18px}
.step:not(:last-child)::before{content:"";position:absolute;left:21px;top:50px;bottom:6px;width:2px;background:linear-gradient(var(--p2),transparent)}.step h3{font-size:18px;padding-top:10px}
.testis{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:12px;margin-inline:calc(var(--gutter) * -1);padding:4px var(--gutter) 10px;scrollbar-width:none}.testi{flex:0 0 84%;scroll-snap-align:start}
.order{border-radius:26px;padding:20px 16px}.order h2{font-size:24px}.row2{grid-template-columns:1fr}.guarantee{flex-direction:column;text-align:center}.sticky{display:block}.wa{display:none}}
@media (min-width:761px) and (max-width:1000px){.trust{grid-template-columns:1fr 1fr}.steps,.testis{grid-template-columns:1fr 1fr}}
.paso-form{display:flex;align-items:center;gap:10px;font-weight:800;font-size:16px;margin-top:6px}
.paso-form i{font-style:normal;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--p) 12%,white);color:var(--p);font-size:14px}
.pago-fijo{display:flex;align-items:center;gap:10px;border:2px solid var(--p);border-radius:14px;padding:14px 16px;font-weight:700;background:color-mix(in srgb,var(--p) 5%,white)}
.resumen{border:1px solid var(--line);border-radius:var(--radius-md);padding:16px;display:grid;gap:10px;background:var(--bg-2)}
.resumen-fila{display:flex;justify-content:space-between;gap:12px;font-size:14px}.resumen-fila.total-r{font-size:18px;font-weight:800;border-top:1px solid var(--line);padding-top:10px}
.pagos{display:grid;gap:10px}.btn-alt{background:#fff;color:var(--ink);border:2px solid var(--line);padding:16px 24px;font-size:16px}
.seguro{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--ink-2)}.seguro .ico{width:18px;height:18px;color:var(--p)}
/* ── Estilo CLÍNICO (azul y blanco, botón verde: imagen de referencia del dueño) ── */
body.clinico{background:#F1F6FF}
.clinico .hero{background:linear-gradient(180deg,#fff 0%,#EAF2FF 100%)}
.clinico .btn-cta{background:#16A34A;box-shadow:0 12px 28px -10px rgba(22,163,74,.6)}
.clinico .btn-sm{background:#16A34A}
.clinico .grad-text{background:none;color:var(--p);-webkit-text-fill-color:var(--p)}
.clinico .chip{background:#DBEAFE;color:#1D4ED8}
.clinico .dark{background:linear-gradient(135deg,#1E3A8A,#1D4ED8)}
.clinico .dark::before{display:none}
.clinico .sec:not(.dark):not(.order-sec)>.wrap{background:#fff;border-radius:28px;padding-block:clamp(24px,4vw,40px);box-shadow:0 10px 30px -18px rgba(29,78,216,.25)}
.clinico .order-sec{background:transparent}
.clinico .order{border:0;box-shadow:0 30px 60px -30px rgba(29,78,216,.35)}
.clinico .order h2{background:linear-gradient(135deg,#1D4ED8,#3B82F6);color:#fff;margin:calc(clamp(20px,4vw,36px) * -1) calc(clamp(20px,4vw,36px) * -1) 0;padding:22px;border-radius:var(--radius-xl) var(--radius-xl) 0 0;text-align:left}
.clinico .step{background:rgba(255,255,255,.08)}
.clinico .foot{background:#0F1E4A}
@media (max-width:760px){.clinico .sec:not(.dark):not(.order-sec)>.wrap{border-radius:22px;margin-inline:12px;padding-inline:16px}.clinico .order h2{margin:-20px -16px 0;border-radius:26px 26px 0 0}}
`;

const SCRIPT = `(function(){
var t=document.getElementById('gtrack');if(t){var d=[].slice.call(document.querySelectorAll('#gdots i')),th=[].slice.call(document.querySelectorAll('.g-thumbs button')),c=document.getElementById('gcount');
var s=function(i){d.forEach(function(x,k){x.classList.toggle('on',k===i)});th.forEach(function(x,k){x.setAttribute('aria-current',k===i)});if(c)c.textContent=(i+1)+'/'+(d.length||th.length)};
t.addEventListener('scroll',function(){s(Math.round(t.scrollLeft/t.clientWidth))},{passive:true});th.forEach(function(b){b.onclick=function(){t.scrollTo({left:t.clientWidth*+b.dataset.i,behavior:'smooth'})}});}
var tot=document.getElementById('total'),tr=document.getElementById('totalResumen');[].slice.call(document.querySelectorAll('input[name="oferta"]')).forEach(function(r){r.onchange=function(){if(tot)tot.textContent=r.dataset.total;if(tr)tr.textContent=r.dataset.total}});
var st=document.getElementById('sticky'),hc=document.getElementById('heroCta'),ob=document.getElementById('pedido');if(st&&hc&&ob&&'IntersectionObserver' in window){var past=false,on=false,u=function(){st.classList.toggle('show',past&&!on)};
new IntersectionObserver(function(e){past=!e[0].isIntersecting&&e[0].boundingClientRect.top<0;u()}).observe(hc);new IntersectionObserver(function(e){on=e[0].isIntersecting;u()},{threshold:.15}).observe(ob);}
})();`;

export function renderizarLandingPro(o: OpcionesPro): string {
  const c = o.contenido;
  const estilo = o.estilo === "clinico" ? "clinico" : "pro";
  const pal = estilo === "clinico" ? { p: "#1D4ED8", p2: "#3B82F6", soft: "#EFF6FF" } : PALETAS[paletaPorCategoria(o.producto.categoria)];
  const tipo = o.tipo || "fisico";
  const modo = o.modo || (o.pagoAlRecibir ? "contraentrega" : "whatsapp");
  // Desde acá, "al recibir" sale del modo (el campo viejo queda por compatibilidad).
  o = { ...o, pagoAlRecibir: modo === "contraentrega" };
  const enlaces = o.enlaces || {};
  const precio = Number(o.producto.price) || 0;
  // Fotos: la del bloque "problema" se RESERVA (no va en la galería) cuando
  // hay 3 o más; con menos, el bloque va sin foto. Nunca la misma dos veces.
  const fotos = [...new Set(o.fotos.filter(Boolean))];
  const fotoProblema = fotos.length >= 3 ? fotos[fotos.length - 1] : "";
  const galeria = fotoProblema ? fotos.slice(0, -1) : fotos;
  const iniciales = (o.negocio.nombre || o.producto.name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "VP";
  const wa = String(o.negocio.whatsapp || "").replace(/\D/g, "");
  const ofertas = (o.ofertas || []).filter((x) => x && x.nombre && Number(x.precio) > 0 && Number(x.cantidad) > 0);
  const totalInicial = ofertas[0]?.precio ?? precio;

  type Fila = [string, string, string];
  const bar = (tipo === "fisico"
    ? [
        o.pagoAlRecibir ? `💵 <b>PAGO CONTRA ENTREGA</b>` : "",
        `🚚 <b>ENVÍO A DOMICILIO</b>${o.plazoEntrega ? ` · ${esc(o.plazoEntrega)}` : ""}`,
        o.garantia ? `🛡️ <b>${esc(o.garantia)}</b>` : "",
      ]
    : tipo === "digital"
      ? [o.plazoEntrega ? `⚡ <b>${esc(o.plazoEntrega)}</b>` : `⚡ <b>ACCESO DIGITAL</b>`, wa ? `💬 Soporte por <b>WhatsApp</b>` : "", o.garantia ? `🛡️ <b>${esc(o.garantia)}</b>` : ""]
      : [wa ? `💬 <b>AGENDA POR WHATSAPP</b>` : "", o.garantia ? `🛡️ <b>${esc(o.garantia)}</b>` : ""]
  ).filter(Boolean).map((x) => `<span>${x}</span>`).join("");

  const confianza: Fila[] = (tipo === "fisico"
    ? [
        ["truck", "Envío a domicilio", o.plazoEntrega || "Te confirmamos por WhatsApp"] as Fila,
        ...(o.pagoAlRecibir ? [["cash", "Pago contra entrega", "Pagas al recibir"] as Fila] : []),
        ...(o.garantia ? [["shield", "Garantía", o.garantia] as Fila] : []),
        ["lock", "Compra segura", "Tus datos protegidos"] as Fila,
        ...(wa ? [["chat", "Atención", "Por WhatsApp"] as Fila] : []),
      ]
    : tipo === "digital"
      ? [
          ["bolt", "Acceso digital", o.plazoEntrega || "Te llega después del pago"] as Fila,
          ...(enlaces.mercadopago || enlaces.paypal ? [["lock", "Pago seguro", [enlaces.mercadopago ? "MercadoPago" : "", enlaces.paypal ? "PayPal" : ""].filter(Boolean).join(" o ")] as Fila] : []),
          ...(wa ? [["chat", "Soporte", "Por WhatsApp"] as Fila] : []),
          ...(o.garantia ? [["shield", "Garantía", o.garantia] as Fila] : []),
        ]
      : [
          ...(wa ? [["chat", "Atención directa", "Por WhatsApp"] as Fila] : []),
          ["clock", "Agenda", "Coordinamos el horario contigo"] as Fila,
          ...(o.garantia ? [["shield", "Garantía", o.garantia] as Fila] : []),
        ]
  ).slice(0, 4);

  const opciones = (o.producto.opciones || []).filter((x) => x?.nombre && Array.isArray(x.valores) && x.valores.length);
  const camposOpciones = opciones.map((x) => `<div class="field"><label>${esc(x.nombre)}${x.obligatoria ? " *" : ""}</label><select name="opcion_${esc(x.nombre)}" ${x.obligatoria ? "required" : ""}><option value="">Elegí ${esc(x.nombre.toLowerCase())}…</option>${x.valores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></div>`).join("");

  const img = (src: string, alt: string, eager = false) => `<img src="${esc(src)}" alt="${esc(alt)}"${eager ? "" : ' loading="lazy"'} decoding="async">`;
  const testimonios = (o.testimonios || []).filter((t) => t?.nombre && t?.texto).slice(0, 3);
  const lead = esc(c.lead).replace(esc(o.producto.name), `<strong>${esc(o.producto.name)}</strong>`);
  const waLink = (texto: string) => (wa ? `https://wa.me/${wa}?text=${encodeURIComponent(texto)}` : "");

  // ── Cierre según el modo ────────────────────────────────────────────────
  const packs = ofertas.length > 1
    ? `<div class="packs" role="radiogroup" aria-label="Ofertas">${ofertas.map((x, i) => `<label class="pack"><input type="radio" name="oferta" value="${i}" data-total="${cop(x.precio)}" ${i === 0 ? "checked" : ""}><span class="radio"></span><span class="pack-info"><b>${esc(x.nombre)}</b><span>${cop(x.precio / x.cantidad)} c/u</span></span><span class="pack-price"><b>${cop(x.precio)}</b></span></label>`).join("")}</div>`
    : ofertas.length === 1 ? `<input type="hidden" name="oferta" value="0">` : `<input type="hidden" name="cantidad" value="1">`;
  const resumen = totalInicial > 0
    ? `<div class="resumen"><b>Resumen de tu compra</b><div class="resumen-fila"><span>${esc(o.producto.name)}${ofertas[0] ? ` · ${esc(ofertas[0].nombre)}` : " × 1"}</span><span id="totalResumen">${cop(totalInicial)}</span></div>${tipo === "fisico" ? `<div class="resumen-fila"><span>Envío</span><span>${o.plazoEntrega ? esc(o.plazoEntrega) : "Se confirma por WhatsApp"}</span></div>` : ""}<div class="resumen-fila total-r"><span>Total${o.pagoAlRecibir ? " al recibir" : ""}</span><b id="total">${cop(totalInicial)}</b></div></div>`
    : "";
  let bloquePedido: string;
  if (modo === "contraentrega") {
    bloquePedido = `<h2>${ofertas.length > 1 ? "Elige tu oferta" : "Haz tu pedido"}</h2>
  <form class="form checkout-form" method="post" action="${esc(o.accion)}">
    ${packs}
    ${camposOpciones}
    <div class="paso-form"><i>1</i>Datos de contacto</div>
    <div class="field"><input name="nombre" placeholder="Nombre completo" autocomplete="name" required></div>
    <div class="field"><input name="telefono" placeholder="WhatsApp / Celular" inputmode="tel" autocomplete="tel" required></div>
    <div class="paso-form"><i>2</i>Dirección de envío</div>
    <div class="row2"><div class="field"><select name="departamento" autocomplete="address-level1" required aria-label="Departamento">${opcionesDeDepartamento(esc)}</select></div><div class="field"><input name="ciudad" list="ciudades-datalist" placeholder="Ciudad o municipio" autocomplete="address-level2" required><datalist id="ciudades-datalist"></datalist></div></div>
    <div class="field"><input name="direccion" placeholder="Dirección (calle, carrera, número)" autocomplete="street-address" required></div>
    <div class="row2"><div class="field"><input name="barrio" placeholder="Barrio"></div><div class="field"><input name="referencia" placeholder="Referencia (opcional)"></div></div>
    <div class="envio-transportadora" hidden></div>
    <div class="paso-form"><i>3</i>Forma de pago</div>
    <div class="pago-fijo">${svg("cash")} Contra entrega (efectivo al recibir)</div>
    ${resumen || `<div class="total"><span>Total a pagar al recibir</span><b id="total"></b></div>`}
    <button class="btn btn-cta btn-block" type="submit">Confirmar pedido ${svg("arrow")}</button>
    <p class="fine">🔒 Sin pagos anticipados · Tus datos están protegidos</p>
  </form>`;
  } else if (modo === "pago") {
    const botones = [
      enlaces.mercadopago ? `<a class="btn btn-cta btn-block" href="${esc(enlaces.mercadopago)}" target="_blank" rel="noopener">Pagar con MercadoPago ${svg("arrow")}</a>` : "",
      enlaces.paypal ? `<a class="btn btn-alt btn-block" href="${esc(enlaces.paypal)}" target="_blank" rel="noopener">Pagar con PayPal</a>` : "",
      wa ? `<a class="btn btn-alt btn-block" href="${esc(waLink(`Hola, quiero pagar ${o.producto.name} por transferencia`))}" target="_blank" rel="noopener">${svg("wa")} Pagar por transferencia</a>` : "",
    ].filter(Boolean);
    bloquePedido = `<h2>${tipo === "digital" ? "Obtén tu acceso" : "Haz tu pedido"}</h2>
  ${resumen}
  <div class="pagos">${botones.join("") || `<p class="fine">Escríbenos para coordinar el pago.</p>`}</div>
  <p class="fine">🔒 ${tipo === "digital" ? "Después del pago te enviamos el acceso" : "Pago seguro · Te confirmamos el envío por WhatsApp"}</p>`;
  } else {
    bloquePedido = `<h2>${tipo === "servicio" ? "Agenda tu cita" : "Quiero más información"}</h2>
  ${precio > 0 ? resumen : ""}
  ${wa ? `<a class="btn btn-cta btn-block" href="${esc(waLink(`Hola, me interesa ${o.producto.name}`))}" target="_blank" rel="noopener">${svg("wa")} ${tipo === "servicio" ? "Agendar por WhatsApp" : "Escribir por WhatsApp"}</a>` : `<p class="fine">Pronto habilitaremos el contacto.</p>`}
  <p class="fine">Te respondemos personalmente.</p>`;
  }
  const textoSticky = modo === "contraentrega" ? "Pedir · Pago al recibir" : modo === "pago" ? (tipo === "digital" ? "Comprar ahora" : "Pedir ahora") : tipo === "servicio" ? "Agendar" : "Quiero info";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.producto.name)} · ${esc(c.titulo)} ${esc(c.tituloResaltado)}</title>
${galeria[0] || fotoProblema ? `<meta property="og:image" content="${esc(galeria[0] || fotoProblema)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<style>:root{--p:${pal.p};--p2:${pal.p2};--p-soft:${pal.soft}}${CSS}</style></head>
<body class="${estilo}">
<div class="topbar"><div class="topbar-in">${bar}</div></div>
<header class="hdr"><div class="wrap hdr-in"><a class="logo" href="#top"><span class="logo-mark">${esc(iniciales)}</span><span>${esc(o.negocio.nombre || o.producto.name)}</span></a>${estilo === "clinico" ? `<span class="seguro">${svg("shield")} Compra 100% segura</span>` : `<a class="btn btn-sm" href="#pedido">${esc(textoSticky.split(" ·")[0])}</a>`}</div></header>
<main id="top">
<section class="hero"><div class="wrap"><div class="hero-grid">
  ${galeria.length ? `<div class="gallery"><div class="g-track" id="gtrack" aria-label="Fotos del producto">${galeria.map((s, i) => `<div class="g-slide">${img(s, `${o.producto.name} foto ${i + 1}`, i === 0)}</div>`).join("")}</div>
  ${galeria.length > 1 ? `<span class="g-count" id="gcount">1/${galeria.length}</span><div class="g-dots" id="gdots">${galeria.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div><div class="g-thumbs">${galeria.map((s, i) => `<button type="button" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}" data-i="${i}" style="background-image:url('${esc(s)}')"></button>`).join("")}</div>` : ""}</div>` : ""}
  <div class="hero-info">
    <span class="chip"><i></i>${esc(c.chip)}</span>
    <h1>${esc(c.titulo)} <span class="grad-text">${esc(c.tituloResaltado)}</span></h1>
    <p class="lead">${lead}</p>
    <ul class="checks">${c.bullets.map((b) => `<li><span class="ck">${svg("check")}</span>${esc(b)}</li>`).join("")}</ul>
    ${precio > 0 ? `<div class="price-card"><div><small>Precio</small><span class="price-now">${cop(ofertas[0]?.precio ?? precio)}</span></div>${o.pagoAlRecibir ? `<span class="price-note">Pagas al recibir</span>` : ""}</div>` : ""}
    <a class="btn btn-cta" href="#pedido" id="heroCta">${esc(c.cta)} ${svg("arrow")}</a>
  </div>
</div>
<div class="trust">${confianza.map((t) => `<div class="trust-item"><span class="trust-ico">${svg(t[0])}</span><div><b>${esc(t[1])}</b><span>${esc(t[2])}</span></div></div>`).join("")}</div>
</div></section>

<section class="sec"><div class="wrap prob-grid${fotoProblema ? "" : " solo"}">
  ${fotoProblema ? `<div class="prob-img">${img(fotoProblema, c.problema.titulo)}</div>` : ""}
  <div class="prob-text"><span class="eyebrow">${esc(c.problema.eyebrow)}</span><h2>${esc(c.problema.titulo)}</h2><p>${esc(c.problema.texto)}</p>
  <div class="bens">${c.beneficios.map((b) => `<div class="ben"><span class="trust-ico">${svg(b.icono)}</span><b>${esc(b.titulo)}</b><span>${esc(b.texto)}</span></div>`).join("")}</div></div>
</div></section>

<section class="sec dark"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">Así de fácil</span><h2>${c.pasos.length} pasos y listo</h2></div>
  <ol class="steps">${c.pasos.map((s, i) => `<li class="step"><span class="step-n">${i + 1}</span><h3>${esc(s.titulo)}</h3><p>${esc(s.texto)}</p></li>`).join("")}</ol>
</div></section>

${testimonios.length ? `<section class="sec"><div class="wrap"><div class="sec-head"><span class="eyebrow">Opiniones</span><h2>Lo que dicen nuestros clientes</h2></div>
<div class="testis">${testimonios.map((t) => `<figure class="testi"><q>${esc(t.texto)}</q><figcaption class="who"><span class="avatar">${esc(t.nombre.trim()[0] || "")}</span><div><b>${esc(t.nombre)}</b>${t.ciudad ? `<span>${esc(t.ciudad)}</span>` : ""}</div></figcaption></figure>`).join("")}</div></div></section>` : ""}

<section class="sec order-sec" id="pedido"><div class="wrap"><div class="order" id="orderBox">
  ${bloquePedido}
</div></div></section>

${c.faq.length ? `<section class="sec"><div class="wrap"><div class="sec-head"><h2>Preguntas frecuentes</h2></div>
<div class="faq">${c.faq.map((f, i) => `<details ${i ? "" : "open"}><summary>${esc(f.p)}<span class="pm">+</span></summary><p>${esc(f.r)}</p></details>`).join("")}</div></div></section>` : ""}

${o.garantia ? `<section class="sec" style="padding-top:0"><div class="wrap"><div class="guarantee"><span class="seal">${svg("shield")}</span><div><h3>Compra con garantía</h3><p>${esc(o.garantia)}</p></div></div></div></section>` : ""}
</main>
<footer class="foot"><div class="wrap">© ${new Date().getFullYear()} ${esc(o.negocio.nombre || o.producto.name)}</div></footer>
<div class="sticky" id="sticky"><div class="sticky-in"><div class="sticky-price">${totalInicial > 0 ? `<b>${cop(totalInicial)}</b>` : ""}</div><a class="btn btn-cta" href="#pedido">${esc(textoSticky)}</a></div></div>
${wa ? `<a class="wa" href="https://wa.me/${wa}?text=${encodeURIComponent(`Hola, quiero información de ${o.producto.name}`)}" target="_blank" rel="noopener" aria-label="Escribir por WhatsApp">${svg("wa")}</a>` : ""}
<script>${SCRIPT}</script><script>${SCRIPT_GEO}</script><script>${SCRIPT_TRANSPORTADORA}</script>
</body></html>`;
}
