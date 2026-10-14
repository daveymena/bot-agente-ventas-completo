/**
 * Tipografía sin depender del sistema.
 *
 * Los servidores (y el sandbox) no traen fuentes: `fc-list` vacío. Si el texto
 * de un anuncio se dibujara con `<text>` en SVG, sharp/librsvg lo pintaría con
 * cuadraditos o nada. Acá cada letra se convierte en su contorno (path) con
 * opentype.js, así el resultado es idéntico en cualquier máquina: eso es parte
 * de la "alta disponibilidad" del Estudio.
 *
 * Familias: Inter viaja en el repo (assets/fonts, OFL) y es la de siempre; las
 * demás son Google Fonts (OFL) que llegan por npm en los paquetes @fontsource
 * (archivos WOFF del subconjunto latino, que cubre el español con tildes y ñ).
 * El panel carga las mismas familias por CSS, así lo que se ve en el editor es
 * lo que pinta el servidor.
 *
 * Se arma el trazado glifo a glifo (sin el motor de sustituciones GSUB de
 * opentype.js, que no soporta algunas tablas de Inter) con interletraje por
 * pares. Los caracteres que la fuente no tiene (emojis, ✔) se omiten: los
 * iconos se dibujan aparte como elementos SVG (elementos.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

export type Peso = 400 | 700 | 900;

export type CategoriaFuente = "sans" | "display" | "serif" | "script" | "manuscrita";

export interface FamiliaFuente {
  id: string;
  /** Nombre para mostrar y `font-family` en el panel. */
  nombre: string;
  /** Paquete @fontsource (null = Inter, que viaja en assets/fonts). */
  paquete: string | null;
  /** Prefijo de los archivos dentro de `files/` del paquete. */
  archivo: string;
  pesos: Peso[];
  categoria: CategoriaFuente;
  /** Para qué sirve (ayuda al catálogo y a Atlas a elegir). */
  uso: string;
  /** Las condensadas en mayúsculas rinden más alto por px: factor de ancho aproximado respecto a Inter. */
  mayusculas?: boolean;
}

