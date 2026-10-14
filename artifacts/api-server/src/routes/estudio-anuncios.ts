/**
 * API del Estudio de anuncios (panel VentasPro).
 *
 *   GET    /api/estudio-anuncios/salud                 ffmpeg, cola, fuentes
 *   GET    /api/estudio-anuncios/productos             catálogo con estado del estudio
 *   GET    /api/estudio-anuncios/imagen?src=…          proxy same-origin de fotos (canvas sin "taint")
 *   GET    /api/estudio-anuncios/plantillas            plantillas y formatos disponibles
 *   POST   /api/estudio-anuncios/:productId/generar    encola el paquete (imágenes + vídeo)
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
import { FORMATOS, PLANTILLAS, validarDiseno } from "../lib/estudio-anuncios/diseno";
import { fuentesDisponibles } from "../lib/estudio-anuncios/tipografia";
import { cargarImagen, renderizarDiseno } from "../lib/estudio-anuncios/render";
import { hayFfmpegDisponible } from "../lib/estudio-anuncios/video";
import { colaDelEstudio } from "../lib/estudio-anuncios/cola";
import { absoluta, borrarEstudio, borrarImagen, estadoCompleto, guardarArchivo, guardarDiseno, guardarEscenas, pedirPaquete, pedirVideo } from "../lib/estudio-anuncios/estudio";

const router = Router();
const tenantDe = (req: any): number | null => Number(req.tenant?.id) || null;
const idDe = (v: string): number | null => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const cuerpoImagen = raw({ type: ["image/*", "application/octet-stream"], limit: "25mb" });

router.get("/salud", async (req, res) => {
  if (!tenantDe(req)) return res.status(401).json({ error: "No autenticado" });
  const ffmpeg = await hayFfmpegDisponible();
  const fuentes = fuentesDisponibles();
  return res.json({ ok: fuentes, ffmpeg, fuentes, cola: colaDelEstudio().resumen(), nota: !fuentes ? "Faltan las fuentes Inter (assets/fonts): no se puede pintar texto." : ffmpeg ? null : "Sin ffmpeg: las imágenes salen, el vídeo no." });
});

router.get("/plantillas", (_req, res) => res.json({ plantillas: PLANTILLAS, formatos: FORMATOS }));

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
      plantillas: Array.isArray(b.plantillas) ? b.plantillas : undefined,
      formatos: Array.isArray(b.formatos) ? b.formatos : undefined,
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
    });
    return res.status(202).json({ ok: true, trabajo });
  } catch (e: any) {
    if (/inválid|No existe|escenas|ffmpeg/i.test(String(e?.message))) return res.status(400).json({ error: e.message });
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
