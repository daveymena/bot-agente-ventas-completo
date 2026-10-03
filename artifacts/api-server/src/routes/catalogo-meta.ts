/**
 * EL FEED DE PRODUCTOS PARA META (Commerce / catálogo).
 * =====================================================
 *
 *Pedido del dueño (04-10-2026): "si subimos el catálogo completo de los
 * productos?" — la vía oficial de Meta: el sistema EXPOSE una URL pública
 * con el catálogo en el formato del feed de Meta, Meta la descarga SOLO
 * cada día (schedule del feed), y con el catálogo se desbloquea:
 *   · Advantage+ Catalog ads → a image_background_gen (la IA de Meta genera
 *     FONDOS detrás del producto), que sin catálogo es error oficial
 *     3858293 (el código lo tiene documentado y lo evitaba).
 *   · Anuncios DINÁMICOS: el que vio la Pañalera recibe el anuncio de la
 *     Pañalera — el retargeting más fuerte que existe para ecommerce.
 *   · Collection/Marketplace formats.
 *
 * El FORMATO (product feed de Meta): { data: [...] } con los campos que el
 * feed exige: id, title, description, availability, condition, price
 * ("110990 COP"), link, image_link, brand. Sin google_product_category:
 * es opcional y el mapeo del catálogo local a la taxonomía de Google es
 * otro trabajo; sin eso el catálogo sirve igual para los anuncios.
 */

import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, products, landingPages, tenants } from "@workspace/db";
import { getAppUrl } from "../lib/app-url";

export const catalogoMetaRouter = Router();

/** El precio como lo exige el feed: "110990 COP". */
function precioFeed(precio: unknown, moneda: string | null): string {
  const n = Number(precio) || 0;
  return `${Math.round(n).toLocaleString("en-US").replace(/,/g, "")} ${moneda || "COP"}`;
}

/**
 * El enlace del producto con LA MISMA regla del anuncio: la landing
 * PUBLICADA más reciente, si no la página del producto. Se resuelve para
 * TODO el tenant en una consulta (el feed se pide completo).
 */
async function enlacesDelNegocio(tenantId: number): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  try {
    const filas = await db
      .select({ productId: landingPages.productId, publishedUrl: landingPages.publishedUrl, slug: landingPages.slug })
      .from(landingPages)
      .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.status, "published")));
    for (const f of filas) {
      if (f.productId == null) continue;
      const url = String(f.publishedUrl || "").trim() || `${getAppUrl().replace(/\/$/, "")}/l/${f.slug}`;
      mapa.set(Number(f.productId), url);
    }
  } catch { /* sin landings: la tienda */ }
  return mapa;
}

catalogoMetaRouter.get("/catalogo-meta/:tenantId.json", async (req: Request, res: Response) => {
  try {
    const tenantId = Number((req.params as any).tenantId);
    if (!Number.isFinite(tenantId)) return res.status(400).json({ error: "tenant inválido" });

    const [negocio] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!negocio) return res.status(404).json({ error: "Negocio no encontrado" });
    const marca = (negocio as any).brandName || "El negocio";

    const base = getAppUrl().replace(/\/$/, "");
    const enlaces = await enlacesDelNegocio(tenantId);
    const activos = await db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));

    const data = activos.map((p: any) => {
      let meta: any = {};
      try {
        meta = typeof p.metadata === "string" ? JSON.parse(p.metadata || "{}") : (p.metadata || {});
      } catch { meta = {}; }
      const galeriaReal: string[] = Array.isArray(meta.imageUrls) ? meta.imageUrls.filter((u: unknown) => typeof u === "string" && /^https?:\/\//.test(u)) : [];
      const local = typeof p.imageUrl === "string" ? p.imageUrl : "";
      // La foto del catálogo: la REAL del producto (Dropi/CloudFront) primero,
      // o la local servida por el negocio. La inventada (placeholder) NO entra:
      // un feed con fotos inventadas es exactamente lo que Meta rechaza.
      const imagen = galeriaReal[0]
        ?? (local && !/placehold\.co/i.test(local) ? `${base}${local.startsWith("/") ? local : "/" + local}` : "");

      const hayStock = meta.dropiStock == null ? true : Number(meta.dropiStock) > 0;

      return {
        id: String(p.id),
        title: String(p.name || "").slice(0, 120),
        description: String(p.description || "").replace(/\s+/g, " ").slice(0, 900),
        availability: hayStock ? "in stock" : "out of stock",
        condition: "new",
        price: precioFeed(p.price, p.currency),
        link: enlaces.get(Number(p.id)) || `${base}/p/${p.id}`,
        ...(imagen ? { image_link: imagen } : {}),
        brand: String(marca).slice(0, 60),
        // Para el vendedor de WhatsApp (la campaña de mensajes): el número va
        // opcional en el feed y en los anuncios de catálogo con WhatsApp el
        // click abre el chat. Sin whatsapp, no se pone.
        ...(meta.whatsapp ? { whatsapp_number: String(meta.whatsapp) } : {}),
      };
    }).filter((d: any) => d.title && d.link);

    // Cacheado en el CDN de Meta tras su descarga; el feed se regenera barato.
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.json({ data });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Error del feed" });
  }
});

/** La URL del feed para el panel y para Meta (el router se monta en la raíz). */
export function urlFeedDelCatalogo(tenantId: number): string {
  return `${getAppUrl().replace(/\/$/, "")}/catalogo-meta/${tenantId}.json`;
}