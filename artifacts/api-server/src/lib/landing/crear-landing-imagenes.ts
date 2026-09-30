/**
 * Crear una landing de imágenes (plan de 11 paneles) para un producto del
 * negocio. Una sola puerta para el panel (/api/landing-imagenes/plan) y para
 * Atlas (landing_imagenes_crear). Ver plan-imagenes.ts.
 */
import { and, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import { logger } from "../logger";
import type { OfertaLanding } from "./plan-imagenes";

export function ofertasValidas(xs: unknown, precioBase: number): OfertaLanding[] {
  const lista = (Array.isArray(xs) ? xs : [])
    .map((o: any) => ({ nombre: String(o?.nombre || "").trim().slice(0, 60), cantidad: Math.max(1, Math.min(10, Math.round(Number(o?.cantidad) || 1))), precio: Math.round(Number(o?.precio) || 0) }))
    .filter((o) => o.nombre && o.precio > 0)
    .slice(0, 4);
  if (lista.length) return lista;
  return precioBase > 0 ? [{ nombre: "1 unidad", cantidad: 1, precio: Math.round(precioBase) }] : [];
}

export async function crearLandingImagenes(
  tenantId: number,
  entrada: { productId: number; ofertas?: unknown; angulo?: string; publico?: string; pruebaSocial?: string | null },
): Promise<{ ok: true; row: any; autor: string } | { ok: false; error: string }> {
  const [producto] = await db.select().from(products).where(and(eq(products.id, Number(entrada.productId)), eq(products.tenantId, tenantId))).limit(1);
  if (!producto) return { ok: false, error: "Elegí un producto de tu catálogo." };
  const ofertas = ofertasValidas(entrada.ofertas, Number(producto.price) || 0);
  const respuestas = {
    ofertas,
    angulo: String(entrada.angulo || "dolor / solución").slice(0, 200),
    publico: String(entrada.publico || "").slice(0, 300),
    pruebaSocial: entrada.pruebaSocial ? String(entrada.pruebaSocial).slice(0, 200) : null,
  };
  const { planearPaneles } = await import("./plan-imagenes");
  const { getBusinessContext } = await import("../business-context");
  const ctx = await getBusinessContext(tenantId).catch(() => null);
  const plan = await planearPaneles(tenantId, producto as any, respuestas, ctx?.condiciones || null);
  const slug = `${String(producto.name || "landing").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}-${Date.now().toString(36)}`;
  const [row] = await db.insert(landingPages).values({
    tenantId,
    productId: producto.id,
    name: `Landing de imágenes · ${producto.name}`.slice(0, 200),
    slug,
    status: "draft",
    strategy: { tipo: "imagenes", autor: plan.autor, respuestas, creadaEn: new Date().toISOString() },
    sections: plan.paneles as any,
    design: { modo: "imagenes", familia: "ecommerce", paleta: plan.paleta, ofertas },
    source: { type: "product", productId: producto.id },
  } as any).returning();
  logger.info({ tenantId, landingId: (row as any).id, autor: plan.autor }, "[LandingImagenes] plan creado");
  return { ok: true, row, autor: plan.autor };
}
