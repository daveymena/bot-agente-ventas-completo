import { Router } from "express";
import { desc, eq, and } from "drizzle-orm";
import {
  CreateProductBody,
  DeleteProductParams,
  DeleteProductResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import { db, products } from "@workspace/db";
import * as XLSX from "xlsx";
import { getSmartColumnMapping, processRowsWithMapping } from "../lib/smartImport";
import { resolveCategoryId } from "../lib/product-categories";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import { logger } from "../lib/logger";
import { serializarListaProductos } from "../lib/productos-lista";
import { saveProductImage } from "../lib/image-store";
import type { TenantRequest } from "../lib/tenantManager";

const router = Router();

/**
 * El precio viaja como string (columna numeric de Postgres) y el esquema
 * generado por orval lo tipa como `zod.string()` sin ningún refinamiento --
 * o sea que "abc", "-100" o "" pasaban la validación y llegaban tal cual a
 * la base, al checkout y al link de pago. La validación va acá y no en el
 * esquema porque ese archivo es generado (orval está roto con la versión de
 * zod instalada) y se perdería en la próxima regeneración.
 *
 * Devuelve un mensaje listo para mostrarle al admin, o null si está bien.
 */
function validarPrecio(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === "") return null; // opcional: cae al default
  const n = Number(valor);
  if (!Number.isFinite(n)) return "El precio debe ser un número.";
  if (n < 0) return "El precio no puede ser negativo.";
  return null;
}

/**
 * GET /api/products/cobrabilidad
 *
 * Qué productos se pueden COBRAR hoy y cuáles no. Pensado para mirarlo ANTES
 * de pautar: si se paga por clics hacia un producto sin forma de cobro, cada
 * clic muere en el cierre, que es donde más caro sale perder al cliente.
 *
 * Va antes de "/:id" a propósito: si fuera después, Express tomaría
 * "cobrabilidad" como un id.
 */
router.get("/cobrabilidad", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    const { evaluarCobrabilidad, resumenDeCobrabilidad, evaluarEntregabilidad } = await import("../lib/cobrabilidad");
    const { credencialesDe } = await import("../lib/tenant-payment-credentials");
    const cred = credencialesDe(req.tenant as any);

    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));

    const evaluados = rows.map((p: any) => ({
      producto: { id: p.id, name: p.name, kind: p.kind, price: p.price, paymentLink: p.paymentLink },
      resultado: evaluarCobrabilidad(
        { id: p.id, name: p.name, kind: p.kind, price: p.price, paymentLink: p.paymentLink },
        cred,
      ),
    }));

    return res.json({
      ...resumenDeCobrabilidad(evaluados),
      // Con qué se está cobrando, para que se note si son las del servidor.
      credencialesPropias: cred.propias,
      // Cobrar y entregar fallan por separado: un curso con pasarela pero sin
      // link de entrega se cobra perfecto y deja al cliente pagando por nada.
      noEntregables: rows
        .map((p: any) => ({ p, e: evaluarEntregabilidad({ kind: p.kind, deliveryLink: p.deliveryLink }) }))
        .filter((x: any) => !x.e.entregable)
        .map((x: any) => ({ id: x.p.id, name: x.p.name, problemas: x.e.problemas })),
      detalle: evaluados.map((e: any) => {
        const p: any = rows.find((r: any) => r.id === e.producto.id);
        return {
          id: e.producto.id,
          name: e.producto.name,
          cobrable: e.resultado.cobrable,
          vias: e.resultado.vias,
          problemas: e.resultado.problemas,
          entregable: evaluarEntregabilidad({ kind: p?.kind, deliveryLink: p?.deliveryLink }).entregable,
        };
      }),
    });
  } catch (e) {
    return next(e);
  }
});

// List products for the current tenant
router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    const rows = await db
      .select()
      .from(products)
      .where(eq(products.tenantId, tenantId))
      .orderBy(desc(products.createdAt));
    
    // El esquema generado no trae `opciones` (talla/color) y zod lo descartaba:
    // el editor del panel nunca veía las opciones cargadas (30-09-2026).
    //
    // 08-10-2026: UNA fila mala tumbaba TODO el listado con 400 y el editor
    // de landings no abría. serializarListaProductos salta la fila mala,
    // la registra y devuelve las buenas (ver lib/productos-lista.ts).
    const lista = serializarListaProductos(rows as any[], (id, issues) =>
      logger.warn({ productId: id, issues }, "[Products] fila saltada en listado (no tumba el 200)"),
    );
    return res.json(lista);
  } catch (e) {
    return next(e);
  }
});

