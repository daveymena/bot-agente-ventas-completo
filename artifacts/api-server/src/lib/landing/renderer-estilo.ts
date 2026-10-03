/**
 * Landing "ESTILO" (02-10-2026): port a TypeScript del renderer del
 * landing-ai-generator (backend/public-html.js) — la product page COD que el
 * dueño validó con capturas 390px/1366px — con las 4 variantes visuales que
 * ahí se probaron (cod, premium, bold, dark) elegibles desde el Studio.
 *
 * Diferencias con el original, todas pensadas para vivir en este repo:
 *   - El formulario habla el idioma del endpoint real del bot: nombre,
 *     telefono, departamento (select), ciudad (datalist → select de Dropi vía
 *     SCRIPT_GEO), direccion, referencia y cantidad, con POST a
 *     /api/landing-publica/:slug/pedido (JSON). El cliente no escribe
 *     ciudades a mano: elija primero el departamento y la lista se carga.
 *   - Físico = pedido por formulario; digital/servicio = el envío arma el
 *     mensaje de WhatsApp y muestra los enlaces de pago reales si existen.
 *   - Sin píxel embebido: la página pública lo recibe de lib/landing/monitor
 *     (medir) para no contarlo dos veces.
 *
 * Los textos salen de las MISMAS secciones que edita el Studio
 * (estiloDesdeFila), no de un prompt nuevo: secciones + design son la fuente
 * de verdad y el HTML se recalcula en cada render.
 */
import { SCRIPT_GEO, opcionesDeDepartamento } from "../geo-colombia";
import { formularioConOpciones } from "./renderer";
import { conIconosSeguros } from "./sanear-html";
import { negocioParaRender } from "./negocio-para-render";
import { garantiaDelProducto, testimoniosDelProducto } from "./plantillas";
import { fotosUnicasDelProducto, guardadorDeMetadata } from "../fotos-de-producto";
import { modeloDelProducto } from "../modelo-de-negocio";
import { metadataDelProducto } from "../activos-fabricante";

export const ESTILOS = ["cod", "premium", "bold", "dark"] as const;
export type EstiloVisual = (typeof ESTILOS)[number];

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Acepta "55000", "55.000" o "55,000" y devuelve número entero COP. */
function num(v: unknown): number {
  const s = String(v ?? "").replace(/[^\d]/g, "");
  return s ? Number(s) : 0;
}

const cop = (n: number): string => (n ? n.toLocaleString("es-CO") : "0");

/** El TIMER del generador validado por el dueño (sus capturas del original):
 *  es un DISPOSITIVO DEL DISEÑO ("la oferta de hoy"), no un hecho del
 *  producto: por eso vive como constante del renderer y no lo escribe la IA.
 *  Quitarlo por landing = design.estiloExtras.timer === false. */
const OFERTA_SEGUNDOS = 2 * 60 * 60;

// ── Las mejoras del review (04-10, lo pedido: "textos, ubicación y
// precios") ──────────────────────────────────────────────────────────────
// 1. El ENVÍO deja de ser una afirmación a mano: si el negocio DECLARO
//    "incluido" dice gratis; si no, el valor/neutral que le toca (la misma
//    fuente que usa el anuncio: modelo-de-negocio → fraseCostoEnvio).
async function envioDelNegocio(tenantId: number): Promise<string> {
  try {
    const { getBusinessContext } = await import("../business-context");
    const { fraseCostoEnvio } = await import("../modelo-de-negocio");
    const conds = (await getBusinessContext(tenantId))?.condiciones;
    if (conds) return fraseCostoEnvio(conds);
  } catch { /* sin condiciones: el neutro, que no promete */ }
  return "Envío nacional (se te confirma al pedir)";
}

const ICONS = ["✅", "⚡", "🛡️", "🚚", "💯", "🔄", "🔒", "⭐", "🎯", "🙌"];

export interface DatoTestimonio {
  name?: string;
  city?: string;
  text: string;
}

export interface DatosEstilo {
  accent?: string;
  style?: string;
  productName: string;
  tagline?: string;
  brand?: string;
  slug?: string;
  price?: number | string;
  oldPrice?: number | string;
  discount?: string;
  image?: string;
  /** El envío EN PALABRAS de las condiciones REALES del negocio (ver envioDelNegocio). */
  envio?: string;
  /** El envío corto para el sello (ej: "incluido" / "nacional"). */
  envioCorto?: string;
  /** La garantía SOLO si el dueño la cargó (metadata.garantia). */
  garantia?: string;
  /** El timer del generador validado: encendido por defecto (dispositivo del diseño del dueño); design.estiloExtras.timer===false lo apaga por landing. */
  timer?: boolean;
  gallery?: string[];
  video?: string | null;
  headline?: string;
  subheadline?: string;
  heroBullets?: string[];
  benefits?: string[];
  features?: { title: string; text?: string; icon?: string }[];
  painPoints?: string[];
  useCases?: string[];
  useCasesTitle?: string;
  comparison?: { titulo?: string; conProducto?: string[]; sinProducto?: string[] } | null;
  riskFree?: { title: string; text: string } | null;
  testimonials?: DatoTestimonio[];
  faq?: { q: string; a: string }[];
  announce?: string;
  heroBadge?: string;
  whatsapp?: string;
  pixelId?: string | null;
  kind?: "digital" | "service" | string;
  cta?: string;
}

export interface OpcionesRenderEstilo {
  host?: string;
  /** action del formulario (físico contraentrega). Vacío en digital/servicio. */
  accion?: string;
  pago?: { mercadopago?: string | null; paypal?: string | null } | null;
}

function productoSchema(p: DatosEstilo, host: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.productName,
    image: [p.image, ...(p.gallery || [])].filter(Boolean).slice(0, 8),
    description: p.tagline,
    brand: { "@type": "Brand", name: p.brand },
    offers: {
      "@type": "Offer",
      price: String(num(p.price)),
      priceCurrency: "COP",
      availability: "https://schema.org/InStock",
      url: `${host}/l/${p.slug}`,
    },
    aggregateRating:
      (p.testimonials || []).length >= 3
        ? { "@type": "AggregateRating", ratingValue: "4.8", reviewCount: String((p.testimonials || []).length) }
        : undefined,
  };
}

const jsonLd = (obj: unknown): string => JSON.stringify(obj).replace(/</g, "\\u003c");

/**
 * Qué variante visual va con el producto cuando el admin dejó "IA elige":
 * caro / joyería / belleza / moda → premium (se ve caro), software / app /
 * gaming → dark, descuento grande → promo bold, el resto → COD.
 */
export function elegirEstilo(producto: any | null | undefined, precioAntes?: number | null): EstiloVisual {
  const texto = `${producto?.name || ""} ${producto?.category || ""} ${producto?.description || ""}`.toLowerCase();
  const precio = Number(producto?.price) || 0;
  const antes = Number(precioAntes) || 0;
  if (precio >= 150_000 || /joya|anillo|collar|arete|reloj|dorado|esmeralda|zafiro|perfume|serum|crema|maquillaje|belleza|moda|ropa|zapato/.test(texto)) return "premium";
  if (/software|aplicaci|\bapp\b|gaming|\bgame\b|juego|plataforma|programaci|cripto/.test(texto)) return "dark";
  if (antes > precio && precio > 0 && (antes - precio) / antes >= 0.3) return "bold";
  return "cod";
}

