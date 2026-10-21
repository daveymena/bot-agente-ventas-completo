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

import { DEPARTAMENTOS_CO, SCRIPT_GEO } from "../geo-colombia";

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

/**
 * Talla/color/modelo: el servidor (landing-publica.ts) EXIGE las opciones
 * obligatorias como `opcion_<nombre>`, pero el formulario nunca las pedía:
 * con tallas cargadas, TODO pedido fallaba con "Selecciona Talla" (26-09-2026).
 */
export function selectoresDeOpciones(p: ProductoParaRenderizar | null | undefined): string {
  const lista = Array.isArray((p as any)?.opciones) ? ((p as any).opciones as any[]) : [];
  return lista
    .filter((o) => o?.nombre && Array.isArray(o?.valores) && o.valores.length)
    .map((o) => `<label>${esc(String(o.nombre))}<select name="opcion_${esc(String(o.nombre))}"${o.obligatoria === false ? "" : " required"}><option value="">Elige ${esc(String(o.nombre).toLowerCase())}…</option>${(o.valores as unknown[]).map((v) => `<option>${esc(String(v))}</option>`).join("")}</select></label>`)
    .join("\n      ");
}

/**
 * Lo mismo para una landing de HTML FIJO (generada aparte y guardada tal
 * cual): si su formulario de pedido no trae las opciones, se inyectan al
 * servirla. La del corrector (#56) pedía cédula y no tenía talla: con las
 * tallas cargadas, el servidor rechazaba todos sus pedidos (26-09-2026).
 * Además la cédula deja de ser obligatoria (en Colombia no se pide).
 */
