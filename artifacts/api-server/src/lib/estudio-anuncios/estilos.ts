/**
 * Estilos: la "piel" de una maqueta — paleta, tipografías, fondo y esquinas.
 *
 * Una maqueta (maquetas.ts) decide DÓNDE va cada cosa; el estilo decide con
 * qué colores y letras. Maqueta × estilo × tema (temas.ts) es lo que
 * multiplica el catálogo: 11 maquetas × ~125 estilos × ~22 temas son más de
 * 30.000 plantillas distintas, todas editables.
 *
 * Los primeros estilos están hechos a mano; el resto sale de paletas abiertas
 * (nice-color-palettes, MIT: las 100 más votadas de ColourLovers) eligiendo
 * fondo, texto y acento con contraste suficiente para que se lea.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { AMARILLO, VERDE_WA, contraste, luminancia, textoSobre, type Contenido } from "./esquema";

export interface Paleta {
  fondo: string;
  texto: string;
  /** Color protagonista (botones, franjas, precios). "marca" = el de la marca. */
  acento: string;
  /** Resaltado detrás del gancho. */
  resaltado: string;
  textoResaltado: string;
  boton: string;
  textoBoton: string;
  /** Tarjetas/superficies sobre el fondo. */
  superficie: string;
  textoSuperficie: string;
  /** Texto secundario (marca, sellos). */
  suave: string;
}

export interface Estilo {
  id: string;
  nombre: string;
  tags: string[];
  paleta: Paleta;
  fuentes: { titular: string; cuerpo: string };
  /** Fondo de las maquetas de "fondo libre". */
  fondo: "foto" | "solido" | "degradado" | "patron";
  degradado?: [string, string];
  patron?: { id: string; color: string; escala?: number };
  radio: number;
  mayusculas?: boolean;
}

const P = (p: Partial<Paleta> & Pick<Paleta, "fondo" | "texto" | "acento">): Paleta => ({
  resaltado: p.acento, textoResaltado: textoSobre(p.resaltado || p.acento), boton: p.acento, textoBoton: textoSobre(p.boton || p.acento),
  superficie: "#FFFFFF", textoSuperficie: "#111827", suave: p.texto, ...p,
});

