/**
 * Imágenes de relleno propias, sin depender de fotos de terceros.
 *
 * Antes las plantillas de tienda, los productos de demo y los componentes del
 * editor traían fotos de Unsplash incrustadas desde su servidor. Dos
 * problemas para un producto que se vende: (1) es material ajeno viajando
 * dentro de la tienda del cliente, y (2) si el cliente publica sin
 * reemplazarlas, su tienda queda mostrando fotos que no son suyas y que ni
 * siquiera corresponden a lo que vende.
 *
 * Esto genera un SVG en el momento -- no pesa nada, no sale a internet, no
 * se rompe si un tercero borra la foto, y se ve claramente como un espacio a
 * completar (no finge ser una foto real del producto).
 */

/** Color estable a partir del texto: el mismo nombre da siempre el mismo tono. */
function hue(texto: string): number {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function escapar(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
}

/**
 * Tarjeta cuadrada con la inicial y el nombre. Para productos.
 * `ancho` sirve para pedir una relación distinta (ej. banners).
 */
export function placeholderImage(nombre: string, ancho = 800, alto = 800): string {
  const limpio = (nombre || "Producto").trim() || "Producto";
  const h = hue(limpio);
  const inicial = limpio[0].toUpperCase();
  const corto = limpio.length > 24 ? `${limpio.slice(0, 23)}…` : limpio;
  // Tamaños relativos al alto para que se vea igual en cuadrado o en banner.
  const tamInicial = Math.round(alto * 0.32);
  const tamTexto = Math.round(alto * 0.055);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="hsl(${h} 68% 56%)"/><stop offset="100%" stop-color="hsl(${(h + 40) % 360} 68% 42%)"/>
</linearGradient></defs>
<rect width="${ancho}" height="${alto}" fill="url(#g)"/>
<text x="${ancho / 2}" y="${alto * 0.48}" font-family="system-ui,-apple-system,sans-serif" font-size="${tamInicial}" font-weight="700" fill="rgba(255,255,255,.92)" text-anchor="middle">${escapar(inicial)}</text>
<text x="${ancho / 2}" y="${alto * 0.64}" font-family="system-ui,-apple-system,sans-serif" font-size="${tamTexto}" fill="rgba(255,255,255,.85)" text-anchor="middle">${escapar(corto)}</text>
</svg>`;
  // encodeURIComponent y no btoa: btoa se rompe con acentos y eñes.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Banner ancho, para portadas/hero. */
export function placeholderBanner(texto: string): string {
  return placeholderImage(texto, 1200, 600);
}
