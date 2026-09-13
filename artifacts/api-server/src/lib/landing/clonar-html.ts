/**
 * Clonar una landing REAL: HTML + CSS de cualquier URL.
 *
 * Pedido del dueño (13-09-2026): "yo copio la URL de una landing cualquiera
 * y la clona: el HTML y el CSS".
 *
 * Qué hace `clonarHtmlDeUrl`:
 *   1. Descarga la página y sus hojas de estilo (misma web u otras), y las
 *      deja EMBEBIDAS en el documento: la copia queda autónoma.
 *   2. Pasa a absolutas todas las URLs relativas (imágenes, fuentes, enlaces)
 *      para que la página se vea igual servida desde nuestro dominio.
 *   3. Quita scripts, píxeles y formularios ajenos: nada de la copia le manda
 *      datos al sitio original ni ejecuta código de terceros.
 *
 * Qué hace `adaptarHtmlAlProducto` (el paso que la vuelve TUYA):
 *   - Reescribe los textos visibles para el producto del negocio (modelo de
 *     IA, con precio y datos reales, sin inventar), manteniendo la estructura.
 *   - Reemplaza las imágenes por las fotos reales del producto.
 *   - Apunta todos los botones/enlaces al cierre del negocio (WhatsApp o
 *     página del producto).
 *
 * ⚠️ Una copia SIN adaptar tiene textos, fotos y marca de otra empresa. Se
 * guarda como borrador y la pantalla avisa; publicarla así es problema del
 * dueño, no del sistema, pero el camino recomendado es adaptar primero.
 */
import { and, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";

const UA = "Mozilla/5.0 (compatible; VentasProBot/1.0; +https://ventasproia.com)";
const TOPE_HTML = 2_000_000;
const TOPE_CSS = 600_000;

function urlPermitida(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("La URL no es válida."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Solo http(s).");
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[::1\])/.test(u.hostname)) throw new Error("URL no permitida.");
  return u;
}

async function bajar(url: string, ms: number, accept = "*/*"): Promise<{ ok: boolean; texto: string; tipo: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: accept }, redirect: "follow" });
    const tipo = String(r.headers.get("content-type") || "");
    return { ok: r.ok, texto: r.ok ? await r.text() : "", tipo };
  } catch {
    return { ok: false, texto: "", tipo: "" };
  } finally { clearTimeout(t); }
}

function absoluta(valor: string, base: URL): string {
  const v = String(valor || "").trim();
  if (!v || /^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(v)) return v;
  try { return new URL(v, base).toString(); } catch { return v; }
}

/** url(...) dentro de CSS → absolutas, respecto a la hoja que las trae. */
function cssConUrlsAbsolutas(css: string, base: URL): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_m, q, u) => `url(${q}${absoluta(u, base)}${q})`);
}

export interface ResultadoClonHtml {
  html: string;
  titulo: string;
  hojas: number;
  imagenes: number;
  advertencias: string[];
}

