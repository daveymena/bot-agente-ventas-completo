/**
 * API del Estudio de anuncios (panel VentasPro).
 *
 *   GET    /api/estudio-anuncios/salud                 ffmpeg, cola, fuentes
 *   GET    /api/estudio-anuncios/productos             catálogo con estado del estudio
 *   GET    /api/estudio-anuncios/imagen?src=…          proxy same-origin de fotos (canvas sin "taint")
 *   GET    /api/estudio-anuncios/plantillas            maquetas, estilos, temas, guiones, formatos, animaciones
 *   GET    /api/estudio-anuncios/plantillas/buscar     catálogo (maqueta.estilo.tema) con búsqueda y páginas
 *   GET    /api/estudio-anuncios/plantillas/personales plantillas propias del negocio (POST crea, DELETE /:id borra)
 *   POST   /api/estudio-anuncios/plantillas/importar   importa un JSON de Fabric.js (u otro Diseño) como plantilla propia
 *   GET    /api/estudio-anuncios/plantillas/:id        diseño de la plantilla con contenido de muestra (o ?producto=N)
 *   GET    /api/estudio-anuncios/plantillas/:id/vista-previa.jpg  miniatura cacheada
 *   GET    /api/estudio-anuncios/elementos?q=          emojis, iconos, logos y formas (GET /elementos/svg?ref= devuelve el SVG)
 *   GET    /api/estudio-anuncios/patrones/:id.svg      fondo con patrón (color, fondo, escala, w, h)
 *   GET    /api/estudio-anuncios/fuentes               familias tipográficas disponibles (fuentes.css + fuentes/:id/:peso.woff las sirve al editor)
 *   POST   /api/estudio-anuncios/:productId/generar    encola el paquete (imágenes + vídeo); admite plantillas, estilo, tema, guion
 *   POST   /api/estudio-anuncios/:productId/pieza      pinta UNA pieza de una plantilla (catálogo o propia) para el producto
 *   PUT    /api/estudio-anuncios/:productId/pieza/:id/textos  cambia textos por rol (Gancho, Precio…) y repinta
 *   GET    /api/estudio-anuncios/:productId            estado completo (diseños, imágenes, vídeo, cola)
 *   POST   /api/estudio-anuncios/:productId/vista-previa  pinta un diseño sin guardarlo (JPG)
 *   PUT    /api/estudio-anuncios/:productId/diseno/:id guarda un diseño editado y lo repinta
 *   DELETE /api/estudio-anuncios/:productId/imagen/:id
 *   PUT    /api/estudio-anuncios/:productId/escenas    guarda el guion/escenas editadas
 *   POST   /api/estudio-anuncios/:productId/fotograma?indice=N   PNG de una escena exportado por el editor
 *   POST   /api/estudio-anuncios/:productId/video      encola el vídeo con las escenas guardadas
 *   POST   /api/estudio-anuncios/:productId/archivo    sube una imagen propia (logo, foto) → URL
 *   DELETE /api/estudio-anuncios/:productId            borra el estudio del producto
 */
import { Router, raw } from "express";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, products } from "@workspace/db";
import { logger } from "../lib/logger";
import { getImageStoreDir } from "../lib/image-store";
import { ANIMACIONES, FORMATOS, FORMATOS_LISTA, PLANTILLAS, TRANSICIONES, PATRONES_LISTA, validarDiseno, resumenDeEstilos, resumenDeTemas, resumenDeGuiones, type Formato, svgDePatron } from "../lib/estudio-anuncios/diseno";
import { FUENTES, familiasInstaladas, fuentesDisponibles, archivoDeFuente, cssDeFuentes, type Peso } from "../lib/estudio-anuncios/tipografia";
import { buscarElementos, resumenDeColecciones, svgDeElemento, type Coleccion } from "../lib/estudio-anuncios/elementos";
import { borrarPersonal, buscarPlantillas, contenidoDeMuestra, desdeFabricJSON, disenoDeCatalogo, guardarPersonal, leerPersonal, listarPersonales, aplicarDisenoAContenido, totalDePlantillas } from "../lib/estudio-anuncios/plantillas";
import { cargarImagen, renderizarDiseno } from "../lib/estudio-anuncios/render";
import { hayFfmpegDisponible } from "../lib/estudio-anuncios/video";
import { colaDelEstudio } from "../lib/estudio-anuncios/cola";
import { absoluta, borrarEstudio, borrarImagen, contenidoPara, editarTextosDePieza, estadoCompleto, generarPieza, guardarArchivo, guardarDiseno, guardarEscenas, leerEstudio, pedirPaquete, pedirVideo, vistaPreviaDePlantilla } from "../lib/estudio-anuncios/estudio";

