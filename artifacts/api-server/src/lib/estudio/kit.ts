/**
 * El kit de marca del negocio: logo, colores y tipografías.
 *
 * Es lo que evita el "look genérico". Sin kit, cada creativo adivina su color
 * desde la foto o el rubro, y cuando la foto es mala cae al índigo por
 * defecto: dos productos del mismo negocio parecen de dos marcas distintas.
 * Con kit, todas las piezas (creativos y, si el dueño lo pide, el tema de las
 * landings) salen con la MISMA identidad.
 *
 * ⚠️ El kit es una ELECCIÓN del dueño, no se deduce de `tenants.brandColors`:
 * ahí suele estar el valor por defecto del sistema (#10b981 / #3b82f6 /
 * #f59e0b), y usarlo como marca sería otra forma de genérico.
 *
 * Módulo PURO: lo usan servidor, pantalla y Atlas.
 */
import { esFuenteValida } from "./fuentes";
import { normalizarHex, tintaSobre, type Retoque } from "./retoque";
import type { Capa, Escena } from "./escena";

export interface KitDeMarca {
  /** Color principal: botones, precios, sellos. */
  acento?: string | null;
  /** Fondo oscuro de la marca (en vez del negro genérico). */
  oscuro?: string | null;
  /** Fondo claro de la marca (en vez del gris/blanco genérico). */
  claro?: string | null;
  /** Fuente de titulares y fuente de texto (ids de FUENTES). */
  titulos?: string | null;
  texto?: string | null;
  /** URL del logo (PNG con transparencia idealmente). */
  logo?: string | null;
}