/**
 * Un producto por id.
 *
 * No existía, y eso frenaba a Atlas de una forma engañosa: al pedirle un
 * anuncio para el producto 124 llamaba a GET /api/products/124, recibía el 404
 * de Express (HTML, "Cannot GET /api/products/124") y le contestaba al admin
 * "no encontré el producto con ID 124 en tu catálogo" -- cuando el producto
 * existe y está en el listado. El agente no puede distinguir "no existe el
 * recurso" de "no existe la ruta" si la ruta ni siquiera responde JSON.
 */
router.get("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);

    const [row] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .limit(1);
    if (!row) return sendError(res, ERROR_CODES.PRODUCT_NOT_FOUND);

    return res.json(serialize(row));
  } catch (e) {
    return next(e);
  }
});

// Create a product for the current tenant
/**
 * La galería (metadata.imagenes) puede llegar del editor con fotos en data
 * URL (producto nuevo: todavía no hay id para subirlas). Acá se pasan a
 * archivo, igual que la principal, para no hinchar la tabla con base64.
 */
async function materializarGaleria(metadata: unknown, productId: number): Promise<string | undefined> {
  if (metadata === undefined || metadata === null) return undefined;
  let m: any;
  try { m = typeof metadata === "string" ? (JSON.parse(metadata) || {}) : metadata; } catch { return typeof metadata === "string" ? metadata : JSON.stringify(metadata); }
  if (Array.isArray(m?.imagenes)) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { getImageStoreDir } = await import("../lib/image-store");
    const out: string[] = [];
    for (const u of m.imagenes.map(String)) {
      if (!u.startsWith("data:")) { out.push(u); continue; }
      try {
        const coma = u.indexOf(",");
        const mime = u.slice(5, u.indexOf(";")).toLowerCase();
        const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
        const buffer = Buffer.from(u.slice(coma + 1), "base64");
        if (buffer.length > 6 * 1024 * 1024) continue;
        const dir = path.resolve(getImageStoreDir(), "products");
        fs.mkdirSync(dir, { recursive: true });
        const nombre = `${productId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${ext}`;
        fs.writeFileSync(path.resolve(dir, nombre), buffer);
        out.push(`/uploads/products/${nombre}`);
      } catch (e) {
        logger.warn({ productId, err: String(e) }, "[Products] No se pudo guardar una foto de la galería");
      }
    }
    m.imagenes = [...new Set(out)].slice(0, 12);
  }
  return JSON.stringify(m);
}

router.post("/", async (req: TenantRequest, res, next) => {
  try {
     const tenantId = req.tenant?.id;
     if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

     const errorPrecio = validarPrecio(req.body.price);
     if (errorPrecio) return res.status(400).json({ message: errorPrecio });
     if (req.body.price !== undefined) {
       req.body.price = String(req.body.price);
     }
     if (req.body?.metadata && typeof req.body.metadata === "object") req.body.metadata = JSON.stringify(req.body.metadata);
     const body = CreateProductBody.parse(req.body);
     const rawImageUrl = (body as any).imageUrl ?? null;
     const [created] = await db
       .insert(products)
       .values({
         tenantId,
         name: body.name || "Producto",
         description: body.description || "",
         price: String(body.price ?? 0),
         currency: body.currency ?? "USD",
         sku: (body as any).sku ?? null,
         categoryId: (body as any).categoryId ?? null,
         category: null,
         kind: body.kind ?? "digital",
         // Si viene un data: URI (foto generada con IA en el editor) se
         // guarda tal cual por ahora -- se reemplaza por el archivo real
         // abajo, una vez que existe el id. Guardar el base64 crudo en la
         // columna hincha la tabla y, peor, ad-strategist.ts/facebook.ts no
         // lo reconocen como URL (no empieza con http) ni como ruta relativa
         // -- terminaba armando una URL rota tipo ".../data:image/png..." y
         // el anuncio salía con imagen inválida.
         imageUrl: rawImageUrl,
         highlight: (body as any).highlight ?? null,
         features: (body as any).features ?? [],
         isActive: (body as any).isActive ?? true,
         paymentLink: (body as any).paymentLink ?? null,
         deliveryLink: (body as any).deliveryLink ?? null,
       })
       .returning();

     let finalProduct = created!;
     if ((body as any).metadata) {
       const meta = await materializarGaleria((body as any).metadata, created!.id);
       if (meta) [finalProduct] = await db.update(products).set({ metadata: meta }).where(eq(products.id, created!.id)).returning();
     }
     if (rawImageUrl && rawImageUrl.startsWith("data:")) {
       const savedPath = await saveProductImage(rawImageUrl, created!.id);
       if (savedPath) {
         [finalProduct] = await db.update(products).set({ imageUrl: savedPath }).where(eq(products.id, created!.id)).returning();
       } else {
         logger.warn({ productId: created!.id }, "[Products] No se pudo persistir la imagen generada por IA a disco");
       }
     }
     return res.json(serialize(finalProduct));
  } catch (e) {
    return next(e);
  }
});

