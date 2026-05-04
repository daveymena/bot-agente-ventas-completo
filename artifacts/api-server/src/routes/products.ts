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
import type { TenantRequest } from "../lib/tenantManager";

const router = Router();

// List products for the current tenant
router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

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

// Create a product for the current tenant
router.post("/", async (req: TenantRequest, res, next) => {
  try {
     const tenantId = req.tenant?.id;
     if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

     if (req.body.price !== undefined) {
       req.body.price = String(req.body.price);
     }
     const body = CreateProductBody.parse(req.body);
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
         imageUrl: (body as any).imageUrl ?? null,
         highlight: (body as any).highlight ?? null,
         features: (body as any).features ?? [],
         isActive: (body as any).isActive ?? true,
         paymentLink: (body as any).paymentLink ?? null,
         deliveryLink: (body as any).deliveryLink ?? null,
       })
       .returning();
     return res.json(serialize(created!));
  } catch (e) {
    return next(e);
  }
});

// Update a product (ensure it belongs to the tenant)
router.patch("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { id } = UpdateProductParams.parse(req.params);
    if (req.body.price !== undefined) {
      req.body.price = String(req.body.price);
    }
    const body = UpdateProductBody.parse(req.body);
    
    const update: Record<string, unknown> = { ...body };
    if (body.price !== undefined) update.price = String(body.price);

    const [updated] = await db
      .update(products)
      .set(update)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ message: "Producto no encontrado o sin permisos" });
    return res.json(UpdateProductResponse.parse(serialize(updated)));
  } catch (e) {
    return next(e);
  }
});

// Delete a product (ensure it belongs to the tenant)
router.delete("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { id } = DeleteProductParams.parse(req.params);
    const [deleted] = await db
      .delete(products)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();

    if (!deleted) return res.status(404).json({ message: "Producto no encontrado o sin permisos" });
    return res.json(DeleteProductResponse.parse({ ok: true }));
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
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { base64 } = req.body;
    if (!base64) return res.status(400).json({ message: "No file provided" });

    // Read the file (XLSX, CSV, etc.)
    const workbook = XLSX.read(base64, { type: "base64" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName!];
    const rawRows = XLSX.utils.sheet_to_json(sheet!);

    if (rawRows.length === 0) return res.status(400).json({ message: "File is empty" });

    // Get headers
    const headers = Object.keys(rawRows[0] as object);
    const sampleRows = rawRows.slice(0, 3);

    // Get smart mapping from Kimi 2.6
    console.log(`🤖 [SmartImport] Pidiendo a Kimi 2.6 que analice las cabeceras: ${headers.join(", ")}`);
    const mapping = await getSmartColumnMapping(headers, sampleRows);

    // Process all rows using the AI mapping
    const processedProducts = processRowsWithMapping(rawRows, mapping);

    // Insert into database
    const results = [];
    for (const item of processedProducts) {
      try {
        const [created] = await db
          .insert(products)
          .values({
            tenantId,
            name: item.name,
            description: item.description,
            price: String(item.price),
            currency: item.currency,
            kind: "digital",
            imageUrl: item.imageUrl,
            isActive: true,
          })
          .returning();
        results.push(serialize(created!));
      } catch (err) {
        console.error(`[SmartImport] Failed to insert row: ${item.name}`, err);
      }
    }

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
    createdAt: row.createdAt.toISOString(),
  };
}

export default router;

