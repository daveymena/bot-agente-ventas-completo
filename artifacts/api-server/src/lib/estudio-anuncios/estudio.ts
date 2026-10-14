/**
 * Orquestador del Estudio de anuncios: una petición por producto → paquete
 * de imágenes (plantillas × formatos de Meta/Instagram) + vídeo vertical,
 * todo desde las fotos REALES del producto.
 *
 * Estado persistido en `products.metadata.estudio` para que el panel lo
 * muestre, lo edite (diseños JSON) y lo reutilice en el flujo de Meta.
 * Archivos en `IMAGE_STORE_DIR/anuncios/<productId>/` servidos por /uploads.
 */
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, products, tenants } from "@workspace/db";
import { logger } from "../logger";
import { getImageStoreDir } from "../image-store";
import { colaDelEstudio, type Trabajo } from "./cola";
import { contenidoDelProducto, ganchosConIA, type ProductoParaEstudio } from "./contenido";
import { escenasAutomaticas, paqueteDeDisenos, validarDiseno, FORMATOS, PLANTILLAS_LISTA, FORMATOS_LISTA, type Contenido, type Diseno, type Escena, type Formato, type Plantilla } from "./diseno";
import { cargadorConCache, renderizarDiseno } from "./render";
import { armarVideoDesdeEscenas, hayFfmpegDisponible, type EscenaParaVideo } from "./video";

export interface ImagenGenerada {
  id: string;
  plantilla: string;
  formato: Formato;
  ancho: number;
  alto: number;
  /** Ruta relativa servida por /uploads (p. ej. /uploads/anuncios/12/destacado-cuadrado.jpg?v=…). */
  url: string;
  en: string;
  /** true cuando el dueño la editó en el panel. */
  editada?: boolean;
}

export interface VideoDelEstudio {
  estado: "pendiente" | "en_curso" | "listo" | "fallo";
  url?: string;
  archivo?: string;
  duracion?: number;
  tamano?: number;
  escenas?: number;
  conVoz?: boolean;
  conMusica?: boolean;
  en?: string;
  error?: string;
}

export interface EstadoEstudio {
  version: 1;
  paquete?: { estado: "pendiente" | "en_curso" | "listo" | "fallo"; en?: string; error?: string; conIA?: boolean };
  contenido?: Contenido;
  imagenes: ImagenGenerada[];
  /** Diseños editables por id de pieza. */
  disenos: Record<string, Diseno>;
  escenas?: Escena[];
  video?: VideoDelEstudio;
  /** Archivos subidos desde el editor (fotos propias, logos). */
  archivos?: Array<{ url: string; en: string; nombre?: string }>;
}

export interface OpcionesPaquete {
  plantillas?: Plantilla[];
  formatos?: Formato[];
  conIA?: boolean;
  conVideo?: boolean;
  ganchos?: string[];
  destino?: "whatsapp" | "web";
}

