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
 *   - Sin píxel embebido: la pígina pública lo recibe de lib/landing/monitor
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

export const ESTILOS = ["cleanhome", "urgencia", "clinico", "pro"] as const;
export type EstiloVisual = (typeof ESTILOS)[number];

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Acepta "55000", "55.000", "55,000" y también "55000.00" (decimal de la DB)
 * y devuelve número entero COP.
 *
 * El caso decimal es el del bug en vivo (03-10): Postgres guarda
 * numeric(10,2) y Drizzle lo entrega como "55000.00". La regex vieja
 * quitaba TODO lo no-dígito y "55000.00" se volvía 5500000 — el cliente
 * veía $5.500.000 en la pígina de una mochila de $55.000.
 *
 * La regla: si hay UN solo separador con exactamente 2 dígitos después, es
 * decimal (es-XX/COP de la DB); si no, son miles ("55.000" o "55,000").
 */
function num(v: unknown): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // Decimal con punto: 55000.00 (dos dígitos fijos al final)
  const mDec = s.match(/^(\d{1,7}(?:[.\s]\d{3})*),(\d{2})$/) || s.match(/^(\d+)\.(\d{2})$/);
  if (mDec) return Math.round(Number(`${mDec[1].replace(/[.\s]/g, "")}.${mDec[2]}`));
  // Miles con punto o coma: 55.000 / 55,000
  const mMiles = s.match(/^(\d{1,3}(?:[.,]\d{3})+)$/);
  if (mMiles) return Number(mMiles[1].replace(/[.,]/g, ""));
  // Solo dígitos
  const d = s.replace(/[^\d]/g, "");
  return d ? Number(d) : 0;
}

const cop = (n: number): string => (n ? n.toLocaleString("es-CO") : "0");


// ══ Las mejoras del review (04-10, lo pedido: "textos, ubicación y
// precios") ════════════
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
  /** design.estiloExtras.timer===false lo apaga por landing. Sin `ofertaHasta` no se muestra nunca. */
  timer?: boolean;
  /** Fin REAL de la oferta (fecha ISO que carga el dueño en design.estiloExtras.ofertaHasta). */
  ofertaHasta?: string | null;
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
  /** Secciones del Studio; se renderizan todas las que no estén ya cubiertas por el esqueleto fijo. */
  sections?: Array<{ id?: string; type?: string; title?: string; subtitle?: string; body?: string; cta?: string; image?: string; images?: string[]; layout?: string }>;
  /** Franja de confianza real del negocio (si viene). */
  trustItems?: string[];
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
    // Sin aggregateRating: los testimonios no traen calificación, y un 4.8
    // fijo para Google es una reseña inventada (23-10-2026).
  };
}

const jsonLd = (obj: unknown): string => JSON.stringify(obj).replace(/</g, "\\u003c");

/**
 * Qué variante visual va con el producto cuando el admin dejó "IA elige".
 *
 * Las 4 variantes son MAQUETACIONES DISTINTAS (03/10, decisión del dueño con
 * sus referencias validadas — capturas CleanHome/BlendLife/CineMax + HTML
 * ivan-caicedo/direct-response/preview-dav/landing-pro), no repintados:
 *
 *   cleanhome → la product page COD validada (imagen 1). Header de marca con
 *              sellos, hero foto + bullets + precio, FORMULARIO pegado arriba
 *              a la derecha en desktop, 4 beneficios-icono, galería,
 *              testimonios con avatar, barra 3 sellos, footer WhatsApp. DEFAULT.
 *   urgencia  → la de Ivan Caicedo / direct-response: topbar oscura con
 *              countdown, barra de stock, bundles 1x/2x/3x con ahorro y
 *              "MÁS POPULAR", toast de compras recientes.
 *   clinico   → la del preview dav: azul marino + blanco, pasos numerados en
 *              sección oscura, CTA pastilla, FAQ acordeón amable.
 *   pro       → la de landing-pro "PosturaPro": Jakarta, aire, sección
 *              problema→beneficios, packs elegibles, garantía con sello.
 *
 * La IA elige: salud/ortopedia → pro, descuento fuerte → urgencia,
 * software/gaming → clinico, el resto → cleanhome.
 */
export function elegirEstilo(producto: any | null | undefined, precioAntes?: number | null): EstiloVisual {
  const texto = `${producto?.name || ""} ${producto?.category || ""} ${producto?.description || ""}`.toLowerCase();
  const precio = Number(producto?.price) || 0;
  const antes = Number(precioAntes) || 0;
  if (/corrector de postura|postura|ortoped|faja|rodillera|lumbar|cervical|masajeador|terapia|alivio|silla|colchon/.test(texto)) return "pro";
  if (antes > precio && precio > 0 && (antes - precio) / antes >= 0.35 && precio < 150_000) return "urgencia";
  if (/software|aplicaci|\bapp\b|gaming|\bgame\b|juego|plataforma|programaci|cripto/.test(texto)) return "clinico";
  return "cleanhome";
}

