/**
 * Categorías reales para los productos importados.
 *
 * Medido el 19-09-2026 en producción: los 62 productos que vinieron de Dropi
 * y de WooCommerce tenían `categoryId: null` y solo el texto `category`
 * ("General", "Hogar", "Ropa Deportiva"…). El panel filtra por `categoryId`
 * (las fichas de categoría son filas de `product_categories`), así que al
 * elegir "📦 Físico" + cualquier categoría no aparecía ninguno, y ningún
 * contador los sumaba. Acá se busca o se crea la categoría con ese nombre y
 * ese tipo, y se le pone el id al producto; y al arrancar se enlazan los que
 * ya estaban sueltos.
 */
import { db, products, productCategories } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logger } from "./logger";

type Kind = "digital" | "physical" | "service";

const ICONO_POR_KIND: Record<Kind, string> = { physical: "📦", digital: "⚡", service: "🛠️" };
const COLORES = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6", "#F97316"];

function normalizar(s: string): string {
  return String(s || "").trim().replace(/\s+/g, " ");
}

/** Devuelve el id de la categoría (nombre + tipo) del negocio, creándola si no existe. */
export async function asegurarCategoria(tenantId: number, nombre: string, kind: Kind): Promise<number | null> {
  const nombreLimpio = normalizar(nombre) || "General";
  try {
    const existentes = await db.select().from(productCategories).where(eq(productCategories.tenantId, tenantId));
    const misma = existentes.find((c: any) => String(c.name).trim().toLowerCase() === nombreLimpio.toLowerCase() && String(c.kind || "digital") === kind);
    if (misma) return Number((misma as any).id);
    const color = COLORES[existentes.length % COLORES.length]!;
    const { iconoDeCategoria } = await import("./taxonomia");
    const icon = kind === "physical" ? iconoDeCategoria(nombreLimpio) : ICONO_POR_KIND[kind];
    const [creada] = await db.insert(productCategories).values({ tenantId, name: nombreLimpio, kind, icon, color } as any).returning();
    logger.info({ tenantId, categoria: nombreLimpio, kind, id: (creada as any)?.id }, "[Categorias] categoría creada desde una importación");
    return Number((creada as any)?.id) || null;
  } catch (e: any) {
    logger.warn({ tenantId, nombre: nombreLimpio, err: e?.message }, "[Categorias] no se pudo asegurar la categoría");
    return null;
  }
}

/** Enlaza los productos que tienen texto de categoría pero no id (importados antes de esto). */
export async function vincularCategoriasSueltas(): Promise<{ revisados: number; enlazados: number }> {
  let revisados = 0, enlazados = 0;
  try {
    const { categoriaCanonica, categoriaReal } = await import("./taxonomia");
    // Sueltos (sin id) y además físicos con categoría que NO es un nombre
    // real (la del proveedor tal cual): se reclasifican.
    const todos = await db.select({ id: products.id, tenantId: products.tenantId, name: products.name, description: products.description, category: products.category, categoryId: products.categoryId, kind: products.kind })
      .from(products).where(sql`${products.categoryId} is null or (${products.kind} = 'physical')`);
    for (const p of todos as any[]) {
      const kind = (["digital", "physical", "service"].includes(String(p.kind)) ? String(p.kind) : "digital") as Kind;
      const texto = String(p.category || "").trim();
      let nombre = texto;
      if (kind === "physical") {
        const canon = categoriaCanonica(texto);
        if (canon === texto && canon !== "Otros" && p.categoryId) continue; // ya está bien
        nombre = (canon && canon !== "Otros") ? canon : categoriaReal({ nombre: String(p.name || ""), categoriaProveedor: texto, descripcion: p.description });
        if (nombre === texto && p.categoryId) continue;
      } else if (p.categoryId || !texto) continue;
      revisados++;
      const id = await asegurarCategoria(Number(p.tenantId), nombre, kind);
      if (!id) continue;
      await db.update(products).set({ categoryId: id, category: nombre } as any).where(eq(products.id, Number(p.id)));
      enlazados++;
    }
    if (revisados) logger.info({ revisados, enlazados }, "[Categorias] productos sueltos enlazados a su categoría");
    // Las categorías físicas con nombre de proveedor que quedaron vacías se borran.
    const { NOMBRES_CANONICOS } = await import("./taxonomia");
    const cats = await db.select().from(productCategories).where(sql`${productCategories}.kind = 'physical'`);
    for (const c of cats as any[]) {
      if (NOMBRES_CANONICOS.includes(String(c.name))) continue;
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(products).where(eq(products.categoryId, Number(c.id))) as any[];
      if (Number(n) === 0) { await db.delete(productCategories).where(eq(productCategories.id, Number(c.id))); logger.info({ categoria: c.name }, "[Categorias] categoría de proveedor vacía borrada"); }
    }
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Categorias] no se pudieron enlazar los productos sueltos");
  }
  return { revisados, enlazados };
}

export function iniciarVinculoDeCategorias(): void {
  if (process.env.CATEGORIAS_AUTO === "off") return;
  setTimeout(() => { void vincularCategoriasSueltas(); }, Number(process.env.CATEGORIAS_PRIMERA_MS || 30000)).unref?.();
}