export function normalizarKit(entrada: unknown): KitDeMarca {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const k: KitDeMarca = {};
  for (const c of ["acento", "oscuro", "claro"] as const) { const v = normalizarHex(e[c]); if (v) k[c] = v; }
  if (esFuenteValida(e.titulos)) k.titulos = e.titulos;
  if (esFuenteValida(e.texto)) k.texto = e.texto;
  const logo = String(e.logo ?? "").trim();
  if (/^https?:\/\//i.test(logo) || /^\/uploads\//.test(logo)) k.logo = logo;
  return k;
}

export const kitVacio = (k: KitDeMarca | null | undefined) => !k || Object.keys(normalizarKit(k)).length === 0;

/** El kit como tema de landing (para "usar mi marca" en el editor). */
export function kitComoRetoque(k: KitDeMarca): Retoque {
  const n = normalizarKit(k);
  return { ...(n.acento ? { acento: n.acento } : {}), ...(n.titulos ? { titulos: n.titulos } : {}), ...(n.texto ? { texto: n.texto } : {}) };
}

// ── Color ───────────────────────────────────────────────────────────────────

function hexARgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbAHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}
function rgbAHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslAHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbAHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Relación de contraste WCAG entre dos colores. */
export function contraste(a: string, b: string): number {
  const L = (h: string) => {
    const [r, g, bl] = hexARgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/**
 * Paletas completas armadas desde UN color (el de la foto del producto, o el
 * que el dueño ya usa). Cada una trae el oscuro y el claro que combinan, no
 * el negro y el gris de siempre.
 */
export function paletasDesde(base: string): { nombre: string; acento: string; oscuro: string; claro: string }[] {
  const hex = normalizarHex(base);
  if (!hex) return [];
  const [h, s, l] = rgbAHsl(...hexARgb(hex));
  const sat = Math.max(0.45, Math.min(0.85, s));
  // Un acento usable en un botón: ni chillón ni apagado.
  const acento = hslAHex(h, sat, Math.max(0.36, Math.min(0.52, l)));
  return [
    { nombre: "Monocromática", acento, oscuro: hslAHex(h, Math.min(0.5, sat), 0.12), claro: hslAHex(h, 0.35, 0.96) },
    { nombre: "Contraste cálido", acento, oscuro: hslAHex(h + 180, 0.35, 0.13), claro: hslAHex(h + 30, 0.45, 0.95) },
    { nombre: "Análoga", acento: hslAHex(h + 20, sat, 0.45), oscuro: hslAHex(h - 20, 0.45, 0.14), claro: hslAHex(h + 10, 0.3, 0.97) },
    { nombre: "Premium neutra", acento: hslAHex(h, Math.min(0.55, sat), 0.4), oscuro: "#151412", claro: "#f4efe8" },
    { nombre: "Fresca", acento, oscuro: "#0f172a", claro: hslAHex(h, 0.25, 0.97) },
  ];
}

// ── Aplicar el kit a una escena ─────────────────────────────────────────────

/** Neutros que usan las maquetas y que el kit reemplaza por los suyos. */
const OSCUROS = new Set(["#111111", "#111827", "#0b0b0f", "#1a1815", "#2b2118", "#0f172a", "#000000"]);
const CLAROS = new Set(["#f6f7f9", "#f4efe8", "#f3ede4", "#eef2f7", "#ffffff"]);
const TITULARES = new Set(["Gancho", "Gancho resaltado", "Precio", "Palabra en color", "Marca"]);

function solapan(a: Pick<Capa, "x" | "y" | "w" | "h">, b: Pick<Capa, "x" | "y" | "w" | "h">): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Pasa una escena (armada por una maqueta) a la identidad de la marca:
 * acento, oscuros y claros de la marca en vez de los neutros genéricos,
 * tipografías del kit y el logo donde no pise ningún texto.
 *
 * `acentoPrevio` es el color con que se armó la escena (para reemplazarlo).
 */
export function aplicarKit(e: Escena, kitCrudo: KitDeMarca | null | undefined, acentoPrevio?: string | null, opts: { arriba?: number } = {}): Escena {
  const k = normalizarKit(kitCrudo);
  if (kitVacio(k)) return e;
  const previo = normalizarHex(acentoPrevio);
  const tintaPrevia = previo ? tintaSobre(previo) : null;
  const mapa = (c?: string | null): string | null | undefined => {
    if (!c) return c;
    const n = normalizarHex(c);
    if (!n) return c;
    if (k.acento && previo && n === previo) return k.acento;
    if (k.oscuro && OSCUROS.has(n)) return k.oscuro;
    // El blanco de los botones invertidos y de las tarjetas se deja: es
    // contraste, no fondo. Solo los fondos claros "de maqueta" se cambian.
    if (k.claro && CLAROS.has(n) && n !== "#ffffff") return k.claro;
    return c;
  };
  const capas: Capa[] = e.capas.map((c) => {
    if (c.tipo === "forma") return { ...c, relleno: mapa(c.relleno) || c.relleno, borde: mapa(c.borde) ?? c.borde };
    if (c.tipo === "degradado") return c;
    if (c.tipo === "texto") {
      let color = c.color;
      // Texto que iba SOBRE el acento viejo: su tinta se recalcula para el nuevo.
      if (k.acento && tintaPrevia && c.color && normalizarHex(c.color) === normalizarHex(tintaPrevia)) {
        const debajo = e.capas.find((f) => f.tipo === "forma" && previo && normalizarHex(f.relleno) === previo && solapan(f, c));
        if (debajo) color = [k.claro, k.oscuro].find((t): t is string => !!t && contraste(k.acento!, t) >= 4.5) || tintaSobre(k.acento);
      }
      const nuevo = { ...c, color: mapa(color) || color, fondo: mapa(c.fondo) ?? c.fondo, contorno: mapa(c.contorno) ?? c.contorno };
      const esTitular = TITULARES.has(c.nombre || "");
      if (esTitular && k.titulos && c.fuente !== "caveat") nuevo.fuente = k.titulos;
      else if (!esTitular && k.texto && c.fuente !== "caveat") nuevo.fuente = k.texto;
      return nuevo;
    }
    return c;
  });
  // Texto sobre un fondo que ahora es de otro color: si no se lee, se pasa a
  // la tinta que sí se lee (el kit no puede dejar un titular invisible).
  const fondoDe = (t: Capa): string | null => {
    for (let i = capas.indexOf(t) - 1; i >= 0; i--) {
      const f = capas[i]!;
      if (f.oculta || !solapan(f, t)) continue;
      if (f.tipo === "forma") return normalizarHex(f.relleno);
      return null; // foto o degradado: no se sabe
    }
    return normalizarHex(e.fondo);
  };
  for (const c of capas) {
    if (c.tipo !== "texto" || c.fondo) continue;
    const fondo = fondoDe(c), color = normalizarHex(c.color);
    // Mismo umbral que el revisor (escena.ts): 3:1 para titulares, 4.5:1 para texto chico.
    const minimo = c.tam >= 5 ? 3 : 4.5;
    if (fondo && color && contraste(fondo, color) < minimo) {
      // Primero las tintas de la marca; el negro/blanco genérico, último recurso.
      c.color = [k.oscuro, k.claro, k.acento].find((t): t is string => !!t && contraste(fondo, t) >= minimo) || tintaSobre(fondo);
    }
  }
  let fondo = mapa(e.fondo) || e.fondo;
  // El logo: arriba a la izquierda, chico, solo si no pisa ningún texto.
  if (k.logo) {
    const caja = { x: 5, y: (opts.arriba ?? 4) - 1, w: 18, h: 7 };
    const pisa = capas.some((c) => c.tipo === "texto" && !c.oculta && solapan(c, caja));
    const alt = { ...caja, x: 77 };
    const pisaAlt = capas.some((c) => c.tipo === "texto" && !c.oculta && solapan(c, alt));
    const lugar = !pisa ? caja : !pisaAlt ? alt : null;
    if (lugar) capas.push({ id: `logo-${Date.now().toString(36)}`, tipo: "imagen", nombre: "Logo", src: k.logo, ajuste: "contain", focoX: lugar.x < 50 ? 0 : 100, focoY: 50, ...lugar } as Capa);
  }
  return { ...e, fondo, capas };
}
