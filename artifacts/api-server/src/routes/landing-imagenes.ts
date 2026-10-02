/**
 * /api/landing-imagenes — editor de la landing de imágenes (lib/landing/plan-imagenes.ts).
 *
 *   POST   /plan                          crea la landing (plan de 11 paneles)
 *   GET    /:id                           landing + paneles con su prompt + fotos del producto
 *   PUT    /:id/panel/:clave              edita textos / foto / oculto de un panel
 *   POST   /:id/panel/:clave/imagen       sube la imagen del panel (data URL, máx 6 MB)
 *   DELETE /:id/panel/:clave/imagen       vuelve al panel compuesto
 *   PUT    /:id/ofertas                   ofertas del dueño (las que cobra el pedido)
 *
 * Vista previa y publicación: las de siempre (/api/landing-pages/:id/render y
 * /:id/publish). Todo filtrado por el negocio de la sesión.
 */
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import { logger } from "../lib/logger";
import type { PanelImagen } from "../lib/landing/plan-imagenes";
import { crearLandingImagenes, ofertasValidas } from "../lib/landing/crear-landing-imagenes";

const router = Router();
const negocioDe = (req: any): number => Number(req.tenant?.id) || 0;

async function landingDelNegocio(id: number, tenantId: number) {
  const [row] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).limit(1);
  return row && (row.design as any)?.modo === "imagenes" ? row : null;
}

async function productoDelNegocio(id: number | null | undefined, tenantId: number) {
  if (!id) return null;
  const [p] = await db.select().from(products).where(and(eq(products.id, Number(id)), eq(products.tenantId, tenantId))).limit(1);
  return p || null;
}

/** Lo que el panel del editor necesita de una landing. */
async function vista(row: any, tenantId: number) {
  const producto = await productoDelNegocio(row.productId, tenantId);
  const { promptParaImagen, sellosDelNegocio } = await import("../lib/landing/plan-imagenes");
  const { getBusinessContext } = await import("../lib/business-context");
  const ctx = await getBusinessContext(tenantId).catch(() => null);
  const sellos = sellosDelNegocio(ctx?.condiciones);
  const design = (row.design || {}) as any;
  let fotos: string[] = [];
  if (producto) {
    try {
      const { fotosUnicasDelProducto, guardadorDeMetadata } = await import("../lib/fotos-de-producto");
      fotos = await fotosUnicasDelProducto(producto as any, { guardar: guardadorDeMetadata(producto.id) });
    } catch { fotos = producto.imageUrl ? [producto.imageUrl] : []; }
  }
  const paneles = ((row.sections || []) as PanelImagen[]).map((p) => ({
    ...p,
    prompt: promptParaImagen(p, { name: producto?.name }, { paleta: design.paleta, ofertas: design.ofertas, sellos }),
  }));
  return {
    id: row.id, nombre: row.name, slug: row.slug, estado: row.status, publishedUrl: row.publishedUrl,
    producto: producto ? { id: producto.id, nombre: producto.name, precio: Number(producto.price) || 0 } : null,
    paleta: design.paleta || [], ofertas: design.ofertas || [], sellos, fotos, paneles,
    autorDelPlan: (row.strategy as any)?.autor || null,
  };
}

router.post("/plan", async (req: any, res) => {
  try {
    const tenantId = negocioDe(req);
    if (!tenantId) return res.status(401).json({ error: "Iniciá sesión" });
    const r = await crearLandingImagenes(tenantId, { productId: Number(req.body?.productId), ofertas: req.body?.ofertas, angulo: req.body?.angulo, publico: req.body?.publico, pruebaSocial: req.body?.pruebaSocial });
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ ok: true, landing: await vista(r.row, tenantId) });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingImagenes] /plan falló");
    return res.status(500).json({ error: e?.message || "Error interno" });
  }
});

router.get("/", async (req: any, res) => {
  const tenantId = negocioDe(req);
  if (!tenantId) return res.status(401).json({ error: "Iniciá sesión" });
  const filas = await db.select({ id: landingPages.id, name: landingPages.name, status: landingPages.status, design: landingPages.design, updatedAt: landingPages.updatedAt })
    .from(landingPages).where(eq(landingPages.tenantId, tenantId));
  return res.json({ landings: (filas as any[]).filter((f) => f.design?.modo === "imagenes").map((f) => ({ id: f.id, nombre: f.name, estado: f.status, actualizada: f.updatedAt })) });
});

router.get("/:id", async (req: any, res) => {
  const tenantId = negocioDe(req);
  if (!tenantId) return res.status(401).json({ error: "Iniciá sesión" });
  const row = await landingDelNegocio(Number(req.params.id), tenantId);
  if (!row) return res.status(404).json({ error: "Landing no encontrada" });
  return res.json({ landing: await vista(row, tenantId) });
});

