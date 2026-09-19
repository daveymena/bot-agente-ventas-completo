/**
 * Búsqueda web mínima para completar fichas de producto.
 *
 * Pedido del dueño (19-09-2026): "si la información está incompleta, que la
 * busque de otras tiendas y la traiga acá para organizar el producto".
 * Se usa DuckDuckGo (versión lite, HTML plano, sin clave) y se leen las
 * primeras páginas de tiendas (Mercado Libre, Falabella, Éxito, Amazon…).
 *
 * Solo TEXTO: las fotos de otras tiendas no son publicables (regla del
 * proyecto desde el 12-09). Lo que se trae son datos (material, medidas, qué
 * incluye, uso), y el curador los marca como complementados.
 */
import { logger } from "./logger";

export interface FuenteWeb { url: string; titulo: string; texto: string }

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

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

/** Resultados (url + título) de DuckDuckGo lite. */
export async function buscarEnDuckDuckGo(consulta: string, max = 6): Promise<Array<{ url: string; titulo: string }>> {
  try {
    const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(consulta)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const out: Array<{ url: string; titulo: string }> = [];
    for (const m of html.matchAll(/<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      let url = m[1];
      const r = url.match(/uddg=([^&]+)/);
      if (r) url = decodeURIComponent(r[1]);
      if (!/^https?:\/\//i.test(url)) continue;
      out.push({ url, titulo: textoVisible(m[2]).slice(0, 120) });
      if (out.length >= max) break;
    }
    return out;
  } catch (e: any) {
    logger.warn({ consulta, err: e?.message }, "[Web] búsqueda falló");
    return [];
  }
}

/** Texto visible de una página, recortado a lo útil. */
export async function leerPagina(url: string, maxChars = 6000): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9" }, signal: AbortSignal.timeout(12000), redirect: "follow" });
    if (!res.ok) return "";
    const html = await res.text();
    return textoVisible(html).slice(0, maxChars);
  } catch {
    return "";
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
    const texto = await leerPagina(r.url);
    if (texto.length < 400) continue;
    fuentes.push({ url: r.url, titulo: r.titulo, texto });
  }
  return fuentes;
}
