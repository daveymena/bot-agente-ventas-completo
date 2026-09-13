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
  const todas = [absoluta(String(p?.imageUrl || ""), appUrl), ...propias.map((u) => absoluta(u, appUrl)), ...deWoo.map((u) => absoluta(u, appUrl))].filter(Boolean);
  return [...new Set(todas)].filter((u) => ES_IMAGEN.test(u)).slice(0, max);
}

/** El video principal (el que manda el vendedor) y los demás. */
export function videosDelProducto(p: any): { principal: string | null; otros: string[] } {
  const m = meta(p);
  const principal = videoDeProducto(m) || null;
  const otros: string[] = (Array.isArray(m.videos) ? m.videos.map(String) : []).filter((u: string) => u && u !== principal);
  return { principal, otros: [...new Set(otros)] };
}
