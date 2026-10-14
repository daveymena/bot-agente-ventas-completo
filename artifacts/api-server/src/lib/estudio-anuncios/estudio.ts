/**
 * Orquestador del Estudio de anuncios: una petición por producto → paquete
 * de imágenes (plantillas × formatos de Meta/Instagram) + vídeo vertical,
 * todo desde las fotos REALES del producto.
 *
 * Estado persistido en `products.metadata.estudio` para que el panel lo
 * muestre, lo edite (diseños JSON) y lo reutilice en el flujo de Meta.
 * Archivos en `IMAGE_STORE_DIR/anuncios/<productId>/` servidos por /uploads.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { db, products, tenants } from "@workspace/db";
import { logger } from "../logger";
import { getImageStoreDir } from "../image-store";
import { colaDelEstudio, type Trabajo } from "./cola";
import { contenidoDelProducto, ganchosConIA, type ProductoParaEstudio } from "./contenido";
import { escenasAutomaticas, disenoDePlantilla, validarDiseno, FORMATOS, FORMATOS_LISTA, PAQUETE_POR_DEFECTO, GUIONES_LISTA, MOVIMIENTOS_CAMARA, AMBIENTES, estiloPorId, temaPorId, type Ambiente, type Contenido, type Diseno, type Escena, type Formato, type MovimientoCamara, type Plantilla } from "./diseno";
import { aplicarDisenoAContenido, aplicarRecortes, contenidoDeMuestra, darVidaAEscenas, disenoDeCatalogo, leerPersonal, resolverIdDePlantilla, type PlantillaResuelta } from "./plantillas";
import { cargadorConCache, cargarImagen, renderizarDiseno } from "./render";
import { UMBRAL_RECORTE, mascaraDeConservacion, recortarProducto, type Recorte } from "./recorte";
import { hayIAConfigurada, imagenConIA, proveedoresDeIA, videoConIA, type ProveedorId } from "./ia";
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

/** Recorte (foto sin fondo) de una foto del producto, calculado en local. */
export interface RecorteGuardado {
  /** URL del PNG con transparencia; null cuando el recorte no fue confiable. */
  url: string | null;
  confianza: number;
  /** true cuando se usa automáticamente (confianza ≥ UMBRAL_RECORTE). */
  usable: boolean;
  motivo?: string;
  fondo?: string;
  caja?: { x: number; y: number; w: number; h: number };
  en: string;
}

/** Una creación de IA hecha SOBRE la foto real (entorno nuevo o vídeo a partir de la foto). */
export interface CreacionIA {
  id: string;
  tipo: "imagen" | "video";
  estado: "pendiente" | "en_curso" | "lista" | "fallo";
  /** Foto real de la que partió. */
  foto: string;
  instruccion: string;
  proveedor?: ProveedorId;
  modelo?: string;
  url?: string;
  ancho?: number;
  alto?: number;
  duracion?: number;
  /**
   * protegida: el producto se preservó por máscara y se volvió a pegar el recorte original.
   * verificada: sin máscara, pero el producto quedó en su sitio y se pegó el recorte original encima.
   * baja: el proveedor movió/alteró el producto; se guarda pero se avisa (no se usa sola).
   * no_verificable: vídeo (no hay forma local de comprobar cada fotograma).
   */
  fidelidad?: "protegida" | "verificada" | "baja" | "no_verificable";
  nota?: string;
  en: string;
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
  /** Recortes por URL de foto. */
  recortes?: Record<string, RecorteGuardado>;
  /** Creaciones de IA sobre la foto real (nunca se mezclan solas con las fotos). */
  ia?: CreacionIA[];
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
  if (p.tipo === "personal") return aplicarRecortes(aplicarDisenoAContenido(p.diseno, c, formato, { gancho: i, foto: i }), c);
  return aplicarRecortes(disenoDePlantilla(p.r.maqueta as Plantilla, formato, c, { estilo: p.r.estilo, tema: p.r.tema, gancho: i, foto: i }), c);
}

