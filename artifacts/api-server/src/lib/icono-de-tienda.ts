/**
 * Icono de pestaña / app para la tienda de un negocio.
 *
 * La tienda pública (/tienda/:slug) es la marca del CLIENTE, no de VentasPro:
 * en la pestaña va su logo, y si no cargó ninguno, un cuadrado redondeado con
 * su color de marca y la inicial de su nombre. Se genera como SVG en data URI
 * para no depender de archivos ni de otra petición.
 */
const COLOR_POR_DEFECTO = "#4F46E5";

function colorValido(c: string | null | undefined): string {
  const v = String(c || "").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : (/^#[0-9a-f]{3}$/i.test(v) ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : COLOR_POR_DEFECTO);
}

/** Texto blanco o casi negro según la luminancia del fondo. */
export function tintaSobre(color: string): string {
  const c = colorValido(color).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.45 ? "#111827" : "#FFFFFF";
}

export function inicialDe(nombre: string): string {
  const limpio = String(nombre || "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const palabras = limpio.split(/\s+/).filter(Boolean);
  if (!palabras.length) return "T";
  // Dos palabras → dos iniciales ("Tecno Variedades" → TV); una → su inicial.
  const letras = palabras.length >= 2 ? `${palabras[0]![0]}${palabras[1]![0]}` : palabras[0]![0]!;
  return letras.toUpperCase();
}

export function svgDeInicial(nombre: string, color: string): string {
  const fondo = colorValido(color);
  const tinta = tintaSobre(fondo);
  const letras = inicialDe(nombre);
  const tam = letras.length > 1 ? 24 : 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="15" fill="${fondo}"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="${tam}" font-weight="800" letter-spacing="-1" fill="${tinta}">${letras}</text></svg>`;
}

export function iconoDeTienda(e: { nombre: string; logo?: string | null; color?: string | null; appUrl?: string }): { href: string; tipo: string | null; color: string } {
  const color = colorValido(e.color);
  const logo = String(e.logo || "").trim();
  if (logo && /\.(png|jpe?g|webp|svg|ico|gif)(\?.*)?$/i.test(logo)) {
    const href = /^https?:\/\//i.test(logo) ? logo : `${(e.appUrl || "").replace(/\/+$/, "")}/${logo.replace(/^\/+/, "")}`;
    return { href, tipo: null, color };
  }
  return { href: `data:image/svg+xml;utf8,${encodeURIComponent(svgDeInicial(e.nombre, color))}`, tipo: "image/svg+xml", color };
}
