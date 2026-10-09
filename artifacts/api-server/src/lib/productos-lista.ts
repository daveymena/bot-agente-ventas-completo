/**
 * Listado de productos que nunca tumba el 200 por una fila mala (08-10-2026:
 * el editor de landings no abría porque UN producto con datos raros hacía
 * fallar el parse de TODO el listado con 400).
 */
import { ListProductsResponse } from "@workspace/api-zod";

export function serializarFilaProducto(row: any) {
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
    kind,
    imageUrl: row.imageUrl ?? null,
    highlight: row.highlight ?? null,
    features: row.features ?? [],
    paymentLink: row.paymentLink ?? null,
    deliveryLink: row.deliveryLink ?? null,
    isActive: row.isActive,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

export function serializarListaProductos(rows: any[], avisar?: (id: unknown, issues: unknown) => void): any[] {
  const lista: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = ListProductsResponse.safeParse([serializarFilaProducto(rows[i])]);
    if (!r.success) {
      avisar?.(rows[i]?.id, r.error.issues?.slice(0, 3));
      continue;
    }
    if (!r.data.length) continue;
    lista.push({ ...r.data[0], opciones: rows[i]?.opciones ?? null });
  }
  return lista;
}
