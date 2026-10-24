/**
 * Maquetas de creativos para anuncios de Facebook / Instagram.
 *
 * Cada maqueta es una FUNCIÓN de (datos del producto, formato) → escena. No
 * es una imagen fija con huecos: la composición se recalcula para 1:1, 4:5,
 * 9:16 y 1.91:1, y el tamaño del titular se ajusta al largo del texto.
 *
 * ⚠️ La primera versión (14-10) ponía cada pieza en un % fijo y al
 * fotografiarlas el botón pisaba el titular en 9:16 y la lista chocaba con el
 * botón en 4:5: un titular de 2 líneas y uno de 4 no ocupan lo mismo. Ahora
 * las piezas se APILAN: se estima cuánto alto ocupa cada texto (largo,
 * fuente, ancho de la caja) y se colocan una debajo de la otra, arriba y
 * abajo de la foto, sin cruzarse.
 *
 * Los datos salen de la base (precio, fotos, sellos de entrega del negocio,
 * características). La maqueta NO inventa nada: sin precio no hay cartel de
 * precio; si el negocio no cobra contraentrega, no dice "paga al recibir".
 *
 * Patrones tomados de los formatos que más se repiten en la Biblioteca de
 * Anuncios de Meta para dropshipping y COD en LATAM (foto a sangre con
 * gancho, sello de precio, lista con checks, nota "nativa", precio
 * protagonista). HIPÓTESIS de diseño, no benchmark: se miden con el anuncio.
 */
import type { Capa, CapaTexto, Escena, Formato } from "./escena";
import { FORMATOS, idNuevo } from "./escena";

export interface DatosCreativo {
  nombre: string;
  /** El gancho: 3–8 palabras que frenan el scroll. */
  gancho: string;
  /** Una línea de apoyo (beneficio o promesa). */
  apoyo?: string | null;
  /** Texto del botón. */
  cta: string;
  /** Precio ya formateado ("$89.900"), o null si no se debe mostrar. */
  precio?: string | null;
  /** Sellos reales del negocio ("Paga al recibir", "Envío gratis"). */
  sellos?: string[];
  beneficios?: string[];
  fotos: string[];
  acento: string;
  sobreAcento: string;
  marca?: string | null;
}

export interface Maqueta {
  id: string;
  nombre: string;
  descripcion: string;
  /** Formato donde mejor luce (se ofrece primero). */
  ideal: Formato;
  armar: (d: DatosCreativo, formato: Formato) => Escena;
}

// ── Diagramación ────────────────────────────────────────────────────────────

interface Ctx {
  f: Formato; ancho: number; alto: number;
  /** Horizontal (1.91:1). */
  h: boolean;
  /** Dónde puede empezar el texto (zona segura de arriba), % del alto. */
  arriba: number;
  /** Hasta dónde puede llegar el texto (zona segura de abajo), % del alto. */
  abajo: number;
}

function ctx(f: Formato): Ctx {
  const { ancho, alto } = FORMATOS[f];
  // 9:16: Reels tapa ~14 % arriba y ~35 % abajo (ver ZONAS_SEGURAS en escena.ts).
  return { f, ancho, alto, h: alto / ancho < 0.8, arriba: f === "9:16" ? 14 : f === "1.91:1" ? 9 : 6, abajo: f === "9:16" ? 65 : f === "4:5" ? 91.5 : f === "1.91:1" ? 91 : 94 };
}

/** px del lienzo → % del alto. */
const pxY = (c: Ctx, px: number) => (px / c.alto) * 100;

/** Ancho medio de una letra, en "em", por familia (aproximado, del lado seguro). */
function anchoDeLetra(fuente: string | undefined, mayus: boolean | undefined, peso = 800): number {
  const f = fuente || "inter";
  if (f === "anton" || f === "bebas") return 0.44;
  if (f === "archivo-black") return 0.66;
  if (f === "caveat") return 0.42;
  if (["playfair", "dm-serif", "cormorant", "merriweather"].includes(f)) return mayus ? 0.66 : 0.52;
  const base = peso >= 800 ? 0.58 : 0.54;
  return mayus ? base + 0.1 : base;
}

/** Cuántas líneas ocupa el texto, partiendo por palabras como el navegador. */
export function lineasDe(texto: string, tamPx: number, anchoPx: number, em: number): number {
  const porLinea = Math.max(4, Math.floor(anchoPx / (tamPx * em)));
  let total = 0;
  for (const parrafo of texto.split("\n")) {
    let lineas = 1, actual = 0;
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const largo = palabra.length;
      if (actual === 0) actual = largo;
      else if (actual + 1 + largo <= porLinea) actual += 1 + largo;
      else { lineas++; actual = largo; }
      while (actual > porLinea) { lineas++; actual -= porLinea; }
    }
    total += lineas;
  }
  return Math.max(1, total);
}

type PropsTexto = Partial<CapaTexto> & { texto: string; x: number; w: number; tam: number };

/** Alto (en % del lienzo) que ocupa un texto. */
function altoDeTexto(c: Ctx, p: PropsTexto): number {
  const px = (p.tam / 100) * c.ancho;
  const relleno = p.fondo ? ((p.relleno ?? 2) / 100) * c.ancho : 0;
  const anchoPx = (p.w / 100) * c.ancho - relleno * 2;
  const n = lineasDe(p.texto, px, anchoPx, anchoDeLetra(p.fuente, p.mayus, p.peso));
  return pxY(c, n * px * (p.interlineado ?? 1.12) + relleno * 1.2) + 0.4;
}

/** El tamaño más grande (≤ max, ≥ min) con el que el texto entra en `presupuesto` % de alto. */
function ajustar(c: Ctx, p: Omit<PropsTexto, "tam">, max: number, min: number, presupuesto: number): number {
  for (let tam = max; tam > min; tam = +(tam - 0.25).toFixed(2)) {
    if (altoDeTexto(c, { ...p, tam }) <= presupuesto) return tam;
  }
  return min;
}

interface Pieza { alto: number; poner: (y: number) => Capa[] }