/** Catálogo de familias. Todas OFL (libres para uso comercial). */
export const FUENTES: FamiliaFuente[] = [
  { id: "inter", nombre: "Inter", paquete: null, archivo: "Inter", pesos: [400, 700, 900], categoria: "sans", uso: "Neutra y legible: la de siempre." },
  { id: "montserrat", nombre: "Montserrat", paquete: "@fontsource/montserrat", archivo: "montserrat", pesos: [400, 700, 900], categoria: "sans", uso: "Moderna, muy usada en anuncios de moda y belleza." },
  { id: "poppins", nombre: "Poppins", paquete: "@fontsource/poppins", archivo: "poppins", pesos: [400, 700, 900], categoria: "sans", uso: "Geométrica y amable: tecnología, apps, servicios." },
  { id: "nunito", nombre: "Nunito", paquete: "@fontsource/nunito", archivo: "nunito", pesos: [400, 700, 900], categoria: "sans", uso: "Redondeada y cercana: hogar, bebés, mascotas." },
  { id: "raleway", nombre: "Raleway", paquete: "@fontsource/raleway", archivo: "raleway", pesos: [400, 700, 900], categoria: "sans", uso: "Elegante y fina: decoración, joyería." },
  { id: "roboto", nombre: "Roboto", paquete: "@fontsource/roboto", archivo: "roboto", pesos: [400, 700, 900], categoria: "sans", uso: "Técnica y clara: electrónica, herramientas." },
  { id: "bebas", nombre: "Bebas Neue", paquete: "@fontsource/bebas-neue", archivo: "bebas-neue", pesos: [400], categoria: "display", uso: "Condensada en mayúsculas: ofertas, deporte, impacto.", mayusculas: true },
  { id: "anton", nombre: "Anton", paquete: "@fontsource/anton", archivo: "anton", pesos: [400], categoria: "display", uso: "Pesada y condensada: titulares que gritan.", mayusculas: true },
  { id: "oswald", nombre: "Oswald", paquete: "@fontsource/oswald", archivo: "oswald", pesos: [400, 700], categoria: "display", uso: "Condensada versátil: precios, promociones." },
  { id: "archivo", nombre: "Archivo Black", paquete: "@fontsource/archivo-black", archivo: "archivo-black", pesos: [400], categoria: "display", uso: "Negrita ancha: ofertas y Black Friday." },
  { id: "bangers", nombre: "Bangers", paquete: "@fontsource/bangers", archivo: "bangers", pesos: [400], categoria: "display", uso: "Cómic y energía: juguetes, snacks, fiestas.", mayusculas: true },
  { id: "righteous", nombre: "Righteous", paquete: "@fontsource/righteous", archivo: "righteous", pesos: [400], categoria: "display", uso: "Retro y redonda: gaming, bebidas, música." },
  { id: "fredoka", nombre: "Fredoka", paquete: "@fontsource/fredoka", archivo: "fredoka", pesos: [400, 700], categoria: "display", uso: "Gordita y divertida: niños, comida, mascotas." },
  { id: "playfair", nombre: "Playfair Display", paquete: "@fontsource/playfair-display", archivo: "playfair-display", pesos: [400, 700, 900], categoria: "serif", uso: "Serif elegante: joyería, cosmética premium, restaurantes." },
  { id: "abril", nombre: "Abril Fatface", paquete: "@fontsource/abril-fatface", archivo: "abril-fatface", pesos: [400], categoria: "serif", uso: "Serif de revista: moda y editoriales." },
  { id: "lobster", nombre: "Lobster", paquete: "@fontsource/lobster", archivo: "lobster", pesos: [400], categoria: "script", uso: "Caligráfica con cuerpo: comida, cafés, artesanías." },
  { id: "pacifico", nombre: "Pacifico", paquete: "@fontsource/pacifico", archivo: "pacifico", pesos: [400], categoria: "script", uso: "Casual de playa: verano, bebidas, viajes." },
  { id: "dancing", nombre: "Dancing Script", paquete: "@fontsource/dancing-script", archivo: "dancing-script", pesos: [700], categoria: "script", uso: "Romántica: amor y amistad, bodas, día de la madre." },
  { id: "caveat", nombre: "Caveat", paquete: "@fontsource/caveat", archivo: "caveat", pesos: [700], categoria: "manuscrita", uso: "A mano alzada: notas, 'hecho a mano', orgánico." },
  { id: "marker", nombre: "Permanent Marker", paquete: "@fontsource/permanent-marker", archivo: "permanent-marker", pesos: [400], categoria: "manuscrita", uso: "Marcador: urbano, descuentos, tachones." },
];

const POR_ID = new Map(FUENTES.map((f) => [f.id, f]));

export const FUENTE_POR_DEFECTO = "inter";

export function familiaDe(id?: string | null): FamiliaFuente {
  return (id && POR_ID.get(String(id).toLowerCase())) || POR_ID.get(FUENTE_POR_DEFECTO)!;
}

/** El peso que la familia realmente tiene más cercano al pedido (Bebas solo trae 400). */
export function pesoDisponible(familia: string | undefined | null, peso: Peso): Peso {
  const f = familiaDe(familia);
  if (f.pesos.includes(peso)) return peso;
  return f.pesos.reduce((mejor, p) => (Math.abs(p - peso) < Math.abs(mejor - peso) ? p : mejor), f.pesos[0]!);
}

const ARCHIVOS_INTER: Record<Peso, string> = { 400: "Inter-Regular.ttf", 700: "Inter-Bold.ttf", 900: "Inter-Black.ttf" };

type Fuente = ReturnType<typeof opentype.parse>;
const cache = new Map<string, Fuente>();
let dirResuelto: string | null | undefined;

function aqui(): string {
  try { return path.dirname(fileURLToPath(import.meta.url)); } catch { return process.cwd(); }
}

/** Carpeta con los TTF de Inter: src/lib/estudio-anuncios → assets/fonts, o dist → assets/fonts, o desde la raíz del monorepo. */
export function dirDeFuentes(): string | null {
  if (dirResuelto !== undefined) return dirResuelto;
  const base = aqui();
  const candidatos = [
    process.env.FUENTES_DIR,
    path.resolve(base, "../../../assets/fonts"),
    path.resolve(base, "../assets/fonts"),
    path.resolve(base, "../../assets/fonts"),
    path.resolve(process.cwd(), "artifacts/api-server/assets/fonts"),
    path.resolve(process.cwd(), "assets/fonts"),
    "/app/artifacts/api-server/assets/fonts",
  ].filter(Boolean) as string[];
  dirResuelto = candidatos.find((d) => fs.existsSync(path.join(d, ARCHIVOS_INTER[700]))) || null;
  return dirResuelto;
}

