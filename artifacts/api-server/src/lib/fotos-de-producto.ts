/**
 * Las fotos y videos de un producto, en UN solo lugar.
 *
 * Pedido del dueño (13-09-2026): que un producto pueda tener más de una
 * imagen (subidas o por URL) y URLs de video. Hasta hoy había una sola
 * `imageUrl`, más las que llegaban de Dropi/Woo en
 * `metadata.woocommerce.imageUrls`, y el video en `metadata.videoIntro`.
 *
 * Ahora la galería vive en `metadata.imagenes` (lo que carga el dueño) y
 * los videos en `metadata.videoIntro` (el principal, el que manda el
 * vendedor) y `metadata.videos` (los demás). Todo lo que necesita fotos
 * --ficha, landing, anuncios, adaptar HTML-- lee de acá y ve la misma lista.
 */
import { videoDeProducto } from "./video-de-producto";

function meta(p: any): any {
  const m = p?.metadata;
  if (!m) return {};
  if (typeof m === "string") { try { return JSON.parse(m) || {}; } catch { return {}; } }
  return typeof m === "object" ? m : {};
}

function absoluta(u: string, base: string): string {
  const v = String(u || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `${base.replace(/\/+$/, "")}${v.startsWith("/") ? "" : "/"}${v}`;
}

const ES_IMAGEN = /\.(jpe?g|png|webp|gif)(\?|$)|\/images\/products\/|\/uploads\/products\//i;

/** Todas las fotos del producto, la principal primero, sin repetidas. */
export function fotosDelProducto(p: any, appUrl = process.env.APP_URL || "https://ventasproia.com", max = 12): string[] {
  const m = meta(p);
  const propias: string[] = Array.isArray(m.imagenes) ? m.imagenes.map(String) : [];
  const deWoo: string[] = Array.isArray(m?.woocommerce?.imageUrls) ? m.woocommerce.imageUrls.map(String) : [];
  // Dropi guarda la galería en `metadata.imageUrls` (dropi_import_product), no
  // en `imagenes`. Sin esto, un producto de Dropi solo muestra su foto principal
  // y la landing repetía la misma imagen en todas las secciones.
  const deDropi: string[] = Array.isArray(m.imageUrls) ? m.imageUrls.map(String) : [];
  const todas = [absoluta(String(p?.imageUrl || ""), appUrl), ...propias.map((u) => absoluta(u, appUrl)), ...deWoo.map((u) => absoluta(u, appUrl)), ...deDropi.map((u) => absoluta(u, appUrl))].filter(Boolean);
  return [...new Set(todas)].filter((u) => ES_IMAGEN.test(u)).slice(0, max);
}

/** El video principal (el que manda el vendedor) y los demás. */
export function videosDelProducto(p: any): { principal: string | null; otros: string[] } {
  const m = meta(p);
  const principal = videoDeProducto(m) || null;
  const otros: string[] = (Array.isArray(m.videos) ? m.videos.map(String) : []).filter((u: string) => u && u !== principal);
  return { principal, otros: [...new Set(otros)] };
}

// ─── Fotos únicas por CONTENIDO ─────────────────────────────────────────────
//
// Medido el 19-09-2026 en la landing 21 (Corrector de Postura): cinco URLs
// distintas, pero tres de ellas eran el MISMO archivo (21.003 bytes idénticos):
// la copia local `/images/products/168.jpg`, la que Dropify subió a WordPress
// (`/wp-content/uploads/.../685692.png`) y la original de CloudFront de Dropi.
// La landing mostraba la misma foto en la portada, en "el problema" y en la
// galería. Deduplicar por URL no lo atrapa; hay que mirar los bytes.
//
// El resultado se guarda en `metadata.fotosUnicas` con la firma de la lista
// de URLs que lo produjo: si la lista no cambió, no se vuelve a descargar.

import { createHash } from "node:crypto";

interface CacheFotosUnicas {
  firma: string;
  urls: string[];
  en: string;
  /** URL repetida → URL canónica (la primera con ese mismo contenido). */
  equivalentes?: Record<string, string>;
}

function firmaDe(urls: string[]): string {
  return createHash("sha1").update(urls.join("|")).digest("hex").slice(0, 16);
}

async function hashDeImagen(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return createHash("sha1").update(buf).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Las fotos del producto sin repetidas POR CONTENIDO, la principal primero.
 *
 * Descarga cada URL (hasta `max`, en paralelo, con tope de tiempo) y se queda
 * con la primera URL de cada archivo distinto. Una foto que no se pudo bajar
 * se conserva: no se acusa sin prueba. Si se pasa `guardar`, el resultado
 * queda en `metadata.fotosUnicas` del producto.
 */
export async function fotosUnicasDelProducto(
  p: any,
  opts: { appUrl?: string; max?: number; timeoutMs?: number; guardar?: (metadata: any) => Promise<void> } = {},
): Promise<string[]> {
  const urls = fotosDelProducto(p, opts.appUrl, opts.max ?? 12);
  if (urls.length <= 1) return urls;
  const m = meta(p);
  const firma = firmaDe(urls);
  const cache = m.fotosUnicas as CacheFotosUnicas | undefined;
  if (cache && cache.firma === firma && Array.isArray(cache.urls) && cache.urls.length) return cache.urls;

  const hashes = await Promise.all(urls.map((u) => hashDeImagen(u, opts.timeoutMs ?? 8000)));
  const canonicaPorHash = new Map<string, string>();
  const unicas: string[] = [];
  const equivalentes: Record<string, string> = {};
  urls.forEach((u, i) => {
    const h = hashes[i];
    if (!h) { unicas.push(u); return; }
    const canonica = canonicaPorHash.get(h);
    if (canonica) { equivalentes[u] = canonica; return; }
    canonicaPorHash.set(h, u);
    unicas.push(u);
  });

  const nuevo: CacheFotosUnicas = { firma, urls: unicas, en: new Date().toISOString(), equivalentes };
  // También en memoria, para que quien tenga el objeto vea el resultado sin releer.
  try { if (p && typeof p === "object") p.metadata = typeof p.metadata === "string" ? JSON.stringify({ ...m, fotosUnicas: nuevo }) : { ...m, fotosUnicas: nuevo }; } catch { /* nada */ }
  if (opts.guardar) {
    try { await opts.guardar({ ...m, fotosUnicas: nuevo }); } catch { /* la landing sale igual */ }
  }
  return unicas;
}

/**
 * Reescribe un HTML ya generado para que la misma foto (por contenido) no
 * salga dos veces: cada URL equivalente se cambia por su canónica y después
 * el saneador quita las repeticiones. Para landings viejas, servidas tal
 * cual, que ya traían la misma foto bajo tres URLs (landing 21, 19-09).
 */
export async function htmlConFotosUnicas(html: string, p: any, opts: { guardar?: (metadata: any) => Promise<void> } = {}): Promise<string> {
  if (!html || !p) return html;
  await fotosUnicasDelProducto(p, { guardar: opts.guardar });
  // `p.metadata` puede ser el objeto viejo: se relee lo que guardó `guardar`
  // solo si vino como objeto; si no, se usa lo que acabamos de calcular.
  const m = meta(p);
  const eq: Record<string, string> = (m.fotosUnicas as CacheFotosUnicas | undefined)?.equivalentes || {};
  let salida = html;
  for (const [dup, canon] of Object.entries(eq)) {
    if (!dup || !canon || dup === canon) continue;
    salida = salida.split(dup).join(canon);
    // La copia local (/images/products/N.jpg) suele estar relativa en el HTML.
    const rel = dup.replace(/^https?:\/\/[^/]+/i, "");
    if (rel && rel !== dup && rel.startsWith("/")) salida = salida.split(`"${rel}"`).join(`"${canon}"`);
  }
  if (salida === html) return html;
  const { sanearHtmlDeLanding } = await import("./landing/sanear-html");
  return sanearHtmlDeLanding(salida).html;
}

/** `guardar` listo para usar: persiste el metadata del producto en la base. */
export function guardadorDeMetadata(productId: number): (metadata: any) => Promise<void> {
  return async (metadata: any) => {
    const { db, products } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    await db.update(products).set({ metadata: JSON.stringify(metadata) } as any).where(eq(products.id, productId));
  };
}