// Update a product (ensure it belongs to the tenant)
/**
 * POST /api/products/:id/video-desde-terabox  { path }
 *
 * Baja el video de presentacion desde Terabox y lo deja alojado en la app.
 *
 * Pedido del admin (2026-09-02): "descargalo y alojalo en la app, es el unico
 * que esta en Terabox". El enlace de Terabox funciona pero le pide al cliente
 * instalar la app o registrarse -- una barrera de registro justo cuando esta
 * decidiendo comprar es perder la venta.
 *
 * El `dlink` que devuelve Terabox caduca en 1 a 8 horas, asi que NO se puede
 * guardar como el video del producto: hay que bajar el archivo una vez y
 * quedarselo. Eso es lo que hace esto.
 *
 * Corre en el servidor a proposito: es ahi donde vive la cookie de sesion de
 * Terabox y donde esta el volumen persistente.
 */
router.post("/:id/video-desde-terabox", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    const id = Number(req.params.id);
    const ruta = String(req.body?.path || "").trim();
    if (!id || !ruta) return res.status(400).json({ message: "Faltan 'id' o 'path'" });

    const [prod] = await db.select().from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id))).limit(1);
    if (!prod) return res.status(404).json({ message: "Producto no encontrado" });

    // 1. El enlace directo, que dura horas.
    const { default: TeraBoxApp } = await import("terabox-api");
    // TERABOX_NDUS es la sesión de la cuenta de Terabox del DUEÑO del
    // servidor: con una ruta cualquiera, otro negocio podía sacar enlaces de
    // descarga de SUS archivos (29-09-2026). Solo el negocio dueño la usa.
    const { envSoloDelDueno } = await import("../lib/respaldo-del-dueno");
    const ndus = envSoloDelDueno(tenantId, process.env.TERABOX_NDUS).trim();
    if (!ndus) return res.status(400).json({ message: "Terabox no está configurado para este negocio" });
    const tb = new TeraBoxApp(ndus);
    const meta: any = await (tb as any).getFileMeta([ruta]);
    const dlink = meta?.info?.[0]?.dlink;
    if (meta?.errno !== 0 || !dlink) {
      return res.status(502).json({ message: `Terabox no devolvio enlace (errno=${meta?.errno})` });
    }

    // 2. Se baja UNA vez y se guarda.
    const { guardarVideoDeProducto } = await import("../lib/video-store");
    const guardado = await guardarVideoDeProducto(String(dlink), id);
    if (!guardado) return res.status(502).json({ message: "No se pudo descargar el video" });

    // 3. Y queda como el video del producto.
    let m: any = {};
    try { m = typeof prod.metadata === "string" ? JSON.parse(prod.metadata) : (prod.metadata || {}); } catch { m = {}; }
    m.videoIntro = guardado.url;
    m.videoOrigenTerabox = ruta;
    await db.update(products).set({ metadata: JSON.stringify(m) }).where(eq(products.id, id));

    return res.json({
      ok: true,
      url: guardado.url,
      mb: Math.round(guardado.bytes / 1048576),
      nota: "Alojado en la app. NO se reproduce dentro de WhatsApp (tope 16 MB): abre el video en el navegador.",
    });
  } catch (e) {
    return next(e);
  }
});

