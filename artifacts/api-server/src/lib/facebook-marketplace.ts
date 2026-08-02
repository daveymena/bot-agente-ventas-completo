import { logger } from "./logger";
import { getAppUrl } from "./app-url";
import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantManager, type TenantContext } from "./tenantManager";

const FB_GRAPH_URL = "https://graph.facebook.com/v21.0";

export interface MarketplaceListing {
  id: string;
  name: string;
  price: string;
  status: string;
  listingUrl: string;
}

export interface CreateListingResult {
  ok: boolean;
  listing?: MarketplaceListing;
  error?: string;
}

/**
 * Convierte una ruta relativa del catálogo (/uploads/products/42.jpg) en URL
 * pública absoluta -- Facebook descarga la imagen desde sus servidores, una
 * ruta relativa no le sirve. Mismo fallback de APP_URL que el resto del
 * código (payments.ts, facebook-page-posts.ts, etc.).
 */
function absoluteImageUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const appUrl = getAppUrl();
  if (!/^https?:\/\//i.test(appUrl)) return null;
  return `${appUrl.replace(/\/+$/, "")}/${pathOrUrl.replace(/^\/+/, "")}`;
}

export class FacebookMarketplaceService {
  private tenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
  }

  private getConfig(): { pageId: string; pageAccessToken: string } {
    const fb = this.tenant.facebook || {};
    return {
      pageId: fb.pageId || process.env.FB_PAGE_ID || "",
      pageAccessToken: fb.accessToken || process.env.FB_ACCESS_TOKEN || "",
    };
  }

  isConfigured(): boolean {
    const cfg = this.getConfig();
    return !!cfg.pageId && !!cfg.pageAccessToken;
  }

  async createListing(productId: number): Promise<CreateListingResult> {
    const { pageId, pageAccessToken } = this.getConfig();
    if (!pageId || !pageAccessToken) {
      return { ok: false, error: "Facebook no está conectado (falta el token o el ID de página de este negocio)" };
    }

    try {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (!product) return { ok: false, error: "Producto no encontrado" };

      const price = Number(product.price).toFixed(0);
      const description = (product.description || product.name || "").substring(0, 5000);

      const listingData: Record<string, any> = {
        name: product.name?.substring(0, 100) || "Producto",
        description,
        price: price,
        currency: product.currency || "COP",
        condition: "new",
      };

      // Bug: el campo del esquema es imageUrl (columna image_url), leerlo
      // como product.image_url daba siempre undefined -- ningún listing
      // llevaba imagen, y el Marketplace Listings API de Meta la EXIGE, así
      // que Facebook rechazaba la publicación entera con un error genérico.
      const imageUrl = absoluteImageUrl(product.imageUrl);
      if (imageUrl) {
        listingData.image_urls = [imageUrl];
      } else {
        return { ok: false, error: "El producto no tiene imagen -- Marketplace exige al menos una foto. Asignale una imagen primero." };
      }

      const res = await fetch(
        `${FB_GRAPH_URL}/${pageId}/marketplace_listings?access_token=${pageAccessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(listingData),
          signal: AbortSignal.timeout(20000),
        }
      );

      const data: any = await res.json();
      if (data.error) {
        logger.error({ err: data.error, product: product.name }, "[FB-Marketplace] Error creating listing");
        return { ok: false, error: data.error.message || "Facebook rechazó el listing" };
      }

      logger.info(
        { listingId: data.id, product: product.name },
        "[FB-Marketplace] Listing created"
      );

      return {
        ok: true,
        listing: {
          id: data.id,
          name: product.name || "",
          price: `$${price} ${product.currency || "COP"}`,
          status: "ACTIVE",
          listingUrl: `https://www.facebook.com/marketplace/item/${data.id}`,
        },
      };
    } catch (err: any) {
      logger.error({ err, productId }, "[FB-Marketplace] Error");
      return { ok: false, error: err?.message || "Error desconocido" };
    }
  }

  async updateListing(listingId: string, productId: number): Promise<boolean> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return false;

    try {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (!product) return false;

      const res = await fetch(
        `${FB_GRAPH_URL}/${listingId}?access_token=${pageAccessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: product.name?.substring(0, 100),
            description: (product.description || "").substring(0, 5000),
            price: Number(product.price).toFixed(0),
          }),
          signal: AbortSignal.timeout(20000),
        }
      );

      const data = await res.json();
      return !data.error;
    } catch (err: any) {
      logger.error({ err }, "[FB-Marketplace] Error updating listing");
      return false;
    }
  }

  async deleteListing(listingId: string): Promise<boolean> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return false;

    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/${listingId}?access_token=${pageAccessToken}`,
        { method: "DELETE", signal: AbortSignal.timeout(15000) }
      );
      const data = await res.json();
      return data.success !== false;
    } catch (err: any) {
      logger.error({ err }, "[FB-Marketplace] Error deleting listing");
      return false;
    }
  }

  async getListings(status: "ACTIVE" | "PENDING" | "SOLD" | "ALL" = "ACTIVE"): Promise<MarketplaceListing[]> {
    const { pageId, pageAccessToken } = this.getConfig();
    if (!pageId || !pageAccessToken) return [];

    try {
      const params = new URLSearchParams({
        access_token: pageAccessToken,
        fields: "id,name,price,status,listing_url",
      });
      if (status !== "ALL") {
        params.set("status", status);
      }

      const res = await fetch(
        `${FB_GRAPH_URL}/${pageId}/marketplace_listings?${params}`,
        { signal: AbortSignal.timeout(15000) },
      );
      const data = await res.json();

      if (data.error) {
        logger.error({ err: data.error }, "[FB-Marketplace] Error fetching listings");
        return [];
      }

      return (data.data || []).map((item: any) => ({
        id: item.id,
        name: item.name || "",
        price: item.price || "",
        status: item.status || "UNKNOWN",
        listingUrl: item.listing_url || `https://www.facebook.com/marketplace/item/${item.id}`,
      }));
    } catch (err: any) {
      logger.error({ err }, "[FB-Marketplace] Error fetching listings");
      return [];
    }
  }

  async syncActiveProducts(): Promise<{ created: number; failed: number; listings: MarketplaceListing[]; errors: string[] }> {
    const result = { created: 0, failed: 0, listings: [] as MarketplaceListing[], errors: [] as string[] };

    const activeProducts = await db
      .select()
      .from(products)
      .where(eq(products.isActive, true))
      .limit(100);

    for (const p of activeProducts) {
      try {
        const r = await this.createListing(p.id);
        if (r.ok && r.listing) {
          result.created++;
          result.listings.push(r.listing);
        } else {
          result.failed++;
          result.errors.push(`${p.name}: ${r.error || "error desconocido"}`);
        }
      } catch (err: any) {
        result.failed++;
        result.errors.push(`${p.name}: ${err?.message || "error desconocido"}`);
      }
    }

    return result;
  }
}

export const facebookMarketplaceService = new FacebookMarketplaceService();