const router = Router();
const tenantDe = (req: any): number | null => Number(req.tenant?.id) || null;
const idDe = (v: string): number | null => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const cuerpoImagen = raw({ type: ["image/*", "application/octet-stream"], limit: "25mb" });

router.get("/salud", async (req, res) => {
  if (!tenantDe(req)) return res.status(401).json({ error: "No autenticado" });
  const ffmpeg = await hayFfmpegDisponible();
  const fuentes = fuentesDisponibles();
  return res.json({ ok: fuentes, ffmpeg, fuentes, familias: familiasInstaladas().length, plantillas: totalDePlantillas(), cola: colaDelEstudio().resumen(), nota: !fuentes ? "Faltan las fuentes Inter (assets/fonts): no se puede pintar texto." : ffmpeg ? null : "Sin ffmpeg: las imágenes salen, el vídeo no." });
});

const formatoDe = (v: unknown, porDefecto: Formato = "vertical"): Formato => (FORMATOS_LISTA.includes(v as Formato) ? (v as Formato) : porDefecto);

router.get("/plantillas", async (req, res) => {
  const tenantId = tenantDe(req);
  const personales = tenantId ? (await listarPersonales(tenantId)).map((p) => ({ id: `personal:${p.id}`, nombre: p.nombre, formato: p.formato, creadoEn: p.creadoEn, origen: p.origen })) : [];
  return res.json({
    plantillas: PLANTILLAS, formatos: FORMATOS, estilos: resumenDeEstilos(), temas: resumenDeTemas(), guiones: resumenDeGuiones(),
    transiciones: TRANSICIONES, animaciones: ANIMACIONES, patrones: PATRONES_LISTA, total: totalDePlantillas(), personales,
  });
});

router.get("/plantillas/buscar", (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const r = buscarPlantillas({ q: q.q, categoria: q.categoria, maqueta: q.maqueta, estilo: q.estilo, tema: q.tema, pagina: Number(q.pagina) || 1, porPagina: Number(q.porPagina) || 24 });
  const formato = formatoDe(q.formato);
  const producto = idDe(String(q.producto || ""));
  return res.json({ ...r, items: r.items.map((p) => ({ ...p, vistaPrevia: `/api/estudio-anuncios/plantillas/${p.id}/vista-previa.jpg?formato=${formato}${producto ? `&producto=${producto}` : ""}` })) });
});

router.get("/plantillas/personales", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const lista = await listarPersonales(tenantId);
    return res.json({ plantillas: lista.map((p) => ({ id: `personal:${p.id}`, nombre: p.nombre, formato: p.formato, creadoEn: p.creadoEn, origen: p.origen, capas: p.diseno.capas.length, vistaPrevia: `/api/estudio-anuncios/plantillas/personal:${p.id}/vista-previa.jpg?formato=${p.formato}` })) });
  } catch (e) { return next(e); }
});

router.post("/plantillas/personales", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const d = req.body?.diseno;
    if (!validarDiseno(d)) return res.status(400).json({ error: "Diseño inválido" });
    const p = await guardarPersonal(tenantId, { nombre: String(req.body?.nombre || ""), diseno: d, origen: "editor" });
    return res.status(201).json({ ok: true, plantilla: { id: `personal:${p.id}`, nombre: p.nombre, formato: p.formato, creadoEn: p.creadoEn, origen: p.origen } });
  } catch (e: any) {
    if (/inválid|Máximo/i.test(String(e?.message))) return res.status(400).json({ error: e.message });
    return next(e);
  }
});

router.delete("/plantillas/personales/:id", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const ok = await borrarPersonal(tenantId, String(req.params.id).replace(/^personal:/, ""));
    return ok ? res.json({ ok: true }) : res.status(404).json({ error: "No existe esa plantilla" });
  } catch (e) { return next(e); }
});

