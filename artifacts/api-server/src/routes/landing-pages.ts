import { Router } from "express";
import { fotosDelProducto, fotosUnicasDelProducto, guardadorDeMetadata } from "../lib/fotos-de-producto";
import { and, desc, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import type { TenantRequest } from "../lib/tenantManager";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import { logger } from "../lib/logger";
import { dbNow } from "../lib/date-utils";

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
    if (Array.isArray(patch.sections)) {
      patch.sections = patch.sections
        .filter(Boolean)
        .map((s: any) => ({ ...s, title: s.title ? String(s.title).trim() : s.title, body: s.body ? String(s.body).trim() : s.body }))
        .filter((s: any) => {
          // No guardar secciones vacías/incompletas sin título ni body (salvo hero/cta que tienen criterios propios).
          if (!s) return false;
          if (["hero", "cta"].includes(s.type)) return true;
          return !!(String(s.title || "").trim() || String(s.body || "").trim());
        });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "productId")) {
      if (!(await productBelongsToTenant(patch.productId, tenantId))) return res.status(400).json({ error: "El producto no pertenece al tenant actual o no es válido" });
      patch.productId = patch.productId === null || patch.productId === "" ? null : Number(patch.productId);
    }
    patch.updatedAt = dbNow();
    const [updated] = await db.update(landingPages).set(patch as any).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).returning();
    if (!updated) return res.status(404).json({ error: "Landing no encontrada" });
    return res.json(updated);
  } catch (e) { return next(e); }
});

/** Qué pasó en la landing: visitas, inicios de pedido, pedidos y rechazos (24 h y 7 días). */
router.get("/:id/monitor", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    const [row] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Landing no encontrada" });
    const { resumenDeLanding } = await import("../lib/landing/monitor");
    return res.json(await resumenDeLanding(tenantId, row.slug));
  } catch (e) { return next(e); }
});

/** Render guardado para el editor. El mismo renderer se usa en preview y público. */
router.get("/:id/render", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);

    const [row] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Landing no encontrada" });

    const source = row.source as any;
    if (source?.landingforgeUrl) return res.redirect(302, source.landingforgeUrl);
    // Landing de Landing Forge: su contenido vive alla. Antes caia al render
    // local con secciones vacias y la vista previa mostraba una pagina
    // generica que no era la landing (08-10). Se muestra la real.
    const urlForge = source?.type === "landingforge" ? String(source?.url || row.publishedUrl || "") : "";
    if (/^https?:\/\//.test(urlForge)) return res.redirect(302, urlForge);
    if (row.publishedUrl && !/\/l\//.test(String(row.publishedUrl))) return res.redirect(302, row.publishedUrl);

    // Vía ESTILO (lib/landing/renderer-estilo.ts): el HTML sale de secciones +
    // design en el acto; el html guardado es solo snapshot y la variante
    // (cod/premium/bold/dark) está en design.style.
    if ((row.design as any)?.renderer === "estilo") {
      let productoEstilo: any = null;
      if (row.productId) {
        const [p] = await db.select().from(products).where(and(eq(products.id, row.productId), eq(products.tenantId, tenantId))).limit(1);
        productoEstilo = p || null;
      }
      const { renderizarLandingEstilo } = await import("../lib/landing/renderer-estilo");
      const html = await renderizarLandingEstilo({ tenantId, row: row as any, producto: productoEstilo });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    }

    if (row.html) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      // La misma foto bajo varias URLs (local, WordPress, CloudFront) no sale dos veces.
      const { htmlConFotosUnicas, guardadorDeMetadata } = await import("../lib/fotos-de-producto");
      const [prod] = row.productId ? await db.select().from(products).where(eq(products.id, Number(row.productId))).limit(1) : [null];
      const { conFormularioQueResponde } = await import("../lib/landing/sanear-html");
      return res.send(conFormularioQueResponde(prod ? await htmlConFotosUnicas(row.html, prod, { guardar: guardadorDeMetadata(prod.id) }) : row.html));
    }

    let producto: any = null;
    if (row.productId) {
      const [p] = await db.select().from(products).where(and(eq(products.id, row.productId), eq(products.tenantId, tenantId))).limit(1);
      producto = p || null;
    }

    const { htmlDeCopia } = await import("../lib/landing/clonar-html");
    const copia = htmlDeCopia(row);
    if (copia) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(copia);
    }

    const { renderizarLanding } = await import("../lib/landing/renderer-v3");
    const { negocioParaRender } = await import("../lib/landing/negocio-para-render");
    const negocio = await negocioParaRender(tenantId, producto);
    const modelo = producto ? (await import("../lib/modelo-de-negocio")).modeloDelProducto(producto as any) : "digital";
    const ctx = await import("../lib/business-context").then((m) => m.getBusinessContext(tenantId)).catch(() => null);
    const c = ctx?.condiciones ?? (await import("../lib/modelo-de-negocio")).CONDICIONES_DE_RESPALDO;
    const cierre = modelo === "fisico"
      ? { tipo: "contraentrega" as const, accion: `/api/landing-publica/${encodeURIComponent(row.slug)}/pedido`, pais: c.pais, pago: c.envio.pago }
      : modelo === "digital"
        ? { tipo: "pago" as const, accion: `/api/landing-publica/${encodeURIComponent(row.slug)}/cupon`, mercadopago: producto ? (await enlacesDePagoLocal(tenantId, producto)).mercadopago : undefined, paypal: producto ? (await enlacesDePagoLocal(tenantId, producto)).paypal : undefined }
        : { tipo: "whatsapp" as const };
    const html = renderizarLanding({
      nombre: row.name,
      secciones: (row.sections as any[]) || [],
      familia: (row.design as any)?.familia ?? (req.query.familia as string) ?? null,
      producto: producto && {
        name: producto.name, description: producto.description, imageUrl: producto.imageUrl, images: await fotosUnicasDelProducto(producto, { guardar: guardadorDeMetadata(producto.id) }),
        price: producto.price, currency: producto.currency, paymentLink: producto.paymentLink,
        whatsapp: negocio.whatsapp,
        opciones: Array.isArray(producto.opciones) ? producto.opciones : null,
      },
      negocio,
      cierre,
      modo: (row.design as any)?.modo ?? null,
      ofertas: (row.design as any)?.ofertas ?? null,
      sellos: (await import("../lib/modelo-de-negocio")).sellosDelNegocio(c),
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (e) { return next(e); }
});

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
      .set({ status: publicar ? "published" : "draft", publishedUrl, updatedAt: dbNow() } as any)
      .where(eq(landingPages.id, id));
    logger.info({ tenantId, id, publishedUrl }, "[LandingPages] publicación cambiada");
    return res.json({ ok: true, id, status: publicar ? "published" : "draft", url: publishedUrl });
  } catch (e) { return next(e); }
});