let requireLocal: NodeRequire | null = null;
function resolver(ruta: string): string | null {
  try {
    if (!requireLocal) requireLocal = createRequire(import.meta.url);
    return requireLocal.resolve(ruta);
  } catch {
    try { return createRequire(path.join(process.cwd(), "artifacts/api-server/package.json")).resolve(ruta); } catch { return null; }
  }
}

/** Ruta del archivo de una familia/peso (para servirla al editor del panel); null si no está instalada. */
export function archivoDeFuente(familia: string, peso: Peso): { ruta: string; formato: "woff" | "ttf" } | null {
  const f = POR_ID.get(familia);
  if (!f) return null;
  const ruta = archivoDe(f, pesoDisponible(f.id, peso));
  if (!ruta || !fs.existsSync(ruta)) return null;
  return { ruta, formato: ruta.endsWith(".woff") ? "woff" : "ttf" };
}

/** Hoja @font-face con las familias instaladas, apuntando a `base/<id>/<peso>`. El panel la carga una vez. */
export function cssDeFuentes(base: string): string {
  const reglas: string[] = [];
  for (const f of FUENTES) for (const peso of f.pesos) {
    const a = archivoDeFuente(f.id, peso);
    if (!a) continue;
    reglas.push(`@font-face{font-family:"${f.nombre}";font-style:normal;font-weight:${peso};font-display:swap;src:url("${base}/${f.id}/${peso}.${a.formato}") format("${a.formato === "woff" ? "woff" : "truetype"}")}`);
  }
  return reglas.join("\n");
}

function archivoDe(f: FamiliaFuente, peso: Peso): string | null {
  if (!f.paquete) {
    const dir = dirDeFuentes();
    return dir ? path.join(dir, ARCHIVOS_INTER[peso]) : null;
  }
  return resolver(`${f.paquete}/files/${f.archivo}-latin-${peso}-normal.woff`);
}

