/**
 * ============================================================
 * EL RENDERER — de datos a una landing que se ve profesional
 * ============================================================
 *
 * El dueño lo dijo mirando el resultado: *"esas landings son solo HTML, no
 * tienen diseño, no adjunta la imagen ni nada"*. Tenía razón, y el código lo
 * confirmaba: el exportador viejo escribía la MISMA caja para las once
 * secciones --`<h2>`, `<p>`, un botón, todo centrado-- con quince líneas de
 * CSS, y `imageUrl` aparecía una sola vez en todo el archivo: en la
 * declaración del tipo. Nunca se usaba. La foto del producto no llegaba nunca
 * a la página.
 *
 * ── Qué hace distinto este módulo ─────────────────────────────────────────
 *
 * 1. TODO sale de los tokens. Colores, aire, ancho, tipografía, radios y
 *    sombras se emiten como variables CSS desde `TokensDeDiseno`. Cambiar de
 *    familia cambia la página entera sin tocar una sola plantilla.
 *
 * 2. Cada sección tiene layouts REALES y distintos entre sí: `hero_split` es
 *    una grilla de dos columnas con la foto al lado; `hero_center` es una
 *    columna angosta; `hero_full_visual` pone la imagen de fondo con el texto
 *    encima. No son el mismo bloque con otro color.
 *
 * 3. La foto del producto se coloca según el tratamiento de la familia
 *    (enmarcada, a sangre, recorte alto, flotante, en contexto), que es lo
 *    que hace que la misma foto se vea premium en una y comercial en otra.
 *
 * 4. Es responsive de verdad: las grillas colapsan a una columna, la escala
 *    tipográfica usa `clamp()` y el aire vertical se reduce en móvil. No es un
 *    desktop encogido.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────
 *
 * No llama a ningún modelo y no inventa contenido. Recibe secciones ya
 * escritas y las compone. Si una sección no trae imagen, el layout se adapta
 * en vez de dejar un hueco -- y si no trae dato, no se dibuja el bloque:
 * ningún "Testimonios" vacío con texto de relleno.
 *
 * ── Seguridad ─────────────────────────────────────────────────────────────
 *
 * Todo lo que viene de afuera --texto del modelo, nombre del producto, URLs--
 * pasa por `esc()` o por `urlSegura()`. El contenido lo escribe un modelo y lo
 * lee un cliente del negocio en una página pública: inyectar HTML acá sería
 * inyectarlo en el sitio del dueño.
 */

import { tokensDe, type FamiliaVisual, type TokensDeDiseno } from "./design-system";

export interface SeccionParaRenderizar {
  id: string;
  type: string;
  /** Layout elegido. Si no viene o no existe, se usa el de la familia. */
  layout?: string | null;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  cta?: string | null;
  /** Imagen propia de la sección. Si no hay, se usa la del producto. */
  image?: string | null;
  /** Galería: las fotos reales del producto. */
  images?: string[] | null;
}

export interface ProductoParaRenderizar {
  name?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  price?: number | string | null;
  currency?: string | null;
  /** A dónde va el botón. Sin esto los CTA no llevan a ningún lado. */
  paymentLink?: string | null;
  whatsapp?: string | null;
}

/**
 * El negocio dueño de la página: nombre para el encabezado y el pie, WhatsApp
 * para el CTA, y las condiciones reales para la franja de confianza (envío
 * incluido, contraentrega, plazo). Sin esto la página arrancaba en el H1
 * pelado, sin marca y sin a dónde ir.
 */
export interface NegocioParaRenderizar {
  nombre?: string | null;
  whatsapp?: string | null;
  /** "fisico" | "digital" | ... (ver modelo-de-negocio.ts). */
  modelo?: string | null;
  /** Frases ya resueltas para la franja de confianza. */
  confianza?: string[] | null;
}

/**
 * Cómo cierra la página: depende del MODELO del producto.
 *   contraentrega → formulario de datos de envío (POST a `accion`) o WhatsApp
 *   pago          → MercadoPago / PayPal (mismos enlaces que la tienda) o WhatsApp
 *   whatsapp      → solo WhatsApp (servicios, cotización, captación)
 */
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

// ─── Seguridad ───────────────────────────────────────────────────────────────

/** Escapa para HTML. Incluye la comilla simple: los atributos también se rompen. */
export function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Solo http(s) y rutas propias.
 *
 * Sin esto, un `javascript:` en el enlace de pago --que puede venir de un campo
 * editable-- se convierte en ejecución de código en la página pública del
 * negocio. Devuelve cadena vacía cuando no confía, y quien llama decide.
 */
export function urlSegura(valor: unknown): string {
  const v = String(valor ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v) || v.startsWith("/") || v.startsWith("#")) return v;
  return "";
}

// ─── Utilidades de contenido ─────────────────────────────────────────────────

/**
 * Parte un cuerpo en ítems.
 *
 * El copy llega con los puntos separados por " · " o por saltos de línea, que
 * es como los escriben tanto el modelo como el respaldo determinístico.
 */
