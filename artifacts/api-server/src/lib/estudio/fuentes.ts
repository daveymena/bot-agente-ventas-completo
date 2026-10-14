/**
 * Las tipografías del estudio (landings y creativos).
 *
 * Módulo PURO a propósito: lo importan el servidor (para hornear el tema en la
 * landing publicada y para renderizar el PNG de un creativo con Chromium) y la
 * pantalla (para mostrar exactamente lo mismo). Si cada lado tuviera su propia
 * lista, la vista previa volvería a mentir como en septiembre, cuando el panel
 * de "Diseño" pintaba la preview y la publicada nunca lo leía.
 *
 * Todas son de Google Fonts (licencia OFL) y se cargan por URL: no hay que
 * instalar nada ni en el contenedor ni en el navegador.
 */

export interface Fuente {
  id: string;
  /** El nombre de familia tal como lo pide Google Fonts y el CSS. */
  familia: string;
  /** Pesos que se piden (los que el editor ofrece). */
  pesos: number[];
  respaldo: string;
  /** Para el selector: en qué se nota. */
  caracter: string;
}

export const FUENTES: Fuente[] = [
  { id: "inter", familia: "Inter", pesos: [400, 600, 800, 900], respaldo: "system-ui, sans-serif", caracter: "Neutra y moderna" },
  { id: "poppins", familia: "Poppins", pesos: [400, 600, 800, 900], respaldo: "system-ui, sans-serif", caracter: "Redonda y amigable" },
  { id: "montserrat", familia: "Montserrat", pesos: [400, 600, 800, 900], respaldo: "system-ui, sans-serif", caracter: "Geométrica, de marca" },
  { id: "space-grotesk", familia: "Space Grotesk", pesos: [400, 600, 700], respaldo: "system-ui, sans-serif", caracter: "Tecnológica" },
  { id: "nunito", familia: "Nunito", pesos: [400, 700, 900], respaldo: "system-ui, sans-serif", caracter: "Suave, familiar" },
  { id: "dm-sans", familia: "DM Sans", pesos: [400, 700, 900], respaldo: "system-ui, sans-serif", caracter: "Limpia, editorial" },
  { id: "anton", familia: "Anton", pesos: [400], respaldo: "Impact, sans-serif", caracter: "Titular de impacto" },
  { id: "bebas", familia: "Bebas Neue", pesos: [400], respaldo: "Impact, sans-serif", caracter: "Deportiva, en mayúsculas" },
  { id: "archivo-black", familia: "Archivo Black", pesos: [400], respaldo: "Impact, sans-serif", caracter: "Oferta agresiva" },
  { id: "playfair", familia: "Playfair Display", pesos: [400, 700, 900], respaldo: "Georgia, serif", caracter: "Elegante, premium" },
  { id: "dm-serif", familia: "DM Serif Display", pesos: [400], respaldo: "Georgia, serif", caracter: "Editorial con serifa" },
  { id: "cormorant", familia: "Cormorant Garamond", pesos: [500, 700], respaldo: "Georgia, serif", caracter: "Lujo, belleza" },
  { id: "merriweather", familia: "Merriweather", pesos: [400, 700, 900], respaldo: "Georgia, serif", caracter: "Clásica, confiable" },
  { id: "caveat", familia: "Caveat", pesos: [500, 700], respaldo: "cursive", caracter: "Manuscrita (notas, flechas)" },
];

const POR_ID = new Map(FUENTES.map((f) => [f.id, f]));

export function fuentePorId(id: string | null | undefined): Fuente {
  return (id && POR_ID.get(id)) || FUENTES[0]!;
}

export function esFuenteValida(id: unknown): id is string {
  return typeof id === "string" && POR_ID.has(id);
}

/** `font-family` completo, con comillas y respaldo. */
export function pilaDe(id: string | null | undefined): string {
  const f = fuentePorId(id);
  return `'${f.familia}', ${f.respaldo}`;
}

/** Un solo <link> de Google Fonts para todas las familias que se usan. */
export function enlaceDeFuentes(ids: Iterable<string | null | undefined>): string {
  const vistas = new Set<string>();
  const partes: string[] = [];
  for (const id of ids) {
    const f = fuentePorId(id);
    if (vistas.has(f.id)) continue;
    vistas.add(f.id);
    partes.push(`family=${f.familia.replace(/ /g, "+")}:wght@${f.pesos.join(";")}`);
  }
  if (!partes.length) return "";
  return `https://fonts.googleapis.com/css2?${partes.join("&")}&display=swap`;
}

/** Parejas listas (titular + texto) para el tema de una landing. */
export const PAREJAS: { id: string; nombre: string; titulos: string; texto: string }[] = [
  { id: "moderna", nombre: "Moderna", titulos: "inter", texto: "inter" },
  { id: "amigable", nombre: "Amigable", titulos: "poppins", texto: "poppins" },
  { id: "marca", nombre: "De marca", titulos: "montserrat", texto: "inter" },
  { id: "impacto", nombre: "Impacto", titulos: "anton", texto: "inter" },
  { id: "deportiva", nombre: "Deportiva", titulos: "bebas", texto: "montserrat" },
  { id: "elegante", nombre: "Elegante", titulos: "playfair", texto: "inter" },
  { id: "editorial", nombre: "Editorial", titulos: "dm-serif", texto: "dm-sans" },
  { id: "lujo", nombre: "Lujo", titulos: "cormorant", texto: "montserrat" },
  { id: "tech", nombre: "Tecnológica", titulos: "space-grotesk", texto: "inter" },
  { id: "clasica", nombre: "Clásica", titulos: "merriweather", texto: "dm-sans" },
];