/** Importa un lienzo de Fabric.js (vue-fabric-editor, layerhub, etc.) o un Diseño del propio Estudio. */
router.post("/plantillas/importar", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const b = req.body || {};
    const formato = formatoDe(b.formato);
    let diseno = b.diseno;
    let origen: "fabric" | "json" = "json";
    if (!validarDiseno(diseno)) {
      const fabric = b.fabric ?? b.json ?? (b.objects ? b : null);
      if (!fabric) return res.status(400).json({ error: "Envía `diseno` (Estudio) o `fabric` (JSON de Fabric.js con `objects`)." });
      try { diseno = desdeFabricJSON(typeof fabric === "string" ? JSON.parse(fabric) : fabric, formato, { ancho: Number(b.ancho) || undefined, alto: Number(b.alto) || undefined }); }
      catch (e: any) { return res.status(400).json({ error: `No se pudo importar: ${e?.message || e}` }); }
      origen = "fabric";
    }
    if (!validarDiseno(diseno)) return res.status(400).json({ error: "El resultado no es un diseño válido." });
    const p = await guardarPersonal(tenantId, { nombre: String(b.nombre || "Plantilla importada"), diseno, origen });
    return res.status(201).json({ ok: true, plantilla: { id: `personal:${p.id}`, nombre: p.nombre, formato: p.formato, capas: p.diseno.capas.length, origen }, diseno: p.diseno });
  } catch (e: any) {
    if (/inválid|Máximo/i.test(String(e?.message))) return res.status(400).json({ error: e.message });
    return next(e);
  }
});

router.get("/plantillas/:id/vista-previa.jpg", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).end();
    const producto = idDe(String(req.query.producto || ""));
    const r = await vistaPreviaDePlantilla(tenantId, String(req.params.id), { formato: formatoDe(req.query.formato), productId: producto, ancho: Number(req.query.ancho) || 360 });
    if (!r) return res.status(404).end();
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", producto ? "private, max-age=600" : "private, max-age=86400");
    return res.sendFile(r.ruta);
  } catch (e) { return next(e); }
});

/** Diseño de una plantilla con contenido de muestra, o aplicado a un producto (?producto=N) para abrirlo en el editor. */
router.get("/plantillas/:id", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const id = String(req.params.id);
    const formato = formatoDe(req.query.formato);
    const producto = idDe(String(req.query.producto || ""));
    let c = contenidoDeMuestra();
    if (producto) {
      const leido = await leerEstudio(tenantId, producto);
      if (!leido) return res.status(404).json({ error: "Producto no encontrado" });
      c = leido.estudio.contenido || await contenidoPara(tenantId, leido.producto);
    }
    let diseno = null;
    if (id.startsWith("personal:")) {
      const p = await leerPersonal(tenantId, id.slice("personal:".length));
      if (p) diseno = producto || p.formato !== formato ? aplicarDisenoAContenido(p.diseno, c, formato) : p.diseno;
    } else diseno = disenoDeCatalogo(id, formato, c);
    if (!diseno) return res.status(404).json({ error: "Plantilla no encontrada" });
    return res.json({ id, formato, diseno, contenido: producto ? undefined : c });
  } catch (e) { return next(e); }
});

router.get("/elementos", (req, res) => {
  const q = String(req.query.q || "").slice(0, 60);
  const col = String(req.query.coleccion || "");
  const coleccion = (["emoji", "iconos", "marcas", "formas"] as Coleccion[]).includes(col as Coleccion) ? (col as Coleccion) : null;
  const items = buscarElementos(q, { coleccion, limite: Math.min(120, Number(req.query.limite) || 48) });
  return res.json({ items: items.map((e) => ({ ...e, svg: `/api/estudio-anuncios/elementos/svg?ref=${encodeURIComponent(e.ref)}` })), colecciones: resumenDeColecciones() });
});