const appUrl = () => (process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "");
export const absoluta = (u: string) => (/^https?:\/\//i.test(u) ? u : `${appUrl()}/${String(u || "").replace(/^\/+/, "")}`);

function carpetaDe(productId: number): string { return path.join(getImageStoreDir(), "anuncios", String(productId)); }
function urlDe(productId: number, archivo: string, version?: number): string {
  return `/uploads/anuncios/${productId}/${archivo}${version ? `?v=${version}` : ""}`;
}

function metadataDe(p: any): any {
  try { return typeof p?.metadata === "string" ? JSON.parse(p.metadata) : (p?.metadata || {}); } catch { return {}; }
}

function estadoVacio(): EstadoEstudio { return { version: 1, imagenes: [], disenos: {} }; }

export async function productoDe(tenantId: number, productId: number): Promise<any | null> {
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
  return p || null;
}

export async function leerEstudio(tenantId: number, productId: number): Promise<{ producto: any; estudio: EstadoEstudio } | null> {
  const p = await productoDe(tenantId, productId);
  if (!p) return null;
  const m = metadataDe(p);
  const e: EstadoEstudio = m?.estudio && typeof m.estudio === "object" ? { ...estadoVacio(), ...m.estudio } : estadoVacio();
  return { producto: p, estudio: e };
}

/** Relee la metadata antes de escribir para no pisar lo que otro flujo guardó mientras tanto. */
async function guardarEstudio(productId: number, mutar: (e: EstadoEstudio) => void): Promise<EstadoEstudio> {
  const [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!p) throw new Error(`No existe el producto ${productId}.`);
  const m = metadataDe(p);
  const e: EstadoEstudio = m?.estudio && typeof m.estudio === "object" ? { ...estadoVacio(), ...m.estudio } : estadoVacio();
  mutar(e);
  await db.update(products).set({ metadata: JSON.stringify({ ...m, estudio: e }) } as any).where(eq(products.id, productId));
  return e;
}

// ─── Contenido: marca + condiciones + fotos reales ───────────────────────────

export async function contenidoPara(tenantId: number, p: any, opts: { ganchos?: string[]; destino?: "whatsapp" | "web"; conIA?: boolean } = {}): Promise<Contenido> {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  let negocio: any = null;
  try { const { getBusinessContext } = await import("../business-context"); negocio = await getBusinessContext(tenantId); } catch { /* sin contexto */ }
  let fotos: string[] = [];
  try {
    const { fotosUnicasDelProducto } = await import("../fotos-de-producto");
    fotos = await fotosUnicasDelProducto(p, { max: 6, timeoutMs: 8000 });
  } catch { /* se intenta la lista simple */ }
  if (!fotos.length) {
    try { const { fotosDelProducto } = await import("../fotos-de-producto"); fotos = fotosDelProducto(p, appUrl(), 6); } catch { /* sin fotos */ }
  }
  const c = contenidoDelProducto(p as ProductoParaEstudio, {
    marca: (t as any)?.brandName || negocio?.businessName || null,
    color: (t as any)?.brandColors?.primary || null,
    logo: (t as any)?.brandLogo || null,
    condiciones: negocio?.condiciones || null,
    destino: opts.destino,
    fotos,
    ganchosExtra: opts.ganchos,
  });
  if (opts.conIA) {
    try {
      const extra = await ganchosConIA(tenantId, c, p as ProductoParaEstudio);
      if (extra.length) c.ganchos = [...new Set([...extra, ...c.ganchos])];
    } catch { /* la IA es opcional */ }
  }
  return c;
}

// ─── Paquete de imágenes ─────────────────────────────────────────────────────

export async function renderizarPieza(productId: number, id: string, d: Diseno, cargar = cargadorConCache()): Promise<{ url: string; ancho: number; alto: number }> {
  const carpeta = carpetaDe(productId);
  await mkdir(carpeta, { recursive: true });
  const archivo = `${id}.jpg`;
  const jpg = await renderizarDiseno(d, { cargar, salida: "jpg", calidad: 90 });
  await writeFile(path.join(carpeta, archivo), jpg);
  return { url: urlDe(productId, archivo, Date.now()), ancho: d.ancho, alto: d.alto };
}

async function trabajoPaquete(tenantId: number, productId: number, opts: OpcionesPaquete, avance: (a: { progreso?: number; detalle?: string }) => void): Promise<EstadoEstudio> {
  const p = await productoDe(tenantId, productId);
  if (!p) throw new Error(`No existe el producto ${productId}.`);
  avance({ progreso: 3, detalle: "Leyendo producto, marca y fotos" });
  const c = await contenidoPara(tenantId, p, { ganchos: opts.ganchos, destino: opts.destino, conIA: opts.conIA });
  if (!c.fotos.length) logger.warn({ tenantId, productId }, "[Estudio] el producto no tiene fotos: las piezas salen sin foto");
  const plantillas = (opts.plantillas || []).filter((x) => PLANTILLAS_LISTA.includes(x));
  const formatos = (opts.formatos || []).filter((x) => FORMATOS_LISTA.includes(x));
  const piezas = paqueteDeDisenos(c, { plantillas: plantillas.length ? plantillas : undefined, formatos: formatos.length ? formatos : undefined });
  const cargar = cargadorConCache();
  const imagenes: ImagenGenerada[] = [];
  const disenos: Record<string, Diseno> = {};
  for (let i = 0; i < piezas.length; i++) {
    const pz = piezas[i]!;
    const id = `${pz.plantilla}-${pz.formato}`;
    avance({ progreso: 5 + Math.round((i / piezas.length) * 85), detalle: `Pintando ${pz.plantilla} ${FORMATOS[pz.formato].etiqueta} (${i + 1}/${piezas.length})` });
    try {
      const r = await renderizarPieza(productId, id, pz.diseno, cargar);
      imagenes.push({ id, plantilla: pz.plantilla, formato: pz.formato, ancho: r.ancho, alto: r.alto, url: r.url, en: new Date().toISOString() });
      disenos[id] = pz.diseno;
    } catch (e: any) {
      logger.warn({ tenantId, productId, id, err: e?.message }, "[Estudio] pieza no pintada");
    }
  }
  if (!imagenes.length) throw new Error("No se pudo pintar ninguna pieza (¿fotos inaccesibles?).");
  avance({ progreso: 92, detalle: "Armando escenas del vídeo" });
  const escenas = escenasAutomaticas(c);
  const estado = await guardarEstudio(productId, (e) => {
    e.contenido = c;
    // Se conservan diseños editados a mano de otras piezas; las regeneradas se reemplazan.
    e.disenos = { ...e.disenos, ...disenos };
    const previas = e.imagenes.filter((img) => !disenos[img.id]);
    e.imagenes = [...imagenes, ...previas];
    if (!e.escenas?.length || !e.escenas.some((s) => (s as any).editada)) e.escenas = escenas;
    e.paquete = { estado: "listo", en: new Date().toISOString(), conIA: !!opts.conIA };
  });
  logger.info({ tenantId, productId, piezas: imagenes.length }, "[Estudio] paquete listo");
  return estado;
}

/** Encola la generación del paquete; devuelve el estado del trabajo (no espera). */
export async function pedirPaquete(tenantId: number, productId: number, opts: OpcionesPaquete = {}): Promise<Trabajo<EstadoEstudio>> {
  const p = await productoDe(tenantId, productId);
  if (!p) throw new Error(`No existe el producto ${productId}.`);
  await guardarEstudio(productId, (e) => { e.paquete = { estado: "pendiente", en: new Date().toISOString(), conIA: !!opts.conIA }; });
  const cola = colaDelEstudio();
  const trabajo = cola.encolar<EstadoEstudio>(`paquete:${productId}`, async (avance) => {
    await guardarEstudio(productId, (e) => { e.paquete = { ...(e.paquete || { estado: "en_curso" }), estado: "en_curso" }; });
    return trabajoPaquete(tenantId, productId, opts, avance);
  });
  void cola.esperar<EstadoEstudio>(`paquete:${productId}`)?.then(async (t) => {
    if (t.estado === "fallo") {
      await guardarEstudio(productId, (e) => { e.paquete = { estado: "fallo", en: new Date().toISOString(), error: t.error }; }).catch(() => {});
      logger.error({ tenantId, productId, err: t.error }, "[Estudio] paquete falló");
      return;
    }
    if (opts.conVideo !== false) await pedirVideo(tenantId, productId, {}).catch((e) => logger.warn({ productId, err: e?.message }, "[Estudio] no se pudo encolar el vídeo"));
  });
  return trabajo;
}

// ─── Vídeo ───────────────────────────────────────────────────────────────────

export interface OpcionesVideoEstudio {
  escenas?: Escena[];
  /** Fotogramas ya pintados por el editor: índice de escena → ruta local absoluta. */
  fotogramas?: Record<number, string>;
  voz?: string | null;
  conVoz?: boolean;
  conMusica?: boolean;
}

export async function pedirVideo(tenantId: number, productId: number, opts: OpcionesVideoEstudio = {}): Promise<Trabajo<VideoDelEstudio>> {
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) throw new Error(`No existe el producto ${productId}.`);
  if (!(await hayFfmpegDisponible())) throw new Error("El servidor no tiene ffmpeg: no se pueden armar vídeos.");
  let escenas = opts.escenas?.length ? opts.escenas : leido.estudio.escenas || [];
  if (!escenas.length) {
    const c = leido.estudio.contenido || await contenidoPara(tenantId, leido.producto);
    escenas = escenasAutomaticas(c);
  }
  if (!escenas.every((e) => e && validarDiseno(e.diseno))) throw new Error("Hay escenas con un diseño inválido.");
  if (escenas.length > 12) throw new Error("Máximo 12 escenas por vídeo.");
  await guardarEstudio(productId, (e) => { e.escenas = escenas; e.video = { ...(e.video || {}), estado: "pendiente", en: new Date().toISOString(), error: undefined }; });
  const cola = colaDelEstudio();
  const trabajo = cola.encolar<VideoDelEstudio>(`video:${productId}`, async (avance) => {
    await guardarEstudio(productId, (e) => { e.video = { ...(e.video || {}), estado: "en_curso" }; });
    const carpeta = carpetaDe(productId);
    const nombre = `video-${Date.now()}.mp4`;
    const paraVideo: EscenaParaVideo[] = escenas.map((e, i) => ({ ...e, fotograma: opts.fotogramas?.[i] && existsSync(opts.fotogramas[i]!) ? opts.fotogramas[i]! : null }));
    const v = await armarVideoDesdeEscenas(paraVideo, { carpeta, nombre, voz: opts.voz, conVoz: opts.conVoz, conMusica: opts.conMusica, avance: (progreso, detalle) => avance({ progreso, detalle }) });
    // Se borran vídeos anteriores del producto para no llenar el disco.
    try {
      const { readdir } = await import("node:fs/promises");
      for (const f of await readdir(carpeta)) if (/^video-\d+\.mp4$/.test(f) && f !== nombre) await rm(path.join(carpeta, f), { force: true });
    } catch { /* sin limpieza */ }
    const video: VideoDelEstudio = { estado: "listo", url: urlDe(productId, nombre), archivo: nombre, duracion: v.duracion, tamano: v.tamano, escenas: v.escenas, conVoz: v.conVoz, conMusica: v.conMusica, en: new Date().toISOString() };
    await guardarEstudio(productId, (e) => { e.video = video; });
    logger.info({ tenantId, productId, duracion: v.duracion, escenas: v.escenas }, "[Estudio] vídeo listo");
    return video;
  });
  void cola.esperar<VideoDelEstudio>(`video:${productId}`)?.then(async (t) => {
    if (t.estado === "fallo") {
      await guardarEstudio(productId, (e) => { e.video = { ...(e.video || {}), estado: "fallo", error: t.error, en: new Date().toISOString() }; }).catch(() => {});
      logger.error({ tenantId, productId, err: t.error }, "[Estudio] vídeo falló");
    }
    // Fotogramas temporales subidos por el editor.
    for (const f of Object.values(opts.fotogramas || {})) await rm(f, { force: true }).catch(() => {});
  });
  return trabajo;
}