async function cambiarPanel(req: any, res: any, cambio: (p: PanelImagen) => PanelImagen) {
  const tenantId = negocioDe(req);
  if (!tenantId) return res.status(401).json({ error: "Iniciá sesión" });
  const row = await landingDelNegocio(Number(req.params.id), tenantId);
  if (!row) return res.status(404).json({ error: "Landing no encontrada" });
  const paneles = ((row.sections || []) as PanelImagen[]).slice();
  const i = paneles.findIndex((p) => p.clave === String(req.params.clave));
  if (i < 0) return res.status(404).json({ error: "Panel no encontrado" });
  paneles[i] = cambio(paneles[i]);
  await db.update(landingPages).set({ sections: paneles as any, updatedAt: new Date() } as any).where(and(eq(landingPages.id, row.id), eq(landingPages.tenantId, tenantId)));
  return res.json({ ok: true, landing: await vista({ ...row, sections: paneles }, tenantId) });
}

router.put("/:id/panel/:clave", async (req: any, res) => {
  try {
    const b = req.body || {};
    const { sinPruebaSocialInventada } = await import("../lib/landing/plan-imagenes");
    // El dueño escribe lo que quiere, pero la prueba social inventada tampoco
    // entra a mano: la misma regla que al modelo.
    const permitida = null;
    const limpio = (s: any, max: number) => sinPruebaSocialInventada(String(s ?? ""), permitida).slice(0, max);
    return await cambiarPanel(req, res, (p) => ({
      ...p,
      ...(b.titulo !== undefined ? { titulo: limpio(b.titulo, 80) || p.titulo } : {}),
      ...(b.subtitulo !== undefined ? { subtitulo: limpio(b.subtitulo, 160) } : {}),
      ...(Array.isArray(b.bullets) ? { bullets: b.bullets.map((x: any) => limpio(x, 70)).filter(Boolean).slice(0, 6) } : {}),
      ...(Array.isArray(b.pares) ? { pares: b.pares.map((x: any) => ({ a: limpio(x?.a, 120), b: limpio(x?.b, 200) })).filter((x: any) => x.a).slice(0, 6) } : {}),
      ...(b.conceptoVisual !== undefined ? { conceptoVisual: String(b.conceptoVisual || "").slice(0, 300) } : {}),
      ...(b.foto !== undefined ? { foto: b.foto ? String(b.foto).slice(0, 500) : null } : {}),
      ...(b.oculto !== undefined ? { oculto: !!b.oculto } : {}),
    }));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Error interno" });
  }
});

router.post("/:id/panel/:clave/imagen", async (req: any, res) => {
  try {
    const tenantId = negocioDe(req);
    if (!tenantId) return res.status(401).json({ error: "Iniciá sesión" });
    const file = String(req.body?.file || "");
    // Solo archivos subidos (data URL). Nada de URLs remotas: el servidor no
    // descarga lo que le digan (SSRF) y la imagen queda en nuestro volumen.
    const m = file.match(/^data:image\/(png|jpe?g|webp);base64,/i);
    if (!m) return res.status(400).json({ error: "Subí una imagen PNG, JPG o WEBP." });
    const buffer = Buffer.from(file.slice(file.indexOf(",") + 1), "base64");
    if (buffer.length < 1000) return res.status(400).json({ error: "La imagen está vacía o dañada." });
    if (buffer.length > 6 * 1024 * 1024) return res.status(400).json({ error: "La imagen pesa más de 6 MB." });
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { getImageStoreDir } = await import("../lib/image-store");
    const dir = path.resolve(getImageStoreDir(), "landings");
    fs.mkdirSync(dir, { recursive: true });
    const ext = m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
    const nombre = `${tenantId}-${Number(req.params.id)}-${String(req.params.clave).replace(/[^a-z-]/g, "")}-${Date.now().toString(36)}.${ext}`;
    fs.writeFileSync(path.resolve(dir, nombre), buffer);
    const url = `/uploads/landings/${nombre}`;
    return await cambiarPanel(req, res, (p) => ({ ...p, imagen: url }));
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingImagenes] no se pudo guardar la imagen");
    return res.status(500).json({ error: e?.message || "Error interno" });
  }
});

router.delete("/:id/panel/:clave/imagen", async (req: any, res) => {
  try {
    return await cambiarPanel(req, res, (p) => ({ ...p, imagen: null }));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Error interno" });
  }
});

router.put("/:id/ofertas", async (req: any, res) => {
  try {
    const tenantId = negocioDe(req);
    if (!tenantId) return res.status(401).json({ error: "Iniciá sesión" });
    const row = await landingDelNegocio(Number(req.params.id), tenantId);
    if (!row) return res.status(404).json({ error: "Landing no encontrada" });
    const producto = await productoDelNegocio(row.productId, tenantId);
    const ofertas = ofertasValidas(req.body?.ofertas, Number(producto?.price) || 0);
    if (!ofertas.length) return res.status(400).json({ error: "Poné al menos una oferta con precio." });
    const design = { ...((row.design || {}) as any), ofertas };
    await db.update(landingPages).set({ design, updatedAt: new Date() } as any).where(and(eq(landingPages.id, row.id), eq(landingPages.tenantId, tenantId)));
    return res.json({ ok: true, landing: await vista({ ...row, design }, tenantId) });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Error interno" });
  }
});

export default router;
