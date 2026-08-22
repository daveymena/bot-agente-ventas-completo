import { Router } from "express";
import { desc, eq, and } from "drizzle-orm";
import {
  CreateProductBody,
  DeleteProductParams,
  DeleteProductResponse,
  ListProductsResponse,
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
    
    return res.json(ListProductsResponse.parse(rows.map(serialize)));
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
router.post("/", async (req: TenantRequest, res, next) => {
  try {
     const tenantId = req.tenant?.id;
     if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

     const errorPrecio = validarPrecio(req.body.price);
     if (errorPrecio) return res.status(400).json({ message: errorPrecio });
     if (req.body.price !== undefined) {
       req.body.price = String(req.body.price);
     }
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
    const body = UpdateProductBody.parse(req.body);

    const update: Record<string, unknown> = { ...body };
    if (body.price !== undefined) update.price = String(body.price);
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
  const kind = row.kind === "physical" ? "physical" : "digital";
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: String(row.price),
    currency: row.currency,
    sku: row.sku ?? null,
    categoryId: row.categoryId ?? null,
    category: row.category ?? null,
    kind: kind as "digital" | "physical",
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