// ─── Edición ─────────────────────────────────────────────────────────────────

/** Guarda un diseño editado y lo vuelve a pintar (o guarda el JPG que exportó el editor). */
export async function guardarDiseno(tenantId: number, productId: number, id: string, d: Diseno, exportado?: Buffer | null): Promise<ImagenGenerada> {
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) throw new Error(`No existe el producto ${productId}.`);
  if (!validarDiseno(d)) throw new Error("Diseño inválido.");
  if (!/^[a-z0-9-]{1,60}$/i.test(id)) throw new Error("Id de pieza inválido.");
  const f = FORMATOS[d.formato];
  const diseno: Diseno = { ...d, ancho: f.ancho, alto: f.alto };
  let url: string;
  if (exportado && exportado.length > 1000) {
    const sharp = (await import("sharp")).default;
    const carpeta = carpetaDe(productId);
    await mkdir(carpeta, { recursive: true });
    await sharp(exportado, { failOn: "none" }).resize(f.ancho, f.alto, { fit: "cover" }).flatten({ background: "#fff" }).jpeg({ quality: 90, mozjpeg: true }).toFile(path.join(carpeta, `${id}.jpg`));
    url = urlDe(productId, `${id}.jpg`, Date.now());
  } else {
    url = (await renderizarPieza(productId, id, diseno)).url;
  }
  const img: ImagenGenerada = { id, plantilla: diseno.plantilla, formato: diseno.formato, ancho: f.ancho, alto: f.alto, url, en: new Date().toISOString(), editada: true };
  await guardarEstudio(productId, (e) => {
    e.disenos[id] = diseno;
    const i = e.imagenes.findIndex((x) => x.id === id);
    if (i >= 0) e.imagenes[i] = img; else e.imagenes.unshift(img);
  });
  return img;
}

