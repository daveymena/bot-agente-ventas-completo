import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import type { TenantRequest } from "../lib/tenantManager";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import { logger } from "../lib/logger";

const router = Router();

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "landing";
}

async function productBelongsToTenant(productId: unknown, tenantId: number) {
  if (productId === null || productId === undefined || productId === "") return true;
  const numericId = Number(productId);
  if (!Number.isInteger(numericId) || numericId <= 0) return false;
  const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, numericId), eq(products.tenantId, tenantId))).limit(1);
  return !!product;
}

router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const rows = await db.select().from(landingPages).where(eq(landingPages.tenantId, tenantId)).orderBy(desc(landingPages.updatedAt));
    return res.json(rows);
  } catch (e) { return next(e); }
});

router.get("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const [row] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Landing no encontrada" });
    return res.json(row);
  } catch (e) { return next(e); }
});

router.post("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const { name = "Nueva landing", productId = null, strategy = {}, sections = [], design = {}, source = {} } = req.body || {};
    if (!(await productBelongsToTenant(productId, tenantId))) return res.status(400).json({ error: "El producto no pertenece al tenant actual o no es válido" });
    const normalizedProductId = productId === null || productId === undefined || productId === "" ? null : Number(productId);
    const [created] = await db.insert(landingPages).values({ tenantId, productId: normalizedProductId, name: String(name).slice(0, 200), slug: slugify(String(name)) + "-" + Date.now().toString(36), strategy, sections, design, source }).returning();
    return res.status(201).json(created);
  } catch (e) { return next(e); }
});

router.patch("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const allowed = ["name", "status", "strategy", "sections", "design", "source", "publishedUrl", "productId"] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    if (Object.prototype.hasOwnProperty.call(patch, "productId")) {
      if (!(await productBelongsToTenant(patch.productId, tenantId))) return res.status(400).json({ error: "El producto no pertenece al tenant actual o no es válido" });
      patch.productId = patch.productId === null || patch.productId === "" ? null : Number(patch.productId);
    }
    patch.updatedAt = new Date();
    const [updated] = await db.update(landingPages).set(patch as any).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).returning();
    if (!updated) return res.status(404).json({ error: "Landing no encontrada" });
    return res.json(updated);
  } catch (e) { return next(e); }
});

/**
 * La landing, renderizada como HTML de verdad.
 *
 * Existe porque el exportador viejo --que vivia en el frontend-- escribia la
 * MISMA caja para las once secciones, con quince lineas de CSS y sin usar
 * nunca la foto del producto. El dueno lo dijo mirandolo: "esas landings son
 * solo HTML, no tienen diseno, no adjunta la imagen ni nada".
 *
 * Se renderiza en el SERVIDOR y no en la pantalla por dos razones: el
 * renderer necesita los datos reales del producto (foto, precio, enlace de
 * pago), y el mismo HTML tiene que servir para la vista previa, para la
 * exportacion y para publicar. Tres copias del renderer serian tres diseños
 * distintos con el tiempo.
 *
 * `familia` puede venir por query para previsualizar un estilo sin guardarlo.
 */
router.get("/:id/render", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);

    const [row] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Landing no encontrada" });

    // Si la landing fue generada por LandingForge, redirigir a su URL pública
    const source = row.source as any;
    if (source?.landingforgeUrl) {
      return res.redirect(302, source.landingforgeUrl);
    }

    // Si tiene publishedUrl EXTERNA, redirigir ahí. La propia (/l/:slug) no:
    // el editor quiere ver la versión guardada acá, con sesión.
    if (row.publishedUrl && !/\/l\//.test(String(row.publishedUrl))) {
      return res.redirect(302, row.publishedUrl);
    }

    // El producto se lee ACA y no se confia al cliente: la foto, el precio y
    // el enlace de pago son datos del negocio, y una landing que muestra un
    // precio que el cliente mando seria una landing falsificable.
    let producto: any = null;
    if (row.productId) {
      const [p] = await db.select().from(products).where(and(eq(products.id, row.productId), eq(products.tenantId, tenantId))).limit(1);
      producto = p || null;
    }

    // Una copia HTML se sirve tal cual: no pasa por el renderer de secciones.
    const { htmlDeCopia } = await import("../lib/landing/clonar-html");
    const copia = htmlDeCopia(row);
    if (copia) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(copia);
    }
    const { renderizarLanding } = await import("../lib/landing/renderer");
    const { negocioParaRender } = await import("../lib/landing/negocio-para-render");
    const negocio = await negocioParaRender(tenantId, producto);
    const html = renderizarLanding({
      nombre: row.name,
      secciones: (row.sections as any[]) || [],
      familia: (row.design as any)?.familia ?? (req.query.familia as string) ?? null,
      producto: producto && {
        name: producto.name, description: producto.description, imageUrl: producto.imageUrl,
        price: producto.price, currency: producto.currency, paymentLink: producto.paymentLink,
        // El WhatsApp sale del tenant real (contactPhone), via negocioParaRender.
        whatsapp: negocio.whatsapp,
      },
      negocio,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (e) { return next(e); }
});