/** Genera HTML de vista previa sin guardar. */
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

    const { renderizarLanding } = await import("../lib/landing/renderer-v3");
    const { negocioParaRender } = await import("../lib/landing/negocio-para-render");
    const negocio = await negocioParaRender(tenantId, producto);
    const modelo = producto ? (await import("../lib/modelo-de-negocio")).modeloDelProducto(producto as any) : "digital";
    const ctx = await import("../lib/business-context").then((m) => m.getBusinessContext(tenantId)).catch(() => null);
    const c = ctx?.condiciones ?? (await import("../lib/modelo-de-negocio")).CONDICIONES_DE_RESPALDO;
    const cierre = modelo === "fisico"
      ? { tipo: "contraentrega" as const, accion: `/api/landing-publica/preview/pedido`, pais: c.pais, pago: c.envio.pago }
      : modelo === "digital"
        ? { tipo: "pago" as const, accion: `/api/landing-publica/preview/cupon`, mercadopago: producto ? (await enlacesDePagoLocal(tenantId, producto)).mercadopago : undefined, paypal: producto ? (await enlacesDePagoLocal(tenantId, producto)).paypal : undefined }
        : { tipo: "whatsapp" as const };

    // Vía ESTILO: la preview se recalcula con el mismo renderer que la pública
    // (acción /preview/pedido: el geo de respaldo funciona y el POST real no
    // existe todavía, que es justo lo que se espera en una vista previa).
    const disenoBody = (req.body?.design && typeof req.body.design === "object") ? req.body.design : {};
    if (disenoBody.renderer === "estilo") {
      const { renderizarLandingEstilo } = await import("../lib/landing/renderer-estilo");
      const html = await renderizarLandingEstilo({
        tenantId,
        row: {
          name: String(req.body?.name || "Vista previa"),
          slug: "",
          sections: Array.isArray(req.body?.sections) ? req.body.sections : [],
          design: disenoBody,
        },
        producto,
        preview: true,
        pago: producto && modelo !== "fisico" ? await enlacesDePagoLocal(tenantId, producto) : {},
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    }

    const html = renderizarLanding({
      nombre: String(req.body?.name || "Vista previa"),
      secciones: Array.isArray(req.body?.sections) ? req.body.sections : [],
      familia: req.body?.familia ?? req.body?.design?.familia ?? null,
      producto: producto && {
        name: producto.name, description: producto.description, imageUrl: producto.imageUrl, images: await fotosUnicasDelProducto(producto, { guardar: guardadorDeMetadata(producto.id) }),
        price: producto.price, currency: producto.currency, paymentLink: producto.paymentLink,
        whatsapp: negocio.whatsapp,
        opciones: Array.isArray(producto.opciones) ? producto.opciones : null,
      },
      negocio,
      cierre,
      modo: (req.body?.design as any)?.modo ?? null,
      ofertas: (req.body?.design as any)?.ofertas ?? null,
      sellos: (await import("../lib/modelo-de-negocio")).sellosDelNegocio(c),
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (e) { return next(e); }
});

export async function enlacesDePagoLocal(tenantId: number, producto: any): Promise<{ mercadopago?: string; paypal?: string }> {
  try {
    const { PaymentGateway } = await import("../lib/payments");
    const { tenantManager } = await import("../lib/tenantManager");
    const tenant = await tenantManager.getTenantById(tenantId);
    const pg = new PaymentGateway(tenant || undefined);
    const links: any = await pg.getAllLinks(producto, { phone: "", name: "Landing" });
    return {
      mercadopago: links?.mercadopago?.shortUrl || links?.mercadopago?.url || undefined,
      paypal: links?.paypal?.shortUrl || links?.paypal?.url || undefined,
    };
  } catch {
    return {};
  }
}

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