export function renderizarEstilo(p: DatosEstilo, o: OpcionesRenderEstilo = {}): string {
  const host = o.host || "";
  const accion = o.accion || "";
  const pago = { mercadopago: o.pago?.mercadopago || "", paypal: o.pago?.paypal || "" };
  const a = p.accent || "#0a8f47";
  const style = (ESTILOS as readonly string[]).includes(String(p.style)) ? String(p.style) : "cod";
  const fontFams = ["Inter:wght@400;500;600;700;800;900"];
  if (style === "premium") fontFams.unshift("Fraunces:wght@600;700");
  if (style === "bold") fontFams.unshift("Archivo:wght@700;800;900");
  if (style === "dark") fontFams.unshift("Space+Grotesk:wght@500;700");
  const fontsHref = `https://fonts.googleapis.com/css2?family=${fontFams.join("&family=")}&display=swap`;
  const precio = num(p.price);
  const antes = num(p.oldPrice);
  const ahorro = precio && antes && antes > precio ? antes - precio : 0;
  const galeria = (p.gallery || []).filter(Boolean);
  const imagenes = [p.image, ...galeria].filter(Boolean) as string[];
  const wa = String(p.whatsapp || "").replace(/[^\d]/g, "");
  const waLink = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hola, quiero pedir: ${p.productName} ($${cop(precio)} COP). ¿Sigue disponible?`)}`
    : "";
  const pixel = p.pixelId ? String(p.pixelId) : "";

  const esFisico = !(p.kind === "digital" || p.kind === "service");
  const esServicio = p.kind === "service";
  const pagoCorto = esFisico ? "PAGO CONTRA ENTREGA" : esServicio ? "AGENDA TU CITA" : "COMPRA SEGURA";
  // ── El look del GENERADOR ORIGINAL (decisión del dueño, 04-10) ──────────
  // El dueño validó las capturas del generador original (style-bold.html):
  // el announce de oferta, el chip de envío, el timer y la garantía SON
  // dispositivos del diseño validado — no inventos del modelo. Las fuentes
  // honestas cuando existen: la garantía del dueño (metadata.garantia) manda
  // sobre el default; el envío sale de las condiciones del negocio (si
  // declaró incluido, el chip es el del original; si no, el real).
  const envioIncluido = /incluid|gratis/i.test(String(p.envioCorto || "")) || /incluido|gratis/i.test(String(p.envio || ""));
  // El chip se COMPONE sin esc: las piezas son constantes nuestras + texto de
  // las condiciones del negocio ya saneado más abajo (conIconosSeguros).
  const envioChip = envioIncluido ? "Envío grátis<br>a todo el país*" : String(p.envioCorto || p.envio || "Envío nacional").replace(/\s*\(.+\)$/, "").slice(0, 28);
  const envioLargo = esFisico
    ? (envioIncluido ? "Envío grátis a todo el país*" : String(p.envio || "Envío nacional (se te confirma al pedir)"))
    : esServicio ? "Agenda tu cita hoy" : "Acceso inmediato";
  // La garantía: la del dueño si la cargó; si no, LA DEL GENERADOR VALIDADO.
  const garantiaLinea = String(p.garantia || "").trim() || "Garantía de 30 días";
  const trustTop = esFisico
    ? ([
        ["🚚", "Envío gratis", "a todo el país*"],
        ["💵", "Pago contra", "entrega"],
        ...(String(p.garantia || "").trim()
          ? (() => { const g = String(p.garantia).trim().split(/\s+/); return [["🛡️", g[0] || "Garantía", g.slice(1).join(" ") || "del negocio"]]; })()
          : [["🛡️", "Garantía", "de 30 días"]]),
        ["🔒", "Compra", "segura"],
      ] as Array<[string, string, string]>).slice(0, 4)
    : esServicio
      ? [
          ["📅", "Agenda", "flexible"],
          ["🧑‍💼", "Atención", "personalizada"],
          ...(String(p.garantia || "").trim() ? [["🛡️", garantiaLinea, ""]] : [["🛡️", "Garantía", "de satisfacción"]]),
          ["🔒", "Pago", "100% seguro"],
        ]
      : [
          ["⚡", "Acceso", "inmediato"],
          ["🔒", "Pago", "100% seguro"],
          ...(String(p.garantia || "").trim() ? [["🛡️", garantiaLinea, ""]] : [["🛡️", "Garantía", "de 30 días"]]),
          ["✅", "Compra", "confiable"],
        ];
  // ── La franja de cierre: las FILAS DEL GENERADOR VALIDADO ───────────────
  // (el dueño las aprobó con las capturas del original; donde el original
  // decía la garantía, la del dueño manda si la cargó).
  const garantiaConDueño = (deOrigina: string) => (String(p.garantia || "").trim() ? garantiaLinea : deOrigina);
  const trustBottom = esFisico
    ? [
        ["🛡️", garantiaConDueño("Garantía de 30 días"), "por defectos de fábrica"],
        ["💵", "Pago contra entrega", "en todo el país"],
        ["🚚", "Envío gratis", envioIncluido ? "a todo el país*" : "nacional (se confirma al pedir)"],
      ]
    : esServicio
      ? [
          ["🛡️", garantiaConDueño("Satisfacción garantizada"), "o te devolvemos tu dinero"],
          ["🔒", "Pago seguro", "datos cifrados"],
          ["📅", "Reserva flexible", "cambia tu cita cuando quieras"],
        ]
      : [
          ["🛡️", garantiaConDueño("Garantía de 30 días"), "si no funciona como esperabas"],
          ["🔒", "Pago seguro", "datos cifrados"],
          ["⚡", "Entrega inmediata", "a tu correo o WhatsApp"],
        ];

  const bullets = (p.heroBullets?.length ? p.heroBullets : p.benefits || [])
    .slice(0, 5)
    .map((b) => `<li><span>✓</span>${esc(b)}</li>`)
    .join("");

  const listaFeatures: { title: string; text?: string; icon?: string }[] = p.features?.length
    ? p.features
    : (p.benefits || []).map((t) => ({ title: t }));
  const features = listaFeatures.slice(0, 4).map(
      (f, i) => `
    <article class="feat">
      <div class="fi">${esc(f.icon || ICONS[i % ICONS.length])}</div>
      <b>${esc(f.title)}</b>
      ${f.text ? `<p>${esc(f.text)}</p>` : ""}
    </article>`,
    );

  const dolores = (p.painPoints || []).map((d) => `<li><span class="x">✗</span>${esc(d)}</li>`).join("");

  const comparativa = p.comparison
    ? {
        titulo: p.comparison.titulo || "Con y sin este producto",
        con: (p.comparison.conProducto || []).filter(Boolean),
        sin: (p.comparison.sinProducto || []).filter(Boolean),
      }
    : null;
  const hayComparativa = !!comparativa && (comparativa.con.length > 0 || comparativa.sin.length > 0);

  const heroImgs = imagenes.slice(0, 2);
  const thumbs = heroImgs
    .map(
      (src, i) =>
        `<button class="thumb${i === 0 ? " on" : ""}" data-full="${esc(src)}" aria-label="Foto ${i + 1}"><img src="${esc(src)}" alt="${esc(p.productName)} foto ${i + 1}" loading="${i === 0 ? "eager" : "lazy"}"></button>`,
    )
    .join("");

  const caps = p.useCases || [];
  const resto = imagenes.slice(2);
  const fig = (src: string, i: number, extra = ""): string => `
      <figure>
        <img src="${esc(src)}" alt="${esc(caps[i] || p.productName)}" loading="lazy" width="600" height="600">
        ${caps[i] || extra ? `<figcaption>${esc(caps[i] || extra)}</figcaption>` : ""}
      </figure>`;
  const seccionFotos = (lista: string[], desde: number, titulo: string, kicker: string, clase: string): string =>
    lista.length
      ? `<section class="${clase}">
  <div class="wrap">
    <span class="kicker">${esc(kicker)}</span>
    <h2>${esc(titulo)}</h2>
    <div class="shotrow">${lista.map((src, i) => fig(src, desde + i)).join("")}</div>
  </div>
</section>`
      : "";

  const testimonios = (p.testimonials || [])
    .map(
      (t) => `
      <article class="rev">
        <div class="who">
          <span class="av" aria-hidden="true">${esc((t.name || "?").trim().charAt(0).toUpperCase())}</span>
          <div>
            <b>${esc(t.name || "")}</b>
            <i>${esc(t.city || "")}</i>
          </div>
          <span class="stars" aria-label="5 de 5 estrellas">★★★★★</span>
        </div>
        <p>“${esc(t.text)}”</p>
      </article>`,
    )
    .join("");

  const faqs = (p.faq || [])
    .map(
      (f, i) => `
      <details${i === 0 ? " open" : ""}>
        <summary>${esc(f.q)}</summary>
        <p>${esc(f.a)}</p>
      </details>`,
    )
    .join("");

  const unidad = (n: number) => (n === 1 ? "1 unidad" : `${n} unidades`);
  const qtyRow = (n: number, destacado: boolean): string => `
          <label class="q${destacado ? " hot" : ""}">
            <input type="radio" name="cantidad" value="${n}"${n === 1 ? " checked" : ""}>
            <span class="dot"></span>
            <em>${unidad(n)}</em>
            ${destacado ? `<i>¡Más elegido!</i>` : ""}
            <b>$${cop(precio * n)}</b>
          </label>`;

  const brandIni = esc((p.brand || "L").trim().charAt(0).toUpperCase());

  const formHtml = `
        <form id="order-form" class="fields" novalidate${esFisico ? ` method="post" action="${esc(accion)}"` : ""}>
          <div class="field" data-req>
            <label for="f-name">Nombre completo</label>
            <input id="f-name" name="nombre" type="text" autocomplete="name" placeholder="Ej. Juan Pérez">
            <span class="err">Escribe tu nombre completo</span>
          </div>
          <div class="${esFisico ? "two" : ""}">
            <div class="field" data-req data-phone>
              <label for="f-phone">Celular / WhatsApp</label>
              <input id="f-phone" name="telefono" type="tel" inputmode="numeric" autocomplete="tel" placeholder="Ej. 300 123 4567">
              <span class="err">Escribe un celular válido (10 dígitos)</span>
            </div>
            ${
              esFisico
                ? `<div class="field" data-req>
              <label for="f-dept">Departamento</label>
              <select id="f-dept" name="departamento" autocomplete="address-level1">${opcionesDeDepartamento(esc)}</select>
              <span class="err">Selecciona tu departamento</span>
            </div>`
                : `<div class="field" data-req>
              <label for="f-email">Correo electrónico</label>
              <input id="f-email" name="email" type="email" autocomplete="email" placeholder="Ej. juan@correo.com">
              <span class="err">Escribe tu correo</span>
            </div>`
            }
          </div>
          ${
            esFisico
              ? `<div class="two">
            <div class="field" data-req>
              <label for="f-city">Ciudad</label>
              <input id="f-city" name="ciudad" type="text" list="ciudades-datalist" autocomplete="address-level2" placeholder="Ej. Bogotá">
              <span class="err">Escribe tu ciudad</span>
            </div>
            <div class="field">
              <label for="f-notes">Referencia (opcional)</label>
              <input id="f-notes" name="referencia" type="text" placeholder="Ej. portón azul">
            </div>
          </div>
          <datalist id="ciudades-datalist"></datalist>
          <div class="field" data-req>
            <label for="f-addr">Dirección</label>
            <input id="f-addr" name="direccion" type="text" autocomplete="street-address" placeholder="Ej. Calle 12 # 34 - 56, apto 1">
            <span class="err">Escribe tu dirección</span>
          </div>`
              : ""
          }

          <fieldset class="qtys">
            <legend>Selecciona tu pedido</legend>
            ${qtyRow(1, false)}
            ${precio ? qtyRow(2, true) : ""}
            ${precio ? qtyRow(3, false) : ""}
          </fieldset>

          <button class="cta" type="submit"><span>${p.cta ? esc(p.cta) : "🛒 Pedir ahora"}</span><small>${pagoCorto}</small></button>
          <p class="secure">🔒 Tus datos están seguros</p>
          <p class="note">Al enviar aceptas ser contactado por WhatsApp para ${esFisico ? "confirmar tu entrega" : esServicio ? "coordinar tu cita" : "entregarte el acceso"}.</p>
        </form>
        <div class="ok-msg" id="ok-msg">
          <div class="tick">✅</div>
          <h3>¡Pedido recibido!</h3>
          <p>Te escribiremos por WhatsApp para ${esFisico ? "confirmar los datos y el envío" : esServicio ? "coordinar tu cita" : "entregarte el acceso"}.</p>
          <a class="cta" id="ok-wa" href="#" target="_blank" rel="noopener" style="margin-top:16px"><span>Confirmar por WhatsApp →</span></a>
          ${
            !esFisico && (pago.mercadopago || pago.paypal)
              ? `<div class="paybtns">
            ${pago.mercadopago ? `<a class="cta ghost" href="${esc(pago.mercadopago)}" target="_blank" rel="noopener"><span>Pagar con Mercado Pago</span></a>` : ""}
            ${pago.paypal ? `<a class="cta ghost" href="${esc(pago.paypal)}" target="_blank" rel="noopener"><span>Pagar con PayPal</span></a>` : ""}
          </div>`
              : ""
          }
        </div>`;

  return `<!doctype html>
<html lang="es-CO" data-style="${style}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(p.productName)} — ${cop(precio)} COP | ${esc(p.brand)}</title>
<meta name="description" content="${esc(p.tagline)}">
<meta name="theme-color" content="${esc(a)}">
<link rel="canonical" href="${esc(host ? `${host}/l/${p.slug}` : "")}">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(p.productName)} — ${cop(precio)} COP">
<meta property="og:description" content="${esc(p.tagline)}">
<meta property="og:image" content="${esc(p.image)}">
<meta property="og:url" content="${esc(host ? `${host}/l/${p.slug}` : "")}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
 <link href="${fontsHref}" rel="stylesheet">
<style>
:root{--a:${esc(a)};--a-d:${esc(a)}dd;--ink:#141a24;--mut:#5b6472;--bg:#f4f6f9;--ok:#0d9d58;--bad:#e2483d;--yel:#ffd400;--card:#fff}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:56px}
body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink);line-height:1.55;overflow-x:hidden}
img{max-width:100%;display:block}
button,input,select{font:inherit}
.wrap{max-width:780px;margin:0 auto;padding:0 16px}
section{padding:30px 0}
h1,h2,h3{line-height:1.18;margin:0 0 10px;letter-spacing:-.02em}
h2{font-size:clamp(21px,5.4vw,29px);font-weight:900}
p{margin:0 0 12px}
.kicker{display:inline-block;background:var(--a);color:#fff;font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:5px 11px;border-radius:999px;margin-bottom:10px}

/* barra de marca */
.top{position:sticky;top:0;z-index:40;background:var(--a);color:#fff;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.top .brand{display:flex;align-items:center;gap:9px;min-width:0}
.top .logo{flex:0 0 30px;height:30px;border-radius:9px;background:#ffffff24;border:1.5px solid #ffffff70;display:grid;place-items:center;font-weight:900;font-size:15px}
.top .bn{font-weight:900;font-size:14.5px;line-height:1.05;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.top .tag{font-size:10px;opacity:.85;font-weight:600}
.top .ship{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:800;text-align:right;line-height:1.15;flex:0 0 auto}
.top .ship span{opacity:.85}
.announce{background:#141a24;color:#fff;text-align:center;font-size:11.5px;font-weight:700;padding:7px 12px;letter-spacing:.02em}

/* hero */
.hero{background:linear-gradient(170deg,#fff 0%,#eef7f2 60%,#e7f3ee 100%);padding:22px 0 26px;overflow:hidden}
.hero h1{font-size:clamp(27px,7vw,42px);font-weight:900;color:var(--a)}
.hero .sub{color:var(--mut);font-size:clamp(15px,4vw,17px);font-weight:500;margin-bottom:14px}
.hero-mid{display:grid;grid-template-columns:1fr 43%;gap:12px;align-items:center;margin:4px 0 16px}
.hero-bullets{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.hero-bullets li{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;font-weight:700;line-height:1.3}
.hero-bullets li span{flex:0 0 19px;height:19px;margin-top:1px;border-radius:50%;background:var(--ok);color:#fff;font-size:11px;font-weight:900;display:grid;place-items:center}
.hero-media{position:relative}
.hero-media .ph{position:relative;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 14px 34px #00000020;cursor:zoom-in}
.hero-media .ph .main{aspect-ratio:1/1;background:#fff center/cover no-repeat;transition:opacity .2s}
.hero-media .ph img.main{object-fit:cover;width:100%}
.hero-media .flot{position:absolute;top:-9px;right:-6px;background:var(--a);color:#fff;font-size:10.5px;font-weight:900;padding:7px 11px;border-radius:999px;transform:rotate(6deg);box-shadow:0 6px 16px #0003;z-index:2;text-align:center;line-height:1.15;border:2px solid #fff}
.gal{position:relative;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 12px 34px #0000001a}
.gal .main{aspect-ratio:1/1;background:#fff center/cover no-repeat;transition:opacity .2s}
.thumbs{display:flex;gap:7px;padding:9px;overflow-x:auto;scrollbar-width:thin}
.thumb{flex:0 0 54px;height:54px;padding:0;border:2px solid transparent;border-radius:10px;overflow:hidden;cursor:pointer;background:none}
.thumb img{width:100%;height:100%;object-fit:cover}
.thumb.on{border-color:var(--a)}
.play{position:absolute;inset:0;display:none;place-items:center;background:#0009;border:0;cursor:pointer}
.play svg{filter:drop-shadow(0 4px 14px #0007)}
.video-on .play{display:grid}

/* precio estilo píldora */
.pricebox{background:#141a24;border-radius:18px;padding:13px 14px 15px;color:#fff;box-shadow:0 14px 30px #00000026}
.pricebox .antes{font-size:13px;font-weight:600;opacity:.75;margin-bottom:7px}
.pricebox .antes del{opacity:.9}
.pricebox .row{display:flex;gap:9px;align-items:stretch}
.pricebox .hoy{flex:1;background:var(--a);border-radius:13px;padding:8px 13px 10px;display:flex;align-items:baseline;gap:9px;min-width:0}
.pricebox .hoy span{font-size:15px;font-weight:800;opacity:.95}
.pricebox .hoy strong{font-size:clamp(28px,8vw,40px);font-weight:900;letter-spacing:-.03em;line-height:1}
.pricebox .ahorra{flex:0 0 auto;background:var(--yel);color:#141a24;border-radius:13px;padding:7px 11px;text-align:center;font-size:11px;font-weight:800;line-height:1.15;align-self:center}
.pricebox .ahorra b{display:block;font-size:15px;font-weight:900}
.pricebox .solo{display:inline-block;background:#ff3b30;font-size:10.5px;font-weight:900;padding:3px 9px;border-radius:999px;margin-top:9px;letter-spacing:.06em;text-transform:uppercase}

/* contador */
.timer{display:flex;gap:9px;align-items:center;background:#ffffff;border:1.5px dashed var(--a);color:var(--ink);padding:11px 13px;border-radius:13px;margin:12px 0 0}
.timer .lb{font-size:11.5px;font-weight:700;flex:1;line-height:1.2}
.timer .t{display:flex;gap:5px}
.timer .t b{background:#141a24;color:#fff;min-width:40px;padding:6px 0;border-radius:8px;text-align:center;font-size:17px;font-variant-numeric:tabular-nums}
.timer .t i{font-style:normal;align-self:center;opacity:.4}

/* CTA */
.cta{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:100%;background:var(--a);color:#fff;border:0;border-radius:14px;padding:11px 14px;min-height:54px;cursor:pointer;box-shadow:0 10px 26px var(--a-d);transition:transform .1s;letter-spacing:.02em;text-decoration:none;text-align:center}
.cta span{font-weight:900;font-size:16.5px}
.cta small{font-size:9.5px;font-weight:800;letter-spacing:.14em;opacity:.92}
.cta:active{transform:scale(.98)}
.cta.ghost{background:#fff;color:var(--a);box-shadow:none;border:2px solid var(--a)}
.cta.ghost small{opacity:.75}
.hero-buy{margin-top:14px}
.note{text-align:center;color:var(--mut);font-size:12px;margin-top:9px}

/* confianza 4 íconos */
.trust4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#fff;border-top:1px solid #e6eaf0;border-bottom:1px solid #e6eaf0;padding:13px 0;margin:0}
.trust4 div{text-align:center;font-size:9.5px;font-weight:800;color:var(--ink);line-height:1.2;padding:0 2px}
.trust4 div span{display:block;font-size:21px;margin-bottom:4px}
.trust4 div i{display:block;font-style:normal;color:var(--mut);font-weight:600}

/* features */
.feat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:11px}
.feat{background:var(--card);border:1px solid #e6eaf0;border-radius:15px;padding:15px 12px;text-align:center}
.feat .fi{width:46px;height:46px;margin:0 auto 9px;border-radius:14px;background:var(--a);display:grid;place-items:center;font-size:22px}
.feat b{display:block;font-size:13.5px;font-weight:800;line-height:1.25;margin-bottom:5px}
.feat p{margin:0;font-size:11.5px;color:var(--mut);line-height:1.4}

/* fotos repartidas por la página: slider una por una en móvil */
.shotrow{display:grid;grid-auto-flow:column;grid-auto-columns:88%;gap:11px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:4px 16px 10px;margin:0 -16px}
.shotrow::-webkit-scrollbar{display:none}
.shotrow figure{margin:0;scroll-snap-align:center;background:var(--card);border:1px solid #e6eaf0;border-radius:15px;overflow:hidden;box-shadow:0 8px 20px #00000010}
.shotrow img{aspect-ratio:1/1;height:auto;object-fit:cover;width:100%}
.shotrow figcaption{padding:9px 7px;font-size:11.5px;font-weight:800;text-align:center;line-height:1.2}

/* dolor */
.pains{background:#141a24;color:#fff}
.pains h2{color:#fff}
.pains li{list-style:none;display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-bottom:1px solid #ffffff14;font-size:15px}
.pains li:last-child{border:0}
.pains .x{color:#ff6b60;font-weight:900;flex:0 0 auto}
.pains ul{margin:0;padding:0}
.pains .kicker{background:#ff6b60}

/* comparativa */
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cmp>div{border-radius:15px;padding:15px}
.cmp h3{font-size:14.5px;margin-bottom:9px}
.cmp ul{margin:0;padding:0;list-style:none}
.cmp li{display:flex;gap:8px;font-size:13px;padding:7px 0;border-bottom:1px solid #00000010}
.cmp li:last-child{border:0}
.cmp .sin{background:#fff;border:1px solid #f0e0de}
.cmp .sin h3{color:var(--bad)}
.cmp .con{background:#0d9d5815;border:1px solid #0d9d5840}
.cmp .con h3{color:var(--ok)}
.cmp li span{font-weight:900}
.cmp .con li span{color:var(--ok)}
.cmp .sin li span{color:var(--bad)}

/* riesgo */
.risk{background:linear-gradient(160deg,var(--a) 0%,var(--a-d) 100%);color:#fff;text-align:center;border-radius:20px;padding:26px 18px;margin:0 auto}
.risk h2{color:#fff}
.risk p{opacity:.95}
.risk .guar{font-size:42px;margin-bottom:8px}

/* reviews */
.revs{display:grid;gap:11px}
.rev{background:var(--card);border:1px solid #e6eaf0;border-radius:15px;padding:15px}
.rev .who{display:flex;align-items:center;gap:10px;margin-bottom:9px}
.rev .av{flex:0 0 40px;height:40px;border-radius:50%;background:var(--a);color:#fff;display:grid;place-items:center;font-weight:900;font-size:17px}
.rev .who b{display:block;font-size:13.5px;line-height:1.1}
.rev .who i{font-style:normal;font-size:11.5px;color:var(--mut);font-weight:600}
.rev .stars{margin-left:auto;color:#f5a623;letter-spacing:1px;font-size:14px;flex:0 0 auto}
.rev p{font-size:14px;margin:0;line-height:1.5}
.rev-h{display:flex;align-items:center;gap:8px}
.rev-h .st{color:#f5a623;letter-spacing:1px;font-size:17px}

/* faq */
details{background:var(--card);border:1px solid #e6eaf0;border-radius:12px;margin-bottom:9px;overflow:hidden}
summary{padding:15px 16px;font-weight:700;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:10px;font-size:14.5px}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";color:var(--a);font-weight:900;font-size:20px;line-height:1}
details[open] summary::after{content:"−"}
details p{padding:0 16px 15px;margin:0;color:var(--mut);font-size:14px}

/* form */
.order{background:var(--card);border-radius:20px;overflow:hidden;box-shadow:0 16px 44px #00000017;border:1px solid #e6eaf0}
.order .oh{background:var(--a);color:#fff;padding:14px 16px;text-align:center}
.order .oh h2{color:#fff;font-size:19px;margin:0;font-weight:900}
.order .oh p{margin:3px 0 0;font-size:12.5px;opacity:.95;font-weight:600}
.order .ob{padding:17px 15px 19px}
.field{margin-bottom:11px}
.field label{display:block;font-size:11.5px;font-weight:800;color:var(--mut);margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em}
.field input,.field select{width:100%;padding:13px;border:1.5px solid #dde2ea;border-radius:12px;background:#fbfcfe;font-size:16px;transition:border .15s,box-shadow .15s}
.field input:focus,.field select:focus{outline:0;border-color:var(--a);box-shadow:0 0 0 3px var(--a-d);background:#fff}
.field.bad input,.field.bad select{border-color:#e2483d;background:#fff5f4}
.field .err{display:none;color:#e2483d;font-size:12px;font-weight:600;margin-top:4px}
.field.bad .err{display:block}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qtys{border:1.5px solid #dde2ea;border-radius:14px;padding:11px;margin:4px 0 13px}
.qtys legend{font-size:11.5px;font-weight:800;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;padding:0 6px}
.q{display:flex;align-items:center;gap:9px;padding:11px 10px;border:1.5px solid #e3e7ee;border-radius:11px;margin-bottom:8px;cursor:pointer;position:relative}
.q:last-child{margin-bottom:0}
.q input{position:absolute;opacity:0;pointer-events:none}
.q .dot{flex:0 0 18px;height:18px;border-radius:50%;border:2px solid #c3cad6;background:#fff}
.q em{font-style:normal;font-weight:800;font-size:14px;white-space:nowrap}
.q b{margin-left:auto;font-weight:900;font-size:15px;color:var(--ink);white-space:nowrap}
.q i{font-style:normal;font-size:9px;font-weight:900;background:#ff3b30;color:#fff;padding:3px 6px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.q.hot{border-color:var(--a);background:var(--a-d);color:#fff}
.q.hot b{color:#fff}
.q.hot .dot{border-color:#ffffff99}
.q.on{border-color:var(--a);background:#f2faf7;color:var(--ink)}
.q.on .dot{border-color:var(--a);box-shadow:inset 0 0 0 3.5px var(--a)}
.q.on b{color:var(--a)}
.ok-msg{display:none;text-align:center;padding:26px 16px}
.ok-msg .tick{font-size:52px;margin-bottom:8px}
.ok-msg h3{font-size:21px;margin-bottom:6px}
.ok-msg p{color:var(--mut);font-size:14.5px}
.sent .fields,.sent .qtys{display:none}
.sent .ok-msg{display:block}
.secure{text-align:center;font-size:12px;font-weight:700;color:var(--mut);margin-top:11px}
.paybtns{display:grid;gap:8px;margin-top:12px}
.paybtns .cta{min-height:46px}

/* sticky */
.sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;background:#fff;border-top:2px solid var(--a);padding:9px 12px calc(9px + env(safe-area-inset-bottom));display:flex;gap:11px;align-items:center;box-shadow:0 -8px 24px #00000018;transform:translateY(115%);transition:transform .25s}
.sticky.show{transform:translateY(0)}
.sticky .p{flex:0 0 auto;min-width:0}
.sticky .p strong{display:block;font-size:17.5px;color:var(--a);font-weight:900;line-height:1.05}
.sticky .p del{font-size:11.5px;color:#9aa3b0}
.sticky .cta{width:auto;flex:1;max-width:62%;padding:8px 12px;min-height:50px;margin:0}
.sticky .cta span{font-size:14.5px}
.sticky .cart{flex:0 0 auto;font-size:22px}

/* whatsapp */
.wa{position:fixed;right:14px;bottom:88px;z-index:51;width:54px;height:54px;border-radius:50%;background:#25d366;display:grid;place-items:center;box-shadow:0 8px 24px #25d36666;text-decoration:none;transition:transform .15s}
.wa:active{transform:scale(.92)}
.wa::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid #25d366;animation:ring 2s infinite}
@keyframes ring{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.5);opacity:0}}

/* trust bar inferior + footer */
.tbar{background:#141a24;color:#fff;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:14px 12px;text-align:center}
.tbar div{font-size:9.5px;font-weight:700;line-height:1.25;color:#cfd6e0}
.tbar div span{display:block;font-size:19px;margin-bottom:4px}
.tbar div b{display:block;color:#fff;font-size:10.5px;font-weight:900}
footer{background:#0c111a;color:#9aa3b0;text-align:center;padding:22px 16px 30px;font-size:12.5px}
footer .fbrand{display:flex;align-items:center;justify-content:center;gap:9px;margin-bottom:10px}
footer .fbrand .logo{width:30px;height:30px;border-radius:9px;background:var(--a);color:#fff;display:grid;place-items:center;font-weight:900;font-size:15px}
footer .fbrand b{color:#fff;font-size:15px}
footer .fwa{display:inline-flex;align-items:center;gap:7px;background:#ffffff10;border:1px solid #ffffff1f;color:#fff;border-radius:999px;padding:8px 14px;text-decoration:none;font-weight:700;font-size:13px}
footer .fwa .g{width:22px;height:22px;border-radius:50%;background:#25d366;display:grid;place-items:center;font-size:12px}
footer .fine{margin-top:12px;font-size:11px;opacity:.7}

/* lightbox */
.lb{position:fixed;inset:0;z-index:100;background:#000e;display:none;place-items:center;padding:20px}
.lb.on{display:grid}
.lb img{max-width:100%;max-height:86vh;border-radius:10px}
.lb .cl{position:absolute;top:14px;right:16px;background:#ffffff26;color:#fff;border:0;font-size:26px;width:44px;height:44px;border-radius:50%;cursor:pointer}
.lb .nav{position:absolute;top:50%;transform:translateY(-50%);background:#ffffff26;color:#fff;border:0;font-size:26px;width:46px;height:46px;border-radius:50%;cursor:pointer}
.lb .prev{left:12px}.lb .next{right:12px}

@media(max-width:560px){
  .two{grid-template-columns:1fr}
  section{padding:26px 0}
}
@media(min-width:700px){
  .shotrow{grid-auto-flow:row;grid-template-columns:repeat(4,1fr);grid-auto-columns:auto;overflow:visible;margin:0;padding:4px 0 0;gap:14px}
  .shotrow figure{scroll-snap-align:none}
  .feat-grid{grid-template-columns:repeat(4,1fr)}
  .sticky{left:50%;right:auto;transform:translate(-50%,115%);width:min(560px,92%);border:2px solid var(--a);border-radius:18px 18px 0 0;bottom:0}
  .sticky.show{transform:translate(-50%,0)}
}
@media(min-width:900px){
  .hero .inner{display:grid;grid-template-columns:1.05fr .95fr;grid-template-areas:"copy media" "bul media" "buy media";gap:0 34px;align-items:start}
  .hero-mid{display:contents}
  .hero-copy{grid-area:copy}
  .hero-bullets{grid-area:bul;margin-top:6px}
  .hero-media{grid-area:media;align-self:center;position:sticky;top:70px}
  .hero-buy{grid-area:buy;margin-top:14px}
  .cmp{grid-template-columns:1fr 1fr}
  .revs{grid-template-columns:repeat(3,1fr)}
  .two{grid-template-columns:1fr 1fr}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

/* ===== variantes de estilo (data-style) ===== */
/* premium: elegante, serif, más aire, bordes finos */
[data-style="premium"] body{font-family:Fraunces,Georgia,serif;background:#faf8f5;letter-spacing:.005em}
[data-style="premium"] .top{background:#141a24}
[data-style="premium"] .hero{background:linear-gradient(170deg,#fff 0%,#f5f1ea 65%,#efe9df 100%)}
[data-style="premium"] .hero h1{color:var(--ink);font-weight:600}
[data-style="premium"] .kicker{background:transparent;color:var(--a);border:1.5px solid var(--a);font-weight:700}
[data-style="premium"] .pricebox{background:#141a24;border:1px solid #00000022;box-shadow:0 18px 40px #00000018}
[data-style="premium"] .cta{border-radius:4px;font-family:Fraunces,Georgia,serif}
[data-style="premium"] .cta span{font-weight:600}
[data-style="premium"] .feat,[data-style="premium"] .rev,[data-style="premium"] details,[data-style="premium"] .shotrow figure{border-radius:6px;border-color:#e3ddd2}
[data-style="premium"] .feat .fi{border-radius:50%;background:transparent;border:1.5px solid var(--a);color:var(--a);width:50px;height:50px}
[data-style="premium"] .order{border-radius:6px}
[data-style="premium"] .field input,[data-style="premium"] .field select{border-radius:4px}
[data-style="premium"] .q{border-radius:4px}
[data-style="premium"] h2{font-weight:600}
[data-style="premium"] .announce{background:#141a24;letter-spacing:.12em;text-transform:uppercase;font-size:10.5px}

/* bold: colores fuertes, geometría gruesa, energía promo */
[data-style="bold"] body{font-family:Archivo,Inter,sans-serif}
[data-style="bold"] .hero{background:linear-gradient(160deg,var(--a) 0%,var(--a-d) 55%,#141a24 130%)}
[data-style="bold"] .hero h1{color:#fff;text-transform:uppercase;letter-spacing:-.01em}
[data-style="bold"] .hero .sub{color:#ffffffd9}
[data-style="bold"] .hero-bullets li{color:#fff}
[data-style="bold"] .kicker{background:#ffd400;color:#141a24;transform:rotate(-1.5deg);font-size:11.5px}
[data-style="bold"] .pricebox{background:#ffd400;color:#141a24;border-radius:12px;border:3px solid #141a24;box-shadow:8px 8px 0 #141a24}
[data-style="bold"] .pricebox .antes{color:#141a24;opacity:.8}
[data-style="bold"] .pricebox .hoy{background:#141a24;color:#fff}
[data-style="bold"] .pricebox .hoy span,[data-style="bold"] .pricebox .hoy strong{color:#fff}
[data-style="bold"] .pricebox .ahorra{background:#ff3b30;color:#fff}
[data-style="bold"] .pricebox .solo{background:#141a24;color:#ffd400}
[data-style="bold"] .cta{border-radius:8px;border:3px solid #141a24;box-shadow:5px 5px 0 #141a24}
[data-style="bold"] .feat{border:2px solid #141a24;border-radius:12px;box-shadow:4px 4px 0 #141a24}
[data-style="bold"] .feat .fi{border-radius:8px}
[data-style="bold"] h2{text-transform:uppercase}
[data-style="bold"] .announce{background:#141a24;background-image:repeating-linear-gradient(45deg,#ffffff0d 0 12px,transparent 12px 24px);text-transform:uppercase;letter-spacing:.06em}
[data-style="bold"] .timer{border-style:solid;border-width:2.5px}
[data-style="bold"] .order{border:3px solid #141a24;border-radius:12px;box-shadow:8px 8px 0 #141a24}
[data-style="bold"] .order .oh{background:#141a24}
[data-style="bold"] .q.hot{background:#141a24;border-color:#141a24}
[data-style="bold"] .hero .note{color:#ffffffcc}

/* dark: modo oscuro premium tech */
[data-style="dark"] body{font-family:'Space Grotesk',Inter,sans-serif;background:#0b0f16;color:#e6eaf2}
[data-style="dark"]{--ink:#e6eaf2;--mut:#8b95a7;--bg:#0b0f16;--card:#131a26}
[data-style="dark"] .top{background:#0b0f16;border-bottom:1px solid #ffffff14}
[data-style="dark"] .announce{background:#05070b;color:#9fe8c5}
[data-style="dark"] .hero{background:radial-gradient(120% 90% at 80% 0%,var(--a-d) 0%,transparent 55%),#0b0f16}
[data-style="dark"] .hero h1{color:#fff}
[data-style="dark"] .pricebox{background:#131a26;border:1px solid #ffffff1f;box-shadow:0 18px 44px #00000066}
[data-style="dark"] .trust4{background:#131a26;border-color:#ffffff14}
[data-style="dark"] .trust4 div i{color:var(--mut)}
[data-style="dark"] .feat,[data-style="dark"] .rev,[data-style="dark"] details,[data-style="dark"] .shotrow figure{background:#131a26;border-color:#ffffff17;color:#e6eaf2}
[data-style="dark"] .feat p,[data-style="dark"] .rev .who i{color:var(--mut)}
[data-style="dark"] .feat .fi{background:linear-gradient(145deg,var(--a),var(--a-d))}
[data-style="dark"] .pains{background:#05070b}
[data-style="dark"] .cmp .sin{background:#1a1214;border-color:#ff6b6033}
[data-style="dark"] .cmp .con{background:#0f2318;border-color:#0d9d5840}
[data-style="dark"] .order{background:#131a26;border-color:#ffffff17}
[data-style="dark"] .field input,[data-style="dark"] .field select{background:#0b0f16;border-color:#2a3345;color:#e6eaf2}
[data-style="dark"] .field input:focus,[data-style="dark"] .field select:focus{background:#0e141d}
[data-style="dark"] .qtys{border-color:#2a3345}
[data-style="dark"] .q{border-color:#2a3345}
[data-style="dark"] .q.on{background:#0f1a2e}
[data-style="dark"] .timer{background:#131a26;border-color:var(--a)}
[data-style="dark"] .timer .t b{background:#05070b}
[data-style="dark"] .sticky{background:#131a26;border-top-color:var(--a)}
[data-style="dark"] .sticky .p del{color:#6b7587}
[data-style="dark"] .tbar{background:#05070b}
[data-style="dark"] .risk{border:1px solid #ffffff26}
[data-style="dark"] .thumb{border-color:transparent}
[data-style="dark"] .thumb.on{border-color:var(--a)}
[data-style="dark"] summary::after{color:var(--a)}
</style>
</head>
<body>

<header class="top">
  <div class="brand">
    <span class="logo">${brandIni}</span>
    <div>
      <div class="bn">${esc(p.brand || p.productName)}</div>
      <div class="tag">${esc(p.tagline || "")}</div>
    </div>
  </div>
  <div class="ship">${esFisico ? "🚚" : esServicio ? "📅" : "⚡"} <span>${esFisico ? envioChip : esServicio ? "Agenda<br>tu cita" : "Acceso<br>inmediato"}</span></div>
</header>

${p.announce ? `<div class="announce">${esc(p.announce)}</div>` : `<div class="announce">🔥 Oferta por tiempo limitado · Solo en línea</div>`}

<section class="hero">
  <div class="wrap inner">
    <div class="hero-copy">
      <span class="kicker">Oferta especial</span>
      <h1>${esc(p.headline || p.productName)}</h1>
      <p class="sub">${esc(p.subheadline || p.tagline)}</p>
    </div>

    <div class="hero-mid">
      <ul class="hero-bullets">${bullets}</ul>
      <div class="hero-media">
        ${p.heroBadge ? `<span class="flot">${esc(p.heroBadge)}</span>` : ""}
        <div class="ph${p.video ? " video-on" : ""}">
          <div class="main" id="main-img" style="background-image:url('${esc(p.image)}')"></div>
          <button class="play" id="play-btn" aria-label="Reproducir video">
            <svg width="58" height="58" viewBox="0 0 70 70"><circle cx="35" cy="35" r="34" fill="#fff"/><path d="M28 22l22 13-22 13z" fill="#141a24"/></svg>
          </button>
        </div>
        ${galeria.length ? `<div class="thumbs" id="thumbs">${thumbs}</div>` : ""}
      </div>
    </div>

    <div class="hero-buy">
      <div class="pricebox">
        ${antes ? `<div class="antes">Antes: <del>$${cop(antes)}</del></div>` : `<div class="antes">Precio de lanzamiento</div>`}
        <div class="row">
          <div class="hoy"><span>Hoy:</span><strong>$${cop(precio)}</strong></div>
          ${ahorro ? `<div class="ahorra">Ahorras<b>$${cop(ahorro)}</b></div>` : ""}
        </div>
        <span class="solo">${esc(envioLargo)}</span>
      </div>

      ${p.timer === false ? "" : `<div class="timer" role="timer" aria-label="La oferta termina en">
        <span class="lb">⏳ La oferta termina en</span>
        <span class="t">
          <b id="th">02</b><i>:</i><b id="tm">00</b><i>:</i><b id="ts">00</b>
        </span>
      </div>`}

      <a class="cta" href="#pedir" style="margin-top:13px"><span>${p.cta ? esc(p.cta) : "Quiero mi pedido"}</span><small>${pagoCorto}</small></a>
      <p class="note">${esFisico ? "Pagas al recibir · Sin tarjeta ni adelanto · Envío nacional" : "Pago 100% seguro · Acceso inmediato · Soporte por WhatsApp"}</p>
    </div>
  </div>
</section>

<div class="trust4">
  ${trustTop.map(([i, l1, l2]) => `<div><span>${i}</span>${l1}<i>${l2}</i></div>`).join("")}
</div>

${
  features.length
    ? `<section>
  <div class="wrap">
    <span class="kicker">Beneficios</span>
    <h2>¿Por qué miles de colombianos lo eligen?</h2>
    <div class="feat-grid">${features.join("")}</div>
  </div>
</section>`
    : ""
}

${seccionFotos(resto, 2, p.useCasesTitle || "Así se ve en la vida real", "Míralo de cerca", "shotsA")}

${
  dolores
    ? `<section class="pains">
  <div class="wrap">
    <span class="kicker">El problema</span>
    <h2>¿Te pasa algo así?</h2>
    <ul>${dolores}</ul>
  </div>
</section>`
    : ""
}

${
  hayComparativa && comparativa
    ? `<section style="background:#fff">
  <div class="wrap">
    <span class="kicker">Comparativa</span>
    <h2>${esc(comparativa.titulo)}</h2>
    <div class="cmp">
      <div class="sin"><h3>Sin esto</h3><ul>${comparativa.sin
        .map((x) => `<li><span>✗</span>${esc(x)}</li>`)
        .join("")}</ul></div>
      <div class="con"><h3>Con esto</h3><ul>${comparativa.con
        .map((x) => `<li><span>✓</span>${esc(x)}</li>`)
        .join("")}</ul></div>
    </div>
  </div>
</section>`
    : ""
}

${
  p.riskFree
    ? `<section><div class="wrap"><div class="risk">
      <div class="guar">🛡️</div>
      <h2>${esc(p.riskFree.title)}</h2>
      <p>${esc(p.riskFree.text)}</p>
      <a class="cta ghost" href="#pedir" style="max-width:340px;margin:16px auto 0"><span>${p.cta ? esc(p.cta) : "Pedir ahora"}</span></a>
    </div></div></section>`
    : ""
}

${
  testimonios
    ? `<section>
  <div class="wrap">
    <span class="kicker">Clientes reales</span>
    <div class="rev-h"><h2 style="margin:0">Lo que dicen nuestros clientes</h2><span class="st">★★★★★</span></div>
    <p style="margin-top:8px;color:var(--mut);font-size:13.5px;font-weight:600">Comentarios de compradores verificados</p>
    <div class="revs">${testimonios}</div>
  </div>
</section>`
    : ""
}

${
  faqs
    ? `<section style="background:#fff">
  <div class="wrap">
    <span class="kicker">Dudas frecuentes</span>
    <h2>Preguntas antes de pedir</h2>
    ${faqs}
  </div>
</section>`
    : ""
}

<section id="pedir">
  <div class="wrap">
    <div class="order" id="order-box">
      <div class="oh">
        <h2>🛍️ ¡Haz tu pedido ahora!</h2>
        <p>${esFisico ? "Pagas solo al recibir en casa" : esc(envioLargo) + " · Pago 100% seguro"}</p>
      </div>
      <div class="ob">
${formHtml}
      </div>
    </div>
  </div>
</section>

<div class="tbar">
  ${trustBottom.map(([i, b, s]) => `<div><span>${i}</span><b>${b}</b>${s}</div>`).join("")}
</div>

${
  waLink
    ? `<a class="wa" href="${waLink}" target="_blank" rel="noopener" aria-label="Escribir por WhatsApp">
  <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.78h-.01a9.87 9.87 0 01-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.85 9.85 0 01-1.51-5.26c0-5.44 4.43-9.87 9.88-9.87 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 012.89 6.98c0 5.45-4.44 9.88-9.87 9.88zm8.41-18.3A11.8 11.8 0 0012.04 0C5.5 0 .16 5.33.16 11.89c0 2.1.55 4.14 1.59 5.94L.07 24l6.3-1.65a11.86 11.86 0 005.67 1.44h.01c6.55 0 11.88-5.34 11.88-11.9 0-3.17-1.24-6.15-3.47-8.39z"/></svg>
</a>`
    : ""
}

<div class="sticky" id="sticky">
  <span class="cart">🛒</span>
  <div class="p">
    <strong id="sticky-price">$${cop(precio)}</strong>
    ${antes ? `<del>$${cop(antes)}</del>` : ""}
  </div>
  <button class="cta" type="button" id="sticky-cta"><span>Pedir ahora</span><small>${pagoCorto}</small></button>
</div>

<div class="lb" id="lightbox">
  <button class="cl" aria-label="Cerrar">×</button>
  <button class="nav prev" aria-label="Anterior">‹</button>
  <img id="lb-img" src="" alt="${esc(p.productName)}">
  <button class="nav next" aria-label="Siguiente">›</button>
</div>

<footer>
  <div class="fbrand"><span class="logo">${brandIni}</span><b>${esc(p.brand || "")}</b></div>
  ${
    waLink
      ? `<a class="fwa" href="${waLink}" target="_blank" rel="noopener"><span class="g">✆</span> ¿Tienes dudas? Escríbenos por WhatsApp</a>`
      : ""
  }
  ${envioIncluido ? `<p class="fine">*Envío gratis a todo el país por tiempo limitado. Aplica a zonas urbanas.</p>` : ""}
  <p class="fine">Los precios pueden variar sin previo aviso. Imágenes referenciales del producto real.</p>
</footer>

${pixel ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${esc(pixel)}');fbq('track','PageView');fbq('track','ViewContent');</script><noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${esc(pixel)}&ev=PageView&noscript=1"/></noscript>` : ""}

