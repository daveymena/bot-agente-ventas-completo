/**
 * Catálogo de plantillas y plantillas propias.
 *
 * Una plantilla del catálogo es la combinación `maqueta.estilo.tema`
 * (p. ej. `destacado.pop.navidad`): 11 maquetas × ~125 estilos × ~22 temas,
 * más de 30.000 piezas distintas sin repetir un solo archivo, todas pintadas
 * con las fotos reales del producto que se elija. Las plantillas PROPIAS son
 * diseños que el dueño guardó desde el editor (o importó de otro editor en
 * formato Fabric.js) y se guardan por negocio en IMAGE_STORE_DIR/plantillas.
 * Al aplicarlas a otro producto, los textos se reemplazan por rol (gancho,
 * precio, marca, botón, beneficio…) y se reajusta el tamaño de letra.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getImageStoreDir } from "../image-store";
import { sanearSvg } from "./elementos";
import { FORMATOS, validarDiseno, type Capa, type CapaTexto, type Contenido, type Diseno, type Formato } from "./esquema";
import { ESTILOS, estiloPorId } from "./estilos";
import { PLANTILLAS, PLANTILLAS_LISTA, disenoDePlantilla, type CategoriaMaqueta, type Plantilla } from "./maquetas";
import { TEMAS, temaPorId } from "./temas";
import { FUENTES, parrafo, limpiarTexto, type Peso } from "./tipografia";
import { FACTOR_LINEA_FABRIC } from "./esquema";

// ─── Catálogo ────────────────────────────────────────────────────────────────

export interface PlantillaCatalogo {
  id: string;
  nombre: string;
  maqueta: Plantilla;
  estilo: string;
  tema: string;
  categoria: CategoriaMaqueta;
  tags: string[];
  descripcion: string;
}

export interface FiltroCatalogo {
  q?: string | null;
  categoria?: string | null;
  maqueta?: string | null;
  estilo?: string | null;
  tema?: string | null;
  pagina?: number;
  porPagina?: number;
}

const normalizar = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

let catalogoCache: PlantillaCatalogo[] | null = null;

/** Todas las combinaciones, ordenadas para que la primera página muestre variedad (tema "ninguno" y estilos a mano primero). */
export function catalogoCompleto(): PlantillaCatalogo[] {
  if (catalogoCache) return catalogoCache;
  const out: PlantillaCatalogo[] = [];
  const estilos = ESTILOS();
  for (const tema of TEMAS) {
    for (const estilo of estilos) {
      for (const maqueta of PLANTILLAS_LISTA) {
        const m = PLANTILLAS[maqueta];
        const partes = [m.nombre];
        if (estilo.id !== "marca") partes.push(estilo.nombre);
        if (tema.id !== "ninguno") partes.push(tema.nombre);
        out.push({
          id: `${maqueta}.${estilo.id}.${tema.id}`, nombre: partes.join(" · "), maqueta, estilo: estilo.id, tema: tema.id, categoria: m.categoria,
          tags: [...m.tags, ...estilo.tags, ...tema.tags], descripcion: m.descripcion,
        });
      }
    }
  }
  catalogoCache = out;
  return out;
}

export function totalDePlantillas(): number { return catalogoCompleto().length; }

export function buscarPlantillas(f: FiltroCatalogo = {}): { total: number; pagina: number; porPagina: number; items: PlantillaCatalogo[] } {
  const porPagina = Math.max(1, Math.min(120, f.porPagina ?? 24));
  const pagina = Math.max(1, f.pagina ?? 1);
  const palabras = normalizar(f.q || "").split(/[\s,]+/).filter(Boolean);
  const cat = f.categoria ? normalizar(f.categoria) : null;
  const maq = f.maqueta ? normalizar(f.maqueta) : null;
  const est = f.estilo ? normalizar(f.estilo) : null;
  const tem = f.tema ? normalizar(f.tema) : null;
  let items = catalogoCompleto().filter((p) => (!cat || p.categoria === cat) && (!maq || p.maqueta === maq) && (!est || p.estilo === est) && (!tem || p.tema === tem));
  if (palabras.length) {
    const puntuados = items.map((p) => {
      const texto = normalizar(`${p.nombre} ${p.tags.join(" ")} ${p.categoria} ${p.maqueta} ${p.estilo} ${p.tema} ${p.descripcion}`);
      let s = 0;
      for (const w of palabras) {
        if (p.tags.some((t) => normalizar(t) === w) || normalizar(p.tema) === w || normalizar(p.estilo) === w || normalizar(p.maqueta) === w) s += 5;
        else if (texto.includes(w)) s += 1;
      }
      return { p, s };
    }).filter((x) => x.s > 0);
    puntuados.sort((a, b) => b.s - a.s);
    items = puntuados.map((x) => x.p);
  }
  const total = items.length;
  return { total, pagina, porPagina, items: items.slice((pagina - 1) * porPagina, pagina * porPagina) };
}