export function renderizarEstilo(p: DatosEstilo, o: OpcionesRenderEstilo = {}): string {
  const host = o.host || "";
  const accion = o.accion || "";
  const pago = { mercadopago: o.pago?.mercadopago || "", paypal: o.pago?.paypal || "" };
  const a = p.accent || "#0a8f47";
  // Estilos con NOMBRE VIEJO de la primera versión del generador (cod, premium,
  // bold, dark): variantes reemplazadas el 03-10. Caen a la product page nueva
  // para que ninguna landing publicada se rompa.
  const aliasAntiguos: Record<string, EstiloVisual> = { cod: "cleanhome", premium: "pro", bold: "urgencia", dark: "clinico" };
  const style = (ESTILOS as readonly string[]).includes(String(p.style))
    ? String(p.style)
    : aliasAntiguos[String(p.style)] || "cleanhome";
  const fontFams = ["Inter:wght@400;500;600;700;800;900", "Poppins:wght@600;700;800;900"];
  if (style === "pro") fontFams.unshift("Plus+Jakarta+Sans:wght@400;500;600;700;800");
  const fontsHref = `https://fonts.googleapis.com/css2?family=${fontFams.join("&family=")}&display=swap`;
  const precio = num(p.price);
  const antes = num(p.oldPrice);
  const ahorro = precio && antes && antes > precio ? antes - precio : 0;
  // El porcentaje solo con los DOS precios reales (nunca un "50% DTO." fijo).
  const ahorroPct = ahorro ? Math.round((ahorro / antes) * 100) : 0;
  // El contador solo con una fecha de fin REAL que cargó el dueño, y la misma
  // para todos los visitantes. Antes reiniciaba 2 h por visitante: una
  // "oferta que termina" que nunca terminaba.
  const ofertaHasta = (() => {
    const t = Date.parse(String(p.ofertaHasta || ""));
    return Number.isFinite(t) && t > Date.now() ? t : 0;
  })();
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
  // ══ El look del GENERADOR ORIGINAL (decisión del dueño, 04-10) ══════════
  // El dueño validó las capturas del generador original (style-bold.html):
  // el announce de oferta, el chip de envío, el timer y la garantía SON
  // dispositivos del diseño validado — no inventos del modelo. Las fuentes
  // honestas cuando existen: la garantía del dueño (metadata.garantia) manda
  // sobre el default; el envío sale de las condiciones del negocio (si
  // declaró incluido, el chip es el del original; si no, el real).
  //
  // 23-10-2026 (el dueño): "corrige los datos inventados (4.8, envío gratis
  // por defecto, 50% DTO, contador falso)". Los dispositivos se quedan, pero
  // solo con su dato real: envío incluido si el negocio lo declaró (sin
  // "a todo el país" ni letra chica que nadie escribió), contador solo con
  // una fecha de fin real (ofertaHasta), sin estrellas ni stock.
  const envioIncluido = /incluid|gratis/i.test(String(p.envioCorto || "")) || /incluido|gratis/i.test(String(p.envio || ""));
  const envioChip = envioIncluido ? "Envío<br>incluido" : String(p.envioCorto || p.envio || "Envío nacional").replace(/\s*\(.+\)$/, "").slice(0, 28);
  const envioLargo = esFisico
    ? (envioIncluido ? "Envío incluido en el precio" : String(p.envio || "Envío nacional (se te confirma al pedir)"))
    : esServicio ? "Agenda tu cita hoy" : "Acceso inmediato";

  /**
   * El resumen de la garantía que cabe en el chip de la franja de confianza:
   * si el proveedor escribió una política larga, el chip lleva el dato duro
   * (los días/plazo); el texto completo va en el bloque de riesgo y la FAQ.
   */
  const cortoDeGarantia = (g: unknown): string => {
    const t = String(g || "").trim();
    const dias = t.match(/\b(\d{1,3})\s*(d|mes|seman)/i);
    if (!dias) return "del proveedor";
    const unidad = /mes/i.test(dias[2]) ? "mes" : /seman/i.test(dias[2]) ? "semanas" : "días";
    return `${dias[1]} ${unidad} de garantía`;
  };

  // ══ Claims de confianza: usar datos reales del negocio; nunca inventar. ══
  // Si el negocio provee franjas de confianza, las usamos tal cual. Si no,
  // usamos neutros sin promesas inventadas (sin "gratis", "30 días", etc.).
  const itemsConfianza = Array.isArray(p.trustItems) && p.trustItems.length
    ? p.trustItems
    : [];
  const trustTop = itemsConfianza.length >= 3
    ? itemsConfianza.slice(0, 4).map((txt) => {
        const palabras = String(txt).trim().split(/\s+/);
        return ["✅", palabras.slice(0, 2).join(" "), palabras.slice(2).join(" ")] as [string, string, string];
      })
    : esFisico
      ? ([
          ["🚚", "Envío", envioIncluido ? "incluido" : "nacional"],
          ["💵", "Pago contra", "entrega"],
          // La garantía del proveedor puede ser UNA POLÍTICA LARGA (medido en
          // el AB Roller: "En caso de recibir el producto diferente..."). En
          // el chip de 4 celdas no cabe: la CORTA del dueño se muestra
          // completa (es su claim exacto) y la larga se condensa al dato
          // duro; el texto íntegro vive en la FAQ del Studio cuando existe.
          ...(String(p.garantia || "").trim()
            ? (String(p.garantia).trim().length <= 40
              ? (() => { const g = String(p.garantia).trim().split(/\s+/); return [["🛡️", g[0] || "Garantía", g.slice(1).join(" ") || ""]] as unknown as [string, string, string]; })()
              : [["🛡️", "Garantía", cortoDeGarantia(p.garantia)]])
            : []),
          ["🔒", "Compra", "segura"],
        ] as Array<[string, string, string]>).slice(0, 4)
      : esServicio
        ? [
            ["📅", "Se agenda", "por WhatsApp"],
            ["💼", "Atención", "personalizada"],
            ...(String(p.garantia || "").trim() ? [["🛡️", String(p.garantia).trim(), ""]] : []),
            ["🔒", "Pago", "100% seguro"],
          ]
        : [
            ["⚡", "Acceso", "inmediato"],
            ["🔒", "Pago", "100% seguro"],
            ...(String(p.garantia || "").trim() ? [["🛡️", String(p.garantia).trim(), ""]] : []),
            ["✅", "Compra", "confiable"],
          ];

  const garantiaLinea = String(p.garantia || "").trim();
  // La barra inferior (tbar) también es una celda chica: la política larga
  // del proveedor va como "Garantía del proveedor" + el detalle en la FAQ.
  // La barra inferior (tbar) también es una celda chica: la garantía corta
  // del dueño se muestra completa; la política larga del proveedor va como
  // "Garantía del proveedor" y el detalle completo vive en la FAQ del Studio.
  const garantiaCorta = garantiaLinea
    ? (garantiaLinea.length <= 40 ? garantiaLinea : cortoDeGarantia(garantiaLinea))
    : "";
  // Sin garantía cargada no hay celda de garantía: "Garantía del negocio" o
  // "Satisfacción garantizada" por defecto prometen algo que nadie ofreció.
  const celdaGarantia: Array<[string, string, string]> = garantiaCorta ? [["🛡️", garantiaCorta, ""]] : [];
  const trustBottom = itemsConfianza.length >= 3
    ? itemsConfianza.slice(0, 3).map((txt) => ["✅", String(txt).trim(), ""] as [string, string, string])
    : esFisico
      ? [
          ...celdaGarantia,
          ["💵", "Pago contra entrega", "al recibir"],
          ["🚚", envioIncluido ? "Envío incluido" : "Envío nacional", envioIncluido ? "en el precio" : "se confirma al pedir"],
        ]
      : esServicio
        ? [
            ...celdaGarantia,
            ["🔒", "Pago seguro", "datos cifrados"],
            ["📅", "Se agenda", "por WhatsApp"],
          ]
        : [
            ...celdaGarantia,
            ["🔒", "Pago seguro", "datos cifrados"],
            ["⚡", "Acceso", "apenas se confirma el pago"],
          ];

  // Los bullets de la HERO cortos (2-6 palabras, como en el modelo validado):
  // si la IA escribió frases largas, la hero lleva el recorte y el texto
  // íntegro queda en la sección de beneficios.
  const corto = (t: string, tope: number): string => {
    const x = String(t || "").replace(/\s+/g, " ").trim();
    if (x.length <= tope) return x;
    const p2 = x.slice(0, tope).split(" ");
    p2.pop();
    return p2.join(" ");
  };
  const bullets = (p.heroBullets?.length ? p.heroBullets : p.benefits || [])
    .slice(0, 5)
    .map((b) => `<li><span>✓</span>${esc(corto(b, 56))}</li>`)
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

  // La galería del Studio ("Así es"): el dueño elige las fotos ahí; las que
  // no estín ya en el hero se muestran en la sección .shotrow. La IA nunca
  // inventa fotos: solo reordena las reales.
  const claseGaleria = "";

  const heroImgs = imagenes.slice(0, 2);
  const thumbs = heroImgs
    .map(
      (src, i) =>
        `<button class="thumb${i === 0 ? " on" : ""}" data-full="${esc(src)}" aria-label="Foto ${i + 1}"><img src="${esc(src)}" alt="${esc(p.productName)} foto ${i + 1}" loading="${i === 0 ? "eager" : "lazy"}"></button>`,
    )
    .join("");

  const caps = p.useCases || [];
  const fotosDelProducto = imagenes.slice(2);
  const fig = (src: string, i: number, extra = ""): string => `
      <figure>
        <img src="${esc(src)}" alt="${esc(caps[i] || p.productName)}" loading="lazy" width="600" height="600">
        ${caps[i] || extra ? `<figcaption>${esc(caps[i] || extra)}</figcaption>` : ""}
      </figure>`;

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

  /** Bundle de la variante URGENCIA (modelo Ivan Caicedo): radio + etiqueta
   *  1x/2x/3x + precio tachado cuando hay bundle. El ahorro SIEMPRE es
   *  calculable con los precios reales (nunca un % inventado por la IA). */
  const qtyBundle = (n: number, ribbon: string): string => {
    const total = precio * n;
    const porUnidad = total / n;
    const tachado = n > 1 && antes ? `<s>$${cop(antes * n)}</s>` : "";
    return `
          <label class="bundle${n === 2 ? " on" : ""}">
            ${ribbon && n !== 1 ? `<span class="ribbon">${esc(ribbon)}</span>` : ""}
            <input type="radio" name="cantidad" value="${n}"${n === 1 ? " checked" : ""}>
            <span class="dot"></span>
            <span class="info"><b>${n === 1 ? `1x ${esc(p.productName)}` : `${n}x ${esc(p.productName)}${n === 3 ? " (Combo)" : ""}`}</b><span>${n === 1 ? "Ideal para uso personal" : `${cop(porUnidad)} c/u — Ideal regalo`}</span></span>
            <span class="pr"><b>$${cop(total)}</b>${tachado}<em>${envioIncluido ? "Envío incluido" : ""}</em></span>
          </label>`;
  };

  /** Pack de la variante PRO (landing-pro): ribbon a la izquierda, discreto. */
  const packRow = (n: number, ribbon: string): string => {
    const total = precio * n;
    const porUnidad = total / n;
    return `
          <label class="pack${n === 1 ? " on" : ""}">
            ${ribbon && n !== 1 ? `<span class="ribbon">${esc(ribbon)}</span>` : ""}
            <input type="radio" name="cantidad" value="${n}"${n === 1 ? " checked" : ""}>
            <span class="dot"></span>
            <span class="info"><b>${n === 1 ? "1 unidad" : `${n} unidades`}</b><span>${cop(porUnidad)} c/u${esFisico && envioIncluido ? " · Envío incluido" : ""}</span></span>
            <span class="pr"><b>$${cop(total)}</b>${n > 1 && antes ? `<s>$${cop(antes * n)}</s>` : ""}</span>
          </label>`;
  };

  /** Renderiza cada sección del Studio según su tipo. Hero/formulario son fijos, el resto fluye aquí. */
  function renderizarSeccion(s: NonNullable<DatosEstilo["sections"]>[number]): string {
    const tipo = String(s.type || "").toLowerCase();
    const tit = esc(s.title || "");
    const sub = s.subtitle ? `<p style="color:var(--mut);font-weight:600;margin-bottom:18px">${esc(s.subtitle)}</p>` : "";
    const ctaBtn = s.cta
      ? `<a class="cta" href="#pedir" style="margin-top:14px;max-width:340px"><span>${esc(s.cta)}</span></a>`
      : "";

    // benefits / features → grid de 4 tarjetas con íconos
    if (tipo === "benefits" || tipo === "features" || tipo === "feature") {
      const lineas = String(s.body || "")
        .split(/\n+|\s*\|\s*/)
        .map((x) => x.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 4);
      if (!lineas.length) return "";
      const cards = lineas.map((t, i) => `
        <article class="feat">
          <div class="fi">${esc(ICONS[i % ICONS.length])}</div>
          <b>${esc(t)}</b>
        </article>`).join("");
      return `<section><div class="wrap"><span class="kicker">${tipo === "features" || tipo === "feature" ? "Características" : "Beneficios"}</span>${tit ? `<h2>${tit}</h2>` : ""}${sub}<div class="feat-grid">${cards}</div>${ctaBtn}</div></section>`;
    }

    // offer → bloque de precio / oferta
    if (tipo === "offer") {
      const lineas = String(s.body || "").split(/\n+/).map((x) => x.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
      return `<section><div class="wrap"><span class="kicker">Oferta</span>${tit ? `<h2>${tit}</h2>` : ""}${sub}
        <div class="pricebox">
          ${antes ? `<div class="antes">Antes: <del>$${cop(antes)}</del></div>` : ""}
          <div class="row"><div class="hoy"><span>Hoy:</span><strong>$${cop(precio)}</strong></div>${ahorro ? `<div class="ahorra">Ahorras<b>$${cop(ahorro)}</b></div>` : ""}</div>
          <span class="solo">${esc(envioLargo)}</span>
        </div>
        ${lineas.length ? `<ul class="hero-bullets" style="margin-top:14px">${lineas.map((b) => `<li><span>✓</span>${esc(b)}</li>`).join("")}</ul>` : ""}
        ${ctaBtn}
      </div></section>`;
    }

    // comparison → antes/después
    if (tipo === "comparison" || tipo === "before-after") {
      const items = String(s.body || "")
        .split(/\n+|\s*\|\s*/)
        .map((x) => x.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean);
      if (!items.length) return "";
      const mitad = Math.ceil(items.length / 2);
      const sin = items.slice(0, mitad);
      const con = items.slice(mitad);
      return `<section style="background:#fff"><div class="wrap"><span class="kicker">Comparativa</span>${tit ? `<h2>${tit}</h2>` : ""}${sub}
        <div class="cmp">
          <div class="sin"><h3>${tipo === "before-after" ? "Antes" : "Sin esto"}</h3><ul>${sin.map((x) => `<li><span>✗</span>${esc(x)}</li>`).join("")}</ul></div>
          <div class="con"><h3>${tipo === "before-after" ? "Después" : "Con esto"}</h3><ul>${con.map((x) => `<li><span>✓</span>${esc(x)}</li>`).join("")}</ul></div>
        </div>
        ${ctaBtn}
      </div></section>`;
    }

    // authority / how-it-works / logistics → lista numerada con íconos
    if (tipo === "authority" || tipo === "how-it-works" || tipo === "logistics" || tipo === "steps") {
      const lineas = String(s.body || "")
        .split(/\n+|\s*\|\s*/)
        .map((x) => x.replace(/^(\d+[.)-]\s*|-\s*|\*\s*)/, "").trim())
        .filter(Boolean)
        .slice(0, 5);
      if (!lineas.length) return "";
      const kick = tipo === "authority" ? "¿Por qué confiar?" : tipo === "logistics" ? "Entrega" : "Cómo funciona";
      const items = lineas.map((t, i) => `<li style="display:flex;gap:11px;padding:11px 0;border-bottom:1px solid #e6eaf0;font-size:14.5px"><span style="flex:0 0 26px;height:26px;border-radius:50%;background:var(--a);color:#fff;display:grid;place-items:center;font-weight:900;font-size:13px">${i + 1}</span><span>${esc(t)}</span></li>`).join("");
      return `<section><div class="wrap"><span class="kicker">${esc(kick)}</span>${tit ? `<h2>${tit}</h2>` : ""}${sub}<ul style="margin:0;padding:0;list-style:none">${items}</ul>${ctaBtn}</div></section>`;
    }

    // testimonials → tarjetas de reseñas
    if (tipo === "testimonials") {
      const lineas = String(s.body || "").split(/\n+/).map((x) => x.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
      if (!lineas.length && !(p.testimonials || []).length) return "";
      const cards = lineas.length
        ? lineas.map((t) => {
            const [texto, nombre = ""] = t.split(/\s*\|\s*/, 2);
            return `<article class="rev"><div class="who"><span class="av">${esc(nombre.trim().charAt(0).toUpperCase() || "?")}</span><div><b>${esc(nombre.trim())}</b></div></div><p>“${esc(texto.trim())}”</p></article>`;
          }).join("")
        : testimonios;
      return `<section><div class="wrap"><span class="kicker">Clientes reales</span><div class="rev-h"><h2 style="margin:0">${tit || "Lo que dicen nuestros clientes"}</h2></div><div class="revs">${cards}</div>${ctaBtn}</div></section>`;
    }

    // faq → acordeón
    if (tipo === "faq") {
      const lineas = String(s.body || "").split(/\n+/).map((x) => x.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
      if (!lineas.length && !faqs) return "";
      const acordeon = lineas.length
        ? lineas.map((l, i) => {
            const [q, ...resto] = l.split(/\s*\|\s*/);
            return `<details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(resto.join(" | "))}</p></details>`;
          }).join("")
        : faqs;
      return `<section style="background:#fff"><div class="wrap"><span class="kicker">Dudas frecuentes</span>${tit ? `<h2>${tit}</h2>` : "<h2>Preguntas antes de pedir</h2>"}${sub}${acordeon}${ctaBtn}</div></section>`;
    }

    // cta → bloque llamativo
    if (tipo === "cta") {
      return `<section><div class="wrap"><div class="risk">${tit ? `<h2>${tit}</h2>` : "<h2>¿Listo para empezar?</h2>"}${sub}<a class="cta" href="#pedir" style="max-width:340px;margin:16px auto 0"><span>${esc(s.cta || "Pedir ahora")}</span></a></div></div></section>`;
    }

    // gallery → "Así es": las fotos que el dueño eligió en el Studio. Aparecen
    // las de la sección y las extra del producto; nunca se repite la que ya
    // sale en la tarjeta del hero (la primera). Sin fotos, la sección no se
    // imprime (antes quedaba un título vacío y la pígina "corta").
    if (tipo === "gallery") {
      const urls = [...new Set((Array.isArray(s.images) ? s.images : [s?.image])
        .filter(Boolean).map(String))];
      const extra = fotosDelProducto.filter((f) => !urls.includes(f) && !heroImgs.includes(f));
      const fotosSeccion = [...urls, ...extra].filter((f) => !heroImgs.includes(f));
      if (!fotosSeccion.length) return "";
      const caption = String(s.subtitle || "").trim();
      const figs = fotosSeccion.map((src, i) => fig(src, i, i === 0 && caption ? caption : extra.includes(src) ? "Foto real del producto" : "")).join("");
      return `<section${claseGaleria ? ` class="${claseGaleria}"` : ""}>
  <div class="wrap">
    <span class="kicker">${esc(String((s as any).kicker || "Galería").slice(0, 40))}</span>
    <h2>${tit || "Así es"}</h2>
    ${sub}
    <div class="shotrow">${figs}</div>
  </div>
</section>`;
    }

    // fallback genérico: renderiza el body como pírrafos
    const body = String(s.body || "").split(/\n+/).filter(Boolean).map((b) => `<p>${esc(b)}</p>`).join("");
    if (!tit && !body && !s.image) return "";
    const img = s.image ? `<img src="${esc(s.image)}" alt="${esc(tit || p.productName)}" loading="lazy" style="border-radius:16px;margin-bottom:16px">` : "";
    return `<section><div class="wrap">${img}${tit ? `<h2>${tit}</h2>` : ""}${sub}${body}${ctaBtn}</div></section>`;
  }

  const seccionesHtml = (p.sections || [])
    .filter((s: any) => s && !["hero"].includes(String(s.type || "")))
    .map(renderizarSeccion)
    .join("");

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
              <span class="err">Escribe un celular vílido (10 dígitos)</span>
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
              <input id="f-city" name="ciudad" type="text" list="ciudades-datalist" autocomplete="address-level2" placeholder="Ej. Bogotí">
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

          ${
            style === "urgencia"
              ? `<div class="qtys" role="radiogroup" aria-label="Selecciona tu oferta">
            <legend style="padding:0 6px">1 · Selecciona tu oferta especial</legend>
            ${qtyBundle(1, "")}
            ${precio && antes ? qtyBundle(2, `¡MÁS POPULAR! · AHORRA ${cop((antes - precio) * 2)}`) : precio ? qtyBundle(2, "¡MÁS POPULAR!") : ""}
            ${precio ? qtyBundle(3, antes ? `Combo · Ahorras ${cop((antes - precio) * 3)}` : "Combo · Máximo ahorro") : ""}
          </div>
          <div class="bundle-sum">
            <div><span>Oferta seleccionada:</span><b id="bs-offerta" style="text-align:right">1x ${esc(p.productName)}</b></div>
            <div><span>Costo de envío nacional:</span><b style="color:var(--ok)">${envioIncluido ? "¡GRATIS!" : esc(envioLargo)}</b></div>
            <div><span>Método de pago:</span><b>${esFisico ? "💵 Efectivo al recibir" : "🔒 Pago seguro"}</b></div>
            <div class="tot" style="border-top:1px solid #eef1ee;margin-top:6px;padding-top:10px;font-weight:900;font-size:15px"><span>TOTAL A PAGAR:</span><b id="bs-total" style="color:var(--a);font-size:20px">$${cop(precio)} COP</b></div>
          </div>`
              : style === "pro"
                ? `<div class="packs" role="radiogroup" aria-label="Elige tu oferta">
            ${packRow(1, "")}
            ${precio ? packRow(2, "MÁS VENDIDO") : ""}
            ${precio ? packRow(3, "MEJOR PRECIO") : ""}
          </div>`
                : `<fieldset class="qtys">
            <legend>Selecciona tu pedido</legend>
            ${qtyRow(1, false)}
            ${precio ? qtyRow(2, true) : ""}
            ${precio ? qtyRow(3, false) : ""}
          </fieldset>`
          }

          <button class="cta" type="submit"><span>${p.cta ? esc(p.cta) : esFisico ? "🛒 Pedir ahora · Pago contra entrega" : "Quiero acceder ahora"}</span><small>${pagoCorto}</small></button>
          <p class="secure">🔒 ${esFisico ? "Tus datos están seguros. Paga al recibir." : "Tus datos están seguros"}</p>
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
:root{--a:${esc(a)};--a-d:${esc(a)}dd;--ink:#12271d;--mut:#5b6472;--bg:#f5f7f5;--ok:#0d9d58;--bad:#e2483d;--star:#f5a623;--wa:#25d366;--card:#fff}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:64px}
body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55;font-size:15.5px;overflow-x:hidden;overflow-wrap:break-word;word-break:break-word}
img{max-width:100%;display:block}
button,input,select{font:inherit}
.wrap{max-width:1000px;margin:0 auto;padding:0 16px}
section{padding:34px 0}
h1,h2,h3{line-height:1.15;margin:0 0 10px;letter-spacing:-.02em;text-wrap:balance}
h2{font-size:clamp(23px,5vw,32px);font-weight:800}
h3{font-size:16px;font-weight:700}
p{margin:0 0 12px}
.kicker{display:inline-block;color:var(--a);font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px}
.sec-head{text-align:center;margin-bottom:20px}
.sec-head .kicker{margin-bottom:6px}
.sec-head p{margin:0;color:var(--mut)}

/* header de marca: blanco con sellos inline (modelo CleanHome validado) */
.hdr{position:sticky;top:0;z-index:40;background:#fff;border-bottom:1px solid #e8ece8}
.hdr .wrap{display:flex;align-items:center;justify-content:space-between;gap:10px;height:58px;max-width:1180px}
.brand{display:flex;align-items:center;gap:10px;min-width:0;text-decoration:none;color:inherit}
.brand .logo{flex:0 0 34px;height:34px;border-radius:10px;background:var(--a);color:#fff;display:grid;place-items:center;font-weight:900;font-size:15px}
.brand b{font-size:16.5px;font-weight:900;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brand .tag{font-size:10.5px;color:var(--mut);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1}
.brand>div{min-width:0}
.top-sells{display:none;align-items:center;gap:18px;font-size:11.5px;font-weight:700;color:var(--ink)}
.top-sells span{display:inline-flex;align-items:center;gap:6px;opacity:.85}
.rating-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid #e6e6e6;border-radius:999px;padding:6px 12px;background:#fff}
.rating-pill .st{color:var(--star);letter-spacing:1px;font-size:12px}
.rating-pill b{font-size:12.5px}
.announce{background:#141a24;color:#fff;text-align:center;font-size:11.5px;font-weight:700;padding:7px 12px;letter-spacing:.02em}

/* hero */
.hero{background:#fff;padding:20px 0 4px}
.hero-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}
.hero-copy .kicker{margin-bottom:10px}
.hero h1{font-size:clamp(29px,7vw,47px);font-weight:900;letter-spacing:-.035em;line-height:1.04;margin:6px 0 10px}
.hero .sub{color:var(--mut);font-size:clamp(14.5px,3.7vw,17.5px);font-weight:500;margin:0 0 8px}
.hero-mid{display:grid;grid-template-columns:1fr;gap:14px}
.hero-bullets{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.hero-bullets li{display:flex;gap:9px;align-items:flex-start;color:var(--ink);font-size:14px;font-weight:700;line-height:1.3}
.hero-bullets li span{flex:0 0 20px;height:20px;margin-top:1px;border-radius:50%;background:var(--ok);color:#fff;font-size:11px;font-weight:900;display:grid;place-items:center}
.hero-media{position:relative}
.hero-media .ph{position:relative;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 18px 44px #00000016;border:1px solid #eef1ee}
.hero-media .ph .main{aspect-ratio:1/1.05;background:#fff center/contain no-repeat;cursor:zoom-in}
.hero-media .flot{position:absolute;top:14px;left:14px;background:var(--bad);color:#fff;font-size:11px;font-weight:900;padding:8px 12px;border-radius:999px;box-shadow:0 8px 20px #0003;z-index:2;text-align:center;line-height:1.15}
.hero-media .flot2{position:absolute;top:14px;right:14px;background:#fff;color:var(--ink);font-size:10.5px;font-weight:800;padding:7px 11px;border-radius:999px;box-shadow:0 6px 16px #0002;z-index:2;border:1px solid #eee;text-align:center;line-height:1.15}
.gal{position:relative;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 12px 34px #0000001a}
.gal .main{aspect-ratio:1/1;background:#fff center/contain no-repeat}
.thumbs{display:flex;gap:8px;padding:10px 2px 0;overflow-x:auto;scrollbar-width:thin}
.thumb{flex:0 0 58px;height:58px;padding:0;border:2px solid transparent;border-radius:11px;overflow:hidden;cursor:pointer;background:#fff}
.thumb img{width:100%;height:100%;object-fit:cover}
.thumb.on{border-color:var(--a)}
.play{position:absolute;inset:0;display:none;place-items:center;background:#0009;border:0;cursor:pointer}
.play svg{filter:drop-shadow(0 4px 14px #0007)}
.video-on .play{display:grid}
/* precio grande blanco (modelo CleanHome) */
.pricebox{background:#fff;border:1.5px solid #e8ece8;border-radius:18px;padding:13px 14px 14px;box-shadow:0 14px 30px #00000012}
.pricebox .antes{font-size:12.5px;font-weight:700;color:var(--mut);margin-bottom:5px}
.pricebox .antes del{opacity:.9}
.pricebox .row{display:flex;gap:10px;align-items:stretch}
.pricebox .hoy{flex:1;display:flex;align-items:baseline;gap:10px;min-width:0}
.pricebox .hoy span{font-size:15px;font-weight:800;color:#2a7a52}
.pricebox .hoy strong{font-size:clamp(30px,8vw,42px);font-weight:900;color:var(--a);letter-spacing:-.03em;line-height:1}
.pricebox .ahorra{flex:0 0 auto;background:#ffd21c;color:var(--ink);border-radius:10px;padding:8px 12px;text-align:center;font-size:11px;font-weight:800;line-height:1.15;align-self:center}
.pricebox .ahorra b{display:block;font-size:15px;font-weight:900}
.pricebox .solo{display:inline-block;background:var(--ok);color:#fff;font-size:10.5px;font-weight:900;padding:4px 10px;border-radius:999px;margin-top:10px;letter-spacing:.05em;text-transform:uppercase}
/* contador */
.timer{display:flex;gap:9px;align-items:center;background:#ffffff;border:1.5px dashed var(--a);color:var(--ink);padding:11px 13px;border-radius:13px;margin:12px 0 0}
.timer .lb{font-size:11.5px;font-weight:700;flex:1;line-height:1.2}
.timer .t{display:flex;gap:5px}
.timer .t b{background:#141a24;color:#fff;min-width:40px;padding:6px 0;border-radius:8px;text-align:center;font-size:17px;font-variant-numeric:tabular-nums}
.timer .t i{font-style:normal;align-self:center;opacity:.4}

.cta{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:100%;background:var(--a);color:#fff;border:0;border-radius:13px;padding:12px 14px;min-height:56px;cursor:pointer;box-shadow:0 10px 26px color-mix(in srgb,var(--a) 45%,transparent);transition:transform .1s;letter-spacing:.02em;text-decoration:none;text-align:center}
.cta span{font-weight:900;font-size:16px}
.cta small{font-size:9.5px;font-weight:800;letter-spacing:.14em;opacity:.92}
.cta:active{transform:scale(.98)}
.cta.ghost{background:#fff;color:var(--a);box-shadow:none;border:2px solid var(--a)}
.cta.ghost small{opacity:.75}
.pulse{animation:subtle-pulse 2.2s ease-in-out infinite}
@keyframes subtle-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
.hero-buy{margin-top:0}
.hero-form{min-width:0}
.note{text-align:center;color:var(--mut);font-size:12px;margin-top:9px}
/* confianza 4 celdas */
.trust4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#fff;border-top:1px solid #eef1ee;border-bottom:1px solid #eef1ee;padding:13px 0;margin:24px 0 0}
.trust4 div{text-align:center;font-size:9.5px;font-weight:800;color:var(--ink);line-height:1.2;padding:0 2px}
.trust4 div span{display:block;font-size:21px;margin-bottom:4px}
.trust4 div i{display:block;font-style:normal;color:var(--mut);font-weight:600}

/* beneficios 4 tarjetas */
.feat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.feat{background:var(--card);border:1px solid #eef1ee;border-radius:16px;padding:16px 13px;text-align:left;box-shadow:0 8px 22px #0000000a}
.feat .fi{width:44px;height:44px;margin:0 0 10px;border-radius:12px;background:color-mix(in srgb,var(--a) 12%,#fff);display:grid;place-items:center;font-size:22px}
.feat b{display:block;font-size:14px;font-weight:800;line-height:1.25;margin-bottom:5px}
.feat p{margin:0;font-size:12px;color:var(--mut);line-height:1.45}
/* fotos repartidas por la página: slider una por una en móvil */
.shotrow{display:grid;grid-auto-flow:column;grid-auto-columns:82%;gap:11px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:4px 16px 10px;margin:0 -16px}
.shotrow::-webkit-scrollbar{display:none}
.shotrow figure{margin:0;scroll-snap-align:center;background:var(--card);border:1px solid #eef1ee;border-radius:16px;overflow:hidden;box-shadow:0 8px 20px #00000010}
.shotrow img{aspect-ratio:1/1;height:auto;object-fit:cover;width:100%}
.shotrow figcaption{padding:9px 7px;font-size:11.5px;font-weight:800;text-align:center;line-height:1.2}

/* dolor (tarjeta suave, ya no sección negra) */
.pains{background:#fff;border:1px solid #eef1ee;border-radius:20px;color:var(--ink)}
.pains h2{color:var(--ink)}
.pains li{list-style:none;display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-bottom:1px solid #f0f2f4;font-size:15px}
.pains li:last-child{border:0}
.pains .x{color:var(--bad);font-weight:900;flex:0 0 auto}
.pains ul{margin:0;padding:0}
.pains .kicker{color:var(--bad)}
/* comparativa */
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cmp>div{border-radius:16px;padding:16px 15px}
.cmp h3{font-size:14.5px;margin-bottom:9px;display:flex;align-items:center;gap:7px}
.cmp ul{margin:0;padding:0;list-style:none}
.cmp li{display:flex;gap:8px;font-size:13px;padding:8px 0;border-bottom:1px solid #00000010;line-height:1.35}
.cmp li:last-child{border:0}
.cmp li span{font-weight:900;flex:0 0 auto}
.cmp .sin{background:#fef2f1;border:1px solid #f3d7d3}
.cmp .sin h3{color:var(--bad)}
.cmp .sin li span{color:var(--bad)}
.cmp .con{background:color-mix(in srgb,var(--ok) 9%,#fff);border:1px solid color-mix(in srgb,var(--ok) 32%,transparent)}
.cmp .con h3{color:var(--ok)}
.cmp .con li span{color:var(--ok)}
/* riesgo */
.risk{background:color-mix(in srgb,var(--a) 8%,#fff);border:1.5px dashed color-mix(in srgb,var(--a) 46%,#fff);color:var(--ink);text-align:center;border-radius:20px;padding:24px 18px;margin:0 auto}
.risk h2{font-size:21px}
.risk p{opacity:.85}
.risk .guar{font-size:40px;margin-bottom:8px}
/* reviews con avatar */
.revs{display:grid;gap:12px}
.rev{background:var(--card);border:1px solid #eef1ee;border-radius:16px;padding:15px;box-shadow:0 8px 20px #00000009}
.rev .who{display:flex;align-items:center;gap:10px;margin-bottom:9px}
.rev .av{flex:0 0 40px;height:40px;border-radius:50%;background:var(--a);color:#fff;display:grid;place-items:center;font-weight:900;font-size:17px;overflow:hidden}
.rev .who b{display:block;font-size:13.5px;line-height:1.1}
.rev .who i{font-style:normal;font-size:11.5px;color:var(--mut);font-weight:600}
.rev .stars{margin-left:auto;color:var(--star);letter-spacing:1px;font-size:14px;flex:0 0 auto}
.rev p{font-size:13.5px;margin:0;line-height:1.5;color:#3d4553}
.rev .vf{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:800;color:var(--ok);margin-top:8px;padding-top:8px;border-top:1px solid #f0f2f4;width:100%}
.rev-h{display:flex;align-items:center;justify-content:center;gap:8px}
.rev-h .st{color:var(--star);letter-spacing:1px;font-size:17px}
/* faq */
details{background:var(--card);border:1px solid #e6eaf0;border-radius:12px;margin-bottom:9px;overflow:hidden}
summary{padding:15px 16px;font-weight:700;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:10px;font-size:14.5px}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";color:var(--a);font-weight:900;font-size:20px;line-height:1}
details[open] summary::after{content:"-"}
details p{padding:0 16px 15px;margin:0;color:var(--mut);font-size:14px}

/* form */
.order{background:var(--card);border-radius:20px;overflow:hidden;box-shadow:0 16px 44px #00000017;border:1.5px solid color-mix(in srgb,var(--a) 38%,#fff)}
.order .oh{background:var(--a);color:#fff;padding:14px 16px;text-align:center}
.order .oh h2{color:#fff;font-size:19px;margin:0;font-weight:900}
.order .oh p{margin:3px 0 0;font-size:12.5px;opacity:.95;font-weight:600}
.order .ob{padding:17px 15px 19px}
.field{margin-bottom:11px}
.field label{display:block;font-size:11.5px;font-weight:800;color:var(--mut);margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em}
.field input,.field select{width:100%;padding:13px;border:1.5px solid #dde2ea;border-radius:12px;background:#fbfcfe;font-size:16px;transition:border .15s,box-shadow .15s}
.field input:focus,.field select:focus{outline:0;border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 24%,transparent);background:#fff}
.field.bad input,.field.bad select{border-color:var(--bad);background:#fff5f4}
.field .err{display:none;color:var(--bad);font-size:12px;font-weight:600;margin-top:4px}
.field.bad .err{display:block}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qtys{border:1.5px solid #dde2ea;border-radius:14px;padding:11px;margin:4px 0 13px}
.qtys legend{font-size:11.5px;font-weight:800;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;padding:0 6px}
.q{display:flex;align-items:center;gap:9px;padding:11px 10px;border:1.5px solid #e3e7ee;border-radius:11px;margin-bottom:8px;cursor:pointer;position:relative;background:#fff}
.q:last-child{margin-bottom:0}
.q input{position:absolute;opacity:0;pointer-events:none}
.q .dot{flex:0 0 18px;height:18px;border-radius:50%;border:2px solid #c3cad6;background:#fff}
.q em{font-style:normal;font-weight:800;font-size:14px;white-space:nowrap}
.q b{margin-left:auto;font-weight:900;font-size:15px;color:var(--ink);white-space:nowrap}
.q i{font-style:normal;font-size:9px;font-weight:900;background:var(--bad);color:#fff;padding:3px 6px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.q.on{border-color:var(--a);background:color-mix(in srgb,var(--a) 7%,#fff)}
.q.on .dot{border-color:var(--a);box-shadow:inset 0 0 0 3.5px var(--a)}
.q.on b{color:var(--a)}
.bundle-sum{background:#f8faf8;border:1px solid #e8ece8;border-radius:14px;padding:12px 14px;margin:2px 0 13px;font-size:13px}
.bundle-sum div{display:flex;justify-content:space-between;gap:10px;padding:4px 0}
.bundle-sum .tot{font-weight:900;font-size:15px}
.bundle-sum .tot b{color:var(--a);font-size:19px}
.ok-msg{display:none;text-align:center;padding:26px 16px}
.ok-msg .tick{font-size:52px;margin-bottom:8px}
.ok-msg h3{font-size:21px;margin-bottom:6px}
.ok-msg p{color:var(--mut);font-size:14.5px}
.sent .fields,.sent .qtys,.sent .packs{display:none}
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
.sticky .cta{width:auto;flex:1;max-width:64%;padding:8px 12px;min-height:50px;margin:0}
.sticky .cta span{font-size:14px}
.sticky .cart{flex:0 0 auto;font-size:22px}

/* whatsapp */
.wa{position:fixed;right:14px;bottom:88px;z-index:51;width:54px;height:54px;border-radius:50%;background:var(--wa);display:grid;place-items:center;box-shadow:0 8px 24px #25d36666;text-decoration:none;transition:transform .15s}
.wa:active{transform:scale(.92)}
.wa::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--wa);animation:ring 2s infinite}
@keyframes ring{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.5);opacity:0}}
/* trust bar inferior + footer */
.tbar{background:#fff;border-top:1px solid #eef1ee;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:15px 12px;text-align:center;margin-top:26px}
.tbar div{font-size:9.5px;font-weight:700;line-height:1.25;color:var(--mut)}
.tbar div span{display:block;font-size:19px;margin-bottom:4px}
.tbar div b{display:block;color:var(--ink);font-size:10.5px;font-weight:900}
footer{background:var(--ink);color:#ffffffb8;text-align:center;padding:24px 16px 30px;font-size:12.5px}
footer .fbrand{display:flex;align-items:center;justify-content:center;gap:9px;margin-bottom:10px}
footer .fbrand .logo{width:30px;height:30px;border-radius:9px;background:var(--a);color:#fff;display:grid;place-items:center;font-weight:900;font-size:14px}
footer .fbrand b{color:#fff;font-size:14.5px}
footer .fwa{display:inline-flex;align-items:center;gap:7px;background:#ffffff14;border:1px solid #ffffff2b;color:#fff;border-radius:999px;padding:8px 14px;text-decoration:none;font-weight:700;font-size:12.5px}
footer .fwa .g{width:22px;height:22px;border-radius:50%;background:var(--wa);display:grid;place-items:center;font-size:12px}
footer .fine{margin-top:12px;font-size:10.5px;opacity:.7}
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
  /* El comparador y la franja de confianza usaban columnas FIJAS que en un
     teléfono angosto desbordan el ancho (dos columnas de texto lado a lado y
     4 celdas de 1fr). Abajo de 560px se apilan/parten a 2 para que el texto
     fluya y no se salga de la pantalla. */
  .cmp{grid-template-columns:1fr}
  .trust4{grid-template-columns:repeat(2,1fr);gap:10px 6px}
  .trust4 div{font-size:10.5px}
  .tbar{grid-template-columns:1fr;gap:8px;text-align:left}
  .tbar div{display:flex;align-items:center;gap:8px}
  .tbar div span{margin:0;font-size:17px}
  .q em{white-space:normal}
}
@media(min-width:700px){
  .shotrow{grid-auto-flow:row;grid-template-columns:repeat(4,1fr);grid-auto-columns:auto;overflow:visible;margin:0;padding:4px 0 0;gap:14px}
  .shotrow figure{scroll-snap-align:none}
  .feat-grid{grid-template-columns:repeat(4,1fr)}
  .sticky{left:50%;right:auto;transform:translate(-50%,115%);width:min(560px,92%);border:2px solid var(--a);border-radius:18px 18px 0 0;bottom:0}
  .sticky.show{transform:translate(-50%,0)}
  .top-sells{display:flex}
}

/* ====================================================================
   DESKTOP ≥ 900px: formulario pegado ARRIBA a la DERECHA (el usuario
   compra sin recorrer la página, como en el modelo validado).
   ==================================================================== */
@media(min-width:900px){
  .hero{padding-bottom:10px}
  .hero-grid{grid-template-columns:minmax(0,1.06fr) minmax(0,.94fr);gap:26px;align-items:start}
  .hero-mid{display:contents}
  .hero-copy{grid-column:1;grid-row:1}
  .hero-media{grid-column:1;grid-row:2}
  .hero-form{grid-column:2;grid-row:1/3;position:sticky;top:76px;align-self:start}
  .hero-buy{display:contents}
  .hero-buy .pricebox{margin-bottom:12px}
  .cmp{grid-template-columns:1fr 1fr}
  .revs{grid-template-columns:repeat(3,1fr)}
  .two{grid-template-columns:1fr 1fr}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
/* ===== VARIANTES (data-style): mismo esqueleto, distinta maquetación ===== */

/* ── cleanhome (DEFAULT): fondo claro neutro, header blanco, acento del producto ── */
[data-style="cleanhome"] body{background:#f6f8f6}
[data-style="cleanhome"] .hero{background:#fff;padding-bottom:0}
[data-style="cleanhome"] .hero-form .order{box-shadow:0 18px 44px #0000001a}
[data-style="cleanhome"] .hero-form .order .oh{border-radius:18px 18px 0 0}

/* ── urgencia: product page Ivan Caicedo / direct-response ──
   topbar oscura con countdown MM:SS, stock bar, bundles con ahorro exacto,
   toast de compras recientes. */
[data-style="urgencia"] body{background:#f6f7fb}
[data-style="urgencia"] .hdr{background:linear-gradient(90deg,var(--ink),color-mix(in srgb,var(--a) 55%,var(--ink)) 50%,var(--ink));color:#fff;border-bottom:0}
[data-style="urgencia"] .brand .logo{background:#fff;color:var(--ink)}
[data-style="urgencia"] .brand b,[data-style="urgencia"] .brand .tag{color:#fff}
[data-style="urgencia"] .brand .tag{opacity:.8}
[data-style="urgencia"] .announce{background:#1c1224;color:#fff;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;text-align:center;font-size:11.5px;font-weight:800;padding:8px 12px;letter-spacing:.02em}
[data-style="urgencia"] .announce .chip-rojo{background:var(--bad);color:#fff;padding:2px 9px;border-radius:999px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;animation:blinking 1.6s infinite}
[data-style="urgencia"] .announce .cd{background:#00000042;color:#ffd166;border:1px solid #ffd16655;padding:2px 10px;border-radius:999px;font-weight:900;font-variant-numeric:tabular-nums}
@keyframes blinking{0%,100%{opacity:1}50%{opacity:.55}}
[data-style="urgencia"] .hero{background:#fff}
[data-style="urgencia"] .stockbar{background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:14px;padding:11px 13px;margin:0 0 12px}
[data-style="urgencia"] .stockbar .row{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11.5px;font-weight:800}
[data-style="urgencia"] .stockbar .q{font-weight:900;color:#b91c1c}
[data-style="urgencia"] .stockbar .bar{height:9px;background:#fde68a;border-radius:999px;overflow:hidden;margin-top:7px}
[data-style="urgencia"] .stockbar .bar b{display:block;height:100%;background:linear-gradient(90deg,var(--bad),#f59e0b);border-radius:999px}
[data-style="urgencia"] .bundle{border:1.5px solid #e7e9f1;border-radius:15px;padding:13px 14px;margin-bottom:10px;cursor:pointer;position:relative;display:flex;align-items:center;gap:11px;background:#fff;transition:border .15s,background .15s}
[data-style="urgencia"] .bundle .dot{flex:0 0 19px;height:19px;border-radius:50%;border:2px solid #c3cad6;background:#fff;display:grid;place-items:center}
[data-style="urgencia"] .bundle .dot::after{width:9px;height:9px;border-radius:50%;background:var(--a);transform:scale(0);transition:transform .15s;content:""}
[data-style="urgencia"] .bundle.on{border-color:var(--a);background:color-mix(in srgb,var(--a) 7%,#fff);box-shadow:0 6px 18px color-mix(in srgb,var(--a) 20%,transparent)}
[data-style="urgencia"] .bundle.on .dot{border-color:var(--a)}
[data-style="urgencia"] .bundle.on .dot::after{transform:scale(1)}
[data-style="urgencia"] .bundle .info{flex:1;min-width:0}
[data-style="urgencia"] .bundle .info b{display:block;font-size:14.5px;font-weight:800}
[data-style="urgencia"] .bundle .info span{display:block;font-size:11.5px;color:var(--mut);font-weight:600}
[data-style="urgencia"] .bundle .pr{text-align:right;min-width:0}
[data-style="urgencia"] .bundle .pr b{display:block;font-size:16.5px;font-weight:900;color:var(--a)}
[data-style="urgencia"] .bundle .pr s{display:block;font-size:11px;color:#9aa3b0}
[data-style="urgencia"] .bundle .pr em{display:block;font-style:normal;font-size:10px;font-weight:800;color:var(--ok)}
[data-style="urgencia"] .bundle .ribbon{position:absolute;top:-10px;right:12px;background:var(--bad);color:#fff;font-size:9.5px;font-weight:900;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.05em;box-shadow:0 4px 12px #e2483d55}
/* en urgencia el precio va DENTRO del form: el pricebox no se dibuja aparte */
[data-style="urgencia"] .hero-buy .pricebox{display:none}
[data-style="urgencia"] .toast{position:fixed;left:14px;bottom:88px;z-index:49;background:#fff;border:1px solid #eef1ee;border-radius:16px;padding:11px 13px;display:flex;gap:10px;align-items:center;box-shadow:0 14px 34px #00000026;max-width:290px;transform:translateY(24px);opacity:0;transition:.4s;pointer-events:none}
[data-style="urgencia"] .toast.on{transform:none;opacity:1}
[data-style="urgencia"] .toast .tic{flex:0 0 38px;height:38px;border-radius:50%;background:color-mix(in srgb,var(--a) 12%,#fff);display:grid;place-items:center;font-size:17px}
[data-style="urgencia"] .toast b{display:block;font-size:12px;font-weight:800;color:var(--ink);line-height:1.2}
[data-style="urgencia"] .toast span{display:block;font-size:10.5px;color:var(--mut);font-weight:600;line-height:1.3}
[data-style="urgencia"] .toast i{display:block;font-style:normal;font-size:9px;font-weight:800;color:var(--ok);margin-top:2px}

/* ── clinico: azul marino/azul blanco del preview dav ── */
[data-style="clinico"]{--ink:#10233d;--mut:#5c6b84;--bg:#f4f6fb}
[data-style="clinico"] .hdr .logo{border-radius:50%}
[data-style="clinico"] .hero{background:linear-gradient(180deg,#eef3fb 0%,#fff 70%)}
[data-style="clinico"] .hero h1 strong,[data-style="clinico"] .hero h1 b{color:#1e5bd7}
[data-style="clinico"] .kicker{color:#1e5bd7}
[data-style="clinico"] .cta{border-radius:999px}
[data-style="clinico"] .order{border-radius:24px;border-color:#d8e2f2}
[data-style="clinico"] .order .oh{background:linear-gradient(135deg,#1e5bd7,#0f3fa8);border-radius:22px 22px 0 0}
[data-style="clinico"] .steps-wrap{background:linear-gradient(135deg,#10233d,#16326b);color:#fff;border-radius:24px;padding:30px 22px}
[data-style="clinico"] .steps-wrap h2{color:#fff}
[data-style="clinico"] .steps-wrap .kicker{color:#7fb1ff}
[data-style="clinico"] .steps{display:grid;gap:0;margin:0;padding:0;list-style:none}
[data-style="clinico"] .steps li{display:flex;gap:13px;padding:12px 0;align-items:flex-start;border-bottom:1px solid #ffffff1f}
[data-style="clinico"] .steps li:last-child{border:0}
[data-style="clinico"] .steps .n{flex:0 0 30px;height:30px;border-radius:50%;background:#1e5bd7;display:grid;place-items:center;font-weight:900;font-size:14px}
[data-style="clinico"] .steps b{display:block;font-size:15px;margin-bottom:2px}
[data-style="clinico"] .steps p{margin:0;font-size:13px;opacity:.85}
[data-style="clinico"] .risk{background:linear-gradient(135deg,#eef4fd,#fff);border:1px solid #d8e2f2}

/* ── pro: landing-pro "PosturaPro" (tema del producto, aire, Jakarta) ── */
[data-style="pro"] body{font-size:16px;background:#fff}
[data-style="pro"] .hdr{background:#ffffffee;backdrop-filter:blur(10px)}
[data-style="pro"] .hdr .wrap{height:64px}
[data-style="pro"] .brand .logo{border-radius:12px;background:linear-gradient(135deg,var(--a),color-mix(in srgb,var(--a) 65%,#fff))}
[data-style="pro"] .hdr .btn-min{background:var(--a);color:#fff;border:0;border-radius:999px;padding:10px 18px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-block}
[data-style="pro"] .hero{background:linear-gradient(180deg,color-mix(in srgb,var(--a) 9%,#fff) 0%,#fff 60%);padding:26px 0 8px}
[data-style="pro"] .hero-grid{gap:26px}
[data-style="pro"] .hero h1{font-size:clamp(31px,6.4vw,52px)}
[data-style="pro"] .hero h1 .gt{background:linear-gradient(90deg,var(--a),color-mix(in srgb,var(--a) 62%,#22c55e));-webkit-background-clip:text;background-clip:text;color:transparent}
[data-style="pro"] .chip-dot{display:inline-flex;align-items:center;gap:9px;background:color-mix(in srgb,var(--a) 11%,#fff);color:var(--a);font-weight:800;font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;padding:7px 13px;border-radius:999px;width:fit-content}
[data-style="pro"] .chip-dot i{width:8px;height:8px;border-radius:50%;background:var(--a)}
[data-style="pro"] .kicker{color:var(--a)}
[data-style="pro"] .price-card{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid #e6e9ef;border-radius:16px;padding:14px 18px;box-shadow:0 4px 14px #0000000a}
[data-style="pro"] .price-card small{display:block;font-size:11px;font-weight:800;color:var(--mut);text-transform:uppercase;letter-spacing:.08em}
[data-style="pro"] .price-now{font-size:28px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--a)}
[data-style="pro"] .price-old{color:#94a3b8;text-decoration:line-through;font-weight:600;margin-left:8px;font-size:14.5px}
[data-style="pro"] .off{background:var(--bad);color:#fff;font-weight:800;font-size:12.5px;padding:6px 10px;border-radius:10px;white-space:nowrap}
[data-style="pro"] .cta{border-radius:999px}
[data-style="pro"] .dark-sec{background:var(--ink);color:#fff;position:relative;overflow:hidden;border-radius:26px}
[data-style="pro"] .dark-sec::before{content:"";position:absolute;inset:-40% -10% auto auto;width:380px;height:380px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--a) 45%,transparent),transparent);pointer-events:none}
[data-style="pro"] .dark-sec .kicker{color:#ffffffb3}
[data-style="pro"] .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;position:relative;list-style:none;margin:0;padding:0}
[data-style="pro"] .steps .step{background:#ffffff0d;border:1px solid #ffffff1f;border-radius:18px;padding:20px;display:grid;gap:8px}
[data-style="pro"] .steps .step .n{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;font-weight:800;font-size:18px;background:linear-gradient(135deg,var(--a),color-mix(in srgb,var(--a) 68%,#fff))}
[data-style="pro"] .pack{position:relative;display:flex;align-items:center;gap:13px;border:1.5px solid #e6e9ef;border-radius:15px;padding:14px;cursor:pointer;transition:.15s;background:#fff}
[data-style="pro"] .pack .dot{flex:0 0 20px;height:20px;border-radius:50%;border:2px solid #c3cad6;flex:none;display:grid;place-items:center}
[data-style="pro"] .pack .dot::after{content:"";width:9px;height:9px;border-radius:50%;background:var(--a);transform:scale(0);transition:.15s}
[data-style="pro"] .pack.on{border-color:var(--a);background:color-mix(in srgb,var(--a) 5%,#fff)}
[data-style="pro"] .pack.on .dot{border-color:var(--a)}
[data-style="pro"] .pack.on .dot::after{transform:scale(1)}
[data-style="pro"] .pack .info{flex:1;min-width:0}
[data-style="pro"] .pack .info b{display:block;font-size:15px}
[data-style="pro"] .pack .info span{font-size:12.5px;color:var(--mut)}
[data-style="pro"] .pack .pr{text-align:right}
[data-style="pro"] .pack .pr b{display:block;font-size:17px}
[data-style="pro"] .pack .pr s{font-size:12px;color:#94a3b8}
[data-style="pro"] .pack .ribbon{position:absolute;top:-10px;left:14px;font-size:10px;font-weight:800;letter-spacing:.06em;padding:4px 10px;border-radius:999px;color:#fff;background:linear-gradient(90deg,var(--a),color-mix(in srgb,var(--a) 60%,#22c55e))}
[data-style="pro"] .risk{text-align:left;display:flex;gap:18px;align-items:center}
[data-style="pro"] .risk .guar{margin:0 0 4px}
[data-style="pro"] .guarantee{display:flex;gap:18px;align-items:center;max-width:760px;margin:0 auto;border-radius:20px;padding:22px;background:color-mix(in srgb,var(--a) 7%,#fff);border:1.5px dashed color-mix(in srgb,var(--a) 42%,#fff)}
[data-style="pro"] .guarantee .seal{width:72px;height:72px;border-radius:50%;flex:none;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--a),color-mix(in srgb,var(--a) 65%,#fff));font-size:31px}
[data-style="pro"] footer{background:#0f172a;color:#94a3b8}
[data-style="pro"] footer .fbrand b{color:#fff}
</style>
</head>

<body>
<header class="hdr">
  <div class="wrap">
    <a class="brand" href="#top">
      <span class="logo">${brandIni}</span>
      <div><b>${esc(p.brand || p.productName)}</b><div class="tag">${esc(p.tagline || "")}</div></div>
    </a>
    ${style === "urgencia" ? "" : `<div class="top-sells">
      <span>${esFisico ? "🚚" : "⚡"} ${esc(envioIncluido ? "Envío incluido" : "Envío nacional")}</span>
      <span>${esFisico ? "💵" : "🔒"} ${esFisico ? "Paga al recibir" : "Compra segura"}</span>
    </div>`}
  </div>
</header>
${
  style === "urgencia"
    ? `<div class="announce">${p.announce ? `<span class="chip-rojo">${esc(p.announce)}</span> ` : ""}${
        esFisico ? ["PAGO CONTRAENTREGA", envioIncluido ? "ENVÍO INCLUIDO" : "", ahorroPct ? `${ahorroPct}% MENOS QUE ANTES` : ""].filter(Boolean).join(" + ") : esc(envioLargo)
      }</div>`
    : p.announce
      ? `<div class="announce">${esc(p.announce)}</div>`
      : ""
}
<section class="hero">
  <div class="wrap">
    <div class="hero-grid">

      <div class="hero-copy">
        ${p.heroBadge || ahorro ? `<span class="kicker">${esc(p.heroBadge || "Oferta")}</span>` : ""}
        <h1>${esc(p.headline || p.productName)}</h1>
        <p class="sub">${esc(p.subheadline || p.tagline)}</p>
      </div>

      <div class="hero-mid">
        <div class="hero-media">
          <div class="ph${p.video ? " video-on" : ""}">
            ${style !== "urgencia" && p.heroBadge ? `<span class="flot2">${esc(p.heroBadge)}</span>` : ""}
            <div class="main" id="main-img" style="background-image:url('${esc(p.image)}')"></div>
            <button class="play" id="play-btn" aria-label="Reproducir video">
              <svg width="58" height="58" viewBox="0 0 70 70"><circle cx="35" cy="35" r="34" fill="#fff"/><path d="M28 22l22 13-22 13z" fill="#12271d"/></svg>
            </button>
          </div>
          ${galeria.length ? `<div class="thumbs" id="thumbs">${thumbs}</div>` : ""}
        </div>
        <ul class="hero-bullets">${bullets}</ul>
      </div>

      <div class="hero-form">
        <div class="hero-buy">
          <div class="pricebox">
            ${ahorro ? `<div class="antes">Antes: <del>$${cop(antes)}</del></div>` : ""}
            <div class="row">
              <div class="hoy"><span>Hoy:</span><strong>$${cop(precio)}</strong></div>
              ${ahorro ? `<div class="ahorra">Ahorras<b>$${cop(ahorro)}</b></div>` : ""}
            </div>
            <span class="solo">${esc(envioLargo)}</span>
          </div>

          ${
            ofertaHasta && p.timer !== false
              ? `<div class="timer" role="timer" aria-label="La oferta termina en">
            <span class="lb">⏳ La oferta termina en</span>
            <span class="t">
              <b id="th">00</b><i>:</i><b id="tm">00</b><i>:</i><b id="ts">00</b>
            </span>
          </div>`
              : ""
          }


          <div class="order" id="order-box">
            <div class="oh">
              <h2>🛍️ ¡Haz tu pedido ahora!</h2>
              <p>${esFisico ? "Pagas solo al recibir en casa" : esc(envioLargo) + " · Pago 100% seguro"}</p>
            </div>
            <div class="ob">
${formHtml}
            </div>
          </div>
          <p class="note">${esFisico ? "Pagas al recibir · Sin tarjeta ni adelanto" : "Pago 100% seguro · Acceso inmediato"}</p>
        </div>
      </div>

    </div>

    <div class="trust4">
      ${trustTop.map(([i, l1, l2]) => `<div><span>${i}</span>${l1}<i>${l2}</i></div>`).join("")}
    </div>
  </div>
</section>
</main>

${seccionesHtml}

${
  style === "pro" && (p.painPoints || []).length
    ? `<section class="pains"><div class="wrap"><span class="kicker" style="color:var(--bad)">¿Te suena familiar?</span><ul>${dolores}</ul></div></section>`
    : ""
}

${
  p.riskFree
    ? `<section style="padding-top:6px"><div class="wrap">
    <div class="${style === "pro" ? "guarantee" : "risk"}"${style === "pro" ? "" : ' style="max-width:640px"'}>
      ${style === "pro" ? `<span class="seal">🛡️</span><div><h3>${esc(p.riskFree.title)}</h3><p>${esc(p.riskFree.text)}</p></div>` : `<span class="guar">🛡️</span><h2>${esc(p.riskFree.title)}</h2><p>${esc(p.riskFree.text)}</p>`}
    </div>
  </div></section>`
    : ""
}

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
    var fin=${JSON.stringify(ofertaHasta)};
    var tick=function(){
      var H=document.getElementById('th'),M=document.getElementById('tm'),S=document.getElementById('ts');
      if(!H||!fin)return;
      var s=Math.max(0,Math.floor((fin-Date.now())/1000));
      // Terminada la oferta, el contador se va: no se queda en 00:00:00 ni vuelve a empezar.
      if(s===0){var box=H.closest('.timer');if(box)box.remove();return;}
      var h=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60;
      H.textContent=String(h).padStart(2,'0');
      M.textContent=String(m).padStart(2,'0');
      S.textContent=String(ss).padStart(2,'0');
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

  // ── Bullets de una sola línea pegados por comas (measured 03-10: la IA
  // escribió "Reduce la tensión...,Mejora la circulación...,Alivia..." en UN
  // renglón y la hero mostró UNA viñeta kilométrica). Se parten en items.
  const partirBulletsPegados = (lista: string[]): string[] =>
    lista.flatMap((b) => {
      const t = String(b).trim();
      if (t.length <= 60 || !t.includes(",")) return [t];
      const partes = t.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
      // si alguna "parte" es demasiado corta (<8), era una coma normal: no partir
      return partes.length >= 2 && partes.every((x) => x.length >= 8) ? partes : [t];
    });

  const bullets = partirBulletsPegados(lineas(beneficios?.body));
  const baseBullets: string[] = bullets.length
    ? bullets
    : Array.isArray(producto?.features)
      ? partirBulletsPegados(producto.features.map((f: unknown) => String(f)))
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
  // ── La hero es la PUERTA DE ENTRADA (pedido del dueño, 03-10): el texto
  // antes de la foto debe ser CORTO. Cuando el Studio no escribió subtitle,
  // la descripción cruda sirve de FONDO de copy pero NO como headline: se
  // recorta a la primera oración y a un tope duro, y el resto del texto vive
  // en la ficha (beneficios/FAQ), no tapando la imagen.
  //
  // 2ª pasada (03-10, masajeador): la descripción de Dropi trae la FICHA
  // TÉCNICA pegada ("• Tipo: ...\n• Área de masaje: ..."). Eso NO es copy:
  // se recorta en el primer bullet técnico y se deja la frase vendedora.
  const primeraOracion = (texto: string): string => {
    const limpia = texto.replace(/\s+/g, " ").trim();
    const corte = limpia.match(/^.{10,}?[.!?](?=\s|$)/);
    return (corte ? corte[0] : limpia).trim();
  };
  /** Corta la ficha técnica: bullet "•/·/-", "Tipo:", "Caracteristica:", etc.
   *  y frases en Mayúscula-Inicial tras coma que delatan una lista pegada. */
  const sinFichaTecnica = (texto: string): string => {
    let t = String(texto || "");
    // el primer salto de línea con bullet mata todo lo que sigue
    const mBullets = t.match(/^(.*?)(?=\n\s*[•·▪‣-]\s|\n\s*(?:Tipo|Caracter|Área|Fuente|Talla|Color|Material|Marca|Modelo|Contenido|Incluye|Medida|Peso|Capacidad|Voltaje|Garant)\w*\s*:)/s);
    if (mBullets) t = mBullets[1];
    // bullets en la misma línea también cortan
    const lBullets = t.match(/^(.*?)(?=[•·▪‣]\s*\w)/s);
    if (lBullets && lBullets[1].trim().length >= 20) t = lBullets[1];
    return t.trim();
  };
  const fraseDeHero = (texto: string, tope: number): string => {
    const oracion = primeraOracion(sinFichaTecnica(texto));
    if (oracion.length <= tope) return oracion;
    const palabras = oracion.slice(0, tope).split(" ");
    palabras.pop();
    return palabras.join(" ") + "…";
  };
  const subtituloRaw = String(hero?.subtitle || "").trim() || (descripcion ? fraseDeHero(descripcion, 110) : "");
  // ── El sub aporta o sobra (03-10): si repite lo que el h1 ya dice (el nombre
  // del producto) no suma nada. Solo sale si la primera oración tiene palabras
  // nuevas frente al nombre; si no, hero SIN subtexto (como el modelo
  // CleanHome: titular + foto, cero relleno).
  const nombreProductoStr = String(producto?.name || "");
  const sinRepetirNombre = (texto: string, nombreProducto: string): string => {
    const oraciones = String(texto || "").replace(/([.!?])\s+/g, "$1|").split("|").map((x) => x.trim()).filter(Boolean);
    const nombreClaves = nombreProducto.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const repite = (o: string): boolean => {
      const ol = o.toLowerCase();
      const hits = nombreClaves.filter((w) => ol.includes(w)).length;
      return nombreClaves.length >= 2 && hits >= Math.min(2, nombreClaves.length);
    };
    const otras = oraciones.filter((o) => !repite(o));
    return (otras[0] || "").trim();
  };
  const candidata = sinRepetirNombre(subtituloRaw, nombreProductoStr) || subtituloRaw;
  // "Masajeador de Hombros y Cuello, Masajeador..." sigue diciendo masajeador/
  // cuello: si comparte >=2 palabras clave y no hay otra oración, se va.
  const clavesNombre = nombreProductoStr.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const clavesCandidata = candidata.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const solapadas = clavesCandidata.filter((w) => clavesNombre.includes(w)).length;
  const subtitulo = candidata.length >= 20 && (clavesNombre.length < 2 || solapadas < 2) ? candidata : "";
  const modelo = a.modelo || "digital";
  const kind = modelo === "fisico" ? undefined : modelo === "servicio" || modelo === "cotizacion" ? "service" : "digital";

  const con = Array.isArray(ex.comparison?.conProducto) ? ex.comparison.conProducto.map(String).filter(Boolean) : [];
  const sin = Array.isArray(ex.comparison?.sinProducto) ? ex.comparison.sinProducto.map(String).filter(Boolean) : [];

  const garantia = a.producto ? garantiaDelProducto(a.producto) : null;

  return {
    accent: typeof design.primary === "string" && /^#[0-9a-f]{3,8}$/i.test(design.primary) ? design.primary : undefined,
    // style null/vacío ("que la IA elija") o invílido → heurística de precio/categoría.
    style: String(design.style || "").trim()
      ? String(design.style)
      : elegirEstilo(producto, a.precioAntes || undefined),
    productName: String(producto?.name || row.name || "Producto"),
    // El tagline del header (la línea bajo la marca) también es corto: es la
    // misma puerta de entrada. Tope 60 chars.
    tagline: fraseDeHero(subtitulo, 60),
    brand: negocio.nombre || producto?.brand || "",
    slug: String(row.slug || ""),
    price: producto?.price ?? 0,
    oldPrice: Number(a.precioAntes) > 0 ? Number(a.precioAntes) : undefined,
    // El DESCUENTO que la IA "escribiera" en estiloExtras NO se muestra: una
    // cifra sin un precio anterior real es inventada. El ahorro/la rebaja
    // que salen ací son los calculables con los DOS precios reales.
    // El envío: el REAL (resuelto arriba con las condiciones del negocio);
    // sin condiciones, el neutro.
    envio: a.envioReal?.larga,
    envioCorto: a.envioReal?.corta,
    garantia: garantia ? String(garantia) : undefined,
    timer: ex.timer !== false,
    ofertaHasta: typeof ex.ofertaHasta === "string" ? ex.ofertaHasta : null,
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
    sections: secciones as DatosEstilo["sections"],
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
  // ══ Garantía DROPi (medido 03-10 contra la API real, producto 2248412):
  // la respuesta de products/v2 NO TRAE un campo de garantía (ni warranty ni
  // garantia; dropi_app_description=null). Lo único que escribe el proveedor
  // es copy en la description ("Seguridad garantizada"), no una política de
  // devolución. Por eso NO se hace fetch aquí: la garantía que usa la landing
  // es la del DUEñO (metadata.garantia vía garantiaDelProducto) y el default
  // del renderer es el dispositivo de diseño validado. Un fetch por render
  // solo buscaba un campo que no existe (latencia extra para nada).

  // ══ El envío con las CONDICIONES REALES (review 04-10) ══════════
  // Antes el código decía "Envío gratis a todo el país" A MANO: si el
  // negocio no declara incluido, era una promesa inventada en la pígina.
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
    fotos = [];
  }
  // La foto principal que cargó el dueño nunca se pierde: si la lista quedó
  // vacía (filtro, error de red), va la de la ficha.
  if (!fotos.length && producto?.imageUrl) fotos = [String(producto.imageUrl)];

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

  // …
  const p = estiloDesdeFila({
    row: a.row,
    producto,
    negocio,
    fotos,
    precioAntes,
    modelo,
    video,
    // El envío REAL del negocio, resuelto una vez ací arriba:
    ...(envioReal ? { envioReal } : {}),
  });

  // ── El color que COMBINA con el producto (decisión del dueño 03-10:
  // "los colores de fondo son lo de menos... que los colores combinen con el
  // producto sin saturar"). Si el admin/la IA no fijó un color propio, el
  // acento sale del producto: su foto (color saturado dominante vía ffmpeg)
  // y su público (paletaDelPublico); si es neutro, el del rubro. Nunca
  // invertimos: el color elegido a mano manda.
  const primaryPedido = (a.row?.design as any)?.primary;
  const primaryUtil = typeof primaryPedido === "string" && /^#[0-9a-f]{6}$/i.test(primaryPedido) && !/^#(111827|1f2937|374151|0f172a)$/i.test(primaryPedido);
  if (!primaryUtil) {
    try {
      const { colorDelProducto } = await import("./color-del-producto");
      const c = await colorDelProducto({
        fotoUrl: fotos[0] || producto?.imageUrl || null,
        categoria: producto?.category || null,
        marcaPrimaria: null,
        nombre: producto?.name || null,
        descripcion: producto?.description || null,
        caracteristicas: producto?.features,
        tipo: producto?.kind || null,
      });
      if (c.acento) p.accent = c.acento;
    } catch { /* sin color: queda el default del producto (p.accent) */ }
  }

  let html = renderizarEstilo(p, { host: a.host || "", accion, pago: a.pago });
  if (modelo === "fisico") html = formularioConOpciones(html, producto);
  html = conIconosSeguros(html);
  return html;
}