export const ESTILOS_BASE: Estilo[] = [
  { id: "marca", nombre: "Marca", tags: ["clasico", "marca", "oscuro"], paleta: P({ fondo: "#0B0B14", texto: "#FFFFFF", acento: "marca", resaltado: AMARILLO, textoResaltado: "#111827", boton: "marca", textoBoton: "auto", superficie: "#FFFFFF", textoSuperficie: "#0F172A", suave: "#CBD5E1" }), fuentes: { titular: "inter", cuerpo: "inter" }, fondo: "foto", radio: 28 },
  { id: "limpio", nombre: "Limpio", tags: ["claro", "minimal", "profesional"], paleta: P({ fondo: "#FFFFFF", texto: "#0F172A", acento: "marca", resaltado: "#FDE68A", textoResaltado: "#111827", boton: "#0F172A", textoBoton: "#FFFFFF", superficie: "#F1F5F9", textoSuperficie: "#0F172A", suave: "#64748B" }), fuentes: { titular: "poppins", cuerpo: "inter" }, fondo: "solido", radio: 24 },
  { id: "nocturno", nombre: "Nocturno", tags: ["oscuro", "tecnologia", "moderno"], paleta: P({ fondo: "#0B0B14", texto: "#FFFFFF", acento: "#8B5CF6", resaltado: "#FACC15", textoResaltado: "#111827", boton: "#8B5CF6", textoBoton: "#FFFFFF", superficie: "#1E1B4B", textoSuperficie: "#FFFFFF", suave: "#A5B4FC" }), fuentes: { titular: "montserrat", cuerpo: "inter" }, fondo: "degradado", degradado: ["#0B0B14", "#1E1B4B"], radio: 28 },
  { id: "pop", nombre: "Pop", tags: ["llamativo", "oferta", "joven", "claro"], paleta: P({ fondo: "#FFD60A", texto: "#111827", acento: "#FF3366", resaltado: "#111827", textoResaltado: "#FFFFFF", boton: "#111827", textoBoton: "#FFD60A", superficie: "#FFFFFF", textoSuperficie: "#111827", suave: "#422006" }), fuentes: { titular: "bangers", cuerpo: "poppins" }, fondo: "solido", radio: 16, mayusculas: true },
  { id: "elegante", nombre: "Elegante", tags: ["lujo", "oscuro", "premium", "joyeria"], paleta: P({ fondo: "#0F0F0F", texto: "#F5F5F4", acento: "#C9A227", resaltado: "#C9A227", textoResaltado: "#0F0F0F", boton: "#C9A227", textoBoton: "#0F0F0F", superficie: "#1C1917", textoSuperficie: "#F5F5F4", suave: "#A8A29E" }), fuentes: { titular: "playfair", cuerpo: "raleway" }, fondo: "degradado", degradado: ["#0F0F0F", "#2A2A2A"], radio: 6 },
  { id: "calido", nombre: "Cálido", tags: ["claro", "comida", "hogar", "amable"], paleta: P({ fondo: "#FFF7ED", texto: "#7C2D12", acento: "#EA580C", resaltado: "#FDBA74", textoResaltado: "#7C2D12", boton: "#EA580C", textoBoton: "#FFFFFF", superficie: "#FFFFFF", textoSuperficie: "#7C2D12", suave: "#9A3412" }), fuentes: { titular: "fredoka", cuerpo: "nunito" }, fondo: "patron", patron: { id: "puntos", color: "#FED7AA" }, radio: 32 },
  { id: "fresco", nombre: "Fresco", tags: ["claro", "salud", "limpieza", "frio"], paleta: P({ fondo: "#ECFEFF", texto: "#164E63", acento: "#06B6D4", resaltado: "#A5F3FC", textoResaltado: "#164E63", boton: "#0891B2", textoBoton: "#FFFFFF", superficie: "#FFFFFF", textoSuperficie: "#164E63", suave: "#0E7490" }), fuentes: { titular: "poppins", cuerpo: "poppins" }, fondo: "degradado", degradado: ["#ECFEFF", "#CFFAFE"], radio: 28 },
  { id: "urbano", nombre: "Urbano", tags: ["oscuro", "deporte", "ropa", "impacto"], paleta: P({ fondo: "#111111", texto: "#FFFFFF", acento: "#F97316", resaltado: "#F97316", textoResaltado: "#111111", boton: "#F97316", textoBoton: "#111111", superficie: "#1F1F1F", textoSuperficie: "#FFFFFF", suave: "#A3A3A3" }), fuentes: { titular: "anton", cuerpo: "roboto" }, fondo: "patron", patron: { id: "diagonales", color: "#222222" }, radio: 0, mayusculas: true },
  { id: "dulce", nombre: "Dulce", tags: ["claro", "belleza", "reposteria", "rosa"], paleta: P({ fondo: "#FDF2F8", texto: "#831843", acento: "#EC4899", resaltado: "#FBCFE8", textoResaltado: "#831843", boton: "#EC4899", textoBoton: "#FFFFFF", superficie: "#FFFFFF", textoSuperficie: "#831843", suave: "#9D174D" }), fuentes: { titular: "pacifico", cuerpo: "nunito" }, fondo: "patron", patron: { id: "corazones", color: "#FBCFE8" }, radio: 36 },
  { id: "natural", nombre: "Natural", tags: ["claro", "organico", "plantas", "verde"], paleta: P({ fondo: "#F0FDF4", texto: "#14532D", acento: "#16A34A", resaltado: "#BBF7D0", textoResaltado: "#14532D", boton: "#15803D", textoBoton: "#FFFFFF", superficie: "#FFFFFF", textoSuperficie: "#14532D", suave: "#166534" }), fuentes: { titular: "caveat", cuerpo: "nunito" }, fondo: "solido", radio: 24 },
  { id: "lujo", nombre: "Lujo", tags: ["oscuro", "premium", "moda", "dorado"], paleta: P({ fondo: "#1C1917", texto: "#FAFAF9", acento: "#D4AF37", resaltado: "#D4AF37", textoResaltado: "#1C1917", boton: "#FAFAF9", textoBoton: "#1C1917", superficie: "#292524", textoSuperficie: "#FAFAF9", suave: "#D6D3D1" }), fuentes: { titular: "abril", cuerpo: "raleway" }, fondo: "solido", radio: 0 },
  { id: "tecnologia", nombre: "Tecnología", tags: ["oscuro", "tecnologia", "gadgets", "azul"], paleta: P({ fondo: "#0F172A", texto: "#F8FAFC", acento: "#38BDF8", resaltado: "#38BDF8", textoResaltado: "#0F172A", boton: "#38BDF8", textoBoton: "#0F172A", superficie: "#1E293B", textoSuperficie: "#F8FAFC", suave: "#94A3B8" }), fuentes: { titular: "roboto", cuerpo: "roboto" }, fondo: "patron", patron: { id: "cuadricula", color: "#1E293B" }, radio: 12 },
  { id: "fiesta", nombre: "Fiesta", tags: ["oscuro", "fiesta", "eventos", "morado"], paleta: P({ fondo: "#4C1D95", texto: "#FFFFFF", acento: "#F472B6", resaltado: "#FACC15", textoResaltado: "#111827", boton: "#F472B6", textoBoton: "#111827", superficie: "#5B21B6", textoSuperficie: "#FFFFFF", suave: "#DDD6FE" }), fuentes: { titular: "righteous", cuerpo: "poppins" }, fondo: "patron", patron: { id: "confeti", color: "#7C3AED" }, radio: 24 },
  { id: "retro", nombre: "Retro", tags: ["claro", "vintage", "cafe", "amarillo"], paleta: P({ fondo: "#FEF3C7", texto: "#78350F", acento: "#B45309", resaltado: "#F59E0B", textoResaltado: "#78350F", boton: "#78350F", textoBoton: "#FEF3C7", superficie: "#FFFBEB", textoSuperficie: "#78350F", suave: "#92400E" }), fuentes: { titular: "righteous", cuerpo: "oswald" }, fondo: "patron", patron: { id: "zigzag", color: "#FDE68A" }, radio: 8 },
  { id: "negro", nombre: "Negro minimal", tags: ["oscuro", "minimal", "moda", "blanco-y-negro"], paleta: P({ fondo: "#000000", texto: "#FFFFFF", acento: "#FFFFFF", resaltado: "#FFFFFF", textoResaltado: "#000000", boton: "#FFFFFF", textoBoton: "#000000", superficie: "#171717", textoSuperficie: "#FFFFFF", suave: "#A3A3A3" }), fuentes: { titular: "montserrat", cuerpo: "montserrat" }, fondo: "solido", radio: 0 },
  { id: "pastel", nombre: "Pastel", tags: ["claro", "suave", "bebes", "lila"], paleta: P({ fondo: "#F5F3FF", texto: "#4C1D95", acento: "#A78BFA", resaltado: "#DDD6FE", textoResaltado: "#4C1D95", boton: "#7C3AED", textoBoton: "#FFFFFF", superficie: "#FFFFFF", textoSuperficie: "#4C1D95", suave: "#6D28D9" }), fuentes: { titular: "nunito", cuerpo: "nunito" }, fondo: "degradado", degradado: ["#F5F3FF", "#FCE7F3"], radio: 40 },
  { id: "oceano", nombre: "Océano", tags: ["oscuro", "viajes", "frio", "azul"], paleta: P({ fondo: "#0C4A6E", texto: "#F0F9FF", acento: "#22D3EE", resaltado: "#FDE047", textoResaltado: "#0C4A6E", boton: "#22D3EE", textoBoton: "#0C4A6E", superficie: "#075985", textoSuperficie: "#F0F9FF", suave: "#BAE6FD" }), fuentes: { titular: "montserrat", cuerpo: "inter" }, fondo: "degradado", degradado: ["#0C4A6E", "#0369A1"], radio: 28 },
  { id: "fuego", nombre: "Fuego", tags: ["oscuro", "oferta", "urgencia", "rojo"], paleta: P({ fondo: "#7F1D1D", texto: "#FFF7ED", acento: "#FB923C", resaltado: "#FACC15", textoResaltado: "#111827", boton: "#FB923C", textoBoton: "#111827", superficie: "#991B1B", textoSuperficie: "#FFF7ED", suave: "#FECACA" }), fuentes: { titular: "anton", cuerpo: "roboto" }, fondo: "degradado", degradado: ["#7F1D1D", "#C2410C"], radio: 12, mayusculas: true },
  { id: "bosque", nombre: "Bosque", tags: ["oscuro", "organico", "verde", "cafe"], paleta: P({ fondo: "#052E16", texto: "#ECFDF5", acento: "#4ADE80", resaltado: "#4ADE80", textoResaltado: "#052E16", boton: "#4ADE80", textoBoton: "#052E16", superficie: "#14532D", textoSuperficie: "#ECFDF5", suave: "#BBF7D0" }), fuentes: { titular: "playfair", cuerpo: "nunito" }, fondo: "solido", radio: 20 },
  { id: "cafe", nombre: "Café", tags: ["oscuro", "cafe", "artesanal", "marron"], paleta: P({ fondo: "#3B2A20", texto: "#FDF6EC", acento: "#D4A373", resaltado: "#D4A373", textoResaltado: "#3B2A20", boton: "#D4A373", textoBoton: "#3B2A20", superficie: "#4E3A2E", textoSuperficie: "#FDF6EC", suave: "#E7D3BE" }), fuentes: { titular: "lobster", cuerpo: "nunito" }, fondo: "patron", patron: { id: "puntos-finos", color: "#5A4030" }, radio: 24 },
  { id: "moda", nombre: "Moda", tags: ["claro", "moda", "editorial", "rosa"], paleta: P({ fondo: "#FFF1F2", texto: "#881337", acento: "#E11D48", resaltado: "#FECDD3", textoResaltado: "#881337", boton: "#E11D48", textoBoton: "#FFFFFF", superficie: "#FFFFFF", textoSuperficie: "#881337", suave: "#9F1239" }), fuentes: { titular: "abril", cuerpo: "montserrat" }, fondo: "solido", radio: 0 },
  { id: "neon", nombre: "Neón", tags: ["oscuro", "gaming", "fiesta", "verde"], paleta: P({ fondo: "#09090B", texto: "#FAFAFA", acento: "#22C55E", resaltado: "#D946EF", textoResaltado: "#FFFFFF", boton: "#22C55E", textoBoton: "#052E16", superficie: "#18181B", textoSuperficie: "#FAFAFA", suave: "#A1A1AA" }), fuentes: { titular: "bebas", cuerpo: "poppins" }, fondo: "patron", patron: { id: "cuadricula", color: "#18181B" }, radio: 8, mayusculas: true },
  { id: "periodico", nombre: "Periódico", tags: ["claro", "editorial", "clasico", "serif"], paleta: P({ fondo: "#FAF7F2", texto: "#1C1917", acento: "#B91C1C", resaltado: "#1C1917", textoResaltado: "#FAF7F2", boton: "#1C1917", textoBoton: "#FAF7F2", superficie: "#FFFFFF", textoSuperficie: "#1C1917", suave: "#57534E" }), fuentes: { titular: "playfair", cuerpo: "roboto" }, fondo: "patron", patron: { id: "diagonales", color: "#EDE9E3" }, radio: 0 },
  { id: "playa", nombre: "Playa", tags: ["claro", "verano", "viajes", "amarillo"], paleta: P({ fondo: "#FEF9C3", texto: "#0C4A6E", acento: "#0EA5E9", resaltado: "#FDE047", textoResaltado: "#0C4A6E", boton: "#0EA5E9", textoBoton: "#FFFFFF", superficie: "#FFFFFF", textoSuperficie: "#0C4A6E", suave: "#0369A1" }), fuentes: { titular: "pacifico", cuerpo: "poppins" }, fondo: "patron", patron: { id: "ondas", color: "#FDE68A" }, radio: 32 },
  { id: "marcador", nombre: "Marcador", tags: ["claro", "oferta", "urgencia", "manuscrito"], paleta: P({ fondo: "#FFFFFF", texto: "#111111", acento: "#EF4444", resaltado: "#FEF08A", textoResaltado: "#111111", boton: "#111111", textoBoton: "#FFFFFF", superficie: "#F8FAFC", textoSuperficie: "#111111", suave: "#525252" }), fuentes: { titular: "marker", cuerpo: "inter" }, fondo: "patron", patron: { id: "cuadricula", color: "#F1F5F9" }, radio: 4 },
  { id: "infantil", nombre: "Infantil", tags: ["claro", "ninos", "juguetes", "colorido"], paleta: P({ fondo: "#FFFBEB", texto: "#1E3A8A", acento: "#F59E0B", resaltado: "#BFDBFE", textoResaltado: "#1E3A8A", boton: "#2563EB", textoBoton: "#FFFFFF", superficie: "#FFFFFF", textoSuperficie: "#1E3A8A", suave: "#1D4ED8" }), fuentes: { titular: "fredoka", cuerpo: "fredoka" }, fondo: "patron", patron: { id: "estrellas", color: "#FDE68A" }, radio: 40 },
];