export interface PlantillaResuelta { maqueta: Plantilla; estilo: string; tema: string }

/** `destacado.pop.navidad`, `destacado.pop`, `destacado` o `personal:<id>` (esta última se resuelve aparte). */
export function resolverIdDePlantilla(id: string): PlantillaResuelta | null {
  const partes = String(id || "").trim().toLowerCase().split(".");
  const maqueta = partes[0] as Plantilla;
  if (!PLANTILLAS[maqueta]) return null;
  const estilo = partes[1] ? estiloPorId(partes[1]) : estiloPorId("marca");
  if (partes[1] && estilo.id !== partes[1]) return null;
  const tema = partes[2] ? temaPorId(partes[2]) : temaPorId("ninguno");
  if (partes[2] && tema.id !== partes[2]) return null;
  return { maqueta, estilo: estilo.id, tema: tema.id };
}

/** Diseño de una plantilla del catálogo para un contenido dado. */
export function disenoDeCatalogo(id: string, formato: Formato, c: Contenido, opts: { gancho?: number; foto?: number } = {}): Diseno | null {
  const r = resolverIdDePlantilla(id);
  if (!r) return null;
  return disenoDePlantilla(r.maqueta, formato, c, { estilo: r.estilo, tema: r.tema, gancho: opts.gancho, foto: opts.foto });
}

/** Contenido de muestra para previsualizar plantillas sin producto. */
export function contenidoDeMuestra(): Contenido {
  return {
    nombre: "Tu producto", titular: "Tu producto", ganchos: ["Así se vería tu anuncio", "Con tus fotos reales", "Listo para publicar"],
    puntos: ["Primer beneficio real", "Segundo beneficio real", "Tercer beneficio real"], precio: "$59.900", sellos: ["Tu sello", "Tu condición"],
    cta: "Pídelo por WhatsApp", marca: "Tu marca", color: "#4F46E5", fotos: [], logo: null,
  };
}

// ─── Plantillas propias ──────────────────────────────────────────────────────

export interface PlantillaPersonal {
  id: string;
  nombre: string;
  formato: Formato;
  creadoEn: string;
  origen: "editor" | "fabric" | "json";
  diseno: Diseno;
  /** Miniatura (ruta relativa /uploads/…) si se generó. */
  miniatura?: string | null;
}

function carpetaDe(tenantId: number): string { return path.join(getImageStoreDir(), "plantillas", String(tenantId)); }

const idSeguro = (s: string) => /^[a-z0-9-]{3,60}$/.test(s);

export async function listarPersonales(tenantId: number): Promise<PlantillaPersonal[]> {
  const dir = carpetaDe(tenantId);
  if (!existsSync(dir)) return [];
  const out: PlantillaPersonal[] = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const p = JSON.parse(await readFile(path.join(dir, f), "utf8")) as PlantillaPersonal;
      if (p && p.id && validarDiseno(p.diseno)) out.push(p);
    } catch { /* archivo roto: se ignora */ }
  }
  return out.sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)));
}

export async function leerPersonal(tenantId: number, id: string): Promise<PlantillaPersonal | null> {
  if (!idSeguro(id)) return null;
  const ruta = path.join(carpetaDe(tenantId), `${id}.json`);
  if (!existsSync(ruta)) return null;
  try {
    const p = JSON.parse(await readFile(ruta, "utf8")) as PlantillaPersonal;
    return p && validarDiseno(p.diseno) ? p : null;
  } catch { return null; }
}

export async function guardarPersonal(tenantId: number, datos: { nombre: string; diseno: Diseno; origen?: PlantillaPersonal["origen"]; id?: string }): Promise<PlantillaPersonal> {
  if (!validarDiseno(datos.diseno)) throw new Error("Diseño inválido.");
  const nombre = String(datos.nombre || "").trim().slice(0, 80) || "Mi plantilla";
  const id = datos.id && idSeguro(datos.id) ? datos.id : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const f = FORMATOS[datos.diseno.formato];
  const diseno: Diseno = { ...datos.diseno, ancho: f.ancho, alto: f.alto, plantilla: `personal:${id}` };
  const p: PlantillaPersonal = { id, nombre, formato: diseno.formato, creadoEn: new Date().toISOString(), origen: datos.origen || "editor", diseno };
  const dir = carpetaDe(tenantId);
  await mkdir(dir, { recursive: true });
  const existentes = (await readdir(dir)).filter((x) => x.endsWith(".json")).length;
  if (existentes >= 300 && !existsSync(path.join(dir, `${id}.json`))) throw new Error("Máximo 300 plantillas propias.");
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(p));
  return p;
}

