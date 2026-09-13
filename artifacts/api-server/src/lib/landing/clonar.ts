/**
 * Clonar una landing (o solo su ESTILO) para otro producto.
 *
 * Pedido del dueño (13-09-2026): "que pueda clonar estilos de landing page".
 * Dos formas:
 *   - Mismo producto (o sin producto): copia exacta, en borrador, con otro
 *     nombre y otro slug. Sirve para probar cambios sin tocar la publicada.
 *   - Otro producto: se genera el contenido para ese producto (fotos reales,
 *     AIDA, condiciones) y se le aplica el DISEÑO de la landing origen
 *     (familia, colores, tipografía: todo lo que vive en `design`). Eso es
 *     "clonar el estilo".
 *
 * Nunca se publica sola: la clonada queda en borrador.
 */
import { and, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import { tenantManager } from "../tenantManager";

function slugDe(nombre: string): string {
  const base = String(nombre || "landing").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "landing";
  return `${base}-${Date.now().toString(36)}`;
}

export async function clonarLanding(opts: {
  tenantId: number;
  landingId: number;
  productId?: number | null;
  nombre?: string | null;
}): Promise<{ ok: true; landing: any; modo: "copia" | "estilo" } | { ok: false; error: string }> {
  const [origen] = await db.select().from(landingPages)
    .where(and(eq(landingPages.id, opts.landingId), eq(landingPages.tenantId, opts.tenantId))).limit(1);
  if (!origen) return { ok: false, error: `No encontré la landing ${opts.landingId}.` };

  const destinoId = opts.productId != null && Number.isFinite(Number(opts.productId)) ? Number(opts.productId) : null;
  const mismoProducto = !destinoId || destinoId === origen.productId;

  if (mismoProducto) {
    const nombre = String(opts.nombre || `${origen.name} (copia)`).slice(0, 200);
    const [creada] = await db.insert(landingPages).values({
      tenantId: opts.tenantId, productId: origen.productId, name: nombre, slug: slugDe(nombre),
      strategy: origen.strategy, sections: origen.sections, design: origen.design, source: { ...(origen.source as any || {}), clonadaDe: origen.id },
      status: "draft", publishedUrl: null,
    } as any).returning();
    return { ok: true, landing: creada, modo: "copia" };
  }

  const [prod] = await db.select().from(products)
    .where(and(eq(products.id, destinoId!), eq(products.tenantId, opts.tenantId))).limit(1);
  if (!prod) return { ok: false, error: `No encontré el producto ${destinoId}.` };

  const { generarLandingLocal } = await import("../../routes/landing-pages-ai");
  const tenant = await tenantManager.getTenantById(opts.tenantId);
  const gen = await generarLandingLocal({
    tenantId: opts.tenantId, product: prod, brandName: (tenant as any)?.brandName,
    objective: String((origen.strategy as any)?.objective || "sales"),
  });
  const nombre = String(opts.nombre || gen.name || `Landing ${prod.name}`).slice(0, 200);
  const [creada] = await db.insert(landingPages).values({
    tenantId: opts.tenantId, productId: prod.id, name: nombre, slug: slugDe(nombre),
    strategy: gen.strategy, sections: gen.sections,
    // El estilo es lo que se clona: todo `design` de la origen manda.
    design: { ...(gen.design || {}), ...((origen.design as any) || {}) },
    source: { ...(gen.source || {}), estiloClonadoDe: origen.id },
    status: "draft", publishedUrl: null,
  } as any).returning();
  return { ok: true, landing: creada, modo: "estilo" };
}