// ── GALERÍA: varias fotos por producto (subidas o por URL) y videos ──────────
//
// Pedido del dueño (13-09-2026). La foto principal sigue en `imageUrl`; las
// demás en `metadata.imagenes`; el video principal en `metadata.videoIntro`
// y los demás en `metadata.videos`. Ver lib/fotos-de-producto.ts.
function leerMeta(prod: any): any {
  try { return typeof prod.metadata === "string" ? (JSON.parse(prod.metadata) || {}) : (prod.metadata || {}); } catch { return {}; }
}

/** Sube UNA imagen (data URL base64) a la galería y devuelve su URL pública. */
router.post("/:id/galeria", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const [prod] = await db.select().from(products).where(and(eq(products.id, id), eq(products.tenantId, tenantId))).limit(1);
    if (!prod) return res.status(404).json({ message: "Producto no encontrado" });

    const m = leerMeta(prod);
    const imagenes: string[] = Array.isArray(m.imagenes) ? m.imagenes.map(String) : [];
    let url = String(req.body?.url || "").trim();
    const file = String(req.body?.file || "");
    if (!url && file.startsWith("data:")) {
      const coma = file.indexOf(",");
      const mime = file.slice(5, file.indexOf(";")).toLowerCase();
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      const buffer = Buffer.from(file.slice(coma + 1), "base64");
      if (buffer.length > 6 * 1024 * 1024) return res.status(400).json({ message: "La imagen pesa más de 6 MB" });
      const { getImageStoreDir } = await import("../lib/image-store");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const dir = path.resolve(getImageStoreDir(), "products");
      fs.mkdirSync(dir, { recursive: true });
      const nombre = `${id}-${Date.now().toString(36)}.${ext}`;
      fs.writeFileSync(path.resolve(dir, nombre), buffer);
      url = `/uploads/products/${nombre}`;
    }
    if (!url) return res.status(400).json({ message: "Mandá 'url' o 'file' (data URL base64)" });
    if (!imagenes.includes(url) && url !== prod.imageUrl) imagenes.push(url);
    m.imagenes = imagenes.slice(0, 12);
    const patch: any = { metadata: JSON.stringify(m) };
    // Sin foto principal, la primera que entra pasa a serlo.
    if (!prod.imageUrl) patch.imageUrl = url;
    await db.update(products).set(patch).where(eq(products.id, id));
    return res.json({ ok: true, url, imagenes: m.imagenes, imageUrl: patch.imageUrl || prod.imageUrl });
  } catch (e) { return next(e); }
});

/** Quita una imagen de la galería (no borra la principal: para eso se edita imageUrl). */
router.delete("/:id/galeria", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    const url = String(req.query.url || req.body?.url || "").trim();
    if (!Number.isInteger(id) || id <= 0 || !url) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const [prod] = await db.select().from(products).where(and(eq(products.id, id), eq(products.tenantId, tenantId))).limit(1);
    if (!prod) return res.status(404).json({ message: "Producto no encontrado" });
    const m = leerMeta(prod);
    m.imagenes = (Array.isArray(m.imagenes) ? m.imagenes : []).filter((u: string) => String(u) !== url);
    if (Array.isArray(m?.woocommerce?.imageUrls)) m.woocommerce.imageUrls = m.woocommerce.imageUrls.filter((u: string) => String(u) !== url);
    await db.update(products).set({ metadata: JSON.stringify(m) }).where(eq(products.id, id));
    return res.json({ ok: true, imagenes: m.imagenes });
  } catch (e) { return next(e); }
});

/** Videos: el principal (videoIntro, el que manda el vendedor) y los demás. */
router.put("/:id/videos", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const [prod] = await db.select().from(products).where(and(eq(products.id, id), eq(products.tenantId, tenantId))).limit(1);
    if (!prod) return res.status(404).json({ message: "Producto no encontrado" });
    const m = leerMeta(prod);
    const principal = String(req.body?.principal ?? "").trim();
    const otros: string[] = Array.isArray(req.body?.otros) ? req.body.otros.map((u: any) => String(u || "").trim()).filter(Boolean) : [];
    const esUrl = (u: string) => /^https?:\/\//i.test(u) || u.startsWith("/videos/");
    if (principal && !esUrl(principal)) return res.status(400).json({ message: "El video principal tiene que ser una URL" });
    if (principal) m.videoIntro = principal; else delete m.videoIntro;
    m.videos = [...new Set(otros.filter(esUrl))].slice(0, 10);
    await db.update(products).set({ metadata: JSON.stringify(m) }).where(eq(products.id, id));
    return res.json({ ok: true, principal: m.videoIntro || null, otros: m.videos });
  } catch (e) { return next(e); }
});

