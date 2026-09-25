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
import { MENCIONA_LANDING } from "../objetivos-campana";

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

export type PreferenciaWeb = "landing" | "tienda";

/**
 * La URL final del anuncio (destino web).
 *
 * Sin preferencia: landing publicada o, si no hay, la página del producto.
 * Con "tienda": la tienda, aunque haya landing (solo si el admin lo pidió).
 * Con "landing": la landing y NADA MÁS. Si no está publicada se LANZA con el
 * motivo, antes de crear nada en Meta. Pedido del dueño (24-09-2026): "cuando
 * le pida la landing que la ponga y no redirija a la tienda a menos que se lo
 * pida". Antes una landing en borrador caía a la tienda sin avisar.
 */
export async function destinoWebDelProducto(
  tenantId: number,
  productId: number,
  preferencia?: PreferenciaWeb | null,
): Promise<{ url: string; landingId: number | null }> {
  if (preferencia === "tienda") return { url: urlDePaginaDeProducto(productId), landingId: null };
  const l = await landingPublicadaDelProducto(tenantId, productId);
  if (l) return { url: l.url, landingId: l.id };
  if (preferencia === "landing") {
    throw new Error("Pediste que el anuncio lleve a la landing, pero este producto no tiene ninguna landing PUBLICADA. Publicala (landing_publicar) o creala primero; no lo mando a la tienda sin que lo pidas.");
  }
  return { url: urlDePaginaDeProducto(productId), landingId: null };
}

/** "landing" / "tienda" desde lo que escribió el modelo o el admin; cualquier otra cosa = sin preferencia. */
export function leerPreferenciaWeb(v: unknown): PreferenciaWeb | null {
  const t = String(v ?? "").toLowerCase();
  if (MENCIONA_LANDING.test(t)) return "landing";
  if (/tienda|cat[aá]logo|store/.test(t)) return "tienda";
  return null;
}

/**
 * Objetivo y destino cuando NADIE dijo a dónde va el anuncio (lanzamiento
 * automático, botones del panel). Antes era "mensajes" fijo: el lanzamiento
 * creaba la landing y en el paso siguiente un anuncio que mandaba a WhatsApp,
 * así que la landing no la veía nadie (24-09-2026, seis campañas del
 * corrector). Con landing publicada, va a la landing; sin landing, lo de antes.
 */
export async function destinoPorDefecto(
  tenantId: number | null | undefined,
  productId: number,
  recomendado: "mensajes" | "ventas" | "trafico" = "mensajes",
): Promise<{ objetivo: "mensajes" | "ventas" | "trafico"; preferencia: PreferenciaWeb | null }> {
  const l = tenantId ? await landingPublicadaDelProducto(Number(tenantId), productId) : null;
  if (l) return { objetivo: recomendado === "ventas" ? "ventas" : "trafico", preferencia: "landing" };
  return { objetivo: recomendado, preferencia: null };
}