export async function borrarPersonal(tenantId: number, id: string): Promise<boolean> {
  if (!idSeguro(id)) return false;
  const ruta = path.join(carpetaDe(tenantId), `${id}.json`);
  if (!existsSync(ruta)) return false;
  await rm(ruta, { force: true });
  await rm(path.join(carpetaDe(tenantId), `${id}.jpg`), { force: true }).catch(() => {});
  return true;
}

// ─── Aplicar una plantilla propia a otro producto ────────────────────────────

const ROL = (nombre?: string) => normalizar(nombre || "");

/** Reajusta el tamaño de letra de una capa de texto para que el texto nuevo quepa en su caja. */
export function reajustarTexto(capa: CapaTexto, nuevo: string): CapaTexto {
  const limpio = limpiarTexto(nuevo);
  const p = parrafo({ texto: limpio, x: capa.x, y: capa.y, maxWidth: Math.max(20, capa.w), size: capa.tam, min: Math.max(12, Math.round(capa.tam * 0.5)), peso: capa.peso, familia: capa.fuente, maxLines: Math.max(1, capa.maxLineas ?? 3), lineHeight: (capa.interlineado ?? 1) * FACTOR_LINEA_FABRIC });
  return { ...capa, texto: limpio, tam: p.size, h: Math.max(capa.h, Math.ceil(p.height)) };
}

/**
 * Rellena un diseño guardado con el contenido de otro producto, por rol de
 * capa (los nombres que ponen las maquetas y el importador). Si el formato
 * pedido es otro, se escala proporcionalmente (el dueño ajusta en el editor).
 */
export function aplicarDisenoAContenido(base: Diseno, c: Contenido, formato?: Formato, opts: { gancho?: number; foto?: number } = {}): Diseno {
  const destino = formato || base.formato;
  const F = FORMATOS[destino];
  const sx = F.ancho / base.ancho, sy = F.alto / base.alto, sf = Math.min(sx, sy);
  const gancho = c.ganchos[(opts.gancho ?? 0) % Math.max(1, c.ganchos.length)] || c.titular;
  const fotos = c.fotos.length ? [...c.fotos.slice(opts.foto ?? 0), ...c.fotos.slice(0, opts.foto ?? 0)] : [];
  let nBeneficio = 0, nSello = 0, nFoto = 0;
  const capas: Capa[] = [];
  const esc = <T extends Capa>(k: T): T => (sx === 1 && sy === 1 ? k : { ...k, x: k.x * sx, y: k.y * sy, w: k.w * sx, h: k.h * sy, ...(k.tipo === "texto" ? { tam: (k as CapaTexto).tam * sf } : {}) } as T);
  for (const original of base.capas) {
    const k = esc(original);
    const rol = ROL(k.nombre);
    if (k.tipo === "fondo") { capas.push({ ...k, imagen: k.imagen ? (fotos[0] || k.imagen) : k.imagen }); continue; }
    if (k.tipo === "imagen") {
      if (/^foto/.test(rol) || rol === "foto del producto") { if (!fotos.length) continue; capas.push({ ...k, src: fotos[nFoto++ % fotos.length]! }); continue; }
      capas.push(k); continue;
    }
    if (k.tipo === "texto") {
      const t = k as CapaTexto;
      const sinPrecio = !c.precio;
      if (rol === "gancho" || rol === "texto de la escena") { capas.push(reajustarTexto(t, gancho)); continue; }
      if (rol === "precio") { if (sinPrecio) continue; capas.push(reajustarTexto(t, c.precio!)); continue; }
      if (rol === "detalle del precio") { if (sinPrecio) continue; capas.push(c.sellos.some((s) => /recibir/i.test(s)) ? reajustarTexto(t, "pagas al recibir") : t); continue; }
      if (rol === "etiqueta de precio") { if (sinPrecio) continue; capas.push(t); continue; }
      if (rol === "marca") { if (!c.marca) continue; capas.push(reajustarTexto(t, c.marca.toUpperCase())); continue; }
      if (rol === "texto del boton") { capas.push(reajustarTexto(t, c.cta)); continue; }
      if (rol === "beneficio") { const b = c.puntos[nBeneficio++]; if (!b) continue; capas.push(reajustarTexto(t, b)); continue; }
      if (rol === "sello" || rol === "texto de sello") { const s = c.sellos[nSello++]; if (!s) continue; capas.push(reajustarTexto(t, s)); continue; }
      if (rol === "nombre del producto") { capas.push(reajustarTexto(t, c.titular)); continue; }
      if (rol === "nota a mano") { capas.push(reajustarTexto(t, c.precio ? `${c.titular} · ${c.precio}` : c.titular)); continue; }
      capas.push(t); continue;
    }
    if ((rol === "sello de precio") && !c.precio) continue;
    capas.push(k);
  }
  return { ...base, formato: destino, ancho: F.ancho, alto: F.alto, gancho, capas };
}

