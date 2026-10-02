/**
 * Búsqueda web para completar fichas de producto.
 *
 * Pedido del dueño (19-09-2026): "si la información está incompleta, que la
 * busque de otras tiendas y la traiga acá para organizar el producto".
 * Se usa DuckDuckGo (versión lite, HTML plano, sin clave) y se leen las
 * primeras páginas de tiendas (Mercado Libre, Falabella, Éxito, Amazon…).
 *
 * Solo TEXTO: las fotos de otras tiendas no son publicables (regla del
 * proyecto desde el 12-09). Lo que se trae son datos (material, medidas, qué
 * incluye, uso, precio visible de referencia), y el curador los marca como
 * complementados.
 *
 * Mejora profesional (2026-09-28): el lector anterior devolvía "" silencioso
 * ante cualquier fallo (SPA con JS, binario, timeout, HTML gigante) y el
 * curador se quedaba sin fuentes sin saber por qué. Ahora:
 * - bloquea hosts privados (SSRF) y limita tamaño/tipo de contenido;
 * - extrae JSON-LD (Product/Offer) y meta og:price como respaldo;
 * - detecta SPA vacía y rescata __NEXT_DATA__/JSON-LD antes de descartar;
 * - registra el motivo de cada descarte en el log.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { logger } from "./logger";

export interface FuenteWeb {
  url: string;
  titulo: string;
  texto: string;
  /** Precio visible de referencia (texto crudo, ej "$49.900"). Nunca se publica como precio propio. */
  precio?: string;
  disponibilidad?: string;
  esSpa?: boolean;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_HTML = 1_500_000;

function esPrivada(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "localhost") return true;
  if (v.startsWith("127.") || v.startsWith("10.") || v.startsWith("192.168.") || v.startsWith("169.254.")) return true;
  if (v.startsWith("172.")) { const n = Number(v.split(".")[1]); if (n >= 16 && n <= 31) return true; }
  if (v.startsWith("fc") || v.startsWith("fd")) return true;
  return false;
}

async function hostBloqueado(hostname: string): Promise<boolean> {
  try {
    if (isIP(hostname)) return esPrivada(hostname);
    const addrs = await lookup(hostname, { all: true });
    return addrs.some((a) => esPrivada(a.address));
  } catch {
    return true;
  }
}

