import { describe, it, expect, beforeAll } from "vitest";
import { db, products, landingPages } from "@workspace/db";
import { destinoWebDelProducto } from "../landing/destino-del-producto";

/**
 * El anuncio tiene que llevar a la landing que se armó para convertir.
 *
 * Revisando la ruta guiada (18-09-2026): el servidor creaba y publicaba la
 * landing y el anuncio salía igual a /p/:id, porque los tres lugares que
 * arman el enlace lo escribían a mano. Ahora todos llaman a este resolvedor.
 */
describe("destinoWebDelProducto", () => {
  let productId: number;
  beforeAll(async () => {
    const [p] = await db.insert(products).values({
      tenantId: 1, name: "PRODUCTO DESTINO", description: "x", price: "1000", currency: "COP", kind: "digital", isActive: true, features: [],
    }).returning();
    productId = p.id;
  });

  it("sin landing publicada, va a la página del producto", async () => {
    const d = await destinoWebDelProducto(1, productId);
    expect(d.landingId).toBeNull();
    expect(d.url).toMatch(new RegExp(`/p/${productId}$`));
  });

  it("un borrador de landing NO cambia el destino", async () => {
    await db.insert(landingPages).values({ tenantId: 1, productId, name: "borrador", slug: `b-${productId}`, status: "draft", strategy: {}, sections: [], design: {}, source: {} } as any);
    const d = await destinoWebDelProducto(1, productId);
    expect(d.landingId).toBeNull();
  });

  it("con landing publicada, el anuncio va a la landing", async () => {
    const [l] = await db.insert(landingPages).values({
      tenantId: 1, productId, name: "publicada", slug: `pub-${productId}`, status: "published",
      publishedUrl: `https://ventasproia.com/l/pub-${productId}`, strategy: {}, sections: [], design: {}, source: {},
    } as any).returning();
    const d = await destinoWebDelProducto(1, productId);
    expect(d.landingId).toBe(l.id);
    expect(d.url).toBe(`https://ventasproia.com/l/pub-${productId}`);
  });

  it("la landing de OTRO negocio no se usa", async () => {
    const d = await destinoWebDelProducto(2, productId);
    expect(d.landingId).toBeNull();
  });
});