// ─── Importar desde Fabric.js ────────────────────────────────────────────────

function pesoDe(v: any): Peso {
  const n = typeof v === "number" ? v : v === "bold" ? 700 : Number(v) || 400;
  return n >= 800 ? 900 : n >= 600 ? 700 : 400;
}

function fuenteDe(nombre: any): string | undefined {
  const n = normalizar(String(nombre || "")).replace(/['"]/g, "").split(",")[0]!.trim();
  if (!n) return undefined;
  const hit = FUENTES.find((f) => normalizar(f.nombre) === n || f.id === n || normalizar(f.nombre).replace(/\s+/g, "") === n.replace(/\s+/g, ""));
  if (hit) return hit.id === "inter" ? undefined : hit.id;
  if (/serif|playfair|georgia|times|garamond/.test(n)) return "playfair";
  if (/script|brush|pacifico|lobster|dancing|cursive/.test(n)) return "lobster";
  if (/impact|anton|bebas|oswald|condensed/.test(n)) return "bebas";
  return undefined;
}

function colorDe(v: any, porDefecto = "#111827"): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object" && Array.isArray(v.colorStops) && v.colorStops[0]?.color) return String(v.colorStops[0].color);
  return porDefecto;
}

function pathASvg(o: any): string | null {
  const w = Number(o.width) || 0, h = Number(o.height) || 0;
  if (!w || !h) return null;
  const ox = Number(o.pathOffset?.x ?? w / 2), oy = Number(o.pathOffset?.y ?? h / 2);
  const vb = `${(ox - w / 2).toFixed(2)} ${(oy - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`;
  const fill = colorDe(o.fill, "none"), stroke = typeof o.stroke === "string" ? o.stroke : "none", sw = Number(o.strokeWidth) || 0;
  const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;
  const tipo = String(o.type || "").toLowerCase();
  if (tipo === "path") {
    const d = Array.isArray(o.path) ? o.path.map((seg: any[]) => seg.join(" ")).join(" ") : typeof o.path === "string" ? o.path : "";
    if (!d) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><path d="${d.replace(/"/g, "")}" ${attrs}/></svg>`;
  }
  if (tipo === "polygon" || tipo === "polyline") {
    const pts = Array.isArray(o.points) ? o.points.map((p: any) => `${Number(p.x) || 0},${Number(p.y) || 0}`).join(" ") : "";
    if (!pts) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><${tipo} points="${pts}" ${attrs}/></svg>`;
  }
  if (tipo === "triangle") return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><path d="M${w / 2} 0L${w} ${h}H0z" ${attrs}/></svg>`;
  if (tipo === "line") return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><line x1="0" y1="0" x2="${w}" y2="${h}" stroke="${stroke === "none" ? fill : stroke}" stroke-width="${sw || 2}"/></svg>`;
  return null;
}

/**
 * Convierte el JSON de un lienzo Fabric.js (lo que exportan la mayoría de
 * editores abiertos tipo Canva) en un Diseño. Se traen textos, imágenes,
 * rectángulos, círculos y trazados; los grupos se aplanan.
 */
export function desdeFabricJSON(json: any, formato: Formato, opts: { ancho?: number; alto?: number } = {}): Diseno {
  const F = FORMATOS[formato];
  const objetos: any[] = Array.isArray(json?.objects) ? json.objects : Array.isArray(json) ? json : [];
  if (!objetos.length) throw new Error("El JSON no trae objetos de Fabric (falta `objects`).");
  // Tamaño de origen: lo que diga el JSON o el borde derecho/inferior más lejano.
  let maxX = 0, maxY = 0;
  const planos: Array<{ o: any; dx: number; dy: number; sx: number; sy: number }> = [];
  const aplanar = (lista: any[], dx: number, dy: number, sx: number, sy: number) => {
    for (const o of lista) {
      if (!o || typeof o !== "object") continue;
      const tipo = String(o.type || "").toLowerCase();
      const osx = (Number(o.scaleX) || 1) * sx, osy = (Number(o.scaleY) || 1) * sy;
      const left = (Number(o.left) || 0) * sx + dx, top = (Number(o.top) || 0) * sy + dy;
      if ((tipo === "group" || tipo === "activeselection") && Array.isArray(o.objects)) {
        const gw = (Number(o.width) || 0) * osx, gh = (Number(o.height) || 0) * osy;
        const gx = o.originX === "center" ? left - gw / 2 : left, gy = o.originY === "center" ? top - gh / 2 : top;
        // Los hijos de un grupo están centrados en el grupo.
        aplanar(o.objects, gx + gw / 2, gy + gh / 2, osx, osy);
        continue;
      }
      planos.push({ o, dx, dy, sx, sy });
      const w = (Number(o.width) || 0) * osx, h = (Number(o.height) || 0) * osy;
      maxX = Math.max(maxX, left + w); maxY = Math.max(maxY, top + h);
    }
  };
  aplanar(objetos, 0, 0, 1, 1);
  const anchoOrigen = Number(opts.ancho) || Number(json?.width) || Number(json?.canvasWidth) || Number(json?.clipPath?.width) || maxX || F.ancho;
  const altoOrigen = Number(opts.alto) || Number(json?.height) || Number(json?.canvasHeight) || Number(json?.clipPath?.height) || maxY || F.alto;
  const kx = F.ancho / anchoOrigen, ky = F.alto / altoOrigen, kf = Math.min(kx, ky);
  const fondoColor = colorDe(json?.background ?? json?.backgroundColor, "#ffffff");
  const capas: Capa[] = [{ id: "fondo", tipo: "fondo", x: 0, y: 0, w: F.ancho, h: F.alto, relleno: /^#|^rgb/.test(fondoColor) ? fondoColor : "#ffffff", nombre: "Fondo" }];
  let n = 0;
  const nid = (p: string) => `${p}${(++n).toString(36)}`;
  for (const { o, dx, dy, sx, sy } of planos) {
    if (capas.length >= 150) break;
    const tipo = String(o.type || "").toLowerCase();
    const osx = (Number(o.scaleX) || 1) * sx, osy = (Number(o.scaleY) || 1) * sy;
    let w = (Number(o.width) || 0) * osx, h = (Number(o.height) || 0) * osy;
    if (tipo === "circle") { w = h = (Number(o.radius) || 0) * 2 * osx; }
    if (tipo === "ellipse") { w = (Number(o.rx) || 0) * 2 * osx; h = (Number(o.ry) || 0) * 2 * osy; }
    let left = (Number(o.left) || 0) * sx + dx, top = (Number(o.top) || 0) * sy + dy;
    if (o.originX === "center") left -= w / 2; else if (o.originX === "right") left -= w;
    if (o.originY === "center") top -= h / 2; else if (o.originY === "bottom") top -= h;
    const comun = { x: Math.round(left * kx), y: Math.round(top * ky), w: Math.max(2, Math.round(w * kx)), h: Math.max(2, Math.round(h * ky)), rot: Number(o.angle) || undefined, opacidad: o.opacity != null && Number(o.opacity) < 1 ? Number(o.opacity) : undefined };
    if (o.visible === false) continue;
    if (tipo === "textbox" || tipo === "i-text" || tipo === "itext" || tipo === "text" || tipo === "textoanuncio") {
      const textoO = String(o.text || "").trim();
      if (!textoO) continue;
      const tam = Math.max(10, Math.round((Number(o.fontSize) || 40) * osy * kf));
      const esFondoLleno = comun.x <= 0 && comun.y <= 0 && comun.w >= F.ancho && comun.h >= F.alto;
      if (esFondoLleno) continue;
      capas.push({ id: nid("t"), tipo: "texto", ...comun, h: Math.max(comun.h, Math.round(tam * FACTOR_LINEA_FABRIC)), texto: textoO.slice(0, 400), tam, peso: pesoDe(o.fontWeight), fuente: fuenteDe(o.fontFamily), color: colorDe(o.fill), alinear: o.textAlign === "center" ? "centro" : o.textAlign === "right" ? "der" : "izq", interlineado: Number(o.lineHeight) || 1, resaltado: typeof o.resaltado === "string" ? o.resaltado : typeof o.textBackgroundColor === "string" && o.textBackgroundColor ? o.textBackgroundColor : null, contorno: typeof o.stroke === "string" && Number(o.strokeWidth) > 0 ? { color: o.stroke, grosor: Math.max(1, Math.round(Number(o.strokeWidth) / 2)) } : undefined, maxLineas: 6, nombre: "Texto" } as CapaTexto);
      continue;
    }
    if (tipo === "image") {
      const src = String(o.src || o.url || "");
      if (!src || src.length > 2_500_000 || !(/^https?:\/\//i.test(src) || src.startsWith("data:image/") || src.startsWith("/uploads/") || src.startsWith("/images/"))) continue;
      const esFondo = comun.x <= 2 && comun.y <= 2 && comun.w >= F.ancho - 4 && comun.h >= F.alto - 4;
      capas.push({ id: nid("i"), tipo: "imagen", ...comun, src, ajuste: o.cropX || o.cropY || esFondo ? "cubrir" : "contener", radio: o.clipPath?.rx ? Math.round(Number(o.clipPath.rx) * osx * kf) : 0, sombra: !!o.shadow, nombre: esFondo ? "Foto de fondo" : "Foto" });
      continue;
    }
    if (tipo === "rect") {
      const relleno = colorDe(o.fill, "transparent");
      const llena = comun.x <= 0 && comun.y <= 0 && comun.w >= F.ancho && comun.h >= F.alto;
      if (llena) { (capas[0] as any).relleno = relleno; continue; }
      capas.push({ id: nid("r"), tipo: "rect", ...comun, relleno, radio: Math.round((Number(o.rx) || 0) * osx * kf), borde: typeof o.stroke === "string" && Number(o.strokeWidth) > 0 ? { color: o.stroke, grosor: Math.round(Number(o.strokeWidth) * kf) } : undefined, nombre: "Caja" });
      continue;
    }
    if (tipo === "circle" || tipo === "ellipse") { capas.push({ id: nid("c"), tipo: "circulo", ...comun, relleno: colorDe(o.fill, "#111827"), nombre: "Círculo" }); continue; }
    if (tipo === "path" || tipo === "polygon" || tipo === "polyline" || tipo === "triangle" || tipo === "line") {
      const svg = pathASvg(o);
      const limpio = svg && sanearSvg(svg);
      if (!limpio) continue;
      capas.push({ id: nid("k"), tipo: "icono", ...comun, icono: `svg:${limpio}`, color: null, nombre: "Forma" });
      continue;
    }
  }
  return nombrarRoles({ version: 1, formato, ancho: F.ancho, alto: F.alto, plantilla: "importada", capas });
}

/** Adivina el papel de cada capa importada para poder rellenarla con otro producto. */
export function nombrarRoles(d: Diseno): Diseno {
  const textos = d.capas.filter((k): k is CapaTexto => k.tipo === "texto");
  const imagenes = d.capas.filter((k) => k.tipo === "imagen");
  const mayor = [...textos].sort((a, b) => b.tam - a.tam)[0];
  const fotoMayor = [...imagenes].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  let beneficio = 0;
  const capas = d.capas.map((k) => {
    if (k.tipo === "imagen" && k === fotoMayor && k.nombre !== "Foto de fondo") return { ...k, nombre: "Foto del producto" };
    if (k.tipo !== "texto" || (k.nombre && !/^texto$/i.test(k.nombre))) return k;
    const t = k.texto.trim();
    if (/^\$?\s?\d{1,3}([.,]\d{3})+(\s?(cop|usd|mxn))?$|^\$\s?\d+/i.test(t)) return { ...k, nombre: "Precio" };
    if (t.length <= 32 && /whatsapp|compra|p[ií]de|ll[aá]ma|escr[ií]be|ordena|cotiza|reserva|agenda|ahora|aqu[ií]/i.test(t)) return { ...k, nombre: "Texto del botón" };
    if (k === mayor) return { ...k, nombre: "Gancho" };
    if (t.length <= 24 && t === t.toUpperCase() && /^[A-ZÁÉÍÓÚÑ0-9 .&-]+$/.test(t)) return { ...k, nombre: "Marca" };
    if (t.length <= 90) return { ...k, nombre: beneficio++ < 3 ? "Beneficio" : "Texto" };
    return k;
  });
  return { ...d, capas };
}
