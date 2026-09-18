/**
 * A DÓNDE manda el anuncio cuando el destino es la web.
 *
 * Medido el 18-09-2026 revisando la ruta guiada de Atlas: el servidor creaba
 * la landing, la publicaba... y el anuncio salía igual a `/p/:id` (la página
 * del producto en la tienda), porque los tres lugares que arman el enlace del
 * creativo lo escribían a mano. La landing --que es lo que se hizo para
 * convertir-- no la veía nadie que viniera del anuncio.
 *
 * Regla única: si el producto tiene una landing PUBLICADA, el anuncio va a
 * ella (la más reciente); si no, a la página del producto. Los tres lugares
 * llaman acá y nadie más escribe `/p/`.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, landingPages } from "@workspace/db";
import { getAppUrl } from "../app-url";

export function urlDePaginaDeProducto(productId: number | null | undefined): string {
  return `${getAppUrl().replace(/\/$/, "")}/p/${productId ?? ""}`;
}

export async function landingPublicadaDelProducto(
  tenantId: number,
  productId: number,
): Promise<{ id: number; url: string } | null> {
  try {
    const filas = await db
      .select({ id: landingPages.id, slug: landingPages.slug, publishedUrl: landingPages.publishedUrl, updatedAt: landingPages.updatedAt })
      .from(landingPages)
      .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.productId, productId), eq(landingPages.status, "published")))
      .orderBy(desc(landingPages.updatedAt))
      .limit(1);
    const l = filas[0];
    if (!l) return null;
    const url = String(l.publishedUrl || "").trim() || `${getAppUrl().replace(/\/$/, "")}/l/${encodeURIComponent(String(l.slug))}`;
    return { id: Number(l.id), url };
  } catch {
    // Sin tabla (SQLite viejo) o sin acceso: el anuncio sale a la tienda,
    // como siempre. Nunca se frena una campaña por esto.
    return null;
  }
}

/** La URL final del anuncio (destino web): landing publicada o página del producto. */
export async function destinoWebDelProducto(tenantId: number, productId: number): Promise<{ url: string; landingId: number | null }> {
  const l = await landingPublicadaDelProducto(tenantId, productId);
  return l ? { url: l.url, landingId: l.id } : { url: urlDePaginaDeProducto(productId), landingId: null };
}