router.patch("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    const { id } = UpdateProductParams.parse(req.params);
    const errorPrecio = validarPrecio(req.body.price);
    if (errorPrecio) return res.status(400).json({ message: errorPrecio });
    if (req.body.price !== undefined) {
      req.body.price = String(req.body.price);
    }
    if (req.body?.metadata && typeof req.body.metadata === "object") req.body.metadata = JSON.stringify(req.body.metadata);
    // ── Opciones (talla, color…) ──────────────────────────────────────────
    // La columna existía y el vendedor la leía, pero NADA la escribía: el
    // esquema generado no la trae y zod la descartaba. Caso real 26-09-2026:
    // corrector con tallas S–XL solo en la imagen → pedidos sin talla.
    let opciones: unknown = undefined;
    if (req.body && "opciones" in req.body) {
      const crudas = req.body.opciones;
      delete req.body.opciones;
      if (crudas === null) opciones = null;
      else if (Array.isArray(crudas)) {
        opciones = crudas
          .map((o: any) => ({
            nombre: String(o?.nombre ?? "").trim().slice(0, 40),
            valores: (Array.isArray(o?.valores) ? o.valores : []).map((v: any) => String(v).trim().slice(0, 40)).filter(Boolean).slice(0, 30),
            obligatoria: o?.obligatoria !== false,
          }))
          .filter((o: any) => o.nombre && o.valores.length);
      } else return res.status(400).json({ message: "opciones debe ser una lista de { nombre, valores[], obligatoria }" });
    }
    const body = UpdateProductBody.parse(req.body);

    const update: Record<string, unknown> = { ...body };
    if (opciones !== undefined) update.opciones = opciones;
    if (body.price !== undefined) update.price = String(body.price);
    if ((body as any).metadata !== undefined) {
      const meta = await materializarGaleria((body as any).metadata, id);
      if (meta !== undefined) update.metadata = meta;
    }
    // Misma conversión que en POST /: un data: URI (imagen recién generada
    // con IA) se persiste a disco y se reemplaza por la ruta real antes de
    // guardar -- ver el comentario en el create de arriba.
    if (typeof (body as any).imageUrl === "string" && (body as any).imageUrl.startsWith("data:")) {
      const savedPath = await saveProductImage((body as any).imageUrl, id);
      if (savedPath) update.imageUrl = savedPath;
      else logger.warn({ productId: id }, "[Products] No se pudo persistir la imagen generada por IA a disco");
    }

    const [updated] = await db
      .update(products)
      .set(update)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();

    if (!updated) return sendError(res, ERROR_CODES.PRODUCT_NOT_FOUND);
    return res.json(UpdateProductResponse.parse(serialize(updated)));
  } catch (e) {
    return next(e);
  }
});

// Delete a product (ensure it belongs to the tenant)
router.delete("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    const { id } = DeleteProductParams.parse(req.params);
    const [deleted] = await db
      .delete(products)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();

    if (!deleted) return sendError(res, ERROR_CODES.PRODUCT_NOT_FOUND);
    // El esquema pide `success`, no `ok`: con `ok` el parse tiraba DESPUES
    // de ejecutar el DELETE, asi que el registro se borraba y al usuario le
    // llegaba un 400 "Datos invalidos". Trabajo hecho y reportado como
    // fallido. Estaba igual en agentes, categorias, prospectos y productos.
    return res.json(DeleteProductResponse.parse({ success: true }));
  } catch (e) {
    return next(e);
  }
});

/**
 * SMART BULK IMPORT
 * Uses Kimi 2.6 to automatically map columns from Excel/CSV
 */
