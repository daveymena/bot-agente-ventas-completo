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

/** El nombre tal como está en la lista cerrada, si la pedida es de la lista. */
async function nombreDeLista(nombre: string, kind: Kind): Promise<string | null> {
  const { categoriaCanonica, categoriaDigitalCanonica } = await import("./taxonomia");
  const canon = kind === "physical" ? categoriaCanonica(nombre) : kind === "digital" ? categoriaDigitalCanonica(nombre) : null;
  return canon && canon === nombre ? canon : null;
}

function normalizar(s: string): string {
  return String(s || "").trim().replace(/\s+/g, " ");
}

/** Devuelve el id de la categoría (nombre + tipo) del negocio, creándola si no existe. */
export async function asegurarCategoria(tenantId: number, nombre: string, kind: Kind): Promise<number | null> {
  const nombreLimpio = normalizar(nombre) || "General";
  try {
    const existentes = await db.select().from(productCategories).where(eq(productCategories.tenantId, tenantId));
    // Sin importar tildes ni mayúsculas: así nacieron "Musica" y "Música"
    // como dos categorías distintas del mismo negocio.
    const clave = (x: string) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const misma = existentes.find((c: any) => clave(c.name) === clave(nombreLimpio) && String(c.kind || "digital") === kind);
    if (misma) {
      // Si la que existe está escrita distinto y la pedida es el nombre de la
      // lista ("Musica" → "Música"), se corrige el nombre de la fila.
      const canonico = await nombreDeLista(nombreLimpio, kind);
      if (canonico && String((misma as any).name) !== canonico) {
        await db.update(productCategories).set({ name: canonico } as any).where(eq(productCategories.id, Number((misma as any).id)));
      }
      return Number((misma as any).id);
    }
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

/**
 * Enlaza los productos sueltos (sin id de categoría) y CORRIGE los que
 * están en la categoría equivocada. Corre al arrancar, para todos los
 * negocios. La regla que decide mover vive en `categoriaCorregida()`
 * (lib/taxonomia.ts, con sus pruebas): un cajón genérico, una misma
 * categoría escrita distinto, o un nombre que respalda más a otra. Lo que
 * el dueño inventó no se toca.
 *
 * Medido el 30-09-2026 en sofia-premium: movía 80 de 114 (22 portátiles
 * repartidos entre Otros, Cocina, Moda y Papelería; 53 cursos en General).
 */
export async function vincularCategoriasSueltas(): Promise<{ revisados: number; enlazados: number }> {
  let revisados = 0, enlazados = 0;
  try {
    const { categoriaCorregida, categoriaDigitalCanonica, NOMBRES_CANONICOS } = await import("./taxonomia");
    const todos = await db.select({ id: products.id, tenantId: products.tenantId, name: products.name, description: products.description, category: products.category, categoryId: products.categoryId, kind: products.kind })
      .from(products);
    for (const p of todos as any[]) {
      const kind = (["digital", "physical", "service"].includes(String(p.kind)) ? String(p.kind) : "digital") as Kind;
      const texto = String(p.category || "").trim();
      const corregida = kind === "service" ? null : categoriaCorregida({ kind, actual: texto, nombre: String(p.name || ""), descripcion: p.description });
      const nombre = corregida || texto;
      if (!nombre) continue;
      if (!corregida && p.categoryId) continue; // ya está bien y enlazada
      revisados++;
      const id = await asegurarCategoria(Number(p.tenantId), nombre, kind);
      if (!id) continue;
      await db.update(products).set({ categoryId: id, category: nombre } as any).where(eq(products.id, Number(p.id)));
      if (corregida && corregida !== texto) logger.info({ productoId: p.id, de: texto || null, a: corregida }, "[Categorias] producto movido a su categoría");
      enlazados++;
    }
    if (revisados) logger.info({ revisados, enlazados }, "[Categorias] productos enlazados/corregidos");

    // Categorías que quedaron vacías y no son de la lista: las físicas con
    // nombre de proveedor, y las digitales que eran la misma escrita
    // distinto ("Musica" al lado de "Música"). Las que inventó el dueño se
    // quedan aunque estén vacías.
    const cats = await db.select().from(productCategories);
    for (const c of cats as any[]) {
      const nombre = String(c.name);
      const kind = String(c.kind || "digital");
      const sobrante = kind === "physical"
        ? !NOMBRES_CANONICOS.includes(nombre)
        : (() => { const canon = categoriaDigitalCanonica(nombre); return !!canon && canon !== nombre; })();
      if (!sobrante) continue;
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(products).where(eq(products.categoryId, Number(c.id))) as any[];
      if (Number(n) === 0) { await db.delete(productCategories).where(eq(productCategories.id, Number(c.id))); logger.info({ categoria: nombre }, "[Categorias] categoría vacía sobrante borrada"); }
    }
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Categorias] no se pudieron enlazar/corregir los productos");
  }
  return { revisados, enlazados };
}

export function iniciarVinculoDeCategorias(): void {
  if (process.env.CATEGORIAS_AUTO === "off") return;
  setTimeout(() => { void vincularCategoriasSueltas(); }, Number(process.env.CATEGORIAS_PRIMERA_MS || 30000)).unref?.();
}