/** Escenas automáticas con el producto recortado y "vivo" (movimiento interno, cámara variada, partículas del tema). */
export function escenasVivas(c: Contenido, opts: { guion?: string | null; estilo?: string | null; tema?: string | null }): Escena[] {
  const escenas = escenasAutomaticas(c, opts).map((e) => ({ ...e, diseno: aplicarRecortes(e.diseno, c) }));
  return darVidaAEscenas(escenas, { tema: opts.tema });
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

/** Contenido guardado (o calculado), siempre con sus recortes: los estudios de antes de esta versión no los traen. */
async function contenidoDe(tenantId: number, leido: { producto: any; estudio: EstadoEstudio }): Promise<Contenido> {
  const c = leido.estudio.contenido;
  if (!c) return contenidoPara(tenantId, leido.producto);
  if (c.recortes || !c.fotos.length) return c;
  const previos = leido.estudio.recortes;
  const faltan = c.fotos.slice(0, 4).some((f) => !previos?.[f]);
  const recortes = faltan ? { ...(previos || {}), ...(await recortesPara(Number(leido.producto.id), c.fotos)) } : previos!;
  const conRecortes: Contenido = { ...c, recortes: recortesUsables(recortes) };
  await guardarEstudio(Number(leido.producto.id), (e) => { e.recortes = { ...(e.recortes || {}), ...recortes }; if (e.contenido) e.contenido = { ...e.contenido, recortes: conRecortes.recortes }; }).catch(() => {});
  return conRecortes;
}

// ─── Contenido: marca + condiciones + fotos reales ───────────────────────────

// ─── Recortes: la foto del producto sin fondo (local, sin IA) ────────────────

const hashCorto = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

/**
 * Calcula (o reutiliza) el recorte de cada foto. Los PNG viven en
 * anuncios/<id>/recortes/<hash>.png con un .json al lado con la confianza; las
 * fotos cuyo fondo no es liso quedan registradas con su motivo y no se usan.
 */
export async function recortesPara(productId: number, fotos: string[], opts: { max?: number; forzar?: boolean; cargar?: (src: string) => Promise<Buffer | null> } = {}): Promise<Record<string, RecorteGuardado>> {
  const out: Record<string, RecorteGuardado> = {};
  const carpeta = path.join(carpetaDe(productId), "recortes");
  const cargar = opts.cargar || cargadorConCache();
  for (const foto of fotos.slice(0, opts.max ?? 4)) {
    const h = hashCorto(foto);
    const rutaPng = path.join(carpeta, `${h}.png`), rutaJson = path.join(carpeta, `${h}.json`);
    if (!opts.forzar && existsSync(rutaJson)) {
      try {
        const previo = JSON.parse(await readFile(rutaJson, "utf8")) as RecorteGuardado;
        if (!previo.url || existsSync(rutaPng)) { out[foto] = previo; continue; }
      } catch { /* se recalcula */ }
    }
    try {
      const buf = await cargar(foto);
      if (!buf) continue;
      const rec = await recortarProducto(buf);
      if (!rec) continue;
      await mkdir(carpeta, { recursive: true });
      const usable = rec.confianza >= UMBRAL_RECORTE;
      if (usable) await writeFile(rutaPng, rec.png);
      const guardado: RecorteGuardado = { url: usable ? urlDe(productId, `recortes/${h}.png`) : null, confianza: Math.round(rec.confianza * 100) / 100, usable, motivo: rec.motivo, fondo: rec.fondo, caja: rec.caja, en: new Date().toISOString() };
      await writeFile(rutaJson, JSON.stringify(guardado));
      out[foto] = guardado;
    } catch (e: any) {
      logger.warn({ productId, foto, err: e?.message }, "[Estudio] no se pudo recortar la foto");
    }
  }
  return out;
}

/** Solo los recortes usables, en la forma que entienden las maquetas. */
export function recortesUsables(r: Record<string, RecorteGuardado> | undefined): Contenido["recortes"] {
  const out: NonNullable<Contenido["recortes"]> = {};
  for (const [src, x] of Object.entries(r || {})) if (x.usable && x.url) out[src] = { url: x.url, confianza: x.confianza };
  return Object.keys(out).length ? out : undefined;
}

// ─── Contenido: marca + condiciones + fotos reales ───────────────────────────

export async function contenidoPara(tenantId: number, p: any, opts: { ganchos?: string[]; destino?: "whatsapp" | "web"; conIA?: boolean; recortes?: boolean } = {}): Promise<Contenido> {
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
  if (opts.recortes !== false && c.fotos.length && Number.isFinite(Number(p?.id))) {
    const recortes = await recortesPara(Number(p.id), c.fotos);
    c.recortes = recortesUsables(recortes);
    await guardarEstudio(Number(p.id), (e) => { e.recortes = { ...(e.recortes || {}), ...recortes }; }).catch(() => {});
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
  const escenas = escenasVivas(c, { guion: opts.guion, estilo: estiloVideo, tema: temaVideo });
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
  /** Movimiento de cámara para TODAS las escenas (si no, cada una conserva/varía el suyo). */
  movimiento?: MovimientoCamara | null;
  /** Partículas para todas las escenas: "nieve", "confeti"… ("ninguno" las quita; undefined = según el tema). */
  ambiente?: Ambiente | "ninguno" | null;
  /** false = las escenas se dejan tal cual (sin añadir movimiento interno al producto). */
  productoVivo?: boolean;
}

export async function pedirVideo(tenantId: number, productId: number, opts: OpcionesVideoEstudio = {}): Promise<Trabajo<VideoDelEstudio>> {
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) throw new Error(`No existe el producto ${productId}.`);
  if (!(await hayFfmpegDisponible())) throw new Error("El servidor no tiene ffmpeg: no se pueden armar vídeos.");
  let escenas = opts.escenas?.length ? opts.escenas : leido.estudio.escenas || [];
  const rearmar = !!(opts.guion || opts.estilo || opts.tema) && !opts.escenas?.length;
  if (!escenas.length || rearmar) {
    if (opts.guion && !GUIONES_LISTA.includes(String(opts.guion))) throw new Error(`Guion desconocido: ${opts.guion}. Opciones: ${GUIONES_LISTA.join(", ")}.`);
    const c = await contenidoDe(tenantId, leido);
    escenas = escenasVivas(c, { guion: opts.guion || leido.estudio.paquete?.guion, estilo: opts.estilo || leido.estudio.paquete?.estilo, tema: opts.tema || leido.estudio.paquete?.tema });
  }
  if (!escenas.every((e) => e && validarDiseno(e.diseno))) throw new Error("Hay escenas con un diseño inválido.");
  if (escenas.length > 12) throw new Error("Máximo 12 escenas por vídeo.");
  if (opts.movimiento && !MOVIMIENTOS_CAMARA[opts.movimiento]) throw new Error(`Movimiento de cámara desconocido: ${opts.movimiento}. Opciones: ${Object.keys(MOVIMIENTOS_CAMARA).join(", ")}.`);
  if (opts.ambiente && opts.ambiente !== "ninguno" && !AMBIENTES[opts.ambiente]) throw new Error(`Ambiente desconocido: ${opts.ambiente}. Opciones: ${Object.keys(AMBIENTES).join(", ")}, ninguno.`);
  // Escenas guardadas antes de esta versión (o pedidas "planas"): se les da vida salvo que el dueño lo apague.
  if (opts.productoVivo !== false && !escenas.some((e) => e.diseno.capas.some((k) => k.anim?.movimiento))) escenas = darVidaAEscenas(escenas, { tema: opts.tema || leido.estudio.paquete?.tema });
  if (opts.movimiento || opts.ambiente) escenas = escenas.map((e) => ({ ...e, movimiento: opts.movimiento || e.movimiento, ambiente: opts.ambiente ? (opts.ambiente === "ninguno" ? null : opts.ambiente) : e.ambiente }));
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
  const c = leido.estudio.contenido ? await contenidoDe(tenantId, leido) : await contenidoPara(tenantId, leido.producto, { conIA: opts.conIA });
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
      if (leido) { const c = await contenidoDe(tenantId, leido); diseno = aplicarRecortes(aplicarDisenoAContenido(p.diseno, c, formato), c); clave += `-p${opts.productId}`; }
    }
  } else {
    const r = resolverIdDePlantilla(id);
    if (!r) return null;
    const idPleno = `${r.maqueta}.${r.estilo}.${r.tema}`;
    clave = `${idPleno}-${formato}-${ancho}`;
    let c = contenidoDeMuestra();
    if (opts.productId) {
      const leido = await leerEstudio(tenantId, opts.productId);
      if (leido) { c = await contenidoDe(tenantId, leido); clave = `t${tenantId}-p${opts.productId}-${clave}-${(c.fotos[0] || "").length}`; }
    }
    const base = disenoDeCatalogo(idPleno, formato, c);
    diseno = base ? aplicarRecortes(base, c) : base;
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

// ─── IA sobre la foto real ───────────────────────────────────────────────────

export interface PedidoIA {
  tipo: "imagen" | "video";
  /** Qué entorno/escena se quiere ("sobre una mesa de madera con luz de tarde"). El producto no se toca. */
  instruccion?: string;
  /** Foto real de partida (una de contenido.fotos o un archivo subido); por defecto la primera. */
  foto?: string | null;
  proveedor?: ProveedorId | null;
  /** Segundos de vídeo (4–10). */
  duracion?: number;
  /** false = no volver a pegar el recorte original sobre el resultado (se guarda lo que devolvió la IA tal cual). */
  conservarProducto?: boolean;
}

/** Qué IA hay disponible, para el panel y Atlas (honesto: sin claves, nada). */
export function estadoDeIA() {
  const proveedores = proveedoresDeIA();
  return { proveedores, imagen: hayIAConfigurada("imagen"), video: hayIAConfigurada("video"), configurada: proveedores.some((p) => p.configurado) };
}

/** Media de la diferencia RGB (0–1) entre dos imágenes del mismo tamaño dentro de la silueta del producto. */
async function desvioEnProducto(a: Buffer, b: Buffer, rec: Recorte): Promise<number> {
  const LADO = 200;
  const { ancho, alto } = rec.original;
  const w = ancho >= alto ? LADO : Math.max(1, Math.round(LADO * ancho / alto));
  const h = ancho >= alto ? Math.max(1, Math.round(LADO * alto / ancho)) : LADO;
  const raw = (buf: Buffer) => sharp(buf).resize(w, h, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const [ra, rb, mk] = await Promise.all([raw(a), raw(b), sharp(await mascaraDeConservacion(rec)).resize(w, h, { fit: "fill" }).ensureAlpha().extractChannel("alpha").toColourspace("b-w").raw().toBuffer({ resolveWithObject: true })]);
  const ca = ra.info.channels, cb = rb.info.channels, cm = mk.info.channels;
  let suma = 0, n = 0;
  for (let p = 0; p < w * h; p++) {
    if (mk.data[p * cm]! < 128) continue;
    for (let k = 0; k < 3; k++) suma += Math.abs(ra.data[p * ca + k]! - rb.data[p * cb + k]!);
    n++;
  }
  return n ? suma / (n * 3 * 255) : 1;
}

async function trabajoIA(tenantId: number, productId: number, creacion: CreacionIA, pedido: PedidoIA, nombreProducto: string, avance: (a: { progreso?: number; detalle?: string }) => void): Promise<CreacionIA> {
  avance({ progreso: 5, detalle: "Leyendo la foto real" });
  const buf = await cargarImagen(creacion.foto);
  if (!buf) throw new Error("No se pudo leer la foto de partida.");
  const rec = await recortarProducto(buf);
  const fotoIA = rec?.foto || await sharp(buf, { failOn: "none" }).rotate().resize(2500, 2500, { fit: "inside", withoutEnlargement: true }).removeAlpha().jpeg({ quality: 92 }).toBuffer();
  const meta: { ancho: number; alto: number } = rec?.original || await sharp(fotoIA).metadata().then((m) => ({ ancho: m.width || 1024, alto: m.height || 1024 }));
  const carpeta = path.join(carpetaDe(productId), "ia");
  await mkdir(carpeta, { recursive: true });
  const conservar = pedido.conservarProducto !== false;
  const confiable = !!rec && rec.confianza >= UMBRAL_RECORTE;
  const instruccion = String(pedido.instruccion || "").trim().slice(0, 500);
  const listo = (extra: Partial<CreacionIA>): CreacionIA => ({ ...creacion, ...extra, estado: "lista", en: new Date().toISOString(), error: undefined });

  if (pedido.tipo === "video") {
    avance({ progreso: 15, detalle: "La IA anima la foto real (1–6 min)" });
    const r = await videoConIA({ foto: fotoIA, instruccion, producto: nombreProducto, duracion: pedido.duracion, proveedor: pedido.proveedor });
    const archivo = `${creacion.id}.mp4`;
    await writeFile(path.join(carpeta, archivo), r.buffer);
    let duracion: number | undefined;
    try { const { duracionDe } = await import("./video"); duracion = await duracionDe(path.join(carpeta, archivo)); } catch { /* sin duración */ }
    return listo({ url: urlDe(productId, `ia/${archivo}`), proveedor: r.proveedor, modelo: r.modelo, duracion, fidelidad: "no_verificable", nota: "Vídeo generado a partir de la foto real como primer fotograma. Revisa que el producto se mantenga idéntico antes de publicarlo." });
  }

  const mascara = confiable && conservar ? await mascaraDeConservacion(rec!) : null;
  avance({ progreso: 15, detalle: mascara ? "La IA pinta el entorno (el producto va protegido por máscara)" : "La IA pinta el entorno alrededor del producto" });
  const r = await imagenConIA({ foto: fotoIA, mascara, instruccion, producto: nombreProducto, ancho: meta.ancho, alto: meta.alto, proveedor: pedido.proveedor });
  avance({ progreso: 80, detalle: "Comprobando que el producto siga igual" });
  let salida = await sharp(r.buffer, { failOn: "none" }).resize(meta.ancho, meta.alto, { fit: "cover" }).removeAlpha().toBuffer();
  let fidelidad: CreacionIA["fidelidad"] = "no_verificable";
  let nota: string | undefined;
  if (confiable && conservar) {
    const desvio = await desvioEnProducto(salida, fotoIA, rec!);
    const proveedorConMascara = !!mascara && proveedoresDeIA().find((p) => p.id === r.proveedor)?.conMascara;
    if (proveedorConMascara || desvio < 0.18) {
      salida = await sharp(salida).composite([{ input: rec!.png, left: rec!.caja.x, top: rec!.caja.y }]).toBuffer();
      fidelidad = proveedorConMascara ? "protegida" : "verificada";
      nota = proveedorConMascara ? "El producto se protegió con máscara y se volvió a pegar el recorte original: píxel a píxel es tu foto." : `El producto quedó en su sitio (desvío ${(desvio * 100).toFixed(0)} %) y se pegó encima el recorte original.`;
    } else {
      fidelidad = "baja";
      nota = `La IA movió o alteró el producto (desvío ${(desvio * 100).toFixed(0)} %). Se guarda para que lo revises, pero no se recomienda publicarla.`;
    }
  } else if (!confiable) {
    nota = `${rec?.motivo || "La foto no tiene fondo liso"}: no se pudo proteger el producto con máscara. Revisa que siga idéntico.`;
  }
  const archivo = `${creacion.id}.jpg`;
  await sharp(salida).jpeg({ quality: 92 }).toFile(path.join(carpeta, archivo));
  return listo({ url: urlDe(productId, `ia/${archivo}`, Date.now()), proveedor: r.proveedor, modelo: r.modelo, ancho: meta.ancho, alto: meta.alto, fidelidad, nota });
}

/** Encola una creación de IA sobre la foto real; devuelve la entrada (pendiente) y el trabajo. */
export async function pedirCreacionIA(tenantId: number, productId: number, pedido: PedidoIA): Promise<{ creacion: CreacionIA; trabajo: Trabajo<CreacionIA> }> {
  const tipo = pedido.tipo === "video" ? "video" : "imagen";
  if (!hayIAConfigurada(tipo)) throw new Error(tipo === "video" ? "No hay IA de vídeo configurada (GOOGLE_API_KEY para Veo o REPLICATE_API_TOKEN). El Estudio sigue armando vídeos en local." : "No hay IA de imágenes configurada (OPENAI_API_KEY, GOOGLE_API_KEY o REPLICATE_API_TOKEN). El Estudio sigue generando piezas en local.");
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) throw new Error(`No existe el producto ${productId}.`);
  const c = await contenidoDe(tenantId, leido);
  const permitidas = new Set([...c.fotos, ...(leido.estudio.archivos || []).map((a) => a.url)]);
  const foto = String(pedido.foto || c.fotos[0] || "").trim();
  if (!foto) throw new Error("El producto no tiene fotos reales: la IA solo trabaja sobre una foto real.");
  if (!permitidas.has(foto)) throw new Error("La foto de partida tiene que ser una foto real del producto (o un archivo subido al Estudio).");
  const creacion: CreacionIA = { id: `ia-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, tipo, estado: "pendiente", foto, instruccion: String(pedido.instruccion || "").trim().slice(0, 500), proveedor: pedido.proveedor || undefined, en: new Date().toISOString() };
  await guardarEstudio(productId, (e) => { e.ia = [creacion, ...(e.ia || [])].slice(0, 40); });
  const cola = colaDelEstudio();
  const clave = `ia:${productId}:${creacion.id}`;
  const trabajo = cola.encolar<CreacionIA>(clave, async (avance) => {
    await guardarEstudio(productId, (e) => { e.ia = (e.ia || []).map((x) => (x.id === creacion.id ? { ...x, estado: "en_curso" } : x)); });
    const lista = await trabajoIA(tenantId, productId, creacion, { ...pedido, tipo }, c.nombre, avance);
    await guardarEstudio(productId, (e) => { e.ia = (e.ia || []).map((x) => (x.id === creacion.id ? lista : x)); });
    logger.info({ tenantId, productId, id: creacion.id, tipo, proveedor: lista.proveedor, fidelidad: lista.fidelidad }, "[Estudio] creación IA lista");
    return lista;
  });
  void cola.esperar<CreacionIA>(clave)?.then(async (t) => {
    if (t.estado !== "fallo") return;
    await guardarEstudio(productId, (e) => { e.ia = (e.ia || []).map((x) => (x.id === creacion.id ? { ...x, estado: "fallo", error: t.error, en: new Date().toISOString() } : x)); }).catch(() => {});
    logger.error({ tenantId, productId, id: creacion.id, err: t.error }, "[Estudio] creación IA falló");
  });
  return { creacion, trabajo };
}

/**
 * Pone una creación de IA a trabajar: como foto del producto (entra en las
 * maquetas y escenas, siempre con origen marcado) o como clip de fondo de una
 * escena del vídeo. Nunca se hace solo: lo decide el dueño o Atlas.
 */
export async function usarCreacionIA(tenantId: number, productId: number, id: string, como: "foto" | "clip", escena?: number): Promise<EstadoEstudio> {
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) throw new Error(`No existe el producto ${productId}.`);
  const cr = (leido.estudio.ia || []).find((x) => x.id === id);
  if (!cr?.url || cr.estado !== "lista") throw new Error("Esa creación de IA no existe o no está lista.");
  if (como === "foto") {
    if (cr.tipo !== "imagen") throw new Error("Solo las imágenes se pueden usar como foto.");
    if (cr.fidelidad === "baja") throw new Error("Esa imagen alteró el producto (fidelidad baja): no se usa como foto del producto.");
    return guardarEstudio(productId, (e) => {
      if (!e.contenido) return;
      e.contenido = { ...e.contenido, fotos: [cr.url!, ...e.contenido.fotos.filter((f) => f !== cr.url)].slice(0, 8) };
    });
  }
  if (cr.tipo !== "video") throw new Error("Solo los vídeos se pueden usar como clip de fondo.");
  const i = Math.max(0, Math.floor(Number(escena) || 0));
  return guardarEstudio(productId, (e) => {
    if (!e.escenas?.[i]) throw new Error(`No existe la escena ${i + 1}.`);
    e.escenas = e.escenas.map((s, k) => (k === i ? { ...s, clip: cr.url!, movimiento: "ninguno" as MovimientoCamara, editada: true } as Escena : s));
  });
}

export async function borrarCreacionIA(tenantId: number, productId: number, id: string): Promise<void> {
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) throw new Error(`No existe el producto ${productId}.`);
  const cr = (leido.estudio.ia || []).find((x) => x.id === id);
  if (!cr) return;
  if (cr.url) await rm(path.join(carpetaDe(productId), "ia", path.basename(cr.url.split("?")[0]!)), { force: true }).catch(() => {});
  await guardarEstudio(productId, (e) => {
    e.ia = (e.ia || []).filter((x) => x.id !== id);
    if (cr.url && e.contenido) e.contenido = { ...e.contenido, fotos: e.contenido.fotos.filter((f) => f !== cr.url) };
    if (cr.url && e.escenas) e.escenas = e.escenas.map((s) => (s.clip === cr.url ? { ...s, clip: null } : s));
  });
}

/** Recorte a demanda (botón "Quitar fondo" del editor): recalcula aunque exista. */
export async function recortarFoto(tenantId: number, productId: number, foto: string | null | undefined): Promise<RecorteGuardado & { foto: string }> {
  const leido = await leerEstudio(tenantId, productId);
  if (!leido) throw new Error(`No existe el producto ${productId}.`);
  const c = leido.estudio.contenido || await contenidoPara(tenantId, leido.producto, { recortes: false });
  const permitidas = new Set([...c.fotos, ...(leido.estudio.archivos || []).map((a) => a.url), ...(leido.estudio.ia || []).map((x) => x.url).filter(Boolean) as string[]]);
  const src = String(foto || c.fotos[0] || "").trim();
  if (!src || !permitidas.has(src)) throw new Error("Esa foto no pertenece al producto.");
  const r = await recortesPara(productId, [src], { forzar: true, max: 1 });
  const rec = r[src];
  if (!rec) throw new Error("No se pudo leer la foto.");
  await guardarEstudio(productId, (e) => {
    e.recortes = { ...(e.recortes || {}), [src]: rec };
    if (e.contenido) e.contenido = { ...e.contenido, recortes: recortesUsables(e.recortes) };
  });
  return { ...rec, foto: src };
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
  const ia: Record<string, any> = {};
  for (const x of estudio.ia || []) {
    const t = cola.estado(`ia:${productId}:${x.id}`);
    if (t) ia[x.id] = { estado: t.estado, progreso: t.progreso, detalle: t.detalle, posicion: t.posicion, error: t.error };
  }
  return {
    producto: { id: producto.id, nombre: producto.name, precio: producto.price, imagen: producto.imageUrl },
    estudio: {
      ...estudio,
      imagenes: estudio.imagenes.map((i) => ({ ...i, urlAbsoluta: absoluta(i.url) })),
      video: estudio.video ? { ...estudio.video, urlAbsoluta: estudio.video.url ? absoluta(estudio.video.url) : undefined } : undefined,
      ia: (estudio.ia || []).map((x) => ({ ...x, urlAbsoluta: x.url ? absoluta(x.url) : undefined })),
    },
    ia: estadoDeIA(),
    trabajos: {
      paquete: tp ? { estado: tp.estado, progreso: tp.progreso, detalle: tp.detalle, posicion: tp.posicion, intento: tp.intento, error: tp.error } : null,
      video: tv ? { estado: tv.estado, progreso: tv.progreso, detalle: tv.detalle, posicion: tv.posicion, intento: tv.intento, error: tv.error } : null,
      ia,
    },
  };
}
