import { Router } from "express";
import { scrapeUrl, scrapeConJs, crawlSitio } from "../lib/scraper-pro";
import { saveUploadedImage } from "../lib/image-store";
import type { TenantRequest } from "../lib/tenantManager";

const router = Router();

// Todo el módulo es admin: sin tenant no hay scrape (evita SSRF anónimo).
router.use((req, res, next): void => {
  const t = (req as TenantRequest).tenant;
  if (!t?.id) {
    res.status(401).json({ message: "Tenant not resolved" });
    return;
  }
  next();
});

/** POST /api/scraper/url {url, render_js?, max_images?} */
router.post("/url", async (req: TenantRequest, res, next) => {
  try {
    const { url, render_js, max_images } = req.body || {};
    if (!url || typeof url !== "string") return res.status(400).json({ error: "Falta 'url'" });
    const max = Math.min(Math.max(Number(max_images) || 50, 1), 100);
    const r = render_js ? await scrapeConJs(url, max) : await scrapeUrl(url, max);
    return res.json(r);
  } catch (e: any) { return next(e); }
});

/** POST /api/scraper/crawl {start_url, max_pages?, max_depth?, same_domain?} */
router.post("/crawl", async (req: TenantRequest, res, next) => {
  try {
    const { start_url, max_pages, max_depth, same_domain } = req.body || {};
    if (!start_url || typeof start_url !== "string") return res.status(400).json({ error: "Falta 'start_url'" });
    const r = await crawlSitio(start_url, Math.min(Number(max_pages) || 20, 50), Math.min(Number(max_depth) || 2, 5), same_domain !== false);
    return res.json(r);
  } catch (e: any) { return next(e); }
});

/**
 * POST /api/scraper/upload {file, filename}
 * Recibe imagen/archivo desde el frontend como data URL base64 (mismo patrón que code-agent/upload, sin multer).
 * Imágenes -> volumen /uploads/manual. Otros archivos (pdf/txt/csv/json) -> /uploads/docs.
 */
router.post("/upload", async (req: TenantRequest, res, next) => {
  try {
    const { file, filename } = req.body || {};
    if (!file || typeof file !== "string") return res.status(400).json({ error: "Falta 'file' (data URL base64)" });
    const nombre = String(filename || "archivo").replace(/[^\w.\-áéíóúñ]/gi, "_").slice(0, 80);

    if (/^data:image\//i.test(file)) {
      const rel = await saveUploadedImage(file, nombre);
      if (!rel) return res.status(400).json({ error: "No se pudo guardar la imagen" });
      return res.json({ ok: true, path: rel, url: rel });
    }
    // Docs genéricos: data:<mime>;base64,...
    const coma = file.indexOf(",");
    const b64 = coma >= 0 ? file.slice(coma + 1) : file;
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0 || buf.length > 15 * 1024 * 1024) return res.status(400).json({ error: "Archivo inválido o >15MB" });
    const { getImageStoreDir } = await import("../lib/image-store");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(getImageStoreDir(), "docs");
    await mkdir(dir, { recursive: true });
    const safe = `${Date.now()}-${nombre}`;
    await writeFile(path.join(dir, safe), buf);
    return res.json({ ok: true, path: `/uploads/docs/${safe}`, url: `/uploads/docs/${safe}`, bytes: buf.length });
  } catch (e: any) { return next(e); }
});

export default router;