router.get("/elementos/svg", (req, res) => {
  const ref = String(req.query.ref || "");
  if (!ref || ref.length > 200 || ref.startsWith("svg:")) return res.status(400).end();
  const color = typeof req.query.color === "string" && /^#[0-9a-f]{3,8}$/i.test(req.query.color) ? req.query.color : null;
  const el = svgDeElemento(ref, color);
  if (!el) return res.status(404).end();
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  return res.end(el.svg);
});

/** Baldosa de patrón como SVG completo (el editor del panel lo usa de fondo, igual que el servidor al pintar). */
router.get("/patrones/:id.svg", (req, res) => {
  const id = String(req.params.id || "");
  if (!PATRONES_LISTA.includes(id)) return res.status(404).end();
  const color = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);
  const W = Math.min(2160, Math.max(40, Number(req.query.w) || 1080)), H = Math.min(2160, Math.max(40, Number(req.query.h) || 1080));
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  return res.end(svgDePatron({ patron: id, color: color(req.query.color, "#00000022"), fondo: color(req.query.fondo, "#ffffff"), escala: Number(req.query.escala) || 1 }, W, H));
});

router.get("/fuentes", (_req, res) => {
  const instaladas = new Set(familiasInstaladas());
  return res.json({ fuentes: FUENTES.map((f) => ({ ...f, instalada: instaladas.has(f.id) })), css: "/api/estudio-anuncios/fuentes.css" });
});

/** Las mismas fuentes que usa el servidor para pintar, servidas al editor del panel (así lo que se ve es lo que sale). */
router.get("/fuentes.css", (_req, res) => {
  res.setHeader("Content-Type", "text/css; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.end(cssDeFuentes("/api/estudio-anuncios/fuentes"));
});

router.get("/fuentes/:id/:archivo", (req, res) => {
  const m = /^(400|700|900)\.(woff|ttf)$/.exec(String(req.params.archivo || ""));
  if (!m) return res.status(404).end();
  const a = archivoDeFuente(String(req.params.id || ""), Number(m[1]) as Peso);
  if (!a) return res.status(404).end();
  res.setHeader("Content-Type", a.formato === "woff" ? "font/woff" : "font/ttf");
  res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.sendFile(a.ruta);
});

router.get("/productos", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const filas = await db.select().from(products).where(eq(products.tenantId, tenantId));
    const cola = colaDelEstudio();
    interface Fila { id: number; nombre: string; precio: unknown; moneda: unknown; imagen: string | null; activo: boolean; fotos: number; estudio: { paquete: string | null; imagenes: number; video: string | null; videoUrl: string | null; portada: string | null; en: string | null } | null }
    const lista: Fila[] = filas.map((p: any) => {
      let m: any = {}; try { m = typeof p.metadata === "string" ? JSON.parse(p.metadata) : (p.metadata || {}); } catch { /* sin metadata */ }
      const e = m?.estudio || null;
      const tp = cola.estado(`paquete:${p.id}`), tv = cola.estado(`video:${p.id}`);
      const nFotos = (Array.isArray(m?.imagenes) ? m.imagenes.length : 0) + (p.imageUrl ? 1 : 0) + (Array.isArray(m?.imageUrls) ? m.imageUrls.length : 0) + (Array.isArray(m?.woocommerce?.imageUrls) ? m.woocommerce.imageUrls.length : 0);
      return {
        id: p.id, nombre: p.name, precio: p.price, moneda: p.currency, imagen: p.imageUrl, activo: p.isActive !== false, fotos: nFotos,
        estudio: e ? { paquete: tp?.estado && tp.estado !== "listo" ? tp.estado : e.paquete?.estado || null, imagenes: Array.isArray(e.imagenes) ? e.imagenes.length : 0, video: tv?.estado && tv.estado !== "listo" ? tv.estado : e.video?.estado || null, videoUrl: e.video?.url || null, portada: e.imagenes?.[0]?.url || null, en: e.paquete?.en || null } : null,
      };
    });
    lista.sort((a, b) => (b.estudio?.en || "").localeCompare(a.estudio?.en || "") || String(a.nombre).localeCompare(String(b.nombre)));
    return res.json({ productos: lista });
  } catch (e) { return next(e); }
});