/**
 * Publicar: la landing queda visible en /l/:slug con el dominio de la app,
 * sin login y sin hosting aparte. Esa es la URL que va en el anuncio.
 * Despublicar (`publicada: false`) la vuelve a borrador y /l/:slug da 404.
 */
router.post("/:id/publish", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const [row] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Landing no encontrada" });

    const publicar = req.body?.publicada !== false;
    const { urlPublicaDe } = await import("./landing-publica");
    const publishedUrl = publicar ? urlPublicaDe(row.slug) : null;
    await db.update(landingPages)
      .set({ status: publicar ? "published" : "draft", publishedUrl, updatedAt: new Date() } as any)
      .where(eq(landingPages.id, id));
    logger.info({ tenantId, id, publishedUrl }, "[LandingPages] publicación cambiada");
    return res.json({ ok: true, id, status: publicar ? "published" : "draft", url: publishedUrl });
  } catch (e) { return next(e); }
});

/**
 * Vista previa de algo que TODAVIA no se guardo.
 *
 * El editor cambia secciones y estilo antes de guardar; sin esto habria que
 * guardar para poder mirar, o mantener un segundo renderer en el frontend
 * --que es justo lo que se acaba de sacar--.
 */
router.post("/preview", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    const productId = Number(req.body?.productId);
    let producto: any = null;
    if (Number.isInteger(productId) && productId > 0) {
      const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
      producto = p || null;
    }

    const { renderizarLanding } = await import("../lib/landing/renderer");
    const { negocioParaRender } = await import("../lib/landing/negocio-para-render");
    const negocio = await negocioParaRender(tenantId, producto);
    const html = renderizarLanding({
      nombre: String(req.body?.name || "Vista previa"),
      secciones: Array.isArray(req.body?.sections) ? req.body.sections : [],
      familia: req.body?.familia ?? req.body?.design?.familia ?? null,
      producto: producto && {
        name: producto.name, description: producto.description, imageUrl: producto.imageUrl,
        price: producto.price, currency: producto.currency, paymentLink: producto.paymentLink,
        // El WhatsApp sale del tenant real (contactPhone), via negocioParaRender.
        whatsapp: negocio.whatsapp,
      },
      negocio,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (e) { return next(e); }
});

// Clonar una landing REAL (HTML + CSS) desde una URL. Queda en borrador, sin adaptar.
router.post("/importar-url", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const url = String(req.body?.url || "").trim();
    if (!url) return res.status(400).json({ error: "Falta 'url'." });
    const { importarLandingDesdeUrl } = await import("../lib/landing/clonar-html");
    const r = await importarLandingDesdeUrl({ tenantId, url, productId: req.body?.productId ?? null, nombre: req.body?.nombre ?? null });
    return res.status(201).json({ ok: true, landing: r.landing, hojas: r.hojas, imagenes: r.imagenes, advertencias: r.advertencias });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "No se pudo clonar la URL." });
  }
});

// Adaptar una copia HTML al producto del negocio (textos, fotos y botones).
router.post("/:id/adaptar", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const { adaptarLandingHtml } = await import("../lib/landing/clonar-html");
    const r = await adaptarLandingHtml({ tenantId, landingId: id, productId: req.body?.productId ?? null });
    return res.json({ ok: true, ...r });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "No se pudo adaptar." });
  }
});

// Clonar: misma landing (copia) o su ESTILO para otro producto. Queda en borrador.
router.post("/:id/clonar", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const { clonarLanding } = await import("../lib/landing/clonar");
    const r = await clonarLanding({ tenantId, landingId: id, productId: req.body?.productId ?? null, nombre: req.body?.nombre ?? null });
    if (!r.ok) return res.status(404).json({ error: r.error });
    return res.status(201).json({ ok: true, modo: r.modo, landing: r.landing });
  } catch (e) { return next(e); }
});

router.delete("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const [deleted] = await db.delete(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).returning({ id: landingPages.id });
    if (!deleted) return res.status(404).json({ error: "Landing no encontrada" });
    return res.status(204).send();
  } catch (e) { return next(e); }
});

export default router;