export async function clonarHtmlDeUrl(rawUrl: string): Promise<ResultadoClonHtml> {
  const base = urlPermitida(rawUrl);
  const advertencias: string[] = [];
  const pagina = await bajar(base.toString(), 20_000, "text/html");
  if (!pagina.ok) throw new Error("No pude descargar la página (¿bloquea robots o está caída?).");
  let html = pagina.texto.slice(0, TOPE_HTML);

  // <base href> del original manda para resolver relativas.
  const baseHref = html.match(/<base[^>]+href=["']([^"']+)["']/i)?.[1];
  const resolver = baseHref ? (() => { try { return new URL(baseHref, base); } catch { return base; } })() : base;

  // 1) Hojas de estilo externas → embebidas.
  let hojas = 0;
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  for (const tag of links) {
    if (!/rel=["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const abs = absoluta(href, resolver);
    const hoja = await bajar(abs, 10_000, "text/css");
    if (hoja.ok && hoja.texto) {
      let cssBase: URL; try { cssBase = new URL(abs); } catch { cssBase = resolver; }
      const css = cssConUrlsAbsolutas(hoja.texto.slice(0, TOPE_CSS), cssBase).replace(/<\/style/gi, "<\\/style");
      html = html.replace(tag, `<style data-clonada="${abs.replace(/"/g, "")}">\n${css}\n</style>`);
      hojas++;
    } else {
      advertencias.push(`No pude descargar la hoja de estilo ${abs}.`);
      html = html.replace(tag, `<link rel="stylesheet" href="${abs}">`);
    }
  }
  // CSS embebido del original: sus url() también a absolutas.
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (m, attrs, css) => /data-clonada/.test(attrs) ? m : `<style${attrs}>${cssConUrlsAbsolutas(css, resolver)}</style>`);

  // 2) URLs relativas → absolutas (imágenes, srcset, enlaces, fuentes, videos, estilos inline).
  let imagenes = 0;
  html = html.replace(/<(img|source|video|audio|iframe)\b([^>]*)>/gi, (m, tag, attrs) => {
    let a = attrs
      .replace(/\b(src|poster)=["']([^"']+)["']/gi, (_x: string, k: string, v: string) => `${k}="${absoluta(v, resolver)}"`)
      .replace(/\bdata-(src|lazy-src|original)=["']([^"']+)["']/gi, (_x: string, k: string, v: string) => `src="${absoluta(v, resolver)}"`)
      .replace(/\bsrcset=["']([^"']+)["']/gi, (_x: string, v: string) => `srcset="${v.split(",").map((p: string) => { const [u, d] = p.trim().split(/\s+/); return [absoluta(u, resolver), d].filter(Boolean).join(" "); }).join(", ")}"`);
    if (tag.toLowerCase() === "img") imagenes++;
    if (tag.toLowerCase() === "iframe") return ""; // nada embebido de terceros
    return `<${tag}${a}>`;
  });
  html = html.replace(/<a\b([^>]*)href=["']([^"']+)["']/gi, (_m, attrs, v) => `<a${attrs}href="${absoluta(v, resolver)}"`);
  html = html.replace(/style=["']([^"']*url\([^"']*)["']/gi, (_m, css) => `style="${cssConUrlsAbsolutas(css, resolver).replace(/"/g, "'")}"`);

  // 3) Fuera scripts, píxeles, formularios y <base>.
  html = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/\son[a-z]+=["'][^"']*["']/gi, "")
    .replace(/<form\b([^>]*)>/gi, (_m, attrs) => `<form${String(attrs).replace(/\baction=["'][^"']*["']/i, "")} action="#" onsubmit="return false">`)
    .replace(/<meta[^>]+http-equiv=["']refresh["'][^>]*>/gi, "");

  const titulo = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || base.hostname).replace(/\s+/g, " ").trim().slice(0, 120);
  // Marca de origen, solo como comentario.
  html = html.replace(/<html/i, `<!-- Copia de ${base.toString()} · VentasPro · ${new Date().toISOString()} -->\n<html`);
  return { html, titulo, hojas, imagenes, advertencias };
}

/* ────────────────────────────────────────────────────────────────────────────
 * ADAPTAR AL PRODUCTO
 * ──────────────────────────────────────────────────────────────────────────── */

function sinEtiquetas(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Textos visibles que vale la pena reescribir: nodos de texto de 3+ palabras o encabezados/botones. */
function textosVisibles(html: string): string[] {
  const cuerpo = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const m of cuerpo.matchAll(/>([^<>{}]{3,600})</g)) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (!t || /^[\s\d\W]*$/.test(t)) continue;
    if (t.split(" ").length < 2 && t.length < 4) continue;
    if (vistos.has(t)) continue;
    vistos.add(t);
    out.push(t);
    if (out.length >= 600) break;
  }
  return out;
}

export async function adaptarHtmlAlProducto(opts: {
  tenantId: number;
  html: string;
  producto: any;
  negocio: { nombre?: string | null; whatsapp?: string | null };
  destino: string; // a dónde apuntan los botones (WhatsApp o /p/:id)
}): Promise<{ html: string; reemplazos: number; imagenes: number; advertencias: string[] }> {
  const { callMarketingAI } = await import("../marketing-team/ai");
  const advertencias: string[] = [];
  let html = opts.html;
  const p = opts.producto;

  // 1) Textos: el modelo devuelve un mapa viejo→nuevo, se sustituye tal cual.
  //    En tandas de 150: la primera prueba (landingfolio, 13-09) traía 400+
  //    textos y solo se reescribieron los primeros 160.
  const textos = textosVisibles(html);
  let reemplazos = 0;
  const precio = p?.price != null ? `${p.currency || "COP"} $${Number(p.price).toLocaleString("es-CO")}` : "sin precio cargado";
  const mapa: Record<string, string> = {};
  for (let i = 0; i < textos.length && i < 600; i += 150) {
    const tanda = textos.slice(i, i + 150);
    const resultado = await callMarketingAI<any>({
      tenantId: opts.tenantId,
      json: true,
      maxTokens: 6000,
      systemPrompt:
        "Sos redactor de páginas de venta. Recibís los textos visibles de una landing AJENA y los datos de un producto propio. " +
        "Devolvé SOLO JSON {\"mapa\": {\"texto viejo\": \"texto nuevo\", ...}} reescribiendo cada texto para el producto propio, " +
        "con el MISMO largo aproximado y la misma función (título sigue siendo título, botón sigue siendo botón), en español de Colombia. " +
        "Reglas: no inventes cifras, testimonios, garantías, descuentos ni plazos que no estén en los datos; el precio es exactamente el dado; " +
        "quitá cualquier nombre de marca o empresa ajena y usá el nombre del negocio propio; los botones deben invitar a pedir/comprar/escribir por WhatsApp. " +
        "Si un texto es puro relleno legal o de navegación ajena (menús, políticas, cookies, términos, copyright, fechas, contadores), reemplazalo por una cadena vacía.",
      userPrompt: JSON.stringify({
        negocio: opts.negocio?.nombre || "el negocio",
        producto: { nombre: p?.name, descripcion: String(p?.description || "").slice(0, 1500), caracteristicas: p?.features || [], precio },
        textos: tanda,
      }),
    });
    const parcial = resultado?.mapa && typeof resultado.mapa === "object" ? resultado.mapa : null;
    if (!parcial) { advertencias.push(`El modelo no devolvió textos para la tanda ${i / 150 + 1}.`); continue; }
    Object.assign(mapa, parcial);
  }
  // Del más largo al más corto, para que un texto corto no pise a uno largo que lo contiene.
  for (const viejo of Object.keys(mapa).sort((a, b) => b.length - a.length)) {
    const nuevo = String(mapa[viejo] ?? "");
    if (!viejo || nuevo === viejo) continue;
    const esc = viejo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const re = new RegExp(`>(\\s*)${esc}(\\s*)<`, "g");
    const antes = html;
    html = html.replace(re, (_m, a, b) => `>${a}${nuevo.replace(/</g, "&lt;")}${b}<`);
    if (html !== antes) reemplazos++;
  }
  if (textos.length && !Object.keys(mapa).length) advertencias.push("El modelo no devolvió textos nuevos: la copia conserva los textos originales.");

  // 1b) Marca ajena que haya quedado (título, pie, menús): se cambia por el negocio.
  //     La marca sale del <title> original y del dominio, que es lo que el
  //     sitio repite en todos lados.
  const marcaNegocio = String(opts.negocio?.nombre || "").trim();
  if (marcaNegocio) {
    const tituloOriginal = (html.match(/<!-- Copia de (https?:\/\/[^\s]+)/)?.[1] || "");
    let dominio = "";
    try { dominio = new URL(tituloOriginal).hostname.replace(/^www\./, "").split(".")[0]; } catch { dominio = ""; }
    const candidatas = [dominio, dominio.charAt(0).toUpperCase() + dominio.slice(1)].filter((x) => x && x.length >= 4);
    for (const marca of candidatas) {
      const re = new RegExp(`(?<![a-z0-9/._-])${marca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9._-])`, "g");
      html = html.replace(/>([^<]*)</g, (m, t) => (re.test(t) ? `>${t.replace(re, marcaNegocio)}<` : m));
    }
    // Título de la página: el producto y el negocio.
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${String(p?.name || "").replace(/</g, "")} | ${marcaNegocio.replace(/</g, "")}</title>`);
  }
  // 1c) Bloques legales ajenos: pie con políticas/cookies/copyright → fuera.
  html = html.replace(/<(footer)\b[\s\S]*?<\/\1>/gi, (m) => (/cookie|privacy|privacidad|terms|t[eé]rminos|all rights reserved|derechos reservados|licens/i.test(m) ? "" : m));

  // 2) Imágenes: las del producto, rotando. Si no hay, se dejan las originales y se avisa.
  const fotos: string[] = [];
  if (p?.imageUrl) fotos.push(String(p.imageUrl));
  const extra = (p?.metadata as any)?.woocommerce?.imageUrls;
  if (Array.isArray(extra)) for (const u of extra) if (typeof u === "string" && u && !fotos.includes(u)) fotos.push(u);
  let imagenes = 0;
  if (fotos.length) {
    let i = 0;
    html = html.replace(/<img\b([^>]*)>/gi, (_m, attrs) => {
      const foto = fotos[i++ % fotos.length];
      const a = String(attrs)
        .replace(/\bsrc=["'][^"']*["']/i, `src="${foto}"`)
        .replace(/\bsrcset=["'][^"']*["']/i, "")
        .replace(/\balt=["'][^"']*["']/i, `alt="${String(p?.name || "").replace(/"/g, "")}"`);
      imagenes++;
      return `<img${/\bsrc=/.test(a) ? a : ` src="${foto}"${a}`}>`;
    });
    // Fondos con imagen en CSS inline → primera foto.
    html = html.replace(/(style=["'][^"']*background(?:-image)?\s*:\s*url\()([^)]+)(\))/gi, (_m, a, _u, c) => `${a}'${fotos[0]}'${c}`);
  } else {
    advertencias.push("El producto no tiene fotos cargadas: la copia conserva las imágenes originales (no son publicables).");
  }

  // 3) Botones y enlaces → el cierre del negocio.
  html = html.replace(/<a\b([^>]*)href=["'][^"']*["']/gi, (_m, attrs) => `<a${attrs}href="${opts.destino}"`);
  html = html.replace(/<form\b([^>]*)>/gi, `<form$1 action="${opts.destino}" method="get">`);

  return { html, reemplazos, imagenes, advertencias };
}

/* ────────────────────────────────────────────────────────────────────────────
 * PERSISTENCIA: una landing "html" guarda la copia en `source.htmlCrudo`.
 * ──────────────────────────────────────────────────────────────────────────── */
function slugDe(nombre: string): string {
  const base = String(nombre || "landing").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "landing";
  return `${base}-${Date.now().toString(36)}`;
}

export async function importarLandingDesdeUrl(opts: { tenantId: number; url: string; productId?: number | null; nombre?: string | null }) {
  const clon = await clonarHtmlDeUrl(opts.url);
  const productId = opts.productId != null && Number.isFinite(Number(opts.productId)) ? Number(opts.productId) : null;
  const nombre = String(opts.nombre || `Copia · ${clon.titulo}`).slice(0, 200);
  const [creada] = await db.insert(landingPages).values({
    tenantId: opts.tenantId, productId, name: nombre, slug: slugDe(nombre),
    strategy: { origen: "html" }, sections: [], design: { tipo: "html" },
    source: { tipo: "html", url: opts.url, htmlCrudo: clon.html, hojas: clon.hojas, imagenes: clon.imagenes, adaptada: false },
    status: "draft", publishedUrl: null,
  } as any).returning();
  return { landing: creada, advertencias: clon.advertencias, hojas: clon.hojas, imagenes: clon.imagenes };
}

export async function adaptarLandingHtml(opts: { tenantId: number; landingId: number; productId?: number | null }) {
  const [row] = await db.select().from(landingPages).where(and(eq(landingPages.id, opts.landingId), eq(landingPages.tenantId, opts.tenantId))).limit(1);
  if (!row) throw new Error(`No encontré la landing ${opts.landingId}.`);
  const src: any = row.source || {};
  if (src.tipo !== "html" || !src.htmlCrudo) throw new Error("Esa landing no es una copia HTML: adaptar solo aplica a copias de una URL.");
  const productId = opts.productId ?? row.productId;
  if (!productId) throw new Error("Falta el producto al que adaptarla (productId).");
  const [prod] = await db.select().from(products).where(and(eq(products.id, Number(productId)), eq(products.tenantId, opts.tenantId))).limit(1);
  if (!prod) throw new Error(`No encontré el producto ${productId}.`);

  const { negocioParaRender } = await import("./negocio-para-render");
  const negocio = await negocioParaRender(opts.tenantId, prod as any);
  const { getAppUrl } = await import("../app-url");
  const destino = negocio?.whatsapp
    ? `https://wa.me/${String(negocio.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, me interesa ${prod.name}`)}`
    : `${getAppUrl()}/p/${prod.id}`;

  const base = src.htmlOriginal || src.htmlCrudo; // siempre se adapta desde el original
  const r = await adaptarHtmlAlProducto({ tenantId: opts.tenantId, html: base, producto: prod, negocio: { nombre: negocio?.nombre, whatsapp: negocio?.whatsapp }, destino });
  await db.update(landingPages).set({
    productId: prod.id,
    source: { ...src, htmlOriginal: base, htmlCrudo: r.html, adaptada: true, adaptadaA: prod.id, reemplazos: r.reemplazos },
    updatedAt: new Date(),
  } as any).where(eq(landingPages.id, row.id));
  return { id: row.id, reemplazos: r.reemplazos, imagenes: r.imagenes, advertencias: r.advertencias };
}

/** El HTML a servir si la landing es una copia. null si es de secciones. */
export function htmlDeCopia(row: any): string | null {
  const src: any = row?.source || {};
  return src.tipo === "html" && typeof src.htmlCrudo === "string" && src.htmlCrudo ? src.htmlCrudo : null;
}