function parsear(ruta: string): Fuente {
  const buf = fs.readFileSync(ruta);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/**
 * Fuente cargada para (familia, peso). Si la familia no está instalada o el
 * archivo falta, cae a Inter: el anuncio sale igual, con otra letra.
 */
function fuente(peso: Peso, familia?: string | null): Fuente {
  const f = familiaDe(familia);
  const p = pesoDisponible(f.id, peso);
  const clave = `${f.id}:${p}`;
  const hit = cache.get(clave);
  if (hit) return hit;
  const ruta = archivoDe(f, p);
  if (ruta && fs.existsSync(ruta)) {
    try {
      const parsed = parsear(ruta);
      cache.set(clave, parsed);
      return parsed;
    } catch { /* archivo corrupto o formato raro: se usa Inter */ }
  }
  if (f.id !== FUENTE_POR_DEFECTO) return fuente(peso, FUENTE_POR_DEFECTO);
  throw new Error("No se encontraron las fuentes del Estudio de anuncios (assets/fonts/Inter-*.ttf).");
}

export function fuentesDisponibles(): boolean {
  try { fuente(700); return true; } catch { return false; }
}

/** Qué familias están realmente instaladas en este servidor (las que falten se pintan con Inter). */
export function familiasInstaladas(): string[] {
  return FUENTES.filter((f) => { const r = archivoDe(f, f.pesos[0]!); return !!r && fs.existsSync(r); }).map((f) => f.id);
}

/** Quita lo que la fuente no puede dibujar (emojis, símbolos) y normaliza espacios. */
export function limpiarTexto(texto: string): string {
  return String(texto ?? "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B50}\u{2B06}\u{2194}-\u{21FF}\u{2300}-\u{23FF}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ancho en px de `texto` a `size` px con el `peso` dado. */
export function medir(texto: string, size: number, peso: Peso = 700, familia?: string | null): number {
  const f = fuente(peso, familia);
  const escala = size / f.unitsPerEm;
  let x = 0; let prev: any = null;
  for (const ch of texto) {
    const g: any = f.charToGlyph(ch);
    if (!g || (g.index === 0 && ch !== " ")) continue;
    if (prev) x += f.getKerningValue(prev, g) * escala;
    x += (g.advanceWidth || 0) * escala;
    prev = g;
  }
  return x;
}

export interface Trazo { d: string; width: number }

const num = (v: number) => { const r = Math.round(v * 100) / 100; return (Object.is(r, -0) ? 0 : r).toString(); };

/**
 * Serializa los comandos de un trazado de opentype.js. No se usa
 * `toPathData()` porque en opentype.js 2.0 escribe "NaN" para ciertos
 * valores (p. ej. x = 216.00000000000003) y librsvg corta el texto ahí.
 */
function datosDeTrazado(p: { commands: Array<{ type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }> }): string {
  let d = "";
  for (const c of p.commands) {
    if (c.type === "M" || c.type === "L") d += `${c.type}${num(c.x!)} ${num(c.y!)}`;
    else if (c.type === "Q") d += `Q${num(c.x1!)} ${num(c.y1!)} ${num(c.x!)} ${num(c.y!)}`;
    else if (c.type === "C") d += `C${num(c.x1!)} ${num(c.y1!)} ${num(c.x2!)} ${num(c.y2!)} ${num(c.x!)} ${num(c.y!)}`;
    else if (c.type === "Z") d += "Z";
  }
  return d;
}

/**
 * Trazado SVG de una línea. `y` es la línea base. `anchor` alinea como en SVG.
 */
export function trazar(texto: string, x: number, y: number, size: number, peso: Peso = 700, anchor: "start" | "middle" | "end" = "start", familia?: string | null): Trazo {
  const f = fuente(peso, familia);
  const escala = size / f.unitsPerEm;
  const ancho = medir(texto, size, peso, familia);
  let cx = anchor === "middle" ? x - ancho / 2 : anchor === "end" ? x - ancho : x;
  let d = ""; let prev: any = null;
  for (const ch of texto) {
    const g: any = f.charToGlyph(ch);
    if (!g || (g.index === 0 && ch !== " ")) continue;
    if (prev) cx += f.getKerningValue(prev, g) * escala;
    if (ch !== " ") d += datosDeTrazado(g.getPath(cx, y, size));
    cx += (g.advanceWidth || 0) * escala;
    prev = g;
  }
  return { d, width: ancho };
}

/** Parte un texto en líneas que quepan en `maxWidth`; corta con "…" si supera `maxLines`. */
export function envolver(texto: string, size: number, peso: Peso, maxWidth: number, maxLines = 3, familia?: string | null): string[] {
  const palabras = limpiarTexto(texto).split(" ").filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  const cabe = (s: string) => medir(s, size, peso, familia) <= maxWidth;
  for (const p of palabras) {
    const intento = actual ? `${actual} ${p}` : p;
    if (cabe(intento)) { actual = intento; continue; }
    if (actual) lineas.push(actual);
    if (cabe(p)) { actual = p; continue; }
    // Palabra más ancha que la caja: se parte por letras.
    let trozo = "";
    for (const ch of p) {
      if (cabe(trozo + ch)) trozo += ch;
      else { if (trozo) lineas.push(trozo); trozo = ch; }
    }
    actual = trozo;
  }
  if (actual) lineas.push(actual);
  // Sin viudas: una última línea de una sola palabra corta ("1 L" → "L") se reparte con la anterior.
  if (lineas.length >= 2) {
    const ultima = lineas[lineas.length - 1]!, previa = lineas[lineas.length - 2]!;
    if (!ultima.includes(" ") && ultima.length <= 3) {
      const palabrasPrevia = previa.split(" ");
      if (palabrasPrevia.length >= 3) {
        const movida = palabrasPrevia.pop()!;
        const nuevaPrevia = palabrasPrevia.join(" "), nuevaUltima = `${movida} ${ultima}`;
        if (cabe(nuevaUltima)) { lineas[lineas.length - 2] = nuevaPrevia; lineas[lineas.length - 1] = nuevaUltima; }
      }
    }
  }
  if (lineas.length <= maxLines) return lineas;
  const corte = lineas.slice(0, maxLines);
  let ultima = corte[maxLines - 1]!;
  while (ultima && !cabe(`${ultima}…`)) ultima = ultima.replace(/\s*\S+$/, "");
  corte[maxLines - 1] = `${ultima || corte[maxLines - 1]!.slice(0, 3)}…`;
  return corte;
}

export interface Parrafo {
  /** Grupo SVG con los trazados ya posicionados. */
  svg: string;
  /** Alto total ocupado (px). */
  height: number;
  /** Tamaño final de letra (px). */
  size: number;
  lineas: string[];
  /** Ancho de la línea más larga. */
  width: number;
  /** Cajas [x, y, w, h] de cada línea (para dibujar resaltados detrás). */
  cajas: Array<[number, number, number, number]>;
}

export interface OpcionesParrafo {
  texto: string;
  x: number;
  /** Borde superior del bloque. */
  y: number;
  maxWidth: number;
  /** Tamaño ideal; baja hasta `min` para que entre en `maxLines`. */
  size: number;
  min?: number;
  peso?: Peso;
  /** Id de familia (FUENTES); por defecto Inter. */
  familia?: string | null;
  maxLines?: number;
  lineHeight?: number;
  anchor?: "start" | "middle" | "end";
  fill?: string;
  /** Resaltado tipo subtítulo de anuncio detrás de cada línea. */
  resaltado?: { fill: string; padX?: number; padY?: number; radio?: number };
  /** Contorno alrededor de las letras (texto sobre foto). */
  contorno?: { color: string; grosor: number };
  opacity?: number;
}

/** Bloque de texto multilínea que se ajusta solo. */
export function parrafo(o: OpcionesParrafo): Parrafo {
  const peso = o.peso ?? 700;
  const familia = o.familia || FUENTE_POR_DEFECTO;
  const maxLines = o.maxLines ?? 3;
  const min = o.min ?? Math.max(18, Math.round(o.size * 0.55));
  const lh = o.lineHeight ?? 1.12;
  const anchor = o.anchor ?? "start";
  let size = o.size;
  let lineas = envolver(o.texto, size, peso, o.maxWidth, 99, familia);
  while (lineas.length > maxLines && size > min) {
    size = Math.max(min, Math.round(size * 0.92));
    lineas = envolver(o.texto, size, peso, o.maxWidth, 99, familia);
  }
  if (lineas.length > maxLines) lineas = envolver(o.texto, size, peso, o.maxWidth, maxLines, familia);
  const f = fuente(peso, familia);
  const ascender = (f.ascender / f.unitsPerEm) * size;
  const alto = size * lh;
  const partes: string[] = [];
  const fondos: string[] = [];
  const cajas: Array<[number, number, number, number]> = [];
  let maxW = 0;
  lineas.forEach((l, i) => {
    const baseY = o.y + i * alto + ascender + (alto - size) / 2;
    const t = trazar(l, o.x, baseY, size, peso, anchor, familia);
    maxW = Math.max(maxW, t.width);
    const x0 = anchor === "middle" ? o.x - t.width / 2 : anchor === "end" ? o.x - t.width : o.x;
    cajas.push([x0, o.y + i * alto, t.width, alto]);
    if (o.resaltado) {
      const px = o.resaltado.padX ?? Math.round(size * 0.28), py = o.resaltado.padY ?? Math.round(size * 0.08), r = o.resaltado.radio ?? Math.round(size * 0.18);
      fondos.push(`<rect x="${(x0 - px).toFixed(1)}" y="${(o.y + i * alto - py).toFixed(1)}" width="${(t.width + px * 2).toFixed(1)}" height="${(alto + py * 2).toFixed(1)}" rx="${r}" fill="${o.resaltado.fill}"/>`);
    }
    if (t.d) partes.push(`<path d="${t.d}"/>`);
  });
  const contorno = o.contorno && o.contorno.grosor > 0
    ? `<g fill="none" stroke="${o.contorno.color}" stroke-width="${o.contorno.grosor * 2}" stroke-linejoin="round">${partes.join("")}</g>`
    : "";
  const svg = `<g${o.opacity != null ? ` opacity="${o.opacity}"` : ""}>${fondos.join("")}${contorno}<g fill="${o.fill ?? "#fff"}">${partes.join("")}</g></g>`;
  return { svg, height: lineas.length * alto, size, lineas, width: maxW, cajas };
}
