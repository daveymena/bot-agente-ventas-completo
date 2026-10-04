/**
 * ScraperPro interno (admin): scrape estático + crawl + soporte render JS.
 * NO es parte del camino crítico del vendedor WhatsApp. Solo lo usa el admin/Atlas.
 * Sin dependencias nuevas: fetch nativo Node 22 + regex. Puppeteer opcional via import dinámico.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const UA = "Mozilla/5.0 (ScraperPro/1.0; admin) AppleWebKit/537.36 Chrome/122 Safari/537.36";
const MAX_HTML = 2_000_000;
const TIMEOUT = 20_000;

export type ScrapeImage = { src: string; absolute_url: string; alt: string };

async function hostEsPrivado(hostname: string): Promise<boolean> {
  try {
    if (isIP(hostname)) return esPrivada(hostname);
    const addrs = await lookup(hostname, { all: true });
    return addrs.some((a) => esPrivada(a.address));
  } catch {
    // Un fallo de DNS NO es "host privado": devolver `true` acá hacía que
    // cualquier URL válida con una resolución lenta/fallida se rechazara con
    // "Host privado/bloqueado (SSRF)", que es un diagnóstico falso. Se deja
    // pasar y el fetch de abajo falla con el error real (ENOTFOUND, timeout…).
    return false;
  }
}
function esPrivada(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "localhost") return true;
  if (v.startsWith("127.") || v.startsWith("10.") || v.startsWith("192.168.") || v.startsWith("169.254.")) return true;
  if (v.startsWith("172.")) { const n = Number(v.split(".")[1]); if (n >= 16 && n <= 31) return true; }
  if (v.startsWith("fc") || v.startsWith("fd") || v === "::ffff:127.0.0.1") return true;
  return false;
}

export async function fetchHtmlSeguro(urlStr: string): Promise<{ finalUrl: string; html: string }> {
  let u: URL;
  try { u = new URL(urlStr); } catch { throw new Error("URL inválida"); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Solo http/https");
  if (await hostEsPrivado(u.hostname)) throw new Error("Host privado/bloqueado (SSRF)");
  const res = await fetch(u.toString(), { headers: { "User-Agent": UA, Accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_HTML) throw new Error("HTML demasiado grande");
  return { finalUrl: res.url || u.toString(), html: buf.toString("utf8") };
}

function abs(base: string, src: string): string {
  try { return new URL(src, base).toString(); } catch { return src; }
}

export function parsearHtml(baseUrl: string, html: string) {
  const title = (html.match(/<title[^>]*>([^<]{1,300})/i)?.[1] || "").trim();
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{1,2000})/i)?.[1]
    || html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']{1,2000})/i)?.[1] || "").trim();
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 20000);
  const links: string[] = [];
  for (const m of clean.matchAll(/<a[^>]+href=(?:"([^"]{1,500})"|'([^']{1,500})'|([^\s>#"'\]]{1,500}))/gi)) {
    const h = (m[1] || m[2] || m[3] || "").trim();
    if (/^(javascript:|mailto:|tel:|data:)/i.test(h)) continue;
    links.push(abs(baseUrl, h));
    if (links.length >= 500) break;
  }
  const images: ScrapeImage[] = [];
  for (const m of clean.matchAll(/<img[^>]+src=(?:"([^"]{1,1000})"|'([^']{1,1000})'|([^\s>"']{1,1000}))[^>]*>/gi)) {
    const s = (m[1] || m[2] || m[3] || "").trim(); const tag = m[0];
    if (s.startsWith("data:")) continue;
    const alt = (tag.match(/alt=["']([^"']{0,300})["']/i)?.[1] || "").trim();
    images.push({ src: s, absolute_url: abs(baseUrl, s), alt });
    if (images.length >= 200) break;
  }
  return { title, description: desc, text, links, images };
}

export async function scrapeUrl(url: string, maxImages = 50) {
  const { finalUrl, html } = await fetchHtmlSeguro(url);
  const p = parsearHtml(finalUrl, html);
  return { url: finalUrl, ...p, images: p.images.slice(0, maxImages), es_spa_vacia: p.text.length < 100 && p.images.length === 0 };
}

export async function scrapeConJs(url: string, maxImages = 50) {
  // Puppeteer vive en la raíz del monorepo (no en api-server). Import dinámico: si no está, error claro.
  let puppeteer: any;
  try { puppeteer = (await import("puppeteer")).default ?? await import("puppeteer"); }
  catch { throw new Error("Render JS no disponible: puppeteer no instalado en api-server"); }
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("URL inválida"); }
  if (await hostEsPrivado(u.hostname)) throw new Error("Host privado/bloqueado (SSRF)");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(u.toString(), { waitUntil: "networkidle2", timeout: TIMEOUT });
    await new Promise((r) => setTimeout(r, 1500));
    const html = await page.content();
    const p = parsearHtml(page.url(), String(html));
    return { url: page.url(), ...p, images: p.images.slice(0, maxImages), render_js: true };
  } finally { await browser.close().catch(() => undefined); }
}

export async function crawlSitio(startUrl: string, maxPages = 20, maxDepth = 2, sameDomain = true) {
  const baseHost = (() => { try { return new URL(startUrl).hostname; } catch { return ""; } })();
  const visitadas = new Set<string>();
  const cola: Array<[string, number]> = [[startUrl, 0]];
  const paginas: Array<any> = [];
  const todasImgs: ScrapeImage[] = [];
  while (cola.length && visitadas.size < Math.min(maxPages, 50)) {
    const [url, depth] = cola.shift()!;
    if (visitadas.has(url) || depth > Math.min(maxDepth, 5)) continue;
    visitadas.add(url);
    try {
      const r = await scrapeUrl(url, 20);
      paginas.push({ url: r.url, title: r.title, images_count: r.images.length, links_count: r.links.length });
      for (const im of r.images) if (todasImgs.length < 200 && !todasImgs.some((x) => x.absolute_url === im.absolute_url)) todasImgs.push(im);
      if (depth < maxDepth) for (const l of r.links) {
        try {
          if (visitadas.has(l)) continue;
          if (sameDomain && new URL(l).hostname !== baseHost) continue;
          if (/\.(pdf|zip|mp4|mp3)$/i.test(new URL(l).pathname)) continue;
          cola.push([l, depth + 1]);
        } catch { /* ignora link raro */ }
      }
    } catch (e: any) { paginas.push({ url, error: String(e?.message || e).slice(0, 300) }); }
  }
  return { start_url: startUrl, pages_crawled: paginas.length, pages: paginas, all_images: todasImgs };
}