const t = (p: Partial<CapaTexto> & { texto: string; x: number; y: number; w: number; h: number }): Capa =>
  ({ id: idNuevo("t"), tipo: "texto", tam: 6, peso: 800, color: "#ffffff", alinear: "left", vertical: "top", fuente: "inter", interlineado: 1.12, ...p }) as Capa;
const img = (p: Partial<Extract<Capa, { tipo: "imagen" }>> & { src: string; x: number; y: number; w: number; h: number }): Capa =>
  ({ id: idNuevo("i"), tipo: "imagen", ajuste: "cover", nombre: "Foto", ...p }) as Capa;
const forma = (p: Partial<Extract<Capa, { tipo: "forma" }>> & { x: number; y: number; w: number; h: number; relleno: string }): Capa =>
  ({ id: idNuevo("f"), tipo: "forma", forma: "rect", ...p }) as Capa;
const deg = (p: Partial<Extract<Capa, { tipo: "degradado" }>> & { x: number; y: number; w: number; h: number }): Capa =>
  ({ id: idNuevo("d"), tipo: "degradado", desde: "rgba(0,0,0,0)", hasta: "rgba(0,0,0,.8)", angulo: 180, nombre: "Sombra", ...p }) as Capa;

function pzTexto(c: Ctx, p: PropsTexto): Pieza {
  const alto = altoDeTexto(c, p);
  return { alto, poner: (y) => [t({ ...p, y, h: alto })] };
}

function pzBoton(c: Ctx, d: DatosCreativo, x: number, w: number, invertido = false, oscuro?: string): Pieza {
  const alto = pxY(c, c.h ? 96 : 116);
  const tam = c.h ? 2.5 : 3.9;
  return {
    alto,
    poner: (y) => [
      forma({ x, y, w, h: alto, relleno: oscuro || (invertido ? "#ffffff" : d.acento), forma: "pastilla", sombra: true, nombre: "Botón" }),
      t({ texto: d.cta, x, y, w, h: alto, alinear: "center", vertical: "center", tam, peso: 800, color: oscuro ? "#ffffff" : invertido ? d.acento : d.sobreAcento, nombre: "Texto del botón" }),
    ],
  };
}

/** Piezas lado a lado, centradas en alto. */
function pzFila(...ps: (Pieza | null)[]): Pieza {
  const piezas = ps.filter((p): p is Pieza => !!p);
  const alto = Math.max(...piezas.map((p) => p.alto));
  return { alto, poner: (y) => piezas.flatMap((p) => p.poner(y + (alto - p.alto) / 2)) };
}

/** Apila hacia abajo desde `y0`. */
function apilar(c: Ctx, ps: (Pieza | null)[], y0: number, separacionPx = 26): { capas: Capa[]; fin: number } {
  let y = y0;
  const capas: Capa[] = [];
  for (const p of ps.filter((x): x is Pieza => !!x)) {
    capas.push(...p.poner(y));
    y += p.alto + pxY(c, separacionPx);
  }
  return { capas, fin: y - pxY(c, separacionPx) };
}

/** Apila de modo que la última pieza termine en `yFin`. */
function apilarHasta(c: Ctx, ps: (Pieza | null)[], yFin: number, separacionPx = 26): { capas: Capa[]; inicio: number } {
  const piezas = ps.filter((x): x is Pieza => !!x);
  const total = piezas.reduce((s, p) => s + p.alto, 0) + pxY(c, separacionPx) * Math.max(0, piezas.length - 1);
  const inicio = yFin - total;
  return { capas: apilar(c, piezas, inicio, separacionPx).capas, inicio };
}

const foto = (d: DatosCreativo, i = 0) => d.fotos[i] || d.fotos[0] || "";
const sellosTexto = (d: DatosCreativo, max = 3) => (d.sellos || []).slice(0, max).join("  ·  ");

function escena(f: Formato, fondo: string, capas: Capa[]): Escena {
  return { version: 1, formato: f, fondo, capas: capas.filter((c) => c.tipo !== "imagen" || !!(c as any).src) };
}

/**
 * Composición "sándwich": texto arriba, foto en el medio, texto abajo. La
 * foto ocupa lo que quede libre; nunca se cruza con el texto.
 */
function sandwich(c: Ctx, arriba: (Pieza | null)[], abajo: (Pieza | null)[], medio: (y0: number, y1: number) => Capa[], separacionPx = 26): Capa[] {
  const top = apilar(c, arriba, c.arriba + 1, separacionPx);
  const bot = apilarHasta(c, abajo, c.abajo, separacionPx);
  const y0 = (arriba.some(Boolean) ? top.fin : c.arriba) + pxY(c, 34);
  const y1 = (abajo.some(Boolean) ? bot.inicio : c.abajo) - pxY(c, 34);
  return [...medio(y0, Math.max(y0 + 10, y1)), ...top.capas, ...bot.capas];
}

/**
 * Horizontal (1.91:1): columna de texto a la izquierda, foto a la derecha.
 * La comparten casi todas las maquetas; cada una pone sus colores.
 */
function horizontalBasico(c: Ctx, d: DatosCreativo, o: { fondo: string; tinta: string; fuente?: string; mayus?: boolean; fotoAjuste?: "cover" | "contain"; boton?: { invertido?: boolean; oscuro?: string } }): Capa[] {
  const w = 44;
  const gancho = pzTexto(c, { texto: d.gancho, x: 5, w, fuente: o.fuente, mayus: o.mayus, color: o.tinta, peso: 900, nombre: "Gancho", tam: ajustar(c, { texto: d.gancho, x: 5, w, fuente: o.fuente, mayus: o.mayus, peso: 900 }, 6.4, 3.6, 40) });
  const apoyo = d.apoyo ? pzTexto(c, { texto: d.apoyo, x: 5, w, tam: 2.3, peso: 500, color: o.tinta, opacidad: 0.85, nombre: "Apoyo" }) : null;
  const precio = d.precio ? pzTexto(c, { texto: d.precio, x: 5, w, tam: 4, peso: 900, fuente: "anton", color: o.tinta, nombre: "Precio" }) : null;
  const piezas = [gancho, apoyo, precio, pzBoton(c, d, 5, 26, o.boton?.invertido, o.boton?.oscuro)];
  const total = piezas.reduce((s, p) => s + (p?.alto || 0), 0) + pxY(c, 22) * (piezas.filter(Boolean).length - 1);
  const col = apilar(c, piezas, Math.max(c.arriba, 50 - total / 2), 22);
  return [
    forma({ x: 0, y: 0, w: 100, h: 100, relleno: o.fondo, nombre: "Fondo" }),
    img({ src: foto(d), x: 52, y: o.fotoAjuste === "contain" ? 8 : 0, w: o.fotoAjuste === "contain" ? 44 : 48, h: o.fotoAjuste === "contain" ? 84 : 100, ajuste: o.fotoAjuste || "cover", sombra: o.fotoAjuste === "contain" }),
    ...col.capas,
  ];
}