// ─── Estilos desde paletas abiertas ──────────────────────────────────────────

const PARES_DE_FUENTES: Array<[string, string]> = [["montserrat", "inter"], ["poppins", "poppins"], ["playfair", "raleway"], ["oswald", "roboto"], ["bebas", "poppins"], ["nunito", "nunito"], ["righteous", "poppins"], ["fredoka", "nunito"], ["anton", "roboto"], ["raleway", "raleway"]];

function cargarPaletas(): string[][] {
  for (const base of [import.meta.url, path.join(process.cwd(), "artifacts/api-server/package.json")]) {
    try {
      const p = createRequire(base)("nice-color-palettes") as string[][];
      if (Array.isArray(p)) return p;
    } catch { /* siguiente candidato */ }
  }
  return [];
}

function esCalido(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  return parseInt(m[1]!, 16) > parseInt(m[3]!, 16);
}

/** Convierte una paleta de 5 colores en un estilo legible (fondo + texto + acento con contraste). */
export function estiloDePaleta(colores: string[], i: number): Estilo | null {
  const limpios = colores.map((c) => c.toLowerCase()).filter((c) => /^#[0-9a-f]{6}$/.test(c));
  if (limpios.length < 3) return null;
  const ordenados = [...limpios].sort((a, b) => luminancia(a) - luminancia(b));
  const oscuro = ordenados[0]!, claro = ordenados[ordenados.length - 1]!;
  // Fondo: el más oscuro si es realmente oscuro; si no, el más claro.
  const fondoOscuro = luminancia(oscuro) < 0.12;
  const fondo = fondoOscuro ? oscuro : luminancia(claro) > 0.5 ? claro : oscuro;
  const texto = textoSobre(fondo);
  const candidatos = limpios.filter((c) => c !== fondo).map((c) => ({ c, k: contraste(c, fondo) })).sort((a, b) => b.k - a.k);
  const acento = (candidatos.find((x) => x.k >= 3) || candidatos[0])!.c;
  const segundo = (candidatos.find((x) => x.c !== acento && x.k >= 2.5) || candidatos.find((x) => x.c !== acento) || candidatos[0])!.c;
  const superficie = fondoOscuro ? ordenados[1]! : claro === fondo ? ordenados[ordenados.length - 2]! : claro;
  const par = PARES_DE_FUENTES[i % PARES_DE_FUENTES.length]!;
  const tags = [fondoOscuro ? "oscuro" : "claro", esCalido(acento) ? "calido" : "frio", "paleta"];
  const usaDegradado = i % 3 === 1;
  return {
    id: `paleta-${i + 1}`, nombre: `Paleta ${i + 1}`, tags,
    paleta: P({ fondo, texto, acento, resaltado: segundo, textoResaltado: textoSobre(segundo), boton: acento, textoBoton: textoSobre(acento), superficie, textoSuperficie: textoSobre(superficie), suave: textoSobre(fondo) === "#ffffff" ? "#E5E7EB" : "#374151" }),
    fuentes: { titular: par[0], cuerpo: par[1] },
    fondo: usaDegradado ? "degradado" : i % 3 === 2 ? "patron" : "solido",
    degradado: usaDegradado ? [fondo, superficie] : undefined,
    patron: i % 3 === 2 ? { id: ["puntos", "diagonales", "circulos", "cuadricula", "rombos", "ondas"][i % 6]!, color: fondoOscuro ? "#ffffff14" : "#00000010" } : undefined,
    radio: [0, 12, 24, 32][i % 4]!,
  };
}

let estilosCache: Estilo[] | null = null;

export function ESTILOS(): Estilo[] {
  if (estilosCache) return estilosCache;
  const paletas = cargarPaletas().map((p, i) => estiloDePaleta(p, i)).filter((e): e is Estilo => !!e);
  estilosCache = [...ESTILOS_BASE, ...paletas];
  return estilosCache;
}

export function estiloPorId(id?: string | null): Estilo {
  const lista = ESTILOS();
  return lista.find((e) => e.id === String(id || "").toLowerCase()) || lista[0]!;
}

/** Paleta resuelta para un producto concreto ("marca" → color real, "auto" → contraste). */
export interface EstiloResuelto extends Omit<Estilo, "paleta"> { paleta: Paleta; textoSobreFoto: string }

export function resolverEstilo(estilo: Estilo | string | null | undefined, c: Pick<Contenido, "color" | "cta">): EstiloResuelto {
  const e = typeof estilo === "string" || !estilo ? estiloPorId(estilo as string) : estilo;
  const marca = /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#4F46E5";
  const sub = (v: string) => (v === "marca" ? marca : v);
  const paleta: Paleta = { ...e.paleta };
  for (const k of Object.keys(paleta) as Array<keyof Paleta>) paleta[k] = sub(paleta[k]);
  if (paleta.textoBoton === "auto") paleta.textoBoton = textoSobre(paleta.boton);
  if (paleta.textoResaltado === "auto") paleta.textoResaltado = textoSobre(paleta.resaltado);
  return { ...e, paleta, textoSobreFoto: "#FFFFFF" };
}

/** Botón del CTA: WhatsApp siempre verde (lo reconoce cualquiera), el resto con el color del estilo. */
export function botonPara(E: EstiloResuelto, cta: string): { fondo: string; color: string } {
  if (/whatsapp/i.test(cta)) return { fondo: VERDE_WA, color: "#FFFFFF" };
  return { fondo: E.paleta.boton, color: E.paleta.textoBoton };
}

export function resumenDeEstilos(): Array<{ id: string; nombre: string; tags: string[]; fondo: string; acento: string; texto: string; titular: string; cuerpo: string }> {
  return ESTILOS().map((e) => ({ id: e.id, nombre: e.nombre, tags: e.tags, fondo: e.paleta.fondo, acento: e.paleta.acento, texto: e.paleta.texto, titular: e.fuentes.titular, cuerpo: e.fuentes.cuerpo }));
}