function items(body: unknown): string[] {
  const lineas = String(body ?? "")
    .split(/\n+|\s+·\s+/)
    .map((s) => s.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
  // Un solo párrafo largo no es una lista: se parte en frases (hasta 6). Es
  // lo que pasaba con los beneficios de la faja: cuatro ideas en un renglón.
  if (lineas.length === 1 && (lineas[0].match(/[.!?]\s+[A-ZÁÉÍÓÚÑ¿¡]/g)?.length ?? 0) >= 2) {
    return lineas[0].split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
  }
  return lineas;
}

/** "¿Pregunta? | Respuesta" → las dos partes; sin " | ", solo la pregunta. */
function preguntaYRespuesta(item: string): { q: string; a: string } {
  const [q, ...resto] = item.split(/\s*\|\s*/);
  return { q: (q || "").trim(), a: resto.join(" | ").trim() };
}

/** ¿El ítem ya trae su emoji del catálogo? Si sí, no se le agrega viñeta. */
function conVineta(item: string): string {
  return /^\p{Extended_Pictographic}/u.test(item) ? esc(item) : `<span class="tick" aria-hidden="true"></span>${esc(item)}`;
}

function precio(p?: ProductoParaRenderizar | null): string {
  const n = Number(p?.price ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toLocaleString("es-CO")} ${String(p?.currency || "").trim()}`.trim();
}

/** A dónde apunta un CTA. El enlace de pago manda; si no hay, WhatsApp. */
let destinoDelCierre: string | null = null;

function destino(p?: ProductoParaRenderizar | null): string {
  // Con un bloque de cierre en la página (formulario o botones de pago),
  // todos los CTA llevan ahí: es el paso siguiente real.
  if (destinoDelCierre) return destinoDelCierre;
  const pago = urlSegura(p?.paymentLink);
  if (pago) return pago;
  const wa = String(p?.whatsapp || "").replace(/\D/g, "");
  return wa ? `https://wa.me/${wa}` : "#comprar";
}

function enlaceWhatsApp(p?: ProductoParaRenderizar | null, n?: NegocioParaRenderizar | null): string {
  const wa = String(n?.whatsapp || p?.whatsapp || "").replace(/\D/g, "");
  if (!wa) return "";
  const texto = encodeURIComponent(`Hola, me interesa ${p?.name || "este producto"}`);
  return `https://wa.me/${wa}?text=${texto}`;
}

/** El bloque de cierre, según el modelo. */
function bloqueDeCierre(c: CierreDeLanding | null | undefined, p: ProductoParaRenderizar | null | undefined, n: NegocioParaRenderizar | null | undefined): string {
  if (!c) return "";
  const wa = enlaceWhatsApp(p, n);
  const precioTxt = precio(p);
  const esCol = !c.pais || /^(co|col|colombia)$/i.test(String(c.pais));
  if (c.tipo === "contraentrega" && c.accion) {
    const campo = (name: string, label: string, extra = "") => `<label>${esc(label)}<input name="${name}" required ${extra}></label>`;
    return `<section class="sec sec--cierre" id="pedido"><div class="wrap narrow">
    <div class="head"><p class="eyebrow">Pedido</p><h2>Pedí ${esc(p?.name || "tu producto")}${precioTxt ? ` por ${esc(precioTxt)}` : ""}</h2>
    <p class="lead">${c.pago === "anticipado" ? "Te contactamos por WhatsApp para coordinar el pago y el envío." : "Pagás cuando lo recibís. Completá tus datos y lo despachamos."}</p></div>
    <form class="pedido" method="post" action="${esc(c.accion)}" data-json>
      ${campo("nombre", "Nombre y apellido")}
      ${campo("telefono", "Celular", 'inputmode="tel"')}
      ${campo("documento", esCol ? "Cédula" : "Documento de identidad", 'inputmode="numeric"')}
      ${campo("direccion", "Dirección (calle, número, apto)")}
      <label>Barrio<input name="barrio"></label>
      ${campo("ciudad", "Ciudad")}
      ${campo("departamento", esCol ? "Departamento" : "Estado o provincia")}
      <label>Punto de referencia<input name="referencia" placeholder="Frente a la panadería, al lado del parque…"></label>
      <button class="cta" type="submit">${c.pago === "anticipado" ? "Quiero pedirlo" : "Pedir y pagar al recibir"}</button>
      <p class="pedido__estado" aria-live="polite"></p>
    </form>
    ${wa ? `<p class="o-bien">¿Preferís pedirlo por chat? <a href="${esc(wa)}">Escribinos por WhatsApp</a></p>` : ""}
  </div></section>
  <script>
  (function(){var f=document.querySelector('form.pedido');if(!f)return;f.addEventListener('submit',async function(e){e.preventDefault();var b=f.querySelector('button');var est=f.querySelector('.pedido__estado');b.disabled=true;est.textContent='Registrando tu pedido…';try{var d={};new FormData(f).forEach(function(v,k){d[k]=v});var r=await fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});var j=await r.json();if(j.ok){f.innerHTML='<p class="lead">✅ ¡Pedido recibido! Te contactamos por WhatsApp para confirmar el despacho. Llega en '+(j.plazo||'unos días')+'.</p>';}else{est.textContent=j.error||'No se pudo registrar. Intentá de nuevo o escribinos por WhatsApp.';b.disabled=false;}}catch(x){est.textContent='No se pudo registrar. Escribinos por WhatsApp.';b.disabled=false;}});})();
  </script>`;
  }
  if (c.tipo === "pago") {
    const botones = [
      c.mercadopago ? `<a class="cta" href="${esc(c.mercadopago)}">Pagar con MercadoPago</a>` : "",
      c.paypal ? `<a class="cta cta--alt" href="${esc(c.paypal)}">Pagar con PayPal</a>` : "",
      wa ? `<a class="cta cta--alt" href="${esc(wa)}">Comprar por WhatsApp</a>` : "",
    ].filter(Boolean).join("");
    if (!botones) return "";
    return `<section class="sec sec--cierre" id="pedido"><div class="wrap narrow center">
    <p class="eyebrow">Compra</p><h2>${esc(p?.name || "")}${precioTxt ? ` · ${esc(precioTxt)}` : ""}</h2>
    <p class="lead">Elegí cómo pagar. Apenas se confirma el pago recibís el acceso.</p>
    <div class="botones">${botones}</div>
  </div></section>`;
  }
  if (wa) {
    return `<section class="sec sec--cierre" id="pedido"><div class="wrap narrow center">
    <h2>${esc(p?.name || "")}</h2><div class="botones"><a class="cta" href="${esc(wa)}">Escribinos por WhatsApp</a></div>
  </div></section>`;
  }
  return "";
}

function boton(texto: unknown, p?: ProductoParaRenderizar | null): string {
  const t = String(texto ?? "").trim();
  if (!t) return "";
  return `<a class="cta" href="${esc(destino(p))}">${esc(t)}</a>`;
}

/**
 * La imagen de la sección, o la del producto como respaldo.
 *
 * `alt` describe el producto porque es lo que se ve: una landing sin alt es
 * inaccesible, y Meta penaliza las páginas de destino mal armadas.
 */
function figura(sec: SeccionParaRenderizar, p?: ProductoParaRenderizar | null, clase = "fig"): string {
  const src = urlSegura(sec.image) || urlSegura(p?.imageUrl);
  if (!src) return "";
  return `<figure class="${clase}"><img src="${esc(src)}" alt="${esc(p?.name || sec.title || "")}" loading="lazy" decoding="async"></figure>`;
}

// ─── Layouts ─────────────────────────────────────────────────────────────────

type Renderizador = (s: SeccionParaRenderizar, p: ProductoParaRenderizar | null | undefined, t: TokensDeDiseno) => string;

// Antes imprimía el nombre INTERNO de la sección ("hero", "how it works"):
// salía "HERO" y "BENEFITS" arriba de cada bloque en la página del cliente.
const ETIQUETA: Record<string, string> = {
  benefits: "Beneficios", "how-it-works": "Cómo funciona", offer: "Oferta", logistics: "Envío y pago",
  faq: "Preguntas frecuentes", testimonials: "Opiniones", authority: "Quién está detrás", comparison: "Comparación",
  "before-after": "Antes y después", gallery: "Fotos reales",
};
const eyebrow = (s: SeccionParaRenderizar) => (s.type && ETIQUETA[s.type] ? `<p class="eyebrow">${esc(ETIQUETA[s.type])}</p>` : "");
const titulo = (s: SeccionParaRenderizar) => (s.title ? `<h2>${esc(s.title)}</h2>` : "");
const bajada = (s: SeccionParaRenderizar) => (s.subtitle ? `<p class="lead">${esc(s.subtitle)}</p>` : "");

/**
 * El catálogo. Cada entrada compone DISTINTO -- distinta grilla, distinto lugar
 * para la foto, distinta jerarquía-- que es lo que pedía el punto 3 del plan.
 */
const LAYOUTS: Record<string, Renderizador> = {
  // ── HERO ────────────────────────────────────────────────────────────────
  hero_center: (s, p) => `<div class="wrap center narrow">
    ${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}${boton(s.cta, p)}
    ${figura(s, p, "fig fig--below")}
  </div>`,

  hero_left: (s, p) => `<div class="wrap left">
    ${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}${boton(s.cta, p)}
  </div>`,

  hero_split: (s, p) => `<div class="wrap grid-2 middle">
    <div>${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}${boton(s.cta, p)}</div>
    ${figura(s, p) || '<div class="ghost"></div>'}
  </div>`,

  hero_product_focus: (s, p) => `<div class="wrap grid-2 middle reverse">
    ${figura(s, p, "fig fig--hero")}
    <div>${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}
      ${precio(p) ? `<p class="price">${esc(precio(p))}</p>` : ""}${boton(s.cta, p)}</div>
  </div>`,

  hero_editorial: (s, p) => `<div class="wrap narrow center">
    ${eyebrow(s)}<h1 class="serif">${esc(s.title || "")}</h1>
  </div>${figura(s, p, "fig fig--bleed")}<div class="wrap narrow center">${bajada(s)}${boton(s.cta, p)}</div>`,

  // Dropshipping 2026: degradado del acento a todo el hero, foto flotando con
  // halo, etiqueta de contraentrega y tres micro-beneficios debajo.
  hero_gradient_product: (s, p) => `<div class="wrap grid-2 middle hero-grad">
    <div>${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}
      <p class="pill">📦 Pago contraentrega · envío a todo el país</p>
      ${precio(p) ? `<p class="price">${esc(precio(p))}</p>` : ""}${boton(s.cta, p)}</div>
    ${figura(s, p, "fig fig--hero fig--halo")}
  </div>`,

  hero_dark: (s, p) => `<div class="wrap grid-2 middle">
    <div>${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}${boton(s.cta, p)}</div>
    ${figura(s, p, "fig fig--glow")}
  </div>`,

  /**
   * La foto va SI O SI.
   *
   * Sin ella, una landing de respuesta directa renderizaba cero imagenes:
   * hero_offer, benefits_numbered y offer_urgency --sus tres layouts
   * favoritos-- no ponian ninguna. Medido generando la pagina de muestra, y es
   * exactamente lo que el dueno reporto: "no adjunta la imagen ni nada". En
   * venta directa, no ver el producto es la peor version del problema.
   */
  hero_offer: (s, p) => `<div class="wrap center narrow">
    ${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}
    ${figura(s, p, "fig fig--below")}
    ${precio(p) ? `<p class="price price--big">${esc(precio(p))}</p>` : ""}${boton(s.cta, p)}
  </div>`,

  hero_full_visual: (s, p) => {
    const src = urlSegura(s.image) || urlSegura(p?.imageUrl);
    const fondo = src ? ` style="background-image:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url('${esc(src)}')"` : "";
    return `<div class="hero-visual${src ? " has-bg" : ""}"${fondo}><div class="wrap center narrow">
      ${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}${boton(s.cta, p)}
    </div></div>`;
  },

  // ── BENEFICIOS ──────────────────────────────────────────────────────────
  benefits_cards: (s, p) => `<div class="wrap">
    <div class="head">${eyebrow(s)}${titulo(s)}${bajada(s)}</div>
    <ul class="cards">${items(s.body).map((i) => `<li class="card">${conVineta(i)}</li>`).join("")}</ul>
  </div>`,

  benefits_icon_grid: (s) => `<div class="wrap">
    <div class="head">${eyebrow(s)}${titulo(s)}${bajada(s)}</div>
    <ul class="icons">${items(s.body).map((i) => `<li>${conVineta(i)}</li>`).join("")}</ul>
  </div>`,

  benefits_split: (s, p) => `<div class="wrap grid-2 middle">
    <div>${eyebrow(s)}${titulo(s)}${bajada(s)}
      <ul class="plain">${items(s.body).map((i) => `<li>${conVineta(i)}</li>`).join("")}</ul></div>
    ${figura(s, p) || '<div class="ghost"></div>'}
  </div>`,

  benefits_numbered: (s) => `<div class="wrap narrow">
    <div class="head left">${eyebrow(s)}${titulo(s)}${bajada(s)}</div>
    <ol class="numbered">${items(s.body).map((i) => `<li>${esc(i)}</li>`).join("")}</ol>
  </div>`,

  benefits_editorial: (s) => `<div class="wrap narrow">
    <div class="head">${eyebrow(s)}<h2 class="serif">${esc(s.title || "")}</h2>${bajada(s)}</div>
    <div class="columns">${items(s.body).map((i) => `<p>${esc(i)}</p>`).join("")}</div>
  </div>`,

  benefits_visual: (s, p) => `<div class="wrap">
    <div class="head">${eyebrow(s)}${titulo(s)}${bajada(s)}</div>
    ${figura(s, p, "fig fig--bleed")}
    <ul class="icons">${items(s.body).map((i) => `<li>${conVineta(i)}</li>`).join("")}</ul>
  </div>`,

  // ── OFERTA ──────────────────────────────────────────────────────────────
  offer_card: (s, p) => `<div class="wrap center narrow">
    <div class="panel">${eyebrow(s)}${titulo(s)}${bajada(s)}
      ${precio(p) ? `<p class="price price--big">${esc(precio(p))}</p>` : ""}
      ${s.body ? `<ul class="plain center-list">${items(s.body).map((i) => `<li>${conVineta(i)}</li>`).join("")}</ul>` : ""}
      ${boton(s.cta, p)}</div>
  </div>`,

  offer_split: (s, p) => `<div class="wrap grid-2 middle">
    ${figura(s, p) || '<div class="ghost"></div>'}
    <div>${eyebrow(s)}${titulo(s)}${bajada(s)}
      ${precio(p) ? `<p class="price price--big">${esc(precio(p))}</p>` : ""}${boton(s.cta, p)}</div>
  </div>`,

  offer_product: (s, p) => `<div class="wrap grid-2 middle">
    <div>${eyebrow(s)}${titulo(s)}${bajada(s)}
      ${s.body ? `<ul class="plain">${items(s.body).map((i) => `<li>${conVineta(i)}</li>`).join("")}</ul>` : ""}
      ${precio(p) ? `<p class="price price--big">${esc(precio(p))}</p>` : ""}${boton(s.cta, p)}</div>
    ${figura(s, p, "fig fig--float") || '<div class="ghost"></div>'}
  </div>`,

  offer_minimal: (s, p) => `<div class="wrap narrow left">
    ${titulo(s)}${bajada(s)}${precio(p) ? `<p class="price">${esc(precio(p))}</p>` : ""}${boton(s.cta, p)}
  </div>`,

  offer_dark: (s, p) => `<div class="wrap center narrow">
    <div class="panel panel--glow">${eyebrow(s)}${titulo(s)}${bajada(s)}
      ${precio(p) ? `<p class="price price--big">${esc(precio(p))}</p>` : ""}${boton(s.cta, p)}</div>
  </div>`,

  /**
   * Urgencia SIN inventarla: se destaca la oferta que ya existe, no se agrega
   * un contador ni "quedan 3 cupos". El punto 18 del plan es absoluto, y esta
   * es justo la sección donde sería más fácil romperlo.
   */
  offer_urgency: (s, p) => `<div class="wrap center narrow">
    <div class="panel panel--accent">${titulo(s)}${bajada(s)}
      ${figura(s, p, "fig fig--below")}
      ${precio(p) ? `<p class="price price--big">${esc(precio(p))}</p>` : ""}${boton(s.cta, p)}</div>
  </div>`,

  // ── TESTIMONIOS ─────────────────────────────────────────────────────────
  testimonial_cards: (s) => `<div class="wrap">
    <div class="head">${titulo(s)}${bajada(s)}</div>
    <ul class="cards">${items(s.body).map((i) => `<li class="card quote">${esc(i)}</li>`).join("")}</ul>
  </div>`,

  testimonial_quote: (s) => `<div class="wrap narrow center">
    <blockquote>${esc(s.body || s.subtitle || "")}</blockquote>${s.title ? `<p class="who">${esc(s.title)}</p>` : ""}
  </div>`,

  testimonial_large: (s) => `<div class="wrap narrow center">
    ${titulo(s)}<blockquote class="big">${esc(s.body || s.subtitle || "")}</blockquote>
  </div>`,

  testimonial_editorial: (s) => `<div class="wrap narrow">
    ${titulo(s)}<div class="columns">${items(s.body).map((i) => `<p>${esc(i)}</p>`).join("")}</div>
  </div>`,

  testimonial_slider: (s) => `<div class="wrap">
    <div class="head">${titulo(s)}${bajada(s)}</div>
    <ul class="rail">${items(s.body).map((i) => `<li class="card quote">${esc(i)}</li>`).join("")}</ul>
  </div>`,

  // ── FAQ ─────────────────────────────────────────────────────────────────
  faq_accordion: (s) => `<div class="wrap narrow">
    <div class="head left">${titulo(s)}${bajada(s)}</div>
    <div class="faq">${items(s.body).map((i) => `<details><summary>${esc(i)}</summary></details>`).join("")}</div>
  </div>`,

  faq_minimal: (s) => `<div class="wrap narrow left">
    ${titulo(s)}<ul class="plain">${items(s.body).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
  </div>`,

  faq_cards: (s) => `<div class="wrap">
    <div class="head">${titulo(s)}${bajada(s)}</div>
    <ul class="cards">${items(s.body).map((i) => `<li class="card">${esc(i)}</li>`).join("")}</ul>
  </div>`,

  faq_split: (s) => `<div class="wrap grid-2">
    <div>${titulo(s)}${bajada(s)}</div>
    <div class="faq">${items(s.body).map((i) => `<details><summary>${esc(i)}</summary></details>`).join("")}</div>
  </div>`,

  // ── CIERRE y genérico ───────────────────────────────────────────────────
  cta_final: (s, p) => `<div class="wrap center narrow">
    <h2>${esc(s.title || "")}</h2>${bajada(s)}${boton(s.cta, p)}
  </div>`,

  // ── GALERÍA: las fotos reales del producto ──────────────────────────────
  gallery_grid: (s, p) => {
    const fotos = (Array.isArray(s.images) ? s.images : []).map(urlSegura).filter(Boolean);
    if (fotos.length === 0) return "";
    return `<div class="wrap">
    <div class="head">${eyebrow(s)}${titulo(s)}${bajada(s)}</div>
    <ul class="galeria">${fotos.map((u) => `<li><img src="${esc(u)}" alt="${esc(p?.name || "")}" loading="lazy" decoding="async"></li>`).join("")}</ul>
  </div>`;
  },

  // ── FAQ con respuesta ("¿Pregunta? | Respuesta") ────────────────────────
  faq_respuestas: (s) => `<div class="wrap narrow">
    <div class="head left">${eyebrow(s)}${titulo(s)}${bajada(s)}</div>
    <div class="faq">${items(s.body).map((i) => { const { q, a } = preguntaYRespuesta(i); return `<details><summary>${esc(q)}</summary>${a ? `<p>${esc(a)}</p>` : ""}</details>`; }).join("")}</div>
  </div>`,

  // ── LOGÍSTICA: tres datos que se leen de un vistazo ─────────────────────
  logistics_strip: (s, p) => `<div class="wrap narrow">
    <div class="head">${eyebrow(s)}${titulo(s)}${bajada(s)}</div>
    <ul class="franja">${items(s.body).map((i) => `<li>${conVineta(i)}</li>`).join("")}</ul>
    ${boton(s.cta, p)}
  </div>`,
};

/** Cuando el layout pedido no existe, se compone algo correcto igual. */
const GENERICO: Renderizador = (s, p) => `<div class="wrap narrow">
  <div class="head">${eyebrow(s)}${titulo(s)}${bajada(s)}</div>
  ${s.body ? `<ul class="plain">${items(s.body).map((i) => `<li>${conVineta(i)}</li>`).join("")}</ul>` : ""}
  ${figura(s, p, "fig fig--below")}${boton(s.cta, p)}
</div>`;

/** Los nombres de layout que este renderer sabe dibujar. */
export const LAYOUTS_DISPONIBLES = Object.keys(LAYOUTS);

/**
 * Elige el renderizador de una sección.
 *
 * Orden: el layout que pide la sección → el favorito de la familia para ese
 * tipo → el genérico. Nunca devuelve undefined: una sección sin dibujar es un
 * hueco en la página del dueño.
 */
function renderizadorDe(sec: SeccionParaRenderizar, t: TokensDeDiseno): Renderizador {
  // Los tipos nuevos (o los que tienen un layout claramente mejor) no
  // dependen de que la familia los conozca.
  if (sec.type === "gallery") return LAYOUTS.gallery_grid;
  if (sec.type === "faq" && items(sec.body).some((i) => i.includes("|"))) return LAYOUTS.faq_respuestas;
  if (sec.type === "logistics") return LAYOUTS.logistics_strip;
  const pedido = String(sec.layout || "").trim();
  if (pedido && LAYOUTS[pedido]) return LAYOUTS[pedido];

  const preferido = t.layoutsPreferidos[sec.type]?.find((l) => LAYOUTS[l]);
  if (preferido) return LAYOUTS[preferido];

  if (sec.type === "cta" && LAYOUTS.cta_final) return LAYOUTS.cta_final;
  return GENERICO;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

/**
 * El CSS sale ENTERO de los tokens.
 *
 * Es lo que hace que cambiar de familia cambie la página y no solo la paleta:
 * el ancho, el aire, la escala tipográfica, la alineación por defecto, la
 * forma del CTA y el tratamiento de la imagen son todos variables.
 */
const CSS_MARCO = `
.top{position:sticky;top:0;z-index:20;background:var(--fondo);border-bottom:1px solid var(--linea);backdrop-filter:blur(8px)}
.top__in{max-width:var(--ancho);margin:0 auto;padding:12px var(--pad-x);display:flex;align-items:center;justify-content:space-between;gap:16px;text-align:left}
.marca{font-weight:700;letter-spacing:-.01em}
.cta--chica{padding:10px 16px;font-size:.92em}
.sec--confianza{padding-block:0 !important}
.confianza{list-style:none;margin:0 auto;padding:14px var(--pad-x);max-width:var(--ancho);display:flex;flex-wrap:wrap;gap:10px 28px;justify-content:center;border-top:1px solid var(--linea);border-bottom:1px solid var(--linea);font-size:.95em}
.confianza li{display:flex;align-items:center;gap:8px}
.galeria{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
.galeria li{margin:0;aspect-ratio:1;overflow:hidden;border-radius:var(--radio);background:var(--superficie)}
.galeria img{width:100%;height:100%;object-fit:cover;display:block}
.faq details p{margin:10px 0 0;color:var(--suave)}
.franja{list-style:none;margin:0 0 20px;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px}
.franja li{display:flex;align-items:flex-start;gap:10px;padding:14px 16px;border:1px solid var(--linea);border-radius:var(--radio);background:var(--superficie)}
.pedido{display:grid;gap:12px;max-width:520px;margin:0 auto}
.pedido label{display:grid;gap:6px;font-size:.92em;color:var(--suave)}
.pedido input{font:inherit;padding:12px 14px;border:1px solid var(--linea);border-radius:var(--radio);background:var(--superficie);color:var(--texto)}
.pedido input:focus{outline:2px solid var(--acento);outline-offset:1px}
.pedido button{margin-top:6px;font:inherit;cursor:pointer}
.pedido__estado{margin:0;color:var(--suave);font-size:.92em;min-height:1.4em}
.o-bien{text-align:center;margin-top:18px;color:var(--suave)}.o-bien a{color:var(--texto)}
.botones{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.cta--alt{background:transparent;color:var(--texto);border:1px solid var(--texto)}
.pie{padding:32px var(--pad-x) 96px;border-top:1px solid var(--linea);color:var(--suave);font-size:.9em;text-align:center}
.pie p{margin:4px 0}.pie a{color:inherit}
.pie__nota{opacity:.8}
.fijo{position:fixed;left:0;right:0;bottom:0;z-index:30;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:var(--fondo);border-top:1px solid var(--linea);display:none}
.fijo .cta{display:block;text-align:center;width:100%}
@media (max-width:720px){.fijo{display:block}.top .cta--chica{display:none}}
/* ── Movimiento (pedido del dueño: "cosas que se mueven, sensaciones") ──
   Todo parte VISIBLE: solo con JS y IntersectionObserver se ocultan las
   secciones para revelarlas; sin script o con "reducir movimiento", la
   página es estática y completa. */
html{scroll-behavior:smooth}
.js .sec[data-reveal]{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.js .sec[data-reveal].visto{opacity:1;transform:none}
.js .sec--hero{opacity:1;transform:none}
.sec--hero h1{animation:entra .8s cubic-bezier(.2,.7,.2,1) both}
.sec--hero .lead,.sec--hero .price{animation:entra .8s .12s cubic-bezier(.2,.7,.2,1) both}
.sec--hero .cta{animation:entra .8s .22s cubic-bezier(.2,.7,.2,1) both}
.sec--hero .fig img{animation:flota 6s ease-in-out infinite}
@keyframes entra{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes flota{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.confianza li{animation:entra .6s cubic-bezier(.2,.7,.2,1) both}
.confianza li:nth-child(2){animation-delay:.1s}.confianza li:nth-child(3){animation-delay:.2s}
.cta{transition:transform .18s ease,box-shadow .18s ease,filter .18s ease}
.cta:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.18);filter:brightness(1.04)}
.cta:active{transform:translateY(0)}
.card,.franja li,.icons li{transition:transform .22s ease,box-shadow .22s ease}
.card:hover,.franja li:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(0,0,0,.10)}
.galeria img{transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.galeria li:hover img{transform:scale(1.06)}
.fijo .cta{animation:latido 2.6s ease-in-out infinite}
@keyframes latido{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}50%{box-shadow:0 0 0 8px rgba(0,0,0,.06)}}
.faq details{transition:background .2s ease}
.faq details[open]{background:var(--superficie)}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .js .sec[data-reveal]{opacity:1;transform:none;transition:none}
  .sec--hero h1,.sec--hero .lead,.sec--hero .price,.sec--hero .cta,.sec--hero .fig img,.confianza li,.fijo .cta{animation:none}
  .cta,.card,.franja li,.galeria img{transition:none}
}
`;

const JS_MOVIMIENTO = `<script>
(function(){
  if(!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  document.documentElement.classList.add('js');
  var secs=[].slice.call(document.querySelectorAll('.sec:not(.sec--hero):not(.sec--confianza)'));
  secs.forEach(function(s){s.setAttribute('data-reveal','')});
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visto');io.unobserve(e.target);}})},{rootMargin:'0px 0px -10% 0px',threshold:.12});
  secs.forEach(function(s){io.observe(s)});
  // Lo que ya está en pantalla al cargar no espera al scroll.
  secs.forEach(function(s){var r=s.getBoundingClientRect();if(r.top<innerHeight*.9)s.classList.add('visto');});
})();
</script>`;

function css(t: TokensDeDiseno): string {
  const escala = t.tipografia.escala;
  const alinear = t.alineacion === "izquierda" ? "left" : "center";

  // El CTA cambia de FORMA, no de color: es lo que distingue a las familias.
  const ctaPorEstilo: Record<string, string> = {
    solido: `background:var(--acento);color:var(--sobre-acento);border:none;`,
    contorno: `background:transparent;color:var(--texto);border:1px solid var(--texto);`,
    pastilla: `background:var(--acento);color:var(--sobre-acento);border:none;border-radius:999px;`,
    bloque: `background:var(--acento);color:var(--sobre-acento);border:none;display:block;width:100%;max-width:420px;text-align:center;`,
    subrayado: `background:transparent;color:var(--texto);border:none;border-bottom:2px solid var(--acento);border-radius:0;padding-left:0;padding-right:0;`,
  };

  // Y la imagen cambia de ENCUADRE, que es lo que hace que la misma foto se
  // vea premium en una familia y comercial en otra.
  const imgPorTrato: Record<string, string> = {
    enmarcada: `border-radius:var(--radio);border:var(--borde);box-shadow:var(--sombra);`,
    "a-sangre": `border-radius:0;width:100%;`,
    "recorte-alto": `border-radius:var(--radio);aspect-ratio:3/4;object-fit:cover;`,
    flotante: `border-radius:var(--radio);box-shadow:0 24px 48px rgba(0,0,0,.18);`,
    "en-contexto": `border-radius:var(--radio);aspect-ratio:4/3;object-fit:cover;`,
  };

  return `
*,*::before,*::after{box-sizing:border-box}
:root{
  --fondo:${t.color.fondo}; --superficie:${t.color.superficie}; --texto:${t.color.texto};
  --suave:${t.color.textoSuave}; --acento:${t.color.acento}; --sobre-acento:${t.color.sobreAcento};
  --linea:${t.color.borde}; --radio:${t.forma.radio}; --sombra:${t.forma.sombra}; --borde:${t.forma.borde};
  --ancho:${t.ritmo.anchoContenido}; --pad-y:${t.ritmo.padSeccionY}; --pad-x:${t.ritmo.padSeccionX};
  --sep:${t.ritmo.separacion};
}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fondo);color:var(--texto);font-family:${t.tipografia.texto};
  line-height:${t.tipografia.interlineado};-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}

.sec{padding:var(--pad-y) var(--pad-x)}
${t.fondos === "alterno" ? `.sec:nth-child(even){background:var(--superficie)}` : ""}
${t.fondos === "degradado-sutil" ? `.sec:nth-child(even){background:linear-gradient(180deg,var(--superficie),var(--fondo))}` : ""}
${t.fondos === "degradado-vivo" ? `
.sec:nth-child(even):not(.sec--hero):not(.sec--cierre){background:color-mix(in srgb,var(--acento) 7%,#fff)}
.sec.sec--hero,.sec.sec--cierre{background:linear-gradient(135deg,color-mix(in srgb,var(--acento) 70%,#0b0b14) 0%,var(--acento) 100%);color:#fff;position:relative;overflow:hidden}
.sec--hero h1,.sec--hero h2,.sec--cierre h1,.sec--cierre h2{color:#fff}
.sec--cierre .pedido label,.sec--cierre .pedido .ayuda,.sec--cierre p{color:rgba(255,255,255,.9)}
.sec--cierre .pedido input,.sec--cierre .pedido select,.sec--cierre .pedido textarea{background:#fff;color:#111}
.sec--cierre .pedido button,.sec--cierre button[type=submit]{background:#fff;color:var(--acento);font-weight:800;box-shadow:0 14px 40px rgba(0,0,0,.25)}
.sec--hero::before,.sec--cierre::before{content:"";position:absolute;inset:-20% -10% auto -10%;height:70%;background:radial-gradient(60% 60% at 30% 20%,rgba(255,255,255,.22),transparent 70%);pointer-events:none}
.sec--hero .lead,.sec--hero .eyebrow,.sec--cierre .lead,.sec--cierre .eyebrow{color:rgba(255,255,255,.85)}
.sec--hero .price,.sec--cierre .price{color:#fff;font-size:1.8rem}
.sec--hero .btn,.sec--cierre .btn{background:#fff;color:var(--acento);box-shadow:0 14px 40px rgba(0,0,0,.25)}
.btn{background:linear-gradient(135deg,var(--acento),color-mix(in srgb,var(--acento) 70%,#000));box-shadow:0 12px 30px color-mix(in srgb,var(--acento) 40%,transparent)}
.card,.faq details,.benefit{background:rgba(255,255,255,.72);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.6);box-shadow:var(--sombra)}
.fig--halo img{border-radius:28px;box-shadow:0 30px 80px color-mix(in srgb,var(--acento) 45%,transparent),0 0 0 8px rgba(255,255,255,.12)}
.pill{display:inline-block;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);font-weight:600;font-size:.95rem}
` : ""}
.wrap{max-width:var(--ancho);margin-inline:auto;display:flex;flex-direction:column;gap:var(--sep);text-align:${alinear}}
.wrap.narrow{max-width:min(720px,var(--ancho))}
.wrap.center{text-align:center;align-items:center}
.wrap.left{text-align:left;align-items:flex-start}
.head{display:flex;flex-direction:column;gap:12px}
.head.left{text-align:left;align-items:flex-start}

h1,h2{font-family:${t.tipografia.display};font-weight:${t.tipografia.pesoDisplay};
  letter-spacing:${t.tipografia.espaciadoTitulo};line-height:1.08;margin:0;text-wrap:balance}
h1{font-size:clamp(${(1.9 * escala).toFixed(2)}rem,${(4.4 * escala).toFixed(1)}vw,${(3.5 * escala).toFixed(2)}rem)}
h2{font-size:clamp(${(1.5 * escala).toFixed(2)}rem,${(3.2 * escala).toFixed(1)}vw,${(2.4 * escala).toFixed(2)}rem)}
.serif{font-family:${t.tipografia.display}}
p{margin:0}
.lead{color:var(--suave);font-size:clamp(1rem,1.8vw,1.15rem);max-width:62ch;${alinear === "center" ? "margin-inline:auto;" : ""}}
.eyebrow{margin:0;font-size:.72rem;text-transform:uppercase;letter-spacing:.18em;color:var(--suave)}
.price{font-size:1.4rem;font-weight:700;margin:0}
.price--big{font-size:clamp(1.8rem,4vw,2.6rem)}
.who{color:var(--suave);font-size:.9rem;margin:0}

.cta{display:inline-block;padding:15px 30px;border-radius:var(--radio);font-weight:700;
  text-decoration:none;font-size:1rem;transition:transform .15s ease,opacity .15s ease;
  align-self:${alinear === "center" ? "center" : "flex-start"};${ctaPorEstilo[t.cta] || ctaPorEstilo.solido}}
.cta:hover{transform:translateY(-1px);opacity:.92}
.cta:focus-visible{outline:3px solid var(--acento);outline-offset:3px}

.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,4vw,56px);text-align:left;align-items:start}
.grid-2.middle{align-items:center}
.grid-2>div{display:flex;flex-direction:column;gap:var(--sep);align-items:flex-start}
.ghost{display:none}

.fig{margin:0}
.fig img{${imgPorTrato[t.imagen] || imgPorTrato.enmarcada}width:100%}
.fig--below{margin-top:12px;max-width:760px;width:100%}
.fig--bleed{margin-inline:calc(var(--pad-x) * -1);width:calc(100% + var(--pad-x) * 2)}
.fig--bleed img{border-radius:0;max-height:520px;object-fit:cover}
.fig--float img{box-shadow:0 30px 60px rgba(0,0,0,.22)}
.fig--glow img{box-shadow:0 0 80px color-mix(in srgb,var(--acento) 30%,transparent)}
.hero-visual{min-height:clamp(380px,58vh,560px);display:flex;align-items:center;
  background-size:cover;background-position:center}
.hero-visual.has-bg{color:#fff}
.hero-visual.has-bg h1,.hero-visual.has-bg .lead,.hero-visual.has-bg .eyebrow{color:#fff}

.cards{list-style:none;padding:0;margin:0;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;text-align:left}
.card{background:var(--fondo);border:var(--borde);border-radius:var(--radio);
  box-shadow:var(--sombra);padding:22px}
.quote{font-style:italic;color:var(--suave)}
.rail{list-style:none;padding:0 0 8px;margin:0;display:flex;gap:16px;overflow-x:auto;
  scroll-snap-type:x mandatory;text-align:left}
.rail .card{min-width:min(300px,80vw);scroll-snap-align:start}
.icons{list-style:none;padding:0;margin:0;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;text-align:left}
.icons li,.plain li{display:flex;gap:10px;align-items:flex-start}
.plain{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;text-align:left}
.center-list{align-items:center}
.numbered{margin:0;padding-left:1.2em;display:flex;flex-direction:column;gap:12px;text-align:left}
.numbered li::marker{font-weight:700;color:var(--acento)}
.columns{columns:2;column-gap:40px;text-align:left}
.columns p{margin:0 0 14px;break-inside:avoid}
.tick{width:18px;height:18px;flex:0 0 18px;margin-top:4px;border-radius:50%;
  background:var(--acento);position:relative}
.tick::after{content:"";position:absolute;inset:0;margin:auto;width:5px;height:9px;
  border:solid var(--sobre-acento);border-width:0 2px 2px 0;transform:rotate(45deg) translate(-1px,-1px)}

.panel{background:var(--superficie);border:var(--borde);border-radius:var(--radio);
  box-shadow:var(--sombra);padding:clamp(28px,5vw,52px);display:flex;flex-direction:column;
  gap:var(--sep);align-items:center;width:100%}
.panel--accent{border:2px solid var(--acento)}
.panel--glow{box-shadow:0 0 60px color-mix(in srgb,var(--acento) 22%,transparent)}

.faq{display:flex;flex-direction:column;gap:8px;text-align:left}
details{border-bottom:1px solid var(--linea);padding:16px 0}
summary{cursor:pointer;font-weight:600;list-style:none}
summary::-webkit-details-marker{display:none}
blockquote{margin:0;font-size:clamp(1.15rem,2.6vw,1.5rem);line-height:1.5}
blockquote.big{font-size:clamp(1.4rem,3.4vw,2rem)}

/* ── Móvil: no es el desktop encogido ────────────────────────────────── */
@media (max-width:860px){
  .sec{padding:clamp(44px,9vw,72px) var(--pad-x)}
  .grid-2{grid-template-columns:1fr;gap:28px}
  /* La foto sube: en un teléfono, ver el producto antes de leer decide el scroll. */
  .grid-2.reverse .fig{order:-1}
  .columns{columns:1}
  .cta{width:100%;max-width:none;text-align:center}
  .wrap{text-align:${alinear};gap:20px}
}
@media (prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important}
}
`.trim();
}

// ─── Documento ───────────────────────────────────────────────────────────────

/**
 * Compone la landing completa.
 *
 * Devuelve un documento HTML autónomo: sin CDNs, sin fuentes externas
 * obligatorias y sin JavaScript. Una landing que depende de una red ajena para
 * verse bien es una landing que a veces no se ve bien -- y esta la va a abrir
 * gente que llegó de un anuncio pago.
 */
export function renderizarLanding(opts: OpcionesDeRender): string {
  const t = tokensDe(opts.familia);
  const p = opts.producto || null;
  const secciones = Array.isArray(opts.secciones) ? opts.secciones : [];

  const n = opts.negocio || null;
  // Con cierre en la página, los CTA van al ancla del cierre.
  destinoDelCierre = opts.cierre && (opts.cierre.tipo !== "pago" || opts.cierre.mercadopago || opts.cierre.paypal || n?.whatsapp) ? "#pedido" : null;
  const cierreHtml = bloqueDeCierre(opts.cierre, p, n);
  const marca = esc(n?.nombre || "");
  const ctaTexto = esc(String(secciones.find((x) => x.type === "hero")?.cta || (n?.modelo === "fisico" ? "Pedir por WhatsApp" : "Lo quiero")).trim());
  const irA = esc(destino(p));

  // Una sección sin título, sin ítems y sin foto es un hueco con un rótulo
  // arriba ("HOW IT WORKS" y nada más, medido en la landing 4). No se dibuja.
  const conContenido = (s: SeccionParaRenderizar) =>
    !!(String(s.title || "").trim() || items(s.body).length || urlSegura(s.image) || (Array.isArray(s.images) && s.images.length));

  const cuerpo = secciones
    .filter(conContenido)
    .map((s) => {
      const html = renderizadorDe(s, t)(s, p, t);
      if (!html.trim()) return "";
      const confianza = s.type === "hero" && n?.confianza?.length
        ? `<section class="sec sec--confianza"><ul class="confianza">${n.confianza.map((c) => `<li>${conVineta(c)}</li>`).join("")}</ul></section>`
        : "";
      return `<section class="sec sec--${esc(s.type || "generica")}" id="${esc(s.id || "")}">${html}</section>${confianza}`;
    })
    .join("\n");

  const cabecera = `<header class="top"><div class="top__in"><span class="marca">${marca || esc(p?.name || "")}</span><a class="cta cta--chica" href="${irA}">${ctaTexto}</a></div></header>`;
  const pie = `<footer class="pie"><div class="wrap">${marca ? `<p>${marca}</p>` : ""}${n?.whatsapp ? `<p><a href="https://wa.me/${esc(String(n.whatsapp).replace(/\D/g, ""))}">Escribinos por WhatsApp</a></p>` : ""}<p class="pie__nota">Precios en ${esc(String(p?.currency || "COP"))}. ${n?.modelo === "fisico" ? "Pago contraentrega según condiciones del negocio." : ""}</p></div></footer>`;
  const fijo = `<div class="fijo"><a class="cta" href="${irA}">${ctaTexto}</a></div>`;

  const titulo = esc(opts.nombre || p?.name || "Landing");
  const desc = esc(String(p?.description || secciones[0]?.subtitle || "").replace(/\s+/g, " ").slice(0, 155));

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${desc}">
${urlSegura(p?.imageUrl) ? `<meta property="og:image" content="${esc(urlSegura(p?.imageUrl))}">` : ""}
<meta name="color-scheme" content="${t.fondos === "oscuro" ? "dark" : "light"}">
<style>${css(t)}${CSS_MARCO}</style>
</head>
<body>
${cabecera}
${cuerpo}
${cierreHtml}
${pie}
${fijo}
${JS_MOVIMIENTO}
</body>
</html>`;
}