/** Botón centrado de ancho cómodo. */
const botonCentrado = (c: Ctx, d: DatosCreativo, invertido = false, oscuro?: string) => pzBoton(c, d, 20, 60, invertido, oscuro);

// ── Las maquetas ────────────────────────────────────────────────────────────

/** Art-directed, bounded composition: one headline, one image, one offer.
 * Fixed areas per format keep text away from the image even with long titles. */
function premium(d: DatosCreativo, f: Formato, style: 'academia' | 'nocturno' | 'boutique'): Escena {
  const c = ctx(f), dark = style === 'nocturno';
  const bg = dark ? '#0b1220' : style === 'academia' ? '#f5f2eb' : '#f4f7f3';
  const ink = dark ? '#f8fafc' : '#15283d';
  const muted = dark ? '#a6b6cc' : '#53647b';
  const paper = dark ? '#192942' : '#ffffff';
  const font = style === 'academia' ? 'playfair' : style === 'boutique' ? 'dm-serif' : 'inter';
  const story = f === '9:16';
  const x = 7, w = c.h ? 43 : 86;
  const headY = c.arriba + (c.h ? 3 : 4);
  const headH = c.h ? 28 : story ? 12 : 20;
  const text = { texto: d.gancho, x, w, fuente: font, peso: 800, color: ink, nombre: 'Gancho' };
  const bottomY = c.abajo - (c.h ? 14 : story ? 6 : 9);
  const photoY = c.h ? 8 : headY + headH + 3;
  const photoEnd = c.h ? 92 : bottomY - 3;
  const capas: Capa[] = [
    forma({ x: 0, y: 0, w: 100, h: 100, relleno: bg, nombre: 'Fondo' }),
    forma({ x: 7, y: c.arriba, w: 7, h: .35, relleno: d.acento, nombre: 'Acento editorial' }),
    ...(d.marca ? [t({ texto: d.marca, x: 17, y: c.arriba - .5, w: 76, h: 3, tam: c.h ? 1.6 : 2.2, peso: 600, color: muted, nombre: 'Marca' })] : []),
    t({ ...text, y: headY, h: headH, tam: ajustar(c, text, c.h ? 5 : 7.6, 2.4, headH - 1), interlineado: 1.08 }),
    forma({ x: c.h ? 55 : 7, y: photoY, w: c.h ? 38 : 86, h: photoEnd - photoY, relleno: paper, radio: 26, nombre: 'Superficie de producto' }),
    img({ src: foto(d), x: c.h ? 57 : 10, y: photoY + 1.5, w: c.h ? 34 : 80, h: photoEnd - photoY - 3, ajuste: 'contain', radio: 16, nombre: 'Foto principal' }),
  ];
  if (c.h && d.apoyo) capas.push(t({ texto: d.apoyo, x, y: headY + headH + 3, w, h: 17, tam: ajustar(c, { texto: d.apoyo, x, w, peso: 500 }, 2.1, 1.5, 16), peso: 500, color: muted, nombre: 'Apoyo' }));
  const buttonX = d.precio ? (c.h ? 27 : 50) : x;
  const buttonW = c.h ? (d.precio ? 23 : 38) : (d.precio ? 43 : 86);
  const buttonH = c.abajo - bottomY;
  if (d.precio) capas.push(t({ texto: d.precio, x, y: bottomY, w: c.h ? 19 : 39, h: buttonH, tam: ajustar(c, { texto: d.precio, x, w: c.h ? 19 : 39, peso: 800 }, c.h ? 3.2 : 5.4, 2, buttonH), color: ink, vertical: 'center', nombre: 'Precio' }));
  capas.push(forma({ x: buttonX, y: bottomY, w: buttonW, h: buttonH, relleno: d.acento, radio: 16, nombre: 'Botón' }),
    t({ texto: d.cta, x: buttonX + 2, y: bottomY, w: buttonW - 4, h: buttonH, tam: ajustar(c, { texto: d.cta, x: buttonX + 2, w: buttonW - 4, peso: 700 }, c.h ? 2.1 : 3.2, 1.6, buttonH - 1), peso: 700, color: d.sobreAcento, alinear: 'center', vertical: 'center', nombre: 'Texto del botón' }));
  return escena(f, bg, capas);
}

