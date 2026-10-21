/**
 * Resuelve el nombre de texto de una categoría a su fila REAL en
 * product_categories, creándola si todavía no existe para este tenant.
 *
 * Por qué existe: products tiene dos campos para categoría -- `category`
 * (texto libre) y `categoryId` (FK real a product_categories) -- y varios
 * caminos (la importación masiva por Excel, y las tools create_product /
 * update_product de Atlas) escribían el texto sin nunca resolver/crear el
 * FK correspondiente. Resultado real encontrado en producción: 84/84
 * productos con 13 etiquetas de texto distintas ("Tecnología", "Marketing",
 * "Música"...) pero TODOS con categoryId apuntando a la misma fila
 * "General" -- cualquier función que agrupe/filtre por categoría real (no
 * por el texto) los mostraba todos mezclados. Con productos físicos por
 * entrar, mezclar categorías así deja de ser solo un problema de prolijidad.
 *
 * Uso: siempre que se reciba un `category` de texto sin un `categoryId`
 * explícito y ya correcto, llamar acá para obtener el id real antes de
 * guardar el producto. Sin caché: crear/renombrar una categoría es poco
 * frecuente comparado con crear productos, y una entrada de caché vieja
 * apuntando a una categoría ya borrada rompería el FK en silencio.
 */
import { db, productCategories } from "@workspace/db";
import { eq } from "drizzle-orm";

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * `kind` (digital/physical/service) separa qué categorías sirven para qué
 * tipo de producto (ver product_categories.kind) -- el match es por nombre
 * Y kind juntos, no solo nombre. Sin esto, un producto físico con category
 * "Tecnología" podía terminar matcheando/creando la MISMA categoría que ya
 * usa un producto digital de "Tecnología", mezclando ambos tipos otra vez
 * por esta puerta en particular.
 */
export async function resolveCategoryId(
  tenantId: number,
  categoryName: string | null | undefined,
  kind: string = "digital",
): Promise<number | null> {
  const name = (categoryName || "").trim();
  if (!name) return null;

  const existing = await db
    .select({ id: productCategories.id, name: productCategories.name, kind: productCategories.kind })
    .from(productCategories)
    .where(eq(productCategories.tenantId, tenantId));

  const match = existing.find((c: any) => normalize(c.name) === normalize(name) && c.kind === kind);
  if (match) return match.id;

  const [created] = await db.insert(productCategories).values({ tenantId, name, kind } as any).returning();
  return created.id;
}