function textoVisible(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Datos estructurados de respaldo: JSON-LD Product + og tags + precio visible. */
function extraerEstructurados(html: string): { titulo: string; precio: string; disponibilidad: string; extra: string } {
  let titulo = (html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']{1,200})/i)?.[1]
    || html.match(/<title[^>]*>([^<]{1,200})/i)?.[1] || "").trim();
  let precio = (html.match(/<meta[^>]+property=["'](?:og:price:amount|product:price:amount)["'][^>]*content=["']([^"']{1,40})/i)?.[1] || "").trim();
  let disponibilidad = "";
  const partes: string[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const raw = m[1].trim().slice(0, 60_000);
      const j = JSON.parse(raw);
      const nodos = Array.isArray(j) ? j : [j];
      for (const n of nodos) {
        const tipo = String(n?.["@type"] || "");
        if (!/product/i.test(tipo)) continue;
        if (!titulo && n?.name) titulo = String(n.name).slice(0, 200);
        const desc = String(n?.description || "").slice(0, 2000);
        if (desc) partes.push(desc);
        const offers = Array.isArray(n?.offers) ? n.offers[0] : n?.offers;
        if (offers) {
          if (!precio && offers.price) precio = String(offers.price).slice(0, 40);
          if (offers.availability) disponibilidad = String(offers.availability).split("/").pop()!.slice(0, 60);
        }
      }
    } catch { /* un bloque roto no tumba los demás */ }
  }
  // __NEXT_DATA__ / __NUXT__ como último recurso en SPAs.
  if (!partes.length) {
    const next = html.match(/<script[^>]+id=["']__NEXT_DATA__["'[^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (next) {
      const t = textoVisible(next.replace(/<[^>]+>/g, " ")).slice(0, 3000);
      if (t.length > 200) partes.push(t);
    }
  }
  return { titulo, precio, disponibilidad, extra: partes.join("\n").slice(0, 4000) };
}

/** Respaldo cuando DDG bloquea (202/anomaly desde datacenters): Bing HTML, sin clave. */
async function buscarEnBing(consulta: string, max = 6): Promise<Array<{ url: string; titulo: string }>> {
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(consulta)}&setlang=es`, {
      headers: { "User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9", Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const out: Array<{ url: string; titulo: string }> = [];
    for (const m of html.matchAll(/<li[^>]+class="b_algo"[^>]*>[\s\S]*?<h2>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = m[1];
      if (!/^https?:\/\//i.test(url) || /bing\.com|microsoft\.com/i.test(url)) continue;
      if (out.some((x) => x.url === url)) continue;
      out.push({ url, titulo: textoVisible(m[2]).slice(0, 120) });
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Resultados (url + título) de DuckDuckGo lite, con parsers de respaldo. */
export async function buscarEnDuckDuckGo(consulta: string, max = 6): Promise<Array<{ url: string; titulo: string }>> {
  try {
    const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(consulta)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      logger.warn({ consulta, status: res.status }, "[Web] DDG respondió error");
      return [];
    }
    const html = await res.text();
    const out: Array<{ url: string; titulo: string }> = [];
    const patrones = [
      /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      /<a[^>]+href="([^"]+)"[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
    ];
    for (const re of patrones) {
      for (const m of html.matchAll(re)) {
        let url = m[1];
        const r = url.match(/uddg=([^&]+)/);
        if (r) { try { url = decodeURIComponent(r[1]); } catch { /* deja cruda */ } }
        if (!/^https?:\/\//i.test(url)) continue;
        if (url.includes("duckduckgo.com")) continue;
        if (out.some((x) => x.url === url)) continue;
        out.push({ url, titulo: textoVisible(m[2]).slice(0, 120) });
        if (out.length >= max) return out;
      }
      if (out.length) break;
    }
    if (!out.length) logger.warn({ consulta }, "[Web] DDG sin resultados parseables (bloqueo anti-bot o cambió el HTML?)");
    if (!out.length) {
      // Desde servidores (IP de datacenter) DDG responde 202 con página
      // "anomaly": no es un bug del parser, es bloqueo. Se intenta Bing.
      const alt = await buscarEnBing(consulta, max);
      if (alt.length) logger.info({ consulta, n: alt.length }, "[Web] DDG bloqueado, se usó Bing");
      else logger.warn({ consulta }, "[Web] DDG y Bing bloqueados: sin fuentes (el curador trabaja solo con Dropi)");
      return alt;
    }
    return out;
  } catch (e: any) {
    logger.warn({ consulta, err: e?.message }, "[Web] búsqueda falló");
    return [];
  }
}

/** Texto visible de una página, recortado a lo útil. Nunca revienta: devuelve "" con motivo en log. */
export async function leerPagina(url: string, maxChars = 6000): Promise<string> {
  const fuente = await leerPaginaEstructurada(url, maxChars);
  return fuente.texto;
}

export async function leerPaginaEstructurada(url: string, maxChars = 6000): Promise<FuenteWeb> {
  const base: FuenteWeb = { url, titulo: "", texto: "" };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    logger.warn({ url }, "[Web] URL inválida, se descarta");
    return base;
  }
  if (!/^https?:$/.test(u.protocol)) {
    logger.warn({ url }, "[Web] protocolo no http, se descarta");
    return base;
  }
  if (await hostBloqueado(u.hostname)) {
    logger.warn({ url }, "[Web] host privado/bloqueado, se descarta");
    return base;
  }
  try {
    const res = await fetch(u.toString(), {
      headers: { "User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, "[Web] página respondió error");
      return base;
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct && !/text\/html|application\/xhtml|text\/plain/.test(ct)) {
      logger.warn({ url, ct }, "[Web] no es HTML, se descarta");
      return base;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_HTML) {
      logger.warn({ url, bytes: buf.length }, "[Web] HTML gigante, se descarta");
      return base;
    }
    const html = buf.toString("utf8");
    const est = extraerEstructurados(html);
    let texto = textoVisible(html);
    const esSpa = texto.length < 400 && /<div id="root"><\/div>|__NEXT_DATA__|ng-app|data-reactroot/i.test(html);
    if (est.extra && texto.length < 400) texto = `${texto}\n${est.extra}`.trim();
    if (est.precio && !/precio/i.test(texto.slice(0, 2000))) texto = `Precio visible en la página: ${est.precio}.\n${texto}`;
    base.titulo = est.titulo;
    base.precio = est.precio || undefined;
    base.disponibilidad = est.disponibilidad || undefined;
    base.esSpa = esSpa || undefined;
    base.texto = texto.slice(0, maxChars);
    if (base.texto.length < 400) {
      logger.warn({ url, chars: base.texto.length, esSpa }, "[Web] página sin texto útil (SPA con JS? login? captcha?)");
      return { ...base, texto: "" };
    }
    return base;
  } catch (e: any) {
    logger.warn({ url, err: e?.message }, "[Web] lectura falló");
    return base;
  }
}

/**
 * Fuentes para completar un producto: tiendas conocidas primero.
 * Devuelve hasta `max` páginas con su texto (ya recortado).
 */
export async function fuentesParaProducto(nombre: string, max = 3): Promise<FuenteWeb[]> {
  const consulta = `${nombre} características descripción`;
  const resultados = await buscarEnDuckDuckGo(consulta, 10);
  const tiendas = /mercadolibre|falabella|exito\.com|amazon\.|alkosto|linio|homecenter|olimpica|dafiti|shopify|tienda|\.co\//i;
  const orden = [...resultados].sort((a, b) => (tiendas.test(b.url) ? 1 : 0) - (tiendas.test(a.url) ? 1 : 0));
  const fuentes: FuenteWeb[] = [];
  for (const r of orden) {
    if (fuentes.length >= max) break;
    const f = await leerPaginaEstructurada(r.url);
    if (f.texto.length < 400) continue; // motivo ya registrado en el log
    fuentes.push({ url: r.url, titulo: f.titulo || r.titulo, texto: f.texto, precio: f.precio, disponibilidad: f.disponibilidad, esSpa: f.esSpa });
  }
  if (!fuentes.length) logger.warn({ nombre, resultados: resultados.length }, "[Web] sin fuentes útiles para el producto");
  return fuentes;
}
