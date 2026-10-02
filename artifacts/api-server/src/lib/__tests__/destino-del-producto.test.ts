import { describe, it, expect, beforeAll } from "vitest";
import { db, products, landingPages } from "@workspace/db";
import { destinoWebDelProducto, enlaceParaVerElProducto } from "../landing/destino-del-producto";

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

/**
 * 01-10-2026: el vendedor de WhatsApp mandaba /p/:id (la tienda vieja) aunque
 * el producto tuviera landing nueva publicada.
 */
describe("enlaceParaVerElProducto (lo que manda el vendedor)", () => {
  it("sin landing publicada manda la tienda; con landing, la más reciente", async () => {
    const [p] = await db.insert(products).values({
      tenantId: 1, name: "PRODUCTO ENLACE", description: "x", price: "1000", currency: "COP", kind: "physical", isActive: true, features: [],
    }).returning();
    const sin = await enlaceParaVerElProducto({ id: p.id, tenantId: 1 });
    expect(sin.esLanding).toBe(false);
    expect(sin.url).toMatch(new RegExp(`/p/${p.id}$`));

    const viejo = "2026-09-01T00:00:00.000Z";
    await db.insert(landingPages).values({
      tenantId: 1, productId: p.id, name: "vieja", slug: `vieja-${p.id}`, status: "published",
      publishedUrl: `https://ventasproia.com/l/vieja-${p.id}`, strategy: {}, sections: [], design: {}, source: {}, updatedAt: viejo,
    } as any);
    await db.insert(landingPages).values({
      tenantId: 1, productId: p.id, name: "nueva", slug: `nueva-${p.id}`, status: "published",
      publishedUrl: `https://ventasproia.com/l/nueva-${p.id}`, strategy: {}, sections: [], design: {}, source: {},
    } as any);
    const con = await enlaceParaVerElProducto({ id: p.id, tenantId: 1 });
    expect(con.esLanding).toBe(true);
    expect(con.url).toBe(`https://ventasproia.com/l/nueva-${p.id}`);
  });
});