/** Proxy de fotos para el editor: Fabric necesita same-origin (o CORS) para exportar el canvas. */
router.get("/imagen", async (req, res) => {
  if (!tenantDe(req)) return res.status(401).end();
  const src = String(req.query.src || "").trim();
  if (!src || src.length > 2000) return res.status(400).end();
  try {
    const u = /^https?:\/\//i.test(src) ? new URL(src) : null;
    if (u && /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\]|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname)) return res.status(400).end();
    if (!u && !/^\/(images\/products|uploads)\//.test(src)) return res.status(400).end();
  } catch { return res.status(400).end(); }
  const buf = await cargarImagen(src, 15_000);
  if (!buf) return res.status(404).end();
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    const tipo = meta.format === "png" ? "image/png" : meta.format === "webp" ? "image/webp" : meta.format === "gif" ? "image/gif" : "image/jpeg";
    res.setHeader("Content-Type", tipo);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.end(buf);
  } catch { return res.status(415).end(); }
});

router.post("/:productId/generar", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    const b = req.body || {};
    const trabajo = await pedirPaquete(tenantId, productId, {
      plantillas: Array.isArray(b.plantillas) ? b.plantillas.map(String).slice(0, 12) : undefined,
      formatos: Array.isArray(b.formatos) ? b.formatos : undefined,
      estilo: typeof b.estilo === "string" ? b.estilo : undefined,
      tema: typeof b.tema === "string" ? b.tema : undefined,
      guion: typeof b.guion === "string" ? b.guion : undefined,
      conIA: b.conIA === true,
      conVideo: b.conVideo !== false,
      ganchos: Array.isArray(b.ganchos) ? b.ganchos.map(String).slice(0, 5) : undefined,
      destino: b.destino === "web" ? "web" : "whatsapp",
    });
    return res.status(202).json({ ok: true, trabajo });
  } catch (e: any) {
    if (/No existe/.test(String(e?.message))) return res.status(404).json({ error: e.message });
    return next(e);
  }
});

router.post("/:productId/pieza", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    const b = req.body || {};
    if (!b.plantilla || typeof b.plantilla !== "string") return res.status(400).json({ error: "Falta `plantilla` (p. ej. oferta.pop.navidad o personal:p-abc)" });
    const img = await generarPieza(tenantId, productId, { plantilla: b.plantilla, formato: formatoDe(b.formato), estilo: typeof b.estilo === "string" ? b.estilo : undefined, tema: typeof b.tema === "string" ? b.tema : undefined, gancho: typeof b.gancho === "string" ? b.gancho : undefined, conIA: b.conIA === true });
    return res.status(201).json({ ok: true, imagen: { ...img, urlAbsoluta: absoluta(img.url) } });
  } catch (e: any) {
    if (/inválid|No existe|desconocida/i.test(String(e?.message))) return res.status(400).json({ error: e.message });
    return next(e);
  }
});

router.put("/:productId/pieza/:id/textos", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    const cambios = req.body?.cambios && typeof req.body.cambios === "object" ? req.body.cambios : null;
    if (!cambios) return res.status(400).json({ error: "Falta `cambios` { \"Gancho\": \"…\", \"Precio\": \"…\" }" });
    const img = await editarTextosDePieza(tenantId, productId, String(req.params.id), cambios);
    return res.json({ ok: true, imagen: { ...img, urlAbsoluta: absoluta(img.url) } });
  } catch (e: any) {
    if (/inválid|No existe|coincide/i.test(String(e?.message))) return res.status(400).json({ error: e.message });
    return next(e);
  }
});

router.get("/:productId", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    const estado = await estadoCompleto(tenantId, productId);
    if (!estado) return res.status(404).json({ error: "Producto no encontrado" });
    return res.json(estado);
  } catch (e) { return next(e); }
});

router.post("/:productId/vista-previa", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const d = req.body?.diseno;
    if (!validarDiseno(d)) return res.status(400).json({ error: "Diseño inválido" });
    const escala = Math.min(1, Math.max(0.1, Number(req.query.escala) || 0.5));
    const jpg = await renderizarDiseno(d, { salida: "jpg", calidad: 82, escala });
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.end(jpg);
  } catch (e) { return next(e); }
});