router.post("/bulk-smart", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    const { base64 } = req.body;
    if (!base64) return sendError(res, ERROR_CODES.VALIDATION_NO_FILE_PROVIDED);

    // Read the file (XLSX, CSV, etc.)
    const workbook = XLSX.read(base64, { type: "base64" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName!];
    const rawRows = XLSX.utils.sheet_to_json(sheet!);

    if (rawRows.length === 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_FILE_FORMAT);

    // Get headers
    const headers = Object.keys(rawRows[0] as object);
    const sampleRows = rawRows.slice(0, 3);

    // Get smart mapping from Kimi 2.6
    logger.info({ tenantId, headers }, "[Products] Analizando cabeceras para importación inteligente");
    const mapping = await getSmartColumnMapping(headers, sampleRows);

    // Process all rows using the AI mapping
    const processedProducts = processRowsWithMapping(rawRows, mapping);

    // Insert into database
    // La categoría (texto de la columna "Categoría" del Excel) se resuelve a
    // la fila REAL de product_categories -- antes esta ruta ni siquiera
    // guardaba item.category (se calculaba y se descartaba), así que un
    // import masivo dejaba TODOS los productos sin categoría real, sin
    // importar lo que dijera la planilla. Se cachea por nombre normalizado
    // dentro de este import puntual para no repetir el lookup/insert por
    // cada fila que comparte categoría.
    const categoryIdCache = new Map<string, number | null>();
    const results = [];
    for (const item of processedProducts) {
      try {
        let categoryId: number | null = null;
        if (item.category) {
          // La importación por Excel todavía no detecta Digital/Físico por
          // fila (siempre inserta "digital" más abajo) -- se resuelve la
          // categoría con ese mismo kind para no desalinearse. Si en el
          // futuro esta importación aprende a leer una columna "Tipo", este
          // kind debe pasar a venir de esa columna en vez de estar fijo.
          const key = `digital:${item.category.trim().toLowerCase()}`;
          if (categoryIdCache.has(key)) {
            categoryId = categoryIdCache.get(key)!;
          } else {
            categoryId = await resolveCategoryId(tenantId, item.category, "digital");
            categoryIdCache.set(key, categoryId);
          }
        }
        const [created] = await db
          .insert(products)
          .values({
            tenantId,
            name: item.name,
            description: item.description,
            price: String(item.price),
            currency: item.currency,
            category: item.category || null,
            categoryId,
            kind: "digital",
            imageUrl: item.imageUrl,
            isActive: true,
          })
          .returning();
        results.push(serialize(created!));
      } catch (err) {
        logger.error({ tenantId, item: item.name, error: err }, "[Products] Error al insertar producto");
      }
    }

    logger.info({ tenantId, count: results.length }, "[Products] Importación completada");

    return res.json({ 
      ok: true, 
      count: results.length, 
      mapping,
      message: `Se importaron ${results.length} productos automáticamente usando IA.` 
    });

  } catch (e) {
    return next(e);
  }
});

function serialize(row: typeof products.$inferSelect) {
  // Seis modelos (ver lib/modelo-de-negocio.ts); lo desconocido cae a digital.
  const CONOCIDOS = ["digital", "physical", "service", "subscription", "quote", "lead"];
  const kind = CONOCIDOS.includes(String(row.kind)) ? String(row.kind) : "digital";
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: String(row.price),
    currency: row.currency,
    sku: row.sku ?? null,
    categoryId: row.categoryId ?? null,
    category: row.category ?? null,
    kind: kind as "digital" | "physical" | "service" | "subscription" | "quote" | "lead",
    imageUrl: row.imageUrl ?? null,
    highlight: row.highlight ?? null,
    features: row.features ?? [],
    paymentLink: (row as any).paymentLink ?? null,
    deliveryLink: (row as any).deliveryLink ?? null,
    isActive: row.isActive,
    // `metadata` se podía GUARDAR (está en UpdateProductBody) pero no se
    // devolvía nunca -- ni al leer ni como respuesta del PATCH. O sea que se
    // escribía a ciegas: un 200 sin forma de confirmar que el dato quedó.
    //
    // Y no es un campo interno: acá vive `videoIntro`, el video que el agente
    // le muestra al cliente ANTES del precio (ver lib/whatsapp.ts). Sin
    // exponerlo, cargarlo desde el panel es imposible de verificar y de
    // corregir. Un campo que se escribe y no se puede leer es un campo que
    // nadie puede mantener.
    metadata: (row as any).metadata ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

export default router;