export function formularioConOpciones(html: string, p: ProductoParaRenderizar | null | undefined): string {
  if (!html || /name=["']opcion_/.test(html)) return quitarCedulaObligatoria(html);
  const selects = selectoresDeOpciones(p);
  if (!selects) return quitarCedulaObligatoria(html);
  const conSelects = html.replace(/<form\b[^>]*\/pedido[^>]*>/i, (m) => `${m}\n${selects}`);
  return quitarCedulaObligatoria(conSelects);
}

function quitarCedulaObligatoria(html: string): string {
  return html.replace(/<input\b[^>]*name=["']documento["'][^>]*>/gi, (m) => m.replace(/\srequired(=["'][^"']*["'])?/i, ""));
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
    <div class="head"><p class="eyebrow">Pedido</p><h2>Pide ${esc(p?.name || "tu producto")}${precioTxt ? ` por ${esc(precioTxt)}` : ""}</h2>
    <p class="lead">${c.pago === "anticipado" ? "Te contactamos por WhatsApp para coordinar el pago y el envío." : "Pagas cuando lo recibes. Completa tus datos y lo despachamos."}</p></div>
    <form class="pedido" method="post" action="${esc(c.accion)}" data-json>
      ${selectoresDeOpciones(p)}
      ${campo("nombre", "Nombre y apellido")}
      ${campo("telefono", "Celular", 'inputmode="tel"')}
      ${esCol ? "" : campo("documento", "Documento de identidad", 'inputmode="numeric"')}
      ${campo("direccion", "Dirección (calle, número, apto)")}
      <label>Barrio<input name="barrio"></label>
      ${esCol ? `<label>Departamento<select name="departamento" required><option value="">Selecciona\u2026</option>${DEPARTAMENTOS_CO.map((d) => `<option>${esc(d)}</option>`).join("")}</select></label>` : campo("departamento", "Estado o provincia")}
      <label>Ciudad<input name="ciudad" list="ciudades-datalist" required placeholder="Elige departamento primero"><datalist id="ciudades-datalist"></datalist></label>
      <label>Punto de referencia<input name="referencia" placeholder="Frente a la panadería, al lado del parque…"></label>
      <button class="cta" type="submit">${c.pago === "anticipado" ? "Quiero pedirlo" : "Pedir y pagar al recibir"}</button>
      <p class="pedido__estado" aria-live="polite"></p>
    </form><script>${SCRIPT_GEO}</script>
    ${wa ? `<p class="o-bien">¿Prefieres pedirlo por chat? <a href="${esc(wa)}">Escríbenos por WhatsApp</a></p>` : ""}
  </div></section>
  <script>
  (function(){var f=document.querySelector('form.pedido');if(!f)return;f.addEventListener('submit',async function(e){e.preventDefault();var b=f.querySelector('button');var est=f.querySelector('.pedido__estado');b.disabled=true;est.textContent='Registrando tu pedido…';try{var d={};new FormData(f).forEach(function(v,k){d[k]=v});var r=await fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});var j=await r.json();if(j.ok){f.innerHTML='<p class="lead">✅ ¡Pedido recibido! Te contactamos por WhatsApp para confirmar el despacho. Llega en '+(j.plazo||'unos días')+'.</p>';}else{est.textContent=j.error||'No se pudo registrar. Intenta de nuevo o escríbenos por WhatsApp.';b.disabled=false;}}catch(x){est.textContent='No se pudo registrar. Escríbenos por WhatsApp.';b.disabled=false;}});})();
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

type Renderizador = (s: SeccionParaRenderizar, p: ProductoParaRenderizar | null | undefined, t?: TokensDeDiseno) => string;

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

const galeriaHero = (s: SeccionParaRenderizar, p: ProductoParaRenderizar | null | undefined) => {
  const fotos = (Array.isArray(s.images) ? s.images : []).filter(Boolean).map(urlSegura);
  if (!fotos.length && p?.imageUrl) fotos.push(urlSegura(p.imageUrl));
  if (!fotos.length) return '';
  return `<div class="gallery">
    <div class="g-track">${fotos.map(f => `<div class="g-slide"><img src="${esc(f)}" alt="${esc(p?.name || "")}"></div>`).join('')}</div>
  </div>`;
};

const LAYOUTS: Record<string, Renderizador> = {
  hero_center: (s, p) => `<section class="sec hero" id="${esc(s.id || "")}"><div class="wrap hero-grid">
    <div class="hero-info">${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}
      ${precio(p) ? `<div class="price-card"><div><small>Oferta Especial</small><span class="price-now">${esc(precio(p))}</span></div></div>` : ""}
      ${boton(s.cta || "Comprar Ahora", p)}
    </div>
    ${galeriaHero(s, p)}
  </div></section>`,

  // Cada variante tiene su estructura: texto solo, producto primero, foto de fondo,
  // oscura, editorial. Antes eran alias del mismo bloque y todas las familias se veían igual.
  hero_left: (s, p) => `<section class="sec hero hero-texto" id="${esc(s.id || "")}"><div class="wrap narrow">
    ${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}
    <div class="hero-acc">${boton(s.cta || "Comprar Ahora", p)}${precio(p) ? `<span class="price-now">${esc(precio(p))}</span>` : ""}</div>
    ${galeriaHero(s, p)}
  </div></section>`,
  hero_split: (s, p) => `<section class="sec hero hero-split" id="${esc(s.id || "")}"><div class="wrap hero-grid">
    ${galeriaHero(s, p)}
    <div class="hero-info">${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}${boton(s.cta || "Comprar Ahora", p)}</div>
  </div></section>`,
  hero_product_focus: (s, p) => `<section class="sec hero hero-producto" id="${esc(s.id || "")}"><div class="wrap narrow center">
    ${galeriaHero(s, p)}
    ${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}
    ${precio(p) ? `<div class="price-card"><div><small>Precio</small><span class="price-now">${esc(precio(p))}</span></div></div>` : ""}
    ${boton(s.cta || "Comprar Ahora", p)}
  </div></section>`,
  hero_editorial: (s, p) => `<section class="sec hero hero-editorial" id="${esc(s.id || "")}"><div class="wrap narrow">
    ${eyebrow(s)}<h1 class="display-xl">${esc(s.title || "")}</h1>${bajada(s)}
    ${boton(s.cta || "Comprar Ahora", p)}
  </div>${galeriaHero(s, p)}</section>`,
  hero_dark: (s, p) => `<section class="sec hero dark hero-oscuro" id="${esc(s.id || "")}"><div class="wrap hero-grid">
    <div class="hero-info">${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}
      ${precio(p) ? `<span class="price-now">${esc(precio(p))}</span>` : ""}
      ${boton(s.cta || "Comprar Ahora", p)}
    </div>${galeriaHero(s, p)}
  </div></section>`,
  hero_gradient_product: (s, p) => LAYOUTS.hero_dark(s, p),
  hero_offer: (s, p) => LAYOUTS.hero_center(s, p),
  hero_full_visual: (s, p) => `<section class="sec hero hero-fondo" id="${esc(s.id || "")}" style="background-image:url('${esc(urlSegura(p?.imageUrl))}')"><img class="hero-fondo-img" src="${esc(urlSegura(p?.imageUrl))}" alt="" aria-hidden="true"><div class="wrap narrow center">
    ${eyebrow(s)}<h1>${esc(s.title || "")}</h1>${bajada(s)}${boton(s.cta || "Comprar Ahora", p)}
  </div></section>`,

  benefits_cards: (s, p) => `<section class="sec" id="${esc(s.id || "")}"><div class="wrap">
    <div class="sec-head">${eyebrow(s)}<h2>${esc(s.title || "")}</h2>${bajada(s)}</div>
    <ul class="bens">${items(s.body).map(i => `<li class="ben"><div class="trust-ico">✓</div><b>${esc(i)}</b></li>`).join('')}</ul>
  </div></section>`,
  benefits_icon_grid: (s, p, t) => LAYOUTS.benefits_cards(s, p, t),
  benefits_split: (s, p, t) => LAYOUTS.benefits_cards(s, p, t),
  
  benefits_numbered: (s, p) => `<section class="sec dark" id="${esc(s.id || "")}"><div class="wrap">
    <div class="sec-head">${eyebrow(s)}<h2>${esc(s.title || "")}</h2>${bajada(s)}</div>
    <div class="steps">${items(s.body).map((i, idx) => `<div class="step"><div class="step-n">${idx+1}</div><h3>Paso ${idx+1}</h3><p>${esc(i)}</p></div>`).join('')}</div>
  </div></section>`,
  benefits_editorial: (s, p, t) => LAYOUTS.benefits_cards(s, p, t),
  benefits_visual: (s, p, t) => LAYOUTS.benefits_cards(s, p, t),

  offer_card: (s, p) => `<section class="sec order-sec" id="${esc(s.id || "")}"><div class="wrap order">
    <h2>${esc(s.title || "Oferta")}</h2>
    ${precio(p) ? `<div class="pack"><div class="pack-info"><b>1 Unidad</b></div><div class="pack-price"><b>${esc(precio(p))}</b></div></div>` : ""}
    ${boton(s.cta || "Comprar Ahora", p)}
  </div></section>`,
  offer_split: (s, p) => `<section class="sec order-sec" id="${esc(s.id || "")}"><div class="wrap order order-split">
    <div>${galeriaHero(s, p)}</div>
    <div><h2>${esc(s.title || "Oferta")}</h2>${bajada(s)}
      ${precio(p) ? `<div class="pack"><div class="pack-info"><b>1 Unidad</b></div><div class="pack-price"><b>${esc(precio(p))}</b></div></div>` : ""}
      ${boton(s.cta || "Comprar Ahora", p)}</div>
  </div></section>`,
  offer_product: (s, p) => LAYOUTS.offer_split(s, p),
  offer_minimal: (s, p) => `<section class="sec" id="${esc(s.id || "")}"><div class="wrap narrow center">
    <h2>${esc(s.title || "")}</h2>${precio(p) ? `<p class="price-now">${esc(precio(p))}</p>` : ""}${boton(s.cta || "Comprar Ahora", p)}
  </div></section>`,
  offer_dark: (s, p) => `<section class="sec dark order-sec" id="${esc(s.id || "")}"><div class="wrap order">
    <h2>${esc(s.title || "Oferta")}</h2>${bajada(s)}
    ${precio(p) ? `<div class="pack"><div class="pack-info"><b>1 Unidad</b></div><div class="pack-price"><b>${esc(precio(p))}</b></div></div>` : ""}
    ${boton(s.cta || "Comprar Ahora", p)}
  </div></section>`,
  offer_urgency: (s, p) => LAYOUTS.offer_card(s, p),

  testimonial_cards: (s, p) => `<section class="sec" id="${esc(s.id || "")}"><div class="wrap">
    <div class="sec-head"><h2>${esc(s.title || "Opiniones")}</h2>${bajada(s)}</div>
    <div class="testis">${items(s.body).map(i => `<figure class="testi"><blockquote>${esc(i)}</blockquote></figure>`).join('')}</div>
  </div></section>`,
  testimonial_quote: (s, p) => `<section class="sec" id="${esc(s.id || "")}"><div class="wrap narrow">
    <div class="sec-head"><h2>${esc(s.title || "Opiniones")}</h2></div>
    ${items(s.body).map(i => `<blockquote class="quote-solo">“${esc(i)}”</blockquote>`).join('')}
  </div></section>`,
  testimonial_large: (s, p) => LAYOUTS.testimonial_quote(s, p),
  testimonial_editorial: (s, p) => LAYOUTS.testimonial_quote(s, p),
  testimonial_slider: (s, p) => `<section class="sec" id="${esc(s.id || "")}"><div class="wrap">
    <div class="sec-head"><h2>${esc(s.title || "Opiniones")}</h2></div>
    <div class="testis testis-scroll">${items(s.body).map(i => `<figure class="testi"><blockquote>${esc(i)}</blockquote></figure>`).join('')}</div>
  </div></section>`,

  faq_accordion: (s, p) => `<section class="sec" id="${esc(s.id || "")}"><div class="wrap">
    <div class="sec-head"><h2>${esc(s.title || "Preguntas Frecuentes")}</h2></div>
    <div class="faq">${items(s.body).map(i => { const { q, a } = preguntaYRespuesta(i); return a ? `<details><summary>${esc(q)}<span class="pm">+</span></summary><p>${esc(a)}</p></details>` : `<details><summary>${esc(q)}<span class="pm">+</span></summary></details>`; }).join('')}</div>
  </div></section>`,
  faq_minimal: (s, p) => LAYOUTS.faq_respuestas(s, p),
  faq_cards: (s, p) => `<section class="sec" id="${esc(s.id || "")}"><div class="wrap">
    <div class="sec-head"><h2>${esc(s.title || "Preguntas Frecuentes")}</h2></div>
    <div class="faq-cards">${items(s.body).map(i => { const { q, a } = preguntaYRespuesta(i); return `<div class="faq-card"><b>${esc(q)}</b>${a ? `<p>${esc(a)}</p>` : ""}</div>`; }).join('')}</div>
  </div></section>`,
  faq_split: (s, p) => LAYOUTS.faq_respuestas(s, p),
  faq_respuestas: (s, p) => `<section class="sec" id="${esc(s.id || "")}"><div class="wrap">
    <div class="sec-head"><h2>${esc(s.title || "Preguntas Frecuentes")}</h2></div>
    <div class="faq">${items(s.body).map(i => { const { q, a } = preguntaYRespuesta(i); return `<details><summary>${esc(q)}<span class="pm">+</span></summary><p>${esc(a)}</p></details>`; }).join('')}</div>
  </div></section>`,

  gallery_grid: (s, p) => `<section class="sec" id="${esc(s.id || "")}"><div class="wrap"><div class="sec-head"><h2>Galería</h2></div>${galeriaHero(s, p)}</div></section>`,
  logistics_strip: (s, p) => `<section class="sec" id="${esc(s.id || "")}"><div class="wrap trust">${items(s.body).map(i => `<div class="trust-item"><div class="trust-ico">🚚</div><b>${esc(i)}</b></div>`).join('')}</div></section>`,
  cta_final: (s, p, t) => LAYOUTS.offer_card(s, p, t)
};

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
 * CSS profesional basado en landing-pro-sofia.
 * Clases semánticas: .hdr .hero-grid .gallery .bens .testis .steps .order .faq .sticky .foot
 */
const CSS_MARCO = `
/* ── Header ───────────────────────────────────────────────────────────── */
.hdr{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--linea)}
.hdr-in{max-width:var(--ancho);margin:0 auto;padding:14px var(--pad-x);display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{font-weight:800;font-size:1.05rem;letter-spacing:-.02em;color:var(--texto);text-decoration:none}
.logo-mark{display:inline-block;width:28px;height:28px;border-radius:8px;background:var(--acento);margin-right:8px;vertical-align:middle}
/* ── Confianza strip ──────────────────────────────────────────────────── */
.sec--confianza{padding-block:0 !important}
.confianza{list-style:none;margin:0 auto;padding:14px var(--pad-x);max-width:var(--ancho);display:flex;flex-wrap:wrap;gap:10px 28px;justify-content:center;border-top:1px solid var(--linea);border-bottom:1px solid var(--linea);font-size:.95em}
.confianza li{display:flex;align-items:center;gap:8px}
/* ── Hero grid ────────────────────────────────────────────────────────── */
.hero{padding:0}
.hero-grid{display:grid;grid-template-columns:1fr 1fr;min-height:88vh;align-items:center;max-width:var(--ancho);margin:0 auto;padding:40px var(--pad-x);gap:clamp(28px,5vw,64px)}
.hero-info{display:flex;flex-direction:column;gap:20px;align-items:flex-start}
.price-card{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.price-now{font-size:clamp(1.8rem,4vw,2.8rem);font-weight:900;color:var(--acento)}
.price-before{text-decoration:line-through;color:var(--suave);font-size:1rem}
/* ── Gallery ──────────────────────────────────────────────────────────── */
.gallery{position:relative;overflow:hidden;border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,.13)}
.g-track{display:flex;gap:12px;transition:transform .4s cubic-bezier(.4,0,.2,1)}
.g-slide{flex:0 0 100%;border-radius:20px;overflow:hidden;aspect-ratio:1}
.g-slide img{width:100%;height:100%;object-fit:cover;display:block}
.g-thumbs{display:flex;gap:8px;margin-top:10px}
.g-thumb{width:56px;height:56px;border-radius:10px;overflow:hidden;cursor:pointer;opacity:.6;transition:opacity .2s;flex-shrink:0}
.g-thumb.active,.g-thumb:hover{opacity:1}
.g-thumb img{width:100%;height:100%;object-fit:cover}
.g-dots{display:flex;justify-content:center;gap:6px;margin-top:10px}
.g-dot{width:8px;height:8px;border-radius:50%;background:var(--linea);cursor:pointer;transition:background .2s,transform .2s}
.g-dot.active{background:var(--acento);transform:scale(1.3)}
/* ── Trust strip ──────────────────────────────────────────────────────── */
.trust{display:flex;flex-wrap:wrap;gap:10px 28px;justify-content:center;padding:16px var(--pad-x);border-top:1px solid var(--linea);border-bottom:1px solid var(--linea)}
.trust-item{display:flex;align-items:center;gap:8px;font-size:.92rem}
.trust-ico{font-size:1.1em}
/* ── Benefits ─────────────────────────────────────────────────────────── */
.bens{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.ben{display:flex;flex-direction:column;gap:8px;padding:22px;background:var(--superficie);border-radius:var(--radio);border:1px solid var(--linea)}
.ben .trust-ico{font-size:1.8rem}
/* ── Steps dark ───────────────────────────────────────────────────────── */
.dark{background:#0f172a;color:#e2e8f0}
.dark h2{color:#f8fafc}
.steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:20px}
.step{display:flex;gap:18px;align-items:flex-start}
.step-n{width:36px;height:36px;border-radius:50%;background:var(--acento);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.95rem;flex-shrink:0}
/* ── Testimonials ─────────────────────────────────────────────────────── */
.testis{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.testi{padding:22px;background:var(--superficie);border-radius:var(--radio);border:1px solid var(--linea);display:flex;flex-direction:column;gap:12px}
.who{display:flex;align-items:center;gap:10px}
.avatar{width:40px;height:40px;border-radius:50%;background:color-mix(in srgb,var(--acento) 20%,white);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95rem;color:var(--acento);flex-shrink:0}
.stars{color:#f59e0b;font-size:.9rem}
/* ── Order / Offer ────────────────────────────────────────────────────── */
.order-sec{background:color-mix(in srgb,var(--acento) 5%,white)}
.order{max-width:600px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
.pack{background:white;border:2px solid var(--linea);border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:10px}
.pack.featured{border-color:var(--acento);box-shadow:0 8px 30px color-mix(in srgb,var(--acento) 20%,transparent)}
.pack-info{display:flex;flex-direction:column;gap:4px}
.pack-price{font-size:1.5rem;font-weight:900;color:var(--acento)}
/* ── FAQ ──────────────────────────────────────────────────────────────── */
.faq-wrap{max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:4px}
.faq details{border-bottom:1px solid var(--linea);padding:16px 0}
.faq summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px}
.faq summary::-webkit-details-marker{display:none}
.pm{font-size:1.2rem;color:var(--acento);transition:transform .25s}
.faq details[open] .pm{transform:rotate(45deg)}
.faq details p{margin:12px 0 0;color:var(--suave);line-height:1.6}
/* ── Formulario de pedido ─────────────────────────────────────────────── */
.pedido{display:grid;gap:12px;max-width:520px;margin:0 auto}
.pedido label{display:grid;gap:6px;font-size:.92em;color:var(--suave)}
.pedido input{font:inherit;padding:12px 14px;border:1px solid var(--linea);border-radius:var(--radio);background:var(--superficie);color:var(--texto)}
.pedido input:focus{outline:2px solid var(--acento);outline-offset:1px}
.pedido button{margin-top:6px;font:inherit;cursor:pointer}
.pedido__estado{margin:0;color:var(--suave);font-size:.92em;min-height:1.4em}
.o-bien{text-align:center;margin-top:18px;color:var(--suave)}.o-bien a{color:var(--texto)}
.botones{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.cta--alt{background:transparent;color:var(--texto);border:1px solid var(--texto)}
/* ── Galería secundaria ───────────────────────────────────────────────── */
.galeria{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
.galeria li{margin:0;aspect-ratio:1;overflow:hidden;border-radius:var(--radio);background:var(--superficie)}
.galeria img{width:100%;height:100%;object-fit:cover;display:block}
/* ── Sticky bar & footer ──────────────────────────────────────────────── */
.sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);border-top:1px solid var(--linea);backdrop-filter:blur(12px);display:none}
.sticky-in{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:var(--ancho);margin:0 auto}
.sticky-price{font-weight:800;font-size:1.1rem;color:var(--acento)}
.foot{padding:32px var(--pad-x) 96px;border-top:1px solid var(--linea);color:var(--suave);font-size:.9em;text-align:center}
.foot p{margin:4px 0}.foot a{color:inherit}
.foot__nota{opacity:.8}
/* ── Buttons ──────────────────────────────────────────────────────────── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 28px;border-radius:var(--radio);font-weight:700;font-size:1rem;text-decoration:none;cursor:pointer;border:none;transition:transform .18s,box-shadow .18s,filter .18s;background:var(--acento);color:var(--sobre-acento)}
.btn:hover{transform:translateY(-2px);box-shadow:0 12px 28px color-mix(in srgb,var(--acento) 35%,transparent);filter:brightness(1.05)}
.btn:active{transform:translateY(0)}
.btn-cta{background:var(--acento);color:var(--sobre-acento);padding:16px 36px;font-size:1.05rem;border-radius:var(--radio)}
.btn-sm{padding:9px 18px;font-size:.9rem;background:var(--acento);color:var(--sobre-acento);border-radius:var(--radio)}
.btn-block{display:flex;width:100%;justify-content:center}
.cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 28px;border-radius:var(--radio);font-weight:700;font-size:1rem;text-decoration:none;cursor:pointer;border:none;background:var(--acento);color:var(--sobre-acento);transition:transform .18s,box-shadow .18s}
.cta:hover{transform:translateY(-2px);box-shadow:0 12px 28px color-mix(in srgb,var(--acento) 35%,transparent)}
.pulse{animation:pulse 2.5s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--acento) 40%,transparent)}60%{box-shadow:0 0 0 10px transparent}}
/* ── Animaciones ──────────────────────────────────────────────────────── */
html{scroll-behavior:smooth}
.js .sec[data-reveal]{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.js .sec[data-reveal].visto{opacity:1;transform:none}
.js .sec--hero{opacity:1;transform:none}
.sec--hero h1{animation:entra .8s cubic-bezier(.2,.7,.2,1) both}
.sec--hero .lead,.sec--hero .price-card{animation:entra .8s .12s cubic-bezier(.2,.7,.2,1) both}
.sec--hero .cta,.sec--hero .btn{animation:entra .8s .22s cubic-bezier(.2,.7,.2,1) both}
@keyframes entra{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.ben,.testi,.pack{transition:transform .22s ease,box-shadow .22s ease}
.ben:hover,.testi:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(0,0,0,.10)}
@media (max-width:760px){
  .hero-grid{grid-template-columns:1fr;min-height:unset;padding-top:24px}
  .gallery{margin-top:0}
  .bens{grid-template-columns:1fr}
  .testis{grid-template-columns:1fr}
  .sticky{display:block}
  .hdr .btn-sm{display:none}
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .js .sec[data-reveal]{opacity:1;transform:none;transition:none}
  *{animation-duration:.01ms!important}
}

/* ── Variantes de hero, oferta, testimonios y FAQ ─────────────────────── */
.hero-texto h1,.hero-editorial h1{max-width:18ch}
.hero-acc{display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin:20px 0}
.hero-producto .gallery,.hero-texto .gallery{margin-top:28px}
.hero-producto h1{margin-top:12px}
.display-xl{font-size:clamp(2.4rem,6vw,4.6rem);line-height:1.02;letter-spacing:-0.03em}
.hero-oscuro{background:var(--texto);color:var(--fondo)}
.hero-oscuro .lead,.hero-oscuro .eyebrow{color:inherit;opacity:.8}
.hero-fondo{position:relative;min-height:70vh;display:flex;align-items:center;background-size:cover;background-position:center;color:#fff;overflow:hidden}
.hero-fondo::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.78))}
.hero-fondo .wrap{position:relative;z-index:1}
.hero-fondo-img{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.order-split{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
@media (max-width:760px){.order-split{grid-template-columns:1fr}}
.testis-scroll{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:16px;padding-bottom:8px}
.testis-scroll .testi{flex:0 0 min(300px,82%);scroll-snap-align:start}
.testi{margin:0}
.testi blockquote{margin:0;font-size:1.02em;line-height:1.5}
.quote-solo{margin:0 0 28px;padding:0 0 0 18px;border-left:3px solid var(--acento);font-size:1.15em;line-height:1.55;color:var(--texto)}
.faq-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.faq-card{padding:20px;border:1px solid var(--linea);border-radius:var(--radio);background:var(--superficie)}
.faq-card p{margin:10px 0 0;color:var(--suave)}
`;

const JS_MOVIMIENTO = `<script>
(function(){
  if(!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  document.documentElement.classList.add('js');
  var secs=[].slice.call(document.querySelectorAll('.sec:not(.sec--hero):not(.sec--confianza)'));
  secs.forEach(function(s){s.setAttribute('data-reveal','')});
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
    if(e.isIntersecting){e.target.classList.add('visto');io.unobserve(e.target);}
  },{rootMargin:'0px 0px -10% 0px',threshold:.12});
  secs.forEach(function(s){io.observe(s)});
  secs.forEach(function(s){var r=s.getBoundingClientRect();if(r.top<innerHeight*.9)s.classList.add('visto');});
})();
</script>`;

function css(t: TokensDeDiseno): string {
  const escala = t.tipografia.escala;
  const alinear = t.alineacion === "izquierda" ? "left" : "center";

  const ctaPorEstilo: Record<string, string> = {
    solido: `background:var(--acento);color:var(--sobre-acento);border:none;`,
    contorno: `background:transparent;color:var(--texto);border:1px solid var(--texto);`,
    pastilla: `background:var(--acento);color:var(--sobre-acento);border:none;border-radius:999px;`,
    bloque: `background:var(--acento);color:var(--sobre-acento);border:none;display:block;width:100%;max-width:420px;text-align:center;`,
    subrayado: `background:transparent;color:var(--texto);border:none;border-bottom:2px solid var(--acento);border-radius:0;padding-left:0;padding-right:0;`,
  };

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
.sec.sec--hero,.sec.sec--cierre{background:linear-gradient(135deg,color-mix(in srgb,var(--acento) 70%,#0b0b14) 0%,var(--acento) 100%);color:#fff}
.sec--hero h1,.sec--hero h2,.sec--cierre h1,.sec--cierre h2{color:#fff}
` : ""}
.wrap{max-width:var(--ancho);margin-inline:auto;display:flex;flex-direction:column;gap:var(--sep);text-align:${alinear}}
.wrap.narrow{max-width:min(720px,var(--ancho))}
.wrap.center{text-align:center;align-items:center}
.wrap.left{text-align:left;align-items:flex-start}
.head,.sec-head{display:flex;flex-direction:column;gap:12px}
h1,h2{font-family:${t.tipografia.display};font-weight:${t.tipografia.pesoDisplay};
  letter-spacing:${t.tipografia.espaciadoTitulo};line-height:1.08;margin:0;text-wrap:balance}
h1{font-size:clamp(${(1.9 * escala).toFixed(2)}rem,${(4.4 * escala).toFixed(1)}vw,${(3.5 * escala).toFixed(2)}rem)}
h2{font-size:clamp(${(1.5 * escala).toFixed(2)}rem,${(3.2 * escala).toFixed(1)}vw,${(2.4 * escala).toFixed(2)}rem)}
p{margin:0}
.lead{color:var(--suave);font-size:clamp(1rem,1.8vw,1.15rem);max-width:62ch;${alinear === "center" ? "margin-inline:auto;" : ""}}
.eyebrow{margin:0;font-size:.72rem;text-transform:uppercase;letter-spacing:.18em;color:var(--suave)}
.price{font-size:1.4rem;font-weight:700;margin:0}
.who-name{color:var(--suave);font-size:.9rem;margin:0}
.fig{margin:0}
.fig img{${imgPorTrato[t.imagen] || imgPorTrato.enmarcada}width:100%}
.fig--below{margin-top:12px;max-width:760px;width:100%}
.tick{width:18px;height:18px;flex:0 0 18px;margin-top:4px;border-radius:50%;background:var(--acento);position:relative}
.tick::after{content:"";position:absolute;inset:0;margin:auto;width:5px;height:9px;border:solid var(--sobre-acento);border-width:0 2px 2px 0;transform:rotate(45deg) translate(-1px,-1px)}
.faq{display:flex;flex-direction:column;gap:8px;text-align:left}
details{border-bottom:1px solid var(--linea);padding:16px 0}
summary{cursor:pointer;font-weight:600;list-style:none}
summary::-webkit-details-marker{display:none}
.plain{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;text-align:left}
.plain li{display:flex;gap:10px;align-items:flex-start}
@media (max-width:860px){
  .sec{padding:clamp(44px,9vw,72px) var(--pad-x)}
}
@media (prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important}
}
`.trim();
}

// ─── Documento ───────────────────────────────────────────────────────────────

/**
 * Compone la landing completa.
 */
export function renderizarLanding(opts: OpcionesDeRender): string {
  const t = tokensDe(opts.familia);
  const p = opts.producto || null;
  const secciones = Array.isArray(opts.secciones) ? opts.secciones : [];

  const n = opts.negocio || null;
  destinoDelCierre = opts.cierre && (opts.cierre.tipo !== "pago" || opts.cierre.mercadopago || opts.cierre.paypal || n?.whatsapp) ? "#pedido" : null;
  const cierreHtml = bloqueDeCierre(opts.cierre, p, n);
  const marca = esc(n?.nombre || "");
  const ctaTexto = esc(String(secciones.find((x) => x.type === "hero")?.cta || (n?.modelo === "fisico" ? "Pedir por WhatsApp" : "Lo quiero")).trim());
  const irA = esc(destino(p));
  const precioTxt = precio(p);

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
      // El id ya lo lleva la sección que dibuja `html`: repetirlo acá dejaba dos
      // <section id="..."> anidados (HTML inválido y anclas ambiguas).
      return `<section class="sec sec--${esc(s.type || "generica")}">${html}</section>${confianza}`;
    })
    .join("\n");

  const cabecera = `<header class="hdr"><div class="hdr-in"><a class="logo" href="#"><span class="logo-mark" aria-hidden="true"></span>${marca || esc(p?.name || "")}</a><a class="btn btn-sm" href="${irA}">${ctaTexto}</a></div></header>`;
  const pie = `<footer class="foot"><div class="wrap">${marca ? `<p>${marca}</p>` : ""}${n?.whatsapp ? `<p><a href="https://wa.me/${esc(String(n.whatsapp).replace(/\D/g, ""))}">Escribinos por WhatsApp</a></p>` : ""}<p class="foot__nota">Precios en ${esc(String(p?.currency || "COP"))}. ${n?.modelo === "fisico" ? "Pago contraentrega según condiciones del negocio." : ""}</p></div></footer>`;
  const stickyBar = `<div class="sticky"><div class="sticky-in">${precioTxt ? `<span class="sticky-price">${esc(precioTxt)}</span>` : `<span>${marca}</span>`}<a class="btn btn-cta pulse" href="${irA}">${ctaTexto}</a></div></div>`;

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
${stickyBar}
${JS_MOVIMIENTO}
</body>
</html>`;
}
