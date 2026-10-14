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
import { escenasAutomaticas, disenoDePlantilla, validarDiseno, FORMATOS, FORMATOS_LISTA, PAQUETE_POR_DEFECTO, GUIONES_LISTA, estiloPorId, temaPorId, type Contenido, type Diseno, type Escena, type Formato, type Plantilla } from "./diseno";
import { aplicarDisenoAContenido, contenidoDeMuestra, disenoDeCatalogo, leerPersonal, resolverIdDePlantilla, type PlantillaResuelta } from "./plantillas";
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
  paquete?: { estado: "pendiente" | "en_curso" | "listo" | "fallo"; en?: string; error?: string; conIA?: boolean; estilo?: string; tema?: string; guion?: string };
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
  /** Ids de maqueta ("oferta") o de plantilla del catálogo ("oferta.pop.navidad") o propias ("personal:p-abc"). */
  plantillas?: string[];
  formatos?: Formato[];
  /** Estilo y tema por defecto para las plantillas que no lo traigan en el id. */
  estilo?: string | null;
  tema?: string | null;
  /** Guion del vídeo (escenas.ts GUIONES). */
  guion?: string | null;
  conIA?: boolean;
  conVideo?: boolean;
  ganchos?: string[];
  destino?: "whatsapp" | "web";
}

/** Una plantilla pedida, ya resuelta: del catálogo o propia del negocio. */
export type PlantillaPedida = { tipo: "catalogo"; id: string; r: PlantillaResuelta } | { tipo: "personal"; id: string; diseno: Diseno };

/** Convierte la lista que llega del panel/Atlas en plantillas concretas (las que no existen se ignoran). */
export async function resolverPlantillas(tenantId: number, ids: string[] | undefined, opts: { estilo?: string | null; tema?: string | null } = {}): Promise<PlantillaPedida[]> {
  const lista = (ids || []).map((x) => String(x || "").trim()).filter(Boolean);
  const out: PlantillaPedida[] = [];
  for (const id of lista.length ? lista : PAQUETE_POR_DEFECTO) {
    if (id.startsWith("personal:")) {
      const p = await leerPersonal(tenantId, id.slice("personal:".length));
      if (p) out.push({ tipo: "personal", id, diseno: p.diseno });
      continue;
    }
    const r = resolverIdDePlantilla(id);
    if (!r) continue;
    const partes = id.split(".");
    // Lo que no venga en el id toma el estilo/tema por defecto del pedido.
    const estilo = partes[1] ? r.estilo : (opts.estilo ? estiloPorId(opts.estilo).id : r.estilo);
    const tema = partes[2] ? r.tema : (opts.tema ? temaPorId(opts.tema).id : r.tema);
    out.push({ tipo: "catalogo", id: `${r.maqueta}.${estilo}.${tema}`, r: { maqueta: r.maqueta, estilo, tema } });
  }
  if (!out.length) for (const m of PAQUETE_POR_DEFECTO) out.push({ tipo: "catalogo", id: m, r: { maqueta: m, estilo: opts.estilo ? estiloPorId(opts.estilo).id : "marca", tema: opts.tema ? temaPorId(opts.tema).id : "ninguno" } });
  return out.slice(0, 12);
}

/** Diseño de una plantilla pedida para un formato, rotando gancho y foto con `i`. */
export function disenoDePedida(p: PlantillaPedida, formato: Formato, c: Contenido, i: number): Diseno {
  if (p.tipo === "personal") return aplicarDisenoAContenido(p.diseno, c, formato, { gancho: i, foto: i });
  return disenoDePlantilla(p.r.maqueta as Plantilla, formato, c, { estilo: p.r.estilo, tema: p.r.tema, gancho: i, foto: i });
}