/** Guarda las escenas editadas (sin armar el vídeo todavía). */
export async function guardarEscenas(tenantId: number, productId: number, escenas: Escena[]): Promise<Escena[]> {
  if (!(await productoDe(tenantId, productId))) throw new Error(`No existe el producto ${productId}.`);
  if (!Array.isArray(escenas) || !escenas.length || escenas.length > 12) throw new Error("Entre 1 y 12 escenas.");
  if (!escenas.every((e) => e && validarDiseno(e.diseno))) throw new Error("Hay escenas con un diseño inválido.");
  const limpias: Escena[] = escenas.map((e, i) => ({ ...e, id: String(e.id || `e${i}`).slice(0, 40), duracion: Math.max(1.2, Math.min(20, Number(e.duracion) || 3)), locucion: String(e.locucion || "").slice(0, 400), editada: true } as Escena));
  await guardarEstudio(productId, (e) => { e.escenas = limpias; });
  return limpias;
}

export async function borrarImagen(tenantId: number, productId: number, id: string): Promise<void> {
  if (!/^[a-z0-9-]{1,60}$/i.test(id)) throw new Error("Id inválido.");
  await guardarEstudio(productId, (e) => { e.imagenes = e.imagenes.filter((x) => x.id !== id); delete e.disenos[id]; });
  await rm(path.join(carpetaDe(productId), `${id}.jpg`), { force: true }).catch(() => {});
}