<script type="application/ld+json">${jsonLd(productoSchema(p, host))}</script>

<script>
(function(){
  var ACCION=${JSON.stringify(accion)};
  var SLUG=${JSON.stringify(p.slug || "")};
  var PRODUCT=${JSON.stringify(p.productName)};
  var UNIT=${JSON.stringify(cop(precio))};
  var WA=${JSON.stringify(waLink)};
  var FISICO=${JSON.stringify(esFisico)};
  var SERVICE=${JSON.stringify(esServicio)};
  var G=${JSON.stringify(imagenes)};

  try{
    var key='oferta:'+SLUG, fin=Number(localStorage.getItem(key)||0);
    if(!fin||fin<Date.now()) fin=Date.now()+${OFERTA_SEGUNDOS}*1000, localStorage.setItem(key,fin);
    var tick=function(){
      var s=Math.max(0,Math.floor((fin-Date.now())/1000));
      var h=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60;
      var H=document.getElementById('th'),M=document.getElementById('tm'),S=document.getElementById('ts');
      if(!H)return;
      H.textContent=String(h).padStart(2,'0');
      M.textContent=String(m).padStart(2,'0');
      S.textContent=String(ss).padStart(2,'0');
      if(s===0){localStorage.removeItem(key);}
    };
    tick();setInterval(tick,1000);
  }catch(e){}

  var fmt=function(n){return n.toLocaleString('es-CO');};
  var qtyInputs=document.querySelectorAll('.qtys input[name=cantidad]');
  var UNITN=${JSON.stringify(precio)};
  function syncQty(){
    var q=1;
    [].forEach.call(qtyInputs,function(r){ if(r.checked)q=Number(r.value)||1; });
    [].forEach.call(document.querySelectorAll('.q'),function(l){ l.classList.toggle('on', l.querySelector('input').checked); });
    var sp=document.getElementById('sticky-price');
    if(sp)sp.textContent='$'+fmt(UNITN*q);
    return q;
  }
  [].forEach.call(qtyInputs,function(r){ r.addEventListener('change',syncQty); });
  syncQty();

  var main=document.getElementById('main-img'), idx=0;
  var thumbs=document.getElementById('thumbs');
  if(thumbs){
    thumbs.addEventListener('click',function(e){
      var b=e.target.closest('.thumb'); if(!b)return;
      [].forEach.call(thumbs.children,function(c){c.classList.remove('on')});
      b.classList.add('on');
      idx=[].indexOf.call(thumbs.children,b);
      main.style.backgroundImage="url('"+b.dataset.full+"')";
    });
  }
  var lb=document.getElementById('lightbox'), lbImg=document.getElementById('lb-img');
  function openLb(i){idx=(i+G.length)%G.length;lbImg.src=G[idx];lb.classList.add('on');}
  function close(){lb.classList.remove('on');}
  if(main){main.style.cursor='zoom-in';main.addEventListener('click',function(){openLb(idx)});}
  lb.querySelector('.cl').addEventListener('click',close);
  lb.querySelector('.prev').addEventListener('click',function(){openLb(idx-1)});
  lb.querySelector('.next').addEventListener('click',function(){openLb(idx+1)});
  lb.addEventListener('click',function(e){if(e.target===lb)close()});
  document.addEventListener('keydown',function(e){
    if(!lb.classList.contains('on'))return;
    if(e.key==='Escape')close();
    if(e.key==='ArrowRight')openLb(idx+1);
    if(e.key==='ArrowLeft')openLb(idx-1);
  });

  ${p.video ? `var play=document.getElementById('play-btn');
  if(play)play.addEventListener('click',function(){
    main.outerHTML='<video src=${JSON.stringify(String(p.video))} controls autoplay playsinline style="width:100%;aspect-ratio:1/1;background:#000"></video>';
  });` : ""}

  var sticky=document.getElementById('sticky'), hero=document.querySelector('.hero');
  function onScroll(){
    var y=window.scrollY||document.documentElement.scrollTop;
    var past=hero?y>hero.offsetHeight*0.75:y>420;
    var before=document.getElementById('pedir').getBoundingClientRect().top>window.innerHeight;
    sticky.classList.toggle('show',past&&before);
  }
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();
  document.getElementById('sticky-cta').addEventListener('click',function(){
    document.getElementById('pedir').scrollIntoView({behavior:'smooth'});
    setTimeout(function(){var f=document.getElementById('f-name');if(f)f.focus({preventScroll:true});},700);
  });

  var form=document.getElementById('order-form');
  var box=document.getElementById('order-box');
  function fieldOf(el){return el.closest('.field');}
  function validPhone(v){var d=String(v).replace(/\\D/g,'');return d.length>=10&&d.length<=12;}
  function checkOne(el){
    var f=fieldOf(el); if(!f)return true;
    var ok=el.tagName==='SELECT'?el.value!=='':el.value.trim().length>0;
    if(f.hasAttribute('data-phone'))ok=validPhone(el.value);
    f.classList.toggle('bad',!ok);
    return ok;
  }
  [].forEach.call(form.querySelectorAll('input,select'),function(el){
    el.addEventListener('blur',function(){checkOne(el)});
    el.addEventListener('input',function(){var f=fieldOf(el);if(f&&f.classList.contains('bad'))checkOne(el)});
    el.addEventListener('change',function(){checkOne(el)});
  });

  form.addEventListener('submit',async function(e){
    e.preventDefault();
    var reqs=form.querySelectorAll('[data-req] input,[data-req] select');
    var allOk=true, first=null;
    [].forEach.call(reqs,function(el){var ok=checkOne(el);if(!ok){allOk=false;if(!first)first=el;}});
    if(!allOk){first.focus();return;}

    var btn=form.querySelector('button[type=submit]');
    var txt=btn.innerHTML;
    btn.disabled=true;btn.innerHTML='<span>Enviando pedido...</span>';

    var data={};
    [].forEach.call(form.querySelectorAll('input[name],select[name]'),function(el){
      if(el.type==='radio'&&!el.checked)return;
      data[el.name]=el.value.trim();
    });
    var q=syncQty();
    data.cantidad=String(q);
    data.slug=SLUG; data.product=PRODUCT; data.total='$'+fmt(UNITN*q)+' COP'; data.source='landing';

    try{
      if(FISICO&&ACCION){
        var r=await fetch(ACCION,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(data)});
        var ct=r.headers.get('content-type')||'';
        var j=ct.indexOf('json')>=0?await r.json():{};
        if(!r.ok||j.ok===false)throw Error(j.error||'No se pudo enviar el pedido');
      }
      var okWa=document.getElementById('ok-wa');
      if(WA){
        var msg='Hola, acabo de hacer un pedido en la landing:%0A%0A*'+encodeURIComponent(PRODUCT)+'*%0A'+
          'Nombre: '+encodeURIComponent(data.nombre||'')+'%0ACelular: '+encodeURIComponent(data.telefono||'')+
          (FISICO
            ?'%0ACiudad: '+encodeURIComponent((data.ciudad||'')+(data.departamento?', '+data.departamento:''))+'%0ADirección: '+encodeURIComponent(data.direccion||'')
            :'%0ACorreo: '+encodeURIComponent(data.email||''))+
          '%0ACantidad: '+encodeURIComponent(String(q))+'%0ATotal: '+encodeURIComponent('$'+fmt(UNITN*q)+' COP')+
          '%0A%0A'+encodeURIComponent(FISICO?'Pago contra entrega':(SERVICE?'Servicio - coordinar agenda':'Pago seguro / acceso inmediato'));
        okWa.href=WA.split('?text=')[0]+'?text='+msg;
      }else if(okWa){
        okWa.style.display='none';
      }
      box.classList.add('sent');
      box.scrollIntoView({behavior:'smooth',block:'center'});
    }catch(err){
      btn.disabled=false;btn.innerHTML=txt;
      alert('No se pudo enviar el pedido: '+err.message);
    }
  });
})();
</script>
<script>${SCRIPT_GEO}</script>
</body>
</html>`;
}

/** Una línea del body de la sección = un ítem (mismo criterio que renderer-v3). */
function lineas(body: unknown): string[] {
  const texto = String(body ?? "").trim();
  if (!texto) return [];
  return texto
    .split(/\n+|\s+\|\s+/)
    .map((x) => x.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export interface FilaEstilo {
  name?: string | null;
  slug?: string | null;
  sections?: unknown;
  design?: Record<string, any> | null;
}

/**
 * Secciones + design del Studio → el objeto `p` del renderer. Las fotos, el
 * precio anterior, la garantía y los testimonios salen SIEMPRE de los datos
 * reales del producto; de la IA vienen solo los bloques de copy extra
 * (design.estiloExtras) que pidió generarLandingLocal.
 */
export function estiloDesdeFila(a: {
  row: FilaEstilo | null | undefined;
  producto?: any;
  negocio?: { nombre?: string | null; whatsapp?: string | null } | null;
  fotos?: string[];
  precioAntes?: number | null;
  modelo?: string;
  video?: string | null;
  /** El envío REAL (larga para el preciobox, corta para el sello): lo resuelve renderizarLandingEstilo con las condiciones del negocio. */
  envioReal?: { larga: string; corta: string } | null;
}): DatosEstilo {
  const row = a.row || {};
  const producto = a.producto || null;
  const negocio = a.negocio || {};
  const design = row.design && typeof row.design === "object" ? row.design : {};
  const ex = design.estiloExtras && typeof design.estiloExtras === "object" ? design.estiloExtras : {};
  const secciones = Array.isArray(row.sections) ? row.sections.filter(Boolean) : [];
  const porTipo = (t: string): any => secciones.find((s: any) => s?.type === t) || null;

  const hero = porTipo("hero");
  const beneficios = porTipo("benefits");
  const faqSec = porTipo("faq");
  const testiSec = porTipo("testimonials");

  const cierre = porTipo("cta");
  const ctaText = String(cierre?.cta || "").trim();

  const bullets = lineas(beneficios?.body);
  const baseBullets: string[] = bullets.length
    ? bullets
    : Array.isArray(producto?.features)
      ? producto.features.map((f: unknown) => String(f)).slice(0, 5)
      : [];

  const faq: { q: string; a: string }[] = [];
  for (const linea of lineas(faqSec?.body)) {
    const partes = linea.split(/\s+\|\s+/);
    if (partes.length >= 2 && partes[0].trim() && partes.slice(1).join(" | ").trim()) {
      faq.push({ q: partes[0].trim(), a: partes.slice(1).join(" | ").trim() });
    }
  }

  let testimonials: DatoTestimonio[] = testimoniosDelProducto(producto).map((t: { nombre: string; ciudad?: string; texto: string }) => ({
    name: t.nombre,
    city: t.ciudad || "",
    text: t.texto,
  }));
  if (!testimonials.length) {
    testimonials = lineas(testiSec?.body)
      .map((linea): DatoTestimonio | null => {
        const partes = linea.split(/\s+\|\s+/);
        if (partes.length >= 2) return { text: partes[0].trim(), name: partes[1].trim() };
        return { text: linea, name: "" };
      })
      .filter((t): t is DatoTestimonio => !!t && !!t.text);
  }

  const fotos = (a.fotos || []).filter(Boolean).map(String);
  const descripcion = String(producto?.description || "").trim();
  const subtitulo = String(hero?.subtitle || "").trim() || descripcion.split(/\n+/)[0] || "";
  const modelo = a.modelo || "digital";
  const kind = modelo === "fisico" ? undefined : modelo === "servicio" || modelo === "cotizacion" ? "service" : "digital";

  const con = Array.isArray(ex.comparison?.conProducto) ? ex.comparison.conProducto.map(String).filter(Boolean) : [];
  const sin = Array.isArray(ex.comparison?.sinProducto) ? ex.comparison.sinProducto.map(String).filter(Boolean) : [];

  const garantia = a.producto ? garantiaDelProducto(a.producto) : null;

  return {
    accent: typeof design.primary === "string" && /^#[0-9a-f]{3,8}$/i.test(design.primary) ? design.primary : undefined,
    // style null/vacío ("que la IA elija") o inválido → heurística de precio/categoría.
    style: (ESTILOS as readonly string[]).includes(String(design.style))
      ? String(design.style)
      : elegirEstilo(producto, a.precioAntes || undefined),
    productName: String(producto?.name || row.name || "Producto"),
    tagline: subtitulo.slice(0, 160),
    brand: negocio.nombre || producto?.brand || "",
    slug: String(row.slug || ""),
    price: producto?.price ?? 0,
    oldPrice: Number(a.precioAntes) > 0 ? Number(a.precioAntes) : undefined,
    // El DESCUENTO que la IA "escribiera" en estiloExtras NO se muestra: una
    // cifra sin un precio anterior real es inventada. El ahorro/la rebaja
    // que salen acá son los calculables con los DOS precios reales.
    // El envío: el REAL (resuelto arriba con las condiciones del negocio);
    // sin condiciones, el neutro.
    envio: a.envioReal?.larga,
    envioCorto: a.envioReal?.corta,
    garantia: garantia ? String(garantia) : undefined,
    timer: ex.timer !== false,
    image: fotos[0] || undefined,
    gallery: fotos.slice(1),
    video: a.video || null,
    headline: String(hero?.title || "").trim() || String(producto?.name || row.name || ""),
    subheadline: subtitulo,
    heroBullets: baseBullets.slice(0, 5),
    benefits: baseBullets,
    features: baseBullets.slice(0, 4).map((t, i) => ({ title: t, icon: ICONS[i % ICONS.length] })),
    painPoints: Array.isArray(ex.painPoints) ? ex.painPoints.map(String).filter(Boolean).slice(0, 6) : [],
    useCases: Array.isArray(ex.useCases) ? ex.useCases.map(String).filter(Boolean) : [],
    useCasesTitle: typeof ex.useCasesTitle === "string" ? ex.useCasesTitle : undefined,
    comparison: con.length || sin.length ? { titulo: ex.comparison?.titulo, conProducto: con, sinProducto: sin } : null,
    riskFree: garantia ? { title: typeof ex.riskFree?.title === "string" && ex.riskFree.title ? ex.riskFree.title : "Tu compra está protegida", text: String(garantia) } : null,
    testimonials,
    faq,
    announce: typeof ex.announce === "string" ? ex.announce : undefined,
    heroBadge: typeof ex.heroBadge === "string" ? ex.heroBadge : undefined,
    whatsapp: negocio.whatsapp || producto?.whatsapp || "",
    kind,
    cta: ctaText || undefined,
  };
}

/**
 * Render completo de una landing estilo: fotos únicas, negocio real,
 * precio anterior de metadata y cierre según el modelo del producto
 * (físico → form a /pedido; digital/servicio → WhatsApp + enlaces de pago).
 */
export async function renderizarLandingEstilo(a: {
  tenantId: number;
  row: FilaEstilo;
  producto?: any | null;
  precioAntes?: number | null;
  /** Action del form físico; si no viene, se calcula del slug. */
  accion?: string;
  preview?: boolean;
  host?: string;
  pago?: { mercadopago?: string | null; paypal?: string | null } | null;
}): Promise<string> {
  const producto = a.producto ?? null;
  const negocio = await negocioParaRender(a.tenantId, producto);
  const modelo = producto ? modeloDelProducto(producto) : "digital";

  // ── El envío con las CONDICIONES REALES (review 04-10) ──────────────────
  // Antes el código decía "Envío gratis a todo el país" A MANO: si el
  // negocio no declara incluido, era una promesa inventada en la página.
  // La fuente es la misma que usa el anuncio (modelo-de-negocio), resuelta
  // UNA vez por render y en dos calibres (la larga del precio, la corta del
  // sello).
  let envioReal: { larga: string; corta: string } | null = null;
  if (modelo === "fisico") {
    try {
      const { getBusinessContext } = await import("../business-context");
      const { fraseCostoEnvio } = await import("../modelo-de-negocio");
      const conds = (await getBusinessContext(a.tenantId))?.condiciones;
      if (conds) {
        envioReal = {
          larga: fraseCostoEnvio(conds),
          corta: /^incluid|gratis/i.test(String(conds?.envio?.costo || "").trim()) ? "incluido" : String(conds?.envio?.costo || "nacional").slice(0, 24),
        };
      }
    } catch { /* sin condiciones: el neutro, que no promete */ }
  }

  let fotos: string[] = [];
  try {
    fotos = producto
      ? await fotosUnicasDelProducto(producto, producto?.id ? { guardar: guardadorDeMetadata(Number(producto.id)) } : undefined)
      : [];
  } catch {
    fotos = producto ? [producto.imageUrl].filter(Boolean).map(String) : [];
  }

  let precioAntes = a.precioAntes ?? null;
  if (precioAntes == null && producto?.id) {
    try {
      precioAntes = Number((await metadataDelProducto(a.tenantId, Number(producto.id)))?.precioAntes ?? 0) || null;
    } catch {
      precioAntes = null;
    }
  }

  let video: string | null = null;
  try {
    const { videoDeProducto } = await import("../video-de-producto");
    video = producto ? videoDeProducto(producto?.metadata) || null : null;
  } catch {
    video = null;
  }

  const slug = String(a.row?.slug || "");
  const accion =
    a.accion != null
      ? a.accion
      : a.preview
        ? "/api/landing-publica/preview/pedido"
        : slug
          ? `/api/landing-publica/${encodeURIComponent(slug)}/pedido`
          : "";

  const p = estiloDesdeFila({
    row: a.row,
    producto,
    negocio,
    fotos,
    precioAntes,
    modelo,
    video,
    // El envío REAL del negocio, resuelto una vez acá arriba:
    ...(envioReal ? { envioReal } : {}),
  });

  let html = renderizarEstilo(p, { host: a.host || "", accion, pago: a.pago });
  if (modelo === "fisico") html = formularioConOpciones(html, producto);
  html = conIconosSeguros(html);
  return html;
}