/** Id de archivo de una pieza: maqueta-formato (como siempre) o con sufijo cuando la plantilla trae estilo/tema o es propia. */
export function idDePieza(p: PlantillaPedida, formato: Formato): string {
  if (p.tipo === "personal") return `${p.id.replace(/^personal:/, "pp-")}-${formato}`.toLowerCase();
  const sufijo = p.r.estilo !== "marca" || p.r.tema !== "ninguno" ? `-${p.r.estilo}${p.r.tema !== "ninguno" ? `-${p.r.tema}` : ""}` : "";
  return `${p.r.maqueta}${sufijo}-${formato}`.replace(/[^a-z0-9-]/gi, "").slice(0, 60);
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
  const pedidas = await resolverPlantillas(tenantId, opts.plantillas, { estilo: opts.estilo, tema: opts.tema });
  const formatosPedidos = (opts.formatos || []).filter((x) => FORMATOS_LISTA.includes(x));
  const formatos = formatosPedidos.length ? formatosPedidos : FORMATOS_LISTA;
  const piezas: Array<{ pedida: PlantillaPedida; formato: Formato; id: string; diseno: Diseno }> = [];
  pedidas.forEach((pedida, i) => {
    for (const formato of formatos) {
      try { piezas.push({ pedida, formato, id: idDePieza(pedida, formato), diseno: disenoDePedida(pedida, formato, c, i) }); }
      catch (e: any) { logger.warn({ tenantId, productId, plantilla: pedida.id, err: e?.message }, "[Estudio] plantilla no aplicable"); }
    }
  });
  const cargar = cargadorConCache();
  const imagenes: ImagenGenerada[] = [];
  const disenos: Record<string, Diseno> = {};
  for (let i = 0; i < piezas.length; i++) {
    const pz = piezas[i]!;
    avance({ progreso: 5 + Math.round((i / piezas.length) * 85), detalle: `Pintando ${pz.pedida.id} ${FORMATOS[pz.formato].etiqueta} (${i + 1}/${piezas.length})` });
    try {
      const r = await renderizarPieza(productId, pz.id, pz.diseno, cargar);
      imagenes.push({ id: pz.id, plantilla: pz.pedida.id, formato: pz.formato, ancho: r.ancho, alto: r.alto, url: r.url, en: new Date().toISOString() });
      disenos[pz.id] = pz.diseno;
    } catch (e: any) {
      logger.warn({ tenantId, productId, id: pz.id, err: e?.message }, "[Estudio] pieza no pintada");
    }
  }
  if (!imagenes.length) throw new Error("No se pudo pintar ninguna pieza (¿fotos inaccesibles?).");
  avance({ progreso: 92, detalle: "Armando escenas del vídeo" });
  const estiloVideo = opts.estilo || (pedidas[0]?.tipo === "catalogo" ? pedidas[0].r.estilo : null);
  const temaVideo = opts.tema || (pedidas[0]?.tipo === "catalogo" ? pedidas[0].r.tema : null);
  const escenas = escenasAutomaticas(c, { guion: opts.guion, estilo: estiloVideo, tema: temaVideo });
  const estado = await guardarEstudio(productId, (e) => {
    e.contenido = c;
    // Se conservan diseños editados a mano de otras piezas; las regeneradas se reemplazan.
    e.disenos = { ...e.disenos, ...disenos };
    const previas = e.imagenes.filter((img) => !disenos[img.id]);
    e.imagenes = [...imagenes, ...previas];
    if (!e.escenas?.length || !e.escenas.some((s) => (s as any).editada) || opts.guion) e.escenas = escenas;
    e.paquete = { estado: "listo", en: new Date().toISOString(), conIA: !!opts.conIA, estilo: estiloVideo || undefined, tema: temaVideo || undefined, guion: opts.guion || undefined };
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
  /** false = sin animación por capas (fotograma completo con Ken Burns). */
  conAnimaciones?: boolean;
  /** Si se indica, se rearman las escenas con este guion/estilo/tema (ignora las guardadas). */
  guion?: string | null;
  estilo?: string | null;
  tema?: string | null;
}

export async function pedirVideo(tenantId: number, productId: number, opts: OpcionesVideoEstudio = {}): Promise<Trabajo<VideoDelEstudio>> {
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) throw new Error(`No existe el producto ${productId}.`);
  if (!(await hayFfmpegDisponible())) throw new Error("El servidor no tiene ffmpeg: no se pueden armar vídeos.");
  let escenas = opts.escenas?.length ? opts.escenas : leido.estudio.escenas || [];
  const rearmar = !!(opts.guion || opts.estilo || opts.tema) && !opts.escenas?.length;
  if (!escenas.length || rearmar) {
    if (opts.guion && !GUIONES_LISTA.includes(String(opts.guion))) throw new Error(`Guion desconocido: ${opts.guion}. Opciones: ${GUIONES_LISTA.join(", ")}.`);
    const c = leido.estudio.contenido || await contenidoPara(tenantId, leido.producto);
    escenas = escenasAutomaticas(c, { guion: opts.guion || leido.estudio.paquete?.guion, estilo: opts.estilo || leido.estudio.paquete?.estilo, tema: opts.tema || leido.estudio.paquete?.tema });
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
    const v = await armarVideoDesdeEscenas(paraVideo, { carpeta, nombre, voz: opts.voz, conVoz: opts.conVoz, conMusica: opts.conMusica, conAnimaciones: opts.conAnimaciones, avance: (progreso, detalle) => avance({ progreso, detalle }) });
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

// ─── Plantillas: pieza suelta, vista previa, aplicar ─────────────────────────

/**
 * Pinta UNA pieza de una plantilla (del catálogo o propia) para un producto y
 * la añade al estudio sin tocar las demás. Es lo que usa Atlas cuando le
 * piden "hazme una de Navidad para el producto X".
 */
export async function generarPieza(tenantId: number, productId: number, opts: { plantilla: string; formato?: Formato; estilo?: string | null; tema?: string | null; gancho?: string | null; conIA?: boolean }): Promise<ImagenGenerada & { diseno: Diseno }> {
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) throw new Error(`No existe el producto ${productId}.`);
  const formato: Formato = opts.formato && FORMATOS_LISTA.includes(opts.formato) ? opts.formato : "vertical";
  const [pedida] = await resolverPlantillas(tenantId, [opts.plantilla], { estilo: opts.estilo, tema: opts.tema });
  if (!pedida || (opts.plantilla && !opts.plantilla.startsWith("personal:") && !resolverIdDePlantilla(opts.plantilla))) throw new Error(`Plantilla desconocida: ${opts.plantilla}.`);
  const c = leido.estudio.contenido || await contenidoPara(tenantId, leido.producto, { conIA: opts.conIA });
  const contenido: Contenido = opts.gancho?.trim() ? { ...c, ganchos: [opts.gancho.trim().slice(0, 80), ...c.ganchos] } : c;
  const diseno = disenoDePedida(pedida, formato, contenido, 0);
  const id = idDePieza(pedida, formato);
  const r = await renderizarPieza(productId, id, diseno);
  const img: ImagenGenerada = { id, plantilla: pedida.id, formato, ancho: r.ancho, alto: r.alto, url: r.url, en: new Date().toISOString() };
  await guardarEstudio(productId, (e) => {
    if (!e.contenido) e.contenido = c;
    e.disenos[id] = diseno;
    const i = e.imagenes.findIndex((x) => x.id === id);
    if (i >= 0) e.imagenes[i] = img; else e.imagenes.unshift(img);
  });
  return { ...img, diseno };
}

/** Cambia textos de una pieza ya generada por rol de capa (Gancho, Precio, Texto del botón…) y la vuelve a pintar. */
export async function editarTextosDePieza(tenantId: number, productId: number, id: string, cambios: Record<string, string>): Promise<ImagenGenerada> {
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) throw new Error(`No existe el producto ${productId}.`);
  const d = leido.estudio.disenos[id];
  if (!d) throw new Error(`No existe la pieza ${id}.`);
  const { reajustarTexto } = await import("./plantillas");
  const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const mapa = new Map(Object.entries(cambios || {}).map(([k, v]) => [norm(k), String(v ?? "").slice(0, 300)]));
  let tocadas = 0;
  const capas = d.capas.map((k) => {
    if (k.tipo !== "texto") return k;
    const nuevo = mapa.get(norm(k.nombre || "")) ?? mapa.get(norm(k.id));
    if (nuevo == null || !nuevo.trim()) return k;
    tocadas++;
    return reajustarTexto(k, nuevo);
  });
  if (!tocadas) throw new Error(`Ninguna capa coincide. Capas de texto: ${d.capas.filter((k) => k.tipo === "texto").map((k) => k.nombre || k.id).join(", ")}.`);
  return guardarDiseno(tenantId, productId, id, { ...d, capas });
}

const carpetaCache = () => path.join(getImageStoreDir(), "plantillas-cache");

/**
 * Miniatura JPG de una plantilla del catálogo (contenido de muestra, sin
 * fotos) o pintada con un producto concreto. Se cachea en disco por
 * (plantilla, formato, producto) porque el catálogo tiene decenas de miles.
 */
export async function vistaPreviaDePlantilla(tenantId: number, id: string, opts: { formato?: Formato; productId?: number | null; ancho?: number } = {}): Promise<{ ruta: string; url: string } | null> {
  const formato: Formato = opts.formato && FORMATOS_LISTA.includes(opts.formato) ? opts.formato : "vertical";
  const ancho = Math.max(120, Math.min(720, Number(opts.ancho) || 360));
  let diseno: Diseno | null = null;
  let clave: string;
  if (id.startsWith("personal:")) {
    const p = await leerPersonal(tenantId, id.slice("personal:".length));
    if (!p) return null;
    clave = `t${tenantId}-${p.id}-${formato}-${ancho}-${Date.parse(p.creadoEn) || 0}`;
    diseno = p.formato === formato ? p.diseno : aplicarDisenoAContenido(p.diseno, contenidoDeMuestra(), formato);
    if (opts.productId) {
      const leido = await leerEstudio(tenantId, opts.productId);
      if (leido) { const c = leido.estudio.contenido || await contenidoPara(tenantId, leido.producto); diseno = aplicarDisenoAContenido(p.diseno, c, formato); clave += `-p${opts.productId}`; }
    }
  } else {
    const r = resolverIdDePlantilla(id);
    if (!r) return null;
    const idPleno = `${r.maqueta}.${r.estilo}.${r.tema}`;
    clave = `${idPleno}-${formato}-${ancho}`;
    let c = contenidoDeMuestra();
    if (opts.productId) {
      const leido = await leerEstudio(tenantId, opts.productId);
      if (leido) { c = leido.estudio.contenido || await contenidoPara(tenantId, leido.producto); clave = `t${tenantId}-p${opts.productId}-${clave}-${(c.fotos[0] || "").length}`; }
    }
    diseno = disenoDeCatalogo(idPleno, formato, c);
  }
  if (!diseno) return null;
  const archivo = `${clave.replace(/[^a-z0-9.-]/gi, "_")}.jpg`;
  const ruta = path.join(carpetaCache(), archivo);
  if (!existsSync(ruta)) {
    await mkdir(carpetaCache(), { recursive: true });
    const jpg = await renderizarDiseno(diseno, { salida: "jpg", calidad: 82, escala: ancho / diseno.ancho });
    await writeFile(ruta, jpg);
  }
  return { ruta, url: `/uploads/plantillas-cache/${archivo}` };
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