/** Guarda un archivo subido desde el editor (foto propia, logo, fotograma) y devuelve su URL. */
export async function guardarArchivo(tenantId: number, productId: number, buf: Buffer, opts: { nombre?: string; temporal?: boolean } = {}): Promise<{ url: string; ruta: string }> {
  if (!(await productoDe(tenantId, productId))) throw new Error(`No existe el producto ${productId}.`);
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  if (!meta.width || !meta.height) throw new Error("El archivo no es una imagen válida.");
  const carpeta = path.join(carpetaDe(productId), opts.temporal ? "tmp" : "subidos");
  await mkdir(carpeta, { recursive: true });
  const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${opts.temporal ? "png" : "jpg"}`;
  const ruta = path.join(carpeta, nombre);
  if (opts.temporal) await sharp(buf, { failOn: "none" }).png().toFile(ruta);
  else await sharp(buf, { failOn: "none" }).rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toFile(ruta);
  const url = urlDe(productId, `${opts.temporal ? "tmp" : "subidos"}/${nombre}`);
  if (!opts.temporal) await guardarEstudio(productId, (e) => { e.archivos = [...(e.archivos || []), { url, en: new Date().toISOString(), nombre: opts.nombre }].slice(-50); });
  return { url, ruta };
}

export async function borrarEstudio(tenantId: number, productId: number): Promise<void> {
  if (!(await productoDe(tenantId, productId))) throw new Error(`No existe el producto ${productId}.`);
  await rm(carpetaDe(productId), { recursive: true, force: true }).catch(() => {});
  const [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  const m = metadataDe(p);
  delete m.estudio;
  await db.update(products).set({ metadata: JSON.stringify(m) } as any).where(eq(products.id, productId));
}

/** Estado combinado para el panel: lo persistido + lo que la cola sabe ahora mismo. */
export async function estadoCompleto(tenantId: number, productId: number): Promise<any | null> {
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) return null;
  const cola = colaDelEstudio();
  const tp = cola.estado(`paquete:${productId}`);
  const tv = cola.estado(`video:${productId}`);
  const { producto, estudio } = leido;
  return {
    producto: { id: producto.id, nombre: producto.name, precio: producto.price, imagen: producto.imageUrl },
    estudio: {
      ...estudio,
      imagenes: estudio.imagenes.map((i) => ({ ...i, urlAbsoluta: absoluta(i.url) })),
      video: estudio.video ? { ...estudio.video, urlAbsoluta: estudio.video.url ? absoluta(estudio.video.url) : undefined } : undefined,
    },
    trabajos: {
      paquete: tp ? { estado: tp.estado, progreso: tp.progreso, detalle: tp.detalle, posicion: tp.posicion, intento: tp.intento, error: tp.error } : null,
      video: tv ? { estado: tv.estado, progreso: tv.progreso, detalle: tv.detalle, posicion: tv.posicion, intento: tv.intento, error: tv.error } : null,
    },
  };
}
