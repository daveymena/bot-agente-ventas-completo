import { safeISO } from "../lib/date-utils";
import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  CreateCategoryBody,
  DeleteCategoryParams,
  DeleteCategoryResponse,
  ListCategoriesResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryResponse,
} from "@workspace/api-zod";
import { db, productCategories } from "@workspace/db";
import type { TenantRequest } from "../lib/tenantManager";

const router: IRouter = Router();

/**
 * Las categorías son DE UN NEGOCIO.
 *
 * Este archivo no tenía una sola mención de tenant, y la tabla SÍ tiene la
 * columna `tenant_id`. Encontrado en la auditoría previa al lanzamiento
 * (2026-08-22). Consecuencias reales, no teóricas:
 *
 *   - GET devolvía las categorías de TODOS los negocios mezcladas.
 *   - POST las creaba sin dueño (el mismo bug que tenían los prospectos).
 *   - PATCH y DELETE aceptaban CUALQUIER id: un cliente podía renombrar o
 *     BORRAR las categorías de otro con solo probar números. Y borrar una
 *     categoría deja los productos de esa cuenta sin clasificar.
 *
 * Basta con conocer un id -- que es un entero correlativo, o sea adivinable.
 */
function tenantIdOf(req: TenantRequest): number | null {
  return req.tenant?.id ?? null;
}

router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });
    const rows = await db
      .select()
      .from(productCategories)
      .where(eq(productCategories.tenantId, tenantId))
      .orderBy(asc(productCategories.name));
    return res.json(ListCategoriesResponse.parse(rows.map(serialize)));
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });
    const body = CreateCategoryBody.parse(req.body);
    const [created] = await db.insert(productCategories).values({ ...body, tenantId }).returning();
    return res.json(serialize(created!));
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });
    const { id } = UpdateCategoryParams.parse(req.params);
    const body = UpdateCategoryBody.parse(req.body);
    // El filtro por tenant va en el WHERE, no en una comprobación aparte: así
    // un id ajeno simplemente no encuentra fila, y no hay forma de deducir si
    // existe o no en otra cuenta.
    const [updated] = await db
      .update(productCategories)
      .set(body)
      .where(and(eq(productCategories.id, id), eq(productCategories.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Categoría no encontrada" });
    return res.json(UpdateCategoryResponse.parse(serialize(updated)));
  } catch (e) {
    return next(e);
  }
});

router.delete("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });
    const { id } = DeleteCategoryParams.parse(req.params);
    await db
      .delete(productCategories)
      .where(and(eq(productCategories.id, id), eq(productCategories.tenantId, tenantId)));
    // El esquema pide `success`, no `ok`: con `ok` el parse tiraba DESPUES
    // de ejecutar el DELETE, asi que el registro se borraba y al usuario le
    // llegaba un 400 "Datos invalidos". Trabajo hecho y reportado como
    // fallido. Estaba igual en agentes, categorias, prospectos y productos.
    return res.json(DeleteCategoryResponse.parse({ success: true }));
  } catch (e) {
    return next(e);
  }
});


function serialize(row: typeof productCategories.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    icon: row.icon ?? null,
    color: row.color ?? "#6b7280",
    kind: row.kind ?? "digital",
    createdAt: safeISO(row.createdAt),
  };
}

export default router;