export const MAQUETAS: Maqueta[] = [
  { id: 'academia-editorial', nombre: 'Academia editorial', descripcion: 'Portada de curso: tipografía editorial, papel cálido y producto protagonista.', ideal: '4:5', armar: (d, f) => premium(d, f, 'academia') },
  { id: 'digital-nocturno', nombre: 'Digital nocturno', descripcion: 'Tecnología, herramientas y packs con profundidad y contraste sobrio.', ideal: '4:5', armar: (d, f) => premium(d, f, 'nocturno') },
  { id: 'boutique-esencial', nombre: 'Boutique esencial', descripcion: 'Producto en una superficie limpia, precio claro y composición editorial.', ideal: '1:1', armar: (d, f) => premium(d, f, 'boutique') },
  {
    id: "impacto",
    nombre: "Impacto a sangre",
    descripcion: "Foto a pantalla completa, gancho enorme abajo y botón. La más directa.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      const w = c.h ? 56 : 88;
      const base = { texto: d.gancho, x: 6, w, fuente: "anton", mayus: true, sombra: true, nombre: "Gancho" };
      const gancho = pzTexto(c, { ...base, tam: ajustar(c, base, c.h ? 7.2 : 12.5, c.h ? 4 : 7, c.h ? 44 : 26), interlineado: 1.02 });
      const apoyo = d.apoyo ? pzTexto(c, { texto: d.apoyo, x: 6, w, tam: c.h ? 2.4 : 3.8, peso: 600, sombra: true, nombre: "Apoyo" }) : null;
      const fila = pzFila(
        pzBoton(c, d, 6, c.h ? 26 : 52),
        d.precio ? pzTexto(c, { texto: d.precio, x: c.h ? 34 : 60, w: c.h ? 26 : 34, tam: c.h ? 4.2 : 7, fuente: "anton", alinear: c.h ? "left" : "right", sombra: true, nombre: "Precio" }) : null,
      );
      const pila = apilarHasta(c, [gancho, apoyo, fila], c.abajo, 24);
      const desde = Math.max(0, pila.inicio - 16);
      return escena(f, "#111111", [
        img({ src: foto(d), x: 0, y: 0, w: 100, h: 100, nombre: "Foto de fondo" }),
        deg({ x: 0, y: desde, w: 100, h: 100 - desde }),
        ...pila.capas,
      ]);
    },
  },
  {
    id: "sello-oferta",
    nombre: "Sello de precio",
    descripcion: "Fondo limpio, producto al centro y una estrella con el precio. Clásico de tienda.",
    ideal: "1:1",
    armar: (d, f) => {
      const c = ctx(f);
      if (c.h) {
        const capas = horizontalBasico(c, { ...d, precio: null }, { fondo: "#f6f7f9", tinta: "#111827", fotoAjuste: "contain" });
        if (d.precio) capas.push(...sello(c, d, 80, 6, 16));
        return escena(f, "#f6f7f9", capas);
      }
      const base = { texto: d.gancho, x: 8, w: 84, alinear: "center" as const, color: "#111827", peso: 900, nombre: "Gancho" };
      const capas = sandwich(
        c,
        [pzTexto(c, { ...base, tam: ajustar(c, base, 8.6, 5.2, 18) })],
        [sellosTexto(d) ? pzTexto(c, { texto: sellosTexto(d), x: 6, w: 88, alinear: "center", tam: 3, peso: 700, color: "#374151", nombre: "Sellos" }) : null, botonCentrado(c, d)],
        (y0, y1) => {
          const alto = y1 - y0;
          const out: Capa[] = [
            forma({ x: 14, y: y0, w: 72, h: alto, relleno: d.acento, forma: "circulo", opacidad: 0.1, nombre: "Halo" }),
            img({ src: foto(d), x: 10, y: y0, w: 80, h: alto, ajuste: "contain", sombra: true }),
          ];
          if (d.precio) out.push(...sello(c, d, 66, y0, 28));
          return out;
        },
      );
      return escena(f, "#f6f7f9", [forma({ x: 0, y: 0, w: 100, h: 100, relleno: "#f6f7f9", nombre: "Fondo" }), ...capas]);
    },
  },
  {
    id: "beneficios",
    nombre: "Beneficios con checks",
    descripcion: "Foto arriba y 3 beneficios reales con ✓. Ideal cuando el producto necesita explicarse.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      const bens = (d.beneficios || []).slice(0, 3);
      const lista = bens.length ? bens.map((b) => `✓  ${b}`).join("\n") : d.apoyo || "";
      if (c.h) {
        const capas = horizontalBasico(c, { ...d, apoyo: lista }, { fondo: "#ffffff", tinta: "#111827" });
        return escena(f, "#ffffff", capas);
      }
      // La foto arriba; el texto se apila debajo y la foto cede lo que haga falta.
      const base = { texto: d.gancho, x: 7, w: 86, color: "#111827", peso: 900, nombre: "Gancho" };
      const gancho = pzTexto(c, { ...base, tam: ajustar(c, base, 7.8, 5, 15) });
      const items = lista ? pzTexto(c, { texto: lista, x: 7, w: 86, tam: f === "1:1" ? 3.5 : 3.9, peso: 600, color: "#1f2937", interlineado: 1.5, nombre: "Beneficios" }) : null;
      const fila = pzFila(pzBoton(c, d, 7, 52), d.precio ? pzTexto(c, { texto: d.precio, x: 62, w: 31, alinear: "right", tam: 5.6, peso: 900, color: "#111827", nombre: "Precio" }) : null);
      const pila = apilarHasta(c, [gancho, items, fila], c.abajo, 28);
      const corte = Math.max(30, pila.inicio - pxY(c, 46));
      return escena(f, "#ffffff", [
        img({ src: foto(d), x: 0, y: 0, w: 100, h: corte }),
        forma({ x: 0, y: corte, w: 100, h: pxY(c, 12), relleno: d.acento, nombre: "Línea" }),
        ...pila.capas,
      ]);
    },
  },
  {
    id: "premium",
    nombre: "Minimal premium",
    descripcion: "Mucho aire, serifa elegante y el producto con sombra. Para precio alto o belleza.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      if (c.h) return escena(f, "#f4efe8", horizontalBasico(c, d, { fondo: "#f4efe8", tinta: "#1a1815", fuente: "playfair", fotoAjuste: "contain", boton: { oscuro: "#1a1815" } }));
      const base = { texto: d.gancho, x: 8, w: 84, alinear: "center" as const, fuente: "playfair", peso: 700, color: "#1a1815", interlineado: 1.06, nombre: "Gancho" };
      const capas = sandwich(
        c,
        [
          pzTexto(c, { texto: d.marca || d.nombre, x: 8, w: 84, alinear: "center", tam: 2.6, peso: 600, color: "#8c7a5b", mayus: true, espaciado: 0.25, nombre: "Marca" }),
          pzTexto(c, { ...base, tam: ajustar(c, base, 8.4, 5, 18) }),
        ],
        [
          d.apoyo ? pzTexto(c, { texto: d.apoyo, x: 12, w: 76, alinear: "center", tam: 3.3, peso: 400, color: "#4a443b", nombre: "Apoyo" }) : null,
          pzBoton(c, d, 28, 44, false, "#1a1815"),
        ],
        (y0, y1) => [img({ src: foto(d), x: 12, y: y0, w: 76, h: y1 - y0, ajuste: "contain", sombra: true })],
        30,
      );
      return escena(f, "#f4efe8", [forma({ x: 0, y: 0, w: 100, h: 100, relleno: "#f4efe8", nombre: "Fondo" }), ...capas]);
    },
  },
  {
    id: "nota-nativa",
    nombre: "Nota nativa",
    descripcion: "Parece una publicación, no un anuncio: tarjeta blanca con el texto sobre la foto.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      const x = c.h ? 52 : 7, w = c.h ? 43 : 86;
      const pad = 3.6;
      const avatarW = c.h ? 5 : 9;
      const avatarH = (avatarW * c.ancho) / c.alto;
      const cuerpo = { texto: d.gancho, x: x + pad, w: w - pad * 2, peso: 800, color: "#111827", interlineado: 1.25, nombre: "Gancho" };
      const tam = ajustar(c, cuerpo, c.h ? 3.4 : 5.6, c.h ? 2.2 : 3.8, c.h ? 30 : 15);
      const altoCuerpo = altoDeTexto(c, { ...cuerpo, tam });
      const apoyo = d.apoyo ? { texto: d.apoyo, x: x + pad, w: w - pad * 2, peso: 400, color: "#374151", interlineado: 1.3, tam: +(tam * 0.72).toFixed(2), nombre: "Apoyo" } : null;
      const altoApoyo = apoyo ? altoDeTexto(c, apoyo) : 0;
      const sep = apoyo ? pxY(c, 14) : 0;
      const y0 = c.h ? 10 : c.arriba + 1;
      const padY = pxY(c, (pad / 100) * c.ancho);
      const altoTarjeta = padY + avatarH + pxY(c, 22) + altoCuerpo + sep + altoApoyo + padY;
      return escena(f, "#000000", [
        img({ src: foto(d), x: 0, y: 0, w: 100, h: 100 }),
        forma({ x, y: y0, w, h: altoTarjeta, relleno: "#ffffff", radio: 30, sombra: true, nombre: "Tarjeta" }),
        forma({ x: x + pad, y: y0 + padY, w: avatarW, h: avatarH, relleno: d.acento, forma: "circulo", nombre: "Avatar" }),
        t({ texto: d.marca || d.nombre, x: x + pad + avatarW + 2, y: y0 + padY, w: w - pad * 2 - avatarW - 2, h: avatarH, vertical: "center", tam: c.h ? 2 : 3, peso: 800, color: "#111827", nombre: "Cuenta" }),
        t({ ...cuerpo, tam, y: y0 + padY + avatarH + pxY(c, 22), h: altoCuerpo }),
        ...(apoyo ? [t({ ...apoyo, y: y0 + padY + avatarH + pxY(c, 22) + altoCuerpo + sep, h: altoApoyo })] : []),
        ...apilarHasta(c, [c.h ? pzBoton(c, d, 52, 30) : botonCentrado(c, d)], c.abajo).capas,
      ]);
    },
  },
  {
    id: "precio-protagonista",
    nombre: "Precio protagonista",
    descripcion: "Fondo de color de la marca y el precio en grande. Para ofertas y productos de impulso.",
    ideal: "1:1",
    armar: (d, f) => {
      const c = ctx(f);
      if (c.h) return escena(f, d.acento, horizontalBasico(c, d, { fondo: d.acento, tinta: d.sobreAcento, fotoAjuste: "contain", boton: { invertido: true } }));
      const precio = d.precio || d.cta;
      const g = { texto: d.gancho, x: 7, w: 86, alinear: "center" as const, color: d.sobreAcento, peso: 800, nombre: "Gancho" };
      const p = { texto: precio, x: 7, w: 86, alinear: "center" as const, color: d.sobreAcento, fuente: "anton", interlineado: 1, nombre: "Precio" };
      const capas = sandwich(
        c,
        [pzTexto(c, { ...g, tam: ajustar(c, g, 6.4, 4.2, 12) }), pzTexto(c, { ...p, tam: ajustar(c, p, 16, 8, 15) })],
        [sellosTexto(d) ? pzTexto(c, { texto: sellosTexto(d), x: 6, w: 88, alinear: "center", tam: 3, peso: 700, color: d.sobreAcento, nombre: "Sellos" }) : null, botonCentrado(c, d, true)],
        (y0, y1) => [
          forma({ x: 8, y: y0, w: 84, h: y1 - y0, relleno: "#ffffff", forma: "circulo", opacidad: 0.14, nombre: "Círculo" }),
          img({ src: foto(d), x: 14, y: y0, w: 72, h: y1 - y0, ajuste: "contain", sombra: true }),
        ],
        20,
      );
      return escena(f, d.acento, [forma({ x: 0, y: 0, w: 100, h: 100, relleno: d.acento, nombre: "Fondo" }), ...capas]);
    },
  },
  {
    id: "editorial",
    nombre: "Revista",
    descripcion: "Foto arriba, panel blanco abajo con titular de revista. Sobrio y creíble.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      if (c.h) return escena(f, "#ffffff", horizontalBasico(c, d, { fondo: "#ffffff", tinta: "#111827", fuente: "dm-serif" }));
      const g = { texto: d.gancho, x: 7, w: 86, fuente: "dm-serif", peso: 400, color: "#111827", interlineado: 1.04, nombre: "Gancho" };
      const pila = apilarHasta(c, [
        pzTexto(c, { ...g, tam: ajustar(c, g, 8.8, 5.4, 17) }),
        d.apoyo ? pzTexto(c, { texto: d.apoyo, x: 7, w: 86, tam: 3.5, peso: 400, color: "#4b5563", interlineado: 1.35, nombre: "Apoyo" }) : null,
        pzBoton(c, d, 7, 48),
      ], c.abajo, 26);
      const corte = Math.max(34, pila.inicio - pxY(c, 50));
      return escena(f, "#ffffff", [img({ src: foto(d), x: 0, y: 0, w: 100, h: corte }), ...pila.capas]);
    },
  },
  {
    id: "historia-gancho",
    nombre: "Historia con gancho",
    descripcion: "Pensada para Stories/Reels: foto completa, gancho resaltado línea por línea.",
    ideal: "9:16",
    armar: (d, f) => {
      const c = ctx(f);
      const w = c.h ? 56 : 84;
      const g = { texto: d.gancho, x: 8, w, fuente: "poppins", peso: 900, color: "#111827", fondo: "#ffffff", relleno: 2.2, radio: 14, interlineado: 1.5, nombre: "Gancho resaltado" };
      const pila = apilar(c, [
        pzTexto(c, { ...g, tam: ajustar(c, g, c.h ? 5 : 7.4, c.h ? 3 : 4.6, c.h ? 50 : 28) }),
        d.precio ? pzTexto(c, { texto: d.precio, x: 8, w: 60, fuente: "poppins", tam: c.h ? 3.4 : 5.4, peso: 900, color: d.sobreAcento, fondo: d.acento, relleno: 2, radio: 14, interlineado: 1.4, nombre: "Precio" }) : null,
      ], c.arriba + 1, 30);
      return escena(f, "#000000", [
        img({ src: foto(d), x: 0, y: 0, w: 100, h: 100 }),
        deg({ x: 0, y: 0, w: 100, h: Math.min(100, pila.fin + 12), desde: "rgba(0,0,0,.5)", hasta: "rgba(0,0,0,0)", nombre: "Sombra arriba" }),
        ...pila.capas,
        ...apilarHasta(c, [c.h ? pzBoton(c, d, 8, 28, true) : botonCentrado(c, d, true)], c.abajo).capas,
      ]);
    },
  },
  {
    id: "dos-fotos",
    nombre: "Dos fotos",
    descripcion: "Dos fotos reales lado a lado (dos ángulos, en uso / en caja).",
    ideal: "1:1",
    armar: (d, f) => {
      const c = ctx(f);
      const a = foto(d, 0), b = foto(d, 1);
      if (c.h) {
        return escena(f, "#ffffff", [
          img({ src: a, x: 0, y: 0, w: 50, h: 100, nombre: "Foto 1" }),
          img({ src: b, x: 50, y: 0, w: 50, h: 100, nombre: "Foto 2" }),
          deg({ x: 0, y: 40, w: 100, h: 60 }),
          ...apilarHasta(c, [pzTexto(c, { texto: d.gancho, x: 5, w: 90, alinear: "center", tam: ajustar(c, { texto: d.gancho, x: 5, w: 90, peso: 900 }, 5.4, 3.4, 26), peso: 900, sombra: true, nombre: "Gancho" }), pzBoton(c, d, 37, 26)], 92, 20).capas,
        ]);
      }
      const g = { texto: d.gancho, x: 7, w: 86, alinear: "center" as const, color: "#111827", peso: 900, nombre: "Gancho" };
      const capas = sandwich(c, [pzTexto(c, { ...g, tam: ajustar(c, g, 7.4, 4.6, 15) })], [botonCentrado(c, d)], (y0, y1) => [
        img({ src: a, x: 0, y: y0, w: 50, h: y1 - y0, nombre: "Foto 1" }),
        img({ src: b, x: 50, y: y0, w: 50, h: y1 - y0, nombre: "Foto 2" }),
        forma({ x: 49.6, y: y0, w: 0.8, h: y1 - y0, relleno: "#ffffff", nombre: "Divisor" }),
      ]);
      return escena(f, "#ffffff", capas);
    },
  },
  {
    id: "marco-color",
    nombre: "Marco de color",
    descripcion: "La foto enmarcada sobre el color de la marca, gancho arriba. Se nota en el feed.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      if (c.h) return escena(f, d.acento, horizontalBasico(c, d, { fondo: d.acento, tinta: d.sobreAcento, fuente: "montserrat", boton: { invertido: true } }));
      const g = { texto: d.gancho, x: 7, w: 86, alinear: "center" as const, color: d.sobreAcento, fuente: "montserrat", peso: 900, nombre: "Gancho" };
      const capas = sandwich(
        c,
        [pzTexto(c, { ...g, tam: ajustar(c, g, 7.8, 4.8, 15) })],
        [d.precio ? pzTexto(c, { texto: d.precio, x: 7, w: 86, alinear: "center", tam: 5.6, peso: 900, color: d.sobreAcento, nombre: "Precio" }) : null, botonCentrado(c, d, true)],
        (y0, y1) => [img({ src: foto(d), x: 8, y: y0, w: 84, h: y1 - y0, radio: 36, borde: "#ffffff", sombra: true })],
        22,
      );
      return escena(f, d.acento, [forma({ x: 0, y: 0, w: 100, h: 100, relleno: d.acento, nombre: "Fondo" }), ...capas]);
    },
  },
  {
    id: "cinta-oferta",
    nombre: "Cinta diagonal",
    descripcion: "Foto a sangre cruzada por una cinta de color con el gancho. Detiene el scroll.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      if (c.h) return escena(f, "#111827", horizontalBasico(c, d, { fondo: "#111827", tinta: "#ffffff", fuente: "anton", mayus: true, boton: {} }));
      const alto = pxY(c, 250);
      const yCinta = c.arriba + 10;
      const base = { texto: d.gancho, x: 4, w: 92, fuente: "anton", mayus: true, color: d.sobreAcento, alinear: "center" as const, vertical: "center" as const, interlineado: 1, nombre: "Gancho" };
      const tam = ajustar(c, base, 9.5, 5, alto * 0.9);
      const abajo = apilarHasta(c, [
        pzFila(
          d.precio ? pzTexto(c, { texto: d.precio, x: 6, w: 40, tam: 6.4, fuente: "anton", sombra: true, nombre: "Precio", vertical: "center" }) : null,
          pzBoton(c, d, d.precio ? 46 : 20, d.precio ? 48 : 60, true),
        ),
      ], c.abajo);
      return escena(f, "#111827", [
        img({ src: foto(d), x: 0, y: 0, w: 100, h: 100, nombre: "Foto de fondo" }),
        deg({ x: 0, y: 55, w: 100, h: 45, hasta: "rgba(0,0,0,.65)" }),
        forma({ x: -10, y: yCinta, w: 120, h: alto, relleno: d.acento, rot: -6, sombra: true, nombre: "Cinta" }),
        t({ ...base, tam, y: yCinta, h: alto, rot: -6 }),
        ...abajo.capas,
      ]);
    },
  },
  {
    id: "ficha-tecnica",
    nombre: "Ficha con tarjetas",
    descripcion: "El producto y sus 3 beneficios reales en tarjetas con ícono. Ordenada y confiable.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      const bens = (d.beneficios || []).slice(0, 3);
      if (c.h || !bens.length) return MAQUETAS.find((m) => m.id === "beneficios")!.armar(d, f);
      const iconos = ["✓", "★", "♥"];
      const g = { texto: d.gancho, x: 7, w: 86, alinear: "center" as const, color: "#0f172a", peso: 900, nombre: "Gancho" };
      const gancho = pzTexto(c, { ...g, tam: ajustar(c, g, 7.2, 4.6, 13) });
      const altoTarjeta = pxY(c, 120);
      const tarjetas: Pieza = {
        alto: altoTarjeta * bens.length + pxY(c, 14) * (bens.length - 1),
        poner: (y) => bens.flatMap((b, i) => {
          const yy = y + i * (altoTarjeta + pxY(c, 14));
          return [
            forma({ x: 7, y: yy, w: 86, h: altoTarjeta, relleno: "#ffffff", radio: 26, sombra: true, nombre: `Tarjeta ${i + 1}` }),
            forma({ x: 10, y: yy + altoTarjeta * 0.2, w: 8.5, h: altoTarjeta * 0.6, relleno: d.acento, radio: 18, nombre: `Ícono ${i + 1}` }),
            t({ texto: iconos[i]!, x: 10, y: yy + altoTarjeta * 0.2, w: 8.5, h: altoTarjeta * 0.6, alinear: "center", vertical: "center", tam: 4.2, color: d.sobreAcento, nombre: `Símbolo ${i + 1}` }),
            t({ texto: b, x: 22, y: yy, w: 68, h: altoTarjeta, vertical: "center", tam: ajustar(c, { texto: b, x: 22, w: 68, peso: 700 }, 3.8, 2.8, altoTarjeta * 0.9), peso: 700, color: "#0f172a", nombre: `Beneficio ${i + 1}` }),
          ];
        }),
      };
      const capas = sandwich(c, [gancho], [tarjetas, botonCentrado(c, d)], (y0, y1) => [
        forma({ x: 20, y: y0, w: 60, h: y1 - y0, relleno: d.acento, forma: "circulo", opacidad: 0.12, nombre: "Halo" }),
        img({ src: foto(d), x: 12, y: y0, w: 76, h: y1 - y0, ajuste: "contain", sombra: true }),
      ], 24);
      return escena(f, "#eef2f7", [forma({ x: 0, y: 0, w: 100, h: 100, relleno: "#eef2f7", nombre: "Fondo" }), ...capas]);
    },
  },
  {
    id: "polaroid",
    nombre: "Polaroid",
    descripcion: "La foto como polaroid inclinada, con nota escrita a mano. Cercana y auténtica.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      if (c.h) return escena(f, "#f3ede4", horizontalBasico(c, d, { fondo: "#f3ede4", tinta: "#2b2118", fuente: "playfair", boton: { oscuro: "#2b2118" } }));
      const g = { texto: d.gancho, x: 8, w: 84, alinear: "center" as const, color: "#2b2118", fuente: "playfair", peso: 700, nombre: "Gancho" };
      const capas = sandwich(c, [pzTexto(c, { ...g, tam: ajustar(c, g, 7.6, 4.8, 15) })], [pzBoton(c, d, 25, 50, false, "#2b2118")], (y0, y1) => {
        const alto = y1 - y0;
        const ancho = Math.min(74, (alto * c.alto) / c.ancho * 0.84);
        const x = (100 - ancho) / 2;
        const pie = alto * 0.18;
        return [
          forma({ x, y: y0, w: ancho, h: alto, relleno: "#ffffff", rot: -3, sombra: true, nombre: "Marco polaroid" }),
          img({ src: foto(d), x: x + ancho * 0.06, y: y0 + alto * 0.05, w: ancho * 0.88, h: alto - pie - alto * 0.05, rot: -3 }),
          t({ texto: d.apoyo || d.nombre, x: x + 4, y: y1 - pie, w: ancho - 8, h: pie, rot: -3, alinear: "center", vertical: "center", fuente: "caveat", tam: ajustar(c, { texto: d.apoyo || d.nombre, x, w: ancho - 8, fuente: "caveat", peso: 700 }, 5.6, 3.4, pie), peso: 700, color: "#2b2118", nombre: "Nota a mano" }),
        ];
      }, 30);
      return escena(f, "#f3ede4", [forma({ x: 0, y: 0, w: 100, h: 100, relleno: "#f3ede4", nombre: "Fondo" }), ...capas]);
    },
  },
  {
    id: "catalogo",
    nombre: "Catálogo",
    descripcion: "Cuatro fotos reales en grilla con el gancho y el precio. Para productos con variantes.",
    ideal: "1:1",
    armar: (d, f) => {
      const c = ctx(f);
      const fotos = [0, 1, 2, 3].map((i) => foto(d, i));
      if (c.h) {
        return escena(f, "#ffffff", [
          ...fotos.map((src, i) => img({ src, x: 50 + (i % 2) * 25, y: Math.floor(i / 2) * 50, w: 25, h: 50, nombre: `Foto ${i + 1}` })),
          ...horizontalBasico(c, d, { fondo: "#ffffff", tinta: "#111827" }).filter((x) => x.tipo !== "imagen").map((x) => (x.nombre === "Fondo" ? { ...x, w: 50 } : x)),
        ]);
      }
      const g = { texto: d.gancho, x: 6, w: 88, alinear: "center" as const, color: d.sobreAcento, peso: 900, nombre: "Gancho" };
      const capas = sandwich(c,
        [pzTexto(c, { ...g, tam: ajustar(c, g, 7, 4.4, 13) })],
        [pzFila(d.precio ? pzTexto(c, { texto: d.precio, x: 6, w: 38, tam: 6, peso: 900, color: d.sobreAcento, vertical: "center", nombre: "Precio" }) : null, pzBoton(c, d, d.precio ? 46 : 20, d.precio ? 48 : 60, true))],
        (y0, y1) => {
          const gap = 1.4, ancho = (88 - gap) / 2, alto = (y1 - y0 - gap) / 2;
          return fotos.map((src, i) => img({ src, x: 6 + (i % 2) * (ancho + gap), y: y0 + Math.floor(i / 2) * (alto + gap), w: ancho, h: alto, radio: 22, nombre: `Foto ${i + 1}` }));
        }, 22);
      return escena(f, d.acento, [forma({ x: 0, y: 0, w: 100, h: 100, relleno: d.acento, nombre: "Fondo" }), ...capas]);
    },
  },
  {
    id: "titular-gigante",
    nombre: "Titular gigante",
    descripcion: "Póster tipográfico: el gancho enorme, la última palabra en color y el producto abajo.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      if (c.h) return escena(f, "#0b0b0f", horizontalBasico(c, d, { fondo: "#0b0b0f", tinta: "#ffffff", fuente: "anton", mayus: true }));
      const palabras = d.gancho.trim().split(/\s+/);
      const resto = palabras.length > 2 ? palabras.slice(0, -1).join(" ") : d.gancho;
      const final = palabras.length > 2 ? palabras[palabras.length - 1]! : "";
      const b1 = { texto: resto, x: 6, w: 88, fuente: "anton", mayus: true, color: "#ffffff", interlineado: 0.98, nombre: "Gancho" };
      const tam = ajustar(c, b1, 17, 8, f === "9:16" ? 24 : 30);
      const piezas = [pzTexto(c, { ...b1, tam })];
      if (final) piezas.push(pzTexto(c, { texto: final, x: 6, w: 88, fuente: "anton", mayus: true, color: d.acento, tam, interlineado: 0.98, nombre: "Palabra en color" }));
      const capas = sandwich(c, piezas, [botonCentrado(c, d)], (y0, y1) => [
        forma({ x: 15, y: y0 + (y1 - y0) * 0.1, w: 70, h: (y1 - y0) * 0.9, relleno: d.acento, forma: "circulo", opacidad: 0.22, nombre: "Brillo" }),
        img({ src: foto(d), x: 10, y: y0, w: 80, h: y1 - y0, ajuste: "contain", sombra: true }),
      ], 8);
      return escena(f, "#0b0b0f", [forma({ x: 0, y: 0, w: 100, h: 100, relleno: "#0b0b0f", nombre: "Fondo" }), ...capas]);
    },
  },
  {
    id: "barra-confianza",
    nombre: "Barra de confianza",
    descripcion: "Foto a sangre y abajo una barra blanca con los sellos reales del negocio.",
    ideal: "4:5",
    armar: (d, f) => {
      const c = ctx(f);
      const sellos = (d.sellos || []).slice(0, 3);
      if (c.h || !sellos.length) return MAQUETAS.find((m) => m.id === "impacto")!.armar(d, f);
      const altoBarra = pxY(c, 150);
      const yBarra = c.abajo - altoBarra;
      const g = { texto: d.gancho, x: 6, w: 88, fuente: "montserrat", peso: 900, color: "#ffffff", sombra: true, nombre: "Gancho" };
      const arriba = apilar(c, [pzTexto(c, { ...g, tam: ajustar(c, g, 8.6, 5, 20) }), d.apoyo ? pzTexto(c, { texto: d.apoyo, x: 6, w: 88, tam: 3.6, peso: 600, color: "#ffffff", sombra: true, nombre: "Apoyo" }) : null], c.arriba + 1, 16);
      const boton = apilarHasta(c, [botonCentrado(c, d)], yBarra - pxY(c, 28));
      const anchoSello = 88 / sellos.length;
      return escena(f, "#000000", [
        img({ src: foto(d), x: 0, y: 0, w: 100, h: 100 }),
        deg({ x: 0, y: 0, w: 100, h: arriba.fin + 10, desde: "rgba(0,0,0,.62)", hasta: "rgba(0,0,0,0)", nombre: "Sombra arriba" }),
        ...arriba.capas,
        ...boton.capas,
        forma({ x: 4, y: yBarra, w: 92, h: altoBarra, relleno: "#ffffff", radio: 28, sombra: true, nombre: "Barra" }),
        ...sellos.flatMap((s, i) => [
          t({ texto: `✓ ${s}`, x: 6 + i * anchoSello, y: yBarra, w: anchoSello, h: altoBarra, alinear: "center", vertical: "center", tam: ajustar(c, { texto: `✓ ${s}`, x: 0, w: anchoSello - 2, peso: 800 }, 3.2, 2.2, altoBarra * 0.85), peso: 800, color: "#0f172a", nombre: `Sello ${i + 1}` }),
          ...(i > 0 ? [forma({ x: 6 + i * anchoSello - 0.15, y: yBarra + altoBarra * 0.25, w: 0.3, h: altoBarra * 0.5, relleno: "#e2e8f0", nombre: "Divisor" })] : []),
        ]),
      ]);
    },
  },
];

/** La estrella con el precio, cuadrada sobre cualquier formato. */
function sello(c: Ctx, d: DatosCreativo, x: number, y: number, ancho: number): Capa[] {
  const alto = (ancho * c.ancho) / c.alto;
  const texto = d.precio || "";
  return [
    forma({ x, y, w: ancho, h: alto, relleno: d.acento, forma: "estallido", rot: -10, sombra: true, nombre: "Estrella" }),
    // Una sola línea: el precio partido ("$89.90" / "0") no se lee.
    t({ texto, x: x + ancho * 0.1, y, w: ancho * 0.8, h: alto, rot: -10, alinear: "center", vertical: "center", tam: +Math.min(ancho * 0.2, (ancho * 0.8 * 0.92) / (Math.max(4, texto.length) * 0.7)).toFixed(2), peso: 900, color: d.sobreAcento, nombre: "Precio" }),
  ];
}

export function maquetaPorId(id: string | null | undefined): Maqueta {
  return MAQUETAS.find((m) => m.id === id) || MAQUETAS[0]!;
}