router.put("/:productId/diseno/:id", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    const d = req.body?.diseno;
    if (!validarDiseno(d)) return res.status(400).json({ error: "Diseño inválido" });
    // El editor puede mandar el JPG tal cual lo ve el dueño (base64) para que el archivo sea idéntico al lienzo.
    let exportado: Buffer | null = null;
    if (typeof req.body?.imagen === "string" && req.body.imagen.startsWith("data:image/")) {
      const b64 = req.body.imagen.split(",")[1] || "";
      if (b64.length < 12_000_000) exportado = Buffer.from(b64, "base64");
    }
    const img = await guardarDiseno(tenantId, productId, String(req.params.id), d, exportado);
    return res.json({ ok: true, imagen: { ...img, urlAbsoluta: absoluta(img.url) } });
  } catch (e: any) {
    if (/inválid|No existe/i.test(String(e?.message))) return res.status(400).json({ error: e.message });
    return next(e);
  }
});

router.delete("/:productId/imagen/:id", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    await borrarImagen(tenantId, productId, String(req.params.id));
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

router.put("/:productId/escenas", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    const escenas = await guardarEscenas(tenantId, productId, req.body?.escenas);
    return res.json({ ok: true, escenas });
  } catch (e: any) {
    if (/inválid|No existe|escenas/i.test(String(e?.message))) return res.status(400).json({ error: e.message });
    return next(e);
  }
});

router.post("/:productId/fotograma", cuerpoImagen, async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    if (!Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ error: "Falta la imagen" });
    const { ruta } = await guardarArchivo(tenantId, productId, req.body, { temporal: true });
    return res.json({ ok: true, fotograma: path.basename(ruta) });
  } catch (e: any) {
    if (/inválid|No existe/i.test(String(e?.message))) return res.status(400).json({ error: e.message });
    return next(e);
  }
});

router.post("/:productId/video", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    const b = req.body || {};
    const fotogramas: Record<number, string> = {};
    if (b.fotogramas && typeof b.fotogramas === "object") {
      const tmp = path.join(getImageStoreDir(), "anuncios", String(productId), "tmp");
      for (const [k, v] of Object.entries(b.fotogramas as Record<string, string>)) {
        const i = Number(k); const nombre = path.basename(String(v || ""));
        if (Number.isInteger(i) && i >= 0 && i < 12 && /^\d+-[a-z0-9]+\.png$/.test(nombre)) fotogramas[i] = path.join(tmp, nombre);
      }
    }
    const trabajo = await pedirVideo(tenantId, productId, {
      escenas: Array.isArray(b.escenas) && b.escenas.length ? b.escenas : undefined,
      fotogramas,
      voz: typeof b.voz === "string" && /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(b.voz) ? b.voz : undefined,
      conVoz: b.conVoz !== false,
      conMusica: b.conMusica !== false,
      conAnimaciones: b.conAnimaciones !== false,
      guion: typeof b.guion === "string" ? b.guion : undefined,
      estilo: typeof b.estilo === "string" ? b.estilo : undefined,
      tema: typeof b.tema === "string" ? b.tema : undefined,
    });
    return res.status(202).json({ ok: true, trabajo });
  } catch (e: any) {
    if (/inválid|No existe|escenas|ffmpeg|Guion/i.test(String(e?.message))) return res.status(400).json({ error: e.message });
    return next(e);
  }
});

router.post("/:productId/archivo", cuerpoImagen, async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    if (!Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ error: "Falta la imagen (envíala como cuerpo binario image/*)" });
    const nombre = typeof req.query.nombre === "string" ? req.query.nombre.slice(0, 80) : undefined;
    const { url } = await guardarArchivo(tenantId, productId, req.body, { nombre });
    return res.json({ ok: true, url, urlAbsoluta: absoluta(url) });
  } catch (e: any) {
    if (/inválid|No existe/i.test(String(e?.message))) return res.status(400).json({ error: e.message });
    return next(e);
  }
});

router.delete("/:productId", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = idDe(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Producto inválido" });
    await borrarEstudio(tenantId, productId);
    logger.info({ tenantId, productId }, "[Estudio] estudio borrado");
    return res.json({ ok: true });
  } catch (e: any) {
    if (/No existe/.test(String(e?.message))) return res.status(404).json({ error: e.message });
    return next(e);
  }
});

export default router;
