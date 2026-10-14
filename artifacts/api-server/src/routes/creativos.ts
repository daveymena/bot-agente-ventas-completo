/**
 * Estudio de creativos: las escenas de anuncio del negocio.
 *
 * La pantalla compone en el navegador con las MISMAS maquetas y el mismo
 * dibujante (lib/estudio/*); acá se guarda, se piden ganchos al modelo y se
 * exporta el PNG final con Chromium.
 */
import { Router } from "express";
import type { TenantRequest } from "../lib/tenantManager";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import { MAQUETAS } from "../lib/estudio/maquetas-creativo";
import { FORMATOS, revisarEscena } from "../lib/estudio/escena";
import { FUENTES } from "../lib/estudio/fuentes";

const router = Router();

router.get("/catalogo", (_req, res) => {
  res.json({
    maquetas: MAQUETAS.map(({ id, nombre, descripcion, ideal }) => ({ id, nombre, descripcion, ideal })),
    formatos: FORMATOS,
    fuentes: FUENTES.map(({ id, familia, caracter }) => ({ id, familia, caracter })),
  });
});

/** Los datos reales del producto con que se arman las maquetas. */
router.get("/producto/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const { datosDelProducto } = await import("../lib/creativos/datos");
    const d = await datosDelProducto(tenantId, Number(req.params.id));
    if (!d) return res.status(404).json({ error: "Producto no encontrado" });
    return res.json(d);
  } catch (e) { return next(e); }
});

/** Ganchos (texto sobre la imagen) desde distintos ángulos. */
router.post("/ganchos", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const { datosDelProducto, ganchosConIA } = await import("../lib/creativos/datos");
    const d = await datosDelProducto(tenantId, Number(req.body?.productId));
    if (!d) return res.status(404).json({ error: "Elegí un producto" });
    const cantidad = Math.max(1, Math.min(8, Number(req.body?.cantidad) || 4));
    return res.json(await ganchosConIA(tenantId, d, cantidad, req.body?.pedido ? String(req.body.pedido).slice(0, 300) : null));
  } catch (e) { return next(e); }
});

router.post("/revisar", (req, res) => {
  res.json({ avisos: revisarEscena(req.body?.escena) });
});

/** PNG sin guardar (descarga directa). */
router.post("/render", async (req: TenantRequest, res, next) => {
  try {
    if (!req.tenant?.id) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const { escenaAPng } = await import("../lib/creativos/render");
    const png = await escenaAPng(req.body?.escena, { escala: Number(req.body?.escala) || 1 });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="creativo.png"`);
    return res.send(png);
  } catch (e: any) {
    // Sin Chromium (p. ej. en una máquina de desarrollo sin navegador) se
    // dice qué pasa en vez de un 500 mudo.
    if (/Could not find|executable|Failed to launch|ENOENT/i.test(String(e?.message))) {
      return res.status(503).json({ error: "El servidor no tiene Chromium para exportar. En producción viene en el contenedor." });
    }
    return next(e);
  }
});

/** Subir una imagen propia (logo, foto) para usarla en el creativo. */
router.post("/subir-imagen", async (req: TenantRequest, res, next) => {
  try {
    if (!req.tenant?.id) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const fuente = String(req.body?.dataUrl || "");
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(fuente)) return res.status(400).json({ error: "Mandá una imagen PNG, JPG, WEBP o GIF." });
    const { saveUploadedImage } = await import("../lib/image-store");
    const url = await saveUploadedImage(fuente, String(req.body?.nombre || "creativo"));
    if (!url) return res.status(500).json({ error: "No se pudo guardar la imagen" });
    return res.json({ url });
  } catch (e) { return next(e); }
});

router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const { listarCreativos } = await import("../lib/creativos/almacen");
    return res.json(await listarCreativos(tenantId));
  } catch (e) { return next(e); }
});

router.get("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const { leerCreativo } = await import("../lib/creativos/almacen");
    const c = await leerCreativo(tenantId, String(req.params.id));
    if (!c) return res.status(404).json({ error: "Creativo no encontrado" });
    return res.json(c);
  } catch (e) { return next(e); }
});

/** Crear (sin id) o actualizar (con id). */
router.post("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    if (!req.body?.escena) return res.status(400).json({ error: "Falta la escena" });
    const { guardarCreativo, leerCreativo } = await import("../lib/creativos/almacen");
    if (req.body.id && !(await leerCreativo(tenantId, String(req.body.id)))) return res.status(404).json({ error: "Creativo no encontrado" });
    const c = await guardarCreativo(tenantId, { id: req.body.id, nombre: req.body.nombre, productId: req.body.productId, maqueta: req.body.maqueta, escena: req.body.escena });
    return res.json(c);
  } catch (e) { return next(e); }
});

/** Exporta el PNG final y lo deja guardado en el creativo. */
router.post("/:id/exportar", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const { leerCreativo, guardarCreativo } = await import("../lib/creativos/almacen");
    const c = await leerCreativo(tenantId, String(req.params.id));
    if (!c) return res.status(404).json({ error: "Creativo no encontrado" });
    const { exportarEscena } = await import("../lib/creativos/render");
    const png = await exportarEscena(tenantId, c.escena, c.nombre);
    await guardarCreativo(tenantId, { ...c, png });
    return res.json({ png, avisos: revisarEscena(c.escena) });
  } catch (e: any) {
    if (/Could not find|executable|Failed to launch|ENOENT/i.test(String(e?.message))) {
      return res.status(503).json({ error: "El servidor no tiene Chromium para exportar. En producción viene en el contenedor." });
    }
    return next(e);
  }
});

router.delete("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const { borrarCreativo } = await import("../lib/creativos/almacen");
    const ok = await borrarCreativo(tenantId, String(req.params.id));
    return ok ? res.status(204).end() : res.status(404).json({ error: "Creativo no encontrado" });
  } catch (e) { return next(e); }
});

export default router;
